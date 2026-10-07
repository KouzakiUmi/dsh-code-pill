import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } })
  await page.setContent(`<html><head><style>body{background:#111;color:#ddd;font:16px Arial;padding:40px;line-height:2}code{background:#292929;border:1px solid #444;padding:2px 5px;color:#ddd;font:13px Consolas}</style></head><body data-ds-dark-theme><p><code>isListView</code> wraps <code>{ v }</code> in <code>isPlainObject</code>. Use a <code>Set.has</code>.</p><p><code>ready()</code> and <code>restore()</code> mutate state (<code>st.mode = 'ready'</code>), while <code>state.mjs</code> uses copies.</p><p>Run <code>npm test</code> and <code>npm run test:composition</code>.</p><p>Path: <code>src/tokenizer.cjs</code> · Constant: <code>SYNONYM_INDEX</code></p><p><code>const count = 42</code> · <code>print("hello")</code></p></body></html>`)
  await page.evaluate(() => { window.__ModuleLoader__ = { load(spec) { spec.factory(() => {}).apply({ effect(cb) { window.cleanup = cb() } }) } } })
  await page.addScriptTag({ content: readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8') })
  await page.waitForFunction(() => document.querySelectorAll('.dshcp-pill').length === document.querySelectorAll('code').length)
  const rendered = await page.evaluate(() => ({
    color: getComputedStyle(document.querySelector('code')).color,
    border: getComputedStyle(document.querySelector('code')).borderTopWidth,
    ranges: CSS.highlights.get('dshcp-str').size,
    badges: document.querySelectorAll('[data-dshcp-badge]').length
  }))
  assert.equal(rendered.color, 'rgb(226, 191, 112)')
  assert.equal(rendered.border, '0px')
  assert.ok(rendered.ranges >= 2, 'string tokens use real browser Highlight ranges')
  assert.equal(rendered.badges, 0)
  await page.screenshot({ path: new URL('../dist/inline-preview.png', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') })
  await page.evaluate(() => window.cleanup())
  assert.equal(await page.locator('.dshcp-pill').count(), 0)
  console.log('browser render: colors, highlights, cleanup OK')
} finally { await browser.close() }
