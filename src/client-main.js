/**
 * dsh-code-pill — client factory 模板。
 * build 内联 tokenizer、CSS 与 settings core/UI，产出自包含 lib/client.js。
 * React 安全：只修改 code 的 class/data 属性，子节点永不插入/替换。
 * token 用持久 CSS Highlight 集合与 per-code Range 差量更新。
 * 工具行路径按变更范围增量复核（元素/子树），不再全量重扫聊天流。
 */
window.__ModuleLoader__.load({
	id: "dsh-code-pill",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		Object.defineProperty(exports, "__esModule", { value: true });

		/* __TOKENIZER__ */

		/* __CSS__ */

		/* __SETTINGS_CORE__ */

		/* __FONT_CORE__ */

		/* __FONT_UI__ */

		/* __SETTINGS_UI__ */

		/* __PATH_RENDERER__ */

		/* __THINK_INK__ */

		/* __ROW_TINT__ */

		/* __DISPLAY_SMOOTH__ */

		var PLUGIN_ID = "dsh-code-pill";
		var HIGHLIGHT_KEYS = ["kwc", "kwd", "str", "com", "num", "fn", "typ", "cst", "prm"];
		// 配置文件类徽章使用独立图标形状（styles.css 的 [data-dshcp-icon="config"]）。
		var CONFIG_BADGES = new Set(["JSON", "YAML", "TOML", "INI", "ENV", "CFG", "PROPS"]);
		// 宿主把 read/write/edit 工具行的文件路径渲染成行摘要（按钮/文本），
		// 不是 <code>：只有行根同时带 data-tool 与 data-variant，才认作工具行。
		var TOOL_PATH_VARIANTS = new Set(["read", "write", "edit"]);

		/** 徽章 → 图标类别；渲染层与设置页预览共用，避免两处各写一份判断。 */
		function badgeIconKind(badge) {
			return badge !== null && CONFIG_BADGES.has(badge) ? "config" : "file";
		}

		function injectStyles() {
			var previous = document.querySelector('style[data-plugin-css="' + PLUGIN_ID + '"]');
			if (previous !== null) previous.remove();
			var tag = document.createElement("style");
			tag.dataset.pluginCss = PLUGIN_ID;
			(document.head || document.body).appendChild(tag);
			return tag;
		}

		function emptyRanges() {
			return { kwc: [], kwd: [], str: [], com: [], num: [], fn: [], typ: [], cst: [], prm: [] };
		}

		function startRendering(store) {
			if (typeof document === "undefined" || document.body === null) return function () {};
			// 尚无经过宿主源码/DOM 核验的聊天 selector；不猜测类名。
			// body 是稳定的 fallback，未来可用已核实的稳定聊天根收窄。
			var root = document.body;
			var highlightOk = typeof Highlight !== "undefined"
				&& typeof CSS !== "undefined" && CSS.highlights != null;
			var style = injectStyles();
			var pending = new Set();
			var codeRanges = new Map();
			var decorated = new Set();
			var snapshots = new Map();
			var codeClasses = new WeakMap();
			// 工具行路径：待扫描的行根与已装饰的路径宿主。
			var paths = createPathRenderer(root, function () { return config; });
			var ink = createThinkInk(root, function () { return config; });
			var rows = createRowTint(root, function () { return config; });
			var scheduled = false;
			var rafId = 0;
			var config;
			var disposed = false;
			var off = function () {};

			var highlights = null;
			if (highlightOk) {
				highlights = {};
				for (var k of HIGHLIGHT_KEYS) {
					var h = new Highlight();
					highlights[k] = h;
					CSS.highlights.set("dshcp-" + k, h);
				}
			}

			function dropRanges(code) {
				delete code.dataset.dshcpText;
				snapshots.delete(code);
				var old = codeRanges.get(code);
				if (old === undefined) return;
				if (highlights !== null) {
					for (var key of HIGHLIGHT_KEYS) {
						for (var range of old[key]) highlights[key].delete(range);
					}
				}
				codeRanges.delete(code);
			}

			function cleanupCode(code) {
				pending.delete(code);
				// 只撤销本 renderer 的装饰；预览同名class/data属于React，不能碰。
				if (!decorated.has(code)) return;
				dropRanges(code);
				decorated.delete(code);
				delete code.dataset.dshcpBadge;
				delete code.dataset.dshcpIcon;
				delete code.dataset.dshcpSentence;
				code.classList.remove("dshcp-pill");
				codeClasses.set(code, code.getAttribute("class"));
			}

			function eligible(code) {
				return code.isConnected && root.contains(code)
					&& code.closest("pre, a, button, [data-dshcp-preview]") === null
					&& code.querySelector("button, a, svg") === null;
			}

			function queue(code, structureChanged) {
				if (code === null || code === undefined || code.nodeType !== 1 || code.tagName !== "CODE") return;
				// 已渲染 code 即使变为不合格也要入队，process 再核验最终状态。
				if (!eligible(code) && !decorated.has(code)) return;
				if (structureChanged) snapshots.delete(code);
				pending.add(code);
			}

			function process(code) {
				if (!eligible(code)) {
					cleanupCode(code);
					return;
				}
				var text = code.textContent ?? "";
				var node = code.firstChild;
				var old = snapshots.get(code);
				// 同文本替换 Text 节点会令旧 Range 留在脱离的节点，不能仅比文本。
				if (old !== undefined && old.text === text && old.node === node
					&& old.childCount === code.childNodes.length) return;
				dropRanges(code);
				code.dataset.dshcpText = text;
				snapshots.set(code, { text: text, node: node, childCount: code.childNodes.length });
				code.classList.add("dshcp-pill");
				codeClasses.set(code, code.getAttribute("class"));
				decorated.add(code);
				var inline = detectInlineContext(text);
				var marker = config.marker;
				// 句子级降级：整句被并进单个 code span 时不再按代码渲染文字。
				// 只加 data 标记（样式见 styles.css），token 化与徽章跳过，
				// pill 底色保留，不修改宿主子节点。
				var sentence = config.sentenceFallback === true && detectSentenceFallback(text) === true;
				if (sentence) {
					code.dataset.dshcpSentence = "";
					// 文本从文件名变成融合句时撤销上一轮的徽章装饰。
					delete code.dataset.dshcpBadge;
					delete code.dataset.dshcpIcon;
					return;
				}
				delete code.dataset.dshcpSentence;
				if ((marker === "label" || marker === "both") && inline.badge !== null) {
					code.dataset.dshcpBadge = inline.badge;
				} else delete code.dataset.dshcpBadge;
				if ((marker === "icon" || marker === "both") && inline.badge !== null) {
					code.dataset.dshcpIcon = badgeIconKind(inline.badge);
				} else delete code.dataset.dshcpIcon;
				var ranges = emptyRanges();
				// 先登记，保证失败后的 partial Range 仍可完整摘除。
				codeRanges.set(code, ranges);
				if (config.syntax && highlights !== null && inline.mode !== "plain" && text.length > 0
					&& node !== null && node.nodeType === 3 && code.childNodes.length === 1) {
					try {
						for (var t of tokenizeRanges(text, inline.mode === "shell")) {
							var range = document.createRange();
							range.setStart(node, t.start);
							range.setEnd(node, t.end);
							ranges[t.cls].push(range);
							highlights[t.cls].add(range);
						}
					} catch (err) {
						if (typeof console !== "undefined" && console.warn) {
							console.warn("dsh-code-pill: tokenize failed", err);
						}
					}
				}
			}

			function schedule() {
				if (disposed || scheduled || (pending.size === 0 && !paths.hasPending())) return;
				scheduled = true;
				rafId = requestAnimationFrame(function () {
					scheduled = false;
					rafId = 0;
					var batch = Array.from(pending);
					pending.clear();
					for (var code of batch) process(code);
					paths.flush();
				});
			}

			function visitCodes(node, callback) {
				if (node.nodeType !== 1) return;
				if (node.tagName === "CODE") callback(node);
				for (var code of node.querySelectorAll("code")) callback(code);
			}

		// 思考文字彩虹刷入关心的语义属性：运行态、行类型与展开正文/预览摘要标记。
		// 折叠行着色关心的属性：行状态与类别。
		var ROW_ATTRS = ["data-state", "data-variant", "data-tool"];
		var INK_ATTRS = ["data-state", "data-variant", "data-streaming", "data-markdown-variant"];
		// 路径渲染中影响整个子树候选的属性：容器语义/排除区变化需整棵重扫，其余只复核元素自身。
		var PATH_TREE_ATTRS = new Set(["contenteditable", "data-dshcp-preview", "data-message-attachments", "data-disclosure-row",
			"data-tool", "data-variant", "data-state", "data-chat-flow", "data-chat-flow-kind",
			"data-read", "data-diff", "data-terminal", "data-search", "data-code-block-banner"]);
		var hostClasses = function (value) {
			return (value || "").split(/\s+/).filter(function (c) { return c && c !== "dshcp-pill" && c !== "dshcp-tool-path"; }).sort().join(" ");
		};
		var observer = new MutationObserver(function (mutations) {
			for (var m of mutations) {
				if (m.type === "attributes") {
					var name = m.attributeName;
					if (name === "class") {
						var current = m.target.getAttribute("class");
						// 同值重设（React 常见）不改变任何候选，先走全等快路径再归一化比较。
						if (m.oldValue === current) continue;
						var normalized = hostClasses(m.oldValue) === hostClasses(current);
						// 行内管线只写插件 class，结构/文本变化另有队列。
						if (normalized && paths.isOwnClass(m.target)) continue;
						if (normalized && m.target.tagName === "CODE" && codeClasses.has(m.target)
							&& codeClasses.get(m.target) === current) continue;
					}
					if (INK_ATTRS.indexOf(name) !== -1) ink.queueTree(m.target);
					if (ROW_ATTRS.indexOf(name) !== -1) rows.queueTree(m.target);
					if (PATH_TREE_ATTRS.has(name)) paths.queueTree(m.target);
					else paths.queueSelf(m.target);
					if (name === "data-dshcp-preview") visitCodes(m.target, function (code) { queue(code, true); });
					if (name === "class" && m.target.tagName === "CODE") queue(m.target, true);
					continue;
				}
				if (m.type === "characterData") {
					ink.queueText(m.target);
					rows.queueText(m.target);
					paths.queueText(m.target);
					var parent = m.target.parentElement;
					var owner = parent !== null ? parent.closest("code") : null;
					if (owner !== null) queue(owner);
				} else if (m.type === "childList") {
					for (var inkAdded of m.addedNodes) {
						if (inkAdded.nodeType === 1) {
							ink.queueTree(inkAdded);
							rows.queueTree(inkAdded);
						} else if (inkAdded.nodeType === 3) {
							ink.queueText(inkAdded);
							rows.queueText(inkAdded);
						}
					}
					// 摘要文本随子树增删变化，自身与祖先链都只复核该元素。
					paths.queueSelf(m.target);
					var changedCode = m.target.closest !== undefined ? m.target.closest("code") : null;
					if (changedCode !== null) queue(changedCode, true);
					for (var node of m.removedNodes) {
						visitCodes(node, cleanupCode);
						paths.queueTree(node, m.target);
					}
					for (var added of m.addedNodes) {
						visitCodes(added, function (code) { queue(code, true); });
						paths.queueTree(added, m.target);
					}
				}
			}
			// 彩虹刷入要在同一微任务里登记新文字：晚到下一帧会漏掉一帧原色。
			ink.flush();
			rows.flush();
			schedule();
		});

			function configure() {
				if (disposed) return;
				// 无设置 store（宿主未提供设置层）时传 undefined：normalize 回落到默认配置，
				// 不能传 null——那会被当成非法输入抛错并中断订阅回调。
				var next = store && typeof store.getSnapshot === "function" ? store.getSnapshot() : undefined;
				config = typeof CP_SETTINGS !== "undefined" ? CP_SETTINGS.normalize(next)
					: { syntax: true, marker: "label" };
				style.textContent = CSS_TEXT + "\n" + (typeof CP_SETTINGS !== "undefined" ? CP_SETTINGS.css(config) : "")
					+ (config.thinkRainbow === true ? "\n" + ink.css() : "")
					+ (config.rowTint === true ? "\n" + rows.css() : "");
				// 配置变化强制重跑：syntax=false 立即摘除 Range，pill 始终保留。
				for (var code of Array.from(decorated)) {
					dropRanges(code);
					if (!eligible(code)) cleanupCode(code);
				}
				for (var initial of root.querySelectorAll("code")) queue(initial, true);
				paths.configure();
				ink.configure();
				rows.configure();
				schedule();
			}

			configure();
			observer.observe(root, { childList: true, characterData: true, subtree: true, attributes: true, attributeOldValue: true,
				attributeFilter: ["class", "contenteditable", "data-dshcp-preview", "data-message-attachments", "data-disclosure-row", "data-code-block-banner", "data-ref-chip", "data-tool", "data-variant", "data-state", "data-chat-flow", "data-chat-flow-kind", "data-search", "data-read", "data-diff", "data-terminal", "data-path-label", "data-streaming", "data-markdown-variant", "title"] });
			if (store && typeof store.subscribe === "function") off = store.subscribe(configure);

			return function () {
				if (disposed) return;
				disposed = true;
				off();
				observer.disconnect();
				if (rafId) cancelAnimationFrame(rafId);
				pending.clear();
				paths.dispose();
				ink.dispose();
				rows.dispose();
				for (var code of Array.from(decorated)) cleanupCode(code);
				snapshots.clear();
				style.remove();
				if (typeof CSS !== "undefined" && CSS.highlights != null) {
					for (var key of HIGHLIGHT_KEYS) CSS.highlights.delete("dshcp-" + key);
				}
			};
		}

		function apply(ctx) {
			if (typeof document === "undefined" || document.body === null) {
				if (typeof ctx.effect === "function") ctx.effect(function () { return function () {}; }, "dsh-code-pill: inline code rendering");
				return;
			}
			var store = typeof createSettingsStore === "function" ? createSettingsStore() : null;
			var fontStore = CP_FONTS.createStore();
			function settings() {
				return typeof installSettings === "function" ? installSettings(ctx, store, fontStore) : function () {};
			}
			function fonts() { return CP_FONTS.start(fontStore); }
			function render() { return startRendering(store); }
			function smoothing() { return typeof installDisplaySmoothing === "function" ? installDisplaySmoothing(ctx, store) : function () {}; }
			if (typeof ctx.effect === "function") {
				ctx.effect(settings, "dsh-code-pill: settings UI");
				ctx.effect(fonts, "dsh-code-pill: typography");
				ctx.effect(smoothing, "dsh-code-pill: display smoothing");
				ctx.effect(render, "dsh-code-pill: inline code rendering");
			} else {
				var cleanupSettings = settings();
				var cleanupRender = render();
				var cleanupFonts = fonts();
				var cleanupSmoothing = smoothing();
				if (typeof ctx.on === "function") ctx.on("dispose", function () {
					cleanupSmoothing();
					cleanupFonts();
					cleanupRender();
					cleanupSettings();
				});
			}
		}

		exports.name = "code-pill";
		exports.apply = apply;
		return module.exports;
	}
});
