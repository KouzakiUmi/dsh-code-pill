/** 真 Chrome + 最终 bundle：显示平滑的分块缓冲、逐帧跟随、开关与生命周期。 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const bundle = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const react = readFileSync(require.resolve('react').replace(/index\.js$/, 'umd/react.development.js'), 'utf8')
const reactDom = readFileSync(require.resolve('react-dom').replace(/index\.js$/, 'umd/react-dom.development.js'), 'utf8')
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true })

async function fixture(enabled, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport: { width: 760, height: 640 }, reducedMotion })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('https://smooth-code-pill.test/**', route => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: `<style>
      body{margin:0;font:16px/24px Arial}#port{height:280px;overflow:auto;border:0}
      #message{white-space:pre-wrap;padding:12px;overflow-wrap:anywhere}
    </style><main id="port" data-conversation-scroll><div id="chat"></div></main>`
  }))
  await page.goto('https://smooth-code-pill.test/')
  await page.addScriptTag({ content: react })
  await page.addScriptTag({ content: reactDom })
  await page.evaluate(enabled => {
    localStorage.setItem('dsh-code-pill.settings.v1', JSON.stringify({ version: 1, displaySmooth: enabled }))
    const h = React.createElement
    const port = document.getElementById('port')
    // 宿主的跟随意图写在会话根上（真实宿主用 data-chat-following-tail），
    // 插件据此判断滚动所有权归谁：宿主在跟随时插件不再写 scrollTop。
    window.hostFollow = true
    window.setHostFollow = value => { window.hostFollow = value }
    // 区分「宿主写滚动」与「插件写滚动」：插件在 rAF 里写，宿主在 useLayoutEffect 里写。
    window.scrollWrites = []
    const scrollTopDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')
    let insideHost = false
    Object.defineProperty(port, 'scrollTop', {
      get() { return scrollTopDesc.get.call(this) },
      set(value) {
        window.scrollWrites.push({ value: Math.round(value), host: insideHost })
        scrollTopDesc.set.call(this, value)
      },
    })
    function Assistant(props) {
      const text = props.node.data.blocks[0].text
      React.useLayoutEffect(() => {
        if (!window.hostFollow || window.hostSkipPlacement) return
        insideHost = true
        try { port.scrollTop = port.scrollHeight } finally { insideHost = false }
      }, [text])
      // 真实宿主把跟随意图写在会话最近的公共根上（ChatView 的 root），
      // 这里是消息的父级外侧：用一个由 React 渲染、包裹消息的容器承载该标记。
      const rich = props.node.data.blocks.some(block => block.kind === 'code' || block.kind === 'think')
      const body = rich
        ? props.node.data.blocks.map((block, index) => block.kind === 'code'
          ? h('pre', { key: index, className: 'probe-code' }, block.text)
          // 思考区用宿主语义属性标记：它由 think-ink 负责刷入，平滑不得截断同一节点。
          : block.kind === 'think'
            ? h('div', { key: index, className: 'probe-think', 'data-variant': 'think', 'data-state': props.node.data.status },
              h('div', { 'data-markdown-variant': 'compact', 'data-streaming': '' }, block.text))
            : h('div', { key: index }, block.text))
        : text
      return h('div',
        { 'data-chat-following-tail': window.hostFollow ? '' : undefined, id: 'follow-root' },
        h('div', { id: 'message', 'data-state': props.node.data.status }, body))
    }
    const entry = { options: { key: 'assistant-step' }, component: Assistant }
    const disposers = []
    const listeners = new Map()
    const slots = {
      entries(name) { return name === 'conversation.chat.node' ? [entry] : [] },
      inject(name, callback) { return callback() },
      register() { return () => {} },
    }
    window.entry = entry
    window.hostAssistant = Assistant
    window.__ModuleLoader__ = { load(spec) {
      const ctx = {
        slots,
        get(name) { return name === 'slots' ? slots : undefined },
        effect(callback) { const off = callback(); if (typeof off === 'function') disposers.push(off) },
        on(name, callback) {
          const set = listeners.get(name) || new Set()
          set.add(callback); listeners.set(name, set)
          return () => set.delete(callback)
        },
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
    // 多块渲染：思考区、代码块与正文共存时按 blocks 直接提交。
    window.renderBlocks = (status, blocks) => {
      window.currentNode = { data: { status, blocks } }
      ReactDOM.flushSync(() => root.render(h(entry.component, { node: window.currentNode })))
    }
    window.appendText = text => {
      const current = window.currentNode.data.blocks[0].text
      window.renderNode(window.currentNode.data.status, current + text)
    }
    window.visibleText = () => document.getElementById('message').textContent
    // 隔离容器不在滚动端口内：只验证文字揭示，不受底部跟随影响。
    // 记录的是宿主回复节点本身，不是 React 容器，重建结构时不会把包装层一起删掉。
    window.isolatedRoots = []
    window.renderIsolated = (status, text) => {
      const container = document.createElement('div')
      document.body.appendChild(container)
      const node = { data: { status, blocks: [{ kind: 'text', text }] } }
      window.isolatedNode = node
      const root = ReactDOM.createRoot(container)
      ReactDOM.flushSync(() => root.render(h(entry.component, { node })))
      window.isolatedRoots.push({ root, container })
      window.isolatedRoot = root
      // 真正的文本宿主是 #message；外层还包了承载跟随标记的容器。
      window.isolatedHost = container.querySelector('#message')
    }
    // 先挂载空回复再追加正文：模拟真实流式，而不是「进入会话时已有整段内容」。
    window.renderIsolatedStream = (status, text) => {
      window.renderIsolated(status, '')
      window.appendIsolated(status, text)
    }
    window.appendIsolated = (status, text) => {
      window.isolatedNode.data.blocks[0].text = text
      ReactDOM.flushSync(() => window.isolatedRoot.render(h(entry.component, { node: window.isolatedNode })))
    }
    window.clearIsolated = () => {
      for (const item of window.isolatedRoots) { item.root.unmount(); item.container.remove() }
      window.isolatedRoots = []
    }
    window.setConfig = config => {
      const key = 'dsh-code-pill.settings.v1'
      const oldValue = localStorage.getItem(key)
      const newValue = JSON.stringify({ version: 1, ...config })
      localStorage.setItem(key, newValue)
      window.dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue, storageArea: localStorage }))
    }
    window.cleanup = () => disposers.reverse().forEach(off => off())
    window.unmount = () => root.unmount()
    window.settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  }, enabled)
  await page.addScriptTag({ content: bundle })
  return { context, page, errors }
}

const HISTORY = Array.from({ length: 18 }, (_, i) => `历史第 ${i + 1} 行，已有内容保持原样，不进入新的显示队列。`).join('\n')

try {
  // 默认关闭：不包装宿主组件，网络分块仍按原路径立即呈现。
  const off = await fixture(false)
  await off.page.evaluate(history => window.renderNode('running', history), HISTORY)
  const offChunk = '\n默认路径的完整分块。'
  await off.page.evaluate(chunk => window.appendText(chunk), offChunk)
  await off.page.evaluate(() => window.settle())
  assert.equal(await off.page.locator('[data-dshcp-smooth-root]').count(), 0)
  assert.equal(await off.page.evaluate(() => window.visibleText()), HISTORY + offChunk)
  await off.page.evaluate(() => { window.cleanup(); window.unmount() })
  assert.deepEqual(off.errors, [])
  await off.context.close()

  const { context, page, errors } = await fixture(true)
  try {
    await page.evaluate(history => window.renderNode('running', history), HISTORY)
    await page.evaluate(() => window.settle())
    assert.equal(await page.locator('[data-dshcp-smooth-root]').count(), 1)
    assert.equal(await page.evaluate(() => window.visibleText()), HISTORY, '长历史正文不重新播放')
    const stableWrapper = await page.evaluate(() => {
      const before = window.entry.component
      window.setConfig({ displaySmooth: true })
      return window.entry.component === before
    })
    assert.equal(stableWrapper, true, '重复配置通知不叠加包装层')

    // 同一批内宿主连续提交：中间值不能覆盖缓冲，尾文必须保留。
    const base = 'A'.repeat(121)
    await page.evaluate(text => window.renderNode('running', text), base)
    await page.waitForTimeout(200)
    await page.evaluate(text => {
      const node = document.getElementById('message').firstChild
      node.nodeValue = text + '第一次提交'
      node.nodeValue = text + '第一次提交第二次提交'
    }, base)
    await page.waitForFunction(expected => window.visibleText() === expected, base + '第一次提交第二次提交', { timeout: 5000 })
    // 同一节点同值连续写两次也不能丢尾文。
    await page.evaluate(text => {
      const node = document.getElementById('message').firstChild
      node.nodeValue = text + '尾文'
      node.nodeValue = text + '尾文'
    }, base)
    await page.waitForFunction(expected => window.visibleText() === expected, base + '尾文', { timeout: 5000 })

    // 宿主把受控文字清空或改成空白：不得把旧文字写回来。
    await page.evaluate(text => window.renderNode('running', text), base + '尾文')
    await page.evaluate(() => { document.getElementById('message').firstChild.nodeValue = '' })
    await page.waitForTimeout(250)
    assert.equal(await page.evaluate(() => window.visibleText()), '', '宿主清空后不回写旧文字')
    await page.evaluate(() => { document.getElementById('message').firstChild.nodeValue = '   ' })
    await page.waitForTimeout(250)
    assert.equal(await page.evaluate(() => window.visibleText()), '   ', '宿主改空白后不回写旧文字')

    // 反复开关：每次关闭都要把宿主条目还原为原组件。
    const toggles = []
    for (const enabled of [false, true, false]) {
      toggles.push(await page.evaluate(value => {
        window.setConfig({ displaySmooth: value })
        return window.entry.component === window.hostAssistant
      }, enabled))
    }
    assert.deepEqual(toggles, [true, false, true], '重复开关每次都还原宿主组件')
    await page.evaluate(() => window.setConfig({ displaySmooth: true }))
    // 回到长历史基准，后面的渐进揭示用例以 HISTORY 为起点。
    await page.evaluate(history => {
      window.hostFollow = true
      window.renderNode('running', history)
    }, HISTORY)
    await page.waitForTimeout(250)
    assert.equal(await page.evaluate(() => window.visibleText()), HISTORY)

    // 反复开关后平滑必须仍然生效：不能复用已销毁引擎的旧包装实例。
    await page.evaluate(chunk => window.appendText(chunk), '\n反复开关之后新到达的分块仍应逐帧揭示。')
    const afterToggleFrames = await page.evaluate(() => new Promise(resolve => {
      const seen = []
      let count = 0
      const step = () => {
        seen.push(window.visibleText().length)
        if (++count < 8) requestAnimationFrame(step)
        else resolve(seen)
      }
      requestAnimationFrame(step)
    }))
    assert.ok(afterToggleFrames[0] < await page.evaluate(() => window.currentNode.data.blocks[0].text.length), '开关后仍有未揭示的缓冲')
    assert.ok(new Set(afterToggleFrames).size > 1, `开关后应继续逐帧揭示，实际 ${JSON.stringify(afterToggleFrames)}`)
    await page.waitForFunction(expected => window.visibleText().length === expected, await page.evaluate(() => window.currentNode.data.blocks[0].text.length), { timeout: 5000 })
    await page.evaluate(history => window.renderNode('running', history), HISTORY)
    await page.waitForTimeout(200)

    const chunk = '\n这是后来到达的一段文字，用来验证它不会整块突然冒出来，而会按帧逐步显示。\n第二行也随之连续向下展开。'
    const full = HISTORY + chunk
    await page.evaluate(chunk => {
      window.samples = []
      window.recording = true
      const sample = () => {
        if (!window.recording) return
        const port = document.getElementById('port')
        window.samples.push({ length: window.visibleText().length, scroll: port.scrollTop, target: port.scrollHeight - port.clientHeight })
        requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
      window.appendText(chunk)
    }, chunk)
    // appendText 在 evaluate 中同步提交；采样首帧必须仍是未完全揭示状态。
    await page.waitForFunction(expected => window.visibleText().length > 0 && window.visibleText().length < expected, full.length)
    await page.waitForFunction(expected => window.visibleText().length === expected, full.length, { timeout: 5000 })
    await page.evaluate(() => { window.recording = false })
    await page.waitForFunction(() => {
      const port = document.getElementById('port')
      return port.scrollHeight - port.clientHeight - port.scrollTop <= 1
    })
    const samples = await page.evaluate(() => window.samples)
    const lengths = samples.map(sample => sample.length)
    assert.ok(samples.length >= 8, `应存在逐帧过程，实际 ${samples.length} 帧`)
    assert.ok(lengths[0] < full.length, '首帧不整段跳出')
    for (let i = 1; i < lengths.length; i++) {
      const growth = lengths[i] - lengths[i - 1]
      assert.ok(growth >= 0, '文字只向前揭示')
      assert.ok(growth <= 24, `单帧字符增长有界，实际 ${growth}`)
      // 宿主跟随时由宿主落位（它可能一次补齐多行），插件此时不得再写 scrollTop；
      // 因此这里只要求不向上回弹，单帧上限只在插件负责补位时成立。
      const scrollGrowth = samples[i].scroll - samples[i - 1].scroll
      assert.ok(scrollGrowth >= -0.01, '跟随过程不向上回弹')
    }
    const floor = await page.evaluate(() => {
      const port = document.getElementById('port')
      return port.scrollHeight - port.clientHeight - port.scrollTop
    })
    assert.ok(floor <= 1, '揭示结束后落在真实底部')
    // 宿主在跟随时拥有滚动所有权：插件一次都不该写 scrollTop，否则两套跟随会互相打断。
    const hostWrites = await page.evaluate(() => window.scrollWrites)
    assert.ok(hostWrites.length > 0, '宿主自身应写过滚动位置')
    assert.deepEqual(hostWrites.filter(w => !w.host), [],
      `宿主跟随时插件不得写 scrollTop，实际 ${JSON.stringify(hostWrites.filter(w => !w.host).slice(0, 4))}`)

    // 宿主声明跟随、但这一批没有落位时，插件也不能替它把视口拉走：
    // 只要标记还在，滚动所有权就归宿主，插件不该补位。
    await page.evaluate(() => {
      window.hostSkipPlacement = true
      window.scrollWrites.length = 0
    })
    await page.evaluate(() => {
      window.appendText('\n宿主声明跟随但这一批没有落位时，插件也不得替它滚动。'.repeat(2))
    })
    await page.waitForFunction(expected => window.visibleText().length === expected,
      await page.evaluate(() => window.currentNode.data.blocks[0].text.length), { timeout: 5000 })
    const idleWrites = await page.evaluate(() => window.scrollWrites.filter(w => !w.host))
    assert.deepEqual(idleWrites, [],
      `宿主声明跟随时插件不得补位，实际 ${JSON.stringify(idleWrites.slice(0, 4))}`)
    await page.evaluate(() => { window.hostSkipPlacement = false })

    // 宿主不负责跟随时（没有 data-chat-following-tail），插件自己补位：
    // 单帧位移必须受 8px 约束，不能整块跳。
    await page.evaluate(() => {
      window.setHostFollow(false)
      window.scrollWrites.length = 0
      // 先留出一小段可追赶距离，否则视口已贴底，没有可补位的差值。
      const port = document.getElementById('port')
      port.scrollTop = Math.max(0, port.scrollHeight - port.clientHeight - 12)
    })
    await page.evaluate(() => {
      window.samples = []
      window.recording = true
      const sample = () => {
        if (!window.recording) return
        const port = document.getElementById('port')
        window.samples.push({ length: window.visibleText().length, scroll: port.scrollTop })
        requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    const pluginChunk = '\n' + '插件自己补位时，逐帧位移也必须受单帧预算约束。'.repeat(3)
    await page.evaluate(chunk => window.appendText(chunk), pluginChunk)
    await page.waitForFunction(expected => window.visibleText().length === expected,
      await page.evaluate(() => window.currentNode.data.blocks[0].text.length), { timeout: 5000 })
    await page.evaluate(() => { window.recording = false })
    // 宿主让出滚动后，补位必须由插件完成——否则视口会停在原地不动。
    assert.ok(await page.evaluate(() => window.scrollWrites.some(w => !w.host)), '宿主不跟随时应由插件补位')
    const pluginSamples = await page.evaluate(() => window.samples)
    assert.ok(pluginSamples.length >= 4, `补位过程应有帧样本，实际 ${pluginSamples.length}`)
    for (let i = 1; i < pluginSamples.length; i++) {
      const scrollGrowth = pluginSamples[i].scroll - pluginSamples[i - 1].scroll
      assert.ok(scrollGrowth >= -0.01, '插件补位时也不向上回弹')
      assert.ok(scrollGrowth <= 8.01, `插件补位单帧不超过 8px，实际 ${scrollGrowth}`)
    }
    await page.evaluate(() => window.setHostFollow(true))
    // 回到本段共用的基线正文：后面的用例仍以 full 为起点继续追加。
    await page.evaluate(text => window.renderNode('running', text), full)
    await page.waitForFunction(expected => window.visibleText().length === expected, full.length, { timeout: 5000 })
    await page.evaluate(() => {
      const port = document.getElementById('port')
      port.scrollTop = port.scrollHeight
    })

    // 回合结束只改变状态：剩余队列快速排空，不突然发布整段尾巴。
    const tail = '\n结束前仍在缓冲区里的最后一小段文字，应该连续收尾。'.repeat(2)
    const completed = full + tail
    await page.evaluate(tail => {
      window.appendText(tail)
      window.renderNode('ok', window.currentNode.data.blocks[0].text)
    }, tail)
    await page.waitForFunction(expected => window.visibleText().length === expected, completed.length, { timeout: 5000 })
    assert.equal(await page.evaluate(() => window.visibleText()), completed)

    // 用户向上阅读时不夺回滚动位置。
    await page.evaluate(() => {
      window.renderNode('running', window.currentNode.data.blocks[0].text)
      const port = document.getElementById('port')
      port.scrollTop = port.scrollHeight
      window.hostFollow = false
      port.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true }))
      port.scrollTop -= 60
      window.beforeManualAppend = port.scrollTop
      window.appendText('\n用户向上阅读时，新增文字仍然揭示，但不强制拉回底部。')
    })
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 250)))
    assert.ok(await page.evaluate(() => document.getElementById('port').scrollTop <= window.beforeManualAppend + 1), '手动向上后不平滑抢滚')

    // 底部 32px 内的小幅上滚也算用户意图，不能被近距离回弹的 scroll 夺回。
    await page.evaluate(() => {
      const port = document.getElementById('port')
      port.scrollTop = port.scrollHeight
      window.hostFollow = false
      port.dispatchEvent(new WheelEvent('wheel', { deltaY: -10, bubbles: true }))
      port.scrollTop -= 10
      window.beforeSmallScroll = port.scrollTop
      window.appendText('\n小幅上滚后追加的文字不应夺回视口。')
    })
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 250)))
    assert.ok(await page.evaluate(() => document.getElementById('port').scrollTop <= window.beforeSmallScroll + 1), '底部附近小幅上滚后不夺回滚动')

    // 进入会话时才挂载的运行中回复，整段已经写好：不得从 0 重新播放，也不得把视口拉走。
    await page.evaluate(() => window.clearIsolated())
    const entering = '进入会话时这条回复已经写好了，不该被当成新分块从头再打一遍。'.repeat(2)
    const enteringFrames = await page.evaluate(text => new Promise(resolve => {
      const container = document.createElement('div')
      document.body.appendChild(container)
      const node = { data: { status: 'running', blocks: [{ kind: 'text', text }] } }
      const root = ReactDOM.createRoot(container)
      const seen = []
      let frames = 0
      ReactDOM.flushSync(() => root.render(React.createElement(window.entry.component, { node })))
      const host = container.querySelector('[data-dshcp-smooth-root]').firstElementChild
      const sample = () => {
        seen.push(host.textContent.length)
        if (++frames < 8) requestAnimationFrame(sample)
        else { root.unmount(); container.remove(); resolve(seen) }
      }
      requestAnimationFrame(sample)
    }), entering)
    assert.ok(enteringFrames.every(length => length === entering.length),
      `进入会话时不重播既有正文，实际 ${JSON.stringify(enteringFrames)}`)

    // 思考区与代码块并存：思考区由 think-ink 刷入，平滑不得截断它，
    // 否则 StaticRange 偏移量越界，文字成片消失只剩标点。
    const thinkFull = '检查压缩路径的竞态条件，确认句柄获取后路径是否仍然有效，并核对重命名分支与打开时序。'
    const thinkTrace = await page.evaluate(async text => {
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
      const seen = []
      for (let i = 0; i <= text.length; i += 6) {
        window.renderBlocks('running', [
          { kind: 'think', text: text.slice(0, i) },
          { kind: 'code', text: i >= 24 ? 'DATA_EXTEND and FILE_CREATE and NAMED_DATA_EXTEND' : '' },
        ])
        await sleep(30)
        const think = document.querySelector('.probe-think [data-streaming]')
        seen.push({ fed: i, shown: think === null ? -1 : think.textContent.length })
      }
      return seen
    }, thinkFull)
    assert.ok(thinkTrace.every(step => step.shown === step.fed),
      `思考区不得被平滑截断，实际 ${JSON.stringify(thinkTrace.filter(step => step.shown !== step.fed).slice(0, 3))}`)
    // 回到单块基线：后续用例按 blocks[0].text 取正文。
    await page.evaluate(history => window.renderNode('running', history), HISTORY)
    await page.waitForTimeout(200)
    await page.evaluate(() => {
      const port = document.getElementById('port')
      port.scrollTop = port.scrollHeight
    })

    // 块级结构（代码块、引用等）不得先于其中的文字出现。
    // 夹具宿主只渲染一段文本，这里换成能同时渲染代码块外观的包装组件。
    const blockFrames = await page.evaluate(nl => new Promise(resolve => {
      const h = React.createElement
      const Wrapped = window.entry.component
      const container = document.createElement('div')
      document.body.appendChild(container)
      const node = { data: { status: 'running', blocks: [{ kind: 'text', text: '先说明思路。' + nl }] } }
      const root = ReactDOM.createRoot(container)
      ReactDOM.flushSync(() => root.render(h(Wrapped, { node })))
      node.data.blocks.push({ kind: 'code', text: 'const alpha = 1' + nl + 'const beta = 2' + nl })
      // 宿主在同一批里把代码块结构交给 React：此时正文还没揭示。
      ReactDOM.flushSync(() => root.render(h(Wrapped, { node })))
      const pre = () => container.querySelector('pre')
      const seen = []
      let frames = 0
      const sample = () => {
        const el = pre()
        seen.push(el === null ? null : { hidden: el.hasAttribute('data-dshcp-smooth-hold'), text: el.textContent })
        if (++frames < 12) requestAnimationFrame(sample)
        else { root.unmount(); container.remove(); resolve(seen) }
      }
      requestAnimationFrame(sample)
    }), '\n')
    // 代码块一旦出现，要么还没有任何文字（此时由保持标记隐藏），要么已经带上文字。
    assert.ok(blockFrames.some(frame => frame !== null), '代码块应被渲染')
    assert.ok(blockFrames.every(frame => frame === null || frame.text.length > 0 || frame.hidden),
      `代码块不得在还没有文字时可见，实际 ${JSON.stringify(blockFrames)}`)

    // 宿主在流式中重建段落结构（同一段文字被拆成多个节点）时，已显示部分不得重播。
    const structured = '宿主把同一段正文拆成多个文本节点时，已经显示的文字不应该被重新播放一遍。'.repeat(2)
    await page.evaluate(text => window.renderIsolatedStream('running', text), structured)
    await page.waitForFunction(text => window.isolatedHost.textContent === text, structured, { timeout: 5000 })
    const replay = await page.evaluate(text => new Promise(resolve => {
      const host = window.isolatedHost
      const middle = Math.floor(text.length / 2)
      const strong = document.createElement('strong')
      strong.textContent = text.slice(middle, middle + 4)
      host.textContent = ''
      host.append(text.slice(0, middle), strong, text.slice(middle + 4))
      const seen = []
      let frames = 0
      const sample = () => {
        seen.push(host.textContent.length)
        if (++frames < 6) requestAnimationFrame(sample)
        else resolve(seen)
      }
      requestAnimationFrame(sample)
    }), structured)
    assert.ok(replay.every(length => length === structured.length), `重建节点后不重播已显示文字，实际 ${JSON.stringify(replay)}`)

    // React 成形内联元素时常见：复用第一个文本节点并改短，后半段搬进新节点。
    const reused = '宿主复用第一个文本节点承载前半段、再把后半段搬进新节点时，后半段也不应重播。'.repeat(2)
    await page.evaluate(text => window.renderIsolatedStream('running', text), reused)
    await page.waitForFunction(text => window.isolatedHost.textContent === text, reused, { timeout: 5000 })
    const split = await page.evaluate(text => new Promise(resolve => {
      const host = window.isolatedHost
      const middle = Math.floor(text.length / 2)
      const strong = document.createElement('strong')
      strong.textContent = text.slice(middle, middle + 4)
      host.firstChild.nodeValue = text.slice(0, middle)
      host.append(strong, text.slice(middle + 4))
      const seen = []
      let frames = 0
      const sample = () => {
        seen.push(host.textContent.length)
        if (++frames < 6) requestAnimationFrame(sample)
        else resolve(seen)
      }
      requestAnimationFrame(sample)
    }), reused)
    assert.ok(split.every(length => length === reused.length), `复用节点被改短后不重播后半段，实际 ${JSON.stringify(split)}`)

    // 结构变化与新增内容同批到达：已显示正文保持，只有新文字逐帧揭示。
    const grown = '结构变化前已经完整显示的正文，用来确认重建时只继续揭示新增的部分。'.repeat(2)
    const extra = '，以及结构变化后同一批到达的尾部文字。'
    await page.evaluate(text => window.renderIsolatedStream('running', text), grown)
    await page.waitForFunction(text => window.isolatedHost.textContent === text, grown, { timeout: 5000 })
    const growth = await page.evaluate(({ grown, extra }) => new Promise(resolve => {
      const host = window.isolatedHost
      const strong = document.createElement('strong')
      strong.textContent = '标记'
      host.textContent = ''
      host.append(grown + extra, strong)
      const seen = []
      let frames = 0
      const sample = () => {
        seen.push(host.textContent.length)
        if (++frames < 12) requestAnimationFrame(sample)
        else resolve(seen)
      }
      requestAnimationFrame(sample)
    }), { grown, extra })
    const grownComplete = grown.length + extra.length + 2
    assert.ok(growth.every(length => length >= grown.length), `重建时已显示正文不倒退，实际 ${JSON.stringify(growth)}`)
    assert.ok(growth[0] < grownComplete, '新增文字仍然逐帧揭示')
    await page.waitForFunction(expected => window.isolatedHost.textContent.length === expected, grownComplete, { timeout: 5000 })

    // 尚未揭示完时结构变化：保持当前进度继续揭示，不回到开头。
    const partialText = '这一段文字在揭示到一半时被宿主重建结构，剩余部分应继续展开而不是重播。'.repeat(3)
    await page.evaluate(text => window.renderIsolatedStream('running', text), partialText)
    await page.waitForFunction(() => {
      const host = window.isolatedHost
      return host.textContent.length > 24 && host.textContent.length < window.isolatedNode.data.blocks[0].text.length - 24
    }, undefined, { timeout: 5000 })
    const continued = await page.evaluate(text => new Promise(resolve => {
      const host = window.isolatedHost
      const before = host.textContent.length
      const middle = Math.floor(text.length / 2)
      const strong = document.createElement('strong')
      strong.textContent = text.slice(middle, middle + 4)
      host.textContent = ''
      host.append(text.slice(0, middle), strong, text.slice(middle + 4))
      const seen = [before]
      let frames = 0
      const sample = () => {
        seen.push(host.textContent.length)
        if (++frames < 4) requestAnimationFrame(sample)
        else resolve(seen)
      }
      requestAnimationFrame(sample)
    }), partialText)
    const resumed = continued.slice(1)
    assert.ok(resumed.every(length => length >= continued[0]), `未揭示完时重建不倒退，实际 ${JSON.stringify(continued)}`)
    await page.evaluate(() => window.clearIsolated())

    // 设置关闭：即使宿主尚未重渲染，已挂载引擎也立即恢复完整文本。
    await page.evaluate(() => {
      window.hostFollow = true
      const port = document.getElementById('port')
      port.scrollTop = port.scrollHeight
      port.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true }))
      window.appendText('\n关闭开关前正在等待揭示的一段内容。'.repeat(3))
    })
    await page.waitForFunction(() => window.visibleText().length < window.currentNode.data.blocks[0].text.length)
    // 关闭时块级保持标记必须一并撤下，不能留下被隐藏的格式。
    await page.evaluate(() => window.setConfig({ displaySmooth: false }))
    assert.equal(await page.evaluate(() => window.visibleText()), await page.evaluate(() => window.currentNode.data.blocks[0].text), '关闭立即恢复完整文字')
    assert.equal(await page.evaluate(() => document.querySelectorAll('[data-dshcp-smooth-hold]').length), 0, '关闭后不残留块级保持标记')
    await page.evaluate(() => window.renderNode(window.currentNode.data.status, window.currentNode.data.blocks[0].text))
    assert.equal(await page.locator('[data-dshcp-smooth-root]').count(), 0)

    // 再次开启后卸载：观察器、RAF 与滚动监听全部停止，文字不丢。
    await page.evaluate(() => {
      window.setConfig({ displaySmooth: true })
      window.renderNode('running', window.currentNode.data.blocks[0].text)
      window.appendText('\n卸载前仍在缓冲区中的文字。'.repeat(3))
    })
    await page.waitForFunction(() => window.visibleText().length < window.currentNode.data.blocks[0].text.length)
    await page.evaluate(() => window.cleanup())
    assert.equal(await page.evaluate(() => window.visibleText()), await page.evaluate(() => window.currentNode.data.blocks[0].text), '卸载立即恢复完整文字')
    const beforeDispose = await page.evaluate(() => window.visibleText())
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 350)))
    assert.equal(await page.evaluate(() => window.visibleText()), beforeDispose, '卸载后没有迟到帧')
    await page.evaluate(() => window.unmount())
    assert.deepEqual(errors, [])
  } finally { await context.close() }

  // 系统减少动态效果：配置即使开启也保持宿主即时渲染。
  const reduced = await fixture(true, 'reduce')
  await reduced.page.evaluate(history => window.renderNode('running', history), HISTORY)
  await reduced.page.evaluate(() => window.appendText('\n减少动态效果时直接显示。'))
  await reduced.page.evaluate(() => window.settle())
  assert.equal(await reduced.page.locator('[data-dshcp-smooth-root]').count(), 0)
  assert.equal(await reduced.page.evaluate(() => window.visibleText()), await reduced.page.evaluate(() => window.currentNode.data.blocks[0].text))
  await reduced.page.evaluate(() => { window.cleanup(); window.unmount() })
  assert.deepEqual(reduced.errors, [])
  await reduced.context.close()

  console.log('display smooth: default off, progressive reveal, bounded follow, completion drain, manual scroll, toggle/dispose/reduced motion OK')
} finally { await browser.close() }
