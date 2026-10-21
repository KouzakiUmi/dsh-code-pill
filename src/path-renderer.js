/** 宿主路径适配器。只拥有 class/data；不创建或替换宿主子节点。
 * data 标记优先；少量 CSS-module 局部名回退均限制在已核实的组件边界内。
 */
function createPathRenderer(root, getConfig) {
	var OWNER = '[data-tool][data-variant], [data-chat-flow], [data-chat-flow-kind]';
	var CHAT_OWNER = '[data-chat-flow-kind], [data-chat-flow]';
	var records = new Map();
	var pending = new Set();
	var queuedNodes = new Set();
	var ownClasses = new WeakMap();
	var applied = new WeakMap();
	function local(el, name) {
		return Array.from(el.classList).some(function (c) { return c === name || c.endsWith('_' + name); });
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
	function discover(owner) {
		var found = new Map();
		function add(el, value, kind) {
			if (!el || el.tagName === 'CODE' || excluded(el)) return;
			var canonical = el.closest(CHAT_OWNER) || el.closest('[data-tool][data-variant]');
			if (canonical !== owner) return;
			var path = pathValue(value);
			if (path !== null) found.set(el, { path: path, kind: kind });
		}
		// 工具摘要仅选择明确的 fileLink/summary，不再遍历全部文本叶子。
		var rows = owner.matches('[data-tool][data-variant]') ? [owner] : Array.from(owner.querySelectorAll('[data-tool][data-variant]'));
		rows.forEach(function (tool) {
			if (!TOOL_PATH_VARIANTS.has(tool.dataset.variant) || tool.dataset.state === 'error' || tool.dataset.state === 'stopped') return;
			var row = tool.querySelector('[data-disclosure-row]');
			if (!row || row.closest('[data-tool][data-variant]') !== tool) return;
			Array.from(row.querySelectorAll('button, a, span')).forEach(function (el) {
				if (el.closest('[data-disclosure-row]') !== row) return;
				if (local(el, 'fileLink')) add(el, el.textContent, 'summary');
				else if (local(el, 'summary') && (TOOL_PATH_VARIANTS.has(tool.dataset.tool) || detectPathLike(el.textContent))) add(el, el.textContent, 'summary');
			});
		});
		// 所有其它适配器必须处于聊天流，不能扫设置页/全局工具栏。
		if (owner.closest('[data-chat-flow]') === null && !owner.matches('[data-chat-flow]')) return found;
		owner.querySelectorAll('[data-path-label]').forEach(function (el) { add(el, el.getAttribute('title') || el.textContent, 'label'); });
		owner.querySelectorAll('[data-read] [data-code-block-banner] [title]').forEach(function (el) {
			if (local(el, 'title')) add(el, el.getAttribute('title'), 'read-title');
		});
		owner.querySelectorAll('[data-search="paths"], [data-search="matches"]').forEach(function (search) {
			search.querySelectorAll('span, div').forEach(function (el) {
				if (el.closest('[data-search]') !== search) return;
				if (search.dataset.search === 'paths' && local(el, 'line') && el.childElementCount === 0) add(el, el.textContent, 'search');
				if (search.dataset.search === 'matches' && local(el, 'filePath') && el.parentElement.tagName === 'BUTTON') add(el, el.textContent, 'search');
			});
		});
		owner.querySelectorAll('button').forEach(function (el) {
			if (!local(el, 'fileMention') || el.hasAttribute('data-ref-chip')) return;
			if (el.closest('[data-read], [data-search], [data-diff], [data-terminal], [data-tool]')) return;
			var value = el.getAttribute('title');
			// code 内 fileMention 是宿主已解析的文件引用，title 可能是说明。
			var text = el.textContent.trim();
			var inlineMention = el.parentElement.tagName === 'CODE';
			if (inlineMention) value = text;
			// 图片预览成功时宿主移除 title；链接文案可能是任意别名，不能当文件路径。
			else if (!local(el, 'fileLink') || !value) return;
			add(el, value, 'reference');
		});
		return found;
	}
	function scan(owner) {
		var previous = records.get(owner) || new Map();
		var canonical = owner.closest(CHAT_OWNER) || owner.closest('[data-tool][data-variant]');
		var valid = canonical === owner && owner.isConnected && root.contains(owner) && owner.matches(OWNER) && !excluded(owner) && getConfig().toolPath !== false;
		var next = valid ? discover(owner) : new Map();
		previous.forEach(function (_, el) { if (!next.has(el)) remove(el); });
		if (next.size) records.set(owner, next); else records.delete(owner);
		return next;
	}
	function queue(node) {
		if (!node) return;
		if (node.nodeType !== 1) node = node.parentElement;
		if (!node || queuedNodes.has(node)) return;
		queuedNodes.add(node);
		var owner = node.closest(CHAT_OWNER) || node.closest('[data-tool][data-variant]');
		if (owner) pending.add(owner);
		records.forEach(function (_, previousOwner) {
			if (!previousOwner.isConnected || node === previousOwner || node.contains(previousOwner)
				|| (node.matches(OWNER) && previousOwner.contains(node))) pending.add(previousOwner);
		});
		node.querySelectorAll(OWNER).forEach(function (el) {
			if (el.matches(CHAT_OWNER) || !el.parentElement.closest(CHAT_OWNER)) pending.add(el);
		});
	}
	return {
		queue: queue,
		beginBatch: function () { queuedNodes.clear(); },
		isOwnClass: function (el) { return ownClasses.has(el) && ownClasses.get(el) === el.getAttribute('class'); },
		flush: function () {
			var batch = Array.from(pending); pending.clear(); queuedNodes.clear();
			// 先完成所有旧归属清理，再统一应用，避免跨 owner 同帧迁移互相撤销。
			var plans = batch.map(scan);
			plans.forEach(function (items) { items.forEach(function (value, el) { apply(el, value.path, value.kind); }); });
		},
		configure: function () { queuedNodes.clear(); queue(root); },
		hasPending: function () { return pending.size > 0; },
		dispose: function () { records.forEach(function (items) { items.forEach(function (_, el) { remove(el); }); }); records.clear(); pending.clear(); queuedNodes.clear(); }
	};
}
