/** 真 Chrome + 最终 lib/client.js：流式 mutation、Range 身份、eligibility 与设置生命周期。 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const bundle = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
assert.ok(bundle.includes('function createSettingsStore('), 'build final settings-enabled bundle first')
assert.ok(!/\/\* __(?:TOKENIZER|CSS|SETTINGS_CORE|SETTINGS_UI)__ \*\//.test(bundle), 'all build slots replaced')
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true })
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('http://dsh-code-pill.test/**', route => route.fulfill({
    contentType: 'text/html; charset=utf-8', body: '<html><head><meta charset="utf-8"></head><body><main id="host"><code id="snippet">const count = 42</code><code id="file">src/Dockerfile</code><code id="config">配置/settings.json</code></main><section data-dshcp-preview><code id="preview">const x = 1</code></section></body></html>'
  }))
  await page.goto('http://dsh-code-pill.test/')
  assert.equal(await page.locator('#config').textContent(), '配置/settings.json', 'fixture must preserve its UTF-8 path')
  await page.evaluate(() => {
    const nativeRaf = window.requestAnimationFrame.bind(window)
    window.rafCalls = 0
    window.requestAnimationFrame = cb => { window.rafCalls++; return nativeRaf(cb) }
    window.settle = () => new Promise(resolve => nativeRaf(() => nativeRaf(resolve)))
    window.disposers = []
    window.__ModuleLoader__ = { load(spec) {
      window.plugin = spec.factory(() => { throw new Error('unexpected require') })
      window.plugin.apply({ effect(cb) { window.disposers.push(cb()) } })
    } }
    window.totalRanges = () => [...CSS.highlights].filter(([key]) => key.startsWith('dshcp-')).reduce((n, [, h]) => n + h.size, 0)
    window.rangeFor = id => [...CSS.highlights.get('dshcp-num')].find(r => r.startContainer === document.getElementById(id).firstChild)
    window.clean = code => !code.classList.contains('dshcp-pill') && !['dshcpText', 'dshcpBadge', 'dshcpIcon'].some(key => key in code.dataset)
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
  assert.equal(await page.locator('.dshcp-pill').count(), 3)
  assert.equal(await page.locator('#preview.dshcp-pill').count(), 0, 'settings preview is owned by UI')
  assert.equal(await page.evaluate(() => window.totalRanges()), 2)
  assert.equal(await page.locator('#file').getAttribute('data-dshcp-badge'), 'DOCKER')

  // React预览可自行使用同名装饰；移走/移回其子树，renderer不能撤销它们。
  await page.evaluate(() => {
    const preview = document.getElementById('preview')
    preview.classList.add('dshcp-pill'); preview.dataset.dshcpBadge = 'OWNED-BY-UI'
    const panel = preview.parentElement
    panel.remove(); document.body.append(panel)
  })
  await settle()
  assert.equal(await page.locator('#preview').getAttribute('data-dshcp-badge'), 'OWNED-BY-UI')
  assert.equal(await page.locator('#preview.dshcp-pill').count(), 1)
  await page.evaluate(() => {
    const preview = document.getElementById('preview')
    preview.classList.remove('dshcp-pill'); delete preview.dataset.dshcpBadge
  })

  // 同文本但全新 Text：重新锚定 Range；不能用字符串快照跳过。
  await page.evaluate(() => {
    window.oldRange = window.rangeFor('snippet')
    const code = document.getElementById('snippet')
    window.oldNode = code.firstChild
    code.replaceChildren(document.createTextNode(code.textContent))
  })
  await settle()
  assert.deepEqual(await page.evaluate(() => ({
    newNode: document.getElementById('snippet').firstChild !== window.oldNode,
    newRange: window.rangeFor('snippet') !== window.oldRange,
    value: window.rangeFor('snippet').toString(),
    count: window.totalRanges(),
    oldGone: !CSS.highlights.get('dshcp-num').has(window.oldRange)
  })), { newNode: true, newRange: true, value: '42', count: 2, oldGone: true })

  // nodeValue 流式变化；无关 mutation 不重建已稳定 code，也不调度空 RAF。
  await page.evaluate(() => { document.getElementById('snippet').firstChild.nodeValue = 'const count = 73' })
  await settle()
  assert.equal(await page.evaluate(() => window.rangeFor('snippet').toString()), '73')
  await page.evaluate(() => {
    window.stableRange = window.rangeFor('snippet')
    window.rafCalls = 0
    const noise = document.createElement('p'); noise.textContent = 'unrelated'; document.body.append(noise)
    noise.firstChild.nodeValue = 'still unrelated'
  })
  await settle()
  assert.equal(await page.evaluate(() => window.rafCalls), 0, 'no pending code means no RAF')
  assert.equal(await page.evaluate(() => window.rangeFor('snippet') === window.stableRange), true)

  // a/button/pre 之间移动与移回：清除所有装饰、快照与全局 Range。
  for (const tag of ['a', 'button', 'pre']) {
    await page.evaluate(tag => {
      const container = document.createElement(tag); container.id = 'excluded'
      document.getElementById('host').append(container)
      container.append(document.getElementById('snippet'), document.getElementById('file'))
    }, tag)
    await settle()
    assert.equal(await page.evaluate(() => window.clean(document.getElementById('snippet')) && window.clean(document.getElementById('file'))), true, tag)
    assert.equal(await page.evaluate(() => window.totalRanges()), 0, tag)
    await page.evaluate(() => {
      document.getElementById('host').append(document.getElementById('snippet'), document.getElementById('file'))
      document.getElementById('excluded').remove()
    })
    await settle()
    assert.equal(await page.locator('#snippet.dshcp-pill').count(), 1)
    assert.equal(await page.evaluate(() => window.rangeFor('snippet').toString()), '73')
  }

  // code 内部交互子节点使 eligibility 改变；移除后能重新渲染，不修改其子节点。
  await page.evaluate(() => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.id = 'interaction'
    document.getElementById('snippet').append(svg)
  })
  await settle()
  assert.equal(await page.evaluate(() => window.clean(document.getElementById('snippet'))), true)
  await page.evaluate(() => document.getElementById('interaction').remove())
  await settle()
  assert.equal(await page.evaluate(() => window.rangeFor('snippet').toString()), '73')

  // 出 DOM 保留引用，验证 detached 元素上没有残留；重新插入必须重建。
  await page.evaluate(() => { window.detached = document.getElementById('snippet'); window.detached.remove() })
  await settle()
  assert.equal(await page.evaluate(() => window.clean(window.detached)), true)
  assert.equal(await page.evaluate(() => window.totalRanges()), 0)
  await page.evaluate(() => document.getElementById('host').append(window.detached))
  await settle()
  assert.equal(await page.evaluate(() => window.rangeFor('snippet').toString()), '73')

  // 在 queue 与 RAF process 之间才变成不合格，process 必须再检查。
  await page.evaluate(() => {
    document.getElementById('snippet').firstChild.nodeValue = 'const count = 91'
    queueMicrotask(() => {
      const pre = document.createElement('pre'); pre.id = 'excluded'
      document.getElementById('host').append(pre); pre.append(document.getElementById('snippet'))
    })
  })
  await settle()
  assert.equal(await page.evaluate(() => window.clean(document.getElementById('snippet'))), true)
  await page.evaluate(() => { document.getElementById('host').append(document.getElementById('snippet')); document.getElementById('excluded').remove() })
  await settle()

  // 真 store storage-event 配置热更新：syntax off 不摘 pill，四种 marker。
  await page.evaluate(() => window.setConfig({ syntax: false, marker: 'off' }))
  await settle()
  assert.equal(await page.evaluate(() => window.totalRanges()), 0)
  assert.equal(await page.locator('.dshcp-pill').count(), 3)
  assert.equal(await page.locator('[data-dshcp-badge], [data-dshcp-icon]').count(), 0)
  for (const marker of ['icon', 'both', 'label']) {
    await page.evaluate(marker => window.setConfig({ syntax: true, marker }), marker)
    await settle()
    assert.equal(await page.evaluate(() => window.rangeFor('snippet').toString()), '91')
    assert.equal(await page.locator('#file').getAttribute('data-dshcp-badge'), marker === 'icon' ? null : 'DOCKER')
    assert.equal(await page.locator('#file').getAttribute('data-dshcp-icon'), marker === 'label' ? null : 'file')
    assert.equal(await page.locator('#config').getAttribute('data-dshcp-icon'), marker === 'label' ? null : 'config')
    assert.equal(await page.locator('#snippet').getAttribute('data-dshcp-icon'), null, 'markers only identify filenames, not expressions')
    assert.equal(await page.locator('#snippet').evaluate(code => code.childNodes.length), 1, 'no DOM inserted into code')
  }

  // icon 已存在时移入排除容器、再连同祖先移出DOM，都必须完整清理。
  await page.evaluate(() => window.setConfig({ syntax: true, marker: 'both' }))
  await settle()
  await page.evaluate(() => {
    const wrapper = document.createElement('pre'); wrapper.id = 'icon-excluded'
    document.body.append(wrapper); wrapper.append(document.getElementById('config'))
  })
  await settle()
  assert.equal(await page.evaluate(() => window.clean(document.getElementById('config'))), true)
  await page.evaluate(() => {
    const wrapper = document.createElement('section'); wrapper.id = 'removable-subtree'
    document.body.append(wrapper); wrapper.append(document.getElementById('config'))
    document.getElementById('icon-excluded').remove()
  })
  await settle()
  assert.equal(await page.locator('#config').getAttribute('data-dshcp-icon'), 'config')
  await page.evaluate(() => {
    window.detachedSubtree = document.getElementById('removable-subtree')
    window.detachedConfig = document.getElementById('config')
    window.detachedSubtree.remove()
  })
  await settle()
  assert.equal(await page.evaluate(() => window.clean(window.detachedConfig)), true)
  await page.evaluate(() => document.body.append(window.detachedSubtree))
  await settle()
  assert.equal(await page.locator('#config').getAttribute('data-dshcp-icon'), 'config')

  // 动态新增code即使同帧text多次改变也只渲染最终值，删掉后不留Range。
  await page.evaluate(() => {
    const code = document.createElement('code'); code.id = 'new-code'; code.textContent = 'return 2'
    document.body.append(code); code.firstChild.nodeValue = 'return 3'
  })
  await settle()
  assert.equal(await page.evaluate(() => window.rangeFor('new-code').toString()), '3')
  await page.evaluate(() => { window.newCode = document.getElementById('new-code'); window.newCode.remove() })
  await settle()
  assert.equal(await page.evaluate(() => window.clean(window.newCode)), true)
  assert.equal(await page.evaluate(() => window.totalRanges()), 2)

  // 动态CSS必须重写到唯一运行态style，并影响计算样式。
  const oldCss = await page.locator('style[data-plugin-css="dsh-code-pill"]').textContent()
  await page.evaluate(() => window.setConfig({ syntax: true, marker: 'label', fontScale: 1.05 }))
  await settle()
  assert.equal(await page.locator('style[data-plugin-css="dsh-code-pill"]').count(), 1)
  assert.notEqual(await page.locator('style[data-plugin-css="dsh-code-pill"]').textContent(), oldCss)
  assert.equal(await page.locator('#snippet').evaluate(code => getComputedStyle(code).getPropertyValue('--dshcp-font-scale').trim()), '1.05em')

  // configure清Range后、下一RAF前dispose：不能遗漏仍有class/属性的节点。
  await page.evaluate(() => {
    window.setConfig({ syntax: false, marker: 'both' })
    for (const dispose of window.disposers.reverse()) dispose()
  })
  await settle()
  assert.equal(await page.locator('.dshcp-pill, [data-dshcp-badge], [data-dshcp-icon], [data-dshcp-text]').count(), 0)
  assert.equal(await page.locator('style[data-plugin-css="dsh-code-pill"]').count(), 0)
  assert.equal(await page.evaluate(() => [...CSS.highlights.keys()].filter(key => key.startsWith('dshcp-')).length), 0)
  await page.evaluate(() => {
    window.rafCalls = 0
    window.setConfig({ syntax: true, marker: 'label' })
    document.getElementById('snippet').firstChild.nodeValue = 'const count = 99'
  })
  await settle()
  assert.equal(await page.evaluate(() => window.rafCalls), 0, 'observer and store subscription removed')

  // 无 Highlight API 仍保留 pill 和徽章；无 slots/React 的 UI 安装安全降级。
  await page.evaluate(() => {
    window.Highlight = undefined
    window.disposers = []
    window.plugin.apply({ effect(cb) { window.disposers.push(cb()) } })
  })
  await settle()
  assert.equal(await page.locator('.dshcp-pill').count(), 3)
  assert.equal(await page.locator('#file').getAttribute('data-dshcp-badge'), 'DOCKER')
  await page.evaluate(() => { for (const dispose of window.disposers.reverse()) dispose() })
  assert.equal(await page.locator('.dshcp-pill').count(), 0)
  assert.deepEqual(errors, [], 'no page errors')
  console.log('dynamic render: real Chrome mutation/Range/eligibility/RAF/settings/dispose/degraded API OK')
} finally {
  await browser.close()
}
