import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const { CP_SETTINGS } = require('../src/settings-core.cjs')
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 900, height: 1100 } })
  const page = await context.newPage()
  await page.route('https://code-pill.test/**', route => route.fulfill({ contentType: 'text/html', body: '<body style="font:14px system-ui;padding:24px;margin:0"><div id="settings"></div><p id="chat">真实聊天 <code>const count = 42</code> <code>settings.ts</code></p></body>' }))
  await page.goto('https://code-pill.test/')
  for (const module of ['react', 'react-dom']) {
    await page.addScriptTag({ content: readFileSync(require.resolve(module).replace(/index\.js$/, `umd/${module}.development.js`), 'utf8') })
  }
  // React is real; host primitives are structural doubles, not copies of their styling.
  await page.evaluate(() => {
    const h = React.createElement
    const ui = {
      Button: ({ size, variant, children, ...props }) => h('button', props, children),
      Input: React.forwardRef((props, ref) => h('input', { ...props, ref })),
      Switch: ({ checked, onChange, label }) => h('button', { role: 'switch', 'aria-label': label, 'aria-checked': checked, onClick: () => onChange(!checked) }, checked ? '开启' : '关闭')
    }
    const disposers = []
    window.__ModuleLoader__ = { load(spec) {
      const ctx = {
        effect(cb) { const off = cb(); if (typeof off === 'function') disposers.push(off) },
        slots: {
          inject(name, cb) { return cb() },
          register(meta, render) {
            window.settingsMeta = meta
            const root = ReactDOM.createRoot(document.getElementById('settings'))
            root.render(render())
            return () => root.unmount()
          }
        }
      }
      const slotService = ctx.slots
      ctx.get = name => name === 'slots' ? slotService : undefined
      Object.defineProperty(ctx, 'slots', { get() { throw Error('cannot get slots without inject') } })
      spec.factory(name => { if (name === 'react') return React; if (name === '@deepseek-ai/dsh-client-ui-primitives') return ui; throw Error(name) }).apply(ctx)
      window.cleanup = () => disposers.reverse().forEach(off => off())
    } }
  })
  await page.addScriptTag({ content: readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8') })
  await page.getByRole('heading', { name: 'Code Pill', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.settingsMeta.name), 'settings.section')
  const chat = page.locator('#chat code').first()
  const original = await chat.evaluate(code => getComputedStyle(code).color)
  await page.getByRole('button', { name: /冷调清晰/ }).click()
  assert.equal(await chat.evaluate(code => getComputedStyle(code).color), original, 'draft must not mutate chat')
  await page.getByRole('button', { name: '取消更改', exact: true }).click()
  await page.getByRole('button', { name: /冷调清晰/ }).click()
  await page.evaluate(() => { window.nativeSetItem = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw Error('test storage denied') } })
  await page.getByRole('button', { name: '保存并应用', exact: true }).click()
  await page.getByText(/保存失败/).waitFor()
  assert.equal(await chat.evaluate(code => getComputedStyle(code).color), original, 'failed save must not apply')
  await page.evaluate(() => { Storage.prototype.setItem = window.nativeSetItem })
  await page.getByRole('button', { name: '保存并应用', exact: true }).click()
  await page.waitForFunction(() => localStorage.getItem('dsh-code-pill.settings.v1') !== null)
  const savedColor = await chat.evaluate(code => getComputedStyle(code).color)
  assert.notEqual(savedColor, original)
  const restoredPage = await page.context().newPage()
  await restoredPage.route('https://code-pill.test/**', route => route.fulfill({ contentType: 'text/html', body: '<body><code>settings.ts</code></body>' }))
  await restoredPage.goto('https://code-pill.test/restore')
  await restoredPage.evaluate(() => { window.__ModuleLoader__ = { load(spec) { spec.factory(() => {}).apply({ effect(cb) { cb() } }) } } })
  await restoredPage.addScriptTag({ content: readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8') })
  await restoredPage.waitForFunction(() => document.querySelector('.dshcp-pill'))
  assert.equal(await restoredPage.locator('code').evaluate(code => getComputedStyle(code).color), savedColor, 'new page restores persisted appearance')
  await restoredPage.close()
  await page.getByLabel('文件标记', { exact: true }).selectOption('both')
  await page.getByRole('switch', { name: '行内语法着色' }).click()
  await page.getByRole('button', { name: '保存并应用', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('#chat code:last-child').dataset.dshcpIcon !== undefined)
  assert.equal(await page.locator('#chat code').last().getAttribute('data-dshcp-badge'), 'TS')
  assert.equal(await chat.getAttribute('data-dshcp-icon'), null, 'expressions must not acquire file icons')
  assert.equal(await page.evaluate(() => CSS.highlights.get('dshcp-num').size), 0)
  await page.getByLabel('代码块颜色', { exact: true }).selectOption('preset')
  await page.getByRole('button', { name: '保存并应用', exact: true }).click()
  await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--shiki-token-keyword').trim() !== '')
  await page.getByLabel('代码块颜色', { exact: true }).selectOption('host')
  await page.getByRole('button', { name: '保存并应用', exact: true }).click()
  await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--shiki-token-keyword').trim() === '')
  // Full, validated JSON import and parse error feedback.
  await page.locator('summary').click()
  await page.getByRole('button', { name: '导出草稿', exact: true }).click()
  const exported = CP_SETTINGS.parse(await page.getByLabel('配置 JSON').inputValue())
  assert.equal(exported.marker, 'both')
  await page.getByLabel('配置 JSON').fill('{invalid')
  await page.getByRole('button', { name: '导入草稿', exact: true }).click()
  assert.ok(await page.getByRole('status').filter({ hasText: '导入失败' }).count())
  const custom = CP_SETTINGS.presetConfig('amber')
  custom.light.plain = '#eeeeee'
  await page.getByLabel('配置 JSON').fill(CP_SETTINGS.stringify(custom))
  await page.getByRole('button', { name: '导入草稿', exact: true }).click()
  await page.getByText(/低对比度提醒/).waitFor()
  await page.getByRole('button', { name: '恢复默认', exact: true }).click()
  await page.getByRole('button', { name: '保存并应用', exact: true }).click()
  await page.getByRole('button', { name: '深色', exact: true }).click()
  await page.evaluate(() => {
    document.body.setAttribute('data-ds-dark-theme', '')
    document.body.style.cssText += ';background:#171717;color:#dedede;color-scheme:dark;--dsw-alias-bg-layer-0:#171717;--dsw-alias-bg-layer-1:#232323;--dsw-alias-label-secondary-foreground:#a4a4a4;--dsw-alias-border-l4:#414141'
  })
  mkdirSync(new URL('../dist/', import.meta.url), { recursive: true })
  await page.locator('.dshcp-settings').screenshot({ path: new URL('../dist/settings-dark.png', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') })
  await page.getByRole('button', { name: '浅色', exact: true }).click()
  await page.evaluate(() => { document.body.removeAttribute('data-ds-dark-theme'); document.body.style.cssText = 'font:14px system-ui;padding:24px;margin:0;background:white;color:#292929' })
  await page.locator('.dshcp-settings').screenshot({ path: new URL('../dist/settings-light.png', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') })
  await page.setViewportSize({ width: 390, height: 900 })
  assert.ok(await page.evaluate(() => document.querySelector('.dshcp-settings').scrollWidth <= document.querySelector('.dshcp-settings').clientWidth + 1), 'narrow settings page should not overflow')
  await page.evaluate(() => window.cleanup())
  assert.equal(await page.locator('.dshcp-settings').count(), 0)
  assert.equal(await page.locator('#chat .dshcp-pill').count(), 0)
  assert.equal(await page.evaluate(() => CSS.highlights.has('dshcp-num')), false)
  await context.close()
  console.log('settings browser: slot, drafts, save failure, persistence, marker/syntax, block theme, import/export, contrast warning, narrow layout, cleanup OK')
} finally { await browser.close() }
