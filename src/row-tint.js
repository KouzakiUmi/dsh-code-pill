/**
 * 折叠动作行着色：让「图标 + 动作 + 完成状态」一眼能分辨。
 *
 * 标准折叠行由 DisclosureRow 渲染，技能与 Cordis 执行有独立头部，
 * 行根带 data-variant / data-tool / data-state；上下文提示按聊天 flow 定位。因此：
 * - 类别与状态着色是纯 CSS，选择器只依赖宿主的语义属性与 DisclosureRow 的固定结构，
 *   不需要观察器，也不碰任何宿主节点；
 * - 摘要末尾的完成状态词（已完成、已交付…）是文本的一部分，只能用 CSS Custom Highlight 给
 *   文字区间上色，区间用 StaticRange（nodeValue 被整体重写时 Range 会折叠）。
 * 状态词只在「其它类」行（任务、定时、目标、交付文件等）里识别，并且要求行状态与词义一致；
 * 命令/读取/写入的摘要是用户或模型写的描述与路径，不去猜。
 */
function createRowTint(root, getConfig) {
	var OWNER = ':is([data-variant], [data-tool])[data-state]';
	var ROW = OWNER + ' > div > [data-disclosure-header] > [data-disclosure-row]';
	var BASH = '[data-sample="bash"][data-variant="bash"][data-state]';
	var ROW_SELECTOR = '[data-disclosure-row]';
	var NAMES = { ok: 'dshcp-st-ok', warn: 'dshcp-st-warn', err: 'dshcp-st-err' };
	var STATE_KIND = { ok: 'ok', error: 'err', stopped: 'warn' };
	// 英文状态词必须自成一词（前面不是字母/数字，避免 incomplete、undone 这类误染）；
	// 中文词不加边界，因为宿主自己的文案就是粘连的（“交付失败”“处理失败”），
	// 但成功类只认带“已”的“已完成/已交付”，不认裸的“完成/成功”（避免“任务完成”这类描述误染）。
	var WORDS = {
		ok: /(?:已完成|已交付|(?<![\p{L}\p{N}])(?:completed|complete|done|delivered|succeeded|success|finished))$/iu,
		err: /(?:失败|错误|出错|(?<![\p{L}\p{N}])(?:failed|failure|error))$/iu,
		warn: /(?:已停止|已中断|已取消|(?<![\p{L}\p{N}])(?:stopped|interrupted|cancelled|canceled))$/iu,
	};
	var registered = false;
	var tracked = new Map();   // 行 → [{ sr, kind }]
	var pending = new Set();

	function available() {
		return typeof Highlight !== 'undefined' && typeof StaticRange !== 'undefined'
			&& typeof CSS !== 'undefined' && CSS.highlights != null;
	}

	/** 类别/状态着色规则；开关关闭时不注入，不修改宿主属性或子节点。 */
	function css() {
		// 技能有独立卡片；工具新增提示没有 data-tool/state，只能按已核实的聊天 context 位置识别。
		var skill = '[data-tool="skill"][data-state] > div:first-of-type';
		var context = '[data-chat-flow-kind="context"] > [data-slot="conversation.chat.node"] > div > [data-disclosure-header] > [data-disclosure-row]';
		var cordis = ':is([data-tool="cordis_run"], [data-tool="cordis_stop"], [data-tool="cordis_undefine"])[data-state] > div:first-of-type';
		var lead = [ROW + ' > :first-child', BASH + ' > :first-child', skill + ' > span:first-child', context + ' > :first-child', cordis + ' > span:first-child'];
		var title = [ROW + ' > :nth-child(2) > :first-child > :first-child', BASH + ' > :last-child > :first-child > :first-child',
			skill + ' > span:last-child > :first-child > :first-child', context + ' > :nth-child(2) > :first-child > :first-child', cordis + ' > span:nth-child(2)'];
		var hoverTitle = [ROW + ':hover > :nth-child(2) > :first-child > :first-child', BASH + ':hover > :last-child > :first-child > :first-child',
			skill + ':hover > span:last-child > :first-child > :first-child', context + ':hover > :nth-child(2) > :first-child > :first-child', cordis + ':hover > span:nth-child(2)'];
		var out = [
			// 每个 owner 重设变量，防止嵌套工具行继承外层类别/失败色；未知工具有明确兜底。
			OWNER + ' { --dshcp-row-tint: var(--dshcp-row-tool); }',
			context + ' { --dshcp-row-tint: var(--dshcp-row-tool); }',
		];
		function rule(selectors, key) {
			if (selectors.length > 0) out.push(':is(' + selectors.join(', ') + ')[data-state] { --dshcp-row-tint: var(--dshcp-row-' + key + '); }');
		}
		// 先按通用 variant 分类，再按 wire 工具名细分（会话/任务等宿主仍叫 others）。
		CP_SETTINGS.ROW_CATEGORIES.forEach(function (category) {
			rule(category.variants.split(/\s+/).filter(Boolean).map(function (variant) { return '[data-variant="' + variant + '"]'; }), category.key);
		});
		CP_SETTINGS.ROW_CATEGORIES.forEach(function (category) {
			rule(category.tools.split(/\s+/).filter(Boolean).map(function (tool) { return '[data-tool="' + tool + '"]'; }), category.key);
		});
		out.push(
			OWNER.replace('[data-state]', '[data-state="error"]') + ' { --dshcp-row-tint: var(--dshcp-row-err); }',
			OWNER.replace('[data-state]', '[data-state="stopped"]') + ' { --dshcp-row-tint: var(--dshcp-row-warn); }',
			lead.join(',\n') + ' { color: var(--dshcp-row-tint); }',
			// 动作名略向宿主灰回混，悬停时回到满色；描述保持宿主色，层级不变。
			title.join(',\n') + ' { color: color-mix(in oklab, var(--dshcp-row-tint) 82%, var(--dsw-alias-label-tertiary, GrayText)); }',
			hoverTitle.join(',\n') + ' { color: var(--dshcp-row-tint); }',
			'::highlight(' + NAMES.ok + ') { color: var(--dshcp-row-ok); }',
			'::highlight(' + NAMES.warn + ') { color: var(--dshcp-row-warn); }',
			'::highlight(' + NAMES.err + ') { color: var(--dshcp-row-err); }'
		);
		return out.join('\n');
	}

	function highlightOf(kind) { return CSS.highlights.get(NAMES[kind]); }

	function clearRow(row) {
		var records = tracked.get(row);
		if (records === undefined) return;
		for (var i = 0; i < records.length; i++) highlightOf(records[i].kind).delete(records[i].sr);
		tracked.delete(row);
	}

	/** 行所属的状态元素：行 → 头 → DisclosureRow 根 → 宿主行根。 */
	function ownerOf(row) {
		var header = row.parentElement;
		var inner = header === null ? null : header.parentElement;
		var owner = inner === null ? null : inner.parentElement;
		return owner !== null && owner.matches(OWNER) ? owner : null;
	}

	/** 只在「其它类」与交付文件行里识别状态词：这些摘要由宿主生成。 */
	function eligibleOwner(owner) {
		return owner.dataset.variant === 'others' || owner.dataset.tool === 'present';
	}

	function titleOf(row) {
		var shimmer = row.children.length > 1 ? row.children[1] : null;
		var content = shimmer === null ? null : shimmer.firstElementChild;
		return content === null ? null : content.firstElementChild;
	}

	function wordRange(node, kind) {
		var text = node.nodeValue;
		var end = text.length;
		while (end > 0 && /\s/.test(text.charAt(end - 1))) end--;
		var match = WORDS[kind].exec(text.slice(0, end));
		if (match === null) return null;
		// 「2/4 已完成」只是进度，不是完成：分数没满就不染成功色。
		var progress = /(\d+)\s*\/\s*(\d+)\s*$/.exec(text.slice(0, match.index));
		if (kind === 'ok' && progress !== null && progress[1] !== progress[2]) return null;
		return { start: match.index, end: match.index + match[0].length };
	}

	function scanRow(row) {
		clearRow(row);
		if (!row.isConnected || !root.contains(row)) return;
		var owner = ownerOf(row);
		if (owner === null || !eligibleOwner(owner)) return;
		var kind = STATE_KIND[owner.dataset.state];
		if (kind === undefined) return;
		var title = titleOf(row);
		var records = [];
		var walker = document.createTreeWalker(row, 4);
		for (var node = walker.nextNode(); node !== null; node = walker.nextNode()) {
			if (title !== null && title.contains(node)) continue;
			var range = wordRange(node, kind);
			if (range === null) continue;
			var sr = new StaticRange({ startContainer: node, startOffset: range.start, endContainer: node, endOffset: range.end });
			highlightOf(kind).add(sr);
			records.push({ sr: sr, kind: kind });
		}
		if (records.length > 0) tracked.set(row, records);
	}

	function queueRow(row) { if (registered && row !== null) pending.add(row); }
	function queueTree(node) {
		if (!registered || node === null || node === undefined || node.nodeType !== 1) return;
		if (node.matches(OWNER)) {
			var own = node.querySelector(':scope > div > [data-disclosure-header] > ' + ROW_SELECTOR);
			if (own !== null) pending.add(own);
		}
		var closest = node.closest(ROW_SELECTOR);
		if (closest !== null) pending.add(closest);
		var nested = node.querySelectorAll(ROW_SELECTOR);
		for (var i = 0; i < nested.length; i++) pending.add(nested[i]);
	}
	function queueText(node) {
		if (!registered || node === null || node === undefined || node.parentElement === null) return;
		queueRow(node.parentElement.closest(ROW_SELECTOR));
	}

	function flush() {
		if (!registered) return;
		tracked.forEach(function (_, row) { if (!row.isConnected) clearRow(row); });
		pending.forEach(scanRow);
		pending.clear();
	}

	function stop() {
		tracked.forEach(function (_, row) { clearRow(row); });
		pending.clear();
		if (registered && typeof CSS !== 'undefined' && CSS.highlights != null) {
			Object.keys(NAMES).forEach(function (kind) { CSS.highlights.delete(NAMES[kind]); });
		}
		registered = false;
	}

	function configure() {
		if (getConfig().rowTint !== true || !available()) {
			stop();
			return;
		}
		if (!registered) {
			Object.keys(NAMES).forEach(function (kind) { CSS.highlights.set(NAMES[kind], new Highlight()); });
			registered = true;
		}
		queueTree(root);
		flush();
	}

	return {
		css: css,
		queueTree: queueTree,
		queueText: queueText,
		flush: flush,
		configure: configure,
		dispose: stop,
	};
}
