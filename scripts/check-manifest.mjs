#!/usr/bin/env node
// 发布前机械校验：包名 / dsh.bundle / 依赖归属 / repository / files / exports / patch 注册。
// 在本地与 GitHub Actions 中都运行；任何一项失败即退出非零。
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_NAME = "dsh-code-pill";
const OWNER = "KouzakiUmi";

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (m) => { console.error('FAIL ' + m); process.exitCode = 1; };
const ok = (m) => console.log('PASS ' + m);

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

if (pkg.name !== PKG_NAME) fail(`package.name 应为 ${PKG_NAME}，实际 ${pkg.name}`);
else ok('package.name = ' + PKG_NAME);

if (pkg.private === true) fail('package.private 为 true，无法发布');
else ok('未标记 private');

if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(pkg.version || '')) fail('version 不是 semver: ' + pkg.version);
else ok('version = ' + pkg.version);

const dsh = pkg.dsh || {};
if (!dsh.bundle || !dsh.bundle.patch) fail('缺少 dsh.bundle.patch');
else if (!existsSync(join(root, dsh.bundle.patch))) fail('dsh.bundle.patch 指向的文件不存在: ' + dsh.bundle.patch);
else ok('dsh.bundle.patch -> ' + dsh.bundle.patch);

if (dsh.client?.platform !== 'web') fail('dsh.client.platform 应为 web');
else ok('dsh.client.platform = web');

const peer = pkg.peerDependencies || {};
const corePeers = Object.keys(peer).filter((k) => k.startsWith('@deepseek-ai/'));
const coreDeps = Object.keys(pkg.dependencies || {}).filter((k) => k.startsWith('@deepseek-ai/'));
if (coreDeps.length > 0) fail('@deepseek-ai/* 出现在 dependencies（应只在 peerDependencies）: ' + coreDeps.join(', '));
else ok(corePeers.length ? `核心包仅声明在 peerDependencies（${corePeers.length} 个）` : '未声明 @deepseek-ai/* 依赖');

const repo = typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository || {}).url || '';
if (!repo.includes(`${OWNER}/${PKG_NAME}`)) fail(`repository 缺失或未指向 ${OWNER}/${PKG_NAME}：${repo || '(空)'}`);
else ok('repository 指向 ' + OWNER + '/' + PKG_NAME);

const files = pkg.files || [];
if (!files.includes('cordis.patch.yml')) fail('files 缺少 cordis.patch.yml');
else ok('files = ' + files.join(', '));

for (const [key, target] of Object.entries(pkg.exports || {})) {
  if (typeof target !== 'string') continue;
  if (target.includes('*')) {
    if (!existsSync(join(root, dirname(target)))) fail(`exports["${key}"] -> ${target} 目录不存在`);
    continue;
  }
  if (!existsSync(join(root, target))) fail(`exports["${key}"] -> ${target} 文件不存在`);
}
ok('exports 目标均存在');

const patchPath = join(root, dsh.bundle.patch || 'cordis.patch.yml');
if (existsSync(patchPath)) {
  const patch = readFileSync(patchPath, 'utf8');
  if (!patch.includes('- insert:')) fail('cordis.patch.yml 缺少 - insert: 结构');
  else if (!new RegExp('name:\\s*' + PKG_NAME + '\\b').test(patch)) fail('cordis.patch.yml 未注册 name: ' + PKG_NAME);
  else ok('cordis.patch.yml 含 insert 条目(' + PKG_NAME + ')');
}

// client 产物必须存在且自包含（不依赖现场构建）
if (!existsSync(join(root, 'lib/client.js'))) fail('lib/client.js 不存在（先跑 node scripts/build.mjs）');
else ok('lib/client.js 存在');

if (process.exitCode) console.error('\n清单校验未通过 —— 以上 FAIL 项修完再发版。');
else console.error('\n清单校验全部通过。');
