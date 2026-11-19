// Display-smooth attribution benchmark: long running reply streamed in chunks through the
// real React assistant wrapper (same fixture shape as tests/display-smooth.test.mjs).
// Measures observer/RAF cost, codepoint splitting volume (Array.from on strings), nodeValue
// write volume and frame intervals with displaySmooth off/on. Run: node scripts/benchmark-display-smooth.mjs
// Scale with CHUNKS (default 160 ≈ 12k chars); pick configs with CONFIGS=off,on.
// Synthetic isolated page only (route-intercepted); not a production DSH smoothness acceptance.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const bundle = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const react = readFileSync(require.resolve('react').replace(/index\.js$/, 'umd/react.development.js'), 'utf8')
const reactDom = readFileSync(require.resolve('react-dom').replace(/index\.js$/, 'umd/react-dom.development.js'), 'utf8')

const CHUNKS = +(process.env.CHUNKS || 160)
const CONFIGS = (process.env.CONFIGS || 'off,on').split(',')

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true })
const results = []
try {
  for (const name of CONFIGS) {
    const enabled = name === 'on'
    const page = await browser.newPage({ viewport: { width: 760, height: 640 } })
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route('https://smooth-perf.test/**', route => route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<style>
        body{margin:0;font:16px/24px Arial}#port{height:280px;overflow:auto;border:0}
        #message{white-space:pre-wrap;padding:12px;overflow-wrap:anywhere}
      </style><main id="port" data-conversation-scroll><div id="chat"></div></main>`
    }))
    await page.goto('https://smooth-perf.test/')
    await page.addScriptTag({ content: react })
    await page.addScriptTag({ content: reactDom })
    await page.evaluate(enabled => {
      const nativeRaf = requestAnimationFrame.bind(window), nativeTimeout = setTimeout.bind(window)
      const stats = { observerCallbacks: 0, observerMs: 0, observerMaxMs: 0, rafCallbacks: 0, rafMs: 0, rafMaxMs: 0, charSplits: 0, charSplitChars: 0, nvWrites: 0, nvChars: 0, measuring: false }
      window.stats = stats; window.nativeRaf = nativeRaf; window.pause = ms => new Promise(r => nativeTimeout(r, ms))
      const NativeObserver = MutationObserver
      window.MutationObserver = class extends NativeObserver {
        constructor(cb) { super((mutations, observer) => { const t = performance.now(); cb(mutations, observer); if (stats.measuring) { const ms = performance.now() - t; stats.observerCallbacks++; stats.observerMs += ms; stats.observerMaxMs = Math.max(stats.observerMaxMs, ms) } }) }
      }
      window.requestAnimationFrame = cb => nativeRaf(t => { const s = performance.now(); cb(t); if (stats.measuring) { stats.rafCallbacks++; const ms = performance.now() - s; stats.rafMs += ms; stats.rafMaxMs = Math.max(stats.rafMaxMs, ms) } })
      const nativeFrom = Array.from
      Array.from = function (input, ...rest) {
        if (stats.measuring && typeof input === 'string') { stats.charSplits++; stats.charSplitChars += input.length }
        return nativeFrom.call(this, input, ...rest)
      }
      let nvProto = CharacterData.prototype, nvDesc
      while (nvProto && !(nvDesc = Object.getOwnPropertyDescriptor(nvProto, 'nodeValue'))) nvProto = Object.getPrototypeOf(nvProto)
      Object.defineProperty(CharacterData.prototype, 'nodeValue', {
        configurable: true,
        get() { return nvDesc.get.call(this) },
        set(value) { if (stats.measuring) { stats.nvWrites++; stats.nvChars += value.length } nvDesc.set.call(this, value) }
      })
      localStorage.setItem('dsh-code-pill.settings.v1', JSON.stringify({ version: 1, displaySmooth: enabled }))
      const h = React.createElement
      const port = document.getElementById('port')
      function Assistant(props) {
        const text = props.node.data.blocks[0].text
        // 宿主跟随：每批落位到底部，跟随标记在消息包装层上（引擎根的子孙，走端口探测路径）。
        React.useLayoutEffect(() => { port.scrollTop = port.scrollHeight }, [text])
        return h('div', { 'data-chat-following-tail': '', id: 'follow-root' },
          h('div', { id: 'message', 'data-state': props.node.data.status }, text))
      }
      const entry = { options: { key: 'assistant-step' }, component: Assistant }
      const disposers = []
      const slots = {
        entries(name) { return name === 'conversation.chat.node' ? [entry] : [] },
        inject(name, callback) { return callback() },
        register() { return () => {} },
      }
      window.__ModuleLoader__ = { load(spec) {
        const ctx = {
          slots,
          get(name) { return name === 'slots' ? slots : undefined },
          effect(callback) { const off = callback(); if (typeof off === 'function') disposers.push(off) },
          on() { return () => {} },
        }
        spec.factory(name => {
          if (name === 'react') return React
          if (name === '@deepseek-ai/dsh-client-ui-primitives') return { Button: 'button', Switch: 'button', Input: 'input' }
          throw Error('unexpected require: ' + name)
        }).apply(ctx)
      } }
      const root = ReactDOM.createRoot(document.getElementById('chat'))
      window.currentNode = null
      window.renderNode = (status, text) => {
        window.currentNode = { data: { status, blocks: [{ kind: 'text', text }] } }
        ReactDOM.flushSync(() => root.render(h(entry.component, { node: window.currentNode })))
      }
      window.visibleText = () => document.getElementById('message').textContent
      window.dispose = () => disposers.reverse().forEach(off => off())
    }, enabled)
    await page.addScriptTag({ content: bundle })
    await page.evaluate(() => new Promise(r => nativeRaf(() => nativeRaf(r))))
    const result = await page.evaluate(async ({ chunks }) => {
      window.renderNode('running', '')
      await pause(120)
      stats.measuring = true
      let running = true, last = performance.now(); const intervals = []
      function frame(t) { if (!running) return; intervals.push(t - last); last = t; nativeRaf(frame) } nativeRaf(frame)
      const started = performance.now()
      let full = ''
      for (let i = 0; i < chunks; i++) {
        full += `第${i}段：流式正文持续追加，包含 inline code 与路径 src/live/module${i}.ts，还有 🚀 代理对字符。`
        window.renderNode('running', full)
        await pause(25)
      }
      window.renderNode('completed', full)
      const deadline = performance.now() + 15000
      while (window.visibleText().length < full.length && performance.now() < deadline) await pause(30)
      await pause(250)
      running = false; stats.measuring = false
      intervals.sort((a, b) => a - b)
      return { elapsedMs: performance.now() - started, visibleChars: window.visibleText().length, fullChars: full.length, ...stats, frameCount: intervals.length, p95FrameMs: intervals[Math.floor(intervals.length * .95)] || 0, maxFrameMs: intervals.at(-1) || 0 }
    }, { chunks: CHUNKS })
    if (errors.length) console.error(name, errors)
    results.push({ name, ...result })
    await page.evaluate(() => window.dispose())
    await page.close()
  }
} finally { await browser.close() }

console.log(`scenario: ${CHUNKS} chunks × 25ms running stream + bounded drain; host follows tail (marker inside engine root)`)
for (const r of results) {
  console.log(`${r.name.padEnd(4)} obs=${r.observerMs.toFixed(1)}ms/max${r.observerMaxMs.toFixed(2)} raf=${r.rafMs.toFixed(1)}ms/max${r.rafMaxMs.toFixed(2)} split=${r.charSplits}×/${r.charSplitChars}chars nv=${r.nvWrites}×/${r.nvChars}chars visible=${r.visibleChars}/${r.fullChars} frame p95=${r.p95FrameMs.toFixed(1)} max=${r.maxFrameMs.toFixed(1)}`)
}