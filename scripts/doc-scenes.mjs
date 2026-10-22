/** Documentation scenes rendered with the real client bundle (rows tint + thinking ink). Not a production DSH screenshot. */
import assert from 'node:assert/strict'

const ICON = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="2.5" width="10" height="9" rx="2"/><path d="M4.5 6h5M4.5 8.5h3"/></svg>'
const DISC = (title, summary, suffix = '') => `<div class="root"><div data-disclosure-header><div class="row" data-disclosure-row role="button"><span class="leading">${ICON}</span><span class="shimmer"><span class="content"><span class="shimmer title"><span class="content"><span class="text">${title}</span></span></span>${summary ? `<span class="sep"></span>${summary}` : ''}${suffix}</span></span></div></div></div>`
const S = text => `<span class="summary"><span class="text">${text}</span></span>`
const O = (attrs, title, summary, suffix) => `<div class="owner" ${attrs}>${DISC(title, summary, suffix)}</div>`
const BASH = (state, summary) => `<div class="card"><div class="bashroot" data-sample="bash" data-variant="bash" data-state="${state}"><span class="leading">${ICON}</span><span class="shimmer"><span class="content"><span class="shimmer title"><span class="content"><span class="text">运行命令</span></span></span><span class="sep"></span><span class="summary"><span class="text">${summary}</span></span></span></span></div></div>`

// Row fixtures follow the host DisclosureRow structure documented in DESIGN.md §3.3.
export const ROW_SCENE = {
  all: [
    O('data-variant="read" data-tool="read" data-state="ok"', '读取', S('src/think-ink.js')),
    O('data-variant="search" data-tool="grep" data-state="ok"', '搜索', S('thinkRainbow')),
    O('data-variant="edit" data-tool="edit" data-state="ok"', '编辑', S('src/row-tint.js')),
    BASH('ok', 'node scripts/build.mjs'),
    O('data-variant="think" data-state="ok"', '思考', S('确认发布前的检查项')),
    O('data-variant="others" data-tool="todo_write" data-state="ok"', '更新任务清单', S('4/4 已完成'), '<span class="suffix">更新 1</span>'),
    O('data-tool="present" data-state="ok"', '交付文件', '<span class="summary"><span>已交付</span><span class="paths">dist/dsh-code-pill.tgz</span></span>'),
    O('data-variant="read" data-tool="read" data-state="error"', '读取', S('Permission denied')),
    O('data-variant="others" data-tool="job_kill" data-state="stopped"', '结束任务', S('bash-2 · 已中断')),
    BASH('error', '测试失败，退出码 1')
  ],
  hero: [
    O('data-variant="read" data-tool="read" data-state="ok"', '读取', S('src/think-ink.js')),
    O('data-variant="search" data-tool="grep" data-state="ok"', '搜索', S('thinkRainbow')),
    O('data-variant="edit" data-tool="edit" data-state="ok"', '编辑', S('src/row-tint.js')),
    BASH('ok', 'node scripts/build.mjs'),
    O('data-variant="think" data-state="ok"', '思考', S('确认发布前的检查项')),
    O('data-tool="present" data-state="ok"', '交付文件', '<span class="summary"><span>已交付</span><span class="paths">dist/dsh-code-pill.tgz</span></span>'),
    O('data-variant="read" data-tool="read" data-state="error"', '读取', S('Permission denied')),
    O('data-variant="others" data-tool="job_kill" data-state="stopped"', '结束任务', S('bash-2 · 已中断'))
  ]
}

const routePage = async (page, host, body) => page.route(`http://${host}/**`, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body }))
const loader = `window.__ModuleLoader__={load(spec){window.plugin=spec.factory(()=>{throw new Error('no require')});window.plugin.apply({effect(cb){cb()}})}};`
const tertiary = dark => dark ? '#8a8f98' : '#7b8190'
const secondary = dark => dark ? '#c5c9d0' : '#4b5160'
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))

/** Returns a PNG buffer of the folded-row list for one theme and one tint state. */
export async function renderRows(browser, bundle, { theme, tint, rows = 'all', width = 560, scale = 2 }) {
  const dark = theme === 'dark'
  const context = await browser.newContext({ viewport: { width: width + 40, height: 600 }, deviceScaleFactor: scale })
  try {
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await routePage(page, 'rows.code-pill.test', `<html><head><meta charset="utf-8"><style>
:root{--dsw-alias-label-tertiary:${tertiary(dark)};--dsw-alias-label-secondary:${secondary(dark)}}
body{margin:0;background:${dark ? '#17181c' : '#ffffff'};color:#ddd;font:14px "Noto Sans SC","Segoe UI",Arial,sans-serif;padding:12px 16px;width:${width}px}
.row,.bashroot{display:flex;align-items:center;height:28px;color:var(--dsw-alias-label-tertiary)}
.leading{display:inline-flex;width:16px;height:16px;margin-right:7px;align-items:center;justify-content:center}
.title{color:inherit}.content{display:inline-flex;align-items:center}
.sep{width:2px;height:2px;background:currentColor;opacity:.6;margin:0 9px;border-radius:1px}
.summary{margin-right:6px}.paths{margin-left:8px}.suffix{margin-left:6px}
</style></head><body ${dark ? 'data-ds-dark-theme' : ''}><main>${ROW_SCENE[rows].join('')}</main></body></html>`)
    await page.goto('http://rows.code-pill.test/')
    await page.evaluate(({ script, tint }) => {
      localStorage.setItem('dsh-code-pill.settings.v1', JSON.stringify({ version: 1, rowTint: tint }))
      new Function(script)()
    }, { script: loader, tint })
    await page.addScriptTag({ content: bundle })
    await settle(page)
    await page.evaluate(() => document.fonts.ready)
    const tinted = await page.evaluate(() => getComputedStyle(document.querySelector('[data-variant="read"][data-state="ok"] .leading')).color)
    const plain = await page.evaluate(() => getComputedStyle(document.querySelector('[data-variant="others"] .leading, [data-variant="think"] .leading')).color)
    if (tint) assert.notEqual(tinted, plain, 'row tint must colour the read row differently from the host gray')
    assert.deepEqual(errors, [], 'row scene errors')
    return await page.locator('main').screenshot()
  } finally { await context.close() }
}

const INK_HISTORY = '先看现有的发布流程：校验任务已经跑完整套浏览器测试，剩下的问题只是 registry 对新版本的处理时间。所以不需要改动任何代码，只需要在确认完整性之后，再决定是否重跑失败的那个发布任务，其余步骤全部保持原样，也不额外触碰已经发布成功的资产。'
const INK_NEW = '接下来核对 npm 上的完整性哈希，再确认发布资产和标签指向同一个提交，最后给出结论。'

/** Returns timed frames of the rainbow settle effect for one theme (PNG buffers + measured offsets). */
export async function renderInkFrames(browser, bundle, theme, times = [60, 360, 760, 1700]) {
  assert.ok(INK_HISTORY.length > 120, 'history must exceed the 120-character threshold so only the new text is inked')
  const dark = theme === 'dark'
  const context = await browser.newContext({ viewport: { width: 560, height: 360 }, deviceScaleFactor: 2 })
  try {
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await routePage(page, 'ink.code-pill.test', `<html><head><meta charset="utf-8"><style>
:root{--dsw-alias-label-tertiary:${tertiary(dark)}}
body{margin:0;background:${dark ? '#17181c' : '#ffffff'};font:16px "Noto Sans SC","Segoe UI",Arial,sans-serif;padding:14px 18px;width:524px}
.markdown{color:var(--dsw-alias-label-tertiary);font-size:16px;line-height:1.7}
p{margin:0}
</style></head><body ${dark ? 'data-ds-dark-theme' : ''}>
<div data-variant="think" data-state="running" data-expanded><div><div class="markdown" id="md" data-markdown-variant="compact"><p id="p">${INK_HISTORY}</p></div></div></div>
</body></html>`)
    await page.goto('http://ink.code-pill.test/')
    await page.evaluate(({ script }) => {
      localStorage.setItem('dsh-code-pill.settings.v1', JSON.stringify({ version: 1, thinkRainbow: true }))
      new Function(script)()
    }, { script: loader })
    await page.addScriptTag({ content: bundle })
    await settle(page)
    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(text => { window.t0 = performance.now(); document.getElementById('p').firstChild.nodeValue += text }, INK_NEW)
    const frames = []
    for (const target of times) {
      const wait = await page.evaluate(t => Math.max(0, t - (performance.now() - window.t0)), target)
      await new Promise(resolve => setTimeout(resolve, wait))
      const at = await page.evaluate(() => Math.round(performance.now() - window.t0))
      frames.push({ at, png: await page.locator('#md').screenshot() })
    }
    assert.deepEqual(errors, [], 'ink scene errors')
    return frames
  } finally { await context.close() }
}

export const dataUri = buffer => 'data:image/png;base64,' + buffer.toString('base64')
