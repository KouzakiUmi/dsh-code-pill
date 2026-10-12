/**
 * dsh-code-pill — settings core（纯函数，无依赖）。
 *
 * 设置页的数据契约：五套配对深浅色预设、自定义色板、图标徽章开关、
 * 排版参数、导入导出。所有函数纯计算、无副作用，node 侧供测试与审计
 * 脚本导入（文件尾 module.exports）；浏览器侧由 scripts/build.mjs 把全文
 * 内联进 client factory，留在 factory 作用域（window 存在时不触发
 * exports 赋值）。
 *
 * 单一事实源（DESIGN.md §2.6）：色板数值只定义在本文件的 PRESETS，
 * styles.css 的默认色与 scripts/color-audit.mjs 都以这里为准——
 * 内置预设全部经 color-audit 审计（WCAG 2.x ≥ 4.5）；自定义色板允许
 * 低对比，由 CP_SETTINGS.audit 输出 pass/false 供设置页警告。
 *
 * 配置形状（version 1）：
 *   { version, preset, syntax, marker, fontScale, radius, padding,
 *     bgOpacity, blockTheme, light: {palette}, dark: {palette} }
 * light / dark 直接是 palette 对象（不再包一层 palette 键）。
 */

/** 调色键：6 个语法角色 + pill 底色基准 + 徽章实色对。 */
var PALETTE_KEYS = ['plain', 'kwc', 'kwd', 'str', 'com', 'num', 'bg', 'badgeBg', 'badgeText'];

/** 徽章开关：off 关闭 / label 文字徽章 / icon 图标徽章 / both 两者。 */
var MARKERS = ['off', 'label', 'icon', 'both'];

/** 代码块主题：host 沿用宿主 shiki / preset 由色板生成 shiki 变量。 */
var BLOCK_THEMES = ['host', 'preset'];

var CONFIG_KEYS = ['version', 'preset', 'syntax', 'marker', 'fontScale', 'radius', 'padding', 'bgOpacity', 'blockTheme', 'light', 'dark'];

/** 6 个独立语法角色（fn/typ/cst/prm 渲染层继承 plain，见 DESIGN.md §3）。 */
var ROLE_KEYS = ['plain', 'kwc', 'kwd', 'str', 'com', 'num'];

var HEX6 = /^#[0-9a-fA-F]{6}$/;

// ---------------------------------------------------------------------------
// 预设（唯一色源；内置预设全部通过 scripts/color-audit.mjs 审计 ≥ 4.5）
// ---------------------------------------------------------------------------

var PRESETS = [
  {
    id: 'amber',
    name: '琥珀经典',
    description: '琥珀签名色的经典组合，插件默认色板。',
    light: {
      plain: '#916200', kwc: '#9c27b0', kwd: '#0451a5', str: '#8a1e1e',
      com: '#64707a', num: '#0a7a52', bg: '#916200',
      badgeBg: '#f3e7c6', badgeText: '#6e4a00',
    },
    dark: {
      plain: '#e2bf70', kwc: '#c5a2cd', kwd: '#7aa7d4', str: '#ceaa83',
      com: '#8fa67e', num: '#6aab87', bg: '#e2bf70',
      badgeBg: '#463615', badgeText: '#e7c67e',
    },
  },
  {
    id: 'readable',
    name: '柔和阅读',
    description: '中性石板签名色，整体对比适中。',
    light: {
      plain: '#365066', kwc: '#7d3c98', kwd: '#2a5fa8', str: '#8a1e1e',
      com: '#525e69', num: '#3f6a0d', bg: '#365066',
      badgeBg: '#e4e9ef', badgeText: '#2e3d4d',
    },
    dark: {
      plain: '#c3ccd6', kwc: '#c39ad6', kwd: '#82a9dc', str: '#d9a679',
      com: '#97a88e', num: '#5fb392', bg: '#c3ccd6',
      badgeBg: '#2c3641', badgeText: '#ccd7e2',
    },
  },
  {
    id: 'cool',
    name: '冷调清晰',
    description: '青蓝签名色的冷色系配色。',
    light: {
      plain: '#0b4a63', kwc: '#7a4bb2', kwd: '#2a5fa8', str: '#96302f',
      com: '#5a6d78', num: '#3f6a0d', bg: '#0b4a63',
      badgeBg: '#dceef4', badgeText: '#0b4a61',
    },
    dark: {
      plain: '#7cc7de', kwc: '#b9a0e0', kwd: '#6496ce', str: '#e0a58a',
      com: '#76995c', num: '#44a389', bg: '#7cc7de',
      badgeBg: '#17323d', badgeText: '#8fd2e8',
    },
  },
  {
    id: 'editor',
    name: '编辑器经典',
    description: '贴近 VS Code Light+/Dark+ 的取色。',
    light: {
      plain: '#795e26', kwc: '#0000cc', kwd: '#000080', str: '#a13326',
      com: '#64707a', num: '#0a7a52', bg: '#795e26',
      badgeBg: '#eee9dc', badgeText: '#54400f',
    },
    dark: {
      plain: '#dcdcaa', kwc: '#569cd6', kwd: '#4ec9b0', str: '#ce9178',
      com: '#74ab60', num: '#57a08a', bg: '#dcdcaa',
      badgeBg: '#33301f', badgeText: '#d6d2a8',
    },
  },
  {
    id: 'contrast',
    name: '高对比',
    description: '明暗差距较大的高对比配色。',
    light: {
      plain: '#1f1f1f', kwc: '#6d21b3', kwd: '#123f9e', str: '#8f1d1d',
      com: '#6b6b6b', num: '#3f6a0d', bg: '#1f1f1f',
      badgeBg: '#dcdcdc', badgeText: '#1a1a1a',
    },
    dark: {
      plain: '#f0f0f0', kwc: '#c78bf5', kwd: '#7db3f7', str: '#f49090',
      com: '#a3a3a3', num: '#3fd0a0', bg: '#f0f0f0',
      badgeBg: '#2e2e2e', badgeText: '#f0f0f0',
    },
  },
];

/** 初始化必须在 PRESETS 赋值后，custom 只作为配置状态，不作为内置预设。 */
var PRESET_IDS = PRESETS.map(function (p) { return p.id; });
var CONFIG_PRESETS = PRESET_IDS.concat(['custom']);
var PRESET_BY_ID = Object.create(null);
for (var i = 0; i < PRESETS.length; i++) PRESET_BY_ID[PRESETS[i].id] = PRESETS[i];

// ---------------------------------------------------------------------------
// 校验工具
// ---------------------------------------------------------------------------

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function assertHex(v, what) {
  if (typeof v !== 'string' || !HEX6.test(v)) {
    throw new Error('dsh-code-pill settings: ' + what + ' must be #rrggbb, got ' + JSON.stringify(v));
  }
  return v.toLowerCase();
}

function assertEnum(v, list, what) {
  if (list.indexOf(v) === -1) {
    throw new Error('dsh-code-pill settings: ' + what + ' must be one of ' + list.join('/') + ', got ' + JSON.stringify(v));
  }
  return v;
}

function assertNumber(v, min, max, what) {
  if (typeof v !== 'number' || !isFinite(v) || v < min || v > max) {
    throw new Error('dsh-code-pill settings: ' + what + ' must be a number in [' + min + ', ' + max + '], got ' + JSON.stringify(v));
  }
  return v;
}

function assertNoUnknownKeys(obj, allowed, what) {
  for (var k in obj) {
    if (allowed.indexOf(k) === -1) {
      throw new Error('dsh-code-pill settings: unknown key "' + k + '" in ' + what);
    }
  }
}

function copyPalette(p) {
  var out = {};
  for (var i = 0; i < PALETTE_KEYS.length; i++) out[PALETTE_KEYS[i]] = p[PALETTE_KEYS[i]];
  return out;
}

/** 校验（可部分）palette 对象；缺失键由 fallback 补齐。返回全新对象。 */
function normalizePalette(input, fallback, what) {
  var out = copyPalette(fallback);
  if (input === undefined) return out;
  if (!isPlainObject(input)) {
    throw new Error('dsh-code-pill settings: ' + what + ' must be an object, got ' + JSON.stringify(input));
  }
  assertNoUnknownKeys(input, PALETTE_KEYS, what);
  for (var i = 0; i < PALETTE_KEYS.length; i++) {
    var key = PALETTE_KEYS[i];
    if (input[key] !== undefined) out[key] = assertHex(input[key], what + '.' + key);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 颜色数学（WCAG 2.x；audit 与脚本共用同一套定义）
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  var h = hex.replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error('bad hex: ' + hex);
  return [0, 2, 4].map(function (i) { return parseInt(h.slice(i, i + 2), 16); });
}

function toLinear(c8) {
  var c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG 2.x 相对亮度，0..1。 */
function luminance(rgb) {
  var r = toLinear(rgb[0]); var g = toLinear(rgb[1]); var b = toLinear(rgb[2]);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 对比度。 */
function contrast(hexA, hexB) {
  var la = luminance(hexToRgb(hexA));
  var lb = luminance(hexToRgb(hexB));
  var hi = Math.max(la, lb); var lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** alpha 合成到不透明底，返回 8-bit rgb 数组。 */
function composite(hexFg, alpha, hexBg) {
  var fg = hexToRgb(hexFg); var bg = hexToRgb(hexBg);
  return fg.map(function (c, i) {
    return Math.min(255, Math.max(0, Math.round(c * alpha + bg[i] * (1 - alpha))));
  });
}

function rgbToHex(rgb) {
  return '#' + rgb.map(function (c) {
    return Math.min(255, Math.max(0, Math.round(c))).toString(16).padStart(2, '0');
  }).join('');
}

/** 合成结果直接取 hex（audit 的 pill 背景口径）。 */
function compositeRgbHex(hexFg, alpha, hexBg) {
  return rgbToHex(composite(hexFg, alpha, hexBg));
}

/** rgba() CSS 值；alpha 保留原值（最多 4 位小数，与 slider step 0.005 一致），
 *  不做两位四舍五入——css 输出与审计合成必须用同一 alpha。 */
function rgbaCss(hex, alpha) {
  var rgb = hexToRgb(hex);
  var a = Math.round(alpha * 10000) / 10000;
  return 'rgba(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ', ' + a + ')';
}

// ---------------------------------------------------------------------------
// 配置 API
// ---------------------------------------------------------------------------

/**
 * 默认配置：amber 预设 + 默认排版参数。
 * 每次调用返回全新对象（palette 深拷贝，不与 PRESETS 共享引用）。
 */
function defaults() {
  var base = PRESET_BY_ID.amber;
  return {
    version: 1,
    preset: 'amber',
    syntax: true,
    marker: 'label',
    fontScale: 0.94,
    radius: 4,
    padding: 0.25,
    bgOpacity: 0.06,
    blockTheme: 'host',
    light: copyPalette(base.light),
    dark: copyPalette(base.dark),
  };
}

/**
 * 严格校验输入并返回完整的新配置。规则：未知键 / version≠1 /
 * 非法枚举 / 越界数值 / 非 #rrggbb 颜色一律抛 Error，不静默接受；
 * 缺失的合法字段从默认补齐。
 */
function normalize(input) {
  if (input === undefined) return defaults();
  if (input === null) {
    throw new Error('dsh-code-pill settings: config must be an object with explicit version, got null');
  }
  if (!isPlainObject(input)) {
    throw new Error('dsh-code-pill settings: config must be an object, got ' + JSON.stringify(input));
  }
  assertNoUnknownKeys(input, CONFIG_KEYS, 'config');

  var out = defaults();

  // 导入/持久化的配置必须显式声明 version，避免 {} / null 被当成有效配置。
  if (input.version === undefined) {
    throw new Error('dsh-code-pill settings: missing required "version" field');
  }
  if (input.version !== 1) {
    throw new Error('dsh-code-pill settings: unsupported version ' + JSON.stringify(input.version));
  }
  out.version = 1;

  // preset 先定型：缺失的 palette 字段从「所选 preset」补齐而非一律 amber；
  // 'custom'（用户在 UI 改过色/排版）以 amber 为 fallback，但实际配置里
  // light/dark 总是携带全量色板。
  if (input.preset !== undefined) {
    if (typeof input.preset !== 'string' || CONFIG_PRESETS.indexOf(input.preset) === -1) {
      throw new Error('dsh-code-pill settings: unknown preset ' + JSON.stringify(input.preset));
    }
    out.preset = input.preset;
    var base = PRESET_BY_ID[input.preset] || PRESET_BY_ID.amber;
    out.light = copyPalette(base.light);
    out.dark = copyPalette(base.dark);
  }
  if (input.syntax !== undefined) {
    if (typeof input.syntax !== 'boolean') throw new Error('dsh-code-pill settings: syntax must be boolean');
    out.syntax = input.syntax;
  }
  if (input.marker !== undefined) out.marker = assertEnum(input.marker, MARKERS, 'marker');
  if (input.blockTheme !== undefined) out.blockTheme = assertEnum(input.blockTheme, BLOCK_THEMES, 'blockTheme');
  if (input.fontScale !== undefined) out.fontScale = assertNumber(input.fontScale, 0.8, 1.1, 'fontScale');
  if (input.radius !== undefined) out.radius = assertNumber(input.radius, 0, 10, 'radius');
  if (input.padding !== undefined) out.padding = assertNumber(input.padding, 0, 0.6, 'padding');
  if (input.bgOpacity !== undefined) out.bgOpacity = assertNumber(input.bgOpacity, 0, 0.2, 'bgOpacity');
  if (input.light !== undefined) out.light = normalizePalette(input.light, out.light, 'light');
  if (input.dark !== undefined) out.dark = normalizePalette(input.dark, out.dark, 'dark');
  return out;
}

/** 完整默认配置换成指定预设的配色；非法 id 抛 Error。 */
function presetConfig(id) {
  var preset = PRESET_BY_ID[id];
  if (preset === undefined) {
    throw new Error('dsh-code-pill settings: unknown preset ' + JSON.stringify(id));
  }
  var out = defaults();
  out.preset = id;
  out.light = copyPalette(preset.light);
  out.dark = copyPalette(preset.dark);
  return out;
}

// ---------------------------------------------------------------------------
// CSS 生成
// ---------------------------------------------------------------------------

/** 由 palette 推导 shiki 代码块变量（blockTheme = 'preset' 时）。 */
function shikiVars(p) {
  return [
    ['--shiki-foreground', p.plain],
    ['--shiki-token-constant', p.kwd],
    ['--shiki-token-string', p.str],
    ['--shiki-token-string-expression', p.str],
    ['--shiki-token-comment', p.com],
    ['--shiki-token-keyword', p.kwc],
    ['--shiki-token-parameter', p.kwd],
    ['--shiki-token-function', p.plain],
    ['--shiki-token-punctuation', p.plain],
    ['--shiki-token-link', p.kwc],
  ];
}

/** 单个主题的变量声明行（不含选择器与花括号）。 */
function themeDeclarations(cfg, palette) {
  var lines = [];
  for (var i = 0; i < ROLE_KEYS.length; i++) {
    var role = ROLE_KEYS[i];
    lines.push('  --dshcp-' + role + ': ' + palette[role] + ';');
  }
  lines.push('  --dshcp-fn: var(--dshcp-plain);');
  lines.push('  --dshcp-typ: var(--dshcp-plain);');
  lines.push('  --dshcp-cst: var(--dshcp-plain);');
  lines.push('  --dshcp-prm: var(--dshcp-plain);');
  lines.push('  --dshcp-bg: ' + rgbaCss(palette.bg, cfg.bgOpacity) + ';');
  lines.push('  --dshcp-badge-bg: ' + palette.badgeBg + ';');
  lines.push('  --dshcp-badge-text: ' + palette.badgeText + ';');
  lines.push('  --dshcp-font-scale: ' + cfg.fontScale + 'em;');
  lines.push('  --dshcp-radius: ' + cfg.radius + 'px;');
  lines.push('  --dshcp-padding: ' + cfg.padding + 'em;');
  if (cfg.blockTheme === 'preset') {
    var sv = shikiVars(palette);
    for (var j = 0; j < sv.length; j++) lines.push('  ' + sv[j][0] + ': ' + sv[j][1] + ';');
  }
  return lines;
}

/**
 * 生成 CSS 变量规则：默认两段（selector 的亮色段 + 深色主题的暗色段）。
 * selector 省略时为 'html:root'，暗色段落在 'html body[data-ds-dark-theme]'；
 * 自定义 selector 时暗色段为其内层 body[data-ds-dark-theme] 作用域。
 */
function css(config, selector) {
  var cfg = normalize(config);
  var lightSel = (selector === undefined || selector === null) ? 'html:root' : String(selector);
  var darkSel = lightSel === 'html:root'
    ? 'html body[data-ds-dark-theme]'
    : lightSel + ' body[data-ds-dark-theme]';
  return lightSel + ' {\n' + themeDeclarations(cfg, cfg.light).join('\n') + '\n}\n'
    + darkSel + ' {\n' + themeDeclarations(cfg, cfg.dark).join('\n') + '\n}';
}

/** React style 对象形式的自定义属性（隔离预览用，var() 全部解析为实色）。 */
function previewStyle(config, theme) {
  var cfg = normalize(config);
  if (theme !== 'light' && theme !== 'dark') {
    throw new Error('dsh-code-pill settings: theme must be light/dark, got ' + JSON.stringify(theme));
  }
  var p = cfg[theme];
  var out = {};
  for (var i = 0; i < ROLE_KEYS.length; i++) out['--dshcp-' + ROLE_KEYS[i]] = p[ROLE_KEYS[i]];
  out['--dshcp-fn'] = p.plain;
  out['--dshcp-typ'] = p.plain;
  out['--dshcp-cst'] = p.plain;
  out['--dshcp-prm'] = p.plain;
  out['--dshcp-bg'] = rgbaCss(p.bg, cfg.bgOpacity);
  out['--dshcp-badge-bg'] = p.badgeBg;
  out['--dshcp-badge-text'] = p.badgeText;
  out['--dshcp-font-scale'] = cfg.fontScale + 'em';
  out['--dshcp-radius'] = cfg.radius + 'px';
  out['--dshcp-padding'] = cfg.padding + 'em';
  if (cfg.blockTheme === 'preset') {
    var sv = shikiVars(p);
    for (var j = 0; j < sv.length; j++) out[sv[j][0]] = sv[j][1];
  }
  return out;
}

// ---------------------------------------------------------------------------
// 对比度审计
// ---------------------------------------------------------------------------

var AA_NORMAL = 4.5;

/**
 * 对比度审计：6 个语法角色分别对 pageBg 与 pill 合成背景
 * （palette.bg @ bgOpacity 叠到 pageBg）取最差值；badge 对按实色口径
 * （badgeText vs badgeBg，与 css 的 --dshcp-badge-* 一致）。
 * 返回 [{ role, ratio, pass, ratioPage, ratioPill }]，ratio = min 为完整精度浮点。
 */
function audit(config, theme, pageBg) {
  var cfg = normalize(config);
  if (theme !== 'light' && theme !== 'dark') {
    throw new Error('dsh-code-pill settings: theme must be light/dark, got ' + JSON.stringify(theme));
  }
  assertHex(pageBg, 'pageBg');
  var p = cfg[theme];
  var pillHex = compositeRgbHex(p.bg, cfg.bgOpacity, pageBg);
  var out = [];
  for (var i = 0; i < ROLE_KEYS.length; i++) {
    var role = ROLE_KEYS[i];
    var ratioPage = contrast(p[role], pageBg);
    var ratioPill = contrast(p[role], pillHex);
    var ratio = Math.min(ratioPage, ratioPill);
    out.push({ role: role, ratio: ratio, pass: ratio >= AA_NORMAL, ratioPage: ratioPage, ratioPill: ratioPill });
  }
  var badgeRatio = contrast(p.badgeText, p.badgeBg);
  out.push({ role: 'badge', ratio: badgeRatio, pass: badgeRatio >= AA_NORMAL });
  return out;
}

// ---------------------------------------------------------------------------
// 导入 / 导出
// ---------------------------------------------------------------------------

/** 导入：JSON.parse + normalize（格式非法抛 Error）。 */
function parse(text) {
  return normalize(JSON.parse(text));
}

/** 导出：先 normalize 校验（非法配置抛 Error），紧凑 JSON。 */
function stringify(config) {
  return JSON.stringify(normalize(config));
}

var CP_SETTINGS = {
  PRESETS: PRESETS,
  PALETTE_KEYS: PALETTE_KEYS,
  ROLE_KEYS: ROLE_KEYS,
  MARKERS: MARKERS,
  BLOCK_THEMES: BLOCK_THEMES,
  AA_NORMAL: AA_NORMAL,
  defaults: defaults,
  normalize: normalize,
  presetConfig: presetConfig,
  css: css,
  previewStyle: previewStyle,
  audit: audit,
  parse: parse,
  stringify: stringify,
  // 颜色数学暴露给审计脚本复用（同一实现，避免双源漂移）。
  hexToRgb: hexToRgb,
  luminance: luminance,
  contrast: contrast,
  composite: composite,
  compositeRgbHex: compositeRgbHex,
  rgbaCss: rgbaCss,
};

if (typeof module !== 'undefined' && module.exports !== undefined && typeof window === 'undefined') {
  module.exports = { CP_SETTINGS };
}
