/**
 * dsh-code-pill — client bundle smoke test（node，最小 DOM 桩）。
 *
 * 验证 lib/client.js 的 factory 结构与降级路径：
 * 1. factory 返回 cordis 插件对象 { name, apply }；
 * 2. document 未就绪（body null）时 apply 安全返回 noop cleanup；
 * 3. 内联 CSS 含关键选择器（highlight 名、shiki 变量覆盖、徽章）。
 * 渲染逻辑（observer/process/rebuild）依赖真实 DOM，安装后在 Web GUI 验证。
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const src = readFileSync(join(root, 'lib/client.js'), 'utf8')

// ---- window.__ModuleLoader__ 桩：捕获 load 的 spec ----
let captured = null
globalThis.window = {
  __ModuleLoader__: {
    load(spec) { captured = spec }
  }
}
// ---- document 桩：body 未就绪（验证降级路径）----
globalThis.document = { body: null }

;(0, eval)(src)

assert.notEqual(captured, null, 'ModuleLoader.load was called')
assert.equal(captured.id, 'dsh-code-pill')

const plugin = captured.factory(() => { throw new Error('unexpected require call') })
assert.equal(plugin.name, 'code-pill')
assert.equal(typeof plugin.apply, 'function')

// apply：document.body null → startRendering 返回 noop，effect 收到 cleanup
let effectLabel = null
let cleanup = null
const ctx = {
  effect(cb, label) { effectLabel = label; cleanup = cb() }
}
plugin.apply(ctx)
assert.equal(typeof cleanup, 'function', 'effect callback returned a cleanup')
assert.equal(effectLabel, 'dsh-code-pill: inline code rendering')
cleanup() // noop cleanup 必须可安全调用

// 页面已就绪时必须实际注入 CSS；body=null 无法发现 CSS_TEXT 未定义。
let styleTag = null
let disconnected = false
let removed = false
globalThis.document = {
  body: { querySelectorAll() { return [] } },
  head: { appendChild(tag) { styleTag = tag } },
  querySelector() { return null },
  createElement() { return { dataset: {}, remove() { removed = true } } }
}
globalThis.MutationObserver = class {
  observe() {}
  disconnect() { disconnected = true }
}
globalThis.requestAnimationFrame = () => 1
globalThis.cancelAnimationFrame = () => {}
plugin.apply(ctx)
assert.match(styleTag.textContent, /::highlight\(dshcp-kwc\)/)
assert.equal(styleTag.dataset.pluginCss, 'dsh-code-pill')
cleanup()
assert.equal(disconnected, true)
assert.equal(removed, true)

// 可传入目标安装的 Cordis 入口，验证真实 fiber 激活与卸载。
if (process.argv[2]) {
  const { Context } = await import(pathToFileURL(process.argv[2]).href)
  disconnected = false
  removed = false
  const runtime = new Context()
  const fiber = runtime.plugin(plugin)
  await fiber
  assert.equal(fiber.state, 2, 'client fiber activated')
  assert.match(styleTag.textContent, /::highlight\(dshcp-kwc\)/)
  await fiber.dispose()
  assert.equal(disconnected, true)
  assert.equal(removed, true)
}

// ---- 内联 CSS 关键内容 ----
assert.match(src, /::highlight\(dshcp-kwc\)/)
assert.match(src, /--shiki-token-keyword: #569cd6/)
assert.match(src, /--shiki-token-keyword: #0000ff/)
assert.match(src, /data-dshcp-badge/)
assert.match(src, /--dshcp-plain: #e2bf70/)

console.log('dsh-code-pill client smoke: OK')
