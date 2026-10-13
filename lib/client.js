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

		/**
 * dsh-code-pill — inline-code tokenizer（纯函数，无依赖）。
 *
 * 把一段 inline code 文本切成带类别的区间，client 侧用 CSS Custom
 * Highlight API 着色。这里只输出类别名（kwc|kwd|str|com|num|fn|typ|cst|prm），
 * 颜色全部在 styles.css 定义——类别与色值的映射关系见 DESIGN.md §3，
 * 本文件的注释不写具体色值，避免双源漂移。
 *
 * 设计约束：inline code 是单行短文本（DSH 渲染时换行已折叠成空格），
 * 所以不做完整语法解析——一个通用扫描器 + 常用语言 keyword 合集，加
 * 命令行/文件名两个特化场景。宁可少着色，不误判结构（DESIGN.md §5）。
 *
 * 加载形态：node 侧供测试导入（文件尾 module.exports）；浏览器侧由
 * scripts/build.mjs 把全文内联进 client factory，函数与表留在 factory
 * 作用域（window 存在时不触发 exports 赋值）。
 */

/**
 * 控制流 keyword（kwc）。
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

/** 声明/类型 keyword（kwd）。 */
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
  // 限定路径字符，排除调用、赋值、URL、算术表达式；允许中文与 Windows 分隔符。
  var path = s.replace(/\\/g, '/');
  if (/^[a-z]:\//i.test(path)) path = path.slice(3);
  else if (path.startsWith('//')) path = path.slice(2);
  else if (path.startsWith('/')) path = path.slice(1);
  if (!/^(?:[\p{L}\p{N}_.~-]+\/)*[\p{L}\p{N}_.~-]+$/u.test(path)) return null;
  var basename = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  var special = SPECIAL_FILES.get(basename);
  if (special !== undefined) return special;
  var m = /\.([a-z0-9]+)$/i.exec(basename);
  return m === null ? null : EXT_BADGE.get(m[1]) ?? null;
}

/** 首词是否为已知命令（决定整段是否按 shell 规则着色）。 */
function detectCommand(src) {
  if (typeof src !== 'string') return false;
  var m = /^\s*([A-Za-z][\w-]*)/.exec(src);
  return m !== null && COMMANDS.has(m[1]) && (src[m[0].length] === undefined || /\s/.test(src[m[0].length]));
}

// 行内文字先判语境，避免把路径、文件名、术语当作表达式拆色。
// badge 可选传入（detectInlineContext 已算过时复用），缺省内部自算。
function detectInlineMode(src, badge) {
  if (typeof src !== 'string') return 'plain';
  var s = src.trim();
  if (badge === undefined) badge = detectBadge(s);
  if (!s || badge !== null || /^(?:[a-z][\w+.-]*:\/\/|[a-z]:[\\/]|\\\\|\.{0,2}\/)/i.test(s)) return 'plain';
  if (/^[\w.@~+-]+(?:[\\/][\w.@~+-]+)+$/.test(s)) return 'plain';
  if (detectCommand(s) && /\s+\S/.test(s)) return 'shell';
  if (/^[\w.$-]+$/.test(s) || /^#[\da-f]{3,8}$/i.test(s)) return 'plain';
  if (/[A-Za-z_$][\w.$]*\s*\(/.test(s) || /(?:=>|(?<![=!<>])=(?!=))/.test(s)
    || /^(?:const|let|var|function|class|def|return|if|for|SELECT|INSERT|UPDATE)\s+/.test(s)) return 'code';
  return 'plain';
}

/**
 * tokenizer 对外唯一入口（DESIGN.md §5）：一次计算返回
 * { mode: 'plain'|'shell'|'code', badge: string|null }。
 * badge 命中（文件名）时 mode 恒为 'plain'——文件名永远不拆色。
 */
function detectInlineContext(src) {
  var badge = detectBadge(src);
  return { mode: detectInlineMode(src, badge), badge: badge };
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
    if (bash === true && ch === '-' && (i === 0 || isSpaceChar(src[i - 1]))) {
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
      if (prevSig === '.') cls = nextSig === '(' ? 'fn' : 'prm';
      else if (KW_CONTROL.has(word)) cls = 'kwc';
      else if (KW_DECL_UPPER.has(word)) cls = 'kwd';
      else if (nextSig === '(') cls = 'fn';
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
  module.exports = { tokenizeRanges, detectBadge, detectCommand, detectInlineMode, detectInlineContext };
}


		var CSS_TEXT = `/* All palette values are generated from settings-core.cjs, the sole colour source. */
html body code.dshcp-pill {
  color: var(--dshcp-plain) !important;
  background: var(--dshcp-bg) !important;
  border: none !important;
  box-shadow: none !important;
  border-radius: var(--dshcp-radius) !important;
  padding: 0.08em var(--dshcp-padding) !important;
  font-size: var(--dshcp-font-scale) !important;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}
code.dshcp-pill[data-dshcp-badge]:not([data-dshcp-icon])::before,
code.dshcp-pill[data-dshcp-badge][data-dshcp-icon]::after {
  content: attr(data-dshcp-badge);
  font-size: 0.78em;
  font-weight: 650;
  line-height: 1;
  padding: 1px 3px;
  border-radius: 3px;
  letter-spacing: 0.02em;
  vertical-align: 0.04em;
  background: var(--dshcp-badge-bg);
  color: var(--dshcp-badge-text);
  user-select: none;
}
code.dshcp-pill[data-dshcp-badge]:not([data-dshcp-icon])::before { margin-right: 0.4em; }
code.dshcp-pill[data-dshcp-badge][data-dshcp-icon]::after { margin-left: 0.4em; }
code.dshcp-pill[data-dshcp-icon]::before {
  content: '';
  display: inline-block;
  width: 0.9em;
  height: 0.95em;
  margin-right: 0.25em;
  vertical-align: -0.12em;
  background: currentColor;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='none' stroke='black' stroke-width='1.4' stroke-linejoin='round' d='M3 1.5h6l4 4v9H3z M9 1.5v4h4 M5.5 8h5 M5.5 10.5h5'/%3E%3C/svg%3E") center / contain no-repeat;
}
::highlight(dshcp-kwc) { color: var(--dshcp-kwc); }
::highlight(dshcp-kwd) { color: var(--dshcp-kwd); }
::highlight(dshcp-str) { color: var(--dshcp-str); }
::highlight(dshcp-com) { color: var(--dshcp-com); }
::highlight(dshcp-num) { color: var(--dshcp-num); }
::highlight(dshcp-fn) { color: var(--dshcp-fn); }
::highlight(dshcp-typ) { color: var(--dshcp-typ); }
::highlight(dshcp-cst) { color: var(--dshcp-cst); }
::highlight(dshcp-prm) { color: var(--dshcp-prm); }

/* Settings use host design tokens; no remote assets or bundled fonts. */
.dshcp-settings { color: var(--dsw-alias-label-primary, inherit); max-width: 820px; padding: 8px 4px 20px; }
.dshcp-settings * { box-sizing: border-box; }
.dshcp-settings-header, .dshcp-section-heading, .dshcp-control-row, .dshcp-settings-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.dshcp-settings h2 { margin: 0; font-size: 22px; font-weight: 650; letter-spacing: -.02em; }
.dshcp-settings h3 { margin: 0 0 12px; font-size: 14px; font-weight: 650; }
.dshcp-settings-header p { margin: 6px 0 18px; }
.dshcp-hint, .dshcp-settings-header p, .dshcp-control-row small { color: var(--dsw-alias-label-secondary, #757575); font-size: 12px; line-height: 1.6; }
.dshcp-local-tag { font-size: 10px; padding: 3px 7px; border-radius: 6px; color: var(--dsw-alias-label-secondary, #757575); background: var(--dsw-alias-bg-layer-1, #8881); white-space: nowrap; }
.dshcp-panel { padding: 16px; border: 1px solid var(--dsw-alias-border-l4, #8883); border-radius: 12px; margin-bottom: 14px; }
.dshcp-panel > .dshcp-hint { margin: 0 0 12px; }
.dshcp-preset-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; }
.dshcp-preset { padding: 12px; border: 1px solid var(--dsw-alias-border-l4, #8884); border-radius: 8px; text-align: left; color: inherit; background: var(--dsw-alias-bg-layer-1, transparent); cursor: pointer; }
.dshcp-preset[aria-pressed='true'] { border-color: var(--dsw-alias-brand-primary, #916200); box-shadow: inset 0 0 0 1px var(--dsw-alias-brand-primary, #916200); }
.dshcp-preset:hover { background: var(--dsw-alias-bg-layer-2, #8881); }
.dshcp-preset strong { display: block; font-size: 12px; margin: 9px 0 4px; }
.dshcp-preset small { display: block; font-size: 10px; line-height: 1.5; color: var(--dsw-alias-label-secondary, #757575); }
.dshcp-swatches { display: flex; gap: 5px; }
.dshcp-swatches i { width: 14px; height: 14px; border-radius: 50%; }
.dshcp-theme-toggle, .dshcp-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.dshcp-section-heading h3 { margin-bottom: 0; }
.dshcp-section-heading { margin-bottom: 12px; }
.dshcp-preview { border: 1px solid #8883; border-radius: 8px; padding: 14px 16px; margin-bottom: 16px; font-size: 14px; line-height: 1.8; overflow-wrap: anywhere; }
.dshcp-preview-caption { font-size: 10px; opacity: .7; margin-bottom: 10px; }
.dshcp-preview p { margin: 8px 0; }
.dshcp-preview-block { background: #8881; padding: 10px; border-radius: 6px; font-size: 12px; white-space: pre-wrap; margin: 12px 0 0; }
.dshcp-color-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(140px,1fr)); gap: 12px; }
.dshcp-color-field > span { display: block; font-size: 11px; margin-bottom: 5px; }
.dshcp-color-field > div { display: flex; align-items: center; gap: 7px; }
.dshcp-color-field input[type='color'] { appearance: none; border: 1px solid var(--dsw-alias-border-l4, #8884); border-radius: 6px; background: transparent; padding: 2px; width: 30px; height: 30px; flex-shrink: 0; cursor: pointer; }
.dshcp-color-field input:not([type='color']) { min-width: 0; width: 100%; font-size: 12px; }
.dshcp-warning { color: var(--dsw-alias-state-warning-primary, inherit); font-size: 12px; line-height: 1.7; margin-bottom: 0; }
.dshcp-control-row { padding: 10px 0; font-size: 12px; }
.dshcp-control-row small { display: block; }
.dshcp-settings select { color: inherit; background: var(--dsw-alias-bg-layer-1, transparent); border: 1px solid var(--dsw-alias-border-l4, #8884); padding: 6px 8px; border-radius: 6px; font: inherit; max-width: 65%; }
.dshcp-slider-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px 20px; padding: 14px 0; }
.dshcp-slider > span { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 6px; }
.dshcp-slider output { color: var(--dsw-alias-label-secondary, #757575); }
.dshcp-slider input { width: 100%; accent-color: var(--dsw-alias-brand-primary, #916200); }
.dshcp-settings summary { cursor: pointer; font-size: 12px; font-weight: 600; }
.dshcp-settings textarea { width: 100%; min-height: 140px; resize: vertical; color: inherit; background: var(--dsw-alias-bg-layer-1, transparent); border: 1px solid var(--dsw-alias-border-l4, #8884); border-radius: 6px; padding: 10px; margin: 10px 0; font: inherit; font-size: 12px; }
.dshcp-settings-toolbar { padding: 12px; margin-bottom: 14px; background: var(--dsw-alias-bg-layer-1, Canvas); border: 1px solid var(--dsw-alias-border-l4, #8883); border-radius: 8px; flex-wrap: wrap; }
.dshcp-settings :focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #916200); outline-offset: 3px; }
@media (max-width: 480px) { .dshcp-preset-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } .dshcp-panel { padding: 12px; } .dshcp-slider-grid { grid-template-columns: 1fr; } .dshcp-settings-header { align-items: flex-start; } }
@media (forced-colors: active) { code.dshcp-pill { outline: 1px solid CanvasText; } .dshcp-preset[aria-pressed='true'] { outline: 2px solid Highlight; } }

/*
 * dsh-font-lab — 设置页「字体」区块的样式。
 * 全部走核心的语义令牌（--dsw-alias-*），跟随主题明暗，不写死颜色。
 */

.dshcp-tabs { display: flex; gap: 8px; margin-bottom: 20px; padding-bottom: 8px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dshcp-tabs button { font: inherit; padding: 8px 16px; border: 1px solid transparent; border-radius: 8px; color: var(--dsw-alias-label-secondary); background: transparent; cursor: pointer; }
.dshcp-tabs button[aria-selected="true"] { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); }

.dfl-root {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 0 28px;
  color: var(--dsw-alias-label-primary);
}

.dfl-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dfl-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
}

.dfl-desc {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 1.65;
}

.dfl-master {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
}

.dfl-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.dfl-switchLabel {
  color: var(--dsw-alias-label-primary);
}

.dfl-global {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dfl-scale {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dfl-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dfl-catalog { padding: 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; display: grid; gap: 8px; }
.dfl-pickerFilters { display: flex; flex-wrap: wrap; gap: 8px; }
.dfl-pickerFilters > * { flex: 1 1 150px; min-width: 0; }
.dfl-fontSearch { box-sizing: border-box; padding: 6px 10px; font: inherit; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; color: inherit; background: var(--dsw-specific-input-major, var(--dsw-alias-bg-layer-1)); }
.dfl-btn:disabled { opacity: 0.5; cursor: default; }
.dfl-fontSearch:focus-visible, .dfl-select:focus-visible, .dfl-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }

.dfl-pickerRow {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.dfl-select {
  flex: 1 1 220px;
  min-width: 0;
  font: inherit;
  font-size: 13px;
  padding: 6px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-specific-input-major, var(--dsw-alias-bg-layer-1));
  color: var(--dsw-alias-label-primary);
  color-scheme: inherit;
}

.dfl-select:focus {
  outline: none;
  border-color: var(--dsw-alias-brand-primary);
}

.dfl-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dfl-fieldLabel {
  font-size: 13px;
  color: var(--dsw-alias-label-primary);
}

.dfl-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.dfl-btn {
  font: inherit;
  font-size: 13px;
  line-height: 18px;
  padding: 6px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: inherit;
  /* 让原生部件（下拉箭头、数字微调、滚动条）跟随主题明暗 */
  color-scheme: inherit;
  cursor: pointer;
}

.dfl-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dfl-btnDanger {
  color: var(--dsw-alias-state-error-primary, #d94a4a);
}

/*
 * 主按钮刻意不做实心填充：--dsw-alias-brand-primary 是主题反转色
 * （亮色近黑、暗色近白），实心填充再配硬编码前景会在暗色下变成白底白字。
 * 这里改为「品牌色描边 + 品牌色文字」，两种主题下都自动可读。
 */
.dfl-btnPrimary {
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-brand-primary);
  font-weight: 600;
}

.dfl-btnPrimary:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  filter: none;
}

.dfl-btnActive {
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-brand-primary);
  font-weight: 600;
}

.dfl-group {
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  padding: 10px 12px;
}

.dfl-group > summary {
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}

.dfl-count {
  font-weight: 400;
  color: var(--dsw-alias-label-tertiary);
}

.dfl-rows {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 12px;
}

.dfl-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dfl-rowHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dfl-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}

.dfl-label {
  color: var(--dsw-alias-label-primary);
}

.dfl-varName {
  font-family: var(--ds-font-family-code, ui-monospace, monospace);
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dfl-input {
  box-sizing: border-box;
  width: 100%;
  font: inherit;
  font-size: 13px;
  padding: 6px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-specific-input-major, var(--dsw-alias-bg-layer-1));
  color: var(--dsw-alias-label-primary);
  color-scheme: inherit;
}

.dfl-input:focus {
  outline: none;
  border-color: var(--dsw-alias-brand-primary);
}

.dfl-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--dsw-alias-label-tertiary);
  word-break: break-word;
}

.dfl-ruleRow {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) minmax(0, 1fr) 32px;
  gap: 8px;
  align-items: center;
}

.dfl-export {
  box-sizing: border-box;
  width: 100%;
  min-height: 170px;
  font-family: var(--ds-font-family-code, ui-monospace, monospace);
  font-size: 12px;
  line-height: 1.6;
  padding: 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  color-scheme: inherit;
  resize: vertical;
}

/*
 * 暗色主题下让原生部件（下拉箭头、数字微调、滚动条）也按暗色渲染。
 * 核心一般会在 html 上设 color-scheme，这里再按暗色属性兜一层，
 * 避免宿主没设时出现「深色按钮里嵌一个亮色下拉箭头」。
 */
body[data-ds-dark-theme] .dfl-btn,
body[data-ds-dark-theme] .dfl-select,
body[data-ds-dark-theme] .dfl-input,
body[data-ds-dark-theme] .dfl-export {
  color-scheme: dark;
}
`;

		/**
 * dsh-code-pill — settings core（纯函数，无依赖）。
 *
 * 设置页的数据契约：六套配对深浅色预设、自定义色板、图标徽章开关、
 * 排版参数、导入导出。所有函数纯计算、无副作用，node 侧供测试与审计
 * 脚本导入（文件尾 module.exports）；浏览器侧由 scripts/build.mjs 把全文
 * 内联进 client factory，留在 factory 作用域（window 存在时不触发
 * exports 赋值）。
 *
 * 单一事实源（DESIGN.md §2.6）：色板数值只定义在本文件的 PRESETS，
 * styles.css 的默认色与 scripts/color-audit.mjs 都以这里为准——
 * 内置预设全部经 color-audit 审计（WCAG 2.x ≥ 4.5）；自定义色板允许
 * 低对比，由 CP_SETTINGS.audit 输出 pass/false 供设置页警告。
 *
 * 配置形状（version 1）：
 *   { version, preset, syntax, marker, fontScale, radius, padding,
 *     bgOpacity, blockTheme, light: {palette}, dark: {palette} }
 * light / dark 直接是 palette 对象（不再包一层 palette 键）。
 */

/** 调色键：6 个语法角色 + pill 底色基准 + 徽章实色对。 */
var PALETTE_KEYS = ['plain', 'kwc', 'kwd', 'str', 'com', 'num', 'bg', 'badgeBg', 'badgeText'];

/** 徽章开关：off 关闭 / label 文字徽章 / icon 图标徽章 / both 两者。 */
var MARKERS = ['off', 'label', 'icon', 'both'];

/** 代码块主题：host 沿用宿主 shiki / preset 由色板生成 shiki 变量。 */
var BLOCK_THEMES = ['host', 'preset'];

var CONFIG_KEYS = ['version', 'preset', 'syntax', 'marker', 'fontScale', 'radius', 'padding', 'bgOpacity', 'blockTheme', 'light', 'dark'];

/** 6 个独立语法角色（fn/typ/cst/prm 渲染层继承 plain，见 DESIGN.md §3）。 */
var ROLE_KEYS = ['plain', 'kwc', 'kwd', 'str', 'com', 'num'];

var HEX6 = /^#[0-9a-fA-F]{6}$/;

// ---------------------------------------------------------------------------
// 预设（唯一色源；内置预设全部通过 scripts/color-audit.mjs 审计 ≥ 4.5）
// ---------------------------------------------------------------------------

var PRESETS = [
  {
    id: 'amber',
    name: '琥珀经典',
    description: '琥珀签名色的经典组合，插件默认色板。',
    light: {
      plain: '#916200', kwc: '#9c27b0', kwd: '#0451a5', str: '#8a1e1e',
      com: '#64707a', num: '#0a7a52', bg: '#916200',
      badgeBg: '#f3e7c6', badgeText: '#6e4a00',
    },
    dark: {
      plain: '#e2bf70', kwc: '#c5a2cd', kwd: '#7aa7d4', str: '#ceaa83',
      com: '#8fa67e', num: '#6aab87', bg: '#e2bf70',
      badgeBg: '#463615', badgeText: '#e7c67e',
    },
  },
  {
    id: 'readable',
    name: '柔和阅读',
    description: '中性石板签名色，整体对比适中。',
    light: {
      plain: '#365066', kwc: '#7d3c98', kwd: '#2a5fa8', str: '#8a1e1e',
      com: '#525e69', num: '#3f6a0d', bg: '#365066',
      badgeBg: '#e4e9ef', badgeText: '#2e3d4d',
    },
    dark: {
      plain: '#c3ccd6', kwc: '#c39ad6', kwd: '#82a9dc', str: '#d9a679',
      com: '#97a88e', num: '#5fb392', bg: '#c3ccd6',
      badgeBg: '#2c3641', badgeText: '#ccd7e2',
    },
  },
  {
    id: 'cool',
    name: '冷调清晰',
    description: '青蓝签名色的冷色系配色。',
    light: {
      plain: '#0b4a63', kwc: '#7a4bb2', kwd: '#2a5fa8', str: '#96302f',
      com: '#5a6d78', num: '#3f6a0d', bg: '#0b4a63',
      badgeBg: '#dceef4', badgeText: '#0b4a61',
    },
    dark: {
      plain: '#7cc7de', kwc: '#b9a0e0', kwd: '#6496ce', str: '#e0a58a',
      com: '#76995c', num: '#44a389', bg: '#7cc7de',
      badgeBg: '#17323d', badgeText: '#8fd2e8',
    },
  },
  {
    id: 'editor',
    name: '编辑器经典',
    description: '贴近 VS Code Light+/Dark+ 的取色。',
    light: {
      plain: '#795e26', kwc: '#0000cc', kwd: '#000080', str: '#a13326',
      com: '#64707a', num: '#0a7a52', bg: '#795e26',
      badgeBg: '#eee9dc', badgeText: '#54400f',
    },
    dark: {
      plain: '#dcdcaa', kwc: '#569cd6', kwd: '#4ec9b0', str: '#ce9178',
      com: '#74ab60', num: '#57a08a', bg: '#dcdcaa',
      badgeBg: '#33301f', badgeText: '#d6d2a8',
    },
  },
  {
    id: 'contrast',
    name: '高对比',
    description: '明暗差距较大的高对比配色。',
    light: {
      plain: '#1f1f1f', kwc: '#6d21b3', kwd: '#123f9e', str: '#8f1d1d',
      com: '#6b6b6b', num: '#3f6a0d', bg: '#1f1f1f',
      badgeBg: '#dcdcdc', badgeText: '#1a1a1a',
    },
    dark: {
      plain: '#f0f0f0', kwc: '#c78bf5', kwd: '#7db3f7', str: '#f49090',
      com: '#a3a3a3', num: '#3fd0a0', bg: '#f0f0f0',
      badgeBg: '#2e2e2e', badgeText: '#f0f0f0',
    },
  },
  {
    id: 'minimal',
    name: '素雅简约',
    description: '中性灰签名色，淡底色与紧凑圆角。',
    layout: { radius: 3, padding: 0.2, bgOpacity: 0.025 },
    light: {
      plain: '#333333', kwc: '#7d3c98', kwd: '#2a5fa8', str: '#8a1e1e',
      com: '#525e69', num: '#3f6a0d', bg: '#333333',
      badgeBg: '#ececee', badgeText: '#333333',
    },
    dark: {
      plain: '#d3d4d6', kwc: '#c1a3c7', kwd: '#88a8c6', str: '#cbb397',
      com: '#8fa67e', num: '#74ae8b', bg: '#d3d4d6',
      badgeBg: '#303134', badgeText: '#d3d4d6',
    },
  },
];

/** 初始化必须在 PRESETS 赋值后，custom 只作为配置状态，不作为内置预设。 */
var PRESET_IDS = PRESETS.map(function (p) { return p.id; });
var CONFIG_PRESETS = PRESET_IDS.concat(['custom']);
var PRESET_BY_ID = Object.create(null);
for (var i = 0; i < PRESETS.length; i++) PRESET_BY_ID[PRESETS[i].id] = PRESETS[i];

// ---------------------------------------------------------------------------
// 校验工具
// ---------------------------------------------------------------------------

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function assertHex(v, what) {
  if (typeof v !== 'string' || !HEX6.test(v)) {
    throw new Error('dsh-code-pill settings: ' + what + ' must be #rrggbb, got ' + JSON.stringify(v));
  }
  return v.toLowerCase();
}

function assertEnum(v, list, what) {
  if (list.indexOf(v) === -1) {
    throw new Error('dsh-code-pill settings: ' + what + ' must be one of ' + list.join('/') + ', got ' + JSON.stringify(v));
  }
  return v;
}

function assertNumber(v, min, max, what) {
  if (typeof v !== 'number' || !isFinite(v) || v < min || v > max) {
    throw new Error('dsh-code-pill settings: ' + what + ' must be a number in [' + min + ', ' + max + '], got ' + JSON.stringify(v));
  }
  return v;
}

function assertNoUnknownKeys(obj, allowed, what) {
  for (var k in obj) {
    if (allowed.indexOf(k) === -1) {
      throw new Error('dsh-code-pill settings: unknown key "' + k + '" in ' + what);
    }
  }
}

function copyPalette(p) {
  var out = {};
  for (var i = 0; i < PALETTE_KEYS.length; i++) out[PALETTE_KEYS[i]] = p[PALETTE_KEYS[i]];
  return out;
}

/** 校验（可部分）palette 对象；缺失键由 fallback 补齐。返回全新对象。 */
function normalizePalette(input, fallback, what) {
  var out = copyPalette(fallback);
  if (input === undefined) return out;
  if (!isPlainObject(input)) {
    throw new Error('dsh-code-pill settings: ' + what + ' must be an object, got ' + JSON.stringify(input));
  }
  assertNoUnknownKeys(input, PALETTE_KEYS, what);
  for (var i = 0; i < PALETTE_KEYS.length; i++) {
    var key = PALETTE_KEYS[i];
    if (input[key] !== undefined) out[key] = assertHex(input[key], what + '.' + key);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 颜色数学（WCAG 2.x；audit 与脚本共用同一套定义）
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  var h = hex.replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error('bad hex: ' + hex);
  return [0, 2, 4].map(function (i) { return parseInt(h.slice(i, i + 2), 16); });
}

function toLinear(c8) {
  var c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG 2.x 相对亮度，0..1。 */
function luminance(rgb) {
  var r = toLinear(rgb[0]); var g = toLinear(rgb[1]); var b = toLinear(rgb[2]);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 对比度。 */
function contrast(hexA, hexB) {
  var la = luminance(hexToRgb(hexA));
  var lb = luminance(hexToRgb(hexB));
  var hi = Math.max(la, lb); var lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** alpha 合成到不透明底，返回 8-bit rgb 数组。 */
function composite(hexFg, alpha, hexBg) {
  var fg = hexToRgb(hexFg); var bg = hexToRgb(hexBg);
  return fg.map(function (c, i) {
    return Math.min(255, Math.max(0, Math.round(c * alpha + bg[i] * (1 - alpha))));
  });
}

function rgbToHex(rgb) {
  return '#' + rgb.map(function (c) {
    return Math.min(255, Math.max(0, Math.round(c))).toString(16).padStart(2, '0');
  }).join('');
}

/** 合成结果直接取 hex（audit 的 pill 背景口径）。 */
function compositeRgbHex(hexFg, alpha, hexBg) {
  return rgbToHex(composite(hexFg, alpha, hexBg));
}

/** rgba() CSS 值；alpha 保留原值（最多 4 位小数，与 slider step 0.005 一致），
 *  不做两位四舍五入——css 输出与审计合成必须用同一 alpha。 */
function rgbaCss(hex, alpha) {
  var rgb = hexToRgb(hex);
  var a = Math.round(alpha * 10000) / 10000;
  return 'rgba(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ', ' + a + ')';
}

// ---------------------------------------------------------------------------
// 配置 API
// ---------------------------------------------------------------------------

/**
 * 默认配置：amber 预设 + 默认排版参数。
 * 每次调用返回全新对象（palette 深拷贝，不与 PRESETS 共享引用）。
 */
function defaults() {
  var base = PRESET_BY_ID.amber;
  return {
    version: 1,
    preset: 'amber',
    syntax: true,
    marker: 'label',
    fontScale: 0.94,
    radius: 4,
    padding: 0.25,
    bgOpacity: 0.06,
    blockTheme: 'host',
    light: copyPalette(base.light),
    dark: copyPalette(base.dark),
  };
}

/**
 * 严格校验输入并返回完整的新配置。规则：未知键 / version≠1 /
 * 非法枚举 / 越界数值 / 非 #rrggbb 颜色一律抛 Error，不静默接受；
 * 缺失的合法字段从默认补齐。
 */
function normalize(input) {
  if (input === undefined) return defaults();
  if (input === null) {
    throw new Error('dsh-code-pill settings: config must be an object with explicit version, got null');
  }
  if (!isPlainObject(input)) {
    throw new Error('dsh-code-pill settings: config must be an object, got ' + JSON.stringify(input));
  }
  assertNoUnknownKeys(input, CONFIG_KEYS, 'config');

  var out = defaults();

  // 导入/持久化的配置必须显式声明 version，避免 {} / null 被当成有效配置。
  if (input.version === undefined) {
    throw new Error('dsh-code-pill settings: missing required "version" field');
  }
  if (input.version !== 1) {
    throw new Error('dsh-code-pill settings: unsupported version ' + JSON.stringify(input.version));
  }
  out.version = 1;

  // preset 先定型：缺失的 palette 字段从「所选 preset」补齐而非一律 amber；
  // 'custom'（用户在 UI 改过色/排版）以 amber 为 fallback，但实际配置里
  // light/dark 总是携带全量色板。
  if (input.preset !== undefined) {
    if (typeof input.preset !== 'string' || CONFIG_PRESETS.indexOf(input.preset) === -1) {
      throw new Error('dsh-code-pill settings: unknown preset ' + JSON.stringify(input.preset));
    }
    out.preset = input.preset;
    var base = PRESET_BY_ID[input.preset] || PRESET_BY_ID.amber;
    out.light = copyPalette(base.light);
    out.dark = copyPalette(base.dark);
    Object.assign(out, base.layout || {});
  }
  if (input.syntax !== undefined) {
    if (typeof input.syntax !== 'boolean') throw new Error('dsh-code-pill settings: syntax must be boolean');
    out.syntax = input.syntax;
  }
  if (input.marker !== undefined) out.marker = assertEnum(input.marker, MARKERS, 'marker');
  if (input.blockTheme !== undefined) out.blockTheme = assertEnum(input.blockTheme, BLOCK_THEMES, 'blockTheme');
  if (input.fontScale !== undefined) out.fontScale = assertNumber(input.fontScale, 0.8, 1.1, 'fontScale');
  if (input.radius !== undefined) out.radius = assertNumber(input.radius, 0, 10, 'radius');
  if (input.padding !== undefined) out.padding = assertNumber(input.padding, 0, 0.6, 'padding');
  if (input.bgOpacity !== undefined) out.bgOpacity = assertNumber(input.bgOpacity, 0, 0.2, 'bgOpacity');
  if (input.light !== undefined) out.light = normalizePalette(input.light, out.light, 'light');
  if (input.dark !== undefined) out.dark = normalizePalette(input.dark, out.dark, 'dark');
  return out;
}

/** 完整默认配置换成指定预设的配色；非法 id 抛 Error。 */
function presetConfig(id) {
  var preset = PRESET_BY_ID[id];
  if (preset === undefined) {
    throw new Error('dsh-code-pill settings: unknown preset ' + JSON.stringify(id));
  }
  var out = defaults();
  out.preset = id;
  out.light = copyPalette(preset.light);
  out.dark = copyPalette(preset.dark);
  Object.assign(out, preset.layout || {});
  return out;
}

// ---------------------------------------------------------------------------
// CSS 生成
// ---------------------------------------------------------------------------

/** 由 palette 推导 shiki 代码块变量（blockTheme = 'preset' 时）。 */
function shikiVars(p) {
  return [
    ['--shiki-foreground', p.plain],
    ['--shiki-token-constant', p.kwd],
    ['--shiki-token-string', p.str],
    ['--shiki-token-string-expression', p.str],
    ['--shiki-token-comment', p.com],
    ['--shiki-token-keyword', p.kwc],
    ['--shiki-token-parameter', p.kwd],
    ['--shiki-token-function', p.plain],
    ['--shiki-token-punctuation', p.plain],
    ['--shiki-token-link', p.kwc],
  ];
}

/** 单个主题的变量声明行（不含选择器与花括号）。 */
function themeDeclarations(cfg, palette) {
  var lines = [];
  for (var i = 0; i < ROLE_KEYS.length; i++) {
    var role = ROLE_KEYS[i];
    lines.push('  --dshcp-' + role + ': ' + palette[role] + ';');
  }
  lines.push('  --dshcp-fn: var(--dshcp-plain);');
  lines.push('  --dshcp-typ: var(--dshcp-plain);');
  lines.push('  --dshcp-cst: var(--dshcp-plain);');
  lines.push('  --dshcp-prm: var(--dshcp-plain);');
  lines.push('  --dshcp-bg: ' + rgbaCss(palette.bg, cfg.bgOpacity) + ';');
  lines.push('  --dshcp-badge-bg: ' + palette.badgeBg + ';');
  lines.push('  --dshcp-badge-text: ' + palette.badgeText + ';');
  lines.push('  --dshcp-font-scale: ' + cfg.fontScale + 'em;');
  lines.push('  --dshcp-radius: ' + cfg.radius + 'px;');
  lines.push('  --dshcp-padding: ' + cfg.padding + 'em;');
  if (cfg.blockTheme === 'preset') {
    var sv = shikiVars(palette);
    for (var j = 0; j < sv.length; j++) lines.push('  ' + sv[j][0] + ': ' + sv[j][1] + ';');
  }
  return lines;
}

/**
 * 生成 CSS 变量规则：默认两段（selector 的亮色段 + 深色主题的暗色段）。
 * selector 省略时为 'html:root'，暗色段落在 'html body[data-ds-dark-theme]'；
 * 自定义 selector 时暗色段为其内层 body[data-ds-dark-theme] 作用域。
 */
function css(config, selector) {
  var cfg = normalize(config);
  var lightSel = (selector === undefined || selector === null) ? 'html:root' : String(selector);
  var darkSel = lightSel === 'html:root'
    ? 'html body[data-ds-dark-theme]'
    : lightSel + ' body[data-ds-dark-theme]';
  return lightSel + ' {\n' + themeDeclarations(cfg, cfg.light).join('\n') + '\n}\n'
    + darkSel + ' {\n' + themeDeclarations(cfg, cfg.dark).join('\n') + '\n}';
}

/** React style 对象形式的自定义属性（隔离预览用，var() 全部解析为实色）。 */
function previewStyle(config, theme) {
  var cfg = normalize(config);
  if (theme !== 'light' && theme !== 'dark') {
    throw new Error('dsh-code-pill settings: theme must be light/dark, got ' + JSON.stringify(theme));
  }
  var p = cfg[theme];
  var out = {};
  for (var i = 0; i < ROLE_KEYS.length; i++) out['--dshcp-' + ROLE_KEYS[i]] = p[ROLE_KEYS[i]];
  out['--dshcp-fn'] = p.plain;
  out['--dshcp-typ'] = p.plain;
  out['--dshcp-cst'] = p.plain;
  out['--dshcp-prm'] = p.plain;
  out['--dshcp-bg'] = rgbaCss(p.bg, cfg.bgOpacity);
  out['--dshcp-badge-bg'] = p.badgeBg;
  out['--dshcp-badge-text'] = p.badgeText;
  out['--dshcp-font-scale'] = cfg.fontScale + 'em';
  out['--dshcp-radius'] = cfg.radius + 'px';
  out['--dshcp-padding'] = cfg.padding + 'em';
  if (cfg.blockTheme === 'preset') {
    var sv = shikiVars(p);
    for (var j = 0; j < sv.length; j++) out[sv[j][0]] = sv[j][1];
  }
  return out;
}

// ---------------------------------------------------------------------------
// 对比度审计
// ---------------------------------------------------------------------------

var AA_NORMAL = 4.5;

/**
 * 对比度审计：6 个语法角色分别对 pageBg 与 pill 合成背景
 * （palette.bg @ bgOpacity 叠到 pageBg）取最差值；badge 对按实色口径
 * （badgeText vs badgeBg，与 css 的 --dshcp-badge-* 一致）。
 * 返回 [{ role, ratio, pass, ratioPage, ratioPill }]，ratio = min 为完整精度浮点。
 */
function audit(config, theme, pageBg) {
  var cfg = normalize(config);
  if (theme !== 'light' && theme !== 'dark') {
    throw new Error('dsh-code-pill settings: theme must be light/dark, got ' + JSON.stringify(theme));
  }
  assertHex(pageBg, 'pageBg');
  var p = cfg[theme];
  var pillHex = compositeRgbHex(p.bg, cfg.bgOpacity, pageBg);
  var out = [];
  for (var i = 0; i < ROLE_KEYS.length; i++) {
    var role = ROLE_KEYS[i];
    var ratioPage = contrast(p[role], pageBg);
    var ratioPill = contrast(p[role], pillHex);
    var ratio = Math.min(ratioPage, ratioPill);
    out.push({ role: role, ratio: ratio, pass: ratio >= AA_NORMAL, ratioPage: ratioPage, ratioPill: ratioPill });
  }
  var badgeRatio = contrast(p.badgeText, p.badgeBg);
  out.push({ role: 'badge', ratio: badgeRatio, pass: badgeRatio >= AA_NORMAL });
  return out;
}

// ---------------------------------------------------------------------------
// 导入 / 导出
// ---------------------------------------------------------------------------

/** 导入：JSON.parse + normalize（格式非法抛 Error）。 */
function parse(text) {
  return normalize(JSON.parse(text));
}

/** 导出：先 normalize 校验（非法配置抛 Error），紧凑 JSON。 */
function stringify(config) {
  return JSON.stringify(normalize(config));
}

var CP_SETTINGS = {
  PRESETS: PRESETS,
  PALETTE_KEYS: PALETTE_KEYS,
  ROLE_KEYS: ROLE_KEYS,
  MARKERS: MARKERS,
  BLOCK_THEMES: BLOCK_THEMES,
  AA_NORMAL: AA_NORMAL,
  defaults: defaults,
  normalize: normalize,
  presetConfig: presetConfig,
  css: css,
  previewStyle: previewStyle,
  audit: audit,
  parse: parse,
  stringify: stringify,
  // 颜色数学暴露给审计脚本复用（同一实现，避免双源漂移）。
  hexToRgb: hexToRgb,
  luminance: luminance,
  contrast: contrast,
  composite: composite,
  compositeRgbHex: compositeRgbHex,
  rgbaCss: rgbaCss,
};

if (typeof module !== 'undefined' && module.exports !== undefined && typeof window === 'undefined') {
  module.exports = { CP_SETTINGS };
}


		/* Client-only font inspection. No family-name heuristics or bundled font files. */
var CP_FONT_CATALOG = (function () {
  var LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var ASCII = Array.from({ length: 95 }, function (_, i) { return String.fromCharCode(32 + i); }).join('');
  var HAN = '中文字体阅读界面代码测试汉語繁體國學書體';
  var FILTERS = [
    { id: 'all', label: '全部字体' },
    { id: 'latin', label: '英文 / 拉丁字母' },
    { id: 'han', label: '中文 / 汉字（抽样）' },
    { id: 'mono', label: '等宽（拉丁字符）' },
    { id: 'unknown', label: '未完整识别' }
  ];
  function unknown() { return { latin: null, han: null, mono: null }; }
  function inspect(buffer) {
    try {
      var view = new DataView(buffer);
      function check(offset, length, end) {
        if (offset < 0 || length < 0 || offset + length > (end === undefined ? view.byteLength : end)) throw Error('Invalid font table');
      }
      function u16(p) { check(p, 2); return view.getUint16(p); }
      function u32(p) { check(p, 4); return view.getUint32(p); }
      check(0, 12);
      var signature = u32(0);
      if ([0x00010000, 0x4f54544f, 0x74727565].indexOf(signature) < 0) return unknown();
      var count = u16(4), tables = Object.create(null);
      check(12, count * 16);
      for (var i = 0; i < count; i++) {
        var p = 12 + i * 16, tag = '';
        for (var j = 0; j < 4; j++) tag += String.fromCharCode(view.getUint8(p + j));
        var offset = u32(p + 8), length = u32(p + 12);
        check(offset, length);
        if (tables[tag]) throw Error('Duplicate font table');
        tables[tag] = { start: offset, end: offset + length };
      }
      var cmap = tables.cmap, mapping = null;
      if (cmap) {
        check(cmap.start, 4, cmap.end);
        var records = u16(cmap.start + 2), candidates = [];
        check(cmap.start + 4, records * 8, cmap.end);
        for (i = 0; i < records; i++) {
          p = cmap.start + 4 + i * 8;
          var platform = u16(p), encoding = u16(p + 2);
          if (!(platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10)))) continue;
          var sub = cmap.start + u32(p + 4);
          check(sub, 2, cmap.end);
          var format = u16(sub);
          if (format === 4 || format === 12) candidates.push({ start: sub, format: format });
        }
        candidates.sort(function (a, b) { return b.format - a.format; });
        if (candidates.length) {
          var selected = candidates[0], start = selected.start;
          if (selected.format === 12) {
            check(start, 16, cmap.end);
            var end = start + u32(start + 4), groups = u32(start + 12);
            check(start, end - start, cmap.end); check(start + 16, groups * 12, end);
            var previous = -1;
            for (var g = 0; g < groups; g++) {
              var gp = start + 16 + g * 12, low = u32(gp), high = u32(gp + 4);
              if (low > high || high > 0x10ffff || low <= previous) throw Error('Invalid cmap groups');
              previous = high;
            }
            mapping = function (code) {
              var lo = 0, hi = groups - 1;
              while (lo <= hi) {
                var mid = (lo + hi) >>> 1, at = start + 16 + mid * 12;
                var first = u32(at), last = u32(at + 4);
                if (code < first) hi = mid - 1;
                else if (code > last) lo = mid + 1;
                else return u32(at + 8) + code - first;
              }
              return 0;
            };
          } else {
            check(start, 16, cmap.end);
            end = start + u16(start + 2);
            var segments = u16(start + 6) / 2;
            if (!Number.isInteger(segments) || !segments) throw Error('Invalid segments');
            check(start, end - start, cmap.end); check(start + 14, segments * 8 + 2, end);
            previous = -1;
            for (var seg = 0; seg < segments; seg++) {
              low = u16(start + 16 + segments * 2 + seg * 2); high = u16(start + 14 + seg * 2);
              if (low > high || low <= previous) throw Error('Invalid cmap segments');
              previous = high;
            }
            mapping = function (code) {
              var lo = 0, hi = segments - 1;
              while (lo <= hi) {
                var mid = (lo + hi) >>> 1;
                if (u16(start + 14 + mid * 2) < code) lo = mid + 1; else hi = mid - 1;
              }
              if (lo >= segments) return 0;
              var first = u16(start + 16 + segments * 2 + lo * 2);
              if (code < first) return 0;
              var delta = u16(start + 16 + segments * 4 + lo * 2);
              var at = start + 16 + segments * 6 + lo * 2, range = u16(at);
              if (!range) return (code + delta) & 65535;
              var glyphAt = at + range + (code - first) * 2;
              if (glyphAt < start + 16 + segments * 8) throw Error('Invalid glyph offset');
              check(glyphAt, 2, end);
              var glyph = u16(glyphAt);
              return glyph ? (glyph + delta) & 65535 : 0;
            };
          }
        }
      }
      var result = unknown();
      function glyphs(text) { return Array.from(text).map(function (char) { return mapping(char.codePointAt(0)); }); }
      if (mapping) {
        var maxp = tables.maxp, glyphCount = null;
        if (maxp) { check(maxp.start, 6, maxp.end); glyphCount = u16(maxp.start + 4); }
        if (glyphCount === null || !glyphCount) return unknown();
        function valid(glyph) {
          if (glyph >= glyphCount) throw Error('Invalid glyph index');
          return glyph > 0;
        }
        var latin = glyphs(LATIN);
        result.latin = latin.every(valid);
        result.han = glyphs(HAN).every(valid);
        var hhea = tables.hhea, hmtx = tables.hmtx;
        if (result.latin && glyphCount !== null && hhea && hmtx) {
          check(hhea.start, 36, hhea.end);
          var metrics = u16(hhea.start + 34);
          if (!metrics || metrics > glyphCount) throw Error('Invalid metrics');
          check(hmtx.start, metrics * 4 + (glyphCount - metrics) * 2, hmtx.end);
          var ascii = glyphs(ASCII);
          if (ascii.every(valid)) {
            var widths = ascii.map(function (glyph) { return u16(hmtx.start + Math.min(glyph, metrics - 1) * 4); });
            result.mono = widths[0] > 0 && widths.every(function (width) { return width === widths[0]; });
          } else result.mono = false;
        }
      }
      return result;
    } catch (error) { return unknown(); }
  }
  function filter(entries, category, search) {
    var query = String(search || '').trim().toLocaleLowerCase();
    return entries.filter(function (entry) {
      var match = category === 'all' || !category || (category === 'unknown'
        ? entry.latin === null || entry.han === null || entry.mono === null
        : entry[category] === true);
      return match && entry.family.toLocaleLowerCase().indexOf(query) !== -1;
    });
  }
  async function inspectBlob(blob) {
    // FontData.blob() is specified to return a standalone SFNT face. Unsupported
    // containers remain unknown; never merge unrelated faces from a collection.
    var header = new DataView(await blob.slice(0, 12).arrayBuffer());
    if (header.byteLength < 12) return unknown();
    var signature = header.getUint32(0), count = header.getUint16(4);
    if ([0x00010000, 0x4f54544f, 0x74727565].indexOf(signature) < 0 || count > 4096) return unknown();
    var bytes = await blob.slice(12, 12 + count * 16).arrayBuffer();
    if (bytes.byteLength !== count * 16) return unknown();
    var directory = new DataView(bytes), wanted = ['cmap', 'maxp', 'hhea', 'hmtx'], selected = [], total = 12, seen = new Set();
    for (var i = 0; i < count; i++) {
      var p = i * 16, tag = '';
      for (var j = 0; j < 4; j++) tag += String.fromCharCode(directory.getUint8(p + j));
      if (seen.has(tag)) return unknown();
      seen.add(tag);
      if (wanted.indexOf(tag) < 0) continue;
      var offset = directory.getUint32(p + 8), length = directory.getUint32(p + 12);
      if (offset + length > blob.size || length > 4 * 1024 * 1024) return unknown();
      selected.push({ tag: tag, offset: offset, length: length }); total += length + 16;
    }
    var compact = new ArrayBuffer(total), view = new DataView(compact);
    view.setUint32(0, signature); view.setUint16(4, selected.length);
    var cursor = 12 + selected.length * 16;
    for (i = 0; i < selected.length; i++) {
      var item = selected[i]; p = 12 + i * 16;
      for (j = 0; j < 4; j++) view.setUint8(p + j, item.tag.charCodeAt(j));
      view.setUint32(p + 8, cursor); view.setUint32(p + 12, item.length);
      var table = await blob.slice(item.offset, item.offset + item.length).arrayBuffer();
      if (table.byteLength !== item.length) return unknown();
      new Uint8Array(compact, cursor, item.length).set(new Uint8Array(table)); cursor += item.length;
    }
    return inspect(compact);
  }
  async function enumerate(faces, options) {
    options = options || {};
    var families = new Map();
    (faces || []).forEach(function (face) {
      if (!face || typeof face.family !== 'string' || !face.family.trim()) return;
      if (!families.has(face.family)) families.set(face.family, []);
      families.get(face.family).push(face);
    });
    var entries = [], done = 0;
    // Sequential reads keep large CJK font buffers out of memory after each face.
    for (var pair of families) {
      if (options.cancelled && options.cancelled()) return null;
      var capability = unknown(), evidence = [];
      for (var face of pair[1]) {
        if (options.cancelled && options.cancelled()) return null;
        var found = unknown();
        try { if (typeof face.blob === 'function') found = await inspectBlob(await face.blob()); }
        catch (error) { /* Listed family remains available with unknown capabilities. */ }
        evidence.push(found);
      }
      ['latin', 'han', 'mono'].forEach(function (key) {
        if (evidence.every(function (face) { return face[key] === true; })) capability[key] = true;
        else if (evidence.every(function (face) { return face[key] === false; })) capability[key] = false;
      });
      entries.push(Object.assign({ family: pair[0], faces: evidence.length }, capability));
      done++;
      if (options.onProgress) options.onProgress(done, families.size);
    }
    return entries.sort(function (a, b) { return a.family.localeCompare(b.family); });
  }
  return { inspect: inspect, inspectBlob: inspectBlob, filter: filter, enumerate: enumerate, FILTERS: FILTERS, LATIN: LATIN, HAN: HAN, ASCII: ASCII };
})();
if (typeof module !== 'undefined' && module.exports) module.exports.CP_FONT_CATALOG = CP_FONT_CATALOG;

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


		function createFontSettings(React, store) {
var h = React.createElement;
var normalizeState = CP_FONTS.normalizeState;
var normalizeStack = CP_FONTS.normalizeStack;
var buildCss = CP_FONTS.buildCss;
var withVar = CP_FONTS.withVar;
var ROLE_SLOTS = CP_FONTS.ROLE_SLOTS;
var SIZE_SLOTS = CP_FONTS.SIZE_SLOTS;
var MARKDOWN_SLOTS = CP_FONTS.MARKDOWN_SLOTS;
var splitTopLevel = CP_FONTS.splitTopLevel;
var entryOf = CP_FONTS.entryOf;
var normalizeSelector = CP_FONTS.normalizeSelector;
var UI_SCALES = CP_FONTS.UI_SCALES;
var CONTENT_SIZE_MIN = CP_FONTS.CONTENT_SIZE_MIN;
var CONTENT_SIZE_MAX = CP_FONTS.CONTENT_SIZE_MAX;
var FONT_CONTENT_DEFAULT = CP_FONTS.FONT_CONTENT_DEFAULT;
var sessionFonts = [];
        function literalFamily(family) {
            // API family is one literal name, never a comma-separated stack.
            if (/["\\<>{};\n\r]|\/\*|\*\//.test(family)) return '';
            return normalizeStack('"' + family + '"');
        }
		/** 字体族下拉 + 「添加」/「清空」，下面是一个可手工编辑的字体栈输入框。 */
		function FamilyPicker(props) {
			var pickedRef = React.useState("");
			var picked = pickedRef[0];
			var setPicked = pickedRef[1];
            var errorRef = React.useState('');

			/** 把选中的字体族追加到字体栈末尾（已存在则不重复添加）。 */
			var append = function (family) {
				if (family === "") return;
				var existing = splitTopLevel(String(props.value || ""))
					.map(function (raw) { return raw.trim().replace(/^["']|["']$/g, "").toLowerCase(); })
					.filter(function (raw) { return raw !== ""; });
				if (existing.indexOf(family.toLowerCase()) !== -1) return;
				var literal = literalFamily(family);
                if (!literal) { errorRef[1]('此族名含无法安全编码的字符，可手动填写字体栈。'); return; }
                errorRef[1]('');
                props.onChange(props.value ? props.value + ", " + literal : literal);
			};

            var categoryRef = React.useState(props.mono ? 'mono' : 'all');
            var category = categoryRef[0], setCategory = categoryRef[1];
            var searchRef = React.useState('');
            var search = searchRef[0], setSearch = searchRef[1];
            var available = React.useMemo(function () {
                return CP_FONT_CATALOG.filter(props.systemFonts || [], category, search);
            }, [props.systemFonts, category, search]);
            var selected = available.some(function (font) { return font.family === picked; }) ? picked : '';

			return h("div", { className: "dfl-picker" },
				h("div", { className: "dfl-pickerFilters" },
                    h("select", { className: "dfl-select", "aria-label": "字体分类", value: category,
                        onChange: function (event) { setCategory(event.target.value); setPicked(''); } },
                        CP_FONT_CATALOG.FILTERS.map(function (item) {
                            var count = CP_FONT_CATALOG.filter(props.systemFonts || [], item.id, '').length;
                            return h("option", { key: item.id, value: item.id }, item.label + ' · ' + count);
                        })),
                    h("input", { className: "dfl-fontSearch", type: "search", "aria-label": "搜索字体", placeholder: "搜索已读取的字体…", value: search,
                        onChange: function (event) { setSearch(event.target.value); setPicked(''); } })),
                h("div", { className: "dfl-pickerRow" },
					h("select", {
						className: "dfl-select", "aria-label": "选择字体",
						value: selected, disabled: available.length === 0,
						onChange: function (event) { setPicked(event.target.value); },
					},
						h("option", { value: "" }, available.length ? "选择字体…" : "无匹配字体"),
                        available.map(function (font) { return h("option", { key: font.family, value: font.family }, font.family); })),
					h("button", {
						type: "button",
						className: "dfl-btn dfl-btnPrimary",
						disabled: !selected, onClick: function () { append(selected); setPicked(""); },
					}, "添加"),
					h("button", {
						type: "button",
						className: "dfl-btn",
						onClick: function () { props.onChange(""); },
					}, "清空")),

				h("input", {
					className: "dfl-input",
					type: "text", "aria-label": props.label || props.placeholder || "字体栈",
					spellCheck: false,
					placeholder: props.placeholder,
					value: props.value,
					onChange: function (event) { props.onChange(event.target.value); },
				}), errorRef[0] ? h('p', { className: 'dfl-hint', role: 'alert' }, errorRef[0]) : null);
		}

		function VarRow(props) {
			var entry = props.entry;
			return h("div", { className: "dfl-row" },
				h("div", { className: "dfl-rowHead" },
					h("label", { className: "dfl-toggle" },
						h("input", {
							type: "checkbox",
							checked: entry.on === true,
							onChange: function (event) { props.onToggle(event.target.checked); },
						}),
						h("span", { className: "dfl-label" }, props.label)),
					h("code", { className: "dfl-varName" }, props.name)),
				h(FamilyPicker, {
					value: entry.stack,
					placeholder: "字体族，多个用逗号分隔",
					compact: true,
					systemFonts: props.systemFonts,
					onLoadSystemFonts: props.onLoadSystemFonts,
					onChange: props.onChange,
				}),
				props.hint ? h("p", { className: "dfl-hint" }, props.hint) : null);
		}

        function Fold(props) {
            var openRef = React.useState(false);
            var children = React.Children.toArray(props.children);
            return h('details', { className: props.className, open: openRef[0],
                onToggle: function (event) { openRef[1](event.currentTarget.open); } },
                children[0], openRef[0] ? children.slice(1) : null);
        }

		function SlotGroup(props) {
			return h(Fold, { className: "dfl-group" },
				h("summary", null, props.title, h("span", { className: "dfl-count" }, " · " + props.slots.length + " 项")),
				h("div", { className: "dfl-rows" },
					props.slots.map(function (slot) {
						return h(VarRow, {
							key: slot.name,
							name: slot.name,
							label: slot.label,
							hint: slot.hint,
							entry: entryOf(props.state, slot.name),
							systemFonts: props.systemFonts,
							onLoadSystemFonts: props.onLoadSystemFonts,
							onToggle: function (on) { props.onVar(slot.name, { on: on }); },
							onChange: function (stack) { props.onVar(slot.name, { stack: stack, on: true }); },
						});
					})));
		}

		function FontLabSection() {
			var state = React.useSyncExternalStore(store.subscribe, store.getSnapshot);
            function setState(update) { store.save(typeof update === 'function' ? update(store.getSnapshot()) : update); }
            var active = React.useRef(true);
            React.useEffect(function () { active.current = true; return function () { active.current = false; }; }, []);
			var copiedRef = React.useState(false);
			var copied = copiedRef[0];
			var setCopied = copiedRef[1];

            // Only the current client session's authorized enumeration is offered.
            var systemRef = React.useState(function () { return sessionFonts; });
            var systemFonts = systemRef[0], setSystemFonts = systemRef[1];
            var fontStatusRef = React.useState(function () { return sessionFonts.length ? '使用本次插件会话已读取的名单；字体可能已变化，可刷新或清除。' : '尚未读取本机字体；可以手动输入字体栈。'; });
            var fontStatus = fontStatusRef[0], setFontStatus = fontStatusRef[1];
            var loadingRef = React.useState(false), loading = loadingRef[0], setLoading = loadingRef[1];
            var request = React.useRef(0);
            React.useEffect(function () { return function () { request.current++; }; }, []);
            var loadSystemFonts = function () {
                if (loading) return;
                if (typeof window.queryLocalFonts !== 'function') {
                    setFontStatus('此客户端不支持读取本机字体，仍可手动输入；不会提供假定已安装的候选。');
                    return;
                }
                var id = ++request.current;
                function cancelled() { return !active.current || id !== request.current; }
                setLoading(true); setFontStatus('正在请求读取权限…');
                // Call before any await to preserve transient user activation.
                var query;
                try { query = window.queryLocalFonts(); }
                catch (error) { query = Promise.reject(error); }
                Promise.resolve(query).then(function (faces) {
                    if (cancelled()) return null;
                    return CP_FONT_CATALOG.enumerate(faces, {
                        cancelled: cancelled,
                        onProgress: function (done, total) { if (!cancelled()) setFontStatus('正在识别字体能力：' + done + ' / ' + total); }
                    });
                }).then(function (entries) {
                    if (cancelled() || entries === null) return;
                    sessionFonts = entries; setSystemFonts(entries); setLoading(false);
                    setFontStatus(entries.length ? '已读取 ' + entries.length + ' 个字体族。分类来自字体文件，不按名称推测；同一字体可属于多个类别。' : '没有读到字体，可以继续手动输入。');
                }).catch(function (error) {
                    if (cancelled()) return;
                    sessionFonts = []; setSystemFonts([]); setLoading(false);
                    setFontStatus('读取失败（' + (error.name || 'Error') + '）：' + (error.message || '权限未授予') + '。可继续手动输入。');
                });
            };

			var css = React.useMemo(function () { return buildCss(state); }, [state]);



			var patchState = function (patch) {
				setState(function (current) {
					var next = {};
					Object.keys(current).forEach(function (key) { next[key] = current[key]; });
					Object.keys(patch).forEach(function (key) { next[key] = patch[key]; });
					return normalizeState(next);
				});
			};
			var onVar = function (name, patch) {
				setState(function (current) { return withVar(current, name, patch); });
			};
			var restoreDefaults = function () {
				patchState({ master: true, globalFamily: "", globalMono: "", uiScale: 100, contentSize: "", vars: {}, rules: [] });
			};
			var addRule = function () {
				setState(function (current) {
					var rules = (current.rules || []).slice();
					rules.push({
						id: "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
						on: true,
						selector: "",
						stack: "",
					});
					return normalizeState({ uiScale: current.uiScale, contentSize: current.contentSize, master: current.master, globalFamily: current.globalFamily, globalMono: current.globalMono, vars: current.vars, rules: rules });
				});
			};
			var patchRule = function (id, patch) {
				setState(function (current) {
					var rules = (current.rules || []).map(function (rule) {
						if (rule.id !== id) return rule;
						var next = { on: rule.on, selector: rule.selector, stack: rule.stack, id: rule.id };
						Object.keys(patch).forEach(function (key) { next[key] = patch[key]; });
						return next;
					});
					return normalizeState({ uiScale: current.uiScale, contentSize: current.contentSize, master: current.master, globalFamily: current.globalFamily, globalMono: current.globalMono, vars: current.vars, rules: rules });
				});
			};
			var removeRule = function (id) {
				setState(function (current) {
					return normalizeState({
						uiScale: current.uiScale, contentSize: current.contentSize,
						master: current.master,
						globalFamily: current.globalFamily,
						globalMono: current.globalMono,
						vars: current.vars,
						rules: (current.rules || []).filter(function (rule) { return rule.id !== id; }),
					});
				});
			};
			var copyCss = function () {
				try {
					window.navigator.clipboard.writeText(css).then(function () {
						if (active.current) setCopied(true);

					}, function () { if (active.current) setCopied(false); });
				} catch (error) {
					setCopied(false);
				}
			};

			var advancedVarCount = Object.keys(state.vars || {}).filter(function (name) {
				var entry = state.vars[name];
				return entry && entry.on === true && normalizeStack(entry.stack) !== "";
			}).length;
			var advancedRuleCount = (state.rules || []).filter(function (rule) {
				return rule && rule.on === true && normalizeSelector(rule.selector) !== "" && normalizeStack(rule.stack) !== "";
			}).length;

			var activeParts = [];
			if (normalizeStack(state.globalFamily) !== "") activeParts.push("全局字体 " + normalizeStack(state.globalFamily));
			if (normalizeStack(state.globalMono) !== "") activeParts.push("等宽字体 " + normalizeStack(state.globalMono));
			if (Number(state.uiScale) !== 100) activeParts.push("界面缩放 " + state.uiScale + "%");
			if (state.contentSize !== "") activeParts.push("会话正文字号 " + state.contentSize + "px");
			var summary = state.master !== true
				? "已关闭：本插件当前不干预任何字体与字号"
				: (activeParts.length > 0
					? "已生效：" + activeParts.join("；")
					: "已开启但没有任何设置：当前仍是 DSH 默认与官方「外观」设置");

			return h("div", { className: "dfl-root" },
				h("div", { className: "dfl-head" },
					h("h3", { className: "dfl-title" }, "字体"),
					h("p", { className: "dfl-desc" }, summary)),

				h("div", { className: "dfl-master" },
					h("label", { className: "dfl-switch" },
						h("input", {
							type: "checkbox",
							checked: state.master === true,
							onChange: function (event) { patchState({ master: event.target.checked }); },
						}),
						h("span", { className: "dfl-switchLabel" }, "启用字体覆盖")),
					h("p", { className: "dfl-hint" }, "关闭后本插件完全不注入样式，回到 DSH 默认与官方「外观」里的字体设置。")),

                h("section", { className: "dfl-catalog", "aria-label": "本机字体库" },
                    h("div", { className: "dfl-pickerRow" },
                        h("strong", null, "本机字体库"),
                        h("button", { type: "button", className: "dfl-btn", disabled: loading, onClick: loadSystemFonts }, loading ? "正在读取…" : "读取 / 刷新本机字体"),
                        h("button", { type: "button", className: "dfl-btn", onClick: function () {
                            request.current++; sessionFonts = []; setSystemFonts([]); setLoading(false);
                            setFontStatus('已清除本次读取的名单；已选字体配置不变。');
                        } }, "清除已读取名单")),
                    h("p", { className: "dfl-hint", role: "status" }, fontStatus),
                    h("p", { className: "dfl-hint" }, "仅在点击后读取，字体文件只在本页解析，不上传、不保存字体清单。中文为常用简繁汉字抽样；等宽检测全部可打印 ASCII（含空格、标点）。仅各已枚举字面均满足时归类，差异或读取失败归入未完整识别；不保证汉字双宽或变体实例。")),
				h("div", { className: "dfl-global" },
					h("div", { className: "dfl-field" },
						h("span", { className: "dfl-fieldLabel" }, "全局字体（界面与会话正文）"),
						h(FamilyPicker, {
							value: state.globalFamily,
							placeholder: "留空则不覆盖；也可在下拉里选字体后点「添加」",
							systemFonts: systemFonts,
							onLoadSystemFonts: loadSystemFonts,
							onChange: function (value) { patchState({ globalFamily: value, master: true }); },
						})),
					h("div", { className: "dfl-field" },
						h("span", { className: "dfl-fieldLabel" }, "等宽字体（代码、工具输出、终端）"),
						h(FamilyPicker, {
							value: state.globalMono,
                            mono: true,
							placeholder: "留空则不覆盖；也可在下拉里选字体后点「添加」",
							systemFonts: systemFonts,
							onLoadSystemFonts: loadSystemFonts,
							onChange: function (value) { patchState({ globalMono: value, master: true }); },
						})),
					h("p", { className: "dfl-hint", role: "status" }, store.getError()),
					h("p", { className: "dfl-hint" }, "这两项覆盖全部字号档位与 Markdown 各级的字体（它们默认都引用全局基座），所以日常只需要这两行。")),

				h("div", { className: "dfl-scale" },
					h("div", { className: "dfl-field" },
						h("span", { className: "dfl-fieldLabel" }, "界面整体缩放（文字与间距一起放大）"),
						h("div", { className: "dfl-presets" },
							UI_SCALES.map(function (scale) {
								return h("button", {
									key: scale,
									type: "button",
									className: "dfl-btn" + (Number(state.uiScale) === scale ? " dfl-btnActive" : ""),
									onClick: function () { patchState({ uiScale: scale, master: true }); },
								}, scale + "%");
							}))),
					h("label", { className: "dfl-field" },
						h("span", { className: "dfl-fieldLabel" }, "会话正文字号（px）"),
						h("input", {
							className: "dfl-input",
							type: "number",
							min: CONTENT_SIZE_MIN,
							max: CONTENT_SIZE_MAX,
							step: 1,
							placeholder: "留空则用官方设置（默认 " + FONT_CONTENT_DEFAULT + "）",
							value: state.contentSize,
							onChange: function (event) { patchState({ contentSize: event.target.value, master: true }); },
						})),
					h("p", { className: "dfl-hint" }, "整体缩放使用 CSS zoom 放大布局，界面文字、间距与图标一起放大；并非浏览器缩放，具体弹窗布局需按宿主核验。会话正文另有独立字号，也可用官方「外观 → 字号大小」。都是点一下即时生效。")),

                h("div", { className: "dfl-actions" },
                    h("button", { type: "button", className: "dfl-btn", onClick: restoreDefaults }, "清除字体、字号与缩放设置")),

				h(Fold, { className: "dfl-group" },
					h("summary", null, "高级：逐部位微调",
						h("span", { className: "dfl-count" }, " · " + (ROLE_SLOTS.length + SIZE_SLOTS.length + MARKDOWN_SLOTS.length) + " 个槽位"
							+ (advancedVarCount + advancedRuleCount > 0 ? "，已启用 " + advancedVarCount + " 槽位 / " + advancedRuleCount + " 规则" : ""))),
					h("div", { className: "dfl-rows" },
						h("p", { className: "dfl-hint" }, "高级项会压过上面的全局设置；不需要时保持关闭即可。"),
						ROLE_SLOTS.map(function (slot) {
							return h(VarRow, {
								key: slot.name,
								name: slot.name,
								label: slot.label,
								hint: slot.hint,
								entry: entryOf(state, slot.name),
								systemFonts: systemFonts,
								onLoadSystemFonts: loadSystemFonts,
								onToggle: function (on) { onVar(slot.name, { on: on }); },
								onChange: function (stack) { onVar(slot.name, { stack: stack, on: true }); },
							});
						})),
					h(SlotGroup, { title: "字号档位", slots: SIZE_SLOTS, state: state, onVar: onVar, systemFonts: systemFonts, onLoadSystemFonts: loadSystemFonts }),
					h(SlotGroup, { title: "Markdown 各级", slots: MARKDOWN_SLOTS, state: state, onVar: onVar, systemFonts: systemFonts, onLoadSystemFonts: loadSystemFonts }),
					h(Fold, { className: "dfl-group" },
						h("summary", null, "自定义选择器规则", h("span", { className: "dfl-count" }, " · " + (state.rules || []).length + " 条")),
						h("div", { className: "dfl-rows" },
							(state.rules || []).map(function (rule) {
								return h("div", { className: "dfl-ruleRow", key: rule.id },
									h("input", {
										type: "checkbox",
										checked: rule.on === true,
										onChange: function (event) { patchRule(rule.id, { on: event.target.checked }); },
									}),
									h("input", {
										className: "dfl-input",
										type: "text",
										spellCheck: false,
										"aria-label": "规则选择器", placeholder: "CSS 选择器（例如 [data-dsh-bottom-panel]）",
										value: rule.selector === undefined ? "" : rule.selector,
										onChange: function (event) { patchRule(rule.id, { selector: event.target.value, on: true }); },
									}),
									h("input", {
										className: "dfl-input",
										type: "text",
										"aria-label": "规则字体",
										spellCheck: false,
										placeholder: "字体族",
										value: rule.stack === undefined ? "" : rule.stack,
										onChange: function (event) { patchRule(rule.id, { stack: event.target.value, on: true }); },
									}),
									h("button", {
										type: "button",
										className: "dfl-btn dfl-btnDanger",
										title: "删除这条规则",
										onClick: function () { removeRule(rule.id); },
									}, "×"));
							}),
							h("button", { type: "button", className: "dfl-btn", onClick: addRule }, "+ 添加规则"),
							h("p", { className: "dfl-hint" }, "规则会在选中元素上强制 font-family（!important），适合覆盖变量够不到的具体面板。")))),

				h(Fold, { className: "dfl-group" },
					h("summary", null, "导出 / 固化"),
					h("div", { className: "dfl-rows" },
						h("p", { className: "dfl-hint" }, "下面是当前生效的 CSS。想脱离本插件固化，可把等价设置写进 profile patch 的 ui-theme 条目（textFontFamily / codeFontFamily / terminalFontFamily），或放进任意自定义 CSS 注入点。"),
						h("textarea", { className: "dfl-export", readOnly: true, value: css, spellCheck: false }),
						h("button", { type: "button", className: "dfl-btn", onClick: copyCss }, copied ? "已复制" : "复制 CSS"))));
		}


return FontLabSection;
}


		/** Host settings.section UI. Drafts never mutate chat until explicitly saved. */
var CP_STORAGE_KEY = 'dsh-code-pill.settings.v1';
function createSettingsStore() {
  var current = CP_SETTINGS.defaults();
  var listeners = new Set();
  var storageError = '';
  try {
    if (typeof localStorage !== 'undefined') {
      var saved = localStorage.getItem(CP_STORAGE_KEY);
      if (saved !== null) current = CP_SETTINGS.parse(saved);
    }
  } catch (err) { storageError = '已保存配置无法读取，当前使用默认设置：' + err.message; }
  function notify() { for (var cb of listeners) cb(); }
  function onStorage(event) {
    if (event.key !== CP_STORAGE_KEY) return;
    try {
      current = event.newValue === null ? CP_SETTINGS.defaults() : CP_SETTINGS.parse(event.newValue);
      storageError = '';
      notify();
    } catch (err) { storageError = '其他窗口的配置无效：' + err.message; notify(); }
  }
  return {
    getSnapshot: function () { return current; },
    getError: function () { return storageError; },
    subscribe: function (cb) {
      if (listeners.size === 0 && typeof window.addEventListener === 'function') window.addEventListener('storage', onStorage);
      listeners.add(cb);
      return function () {
        listeners.delete(cb);
        if (listeners.size === 0 && typeof window.removeEventListener === 'function') window.removeEventListener('storage', onStorage);
      };
    },
    save: function (input) {
      var next = CP_SETTINGS.normalize(input);
      if (typeof localStorage === 'undefined') throw new Error('浏览器存储不可用，设置未保存。');
      localStorage.setItem(CP_STORAGE_KEY, CP_SETTINGS.stringify(next));
      current = next;
      storageError = '';
      notify();
    }
  };
}

function installSettings(ctx, store, fontStore) {
  var slots = typeof ctx.get === 'function' ? ctx.get('slots') : ctx.slots;
  if (!slots) {
    if (typeof ctx.inject !== 'function') return function () {};
    var waiting = ctx.inject(['slots'], function (child) {
      child.effect(function () { return installSettings(child, store, fontStore); }, 'dsh-code-pill: deferred settings');
    });
    return function () { waiting.dispose(); };
  }
  if (typeof slots.inject !== 'function' || typeof slots.register !== 'function') return function () {};
  var React, ui;
  try {
    React = require('react');
    ui = require('@deepseek-ai/dsh-client-ui-primitives');
  } catch (err) {
    console.warn('dsh-code-pill: settings UI modules unavailable', err);
    return function () {};
  }
  if (!React || !ui || !ui.Button || !ui.Switch || !ui.Input) {
    console.warn('dsh-code-pill: settings require host Button, Switch and Input primitives');
    return function () {};
  }
  var h = React.createElement;
  var colorNames = { plain: '默认文字', kwc: '控制流', kwd: '声明与类型', str: '字符串', com: '注释', num: '数字', bg: '胶囊底色', badgeBg: '徽章底色', badgeText: '徽章文字' };
  function tokenText(text, config, theme) {
    var toks = config.syntax ? tokenizeRanges(text, false) : [];
    var nodes = [], position = 0;
    for (var token of toks) {
      if (token.start > position) nodes.push(text.slice(position, token.start));
      nodes.push(h('span', { key: token.start, style: { color: config[theme][token.cls] || config[theme].plain } }, text.slice(token.start, token.end)));
      position = token.end;
    }
    if (position < text.length) nodes.push(text.slice(position));
    return nodes;
  }
  function Preview(props) {
    var cfg = props.config, theme = props.theme;
    var vars = CP_SETTINGS.previewStyle(cfg, theme);
    var isDark = theme === 'dark';
    function code(text, badge, syntax) {
      var attributes = { className: 'dshcp-pill' };
      if (badge && (cfg.marker === 'label' || cfg.marker === 'both')) attributes['data-dshcp-badge'] = badge;
      if (badge && (cfg.marker === 'icon' || cfg.marker === 'both')) attributes['data-dshcp-icon'] = 'file';
      return h('code', attributes, syntax ? tokenText(text, cfg, theme) : text);
    }
    var blockStyle = cfg.blockTheme === 'preset' ? { color: cfg[theme].plain } : {};
    return h('div', { className: 'dshcp-preview', 'data-dshcp-preview': '', 'data-preview-theme': theme, style: Object.assign({}, vars, { background: isDark ? '#1e1e1e' : '#ffffff', color: isDark ? '#d7d7d7' : '#292929' }) },
      h('div', { className: 'dshcp-preview-caption' }, '预览 · ', isDark ? '深色' : '浅色', ' · 不影响当前聊天'),
      h('p', null, '在 ', code('src/settings.ts', 'TS'), ' 中调整 ', code('fontScale'), '，让长篇回答更容易阅读。'),
      h('p', null, '声明 ', code('const count = 42', null, true), '，调用 ', code('print("hello")', null, true), '。'),
      h('p', null, '执行 ', code('npm run build'), '，检查 ', code('Dockerfile', 'DOCKER'), '。'),
      h('pre', { className: 'dshcp-preview-block', style: blockStyle }, cfg.blockTheme === 'preset' ? tokenText('const count = 42; // 当前预设配色', Object.assign({}, cfg, { syntax: true }), theme) : 'const count = 42; // 保留宿主配色（示意）'));
  }
  function CodeAppearance() {
    var saved = React.useSyncExternalStore(store.subscribe, store.getSnapshot);
    var draftState = React.useState(function () { return CP_SETTINGS.normalize(saved); });
    var draft = draftState[0], setDraft = draftState[1];
    var themeState = React.useState('light'), theme = themeState[0], setTheme = themeState[1];
    var statusState = React.useState(store.getError()), status = statusState[0], setStatus = statusState[1];
    var transferState = React.useState(''), transfer = transferState[0], setTransfer = transferState[1];
    var dirty = CP_SETTINGS.stringify(draft) !== CP_SETTINGS.stringify(saved);
    function change(key, value) { setDraft(function (old) { return Object.assign({}, old, { [key]: value, preset: 'custom' }); }); setStatus(''); }
    function color(role, value) {
      setDraft(function (old) { return Object.assign({}, old, { preset: 'custom', [theme]: Object.assign({}, old[theme], { [role]: value }) }); });
      setStatus('');
    }
    function button(label, onClick, primary, disabled) { return h(ui.Button, { type: 'button', size: 'sm', variant: primary ? 'primary' : 'outline', onClick: onClick, disabled: !!disabled }, label); }
    function range(label, key, min, max, step, suffix) {
      return h('label', { className: 'dshcp-slider', key: key }, h('span', null, label, h('output', null, String(Math.round(draft[key] * 100) / 100), suffix)),
        h('input', { type: 'range', min: min, max: max, step: step, value: draft[key], 'aria-label': label, onChange: function (event) { change(key, Number(event.target.value)); } }));
    }
    var warnings = CP_SETTINGS.audit(draft, theme, theme === 'dark' ? '#1e1e1e' : '#ffffff').filter(function (item) { return !item.pass; });
    return h('div', { className: 'dshcp-settings' },
      h('header', { className: 'dshcp-settings-header' }, h('div', null, h('h2', null, 'Code Pill'), h('p', null, '让代码融入阅读，而不是打断阅读。')), h('span', { className: 'dshcp-local-tag' }, '本浏览器设置')),
      h('div', { className: 'dshcp-settings-toolbar', role: 'group', 'aria-label': 'Code Pill 操作' }, h('span', { role: 'status', className: 'dshcp-hint' }, status || (dirty ? '有未保存的更改' : '已与保存设置一致')),
        h('div', { className: 'dshcp-actions' }, button('恢复默认', function () { setDraft(CP_SETTINGS.defaults()); setStatus('默认设置已进入草稿；保存后应用。'); }),
          button('取消更改', function () { setDraft(CP_SETTINGS.normalize(saved)); setStatus('已取消未保存的更改。'); }, false, !dirty),
          button('保存并应用', function () { try { store.save(draft); setStatus('已保存并应用。'); } catch (err) { setStatus('保存失败：' + err.message); } }, true, !dirty))),
      h('section', { className: 'dshcp-panel' }, h('h3', null, '外观预设'), h('p', { className: 'dshcp-hint' }, '选择会替换色板与排版草稿；保存后才应用。'),
        h('div', { className: 'dshcp-preset-grid' }, CP_SETTINGS.PRESETS.map(function (preset) {
          return h('button', { type: 'button', key: preset.id, className: 'dshcp-preset', 'aria-pressed': draft.preset === preset.id, onClick: function () { setDraft(CP_SETTINGS.presetConfig(preset.id)); setStatus(''); } },
            h('span', { className: 'dshcp-swatches', 'aria-hidden': true }, ['plain', 'kwd', 'str', 'num'].map(function (role) { return h('i', { key: role, style: { background: preset[theme][role] } }); })),
            h('strong', null, preset.name), h('small', null, preset.description));
        })), draft.preset === 'custom' ? h('p', { className: 'dshcp-hint' }, '当前：自定义') : null),
      h('section', { className: 'dshcp-panel' }, h('div', { className: 'dshcp-section-heading' }, h('h3', null, '色板与预览'), h('div', { className: 'dshcp-theme-toggle', role: 'group', 'aria-label': '编辑色板主题' },
        button('浅色', function () { setTheme('light'); }, theme === 'light'), button('深色', function () { setTheme('dark'); }, theme === 'dark'))),
        h(Preview, { config: draft, theme: theme }),
        h('div', { className: 'dshcp-color-grid' }, Object.keys(colorNames).map(function (role) {
          return h('label', { className: 'dshcp-color-field', key: role }, h('span', null, colorNames[role]),
            h('div', null, h('input', { type: 'color', value: draft[theme][role], 'aria-label': colorNames[role] + '颜色', onChange: function (event) { color(role, event.target.value); } }),
              h(ui.Input, { key: theme + draft[theme][role], defaultValue: draft[theme][role], 'aria-label': colorNames[role] + '十六进制', maxLength: 7, onBlur: function (event) {
                var value = event.target.value;
                if (/^#[0-9a-f]{6}$/i.test(value)) color(role, value.toLowerCase());
                else { event.target.value = draft[theme][role]; setStatus('颜色需要完整的 #RRGGBB；已恢复原值。'); }
              } })));
        })),
        warnings.length ? h('p', { className: 'dshcp-warning', role: 'status' }, '低对比度提醒：', warnings.map(function (item) { return (colorNames[item.role] || item.role) + ' ' + item.ratio.toFixed(2) + ':1'; }).join('；'), '。仍可保存。') : h('p', { className: 'dshcp-hint' }, '当前预览背景下，全部文字达到 4.5:1。实际会话背景可能不同。')),
      h('section', { className: 'dshcp-panel' }, h('h3', null, '显示与排版'),
        h('div', { className: 'dshcp-control-row' }, h('div', null, h('strong', null, '行内语法着色'), h('small', null, '关闭后保留统一文字颜色')), h(ui.Switch, { checked: draft.syntax, label: '行内语法着色', onChange: function (value) { change('syntax', value); } })),
        h('label', { className: 'dshcp-control-row' }, h('span', null, '文件标记'), h('select', { 'aria-label': '文件标记', value: draft.marker, onChange: function (event) { change('marker', event.target.value); } }, ['off', 'label', 'icon', 'both'].map(function (mode, index) { return h('option', { value: mode, key: mode }, ['关闭', '语言文字', '小图标', '图标＋文字'][index]); }))),
        h('div', { className: 'dshcp-slider-grid' }, range('字号比例', 'fontScale', .8, 1.1, .01, '×'), range('圆角', 'radius', 0, 10, 1, 'px'), range('水平内边距', 'padding', 0, .6, .01, 'em'), range('底色强度', 'bgOpacity', 0, .2, .005, '')),
        h('label', { className: 'dshcp-control-row' }, h('span', null, '代码块颜色'), h('select', { 'aria-label': '代码块颜色', value: draft.blockTheme, onChange: function (event) { change('blockTheme', event.target.value); } }, h('option', { value: 'host' }, '保留宿主配色'), h('option', { value: 'preset' }, '使用当前色板')))),
      h('details', { className: 'dshcp-panel' }, h('summary', null, '导入／导出配置'), h('p', { className: 'dshcp-hint' }, '仅导出 Code Pill 外观配置，不包含聊天内容。导入先进入草稿。'),
        h('textarea', { value: transfer, 'aria-label': '配置 JSON', spellCheck: false, placeholder: '粘贴配置 JSON，或点击导出草稿', onChange: function (event) { setTransfer(event.target.value); } }),
        h('div', { className: 'dshcp-actions' }, button('导出草稿', function () { setTransfer(CP_SETTINGS.stringify(draft)); setStatus('草稿已导出到文本框，可选中复制。'); }), button('导入草稿', function () { try { setDraft(CP_SETTINGS.parse(transfer)); setStatus('导入成功；点击保存后应用。'); } catch (err) { setStatus('导入失败：' + err.message); } }))),
    );
  }
  var FontSettings = createFontSettings(React, fontStore);
  function SettingsPage() {
    var tabState = React.useState('appearance'), tab = tabState[0], setTab = tabState[1];
    return h('div', null,
      h('div', { className: 'dshcp-tabs', role: 'tablist', 'aria-label': 'Code Pill 设置分类' }, ['appearance', 'fonts'].map(function (id, index) {
        return h('button', { key: id, type: 'button', role: 'tab', id: 'dshcp-tab-' + id, 'aria-controls': 'dshcp-panel-' + id, 'aria-selected': tab === id, tabIndex: tab === id ? 0 : -1,
          onClick: function () { setTab(id); }, onKeyDown: function (event) {
            var next = event.key === 'Home' ? 'appearance' : event.key === 'End' ? 'fonts' : /^(ArrowLeft|ArrowRight)$/.test(event.key) ? (tab === 'fonts' ? 'appearance' : 'fonts') : null;
            if (next) { event.preventDefault(); setTab(next); document.getElementById('dshcp-tab-' + next).focus(); }
          } }, ['代码外观', '字体'][index]);
      })),
      h('div', { role: 'tabpanel', id: 'dshcp-panel-appearance', 'aria-labelledby': 'dshcp-tab-appearance', hidden: tab !== 'appearance' }, h(CodeAppearance)),
      h('div', { role: 'tabpanel', id: 'dshcp-panel-fonts', 'aria-labelledby': 'dshcp-tab-fonts', hidden: tab !== 'fonts', 'data-dshcp-preview': '' }, tab === 'fonts' ? h(FontSettings) : null));
  }
  var registration = slots.inject('settings.section', function () {
    return slots.register({ name: 'settings.section', id: 'dsh-code-pill', order: 65, label: function () { return 'Code Pill'; } }, function () { return h(SettingsPage); });
  });
  return typeof registration === 'function' ? registration : function () {};
}


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
