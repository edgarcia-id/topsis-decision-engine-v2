/*!
 * TOPSIS Decision Engine — ekspor & impor berkas: XLSX (tanpa pustaka, dengan rumus hidup), CSV, PNG/SVG, PDF (jsPDF)
 * (c) 2026 Alfredo Garcia — MIT License
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./topsis-core.js'), require('./model.js'));
  else root.TopsisExport = factory(root.TopsisCore, root.TopsisModel);
}(typeof self !== 'undefined' ? self : this, function (T, M) {
  'use strict';

  const TOOL_URL = 'https://edgarcia-id.github.io/topsis-decision-engine-v2/';
  const TOOL_NAME = 'TOPSIS Decision Engine';

  /* ------------------------------------------------------------------ *
   * Unduh berkas
   * ------------------------------------------------------------------ */

  function download(filename, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function safeFileName(s, ext) {
    const base = String(s || 'topsis').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60) || 'topsis';
    return base + (ext ? '.' + ext : '');
  }

  /* ------------------------------------------------------------------ *
   * CSV
   * ------------------------------------------------------------------ */

  /** CSV dengan BOM. Pemisah ';' bila desimal koma (Excel Indonesia), ',' bila desimal titik. */
  function csvString(rows, decimalSep) {
    const sep = decimalSep === ',' ? ';' : ',';
    const q = (v) => {
      if (v === null || v === undefined) return '';
      let s = typeof v === 'number' ? (isFinite(v) ? String(+v.toPrecision(15)) : '') : String(v);
      if (typeof v === 'number' && decimalSep === ',') s = s.replace('.', ',');
      return new RegExp('["\\n\\r' + sep + ']').test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return '﻿' + rows.map((r) => r.map(q).join(sep)).join('\r\n') + '\r\n';
  }

  function resultRows(R) {
    const p = R.project, res = R.comp.res;
    const rows = [['Peringkat', 'Alternatif', 'D+', 'D-', 'C*']];
    res.order.forEach((i) => rows.push([res.rank[i], p.alternatives[i].name, res.Dpos[i], res.Dneg[i], res.C[i]]));
    return rows;
  }

  /* ------------------------------------------------------------------ *
   * ZIP (store) + XLSX minimal
   * ------------------------------------------------------------------ */

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function zip(files) {
    const enc = new TextEncoder();
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const locals = [], centrals = [];
    let offset = 0;
    for (const file of files) {
      const name = enc.encode(file.name);
      const data = typeof file.data === 'string' ? enc.encode(file.data) : file.data;
      const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      locals.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true); ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
      ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
      centrals.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cdSize = centrals.reduce((s, b) => s + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    const parts = locals.concat(centrals, [new Uint8Array(end.buffer)]);
    const total = parts.reduce((s, b) => s + b.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const b of parts) { out.set(b, o); o += b.length; }
    return out;
  }

  const S = { normal: 0, bold: 1, title: 2, note: 3, th: 4, n4: 5, pct: 6, td: 7, n4b: 8, pctb: 9, n3: 10, int: 11, tdb: 12 };

  const STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="3"><numFmt numFmtId="164" formatCode="0.0000"/><numFmt numFmtId="165" formatCode="0.00%"/><numFmt numFmtId="166" formatCode="0.000"/></numFmts>' +
    '<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="14"/><color rgb="FF312E81"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF64748B"/><name val="Calibri"/></font></fonts>' +
    '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE0E7FF"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFD1FAE5"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="13">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>' +
    '<xf numFmtId="164" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="165" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  function xmlEsc(s) {
    return String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function colName(i) {
    let s = '';
    i += 1;
    while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }

  function ref(r, c, absCol, absRow) { return (absCol ? '$' : '') + colName(c) + (absRow ? '$' : '') + (r + 1); }

  function sheetXml(sheet) {
    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews>';
    if (sheet.cols && sheet.cols.length) {
      xml += '<cols>' + sheet.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>';
    }
    xml += '<sheetData>';
    sheet.rows.forEach((row, r) => {
      if (!row || !row.length) return;
      let cells = '';
      row.forEach((cell, c) => {
        if (cell === null || cell === undefined || cell === '') return;
        const o = typeof cell === 'object' ? cell : { v: cell };
        const at = ref(r, c);
        const st = o.s !== undefined ? ` s="${o.s}"` : (typeof o.v === 'number' ? ' s="0"' : '');
        if (o.f) {
          const v = typeof o.v === 'number' && isFinite(o.v) ? `<v>${o.v}</v>` : '';
          cells += `<c r="${at}"${st}><f>${xmlEsc(o.f)}</f>${v}</c>`;
        } else if (typeof o.v === 'number') {
          if (isFinite(o.v)) cells += `<c r="${at}"${st}><v>${o.v}</v></c>`;
        } else {
          cells += `<c r="${at}"${st} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(o.v)}</t></is></c>`;
        }
      });
      if (cells) xml += `<row r="${r + 1}">${cells}</row>`;
    });
    xml += '</sheetData></worksheet>';
    return xml;
  }

  function uniqueSheetName(name, used) {
    let base = String(name).replace(/[\[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet';
    let n = base, k = 2;
    while (used.has(n.toLowerCase())) { const suf = ' (' + k++ + ')'; n = base.slice(0, 31 - suf.length) + suf; }
    used.add(n.toLowerCase());
    return n;
  }

  /** sheets: [{name, rows, cols}] → Uint8Array .xlsx */
  function buildXlsx(sheets) {
    const used = new Set();
    const named = sheets.map((s) => Object.assign({}, s, { name: uniqueSheetName(s.name, used) }));
    const files = [];
    files.push({
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        named.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
        '</Types>'
    });
    files.push({
      name: '_rels/.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'
    });
    files.push({
      name: 'docProps/core.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        `<dc:title>${xmlEsc(sheets.title || 'Hasil TOPSIS')}</dc:title><dc:creator>${TOOL_NAME}</dc:creator>` +
        `<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>`
    });
    files.push({
      name: 'xl/workbook.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<bookViews><workbookView/></bookViews><sheets>' +
        named.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>'
    });
    files.push({
      name: 'xl/_rels/workbook.xml.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        named.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
    });
    files.push({ name: 'xl/styles.xml', data: STYLES_XML });
    named.forEach((s, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) }));
    return zip(files);
  }

  /* ------------------------------------------------------------------ *
   * Baca .xlsx (untuk impor data) — ZIP + DecompressionStream, tanpa pustaka
   * ------------------------------------------------------------------ */

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream !== 'function') throw new Error('Browser ini belum bisa membaca .xlsx. Simpan sebagai CSV atau salin-tempel tabelnya.');
    const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(ds).arrayBuffer());
  }

  function unzipIndex(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Berkas bukan .xlsx yang valid.');
    const count = dv.getUint16(eocd + 10, true);
    let off = dv.getUint32(eocd + 16, true);
    const dec = new TextDecoder();
    const files = {};
    for (let k = 0; k < count; k++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      const method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true);
      const nlen = dv.getUint16(off + 28, true), elen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true), lho = dv.getUint32(off + 42, true);
      files[dec.decode(u8.subarray(off + 46, off + 46 + nlen))] = { method, csize, lho };
      off += 46 + nlen + elen + clen;
    }
    async function read(name) {
      const f = files[name];
      if (!f) return null;
      const start = f.lho + 30 + dv.getUint16(f.lho + 26, true) + dv.getUint16(f.lho + 28, true);
      const data = u8.subarray(start, start + f.csize);
      if (f.method === 0) return dec.decode(data);
      if (f.method === 8) return dec.decode(await inflateRaw(data));
      throw new Error('Metode kompresi .xlsx tidak didukung.');
    }
    return { files, read };
  }

  /** Baca sheet "Data" (atau sheet pertama) sebagai grid. Sel angka tetap number. */
  async function readXlsx(buf) {
    const z = unzipIndex(buf);
    const parse = (s) => new DOMParser().parseFromString(s, 'application/xml');
    const tags = (doc, name) => Array.from(doc.getElementsByTagNameNS('*', name));
    const wbText = await z.read('xl/workbook.xml');
    if (!wbText) throw new Error('Berkas bukan .xlsx yang valid.');
    const wb = parse(wbText);
    const rels = parse((await z.read('xl/_rels/workbook.xml.rels')) || '<Relationships/>');
    const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const sheets = tags(wb, 'sheet').map((s) => ({ name: s.getAttribute('name') || '', rid: s.getAttributeNS(R_NS, 'id') || s.getAttribute('r:id') }));
    if (!sheets.length) throw new Error('Tidak ada sheet di berkas ini.');
    const target = (rid) => {
      const r = tags(rels, 'Relationship').find((x) => x.getAttribute('Id') === rid);
      let t = r ? r.getAttribute('Target') : null;
      if (!t) return null;
      t = t.replace(/^\//, '');
      return t.startsWith('xl/') ? t : 'xl/' + t;
    };
    const pick = sheets.find((s) => /^\s*(data|matriks|matriks keputusan)\s*$/i.test(s.name)) || sheets[0];
    const ssText = await z.read('xl/sharedStrings.xml');
    const shared = ssText ? tags(parse(ssText), 'si').map((si) => tags(si, 't').map((t) => t.textContent).join('')) : [];
    const path = target(pick.rid) || 'xl/worksheets/sheet1.xml';
    const sheetText = await z.read(path);
    if (!sheetText) throw new Error('Sheet "' + pick.name + '" tidak dapat dibaca.');
    const grid = [];
    for (const c of tags(parse(sheetText), 'c')) {
      const m = /^([A-Z]+)(\d+)$/.exec(c.getAttribute('r') || '');
      if (!m) continue;
      const col = m[1].split('').reduce((s, ch) => s * 26 + ch.charCodeAt(0) - 64, 0) - 1, row = Number(m[2]) - 1;
      const t = c.getAttribute('t');
      const vEl = tags(c, 'v')[0];
      const v = vEl ? vEl.textContent : null;
      let val;
      if (t === 's') val = shared[Number(v)] || '';
      else if (t === 'inlineStr') val = tags(c, 't').map((x) => x.textContent).join('');
      else if (t === 'str' || t === 'e') val = v || '';
      else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
      else val = v === null || v === '' ? '' : Number(v);
      (grid[row] = grid[row] || [])[col] = val;
    }
    const out = [];
    for (let i = 0; i < grid.length; i++) {
      const r = grid[i] || [];
      const row = [];
      for (let j = 0; j < r.length; j++) row.push(r[j] === undefined ? '' : r[j]);
      out.push(row);
    }
    return { sheet: pick.name, sheets: sheets.map((s) => s.name), grid: out };
  }

  /* ------------------------------------------------------------------ *
   * Isi workbook dari laporan (rumus hidup)
   * ------------------------------------------------------------------ */

  const th = (v) => ({ v, s: S.th });
  const td = (v) => ({ v, s: S.td });
  const tdb = (v) => ({ v, s: S.tdb });
  const n4 = (v) => ({ v, s: S.n4 });
  const fx = (f, v, s) => ({ f, v, s: s === undefined ? S.n4 : s });
  const qs = (name) => "'" + String(name).replace(/'/g, "''") + "'";
  const sref = (sheet, r, c, aC, aR) => qs(sheet) + '!' + ref(r, c, aC, aR);
  const rng = (r1, c1, r2, c2, abs) => ref(r1, c1, abs, abs) + ':' + ref(r2, c2, abs, abs);
  const srng = (sheet, r1, c1, r2, c2) => qs(sheet) + '!' + rng(r1, c1, r2, c2, true);

  const NORM_XL = {
    vector: 'Normalisasi vektor: r = x / √(Σx²)',
    linear: 'Normalisasi linear: r = x / maks |x|',
    minmax: 'Normalisasi min–maks: r = (x − min) / (maks − min)',
    sum: 'Normalisasi jumlah: r = x / Σx'
  };

  function workbookFromReport(R) {
    const p = R.project, c = R.comp, res = c.res, wInfo = c.weights;
    const crit = p.criteria, alts = p.alternatives;
    const n = crit.length, m = alts.length;
    const X = c.X, w = res.w;
    const method = wInfo.method;
    const DATA = 'Data', CALC = 'Perhitungan';
    const sheets = [];
    const bestIdx = res.order[0];

    // --- Ringkasan (statis)
    const rs = [];
    rs.push([{ v: p.meta.title, s: S.title }]);
    rs.push([{ v: 'Laporan TOPSIS — ' + R.dateLabel, s: S.note }]);
    rs.push([]);
    const meta = [];
    if (p.meta.author) meta.push(['Disusun oleh', p.meta.author]);
    meta.push(['Metode bobot', M.WEIGHT_METHODS[method].short], ['Normalisasi', T.NORMALIZATIONS[res.normalization].label], ['Jarak', 'Euclidean'], ['Jumlah kriteria', n], ['Jumlah alternatif', m]);
    if (method === 'ahp' && wInfo.info) meta.push(['CR perbandingan AHP', +wInfo.info.CR.toFixed(6)]);
    meta.forEach(([k, v]) => rs.push([{ v: k, s: S.bold }, typeof v === 'number' ? { v, s: S.normal } : v]));
    rs.push([]);
    rs.push([{ v: R.conclusion, s: S.bold }]);
    rs.push([]);
    rs.push([th('Peringkat'), th('Alternatif'), th('D+'), th('D−'), th('C*')]);
    res.order.forEach((i) => {
      const best = i === bestIdx;
      rs.push([{ v: res.rank[i], s: S.int }, best ? tdb(alts[i].name) : td(alts[i].name), n4(res.Dpos[i]), n4(res.Dneg[i]), { v: res.C[i], s: best ? S.n4b : S.n4 }]);
    });
    rs.push([{ v: 'Nilai di sheet ini statis (saat diunduh). Perhitungan lengkap dengan rumus ada di sheet "Perhitungan"; ubah nilai di sheet "Data" untuk menghitung ulang.', s: S.note }]);
    rs.push([]);
    rs.push([th('Kriteria'), th('Jenis'), th('Satuan'), th('Bobot (w)')]);
    crit.forEach((k, j) => rs.push([td(k.name), td(k.type === 'cost' ? 'Cost' : 'Benefit'), td(k.unit || ''), { v: w[j], s: S.pct }]));
    rs.push([]);
    rs.push([{ v: `Dihitung dengan ${TOOL_NAME} — ${TOOL_URL}`, s: S.note }]);
    sheets.push({ name: 'Ringkasan', rows: rs, cols: [26, 34, 14, 14, 14] });

    // --- Data (bisa diimpor kembali)
    const ds = [];
    ds.push([th('Alternatif')].concat(crit.map((k) => th(k.name))));
    ds.push([tdb('Jenis')].concat(crit.map((k) => td(k.type === 'cost' ? 'Cost' : 'Benefit'))));
    ds.push([tdb('Bobot')].concat(crit.map((k, j) => ({ v: method === 'manual' ? k.weight : +(w[j] * 100).toPrecision(12), s: S.td }))));
    ds.push([tdb('Satuan')].concat(crit.map((k) => td(k.unit || ''))));
    alts.forEach((a, i) => ds.push([td(a.name)].concat(crit.map((k, j) => ({ v: X[i][j], s: S.td })))));
    sheets.push({ name: DATA, rows: ds, cols: [28].concat(crit.map(() => 16)) });
    const dataCell = (i, j, abs) => sref(DATA, 4 + i, 1 + j, abs, abs);
    const dataCol = (j) => srng(DATA, 4, 1 + j, 3 + m, 1 + j);
    const dataType = (j) => sref(DATA, 1, 1 + j, true, true);

    // --- Lembar bobot (rumus) bila metode objektif / AHP
    let weightRef = null, rawLabel = 'Bobot awal (sheet Data)';
    const header = (corner) => [th(corner)].concat(crit.map((k) => th(k.name)));
    if (method === 'entropy') {
      const SH = 'Bobot Entropy';
      const e = wInfo.info;
      const rows = [];
      rows.push([{ v: 'Pembobotan Entropy (Shannon)', s: S.title }]);
      rows.push([{ v: 'p = x / Σx;  e = −(1/ln m) Σ p·ln p;  d = 1 − e;  w = d / Σd.  Nilai x diambil dari sheet Data.', s: S.note }]);
      rows.push([]);
      rows.push([{ v: '1. Jumlah nilai per kriteria', s: S.bold }]);
      rows.push(header(''));
      const rSum = rows.length;
      rows.push([td('Σx')].concat(crit.map((_, j) => fx(`SUM(${dataCol(j)})`, e.colSum[j]))));
      rows.push([]);
      rows.push([{ v: '2. Proporsi p = x / Σx', s: S.bold }]);
      rows.push(header('Alternatif'));
      const rP0 = rows.length;
      alts.forEach((a, i) => rows.push([td(a.name)].concat(crit.map((_, j) => { const s = ref(rSum, 1 + j, false, true); return fx(`IF(${s}=0,0,${dataCell(i, j)}/${s})`, e.P[i][j]); }))));
      rows.push([]);
      rows.push([{ v: '3. p · ln p', s: S.bold }]);
      rows.push(header('Alternatif'));
      const rL0 = rows.length;
      alts.forEach((a, i) => rows.push([td(a.name)].concat(crit.map((_, j) => { const pc = ref(rP0 + i, 1 + j); const pv = e.P[i][j]; return fx(`IF(${pc}<=0,0,${pc}*LN(${pc}))`, pv > 0 ? pv * Math.log(pv) : 0); }))));
      rows.push([]);
      rows.push([{ v: '4. Entropi, derajat divergensi, dan bobot', s: S.bold }]);
      rows.push(header(''));
      const rE = rows.length;
      rows.push([td('e = −Σ(p ln p) / ln m')].concat(crit.map((_, j) => fx(`IF(${ref(rSum, 1 + j)}=0,1,-SUM(${rng(rL0, 1 + j, rL0 + m - 1, 1 + j)})/LN(${m}))`, e.E[j]))));
      const rD = rows.length;
      rows.push([td('d = 1 − e')].concat(crit.map((_, j) => fx(`1-${ref(rE, 1 + j)}`, e.D[j]))));
      const rWe = rows.length;
      const dRow = rng(rD, 1, rD, n, true);
      rows.push([tdb('w = d / Σd')].concat(crit.map((_, j) => fx(`IF(SUM(${dRow})=0,1/${n},${ref(rD, 1 + j)}/SUM(${dRow}))`, w[j], S.n4b))));
      sheets.push({ name: SH, rows, cols: [26].concat(crit.map(() => 16)) });
      weightRef = (j) => sref(SH, rWe, 1 + j);
      rawLabel = 'Bobot Entropy (sheet Bobot Entropy)';
    } else if (method === 'critic') {
      const SH = 'Bobot CRITIC';
      const k = wInfo.info;
      const rows = [];
      rows.push([{ v: 'Pembobotan CRITIC (Diakoulaki dkk., 1995)', s: S.title }]);
      rows.push([{ v: 'N = (x − min)/(maks − min) untuk benefit, (maks − x)/(maks − min) untuk cost; σ = simpangan baku sampel; r = korelasi Pearson; C = σ·Σ(1 − r); w = C / ΣC.', s: S.note }]);
      rows.push([]);
      rows.push([{ v: '1. Nilai minimum dan maksimum', s: S.bold }]);
      rows.push(header(''));
      const rMin = rows.length;
      rows.push([td('min')].concat(crit.map((_, j) => fx(`MIN(${dataCol(j)})`, k.mins[j], S.td))));
      const rMax = rows.length;
      rows.push([td('maks')].concat(crit.map((_, j) => fx(`MAX(${dataCol(j)})`, k.maxs[j], S.td))));
      rows.push([]);
      rows.push([{ v: '2. Matriks ternormalisasi N', s: S.bold }]);
      rows.push(header('Alternatif'));
      const rN0 = rows.length;
      alts.forEach((a, i) => rows.push([td(a.name)].concat(crit.map((_, j) => {
        const mn = ref(rMin, 1 + j, false, true), mx = ref(rMax, 1 + j, false, true), x = dataCell(i, j);
        return fx(`IF(${mx}-${mn}=0,0,IF(${dataType(j)}="Cost",(${mx}-${x})/(${mx}-${mn}),(${x}-${mn})/(${mx}-${mn})))`, k.N[i][j]);
      }))));
      const nCol = (j) => rng(rN0, 1 + j, rN0 + m - 1, 1 + j, true);
      rows.push([]);
      rows.push([{ v: '3. Simpangan baku (σ)', s: S.bold }]);
      rows.push(header(''));
      const rSig = rows.length;
      rows.push([td('σ')].concat(crit.map((_, j) => fx(`STDEV(${nCol(j)})`, k.sigma[j]))));
      rows.push([]);
      rows.push([{ v: '4. Matriks korelasi (r) dan konflik Σ(1 − r)', s: S.bold }]);
      rows.push(header('').concat([th('Σ(1 − r)')]));
      const rC0 = rows.length;
      crit.forEach((kk, j) => rows.push([td(kk.name)].concat(crit.map((_, l) => fx(`IFERROR(CORREL(${nCol(j)},${nCol(l)}),0)`, k.corr[j][l])), [fx(`${n}-SUM(${rng(rC0 + j, 1, rC0 + j, n)})`, T.sum(k.corr[j].map((r) => 1 - r)))])));
      rows.push([]);
      rows.push([{ v: '5. Jumlah informasi (C) dan bobot', s: S.bold }]);
      rows.push(header(''));
      const rCj = rows.length;
      rows.push([td('C = σ · Σ(1 − r)')].concat(crit.map((_, j) => fx(`${ref(rSig, 1 + j)}*${ref(rC0 + j, 1 + n)}`, k.C[j]))));
      const rWc = rows.length;
      const cRow = rng(rCj, 1, rCj, n, true);
      rows.push([tdb('w = C / ΣC')].concat(crit.map((_, j) => fx(`IF(SUM(${cRow})=0,1/${n},${ref(rCj, 1 + j)}/SUM(${cRow}))`, w[j], S.n4b))));
      sheets.push({ name: SH, rows, cols: [26].concat(crit.map(() => 16), [14]) });
      weightRef = (j) => sref(SH, rWc, 1 + j);
      rawLabel = 'Bobot CRITIC (sheet Bobot CRITIC)';
    } else if (method === 'ahp') {
      const SH = 'Bobot AHP';
      const a = wInfo.info;
      const rows = [];
      rows.push([{ v: 'Pembobotan AHP (perbandingan berpasangan kriteria)', s: S.title }]);
      rows.push([{ v: 'Segitiga atas = penilaian skala Saaty 1–9; segitiga bawah = 1/nilai (rumus). Bobot w = vektor eigen utama (nilai dari aplikasi); NCA, λ maks, CI, dan CR dihitung dengan rumus.' + (a.missing ? ` ${a.missing} penilaian kosong dilengkapi metode Harker.` : ''), s: S.note }]);
      rows.push([]);
      rows.push([{ v: '1. Matriks perbandingan berpasangan A', s: S.bold }]);
      rows.push(header(''));
      const rA0 = rows.length;
      crit.forEach((kk, i) => rows.push([td(kk.name)].concat(crit.map((_, j) => (i === j ? { v: 1, s: S.td } : i < j ? { v: a.full[i][j], s: S.n4 } : fx(`1/${ref(rA0 + j, 1 + i)}`, a.full[i][j]))))));
      const rSum = rows.length;
      rows.push([tdb('Jumlah kolom')].concat(crit.map((_, j) => fx(`SUM(${rng(rA0, 1 + j, rA0 + n - 1, 1 + j)})`, a.colSums[j]))));
      rows.push([]);
      rows.push([{ v: '2. Normalisasi kolom dan rata-rata baris (NCA)', s: S.bold }]);
      rows.push(header('').concat([th('Rata-rata baris')]));
      const rN0 = rows.length;
      crit.forEach((kk, i) => rows.push([td(kk.name)].concat(crit.map((_, j) => fx(`${ref(rA0 + i, 1 + j)}/${ref(rSum, 1 + j, false, true)}`, a.normalized[i][j])), [fx(`AVERAGE(${rng(rN0 + i, 1, rN0 + i, n)})`, a.nca[i])])));
      rows.push([]);
      rows.push([{ v: '3. Vektor eigen utama (w) dan uji konsistensi', s: S.bold }]);
      rows.push(header(''));
      const rW = rows.length;
      rows.push([tdb('w (vektor eigen)')].concat(crit.map((_, j) => ({ v: a.w[j], s: S.n4b }))));
      rows.push([]);
      rows.push([th('Kriteria'), th('A·w'), th('(A·w)/w')]);
      const rAw0 = rows.length;
      const wRowAbs = rng(rW, 1, rW, n, true);
      crit.forEach((kk, i) => rows.push([td(kk.name), fx(`SUMPRODUCT(${rng(rA0 + i, 1, rA0 + i, n)},${wRowAbs})`, a.Aw[i]), fx(`${ref(rAw0 + i, 1)}/${ref(rW, 1 + i, false, true)}`, a.cv[i])]));
      const rLam = rows.length;
      rows.push([tdb('λ maks'), fx(`AVERAGE(${rng(rAw0, 2, rAw0 + n - 1, 2)})`, a.lambdaMax)]);
      const rCI = rows.length;
      rows.push([tdb('CI = (λ maks − n)/(n − 1)'), fx(n > 2 ? `MAX(0,(${ref(rLam, 1)}-${n})/(${n}-1))` : '0', a.CI)]);
      const rRI = rows.length;
      rows.push([tdb('RI (Saaty)'), { v: a.RI, s: S.n4 }]);
      rows.push([tdb('CR = CI / RI'), fx(`IF(${ref(rRI, 1)}=0,0,${ref(rCI, 1)}/${ref(rRI, 1)})`, a.CR, S.n4b)]);
      rows.push([{ v: 'Penilaian dianggap konsisten bila CR ≤ 0,10.', s: S.note }]);
      sheets.push({ name: SH, rows, cols: [30].concat(crit.map(() => 15), [15]) });
      weightRef = (j) => sref(SH, rW, 1 + j);
      rawLabel = 'Bobot AHP (sheet Bobot AHP)';
    }

    // --- Perhitungan (rumus hidup)
    const cs = [];
    const norm = res.normalization;
    cs.push([{ v: 'Langkah perhitungan TOPSIS', s: S.title }]);
    cs.push([{ v: `${NORM_XL[norm]}. Sel berisi rumus: ubah nilai di sheet Data, seluruh langkah dihitung ulang otomatis.`, s: S.note }]);
    cs.push([]);
    cs.push([{ v: '1. Bobot kriteria', s: S.bold }]);
    cs.push(header('Kriteria'));
    const rType = cs.length;
    cs.push([td('Jenis')].concat(crit.map((k, j) => ({ f: dataType(j), v: k.type === 'cost' ? 'Cost' : 'Benefit', s: S.td }))));
    const rRaw = cs.length;
    cs.push([td(method === 'equal' ? 'Bobot awal (sama rata)' : rawLabel)].concat(crit.map((k, j) => {
      if (method === 'manual') return { f: sref(DATA, 2, 1 + j), v: k.weight, s: S.td };
      if (method === 'equal') return { v: 1, s: S.td };
      return fx(weightRef(j), w[j]);
    })));
    const rW = cs.length;
    const rawRow = rng(rRaw, 1, rRaw, n, true);
    cs.push([tdb('Bobot ternormalisasi w')].concat(crit.map((_, j) => fx(`${ref(rRaw, 1 + j)}/SUM(${rawRow})`, w[j], S.n4b))));
    cs.push([]);

    cs.push([{ v: '2. Matriks keputusan X', s: S.bold }]);
    cs.push([th('Alternatif')].concat(crit.map((k) => th(k.name + (k.unit ? ` (${k.unit})` : '')))));
    const rX0 = cs.length;
    alts.forEach((a, i) => cs.push([{ f: sref(DATA, 4 + i, 0), v: a.name, s: S.td }].concat(crit.map((_, j) => ({ f: dataCell(i, j), v: X[i][j], s: S.td })))));
    const xCol = (j) => rng(rX0, 1 + j, rX0 + m - 1, 1 + j, true);
    let rDiv = -1, rMin = -1, rMax = -1;
    const info = res.info;
    if (norm === 'minmax') {
      rMin = cs.length; cs.push([tdb('min')].concat(crit.map((_, j) => fx(`MIN(${xCol(j)})`, info[j].min, S.td))));
      rMax = cs.length; cs.push([tdb('maks')].concat(crit.map((_, j) => fx(`MAX(${xCol(j)})`, info[j].max, S.td))));
    } else {
      rDiv = cs.length;
      const lab = norm === 'vector' ? '√(Σx²)' : norm === 'linear' ? 'maks |x|' : 'Σx';
      cs.push([tdb(lab)].concat(crit.map((_, j) => {
        const f = norm === 'vector' ? `SQRT(SUMSQ(${xCol(j)}))` : norm === 'linear' ? `MAX(MAX(${xCol(j)}),-MIN(${xCol(j)}))` : `SUM(${xCol(j)})`;
        return fx(f, info[j].divisor);
      })));
    }
    cs.push([]);

    cs.push([{ v: '3. Matriks ternormalisasi R', s: S.bold }]);
    cs.push(header('Alternatif'));
    const rR0 = cs.length;
    alts.forEach((a, i) => cs.push([{ f: ref(rX0 + i, 0), v: a.name, s: S.td }].concat(crit.map((_, j) => {
      const x = ref(rX0 + i, 1 + j);
      let f;
      if (norm === 'minmax') { const mn = ref(rMin, 1 + j, false, true), mx = ref(rMax, 1 + j, false, true); f = `IF(${mx}-${mn}=0,0,(${x}-${mn})/(${mx}-${mn}))`; }
      else { const d = ref(rDiv, 1 + j, false, true); f = `IF(${d}=0,0,${x}/${d})`; }
      return fx(f, res.R[i][j]);
    }))));
    cs.push([]);

    cs.push([{ v: '4. Matriks ternormalisasi terbobot V = w × R', s: S.bold }]);
    cs.push(header('Alternatif'));
    const rV0 = cs.length;
    alts.forEach((a, i) => cs.push([{ f: ref(rX0 + i, 0), v: a.name, s: S.td }].concat(crit.map((_, j) => fx(`${ref(rR0 + i, 1 + j)}*${ref(rW, 1 + j, false, true)}`, res.V[i][j])))));
    cs.push([]);

    cs.push([{ v: '5. Solusi ideal positif (A+) dan negatif (A−)', s: S.bold }]);
    cs.push(header(''));
    const vCol = (j) => rng(rV0, 1 + j, rV0 + m - 1, 1 + j, true);
    const rAp = cs.length;
    cs.push([tdb('A+')].concat(crit.map((_, j) => fx(`IF(${ref(rType, 1 + j, false, true)}="Cost",MIN(${vCol(j)}),MAX(${vCol(j)}))`, res.Apos[j]))));
    const rAn = cs.length;
    cs.push([tdb('A−')].concat(crit.map((_, j) => fx(`IF(${ref(rType, 1 + j, false, true)}="Cost",MAX(${vCol(j)}),MIN(${vCol(j)}))`, res.Aneg[j]))));
    cs.push([]);

    cs.push([{ v: '6. Jarak ke solusi ideal, nilai preferensi, dan peringkat', s: S.bold }]);
    cs.push([th('Alternatif'), th('D+'), th('D−'), th('C*'), th('Peringkat')]);
    const rD0 = cs.length;
    const apRow = rng(rAp, 1, rAp, n, true), anRow = rng(rAn, 1, rAn, n, true);
    alts.forEach((a, i) => {
      const r = cs.length;
      const vRow = rng(rV0 + i, 1, rV0 + i, n);
      const dp = ref(r, 1), dn = ref(r, 2);
      const best = i === bestIdx;
      cs.push([{ f: ref(rX0 + i, 0), v: a.name, s: best ? S.tdb : S.td }, fx(`SQRT(SUMXMY2(${vRow},${apRow}))`, res.Dpos[i]), fx(`SQRT(SUMXMY2(${vRow},${anRow}))`, res.Dneg[i]),
        fx(`IF(${dp}+${dn}=0,0.5,${dn}/(${dp}+${dn}))`, res.C[i], best ? S.n4b : S.n4), fx(`RANK(${ref(r, 3)},${rng(rD0, 3, rD0 + m - 1, 3, true)},0)`, res.rank[i], S.int)]);
    });
    cs.push([{ v: 'D+ = √Σ(v − A+)²;  D− = √Σ(v − A−)²;  C* = D− / (D+ + D−). Peringkat 1 = C* terbesar.', s: S.note }]);
    sheets.push({ name: CALC, rows: cs, cols: [30].concat(crit.map(() => 15)) });

    // --- Sensitivitas (statis)
    if (R.sensitivity && R.sensitivity.length) {
      const ss = [];
      ss.push([{ v: 'Analisis sensitivitas bobot', s: S.title }]);
      ss.push([{ v: 'Bobot satu kriteria diubah 0–100%, bobot lain diskalakan proporsional. Rentang stabil = rentang bobot ketika alternatif peringkat 1 tidak berubah.', s: S.note }]);
      ss.push([]);
      ss.push([th('Kriteria'), th('Bobot saat ini'), th('Peringkat 1'), th('Batas bawah'), th('Batas atas'), th('Di bawah batas'), th('Di atas batas')]);
      for (const s of R.sensitivity) {
        const t = s.stability;
        ss.push([td(s.name), { v: t.x0, s: S.pct }, td(alts[t.top].name), { v: t.lo, s: S.pct }, { v: t.hi, s: S.pct }, td(t.loBy !== null ? alts[t.loBy].name : '—'), td(t.hiBy !== null ? alts[t.hiBy].name : '—')]);
      }
      for (const s of R.sensitivity) {
        ss.push([]);
        ss.push([{ v: `Kurva C* terhadap bobot ${s.name}`, s: S.bold }]);
        ss.push([th('Bobot')].concat(alts.map((a) => th(a.name))));
        for (let x = 0; x <= 20; x++) {
          const ww = T.adjustWeights(w, s.idx, x / 20);
          const C = R.evaluate(ww);
          ss.push([{ v: x / 20, s: S.pct }].concat(C.map((v) => n4(v))));
        }
      }
      sheets.push({ name: 'Sensitivitas', rows: ss, cols: [26, 14, 24, 13, 13, 24, 24].concat(alts.map(() => 14)) });
    }

    // --- Uji ketahanan (statis)
    if (R.normCompare) {
      const us = [];
      const methods = Object.keys(R.normCompare);
      us.push([{ v: 'Uji ketahanan hasil', s: S.title }]);
      us.push([]);
      us.push([{ v: '1. Perbandingan metode normalisasi (bobot sama)', s: S.bold }]);
      us.push([th('Alternatif')].concat(methods.map((k) => th('C* ' + T.NORMALIZATIONS[k].label)), methods.map((k) => th('Peringkat ' + T.NORMALIZATIONS[k].label))));
      alts.forEach((a, i) => us.push([td(a.name)].concat(methods.map((k) => n4(R.normCompare[k].C[i])), methods.map((k) => ({ v: R.normCompare[k].rank[i], s: S.int })))));
      us.push([tdb('Korelasi Spearman vs vektor')].concat(methods.map((k) => n4(R.normCompare[k].rho))));
      if (R.rankReversal && R.rankReversal.length) {
        us.push([]);
        us.push([{ v: '2. Uji rank reversal (hapus satu alternatif, bobot tetap)', s: S.bold }]);
        us.push([th('Alternatif dihapus'), th('Urutan baru'), th('Pasangan bertukar'), th('Peringkat 1 berubah?')]);
        for (const r of R.rankReversal) us.push([td(alts[r.removed].name), td(r.order.map((i) => alts[i].name).join(' > ')), { v: r.flips.length, s: S.int }, td(r.topChanged ? 'Ya' : 'Tidak')]);
      }
      sheets.push({ name: 'Uji ketahanan', rows: us, cols: [30].concat(methods.map(() => 16), methods.map(() => 14)) });
    }
    sheets.title = p.meta.title;
    return sheets;
  }

  /* ------------------------------------------------------------------ *
   * SVG → PNG
   * ------------------------------------------------------------------ */

  function svgToPng(svg, width, height, scale) {
    scale = scale || 2;
    return new Promise((resolve, reject) => {
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(width * scale);
          canvas.height = Math.round(height * scale);
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          const dataUrl = canvas.toDataURL('image/png');
          canvas.toBlob((b) => resolve({ blob: b, dataUrl, width: canvas.width, height: canvas.height }), 'image/png');
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gagal merender diagram ke PNG.')); };
      img.src = url;
    });
  }

  /* ------------------------------------------------------------------ *
   * PDF
   * ------------------------------------------------------------------ */

  // Helvetica bawaan PDF hanya mendukung WinAnsi; ganti simbol di luar itu.
  function pdfText(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/[\u2080-\u2089]+/g, (m) => '_' + Array.from(m).map((ch) => String(ch.charCodeAt(0) - 0x2080)).join(''))
      .replace(/√/g, 'akar').replace(/λ/g, 'lambda').replace(/Σ/g, 'jumlah ').replace(/σ/g, 'sigma').replace(/≤/g, '<=').replace(/≥/g, '>=')
      .replace(/→/g, '->').replace(/←/g, '<-').replace(/[↑↓↖]/g, '').replace(/−/g, '-').replace(/×/g, 'x')
      .replace(/✓/g, 'OK').replace(/✕/g, 'X').replace(/m²/g, 'm2')
      .replace(/[^\u0009\u000a\u000d -~ -ÿ–—‘’“”•…]/g, '?');
  }

  const NAVY = [55, 48, 163], INK = [24, 34, 48], MUTED = [100, 116, 139], LINE = [226, 232, 240], BRAND = [79, 70, 229], GOOD = [6, 95, 70], BAD = [176, 40, 40];

  const FORMULA_PDF = {
    vector: 'r_ij = x_ij / akar(x_1j² + x_2j² + ... + x_mj²)',
    linear: 'r_ij = x_ij / maks|x_j|',
    minmax: 'r_ij = (x_ij - min x_j) / (maks x_j - min x_j)',
    sum: 'r_ij = x_ij / (x_1j + x_2j + ... + x_mj)'
  };

  async function buildPdf(R, onProgress) {
    if (!(typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF)) throw new Error('Pustaka PDF belum termuat. Muat ulang halaman lalu coba lagi.');
    const { jsPDF } = window.jspdf;
    const autoTable = window.autoTable || (window.jspdf_autotable && window.jspdf_autotable.autoTable) || null;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const p = R.project, c = R.comp, res = c.res, wInfo = c.weights;
    const crit = p.criteria, alts = p.alternatives;
    const n = crit.length, m = alts.length;
    const fmt = R.fmt;
    const D = p.settings.decimals;
    const PW = 210, PH = 297, MG = 16, CW = PW - 2 * MG, BOTTOM = PH - 16;
    let y = MG;
    const tick = (msg) => { if (onProgress) onProgress(msg); };

    doc.setProperties({ title: p.meta.title, subject: 'Laporan TOPSIS', creator: TOOL_NAME + ' — ' + TOOL_URL });

    const ensure = (h) => { if (y + h > BOTTOM) { doc.addPage(); y = MG; } };
    const setFont = (size, style, color) => { doc.setFont('helvetica', style || 'normal'); doc.setFontSize(size); doc.setTextColor.apply(doc, color || INK); };
    let secNo = 0;
    const heading = (t) => {
      ensure(48);
      secNo++;
      y += 2;
      setFont(13, 'bold', NAVY);
      doc.text(pdfText(`${secNo}. ${t}`), MG, y + 4);
      doc.setDrawColor.apply(doc, BRAND);
      doc.setLineWidth(0.6);
      doc.line(MG, y + 6.5, MG + 14, y + 6.5);
      y += 11;
    };
    const sub = (t) => { ensure(40); setFont(10.5, 'bold', INK); doc.text(pdfText(t), MG, y + 3.5); y += 7; };
    const para = (t, size, color, style) => {
      setFont(size || 9.5, style || 'normal', color || INK);
      const lines = doc.splitTextToSize(pdfText(t), CW);
      const lh = (size || 9.5) * 0.42;
      for (const l of lines) { ensure(lh + 1); doc.text(l, MG, y + lh * 0.8); y += lh; }
      y += 2;
    };
    const formula = (t) => {
      setFont(9, 'italic', [49, 46, 129]);
      const lines = doc.splitTextToSize(pdfText(t), CW - 8);
      const h = lines.length * 4 + 4;
      ensure(h + 2);
      doc.setFillColor(238, 242, 255);
      doc.roundedRect(MG, y, CW, h, 1.5, 1.5, 'F');
      doc.text(lines, MG + 4, y + 4.6);
      y += h + 3;
    };
    const table = (head, body, opts) => {
      opts = opts || {};
      ensure(Math.min(42, 10 + Math.min(body.length, 3) * 6.5));
      const conf = Object.assign({
        startY: y, head: [head.map(pdfText)], body: body.map((r) => r.map((cell) => (typeof cell === 'object' && cell !== null ? Object.assign({}, cell, { content: pdfText(cell.content) }) : pdfText(cell)))),
        margin: { left: MG, right: MG, bottom: 18 }, theme: 'grid',
        styles: { font: 'helvetica', fontSize: opts.fontSize || 8.5, cellPadding: 1.5, lineColor: LINE, lineWidth: 0.15, textColor: INK, overflow: 'linebreak' },
        headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [247, 249, 252] },
        rowPageBreak: 'avoid'
      }, opts.extra || {});
      if (autoTable) autoTable(doc, conf); else doc.autoTable(conf);
      y = doc.lastAutoTable.finalY + 5;
    };
    const right = (from, count) => Object.fromEntries(Array.from({ length: count }, (_, k) => [from + k, { halign: 'right' }]));
    /** Tabel matriks alternatif × kriteria, dipecah per 6 kolom agar muat di A4. */
    const matrixTable = (corner, rowNames, getter, extraRows, boldRow) => {
      const per = 6;
      for (let s0 = 0; s0 < n; s0 += per) {
        const part = crit.slice(s0, s0 + per);
        const body = rowNames.map((nm, i) => [i === boldRow ? { content: nm, styles: { fontStyle: 'bold' } } : nm].concat(part.map((_, jj) => getter(i, s0 + jj))));
        for (const er of (extraRows || [])) body.push([{ content: er.label, styles: { fontStyle: 'bold' } }].concat(part.map((_, jj) => ({ content: er.get(s0 + jj), styles: { fontStyle: 'bold' } }))));
        table([corner].concat(part.map((k) => k.name)), body, { fontSize: 8, extra: { columnStyles: Object.assign({ 0: { cellWidth: Math.min(48, CW * 0.3) } }, right(1, part.length)) } });
      }
    };
    const image = async (chart, caption, maxH) => {
      if (!chart) return;
      const png = await svgToPng(chart.svg, chart.width, chart.height, 2);
      let w = CW, h = CW * chart.height / chart.width;
      const limit = maxH || (BOTTOM - MG - 14);
      if (h > limit) { w = w * limit / h; h = limit; }
      ensure(h + (caption ? 8 : 3));
      doc.addImage(png.dataUrl, 'PNG', MG + (CW - w) / 2, y, w, h, undefined, 'FAST');
      y += h + 2;
      if (caption) { setFont(8, 'italic', MUTED); const lines = doc.splitTextToSize(pdfText(caption), CW); doc.text(lines, PW / 2, y + 2.5, { align: 'center' }); y += lines.length * 3.4 + 3; }
    };
    const v = (x) => fmt.num(x, D);
    const altNames = alts.map((a) => a.name);
    const best = res.order[0];

    // --- Sampul ringkas
    doc.setFillColor.apply(doc, NAVY);
    doc.rect(0, 0, PW, 40, 'F');
    setFont(9, 'normal', [199, 210, 254]);
    doc.text('LAPORAN ANALISIS TOPSIS', MG, 13);
    setFont(17, 'bold', [255, 255, 255]);
    doc.text(doc.splitTextToSize(pdfText(p.meta.title), CW).slice(0, 2), MG, 22);
    setFont(9, 'normal', [224, 231, 255]);
    doc.text('Technique for Order of Preference by Similarity to Ideal Solution', MG, 34);
    y = 48;
    const metaRows = [
      ['Tanggal', R.dateLabel],
      ['Metode bobot', M.WEIGHT_METHODS[wInfo.method].short],
      ['Normalisasi', T.NORMALIZATIONS[res.normalization].label],
      ['Ukuran jarak', 'Euclidean'],
      ['Jumlah kriteria / alternatif', `${n} kriteria (${crit.filter((k) => k.type === 'benefit').length} benefit, ${crit.filter((k) => k.type === 'cost').length} cost) / ${m} alternatif`]
    ];
    if (p.meta.author) metaRows.unshift(['Disusun oleh', p.meta.author]);
    table(['Keterangan', 'Nilai'], metaRows, { extra: { columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold' } } } });
    if (p.meta.description) para(p.meta.description, 9.5, MUTED);
    para(R.conclusion, 10.5, NAVY, 'bold');
    for (const wmsg of c.warnings) para('Catatan: ' + wmsg, 9, BAD);

    tick('Hasil');
    heading('Hasil peringkat');
    table(['Peringkat', 'Alternatif', 'D+', 'D-', 'C*'], res.order.map((i) => [res.rank[i], i === best ? { content: alts[i].name, styles: { fontStyle: 'bold' } } : alts[i].name, v(res.Dpos[i]), v(res.Dneg[i]), i === best ? { content: v(res.C[i]), styles: { fontStyle: 'bold' } } : v(res.C[i])]),
      { extra: { columnStyles: { 0: { halign: 'center', cellWidth: 20 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } } } });
    para('C* (nilai preferensi / koefisien kedekatan relatif) berada di antara 0 dan 1. Makin besar C*, makin dekat alternatif ke solusi ideal positif dan makin jauh dari solusi ideal negatif. Nilai ini relatif terhadap kumpulan alternatif yang dibandingkan, bukan probabilitas.', 8.5, MUTED);
    await image(R.charts.closeness, 'Gambar: nilai preferensi C* tiap alternatif.', 95);
    await image(R.charts.distanceMap, 'Gambar: peta jarak. Sumbu datar = D+, sumbu tegak = D-; garis putus-putus = nilai C* yang sama.', 115);

    tick('Bobot');
    heading('Kriteria dan bobot');
    const rawW = wInfo.method === 'manual';
    table(['Kriteria', 'Jenis', 'Satuan'].concat(rawW ? ['Bobot awal'] : [], ['Bobot w']), crit.map((k, j) => [k.name, k.type === 'cost' ? 'Cost' : 'Benefit', k.unit || '-'].concat(rawW ? [fmt.num(k.weight, 2)] : [], [`${v(res.w[j])} (${fmt.pct(res.w[j], 2)})`])),
      { extra: { columnStyles: Object.assign({ 1: { cellWidth: 20 } }, right(3, rawW ? 2 : 1)) } });
    para(M.WEIGHT_METHODS[wInfo.method].text, 8.5, MUTED);
    await image(R.charts.weights, 'Gambar: bobot kriteria.', 90);
    if (wInfo.method === 'entropy' && wInfo.info) {
      const e = wInfo.info;
      sub('Rincian bobot Entropy');
      formula('p_ij = x_ij / jumlah_i x_ij;   e_j = -(1/ln m) jumlah_i p_ij ln p_ij;   d_j = 1 - e_j;   w_j = d_j / jumlah d');
      matrixTable('p_ij', altNames, (i, j) => fmt.num(e.P[i][j], D));
      table(['Kriteria', 'jumlah x', 'e_j', 'd_j', 'w_j'], crit.map((k, j) => [k.name, fmt.num(e.colSum[j], 4), v(e.E[j]), v(e.D[j]), v(e.w[j])]), { extra: { columnStyles: right(1, 4) } });
    } else if (wInfo.method === 'critic' && wInfo.info) {
      const k = wInfo.info;
      sub('Rincian bobot CRITIC');
      formula('N_ij = (x_ij - min_j)/(maks_j - min_j) untuk benefit, (maks_j - x_ij)/(maks_j - min_j) untuk cost;   C_j = sigma_j x jumlah_k (1 - r_jk);   w_j = C_j / jumlah C');
      matrixTable('N_ij', altNames, (i, j) => v(k.N[i][j]));
      sub('Matriks korelasi r_jk');
      matrixTable('r_jk', crit.map((x) => x.name), (i, j) => fmt.num(k.corr[i][j], 3));
      table(['Kriteria', 'sigma_j', 'jumlah (1 - r)', 'C_j', 'w_j'], crit.map((x, j) => [x.name, v(k.sigma[j]), v(T.sum(k.corr[j].map((r) => 1 - r))), v(k.C[j]), v(k.w[j])]), { extra: { columnStyles: right(1, 4) } });
    } else if (wInfo.method === 'ahp' && wInfo.info) {
      const a = wInfo.info;
      sub('Rincian bobot AHP');
      formula('Bobot w = vektor eigen utama matriks perbandingan A;  lambda maks = rata-rata (A·w)_i / w_i;  CI = (lambda maks - n)/(n - 1);  CR = CI / RI');
      matrixTable('A', crit.map((x) => x.name), (i, j) => fmt.judg(a.full[i][j]), [{ label: 'Jumlah', get: (j) => fmt.num(a.colSums[j], 4) }]);
      table(['Kriteria', 'Rata-rata baris (NCA)', 'w (eigen)', 'A·w', '(A·w)/w'], crit.map((x, i) => [x.name, v(a.nca[i]), v(a.w[i]), v(a.Aw[i]), v(a.cv[i])]), { extra: { columnStyles: right(1, 4) } });
      para(`lambda maks = ${v(a.lambdaMax)};  CI = ${v(a.CI)};  RI = ${fmt.num(a.RI, 2)};  CR = ${v(a.CR)} -> ${a.CR <= 0.1 ? 'konsisten (CR <= 0,10)' : 'TIDAK konsisten (CR > 0,10)'}.${a.missing ? ` ${a.missing} penilaian kosong dilengkapi metode Harker.` : ''}`, 9, a.CR <= 0.1 ? GOOD : BAD, 'bold');
    }

    tick('Langkah perhitungan');
    heading('Langkah perhitungan TOPSIS');
    sub('Langkah 1 — Matriks keputusan X');
    matrixTable('Alternatif', altNames, (i, j) => fmt.raw(c.X[i][j]), [{ label: 'Jenis', get: (j) => (crit[j].type === 'cost' ? 'Cost' : 'Benefit') }, { label: 'Bobot w', get: (j) => v(res.w[j]) }]);
    sub('Langkah 2 — Normalisasi matriks (R)');
    formula(FORMULA_PDF[res.normalization]);
    const ex = R.examples;
    if (ex) para('Contoh: ' + ex.norm, 8.5, MUTED);
    const divRows = res.normalization === 'minmax'
      ? [{ label: 'min', get: (j) => fmt.raw(res.info[j].min) }, { label: 'maks', get: (j) => fmt.raw(res.info[j].max) }]
      : [{ label: res.normalization === 'vector' ? 'akar(jumlah x²)' : res.normalization === 'linear' ? 'maks |x|' : 'jumlah x', get: (j) => v(res.info[j].divisor) }];
    matrixTable('Alternatif', altNames, (i, j) => v(res.R[i][j]), divRows);
    sub('Langkah 3 — Matriks ternormalisasi terbobot (V)');
    formula('v_ij = w_j x r_ij');
    if (ex) para('Contoh: ' + ex.weighted, 8.5, MUTED);
    matrixTable('Alternatif', altNames, (i, j) => v(res.V[i][j]));
    sub('Langkah 4 — Solusi ideal positif (A+) dan negatif (A-)');
    formula('A+_j = maks_i v_ij untuk benefit, min_i v_ij untuk cost;   A-_j = min_i v_ij untuk benefit, maks_i v_ij untuk cost');
    matrixTable('', ['A+', 'A-'], (i, j) => v(i === 0 ? res.Apos[j] : res.Aneg[j]), [{ label: 'Jenis', get: (j) => (crit[j].type === 'cost' ? 'Cost' : 'Benefit') }]);
    sub('Langkah 5 — Jarak ke solusi ideal dan nilai preferensi');
    formula('D+_i = akar( jumlah_j (v_ij - A+_j)² );   D-_i = akar( jumlah_j (v_ij - A-_j)² );   C*_i = D-_i / (D+_i + D-_i)');
    if (ex) para('Contoh: ' + ex.distance, 8.5, MUTED);
    table(['Alternatif', 'D+', 'D-', 'C*', 'Peringkat'], alts.map((a, i) => [a.name, v(res.Dpos[i]), v(res.Dneg[i]), v(res.C[i]), res.rank[i]]), { extra: { columnStyles: Object.assign(right(1, 3), { 4: { halign: 'center' } }) } });
    await image(R.charts.distanceBars, 'Gambar: jarak D+ dan D- tiap alternatif.', 100);

    tick('Profil');
    heading('Profil alternatif per kriteria');
    para('Nilai sel = (v_ij - A-_j) / (A+_j - A-_j): 1 berarti setara solusi ideal positif pada kriteria itu, 0 berarti setara solusi ideal negatif.', 8.5, MUTED);
    await image(R.charts.heatmap, 'Gambar: peta panas kinerja relatif per kriteria (baris diurutkan menurut peringkat).', 140);
    await image(R.charts.radar, 'Gambar: radar kinerja relatif alternatif teratas.', 120);

    if (R.sensitivity && R.sensitivity.length) {
      tick('Sensitivitas');
      heading('Analisis sensitivitas bobot');
      para('Bobot satu kriteria diubah dari 0% sampai 100% sementara bobot kriteria lain diskalakan proporsional. Rentang stabil adalah rentang bobot ketika alternatif peringkat pertama tidak berubah.', 9, MUTED);
      table(['Kriteria', 'Bobot saat ini', 'Peringkat 1', 'Rentang stabil', 'Pengganti di batas'], R.sensitivity.map((s) => {
        const t = s.stability;
        const repl = [t.loBy !== null ? `< ${fmt.pct(t.lo, 1)}: ${alts[t.loBy].name}` : null, t.hiBy !== null ? `> ${fmt.pct(t.hi, 1)}: ${alts[t.hiBy].name}` : null].filter(Boolean).join('; ') || 'Tidak berubah pada 0–100%';
        return [s.name, fmt.pct(t.x0, 1), alts[t.top].name, `${fmt.pct(t.lo, 1)} – ${fmt.pct(t.hi, 1)}`, repl];
      }), { fontSize: 8 });
      for (const s of R.sensitivity) await image(s.chart, `Gambar: sensitivitas C* terhadap bobot ${s.name}. Area biru muda = rentang stabil.`, 92);
    }

    if (R.normCompare) {
      tick('Uji ketahanan');
      heading('Uji ketahanan hasil');
      sub('Perbandingan metode normalisasi');
      const methods = Object.keys(R.normCompare);
      table(['Alternatif'].concat(methods.map((k) => T.NORMALIZATIONS[k].label)), alts.map((a, i) => [a.name].concat(methods.map((k) => `${R.normCompare[k].rank[i]}  (${fmt.num(R.normCompare[k].C[i], 4)})`))).concat([[{ content: 'Spearman vs vektor', styles: { fontStyle: 'bold' } }].concat(methods.map((k) => ({ content: fmt.num(R.normCompare[k].rho, 3), styles: { fontStyle: 'bold' } })))]),
        { fontSize: 8, extra: { columnStyles: right(1, methods.length) } });
      await image(R.charts.bump, 'Gambar: peringkat alternatif pada empat metode normalisasi.', 100);
      if (R.rankReversal && R.rankReversal.length) {
        sub('Uji rank reversal');
        para('Satu alternatif dihapus bergantian lalu TOPSIS dihitung ulang dengan bobot yang sama. "Pasangan bertukar" menghitung pasangan alternatif tersisa yang urutannya terbalik.', 8.5, MUTED);
        table(['Alternatif dihapus', 'Urutan baru', 'Pasangan bertukar', 'Peringkat 1 berubah?'], R.rankReversal.map((r) => [alts[r.removed].name, r.order.map((i) => alts[i].name).join(' > '), r.flips.length, { content: r.topChanged ? 'Ya' : 'Tidak', styles: { textColor: r.topChanged ? BAD : GOOD, fontStyle: 'bold' } }]), { fontSize: 8, extra: { columnStyles: { 2: { halign: 'center' }, 3: { halign: 'center' } } } });
      }
    }

    heading('Rujukan');
    for (const ref0 of R.references) para(ref0, 8.5, INK);
    para(`Dihitung dengan ${TOOL_NAME} (${TOOL_URL}). Semua perhitungan berjalan di browser pengguna.`, 8.5, MUTED);

    // --- Footer & nomor halaman
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setDrawColor.apply(doc, LINE);
      doc.setLineWidth(0.2);
      doc.line(MG, PH - 12, PW - MG, PH - 12);
      setFont(7.5, 'normal', MUTED);
      doc.text(pdfText(`Dihitung dengan ${TOOL_NAME} — ${TOOL_URL}`), MG, PH - 8);
      doc.text(`${i} / ${pages}`, PW - MG, PH - 8, { align: 'right' });
    }
    return doc.output('blob');
  }

  /* ------------------------------------------------------------------ *
   * Laporan Word (.docx) — dapat disunting untuk Bab IV skripsi
   * ------------------------------------------------------------------ */

  const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

  const DOCX_STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ' + W_NS + '>' +
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="id-ID"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="312E81"/><w:sz w:val="36"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="312E81"/><w:sz w:val="28"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/><w:spacing w:after="200"/></w:pPr><w:rPr><w:i/><w:color w:val="475569"/><w:sz w:val="20"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Rumus"><w:name w:val="Rumus"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="EEF2FF"/><w:spacing w:before="60" w:after="120"/><w:ind w:left="284"/></w:pPr><w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/><w:color w:val="1E1B4B"/><w:sz w:val="22"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Catatan"><w:name w:val="Catatan"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/><w:color w:val="475569"/><w:sz w:val="20"/></w:rPr></w:style>' +
    '<w:style w:type="table" w:styleId="TabelData"><w:name w:val="Tabel Data"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:color="CBD5E1"/><w:insideV w:val="single" w:sz="4" w:color="CBD5E1"/></w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
    '</w:styles>';

  async function buildDocx(R, onProgress) {
    const p = R.project, c = R.comp, res = c.res, wInfo = c.weights;
    const crit = p.criteria, alts = p.alternatives;
    const n = crit.length;
    const fmt = R.fmt, D = p.settings.decimals;
    const v = (x) => fmt.num(x, D);
    const tick = (msg) => { if (onProgress) onProgress(msg); };
    const body = [];
    const media = [];
    let figNo = 0, tabNo = 0;
    const run = (t, o) => {
      o = o || {};
      const pr = (o.b ? '<w:b/>' : '') + (o.i ? '<w:i/>' : '') + (o.color ? `<w:color w:val="${o.color}"/>` : '') + (o.sz ? `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>` : '');
      return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r>`;
    };
    const para = (t, o) => { o = o || {}; body.push(`<w:p>${o.style || o.jc ? `<w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}${o.jc ? `<w:jc w:val="${o.jc}"/>` : ''}</w:pPr>` : ''}${run(t, o)}</w:p>`); };
    const h1 = (t) => para(t, { style: 'Heading1' });
    const h2 = (t) => para(t, { style: 'Heading2' });
    const isNum = (t) => /^[-−]?[\d.,/]+%?( \(.*\))?$/.test(String(t));
    const table = (caption, head, rows, boldRows) => {
      tabNo++;
      para(`Tabel ${tabNo}. ${caption}`, { style: 'Caption' });
      const cell = (t, hdr, right, bold) => `<w:tc><w:tcPr>${hdr ? '<w:shd w:val="clear" w:color="auto" w:fill="3730A3"/>' : bold ? '<w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>' : ''}<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:before="20" w:after="20" w:line="240" w:lineRule="auto"/>${right ? '<w:jc w:val="right"/>' : ''}</w:pPr>${run(String(t), hdr ? { b: true, color: 'FFFFFF', sz: 18 } : { sz: 18, b: bold })}</w:p></w:tc>`;
      let x = '<w:tbl><w:tblPr><w:tblStyle w:val="TabelData"/><w:tblW w:w="5000" w:type="pct"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>';
      x += `<w:tblGrid>${head.map(() => '<w:gridCol/>').join('')}</w:tblGrid>`;
      const colRight = head.map((_, i) => i > 0 && rows.length > 0 && isNum(rows[0][i]));
      x += `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${head.map((h, i) => cell(h, true, colRight[i])).join('')}</w:tr>`;
      rows.forEach((r, ri) => { const bold = boldRows && boldRows.includes(ri); x += `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((t, i) => cell(t, false, i > 0 && isNum(t), bold)).join('')}</w:tr>`; });
      x += '</w:tbl>';
      body.push(x);
      body.push('<w:p><w:pPr><w:spacing w:after="60"/></w:pPr></w:p>');
    };
    /** Tabel alternatif × kriteria, dipecah per 7 kolom agar muat di halaman. */
    const matrixTable = (caption, corner, rowNames, getter, extraRows) => {
      const per = 7;
      for (let s0 = 0; s0 < n; s0 += per) {
        const part = crit.slice(s0, s0 + per);
        const rows = rowNames.map((nm, i) => [nm].concat(part.map((_, jj) => getter(i, s0 + jj))));
        const bold = [];
        for (const er of (extraRows || [])) { bold.push(rows.length); rows.push([er.label].concat(part.map((_, jj) => er.get(s0 + jj)))); }
        table(caption + (n > per ? ` (kriteria ${s0 + 1}–${s0 + part.length})` : ''), [corner].concat(part.map((k) => k.name)), rows, bold);
      }
    };
    const image = async (chart, caption) => {
      if (!chart) return;
      const png = await svgToPng(chart.svg, chart.width, chart.height, 2);
      const bytes = new Uint8Array(await png.blob.arrayBuffer());
      media.push(bytes);
      const id = media.length;
      let cx = Math.round(15 * 360000), cy = Math.round(cx * chart.height / chart.width);
      const maxCy = Math.round(20 * 360000);
      if (cy > maxCy) { cx = Math.round(cx * maxCy / cy); cy = maxCy; }
      body.push(`<w:p><w:pPr><w:keepNext/><w:jc w:val="center"/><w:spacing w:before="120" w:after="40"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Gambar ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="gambar${id}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`);
      figNo++;
      para(`Gambar ${figNo}. ${caption}`, { style: 'Caption' });
    };
    const altNames = alts.map((a) => a.name);
    const typeRow = { label: 'Jenis', get: (j) => (crit[j].type === 'cost' ? 'Cost' : 'Benefit') };

    // --- Judul & identitas
    para(p.meta.title, { style: 'Title' });
    para('Laporan analisis TOPSIS (Technique for Order of Preference by Similarity to Ideal Solution)', { color: '475569' });
    const meta = [['Tanggal', R.dateLabel], ['Metode bobot', M.WEIGHT_METHODS[wInfo.method].short], ['Normalisasi', T.NORMALIZATIONS[res.normalization].label], ['Ukuran jarak', 'Euclidean'], ['Kriteria / alternatif', `${n} kriteria / ${alts.length} alternatif`]];
    if (p.meta.author) meta.unshift(['Disusun oleh', p.meta.author]);
    table('Identitas analisis', ['Keterangan', 'Nilai'], meta);
    if (p.meta.description) para(p.meta.description);
    para(R.conclusion, { b: true, color: '312E81' });
    for (const wmsg of c.warnings) para('Catatan: ' + wmsg, { color: 'B42318' });

    tick('Hasil');
    h1('1. Hasil peringkat');
    table('Peringkat alternatif berdasarkan nilai preferensi C*', ['Peringkat', 'Alternatif', 'D+', 'D−', 'C*'], res.order.map((i) => [res.rank[i], alts[i].name, v(res.Dpos[i]), v(res.Dneg[i]), v(res.C[i])]), [0]);
    para('C* (nilai preferensi) berada di antara 0 dan 1. Makin besar C*, makin dekat alternatif ke solusi ideal positif dan makin jauh dari solusi ideal negatif.');
    await image(R.charts.closeness, 'Nilai preferensi C* tiap alternatif');
    await image(R.charts.distanceMap, 'Peta jarak D+ (sumbu datar) dan D− (sumbu tegak); garis putus-putus = nilai C* yang sama');

    tick('Bobot');
    h1('2. Kriteria dan bobot');
    table('Kriteria, jenis, dan bobot', ['Kriteria', 'Jenis', 'Satuan'].concat(wInfo.method === 'manual' ? ['Bobot awal'] : [], ['Bobot w']), crit.map((k, j) => [k.name, k.type === 'cost' ? 'Cost' : 'Benefit', k.unit || '–'].concat(wInfo.method === 'manual' ? [fmt.raw(k.weight)] : [], [v(res.w[j])])));
    para(M.WEIGHT_METHODS[wInfo.method].text);
    await image(R.charts.weights, 'Bobot kriteria');
    if (wInfo.method === 'entropy' && wInfo.info) {
      const e = wInfo.info;
      h2('Rincian bobot Entropy');
      para('pᵢⱼ = xᵢⱼ / Σᵢ xᵢⱼ;   eⱼ = −(1/ln m) Σᵢ pᵢⱼ ln pᵢⱼ;   dⱼ = 1 − eⱼ;   wⱼ = dⱼ / Σd', { style: 'Rumus' });
      matrixTable('Proporsi p dan bobot Entropy', 'p', altNames, (i, j) => v(e.P[i][j]), [{ label: 'Σx', get: (j) => fmt.raw(e.colSum[j]) }, { label: 'e', get: (j) => v(e.E[j]) }, { label: 'd = 1 − e', get: (j) => v(e.D[j]) }, { label: 'w', get: (j) => v(e.w[j]) }]);
    } else if (wInfo.method === 'critic' && wInfo.info) {
      const k = wInfo.info;
      h2('Rincian bobot CRITIC');
      para('Nᵢⱼ = (x − min)/(maks − min) untuk benefit, (maks − x)/(maks − min) untuk cost;   Cⱼ = σⱼ Σₖ (1 − rⱼₖ);   wⱼ = Cⱼ / ΣC', { style: 'Rumus' });
      matrixTable('Matriks ternormalisasi N dan bobot CRITIC', 'N', altNames, (i, j) => v(k.N[i][j]), [{ label: 'σ', get: (j) => v(k.sigma[j]) }, { label: 'Σ(1 − r)', get: (j) => v(T.sum(k.corr[j].map((r) => 1 - r))) }, { label: 'C', get: (j) => v(k.C[j]) }, { label: 'w', get: (j) => v(k.w[j]) }]);
      matrixTable('Matriks korelasi r antar kriteria', 'r', crit.map((x) => x.name), (i, j) => fmt.num(k.corr[i][j], 3));
    } else if (wInfo.method === 'ahp' && wInfo.info) {
      const a = wInfo.info;
      h2('Rincian bobot AHP');
      para('w = vektor eigen utama matriks A;   λmaks = rata-rata (A·w)ᵢ / wᵢ;   CI = (λmaks − n)/(n − 1);   CR = CI / RI', { style: 'Rumus' });
      matrixTable('Matriks perbandingan berpasangan kriteria', 'A', crit.map((x) => x.name), (i, j) => fmt.judg(a.full[i][j]), [{ label: 'Jumlah', get: (j) => fmt.num(a.colSums[j], 4) }]);
      table('Bobot AHP dan uji konsistensi', ['Kriteria', 'Rata-rata baris (NCA)', 'w (eigen)', 'A·w', '(A·w)/w'], crit.map((x, i) => [x.name, v(a.nca[i]), v(a.w[i]), v(a.Aw[i]), v(a.cv[i])]));
      para(`λmaks = ${v(a.lambdaMax)}; CI = ${v(a.CI)}; RI = ${fmt.num(a.RI, 2)}; CR = ${v(a.CR)} → ${a.CR <= 0.1 ? 'konsisten (CR ≤ 0,10)' : 'belum konsisten (CR > 0,10)'}.`, { b: true });
    }

    tick('Langkah perhitungan');
    h1('3. Langkah perhitungan TOPSIS');
    const ex = R.examples;
    h2('Langkah 1 — Matriks keputusan (X)');
    matrixTable('Matriks keputusan', 'Alternatif', altNames, (i, j) => fmt.raw(c.X[i][j]), [typeRow, { label: 'Bobot w', get: (j) => v(res.w[j]) }]);
    h2('Langkah 2 — Normalisasi matriks (R)');
    para({ vector: 'rᵢⱼ = xᵢⱼ / √(Σᵢ xᵢⱼ²)', linear: 'rᵢⱼ = xᵢⱼ / maksᵢ |xᵢⱼ|', minmax: 'rᵢⱼ = (xᵢⱼ − minᵢ xᵢⱼ) / (maksᵢ xᵢⱼ − minᵢ xᵢⱼ)', sum: 'rᵢⱼ = xᵢⱼ / Σᵢ xᵢⱼ' }[res.normalization], { style: 'Rumus' });
    if (ex) para('Contoh: ' + ex.norm, { style: 'Catatan' });
    const divRows = res.normalization === 'minmax'
      ? [{ label: 'min', get: (j) => fmt.raw(res.info[j].min) }, { label: 'maks', get: (j) => fmt.raw(res.info[j].max) }]
      : [{ label: T.NORMALIZATIONS[res.normalization].divisorLabel, get: (j) => v(res.info[j].divisor) }];
    matrixTable('Matriks ternormalisasi R', 'Alternatif', altNames, (i, j) => v(res.R[i][j]), divRows);
    h2('Langkah 3 — Matriks ternormalisasi terbobot (V)');
    para('vᵢⱼ = wⱼ × rᵢⱼ', { style: 'Rumus' });
    if (ex) para('Contoh: ' + ex.weighted, { style: 'Catatan' });
    matrixTable('Matriks ternormalisasi terbobot V', 'Alternatif', altNames, (i, j) => v(res.V[i][j]));
    h2('Langkah 4 — Solusi ideal positif (A+) dan negatif (A−)');
    para('A+ⱼ = maksᵢ vᵢⱼ (benefit) atau minᵢ vᵢⱼ (cost);   A−ⱼ = minᵢ vᵢⱼ (benefit) atau maksᵢ vᵢⱼ (cost)', { style: 'Rumus' });
    matrixTable('Solusi ideal positif dan negatif', '', ['A+', 'A−'], (i, j) => v(i === 0 ? res.Apos[j] : res.Aneg[j]), [typeRow]);
    h2('Langkah 5 — Jarak ke solusi ideal dan nilai preferensi');
    para('D+ᵢ = √Σⱼ (vᵢⱼ − A+ⱼ)²;   D−ᵢ = √Σⱼ (vᵢⱼ − A−ⱼ)²;   C*ᵢ = D−ᵢ / (D+ᵢ + D−ᵢ)', { style: 'Rumus' });
    if (ex) para('Contoh: ' + ex.distance, { style: 'Catatan' });
    table('Jarak, nilai preferensi, dan peringkat', ['Alternatif', 'D+', 'D−', 'C*', 'Peringkat'], alts.map((a, i) => [a.name, v(res.Dpos[i]), v(res.Dneg[i]), v(res.C[i]), res.rank[i]]));
    await image(R.charts.distanceBars, 'Jarak D+ dan D− tiap alternatif');

    tick('Profil');
    h1('4. Profil alternatif per kriteria');
    para('Nilai sel = (vᵢⱼ − A−ⱼ) / (A+ⱼ − A−ⱼ): 1 berarti setara solusi ideal positif pada kriteria itu, 0 berarti setara solusi ideal negatif.');
    await image(R.charts.heatmap, 'Peta panas kinerja relatif per kriteria (baris diurutkan menurut peringkat)');
    await image(R.charts.radar, 'Radar kinerja relatif alternatif teratas');

    if (R.sensitivity && R.sensitivity.length) {
      tick('Sensitivitas');
      h1('5. Analisis sensitivitas bobot');
      para('Bobot satu kriteria diubah dari 0% sampai 100% sementara bobot kriteria lain diskalakan proporsional. Rentang stabil adalah rentang bobot ketika alternatif peringkat pertama tidak berubah.');
      table('Rentang stabil bobot tiap kriteria', ['Kriteria', 'Bobot saat ini', 'Peringkat 1', 'Rentang stabil', 'Pengganti di batas'], R.sensitivity.map((s) => {
        const t = s.stability;
        const repl = [t.loBy !== null ? `< ${fmt.pct(t.lo, 1)}: ${alts[t.loBy].name}` : null, t.hiBy !== null ? `> ${fmt.pct(t.hi, 1)}: ${alts[t.hiBy].name}` : null].filter(Boolean).join('; ') || 'Tidak berubah pada 0–100%';
        return [s.name, fmt.pct(t.x0, 1), alts[t.top].name, `${fmt.pct(t.lo, 1)} – ${fmt.pct(t.hi, 1)}`, repl];
      }));
      for (const s of R.sensitivity) await image(s.chart, `Sensitivitas C* terhadap bobot ${s.name}; area biru muda = rentang stabil`);
    }

    if (R.normCompare) {
      tick('Uji ketahanan');
      h1('6. Uji ketahanan hasil');
      const methods = Object.keys(R.normCompare);
      table('Peringkat (dan C*) pada empat metode normalisasi', ['Alternatif'].concat(methods.map((k) => T.NORMALIZATIONS[k].label)), alts.map((a, i) => [a.name].concat(methods.map((k) => `${R.normCompare[k].rank[i]} (${fmt.num(R.normCompare[k].C[i], 4)})`))).concat([['Spearman vs vektor'].concat(methods.map((k) => fmt.num(R.normCompare[k].rho, 3)))]), [alts.length]);
      await image(R.charts.bump, 'Peringkat alternatif pada empat metode normalisasi');
      if (R.rankReversal && R.rankReversal.length) {
        table('Uji rank reversal (hapus satu alternatif, bobot tetap)', ['Alternatif dihapus', 'Urutan baru', 'Pasangan bertukar', 'Peringkat 1 berubah?'], R.rankReversal.map((r) => [alts[r.removed].name, r.order.map((i) => alts[i].name).join(' > '), r.flips.length, r.topChanged ? 'Ya' : 'Tidak']));
      }
    }

    h1('Rujukan');
    for (const ref0 of R.references) para(ref0);
    para(`Dihitung dengan ${TOOL_NAME} (${TOOL_URL}).`, { color: '64748B', sz: 20 });

    const docXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + W_NS + '><w:body>' + body.join('') +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1701" w:right="1701" w:bottom="1701" w:left="2268" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>';
    const files = [
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
      { name: 'docProps/core.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' + `<dc:title>${xmlEsc(p.meta.title)}</dc:title><dc:creator>${xmlEsc(p.meta.author || TOOL_NAME)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>` },
      { name: 'word/document.xml', data: docXml },
      { name: 'word/styles.xml', data: DOCX_STYLES },
      { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' + media.map((_, k) => `<Relationship Id="rIdImg${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/gambar${k + 1}.png"/>`).join('') + '</Relationships>' }
    ];
    media.forEach((bytes, k) => files.push({ name: `word/media/gambar${k + 1}.png`, data: bytes }));
    return zip(files);
  }

  return {
    TOOL_URL, TOOL_NAME, download, safeFileName, csvString, resultRows,
    crc32, zip, buildXlsx, readXlsx, unzipIndex, workbookFromReport, svgToPng, buildPdf, buildDocx, pdfText
  };
}));
