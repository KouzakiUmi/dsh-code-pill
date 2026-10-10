/**
 * dsh-code-pill — tokenizer 行为测试（node 直跑，无测试框架）。
 *
 * 覆盖：通用 token 分类（keyword/string/number/comment/函数调用/属性/
 * 类型/常量）、shell 特化（--flag、$VAR）、注释规则的防误伤边界
 * （URL、CSS 颜色、自减）、文件名徽章检测、命令检测。
 * 用例断言的是「类别序列」，颜色本身在 styles.css（VS Code 调色板）。
 */
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const { tokenizeRanges, detectBadge, detectCommand, detectInlineMode, detectInlineContext } = require('../src/tokenizer.cjs')

/** 断言 src 的着色类别序列（按出现顺序）等于 expected。 */
function assertClasses(src, expected, options = {}) {
  const toks = tokenizeRanges(src, options.bash === true)
  const classes = toks.map((t) => t.cls)
  assert.deepEqual(classes, expected, `${JSON.stringify(src)} → ${JSON.stringify(classes)}`)
  // 区间必须单调、落在文本范围内
  let lastEnd = 0
  for (const t of toks) {
    assert.ok(t.start >= lastEnd, `start ${t.start} after ${lastEnd}`)
    assert.ok(t.end > t.start && t.end <= src.length, `end ${t.end} in range`)
    lastEnd = t.end
  }
}

let passed = 0
function test(name, fn) {
  fn()
  passed++
}

// ---- 通用分类 ----
test('plain identifier stays uncolored', () => {
  assertClasses('postings', [])
  assertClasses('buildSearchIndex', [])
})

test('function call gets fn', () => {
  assertClasses('arr.includes(idx)', ['fn'])
  assertClasses('print("hi")', ['fn', 'str'])
})

test('property after dot gets prm', () => {
  assertClasses('st.mode', ['prm'])
  assertClasses('obj.type', ['prm'])
})

test('assignment with string', () => {
  assertClasses('st.mode = "ready"', ['prm', 'str'])
})

test('js snippet: keyword/function/control/string', () => {
  assertClasses("function itWorks() { return 'It works'; }", ['kwd', 'fn', 'kwc', 'str'])
})

test('python: def/None/True/False', () => {
  assertClasses('def load(x): return None', ['kwd', 'fn', 'kwc', 'kwd'])
  assertClasses('flag = True', ['kwd'])
})

test('numbers incl hex and float', () => {
  assertClasses('x = 0x1F + 1.5e3', ['num', 'num'])
  assertClasses('retry(3)', ['fn', 'num'])
})

test('constants: ALL_CAPS', () => {
  assertClasses('API_KEY', ['cst'])
  assertClasses('MAX_RETRIES', ['cst'])
})

test('types: PascalCase', () => {
  assertClasses('SearchIndex', ['typ'])
  assertClasses('Set.has', ['typ', 'prm'])
})

// ---- 注释规则与防误伤边界 ----
test('line comment', () => {
  assertClasses('// TODO later', ['com'])
})

test('block comment', () => {
  assertClasses('/* note */ x', ['com'])
})

test('hash comment (space after #)', () => {
  assertClasses('# comment', ['com'])
  assertClasses('x # trailing', ['com'])
})

test('hash does not eat CSS color or shebang-less #', () => {
  assertClasses('#fff', [])
  assertClasses('a#b', [])
})

test('url // is not a comment', () => {
  // https 的 // 不当注释；example.com 的 com 是点后属性（prm）
  assertClasses('https://example.com', ['prm'])
})

test('sql dash-dash comment only after space', () => {
  assertClasses('SELECT 1 -- count', ['kwd', 'num', 'com'])
  assertClasses('i--', [])
})

test('html comment', () => {
  assertClasses('<!-- hi -->', ['com'])
})

// ---- SQL（大写表）----
test('sql uppercase keywords', () => {
  assertClasses('SELECT * FROM users WHERE id = 1', ['kwd', 'kwd', 'kwd', 'num'])
})

test('JS Set is a type, not SQL SET', () => {
  assertClasses('Set', ['typ'])
})

// ---- shell 特化 ----
test('command detection', () => {
  assert.equal(detectCommand('git commit -m "fix"'), true)
  assert.equal(detectCommand('pnpm install'), true)
  assert.equal(detectCommand('st.mode = "ready"'), false)
  assert.equal(detectCommand(''), false)
})

test('bash flags and vars', () => {
  assertClasses('git commit --amend', ['prm'], { bash: true })
  assertClasses('git commit -m "fix: bug"', ['prm', 'str'], { bash: true })
  assertClasses('echo $HOME/bin', ['fn', 'cst'], { bash: true })
})

test('non-bash --flag stays plain', () => {
  assertClasses('a --flag', [])
})

// ---- 徽章检测 ----
test('file badges', () => {
  assert.equal(detectBadge('search.mjs'), 'JS')
  assert.equal(detectBadge('package.json'), 'JSON')
  assert.equal(detectBadge('src/lib/state.mjs'), 'JS')
  assert.equal(detectBadge('README.md'), 'MD')
  assert.equal(detectBadge('Dockerfile'), 'DOCKER')
  assert.equal(detectBadge('.env'), 'ENV')
  assert.equal(detectBadge('foo.d.ts'), 'TS')
})

test('badge rejects non-files', () => {
  assert.equal(detectBadge('st.mode'), null)
  assert.equal(detectBadge('arr.includes(idx)'), null)
  assert.equal(detectBadge('v1.2.3'), null)
  assert.equal(detectBadge(''), null)
  assert.equal(detectBadge('some sentence with spaces.mjs'), null)
})

// ---- 区间与文本一致性 ----
test('ranges slice back to source', () => {
  const src = "function itWorks() { return 'It works'; }"
  for (const t of tokenizeRanges(src, false)) {
    assert.equal(src.slice(t.start, t.end).length, t.end - t.start)
  }
})

test('inline prose, file paths and URLs remain uniform', () => {
  for (const text of ['CSS_TEXT', 'MutationObserver', 'JS', 'JSON', '--flag', '$VAR', 'data-*', '::before', '.shiki-*', 'package.json', 'src/tokenizer.cjs', 'C:\\Program Files\\DSH NEXT\\lib\\index.js', 'local-plugins/dsh-code-pill', 'https://example.com', 'nodeValue', 'obj.type']) {
    assert.equal(detectInlineMode(text), 'plain', text)
  }
})
test('only explicit snippets and complete command words enable syntax', () => {
  assert.equal(detectInlineMode('node scripts/build.mjs'), 'shell')
  assert.equal(detectInlineMode('git commit -m "fix"'), 'shell')
  assert.equal(detectInlineMode('const value = 42'), 'code')
  assert.equal(detectInlineMode('print("hi")'), 'code')
  assert.equal(detectCommand('nodeValue = 3'), false)
  assert.equal(detectCommand('git.commit()'), false)
})

// ---- detectInlineContext：mode 与 badge 一次计算（client 唯一入口）----
test('inline context: badge forces plain, badge only computed once', () => {
  assert.deepEqual(detectInlineContext('state.mjs'), { mode: 'plain', badge: 'JS' })
  assert.deepEqual(detectInlineContext('Dockerfile'), { mode: 'plain', badge: 'DOCKER' })
  assert.deepEqual(detectInlineContext('src/tokenizer.cjs'), { mode: 'plain', badge: 'JS' })
})

test('inline context: non-file inputs keep their mode with null badge', () => {
  assert.deepEqual(detectInlineContext('git status'), { mode: 'shell', badge: null })
  assert.deepEqual(detectInlineContext('const value = 42'), { mode: 'code', badge: null })
  assert.deepEqual(detectInlineContext('MutationObserver'), { mode: 'plain', badge: null })
})

test('inline context: mode always agrees with detectInlineMode', () => {
  for (const text of ['x = 1', 'README.md', 'pnpm install', 'obj.type', 'https://example.com', 'Set.has', '# comment']) {
    assert.equal(detectInlineContext(text).mode, detectInlineMode(text), text)
  }
})
console.log(`dsh-code-pill tokenizer: ${passed} tests passed`)
