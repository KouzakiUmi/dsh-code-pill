/**
 * dsh-code-pill — client factory 模板。
 * build 内联 tokenizer、CSS 与 settings core/UI，产出自包含 lib/client.js。
 * React 安全：只修改 code 的 class/data 属性，子节点永不插入/替换。
 * token 用持久 CSS Highlight 集合与 per-code Range 差量更新。
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

		var PLUGIN_ID = "dsh-code-pill";
		var HIGHLIGHT_KEYS = ["kwc", "kwd", "str", "com", "num", "fn", "typ", "cst", "prm"];
		var CONFIG_BADGES = new Set(["JSON", "YAML", "TOML", "INI", "ENV", "CFG", "PROPS"]);

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
				code.classList.remove("dshcp-pill");
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
				decorated.add(code);
				var inline = detectInlineContext(text);
				var marker = config.marker;
				if ((marker === "label" || marker === "both") && inline.badge !== null) {
					code.dataset.dshcpBadge = inline.badge;
				} else delete code.dataset.dshcpBadge;
				if ((marker === "icon" || marker === "both") && inline.badge !== null) {
					code.dataset.dshcpIcon = CONFIG_BADGES.has(inline.badge) ? "config" : "file";
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
				if (disposed || scheduled || pending.size === 0) return;
				scheduled = true;
				rafId = requestAnimationFrame(function () {
					scheduled = false;
					rafId = 0;
					var batch = Array.from(pending);
					pending.clear();
					for (var code of batch) process(code);
				});
			}

			function visitCodes(node, callback) {
				if (node.nodeType !== 1) return;
				if (node.tagName === "CODE") callback(node);
				for (var code of node.querySelectorAll("code")) callback(code);
			}

			var observer = new MutationObserver(function (mutations) {
				for (var m of mutations) {
					if (m.type === "characterData") {
						var parent = m.target.parentElement;
						var owner = parent !== null ? parent.closest("code") : null;
						if (owner !== null) queue(owner);
					} else if (m.type === "childList") {
						var changedCode = m.target.closest !== undefined ? m.target.closest("code") : null;
						if (changedCode !== null) queue(changedCode, true);
						for (var node of m.removedNodes) visitCodes(node, cleanupCode);
						for (var added of m.addedNodes) visitCodes(added, function (code) { queue(code, true); });
					}
				}
				schedule();
			});

			function configure() {
				if (disposed) return;
				var next = store && typeof store.getSnapshot === "function" ? store.getSnapshot() : null;
				config = typeof CP_SETTINGS !== "undefined" ? CP_SETTINGS.normalize(next)
					: { syntax: true, marker: "label" };
				style.textContent = CSS_TEXT + "\n" + (typeof CP_SETTINGS !== "undefined" ? CP_SETTINGS.css(config) : "");
				// 配置变化强制重跑：syntax=false 立即摘除 Range，pill 始终保留。
				for (var code of Array.from(decorated)) {
					dropRanges(code);
					if (!eligible(code)) cleanupCode(code);
				}
				for (var initial of root.querySelectorAll("code")) queue(initial, true);
				schedule();
			}

			configure();
			observer.observe(root, { childList: true, characterData: true, subtree: true });
			if (store && typeof store.subscribe === "function") off = store.subscribe(configure);

			return function () {
				if (disposed) return;
				disposed = true;
				off();
				observer.disconnect();
				if (rafId) cancelAnimationFrame(rafId);
				pending.clear();
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
			if (typeof ctx.effect === "function") {
				ctx.effect(settings, "dsh-code-pill: settings UI");
				ctx.effect(fonts, "dsh-code-pill: typography");
				ctx.effect(render, "dsh-code-pill: inline code rendering");
			} else {
				var cleanupSettings = settings();
				var cleanupRender = render();
				var cleanupFonts = fonts();
				if (typeof ctx.on === "function") ctx.on("dispose", function () {
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
