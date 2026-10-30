/**
 * 显示平滑：保留宿主回复组件，只缓冲可见 Text 的追加内容。
 * 字符按帧揭示，承载未揭示文字的块级结构随文字一起出现；历史消息与非运行态不排队。
 * 滚动只补齐宿主没有覆盖的帧间增长，不夺回宿主或用户已经确定的视口位置。
 */
var DSHCP_SMOOTH_SKIP = '[aria-hidden="true"], [aria-live], [contenteditable="true"], script, style, textarea, input';
var DSHCP_SMOOTH_MAX_FRAME_MS = 32;
var DSHCP_SMOOTH_MAX_MOVE_PX = 8;
// 超过这个距离的底部变化不是逐字增长，而是宿主或阅读器一次性移动；跟随直接落位，不拖尾。
var DSHCP_SMOOTH_SNAP_PX = 24;
var DSHCP_SMOOTH_RETIRED_LIMIT = 32;
var DSHCP_SMOOTH_HOLD_ATTR = 'data-dshcp-smooth-hold';

function dshcpSmoothChars(text) {
	return Array.from(text);
}

function dshcpSmoothPrefix(left, right) {
	var limit = Math.min(left.length, right.length);
	var index = 0;
	while (index < limit && left[index] === right[index]) index++;
	return index;
}

/**
 * haystack 的后缀与 head 的前缀最多重合多少字符。
 * 用于识别「宿主把同一段正文拆成新节点」：新节点的开头其实已经显示过。
 */
function dshcpSmoothOverlap(haystack, head) {
	var limit = Math.min(haystack.length, head.length);
	if (limit === 0) return 0;
	var pattern = head.slice(0, limit);
	var text = haystack.slice(haystack.length - limit);
	var table = [0];
	for (var i = 1; i < pattern.length; i++) {
		var k = table[i - 1];
		while (k > 0 && pattern[i] !== pattern[k]) k = table[k - 1];
		if (pattern[i] === pattern[k]) k++;
		table[i] = k;
	}
	var matched = 0;
	for (var j = 0; j < text.length; j++) {
		while (matched > 0 && text[j] !== pattern[matched]) matched = table[matched - 1];
		if (text[j] === pattern[matched]) matched++;
		// 完整命中后继续匹配，只有末位命中才代表「新文本的前缀已经整段显示过」。
		if (matched === pattern.length) {
			if (j === text.length - 1) return limit;
			matched = table[matched - 1];
		}
	}
	return matched;
}

/**
 * 新 Text 首次登记时能从退役文字里继承多少字符。
 * 宿主重排 Markdown（内联元素、块类型变化、增量拆分）会把旧 Text 换成内容相同的新节点；
 * 只按节点身份记账会让这些节点从 0 开始揭示，用户看到整段重播。
 */
function dshcpSmoothInherit(chars, retired) {
	var full = chars.join('');
	var best = 0;
	for (var i = retired.length - 1; i >= 0; i--) {
		var record = retired[i];
		if (record.text.indexOf(full) !== -1) return chars.length;
		if (record.text.startsWith(full)) { if (chars.length > best) best = chars.length; continue; }
		if (full.startsWith(record.text)) { if (record.shown > best) best = record.shown; continue; }
		var overlap = dshcpSmoothOverlap(record.visible, chars);
		if (overlap > best) best = overlap;
	}
	return best;
}

function dshcpSmoothRunning(node) {
	return !!(node && node.data && node.data.status === 'running');
}

/**
 * 承载待揭示文字的块级结构：代码块、引用、列表项、表格、标题等。
 * 这些容器在文字出现前先成形，会让用户先看到一整块空格式，再等到字。
 * 行内 <code> 不在此列：它的胶囊由行内内容撑开，本身不会提前占版面。
 */
var DSHCP_SMOOTH_BLOCKS = 'pre, blockquote, ul, ol, li, table, figure, h1, h2, h3, h4, h5, h6, hr';

/** One owner for text reveal and scroll follow, so both advance in the same frame. */
function createDshcpSmoothEngine(root, options) {
	var records = new Map();
	var pending = new Set();
	var ownWrites = new WeakMap();
	var retired = [];
	var observer = null;
	var resize = null;
	var port = null;
	var active = false;
	var running = false;
	var rafId = 0;
	var lastFrame = null;
	var debt = 0;
	var following = false;
	var detachedByUser = false;
	var lastScrollTop = 0;
	var position = 0;
	var velocity = 0;
	var pointerDown = false;
	var disposed = false;

	function playable(node, value) {
		if (value.trim() === '') return false;
		var parent = node.parentElement;
		return parent !== null && root.contains(parent) && parent.closest(DSHCP_SMOOTH_SKIP) === null;
	}
	function revealable(node) {
		return playable(node, node.nodeValue);
	}
	function forEachText(from, callback) {
		if (from.nodeType === 3) { callback(from); return; }
		if (from.nodeType !== 1) return;
		var walker = document.createTreeWalker(from, 4);
		for (var node = walker.nextNode(); node !== null; node = walker.nextNode()) callback(node);
	}
	function write(node, value) {
		var before = node.nodeValue;
		if (before === value) return;
		var queue = ownWrites.get(node);
		if (queue === undefined) { queue = []; ownWrites.set(node, queue); }
		queue.push({ before: before, after: value });
		node.nodeValue = value;
	}
	/**
	 * 判断某条 characterData 记录是否由本引擎写入造成。
	 * 只看实时 nodeValue 会在同一批多条记录时把宿主写入误判成自身写入，
	 * 提前消费标记后把截断值当成宿主完整文本，尾部内容会永久丢失。
	 * 因此按 (写入前值, 写入后值) 精确配对。
	 */
	function ownWrite(node, before, after) {
		var queue = ownWrites.get(node);
		if (queue === undefined) return false;
		for (var i = 0; i < queue.length; i++) {
			if (queue[i].before === before && queue[i].after === after) {
				queue.splice(i, 1);
				return true;
			}
		}
		return false;
	}
	function drop(node) {
		release(node);
		records.delete(node);
		pending.delete(node);
		ownWrites.delete(node);
	}
	/** 宿主把这段文字清空或改成空白：撤下保持、丢掉缓冲，但不再回写旧文字。 */
	function dequeue(node) {
		drop(node);
	}
	/**
	 * 块级结构保持：宿主先交出代码块、引用、列表这类结构，正文却还在逐字揭示时，
	 * 用户会先看到一个尚无一字的空格式，再等字追上来，观感割裂。
	 * 这里给「还没有任何可见文字」的块加标记，由 CSS 隐藏内容但保留挂载与布局：
	 * 宿主 DOM、React 与选择器都不受影响，一旦块内出现文字就立刻撤下。
	 */
	var held = new Set();
	function blockOf(node) {
		var parent = node.parentElement;
		if (parent === null) return null;
		var block = parent.closest(DSHCP_SMOOTH_BLOCKS);
		return block !== null && block !== root && root.contains(block) ? block : null;
	}
	/** 块内是否已有任何非空白文字（包括本引擎已揭示的部分）。 */
	function hasVisibleText(block) {
		return block.textContent.trim() !== '';
	}
	function hold(node) {
		var block = blockOf(node);
		if (block === null || held.has(block) || hasVisibleText(block)) return;
		// 宿主 DOM 与 React 都不认识这个属性；只在块内文字出现前短暂存在。
		held.add(block);
		block.setAttribute(DSHCP_SMOOTH_HOLD_ATTR, '');
	}
	function release(node) {
		var block = blockOf(node);
		if (block === null || !held.has(block)) return;
		held.delete(block);
		block.removeAttribute(DSHCP_SMOOTH_HOLD_ATTR);
	}
	function releaseAll() {
		held.forEach(function (block) {
			block.removeAttribute(DSHCP_SMOOTH_HOLD_ATTR);
		});
		held.clear();
	}
	/**
	 * 节点被宿主移除前，把它已显示的文字交给退役池，再丢弃本节点缓冲。
	 */
	function retire(node) {
		remember(records.get(node));
		drop(node);
	}
	/**
	 * 记录一段已显示文字，供之后被宿主替换出的新节点继承进度。
	 * 只记已显示部分：尚未揭示的内容仍算新内容，之后照常逐帧展开。
	 */
	function remember(record) {
		if (record === undefined || record.shown <= 0) return;
		var visible = record.chars.slice(0, record.shown);
		retired.push({ visible: visible, shown: record.shown, text: visible.join('') });
		if (retired.length > DSHCP_SMOOTH_RETIRED_LIMIT) retired.shift();
	}
	function settle(node) {
		if (!revealable(node)) { drop(node); return; }
		var chars = dshcpSmoothChars(node.nodeValue);
		records.set(node, { chars: chars, full: node.nodeValue, shown: chars.length });
		pending.delete(node);
		release(node);
	}
	function enqueue(node, full) {
		if (!playable(node, full)) {
			// 宿主清空或改成空白：丢掉缓冲，不把旧文字写回去。
			dequeue(node);
			return;
		}
		var chars = dshcpSmoothChars(full);
		var previous = records.get(node);
		var shown = previous === undefined
			? dshcpSmoothInherit(chars, retired)
			: Math.min(previous.shown, dshcpSmoothPrefix(previous.chars, chars));
		records.set(node, { chars: chars, full: full, shown: shown });
		if (shown < chars.length) pending.add(node);
		else pending.delete(node);
		write(node, chars.slice(0, shown).join(''));
		// 只有整段还一个字都没露出来时才让块不可见；一旦有字，格式和字同时可见。
		if (shown > 0) release(node);
		else if (shown < chars.length) hold(node);
	}
	function visit(from, reveal) {
		forEachText(from, function (node) {
			if (!revealable(node)) return;
			if (reveal) enqueue(node, node.nodeValue);
			else settle(node);
		});
	}
	function forget(from) {
		forEachText(from, function (node) {
			if (root.contains(node)) return;
			retire(node);
		});
	}
	function backlog() {
		var count = 0;
		pending.forEach(function (node) {
			var record = records.get(node);
			if (record !== undefined) count += record.chars.length - record.shown;
		});
		return count;
	}
	function reveal(dtMs) {
		var count = backlog();
		if (count === 0 || dtMs <= 0) return;
		// 运行时按积压自适应追赶；回合结束后用有界时间排空，不在结尾停住打字。
		var speed = running ? Math.min(600, 90 + Math.pow(count, 1.25) * 0.85)
			: Math.max(180, count / 0.42);
		var accumulated = debt + speed * dtMs / 1000;
		var amount = Math.min(count, Math.floor(accumulated));
		if (!running) amount = Math.min(amount, 400);
		debt = amount >= count ? 0 : accumulated - amount;
		if (amount <= 0) return;
		var nodes = Array.from(pending);
		for (var i = 0; i < nodes.length && amount > 0; i++) {
			var node = nodes[i];
			var record = records.get(node);
			if (record === undefined || !node.isConnected) {
				pending.delete(node);
				records.delete(node);
				continue;
			}
			var take = Math.min(amount, record.chars.length - record.shown);
			record.shown += take;
			write(node, record.chars.slice(0, record.shown).join(''));
			amount -= take;
			if (record.shown >= record.chars.length) pending.delete(node);
			// 首个字符落地即撤下块级保持：格式与它的第一个字同帧出现。
			if (record.shown > 0) release(node);
		}
	}
	function distanceToBottom() {
		return port === null ? 0 : port.scrollHeight - port.scrollTop - port.clientHeight;
	}
	/**
	 * 宿主是否正在自己跟随回复尾部。
	 * 宿主把跟随意图写在会话根本身（`data-chat-following-tail`），它有自己的
	 * ResizeObserver 与落位逻辑。本插件的逐字揭示本来就会让高度缓慢增长，
	 * 宿主据此跟随已经足够平滑；此时插件再写 scrollTop 只会和宿主互相打断。
	 */
	function hostFollowsTail() {
		return port !== null && port.querySelector('[data-chat-following-tail]') !== null;
	}
	/**
	 * 底部跟随：只补宿主没有负责的那部分增长。
	 * 宿主在跟随时所有权归宿主，本引擎只同步位置、不写 scrollTop；
	 * 宿主不跟随时（用户已离开底部，或宿主没有该机制）才用阻尼补齐，
	 * 且底部变化幅度超过逐字增长量时一律让位，不去夺回宿主或阅读器的落位结果。
	 */
	function follow(dtMs) {
		if (!following || port === null) return true;
		var target = Math.max(0, port.scrollHeight - port.clientHeight);
		if (hostFollowsTail()) {
			position = port.scrollTop;
			velocity = 0;
			return Math.abs(target - port.scrollTop) < 0.5;
		}
		var delta = target - port.scrollTop;
		if (Math.abs(delta) < 0.5) {
			position = target;
			velocity = 0;
			return true;
		}
		// 一次变化超过单帧逐字增长：宿主或阅读器已经整体移动过视口，交还给它，不抢。
		if (Math.abs(delta) > DSHCP_SMOOTH_SNAP_PX) {
			position = port.scrollTop;
			velocity = 0;
			following = false;
			return true;
		}
		if (dtMs <= 0) return false;
		var dt = dtMs / 1000;
		position = port.scrollTop;
		velocity += (delta * 130 - velocity * 24) * dt;
		var next = position + velocity * dt;
		next = Math.max(position - DSHCP_SMOOTH_MAX_MOVE_PX, Math.min(position + DSHCP_SMOOTH_MAX_MOVE_PX, next));
		if (delta >= 0 ? next >= target : next <= target) {
			next = target;
			velocity = 0;
		}
		port.scrollTop = Math.max(0, next);
		position = port.scrollTop;
		return Math.abs(target - port.scrollTop) < 0.5;
	}
	function finish() {
		stop(false);
		options.onSettled();
	}
	function maybeFinish() {
		if (!active || running || pending.size > 0) return;
		if (!following || port === null || Math.abs(port.scrollHeight - port.clientHeight - port.scrollTop) < 0.5) finish();
	}
	function frame(now) {
		rafId = 0;
		if (!active || disposed) return;
		var elapsed = lastFrame === null ? 0 : Math.max(0, Math.min(DSHCP_SMOOTH_MAX_FRAME_MS, now - lastFrame));
		lastFrame = now;
		reveal(elapsed);
		var followed = follow(elapsed);
		if (!running && pending.size === 0 && followed) { finish(); return; }
		if (pending.size > 0 || !followed) schedule();
		else lastFrame = null;
	}
	function schedule() {
		if (!active || disposed || rafId !== 0) return;
		rafId = requestAnimationFrame(frame);
	}
	function onWheel(event) {
		if (port === null) return;
		if (event.deltaY < 0) {
			// 用户明确向上阅读：记录意图，近距离回弹的 scroll 不能立刻夺回。
			following = false;
			detachedByUser = true;
		} else if (distanceToBottom() <= 32) {
			following = true;
			detachedByUser = false;
			position = port.scrollTop;
			velocity = 0;
		}
	}
	function onPointerDown() { pointerDown = true; }
	function onPointerUp() { pointerDown = false; }
	function onScroll() {
		if (port === null) return;
		var atBottom = distanceToBottom() <= 32;
		var movedUp = port.scrollTop < lastScrollTop - 1;
		lastScrollTop = port.scrollTop;
		if (atBottom && !detachedByUser) {
			following = true;
			return;
		}
		// 离开底部、拖动或用户手动上滚：停止跟随，直到真正回到底部。
		if (!atBottom || movedUp || pointerDown) {
			following = false;
			if (!atBottom || movedUp) detachedByUser = true;
		}
	}
	function detachPort() {
		if (port === null) return;
		port.removeEventListener('wheel', onWheel);
		port.removeEventListener('pointerdown', onPointerDown);
		port.removeEventListener('scroll', onScroll);
		window.removeEventListener('pointerup', onPointerUp);
		window.removeEventListener('pointercancel', onPointerUp);
		port = null;
	}
	function attachPort() {
		port = root.closest('[data-conversation-scroll]');
		following = port !== null && distanceToBottom() <= 80;
		detachedByUser = false;
		position = port === null ? 0 : port.scrollTop;
		lastScrollTop = position;
		velocity = 0;
		if (port === null) return;
		port.addEventListener('wheel', onWheel, { passive: true });
		port.addEventListener('pointerdown', onPointerDown, { passive: true });
		port.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('pointerup', onPointerUp, { passive: true });
		window.addEventListener('pointercancel', onPointerUp, { passive: true });
	}
	function onMutations(mutations) {
		if (!active) return;
		// 同一批里同一 Text 可能有多条记录（自身截断写入与宿主写入交错）。
		// 先按节点聚合，只以该批结束时的宿主真实值为准，避免中间值覆盖缓冲。
		var touched = new Map();
		var added = [];
		var rewritten = new Set();
		for (var mutation of mutations) {
			if (mutation.type === 'characterData') {
				var node = mutation.target;
				var current = node.nodeValue;
				var owned = ownWrite(node, mutation.oldValue, current);
				var previous = records.get(node);
				// React 成形内联元素时会复用第一个 Text 并把它改短，后半段搬到新节点。
				// 先把这里丢掉的已显示文字记进退役池，新节点才不会把后半段重播一遍。
				if (!owned && previous !== undefined && !rewritten.has(node)
					&& dshcpSmoothPrefix(previous.chars, dshcpSmoothChars(current)) < previous.shown) {
					rewritten.add(node);
					remember(previous);
				}
				var state = touched.get(node);
				if (state === undefined) {
					state = { hostTouched: !owned, value: owned ? null : current };
					touched.set(node, state);
					continue;
				}
				if (owned) continue;
				state.hostTouched = true;
				state.value = current;
				continue;
			}
			for (var removed of mutation.removedNodes) forget(removed);
			for (var grown of mutation.addedNodes) added.push(grown);
		}
		// 先让被移除的节点把已显示进度放进退役池，再登记新节点；
		// 宿主换成新的 Markdown 节点时不把旧正文重新播放一遍。
		for (var addedNode of added) visit(addedNode, running);
		touched.forEach(function (state, node) {
			if (state.hostTouched) enqueue(node, state.value);
		});
		if (pending.size > 0) schedule();
		else maybeFinish();
	}
	function begin(isRunning) {
		if (active || disposed) return;
		active = true;
		running = isRunning;
		debt = 0;
		lastFrame = null;
		// 进入会话时才挂载的运行中回复已经写好了一段：这是用户眼前的既有内容，
		// 不是刚到达的新分块。从整段已显示开始，只有之后真正到达的文字才揭示。
		visit(root, false);
		attachPort();
		observer = new MutationObserver(onMutations);
		observer.observe(root, { childList: true, characterData: true, characterDataOldValue: true, subtree: true });
		if (typeof ResizeObserver === 'function') {
			resize = new ResizeObserver(function () { if (active && following) schedule(); });
			resize.observe(root);
		}
		if (pending.size > 0 || following) schedule();
		else maybeFinish();
	}
	function stop(restore) {
		if (rafId !== 0) cancelAnimationFrame(rafId);
		rafId = 0;
		lastFrame = null;
		if (observer !== null) observer.disconnect();
		if (resize !== null) resize.disconnect();
		observer = null;
		resize = null;
		detachPort();
		// 保持标记一律在这里撤下：缓冲区的生命周期结束，格式必须和完整文字一起可见。
		if (restore) {
			records.forEach(function (record, node) {
				var controlled = record.chars.slice(0, record.shown).join('');
				// React 若已写入更新值，不用旧缓冲区覆盖它。
				if (node.isConnected && node.nodeValue === controlled) {
					node.nodeValue = record.full;
					record.shown = record.chars.length;
				}
			});
		}
		releaseAll();
		pending.clear();
		retired.length = 0;
		active = false;
		running = false;
		debt = 0;
		velocity = 0;
		following = false;
		detachedByUser = false;
		pointerDown = false;
	}
	return {
		setState: function (enabled, isRunning) {
			if (disposed) return;
			if (!enabled) { stop(true); return; }
			running = isRunning;
			if (!active) { begin(isRunning); return; }
			if (pending.size > 0 || following) schedule();
			else maybeFinish();
		},
		dispose: function () {
			if (disposed) return;
			disposed = true;
			stop(true);
			records.clear();
		}
	};
}

function createDshcpSmoothComponent(React, Inner, owners) {
	function SmoothAssistantNodeView(props) {
		var rootRef = React.useRef(null);
		var engineRef = React.useRef(null);
		var running = dshcpSmoothRunning(props.node);
		var runningRef = React.useRef(running);
		runningRef.current = running;
		var engagedState = React.useState(running);
		var engaged = engagedState[0], setEngaged = engagedState[1];
		var active = running || engaged;
		var onSettled = React.useCallback(function () {
			if (!runningRef.current) setEngaged(false);
		}, []);
		React.useLayoutEffect(function () {
			if (running) setEngaged(true);
		}, [running]);
		React.useLayoutEffect(function () {
			var engine = createDshcpSmoothEngine(rootRef.current, { onSettled: onSettled });
			engineRef.current = engine;
			owners.add(engine);
			return function () { owners.delete(engine); engine.dispose(); engineRef.current = null; };
		}, [onSettled, owners]);
		React.useLayoutEffect(function () {
			if (engineRef.current !== null) engineRef.current.setState(active, running);
		}, [active, running]);
		return React.createElement('div', { ref: rootRef, 'data-dshcp-smooth-root': '', style: { minWidth: 0 } }, React.createElement(Inner, props));
	}
	SmoothAssistantNodeView.displayName = 'CodePillSmoothAssistant';
	return SmoothAssistantNodeView;
}

/** Swap only the built-in assistant row; disabling restores its exact component. */
function installDisplaySmoothing(ctx, store) {
	var slots = typeof ctx.get === 'function' ? ctx.get('slots') : ctx.slots;
	if (!slots) {
		if (typeof ctx.inject !== 'function') return function () {};
		var waiting = ctx.inject(['slots'], function (child) {
			child.effect(function () { return installDisplaySmoothing(child, store); }, 'dsh-code-pill: deferred display smoothing');
		});
		return function () { waiting.dispose(); };
	}
	if (typeof slots.inject !== 'function' || typeof slots.entries !== 'function') return function () {};
	var React;
	try { React = require('react'); } catch (err) { return function () {}; }
	if (!React || typeof React.createElement !== 'function') return function () {};
	var media = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
	var registration = slots.inject('conversation.chat.node', function () {
		var enabled = false;
		var patched = [];
		var owned = new WeakSet();
		var owners = new Set();
		var disposed = false;
		function unwrap() {
			for (var patch of patched) {
				if (patch.entry.component === patch.wrapped) patch.entry.component = patch.original;
			}
			patched = [];
			owners.forEach(function (engine) { engine.dispose(); });
			owners.clear();
		}
		function wrappable(component) {
			return typeof component === 'function' || (component && typeof component === 'object' && '$$typeof' in component);
		}
		function wrapAll() {
			if (!enabled || disposed) return;
			var entries = slots.entries('conversation.chat.node');
			for (var entry of entries) {
				if (!entry.options || entry.options.key !== 'assistant-step') continue;
				var current = entry.component;
				if (owned.has(current) || !wrappable(current)) continue;
				// 每次启用都新建包装组件：复用上一次的组件类型会让 React 复用已挂载、
				// 但引擎已随关闭销毁的实例，平滑会静默失效。
				var wrapped = createDshcpSmoothComponent(React, current, owners);
				owned.add(wrapped);
				entry.component = wrapped;
				patched.push({ entry: entry, wrapped: wrapped, original: current });
			}
		}
		function sync() {
			if (disposed) return;
			var next = store && typeof store.getSnapshot === 'function'
				? store.getSnapshot().displaySmooth === true && !(media !== null && media.matches) : false;
			if (next === enabled) { if (next) wrapAll(); return; }
			enabled = next;
			if (!enabled) unwrap();
			else wrapAll();
		}
		var offStore = store && typeof store.subscribe === 'function' ? store.subscribe(sync) : function () {};
		var offSlots = typeof ctx.on === 'function' ? ctx.on('slots/changed', function (key) {
			if (key === 'conversation.chat.node') sync();
		}) : function () {};
		if (media !== null && typeof media.addEventListener === 'function') media.addEventListener('change', sync);
		sync();
		return function () {
			disposed = true;
			offStore();
			offSlots();
			if (media !== null && typeof media.removeEventListener === 'function') media.removeEventListener('change', sync);
			unwrap();
		};
	});
	return typeof registration === 'function' ? registration : function () {};
}
