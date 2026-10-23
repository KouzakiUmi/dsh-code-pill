// Attribution benchmark: which feature pipeline costs what inside the MutationObserver
// under a realistic long-session chat (tool rows + messages + inline codes + streaming
// think block + sidebar churn). Run: node scripts/benchmark-observer.mjs
// Scale the chat with TOOL_GROUPS (default 20) and pick configs with CONFIGS=none,alloff,path,pill,ink,tint,all.
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const bundle = readFileSync(new URL('./lib/client.js', import.meta.url), 'utf8')

const ROW = (variant, tool, summary) => `
<div class="row" data-variant="${variant}" data-tool="${tool}" data-state="ok">
  <div data-disclosure-header>
    <div data-disclosure-row>
      <span class="leading"></span>
      <span class="shimmer"><span class="content">
        <span class="shimmer"><span class="content"><span class="text">${variant === 'read' ? '读取' : '编辑'}</span></span></span>
        <button type="button" class="fileLink"><span class="shimmer"><span class="content"><span class="text">${summary}</span></span></span></button>
        <span class="summarySuffix">1KB</span>
      </span></span>
    </div>
  </div>
</div>`

const OTHERS_ROW = (i, state, word) => `
<div class="row" data-variant="others" data-tool="task${i}" data-state="${state}">
  <div data-disclosure-header>
    <div data-disclosure-row>
      <span class="leading"></span>
      <span class="shimmer"><span class="content"><span class="shimmer"><span class="content"><span class="text">后台任务 #${i}</span></span></span>
      <span class="summary"><span class="shimmer"><span class="content"><span class="text">步骤 ${i}/8 ${word}</span></span></span></span></span></span>
    </div>
  </div>
</div>`

const MSG = (i) => `<p id="msg-${i}">第 ${i} 段消息：先跑 <code>npm run build</code>，再看 <code>src/core/engine.ts</code> 的输出，路径 <code>docs/guide.md</code> 有说明。</p>`

const html = `<!doctype html><meta charset="utf-8"><style>
body{background:#17181c;color:#adb2b8;font:16px Arial;display:flex;gap:20px;margin:0}
aside{width:210px;height:650px;overflow:auto}
main{width:700px;height:650px;overflow:auto}
p{margin:8px 0;line-height:1.6} code{font-family:monospace}
.fileLink{background:0;border:none;color:inherit;font:inherit;padding:0}
</style><body>
<aside id="sidebar">${Array.from({ length: 30 }, (_, i) => `<div class="workspace">Workspace ${i}</div>`).join('')}</aside>
<main data-chat-flow id="chat">
  ${Array.from({ length: +(process.env.TOOL_GROUPS || 20) }, (_, i) => ROW('edit', 'edit', `src/mod/module${i}.ts`) + MSG(i) + ROW('read', 'read', `docs/note${i}.md`) + OTHERS_ROW(i, i % 3 ? 'ok' : 'running', i % 3 ? '已完成' : '运行中')).join('')}
  <div data-chat-flow-kind="think"><div data-variant="think" data-state="running">
    <div data-markdown-variant="compact">${Array.from({ length: 40 }, () => '<p>Existing reasoning content stays unchanged while new words stream into the final paragraph.</p>').join('')}<p id="tail">Existing tail.</p></div>
  </div></div>
  <p id="live">Streaming answer with <code>git status</code> inline.</p>
</main></body>`

const CONFIGS = (process.env.CONFIGS || 'none,alloff,path,pill,ink,tint,all').split(',').map(name => ({
  none: ['none', null],
  alloff: ['alloff', { syntax: false, marker: 'off', toolPath: false, thinkRainbow: false, rowTint: false }],
  path: ['path', { syntax: false, marker: 'off', toolPath: true, thinkRainbow: false, rowTint: false }],
  pill: ['pill', { syntax: true, marker: 'label', toolPath: false, thinkRainbow: false, rowTint: false }],
  ink: ['ink', { syntax: false, marker: 'off', toolPath: false, thinkRainbow: true, rowTint: false }],
  tint: ['tint', { syntax: false, marker: 'off', toolPath: false, thinkRainbow: false, rowTint: true }],
  all: ['all', { syntax: true, marker: 'label', toolPath: true, thinkRainbow: true, rowTint: true }],
}[name]))

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true })
const results = []
try {
  for (const [name, settings] of CONFIGS) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route('https://obs-perf.test/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }))
    await page.goto('https://obs-perf.test/')
    await page.evaluate(settings => {
      const nativeRaf = requestAnimationFrame.bind(window), nativeTimeout = setTimeout.bind(window)
      const stats = { observerCallbacks: 0, observerMs: 0, observerMaxMs: 0, observerRecords: 0, qsa: 0, closest: 0, matches: 0, hlAdds: 0, hlDels: 0, rafCallbacks: 0, rafMs: 0, rafMaxMs: 0, measuring: false }
      window.stats = stats; window.nativeRaf = nativeRaf; window.pause = ms => new Promise(r => nativeTimeout(r, ms))
      const NativeObserver = MutationObserver
      window.MutationObserver = class extends NativeObserver {
        constructor(cb) { super((mutations, observer) => { const t = performance.now(); cb(mutations, observer); if (stats.measuring) { const ms = performance.now() - t; stats.observerCallbacks++; stats.observerMs += ms; stats.observerMaxMs = Math.max(stats.observerMaxMs, ms); stats.observerRecords += mutations.length; } }) }
      }
      const add = Highlight.prototype.add, del = Highlight.prototype.delete
      Highlight.prototype.add = function (r) { if (stats.measuring && !this.has(r)) stats.hlAdds++; return add.call(this, r) }
      Highlight.prototype.delete = function (r) { if (stats.measuring && this.has(r)) stats.hlDels++; return del.call(this, r) }
      const wrap = (proto, key, counter) => {
        const native = proto[key]
        proto[key] = function (...args) { if (stats.measuring) stats[counter]++; return native.apply(this, args) }
      }
      wrap(Element.prototype, 'querySelectorAll', 'qsa')
      wrap(Element.prototype, 'closest', 'closest')
      wrap(Element.prototype, 'matches', 'matches')
      window.requestAnimationFrame = cb => nativeRaf(t => { const s = performance.now(); cb(t); if (stats.measuring) { stats.rafCallbacks++; const ms = performance.now() - s; stats.rafMs += ms; stats.rafMaxMs = Math.max(stats.rafMaxMs, ms) } })
      localStorage.setItem('dsh-code-pill.settings.v1', JSON.stringify({ version: 1, ...settings }))
      const disposers = []
      window.__ModuleLoader__ = { load(spec) { spec.factory(() => { throw Error('unexpected require') }).apply({ effect(cb) { disposers.push(cb()) } }) } }
      window.dispose = () => disposers.reverse().forEach(off => off())
    }, settings)
    if (settings !== null) await page.addScriptTag({ content: bundle })
    await page.evaluate(() => new Promise(r => nativeRaf(() => nativeRaf(r))))
    const result = await page.evaluate(async () => {
      const chat = document.getElementById('chat'), tail = document.getElementById('tail').firstChild
      const live = document.getElementById('live'), rows = [...document.querySelectorAll('.workspace')]
      const others = [...chat.querySelectorAll('[data-variant="others"]')]
      chat.scrollTop = chat.scrollHeight; await pause(120)
      stats.measuring = true; let running = true, last = performance.now(); const intervals = []
      function frame(t) { if (!running) return; intervals.push(t - last); last = t; nativeRaf(frame) } nativeRaf(frame)
      const started = performance.now()
      for (let i = 0; i < 60; i++) {
        tail.nodeValue += ' alpha beta gamma delta epsilon zeta theta lambda'
        live.childNodes[0].nodeValue = `Streaming answer ${i} with more context words flowing in. `
        live.querySelector('code').textContent = `git commit -m "fix ${i}"`
        if (i % 10 === 9) { const el = others[(i / 10 | 0) % others.length]; el.dataset.state = el.dataset.state === 'ok' ? 'running' : 'ok' }
        for (let j = 0; j < rows.length; j++) { rows[j].className = 'workspace ' + ((i + j) % 2 ? 'odd' : 'even'); rows[j].firstChild.nodeValue = 'Workspace ' + (i + j) }
        chat.scrollTop = chat.scrollHeight
        await pause(25)
      }
      await pause(450); running = false; stats.measuring = false
      intervals.sort((a, b) => a - b)
      return { elapsedMs: performance.now() - started, ...stats, frameCount: intervals.length, p95FrameMs: intervals[Math.floor(intervals.length * .95)] || 0, maxFrameMs: intervals.at(-1) || 0 }
    })
    if (errors.length) console.error(name, errors)
    results.push({ name, ...result })
    await page.close()
  }
} finally { await browser.close() }

const base = results.find(r => r.name === 'none') || { observerMs: 0, rafMs: 0 }
console.log(`scenario: 60 batches × 25ms; TOOL_GROUPS=${process.env.TOOL_GROUPS || 20} → tool rows=${(process.env.TOOL_GROUPS || 20) * 2}; 30 sidebar rows mutate per batch`)
for (const r of results) {
  const d = r.name === 'none' ? 0 : r.observerMs + r.rafMs - base.observerMs - base.rafMs
  console.log(`${r.name.padEnd(7)} obs=${r.observerMs.toFixed(1)}ms/max${r.observerMaxMs.toFixed(2)} raf=${r.rafMs.toFixed(1)}ms/max${r.rafMaxMs.toFixed(2)} (+${d.toFixed(1)} vs none) rec=${r.observerRecords} qsa=${r.qsa} closest=${r.closest} matches=${r.matches} hl+${r.hlAdds}/-${r.hlDels} frame p95=${r.p95FrameMs.toFixed(1)} max=${r.maxFrameMs.toFixed(1)}`)
}
