/**
 * 显示平滑：保留宿主回复组件，只缓冲可见 Text 的追加内容。
 * 字符按帧揭示，会话底部由同一个时钟跟随；历史消息与非运行态不排队。
 */
var DSHCP_SMOOTH_SKIP = '[aria-hidden="true"], [aria-live], [contenteditable="true"], script, style, textarea, input';
var DSHCP_SMOOTH_INITIAL_CHARS = 120;
var DSHCP_SMOOTH_MAX_FRAME_MS = 32;
var DSHCP_SMOOTH_MAX_MOVE_PX = 8;

function dshcpSmoothChars(text) {
	return Array.from(text);
}

function dshcpSmoothPrefix(left, right) {
	var limit = Math.min(left.length, right.length);
	var index = 0;
	while (index < limit && left[index] === right[index]) index++;
	return index;
}

function dshcpSmoothRunning(node) {
	return !!(node && node.data && node.data.status === 'running');
}

/** One owner for text reveal and scroll follow, so both advance in the same frame. */
function createDshcpSmoothEngine(root, options) {
	var records = new Map();
	var pending = new Set();
	var ownWrites = new WeakMap();
	var observer = null;
	var resize = null;
	var port = null;
	var active = false;
	var running = false;
	var activated = false;
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
		records.delete(node);
		pending.delete(node);
		ownWrites.delete(node);
	}
	function settle(node) {
		if (!revealable(node)) { drop(node); return; }
		var chars = dshcpSmoothChars(node.nodeValue);
		records.set(node, { chars: chars, full: node.nodeValue, shown: chars.length });
		pending.delete(node);
	}
	function enqueue(node, full) {
		if (!playable(node, full)) {
			// 宿主清空或改成空白：丢掉缓冲，不把旧文字写回去。
			drop(node);
			return;
		}
		var chars = dshcpSmoothChars(full);
		var previous = records.get(node);
		var shown = previous === undefined ? 0 : Math.min(previous.shown, dshcpSmoothPrefix(previous.chars, chars));
		records.set(node, { chars: chars, full: full, shown: shown });
		if (shown < chars.length) pending.add(node);
		else pending.delete(node);
		write(node, chars.slice(0, shown).join(''));
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
			records.delete(node);
			pending.delete(node);
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
		}
	}
	function distanceToBottom() {
		return port === null ? 0 : port.scrollHeight - port.scrollTop - port.clientHeight;
	}
	function keepPosition() {
		if (!following || port === null) return;
		var maximum = Math.max(0, port.scrollHeight - port.clientHeight);
		port.scrollTop = Math.max(0, Math.min(position, maximum));
	}
	function follow(dtMs) {
		if (!following || port === null) return true;
		var target = Math.max(0, port.scrollHeight - port.clientHeight);
		var delta = target - position;
		if (Math.abs(delta) < 0.5 && Math.abs(velocity) < 2) {
			position = target;
			velocity = 0;
			port.scrollTop = target;
			return true;
		}
		if (dtMs <= 0) return false;
		var dt = dtMs / 1000;
		velocity += (delta * 130 - velocity * 24) * dt;
		var next = position + velocity * dt;
		next = Math.max(position - DSHCP_SMOOTH_MAX_MOVE_PX, Math.min(position + DSHCP_SMOOTH_MAX_MOVE_PX, next));
		if ((delta >= 0 && next >= target) || (delta <= 0 && next <= target)) {
			next = target;
			velocity = 0;
		}
		position = Math.max(0, next);
		port.scrollTop = position;
		return false;
	}
	function finish() {
		stop(false);
		options.onSettled();
	}
	function maybeFinish() {
		if (!active || running || pending.size > 0) return;
		if (!following || port === null || (Math.abs(port.scrollHeight - port.clientHeight - position) < 0.5 && Math.abs(velocity) < 2)) finish();
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
			if (pending.size === 0) position = port.scrollTop;
			return;
		}
		// 离开底部、拖动或用户手动上滚：停止跟随，直到真正回到底部。
		if (!atBottom || movedUp || pointerDown || Math.abs(port.scrollTop - position) > 1) {
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
		for (var mutation of mutations) {
			if (mutation.type === 'characterData') {
				var node = mutation.target;
				var current = node.nodeValue;
				var owned = ownWrite(node, mutation.oldValue, current);
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
			for (var added of mutation.addedNodes) {
				// 结算时宿主可能换成完整 Markdown 树；不把旧正文重新播放一遍。
				visit(added, running);
			}
		}
		touched.forEach(function (state, node) {
			if (state.hostTouched) enqueue(node, state.value);
		});
		keepPosition();
		if (pending.size > 0) schedule();
		else maybeFinish();
	}
	function begin(isRunning) {
		if (active || disposed) return;
		active = true;
		running = isRunning;
		debt = 0;
		lastFrame = null;
		var initialReveal = isRunning && !activated && root.textContent.length <= DSHCP_SMOOTH_INITIAL_CHARS;
		activated = true;
		visit(root, initialReveal);
		attachPort();
		keepPosition();
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
		pending.clear();
		active = false;
		running = false;
		debt = 0;
		velocity = 0;
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
