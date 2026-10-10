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
  const rendered = await page.evaluate(() => {
    const badgeOf = (text) => {
      for (const code of document.querySelectorAll('code[data-dshcp-badge]')) {
        if (code.textContent === text) return code.dataset.dshcpBadge
      }
      return null
    }
    return {
      color: getComputedStyle(document.querySelector('code')).color,
      border: getComputedStyle(document.querySelector('code')).borderTopWidth,
      strRanges: CSS.highlights.get('dshcp-str').size,
      numRanges: CSS.highlights.get('dshcp-num').size,
      badges: document.querySelectorAll('[data-dshcp-badge]').length,
      badgeMjs: badgeOf('state.mjs'),
      badgeCjs: badgeOf('src/tokenizer.cjs'),
      darkNumVar: getComputedStyle(document.body).getPropertyValue('--dshcp-num').trim(),
      darkKwdVar: getComputedStyle(document.body).getPropertyValue('--dshcp-kwd').trim()
    }
  })
  // Dark 主题：plain 琥珀签名色（#e2bf70）
  assert.equal(rendered.color, 'rgb(226, 191, 112)')
  assert.equal(rendered.border, '0px')
  assert.ok(rendered.strRanges >= 2, 'string tokens use real browser Highlight ranges')
  assert.ok(rendered.numRanges >= 1, 'number tokens use real browser Highlight ranges')
  // 徽章恢复：文件名带徽章，内容与扩展名映射一致
  assert.equal(rendered.badges, 2)
  assert.equal(rendered.badgeMjs, 'JS')
  assert.equal(rendered.badgeCjs, 'JS')
  // Dark 色板：num 独立色 #6aab87，kwd 加深蓝 #7aa7d4
  assert.equal(rendered.darkNumVar, '#6aab87')
  assert.equal(rendered.darkKwdVar, '#7aa7d4')

  // Light 主题色板变量（切掉 dark 属性后 CSS 变量应回落到 html:root 定义）
  const lightVars = await page.evaluate(() => {
    document.body.removeAttribute('data-ds-dark-theme')
    const cs = getComputedStyle(document.body)
    return {
      num: cs.getPropertyValue('--dshcp-num').trim(),
      kwd: cs.getPropertyValue('--dshcp-kwd').trim(),
      str: cs.getPropertyValue('--dshcp-str').trim(),
      com: cs.getPropertyValue('--dshcp-com').trim(),
      pillColor: getComputedStyle(document.querySelector('code')).color
    }
  })
  assert.equal(lightVars.num, '#0a7a52')
  assert.equal(lightVars.kwd, '#0451a5')
  assert.equal(lightVars.str, '#8a1e1e')
  assert.equal(lightVars.com, '#64707a')
  assert.equal(lightVars.pillColor, 'rgb(145, 98, 0)')

  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''))
  await page.screenshot({ path: new URL('../dist/inline-preview.png', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') })
  await page.evaluate(() => window.cleanup())
  assert.equal(await page.locator('.dshcp-pill').count(), 0)
  assert.equal(await page.locator('[data-dshcp-badge]').count(), 0)
  console.log('browser render: colors, highlights, badges, theme switch, cleanup OK')
} finally { await browser.close() }
