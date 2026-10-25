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

/**
 * 路径形状判定：宿主工具行（read/write/edit）摘要里的文件路径。
 * 只认「无空白、路径字符、且是已知文件名或带目录分隔符」的短文本——
 * URL、命令、术语一律不认。宁可漏染，不误伤术语（DESIGN.md §2.2）。
 * @param src - 候选文本。
 * @returns true 表示该文本像一条文件路径。
 */
function detectPathLike(src) {
  if (typeof src !== 'string') return false;
  var s = src.trim();
  if (s.length === 0 || s.length > 200 || /\s/.test(s)) return false;
  // URL 自带分隔符与协议，先排除，避免把 http(s) 地址当路径。
  if (/^[a-z][\w+.-]*:\/\//i.test(s)) return false;
  s = s.replace(/#L\d+(?:-L?\d+)?$/, '');
  if (detectBadge(s) !== null) return true;
  var path = s.replace(/\\/g, '/');
  path = path.replace(/^[a-z]:\//i, '').replace(/^\/{1,2}/, '');
  return /^(?:[\p{L}\p{N}_.~-]+\/)+[\p{L}\p{N}_.~-]+$/u.test(path);
}

/** 首词是否为已知命令（决定整段是否按 shell 规则着色）。 */
function detectCommand(src) {
  if (typeof src !== 'string') return false;
  var m = /^\s*([A-Za-z][\w-]*)/.exec(src);
  return m !== null && COMMANDS.has(m[1]) && (src[m[0].length] === undefined || /\s/.test(src[m[0].length]));
}

/**
 * 句子级降级检测：宿主 Markdown 解析器把成对反引号间的普通文字并进同一个
 * code span 时（开口与收口反引号都粘连在正文里，聊天流中整句被套上代码
 * 底色与等宽字体），插件不能改正文子节点，也无法把宿主的 code 拆回去，
 * 只能降级装饰：识别出「成对反引号包着真实片段 + 足够长的散文尾巴」的
 * 句子级文本后，把文字指回正文变量并取消等宽字体；底色与内边距保留
 * （多行折叠时表现为行块底色，属于可接受的降级）。样式走普通文本级联，
 * token 高亮仍走 ::highlight 伪元素，不受这条规则影响。
 *
 * 判定边界：
 * - 文本含且仅含一对反引号，且引号外至少一侧有正文（整段代码并进来时
 *   两侧都是代码，不算）；第三枚反引号视为嵌套结构，不猜。注意：作者用
 *   双反引号定界符书写的合法行内代码（内容含字面反引号）无法与融合区分，
 *   会被一并降级——只影响颜色/字体，不改文字，可在设置中关闭；
 * - 两引号之间是「短、至少含一个词字符、无句读」的片段；过长的多是
 *   被折叠的多行代码，含句读的说明反引号自成结构，均不降级；
 * - 开口前若有正文，不得含引号、赋值、管道、反斜杠等代码字符，也不得以
 *   已知命令（echo、cp 等）或语句关键字（return 等）起头，否则
 *   `echo `date` foo bar` 这类命令替换示例会被误降级；
 * - 收口引号之后存在散文尾巴：至少两个词（中日韩文字每 2 字符折算 1 词，
 *   与紧贴的拉丁词分开计数），且非空白长度足够长，或开口前已有正文
 *   （句子被引号截断）。词数要求保住了 `echo `date` output` 这类真实的命令替换示例。
 */
var SENTENCE_MAX = 300;
var SENTENCE_TAIL = 24;
var SENTENCE_FRAG = 120;
// 以这些语句关键字起头的开口前缀视为代码而非正文（命令词另用 COMMANDS）。
var SENTENCE_CODE_LEAD = new Set(('return throw yield await new delete typeof import export const let var ' +
  'function class def print console').split(' '));
// 散文词数：中日韩文字不以空白分词，先把每段连续文字按每 2 个字符折算 1 个词
// （rounding 指定取整方式），再把它们替换成空白，数剩余的拉丁／数字词，
// 避免拉丁词匹配把后面紧贴的中文吞成同一个词。
function countWords(text, rounding) {
  var count = 0;
  var rest = text.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu, function (run) {
    count += rounding(run.length / 2);
    return ' ';
  });
  var latin = rest.match(/[\p{L}\p{N}][\p{L}\p{N}_-]*/gu);
  return count + (latin === null ? 0 : latin.length);
}
function detectSentenceFallback(src) {
  if (typeof src !== 'string' || src.length > SENTENCE_MAX || src.length < 3) return false;
  var open = src.indexOf('`');
  if (open === -1) return false;
  var close = src.indexOf('`', open + 1);
  if (close === -1 || close === open + 1) return false;
  if (src.indexOf('`', close + 1) !== -1) return false;
  var proseBefore = open > 0;
  if (!proseBefore && close >= src.length - 1) return false;
  var frag = src.slice(open + 1, close);
  if (frag.length > SENTENCE_FRAG || /[\p{L}\p{N}]/u.test(frag) === false) return false;
  if (/[;；，。！？、]/.test(frag)) return false;
  // 开口前若为正文，应以词、闭括号或冒号收尾（句子被引号截断的常见位置）；
  // 标点收尾说明引号自成一词（正常 Markdown 行内代码），保持宿主样式。
  if (proseBefore) {
    var head = src.slice(0, open);
    if (!/[\p{L}\p{N}_)\]:]\s*$/u.test(head)) return false;
    // 开口前必须像正文：不含引号、赋值、管道等代码字符，且不以已知命令或语句
    // 关键字起头（区分大小写，句首大写的普通英文词不受影响）；
    // 否则 `echo `date` foo bar`、`return `x` + y` 这类代码示例会被误当成整句。
    if (/["$={}|\\]/.test(head)) return false;
    var lead = head.match(/^\s*([\w-]+)/);
    if (lead !== null && (COMMANDS.has(lead[1]) || SENTENCE_CODE_LEAD.has(lead[1]))) return false;
  }
  var tail = src.slice(close + 1);
  var tailSolid = tail.replace(/\s/g, '');
  if (tailSolid.length === 0) return false;
  if (countWords(tail, Math.floor) < 2) return false;
  return tailSolid.length >= SENTENCE_TAIL || proseBefore;
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
  module.exports = { tokenizeRanges, detectBadge, detectCommand, detectInlineMode, detectInlineContext, detectPathLike, detectSentenceFallback };
}
