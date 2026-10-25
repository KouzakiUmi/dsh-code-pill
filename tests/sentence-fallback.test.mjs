/**
 * dsh-code-pill — 句子级降级浏览器测试（真实 Chromium）。
 *
 * 覆盖：成对反引号粘连正文的整句 code 降级（正文色/正文字体/无徽章/无 token 高亮，
 * 保留胶囊底色）、正常行内代码不受影响、开关关闭后回到完整代码渲染、卸载清理。
 * 测试页只复刻宿主聊天里的 code 形态，不是宿主整页截图验证。
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const { CP_SETTINGS } = require('../src/settings-core.cjs')

const STORAGE_KEY = 'dsh-code-pill.settings.v1'
const FUSED = 'Let me check for processes that have `G:` as CWD: Get-Process and list the results'

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.route('https://code-pill.test/**', route => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: `<body style="color:#24292f;font:16px Arial;padding:24px;margin:0">`
      + `<p id="fused"><code>${FUSED}</code></p>`
      + `<p id="plain">Run <code>npm test</code> and see <code>src/tokenizer.cjs</code>.</p>`
      + `</body>`,
  }))

  async function boot() {
    await page.goto('https://code-pill.test/')
    await page.evaluate(() => { window.__ModuleLoader__ = { load(spec) { spec.factory(() => {}).apply({ effect(cb) { window.cleanup = cb() } }) } } })
    await page.addScriptTag({ content: readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8') })
    await page.waitForFunction(() => document.querySelectorAll('.dshcp-pill').length === document.querySelectorAll('code').length)
  }

  // ---- 默认开启：整句降级，正常行内代码不受影响 ----
  await boot()
  const rendered = await page.evaluate(() => {
    const styleOf = (el) => {
      const cs = getComputedStyle(el)
      return { color: cs.color, font: cs.fontFamily, size: cs.fontSize }
    }
    const fused = document.querySelector('#fused code')
    const [runCode, pathCode] = document.querySelectorAll('#plain code')
    return {
      pillCount: document.querySelectorAll('.dshcp-pill').length,
      fusedMarked: fused.hasAttribute('data-dshcp-sentence'),
      fusedBadge: fused.hasAttribute('data-dshcp-badge'),
      fusedStyle: styleOf(fused),
      runColor: styleOf(runCode).color,
      runSize: styleOf(runCode).size,
      pathBadge: pathCode.dataset.dshcpBadge ?? null,
      kwdRanges: CSS.highlights.get('dshcp-kwd').size,
      strRanges: CSS.highlights.get('dshcp-str').size,
    }
  })
  assert.equal(rendered.pillCount, 3, 'sentence code keeps the pill background')
  assert.equal(rendered.fusedMarked, true, 'fused sentence is marked for fallback')
  assert.equal(rendered.fusedBadge, false, 'fused sentence gets no file badge')
  assert.equal(rendered.fusedStyle.color, 'rgb(36, 41, 47)', 'sentence text falls back to body colour')
  assert.ok(rendered.fusedStyle.font.includes('Arial'), 'sentence font falls back to body font')
  assert.equal(rendered.fusedStyle.size, '16px', 'sentence font-size falls back to surrounding text')
  assert.equal(rendered.runColor, 'rgb(145, 98, 0)', 'normal inline code keeps the plain palette colour')
  assert.equal(rendered.runSize, '15.04px', 'normal inline code keeps the plugin font scale')
  assert.equal(rendered.pathBadge, 'JS', 'normal file code keeps its badge')
  assert.equal(rendered.kwdRanges, 0, 'sentence text is not tokenized (no keyword ranges)')
  assert.equal(rendered.strRanges, 0, 'sentence text is not tokenized (no string ranges)')
  assert.deepEqual(pageErrors, [], 'no page errors')

  // ---- 开关关闭：恢复完整代码渲染 ----
  const off = Object.assign(CP_SETTINGS.defaults(), { sentenceFallback: false })
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, CP_SETTINGS.stringify(off)])
  await boot()
  const offState = await page.evaluate(() => {
    const fused = document.querySelector('#fused code')
    return {
      pill: fused.classList.contains('dshcp-pill'),
      marked: fused.hasAttribute('data-dshcp-sentence'),
      color: getComputedStyle(fused).color,
    }
  })
  assert.equal(offState.pill, true, 'pill retained when the toggle is off')
  assert.equal(offState.marked, false, 'sentence marker removed when the toggle is off')
  assert.equal(offState.color, 'rgb(145, 98, 0)', 'sentence renders with the plain palette colour when off')

  // ---- 动态：同一 code 的文本在文件名与融合句之间切换 ----
  await page.evaluate(([key]) => localStorage.removeItem(key), [STORAGE_KEY])
  await boot()
  const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
  const probe = () => page.evaluate(() => {
    const code = document.querySelector('#plain code:nth-of-type(2)')
    return { marked: code.hasAttribute('data-dshcp-sentence'), badge: code.dataset.dshcpBadge ?? null, color: getComputedStyle(code).color }
  })
  assert.deepEqual(await probe(), { marked: false, badge: 'JS', color: 'rgb(145, 98, 0)' }, 'file code starts with badge and palette colour')
  await page.evaluate((text) => { document.querySelector('#plain code:nth-of-type(2)').firstChild.nodeValue = text }, FUSED)
  await frame()
  assert.deepEqual(await probe(), { marked: true, badge: null, color: 'rgb(36, 41, 47)' }, 'text turning into a fused sentence drops the badge')
  await page.evaluate(() => { document.querySelector('#plain code:nth-of-type(2)').firstChild.nodeValue = 'src/tokenizer.cjs' })
  await frame()
  assert.deepEqual(await probe(), { marked: false, badge: 'JS', color: 'rgb(145, 98, 0)' }, 'text turning back into a file restores the badge')

  // ---- 实时：设置变更无需刷新页面即时切换 ----
  const applySettings = async (patch) => {
    await page.evaluate(([key, value]) => {
      localStorage.setItem(key, value)
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: value }))
    }, [STORAGE_KEY, CP_SETTINGS.stringify(Object.assign(CP_SETTINGS.defaults(), patch))])
    await frame()
    await frame()
  }
  const fusedMarked = () => page.evaluate(() => document.querySelector('#fused code').hasAttribute('data-dshcp-sentence'))
  assert.equal(await fusedMarked(), true, 'fused sentence marked before live change')
  await applySettings({ sentenceFallback: false })
  assert.equal(await fusedMarked(), false, 'turning the toggle off takes effect without a reload')
  await applySettings({ sentenceFallback: true })
  assert.equal(await fusedMarked(), true, 'turning the toggle on takes effect without a reload')

  // ---- 卸载清理 ----
  await page.evaluate(() => window.cleanup())
  assert.equal(await page.locator('.dshcp-pill').count(), 0)
  assert.equal(await page.locator('[data-dshcp-sentence]').count(), 0)
  console.log('sentence fallback: fused-sentence degradation, normal code untouched, toggle, cleanup OK')
} finally { await browser.close() }
