import { createRequire } from 'node:module';
const { CP_FONT_CATALOG: catalog } = createRequire(import.meta.url)('../../src/font-catalog.cjs');
// Synthetic font metadata, not redistributed real font files.
export function makeFont({ latin = true, han = false, mono = false, format = 12 } = {}) {
  const codes = [...new Set(Array.from((latin ? catalog.ASCII : '') + (han ? catalog.HAN : '')).map(c => c.codePointAt(0)))].sort((a,b) => a-b);
  const n = codes.length;
  const subSize = format === 12 ? 16 + n * 12 : 16 + (n + 1) * 8;
  const cmap = new Uint8Array(12 + subSize), cv = new DataView(cmap.buffer);
  cv.setUint16(2, 1); cv.setUint16(4, 3); cv.setUint16(6, format === 12 ? 10 : 1); cv.setUint32(8, 12);
  cv.setUint16(12, format);
  if (format === 12) {
    cv.setUint32(16, subSize); cv.setUint32(24, n);
    codes.forEach((code,i) => { const p = 28 + i * 12; cv.setUint32(p,code); cv.setUint32(p+4,code); cv.setUint32(p+8,i+1); });
  } else {
    const seg = n+1; cv.setUint16(14, subSize); cv.setUint16(18, seg * 2);
    [...codes,65535].forEach((code,i) => {
      cv.setUint16(26+i*2,code); cv.setUint16(28+seg*2+i*2,code);
      cv.setUint16(28+seg*4+i*2, ((i<n ? i+1 : 0)-code)&65535);
    });
  }
  const maxp = new Uint8Array(6); new DataView(maxp.buffer).setUint16(4,n+1);
  const hhea = new Uint8Array(36); new DataView(hhea.buffer).setUint16(34,n+1);
  const hmtx = new Uint8Array((n+1)*4), hv = new DataView(hmtx.buffer);
  for (let i=0;i<=n;i++) hv.setUint16(i*4,mono ? 600 : 500 + i);
  const tables = { cmap, maxp, hhea, hmtx };
  const size = 12 + Object.keys(tables).length * 16 + Object.values(tables).reduce((n,t)=>n+t.length,0);
  const out = new ArrayBuffer(size), v = new DataView(out); v.setUint32(0,0x00010000); v.setUint16(4,4);
  let offset=76;
  Object.entries(tables).forEach(([tag,data],i)=>{
    const at=12+i*16; [...tag].forEach((c,j)=>v.setUint8(at+j,c.charCodeAt(0)));
    v.setUint32(at+8,offset); v.setUint32(at+12,data.length); new Uint8Array(out,offset,data.length).set(data); offset+=data.length;
  });
  return out;
}
