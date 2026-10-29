/**
 * dsh-code-pill — settings-core 行为测试（node 直跑，无测试框架）。
 *
 * 覆盖：预设结构（6 套配对深浅色、全 hex 色板）、defaults/presetConfig
 * 形状、normalize 严格校验（非法抛错、缺失补齐、深拷贝隔离）、
 * css/previewStyle 变量生成（rgba 背景、徽章实色、shiki 开关）、
 * audit（角色 vs 页面/pill 合成背景取最差 + badge）、parse/stringify
 * 往返、内置预设双主题全部通过 WCAG AA 4.5。
 */
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const { CP_SETTINGS } = require('../src/settings-core.cjs')

const { PRESETS, PALETTE_KEYS, ROLE_KEYS } = CP_SETTINGS
const PAGE = { light: '#ffffff', dark: '#1e1e1e' }

let passed = 0
function test(name, fn) {
  fn()
  passed++
}

function throws(fn, re) {
  assert.throws(fn, (err) => re.test(err.message), `expected error matching ${re}`)
}

// ---- 预设结构 ----
test('PRESETS: six paired presets with full hex palettes', () => {
  assert.deepEqual(PRESETS.map((p) => p.id), ['amber', 'readable', 'cool', 'editor', 'contrast', 'minimal'])
  for (const p of PRESETS) {
    assert.equal(typeof p.name, 'string')
    assert.equal(typeof p.description, 'string')
    for (const theme of ['light', 'dark']) {
      assert.deepEqual(Object.keys(p[theme]).sort(), [...PALETTE_KEYS].sort(), `${p.id}.${theme} keys`)
      for (const key of PALETTE_KEYS) {
        assert.match(p[theme][key], /^#[0-9a-f]{6}$/, `${p.id}.${theme}.${key} = ${p[theme][key]}`)
      }
    }
  }
})

// ---- defaults / presetConfig ----
test('defaults: exact default shape with direct palette objects', () => {
  const d = CP_SETTINGS.defaults()
  assert.deepEqual(d, {
    version: 1,
    preset: 'amber',
    syntax: true,
    marker: 'label',
    toolPath: true,
    sentenceFallback: true,
    thinkRainbow: false,
    rowTint: false,
    displaySmooth: false,
    rowColors: { light: { ...CP_SETTINGS.ROW_TINTS.light }, dark: { ...CP_SETTINGS.ROW_TINTS.dark } },
    fontScale: 0.94,
    radius: 4,
    padding: 0.25,
    bgOpacity: 0.06,
    blockTheme: 'host',
    light: PRESETS[0].light,
    dark: PRESETS[0].dark,
  })
  // light/dark 直接是 palette 对象，不再包 palette 键
  assert.equal(d.light.plain, '#916200')
  assert.ok(!('palette' in d.light))
})

test('defaults returns fresh copies independent of PRESETS', () => {
  const a = CP_SETTINGS.defaults()
  const b = CP_SETTINGS.defaults()
  a.light.plain = '#000000'
  a.fontScale = 1.0
  assert.notEqual(b.light.plain, '#000000')
  assert.equal(b.fontScale, 0.94)
  assert.notEqual(PRESETS[0].light.plain, '#000000', 'PRESETS must not be mutated')
  PRESETS[0].light.plain = '#916200'
})

test('presetConfig: full config with selected palette', () => {
  for (const p of PRESETS) {
    const cfg = CP_SETTINGS.presetConfig(p.id)
    assert.equal(cfg.preset, p.id)
    assert.deepEqual(cfg.light, p.light)
    assert.deepEqual(cfg.dark, p.dark)
    assert.equal(cfg.version, 1)
    assert.equal(cfg.marker, 'label')
  }
  throws(() => CP_SETTINGS.presetConfig('nope'), /unknown preset/)
})

test('minimal: subtle layout with full syntax and explicit overrides', () => {
  const cfg = CP_SETTINGS.presetConfig('minimal')
  assert.deepEqual([cfg.radius, cfg.padding, cfg.bgOpacity], [3, 0.2, 0.025])
  assert.equal(cfg.syntax, true)
  assert.equal(cfg.marker, 'label')
  assert.deepEqual(CP_SETTINGS.normalize({ version: 1, preset: 'minimal' }), cfg)
  assert.equal(CP_SETTINGS.normalize({ version: 1, preset: 'minimal', radius: 7 }).radius, 7)
  assert.deepEqual(CP_SETTINGS.parse(CP_SETTINGS.stringify(cfg)), cfg)
  assert.equal(CP_SETTINGS.defaults().preset, 'amber')
  assert.equal(CP_SETTINGS.defaults().bgOpacity, 0.06)
})

// ---- normalize ----
test('normalize: accepts full config and returns equivalent fresh copy', () => {
  const src = CP_SETTINGS.presetConfig('cool')
  const out = CP_SETTINGS.normalize(src)
  assert.deepEqual(out, src)
  assert.notEqual(out.light, src.light, 'palette must be deep-copied')
  out.light.plain = '#123456'
  assert.notEqual(src.light.plain, '#123456')
})

test('normalize: fills missing fields from defaults', () => {
  const out = CP_SETTINGS.normalize({ version: 1 })
  assert.deepEqual(out, CP_SETTINGS.defaults())
  const partial = CP_SETTINGS.normalize({ version: 1, preset: 'editor', fontScale: 1.0 })
  assert.equal(partial.preset, 'editor')
  assert.equal(partial.fontScale, 1.0)
  assert.equal(partial.light.plain, '#795e26')
  assert.equal(partial.bgOpacity, 0.06)
})

test('normalize: undefined yields defaults but persisted null is rejected', () => {
  assert.deepEqual(CP_SETTINGS.normalize(undefined), CP_SETTINGS.defaults())
  throws(() => CP_SETTINGS.normalize(null), /explicit version/)
  throws(() => CP_SETTINGS.parse('null'), /explicit version/)
})

test('custom configuration is accepted and preserves edited colors', () => {
  const cfg = CP_SETTINGS.presetConfig('cool')
  cfg.preset = 'custom'
  cfg.light.plain = '#123456'
  assert.deepEqual(CP_SETTINGS.parse(CP_SETTINGS.stringify(cfg)), cfg)
  throws(() => CP_SETTINGS.presetConfig('custom'), /unknown preset/)
})

test('normalize: requires explicit version ({} is not a valid config)', () => {
  throws(() => CP_SETTINGS.normalize({}), /missing required "version"/)
  throws(() => CP_SETTINGS.normalize({ preset: 'amber' }), /missing required "version"/)
  throws(() => CP_SETTINGS.normalize({ version: 2 }), /unsupported version/)
  throws(() => CP_SETTINGS.normalize('x'), /must be an object/)
  throws(() => CP_SETTINGS.normalize([]), /must be an object/)
})

test('normalize: rejects unknown keys', () => {
  throws(() => CP_SETTINGS.normalize({ version: 1, bogus: 1 }), /unknown key "bogus"/)
  throws(() => CP_SETTINGS.normalize({ version: 1, light: { bogus: '#111111' } }), /unknown key "bogus"/)
})

test('normalize: strict enum validation', () => {
  throws(() => CP_SETTINGS.normalize({ version: 1, marker: 'none' }), /marker/)
  for (const m of ['off', 'label', 'icon', 'both']) {
    assert.equal(CP_SETTINGS.normalize({ version: 1, marker: m }).marker, m)
  }
  throws(() => CP_SETTINGS.normalize({ version: 1, blockTheme: 'custom' }), /blockTheme/)
  assert.equal(CP_SETTINGS.normalize({ version: 1, blockTheme: 'preset' }).blockTheme, 'preset')
})

test('normalize: toolPath is a strict boolean', () => {
  throws(() => CP_SETTINGS.normalize({ version: 1, toolPath: 'yes' }), /toolPath/)
  assert.equal(CP_SETTINGS.normalize({ version: 1 }).toolPath, true)
  assert.equal(CP_SETTINGS.normalize({ version: 1, toolPath: false }).toolPath, false)
})

test('normalize: thinkRainbow is a strict boolean and defaults to off', () => {
  throws(() => CP_SETTINGS.normalize({ version: 1, thinkRainbow: 'yes' }), /thinkRainbow/)
  assert.equal(CP_SETTINGS.normalize({ version: 1 }).thinkRainbow, false)
  assert.equal(CP_SETTINGS.normalize({ version: 1, thinkRainbow: true }).thinkRainbow, true)
  // 预设只管外观，不改行为开关的默认值。
  assert.equal(CP_SETTINGS.presetConfig('cool').thinkRainbow, false)
})

test('css: ink lightness follows the theme and is the only ink variable in the base CSS', () => {
  const css = CP_SETTINGS.css(CP_SETTINGS.defaults())
  const [light, dark] = css.split('html body[data-ds-dark-theme]')
  assert.ok(light.includes('--dshcp-ink-l: 48%;'), 'light theme uses a darker ink')
  assert.ok(dark.includes('--dshcp-ink-l: 66%;'), 'dark theme uses a brighter ink')
  assert.ok(!css.includes('::highlight(dshcp-ink-'), 'highlight rules are generated only while the option is on')
})

test('normalize: rowTint is a strict boolean and defaults to off', () => {
  throws(() => CP_SETTINGS.normalize({ version: 1, rowTint: 1 }), /rowTint/)
  assert.equal(CP_SETTINGS.normalize({ version: 1 }).rowTint, false)
  assert.equal(CP_SETTINGS.normalize({ version: 1, rowTint: true }).rowTint, true)
  assert.equal(CP_SETTINGS.presetConfig('minimal').rowTint, false)
})

test('normalize: displaySmooth is a strict boolean and defaults to off', () => {
  throws(() => CP_SETTINGS.normalize({ version: 1, displaySmooth: 1 }), /displaySmooth/)
  assert.equal(CP_SETTINGS.normalize({ version: 1 }).displaySmooth, false)
  assert.equal(CP_SETTINGS.normalize({ version: 1, displaySmooth: true }).displaySmooth, true)
  assert.equal(CP_SETTINGS.presetConfig('cool').displaySmooth, false)
})

test('row tints: every colour is readable on both page backgrounds and the category hues differ', () => {
  const pages = { light: '#ffffff', dark: '#1e1e1e' }
  for (const theme of ['light', 'dark']) {
    const tints = CP_SETTINGS.ROW_TINTS[theme]
    assert.deepEqual(Object.keys(tints), CP_SETTINGS.ROW_KEYS)
    assert.equal(CP_SETTINGS.ROW_CATEGORIES.length, 12)
    assert.equal(CP_SETTINGS.ROW_KEYS.length, 15)
    assert.equal(new Set(CP_SETTINGS.ROW_CATEGORIES.flatMap(category => category.tools.split(/\s+/).filter(Boolean))).size,
      CP_SETTINGS.ROW_CATEGORIES.flatMap(category => category.tools.split(/\s+/).filter(Boolean)).length, 'each known tool has one category')
    for (const [kind, hex] of Object.entries(tints)) {
      assert.ok(CP_SETTINGS.contrast(hex, pages[theme]) >= CP_SETTINGS.AA_NORMAL, theme + ' ' + kind + ' contrast ' + CP_SETTINGS.contrast(hex, pages[theme]).toFixed(2))
    }
    assert.equal(new Set(Object.values(tints)).size, Object.keys(tints).length, theme + ' colours are all distinct')
  }
})

test('normalize: rowColors accepts partial per-theme overrides and rejects bad input', () => {
  const custom = CP_SETTINGS.normalize({ version: 1, rowColors: { dark: { read: '#ABCDEF', err: '#112233' } } })
  assert.equal(custom.rowColors.dark.read, '#abcdef', 'hex is lower-cased')
  assert.equal(custom.rowColors.dark.err, '#112233')
  assert.equal(custom.rowColors.dark.search, CP_SETTINGS.ROW_TINTS.dark.search, 'missing keys fall back to defaults')
  assert.deepEqual(custom.rowColors.light, CP_SETTINGS.ROW_TINTS.light, 'untouched theme keeps defaults')
  throws(() => CP_SETTINGS.normalize({ version: 1, rowColors: { dark: { read: 'blue' } } }), /rowColors.dark.read/)
  throws(() => CP_SETTINGS.normalize({ version: 1, rowColors: { dark: { nope: '#112233' } } }), /unknown key "nope"/)
  throws(() => CP_SETTINGS.normalize({ version: 1, rowColors: { sepia: {} } }), /unknown key "sepia"/)
  throws(() => CP_SETTINGS.normalize({ version: 1, rowColors: [] }), /rowColors/)
  throws(() => CP_SETTINGS.normalize({ version: 1, rowColors: { light: 'x' } }), /rowColors.light/)
  // 导出再导入保持一致；默认值不与常量共享引用。
  assert.deepEqual(CP_SETTINGS.parse(CP_SETTINGS.stringify(custom)).rowColors, custom.rowColors)
  const first = CP_SETTINGS.defaults(); first.rowColors.light.read = '#000000'
  assert.equal(CP_SETTINGS.defaults().rowColors.light.read, CP_SETTINGS.ROW_TINTS.light.read)
  // 旧版本保存的配置没有 rowColors：补默认。
  assert.deepEqual(CP_SETTINGS.normalize({ version: 1, syntax: false }).rowColors, CP_SETTINGS.defaults().rowColors)
  // 预设只管外观，不改行颜色。
  assert.deepEqual(CP_SETTINGS.presetConfig('cool').rowColors, CP_SETTINGS.defaults().rowColors)
})

test('normalize: legacy eight-colour settings preserve custom colours and fill new categories', () => {
  const old = { read: '#112233', search: '#223344', write: '#334455', run: '#445566', think: '#556677', ok: '#667788', warn: '#778899', err: '#8899aa' }
  const cfg = CP_SETTINGS.normalize({ version: 1, rowTint: true, rowColors: { light: old, dark: old } })
  for (const theme of ['light', 'dark']) {
    for (const [key, hex] of Object.entries(old)) assert.equal(cfg.rowColors[theme][key], hex)
    for (const key of ['session', 'agent', 'task', 'schedule', 'skill', 'ask', 'tool']) assert.equal(cfg.rowColors[theme][key], CP_SETTINGS.ROW_TINTS[theme][key])
  }
  assert.equal(cfg.rowTint, true)
  assert.deepEqual(CP_SETTINGS.parse(CP_SETTINGS.stringify(cfg)), cfg)
})

test('css: custom row colours reach the theme variables', () => {
  const css = CP_SETTINGS.css(CP_SETTINGS.normalize({ version: 1, rowColors: { light: { run: '#010203' }, dark: { ok: '#0a0b0c' } } }))
  const [light, dark] = css.split('html body[data-ds-dark-theme]')
  assert.ok(light.includes('--dshcp-row-run: #010203;'))
  assert.ok(dark.includes('--dshcp-row-ok: #0a0b0c;'))
  assert.ok(!dark.includes('#010203'))
})

test('css: row tint variables are emitted per theme', () => {
  const css = CP_SETTINGS.css(CP_SETTINGS.defaults())
  const [light, dark] = css.split('html body[data-ds-dark-theme]')
  for (const kind of Object.keys(CP_SETTINGS.ROW_TINTS.light)) {
    assert.ok(light.includes('--dshcp-row-' + kind + ': ' + CP_SETTINGS.ROW_TINTS.light[kind] + ';'), 'light ' + kind)
    assert.ok(dark.includes('--dshcp-row-' + kind + ': ' + CP_SETTINGS.ROW_TINTS.dark[kind] + ';'), 'dark ' + kind)
  }
})

test('normalize: numeric ranges enforced', () => {
  const bad = [
    ['fontScale', 0.79], ['fontScale', 1.11], ['fontScale', '0.94'],
    ['radius', -1], ['radius', 11],
    ['padding', -0.1], ['padding', 0.61],
    ['bgOpacity', -0.01], ['bgOpacity', 0.21],
  ]
  for (const [key, value] of bad) {
    throws(() => CP_SETTINGS.normalize({ version: 1, [key]: value }), new RegExp(key))
  }
  const ok = CP_SETTINGS.normalize({ version: 1, fontScale: 0.8, radius: 0, padding: 0.6, bgOpacity: 0.2 })
  assert.equal(ok.fontScale, 0.8)
  assert.equal(ok.radius, 0)
  assert.equal(ok.padding, 0.6)
  assert.equal(ok.bgOpacity, 0.2)
})

test('normalize: colors must be #rrggbb, palette fills missing from defaults', () => {
  for (const bad of ['#fff', '#91620', '916200', '#916200ff', 'red', 123]) {
    throws(() => CP_SETTINGS.normalize({ version: 1, light: { plain: bad } }), /#rrggbb/)
  }
  const out = CP_SETTINGS.normalize({ version: 1, light: { plain: '#AA33cc' } })
  assert.equal(out.light.plain, '#aa33cc', 'normalized to lowercase')
  assert.equal(out.light.kwc, PRESETS[0].light.kwc, 'missing color filled from default palette')
  assert.deepEqual(out.dark, PRESETS[0].dark, 'untouched theme keeps defaults')
})

test('normalize: custom palette survives round trip', () => {
  const cfg = CP_SETTINGS.normalize({
    version: 1, preset: 'amber', marker: 'both', blockTheme: 'preset',
    light: { plain: '#123456', badgeBg: '#eeeeee', badgeText: '#111111' },
  })
  assert.equal(cfg.preset, 'amber')
  assert.equal(cfg.marker, 'both')
  assert.equal(cfg.light.plain, '#123456')
  assert.equal(cfg.light.badgeBg, '#eeeeee')
})

// ---- css ----
test('css: default selector emits light + dark rules with all variables', () => {
  const css = CP_SETTINGS.css(CP_SETTINGS.defaults())
  assert.match(css, /^html:root \{/)
  assert.ok(css.includes('html body[data-ds-dark-theme] {'))
  for (const name of ['plain', 'kwc', 'kwd', 'str', 'com', 'num', 'fn', 'typ', 'cst', 'prm',
    'bg', 'badge-bg', 'badge-text', 'font-scale', 'radius', 'padding']) {
    assert.ok(css.includes(`--dshcp-${name}:`), `missing --dshcp-${name}`)
  }
  assert.ok(css.includes('--dshcp-plain: #916200;'))
  assert.ok(css.includes('--dshcp-plain: #e2bf70;'), 'dark rule uses dark palette')
  // bg 按 bgOpacity 生成 rgba
  assert.ok(css.includes('--dshcp-bg: rgba(145, 98, 0, 0.06);'), css)
  assert.ok(css.includes('--dshcp-bg: rgba(226, 191, 112, 0.06);'), css)
  // fn/typ/cst/prm 继承 plain
  assert.ok(css.includes('--dshcp-fn: var(--dshcp-plain);'))
  // badge 实色
  assert.ok(css.includes('--dshcp-badge-bg: #f3e7c6;'))
  assert.ok(css.includes('--dshcp-badge-text: #6e4a00;'))
  // 排版参数
  assert.ok(css.includes('--dshcp-font-scale: 0.94em;'))
  assert.ok(css.includes('--dshcp-radius: 4px;'))
  assert.ok(css.includes('--dshcp-padding: 0.25em;'))
  // host 模式不生成 shiki 变量
  assert.ok(!css.includes('--shiki-'), css)
})

test('css: blockTheme preset emits shiki variables derived from palette', () => {
  const cfg = CP_SETTINGS.normalize({ version: 1, blockTheme: 'preset', preset: 'cool' })
  const css = CP_SETTINGS.css(cfg)
  assert.ok(css.includes('--shiki-token-keyword: #7a4bb2;'))
  assert.ok(css.includes('--shiki-token-string: #96302f;'))
  assert.ok(css.includes('--shiki-token-comment: #5a6d78;'))
  assert.ok(css.includes('--shiki-foreground: ' + CP_SETTINGS.PRESETS.find(p => p.id === 'cool').light.plain + ';'))
  assert.ok(css.includes('--shiki-token-keyword: #b9a0e0;'), 'dark rule')
})

test('css: custom selector scopes the dark rule', () => {
  const css = CP_SETTINGS.css(CP_SETTINGS.defaults(), '.my-scope')
  assert.match(css, /^\.my-scope \{/)
  assert.ok(css.includes('.my-scope body[data-ds-dark-theme] {'))
})

test('css: bgOpacity feeds the rgba alpha', () => {
  const cfg = CP_SETTINGS.normalize({ version: 1, bgOpacity: 0.15 })
  assert.ok(CP_SETTINGS.css(cfg).includes('--dshcp-bg: rgba(145, 98, 0, 0.15);'))
})

// ---- previewStyle ----
test('previewStyle: flat CSS custom properties for React style', () => {
  const style = CP_SETTINGS.previewStyle(CP_SETTINGS.defaults(), 'light')
  assert.equal(style['--dshcp-plain'], '#916200')
  assert.equal(style['--dshcp-kwc'], '#9c27b0')
  // 隔离预览：fn/typ/cst/prm 解析为实色而非 var()
  assert.equal(style['--dshcp-fn'], '#916200')
  assert.equal(style['--dshcp-bg'], 'rgba(145, 98, 0, 0.06)')
  assert.equal(style['--dshcp-badge-bg'], '#f3e7c6')
  assert.equal(style['--dshcp-badge-text'], '#6e4a00')
  assert.equal(style['--dshcp-font-scale'], '0.94em', 'font-scale carries em unit for UI')
  assert.equal(style['--dshcp-radius'], '4px')
  assert.equal(style['--dshcp-padding'], '0.25em')
  const dark = CP_SETTINGS.previewStyle(CP_SETTINGS.presetConfig('amber'), 'dark')
  assert.equal(dark['--dshcp-plain'], '#e2bf70')
  throws(() => CP_SETTINGS.previewStyle(CP_SETTINGS.defaults(), 'blue'), /light\/dark/)
})

// ---- audit ----
test('audit: every built-in preset passes AA 4.5 in both themes', () => {
  for (const p of PRESETS) {
    const cfg = CP_SETTINGS.presetConfig(p.id)
    for (const theme of ['light', 'dark']) {
      const rows = CP_SETTINGS.audit(cfg, theme, PAGE[theme])
      assert.equal(rows.length, ROLE_KEYS.length + 1, '6 roles + badge')
      for (const r of rows) {
        assert.ok(r.pass, `${p.id}/${theme}/${r.role} ratio ${r.ratio.toFixed(2)}`)
        assert.ok(r.ratio >= 4.5)
        assert.equal(typeof r.ratio, 'number')
      }
      const badge = rows.find((r) => r.role === 'badge')
      assert.ok(badge.ratio >= 4.5, `${p.id}/${theme} badge`)
    }
  }
})

test('audit: role ratio is the worse of page vs composited pill background', () => {
  const cfg = CP_SETTINGS.defaults()
  const rows = CP_SETTINGS.audit(cfg, 'light', PAGE.light)
  const com = rows.find((r) => r.role === 'com')
  assert.ok(com.ratioPill < com.ratioPage)
  assert.equal(com.ratio, com.ratioPill, 'worst (pill) wins')
  throws(() => CP_SETTINGS.audit(cfg, 'light', 'white'), /#rrggbb/)
})

test('audit: custom low-contrast palette fails softly (no throw)', () => {
  const cfg = CP_SETTINGS.normalize({
    version: 1,
    light: { plain: '#eeeeee', kwc: '#eeeeee', kwd: '#eeeeee', str: '#eeeeee', com: '#eeeeee', num: '#eeeeee' },
  })
  const rows = CP_SETTINGS.audit(cfg, 'light', PAGE.light)
  assert.ok(rows.filter(r => r.role !== 'badge').every(r => r.pass === false))
  assert.equal(rows.find(r => r.role === 'badge').pass, true, 'unchanged badge remains readable')
})

// ---- parse / stringify ----
test('parse/stringify round trip', () => {
  const src = CP_SETTINGS.presetConfig('readable')
  const text = CP_SETTINGS.stringify(src)
  assert.equal(typeof text, 'string')
  assert.deepEqual(CP_SETTINGS.parse(text), src)
})

test('parse: invalid JSON or invalid config throws', () => {
  assert.throws(() => CP_SETTINGS.parse('{not json'))
  throws(() => CP_SETTINGS.parse('{}'), /missing required "version"/)
  throws(() => CP_SETTINGS.parse('{"version":1,"marker":"x"}'), /marker/)
})

test('stringify: rejects invalid config', () => {
  throws(() => CP_SETTINGS.stringify({ version: 1, fontScale: 2 }), /fontScale/)
})

console.log(`dsh-code-pill settings: ${passed} tests passed`)
