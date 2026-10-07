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
const css = readFileSync(join(root, 'src/styles.css'), 'utf8')
const template = readFileSync(join(root, 'src/client-main.js'), 'utf8')

// CSS 内联成模板字符串字面量：转义反斜杠、反引号与 ${。
const cssLiteral = '`' + css
  .replace(/\\/g, '\\\\')
  .replace(/`/g, '\\`')
  .replace(/\$\{/g, '\\${') + '`'

// replace 用回调形式，避免 tokenizer 源码里的 $ 序列被当作替换模式。
const out = template
  .replace('/* __TOKENIZER__ */', () => tokenizer)
  .replace('/* __CSS__ */', () => cssLiteral)

if (out.includes('__TOKENIZER__') || out.includes('__CSS__')) {
  throw new Error('placeholder replacement failed')
}

mkdirSync(join(root, 'lib'), { recursive: true })
writeFileSync(join(root, 'lib/client.js'), out, 'utf8')
console.log(`dsh-code-pill: wrote lib/client.js (${out.length} bytes)`)
