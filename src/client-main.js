/**
 * dsh-code-pill — client factory 模板。
 *
 * scripts/build.mjs 把两个占位符行替换为 src/tokenizer.cjs 全文与 CSS
 * 模板字符串字面量，产出自包含的 lib/client.js。
 * 结构对齐官方 client 插件产物：window.__ModuleLoader__ 惰性 CJS factory，
 * 导出 cordis 插件对象 { name, apply }。
 *
 * 渲染策略（React 安全，零 DOM 结构修改）：
 * - MutationObserver 只读监听对话流，收集 inline code（排除 pre 内、
 *   file mention 按钮与链接化的 code）；
 * - 着色用 CSS Custom Highlight API：tokenize 出字符区间 → Range →
 *   Highlight，注册到九个固定 highlight 名，由 ::highlight() 规则上色；
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
			var dirty = false;
			var rafId = 0;

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
				code.dataset.dshcpText = text;
				code.classList.add("dshcp-pill");
				delete code.dataset.dshcpBadge;
				var mode = detectInlineMode(text);
				var ranges = emptyRanges();
				if (highlightOk && mode !== "plain" && text.length > 0) {
					var node = code.firstChild;
					if (node !== null && node.nodeType === 3 && node.textContent === text) {
						var bash = mode === "shell";
						var toks = tokenizeRanges(text, bash);
						for (var t of toks) {
							var range = document.createRange();
							range.setStart(node, t.start);
							range.setEnd(node, t.end);
							ranges[t.cls].push(range);
						}
					}
				}
				codeRanges.set(code, ranges);
				dirty = true;
			}

			function rebuild() {
				if (!highlightOk) return;
				var merged = emptyRanges();
				for (var ranges of codeRanges.values()) {
					for (var key of HIGHLIGHT_KEYS) {
						if (ranges[key].length > 0) merged[key].push(...ranges[key]);
					}
				}
				for (var key2 of HIGHLIGHT_KEYS) {
					CSS.highlights.set("dshcp-" + key2, new Highlight(...merged[key2]));
				}
			}

			function schedule() {
				if (scheduled) return;
				scheduled = true;
				rafId = requestAnimationFrame(function () {
					scheduled = false;
					var batch = Array.from(pending);
					pending.clear();
					for (var code of batch) process(code);
					if (dirty) { rebuild(); dirty = false; }
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
							if (node.tagName === "CODE") { if (codeRanges.delete(node)) dirty = true; }
							else if (node.querySelectorAll !== undefined) {
								for (var c of node.querySelectorAll("code")) { if (codeRanges.delete(c)) dirty = true; }
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
				if (highlightOk && typeof CSS !== "undefined" && CSS.highlights != null) {
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
