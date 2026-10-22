/** Reproducible documentation artwork: actual client bundle + isolated Chromium frames. */
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { renderRows, renderInkFrames, dataUri } from './doc-scenes.mjs'
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
const heroHtml = rowsImage => '<html><head><meta charset="utf-8"><style>' + shared + 'html{overflow:hidden}body{width:1440px;height:760px;position:relative;overflow:hidden;color:#f4f1ea;background:radial-gradient(circle at 78% 18%,#2b2417 0,transparent 55%),radial-gradient(circle at 12% 95%,#2a1d12 0,transparent 50%),linear-gradient(135deg,#12110e,#1a1812 60%,#100f0c)}.edge{position:absolute;left:0;top:0;bottom:0;width:10px;background:linear-gradient(180deg,#f2c14e,#c47a1c 55%,#8a4b12)}.orb{position:absolute;right:-140px;top:-170px;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,#f2c14e22,transparent 68%)}.left{position:absolute;left:84px;top:150px;width:640px}.kicker{font-size:15px;letter-spacing:.3em;color:#f2c14e;margin-bottom:24px}.name{font-size:92px;font-weight:700;letter-spacing:-.045em;line-height:1.05;margin:0 0 20px;color:#fffaf0}.name em{font-style:normal;color:#f2c14e}.tag{font-size:34px;font-weight:500;color:#cfc8b8;margin:0 0 22px;letter-spacing:-.01em}.sub{font-size:19px;color:#9a9384;line-height:1.9;margin:0 0 30px}.chips{display:flex;gap:12px}.chip{font-size:15px;color:#f4e3b8;border:1.5px solid #f2c14e66;background:#f2c14e12;border-radius:999px;padding:7px 18px}.small{position:absolute;left:84px;bottom:56px;font-size:13px;letter-spacing:.06em;color:#797263}.card{position:absolute;border-radius:20px;overflow:hidden;box-shadow:0 26px 60px #00000070}.c1{left:800px;top:44px;width:500px;height:350px;transform:rotate(-2.4deg);border:1px solid #4a4538;z-index:2}.c2{left:850px;top:414px;width:500px;transform:rotate(1.6deg);border:1px solid #e3ddcc;background:#fff;z-index:1;padding:14px 18px;line-height:0}.c2 img{width:100%;display:block}</style></head><body><div class="edge"></div><div class="orb"></div><section class="left"><div class="kicker">DSH PLUGIN · CODE &amp; ROWS</div><h1 class="name">dsh-code<em>-pill</em></h1><p class="tag">代码更清楚，阅读更连贯。</p><p class="sub">行内代码胶囊、文件标记、聊天文件路径<br>折叠动作行着色与思考文字刷入，按需开启</p><div class="chips"><span class="chip">六套深浅预设</span><span class="chip">文件徽章</span><span class="chip">动作行着色</span></div></section><div class="small">真实组件 · 隔离渲染 · 非 DSH 整页截图</div><div class="card c1">' + heroSample + '</div><div class="card c2"><img src="' + rowsImage + '"></div></body></html>'
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
  const heroRows = dataUri(await renderRows(browser, bundle, { theme: 'light', tint: true, rows: 'hero', width: 460 }))
  for (const [name, html, width, height, scale] of [['banner', heroHtml(heroRows), 1440, 760, 2], ['presets', gallery, 1440, 1240, 1], ['markers', markers, 1200, 440, 1]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale })
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
    await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage: name !== 'banner', clip: name === 'banner' ? { x: 0, y: 0, width, height } : undefined })
    await context.close()
    console.log(`documentation asset: assets/${name}.png`)
  }
  // Feature scenes: folded-row tint and thinking ink, rendered from the same bundle.
  const featureShell = (title, sub, body, foot) => '<html><head><meta charset="utf-8"><style>' + shared + 'body{width:1200px;padding:36px 44px 28px;background:#f5f3ed}h1{font-size:26px;letter-spacing:-.02em;margin:0 0 10px}.sub{font-size:13px;color:#827b6f;margin-bottom:24px;line-height:1.7}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px 24px}.cap{font-size:11px;letter-spacing:.12em;color:#827b6f;margin:0 0 7px}.panel{border-radius:10px;overflow:hidden;border:1px solid #d7d1c5;line-height:0}.panel img{display:block;width:100%}.foot{font-size:10px;color:#827b6f;margin-top:20px;letter-spacing:.03em}.t{font-size:11px;color:#6f6a5f;letter-spacing:.08em;margin:12px 0 4px}</style></head><body><h1>' + title + '</h1><div class="sub">' + sub + '</div>' + body + '<div class="foot">' + foot + '</div></body></html>'
  const rowShots = {}
  for (const theme of ['dark', 'light']) for (const tint of [false, true]) rowShots[theme + tint] = dataUri(await renderRows(browser, bundle, { theme, tint }))
  const rowBody = '<div class="grid">' + ['dark', 'light'].map(theme => ['false', 'true'].map(on => '<div><div class="cap">' + (theme === 'dark' ? 'DARK / 深色' : 'LIGHT / 浅色') + ' · ' + (on === 'true' ? '着色开启' : '宿主原样') + '</div><div class="panel"><img src="' + rowShots[theme + on] + '"></div></div>').join('')).join('') + '</div>'
  const rowsPage = featureShell('一眼分清，这一行在做什么。', '读取、搜索、写入、命令、思考各有颜色；失败与中断更醒目，“已完成”“已交付”等状态词单独着色。描述保持宿主色，未归类的行不动。', rowBody, '真实 client bundle 渲染 · 默认色板 · 隔离测试页，非 DSH 整页截图')
  const inkFrames = {}
  for (const theme of ['dark', 'light']) inkFrames[theme] = await renderInkFrames(browser, bundle, theme)
  const inkParts = ['<div class="grid">' + inkFrames.dark.map((dark, i) => {
    const light = inkFrames.light[i]
    return '<div><div class="cap">DARK / 深色 · +' + dark.at + ' ms</div><div class="panel"><img src="' + dataUri(dark.png) + '"></div></div><div><div class="cap">LIGHT / 浅色 · +' + light.at + ' ms</div><div class="panel"><img src="' + dataUri(light.png) + '"></div></div>'
  }).join('') + '</div>']
  const inkPage = featureShell('刚出现的字，像被一笔刷上去。', '新单词以固定初始色出现，再在约 400ms 内淡回宿主正文色；只保留最近 16 个活跃词，不轮换同一词的色相，也不重播历史。开启“减少动态效果”时自动停用。', inkParts.join(''), '真实 client bundle 渲染 · 时间点为实测 · 隔离测试页，非 DSH 整页截图')
  for (const [name, html, width, height] of [['feature-rows', rowsPage, 1200, 900], ['feature-ink', inkPage, 1200, 900]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
    const errors = []
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.setContent(html)
    await page.evaluate(() => document.fonts.ready)
    assert.deepEqual(errors, [], name + ' page errors')
    await page.screenshot({ path: fileURLToPath(new URL(name + '.png', output)), fullPage: true })
    await context.close()
    console.log('documentation asset: assets/' + name + '.png')
  }
} finally { await browser.close() }
