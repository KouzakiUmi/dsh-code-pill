/**
 * dsh-code-pill — 思考文字「彩虹刷入」测试（真 Chrome + 最终 lib/client.js）。
 *
 * 宿主把运行中的思考渲染成 data-variant=think / data-state=running 的行，展开正文是
 * data-markdown-variant=compact 的流式 Markdown，折叠预览是 data-streaming 摘要。
 * 这里复刻该结构，用「整段重写 nodeValue」模拟 React 的原位流式更新，验证：
 * 只给新增文字上色、早先的新文字不会因重写而丢失、历史/结算重挂载不播放、
 * 减少动态效果与开关能完整停用、不改宿主子节点。
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const bundle = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
assert.ok(!/\/\* __(?:TOKENIZER|PATH_RENDERER|THINK_INK|CSS|SETTINGS_CORE|SETTINGS_UI|FONT_CORE|FONT_UI)__ \*\//.test(bundle), 'all build slots replaced')

/** 最小 PNG 解码（8 位 RGB/RGBA，无交错）：只为统计「饱和像素」。 */
function decodePng(buffer) {
  assert.equal(buffer.subarray(1, 4).toString(), 'PNG')
  let at = 8, width = 0, height = 0, type = 0
  const idat = []
  while (at < buffer.length) {
    const length = buffer.readUInt32BE(at), kind = buffer.subarray(at + 4, at + 8).toString()
    const body = buffer.subarray(at + 8, at + 8 + length)
    if (kind === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); type = body[9]; assert.equal(body[8], 8); assert.equal(body[12], 0) }
    if (kind === 'IDAT') idat.push(body)
    at += 12 + length
  }
  const channels = type === 6 ? 4 : 3
  assert.ok(type === 6 || type === 2, 'unsupported png colour type')
  const raw = inflateSync(Buffer.concat(idat)), stride = width * channels
  const out = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? out[y * stride + x - channels] : 0
      const up = y > 0 ? out[(y - 1) * stride + x] : 0
      const upLeft = y > 0 && x >= channels ? out[(y - 1) * stride + x - channels] : 0
      let value = line[x]
      if (filter === 1) value += left
      else if (filter === 2) value += up
      else if (filter === 3) value += (left + up) >> 1
      else if (filter === 4) {
        const p = left + up - upLeft, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft)
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft
      }
      out[y * stride + x] = value & 255
    }
  }
  return { width, height, channels, data: out }
}
function saturatedPixels(png) {
  let count = 0
  for (let i = 0; i < png.data.length; i += png.channels) {
    const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2]
    if (Math.max(r, g, b) - Math.min(r, g, b) > 90) count++
  }
  return count
}

const LONG = 'Considering the existing release workflow, the verification step already runs the complete browser suite, so the remaining question is only how the registry reports the processed package. '
const ROW = (id, body, state = 'running') => `
<div class="think" id="${id}" data-variant="think" data-state="${state}" data-expanded>
  <div data-disclosure-header><div data-disclosure-row><span class="leading"></span><span class="title">思考</span></div></div>
  <div class="thinkBody">${body}</div>
</div>`

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('http://dsh-code-pill.test/**', route => route.fulfill({
    contentType: 'text/html; charset=utf-8', body: `<html><head><meta charset="utf-8"><style>
    :root{--dsw-alias-label-tertiary:#8a8f98}
    body{background:#111;color:#ddd;font:16px Arial;padding:24px;width:760px}
    .markdown{color:var(--dsw-alias-label-tertiary);font-size:20px;line-height:1.5}
    .summary{color:var(--dsw-alias-label-tertiary);font-size:20px}
  </style></head><body data-ds-dark-theme>
    <main id="host">
      ${ROW('row', `<div class="markdown" id="md" data-markdown-variant="compact"><p id="p1">${LONG}</p></div>`)}
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
    /** 当前所有彩虹单元覆盖的文字：同一文本节点内首尾相接的单元合并回整词，排序后返回。 */
    window.inkWords = () => {
      const byNode = new Map()
      for (const [name, highlight] of CSS.highlights) {
        if (!name.startsWith('dshcp-ink-')) continue
        for (const range of highlight) {
          const list = byNode.get(range.startContainer) || []
          list.push([range.startOffset, range.endOffset])
          byNode.set(range.startContainer, list)
        }
      }
      const words = []
      for (const [node, list] of byNode) {
        list.sort((x, y) => x[0] - y[0])
        let [from, to] = list[0]
        for (const [start, end] of list.slice(1)) {
          if (start === to) to = end
          else { words.push(node.nodeValue.slice(from, to)); from = start; to = end }
        }
        words.push(node.nodeValue.slice(from, to))
      }
      return words.sort()
    }
    window.inkNames = () => Array.from(CSS.highlights.keys()).filter(name => name.startsWith('dshcp-ink-')).length
    /** 追加文字：整段重写 nodeValue，与 React 的原位更新一致。 */
    window.append = (id, text) => { const node = document.getElementById(id).firstChild; node.nodeValue = node.nodeValue + text }
  })
  await page.addScriptTag({ content: bundle })
  const settle = () => page.evaluate(() => window.settle())
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
  const sat = async () => saturatedPixels(decodePng(await page.locator('#md').screenshot()))
  await settle()

  // 默认关闭：不注册任何彩虹 Highlight，也不给宿主元素加标记。
  await page.evaluate(() => window.append('p1', ' streaming words'))
  await settle()
  assert.equal(await page.evaluate(() => window.inkNames()), 0, '默认不注册彩虹高亮')
  assert.equal(await page.locator('[data-dshcp-ink]').count(), 0)
  assert.ok(!(await page.evaluate(() => document.querySelector('style[data-plugin-css="dsh-code-pill"]').textContent)).includes('::highlight(dshcp-ink-'), '关闭时不注入彩虹 CSS')

  // 开启：已有文字是历史，只有之后新增的文字上色。
  await page.evaluate(() => window.setConfig({ thinkRainbow: true }))
  await settle()
  assert.equal(await page.evaluate(() => window.inkNames()), 80, '开启后注册全部色阶')
  assert.equal(await page.locator('#md[data-dshcp-ink]').count(), 1)
  assert.deepEqual(await page.evaluate(() => window.inkWords()), [], '历史文字不播放')
  const baseline = await sat()

  const nodeBefore = await page.evaluate(() => { window.firstNode = document.getElementById('p1').firstChild; return document.getElementById('md').childNodes.length })
  await page.evaluate(() => window.append('p1', ' alpha beta gamma'))
  // 同一微任务内登记：无需等下一帧。
  assert.deepEqual(await page.evaluate(() => window.inkWords()), ['alpha', 'beta', 'gamma'])
  const during = await sat()
  assert.ok(during > baseline + 600, '新文字确实被画成彩色')

  // 之后 nodeValue 再次被整体重写：早先的新文字仍保留（StaticRange 不折叠）。
  await page.evaluate(() => window.append('p1', ' delta epsilon'))
  assert.deepEqual(await page.evaluate(() => window.inkWords()), ['alpha', 'beta', 'delta', 'epsilon', 'gamma'])

  // 不改宿主子节点：文本节点身份与子节点数量保持。
  assert.equal(await page.evaluate(() => document.getElementById('p1').firstChild === window.firstNode), true)
  assert.equal(await page.evaluate(() => document.getElementById('md').childNodes.length), nodeBefore)

  // 结算：约 1.4s 后全部落回正文色，Highlight 清空，颜色回到宿主色。
  await wait(2200)
  assert.deepEqual(await page.evaluate(() => window.inkWords()), [], '动画结束后单元全部释放')
  const after = await sat()
  // 文字变多会带来少量子像素色边，所以与「彩色期间」比较而不是与基线逐像素比较。
  assert.ok(after < baseline + (during - baseline) * 0.25, '最终颜色回到宿主文字色')

  // 非追加改动（摘要整行替换）整句都是新文字。
  await page.evaluate(() => {
    const host = document.getElementById('host')
    host.insertAdjacentHTML('beforeend', `<div class="think" id="row2" data-variant="think" data-state="running"><div data-disclosure-header><div data-disclosure-row><span class="leading"></span><span class="title">思考</span><span class="summary" id="sum" data-streaming>Evaluating job reruns</span></div></div></div>`)
  })
  await settle()
  await page.evaluate(() => { document.getElementById('sum').firstChild.nodeValue = 'Verifying workflow process' })
  assert.deepEqual((await page.evaluate(() => window.inkWords())).filter(word => ['Verifying', 'workflow', 'process'].includes(word)), ['Verifying', 'process', 'workflow'])
  await wait(1700)

  // 展开时已有大段内容：是历史，不播放；之后追加才播放。
  await page.evaluate(() => {
    document.getElementById('host').insertAdjacentHTML('beforeend', `<div class="think" id="row3" data-variant="think" data-state="running"><div class="thinkBody"><div class="markdown" id="md3" data-markdown-variant="compact"><p id="p3">${'history '.repeat(60)}</p></div></div></div>`)
  })
  await settle()
  assert.deepEqual(await page.evaluate(() => window.inkWords()), [], '挂载时的大段内容不播放')
  await page.evaluate(() => window.append('p3', 'fresh'))
  assert.deepEqual(await page.evaluate(() => window.inkWords()), ['fresh'])
  await wait(1700)

  // 刚开始流式的短内容仍算新文字。
  await page.evaluate(() => {
    document.getElementById('host').insertAdjacentHTML('beforeend', `<div class="think" id="row4" data-variant="think" data-state="running"><div class="thinkBody"><div class="markdown" data-markdown-variant="compact"><p>First tokens</p></div></div></div>`)
  })
  await settle()
  assert.deepEqual(await page.evaluate(() => window.inkWords()), ['First', 'tokens'])
  await wait(1700)

  // 代码块与非运行态：不播放。
  await page.evaluate(() => {
    document.getElementById('md').insertAdjacentHTML('beforeend', '<pre id="code">code</pre>')
    document.getElementById('code').firstChild.nodeValue += ' in a block'
    document.getElementById('row').dataset.state = 'ok'
  })
  await settle()
  assert.deepEqual(await page.evaluate(() => window.inkWords()), [], '代码块不播放')
  await page.evaluate(() => window.append('p1', ' after settle'))
  assert.deepEqual(await page.evaluate(() => window.inkWords()), [], '结算后不播放')
  assert.equal(await page.locator('#row #md[data-dshcp-ink]').count(), 0, '结算后摘掉标记')

  // 结算时整体重渲染（renderSettled 换新节点）：不会把整段正文重新刷一遍。
  await page.evaluate(() => {
    const row = document.getElementById('row3')
    row.dataset.state = 'ok'
    row.querySelector('.markdown').innerHTML = `<p>${'history '.repeat(60)}fresh</p><p>restructured</p>`
  })
  await settle()
  assert.deepEqual(await page.evaluate(() => window.inkWords()), [], '结算重渲染不播放')

  // 极端输入：单次超大新增视为整段挂载；同时动画单元有上限。
  await page.evaluate(() => {
    document.getElementById('host').insertAdjacentHTML('beforeend', `<div class="think" id="row5" data-variant="think" data-state="running"><div class="thinkBody"><div class="markdown" data-markdown-variant="compact"><p id="p5">${'seed '.repeat(40)}</p></div></div></div>`)
  })
  await settle()
  await page.evaluate(() => window.append('p5', 'giant '.repeat(300)))
  assert.deepEqual(await page.evaluate(() => window.inkWords()), [], '超大新增不播放')
  await page.evaluate(() => { for (let i = 0; i < 40; i++) window.append('p5', ' burst'.repeat(30)) })
  assert.ok((await page.evaluate(() => window.inkWords())).length <= 600, '动画单元有上限')
  await wait(1700)

  // 系统「减少动态效果」：完全停用；恢复后重新可用。
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await settle()
  assert.equal(await page.evaluate(() => window.inkNames()), 0, '减少动态效果时不注册')
  await page.evaluate(() => window.append('p5', ' calm'))
  assert.deepEqual(await page.evaluate(() => window.inkWords()), [])
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await settle()
  assert.equal(await page.evaluate(() => window.inkNames()), 80)
  await page.evaluate(() => window.append('p5', ' lively'))
  assert.deepEqual(await page.evaluate(() => window.inkWords()), ['lively'])

  // 关闭开关：Highlight、标记与 CSS 全部撤销。
  await page.evaluate(() => window.setConfig({ thinkRainbow: false }))
  await settle()
  assert.equal(await page.evaluate(() => window.inkNames()), 0)
  assert.equal(await page.locator('[data-dshcp-ink]').count(), 0)
  assert.ok(!(await page.evaluate(() => document.querySelector('style[data-plugin-css="dsh-code-pill"]').textContent)).includes('::highlight(dshcp-ink-'))

  // 再次开启后卸载：不留任何痕迹。
  await page.evaluate(() => window.setConfig({ thinkRainbow: true }))
  await settle()
  await page.evaluate(() => window.append('p5', ' last'))
  await page.evaluate(() => window.dispose())
  await settle()
  assert.equal(await page.evaluate(() => window.inkNames()), 0)
  assert.equal(await page.locator('[data-dshcp-ink]').count(), 0)
  assert.equal(await page.locator('style[data-plugin-css="dsh-code-pill"]').count(), 0)
  assert.deepEqual(errors, [], 'no page errors')
  console.log('think ink: rainbow-then-settle on streamed thinking text, history/remount/reduced-motion/toggle/dispose OK')
} finally { await browser.close() }
