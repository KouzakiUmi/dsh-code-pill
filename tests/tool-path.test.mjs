/**
 * dsh-code-pill — 宿主工具行文件路径胶囊测试（真 Chrome + 最终 lib/client.js）。
 *
 * 宿主把 read/write/edit 的文件路径渲染成行摘要（按钮/文本），不是 <code>，
 * 行内代码管线看不到它。这里按宿主的 DOM 契约（行根 data-tool/data-variant、
 * 行头 data-disclosure-row、摘要按钮）复刻一份，验证路径被染成胶囊、
 * 徽章只出现一次、非路径摘要不受影响、开关与卸载能完整还原。
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const bundle = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
assert.ok(!/\/\* __(?:TOKENIZER|PATH_RENDERER|CSS|SETTINGS_CORE|SETTINGS_UI|FONT_CORE|FONT_UI)__ \*\//.test(bundle), 'all build slots replaced')

/** 宿主行摘要的结构：行根 → 行头 → 标题 + 分隔点 + 路径按钮 + 后缀。 */
const ROW = (variant, tool, title, summary, options = {}) => `
<div class="row" data-variant="${variant}" data-tool="${tool}" data-state="ok">
  <div data-disclosure-header>
    <div data-disclosure-row>
      <span class="leading"></span>
      <span class="shimmer">
        <span class="content">
          <span class="shimmer"><span class="content"><span class="text title-text">${title}</span></span></span>
          <span data-shimmer-decoration aria-hidden="true"></span>
          ${options.link === false
            ? `<span class="summary"><span class="shimmer"><span class="content"><span class="text">${summary}</span></span></span></span>`
            : `<button type="button" class="fileLink"><span class="shimmer"><span class="content"><span class="text">${summary}</span></span></span></button>`}
          <span class="summarySuffix">1KB</span>
        </span>
      </span>
    </div>
  </div>
</div>`

/** 运行态：宿主额外渲染一份只靠 CSS attr 呈现文字的装饰副本。 */
const RUNNING_ROW = `
<div class="row" id="row-running" data-variant="write" data-tool="write" data-state="running">
  <div data-disclosure-header>
    <div data-disclosure-row>
      <span class="leading"></span>
      <span class="shimmer" data-shimmer>
        <span class="summary"><span class="content">
          <span class="content"><span class="text">lib/service-control.js</span></span>
          <span class="decoration" aria-hidden="true"><span class="sweep"><span class="content"><span class="text" data-shimmer-text="lib/service-control.js"></span></span></span></span>
        </span></span>
      </span>
    </div>
  </div>
</div>`

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('http://dsh-code-pill.test/**', route => route.fulfill({
    contentType: 'text/html; charset=utf-8', body: `<html><head><meta charset="utf-8"><style>
    body{background:#111;color:#ddd;font:16px Arial;padding:24px}
    .fileLink{text-decoration:underline 1px dotted;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:0 0;border:none;color:inherit;font:inherit;padding:0;margin:0}
    .summarySuffix{font-family:var(--ds-font-family-code)}
  </style></head><body data-ds-dark-theme>
    <main id="host">
      ${ROW('edit', 'edit', '编辑', 'scripts/test-host.mjs')}
      ${ROW('read', 'read', '读取', 'docs/settings.md')}
      ${ROW('read', 'web_fetch', '抓取', 'https://example.com/a.js')}
      ${ROW('bash', 'bash', '运行命令', '按实测导入预算验收进程内正常关闭')}
      ${ROW('write', 'write', '写入', 'package.json', { link: false })}
      ${RUNNING_ROW}
    </main>
  </body></html>`
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
  })
  await page.addScriptTag({ content: bundle })
  const settle = () => page.evaluate(() => window.settle())

  await settle()

  // 文件路径被染成胶囊并带语言徽章。
  assert.equal(await page.locator('#host .fileLink.dshcp-pill').count(), 2, 'read/edit 路径都成了胶囊')
  assert.equal(await page.locator('#host .dshcp-tool-path').count(), 4, '两个按钮路径 + 一个无链接摘要 + 运行态路径')
  assert.equal(await page.locator('.dshcp-pill[data-dshcp-badge="JS"]').count(), 2, '编辑路径与运行态路径都是 JS')
  const editPath = page.locator('#host [data-tool="edit"] .fileLink')
  assert.equal(await editPath.getAttribute('data-dshcp-badge'), 'JS')
  assert.equal(await editPath.getAttribute('data-dshcp-path'), 'scripts/test-host.mjs')

  // 非路径摘要（URL、命令描述、字号后缀、标题）不受影响。
  assert.equal(await page.locator('[data-tool="web_fetch"] .fileLink.dshcp-pill').count(), 0, 'URL 不是路径')
  assert.equal(await page.locator('[data-tool="bash"] .fileLink.dshcp-pill').count(), 0, '命令描述不是路径')
  assert.equal(await page.locator('.summarySuffix.dshcp-pill').count(), 0, '字号后缀不是路径')
  assert.equal(await page.locator('.title-text.dshcp-pill').count(), 0, '标题文字不是路径')

  // 运行态的装饰副本没有文本节点，徽章只出现一次。
  assert.equal(await page.locator('#row-running .dshcp-pill').count(), 1)
  assert.equal(await page.locator('#row-running [data-shimmer-text]').count(), 1)
  assert.equal(await page.locator('#row-running [data-shimmer-text].dshcp-pill').count(), 0, '装饰副本不重复装饰')

  // 视觉：胶囊底色、文字色与徽章都来自色板变量。
  const visuals = await page.evaluate(() => {
    const el = document.querySelector('#host [data-tool="edit"] .fileLink')
    const badge = getComputedStyle(el, '::before')
    return {
      color: getComputedStyle(el).color,
      background: getComputedStyle(el).backgroundColor,
      badgeContent: badge.content,
      badgeBackground: badge.backgroundColor,
      plain: getComputedStyle(document.body).getPropertyValue('--dshcp-plain').trim(),
      badgeText: getComputedStyle(document.body).getPropertyValue('--dshcp-badge-text').trim(),
    }
  })
  assert.equal(visuals.color, 'rgb(226, 191, 112)', '路径文字用色板默认色')
  assert.equal(visuals.badgeContent, '"JS"')
  assert.equal(visuals.badgeBackground, 'rgb(70, 54, 21)', '徽章底色来自色板')
  assert.equal(visuals.plain, '#e2bf70')

  // 标记模式与行内代码一致：off 只留胶囊，icon 用图标，both 图标加文字。
  await page.evaluate(() => window.setConfig({ marker: 'off' }))
  await settle()
  assert.equal(await page.locator('.dshcp-tool-path').count(), 4, 'off 仍保留胶囊')
  assert.equal(await page.locator('[data-dshcp-badge], [data-dshcp-icon]').count(), 0)
  await page.evaluate(() => window.setConfig({ marker: 'icon' }))
  await settle()
  assert.equal(await editPath.getAttribute('data-dshcp-icon'), 'file')
  assert.equal(await editPath.getAttribute('data-dshcp-badge'), null)
  await page.evaluate(() => window.setConfig({ marker: 'both' }))
  await settle()
  assert.equal(await editPath.getAttribute('data-dshcp-badge'), 'JS')
  assert.equal(await editPath.getAttribute('data-dshcp-icon'), 'file')
  await page.evaluate(() => window.setConfig({ marker: 'label' }))
  await settle()

  // 关闭工具行路径：装饰全部撤销；再打开：重新装回。
  await page.evaluate(() => window.setConfig({ toolPath: false }))
  await settle()
  assert.equal(await page.locator('.dshcp-tool-path').count(), 0)
  assert.equal(await page.locator('.dshcp-pill').count(), 0)
  assert.equal(await editPath.getAttribute('data-dshcp-path'), null)
  // 关闭期间行内容变化也不能重新装回装饰。
  await page.evaluate(() => {
    const text = document.querySelector('#host [data-tool="read"] .fileLink .text')
    text.firstChild.nodeValue = 'docs/other.md'
  })
  await settle()
  assert.equal(await page.locator('.dshcp-tool-path').count(), 0)
  await page.evaluate(() => window.setConfig({ toolPath: true }))
  await settle()
  assert.equal(await page.locator('.dshcp-tool-path').count(), 4)
  assert.equal(await page.locator('#host [data-tool="read"] .fileLink').getAttribute('data-dshcp-path'), 'docs/other.md')

  // 行被移出 DOM：装饰必须撤销；重新插入后重建。
  await page.evaluate(() => {
    window.detached = document.querySelector('#host [data-tool="edit"] .fileLink')
    window.detachedRow = document.querySelector('#host [data-tool="edit"]')
    window.detachedRow.remove()
  })
  await settle()
  assert.equal(await page.evaluate(() => window.detached.classList.contains('dshcp-tool-path')), false)
  assert.equal(await page.locator('.dshcp-tool-path').count(), 3)
  await page.evaluate(() => document.getElementById('host').append(window.detachedRow))
  await settle()
  assert.equal(await page.locator('#host [data-tool="edit"] .fileLink.dshcp-pill').count(), 1)

  // 新增的工具行在插入后被扫描。
  await page.evaluate(() => {
    const holder = document.createElement('div')
    holder.innerHTML = `<div id="row-new" data-variant="read" data-tool="read" data-state="ok"><div data-disclosure-header><div data-disclosure-row><span class="shimmer"><span class="content"><span class="content"><span class="summary">README.md</span></span></span></div></div></div>`
    document.getElementById('host').append(holder)
  })
  await settle()
  assert.equal(await page.locator('#row-new [data-dshcp-badge="MD"]').count(), 1)

  // 扩展适配器：聊天内路径位置；非聊天同名控件不能被接管。
  await page.evaluate(() => {
    const flow = document.createElement('section')
    flow.id = 'flow'; flow.setAttribute('data-chat-flow', '')
    flow.innerHTML = `
      <div data-read><div data-code-block-banner><span class="abc_title" title="C:/Software Projects/output.custom">C:/Software Projects/output.custom</span></div><div class="abc_content">const x = 1</div></div>
      <div data-search="paths"><div class="abc_line">/tmp/output.custom</div></div>
      <div data-search="matches"><button aria-expanded="true"><span class="abc_filePath">src/other.ts</span><span class="abc_fileCount">2</span></button><div class="abc_line"><span>24: </span>src/not-a-path.ts</div></div>
      <span data-path-label title="/tmp/a long directory/output.custom"><span><span style="color:rgb(100,100,100)">/tmp/a long directory/</span><span style="color:rgb(255,255,255)">output.custom</span></span></span>
      <p><button class="abc_fileMention abc_fileLink" title="/tmp/report.custom"><svg></svg>报告</button></p>
      <p><button id="image-alias" class="abc_fileMention abc_fileLink"><svg></svg>README.md</button></p>
      <p><code><button class="abc_fileMention" title="打开 src/main.ts"><svg></svg>src/main.ts</button></code></p>
      <p><a href="https://example.com"><code>src/external.ts</code></a></p>
      <div data-message-attachments><button class="abc_fileMention abc_fileLink" title="attachment.ts">attachment.ts</button></div>
      <button data-ref-chip="skill" class="abc_fileMention" title="skill.ts">skill.ts</button>
      <div data-dshcp-preview><span data-path-label title="preview.ts">preview.ts</span></div>`
    document.getElementById('host').append(flow)
    const outside = document.createElement('span')
    outside.id = 'outside'; outside.setAttribute('data-path-label', ''); outside.title = 'outside.ts'; outside.textContent = 'outside.ts'
    document.body.append(outside)
    window.referenceClicks = 0
    flow.querySelector('p button').onclick = () => window.referenceClicks++
  })
  await settle()
  assert.equal(await page.locator('#flow .dshcp-tool-path').count(), 6)
  assert.equal(await page.locator('#outside.dshcp-pill').count(), 0)
  assert.equal(await page.locator('#image-alias.dshcp-pill, #image-alias[data-dshcp-badge], #image-alias[data-dshcp-path]').count(), 0, '图片预览缺少可信路径时不把链接别名误当文件')
  assert.deepEqual(await page.locator('#flow [data-path-label] span[style]').evaluateAll(els => els.map(el => getComputedStyle(el).color)), ['rgb(226, 191, 112)', 'rgb(226, 191, 112)'], 'PathLabel 子节点显式颜色统一为路径色')
  assert.equal(await page.locator('#flow [data-dshcp-preview] .dshcp-tool-path, #flow [data-ref-chip].dshcp-tool-path, #flow [data-message-attachments] .dshcp-tool-path').count(), 0)
  assert.equal(await page.locator('#flow [data-read] [data-dshcp-badge]').count(), 0, '读取标题不重复语言栏')
  assert.equal(await page.locator('#flow .abc_fileCount.dshcp-pill, #flow [data-search="matches"] .abc_line.dshcp-pill').count(), 0)
  assert.equal(await page.locator('#flow code.dshcp-pill').count(), 0, '引用不重复内外胶囊')
  await page.locator('#flow p button').first().click()
  assert.equal(await page.evaluate(() => window.referenceClicks), 1, '原引用点击不变')

  // 所有适配器服从同一开关；不会影响宿主文件内容和引用子节点。
  const referenceNode = await page.locator('#flow p button').first().evaluate(el => { window.referenceNode = el.firstChild; return el.childNodes.length })
  await page.evaluate(() => window.setConfig({ toolPath: false }))
  await settle()
  assert.equal(await page.locator('#flow .dshcp-tool-path').count(), 0)
  await page.evaluate(() => window.setConfig({ toolPath: true }))
  await settle()
  assert.equal(await page.locator('#flow .dshcp-tool-path').count(), 6)
  assert.equal(await page.locator('#flow p button').first().evaluate(el => el.firstChild === window.referenceNode && el.childNodes.length), referenceNode)

  // 交叉归属、嵌套流、宿主 class 重写、排除属性变化与差量写入。
  await page.evaluate(() => {
    const host = document.createElement('div'); host.id = 'lifecycle'
    host.innerHTML = '<section data-chat-flow id="flow-a"><span data-path-label title="a.ts">a.ts</span><span id="ordinary">text</span></section><section data-chat-flow id="flow-b"><span data-path-label title="b.ts">b.ts</span></section><section data-chat-flow id="outer"><span id="outer-noise">text</span><section data-chat-flow id="inner"><span data-path-label title="nested.ts">nested.ts</span></section></section>'
    document.body.append(host)
  })
  await settle()
  await page.evaluate(() => {
    const a = document.querySelector('#flow-a [data-path-label]'); const b = document.querySelector('#flow-b [data-path-label]')
    document.getElementById('flow-a').append(b); document.getElementById('flow-b').append(a)
    document.getElementById('inner').removeAttribute('data-chat-flow')
  })
  await settle()
  assert.equal(await page.locator('#lifecycle .dshcp-tool-path').count(), 3, '跨 owner 交换及嵌套身份改变不丢装饰')
  await page.evaluate(() => {
    document.getElementById('inner').setAttribute('data-chat-flow-kind', 'assistant')
  })
  await settle()
  await page.evaluate(() => {
    document.getElementById('outer-noise').firstChild.nodeValue = 'unrelated'
  })
  await settle()
  assert.equal(await page.locator('#inner .dshcp-tool-path').count(), 1, '动态新增 owner 后旧 owner 不再清理其目标')
  await page.evaluate(() => document.querySelector('#flow-a [data-path-label]').className = 'host_updated')
  await settle()
  assert.equal(await page.locator('#flow-a .host_updated.dshcp-tool-path').count(), 1, '宿主重写 class 后恢复')
  await page.evaluate(() => document.getElementById('flow-a').setAttribute('contenteditable', 'true'))
  await settle()
  assert.equal(await page.locator('#flow-a .dshcp-tool-path').count(), 0)
  await page.evaluate(() => document.getElementById('flow-a').removeAttribute('contenteditable'))
  await settle()
  assert.equal(await page.locator('#flow-a .dshcp-tool-path').count(), 1)
  await page.evaluate(() => {
    window.pathWrites = 0
    window.writeObserver = new MutationObserver(ms => window.pathWrites += ms.length)
    window.writeObserver.observe(document.querySelector('#flow-a [data-path-label]'), { attributes: true })
    document.getElementById('ordinary').firstChild.nodeValue = 'changed prose'
  })
  await settle()
  assert.equal(await page.evaluate(() => { window.writeObserver.disconnect(); return window.pathWrites }), 0, '普通文本更新不重写稳定路径属性')
  await page.evaluate(() => {
    const wrapper = document.createElement('div'); wrapper.id = 'inline-wrapper'; wrapper.innerHTML = '<code data-path-label title="inline.ts">inline.ts</code>'
    document.getElementById('flow-a').append(wrapper)
  })
  await settle()
  await page.evaluate(() => window.setConfig({ toolPath: false }))
  await settle()
  assert.equal(await page.locator('#inline-wrapper code.dshcp-pill').count(), 1, 'inline code 不归路径管线清理')
  await page.evaluate(() => document.getElementById('inline-wrapper').setAttribute('data-dshcp-preview', ''))
  await settle()
  assert.equal(await page.locator('#inline-wrapper code.dshcp-pill').count(), 0)
  await page.evaluate(() => { document.getElementById('inline-wrapper').removeAttribute('data-dshcp-preview'); window.setConfig({ toolPath: true }) })
  await settle()
  assert.equal(await page.locator('#inline-wrapper code.dshcp-pill').count(), 1)

  await page.evaluate(() => {
    document.querySelector('#inline-wrapper code').className = 'host_code'
    const node = document.createElement('div'); node.id = 'read-status'
    node.innerHTML = '<div data-tool="read" data-variant="read" data-state="ok"><div data-disclosure-row><span class="summary">C:/a directory/output.custom</span></div></div>'
    document.body.append(node)
  })
  await settle()
  assert.equal(await page.locator('#inline-wrapper code.host_code.dshcp-pill').count(), 1)
  assert.equal(await page.locator('#read-status .dshcp-tool-path').count(), 1, '明确工具摘要支持空格及未知后缀')
  await page.evaluate(() => {
    document.querySelector('#read-status [data-tool]').dataset.state = 'error'
    document.querySelector('#read-status .summary').textContent = 'Permission denied'
  })
  await settle()
  assert.equal(await page.locator('#read-status .dshcp-tool-path').count(), 0, '失败提示保留宿主语义色')

  // 语义属性变化、脱离聊天、失效行以及同帧增删都应对账撤销。
  await page.evaluate(() => {
    document.querySelector('#host [data-tool="edit"]').dataset.variant = 'others'
    document.querySelector('#flow [data-search="paths"]').dataset.search = 'unknown'
    document.querySelector('#flow [data-path-label]').title = '/tmp/new name.custom'
    window.movedPath = document.querySelector('#flow [data-path-label]')
  })
  await settle()
  assert.equal(await page.locator('#host [data-tool="edit"] .dshcp-tool-path').count(), 0)
  assert.equal(await page.locator('#flow [data-search="unknown"] .dshcp-tool-path').count(), 0)
  assert.equal(await page.evaluate(() => window.movedPath.dataset.dshcpPath), '/tmp/new name.custom')
  await page.evaluate(() => {
    document.body.append(window.movedPath)
    const row = document.createElement('div')
    row.dataset.tool = 'read'; row.dataset.variant = 'read'
    row.innerHTML = '<div data-disclosure-row><span class="summary">src/transient.ts</span></div>'
    document.getElementById('host').append(row); row.remove(); window.transient = row
    document.getElementById('flow').removeAttribute('data-chat-flow')
  })
  await settle()
  assert.equal(await page.evaluate(() => window.movedPath.classList.contains('dshcp-pill')), false)
  assert.equal(await page.evaluate(() => window.transient.querySelector('.dshcp-pill') !== null), false)
  assert.equal(await page.locator('#flow .dshcp-tool-path').count(), 0, '移除聊天身份全部撤销')

  // 增量引擎回归：已装饰元素本体移除、工具行兄弟行序变化、独立工具行内的聊天流适配器。
  await page.evaluate(() => {
    const holder = document.createElement('div'); holder.id = 'incremental'
    holder.innerHTML = `
      <div id="row-direct" data-tool="edit" data-variant="edit" data-state="ok">
        <div data-disclosure-row><button type="button" class="fileLink"><span class="text">src/direct.ts</span></button></div>
      </div>
      <div id="row-order" data-tool="read" data-variant="read" data-state="ok">
        <div data-disclosure-header>
          <div data-disclosure-row id="row-order-a"><span class="summary">docs/first.md</span></div>
          <div data-disclosure-row id="row-order-b"><span class="summary">docs/second.md</span></div>
        </div>
      </div>
      <div id="row-standalone" data-tool="bash" data-variant="bash" data-state="ok">
        <div data-search="paths"><div class="abc_line">/tmp/inside-tool.ts</div></div>
        <div data-read><div data-code-block-banner><span class="abc_title" title="C:/read/inside.ts">C:/read/inside.ts</span></div></div>
      </div>`
    document.getElementById('host').append(holder)
  })
  await settle()
  // 只有第一个 disclosure-row 的摘要可装饰；行序变化要即时对账。
  assert.equal(await page.locator('#row-order-a .dshcp-tool-path').count(), 1)
  assert.equal(await page.locator('#row-order-b .dshcp-tool-path').count(), 0)
  await page.evaluate(() => document.getElementById('row-order-a').remove())
  await settle()
  assert.equal(await page.locator('#row-order-b .dshcp-tool-path').count(), 1, '首个行移除后第二个行的摘要接续装饰')
  await page.evaluate(() => {
    const fresh = document.createElement('div'); fresh.id = 'row-order-c'; fresh.setAttribute('data-disclosure-row', '')
    fresh.innerHTML = '<span class="summary">docs/third.md</span>'
    document.getElementById('row-order').querySelector('[data-disclosure-header]').prepend(fresh)
  })
  await settle()
  assert.equal(await page.locator('#row-order-b .dshcp-tool-path').count(), 0, '新行前置后原首行失去装饰')
  assert.equal(await page.locator('#row-order-c .dshcp-tool-path').count(), 1)
  // 独立工具行（不在聊天流）里 search/read-title 适配器不生效。
  assert.equal(await page.locator('#row-standalone .dshcp-tool-path').count(), 0, '独立工具行内的搜索/读取卡片不走聊天流适配器')
  // 已装饰元素本体被直接移除（非祖先移除）：装饰必须撤销。
  await page.evaluate(() => { window.directButton = document.querySelector('#row-direct .fileLink'); window.directButton.remove() })
  await settle()
  assert.equal(await page.evaluate(() => window.directButton.classList.contains('dshcp-tool-path')), false, '元素本体移除后装饰撤销')

  // 卸载：装饰、属性与样式全部还原。
  await page.evaluate(() => window.dispose())
  await settle()
  assert.equal(await page.locator('.dshcp-pill, .dshcp-tool-path, [data-dshcp-badge], [data-dshcp-icon], [data-dshcp-path]').count(), 0)
  assert.equal(await page.locator('style[data-plugin-css="dsh-code-pill"]').count(), 0)
  assert.deepEqual(errors, [], 'no page errors')
  console.log('tool path: host tool-row file paths become Code Pills, marker modes, toggle, cleanup OK')
} finally { await browser.close() }
