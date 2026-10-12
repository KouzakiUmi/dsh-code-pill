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
.dshcp-settings { color: var(--dsw-alias-label-primary-foreground, inherit); max-width: 820px; padding: 8px 4px 20px; }
.dshcp-settings * { box-sizing: border-box; }
.dshcp-settings-header, .dshcp-section-heading, .dshcp-control-row, .dshcp-settings-footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.dshcp-settings h2 { margin: 0; font-size: 22px; font-weight: 650; letter-spacing: -.02em; }
.dshcp-settings h3 { margin: 0 0 12px; font-size: 14px; font-weight: 650; }
.dshcp-settings-header p { margin: 6px 0 18px; }
.dshcp-hint, .dshcp-settings-header p, .dshcp-control-row small { color: var(--dsw-alias-label-secondary-foreground, #757575); font-size: 12px; line-height: 1.6; }
.dshcp-local-tag { font-size: 10px; padding: 3px 7px; border-radius: 6px; color: var(--dsw-alias-label-secondary-foreground, #757575); background: var(--dsw-alias-bg-layer-1, #8881); white-space: nowrap; }
.dshcp-panel { padding: 16px; border: 1px solid var(--dsw-alias-border-l4, #8883); border-radius: 12px; margin-bottom: 14px; }
.dshcp-panel > .dshcp-hint { margin: 0 0 12px; }
.dshcp-preset-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(135px,1fr)); gap: 8px; }
.dshcp-preset { padding: 12px; border: 1px solid var(--dsw-alias-border-l4, #8884); border-radius: 8px; text-align: left; color: inherit; background: var(--dsw-alias-bg-layer-1, transparent); cursor: pointer; }
.dshcp-preset[aria-pressed='true'] { border-color: var(--dsw-alias-brand-primary, #916200); box-shadow: inset 0 0 0 1px var(--dsw-alias-brand-primary, #916200); }
.dshcp-preset:hover { background: var(--dsw-alias-bg-layer-2, #8881); }
.dshcp-preset strong { display: block; font-size: 12px; margin: 9px 0 4px; }
.dshcp-preset small { display: block; font-size: 10px; line-height: 1.5; color: var(--dsw-alias-label-secondary-foreground, #757575); }
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
.dshcp-warning { color: var(--dsw-alias-state-warning-primary, #a85f00); font-size: 12px; line-height: 1.7; margin-bottom: 0; }
.dshcp-control-row { padding: 10px 0; font-size: 12px; }
.dshcp-control-row small { display: block; }
.dshcp-settings select { color: inherit; background: var(--dsw-alias-bg-layer-1, transparent); border: 1px solid var(--dsw-alias-border-l4, #8884); padding: 6px 8px; border-radius: 6px; font: inherit; max-width: 65%; }
.dshcp-slider-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px 20px; padding: 14px 0; }
.dshcp-slider > span { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 6px; }
.dshcp-slider output { color: var(--dsw-alias-label-secondary-foreground, #757575); }
.dshcp-slider input { width: 100%; accent-color: var(--dsw-alias-brand-primary, #916200); }
.dshcp-settings summary { cursor: pointer; font-size: 12px; font-weight: 600; }
.dshcp-settings textarea { width: 100%; min-height: 140px; resize: vertical; color: inherit; background: var(--dsw-alias-bg-layer-1, transparent); border: 1px solid var(--dsw-alias-border-l4, #8884); border-radius: 6px; padding: 10px; margin: 10px 0; font: inherit; font-size: 12px; }
.dshcp-settings-footer { position: sticky; bottom: 0; padding: 12px 0; background: var(--dsw-alias-bg-layer-0, Canvas); border-top: 1px solid var(--dsw-alias-border-l4, #8883); flex-wrap: wrap; }
.dshcp-settings :focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #916200); outline-offset: 3px; }
@media (max-width: 480px) { .dshcp-panel { padding: 12px; } .dshcp-slider-grid { grid-template-columns: 1fr; } .dshcp-settings-header { align-items: flex-start; } }
@media (forced-colors: active) { code.dshcp-pill { outline: 1px solid CanvasText; } .dshcp-preset[aria-pressed='true'] { outline: 2px solid Highlight; } }
`;

		/**
 * dsh-code-pill — settings core（纯函数，无依赖）。
 *
 * 设置页的数据契约：五套配对深浅色预设、自定义色板、图标徽章开关、
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

function installSettings(ctx, store) {
  var slots = typeof ctx.get === 'function' ? ctx.get('slots') : ctx.slots;
  if (!slots) {
    if (typeof ctx.inject !== 'function') return function () {};
    var waiting = ctx.inject(['slots'], function (child) {
      child.effect(function () { return installSettings(child, store); }, 'dsh-code-pill: deferred settings');
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
  function SettingsPage() {
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
      h('footer', { className: 'dshcp-settings-footer' }, h('span', { role: 'status', className: 'dshcp-hint' }, status || (dirty ? '有未保存的更改' : '已与保存设置一致')),
        h('div', { className: 'dshcp-actions' }, button('恢复默认', function () { setDraft(CP_SETTINGS.defaults()); setStatus('默认设置已进入草稿；保存后应用。'); }),
          button('取消更改', function () { setDraft(CP_SETTINGS.normalize(saved)); setStatus('已取消未保存的更改。'); }, false, !dirty),
          button('保存并应用', function () { try { store.save(draft); setStatus('已保存并应用。'); } catch (err) { setStatus('保存失败：' + err.message); } }, true, !dirty))));
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
			function settings() {
				return typeof installSettings === "function" ? installSettings(ctx, store) : function () {};
			}
			function render() { return startRendering(store); }
			if (typeof ctx.effect === "function") {
				ctx.effect(settings, "dsh-code-pill: settings UI");
				ctx.effect(render, "dsh-code-pill: inline code rendering");
			} else {
				var cleanupSettings = settings();
				var cleanupRender = render();
				if (typeof ctx.on === "function") ctx.on("dispose", function () {
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
