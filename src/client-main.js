/**
 * dsh-code-pill — client factory 模板。
 *
 * scripts/build.mjs 把两个占位符行替换为 src/tokenizer.cjs 全文与 CSS
 * 模板字符串字面量，产出自包含的 lib/client.js。
 * 结构对齐官方 client 插件产物：window.__ModuleLoader__ 惰性 CJS factory，
 * 导出 cordis 插件对象 { name, apply }。
 *
 * 渲染策略（React 安全，零 DOM 结构修改，设计细节见 DESIGN.md §6）：
 * - MutationObserver 只读监听对话流，收集 inline code（排除 pre 内、
 *   file mention 按钮与链接化的 code）；
 * - 着色用 CSS Custom Highlight API：tokenize 出字符区间 → Range →
 *   Highlight。九个类别各持有一个持久 Highlight 对象（live 集合），
 *   每个 code 变化时只做 per-code 差量 add/delete——不做全量 rebuild，
 *   单帧成本 O(本 code 的 token 数) 而非 O(全文)；
 * - 徽章用 data-dshcp-badge 属性 + ::before 伪元素；
 * - React 管理的 code 元素只被加 class 与 data 属性，子节点永不改动，
 *   流式更新（nodeValue 赋值）经 characterData mutation 重新着色。
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

		var PLUGIN_ID = "dsh-code-pill";
		var HIGHLIGHT_KEYS = ["kwc", "kwd", "str", "com", "num", "fn", "typ", "cst", "prm"];

		function injectStyles() {
			var previous = document.querySelector('style[data-plugin-css="' + PLUGIN_ID + '"]');
			if (previous !== null) previous.remove();
			var tag = document.createElement("style");
			tag.dataset.pluginCss = PLUGIN_ID;
			tag.textContent = CSS_TEXT;
			document.head.appendChild(tag);
			return tag;
		}

		function emptyRanges() {
			return { kwc: [], kwd: [], str: [], com: [], num: [], fn: [], typ: [], cst: [], prm: [] };
		}

		function startRendering() {
			if (typeof document === "undefined" || document.body === null) return function () {};
			var highlightOk = typeof Highlight !== "undefined"
				&& typeof CSS !== "undefined" && CSS.highlights != null;
			var style = injectStyles();
			var pending = new Set();
			var codeRanges = new Map();
			var scheduled = false;
			var rafId = 0;

			// 九个持久 Highlight：注册一次，之后只做差量 add/delete。
			var highlights = null;
			if (highlightOk) {
				highlights = {};
				for (var k of HIGHLIGHT_KEYS) {
					var h = new Highlight();
					highlights[k] = h;
					CSS.highlights.set("dshcp-" + k, h);
				}
			}

			// 把 code 的旧 Range 从全部 Highlight 中摘除（code 被移除或
			// 重新着色前调用）；同时清掉文本快照——被移除的元素若日后
			// 重新插入（React 移动子树），process 必须完整重跑以重建
			// Range，不能因为快照相同而跳过。
			function dropRanges(code) {
				delete code.dataset.dshcpText;
				var old = codeRanges.get(code);
				if (old === undefined) return;
				if (highlights !== null) {
					for (var key of HIGHLIGHT_KEYS) {
						for (var range of old[key]) highlights[key].delete(range);
					}
				}
				codeRanges.delete(code);
			}

			function queue(code) {
				if (code === null || code === undefined || code.nodeType !== 1) return;
				if (code.closest("pre") !== null) return;
				if (code.closest("a, button") !== null) return;
				if (code.querySelector("button, a, svg") !== null) return;
				pending.add(code);
			}

			function process(code) {
				var text = code.textContent ?? "";
				if (code.dataset.dshcpText === text) return;
				// 先摘旧 Range 并清旧快照（dropRanges 会删 dshcpText），
				// 再写新快照——顺序反过来会让快照在 process 末尾被清掉，
				// 去重失效。
				dropRanges(code);
				code.dataset.dshcpText = text;
				code.classList.add("dshcp-pill");
				var ctx = detectInlineContext(text);
				if (ctx.badge !== null) code.dataset.dshcpBadge = ctx.badge;
				else delete code.dataset.dshcpBadge;
				var ranges = emptyRanges();
				// 先登记再着色：tokenize/createRange 中途抛异常时，已 add 的
				// Range 仍在 codeRanges 里，下次 dropRanges 能摘除；catch 保证
				// 单个 code 的异常不打断整批处理。
				codeRanges.set(code, ranges);
				if (highlights !== null && ctx.mode !== "plain" && text.length > 0) {
					var node = code.firstChild;
					if (node !== null && node.nodeType === 3 && node.textContent === text) {
						try {
							var toks = tokenizeRanges(text, ctx.mode === "shell");
							for (var t of toks) {
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
			}

			function schedule() {
				if (scheduled) return;
				scheduled = true;
				rafId = requestAnimationFrame(function () {
					scheduled = false;
					var batch = Array.from(pending);
					pending.clear();
					for (var code of batch) {
						if (code.isConnected) process(code);
						else dropRanges(code);
					}
				});
			}

			var observer = new MutationObserver(function (mutations) {
				for (var m of mutations) {
					if (m.type === "characterData") {
						var parent = m.target.parentElement;
						var owner = parent !== null && parent.closest !== undefined ? parent.closest("code") : null;
						if (owner !== null) queue(owner);
					} else if (m.type === "childList") {
						var changedCode = m.target.closest !== undefined ? m.target.closest("code") : null;
						if (changedCode !== null) queue(changedCode);
						for (var node of m.removedNodes) {
							if (node.nodeType !== 1) continue;
							if (node.tagName === "CODE") dropRanges(node);
							else if (node.querySelectorAll !== undefined) {
								for (var c of node.querySelectorAll("code")) dropRanges(c);
							}
						}
						for (var added of m.addedNodes) {
							if (added.nodeType !== 1) continue;
							if (added.tagName === "CODE") queue(added);
							else if (added.querySelectorAll !== undefined) {
								for (var c2 of added.querySelectorAll("code")) queue(c2);
							}
						}
					}
				}
				schedule();
			});

			observer.observe(document.body, { childList: true, characterData: true, subtree: true });
			for (var initial of document.body.querySelectorAll("code")) queue(initial);
			schedule();

			return function () {
				observer.disconnect();
				if (rafId) cancelAnimationFrame(rafId);
				style.remove();
				if (typeof CSS !== "undefined" && CSS.highlights != null) {
					for (var key of HIGHLIGHT_KEYS) CSS.highlights.delete("dshcp-" + key);
				}
				for (var code of codeRanges.keys()) {
					delete code.dataset.dshcpText;
					delete code.dataset.dshcpBadge;
					code.classList.remove("dshcp-pill");
				}
				codeRanges.clear();
			};
		}

		function apply(ctx) {
			if (typeof ctx.effect === "function") {
				ctx.effect(startRendering, "dsh-code-pill: inline code rendering");
			} else {
				var cleanup = startRendering();
				if (typeof ctx.on === "function") ctx.on("dispose", cleanup);
			}
		}

		exports.name = "code-pill";
		exports.apply = apply;
		return module.exports;
	}
});
