#!/usr/bin/env node
// 校验 npm pack --json 产物，再复制为 Release 用的固定资产名 dist/dsh-code-pill.tgz。
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const PKG_NAME = "dsh-code-pill";
const ASSET = PKG_NAME + '.tgz';

export function validatePack(info) {
  if (!Array.isArray(info) || info.length !== 1) throw new Error('Expected exactly one npm package');
  const pack = info[0];
  if (pack?.name !== PKG_NAME) throw new Error('Unexpected package name: ' + pack?.name);
  if (typeof pack.version !== 'string' || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(pack.version)) throw new Error('Unexpected version: ' + pack.version);
  if (typeof pack.filename !== 'string' || basename(pack.filename) !== pack.filename) throw new Error('Unexpected tarball filename');
  if (!Array.isArray(pack.files)) throw new Error('Missing package file list');
  const paths = new Set(pack.files.map((f) => f.path));
  for (const required of ['package.json', 'cordis.patch.yml', 'lib/client.js', 'lib/index.js']) {
    if (!paths.has(required)) throw new Error('Missing packaged file: ' + required);
  }
  const leaked = [...paths].filter((x) => x.startsWith('.github/') || x.startsWith('tests/') || x.startsWith('node_modules/') || x.startsWith('scripts/') || x.startsWith('src/'));
  if (leaked.length > 0) throw new Error('Packaged files must not include dev-only paths: ' + leaked.slice(0, 5).join(', '));
  return pack;
}

const manifest = resolve(process.argv[2] || 'pack.json');
const destination = resolve(process.argv[3] || 'dist');
const pack = validatePack(JSON.parse(readFileSync(manifest, 'utf8')));
mkdirSync(destination, { recursive: true });
const asset = join(destination, ASSET);
copyFileSync(join(dirname(manifest), pack.filename), asset);
console.log(`Verified ${pack.name}@${pack.version} -> ${asset}`);
