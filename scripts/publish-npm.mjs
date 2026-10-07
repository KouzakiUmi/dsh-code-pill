import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const asset = './dist/dsh-code-pill.tgz';
const integrity = 'sha512-' + createHash('sha512').update(readFileSync(asset)).digest('base64');
function npm(args) { return spawnSync('npm', args, { encoding: 'utf8', shell: process.platform === 'win32' }); }
function inspect() {
  const r = npm(['view', `${pkg.name}@${pkg.version}`, 'dist.integrity', '--json', '--prefer-online', '--registry=https://registry.npmjs.org/']);
  if (r.status === 0) return JSON.parse(r.stdout);
  if (r.stderr.includes('E404')) return null;
  throw Error(r.stderr || r.stdout);
}
const existing = inspect();
if (existing !== null) {
  assert.equal(existing, integrity, 'existing version differs from verified artifact');
  console.log(`${pkg.name}@${pkg.version} already published with matching integrity`);
} else {
  const r = npm(['publish', asset, '--access', 'public', '--ignore-scripts', '--registry=https://registry.npmjs.org/']);
  process.stdout.write(r.stdout); process.stderr.write(r.stderr);
  if (r.status !== 0) throw Error('npm publish failed');
  let visible = null;
  for (let i = 0; i < 6; i++) {
    visible = inspect();
    if (visible !== null) break;
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  assert.equal(visible, integrity, 'published integrity must match verified tarball');
}
