var CP_FONTS = (function () {
		var PLUGIN_ID = "dsh-code-pill-fonts";
		var STORAGE_KEY = "dsh-code-pill.fonts.v1";

		// ── 部位槽位（高级用；变量名取自核心实际使用的排版令牌）──────────────────

		/** 角色级：决定整块 UI 的默认字体。 */
		var ROLE_SLOTS = [
			{ name: "--dsh-font-family-text", label: "界面与会话正文", hint: "整个 UI 的默认字体（核心 --dsw-font-family 由它派生）" },
			{ name: "--dsh-font-family-code", label: "代码与工具输出", hint: "代码块、行内代码、工具输出的等宽字体" },
			{ name: "--dsh-font-family-terminal", label: "侧栏终端", hint: "侧边栏终端单元格字体" },
			{ name: "--dsw-font-family-brand", label: "品牌字样", hint: "品牌标题类文本" },
			{ name: "--dsw-font-mono", label: "第三方等宽兜底", hint: "插件里写 var(--dsw-font-mono) 的位置" },
		];

		/** 字号档位：核心每个档位都有独立 font-family 令牌。 */
		var SIZE_SLOTS = [
			{ name: "--dsw-font-xxxs-11-font-family", label: "11px 微字" },
			{ name: "--dsw-font-xxxs-strong-11-font-family", label: "11px 微字 · 加粗" },
			{ name: "--dsw-font-xxs-12-font-family", label: "12px 次要" },
			{ name: "--dsw-font-xxs-strong-12-font-family", label: "12px 次要 · 加粗" },
			{ name: "--dsw-font-xs-13-font-family", label: "13px 常规" },
			{ name: "--dsw-font-xs-strong-13-font-family", label: "13px 常规 · 加粗" },
			{ name: "--dsw-font-s-14-font-family", label: "14px 小正文" },
			{ name: "--dsw-font-s-strong-14-font-family", label: "14px 小正文 · 加粗" },
			{ name: "--dsw-font-base-16-font-family", label: "16px 正文" },
			{ name: "--dsw-font-base-strong-16-font-family", label: "16px 正文 · 加粗" },
			{ name: "--dsw-font-m-18-font-family", label: "18px 小标题" },
			{ name: "--dsw-font-l-20-font-family", label: "20px 标题" },
			{ name: "--dsw-font-xl-24-font-family", label: "24px 大标题" },
		];

		/** Markdown：会话内容的逐级字体。 */
		var MARKDOWN_SLOTS = [
			{ name: "--dsw-font-markdown-base-font-family", label: "正文" },
			{ name: "--dsw-font-markdown-base-strong-font-family", label: "正文 · 加粗" },
			{ name: "--dsw-font-markdown-base-italic-font-family", label: "正文 · 斜体" },
			{ name: "--dsw-font-markdown-base-strong-italic-font-family", label: "正文 · 粗斜体" },
			{ name: "--dsw-font-markdown-small-font-family", label: "小字" },
			{ name: "--dsw-font-markdown-small-strong-font-family", label: "小字 · 加粗" },
			{ name: "--dsw-font-markdown-small-italic-font-family", label: "小字 · 斜体" },
			{ name: "--dsw-font-markdown-small-strong-italic-font-family", label: "小字 · 粗斜体" },
			{ name: "--dsw-font-markdown-h1-font-family", label: "一级标题" },
			{ name: "--dsw-font-markdown-h2-font-family", label: "二级标题" },
			{ name: "--dsw-font-markdown-h3-font-family", label: "三级标题" },
			{ name: "--dsw-font-markdown-h4-font-family", label: "四级标题" },
			{ name: "--dsw-font-markdown-code-font-family", label: "行内代码" },
			{ name: "--dsw-font-markdown-code-block-font-family", label: "代码块" },
			{ name: "--dsw-font-markdown-code-block-small-font-family", label: "小号代码块" },
			{ name: "--dsw-font-markdown-table-font-family", label: "表格" },
			{ name: "--dsw-font-markdown-table-head-font-family", label: "表头" },
		];

		/** 可选的界面缩放百分比。 */
		var UI_SCALES = [100, 110, 120, 130, 140];

		/** 会话正文字号允许范围（与核心 ui-theme 的 10–22 对齐）。 */
		var CONTENT_SIZE_MIN = 10;
		var CONTENT_SIZE_MAX = 22;
		/** 核心默认的会话正文字号（px）。 */
		var FONT_CONTENT_DEFAULT = 14;

		/** CSS 通用族关键字与继承关键字，不能加引号。 */
		var GENERIC = new Set([
			"serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui",
			"ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "emoji", "math",
			"fangsong", "-apple-system", "blinkmacsystemfont",
			"inherit", "initial", "unset", "revert", "revert-layer",
		]);

		// ── 状态 ────────────────────────────────────────────────────────────

		function normalizeState(raw) {
			var source = raw !== null && typeof raw === "object" ? raw : {};
            var vars = {};
            ROLE_SLOTS.concat(SIZE_SLOTS, MARKDOWN_SLOTS).forEach(function (slot) {
                var entry = source.vars && source.vars[slot.name];
                if (entry && typeof entry === 'object') vars[slot.name] = { on: entry.on === true, stack: typeof entry.stack === 'string' ? entry.stack : '' };
            });
			return {
				master: source.master === undefined ? true : source.master === true,
				uiScale: typeof source.uiScale === "number" && isFinite(source.uiScale) && source.uiScale >= 80 && source.uiScale <= 160 ? source.uiScale : 100,
				contentSize: typeof source.contentSize === "string" ? source.contentSize : "",
				globalFamily: typeof source.globalFamily === "string" ? source.globalFamily : "",
				globalMono: typeof source.globalMono === "string" ? source.globalMono : "",
				vars: vars,
				rules: Array.isArray(source.rules) ? source.rules.filter(function (rule) { return rule && typeof rule === 'object'; }).map(function (rule, index) { return { id: 'r' + index, on: rule.on === true, selector: typeof rule.selector === 'string' ? rule.selector : '', stack: typeof rule.stack === 'string' ? rule.stack : '' }; }) : [],
			};
		}

        var loadError = '';
		/** 读取持久化状态（损坏或缺失时回退为默认状态并反馈）。 */
		function loadState() {
			try {
				var raw = window.localStorage.getItem(STORAGE_KEY);
				if (raw === null) raw = window.localStorage.getItem("dsh-font-lab/v1");
				if (raw === null) return normalizeState(null);
				return normalizeState(JSON.parse(raw));
			} catch (error) {
                loadError = '字体配置无法读取，当前使用默认值：' + error.message;
				return normalizeState(null);
			}
		}

		// ── 纯函数 ──────────────────────────────────────────────────────────

		/** 按顶层逗号切分：括号内与引号内的逗号属于同一个值（var(--x, sans-serif)）。 */
		function splitTopLevel(input) {
			var parts = [];
			var current = "";
			var depth = 0;
			var quote = "";
			for (var i = 0; i < input.length; i += 1) {
				var ch = input.charAt(i);
				if (quote !== "") {
					current += ch;
					if (ch === quote) quote = "";
					continue;
				}
				if (ch === '"' || ch === "'") {
					quote = ch;
					current += ch;
					continue;
				}
				if (ch === "(") depth += 1;
				else if (ch === ")") depth = depth > 0 ? depth - 1 : 0;
				if (ch === "," && depth === 0) {
					parts.push(current);
					current = "";
					continue;
				}
				current += ch;
			}
			parts.push(current);
			return parts;
		}

		/** 把一个逗号分隔的字体输入规范成安全的 CSS font-family 列表。 */
		function normalizeStack(input) {
			var source = String(input === undefined || input === null ? "" : input);
            if (/[<>{};\n\r\\]|\/\*|\*\//.test(source)) return '';
			return splitTopLevel(source)
				.map(function (raw) { return raw.trim(); })
				.filter(function (raw) { return raw !== ""; })
				.map(function (raw) {
					// var()/env() 之类函数值与已加引号的族名原样保留（只清理结构性字符）。
					if (/^(var|env)\(/i.test(raw) || raw.charAt(0) === '"' || raw.charAt(0) === "'") {
						return raw.replace(/[<>{};]/g, "").trim();
					}
					var bare = raw.replace(/["'<>{};]/g, "").replace(/\s+/g, " ").trim();
					if (bare === "") return "";
					return GENERIC.has(bare.toLowerCase()) ? bare : '"' + bare + '"';
				})
				.filter(function (raw) { return raw !== ""; })
				.join(", ");
		}

		/** 选择器只做结构性清理：去掉会截断规则块的字符。 */
		function normalizeSelector(input) {
            var value = String(input === undefined || input === null ? '' : input).trim();
            if (/[{};@\\\n\r]|\/\*|\*\//.test(value)) return '';
            if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
                try { document.querySelector(value); } catch (error) { return ''; }
            }
            return value;
		}

		/**
		 * 由状态生成注入用的 CSS 文本。
		 *
		 * 顺序即优先级：先写全局基座（界面/代码/终端），再逐条写高级槽位——同名变量后者覆盖前者，
		 * 所以「高级」永远压过「全局」。!important 是必需的：核心 ui-theme 的 boot 脚本把角色
		 * 变量写在 body 的行内样式上，普通样式表声明会被行内声明压过。
		 */
		function buildCss(state) {
			var normalized = normalizeState(state);
			if (normalized.master !== true) return "";

			var declarations = [];
			var index = Object.create(null);
			var put = function (name, line) {
				if (index[name] !== undefined) declarations[index[name]] = line;
				else {
					index[name] = declarations.length;
					declarations.push(line);
				}
			};
			/** 字体族类声明：值先规范化成安全的 font-family 列表。 */
			var pushFamily = function (name, value) {
				var stack = normalizeStack(value);
				if (stack === "") return;
				put(name, "  " + name + ": " + stack + " !important;");
                // Host components consume the font shorthand, not only its family field.
                // Recompose using the host's existing size/weight/style/line-height tokens.
                if (SIZE_SLOTS.concat(MARKDOWN_SLOTS).some(function (slot) { return slot.name === name; })) {
                    var base = name.slice(0, -'-font-family'.length);
                    put(base, '  ' + base + ': var(' + base + '-font-style, normal) var(' + base + '-font-weight, 400) var(' + base + '-font-size) / var(' + base + '-line-height) var(' + name + ') !important;');
                }
			};
			/** 原样声明：用于 font 简写与长度值，不做字体族引号处理。 */
			var pushRaw = function (name, value) {
				put(name, "  " + name + ": " + value + " !important;");
			};

			// 1) 全局：正文基座（所有档位与 Markdown 都引用它）与等宽基座。
			pushFamily("--dsh-font-family-text", normalized.globalFamily);
			pushFamily("--dsh-font-family-code", normalized.globalMono);
			pushFamily("--dsh-font-family-terminal", normalized.globalMono);
			pushFamily("--dsw-font-mono", normalized.globalMono);

			// 2) 高级：逐部位覆盖（同名时压过全局）。
			Object.keys(normalized.vars).forEach(function (name) {
				var entry = normalized.vars[name];
				if (!entry || entry.on !== true) return;
				if (ROLE_SLOTS.concat(SIZE_SLOTS, MARKDOWN_SLOTS).some(function (slot) { return slot.name === name; })) pushFamily(name, entry.stack);
			});

			// 3) 会话正文字号：Markdown 各级按 delta 自动跟随这个变量。
			var contentSize = Number(normalized.contentSize);
			if (normalized.contentSize !== "" && isFinite(contentSize) && contentSize >= CONTENT_SIZE_MIN && contentSize <= CONTENT_SIZE_MAX) {
				pushRaw("--dsh-content-font-size", contentSize + "px");
			}

			var blocks = [];
			if (declarations.length > 0) {
				blocks.push(":root,\nbody {\n" + declarations.join("\n") + "\n}");
			}

			// 4) 界面整体缩放：用 CSS zoom 放大页面布局，不等同浏览器缩放。
			//    不能靠改写字号令牌——核心大量组件用硬编码 px，只有少数位置引用
			//    --dsw-font-* 档位，改写令牌会出现「只放大了左下角一块」的结果。
			var scale = Number(normalized.uiScale);
			if (isFinite(scale) && scale >= 80 && scale <= 160 && scale !== 100) {
				blocks.push("html {\n  zoom: " + (scale / 100) + " !important;\n}");
			}

			// 3) 高级：任意选择器规则。
			normalized.rules.forEach(function (rule) {
				if (!rule || rule.on !== true) return;
				var selector = normalizeSelector(rule.selector);
				var stack = normalizeStack(rule.stack);
				if (selector === "" || stack === "") return;
				blocks.push(selector + " {\n  font-family: " + stack + " !important;\n}");
			});

			return blocks.join("\n\n");
		}

		function entryOf(state, name) {
			var entry = state.vars ? state.vars[name] : undefined;
			return entry && typeof entry === "object" ? { on: entry.on === true, stack: typeof entry.stack === "string" ? entry.stack : "" } : { on: false, stack: "" };
		}

		function withVar(state, name, patch) {
			var current = entryOf(state, name);
			var next = { on: current.on, stack: current.stack };
			Object.keys(patch).forEach(function (key) { next[key] = patch[key]; });
			var vars = {};
			Object.keys(state.vars || {}).forEach(function (key) { vars[key] = state.vars[key]; });
			vars[name] = next;
			return normalizeState({
				uiScale: state.uiScale, contentSize: state.contentSize,
				master: state.master,
				globalFamily: state.globalFamily,
				globalMono: state.globalMono,
				vars: vars,
				rules: state.rules,
			});
		}


function createStore() {
  loadError = '';
  var current = loadState(), listeners = new Set(), error = loadError;
  function notify() { listeners.forEach(function (cb) { cb(); }); }
  function onStorage(event) {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    try { current = event.newValue === null ? normalizeState(null) : normalizeState(JSON.parse(event.newValue)); error = ''; notify(); }
    catch (err) { error = '其他窗口的字体配置无效：' + err.message; current = normalizeState(current); notify(); }
  }
  return {
    getSnapshot: function () { return current; }, getError: function () { return error; },
    subscribe: function (cb) {
      if (!listeners.size && typeof window.addEventListener === 'function') window.addEventListener('storage', onStorage);
      listeners.add(cb);
      return function () { listeners.delete(cb); if (!listeners.size && typeof window.removeEventListener === 'function') window.removeEventListener('storage', onStorage); };
    },
    save: function (input) {
      var next = normalizeState(input);
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); error = ''; }
      catch (err) { error = '字体已在本页应用，但保存失败：' + err.message; }
      current = next; notify();
    }
  };
}
function start(store) {
  var tag = document.createElement('style'); tag.dataset.pluginCss = PLUGIN_ID;
  (document.head || document.body).appendChild(tag);
  function update() { var css = buildCss(store.getSnapshot()); if (tag.textContent !== css) tag.textContent = css; }
  update(); var off = store.subscribe(update);
  return function () { off(); tag.remove(); };
}
return { createStore: createStore, start: start, normalizeState: normalizeState, normalizeStack: normalizeStack, buildCss: buildCss, withVar: withVar,
 ROLE_SLOTS: ROLE_SLOTS, SIZE_SLOTS: SIZE_SLOTS, MARKDOWN_SLOTS: MARKDOWN_SLOTS,
 splitTopLevel: splitTopLevel, entryOf: entryOf, normalizeSelector: normalizeSelector,
 UI_SCALES: UI_SCALES,
 CONTENT_SIZE_MIN: CONTENT_SIZE_MIN, CONTENT_SIZE_MAX: CONTENT_SIZE_MAX, FONT_CONTENT_DEFAULT: FONT_CONTENT_DEFAULT };

})();
if (typeof module !== "undefined" && module.exports) module.exports.CP_FONTS = CP_FONTS;
