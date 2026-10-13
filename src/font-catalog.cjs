/* Client-only font inspection. No family-name heuristics or bundled font files. */
var CP_FONT_CATALOG = (function () {
  var LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var ASCII = Array.from({ length: 95 }, function (_, i) { return String.fromCharCode(32 + i); }).join('');
  var HAN = '中文字体阅读界面代码测试汉語繁體國學書體';
  var FILTERS = [
    { id: 'all', label: '全部字体' },
    { id: 'latin', label: '英文 / 拉丁字母' },
    { id: 'han', label: '中文 / 汉字（抽样）' },
    { id: 'mono', label: '等宽（拉丁字符）' },
    { id: 'unknown', label: '未完整识别' }
  ];
  function unknown() { return { latin: null, han: null, mono: null }; }
  function inspect(buffer) {
    try {
      var view = new DataView(buffer);
      function check(offset, length, end) {
        if (offset < 0 || length < 0 || offset + length > (end === undefined ? view.byteLength : end)) throw Error('Invalid font table');
      }
      function u16(p) { check(p, 2); return view.getUint16(p); }
      function u32(p) { check(p, 4); return view.getUint32(p); }
      check(0, 12);
      var signature = u32(0);
      if ([0x00010000, 0x4f54544f, 0x74727565].indexOf(signature) < 0) return unknown();
      var count = u16(4), tables = Object.create(null);
      check(12, count * 16);
      for (var i = 0; i < count; i++) {
        var p = 12 + i * 16, tag = '';
        for (var j = 0; j < 4; j++) tag += String.fromCharCode(view.getUint8(p + j));
        var offset = u32(p + 8), length = u32(p + 12);
        check(offset, length);
        if (tables[tag]) throw Error('Duplicate font table');
        tables[tag] = { start: offset, end: offset + length };
      }
      var cmap = tables.cmap, mapping = null;
      if (cmap) {
        check(cmap.start, 4, cmap.end);
        var records = u16(cmap.start + 2), candidates = [];
        check(cmap.start + 4, records * 8, cmap.end);
        for (i = 0; i < records; i++) {
          p = cmap.start + 4 + i * 8;
          var platform = u16(p), encoding = u16(p + 2);
          if (!(platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10)))) continue;
          var sub = cmap.start + u32(p + 4);
          check(sub, 2, cmap.end);
          var format = u16(sub);
          if (format === 4 || format === 12) candidates.push({ start: sub, format: format });
        }
        candidates.sort(function (a, b) { return b.format - a.format; });
        if (candidates.length) {
          var selected = candidates[0], start = selected.start;
          if (selected.format === 12) {
            check(start, 16, cmap.end);
            var end = start + u32(start + 4), groups = u32(start + 12);
            check(start, end - start, cmap.end); check(start + 16, groups * 12, end);
            var previous = -1;
            for (var g = 0; g < groups; g++) {
              var gp = start + 16 + g * 12, low = u32(gp), high = u32(gp + 4);
              if (low > high || high > 0x10ffff || low <= previous) throw Error('Invalid cmap groups');
              previous = high;
            }
            mapping = function (code) {
              var lo = 0, hi = groups - 1;
              while (lo <= hi) {
                var mid = (lo + hi) >>> 1, at = start + 16 + mid * 12;
                var first = u32(at), last = u32(at + 4);
                if (code < first) hi = mid - 1;
                else if (code > last) lo = mid + 1;
                else return u32(at + 8) + code - first;
              }
              return 0;
            };
          } else {
            check(start, 16, cmap.end);
            end = start + u16(start + 2);
            var segments = u16(start + 6) / 2;
            if (!Number.isInteger(segments) || !segments) throw Error('Invalid segments');
            check(start, end - start, cmap.end); check(start + 14, segments * 8 + 2, end);
            previous = -1;
            for (var seg = 0; seg < segments; seg++) {
              low = u16(start + 16 + segments * 2 + seg * 2); high = u16(start + 14 + seg * 2);
              if (low > high || low <= previous) throw Error('Invalid cmap segments');
              previous = high;
            }
            mapping = function (code) {
              var lo = 0, hi = segments - 1;
              while (lo <= hi) {
                var mid = (lo + hi) >>> 1;
                if (u16(start + 14 + mid * 2) < code) lo = mid + 1; else hi = mid - 1;
              }
              if (lo >= segments) return 0;
              var first = u16(start + 16 + segments * 2 + lo * 2);
              if (code < first) return 0;
              var delta = u16(start + 16 + segments * 4 + lo * 2);
              var at = start + 16 + segments * 6 + lo * 2, range = u16(at);
              if (!range) return (code + delta) & 65535;
              var glyphAt = at + range + (code - first) * 2;
              if (glyphAt < start + 16 + segments * 8) throw Error('Invalid glyph offset');
              check(glyphAt, 2, end);
              var glyph = u16(glyphAt);
              return glyph ? (glyph + delta) & 65535 : 0;
            };
          }
        }
      }
      var result = unknown();
      function glyphs(text) { return Array.from(text).map(function (char) { return mapping(char.codePointAt(0)); }); }
      if (mapping) {
        var maxp = tables.maxp, glyphCount = null;
        if (maxp) { check(maxp.start, 6, maxp.end); glyphCount = u16(maxp.start + 4); }
        if (glyphCount === null || !glyphCount) return unknown();
        function valid(glyph) {
          if (glyph >= glyphCount) throw Error('Invalid glyph index');
          return glyph > 0;
        }
        var latin = glyphs(LATIN);
        result.latin = latin.every(valid);
        result.han = glyphs(HAN).every(valid);
        var hhea = tables.hhea, hmtx = tables.hmtx;
        if (result.latin && glyphCount !== null && hhea && hmtx) {
          check(hhea.start, 36, hhea.end);
          var metrics = u16(hhea.start + 34);
          if (!metrics || metrics > glyphCount) throw Error('Invalid metrics');
          check(hmtx.start, metrics * 4 + (glyphCount - metrics) * 2, hmtx.end);
          var ascii = glyphs(ASCII);
          if (ascii.every(valid)) {
            var widths = ascii.map(function (glyph) { return u16(hmtx.start + Math.min(glyph, metrics - 1) * 4); });
            result.mono = widths[0] > 0 && widths.every(function (width) { return width === widths[0]; });
          } else result.mono = false;
        }
      }
      return result;
    } catch (error) { return unknown(); }
  }
  function filter(entries, category, search) {
    var query = String(search || '').trim().toLocaleLowerCase();
    return entries.filter(function (entry) {
      var match = category === 'all' || !category || (category === 'unknown'
        ? entry.latin === null || entry.han === null || entry.mono === null
        : entry[category] === true);
      return match && entry.family.toLocaleLowerCase().indexOf(query) !== -1;
    });
  }
  async function inspectBlob(blob) {
    // FontData.blob() is specified to return a standalone SFNT face. Unsupported
    // containers remain unknown; never merge unrelated faces from a collection.
    var header = new DataView(await blob.slice(0, 12).arrayBuffer());
    if (header.byteLength < 12) return unknown();
    var signature = header.getUint32(0), count = header.getUint16(4);
    if ([0x00010000, 0x4f54544f, 0x74727565].indexOf(signature) < 0 || count > 4096) return unknown();
    var bytes = await blob.slice(12, 12 + count * 16).arrayBuffer();
    if (bytes.byteLength !== count * 16) return unknown();
    var directory = new DataView(bytes), wanted = ['cmap', 'maxp', 'hhea', 'hmtx'], selected = [], total = 12, seen = new Set();
    for (var i = 0; i < count; i++) {
      var p = i * 16, tag = '';
      for (var j = 0; j < 4; j++) tag += String.fromCharCode(directory.getUint8(p + j));
      if (seen.has(tag)) return unknown();
      seen.add(tag);
      if (wanted.indexOf(tag) < 0) continue;
      var offset = directory.getUint32(p + 8), length = directory.getUint32(p + 12);
      if (offset + length > blob.size || length > 4 * 1024 * 1024) return unknown();
      selected.push({ tag: tag, offset: offset, length: length }); total += length + 16;
    }
    var compact = new ArrayBuffer(total), view = new DataView(compact);
    view.setUint32(0, signature); view.setUint16(4, selected.length);
    var cursor = 12 + selected.length * 16;
    for (i = 0; i < selected.length; i++) {
      var item = selected[i]; p = 12 + i * 16;
      for (j = 0; j < 4; j++) view.setUint8(p + j, item.tag.charCodeAt(j));
      view.setUint32(p + 8, cursor); view.setUint32(p + 12, item.length);
      var table = await blob.slice(item.offset, item.offset + item.length).arrayBuffer();
      if (table.byteLength !== item.length) return unknown();
      new Uint8Array(compact, cursor, item.length).set(new Uint8Array(table)); cursor += item.length;
    }
    return inspect(compact);
  }
  async function enumerate(faces, options) {
    options = options || {};
    var families = new Map();
    (faces || []).forEach(function (face) {
      if (!face || typeof face.family !== 'string' || !face.family.trim()) return;
      if (!families.has(face.family)) families.set(face.family, []);
      families.get(face.family).push(face);
    });
    var entries = [], done = 0;
    // Sequential reads keep large CJK font buffers out of memory after each face.
    for (var pair of families) {
      if (options.cancelled && options.cancelled()) return null;
      var capability = unknown(), evidence = [];
      for (var face of pair[1]) {
        if (options.cancelled && options.cancelled()) return null;
        var found = unknown();
        try { if (typeof face.blob === 'function') found = await inspectBlob(await face.blob()); }
        catch (error) { /* Listed family remains available with unknown capabilities. */ }
        evidence.push(found);
      }
      ['latin', 'han', 'mono'].forEach(function (key) {
        if (evidence.every(function (face) { return face[key] === true; })) capability[key] = true;
        else if (evidence.every(function (face) { return face[key] === false; })) capability[key] = false;
      });
      entries.push(Object.assign({ family: pair[0], faces: evidence.length }, capability));
      done++;
      if (options.onProgress) options.onProgress(done, families.size);
    }
    return entries.sort(function (a, b) { return a.family.localeCompare(b.family); });
  }
  return { inspect: inspect, inspectBlob: inspectBlob, filter: filter, enumerate: enumerate, FILTERS: FILTERS, LATIN: LATIN, HAN: HAN, ASCII: ASCII };
})();
if (typeof module !== 'undefined' && module.exports) module.exports.CP_FONT_CATALOG = CP_FONT_CATALOG;
