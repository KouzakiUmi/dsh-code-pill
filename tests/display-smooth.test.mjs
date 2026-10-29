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
    window.hostFollow = true
    function Assistant(props) {
      const text = props.node.data.blocks[0].text
      React.useLayoutEffect(() => {
        if (window.hostFollow) port.scrollTop = port.scrollHeight
      }, [text])
      return h('div', { id: 'message', 'data-state': props.node.data.status }, text)
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
    window.appendText = text => {
      const current = window.currentNode.data.blocks[0].text
      window.renderNode(window.currentNode.data.status, current + text)
    }
    window.visibleText = () => document.getElementById('message').textContent
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
      const scrollGrowth = samples[i].scroll - samples[i - 1].scroll
      assert.ok(scrollGrowth >= -0.01, '跟随过程不向上回弹')
      assert.ok(scrollGrowth <= 8.01, `单帧滚动不超过 8px，实际 ${scrollGrowth}`)
    }
    const floor = await page.evaluate(() => {
      const port = document.getElementById('port')
      return port.scrollHeight - port.clientHeight - port.scrollTop
    })
    assert.ok(floor <= 1, '揭示结束后落在真实底部')

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

    // 设置关闭：即使宿主尚未重渲染，已挂载引擎也立即恢复完整文本。
    await page.evaluate(() => {
      window.hostFollow = true
      const port = document.getElementById('port')
      port.scrollTop = port.scrollHeight
      port.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true }))
      window.appendText('\n关闭开关前正在等待揭示的一段内容。'.repeat(3))
    })
    await page.waitForFunction(() => window.visibleText().length < window.currentNode.data.blocks[0].text.length)
    await page.evaluate(() => window.setConfig({ displaySmooth: false }))
    assert.equal(await page.evaluate(() => window.visibleText()), await page.evaluate(() => window.currentNode.data.blocks[0].text), '关闭立即恢复完整文字')
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
