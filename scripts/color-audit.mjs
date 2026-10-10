#!/usr/bin/env node
/**
 * color-audit.mjs — WCAG 2.x readability audit for the DSH code-pill palettes.
 *
 * Pure computation, no third-party dependencies. Run with:
 *   node scripts/color-audit.mjs
 *
 * Sections printed (Markdown):
 *   1. Relative luminance per colour
 *   2. Contrast table vs page background and vs composited pill background
 *   3. Role-pair |dL| matrix within each theme
 *   4. Deuteranopia simulation + potential confusion pairs
 *   5. Conclusion block
 *
 * Exit code contract (CI enforces this): exits 1 when ANY of — a colour is
 * below 4.5:1 against its page background OR pill background, or a
 * deuteranopia confusion pair exists. Otherwise exits 0.
 */

// ---------------------------------------------------------------------------
// Palettes under audit (hard-coded, audited only — never "optimised")
// ---------------------------------------------------------------------------

const THEMES = [
  {
    name: 'Light',
    pageBg: '#ffffff',
    pill: { color: '#916200', alpha: 0.06 },
    roles: [
      ['plain', '#916200'],
      ['kwd', '#0451a5'],
      ['kwc', '#9c27b0'],
      ['str', '#8a1e1e'],
      ['com', '#64707a'],
      ['num', '#0a7a52'],
    ],
  },
  {
    name: 'Dark',
    pageBg: '#1e1e1e',
    pill: { color: '#e2bf70', alpha: 0.045 },
    roles: [
      ['plain', '#e2bf70'],
      ['kwc', '#c5a2cd'],
      ['kwd', '#7aa7d4'],
      ['str', '#ceaa83'],
      ['com', '#8fa67e'],
      ['num', '#6aab87'],
    ],
  },
];

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

const hexToRgb = (hex) => {
  const h = hex.replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`bad hex: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};

const rgbToHex = (rgb) =>
  '#' + rgb.map((c) => clampByte(Math.round(c)).toString(16).padStart(2, '0')).join('');

const clampByte = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

const toLinearChannel = (c8) => {
  const c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

const fromLinearChannel = (c) => {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return clampByte(v * 255);
};

const linearize = (rgb) => rgb.map(toLinearChannel);
const delinearize = (lin) => lin.map(fromLinearChannel);

/** WCAG 2.x relative luminance, 0..1 */
const luminance = (rgb) => {
  const [r, g, b] = linearize(rgb);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast ratio between two sRGB colours. */
const contrast = (a, b) => {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
};

/** Alpha-composite `fg` (alpha) onto opaque `bg`, in 8-bit sRGB space. */
const composite = (fg, alpha, bg) =>
  fg.map((c, i) => clampByte(Math.round(c * alpha + bg[i] * (1 - alpha))));

/** Euclidean distance in sRGB space. */
const srgbDistance = (a, b) =>
  Math.sqrt(a.reduce((sum, c, i) => sum + (c - b[i]) ** 2, 0));

// ---------------------------------------------------------------------------
// Deuteranopia simulation — Viénot, Brettel & Mollon (1999)
// Applied to linear RGB, result re-encoded to sRGB gamma.
// ---------------------------------------------------------------------------

const DEUTERANOPIA_MATRIX = [
  [0.62543, 0.37457, 0.0],
  [0.7, 0.3, 0.0],
  [0.0, 0.14262, 0.85738],
];

const simulateDeuteranopia = (rgb) => {
  const lin = linearize(rgb);
  const out = DEUTERANOPIA_MATRIX.map((row) =>
    row.reduce((sum, k, i) => sum + k * lin[i], 0),
  );
  return delinearize(out);
};

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const L4 = (x) => x.toFixed(4);
const C2 = (x) => x.toFixed(2);
const D3 = (x) => x.toFixed(3);

const verdict = (ratio) => (ratio >= 4.5 ? 'PASS' : 'FAIL');

const CONFUSION_DL_MAX = 0.04;
const CONFUSION_DIST_MAX = 60;

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

const out = [];
const push = (line = '') => out.push(line);

const summary = [];

push('# Code-pill colour audit — WCAG 2.x readability');
push();
push(`Generated: ${new Date().toISOString()}`);
push();
push('Thresholds: contrast PASS = ratio >= 4.5 (WCAG 2.1 AA normal text);');
push(
  `confusion pair = simulated |dL| < ${CONFUSION_DL_MAX.toFixed(2)} AND simulated sRGB Euclidean distance < ${CONFUSION_DIST_MAX}.`,
);
push();

const allPairs = [];

for (const theme of THEMES) {
  const bg = hexToRgb(theme.pageBg);
  const pillFg = hexToRgb(theme.pill.color);
  const pillBg = composite(pillFg, theme.pill.alpha, bg);

  push(`## Theme: ${theme.name}`);
  push();
  push(
    `- page background: \`${theme.pageBg}\` rgb(${bg.join(', ')}) — L = ${L4(luminance(bg))}`,
  );
  push(
    `- pill background: \`${theme.pill.color}\` @ ${(theme.pill.alpha * 100).toFixed(2)}% over \`${theme.pageBg}\` = \`${rgbToHex(pillBg)}\` rgb(${pillBg.join(', ')}) — L = ${L4(luminance(pillBg))}`,
  );
  push();

  // --- 1. Luminance -------------------------------------------------------
  push('### 1. Relative luminance (WCAG 2.x)');
  push();
  push('| role | hex | rgb | L |');
  push('| --- | --- | --- | --- |');
  const entries = theme.roles.map(([role, hex]) => {
    const rgb = hexToRgb(hex);
    return { role, hex, rgb, L: luminance(rgb) };
  });
  for (const e of entries) {
    push(`| ${e.role} | \`${e.hex}\` | ${e.rgb.join(', ')} | ${L4(e.L)} |`);
  }
  push();

  // --- 2. Contrast --------------------------------------------------------
  push('### 2. Contrast ratios');
  push();
  push(
    `| role | hex | L | vs page bg \`${theme.pageBg}\` | verdict | vs pill bg \`${rgbToHex(pillBg)}\` | verdict |`,
  );
  push('| --- | --- | --- | --- | --- | --- | --- |');
  let passCount = 0;
  let failCount = 0;
  const failures = [];
  const pillFailures = [];
  for (const e of entries) {
    const cPage = contrast(e.rgb, bg);
    const cPill = contrast(e.rgb, pillBg);
    if (cPage >= 4.5) passCount++;
    else {
      failCount++;
      failures.push({ role: e.role, hex: e.hex, ratio: cPage });
    }
    if (cPill < 4.5) pillFailures.push({ role: e.role, hex: e.hex, ratio: cPill });
    push(
      `| ${e.role} | \`${e.hex}\` | ${L4(e.L)} | ${C2(cPage)} | ${verdict(cPage)} | ${C2(cPill)} | ${verdict(cPill)} |`,
    );
  }
  push();
  push(
    `Contrast vs page background: ${passCount} PASS / ${failCount} FAIL (of ${entries.length}).`,
  );
  push(
    `Contrast vs pill background: ${entries.length - pillFailures.length} PASS / ${pillFailures.length} FAIL (of ${entries.length}).`,
  );
  if (failures.length) {
    push();
    push('Failing against page background (ratio < 4.5):');
    for (const f of failures) {
      push(`- ${f.role} \`${f.hex}\` — ${C2(f.ratio)}`);
    }
  }
  if (pillFailures.length) {
    push();
    push('Failing against pill background (ratio < 4.5):');
    for (const f of pillFailures) {
      push(`- ${f.role} \`${f.hex}\` — ${C2(f.ratio)}`);
    }
  }
  push();

  // --- 3. Role-pair |dL| matrix ------------------------------------------
  push('### 3. Role-pair |ΔL| matrix (same theme)');
  push();
  const header = ['', ...entries.map((e) => e.role)];
  push(`| ${header.join(' | ')} |`);
  push(`| ${header.map(() => '---').join(' | ')} |`);
  for (let i = 0; i < entries.length; i++) {
    const row = [entries[i].role];
    for (let j = 0; j < entries.length; j++) {
      row.push(i === j ? '—' : D3(Math.abs(entries[i].L - entries[j].L)));
    }
    push(`| ${row.join(' | ')} |`);
  }
  push();

  // --- 4. Deuteranopia ----------------------------------------------------
  push('### 4. Deuteranopia simulation (Viénot, Brettel & Mollon 1999)');
  push();
  push('| role | original hex | L | simulated hex | simulated rgb | simulated L | ΔL (sim) |');
  push('| --- | --- | --- | --- | --- | --- | --- |');
  const sims = entries.map((e) => {
    const sim = simulateDeuteranopia(e.rgb);
    const simL = luminance(sim);
    return { ...e, sim, simHex: rgbToHex(sim), simL };
  });
  for (const s of sims) {
    push(
      `| ${s.role} | \`${s.hex}\` | ${L4(s.L)} | \`${s.simHex}\` | ${s.sim.map((c) => c.toFixed(1)).join(', ')} | ${L4(s.simL)} | ${D3(Math.abs(s.simL - s.L))} |`,
    );
  }
  push();

  const pairs = [];
  for (let i = 0; i < sims.length; i++) {
    for (let j = i + 1; j < sims.length; j++) {
      const a = sims[i];
      const b = sims[j];
      const dL = Math.abs(a.simL - b.simL);
      const dist = srgbDistance(a.sim, b.sim);
      if (dL < CONFUSION_DL_MAX && dist < CONFUSION_DIST_MAX) {
        pairs.push({ a: a.role, b: b.role, dL, dist });
      }
    }
  }

  push('#### Potential confusion pairs (deuteranopia)');
  push();
  if (pairs.length === 0) {
    push(`None. No role pair satisfies |ΔL_sim| < ${CONFUSION_DL_MAX.toFixed(2)} AND simulated sRGB distance < ${CONFUSION_DIST_MAX}.`);
  } else {
    push(`| pair | ΔL (sim) | sRGB distance (sim) |`);
    push('| --- | --- | --- |');
    for (const p of pairs) {
      push(`| ${p.a} ↔ ${p.b} | ${D3(p.dL)} | ${C2(p.dist)} |`);
    }
  }
  push();

  allPairs.push({ theme: theme.name, passCount, failCount, total: entries.length, failures, pillFailures, pairs });
  summary.push({ name: theme.name, passCount, failCount, failures, pillFailures, pairs, bgHex: theme.pageBg });
}

// --- 5. Conclusion ---------------------------------------------------------
push('## 5. Conclusion');
push();
for (const s of summary) {
  const pairText = s.pairs.length
    ? `${s.pairs.length} confusion pair(s): ${s.pairs.map((p) => `${p.a}↔${p.b}`).join(', ')}`
    : 'no confusion pairs';
  const failText = s.failCount
    ? `FAIL on ${s.failures.map((f) => `${f.role} ${C2(f.ratio)}`).join(', ')}`
    : 'no failures';
  const pillText = s.pillFailures.length
    ? `pill FAIL on ${s.pillFailures.map((f) => `${f.role} ${C2(f.ratio)}`).join(', ')}`
    : 'pill all PASS';
  push(
    `- **${s.name}**: ${s.passCount} PASS / ${s.failCount} FAIL against page background \`${s.bgHex}\` (${failText}); ${pillText}; ${pairText}.`,
  );
}
push();
const anyFail = summary.some((s) => s.failCount > 0);
const anyPillFail = summary.some((s) => s.pillFailures.length > 0);
const anyConfusion = summary.some((s) => s.pairs.length > 0);
push(
  anyFail || anyPillFail || anyConfusion
    ? '**Overall: FAIL — contrast below 4.5:1 (page or pill background) and/or deuteranopia confusion pairs present. Exit code 1.**'
    : '**Overall: PASS — every colour meets 4.5:1 against both backgrounds and no confusion pairs exist.**',
);
push();

if (anyFail || anyPillFail || anyConfusion) process.exitCode = 1;

process.stdout.write(out.join('\n'));
