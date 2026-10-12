/** Reproducible documentation artwork: actual client bundle + isolated Chromium frames. */
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const { CP_SETTINGS } = require('../src/settings-core.cjs')
const bundle = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const output = new URL('../assets/', import.meta.url)
mkdirSync(output, { recursive: true })
const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const fonts = '"Noto Sans SC", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
const mono = '"Sarasa Term SC", "Cascadia Code", monospace'
const pages = new Map()
let serial = 0
function sample(config, theme, html, extra = '') {
  const host = `sample-${++serial}.code-pill.test`
  const dark = theme === 'dark'
  pages.set(host, `<html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:${dark ? '#1e1e1e' : '#ffffff'};color:${dark ? '#d7d7d7' : '#343434'};font:16px ${fonts};line-height:1.95}code{font-family:${mono}}p{margin:12px 0}.caption{font-size:11px;color:${dark ? '#a8a8a8' : '#777'};letter-spacing:.08em;margin-bottom:20px}.rule{height:1px;background:${dark ? '#383838' : '#eee'};margin:18px 0}.foot{font-size:11px;color:${dark ? '#aaa' : '#777'}}${extra}</style></head><body ${dark ? 'data-ds-dark-theme' : ''}><script>localStorage.setItem('dsh-code-pill.settings.v1',${JSON.stringify(CP_SETTINGS.stringify(config))});window.__ModuleLoader__={load(spec){spec.factory(()=>{}).apply({effect(cb){cb()}})}};</script>${html}</body></html>`)
  return `<iframe title="${escape(config.preset + ' ' + theme)}" src="https://${host}/" scrolling="no"></iframe>`
}
const shared = `*{box-sizing:border-box}body{margin:0;font-family:${fonts};color:#22221f;background:#f5f3ed}iframe{border:0;display:block;width:100%;height:100%}.eyebrow{font-size:12px;letter-spacing:.15em;color:#777568}.amber{color:#916200}`
const config = CP_SETTINGS.defaults()
const heroSample = sample(config, 'dark', `<div class="caption">CODE PILL / AMBER CLASSIC</div><p>在 <code>src/settings-core.cjs</code> 中维护色板。</p><p>声明 <code>const count = 42</code>，<br>调用 <code>print("hello")</code>。</p><p>运行 <code>node scripts/build.mjs</code><br>让代码自然融入对话。</p><div class="rule"></div><div class="foot">行内语法色 · 文件语言徽章 · 深浅主题</div>`, 'body{padding:32px;font-size:19px}p{margin:20px 0}.caption{margin-bottom:30px}')
const hero = `<html><head><meta charset="utf-8"><style>${shared}
body{width:1440px;height:760px;padding:56px 64px;background:radial-gradient(circle at 5% 10%,#fdfbf5,transparent 60%),#f2efe7}.top{display:flex;justify-content:space-between;align-items:center}.brand{font-size:13px;font-weight:600;letter-spacing:.08em}.main{display:grid;grid-template-columns:1.1fr 1fr;gap:70px;align-items:center;margin-top:50px}.headline{font-size:96px;letter-spacing:-.06em;font-weight:750;line-height:1.1;margin:18px 0 30px}.headline span{background:#eadcb8;border-radius:22px;padding:0 20px 7px;color:#805600}.tagline{font-size:30px;font-weight:500;letter-spacing:-.02em;margin:0 0 18px}.description{font-size:16px;color:#777366;line-height:1.9;max-width:500px}.sample{height:420px;border-radius:20px;overflow:hidden;border:1px solid #45413a;box-shadow:0 18px 40px #3b302716;transform:rotate(-1deg)}.bottom{display:flex;align-items:center;justify-content:space-between;margin-top:56px;padding-top:22px;border-top:1px solid #d9d5ca}.presets{display:flex;gap:16px}.preset{font-size:12px;color:#6f6a5f;display:flex;gap:7px;align-items:center}.dot{width:10px;height:10px;border-radius:50%}.note{font-size:11px;letter-spacing:.04em;color:#8b867a}
</style></head><body><div class="top"><span class="brand">DSH / CLIENT PLUGIN</span><span class="eyebrow">READABILITY, NOT DECORATION.</span></div><div class="main"><section><div class="eyebrow">YOUR CODE. YOUR PALETTE.</div><h1 class="headline">Code <span>Pill</span></h1><p class="tagline">代码更清楚，阅读更连贯。</p><p class="description">轻薄的代码胶囊，克制的语法色。<br>六套深浅配对预设，让每段对话有自己的阅读节奏。</p></section><div class="sample">${heroSample}</div></div><div class="bottom"><div class="presets">${CP_SETTINGS.PRESETS.map(p=>`<span class="preset"><i class="dot" style="background:${p.light.plain}"></i>${escape(p.name)}</span>`).join('')}</div><span class="note">ACTUAL CLIENT RENDER · ISOLATED PREVIEW</span></div></body></html>`
const galleryRows = CP_SETTINGS.PRESETS.map((preset, index) => {
  const cfg = CP_SETTINGS.presetConfig(preset.id)
  const content = `<p>文件 <code>src/tokenizer.cjs</code></p><p><code>const count = 42</code></p><p><code>print("hello")</code> · <code>return count</code></p>`
  return `<div class="preset-label"><small>0${index + 1}</small><strong>${escape(preset.name)}</strong><span>${escape(preset.description)}</span></div><div class="tile">${sample(cfg, 'light', content, 'body{padding:12px 24px;font-size:17px}p{margin:9px 0}')}</div><div class="tile">${sample(cfg, 'dark', content, 'body{padding:12px 24px;font-size:17px}p{margin:9px 0}')}</div>`
}).join('')
const gallery = `<html><head><meta charset="utf-8"><style>${shared}body{width:1440px;padding:40px 48px 32px}.heading{display:flex;align-items:baseline;gap:18px;margin-bottom:28px}h1{font-size:30px;letter-spacing:-.03em;margin:0}.sub{font-size:13px;color:#827b6f}.grid{display:grid;grid-template-columns:230px 1fr 1fr;gap:14px 20px}.column{font-size:11px;letter-spacing:.12em;color:#827b6f}.tile{height:155px;border-radius:10px;overflow:hidden;border:1px solid #d7d1c5}.preset-label{padding:20px 12px 0 0}.preset-label small{font-size:10px;color:#999;letter-spacing:.1em}.preset-label strong{display:block;font-size:17px;margin:7px 0}.preset-label span{font-size:11px;color:#827b6f;line-height:1.7;display:block}.footer{font-size:10px;color:#827b6f;letter-spacing:.03em;margin-top:22px}</style></head><body><div class="heading"><h1>同一段代码，六种阅读节奏。</h1><span class="sub">不是滤镜：每套分别设计浅色与深色色板。</span></div><div class="grid"><div></div><div class="column">LIGHT / 浅色</div><div class="column">DARK / 深色</div>${galleryRows}</div><div class="footer">真实 client bundle 渲染 · 默认参数 · 隔离测试页，非 DSH 整页截图</div></body></html>`
const markerRows = ['off', 'label', 'icon', 'both'].map((marker, i) => {
  const cfg = CP_SETTINGS.defaults(); cfg.marker = marker
  return `<div class="mode">${['关闭', '语言文字', '小图标', '图标＋文字'][i]}</div><div class="marker-tile">${sample(cfg, 'light', '<p><code>src/tokenizer.cjs</code> · <code>README.md</code> · <code>const count = 42</code></p>', 'body{padding:10px 20px;font-size:17px}p{margin:0}')}</div>`
}).join('')
const markers = `<html><head><meta charset="utf-8"><style>${shared}body{width:1200px;padding:36px 44px}h1{font-size:26px;letter-spacing:-.02em;margin:0 0 10px}.sub{font-size:13px;color:#827b6f;margin-bottom:26px}.grid{display:grid;grid-template-columns:130px 1fr;gap:12px}.mode{font-size:13px;display:flex;align-items:center}.marker-tile{height:60px;overflow:hidden;border-radius:8px;border:1px solid #d7d1c5}.foot{font-size:10px;color:#827b6f;margin-top:20px}</style></head><body><h1>标记文件，不打扰表达式。</h1><div class="sub">四种文件标记模式。图标继承文字颜色，不插入消息子节点。</div><div class="grid">${markerRows}</div><div class="foot">真实 client bundle 渲染 · 隔离预览</div></body></html>`
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true })
try {
  for (const [name, html, width, height] of [['banner', hero, 1440, 760], ['presets', gallery, 1440, 1240], ['markers', markers, 1200, 440]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
    const errors = []
    await context.route('https://*.code-pill.test/**', route => {
      const host = new URL(route.request().url()).hostname
      return route.fulfill({ contentType: 'text/html', body: host === 'docs.code-pill.test' ? html : pages.get(host) || '' })
    })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('https://docs.code-pill.test/')
    for (const frame of page.frames().filter(frame => frame !== page.mainFrame())) {
      await frame.waitForLoadState('domcontentloaded')
      await frame.addScriptTag({ content: bundle })
      await frame.waitForFunction(() => [...document.querySelectorAll('code')].every(code => code.classList.contains('dshcp-pill')))
      const rendered = await frame.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem('dsh-code-pill.settings.v1'))
        const theme = document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light'
        return { expected: saved[theme].plain, actual: getComputedStyle(document.querySelector('code')).color, palette: getComputedStyle(document.body).getPropertyValue('--dshcp-plain').trim(), text: document.body.textContent }
      })
      assert.equal(rendered.palette, rendered.expected, `${name}: frame must use its own preset`)
      assert.ok(!rendered.text.includes('\ufffd'), `${name}: invalid UTF-8 text`)
      await frame.evaluate(() => document.fonts.ready)
    }
    await page.evaluate(() => document.fonts.ready)
    assert.deepEqual(errors, [], `${name} render errors`)
    await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage: true })
    await context.close()
    console.log(`documentation asset: assets/${name}.png`)
  }
} finally { await browser.close() }
