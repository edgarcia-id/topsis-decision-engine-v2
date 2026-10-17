/*!
 * AHP Decision Engine — model proyek, contoh kasus, perhitungan proyek, kuesioner
 * (c) 2026 Alfredo Garcia — MIT License
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./ahp-core.js'));
  else root.AHPModel = factory(root.AHPCore);
}(typeof self !== 'undefined' ? self : this, function (AHP) {
  'use strict';

  const APP_ID = 'ahp-decision-engine';
  const VERSION = 2;
  const STORAGE_KEY = 'ahp-engine:v2:project';
  const ROOT = 'goal';

  const DEFAULT_SETTINGS = { method: 'eigen', synthesis: 'distributive', crThreshold: 0.1, decimals: 4, decimalSep: ',' };

  let counter = 0;
  function uid(prefix) {
    counter = (counter + 1) % 1e6;
    return (prefix || 'n') + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6) + counter.toString(36);
  }

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const nowISO = () => new Date().toISOString();

  /* ------------------------------------------------------------------ *
   * Pembuatan & normalisasi proyek
   * ------------------------------------------------------------------ */

  function node(id, parentId, name, extra) {
    return Object.assign({ id, parentId, name, note: '', altMode: 'pairwise', dataType: 'benefit', unit: '' }, extra || {});
  }

  function newProject() {
    const p1 = 'p_saya';
    return normalizeProject({
      meta: { title: 'Proyek AHP baru', description: '', author: '' },
      nodes: [
        node(ROOT, null, 'Tujuan keputusan'),
        node('c_1', ROOT, 'Kriteria 1'),
        node('c_2', ROOT, 'Kriteria 2'),
        node('c_3', ROOT, 'Kriteria 3')
      ],
      alternatives: [{ id: 'a_1', name: 'Alternatif A', note: '' }, { id: 'a_2', name: 'Alternatif B', note: '' }],
      participants: [{ id: p1, name: 'Saya', weight: 1, include: true }],
      activeParticipant: p1,
      judgments: {},
      data: {},
      settings: Object.assign({}, DEFAULT_SETTINGS)
    });
  }

  /** Validasi & lengkapi proyek (dipakai saat membuka file / localStorage). */
  function normalizeProject(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('Berkas proyek tidak valid.');
    const p = {};
    p.app = APP_ID;
    p.version = VERSION;
    const meta = raw.meta || {};
    p.meta = {
      title: str(meta.title, 'Proyek AHP'),
      description: str(meta.description, ''),
      author: str(meta.author, ''),
      createdAt: meta.createdAt || nowISO(),
      updatedAt: meta.updatedAt || nowISO()
    };

    // Node: root wajib ada, induk harus ada, tanpa siklus.
    const inNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
    const nodes = [];
    const seen = new Set();
    const rootRaw = inNodes.find((n) => n && n.id === ROOT) || { id: ROOT, name: 'Tujuan keputusan' };
    nodes.push(node(ROOT, null, str(rootRaw.name, 'Tujuan keputusan'), pickNodeExtra(rootRaw)));
    seen.add(ROOT);
    let pending = inNodes.filter((n) => n && n.id && n.id !== ROOT);
    let progressed = true;
    while (pending.length && progressed) {
      progressed = false;
      const next = [];
      for (const n of pending) {
        const id = String(n.id);
        if (seen.has(id)) { progressed = true; continue; }
        const parent = n.parentId ? String(n.parentId) : ROOT;
        if (seen.has(parent)) {
          nodes.push(node(id, parent, str(n.name, 'Kriteria'), pickNodeExtra(n)));
          seen.add(id);
          progressed = true;
        } else next.push(n);
      }
      pending = next;
    }
    p.nodes = nodes;

    p.alternatives = (Array.isArray(raw.alternatives) ? raw.alternatives : [])
      .filter((a) => a && a.id)
      .map((a) => ({ id: String(a.id), name: str(a.name, 'Alternatif'), note: str(a.note, '') }));
    dedupeIds(p.alternatives);

    p.participants = (Array.isArray(raw.participants) ? raw.participants : [])
      .filter((x) => x && x.id)
      .map((x) => ({
        id: String(x.id), name: str(x.name, 'Peserta'),
        weight: x.weight > 0 && isFinite(x.weight) ? Number(x.weight) : 1,
        include: x.include !== false
      }));
    dedupeIds(p.participants);
    if (!p.participants.length) p.participants.push({ id: 'p_saya', name: 'Saya', weight: 1, include: true });
    p.activeParticipant = p.participants.some((x) => x.id === raw.activeParticipant) ? raw.activeParticipant : p.participants[0].id;

    const s = raw.settings || {};
    p.settings = {
      method: ['eigen', 'nca', 'rgmm'].includes(s.method) ? s.method : DEFAULT_SETTINGS.method,
      synthesis: s.synthesis === 'ideal' ? 'ideal' : 'distributive',
      crThreshold: s.crThreshold > 0 && s.crThreshold < 1 ? Number(s.crThreshold) : DEFAULT_SETTINGS.crThreshold,
      decimals: [2, 3, 4, 5, 6].includes(Number(s.decimals)) ? Number(s.decimals) : DEFAULT_SETTINGS.decimals,
      decimalSep: s.decimalSep === '.' ? '.' : ','
    };

    // Penilaian & data: simpan hanya nilai valid. Pemangkasan kunci yatim dilakukan prune().
    p.judgments = {};
    const J = raw.judgments && typeof raw.judgments === 'object' ? raw.judgments : {};
    for (const part of p.participants) {
      const src = J[part.id];
      if (!src || typeof src !== 'object') continue;
      const dst = {};
      for (const key of Object.keys(src)) {
        const set = src[key];
        if (!set || typeof set !== 'object') continue;
        const out = {};
        for (const pk of Object.keys(set)) {
          const v = Number(set[pk]);
          if (v > 0 && isFinite(v) && pk.includes('>')) out[pk] = v;
        }
        if (Object.keys(out).length) dst[key] = out;
      }
      p.judgments[part.id] = dst;
    }
    p.data = {};
    const D = raw.data && typeof raw.data === 'object' ? raw.data : {};
    for (const leaf of Object.keys(D)) {
      const row = D[leaf];
      if (!row || typeof row !== 'object') continue;
      const out = {};
      for (const aid of Object.keys(row)) {
        const v = row[aid];
        if (v !== null && v !== '' && isFinite(Number(v))) out[aid] = Number(v);
      }
      p.data[leaf] = out;
    }
    prune(p);
    return p;
  }

  function pickNodeExtra(n) {
    return {
      note: str(n.note, ''),
      altMode: n.altMode === 'data' ? 'data' : 'pairwise',
      dataType: n.dataType === 'cost' ? 'cost' : 'benefit',
      unit: str(n.unit, '').slice(0, 24)
    };
  }

  function str(v, fallback) {
    if (v === null || v === undefined) return fallback;
    const s = String(v).replace(/[\u0000-\u001f]/g, ' ').trim();
    return s ? s.slice(0, 160) : fallback;
  }

  function dedupeIds(list) {
    const seen = new Set();
    for (const item of list) {
      while (seen.has(item.id)) item.id = item.id + '_';
      seen.add(item.id);
    }
  }

  /** Hapus penilaian/data yang merujuk node/alternatif yang sudah tidak ada. */
  function prune(p) {
    const valid = new Set(comparisonSets(p).filter((s) => s.mode === 'pairwise').map((s) => s.key));
    const itemsOf = {};
    for (const s of comparisonSets(p)) itemsOf[s.key] = new Set(s.items.map((x) => x.id));
    for (const pid of Object.keys(p.judgments)) {
      if (!p.participants.some((x) => x.id === pid)) { delete p.judgments[pid]; continue; }
      const J = p.judgments[pid];
      for (const key of Object.keys(J)) {
        if (!valid.has(key)) { delete J[key]; continue; }
        for (const pk of Object.keys(J[key])) {
          const [a, b] = pk.split('>');
          if (!itemsOf[key].has(a) || !itemsOf[key].has(b) || a === b) delete J[key][pk];
        }
        if (!Object.keys(J[key]).length) delete J[key];
      }
    }
    const leaves = new Set(leafIds(p));
    const altIds = new Set(p.alternatives.map((a) => a.id));
    for (const leaf of Object.keys(p.data)) {
      if (!leaves.has(leaf)) { delete p.data[leaf]; continue; }
      for (const aid of Object.keys(p.data[leaf])) if (!altIds.has(aid)) delete p.data[leaf][aid];
    }
    return p;
  }

  /* ------------------------------------------------------------------ *
   * Navigasi pohon
   * ------------------------------------------------------------------ */

  function childrenMap(p) {
    const map = {};
    for (const n of p.nodes) map[n.id] = [];
    for (const n of p.nodes) if (n.parentId !== null && map[n.parentId]) map[n.parentId].push(n.id);
    return map;
  }

  function nodeById(p, id) { return p.nodes.find((n) => n.id === id) || null; }

  function leafIds(p) {
    const ch = childrenMap(p);
    const out = [];
    (function walk(id) { if (!ch[id].length) out.push(id); else ch[id].forEach(walk); }(ROOT));
    return out;
  }

  /** Urutan pre-order beserta kedalaman. */
  function preorder(p) {
    const ch = childrenMap(p);
    const out = [];
    (function walk(id, depth) { out.push({ id, depth }); ch[id].forEach((c) => walk(c, depth + 1)); }(ROOT, 0));
    return out;
  }

  function pathNames(p, id) {
    const names = [];
    let cur = nodeById(p, id);
    while (cur) { names.unshift(cur.name); cur = cur.parentId ? nodeById(p, cur.parentId) : null; }
    return names;
  }

  function descendants(p, id) {
    const ch = childrenMap(p);
    const out = [];
    (function walk(x) { ch[x].forEach((c) => { out.push(c); walk(c); }); }(id));
    return out;
  }

  function depthOf(p, id) {
    let d = 0, cur = nodeById(p, id);
    while (cur && cur.parentId) { d++; cur = nodeById(p, cur.parentId); }
    return d;
  }

  /* ------------------------------------------------------------------ *
   * Set perbandingan
   * ------------------------------------------------------------------ */

  /**
   * Semua set penilaian dalam urutan hierarki:
   *  - kind 'criteria': membandingkan anak-anak sebuah node (≥ 2 anak)
   *  - kind 'alts'    : membandingkan alternatif terhadap sebuah daun (≥ 2 alternatif)
   */
  function comparisonSets(p) {
    const ch = childrenMap(p);
    const sets = [];
    const byId = {};
    for (const n of p.nodes) byId[n.id] = n;
    const alts = p.alternatives.map((a) => ({ id: a.id, name: a.name }));
    (function walk(id) {
      const n = byId[id];
      const kids = ch[id];
      if (kids.length >= 2) {
        sets.push({ key: 'c:' + id, kind: 'criteria', nodeId: id, mode: 'pairwise', items: kids.map((k) => ({ id: k, name: byId[k].name })) });
      }
      if (!kids.length && alts.length >= 2) {
        sets.push({ key: 'a:' + id, kind: 'alts', nodeId: id, mode: n.altMode === 'data' ? 'data' : 'pairwise', items: alts });
      }
      kids.forEach(walk);
    }(ROOT));
    return sets;
  }

  function pairCount(n) { return n * (n - 1) / 2; }

  /** Label set untuk tampilan. short = untuk sumbu diagram / nama sheet. */
  function setLabel(p, set, short) {
    const n = nodeById(p, set.nodeId);
    if (set.kind === 'criteria') {
      if (set.nodeId === ROOT) return short ? 'Kriteria utama' : 'Kriteria terhadap tujuan';
      return short ? 'Sub ' + n.name : 'Sub-kriteria dari ' + n.name;
    }
    if (set.nodeId === ROOT) return short ? 'Alternatif' : 'Alternatif terhadap tujuan';
    const path = pathNames(p, set.nodeId).slice(1).join(' › ');
    return short ? 'Alt. ' + n.name : 'Alternatif terhadap ' + path;
  }

  /* ------------------------------------------------------------------ *
   * Penilaian
   * ------------------------------------------------------------------ */

  function readPair(setJ, a, b) {
    if (!setJ) return null;
    if (setJ[a + '>' + b] > 0) return setJ[a + '>' + b];
    if (setJ[b + '>' + a] > 0) return 1 / setJ[b + '>' + a];
    return null;
  }

  function getJudgment(p, pid, key, a, b) {
    const J = p.judgments[pid];
    return readPair(J && J[key], a, b);
  }

  function setJudgment(p, pid, key, a, b, value) {
    if (!p.judgments[pid]) p.judgments[pid] = {};
    const J = p.judgments[pid];
    if (!J[key]) J[key] = {};
    delete J[key][b + '>' + a];
    if (value === null || value === undefined || !(value > 0)) delete J[key][a + '>' + b];
    else J[key][a + '>' + b] = value;
    if (!Object.keys(J[key]).length) delete J[key];
  }

  function includedParticipants(p) {
    const inc = p.participants.filter((x) => x.include);
    return inc.length ? inc : p.participants.slice(0, 1);
  }

  /** Penilaian gabungan: rata-rata geometrik berbobot dari peserta yang disertakan (AIJ). */
  function combinedJudgment(p, key, a, b) {
    const parts = includedParticipants(p);
    const vals = parts.map((x) => getJudgment(p, x.id, key, a, b));
    return AHP.weightedGeometricMean(vals, parts.map((x) => x.weight));
  }

  function judgmentGetter(p, scope) {
    if (scope === 'combined') return (key, a, b) => combinedJudgment(p, key, a, b);
    return (key, a, b) => getJudgment(p, scope, key, a, b);
  }

  function matrixFor(p, set, scope) {
    const get = judgmentGetter(p, scope);
    const ids = set.items.map((x) => x.id);
    return AHP.buildMatrix(ids.length, (i, j) => get(set.key, ids[i], ids[j]));
  }

  function setProgress(p, set, scope) {
    if (set.mode === 'data') {
      const row = p.data[set.nodeId] || {};
      const filled = set.items.filter((x) => row[x.id] !== undefined && row[x.id] !== null && row[x.id] !== '').length;
      return { filled, total: set.items.length };
    }
    const A = matrixFor(p, set, scope);
    const total = pairCount(set.items.length);
    return { filled: total - AHP.countMissing(A), total };
  }

  /* ------------------------------------------------------------------ *
   * Perhitungan proyek
   * ------------------------------------------------------------------ */

  /**
   * Hitung seluruh proyek untuk satu cakupan penilaian.
   * @param {string} scope 'combined' atau id peserta
   */
  function compute(p, scope) {
    scope = scope || 'combined';
    const method = p.settings.method;
    const ch = childrenMap(p);
    const sets = comparisonSets(p);
    const results = {};
    const local = {};
    const altLocal = {};
    const issues = [];
    const nAlt = p.alternatives.length;

    for (const set of sets) {
      if (set.mode === 'data') {
        const n = nodeById(p, set.nodeId);
        const row = p.data[set.nodeId] || {};
        const values = set.items.map((a) => (row[a.id] === undefined ? null : row[a.id]));
        const r = AHP.dataPriorities(values, n.dataType);
        results[set.key] = { set, values, dataType: n.dataType, unit: n.unit, priority: r.w || null, error: r.error || null, errorIndex: r.index };
        if (r.error) issues.push({ key: set.key, type: 'data', error: r.error });
        altLocal[set.nodeId] = r.w || new Array(nAlt).fill(1 / nAlt);
        continue;
      }
      const A = matrixFor(p, set, scope);
      const an = AHP.analyzeMatrix(A, method);
      results[set.key] = { set, A, analysis: an };
      if (an.missing > 0) issues.push({ key: set.key, type: 'missing', missing: an.missing, total: an.total, connected: an.connected });
      if (an.CR > p.settings.crThreshold) issues.push({ key: set.key, type: 'inconsistent', CR: an.CR });
      if (set.kind === 'criteria') local[set.nodeId] = an.w;
      else altLocal[set.nodeId] = an.w;
    }
    // Node dengan satu anak: bobot lokal 1
    for (const id of Object.keys(ch)) if (ch[id].length === 1) local[id] = [1];

    const synth = AHP.synthesize({
      rootId: ROOT, children: ch, local, altLocal, nAlt: nAlt >= 1 ? nAlt : 0, mode: p.settings.synthesis
    });
    return { scope, method, sets, results, local, altLocal, synth, children: ch, issues, nAlt };
  }

  /** Ringkasan per peserta (CR tiap set + bobot level-1) untuk analisis kelompok. */
  function participantSummaries(p) {
    return p.participants.map((part) => {
      const c = compute(p, part.id);
      const pairwise = c.sets.filter((s) => s.mode === 'pairwise').map((s) => c.results[s.key]);
      const maxCR = pairwise.reduce((m, r) => Math.max(m, r.analysis.CR), 0);
      const missing = pairwise.reduce((m, r) => m + r.analysis.missing, 0);
      const total = pairwise.reduce((m, r) => m + r.analysis.total, 0);
      return { participant: part, compute: c, maxCR, missing, total };
    });
  }

  /* ------------------------------------------------------------------ *
   * Penyimpanan
   * ------------------------------------------------------------------ */

  function serialize(p) {
    const out = clone(p);
    out.meta.updatedAt = nowISO();
    return JSON.stringify(out, null, 2);
  }

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
   * Kuesioner bersama (tanpa server)
   * ------------------------------------------------------------------ */

  /** Sidik struktur: berubah bila node/alternatif/set berubah. */
  function structureHash(p) {
    const parts = comparisonSets(p).filter((s) => s.mode === 'pairwise').map((s) => s.key + ':' + s.items.map((x) => x.id).join(','));
    let h = 2166136261;
    const text = parts.join('|');
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }

  /** Model tanpa penilaian & tanpa data, untuk dibagikan ke responden. */
  function questionnaireModel(p) {
    return {
      app: APP_ID, version: VERSION, kind: 'questionnaire',
      meta: { title: p.meta.title, description: p.meta.description, author: p.meta.author },
      nodes: p.nodes.map((n) => ({ id: n.id, parentId: n.parentId, name: n.name, note: n.note, altMode: n.altMode, dataType: n.dataType, unit: n.unit })),
      alternatives: p.alternatives.map((a) => ({ id: a.id, name: a.name, note: a.note })),
      settings: p.settings,
      hash: structureHash(p)
    };
  }

  function makeResponse(p, respondentName) {
    const pid = p.activeParticipant;
    return {
      app: APP_ID, version: VERSION, kind: 'response',
      hash: structureHash(p),
      title: p.meta.title,
      respondent: str(respondentName, 'Responden'),
      submittedAt: nowISO(),
      judgments: clone(p.judgments[pid] || {})
    };
  }

  /**
   * Gabungkan jawaban responden sebagai peserta baru.
   * @returns {{participant:object, matched:number, skipped:number, hashMatch:boolean}}
   */
  function importResponse(p, resp) {
    if (!resp || resp.kind !== 'response' || typeof resp.judgments !== 'object') throw new Error('Berkas ini bukan jawaban kuesioner AHP.');
    const sets = comparisonSets(p).filter((s) => s.mode === 'pairwise');
    const itemsOf = {};
    for (const s of sets) itemsOf[s.key] = new Set(s.items.map((x) => x.id));
    let base = str(resp.respondent, 'Responden');
    let name = base, k = 2;
    while (p.participants.some((x) => x.name === name)) name = base + ' (' + (k++) + ')';
    const part = { id: uid('p_'), name, weight: 1, include: true };
    const J = {};
    let matched = 0, skipped = 0;
    for (const key of Object.keys(resp.judgments)) {
      const set = resp.judgments[key];
      if (!itemsOf[key]) { skipped += Object.keys(set || {}).length; continue; }
      for (const pk of Object.keys(set)) {
        const [a, b] = pk.split('>');
        const v = Number(set[pk]);
        if (itemsOf[key].has(a) && itemsOf[key].has(b) && v > 0 && isFinite(v)) {
          (J[key] = J[key] || {})[pk] = v;
          matched++;
        } else skipped++;
      }
    }
    if (!matched) throw new Error('Tidak ada penilaian yang cocok dengan struktur proyek ini.');
    p.participants.push(part);
    p.judgments[part.id] = J;
    return { participant: part, matched, skipped, hashMatch: resp.hash === structureHash(p) };
  }

  /* --- encoding tautan: deflate-raw + base64url (fallback: base64url JSON) --- */

  function b64urlFromBytes(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function bytesFromB64url(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function streamBytes(stream) {
    const chunks = [];
    const reader = stream.getReader();
    for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); }
    let len = 0; for (const c of chunks) len += c.length;
    const out = new Uint8Array(len);
    let off = 0; for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  }

  async function encodePayload(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream === 'function') {
      try {
        const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
        return 'z' + b64urlFromBytes(await streamBytes(cs));
      } catch (e) { /* fallback di bawah */ }
    }
    return 'j' + b64urlFromBytes(bytes);
  }

  async function decodePayload(code) {
    code = String(code || '').trim();
    const m = code.match(/[#&?](?:kuesioner|jawaban|q|r)=([A-Za-z0-9_-]+)/);
    if (m) code = m[1];
    const kind = code[0];
    const bytes = bytesFromB64url(code.slice(1));
    let text;
    if (kind === 'z') {
      if (typeof DecompressionStream !== 'function') throw new Error('Browser ini belum mendukung dekompresi. Gunakan Chrome, Edge, Firefox, atau Safari terbaru.');
      const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      text = new TextDecoder().decode(await streamBytes(ds));
    } else if (kind === 'j') {
      text = new TextDecoder().decode(bytes);
    } else throw new Error('Kode tidak dikenali.');
    return JSON.parse(text);
  }

  /* ------------------------------------------------------------------ *
   * Contoh kasus
   * ------------------------------------------------------------------ */

  function judg(pairs) {
    const out = {};
    for (const key of Object.keys(pairs)) {
      out[key] = {};
      for (const [a, b, v] of pairs[key]) out[key][a + '>' + b] = v;
    }
    return out;
  }

  const SAMPLES = {
    laptop: () => ({
      meta: { title: 'Pemilihan laptop untuk kuliah', description: 'Contoh individu: kriteria bertingkat, campuran perbandingan berpasangan dan data nyata (harga, RAM, berat).', author: '' },
      nodes: [
        node(ROOT, null, 'Memilih laptop terbaik untuk kuliah'),
        node('c_harga', ROOT, 'Harga', { altMode: 'data', dataType: 'cost', unit: 'juta Rp' }),
        node('c_perf', ROOT, 'Performa'),
        node('s_cpu', 'c_perf', 'Prosesor'),
        node('s_ram', 'c_perf', 'RAM', { altMode: 'data', dataType: 'benefit', unit: 'GB' }),
        node('s_ssd', 'c_perf', 'Penyimpanan SSD', { altMode: 'data', dataType: 'benefit', unit: 'GB' }),
        node('c_bat', ROOT, 'Daya tahan baterai'),
        node('c_port', ROOT, 'Berat', { altMode: 'data', dataType: 'cost', unit: 'kg' })
      ],
      alternatives: [
        { id: 'a1', name: 'Laptop A', note: '14 inci, harga menengah' },
        { id: 'a2', name: 'Laptop B', note: '14 inci, ringan, baterai besar' },
        { id: 'a3', name: 'Laptop C', note: '15,6 inci, paling murah' }
      ],
      participants: [{ id: 'p1', name: 'Saya', weight: 1, include: true }],
      activeParticipant: 'p1',
      judgments: {
        p1: judg({
          'c:goal': [['c_harga', 'c_perf', 2], ['c_harga', 'c_bat', 3], ['c_harga', 'c_port', 4], ['c_perf', 'c_bat', 2], ['c_perf', 'c_port', 3], ['c_bat', 'c_port', 2]],
          'c:c_perf': [['s_cpu', 's_ram', 2], ['s_cpu', 's_ssd', 3], ['s_ram', 's_ssd', 2]],
          'a:s_cpu': [['a1', 'a2', 1 / 2], ['a1', 'a3', 3], ['a2', 'a3', 5]],
          'a:c_bat': [['a1', 'a2', 1 / 3], ['a1', 'a3', 2], ['a2', 'a3', 5]]
        })
      },
      data: {
        c_harga: { a1: 9.5, a2: 12, a3: 7.8 },
        s_ram: { a1: 16, a2: 16, a3: 8 },
        s_ssd: { a1: 512, a2: 1024, a3: 512 },
        c_port: { a1: 1.6, a2: 1.3, a3: 1.8 }
      },
      settings: Object.assign({}, DEFAULT_SETTINGS)
    }),

    supplier: () => ({
      meta: { title: 'Pemilihan supplier bahan baku', description: 'Contoh kelompok: tiga responden ahli, penilaian digabung dengan rata-rata geometrik (AIJ).', author: '' },
      nodes: [
        node(ROOT, null, 'Memilih supplier bahan baku terbaik'),
        node('c_q', ROOT, 'Kualitas'),
        node('c_h', ROOT, 'Harga'),
        node('c_d', ROOT, 'Pengiriman'),
        node('s_t', 'c_d', 'Ketepatan waktu'),
        node('s_l', 'c_d', 'Lead time'),
        node('c_s', ROOT, 'Layanan purnajual')
      ],
      alternatives: [
        { id: 'sa', name: 'Supplier A', note: '' },
        { id: 'sb', name: 'Supplier B', note: '' },
        { id: 'sc', name: 'Supplier C', note: '' }
      ],
      participants: [
        { id: 'p1', name: 'Manajer Pengadaan', weight: 1, include: true },
        { id: 'p2', name: 'Manajer Produksi', weight: 1, include: true },
        { id: 'p3', name: 'Manajer Keuangan', weight: 1, include: true }
      ],
      activeParticipant: 'p1',
      judgments: {
        p1: judg({
          'c:goal': [['c_q', 'c_h', 2], ['c_q', 'c_d', 3], ['c_q', 'c_s', 5], ['c_h', 'c_d', 2], ['c_h', 'c_s', 3], ['c_d', 'c_s', 2]],
          'c:c_d': [['s_t', 's_l', 3]],
          'a:c_q': [['sa', 'sb', 3], ['sa', 'sc', 5], ['sb', 'sc', 2]],
          'a:c_h': [['sa', 'sb', 1 / 3], ['sa', 'sc', 1 / 2], ['sb', 'sc', 2]],
          'a:s_t': [['sa', 'sb', 2], ['sa', 'sc', 1 / 2], ['sb', 'sc', 1 / 3]],
          'a:s_l': [['sa', 'sb', 1 / 2], ['sa', 'sc', 1 / 3], ['sb', 'sc', 1 / 2]],
          'a:c_s': [['sa', 'sb', 2], ['sa', 'sc', 3], ['sb', 'sc', 2]]
        }),
        p2: judg({
          'c:goal': [['c_q', 'c_h', 3], ['c_q', 'c_d', 2], ['c_q', 'c_s', 5], ['c_h', 'c_d', 1 / 2], ['c_h', 'c_s', 2], ['c_d', 'c_s', 3]],
          'c:c_d': [['s_t', 's_l', 5]],
          'a:c_q': [['sa', 'sb', 2], ['sa', 'sc', 4], ['sb', 'sc', 2]],
          'a:c_h': [['sa', 'sb', 1 / 2], ['sa', 'sc', 1 / 2], ['sb', 'sc', 1]],
          'a:s_t': [['sa', 'sb', 1], ['sa', 'sc', 1 / 3], ['sb', 'sc', 1 / 3]],
          'a:s_l': [['sa', 'sb', 1 / 2], ['sa', 'sc', 1 / 2], ['sb', 'sc', 1]],
          'a:c_s': [['sa', 'sb', 3], ['sa', 'sc', 3], ['sb', 'sc', 1]]
        }),
        p3: judg({
          'c:goal': [['c_q', 'c_h', 1 / 2], ['c_q', 'c_d', 2], ['c_q', 'c_s', 3], ['c_h', 'c_d', 3], ['c_h', 'c_s', 5], ['c_d', 'c_s', 2]],
          'c:c_d': [['s_t', 's_l', 2]],
          'a:c_q': [['sa', 'sb', 3], ['sa', 'sc', 4], ['sb', 'sc', 1]],
          'a:c_h': [['sa', 'sb', 1 / 4], ['sa', 'sc', 1 / 3], ['sb', 'sc', 2]],
          'a:s_t': [['sa', 'sb', 2], ['sa', 'sc', 1 / 2], ['sb', 'sc', 1 / 2]],
          'a:s_l': [['sa', 'sb', 1 / 3], ['sa', 'sc', 1 / 4], ['sb', 'sc', 1 / 2]],
          'a:c_s': [['sa', 'sb', 1], ['sa', 'sc', 2], ['sb', 'sc', 2]]
        })
      },
      data: {},
      settings: Object.assign({}, DEFAULT_SETTINGS)
    }),

    lokasi: () => ({
      meta: { title: 'Bobot kriteria lokasi perumahan', description: 'Contoh pembobotan kriteria saja (tanpa alternatif), sengaja tidak konsisten (CR 0,29) untuk latihan memakai saran perbaikan.', author: '' },
      nodes: [
        node(ROOT, null, 'Lokasi perumahan terbaik'),
        node('k_pol', ROOT, 'Jarak dari sumber polusi'),
        node('k_ban', ROOT, 'Jarak dari zona banjir'),
        node('k_rek', ROOT, 'Jarak ke rekreasi/danau'),
        node('k_rth', ROOT, 'Jarak ke ruang terbuka hijau'),
        node('k_jal', ROOT, 'Jarak ke jalan utama'),
        node('k_har', ROOT, 'Harga tanah')
      ],
      alternatives: [],
      participants: [{ id: 'p1', name: 'Saya', weight: 1, include: true }],
      activeParticipant: 'p1',
      judgments: {
        p1: judg({
          'c:goal': [
            ['k_pol', 'k_ban', 7], ['k_pol', 'k_rek', 7], ['k_pol', 'k_rth', 7], ['k_pol', 'k_jal', 7], ['k_pol', 'k_har', 7],
            ['k_ban', 'k_rek', 5], ['k_ban', 'k_rth', 5], ['k_ban', 'k_jal', 5], ['k_ban', 'k_har', 5],
            ['k_rek', 'k_rth', 5], ['k_rek', 'k_jal', 5], ['k_rek', 'k_har', 5],
            ['k_rth', 'k_jal', 7], ['k_rth', 'k_har', 7],
            ['k_jal', 'k_har', 5]
          ]
        })
      },
      data: {},
      settings: Object.assign({}, DEFAULT_SETTINGS)
    })
  };

  const SAMPLE_INFO = [
    { id: 'laptop', title: 'Pemilihan laptop untuk kuliah', text: 'Individu, sub-kriteria, campuran penilaian berpasangan dan data harga/RAM/berat.' },
    { id: 'supplier', title: 'Pemilihan supplier bahan baku', text: 'Kelompok tiga ahli, penilaian digabung rata-rata geometrik.' },
    { id: 'lokasi', title: 'Bobot kriteria lokasi perumahan', text: 'Hanya pembobotan kriteria; matriks dari contoh Expert Choice dengan CR 0,29.' }
  ];

  function sampleProject(id) {
    const f = SAMPLES[id];
    if (!f) throw new Error('Contoh tidak ditemukan.');
    return normalizeProject(f());
  }

  return {
    APP_ID, VERSION, STORAGE_KEY, ROOT, DEFAULT_SETTINGS, SAMPLE_INFO,
    uid, clone, newProject, normalizeProject, prune, sampleProject,
    childrenMap, nodeById, leafIds, preorder, pathNames, descendants, depthOf,
    comparisonSets, pairCount, setLabel, readPair, getJudgment, setJudgment, includedParticipants,
    combinedJudgment, judgmentGetter, matrixFor, setProgress,
    compute, participantSummaries,
    serialize, saveLocal, loadLocal,
    structureHash, questionnaireModel, makeResponse, importResponse, encodePayload, decodePayload
  };
}));
