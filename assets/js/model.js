/*!
 * TOPSIS Decision Engine — model proyek, contoh kasus, impor data, perhitungan proyek
 * (c) 2026 Alfredo Garcia — MIT License
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./topsis-core.js'));
  else root.TopsisModel = factory(root.TopsisCore);
}(typeof self !== 'undefined' ? self : this, function (T) {
  'use strict';

  const APP_ID = 'topsis-decision-engine';
  const VERSION = 2;
  const STORAGE_KEY = 'topsis-engine:v2:project';

  const WEIGHT_METHODS = {
    manual: { label: 'Manual', short: 'manual', text: 'Isi bobot sendiri (angka bebas, misalnya 40, 35, 25). Bobot dinormalisasi otomatis agar totalnya 100%.' },
    equal: { label: 'Sama rata', short: 'sama rata', text: 'Semua kriteria dianggap sama penting.' },
    entropy: { label: 'Entropy', short: 'entropy', text: 'Bobot objektif dari keragaman data: kriteria yang nilainya paling bervariasi antar alternatif mendapat bobot terbesar.' },
    critic: { label: 'CRITIC', short: 'CRITIC', text: 'Bobot objektif dari kontras (simpangan baku) dan konflik (korelasi) antar kriteria.' },
    ahp: { label: 'AHP', short: 'AHP (perbandingan berpasangan)', text: 'Bandingkan kepentingan kriteria berpasangan dengan skala Saaty 1–9. Cocok untuk metode hibrida AHP-TOPSIS.' }
  };

  const DEFAULT_SETTINGS = { normalization: 'vector', decimals: 4, decimalSep: ',' };

  let counter = 0;
  function uid(prefix) {
    counter = (counter + 1) % 1e6;
    return (prefix || 'x') + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6) + counter.toString(36);
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /* ------------------------------------------------------------------ *
   * Struktur proyek
   * ------------------------------------------------------------------ */

  function crit(name, type, weight, unit, id) { return { id: id || uid('k'), name, type: type === 'cost' ? 'cost' : 'benefit', weight: weight === undefined ? 1 : weight, unit: unit || '' }; }
  function alt(name, id) { return { id: id || uid('a'), name }; }

  function newProject() {
    const now = new Date().toISOString();
    const cs = [crit('Kriteria 1', 'benefit', 1), crit('Kriteria 2', 'benefit', 1), crit('Kriteria 3', 'cost', 1)];
    const as = [alt('Alternatif 1'), alt('Alternatif 2'), alt('Alternatif 3')];
    return {
      app: APP_ID, version: VERSION,
      meta: { title: 'Proyek TOPSIS', author: '', description: '', createdAt: now, updatedAt: now },
      criteria: cs, alternatives: as, values: {},
      weighting: { method: 'manual', ahp: {} },
      settings: Object.assign({}, DEFAULT_SETTINGS)
    };
  }

  function str(v, max, fallback) {
    const s = typeof v === 'string' ? v : (v === null || v === undefined ? '' : String(v));
    return (s.trim() ? s : (fallback || '')).slice(0, max || 160);
  }

  /** Validasi & lengkapi proyek dari JSON (berkas, penyimpanan, tautan). */
  function normalizeProject(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('Berkas proyek tidak valid.');
    if (obj.app && obj.app !== APP_ID) {
      if (obj.app === 'ahp-decision-engine' || Array.isArray(obj.nodes)) throw new Error('Ini berkas proyek AHP. Gunakan "Impor bobot dari proyek AHP" di langkah Kriteria & bobot.');
      throw new Error('Berkas ini bukan proyek TOPSIS Decision Engine.');
    }
    if (!Array.isArray(obj.criteria) || !Array.isArray(obj.alternatives)) throw new Error('Berkas proyek tidak memuat daftar kriteria dan alternatif.');
    const seen = new Set();
    const okId = (id, prefix) => { let s = typeof id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(id) ? id : uid(prefix); while (seen.has(s)) s = uid(prefix); seen.add(s); return s; };
    const p = newProject();
    p.meta = {
      title: str(obj.meta && obj.meta.title, 160, 'Proyek TOPSIS'),
      author: str(obj.meta && obj.meta.author, 120),
      description: str(obj.meta && obj.meta.description, 1000),
      createdAt: (obj.meta && obj.meta.createdAt) || p.meta.createdAt,
      updatedAt: (obj.meta && obj.meta.updatedAt) || p.meta.updatedAt
    };
    p.criteria = obj.criteria.slice(0, 60).map((c, j) => {
      const w = Number(c && c.weight);
      return crit(str(c && c.name, 160, 'Kriteria ' + (j + 1)), c && c.type, isFinite(w) && w >= 0 ? w : 1, str(c && c.unit, 40), okId(c && c.id, 'k'));
    });
    p.alternatives = obj.alternatives.slice(0, 500).map((a, i) => alt(str(a && a.name, 160, 'Alternatif ' + (i + 1)), okId(a && a.id, 'a')));
    const values = {};
    const src = obj.values && typeof obj.values === 'object' ? obj.values : {};
    for (const a of p.alternatives) {
      const row = src[a.id];
      if (!row || typeof row !== 'object') continue;
      for (const c of p.criteria) {
        const v = row[c.id];
        if (typeof v === 'number' && isFinite(v)) (values[a.id] = values[a.id] || {})[c.id] = v;
      }
    }
    p.values = values;
    const wm = obj.weighting && WEIGHT_METHODS[obj.weighting.method] ? obj.weighting.method : 'manual';
    p.weighting = { method: wm, ahp: {} };
    const ids = new Set(p.criteria.map((c) => c.id));
    const srcAhp = obj.weighting && obj.weighting.ahp && typeof obj.weighting.ahp === 'object' ? obj.weighting.ahp : {};
    for (const key of Object.keys(srcAhp)) {
      const [a, b] = key.split('>');
      const v = Number(srcAhp[key]);
      if (ids.has(a) && ids.has(b) && a !== b && v > 0 && isFinite(v)) p.weighting.ahp[key] = v;
    }
    const s = obj.settings || {};
    p.settings = {
      normalization: T.NORMALIZATIONS[s.normalization] ? s.normalization : DEFAULT_SETTINGS.normalization,
      decimals: [2, 3, 4, 5, 6].includes(Number(s.decimals)) ? Number(s.decimals) : DEFAULT_SETTINGS.decimals,
      decimalSep: s.decimalSep === '.' ? '.' : ','
    };
    return p;
  }

  function serialize(p) { return JSON.stringify(p, null, 2); }

  function saveLocal(p, storage) {
    try { (storage || localStorage).setItem(STORAGE_KEY, JSON.stringify(p)); return true; } catch (e) { return false; }
  }
  function loadLocal(storage) {
    try {
      const s = (storage || localStorage).getItem(STORAGE_KEY);
      return s ? normalizeProject(JSON.parse(s)) : null;
    } catch (e) { return null; }
  }

  /* ------------------------------------------------------------------ *
   * Nilai matriks & penilaian AHP
   * ------------------------------------------------------------------ */

  function getValue(p, altId, critId) {
    const row = p.values[altId];
    const v = row ? row[critId] : undefined;
    return typeof v === 'number' && isFinite(v) ? v : null;
  }
  function setValue(p, altId, critId, v) {
    if (v === null || v === undefined || !isFinite(v)) {
      if (p.values[altId]) { delete p.values[altId][critId]; if (!Object.keys(p.values[altId]).length) delete p.values[altId]; }
      return;
    }
    (p.values[altId] = p.values[altId] || {})[critId] = v;
  }

  /** Matriks X (m×n) dengan null untuk sel kosong. */
  function matrix(p) {
    const missing = [];
    const X = p.alternatives.map((a, i) => p.criteria.map((c, j) => {
      const v = getValue(p, a.id, c.id);
      if (v === null) missing.push({ i, j });
      return v;
    }));
    return { X, missing };
  }

  function getJudgment(p, a, b) {
    const J = p.weighting.ahp;
    if (J[a + '>' + b] !== undefined) return J[a + '>' + b];
    if (J[b + '>' + a] !== undefined) return 1 / J[b + '>' + a];
    return null;
  }
  function setJudgment(p, a, b, v) {
    const J = p.weighting.ahp;
    delete J[b + '>' + a];
    if (v === null || v === undefined || !(v > 0)) delete J[a + '>' + b];
    else J[a + '>' + b] = v;
  }
  function ahpMatrix(p) {
    return p.criteria.map((a) => p.criteria.map((b) => (a.id === b.id ? 1 : getJudgment(p, a.id, b.id))));
  }

  /** Hapus nilai & penilaian yang merujuk kriteria/alternatif yang sudah tidak ada. */
  function prune(p) {
    const cids = new Set(p.criteria.map((c) => c.id));
    const aids = new Set(p.alternatives.map((a) => a.id));
    for (const aId of Object.keys(p.values)) {
      if (!aids.has(aId)) { delete p.values[aId]; continue; }
      for (const cId of Object.keys(p.values[aId])) if (!cids.has(cId)) delete p.values[aId][cId];
    }
    for (const key of Object.keys(p.weighting.ahp)) {
      const [a, b] = key.split('>');
      if (!cids.has(a) || !cids.has(b)) delete p.weighting.ahp[key];
    }
  }

  /* ------------------------------------------------------------------ *
   * Perhitungan proyek
   * ------------------------------------------------------------------ */

  function weightsFor(p, X, complete) {
    const n = p.criteria.length;
    const method = p.weighting.method;
    const out = { method, w: null, info: null, errors: [], warnings: [] };
    const equal = () => new Array(n).fill(n ? 1 / n : 0);
    if (!n) { out.w = []; return out; }
    if (method === 'equal') { out.w = equal(); return out; }
    if (method === 'entropy' || method === 'critic') {
      const label = WEIGHT_METHODS[method].label;
      const minAlt = method === 'critic' ? 3 : 2;
      if (!complete) { out.errors.push(`Bobot ${label} dihitung dari matriks keputusan. Lengkapi semua nilai di langkah 2 terlebih dahulu.`); out.w = equal(); return out; }
      if (X.length < minAlt) { out.errors.push(`Bobot ${label} membutuhkan minimal ${minAlt} alternatif.`); out.w = equal(); return out; }
      if (method === 'entropy') {
        const e = T.entropyWeights(X);
        if (e.negative) { out.errors.push('Bobot Entropy membutuhkan nilai ≥ 0 pada semua sel. Ubah data atau pilih metode bobot lain.'); out.w = equal(); return out; }
        if (e.degenerate) out.warnings.push('Tidak ada kriteria yang nilainya bervariasi; bobot Entropy dibuat sama rata.');
        out.w = e.w; out.info = e;
      } else {
        const k = T.criticWeights(X, p.criteria.map((c) => c.type));
        if (k.degenerate) out.warnings.push('Tidak ada kriteria yang nilainya bervariasi; bobot CRITIC dibuat sama rata.');
        out.w = k.w; out.info = k;
      }
      return out;
    }
    if (method === 'ahp') {
      const r = T.ahpWeights(ahpMatrix(p));
      out.w = r.w; out.info = r;
      if (r.missing === r.total && r.total > 0) out.warnings.push('Perbandingan berpasangan AHP belum diisi; sementara semua kriteria dianggap sama penting.');
      else if (r.missing) out.warnings.push(`${r.missing} dari ${r.total} perbandingan AHP masih kosong dan dilengkapi otomatis (metode Harker).`);
      if (r.CR > 0.1 + 1e-12) out.warnings.push(`Rasio konsistensi AHP (CR) = ${r.CR.toFixed(3).replace('.', p.settings.decimalSep)} melebihi 0,10. Tinjau ulang perbandingan berpasangan.`);
      return out;
    }
    // manual
    const raw = p.criteria.map((c) => (c.weight > 0 ? c.weight : 0));
    if (!(T.sum(raw) > 0)) { out.errors.push('Isi bobot minimal satu kriteria dengan angka lebih dari 0.'); out.w = equal(); return out; }
    out.w = T.normalizeWeights(raw);
    return out;
  }

  /** Hitung seluruh proyek. Hasil `res` hanya ada bila tidak ada galat. */
  function compute(p) {
    const errors = [], warnings = [];
    const { X, missing } = matrix(p);
    const n = p.criteria.length, m = p.alternatives.length;
    if (n < 2) errors.push('Tambahkan minimal 2 kriteria.');
    if (m < 2) errors.push('Tambahkan minimal 2 alternatif.');
    if (missing.length) errors.push(`${missing.length} sel matriks keputusan masih kosong.`);
    const complete = !missing.length && m > 0 && n > 0;
    const weights = weightsFor(p, complete ? X : null, complete);
    for (const e of weights.errors) if (!errors.includes(e)) errors.push(e);
    warnings.push(...weights.warnings);
    const types = p.criteria.map((c) => c.type);
    const norm = p.settings.normalization;
    if (complete && norm === 'sum' && X.some((r) => r.some((v) => v < 0))) errors.push('Normalisasi jumlah membutuhkan nilai ≥ 0. Pilih normalisasi vektor.');
    if (complete) {
      p.criteria.forEach((c, j) => {
        const col = X.map((r) => r[j]);
        if (col.length > 1 && Math.max(...col) - Math.min(...col) <= T.EPS) warnings.push(`Nilai kriteria "${c.name}" sama untuk semua alternatif sehingga tidak memengaruhi peringkat.`);
      });
    }
    let res = null;
    if (!errors.length) res = T.topsis(X, weights.w, types, { normalization: norm });
    return { ok: !errors.length, errors, warnings, X, missing, types, weights, res, normalization: norm };
  }

  /* ------------------------------------------------------------------ *
   * Angka & impor tabel (tempel dari Excel, CSV, XLSX)
   * ------------------------------------------------------------------ */

  /**
   * Baca angka dengan format Indonesia ("1.234,5"), Inggris ("1,234.5"), "Rp 12.000", "85%".
   * @param {string} sep pemisah desimal yang dipakai bila ambigu (',' atau '.')
   * @returns {number|null|NaN}
   */
  function parseNumber(s, sep) {
    if (s === null || s === undefined) return null;
    if (typeof s === 'number') return isFinite(s) ? s : NaN;
    let t = String(s).trim().replace(/[\s  ]/g, '').replace(/^Rp\.?/i, '').replace(/^\$/, '').replace(/%$/, '').replace(/^\((.*)\)$/, '-$1').replace(/^−/, '-');
    if (t === '' || t === '-') return null;
    const hasDot = t.includes('.'), hasComma = t.includes(',');
    if (hasDot && hasComma) {
      t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    } else if (hasComma) {
      if (/^-?[1-9]\d{0,2}(,\d{3}){2,}$/.test(t) || (sep === '.' && /^-?[1-9]\d{0,2}(,\d{3})+$/.test(t))) t = t.replace(/,/g, '');
      else t = t.replace(',', '.');
    } else if (hasDot) {
      if (/^-?[1-9]\d{0,2}(\.\d{3}){2,}$/.test(t) || (sep === ',' && /^-?[1-9]\d{0,2}(\.\d{3})+$/.test(t))) t = t.replace(/\./g, '');
    }
    if (!/^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return NaN;
    const v = Number(t);
    return isFinite(v) ? v : NaN;
  }

  /** Tebak pemisah desimal dari sekumpulan sel teks. */
  function detectDecimal(cells, fallback) {
    let comma = 0, dot = 0;
    for (const c of cells) {
      const t = String(c || '').trim();
      if (/^-?\d+,\d{1,2}$/.test(t) || /^-?\d+,\d{4,}$/.test(t) || /\.\d{3},\d+$/.test(t)) comma++;
      if (/^-?\d+\.\d{1,2}$/.test(t) || /^-?\d+\.\d{4,}$/.test(t) || /,\d{3}\.\d+$/.test(t)) dot++;
    }
    if (comma > dot) return ',';
    if (dot > comma) return '.';
    return fallback || ',';
  }

  /** Teks tabel (tab dari Excel/Sheets, atau ; , ) → baris sel. */
  function parseGrid(text) {
    text = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const lines = text.split('\n');
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (!lines.length) return [];
    let sep = '\t';
    // Satu kolom dari Excel berbahasa Indonesia ("3,5") tidak boleh dipecah sebagai CSV.
    if (!text.includes('\t') && !text.includes(';') && lines.every((l) => /^\s*-?[\d.]*\d(,\d+)?\s*%?\s*$/.test(l) || !l.includes(','))) {
      return lines.map((l) => [l.trim()]);
    }
    if (!text.includes('\t')) {
      const first = lines.slice(0, 5).join('\n');
      const semi = (first.match(/;/g) || []).length;
      const comma = (first.match(/,/g) || []).length;
      sep = semi > 0 && semi >= comma / 3 ? ';' : (comma > 0 ? ',' : /\s{2,}/.test(first) ? 'ws' : '\t');
      if (sep === ',' || sep === ';') return parseDelimited(text, sep);
    }
    return lines.map((l) => (sep === 'ws' ? l.trim().split(/\s{2,}/) : l.split('\t')).map((c) => c.replace(/^"(.*)"$/s, '$1').trim()));
  }

  function parseDelimited(text, sep) {
    const rows = [];
    let row = [], cur = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') inQ = false; else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === sep) { row.push(cur.trim()); cur = ''; }
      else if (c === '\n') { row.push(cur.trim()); cur = ''; if (row.some((x) => x !== '')) rows.push(row); row = []; }
      else cur += c;
    }
    row.push(cur.trim());
    if (row.some((x) => x !== '')) rows.push(row);
    return rows;
  }

  const TYPE_ROW = /^(jenis|tipe|type|atribut|attribute|sifat|kategori|benefit\s*\/\s*cost|cost\s*\/\s*benefit)$/i;
  const WEIGHT_ROW = /^(bobot|weight|weights|w|bobot\s*\(%\)|bobot\s*%)$/i;
  const UNIT_ROW = /^(satuan|unit)$/i;
  function parseType(s) {
    const t = String(s || '').trim().toLowerCase();
    if (/^(cost|biaya|c|min|minimal|minimize|minimum|negatif|-)$/.test(t) || /cost|biaya/.test(t)) return 'cost';
    if (/^(benefit|keuntungan|manfaat|b|max|maksimal|maximize|maksimum|positif|\+)$/.test(t) || /benefit|untung|manfaat/.test(t)) return 'benefit';
    return null;
  }

  /**
   * Tafsirkan tabel menjadi kriteria, alternatif, dan nilai.
   * Mengenali baris judul (nama kriteria), kolom nama alternatif, serta baris "Jenis"/"Bobot"/"Satuan" opsional.
   */
  function interpretGrid(grid, fallbackSep) {
    // Sel angka asli (dari .xlsx) dipertahankan sebagai number agar tidak ambigu soal pemisah desimal.
    let rows = grid.map((r) => r.map((c) => (typeof c === 'number' ? c : (c === null || c === undefined ? '' : String(c).trim()))));
    rows = rows.filter((r) => r.some((c) => c !== ''));
    if (!rows.length) throw new Error('Tabel kosong.');
    // buang kolom kosong di kanan
    let width = Math.max(...rows.map((r) => r.length));
    while (width > 0 && rows.every((r) => r[width - 1] === '' || r[width - 1] === undefined)) width--;
    rows = rows.map((r) => { const x = r.slice(0, width); while (x.length < width) x.push(''); return x; });
    const numericCells = [];
    rows.forEach((r) => r.forEach((c) => { if (typeof c === 'string' && /\d/.test(c)) numericCells.push(c); }));
    const sep = detectDecimal(numericCells, fallbackSep);
    const isNum = (c) => c !== '' && !Number.isNaN(parseNumber(c, sep)) && parseNumber(c, sep) !== null;

    const special = (r) => TYPE_ROW.test(r[0]) || WEIGHT_ROW.test(r[0]) || UNIT_ROW.test(r[0]);
    // Kolom nama: sel pertama baris data ada yang bukan angka
    const dataLike = rows.filter((r) => !special(r));
    const hasNameCol = dataLike.slice(1).some((r) => r[0] !== '' && !isNum(r[0])) || rows.some(special) || (dataLike.length === 1 && !isNum(dataLike[0][0]));
    const c0 = hasNameCol ? 1 : 0;
    // Baris judul: baris pertama non-khusus yang sel kriterianya memuat teks
    let header = null;
    const first = rows.findIndex((r) => !special(r));
    if (first >= 0 && rows[first].slice(c0).some((c) => c !== '' && !isNum(c))) header = first;

    const n = width - c0;
    if (n < 1) throw new Error('Tidak ada kolom nilai kriteria.');
    const names = [];
    for (let j = 0; j < n; j++) names.push(header !== null && rows[header][c0 + j] !== '' ? String(rows[header][c0 + j]) : 'Kriteria ' + (j + 1));
    let types = null, weights = null, units = null;
    const alts = [];
    let bad = 0;
    rows.forEach((r, ri) => {
      if (ri === header) return;
      if (hasNameCol && TYPE_ROW.test(r[0])) { types = r.slice(c0).map(parseType); return; }
      if (hasNameCol && WEIGHT_ROW.test(r[0])) { weights = r.slice(c0).map((c) => { const v = parseNumber(c, sep); return v === null || Number.isNaN(v) ? null : v; }); return; }
      if (hasNameCol && UNIT_ROW.test(r[0])) { units = r.slice(c0).map(String); return; }
      const values = r.slice(c0).map((c) => {
        const v = parseNumber(c, sep);
        if (Number.isNaN(v)) { bad++; return null; }
        return v;
      });
      alts.push({ name: hasNameCol && r[0] !== '' ? String(r[0]) : 'Alternatif ' + (alts.length + 1), values });
    });
    if (!alts.length) throw new Error('Tidak ada baris alternatif yang terbaca.');
    return { names, types, weights, units, alts, bad, hasHeader: header !== null, hasNameCol, decimalSep: sep };
  }

  /**
   * Terapkan hasil interpretGrid ke proyek (mengganti tabel). Kriteria/alternatif bernama sama dipertahankan id-nya
   * sehingga jenis, bobot, dan penilaian AHP tidak hilang.
   */
  function applyGrid(p, g) {
    const byName = (list, name) => list.find((x) => x.name.trim().toLowerCase() === String(name).trim().toLowerCase());
    let criteria;
    if (!g.hasHeader && g.names.length === p.criteria.length) criteria = p.criteria.slice();
    else {
      const used = new Set();
      criteria = g.names.map((name) => {
        const ex = byName(p.criteria.filter((c) => !used.has(c.id)), name);
        if (ex) { used.add(ex.id); return ex; }
        return crit(name.slice(0, 160), 'benefit', 1);
      });
    }
    criteria.forEach((c, j) => {
      if (g.types && g.types[j]) c.type = g.types[j];
      if (g.weights && g.weights[j] !== null && g.weights[j] !== undefined && g.weights[j] >= 0) c.weight = g.weights[j];
      if (g.units && g.units[j] !== undefined && g.units[j] !== '') c.unit = String(g.units[j]).slice(0, 40);
    });
    const usedA = new Set();
    const alternatives = g.alts.map((a) => {
      const ex = byName(p.alternatives.filter((x) => !usedA.has(x.id)), a.name);
      if (ex) { usedA.add(ex.id); return ex; }
      return alt(String(a.name).slice(0, 160));
    });
    const values = {};
    g.alts.forEach((a, i) => {
      a.values.forEach((v, j) => {
        if (j < criteria.length && v !== null && isFinite(v)) (values[alternatives[i].id] = values[alternatives[i].id] || {})[criteria[j].id] = v;
      });
    });
    p.criteria = criteria;
    p.alternatives = alternatives;
    p.values = values;
    if (g.weights && g.weights.some((v) => v > 0) && p.weighting.method === 'equal') p.weighting.method = 'manual';
    prune(p);
    return { criteria: criteria.length, alternatives: alternatives.length, bad: g.bad };
  }

  /** Baris tabel data yang bisa diimpor kembali (CSV / sheet "Data"). */
  function dataRows(p) {
    const rows = [];
    rows.push(['Alternatif'].concat(p.criteria.map((c) => c.name)));
    rows.push(['Jenis'].concat(p.criteria.map((c) => (c.type === 'cost' ? 'Cost' : 'Benefit'))));
    rows.push(['Bobot'].concat(p.criteria.map((c) => c.weight)));
    rows.push(['Satuan'].concat(p.criteria.map((c) => c.unit || '')));
    for (const a of p.alternatives) rows.push([a.name].concat(p.criteria.map((c) => { const v = getValue(p, a.id, c.id); return v === null ? '' : v; })));
    return rows;
  }

  /* ------------------------------------------------------------------ *
   * Impor bobot dari proyek AHP Decision Engine
   * ------------------------------------------------------------------ */

  /**
   * @param {object} p proyek TOPSIS (diubah)
   * @param {object} ahpProject proyek AHP yang sudah dinormalisasi (AHPModel.normalizeProject)
   * @param {object} AHPModel modul model AHP (dimuat malas)
   */
  function importAhpProject(p, ahpProject, AHPModel) {
    const c = AHPModel.compute(ahpProject, 'combined');
    const leaves = c.synth.leaves;
    if (leaves.length < 2) throw new Error('Proyek AHP harus memiliki minimal 2 kriteria penilai.');
    const byName = (list, name) => list.find((x) => x.name.trim().toLowerCase() === String(name).trim().toLowerCase());
    const used = new Set();
    const criteria = leaves.map((id) => {
      const node = AHPModel.nodeById(ahpProject, id);
      const ex = byName(p.criteria.filter((x) => !used.has(x.id)), node.name);
      const cr = ex || crit(node.name.slice(0, 160), node.dataType === 'cost' ? 'cost' : 'benefit', 1, node.unit || '');
      used.add(cr.id);
      if (node.mode === 'data') { cr.type = node.dataType === 'cost' ? 'cost' : 'benefit'; if (node.unit) cr.unit = String(node.unit).slice(0, 40); }
      cr.weight = +(c.synth.global[id] * 100).toFixed(6);
      return { cr, id, node };
    });
    let altsReplaced = false;
    if (ahpProject.alternatives.length >= 2) {
      const usedA = new Set();
      p.alternatives = ahpProject.alternatives.map((a) => {
        const ex = byName(p.alternatives.filter((x) => !usedA.has(x.id)), a.name);
        const out = ex || alt(a.name.slice(0, 160));
        usedA.add(out.id);
        return { out, src: a };
      }).map((x) => {
        // nilai data nyata dari AHP dipakai bila sel TOPSIS masih kosong
        for (const { cr, id, node } of criteria) {
          if (node.mode !== 'data') continue;
          const row = ahpProject.data[id] || {};
          const v = row[x.src.id];
          if (typeof v === 'number' && isFinite(v) && getValue(p, x.out.id, cr.id) === null) setValue(p, x.out.id, cr.id, v);
        }
        return x.out;
      });
      altsReplaced = true;
    }
    p.criteria = criteria.map((x) => x.cr);
    p.weighting.method = 'manual';
    prune(p);
    const inconsistent = c.issues.filter((x) => x.type === 'inconsistent').length;
    return { criteria: criteria.length, alternatives: altsReplaced ? p.alternatives.length : 0, inconsistent, title: ahpProject.meta.title };
  }

  /* ------------------------------------------------------------------ *
   * Tautan proyek (tanpa server)
   * ------------------------------------------------------------------ */

  function b64urlFromBytes(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function bytesFromB64url(s) {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function streamBytes(stream) {
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  }
  async function encodePayload(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream === 'function') {
      try {
        const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
        return 'z' + b64urlFromBytes(await streamBytes(cs));
      } catch (e) { /* fallback */ }
    }
    return 'j' + b64urlFromBytes(bytes);
  }
  async function decodePayload(code) {
    code = String(code || '').trim();
    const m = code.match(/[#&?]proyek=([A-Za-z0-9_-]+)/);
    if (m) code = m[1];
    const kind = code[0];
    const bytes = bytesFromB64url(code.slice(1));
    let text;
    if (kind === 'z') {
      if (typeof DecompressionStream !== 'function') throw new Error('Browser ini belum mendukung dekompresi. Gunakan Chrome, Edge, Firefox, atau Safari terbaru.');
      const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      text = new TextDecoder().decode(await streamBytes(ds));
    } else if (kind === 'j') text = new TextDecoder().decode(bytes);
    else throw new Error('Tautan tidak dikenali.');
    return JSON.parse(text);
  }

  /* ------------------------------------------------------------------ *
   * Contoh kasus
   * ------------------------------------------------------------------ */

  function build(spec) {
    const p = newProject();
    p.meta.title = spec.title;
    p.meta.description = spec.description || '';
    p.criteria = spec.criteria.map(([name, type, weight, unit]) => crit(name, type, weight, unit));
    p.alternatives = spec.alternatives.map(([name]) => alt(name));
    p.values = {};
    spec.alternatives.forEach(([, vals], i) => vals.forEach((v, j) => setValue(p, p.alternatives[i].id, p.criteria[j].id, v)));
    p.weighting.method = spec.method || 'manual';
    if (spec.ahp) for (const [a, b, v] of spec.ahp) setJudgment(p, p.criteria[a].id, p.criteria[b].id, v);
    return p;
  }

  const SAMPLES = {
    supplier: () => build({
      title: 'Pemilihan supplier',
      description: 'Contoh dari versi pertama kalkulator: tiga supplier dinilai dari kualitas, ketepatan pengiriman, dan harga.',
      criteria: [['Kualitas', 'benefit', 40, 'skor 1–10'], ['Ketepatan pengiriman', 'benefit', 35, 'skor 1–10'], ['Harga', 'cost', 25, 'juta rupiah']],
      alternatives: [['Supplier A', [8, 7, 10]], ['Supplier B', [9, 8, 12]], ['Supplier C', [7, 9, 9]]]
    }),
    beasiswa: () => build({
      title: 'Seleksi penerima beasiswa',
      description: 'Lima kriteria campuran benefit dan cost dengan bobot manual, contoh umum skripsi sistem pendukung keputusan.',
      criteria: [['IPK', 'benefit', 30, ''], ['Penghasilan orang tua', 'cost', 25, 'juta/bulan'], ['Jumlah tanggungan', 'benefit', 15, 'orang'], ['Prestasi non-akademik', 'benefit', 20, 'skor 1–5'], ['Keaktifan organisasi', 'benefit', 10, 'skor 1–5']],
      alternatives: [['Andi', [3.45, 4.5, 3, 3, 2]], ['Bunga', [3.80, 7.0, 2, 4, 3]], ['Citra', [3.20, 2.5, 4, 2, 4]], ['Dimas', [3.65, 3.0, 5, 3, 3]], ['Eka', [3.90, 9.5, 1, 5, 5]], ['Fajar', [3.10, 2.0, 3, 2, 2]]]
    }),
    lokasi: () => build({
      title: 'Lokasi usaha baru (bobot Entropy)',
      description: 'Bobot dihitung objektif dari data dengan metode Entropy, lalu diperingkat dengan TOPSIS (Entropy-TOPSIS).',
      method: 'entropy',
      criteria: [['Harga sewa', 'cost', 1, 'juta/tahun'], ['Luas bangunan', 'benefit', 1, 'm²'], ['Kepadatan penduduk', 'benefit', 1, 'jiwa/km²'], ['Jarak ke pemasok', 'cost', 1, 'km'], ['Akses jalan', 'benefit', 1, 'skor 1–5']],
      alternatives: [['Ruko Jalan Merdeka', [85, 120, 9800, 12, 5]], ['Ruko Pasar Baru', [60, 90, 12500, 8, 4]], ['Gudang Tanjung', [45, 200, 3100, 3, 3]], ['Kios Stasiun', [70, 60, 15200, 15, 4]], ['Ruko Perumahan Asri', [55, 110, 6400, 10, 3]]]
    }),
    laptop: () => build({
      title: 'Pemilihan laptop kuliah (AHP-TOPSIS)',
      description: 'Bobot kriteria dari perbandingan berpasangan AHP, peringkat alternatif dari TOPSIS.',
      method: 'ahp',
      criteria: [['Harga', 'cost', 1, 'juta rupiah'], ['RAM', 'benefit', 1, 'GB'], ['Daya tahan baterai', 'benefit', 1, 'jam'], ['Berat', 'cost', 1, 'kg']],
      ahp: [[0, 1, 2], [0, 2, 3], [0, 3, 5], [1, 2, 2], [1, 3, 3], [2, 3, 2]],
      alternatives: [['Laptop A', [8.5, 8, 7, 1.6]], ['Laptop B', [11.2, 16, 9, 1.3]], ['Laptop C', [6.8, 8, 5, 2.1]], ['Laptop D', [14.5, 16, 12, 1.2]], ['Laptop E', [9.9, 16, 6, 1.8]]]
    })
  };

  const SAMPLE_INFO = [
    { id: 'supplier', title: 'Pemilihan supplier', text: '3 kriteria (2 benefit, 1 cost), 3 supplier, bobot manual 40/35/25. Contoh dari versi pertama.' },
    { id: 'beasiswa', title: 'Seleksi penerima beasiswa', text: '5 kriteria, 6 mahasiswa, bobot manual. Contoh khas skripsi SPK.' },
    { id: 'lokasi', title: 'Lokasi usaha baru (Entropy-TOPSIS)', text: '5 kriteria, 5 lokasi, bobot objektif dihitung dari data dengan metode Entropy.' },
    { id: 'laptop', title: 'Pemilihan laptop kuliah (AHP-TOPSIS)', text: '4 kriteria, 5 laptop, bobot dari perbandingan berpasangan AHP.' }
  ];

  function sampleProject(id) { return (SAMPLES[id] || SAMPLES.supplier)(); }

  return {
    APP_ID, VERSION, STORAGE_KEY, WEIGHT_METHODS, DEFAULT_SETTINGS, SAMPLE_INFO,
    uid, clone, crit, alt, newProject, normalizeProject, serialize, saveLocal, loadLocal,
    getValue, setValue, matrix, getJudgment, setJudgment, ahpMatrix, prune,
    weightsFor, compute, parseNumber, detectDecimal, parseGrid, parseDelimited, interpretGrid, applyGrid, dataRows, parseType,
    importAhpProject, encodePayload, decodePayload, sampleProject
  };
}));
