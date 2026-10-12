/** Local documentation checks; no network calls and no Markdown rendering dependency. */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { CP_SETTINGS } = createRequire(import.meta.url)('../src/settings-core.cjs')
const files = ['README.md', 'DESIGN.md', 'CHANGELOG.md', 'assets/README.md', ...readdirSync(resolve(root, 'docs')).filter(name => name.endsWith('.md')).map(name => 'docs/' + name)]
let links = 0
for (const file of files) {
  const text = readFileSync(resolve(root, file), 'utf8')
  assert.ok(!text.includes('\ufffd'), `${file}: invalid UTF-8`)
  const references = [...text.matchAll(/\]\(([^)]+)\)/g)].map(match => match[1]).concat([...text.matchAll(/\bsrc="([^"]+)"/g)].map(match => match[1]))
  for (let target of references) {
    target = target.replace(/^<|>$/g, '')
    const rawPrefix = 'https://raw.githubusercontent.com/KouzakiUmi/dsh-code-pill/main/'
    if (target.startsWith(rawPrefix)) target = resolve(root, target.slice(rawPrefix.length))
    else if (/^(?:https?:|mailto:|#)/.test(target)) continue
    else target = resolve(root, dirname(file), decodeURIComponent(target.split('#')[0]))
    assert.ok(existsSync(target), `${file}: broken local link ${relative(root, target)}`)
    links++
  }
}
const readme = readFileSync(resolve(root, 'README.md'), 'utf8')
const releaseVersion = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version
assert.ok(readme.includes(releaseVersion + ' 版本文档'), 'README must identify the current release version')
assert.match(readme, /main 与 npm 已发布包不自动等同/, 'main and npm release must not be conflated')
assert.ok(readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8').split(/\r?\n/).includes('## ' + releaseVersion), 'changelog must include the current release')
const settings = readFileSync(resolve(root, 'docs/settings.md'), 'utf8')
for (const preset of CP_SETTINGS.PRESETS) {
  assert.ok(settings.includes(preset.name) && settings.includes('`' + preset.id + '`'), `document missing preset ${preset.id}`)
}
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
assert.ok(pkg.files.includes('docs/'), 'guides must be included in package files')
console.log(`documentation: ${files.length} pages, ${links} local links, ${CP_SETTINGS.PRESETS.length} presets, release boundary OK`)
