/*!
 * TOPSIS Decision Engine — mesin hitung (tanpa pustaka, tanpa DOM)
 * (c) 2026 Alfredo Garcia — MIT License
 *
 * Isi:
 *  - normalisasi matriks (vektor, linear, min–maks, jumlah)
 *  - TOPSIS: matriks terbobot, solusi ideal A+ / A−, jarak D+ / D−, nilai preferensi C*, peringkat
 *  - pembobotan objektif: Entropy (Shannon) dan CRITIC; pembobotan AHP (vektor eigen, metode Harker)
 *  - analisis sensitivitas bobot, interval stabilitas, uji rank reversal, perbandingan normalisasi
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TopsisCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EPS = 1e-12;
  const TIE = 1e-10;

  const NORMALIZATIONS = {
    vector: { label: 'Vektor (TOPSIS klasik)', formula: 'r_ij = x_ij / √(Σ_i x_ij²)', divisorLabel: '√(Σx²)' },
    linear: { label: 'Linear (dibagi nilai maksimum)', formula: 'r_ij = x_ij / maks_i |x_ij|', divisorLabel: 'maks |x|' },
    minmax: { label: 'Min–maks', formula: 'r_ij = (x_ij − min_i x_ij) / (maks_i x_ij − min_i x_ij)', divisorLabel: 'maks − min' },
    sum: { label: 'Jumlah (dibagi total kolom)', formula: 'r_ij = x_ij / Σ_i x_ij', divisorLabel: 'Σx' }
  };

  const RI_TABLE = [0, 0, 0, 0.58, 0.90, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49, 1.51, 1.48, 1.56, 1.57, 1.59];

  /* ------------------------------------------------------------------ *
   * Utilitas
   * ------------------------------------------------------------------ */

  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const column = (X, j) => X.map((r) => r[j]);

  /** Peringkat menurun dengan seri (1, 2, 2, 4) seperti RANK() di Excel. */
  function rankDesc(values) {
    return values.map((v) => 1 + values.filter((u) => u > v + TIE * Math.max(1, Math.abs(v))).length);
  }

  /** Peringkat rata-rata (untuk Spearman bila ada seri). */
  function averageRanks(values) {
    const idx = values.map((_, i) => i).sort((a, b) => values[b] - values[a]);
    const out = new Array(values.length);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && Math.abs(values[idx[j + 1]] - values[idx[i]]) <= TIE * Math.max(1, Math.abs(values[idx[i]]))) j++;
      const r = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) out[idx[k]] = r;
      i = j + 1;
    }
    return out;
  }

  function pearson(a, b) {
    const n = a.length;
    if (n < 2) return 0;
    const ma = sum(a) / n, mb = sum(b) / n;
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; }
    if (saa <= EPS || sbb <= EPS) return 0;
    return sab / Math.sqrt(saa * sbb);
  }

  /** Korelasi Spearman antar dua vektor skor (memakai peringkat rata-rata). */
  function spearman(scoresA, scoresB) {
    return pearson(averageRanks(scoresA), averageRanks(scoresB));
  }

  function argmax(a) {
    let k = 0;
    for (let i = 1; i < a.length; i++) if (a[i] > a[k] + TIE) k = i;
    return k;
  }

  function normalizeWeights(raw) {
    const w = raw.map((x) => (x > 0 && isFinite(x) ? x : 0));
    const s = sum(w);
    return s > EPS ? w.map((x) => x / s) : raw.map(() => 1 / raw.length);
  }

  /* ------------------------------------------------------------------ *
   * Normalisasi
   * ------------------------------------------------------------------ */

  /**
   * @param {number[][]} X  matriks keputusan m×n (lengkap)
   * @param {string} method vector | linear | minmax | sum
   * @returns {{R:number[][], info:{divisor:number, min?:number, max?:number, zero:boolean}[]}}
   * Semua metode mempertahankan arah data; jenis benefit/cost ditangani saat menentukan solusi ideal.
   */
  function normalize(X, method) {
    method = NORMALIZATIONS[method] ? method : 'vector';
    const m = X.length, n = m ? X[0].length : 0;
    const R = X.map(() => new Array(n).fill(0));
    const info = [];
    for (let j = 0; j < n; j++) {
      const col = column(X, j);
      if (method === 'minmax') {
        const min = Math.min(...col), max = Math.max(...col), range = max - min;
        const zero = !(range > EPS * Math.max(1, Math.abs(max)));
        for (let i = 0; i < m; i++) R[i][j] = zero ? 0 : (X[i][j] - min) / range;
        info.push({ divisor: range, min, max, zero });
        continue;
      }
      let d;
      if (method === 'vector') d = Math.sqrt(sum(col.map((x) => x * x)));
      else if (method === 'linear') d = Math.max(...col.map(Math.abs));
      else d = sum(col);
      const zero = !(Math.abs(d) > EPS);
      for (let i = 0; i < m; i++) R[i][j] = zero ? 0 : X[i][j] / d;
      info.push({ divisor: d, zero });
    }
    return { R, info, method };
  }

  /* ------------------------------------------------------------------ *
   * TOPSIS
   * ------------------------------------------------------------------ */

  function idealPoints(V, types) {
    const n = types.length;
    const Apos = [], Aneg = [];
    for (let j = 0; j < n; j++) {
      const col = column(V, j);
      const max = Math.max(...col), min = Math.min(...col);
      if (types[j] === 'cost') { Apos.push(min); Aneg.push(max); } else { Apos.push(max); Aneg.push(min); }
    }
    return { Apos, Aneg };
  }

  function distance(row, target) {
    let s = 0;
    for (let j = 0; j < row.length; j++) { const d = row[j] - target[j]; s += d * d; }
    return Math.sqrt(s);
  }

  function closeness(Dpos, Dneg) {
    return Dpos.map((dp, i) => { const t = dp + Dneg[i]; return t > EPS ? Dneg[i] / t : 0.5; });
  }

  function orderOf(C) { return C.map((_, i) => i).sort((a, b) => (C[b] - C[a]) || (a - b)); }

  /**
   * TOPSIS lengkap.
   * @param {number[][]} X matriks keputusan m×n
   * @param {number[]} w bobot (akan dinormalisasi berjumlah 1)
   * @param {string[]} types 'benefit' | 'cost' per kriteria
   * @param {{normalization?:string}} opts
   */
  function topsis(X, w, types, opts) {
    opts = opts || {};
    const W = normalizeWeights(w);
    const norm = normalize(X, opts.normalization || 'vector');
    const V = norm.R.map((row) => row.map((r, j) => r * W[j]));
    const { Apos, Aneg } = idealPoints(V, types);
    const Dpos = V.map((row) => distance(row, Apos));
    const Dneg = V.map((row) => distance(row, Aneg));
    const C = closeness(Dpos, Dneg);
    return { normalization: norm.method, R: norm.R, info: norm.info, w: W, V, Apos, Aneg, Dpos, Dneg, C, rank: rankDesc(C), order: orderOf(C) };
  }

  /**
   * Evaluator cepat untuk banyak vektor bobot: normalisasi dihitung sekali.
   * @returns {(w:number[]) => number[]} fungsi bobot → C*
   */
  function evaluator(X, types, opts) {
    const R = normalize(X, (opts && opts.normalization) || 'vector').R;
    return function (w) {
      const V = R.map((row) => row.map((r, j) => r * w[j]));
      const { Apos, Aneg } = idealPoints(V, types);
      return closeness(V.map((row) => distance(row, Apos)), V.map((row) => distance(row, Aneg)));
    };
  }

  /* ------------------------------------------------------------------ *
   * Pembobotan objektif
   * ------------------------------------------------------------------ */

  /**
   * Bobot Entropy (Shannon). p_ij = x_ij / Σ_i x_ij;  e_j = −k Σ p ln p, k = 1/ln m;  d_j = 1 − e_j;  w_j = d_j / Σ d.
   * Membutuhkan nilai ≥ 0. Kolom yang seluruhnya nol dianggap tidak membawa informasi (e = 1).
   */
  function entropyWeights(X) {
    const m = X.length, n = m ? X[0].length : 0;
    const k = m > 1 ? 1 / Math.log(m) : 0;
    const P = X.map(() => new Array(n).fill(0));
    const E = [], D = [], colSum = [];
    let negative = false;
    for (let j = 0; j < n; j++) {
      const col = column(X, j);
      if (col.some((x) => x < 0)) negative = true;
      const s = sum(col);
      colSum.push(s);
      let h = 0;
      if (s > EPS) {
        for (let i = 0; i < m; i++) {
          const p = X[i][j] / s;
          P[i][j] = p;
          if (p > 0) h += p * Math.log(p);
        }
        E.push(-k * h);
      } else E.push(1);
      D.push(1 - E[j]);
    }
    const sD = sum(D);
    const w = sD > EPS ? D.map((d) => d / sD) : new Array(n).fill(1 / n);
    return { P, E, D, w, k, colSum, negative, degenerate: !(sD > EPS) };
  }

  /**
   * Bobot CRITIC (Diakoulaki dkk., 1995).
   * N: normalisasi min–maks searah (cost dibalik), σ_j simpangan baku sampel kolom N,
   * r_jk korelasi Pearson antar kolom, C_j = σ_j Σ_k (1 − r_jk), w_j = C_j / Σ C.
   */
  function criticWeights(X, types) {
    const m = X.length, n = m ? X[0].length : 0;
    const N = X.map(() => new Array(n).fill(0));
    const mins = [], maxs = [];
    for (let j = 0; j < n; j++) {
      const col = column(X, j);
      const min = Math.min(...col), max = Math.max(...col), range = max - min;
      mins.push(min); maxs.push(max);
      for (let i = 0; i < m; i++) N[i][j] = range > EPS ? (types[j] === 'cost' ? (max - X[i][j]) / range : (X[i][j] - min) / range) : 0;
    }
    const sigma = [];
    for (let j = 0; j < n; j++) {
      const col = column(N, j);
      const mean = sum(col) / m;
      sigma.push(m > 1 ? Math.sqrt(sum(col.map((x) => (x - mean) * (x - mean))) / (m - 1)) : 0);
    }
    const corr = [];
    for (let j = 0; j < n; j++) {
      corr.push([]);
      for (let k = 0; k < n; k++) corr[j].push(j === k ? 1 : (sigma[j] > EPS && sigma[k] > EPS ? pearson(column(N, j), column(N, k)) : 0));
    }
    const Cj = sigma.map((s, j) => s * sum(corr[j].map((r) => 1 - r)));
    const sC = sum(Cj);
    const w = sC > EPS ? Cj.map((c) => c / sC) : new Array(n).fill(1 / n);
    return { N, mins, maxs, sigma, corr, C: Cj, w, degenerate: !(sC > EPS) };
  }

  /* ------------------------------------------------------------------ *
   * Pembobotan AHP (perbandingan berpasangan kriteria)
   * ------------------------------------------------------------------ */

  function principalEigen(B) {
    const n = B.length;
    let x = new Array(n).fill(1 / n);
    for (let it = 0; it < 2000; it++) {
      const y = B.map((row) => row.reduce((s, v, j) => s + v * x[j], 0));
      const s = sum(y);
      const nx = y.map((v) => v / s);
      let diff = 0;
      for (let i = 0; i < n; i++) diff = Math.max(diff, Math.abs(nx[i] - x[i]));
      x = nx;
      if (diff < 1e-14) break;
    }
    return x;
  }

  function connected(A) {
    const n = A.length;
    const seen = new Array(n).fill(false);
    const stack = [0];
    seen[0] = true;
    while (stack.length) {
      const i = stack.pop();
      for (let j = 0; j < n; j++) if (!seen[j] && A[i][j] !== null) { seen[j] = true; stack.push(j); }
    }
    return seen.every(Boolean);
  }

  /**
   * @param {(number|null)[][]} A matriks perbandingan n×n; A[i][j] = seberapa penting i dibanding j; null = kosong.
   * Penilaian kosong dilengkapi dengan metode Harker (1987). Bobot = vektor eigen utama.
   */
  function ahpWeights(A) {
    const n = A.length;
    if (n === 0) return null;
    if (n === 1) return { w: [1], lambdaMax: 1, CI: 0, RI: 0, CR: 0, full: [[1]], colSums: [1], normalized: [[1]], nca: [1], Aw: [1], cv: [1], missing: 0, total: 0, disconnected: false };
    let missing = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (A[i][j] === null || A[i][j] === undefined) missing++;
    const M = A.map((row, i) => row.map((v, j) => (i === j ? 1 : (v === null || v === undefined ? null : v))));
    const disconnected = missing > 0 && !connected(M);
    let w;
    if (disconnected) {
      // Graf penilaian terputus: sel kosong dianggap sama penting (1).
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (M[i][j] === null) M[i][j] = 1;
      w = principalEigen(M);
    } else {
      const B = M.map((row, i) => {
        const miss = row.filter((v, j) => j !== i && v === null).length;
        return row.map((v, j) => (i === j ? 1 + miss : (v === null ? 0 : v)));
      });
      w = principalEigen(B);
    }
    const full = M.map((row, i) => row.map((v, j) => (v === null ? w[i] / w[j] : v)));
    const colSums = [];
    for (let j = 0; j < n; j++) colSums.push(sum(full.map((r) => r[j])));
    const normalized = full.map((row) => row.map((v, j) => v / colSums[j]));
    const nca = normalized.map((row) => sum(row) / n);
    const Aw = full.map((row) => row.reduce((s, v, j) => s + v * w[j], 0));
    const cv = Aw.map((v, i) => v / w[i]);
    const lambdaMax = sum(cv) / n;
    const CI = n > 2 ? Math.max(0, (lambdaMax - n) / (n - 1)) : 0;
    const RI = RI_TABLE[n] !== undefined ? RI_TABLE[n] : 1.59;
    const CR = RI > 0 ? CI / RI : 0;
    return { w, lambdaMax, CI, RI, CR, full, colSums, normalized, nca, Aw, cv, missing, total: n * (n - 1) / 2, disconnected };
  }

  /** "3", "1/3", "0,5", "2.5" → angka; '' → null; tidak valid → NaN */
  function parseJudgment(s) {
    if (s === null || s === undefined) return null;
    const t = String(s).trim().replace(/\s+/g, '').replace(',', '.');
    if (t === '') return null;
    const m = t.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
    if (m) { const a = Number(m[1]), b = Number(m[2]); return a > 0 && b > 0 ? a / b : NaN; }
    const v = Number(t);
    return isFinite(v) && v > 0 ? v : NaN;
  }

  /** 0.3333 → "1/3", 3 → "3", 2.5 → "2.5" */
  function formatJudgment(v, digits) {
    if (v === null || v === undefined || !isFinite(v)) return '';
    const near = (a, b) => Math.abs(a - b) < 1e-6;
    for (let k = 1; k <= 9; k++) { if (near(v, k)) return String(k); if (near(v, 1 / k)) return '1/' + k; }
    if (v < 1) { const inv = 1 / v; if (near(inv, Math.round(inv * 100) / 100)) return '1/' + +(inv.toFixed(2)); }
    return String(+v.toFixed(digits === undefined ? 3 : digits));
  }

  /* ------------------------------------------------------------------ *
   * Sensitivitas
   * ------------------------------------------------------------------ */

  /** Ubah bobot kriteria idx menjadi x; bobot lain diskalakan proporsional agar total tetap 1. */
  function adjustWeights(w0, idx, x) {
    const n = w0.length;
    x = Math.max(0, Math.min(1, x));
    const rest = 1 - w0[idx];
    return w0.map((w, k) => (k === idx ? x : (rest > EPS ? w * (1 - x) / rest : (1 - x) / (n - 1))));
  }

  /** Kurva C* tiap alternatif ketika bobot kriteria idx bergerak 0 → 1. */
  function gradientCurves(ev, w0, idx, steps) {
    steps = steps || 100;
    const xs = [], series = [];
    for (let s = 0; s <= steps; s++) {
      const x = s / steps;
      xs.push(x);
      const C = ev(adjustWeights(w0, idx, x));
      C.forEach((c, k) => { (series[k] = series[k] || []).push(c); });
    }
    return { xs, series };
  }

  /**
   * Titik-titik bobot (0..1) tempat alternatif peringkat pertama berganti, diperhalus dengan bisection.
   * @returns {{x:number, from:number, to:number}[]}
   */
  function topSwitches(ev, w0, idx, step) {
    step = step || 0.0025;
    const topAt = (x) => argmax(ev(adjustWeights(w0, idx, x)));
    const out = [];
    let prevX = 0, prevTop = topAt(0);
    const N = Math.round(1 / step);
    for (let s = 1; s <= N; s++) {
      const x = s / N;
      const t = topAt(x);
      if (t !== prevTop) {
        let lo = prevX, hi = x;
        for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2; if (topAt(mid) === prevTop) lo = mid; else hi = mid; }
        out.push({ x: (lo + hi) / 2, from: prevTop, to: topAt(hi) });
      }
      prevX = x; prevTop = t;
    }
    return out;
  }

  /**
   * Rentang bobot kriteria idx yang mempertahankan alternatif teratas saat ini.
   * @returns {{x0, top, lo, hi, loBy, hiBy, switches}}
   */
  function stabilityInterval(ev, w0, idx) {
    const x0 = w0[idx];
    const top = argmax(ev(w0));
    const switches = topSwitches(ev, w0, idx);
    let lo = 0, hi = 1, loBy = null, hiBy = null;
    for (const s of switches) {
      // Di bawah x0: saat bobot diturunkan melewati s.x, peringkat pertama kembali ke s.from.
      if (s.x <= x0) { lo = s.x; loBy = s.from; } else if (hiBy === null) { hi = s.x; hiBy = s.to; }
    }
    return { x0, top, lo, hi, loBy, hiBy, switches };
  }

  /* ------------------------------------------------------------------ *
   * Uji rank reversal & perbandingan normalisasi
   * ------------------------------------------------------------------ */

  /**
   * Hapus satu alternatif bergantian, hitung ulang, dan periksa apakah urutan alternatif lain berubah.
   * Bobot dibiarkan tetap agar efek yang terlihat murni dari TOPSIS.
   */
  function rankReversal(X, w, types, opts) {
    const m = X.length;
    const base = topsis(X, w, types, opts).C;
    const out = [];
    if (m < 3) return out;
    for (let r = 0; r < m; r++) {
      const keep = X.map((_, i) => i).filter((i) => i !== r);
      const res = topsis(keep.map((i) => X[i]), w, types, opts);
      const newC = new Array(m).fill(null);
      keep.forEach((i, t) => { newC[i] = res.C[t]; });
      const flips = [];
      for (let a = 0; a < keep.length; a++) {
        for (let b = a + 1; b < keep.length; b++) {
          const i = keep[a], k = keep[b];
          const d0 = base[i] - base[k], d1 = newC[i] - newC[k];
          if ((d0 > TIE && d1 < -TIE) || (d0 < -TIE && d1 > TIE)) flips.push([i, k]);
        }
      }
      const order = keep.slice().sort((a, b) => (newC[b] - newC[a]) || (a - b));
      out.push({ removed: r, C: newC, order, flips, changed: flips.length > 0, topChanged: argmax(keep.map((i) => base[i])) !== argmax(keep.map((i) => newC[i])) });
    }
    return out;
  }

  function compareNormalizations(X, w, types, methods) {
    methods = methods || Object.keys(NORMALIZATIONS);
    const res = {};
    for (const mth of methods) {
      const t = topsis(X, w, types, { normalization: mth });
      res[mth] = { C: t.C, rank: t.rank, order: t.order };
    }
    const ref = res.vector || res[methods[0]];
    for (const mth of methods) res[mth].rho = spearman(ref.C, res[mth].C);
    return res;
  }

  return {
    EPS, NORMALIZATIONS, RI_TABLE,
    sum, column, rankDesc, averageRanks, pearson, spearman, argmax, normalizeWeights,
    normalize, idealPoints, topsis, evaluator,
    entropyWeights, criticWeights, ahpWeights, parseJudgment, formatJudgment,
    adjustWeights, gradientCurves, topSwitches, stabilityInterval, rankReversal, compareNormalizations
  };
}));
