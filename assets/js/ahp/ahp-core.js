/*!
 * AHP Decision Engine — mesin hitung (tanpa DOM)
 * (c) 2026 Alfredo Garcia — MIT License
 *
 * Semua fungsi murni: menerima angka, mengembalikan angka. Dipakai oleh UI
 * di browser (window.AHPCore) dan oleh unit test di Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AHPCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Konstanta
   * ------------------------------------------------------------------ */

  // Random Index Saaty (n = 0..15). Tabel yang umum dikutip dari Saaty (1980/2000).
  const RI_TABLE = [0, 0, 0, 0.58, 0.90, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49, 1.51, 1.48, 1.56, 1.57, 1.59];
  const MAX_N = 15;

  // 17 nilai skala Saaty: 1/9 .. 1 .. 9
  const SCALE = [];
  for (let k = 9; k >= 2; k--) SCALE.push(1 / k);
  for (let k = 1; k <= 9; k++) SCALE.push(k);

  const SCALE_LABELS = {
    1: 'Sama penting',
    2: 'Sama hingga sedikit lebih penting',
    3: 'Sedikit lebih penting',
    4: 'Sedikit hingga jelas lebih penting',
    5: 'Jelas lebih penting',
    6: 'Jelas hingga sangat lebih penting',
    7: 'Sangat lebih penting',
    8: 'Sangat hingga mutlak lebih penting',
    9: 'Mutlak lebih penting'
  };

  const EPS = 1e-12;

  /* ------------------------------------------------------------------ *
   * Utilitas skala & parsing
   * ------------------------------------------------------------------ */

  function randomIndex(n) {
    if (n < 0) return 0;
    return n < RI_TABLE.length ? RI_TABLE[n] : RI_TABLE[RI_TABLE.length - 1];
  }

  /** Nilai skala Saaty terdekat (jarak logaritmik). */
  function snapToScale(v) {
    if (!(v > 0) || !isFinite(v)) return 1;
    const lv = Math.log(v);
    let best = 1, bestD = Infinity;
    for (const s of SCALE) {
      const d = Math.abs(lv - Math.log(s));
      if (d < bestD - EPS) { bestD = d; best = s; }
    }
    return best;
  }

  /**
   * Posisi slider -8..8 → nilai a(A,B).
   * Negatif = item kiri (A) lebih penting; positif = item kanan (B) lebih penting.
   */
  function positionToValue(p) {
    p = Math.round(p);
    if (p === 0) return 1;
    return p < 0 ? 1 - p : 1 / (1 + p);
  }

  /** Nilai a(A,B) → posisi slider terdekat -8..8. */
  function valueToPosition(v) {
    const s = snapToScale(v);
    if (Math.abs(s - 1) < EPS) return 0;
    return s > 1 ? -(Math.round(s) - 1) : Math.round(1 / s) - 1;
  }

  /**
   * Parse masukan pengguna: "3", "1/3", "0.25", "2,5" (koma desimal), "1/2,5".
   * @returns {number|null} null bila kosong, NaN bila tidak valid.
   */
  function parseJudgment(str) {
    if (str === null || str === undefined) return null;
    const s = String(str).trim().replace(/\s+/g, '');
    if (s === '' || s === '-' || s === '–') return null;
    const num = (t) => {
      if (!/^\d*(?:[.,]\d+)?$/.test(t) || t === '' || t === '.' || t === ',') return NaN;
      return parseFloat(t.replace(',', '.'));
    };
    if (s.includes('/')) {
      const parts = s.split('/');
      if (parts.length !== 2) return NaN;
      const a = num(parts[0]), b = num(parts[1]);
      if (!(a > 0) || !(b > 0)) return NaN;
      return a / b;
    }
    const v = num(s);
    return v > 0 ? v : NaN;
  }

  /** Format nilai perbandingan untuk tampilan: 3, 1/3, 2.47, 1/2.47 */
  function formatJudgment(v, decimals) {
    if (v === null || v === undefined || !isFinite(v)) return '';
    const d = decimals === undefined ? 2 : decimals;
    const near = (x) => Math.abs(x - Math.round(x)) < 1e-9;
    if (v >= 1) return near(v) ? String(Math.round(v)) : trimZeros(v.toFixed(d));
    const inv = 1 / v;
    return near(inv) ? '1/' + Math.round(inv) : '1/' + trimZeros(inv.toFixed(d));
  }

  function trimZeros(s) { return s.indexOf('.') >= 0 ? s.replace(/0+$/, '').replace(/\.$/, '') : s; }

  /* ------------------------------------------------------------------ *
   * Matriks
   * ------------------------------------------------------------------ */

  function zeros(n, m) {
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = new Array(m === undefined ? n : m).fill(0);
    return out;
  }

  function matVec(M, w) {
    const n = M.length, out = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) s += M[i][j] * w[j];
      out[i] = s;
    }
    return out;
  }

  function sum(arr) { let s = 0; for (const x of arr) s += x; return s; }

  function normalize(arr) {
    const s = sum(arr);
    if (!(s > 0)) return arr.map(() => 1 / arr.length);
    return arr.map((x) => x / s);
  }

  /**
   * Bangun matriks resiprokal dari fungsi penilaian.
   * get(i, j) → nilai a_ij (number) atau null bila belum dinilai.
   * Diagonal = 1, segitiga bawah = kebalikan segitiga atas.
   */
  function buildMatrix(n, get) {
    const A = [];
    for (let i = 0; i < n; i++) {
      A.push(new Array(n).fill(null));
      A[i][i] = 1;
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const v = get(i, j);
        if (v !== null && v !== undefined && v > 0 && isFinite(v)) {
          A[i][j] = v;
          A[j][i] = 1 / v;
        }
      }
    }
    return A;
  }

  function countMissing(A) {
    let m = 0;
    const n = A.length;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (A[i][j] === null) m++;
    return m;
  }

  /** Apakah graf perbandingan (sisi = penilaian terisi) terhubung? */
  function isConnected(A) {
    const n = A.length;
    if (n <= 1) return true;
    const seen = new Array(n).fill(false);
    const stack = [0];
    seen[0] = true;
    let count = 1;
    while (stack.length) {
      const i = stack.pop();
      for (let j = 0; j < n; j++) {
        if (!seen[j] && i !== j && A[i][j] !== null) { seen[j] = true; count++; stack.push(j); }
      }
    }
    return count === n;
  }

  /**
   * Matriks Harker (1987) untuk perbandingan tidak lengkap:
   * b_ij = a_ij bila ada, 0 bila kosong; b_ii = 1 + jumlah kosong pada baris i.
   */
  function harkerMatrix(A) {
    const n = A.length;
    const B = zeros(n);
    for (let i = 0; i < n; i++) {
      let missing = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        if (A[i][j] === null) missing++;
        else B[i][j] = A[i][j];
      }
      B[i][i] = 1 + missing;
    }
    return B;
  }

  /** Vektor eigen utama (metode pangkat), dinormalisasi jumlah = 1. */
  function principalEigenvector(M, tol, maxIter) {
    const n = M.length;
    tol = tol || 1e-14;
    maxIter = maxIter || 10000;
    let w = new Array(n).fill(1 / n);
    let iterations = 0;
    for (; iterations < maxIter; iterations++) {
      const v = normalize(matVec(M, w));
      let diff = 0;
      for (let i = 0; i < n; i++) diff = Math.max(diff, Math.abs(v[i] - w[i]));
      w = v;
      if (diff < tol) break;
    }
    return { w, iterations: iterations + 1 };
  }

  /** Rata-rata geometrik baris (RGMM / LLSM untuk matriks lengkap). */
  function rowGeometricMean(A) {
    const n = A.length;
    return normalize(A.map((row) => {
      let s = 0;
      for (let j = 0; j < n; j++) s += Math.log(row[j]);
      return Math.exp(s / n);
    }));
  }

  /** Normalisasi kolom lalu rata-rata baris (metode "manual" buku teks). */
  function normalizedColumnAverage(A) {
    const n = A.length;
    const colSums = new Array(n).fill(0);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) colSums[j] += A[i][j];
    const N = zeros(n);
    const w = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) { N[i][j] = A[i][j] / colSums[j]; s += N[i][j]; }
      w[i] = s / n;
    }
    return { w, colSums, normalized: N };
  }

  const METHOD_LABELS = {
    eigen: 'Vektor eigen utama (metode pangkat)',
    nca: 'Normalisasi kolom + rata-rata baris',
    rgmm: 'Rata-rata geometrik baris (RGMM)',
    harker: 'Vektor eigen Harker (penilaian belum lengkap)'
  };

  function priorityByMethod(F, method) {
    if (method === 'nca') return normalizedColumnAverage(F).w;
    if (method === 'rgmm') return rowGeometricMean(F);
    return principalEigenvector(F).w;
  }

  /**
   * Analisis lengkap satu matriks perbandingan.
   * @param {Array<Array<number|null>>} A matriks resiprokal (null = belum dinilai)
   * @param {'eigen'|'nca'|'rgmm'} method
   */
  function analyzeMatrix(A, method) {
    method = method || 'eigen';
    const n = A.length;
    const base = { n, missing: 0, total: n * (n - 1) / 2, connected: true, method, methodUsed: method };
    if (n === 0) return Object.assign(base, { w: [], full: [], lambdaMax: 0, CI: 0, RI: 0, CR: 0, colSums: [], normalized: [], Aw: [], cv: [], complete: true });
    if (n === 1) {
      return Object.assign(base, {
        w: [1], full: [[1]], lambdaMax: 1, CI: 0, RI: 0, CR: 0,
        colSums: [1], normalized: [[1]], Aw: [1], cv: [1], complete: true
      });
    }
    const missing = countMissing(A);
    let F, w, methodUsed = method, connected = true;
    if (missing > 0) {
      connected = isConnected(A);
      if (connected) {
        w = principalEigenvector(harkerMatrix(A)).w;
        F = A.map((row, i) => row.map((v, j) => (v === null ? w[i] / w[j] : v)));
        methodUsed = 'harker';
      } else {
        // Graf terputus: bobot tidak dapat ditentukan secara unik → isi kosong dengan 1.
        F = A.map((row) => row.map((v) => (v === null ? 1 : v)));
        w = priorityByMethod(F, method);
      }
    } else {
      F = A.map((row) => row.slice());
      w = priorityByMethod(F, method);
    }

    const ncaParts = normalizedColumnAverage(F);
    const Aw = matVec(F, w);
    const cv = Aw.map((x, i) => x / w[i]);
    const lambdaMax = sum(cv) / n;
    let CI = (lambdaMax - n) / (n - 1);
    if (Math.abs(CI) < 1e-12) CI = 0;
    const RI = randomIndex(n);
    const CR = n <= 2 || RI === 0 ? 0 : CI / RI;

    return Object.assign(base, {
      w, full: F, missing, connected, methodUsed,
      lambdaMax, CI, RI, CR,
      colSums: ncaParts.colSums, normalized: ncaParts.normalized, ncaWeights: ncaParts.w,
      Aw, cv, complete: missing === 0
    });
  }

  /**
   * Daftar penilaian paling tidak konsisten, diurutkan dari yang terburuk.
   * e_ij = a_ij · w_j / w_i (1 = konsisten sempurna). Saran = w_i / w_j dibulatkan ke skala Saaty.
   * Untuk `top` teratas, dihitung CR baru bila hanya penilaian itu yang diganti.
   */
  function inconsistencyReport(A, analysis, method, top) {
    const n = A.length;
    const w = analysis.w;
    const list = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (A[i][j] === null) continue;
        const e = A[i][j] * w[j] / w[i];
        const ideal = w[i] / w[j];
        list.push({ i, j, value: A[i][j], ratio: e, deviation: Math.abs(Math.log(e)), ideal, suggestion: snapToScale(ideal) });
      }
    }
    list.sort((a, b) => b.deviation - a.deviation);
    const k = Math.min(top === undefined ? 3 : top, list.length);
    for (let t = 0; t < k; t++) {
      const item = list[t];
      if (Math.abs(item.suggestion - item.value) < 1e-9) { item.newCR = analysis.CR; continue; }
      const B = A.map((row) => row.slice());
      B[item.i][item.j] = item.suggestion;
      B[item.j][item.i] = 1 / item.suggestion;
      item.newCR = analyzeMatrix(B, method).CR;
    }
    return list;
  }

  /* ------------------------------------------------------------------ *
   * Agregasi kelompok
   * ------------------------------------------------------------------ */

  /** Rata-rata geometrik berbobot. values/weights sejajar; nilai null diabaikan. */
  function weightedGeometricMean(values, weights) {
    let s = 0, ws = 0;
    for (let k = 0; k < values.length; k++) {
      const v = values[k];
      if (v === null || v === undefined || !(v > 0)) continue;
      const wt = weights ? weights[k] : 1;
      if (!(wt > 0)) continue;
      s += wt * Math.log(v);
      ws += wt;
    }
    return ws > 0 ? Math.exp(s / ws) : null;
  }

  /* ------------------------------------------------------------------ *
   * Data langsung (benefit / cost)
   * ------------------------------------------------------------------ */

  /**
   * Prioritas alternatif dari data nyata.
   * benefit: v / Σv ; cost: (1/v) / Σ(1/v)  — skala rasio, konsisten dengan AHP.
   * @returns {{w:number[]}|{error:string, index?:number}}
   */
  function dataPriorities(values, type) {
    const n = values.length;
    for (let i = 0; i < n; i++) {
      const v = values[i];
      if (v === null || v === undefined || v === '' || !isFinite(v)) return { error: 'missing', index: i };
    }
    let t;
    if (type === 'cost') {
      for (let i = 0; i < n; i++) if (!(values[i] > 0)) return { error: 'cost-nonpositive', index: i };
      t = values.map((v) => 1 / v);
    } else {
      for (let i = 0; i < n; i++) if (values[i] < 0) return { error: 'benefit-negative', index: i };
      t = values.slice();
    }
    const s = sum(t);
    if (!(s > 0)) return { error: 'zero-sum' };
    return { w: t.map((x) => x / s) };
  }

  /* ------------------------------------------------------------------ *
   * Sintesis hierarki
   * ------------------------------------------------------------------ */

  /**
   * @param {object} p
   * @param {string} p.rootId
   * @param {Object<string,string[]>} p.children   id → id anak (urut)
   * @param {Object<string,number[]>} p.local      id induk → bobot lokal anak (sejajar children)
   * @param {Object<string,number[]>} p.altLocal   id daun → prioritas alternatif (jumlah 1)
   * @param {number} p.nAlt
   * @param {'distributive'|'ideal'} p.mode
   */
  function synthesize(p) {
    const { rootId, children, local, altLocal, nAlt } = p;
    const mode = p.mode === 'ideal' ? 'ideal' : 'distributive';
    const global = {};
    const leaves = [];
    const topOf = {}; // daun → anak langsung root yang menaunginya
    global[rootId] = 1;

    (function walk(id, top) {
      const kids = children[id] || [];
      if (!kids.length) { leaves.push(id); topOf[id] = top === null ? id : top; return; }
      const lw = local[id] || kids.map(() => 1 / kids.length);
      kids.forEach((c, i) => {
        global[c] = global[id] * lw[i];
        walk(c, top === null ? c : top);
      });
    }(rootId, null));

    const out = { mode, global, leaves, topOf, nAlt };
    if (!nAlt) return Object.assign(out, { raw: [], S: 0, final: [], q: {}, contribTop: {}, contribLeaf: {} });

    const q = {};
    for (const leaf of leaves) {
      const pv = altLocal[leaf] || new Array(nAlt).fill(1 / nAlt);
      if (mode === 'ideal') {
        const mx = Math.max.apply(null, pv);
        q[leaf] = pv.map((x) => (mx > 0 ? x / mx : 0));
      } else {
        q[leaf] = pv.slice();
      }
    }
    const raw = new Array(nAlt).fill(0);
    for (const leaf of leaves) for (let k = 0; k < nAlt; k++) raw[k] += global[leaf] * q[leaf][k];
    const S = sum(raw);
    const final = raw.map((x) => (S > 0 ? x / S : 1 / nAlt));

    const contribLeaf = {};
    const contribTop = {};
    const tops = (children[rootId] && children[rootId].length) ? children[rootId] : [rootId];
    for (const t of tops) contribTop[t] = new Array(nAlt).fill(0);
    for (const leaf of leaves) {
      contribLeaf[leaf] = q[leaf].map((x) => (S > 0 ? global[leaf] * x / S : 0));
      const t = topOf[leaf];
      for (let k = 0; k < nAlt; k++) contribTop[t][k] += contribLeaf[leaf][k];
    }
    return Object.assign(out, { raw, S, final, q, contribTop, contribLeaf });
  }

  /** Daun-daun di bawah node beserta bobot relatifnya (hasil kali bobot lokal dari node ke daun). */
  function leavesUnder(nodeId, children, local) {
    const out = [];
    (function walk(id, r) {
      const kids = children[id] || [];
      if (!kids.length) { out.push({ id, r }); return; }
      const lw = local[id] || kids.map(() => 1 / kids.length);
      kids.forEach((c, i) => walk(c, r * lw[i]));
    }(nodeId, 1));
    return out;
  }

  /**
   * Prioritas alternatif terhadap sebuah node (gabungan dari daun di bawahnya),
   * dinormalisasi jumlah = 1. Memakai skor q dari sintesis (distributive/ideal).
   */
  function altPrioritiesUnder(nodeId, children, local, synth) {
    const n = synth.nAlt;
    const v = new Array(n).fill(0);
    for (const { id, r } of leavesUnder(nodeId, children, local)) {
      const q = synth.q[id];
      for (let k = 0; k < n; k++) v[k] += r * q[k];
    }
    return normalize(v);
  }

  /* ------------------------------------------------------------------ *
   * Analisis sensitivitas
   * ------------------------------------------------------------------ */

  /**
   * Model linear: s_k(w) = R_k + G · Σ_c w_c · Q_c,k
   * final_k = s_k / Σ s. Berlaku untuk mode distributive maupun ideal.
   */
  function sensitivityModel(nodeId, children, local, synth) {
    const kids = children[nodeId] || [];
    const n = synth.nAlt;
    const G = synth.global[nodeId] === undefined ? 0 : synth.global[nodeId];
    const w0 = (local[nodeId] || kids.map(() => 1 / kids.length)).slice();
    const Q = kids.map((c) => {
      const v = new Array(n).fill(0);
      for (const { id, r } of leavesUnder(c, children, local)) {
        const q = synth.q[id];
        for (let k = 0; k < n; k++) v[k] += r * q[k];
      }
      return v;
    });
    const under = new Set(leavesUnder(nodeId, children, local).map((x) => x.id));
    const R = new Array(n).fill(0);
    for (const leaf of synth.leaves) {
      if (under.has(leaf)) continue;
      for (let k = 0; k < n; k++) R[k] += synth.global[leaf] * synth.q[leaf][k];
    }
    return { nodeId, kids, n, G, w0, Q, R };
  }

  function sensScores(sm, w) {
    const s = sm.R.slice();
    for (let c = 0; c < sm.kids.length; c++) {
      for (let k = 0; k < sm.n; k++) s[k] += sm.G * w[c] * sm.Q[c][k];
    }
    return s;
  }

  function sensFinal(sm, w) {
    const s = sensScores(sm, w);
    const S = sum(s);
    return s.map((x) => (S > 0 ? x / S : 1 / sm.n));
  }

  /** Ubah bobot satu anak menjadi x, anak lain diskalakan proporsional (total tetap 1). */
  function adjustWeights(w0, idx, x) {
    x = Math.min(1, Math.max(0, x));
    const m = w0.length;
    const rest = 1 - w0[idx];
    return w0.map((wj, j) => {
      if (j === idx) return x;
      if (rest > 1e-12) return wj * (1 - x) / rest;
      return m > 1 ? (1 - x) / (m - 1) : 0;
    });
  }

  /** Prioritas alternatif (dinormalisasi) terhadap tiap anak node. */
  function sensPerformance(sm) {
    return sm.Q.map((v) => normalize(v));
  }

  /** Kurva gradien: prioritas akhir tiap alternatif saat bobot anak idx berubah 0..1. */
  function gradientCurves(sm, idx, wBase, steps) {
    steps = steps || 100;
    const base = wBase || sm.w0;
    const xs = [], series = [];
    for (let k = 0; k < sm.n; k++) series.push([]);
    for (let t = 0; t <= steps; t++) {
      const x = t / steps;
      xs.push(x);
      const f = sensFinal(sm, adjustWeights(base, idx, x));
      for (let k = 0; k < sm.n; k++) series[k].push(f[k]);
    }
    return { xs, series };
  }

  /**
   * Interval stabilitas alternatif teratas terhadap bobot anak idx.
   * s_k(x) linear dalam x (penyebut normalisasi tidak mengubah urutan),
   * sehingga titik silang dihitung eksak.
   */
  function stabilityInterval(sm, idx, wBase) {
    const base = wBase || sm.w0;
    const m = base.length, n = sm.n;
    const rest = 1 - base[idx];
    const share = base.map((wj, j) => (j === idx ? 0 : (rest > 1e-12 ? wj / rest : (m > 1 ? 1 / (m - 1) : 0))));
    const a = new Array(n).fill(0), b = new Array(n).fill(0);
    for (let k = 0; k < n; k++) {
      let O = 0;
      for (let j = 0; j < m; j++) if (j !== idx) O += share[j] * sm.Q[j][k];
      a[k] = sm.R[k] + sm.G * O;
      b[k] = sm.G * (sm.Q[idx][k] - O);
    }
    const x0 = base[idx];
    const at = (k, x) => a[k] + b[k] * x;
    let top = 0;
    for (let k = 1; k < n; k++) if (at(k, x0) > at(top, x0) + 1e-15) top = k;

    const crossings = [];
    for (let k = 0; k < n; k++) {
      for (let j = k + 1; j < n; j++) {
        const db = b[k] - b[j];
        if (Math.abs(db) < 1e-15) continue;
        const x = (a[j] - a[k]) / db;
        if (x > 1e-9 && x < 1 - 1e-9) crossings.push({ x, k, j });
      }
    }
    crossings.sort((p, q) => p.x - q.x);

    let lo = 0, hi = 1, loBy = null, hiBy = null;
    for (let k = 0; k < n; k++) {
      if (k === top) continue;
      const db = b[top] - b[k];
      if (Math.abs(db) < 1e-15) continue;
      const x = (a[k] - a[top]) / db;
      if (x < x0 - 1e-12 && x > lo) { lo = x; loBy = k; }
      if (x > x0 + 1e-12 && x < hi) { hi = x; hiBy = k; }
    }
    return { idx, x0, top, lo, hi, loBy, hiBy, crossings };
  }

  /** Head-to-head antara alternatif A dan B terhadap anak-anak node. */
  function headToHead(sm, w, A, B) {
    const s = sensScores(sm, w);
    const S = sum(s);
    const rows = sm.kids.map((c, i) => (S > 0 ? sm.G * w[i] * (sm.Q[i][A] - sm.Q[i][B]) / S : 0));
    const outside = S > 0 ? (sm.R[A] - sm.R[B]) / S : 0;
    const overall = S > 0 ? (s[A] - s[B]) / S : 0;
    return { rows, outside, overall };
  }

  return {
    RI_TABLE, MAX_N, SCALE, SCALE_LABELS, METHOD_LABELS,
    randomIndex, snapToScale, positionToValue, valueToPosition, parseJudgment, formatJudgment,
    buildMatrix, countMissing, isConnected, harkerMatrix, principalEigenvector,
    rowGeometricMean, normalizedColumnAverage, analyzeMatrix, inconsistencyReport,
    weightedGeometricMean, dataPriorities,
    synthesize, leavesUnder, altPrioritiesUnder,
    sensitivityModel, sensScores, sensFinal, adjustWeights, sensPerformance,
    gradientCurves, stabilityInterval, headToHead,
    normalize, sum
  };
}));
