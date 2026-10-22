/**
 * dsh-code-pill — 折叠动作行着色测试（真 Chrome + 最终 lib/client.js）。
 *
 * 标准 DisclosureRow、独立技能/Cordis 头部与聊天 context 提示均有覆盖，
 * 以 data-variant / data-tool / data-state 与稳定 flow 位置识别，不猜本地化文案。
 * 这里按 ui-primitives / ui-tool / ui-chat / ui-skill / ui-cordis 的结构复刻各类行，验证：
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
    <span class="text title">${title}</span>
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

/** Current skill cards have their own header (and an extra hidden status span outside ok). */
const SKILL = (id, state) => `<div id="${id}" data-tool="skill" data-state="${state}"><div class="row">
  <span class="leading"><svg width="14" height="14"><circle cx="7" cy="7" r="5"/></svg></span>
  ${state === 'ok' ? '' : '<span class="sr">status</span>'}
  <span class="shimmer"><span class="content">${state === 'preparing' ? '<span class="title text">加载技能</span>' : `<span class="title"><span class="text">加载技能</span></span><span class="sep"></span>${SUMMARY('engineering-delivery')}`}</span></span>
</div><pre class="body">skill instructions stay host-coloured</pre></div>`
const CORDIS = (id, tool, state) => `<div id="${id}" data-tool="${tool}" data-state="${state}"><div class="row">
  <span class="leading"><svg width="14" height="14"><circle cx="7" cy="7" r="5"/></svg></span>
  <span class="title">运行插件</span><span class="sep"></span>${SUMMARY('plugin-id')}
  <span class="status">running</span><button>inspect</button>
</div><pre class="body">plugin output stays host-coloured</pre></div>`
const CONTEXT = (id, kind = 'context') => `<div id="${id}" data-chat-flow-kind="${kind}"><div data-slot="conversation.chat.node">${DISCLOSURE('已添加工具：example_tool', '')}</div></div>`
// Exercise every mapped wire tool, including the host's others-variant details rows.
const CATALOG = CP_SETTINGS.ROW_CATEGORIES.flatMap(category => category.tools.split(/\s+/).filter(Boolean).map(tool => ({ tool, key: category.key })))
const ROWS = `
${CATALOG.map(({ tool }) => OWNER('catalog-' + tool, `data-variant="others" data-tool="${tool}" data-state="ok"`, tool, SUMMARY('parameters remain neutral'))).join('')}
${SKILL('skill-ok', 'ok')}${SKILL('skill-running', 'running')}${SKILL('skill-preparing', 'preparing')}${SKILL('skill-error', 'error')}${SKILL('skill-stopped', 'stopped')}
${CORDIS('cordis-run', 'cordis_run', 'ok')}${CORDIS('cordis-stop', 'cordis_stop', 'error')}${CORDIS('cordis-remove', 'cordis_undefine', 'stopped')}
${CONTEXT('added-tools')}${CONTEXT('outside-context', 'user')}
${OWNER('unknown', 'data-variant="others" data-tool="third_party_unknown" data-state="ok"', '工具调用', SUMMARY('new plugin tool'))}
${OWNER('session', 'data-variant="others" data-tool="session_search" data-state="ok"', '搜索会话', SUMMARY('2 条匹配'))}
${OWNER('agent', 'data-variant="others" data-tool="subagent_fork" data-state="ok"', '委派子代理', SUMMARY('核验范围'))}
${OWNER('schedule', 'data-variant="others" data-tool="schedule_create" data-state="ok"', '创建提醒', SUMMARY('提醒正文'))}
${OWNER('prepare', 'data-variant="others" data-tool="tool_load" data-state="preparing"', '工具调用', SUMMARY('tool_load'))}
${OWNER('nested', 'data-variant="read" data-tool="read" data-state="error"', '读取', SUMMARY('failed outer row') + OWNER('nested-tool', 'data-variant="others" data-tool="third_party_unknown" data-state="ok"', '工具调用', SUMMARY('independent nested row')))}
` + `
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
      const row = owner.matches('[data-sample]') ? owner : owner.querySelector('[data-disclosure-row], :scope > .row')
      const directTitle = row.querySelector(':scope > .title')
      const parts = { icon: row.firstElementChild,
        title: directTitle || row.lastElementChild.firstElementChild.firstElementChild,
        summary: row.querySelector('.summary') }
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
  const expected = { read: DARK.read, search: DARK.search, edit: DARK.write, write: DARK.write, bash: DARK.run, think: DARK.think, present: DARK.write,
    mcp: DARK.tool, ask: DARK.ask, job: DARK.run, todo: DARK.task, session: DARK.session, agent: DARK.agent, schedule: DARK.schedule,
    'skill-ok': DARK.skill, 'skill-running': DARK.skill, 'skill-preparing': DARK.skill, 'cordis-run': DARK.run,
    'added-tools': DARK.tool, unknown: DARK.tool, prepare: DARK.tool, 'nested-tool': DARK.tool }
  for (const [id, hex] of Object.entries(expected)) {
    const c = await colors(id)
    assert.equal(c.icon, rgb(hex), `${id} 图标用类别色`)
    assert.notEqual(c.title, rgb(hex), `${id} 动作名比图标略柔和`)
    assert.notEqual(c.title, HOST, `${id} 动作名已着色`)
    // 读取/写入/编辑的摘要是文件路径，由路径胶囊管线负责，不在这里断言。
    if (c.summary !== null && !['read', 'edit', 'write'].includes(id)) assert.equal(c.summary, HOST, `${id} 描述保持宿主色`)
    else if (c.summary !== null) assert.notEqual(c.summary, rgb(hex), `${id} 摘要不被类别色覆盖`)
  }
  // 每个 wire 工具都被命中，且正文/参数不被类别色覆盖；上下文只在聊天 context 节点染色。
  for (const { tool, key } of CATALOG) {
    const c = await colors('catalog-' + tool)
    assert.equal(c.icon, rgb(DARK[key]), `${tool} → ${key}`)
    assert.notEqual(c.title, HOST, `${tool} 动作名着色`)
    assert.equal(c.summary, HOST, `${tool} 参数保持宿主色`)
  }
  assert.equal((await colors('outside-context')).icon, HOST, '相同文案在 user 节点不染')
  for (const id of ['skill-ok', 'cordis-run']) {
    assert.equal(await page.locator('#' + id + ' .body').evaluate(el => getComputedStyle(el).color), 'rgb(221, 221, 221)', `${id} 展开正文不被类别色覆盖`)
  }
  assert.equal((await colors('skill-error')).icon, rgb(DARK.err))
  assert.equal((await colors('skill-stopped')).icon, rgb(DARK.warn))
  assert.equal((await colors('cordis-stop')).icon, rgb(DARK.err))
  assert.equal((await colors('cordis-remove')).icon, rgb(DARK.warn))
  assert.equal((await colors('nested')).icon, rgb(DARK.err), '嵌套行外层保持失败色')
  // 失败与中断：换状态色，覆盖类别色；运行中保持类别（宿主自带闪光）。
  assert.equal((await colors('failed')).icon, rgb(DARK.err))
  assert.equal((await colors('readfail')).icon, rgb(DARK.err), '失败覆盖类别色')
  assert.equal((await colors('stopped')).icon, rgb(DARK.warn))
  assert.equal((await colors('running')).icon, rgb(DARK.run))

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
  assert.equal((await colors('running')).icon, rgb(DARK.run))
  assert.equal((await colors('failed')).icon, rgb(DARK.run), '状态恢复后回到所属类别色')
  await page.evaluate(() => document.getElementById('job').remove())
  assert.equal((await page.evaluate(() => window.words())).ok.length, 6, '行被移除后区间释放')

  // 新增行：同一微任务内着色。
  await page.evaluate(html => {
    document.getElementById('host').insertAdjacentHTML('beforeend', html)
  }, OWNER('late', 'data-variant="others" data-tool="job_output" data-state="ok"', '读取任务输出', SUMMARY('bash-9 · 已完成')))
  assert.equal((await page.evaluate(() => window.words())).ok.length, 7)

  // 工具名/variant 动态变化无需 DOM 装饰，立即重新分类；失败与中断仍最高优先。
  await page.evaluate(() => { document.getElementById('unknown').dataset.tool = 'session_event_read' })
  assert.equal((await colors('unknown')).icon, rgb(DARK.session))
  await page.evaluate(() => { document.getElementById('unknown').dataset.state = 'error' })
  assert.equal((await colors('unknown')).icon, rgb(DARK.err))
  await page.evaluate(() => { const el = document.getElementById('unknown'); el.dataset.state = 'stopped'; el.dataset.tool = 'tool_load' })
  assert.equal((await colors('unknown')).icon, rgb(DARK.warn))
  await page.evaluate(() => { const el = document.getElementById('unknown'); el.dataset.state = 'ok'; el.dataset.tool = 'third_party_unknown'; el.dataset.variant = 'read' })
  assert.equal((await colors('unknown')).icon, rgb(DARK.read), 'unknown tool still honours a host-provided semantic variant')
  await page.evaluate(() => { document.getElementById('unknown').dataset.variant = 'others' })
  assert.equal((await colors('unknown')).icon, rgb(DARK.tool))
  // 同一类别映射在浅色主题下也完整生效，不依赖重新扫描。
  await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'))
  for (const { tool, key } of CATALOG) assert.equal((await colors('catalog-' + tool)).icon, rgb(CP_SETTINGS.ROW_TINTS.light[key]), 'light ' + tool)
  for (const [id, key] of [['skill-ok', 'skill'], ['cordis-run', 'run'], ['added-tools', 'tool']]) assert.equal((await colors(id)).icon, rgb(CP_SETTINGS.ROW_TINTS.light[key]), 'light custom header ' + id)
  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''))

  // 自定义颜色：覆盖新旧类别与状态词色，其余保持默认；缺失走默认。
  await page.evaluate(() => window.setConfig({ rowTint: true, rowColors: { dark: { read: '#123456', session: '#234567', skill: '#345678', tool: '#456789', ok: '#abcdef' } } }))
  await settle()
  assert.equal((await colors('read')).icon, rgb('#123456'), '自定义类别色生效')
  assert.equal((await colors('session')).icon, rgb('#234567'), '自定义会话类别色生效')
  assert.equal((await colors('skill-ok')).icon, rgb('#345678'), '自定义技能卡片色生效')
  assert.equal((await colors('added-tools')).icon, rgb('#456789'), '自定义上下文提示色生效')
  assert.equal((await colors('search')).icon, rgb(DARK.search), '未自定义的类别保持默认')
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('present'), '::highlight(dshcp-st-ok)').color), rgb('#abcdef'), '自定义状态词色生效')
  await page.evaluate(() => window.setConfig({ rowTint: true }))
  await settle()
  assert.equal((await colors('read')).icon, rgb(DARK.read), '移除自定义后回到默认')

  // 关闭开关：样式、区间与注册全部撤销，颜色回到宿主色。
  await page.evaluate(() => window.setConfig({ rowTint: false }))
  await settle()
  assert.equal(await page.evaluate(() => window.stNames()), 0)
  for (const id of ['read', 'mcp', 'ask', 'session', 'agent', 'todo', 'schedule', 'unknown', 'skill-ok', 'skill-error', 'cordis-run', 'added-tools']) {
    assert.equal((await colors(id)).icon, HOST, `${id} 关闭后恢复宿主色`)
  }
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
