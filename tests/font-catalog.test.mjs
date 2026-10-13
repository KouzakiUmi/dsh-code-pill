import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { CP_FONT_CATALOG: catalog } = createRequire(import.meta.url)('../src/font-catalog.cjs');

import { makeFont } from './fixtures/synthetic-font.mjs';

for (const format of [4,12]) {
  assert.deepEqual(catalog.inspect(makeFont({ latin:true, han:true, mono:true, format })), { latin:true, han:true, mono:true });
  assert.deepEqual(catalog.inspect(makeFont({ format })), { latin:true, han:false, mono:false });
}
assert.deepEqual(catalog.inspect(new ArrayBuffer(4)), { latin:null, han:null, mono:null });
const damaged=makeFont(); new DataView(damaged).setUint32(20,0xffffffff);
assert.deepEqual(catalog.inspect(damaged), { latin:null, han:null, mono:null });
const face = (family, data) => ({ family, blob: async()=>new Blob([data]) });
const entries = await catalog.enumerate([
  face('Misleading Mono SC',makeFont()),
  face('Plain name',makeFont({han:true,mono:true})),
  face('Plain name',makeFont({han:true,mono:true})),
  face('Mixed styles',makeFont({han:true,mono:true})),
  face('Mixed styles',makeFont({han:false,mono:false})),
  {family:'Unreadable',blob:async()=>{throw Error('unavailable');}},
  {family:''}
]);
assert.equal(entries.length,4);
assert.deepEqual(catalog.filter(entries,'mono','').map(e=>e.family),['Plain name'],'name is not a capability heuristic');
assert.deepEqual(catalog.filter(entries,'han','plain').map(e=>e.family),['Plain name']);
assert.deepEqual(catalog.filter(entries,'unknown','').map(e=>e.family),['Mixed styles','Unreadable']);
assert.equal(catalog.filter(entries,'all','nothing').length,0);
assert.equal(await catalog.enumerate([face('X',makeFont())], {cancelled:()=>true}),null);
const asciiSpace = makeFont({mono:true});
const spaceView = new DataView(asciiSpace);
const hmtxStart = spaceView.getUint32(12 + 3 * 16 + 8);
spaceView.setUint16(hmtxStart + 4,300);
assert.equal(catalog.inspect(asciiSpace).mono,false,'space is included in monospace evidence');
const noMaxp = makeFont(); new DataView(noMaxp).setUint32(28,0x74657374);
assert.deepEqual(catalog.inspect(noMaxp), {latin:null,han:null,mono:null},'missing maxp cannot certify glyphs');
const mixedUnknown = await catalog.enumerate([face('X',makeFont()),{family:'X'}]);
assert.deepEqual(mixedUnknown[0],{family:'X',faces:2,latin:null,han:null,mono:null},'unknown face cannot be folded into known capability');
assert.deepEqual(await catalog.inspectBlob(new Blob([makeFont({mono:true})])),catalog.inspect(makeFont({mono:true})));
console.log('font catalog: cmap 4/12, measured widths, multilingual tags, misleading names, failures, filtering, deduplication and cancellation OK');
