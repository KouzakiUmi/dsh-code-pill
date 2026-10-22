/**
 * dsh-code-pill — 折叠动作行着色测试（真 Chrome + 最终 lib/client.js）。
 *
 * 宿主的折叠行都由 DisclosureRow 渲染：行根带 data-variant / data-tool / data-state，
 * 内部是「图标 → 动作名 → 分隔点 → 描述」。这里按 ui-primitives / ui-tool / ui-chat /
 * ui-deliverables 的真实结构复刻各类行，验证：
 * 类别色只落在图标与动作名、描述保持宿主色、失败/中断行换状态色、
 * 摘要末尾的完成状态词用文字区间上色（进度未满、状态不符、命令描述都不染），
 * 全程不改宿主 DOM，开关与卸载能完整撤销。
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const { CP_SETTINGS } = require('../src/settings-core.cjs')
const bundle = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
assert.ok(!/\/\* __(?:TOKENIZER|PATH_RENDERER|THINK_INK|ROW_TINT|CSS|SETTINGS_CORE|SETTINGS_UI|FONT_CORE|FONT_UI)__ \*\//.test(bundle), 'all build slots replaced')

const rgb = hex => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
const DARK = CP_SETTINGS.ROW_TINTS.dark
const HOST = 'rgb(138, 143, 152)' // fixture 里的 --dsw-alias-label-tertiary

/** DisclosureRow 的结构：行根 → 头 → 行 → [图标, 文本壳 → 内容 → [动作名壳, 分隔点, 描述…]]。 */
const DISCLOSURE = (title, summary) => `
<div class="root"><div data-disclosure-header><div class="row" data-disclosure-row role="button" tabindex="0">
  <span class="leading"><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="7" cy="7" r="5"/></svg></span>
  <span class="shimmer"><span class="content">
    <span class="shimmer title"><span class="content"><span class="text">${title}</span></span></span>
    ${summary === '' ? '' : `<span class="sep" data-shimmer-decoration aria-hidden="true"></span>${summary}`}
  </span></span>
</div></div></div>`
const OWNER = (id, attrs, title, summary) => `<div id="${id}" class="owner" ${attrs}><span class="sr">status</span>${DISCLOSURE(title, summary)}</div>`
const SUMMARY = text => `<span class="summary"><span class="shimmer"><span class="content"><span class="text">${text}</span></span></span></span>`
/** bash 行不走 DisclosureRow：行根自己就是行。 */
const BASH = (id, state, summary) => `
<div class="card"><div id="${id}" class="bashroot" data-sample="bash" data-variant="bash" data-state="${state}" role="button" tabindex="0">
  <span class="leading"><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="2" width="10" height="10"/></svg></span>
  <span class="sr">status</span>
  <span class="shimmer"><span class="content">
    <span class="shimmer title"><span class="content"><span class="text">运行命令</span></span></span>
    <span class="sep" data-shimmer-decoration aria-hidden="true"></span>
    <span class="summary"><span class="shimmer"><span class="content"><span class="text">${summary}</span></span></span></span>
  </span></span>
</div></div>`

const ROWS = `
${OWNER('read', 'data-variant="read" data-tool="read" data-state="ok"', '读取', SUMMARY('读取说明'))}
${OWNER('search', 'data-variant="search" data-tool="grep" data-state="ok"', '搜索', SUMMARY('thinkRainbow'))}
${OWNER('edit', 'data-variant="edit" data-tool="edit" data-state="ok"', '编辑', SUMMARY('编辑说明'))}
${OWNER('write', 'data-variant="write" data-tool="write" data-state="ok"', '写入', SUMMARY('写入说明'))}
${BASH('bash', 'ok', '核对测试完成')}
${OWNER('think', 'data-variant="think" data-state="ok"', '思考', '')}
${OWNER('mcp', 'data-variant="others" data-tool="mcp__context7__query-docs" data-state="ok"', '工具调用', SUMMARY('/websites/cli_github_manual'))}
${OWNER('ask', 'data-variant="others" data-tool="ask_user_question" data-state="ok"', '提问', SUMMARY('发布范围'))}
${OWNER('present', 'data-tool="present" data-state="ok"', '交付文件', '<span class="summary"><span>已交付</span><span class="paths">dist/release-0.5.0/dsh-code-pill.tgz</span></span>')}
${OWNER('job', 'data-variant="others" data-tool="job_output" data-state="ok"', '读取任务输出', SUMMARY('bash-a256bf19c6fe49a2 · 已完成'))}
${OWNER('todo', 'data-variant="others" data-tool="todo_write" data-state="ok"', '更新任务清单', SUMMARY('4/4 已完成') + '<span class="suffix"><span class="text">更新 1</span></span>')}
${OWNER('partial', 'data-variant="others" data-tool="todo_write" data-state="ok"', '更新任务清单', SUMMARY('2/4 已完成'))}
${OWNER('mismatch', 'data-variant="others" data-tool="job_output" data-state="ok"', '读取任务输出', SUMMARY('bash-1 · 运行失败'))}
${OWNER('failed', 'data-variant="others" data-tool="job_kill" data-state="error"', '结束任务', SUMMARY('bash-4 · 失败'))}
${OWNER('stopped', 'data-variant="others" data-tool="job_output" data-state="stopped"', '读取任务输出', SUMMARY('bash-2 · 已中断'))}
${OWNER('readfail', 'data-variant="read" data-tool="read" data-state="error"', '读取', SUMMARY('Permission denied'))}
${OWNER('en-done', 'data-variant="others" data-tool="job_output" data-state="ok"', '读取任务输出', SUMMARY('bash-7 · done'))}
${OWNER('en-incomplete', 'data-variant="others" data-tool="job_output" data-state="ok"', '读取任务输出', SUMMARY('bash-8 · incomplete'))}
${OWNER('cjk-glued', 'data-variant="others" data-tool="job_output" data-state="ok"', '读取任务输出', SUMMARY('任务完成'))}
${OWNER('cjk-failed', 'data-variant="others" data-tool="job_kill" data-state="error"', '结束任务', SUMMARY('交付失败'))}
${OWNER('cjk-done', 'data-variant="others" data-tool="todo_write" data-state="ok"', '更新任务清单', SUMMARY('任务已完成'))}
${OWNER('running', 'data-variant="others" data-tool="job_output" data-state="running"', '读取任务输出', SUMMARY('bash-3 · 已完成'))}`

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('http://dsh-code-pill.test/**', route => route.fulfill({
    contentType: 'text/html; charset=utf-8', body: `<html><head><meta charset="utf-8"><style>
    :root{--dsw-alias-label-tertiary:#8a8f98;--dsw-alias-label-secondary:#c5c9d0}
    body{background:#17181c;color:#ddd;font:14px Arial;padding:16px;width:760px}
    .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
    .row,.bashroot{display:flex;align-items:center;height:24px;color:var(--dsw-alias-label-tertiary)}
    .row:hover,.bashroot:hover{color:var(--dsw-alias-label-secondary)}
    .leading{display:inline-flex;width:16px;height:16px;margin-right:6px;color:inherit}
    .title{color:inherit}
    .content{display:inline-flex;align-items:center}
    .sep{width:2px;height:2px;background:#666;margin:0 8px}
    .summary{font-size:13px;margin-right:6px}
    .paths{margin-left:8px}
  </style></head><body data-ds-dark-theme><main id="host">${ROWS}</main></body></html>`
  }))
  await page.goto('http://dsh-code-pill.test/')
  await page.evaluate(() => {
    window.__ModuleLoader__ = { load(spec) {
      window.plugin = spec.factory(() => { throw new Error('unexpected require') })
      const disposers = []
      window.plugin.apply({ effect(cb) { disposers.push(cb()) } })
      window.dispose = () => { for (const dispose of disposers.reverse()) dispose() }
    } }
    window.settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    window.setConfig = config => {
      const key = 'dsh-code-pill.settings.v1'
      const newValue = JSON.stringify({ version: 1, ...config })
      const oldValue = localStorage.getItem(key)
      localStorage.setItem(key, newValue)
      window.dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue, storageArea: localStorage }))
    }
    /** 各状态高亮覆盖的文字，按词排序。 */
    window.words = () => {
      const out = {}
      for (const [name, highlight] of CSS.highlights) {
        if (!name.startsWith('dshcp-st-')) continue
        out[name.slice(9)] = Array.from(highlight, range => range.startContainer.nodeValue.slice(range.startOffset, range.endOffset)).sort()
      }
      return out
    }
    window.stNames = () => Array.from(CSS.highlights.keys()).filter(name => name.startsWith('dshcp-st-')).length
    /** 图标、动作名、描述的计算色。 */
    window.colors = id => {
      const owner = document.getElementById(id)
      const row = owner.matches('[data-sample]') ? owner : owner.querySelector('[data-disclosure-row]')
      const parts = row.matches('[data-sample]')
        ? { icon: row.firstElementChild, title: row.lastElementChild.firstElementChild.firstElementChild, summary: row.querySelector('.summary') }
        : { icon: row.firstElementChild, title: row.children[1].firstElementChild.firstElementChild, summary: row.querySelector('.summary') }
      return Object.fromEntries(Object.entries(parts).map(([key, el]) => [key, el === null ? null : getComputedStyle(el).color]))
    }
  })
  await page.addScriptTag({ content: bundle })
  const settle = () => page.evaluate(() => window.settle())
  const colors = id => page.evaluate(id => window.colors(id), id)
  await settle()

  // 默认关闭：全部保持宿主原色，没有任何高亮注册。
  for (const id of ['read', 'search', 'edit', 'bash', 'think', 'failed']) assert.equal((await colors(id)).icon, HOST, `${id} 默认不着色`)
  assert.equal(await page.evaluate(() => window.stNames()), 0)
  const pristine = await page.locator('#host').evaluate(el => el.outerHTML)

  await page.evaluate(() => window.setConfig({ rowTint: true }))
  await settle()

  // 类别色：图标与动作名上色；描述保持宿主色；动作名略向宿主灰回混。
  const expected = { read: DARK.read, search: DARK.search, edit: DARK.write, write: DARK.write, bash: DARK.run, think: DARK.think, present: DARK.write }
  for (const [id, hex] of Object.entries(expected)) {
    const c = await colors(id)
    assert.equal(c.icon, rgb(hex), `${id} 图标用类别色`)
    assert.notEqual(c.title, rgb(hex), `${id} 动作名比图标略柔和`)
    assert.notEqual(c.title, HOST, `${id} 动作名已着色`)
    // 读取/写入/编辑的摘要是文件路径，由路径胶囊管线负责，不在这里断言。
    if (c.summary !== null && !['read', 'edit', 'write'].includes(id)) assert.equal(c.summary, HOST, `${id} 描述保持宿主色`)
    else if (c.summary !== null) assert.notEqual(c.summary, rgb(hex), `${id} 摘要不被类别色覆盖`)
  }
  // 未归类的行（工具调用、提问、任务）保持宿主原色。
  for (const id of ['mcp', 'ask', 'job', 'todo']) {
    const c = await colors(id)
    assert.equal(c.icon, HOST, `${id} 不着色`)
    assert.equal(c.title, HOST, `${id} 动作名不着色`)
  }
  // 失败与中断：换状态色，覆盖类别色；运行中保持类别（宿主自带闪光）。
  assert.equal((await colors('failed')).icon, rgb(DARK.err))
  assert.equal((await colors('readfail')).icon, rgb(DARK.err), '失败覆盖类别色')
  assert.equal((await colors('stopped')).icon, rgb(DARK.warn))
  assert.equal((await colors('running')).icon, HOST)

  // 悬停：动作名回到满色。
  await page.hover('#read [data-disclosure-row]')
  assert.equal((await colors('read')).title, rgb(DARK.read), '悬停时动作名满色')
  await page.hover('#bash')
  assert.equal((await colors('bash')).title, rgb(DARK.run), 'bash 行悬停同样满色')
  await page.mouse.move(0, 0)

  // 完成状态词：只在其它类/交付文件行，且行状态与词义一致，进度未满不染。
  assert.deepEqual(await page.evaluate(() => window.words()), {
    ok: ['done', '已交付', '已完成', '已完成', '已完成'],
    warn: ['已中断'],
    err: ['失败', '失败'],
  })

  // 全程不改宿主 DOM：开启前后 HTML 逐字节一致。
  assert.equal(await page.locator('#host').evaluate(el => el.outerHTML), pristine, '着色不改任何宿主节点或属性')

  // 动态：状态变化与整段重写文字后重新计算区间。
  await page.evaluate(() => {
    document.getElementById('running').dataset.state = 'ok'
    document.getElementById('partial').querySelector('.summary .text').firstChild.nodeValue = '4/4 已完成'
    document.getElementById('job').querySelector('.summary .text').firstChild.nodeValue = 'bash-ffff00 · 已完成'
    document.getElementById('failed').dataset.state = 'ok'
  })
  const after = await page.evaluate(() => window.words())
  assert.deepEqual(after.ok, ['done', '已完成', '已完成', '已完成', '已完成', '已完成', '已交付'].sort(), '状态与文字变化后区间同步')
  assert.deepEqual(after.err, ['失败'], '状态不再是失败的行不染，宿主粘连写法“交付失败”仍染')
  assert.equal((await colors('running')).icon, HOST)
  assert.equal((await colors('failed')).icon, HOST, '状态恢复后回到宿主色')
  await page.evaluate(() => document.getElementById('job').remove())
  assert.equal((await page.evaluate(() => window.words())).ok.length, 6, '行被移除后区间释放')

  // 新增行：同一微任务内着色。
  await page.evaluate(html => {
    document.getElementById('host').insertAdjacentHTML('beforeend', html)
  }, OWNER('late', 'data-variant="others" data-tool="job_output" data-state="ok"', '读取任务输出', SUMMARY('bash-9 · 已完成')))
  assert.equal((await page.evaluate(() => window.words())).ok.length, 7)

  // 自定义颜色：覆盖类别色与状态词色，其余保持默认；无效或缺失走默认。
  await page.evaluate(() => window.setConfig({ rowTint: true, rowColors: { dark: { read: '#123456', ok: '#abcdef' } } }))
  await settle()
  assert.equal((await colors('read')).icon, rgb('#123456'), '自定义类别色生效')
  assert.equal((await colors('search')).icon, rgb(DARK.search), '未自定义的类别保持默认')
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('present'), '::highlight(dshcp-st-ok)').color), rgb('#abcdef'), '自定义状态词色生效')
  await page.evaluate(() => window.setConfig({ rowTint: true }))
  await settle()
  assert.equal((await colors('read')).icon, rgb(DARK.read), '移除自定义后回到默认')

  // 关闭开关：样式、区间与注册全部撤销，颜色回到宿主色。
  await page.evaluate(() => window.setConfig({ rowTint: false }))
  await settle()
  assert.equal(await page.evaluate(() => window.stNames()), 0)
  assert.equal((await colors('read')).icon, HOST)
  assert.ok(!(await page.evaluate(() => document.querySelector('style[data-plugin-css="dsh-code-pill"]').textContent)).includes('::highlight(dshcp-st-'))

  // 再次开启后卸载：不留痕迹。
  await page.evaluate(() => window.setConfig({ rowTint: true }))
  await settle()
  assert.equal((await colors('read')).icon, rgb(DARK.read))
  await page.evaluate(() => window.dispose())
  await settle()
  assert.equal(await page.evaluate(() => window.stNames()), 0)
  assert.equal(await page.locator('style[data-plugin-css="dsh-code-pill"]').count(), 0)
  assert.equal((await colors('read')).icon, HOST)
  assert.deepEqual(errors, [], 'no page errors')
  console.log('row tint: category/state colours, completion words, hover, dynamic updates, toggle, dispose OK')
} finally { await browser.close() }
