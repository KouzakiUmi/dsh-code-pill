/**
 * 思考文字「彩虹刷入」：流式思考（CoT）里刚出现的文字短暂呈彩虹色，随后落回正常文字色。
 *
 * 宿主把思考正文渲染成流式 Markdown，React 原位更新文本节点（整段 nodeValue 重写），
 * 因此：
 * - 不碰 React 管理的子节点，只在 scope 元素上加 data 属性，颜色全部走 CSS Custom Highlight；
 * - 新增文字用 StaticRange 登记：Range 会在 nodeValue 被整体重写时折叠，StaticRange 不会；
 * - 色彩动画靠把单元在「时间分级」的 Highlight 之间搬移，不依赖 ::highlight 的动画能力。
 * 范围：运行中的思考行（data-variant=think + data-state=running）里的展开正文和折叠预览摘要。
 * 历史文字、结算后的整体重渲染、系统「减少动态效果」均不播放。
 */
function createThinkInk(root, getConfig) {
	var STEPS = 16;        // 色阶总数
	var STEP_MS = 90;      // 每个色阶的时长（总时长约 1.4s）
	var RAINBOW = 8;       // 前 RAINBOW 阶保持纯彩虹，之后逐阶回落到正文色
	var OFFSETS = 5;       // 同一时刻相邻单元的色相相位数，让同一块新文字也呈渐变
	var UNIT = 6;          // 一个染色单元最多包含的非空白字符数（长词均匀拆分）
	var MAX_CHUNK = 1200;  // 单次新增超过此长度视为整段挂载，不播放
	var HISTORY = 120;     // scope 首次登记时，已有文字超过此长度视为历史
	var MAX_UNITS = 600;   // 同时处于动画中的单元上限
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
	var rafId = 0;
	var media = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

	function available() {
		return typeof Highlight !== 'undefined' && typeof StaticRange !== 'undefined'
			&& typeof CSS !== 'undefined' && CSS.highlights != null;
	}
	function enabled() {
		return getConfig().thinkRainbow === true && available() && !(media !== null && media.matches);
	}

	/** 彩虹刷入的 CSS：每个 (色阶, 相位) 一条 ::highlight 规则；开关关闭时不注入。 */
	function css() {
		var out = ['[data-dshcp-ink] { --dshcp-ink-base: var(--dsw-alias-label-tertiary, GrayText); }'];
		for (var s = 0; s < STEPS; s++) {
			var fade = s < RAINBOW ? 0 : (s - RAINBOW + 1) / (STEPS - RAINBOW + 1);
			var percent = Math.round((1 - fade) * 100);
			for (var o = 0; o < OFFSETS; o++) {
				var hue = (s * 36 + o * 72) % 360;
				var color = 'hsl(' + hue + ' 92% var(--dshcp-ink-l, 60%))';
				var value = percent >= 100 ? color
					: 'color-mix(in oklab, ' + color + ' ' + percent + '%, var(--dshcp-ink-base, var(--dsw-alias-label-tertiary, GrayText)))';
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

	function addUnit(node, start, end, now) {
		var unit = {
			node: node, start: start, end: end, t0: now, b: -1, off: phase++ % OFFSETS,
			sr: new StaticRange({ startContainer: node, startOffset: start, endContainer: node, endOffset: end }),
		};
		setBucket(unit, unit.off);
		units.push(unit);
		if (units.length > MAX_UNITS) release(units.shift());
	}

	function ink(node, start, end, now) {
		if (end - start <= 0 || end - start > MAX_CHUNK) return;
		var text = node.nodeValue;
		var pattern = /\S+/g;
		pattern.lastIndex = start;
		for (var m = pattern.exec(text); m !== null && m.index < end; m = pattern.exec(text)) {
			var from = m.index;
			var to = Math.min(m.index + m[0].length, end);
			// 长词均匀拆成若干单元，避免尾部只剩一两个字符各自换色。
			var pieces = Math.ceil((to - from) / UNIT);
			var size = Math.ceil((to - from) / pieces);
			for (var at = from; at < to; at += size) addUnit(node, at, Math.min(at + size, to), now);
		}
	}

	function tick() {
		rafId = 0;
		if (highlights === null) return;
		var now = performance.now();
		var keep = [];
		for (var i = 0; i < units.length; i++) {
			var unit = units[i];
			var step = Math.floor((now - unit.t0) / STEP_MS);
			if (step >= STEPS || !unit.node.isConnected || unit.node.nodeValue.length < unit.end) release(unit);
			else {
				setBucket(unit, step * OFFSETS + unit.off);
				keep.push(unit);
			}
		}
		units = keep;
		if (units.length > 0) rafId = requestAnimationFrame(tick);
	}

	function addScope(el) {
		if (scopes.has(el)) return;
		scopes.add(el);
		el.setAttribute('data-dshcp-ink', '');
		var nodes = textNodes(el);
		var total = 0;
		for (var i = 0; i < nodes.length; i++) total += nodes[i].nodeValue.length;
		// 刚开始流式的短文本仍算新文字；已有大段内容（展开时挂载）是历史。
		var history = silent || total > HISTORY;
		for (var j = 0; j < nodes.length; j++) {
			if (history) seen.set(nodes[j], nodes[j].nodeValue);
			else pendingNodes.add(nodes[j]);
		}
	}
	function dropScope(el) {
		if (!scopes.delete(el)) return;
		el.removeAttribute('data-dshcp-ink');
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
		if (highlights !== null && node !== null && node !== undefined) pendingNodes.add(node);
	}

	function flush() {
		if (highlights === null) return;
		var now = performance.now();
		scopes.forEach(function (el) { if (!el.isConnected) dropScope(el); });
		pendingScopes.forEach(function (el) {
			if (el.isConnected && root.contains(el) && el.matches(SCOPE) && el.closest(SKIP) === null) addScope(el);
			else dropScope(el);
		});
		pendingScopes.clear();
		pendingNodes.forEach(function (node) {
			var parent = node.parentElement;
			var scope = node.isConnected && parent !== null ? parent.closest(SCOPE) : null;
			if (scope === null || !scopes.has(scope) || parent.closest(SKIP) !== null) return;
			var value = node.nodeValue;
			var old = seen.get(node);
			seen.set(node, value);
			if (old === value) return;
			var appended = old !== undefined && value.length > old.length && value.startsWith(old);
			// 非追加改动（整行摘要被替换）：旧单元的偏移已指向别的文字，先撤掉再整句重来。
			if (old !== undefined && !appended) dropUnits(node);
			ink(node, appended ? old.length : 0, value.length, now);
		});
		pendingNodes.clear();
		if (units.length > 0 && rafId === 0) rafId = requestAnimationFrame(tick);
	}

	function stop() {
		if (rafId !== 0) cancelAnimationFrame(rafId);
		rafId = 0;
		for (var i = 0; i < units.length; i++) release(units[i]);
		units = [];
		scopes.forEach(function (el) { el.removeAttribute('data-dshcp-ink'); });
		scopes.clear();
		pendingScopes.clear();
		pendingNodes.clear();
		if (highlights !== null && typeof CSS !== 'undefined' && CSS.highlights != null) {
			for (var b = 0; b < highlights.length; b++) CSS.highlights.delete(NAME + b);
		}
		highlights = null;
	}

	function configure() {
		if (!enabled()) {
			stop();
			return;
		}
		if (highlights === null) {
			highlights = [];
			for (var b = 0; b < STEPS * OFFSETS; b++) {
				var h = new Highlight();
				h.priority = 1;
				highlights.push(h);
				CSS.highlights.set(NAME + b, h);
			}
		}
		// 启用时已在流式中的思考：现有文字是历史，只播放之后新增的。
		silent = true;
		queueTree(root);
		flush();
		silent = false;
	}

	function onMediaChange() { configure(); }
	if (media !== null && typeof media.addEventListener === 'function') media.addEventListener('change', onMediaChange);

	return {
		css: css,
		queueTree: queueTree,
		queueText: queueText,
		flush: flush,
		configure: configure,
		dispose: function () {
			if (media !== null && typeof media.removeEventListener === 'function') media.removeEventListener('change', onMediaChange);
			stop();
		},
	};
}
