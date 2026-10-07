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

		/**
 * dsh-code-pill — inline-code tokenizer（纯函数，无依赖）。
 *
 * 把一段 inline code 文本切成带类别的区间，client 侧用 CSS Custom
 * Highlight API 着色；类别对齐 VS Code Light+/Dark+ 调色板（颜色在
 * styles.css 定义，这里只输出类别名）。
 *
 * 设计约束：inline code 是单行短文本（DSH 渲染时换行已折叠成空格），
 * 所以不做完整语法解析——一个通用扫描器 + 常用语言 keyword 合集，加
 * 命令行/文件名两个特化场景。宁可少着色，不误判结构。
 *
 * 加载形态：node 侧供测试导入（文件尾 module.exports）；浏览器侧由
 * scripts/build.mjs 把全文内联进 client factory，函数与表留在 factory
 * 作用域（window 存在时不触发 exports 赋值）。
 */

/**
 * 控制流 keyword —— VS Code Light+ #AF00DB / Dark+ #C586C0。
 * 常用语言（js/ts/py/go/rust/java/c系/sql/bash/ps/php/rb/lua/perl）取并集；
 * SQL 惯用大写，单独一张大小写敏感的声明表（KW_DECL_UPPER）。
 */
var KW_CONTROL = new Set((
  ' if else elif elsif for while do until switch case default break continue ' +
  ' return try catch finally throw yield await import export from as in of ' +
  ' new delete typeof instanceof with and or not is ' +
  ' raise ensure rescue begin end redo next when then match loop ' +
  ' select defer foreach elseif fi esac done '
).split(/\s+/));

/** 声明/类型 keyword —— VS Code Light+ #0000FF / Dark+ #569CD6。 */
var KW_DECL = new Set((
  ' function func fn def class struct enum interface trait impl type const ' +
  ' let var static get set void async this super extends implements ' +
  ' namespace declare readonly abstract public private protected final ' +
  ' lambda global nonlocal assert del pass self None True False ' +
  ' package map chan fallthrough goto ' +
  ' mut pub use mod crate dyn ref move box extern unsafe where ' +
  ' record sealed volatile transient native synchronized strictfp ' +
  ' int char float double long short signed unsigned union typedef sizeof ' +
  ' register auto inline restrict include define pragma ifdef ifndef endif undef ' +
  ' boolean byte bool string usize isize u8 u16 u32 u64 i8 i16 i32 i64 f32 f64 ' +
  ' val fun init local my our sub ' +
  ' true false null nil undefined NaN Infinity '
).split(/\s+/));

/** SQL 惯用全大写 keyword（大小写敏感，避免误伤 JS 的 `Set`/`In` 等）。 */
var KW_DECL_UPPER = new Set((
  ' SELECT FROM WHERE INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER DROP ' +
  ' JOIN LEFT RIGHT INNER OUTER FULL CROSS ON GROUP BY ORDER HAVING LIMIT OFFSET ' +
  ' UNION ALL DISTINCT AND OR NOT NULL IN EXISTS BETWEEN LIKE CASE WHEN THEN ELSE END ' +
  ' BEGIN COMMIT ROLLBACK TRANSACTION INDEX VIEW PRIMARY KEY FOREIGN REFERENCES ' +
  ' DEFAULT CHECK UNIQUE AS ASC DESC ' +
  ' INTEGER TEXT VARCHAR DATE TIME TIMESTAMP BOOLEAN BLOB REAL '
).split(/\s+/));

/**
 * 常见内建函数/全局对象：后跟 `(`（或 bash 模式下后跟空格）着函数色，
 * 裸出现不着色。print/echo/puts 这类放这里而不是 keyword 表。
 */
var BUILTIN = new Set((
  ' print println printf echo puts say warn error len range zip map filter ' +
  ' open input abs min max sum sorted enumerate isinstance ' +
  ' console log fetch setTimeout setInterval clearTimeout clearInterval ' +
  ' require module process exit die isset unset empty include require_once ' +
  ' attr_accessor library '
).split(/\s+/));

/** 命令行首词（命中则整段按 shell 规则着色：--flag 参数色、$VAR 常量色）。 */
var COMMANDS = new Set((
  ' git npm pnpm npx yarn node deno bun python python3 pip pip3 uv poetry ' +
  ' cargo rustc go javac java dotnet docker kubectl helm ' +
  ' ls cd cp mv rm mkdir rmdir touch cat grep sed awk curl wget chmod chown sudo ' +
  ' echo export source brew apt apt-get choco winget scoop ' +
  ' make cmake code pwsh powershell bash sh zsh fish ssh scp sftp tar zip unzip gzip ' +
  ' find diff patch open start tasklist taskkill where which whoami ' +
  ' Get-ChildItem Get-Content Set-Content Write-Host Test-Path Get-Process ' +
  ' Copy-Item Move-Item Remove-Item New-Item '
).split(/\s+/));

/** 扩展名 → 语言徽章缩写（Antigravity 风格的文件类型标注）。 */
var EXT_BADGE = new Map([
  ['js', 'JS'], ['mjs', 'JS'], ['cjs', 'JS'], ['jsx', 'JSX'],
  ['ts', 'TS'], ['tsx', 'TSX'], ['mts', 'TS'], ['cts', 'TS'],
  ['py', 'PY'], ['pyw', 'PY'], ['rb', 'RB'], ['go', 'GO'], ['rs', 'RS'],
  ['java', 'JAVA'], ['kt', 'KT'], ['kts', 'KT'], ['swift', 'SWIFT'],
  ['scala', 'SCALA'], ['groovy', 'GROOVY'], ['gradle', 'GROOVY'],
  ['c', 'C'], ['h', 'C'], ['cpp', 'C++'], ['cc', 'C++'], ['cxx', 'C++'],
  ['hpp', 'C++'], ['hh', 'C++'], ['hxx', 'C++'], ['cs', 'C#'],
  ['fs', 'F#'], ['fsx', 'F#'], ['vb', 'VB'], ['php', 'PHP'], ['sql', 'SQL'],
  ['pl', 'PL'], ['pm', 'PL'], ['r', 'R'], ['jl', 'JL'], ['lua', 'LUA'],
  ['ex', 'EX'], ['exs', 'EX'], ['erl', 'ERL'], ['hrl', 'ERL'], ['hs', 'HS'],
  ['clj', 'CLJ'], ['cljs', 'CLJ'], ['cljc', 'CLJ'], ['edn', 'EDN'],
  ['dart', 'DART'], ['vim', 'VIM'], ['zig', 'ZIG'], ['v', 'V'],
  ['sv', 'SV'], ['svh', 'SV'], ['vhd', 'VHDL'],
  ['sh', 'SH'], ['bash', 'SH'], ['zsh', 'SH'], ['fish', 'FISH'],
  ['ps1', 'PS'], ['psm1', 'PS'], ['psd1', 'PS'], ['bat', 'BAT'], ['cmd', 'BAT'],
  ['json', 'JSON'], ['jsonc', 'JSON'], ['json5', 'JSON'],
  ['yaml', 'YAML'], ['yml', 'YAML'], ['toml', 'TOML'], ['ini', 'INI'],
  ['cfg', 'INI'], ['conf', 'INI'], ['env', 'ENV'], ['properties', 'PROPS'],
  ['html', 'HTML'], ['htm', 'HTML'], ['xml', 'XML'], ['svg', 'SVG'],
  ['css', 'CSS'], ['scss', 'SCSS'], ['sass', 'SASS'], ['less', 'LESS'],
  ['vue', 'VUE'], ['svelte', 'SVELTE'], ['astro', 'ASTRO'],
  ['md', 'MD'], ['mdx', 'MDX'], ['markdown', 'MD'], ['rst', 'RST'],
  ['adoc', 'ADOC'], ['tex', 'TEX'], ['txt', 'TXT'], ['log', 'LOG'],
  ['csv', 'CSV'], ['tsv', 'CSV'],
  ['proto', 'PROTO'], ['graphql', 'GQL'], ['gql', 'GQL'],
  ['hcl', 'HCL'], ['tf', 'TF'], ['tfvars', 'TF'], ['nix', 'NIX'],
  ['lock', 'LOCK'], ['gitignore', 'GIT'], ['gitattributes', 'GIT'],
  ['wasm', 'WASM'], ['wat', 'WAT'], ['sol', 'SOLIDITY']
]);

/** 无扩展名的常见特殊文件名 → 徽章。 */
var SPECIAL_FILES = new Map([
  ['dockerfile', 'DOCKER'], ['makefile', 'MAKE'], ['gnumakefile', 'MAKE'],
  ['cmakelists.txt', 'CMAKE'],
  ['.gitignore', 'GIT'], ['.gitattributes', 'GIT'], ['.gitmodules', 'GIT'],
  ['.env', 'ENV'], ['.env.local', 'ENV'],
  ['.bashrc', 'SH'], ['.zshrc', 'SH'], ['.profile', 'SH'], ['.bash_profile', 'SH'],
  ['.editorconfig', 'CFG'], ['.npmrc', 'CFG'], ['.nvmrc', 'CFG'],
  ['.prettierrc', 'CFG'], ['.eslintrc', 'CFG'],
  ['license', 'TXT'], ['readme', 'MD'], ['changelog', 'MD'], ['contributing', 'MD']
]);

function isSpaceChar(c) {
  return c === undefined || c === ' ' || c === '\t';
}

/**
 * 文件名/路径检测：返回徽章缩写（如 'JS'）或 null。
 * 只认「无空白、有已知扩展名或特殊文件名」的短字符串——宁可不出徽章，
 * 不给普通标识符误贴标签。
 */
function detectBadge(src) {
  if (typeof src !== 'string') return null;
  var s = src.trim();
  if (s.length === 0 || s.length > 120 || /\s/.test(s)) return null;
  var special = SPECIAL_FILES.get(s.toLowerCase());
  if (special !== undefined) return special;
  var m = /^(?:[\w.-]+\/)*([\w.-]+)\.([a-z0-9]+)$/i.exec(s);
  if (m === null) return null;
  return EXT_BADGE.get(m[2].toLowerCase()) ?? null;
}

/** 首词是否为已知命令（决定整段是否按 shell 规则着色）。 */
function detectCommand(src) {
  if (typeof src !== 'string') return false;
  var m = /^\s*([A-Za-z][\w-]*)/.exec(src);
  return m !== null && COMMANDS.has(m[1]);
}

/**
 * 把 src 切成着色区间。
 * @param src - inline code 文本（单行）。
 * @param bash - 按 shell 规则着色（--flag 参数色、$VAR 常量色）。
 * @returns 区间数组 [{ start, end, cls }]，cls ∈ kwc|kwd|str|com|num|fn|typ|cst|prm；
 *          普通标识符与标点不着色（继承 pill 的琥珀默认色）。
 */
function tokenizeRanges(src, bash) {
  var out = [];
  if (typeof src !== 'string' || src.length === 0) return out;
  var n = src.length;
  var i = 0;
  var prevSig = '';
  while (i < n) {
    var ch = src[i];
    if (isSpaceChar(ch)) { i++; continue; }

    // ---- 注释（保守规则，避免误伤 URL/CSS 颜色/自减/命令 flag）----
    if (ch === '/' && src[i + 1] === '/' && prevSig !== ':') {
      out.push({ start: i, end: n, cls: 'com' });
      break;
    }
    if (ch === '/' && src[i + 1] === '*') {
      var closeBlock = src.indexOf('*/', i + 2);
      var blockEnd = closeBlock === -1 ? n : closeBlock + 2;
      out.push({ start: i, end: blockEnd, cls: 'com' });
      i = blockEnd;
      prevSig = '/';
      continue;
    }
    if (ch === '<' && src[i + 1] === '!' && src[i + 2] === '-' && src[i + 3] === '-') {
      var closeHtml = src.indexOf('-->', i + 4);
      var htmlEnd = closeHtml === -1 ? n : closeHtml + 3;
      out.push({ start: i, end: htmlEnd, cls: 'com' });
      i = htmlEnd;
      prevSig = '>';
      continue;
    }
    if (ch === '#' && (i === 0 || isSpaceChar(src[i - 1]))
      && (isSpaceChar(src[i + 1]) || (i === 0 && src[1] === '!'))) {
      out.push({ start: i, end: n, cls: 'com' });
      break;
    }
    if (ch === '-' && src[i + 1] === '-' && (i === 0 || isSpaceChar(src[i - 1]))
      && (isSpaceChar(src[i + 2]) || src[i + 2] === undefined)) {
      out.push({ start: i, end: n, cls: 'com' });
      break;
    }

    // ---- 字符串 ----
    if (ch === '"' || ch === "'" || ch === '`') {
      var triple = src.slice(i, i + 3);
      if (triple === '"""' || triple === "'''") {
        var closeTriple = src.indexOf(triple, i + 3);
        var tripleEnd = closeTriple === -1 ? n : closeTriple + 3;
        out.push({ start: i, end: tripleEnd, cls: 'str' });
        i = tripleEnd;
        prevSig = '"';
        continue;
      }
      var j = i + 1;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === ch) { j++; break; }
        j++;
      }
      if (j > n) j = n;
      out.push({ start: i, end: j, cls: 'str' });
      i = j;
      prevSig = ch;
      continue;
    }

    // ---- 数字（含 0x/0b/0o、小数、指数、常见后缀）----
    if ((ch >= '0' && ch <= '9') || (ch === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
      var mNum = /^(?:0[xXbBoO][0-9a-fA-F_]+|\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?)[fFuUlL]*/.exec(src.slice(i));
      var numEnd = i + (mNum !== null ? mNum[0].length : 1);
      out.push({ start: i, end: numEnd, cls: 'num' });
      i = numEnd;
      prevSig = '0';
      continue;
    }

    // ---- shell：--flag / -x 参数色 ----
    if (bash === true && ch === '-' && /[A-Za-z]/.test(src[i + 1] ?? '')) {
      var mFlag = /^--?[A-Za-z][\w-]*/.exec(src.slice(i));
      if (mFlag !== null) {
        out.push({ start: i, end: i + mFlag[0].length, cls: 'prm' });
        i += mFlag[0].length;
        prevSig = '-';
        continue;
      }
    }
    // ---- shell：$VAR 常量色 ----
    if (bash === true && ch === '$') {
      var mVar = /^\$[\w{}]+/.exec(src.slice(i));
      if (mVar !== null) {
        out.push({ start: i, end: i + mVar[0].length, cls: 'cst' });
        i += mVar[0].length;
        prevSig = ')';
        continue;
      }
    }

    // ---- 标识符 ----
    if (/[A-Za-z_$]/.test(ch)) {
      var mId = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
      var word = mId[0];
      var wordEnd = i + word.length;
      var k = wordEnd;
      while (k < n && isSpaceChar(src[k])) k++;
      var nextSig = k < n ? src[k] : '';
      var cls = null;
      if (KW_CONTROL.has(word)) cls = 'kwc';
      else if (KW_DECL_UPPER.has(word)) cls = 'kwd';
      else if (nextSig === '(') cls = 'fn';
      else if (prevSig === '.') cls = 'prm';
      else if (KW_DECL.has(word)) cls = 'kwd';
      else if (bash === true && BUILTIN.has(word) && isSpaceChar(src[wordEnd])) cls = 'fn';
      else if (BUILTIN.has(word) && nextSig === '(') cls = 'fn';
      else if (/^[A-Z][A-Z0-9_]{1,}$/.test(word)) cls = 'cst';
      else if (/^[A-Z]/.test(word)) cls = 'typ';
      if (cls !== null) out.push({ start: i, end: wordEnd, cls: cls });
      i = wordEnd;
      prevSig = word[word.length - 1];
      continue;
    }

    // ---- HTML/XML tag 名着声明色（<div、</span），尖括号本身不着 ----
    if (ch === '<' && /[A-Za-z/]/.test(src[i + 1] ?? '')) {
      var mTag = /^<\/?([A-Za-z][\w.-]*)/.exec(src.slice(i));
      if (mTag !== null) {
        var nameStart = i + (src[i + 1] === '/' ? 2 : 1);
        out.push({ start: nameStart, end: nameStart + mTag[1].length, cls: 'kwd' });
        i = nameStart + mTag[1].length;
        prevSig = '>';
        continue;
      }
    }

    // ---- 其余（运算符/标点）：不着色，继承琥珀默认 ----
    i++;
    prevSig = ch;
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports !== undefined && typeof window === 'undefined') {
  module.exports = { tokenizeRanges, detectBadge, detectCommand };
}


		`/* dsh-code-pill — Antigravity 风格 inline code + VS Code 调色板。
 *
 * 两件事：
 * 1. 代码块（shiki css-variables 主题）的 token 色换成 VS Code
 *    Light+ / Dark+ 的官方值。DSH 的 shiki 高亮器把所有 token 颜色
 *    解析到 --shiki-* 自定义属性（theme 包的 token sheets），覆盖
 *    变量即换主题，不碰渲染器。选择器特异性高于 theme 包的
 *    \`:root\` / \`body[data-ds-dark-theme]\`，保证覆盖生效。
 * 2. inline code（.dshcp-pill）的 Antigravity 风格：琥珀默认色 +
 *    文件名语言徽章（::before + data 属性）+ 语法着色
 *    （CSS Custom Highlight API，九个固定 highlight 名）。
 *    不修改任何 DOM 结构——React 管理的节点只加 class 与 data 属性。
 */

/* ---- 代码块：VS Code Light+（默认）/ Dark+（暗色主题）---- */
html:root {
  --shiki-foreground: #000000;
  --shiki-token-constant: #001080;
  --shiki-token-string: #a31515;
  --shiki-token-string-expression: #a31515;
  --shiki-token-comment: #008000;
  --shiki-token-keyword: #0000ff;
  --shiki-token-parameter: #001080;
  --shiki-token-function: #795e26;
  --shiki-token-punctuation: #000000;
  --shiki-token-link: #0000ff;
}
html body[data-ds-dark-theme] {
  --shiki-foreground: #d4d4d4;
  --shiki-token-constant: #9cdcfe;
  --shiki-token-string: #ce9178;
  --shiki-token-string-expression: #ce9178;
  --shiki-token-comment: #6a9955;
  --shiki-token-keyword: #569cd6;
  --shiki-token-parameter: #9cdcfe;
  --shiki-token-function: #dcdcaa;
  --shiki-token-punctuation: #d4d4d4;
  --shiki-token-link: #569cd6;
}

/* ---- inline code：Antigravity 琥珀默认色 + VS Code token 色 ---- */
html:root {
  --dshcp-plain: #9a6700;
  --dshcp-kwc: #af00db;
  --dshcp-kwd: #0000ff;
  --dshcp-str: #a31515;
  --dshcp-com: #008000;
  --dshcp-num: #098658;
  --dshcp-fn: #795e26;
  --dshcp-typ: #267f99;
  --dshcp-cst: #001080;
  --dshcp-prm: #001080;
  --dshcp-badge-bg: rgba(154, 103, 0, 0.12);
}
html body[data-ds-dark-theme] {
  --dshcp-plain: #d4a72c;
  --dshcp-kwc: #c586c0;
  --dshcp-kwd: #569cd6;
  --dshcp-str: #ce9178;
  --dshcp-com: #6a9955;
  --dshcp-num: #b5cea8;
  --dshcp-fn: #dcdcaa;
  --dshcp-typ: #4ec9b0;
  --dshcp-cst: #9cdcfe;
  --dshcp-prm: #9cdcfe;
  --dshcp-badge-bg: rgba(212, 167, 44, 0.16);
}

/* pill 外观（底色/边框/圆角/字体沿用 DSH 原有 inline code 样式，只接管文字色） */
code.dshcp-pill {
  color: var(--dshcp-plain);
}

/* 文件名语言徽章：data 属性 + ::before，不插入任何节点 */
code.dshcp-pill[data-dshcp-badge]::before {
  content: attr(data-dshcp-badge);
  flex: 0 0 auto;
  font-size: 0.72em;
  font-weight: 700;
  line-height: 1;
  padding: 2px 4px;
  margin-right: 5px;
  border-radius: 3px;
  letter-spacing: 0.02em;
  background: var(--dshcp-badge-bg);
  color: var(--dshcp-plain);
  user-select: none;
}

/* inline code 语法着色（CSS Custom Highlight API；变量从宿主元素继承） */
::highlight(dshcp-kwc) { color: var(--dshcp-kwc); }
::highlight(dshcp-kwd) { color: var(--dshcp-kwd); }
::highlight(dshcp-str) { color: var(--dshcp-str); }
::highlight(dshcp-com) { color: var(--dshcp-com); font-style: italic; }
::highlight(dshcp-num) { color: var(--dshcp-num); }
::highlight(dshcp-fn) { color: var(--dshcp-fn); }
::highlight(dshcp-typ) { color: var(--dshcp-typ); }
::highlight(dshcp-cst) { color: var(--dshcp-cst); }
::highlight(dshcp-prm) { color: var(--dshcp-prm); }
`

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
				if (code.querySelector("button, a, svg") !== null) return;
				pending.add(code);
			}

			function process(code) {
				var text = code.textContent ?? "";
				if (code.dataset.dshcpText === text) return;
				code.dataset.dshcpText = text;
				code.classList.add("dshcp-pill");
				var badge = detectBadge(text);
				if (badge !== null) code.dataset.dshcpBadge = badge;
				else delete code.dataset.dshcpBadge;
				var ranges = emptyRanges();
				if (highlightOk && text.length > 0) {
					var node = code.firstChild;
					if (node !== null && node.nodeType === 3 && node.textContent === text) {
						var bash = detectCommand(text);
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
