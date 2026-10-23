/** 宿主路径适配器（增量）。只拥有 class/data；不创建或替换宿主子节点。
 * data 标记优先；少量 CSS-module 局部名回退均限制在已核实的组件边界内。
 *
 * 变更按影响范围入队，不再对整个聊天流全量重扫：
 * - queueSelf：复核单个元素；文本变化会沿祖先链复核所有候选形状的祖先
 *   （适配器只读元素自身的 textContent/title/class，祖先之外的候选不受影响）。
 * - queueTree：重扫一个子树（新增/删除节点、容器语义属性变化）。
 * - configure：请求一次全量对账（初始挂载与设置变更）。
 * 扫描即对账：容器内未再命中（或归属失效）的旧装饰就地摘除；迁移的元素
 * 以 flush 时的 live-DOM contains 判定，天然不受变更记录顺序影响。
 */
function createPathRenderer(root, getConfig) {
	var CHAT_FLOW = '[data-chat-flow]';
	var CHAT_OWNER = '[data-chat-flow-kind], [data-chat-flow]';
	var TOOL_ROW = '[data-tool][data-variant]';
	var ROW = '[data-disclosure-row]';
	var applied = new Map();      // 已装饰元素 → { path, kind, marker }
	var pendingSelf = new Set();  // 待复核的候选形状元素
	var scopes = new Set();       // 待重扫的子树根
	var needFull = false;
	var ownClasses = new WeakMap();

	function local(el, name) {
		var suffix = '_' + name;
		var list = el.classList;
		for (var i = 0; i < list.length; i++) {
			var c = list.item(i);
			if (c === name || c.endsWith(suffix)) return true;
		}
		return false;
	}
	function excluded(el) {
		return el.closest('[data-dshcp-preview], [data-message-attachments], [contenteditable], textarea, input, pre') !== null;
	}
	function pathValue(value) {
		if (typeof value !== 'string') return null;
		var s = value.trim();
		// 语义容器已证明是文件：允许空格、未知后缀、绝对路径和长路径。
		if (!s || /[\r\n\u0000-\u001f]/.test(s) || /^[a-z][\w+.-]*:\/\//i.test(s)) return null;
		return s;
	}
	function remove(el) {
		if (!applied.has(el)) return;
		applied.delete(el);
		el.classList.remove('dshcp-pill', 'dshcp-tool-path');
		ownClasses.set(el, el.getAttribute('class'));
		delete el.dataset.dshcpPath;
		delete el.dataset.dshcpBadge;
		delete el.dataset.dshcpIcon;
	}
	function apply(el, path, kind) {
		var marker = getConfig().marker;
		var old = applied.get(el);
		if (old && old.path === path && old.kind === kind && old.marker === marker && ownClasses.get(el) === el.getAttribute('class')) return;
		applied.set(el, { path: path, kind: kind, marker: marker });
		var basename = path.replace(/#L\d+(?:-L?\d+)?$/, '').split(/[\\/]/).pop();
		var extension = /\.([a-z0-9]+)$/i.exec(basename);
		var badge = detectBadge(basename);
		if (badge === null && extension !== null) badge = detectBadge('file.' + extension[1]);
		el.classList.add('dshcp-pill', 'dshcp-tool-path');
		ownClasses.set(el, el.getAttribute('class'));
		el.dataset.dshcpPath = path;
		// 读取卡片已经有语言栏；带宿主图标的引用不再叠加图标。
		if (badge !== null && kind !== 'read-title' && (marker === 'label' || marker === 'both')) el.dataset.dshcpBadge = badge;
		else delete el.dataset.dshcpBadge;
		if (badge !== null && kind !== 'reference' && kind !== 'read-title' && (marker === 'icon' || marker === 'both')) el.dataset.dshcpIcon = badgeIconKind(badge);
		else delete el.dataset.dshcpIcon;
	}
	function inChatFlow(el) {
		return el.closest(CHAT_FLOW) !== null || el.matches(CHAT_FLOW);
	}
	function summaryCandidate(el) {
		var tag = el.tagName;
		if (tag !== 'BUTTON' && tag !== 'A' && tag !== 'SPAN') return null;
		var row = el.closest(ROW);
		if (row === null) return null;
		var tool = row.closest(TOOL_ROW);
		// 宿主行只装饰工具行下第一个 disclosure-row，与元素级判定保持一致。
		if (tool === null || tool.querySelector(ROW) !== row) return null;
		if (!TOOL_PATH_VARIANTS.has(tool.dataset.variant) || tool.dataset.state === 'error' || tool.dataset.state === 'stopped') return null;
		if (local(el, 'fileLink')) return { el: el, value: el.textContent, kind: 'summary' };
		if (local(el, 'summary') && (TOOL_PATH_VARIANTS.has(tool.dataset.tool) || detectPathLike(el.textContent))) return { el: el, value: el.textContent, kind: 'summary' };
		return null;
	}
	function labelCandidate(el) {
		if (!el.hasAttribute('data-path-label') || !inChatFlow(el)) return null;
		return { el: el, value: el.getAttribute('title') || el.textContent, kind: 'label' };
	}
	function readTitleCandidate(el) {
		if (!local(el, 'title') || !inChatFlow(el)) return null;
		var banner = el.closest('[data-code-block-banner]');
		if (banner === null || banner.closest('[data-read]') === null) return null;
		return { el: el, value: el.getAttribute('title'), kind: 'read-title' };
	}
	function searchCandidate(el) {
		var search = el.closest('[data-search]');
		if (search === null || !inChatFlow(el)) return null;
		if (search.dataset.search === 'paths' && local(el, 'line') && el.childElementCount === 0) return { el: el, value: el.textContent, kind: 'search' };
		if (search.dataset.search === 'matches' && local(el, 'filePath') && el.parentElement !== null && el.parentElement.tagName === 'BUTTON') return { el: el, value: el.textContent, kind: 'search' };
		return null;
	}
	function mentionCandidate(el) {
		if (el.tagName !== 'BUTTON' || !local(el, 'fileMention') || el.hasAttribute('data-ref-chip')) return null;
		if (el.closest('[data-read], [data-search], [data-diff], [data-terminal], [data-tool]') !== null) return null;
		// code 内 fileMention 是宿主已解析的文件引用，title 可能是说明。
		if (el.parentElement !== null && el.parentElement.tagName === 'CODE') return { el: el, value: el.textContent.trim(), kind: 'reference' };
		// 图片预览成功时宿主移除 title；链接文案可能是任意别名，不能当文件路径。
		var value = el.getAttribute('title');
		if (!local(el, 'fileLink') || !value) return null;
		return { el: el, value: value, kind: 'reference' };
	}
	/** 元素级候选判定；命中顺序对应旧全量扫描的覆盖顺序（后者覆盖前者）。 */
	function candidate(el) {
		if (el.tagName === 'CODE' || excluded(el)) return null;
		return mentionCandidate(el) || searchCandidate(el) || readTitleCandidate(el) || labelCandidate(el) || summaryCandidate(el);
	}
	/** 归属核验 + 装饰；owner 失效（含开关关闭）返回 false，由调用方摘除旧装饰。 */
	function adopt(hit) {
		var el = hit.el;
		var owner = el.closest(CHAT_OWNER) || el.closest(TOOL_ROW);
		if (owner === null || !owner.isConnected || !root.contains(owner) || excluded(owner) || getConfig().toolPath === false) return false;
		var path = pathValue(hit.value);
		if (path === null) return false;
		apply(el, path, hit.kind);
		return true;
	}
	function oneGather(container, selector, next) {
		var found = container.querySelectorAll(selector);
		for (var i = 0; i < found.length; i++) {
			var hit = candidate(found[i]);
			if (hit !== null && !next.has(hit.el)) next.set(hit.el, hit);
		}
	}
	/** 子树收集：按适配器选择器圈出候选，再逐个做元素级判定（聊天流约束在候选内部核验）。 */
	function collect(container, next) {
		oneGather(container, '[data-disclosure-row] :is(button, a, span)', next);
		oneGather(container, 'button', next);
		oneGather(container, '[data-path-label]', next);
		oneGather(container, '[data-code-block-banner] [title]', next);
		oneGather(container, '[data-search] :is(span, div)', next);
	}
	function scanScope(container) {
		var next = new Map();
		if (container.isConnected && root.contains(container)) collect(container, next);
		// 只对账严格后代：容器自身的候选复核由同批的 pendingSelf（queueTree 必定登记）负责。
		applied.forEach(function (_, el) {
			if (el === container || !container.contains(el)) return;
			var hit = next.get(el);
			if (hit !== undefined && adopt(hit)) { next.delete(el); return; }
			remove(el);
		});
		next.forEach(function (hit) { adopt(hit); });
	}
	function scanSelf(el) {
		// 脱离文档（含被直接移除或移出 root）的已装饰元素只能摘除，不能留着等以后再扫。
		if (!el.isConnected || !root.contains(el)) { remove(el); return; }
		var hit = candidate(el);
		if (hit === null || !adopt(hit)) remove(el);
	}
	/** 候选形状：适配器实际读取的标签/属性，祖先链复核只收集这些元素。 */
	function shaped(el) {
		var tag = el.tagName;
		return tag === 'BUTTON' || tag === 'A' || tag === 'SPAN' || tag === 'DIV'
			|| el.hasAttribute('data-path-label') || el.hasAttribute('title');
	}
	/** 相关性探针：子树扫描只对含候选形状或语义容器的子树有意义；已装饰元素自带类名可循。 */
	var PROBE = 'button, a, [title], [data-path-label], [data-search], [data-disclosure-row], [data-tool], [data-chat-flow], [data-chat-flow-kind], .dshcp-tool-path';
	/** 文本变化影响祖先的 textContent；候选必须处于归属内，而元素不在归属内时其祖先也必然不在，攀爬到归属即止。 */
	function climb(el) {
		var stop = el.closest(CHAT_OWNER) || el.closest(TOOL_ROW);
		if (stop === null || stop === el) return;
		for (var p = el.parentElement; p !== null && p !== root; p = p.parentElement) {
			if (shaped(p)) pendingSelf.add(p);
			if (p === stop) break;
		}
	}
	function queueSelf(el) {
		if (el === null || el === undefined || el.nodeType !== 1 || getConfig().toolPath === false) return;
		// 已脱离文档的元素只剩摘除一种结果，不做相关性过滤。
		if (!el.isConnected) { pendingSelf.add(el); return; }
		// 无候选形状、且不在任何归属内的元素（如侧栏普通行）与路径管线无关。
		if (!shaped(el) || (el.closest(CHAT_OWNER) === null && el.closest(TOOL_ROW) === null)) { climb(el); return; }
		pendingSelf.add(el);
		climb(el);
	}
	function queueText(node) {
		if (node === null || node === undefined || node.nodeType !== 3) return;
		queueSelf(node.parentElement);
	}
	function queueTree(el, anchor) {
		if (el === null || el === undefined || el.nodeType !== 1 || getConfig().toolPath === false) return;
		// 已脱离文档的子树必为删除清理：不做相关性过滤，保证摘除路径不被跳过。
		if (el.isConnected && el.closest(CHAT_OWNER) === null && el.closest(TOOL_ROW) === null
			&& !el.matches(PROBE) && el.querySelector(PROBE) === null) return;
		scopes.add(el);
		pendingSelf.add(el);
		climb(el);
		// 「工具行下第一个 disclosure-row」的身份取决于兄弟结构：行的增删与属性变化要连带重扫所属工具行；
		// 删除节点自身已无祖先链，改用变更前的父节点（anchor）定位。
		var tool = el.isConnected ? el.closest(TOOL_ROW)
			: anchor !== undefined && anchor !== null && anchor.nodeType === 1 ? anchor.closest(TOOL_ROW) : null;
		if (tool !== null && tool !== el) { scopes.add(tool); pendingSelf.add(tool); }
	}
	return {
		queueSelf: queueSelf,
		queueText: queueText,
		queueTree: queueTree,
		isOwnClass: function (el) { return ownClasses.has(el) && ownClasses.get(el) === el.getAttribute('class'); },
		flush: function () {
			if (needFull) {
				needFull = false;
				pendingSelf.clear();
				scopes.clear();
				scanScope(root);
				return;
			}
			if (pendingSelf.size === 0 && scopes.size === 0) return;
			var selves = Array.from(pendingSelf); pendingSelf.clear();
			var trees = Array.from(scopes); scopes.clear();
			for (var i = 0; i < selves.length; i++) scanSelf(selves[i]);
			for (var j = 0; j < trees.length; j++) scanScope(trees[j]);
		},
		configure: function () { needFull = true; },
		hasPending: function () { return needFull || pendingSelf.size > 0 || scopes.size > 0; },
		dispose: function () {
			applied.forEach(function (_, el) { remove(el); });
			applied.clear();
			pendingSelf.clear();
			scopes.clear();
			needFull = false;
		}
	};
}
