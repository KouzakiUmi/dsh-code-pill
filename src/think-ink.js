/**
 * 新词刷入：一个单词只有一个初始色相，短暂停留后淡回宿主色。
 * 不改 React 子节点、不等待动画再显示文本；只保留最新的少量词。
 * StaticRange 避免 nodeValue 追加重写时 Range 折叠。
 */
function createThinkInk(root, getConfig) {
	var STEPS = 4;          // 满色 + 三个淡出档，不轮换色相
	var OFFSETS = 5;        // 相邻新词的固定初始颜色
	var HOLD_MS = 160;
	var STEP_MS = 80;       // 总寿命 400ms
	var MIN_TICK_MS = 50;   // 单个合并定时器，不跑逐帧 RAF
	var MAX_UNITS = 16;     // 所有思考正文/摘要共享的活跃词上限
	var MAX_CHUNK = 1200;   // 整段重挂载不播放
	var TAIL_CHARS = 128;   // 大批新增仅处理尾部，不分词整段 CoT
	var WORD_CONTEXT = 48;  // 识别跨流式批次的半个词
	var HISTORY = 120;
	var SCOPE = '[data-variant="think"][data-state="running"] :is([data-markdown-variant="compact"], [data-streaming])';
	var SKIP = '[data-dshcp-preview], pre, textarea, input';
	var NAME = 'dshcp-ink-';
	var highlights = null;
	var scopes = new Set();
	var seen = new WeakMap();
	var units = [];
	var pendingScopes = new Set();
	var pendingNodes = new Set();
	var silent = false;
	var phase = 0;
	var timerId = 0;
	var segmenter = null; // 仅在首次开启动画时创建，不给默认关闭路径增加分词初始化成本
	var media = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

	function available() {
		return typeof Highlight !== 'undefined' && typeof StaticRange !== 'undefined'
			&& typeof CSS !== 'undefined' && CSS.highlights != null;
	}
	function enabled() {
		return getConfig().thinkRainbow === true && available() && !(media !== null && media.matches);
	}
	function css() {
		var out = ['[data-dshcp-ink] { --dshcp-ink-base: var(--dsw-alias-label-tertiary, GrayText); }'];
		for (var s = 0; s < STEPS; s++) {
			for (var o = 0; o < OFFSETS; o++) {
				var color = 'hsl(' + (o * 72) + ' 92% var(--dshcp-ink-l, 60%))';
				var value = s === 0 ? color : 'color-mix(in oklab, ' + color + ' ' + (100 - s * 25) + '%, var(--dshcp-ink-base, var(--dsw-alias-label-tertiary, GrayText)))';
				out.push('::highlight(' + NAME + (s * OFFSETS + o) + ') { color: ' + value + '; }');
			}
		}
		return out.join('\n');
	}
	function textNodes(el) {
		var found = [];
		var walker = document.createTreeWalker(el, 4);
		for (var node = walker.nextNode(); node !== null; node = walker.nextNode()) {
			if (node.parentElement !== null && node.parentElement.closest(SKIP) === null) found.push(node);
		}
		return found;
	}
	function setBucket(unit, bucket) {
		if (unit.b === bucket) return;
		if (unit.b >= 0) highlights[unit.b].delete(unit.sr);
		highlights[bucket].add(unit.sr);
		unit.b = bucket;
	}
	function release(unit) {
		if (unit.b >= 0 && highlights !== null) highlights[unit.b].delete(unit.sr);
		unit.b = -1;
	}
	function dropUnits(node) {
		units = units.filter(function (unit) {
			if (unit.node !== node) return true;
			release(unit);
			return false;
		});
	}
	function addUnit(node, scope, start, end, now) {
		if (units.length >= MAX_UNITS) release(units.shift());
		var unit = { node: node, scope: scope, start: start, end: end, t0: now, b: -1, off: phase++ % OFFSETS,
			sr: new StaticRange({ startContainer: node, startOffset: start, endContainer: node, endOffset: end }) };
		setBucket(unit, unit.off);
		units.push(unit);
	}
	function extend(unit, end) {
		var bucket = unit.b;
		release(unit);
		unit.end = end;
		unit.sr = new StaticRange({ startContainer: unit.node, startOffset: unit.start, endContainer: unit.node, endOffset: end });
		setBucket(unit, bucket); // 同一词追加字母不换颜色、不重新计时
	}
	function ink(node, scope, start, end, now, budget) {
		if (end <= start || end - start > MAX_CHUNK || budget <= 0) return 0;
		var text = node.nodeValue;
		var tail = Math.max(start, end - TAIL_CHARS);
		var scanStart = Math.max(0, tail - WORD_CONTEXT);
		var sample = text.slice(scanStart, end);
		var words = [];
		if (segmenter !== null) {
			for (var part of segmenter.segment(sample)) {
				if (part.isWordLike) words.push({ start: scanStart + part.index, end: scanStart + part.index + part.segment.length });
			}
		} else {
			// 旧浏览器降级：英文按词，汉字/假名按短片段，仍受同一预算限制。
			var pattern = /[\u3400-\u9fff\u3040-\u30ff]{1,2}|[A-Za-z0-9_]+/g;
			for (var match = pattern.exec(sample); match !== null; match = pattern.exec(sample)) {
				words.push({ start: scanStart + match.index, end: scanStart + match.index + match[0].length });
			}
		}
		var candidates = [];
		for (var i = 0; i < words.length; i++) {
			var word = words[i];
			if (word.end <= start || word.start < tail && word.start >= start) continue;
			// 分词窗口截在长词中间时，不把旧词尾冒充新单词。
			if (word.start === scanStart && scanStart > 0 && /[\p{L}\p{N}_]/u.test(text.charAt(scanStart - 1))) continue;
			if (word.end - word.start > WORD_CONTEXT) continue;
			candidates.push(word);
		}
		var changed = 0;
		var first = Math.max(0, candidates.length - budget);
		for (var w = first; w < candidates.length; w++) {
			var candidate = candidates[w];
			if (candidate.start < start) {
				for (var u = units.length - 1; u >= 0; u--) {
					var existing = units[u];
					if (existing.node === node && existing.start === candidate.start && existing.end === start
						&& now - existing.t0 < HOLD_MS + (STEPS - 1) * STEP_MS) {
						extend(existing, candidate.end);
						changed++;
						break;
					}
				}
			} else {
				addUnit(node, scope, candidate.start, candidate.end, now);
				changed++;
			}
		}
		return changed;
	}
	function scheduleTick() {
		if (timerId !== 0 || units.length === 0) return;
		var now = performance.now();
		var delay = Infinity;
		for (var i = 0; i < units.length; i++) {
			var step = Math.floor(units[i].b / OFFSETS);
			var next = units[i].t0 + HOLD_MS + step * STEP_MS;
			delay = Math.min(delay, next - now);
		}
		timerId = setTimeout(tick, Math.max(MIN_TICK_MS, delay));
	}
	function tick() {
		timerId = 0;
		if (highlights === null) return;
		var now = performance.now();
		var keep = [];
		for (var i = 0; i < units.length; i++) {
			var unit = units[i];
			var age = now - unit.t0;
			var step = age < HOLD_MS ? 0 : 1 + Math.floor((age - HOLD_MS) / STEP_MS);
			if (step >= STEPS || !unit.node.isConnected || !scopes.has(unit.scope) || unit.node.nodeValue.length < unit.end
				|| unit.node.parentElement === null || unit.node.parentElement.closest(SKIP) !== null || unit.node.parentElement.closest(SCOPE) !== unit.scope) release(unit);
			else { setBucket(unit, step * OFFSETS + unit.off); keep.push(unit); }
		}
		units = keep;
		scheduleTick();
	}
	function addScope(el) {
		if (scopes.has(el)) return;
		scopes.add(el);
		el.setAttribute('data-dshcp-ink', '');
		var nodes = textNodes(el);
		var total = 0;
		for (var i = 0; i < nodes.length; i++) total += nodes[i].nodeValue.length;
		var history = silent || total > HISTORY;
		for (var j = 0; j < nodes.length; j++) {
			if (history) seen.set(nodes[j], nodes[j].nodeValue);
			else pendingNodes.add(nodes[j]);
		}
	}
	function dropScope(el) {
		if (!scopes.delete(el)) return;
		el.removeAttribute('data-dshcp-ink');
		units = units.filter(function (unit) { if (unit.scope !== el) return true; release(unit); return false; });
	}
	function queueTree(node) {
		if (highlights === null || node === null || node === undefined || node.nodeType !== 1) return;
		if (node.matches(SCOPE)) pendingScopes.add(node);
		var nested = node.querySelectorAll(SCOPE);
		for (var i = 0; i < nested.length; i++) pendingScopes.add(nested[i]);
		scopes.forEach(function (scope) { if (node.contains(scope)) pendingScopes.add(scope); });
		var host = node.closest(SCOPE);
		if (host !== null && scopes.has(host)) {
			var nodes = textNodes(node);
			for (var j = 0; j < nodes.length; j++) pendingNodes.add(nodes[j]);
		}
	}
	function queueText(node) {
		if (highlights === null || !node || node.nodeType !== 3 || node.parentElement === null) return;
		// 工作区列表等无关文本不进入动画队列。
		if (node.parentElement.closest(SCOPE) !== null) pendingNodes.add(node);
	}
	function flush() {
		if (highlights === null) return;
		var now = performance.now();
		scopes.forEach(function (el) { if (!el.isConnected || !root.contains(el) || !el.matches(SCOPE) || el.closest(SKIP) !== null) dropScope(el); });
		pendingScopes.forEach(function (el) {
			if (el.isConnected && root.contains(el) && el.matches(SCOPE) && el.closest(SKIP) === null) addScope(el);
			else dropScope(el);
		});
		pendingScopes.clear();
		var budget = MAX_UNITS;
		// 优先最新节点；所有节点仍登记历史，未获预算的旧文字不在下一批补播。
		var nodes = Array.from(pendingNodes).reverse();
		pendingNodes.clear();
		for (var i = 0; i < nodes.length; i++) {
			var node = nodes[i];
			var parent = node.parentElement;
			var scope = node.isConnected && parent !== null ? parent.closest(SCOPE) : null;
			if (scope === null || !scopes.has(scope) || parent.closest(SKIP) !== null) continue;
			var value = node.nodeValue;
			var old = seen.get(node);
			seen.set(node, value);
			if (old === value) continue;
			var appended = old !== undefined && value.length > old.length && value.startsWith(old);
			if (old !== undefined && !appended) dropUnits(node);
			budget -= ink(node, scope, appended ? old.length : 0, value.length, now, budget);
		}
		scheduleTick();
	}
	function stop() {
		if (timerId !== 0) clearTimeout(timerId);
		timerId = 0;
		for (var i = 0; i < units.length; i++) release(units[i]);
		units = [];
		scopes.forEach(function (el) { el.removeAttribute('data-dshcp-ink'); });
		scopes.clear(); pendingScopes.clear(); pendingNodes.clear();
		if (highlights !== null && typeof CSS !== 'undefined' && CSS.highlights != null) {
			for (var b = 0; b < highlights.length; b++) CSS.highlights.delete(NAME + b);
		}
		highlights = null;
	}
	function configure() {
		if (!enabled()) { stop(); return; }
		if (highlights === null) {
			if (segmenter === null && typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
			highlights = [];
			for (var b = 0; b < STEPS * OFFSETS; b++) {
				var h = new Highlight(); h.priority = 1;
				highlights.push(h); CSS.highlights.set(NAME + b, h);
			}
		}
		silent = true; queueTree(root); flush(); silent = false;
	}
	function onMediaChange() { configure(); }
	if (media !== null && typeof media.addEventListener === 'function') media.addEventListener('change', onMediaChange);
	return { css: css, queueTree: queueTree, queueText: queueText, flush: flush, configure: configure,
		dispose: function () { if (media !== null && typeof media.removeEventListener === 'function') media.removeEventListener('change', onMediaChange); stop(); } };
}
