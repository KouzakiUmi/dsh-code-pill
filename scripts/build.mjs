/**
 * dsh-code-pill — client bundle 拼接。
 *
 * 把 src/tokenizer.cjs 与 src/styles.css 内联进 src/client-main.js 的
 * 占位符，产出自包含的 lib/client.js（window.__ModuleLoader__ factory）。
 * 无第三方依赖、无构建器：`node scripts/build.mjs` 即可。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

const tokenizer = readFileSync(join(root, 'src/tokenizer.cjs'), 'utf8')
const css = readFileSync(join(root, 'src/styles.css'), 'utf8') + '\n' + readFileSync(join(root, 'src/font-styles.css'), 'utf8')
const settingsCore = readFileSync(join(root, 'src/settings-core.cjs'), 'utf8')
const settingsUI = readFileSync(join(root, 'src/settings-ui.js'), 'utf8')
const template = readFileSync(join(root, 'src/client-main.js'), 'utf8')

// CSS 内联成模板字符串字面量：转义反斜杠、反引号与 ${。
const cssLiteral = '`' + css
  .replace(/\\/g, '\\\\')
  .replace(/`/g, '\\`')
  .replace(/\$\{/g, '\\${') + '`'

// replace 用回调形式，避免 tokenizer 源码里的 $ 序列被当作替换模式。
const out = template
  .replace('/* __TOKENIZER__ */', () => tokenizer)
  .replace('/* __SETTINGS_CORE__ */', () => settingsCore)
  .replace('/* __FONT_CORE__ */', () => readFileSync(join(root, 'src/font-catalog.cjs'), 'utf8') + '\n' + readFileSync(join(root, 'src/font-core.cjs'), 'utf8'))
  .replace('/* __FONT_UI__ */', () => readFileSync(join(root, 'src/font-ui.js'), 'utf8'))
  .replace('/* __SETTINGS_UI__ */', () => settingsUI)
  .replace('/* __CSS__ */', () => 'var CSS_TEXT = ' + cssLiteral + ';')

if (/__(?:TOKENIZER|SETTINGS_CORE|SETTINGS_UI|FONT_CORE|FONT_UI|CSS)__/.test(out)) {
  throw new Error('placeholder replacement failed')
}

mkdirSync(join(root, 'lib'), { recursive: true })
writeFileSync(join(root, 'lib/client.js'), out, 'utf8')
console.log(`dsh-code-pill: wrote lib/client.js (${out.length} bytes)`)
