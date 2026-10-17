'use strict';
// Jalankan: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../assets/js/topsis-core.js');
const FX = require('./fixtures-numpy.json');

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= (tol || 1e-10), `${msg || ''} ${a} ≠ ${b}`);
const closeArr = (a, b, tol, msg) => { assert.equal(a.length, b.length, msg); a.forEach((v, i) => close(v, b[i], tol, `${msg || ''}[${i}]`)); };

test('contoh supplier repo asli: C* dan peringkat', () => {
  const r = T.topsis([[8, 7, 10], [9, 8, 12], [7, 9, 9]], [40, 35, 25], ['benefit', 'benefit', 'cost']);
  closeArr(r.w, [0.4, 0.35, 0.25]);
  closeArr(r.C, [0.4014692107065493, 0.5633017079480954, 0.5318128638578332], 1e-12);
  assert.deepEqual(r.rank, [3, 1, 2]);
  assert.deepEqual(r.order, [1, 2, 0]);
  close(r.info[0].divisor, Math.sqrt(64 + 81 + 49));
});

test('cocok dengan implementasi numpy independen (4 normalisasi, 26 kasus)', () => {
  for (const c of FX.cases) {
    for (const mth of ['vector', 'linear', 'minmax', 'sum']) {
      const r = T.topsis(c.X, c.w, c.types, { normalization: mth });
      const ref = c.res[mth];
      const tag = `${c.name}/${mth}`;
      r.R.forEach((row, i) => closeArr(row, ref.R[i], 1e-10, tag + ' R'));
      r.V.forEach((row, i) => closeArr(row, ref.V[i], 1e-10, tag + ' V'));
      closeArr(r.Apos, ref.Apos, 1e-10, tag + ' A+');
      closeArr(r.Aneg, ref.Aneg, 1e-10, tag + ' A-');
      closeArr(r.Dpos, ref.Dpos, 1e-10, tag + ' D+');
      closeArr(r.Dneg, ref.Dneg, 1e-10, tag + ' D-');
      closeArr(r.C, ref.C, 1e-10, tag + ' C');
    }
  }
});

test('bobot entropy dan CRITIC cocok dengan numpy', () => {
  for (const c of FX.cases) {
    const e = T.entropyWeights(c.X);
    closeArr(e.E, c.entropy.E, 1e-10, c.name + ' E');
    closeArr(e.w, c.entropy.w, 1e-10, c.name + ' w entropy');
    if (c.critic) {
      const k = T.criticWeights(c.X, c.types);
      closeArr(k.sigma, c.critic.sigma, 1e-10, c.name + ' sigma');
      closeArr(k.w, c.critic.w, 1e-9, c.name + ' w critic');
    }
  }
});

test('AHP: vektor eigen, λ maks, CR cocok dengan numpy.linalg.eig', () => {
  for (const c of FX.ahp) {
    const r = T.ahpWeights(c.A);
    closeArr(r.w, c.w, 1e-9, 'w');
    close(r.lambdaMax, c.lambdaMax, 1e-9, 'lambda');
    close(r.CR, c.CR, 1e-9, 'CR');
  }
});

test('AHP Harker: matriks lengkap yang konsisten bisa direkonstruksi dari penilaian sebagian', () => {
  const v = [5, 3, 1.5, 1];
  const full = v.map((a) => v.map((b) => a / b));
  const partial = full.map((row, i) => row.map((x, j) => ((i === 0 && j === 3) || (i === 3 && j === 0) || (i === 1 && j === 2) || (i === 2 && j === 1) ? null : x)));
  const r = T.ahpWeights(partial);
  closeArr(r.w, v.map((x) => x / 10.5), 1e-9);
  close(r.CR, 0, 1e-9);
  assert.equal(r.missing, 2);
  assert.equal(r.disconnected, false);
});

test('parse & format penilaian', () => {
  assert.equal(T.parseJudgment('1/3'), 1 / 3);
  assert.equal(T.parseJudgment('2,5'), 2.5);
  assert.equal(T.parseJudgment(''), null);
  assert.ok(Number.isNaN(T.parseJudgment('abc')));
  assert.ok(Number.isNaN(T.parseJudgment('-2')));
  assert.equal(T.formatJudgment(1 / 7), '1/7');
  assert.equal(T.formatJudgment(5), '5');
});

test('peringkat seri mengikuti RANK() Excel', () => {
  assert.deepEqual(T.rankDesc([0.5, 0.7, 0.5, 0.2]), [2, 1, 2, 4]);
  assert.deepEqual(T.averageRanks([0.5, 0.7, 0.5, 0.2]), [2.5, 1, 2.5, 4]);
  close(T.spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
  close(T.spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1);
});

test('kasus tepi: kolom nol, semua alternatif identik, kolom konstan', () => {
  const r = T.topsis([[0, 5], [0, 7]], [1, 1], ['benefit', 'cost']);
  assert.equal(r.info[0].zero, true);
  closeArr(r.C, [1, 0]);
  const same = T.topsis([[3, 3], [3, 3]], [1, 1], ['benefit', 'benefit']);
  closeArr(same.C, [0.5, 0.5]);
  const e = T.entropyWeights([[2, 1], [2, 5], [2, 9]]);
  close(e.w[0], 0, 1e-12);
  close(e.w[1], 1, 1e-12);
  const k = T.criticWeights([[2, 1, 4], [2, 5, 3], [2, 9, 8]], ['benefit', 'benefit', 'cost']);
  close(k.w[0], 0, 1e-12);
});

test('adjustWeights menjaga total 1 dan proporsi bobot lain', () => {
  const w = T.adjustWeights([0.5, 0.3, 0.2], 0, 0.8);
  closeArr(w, [0.8, 0.12, 0.08]);
  closeArr(T.adjustWeights([1, 0, 0], 0, 0.4), [0.4, 0.3, 0.3]);
});

test('evaluator cepat = topsis penuh', () => {
  const c = FX.cases[5];
  const ev = T.evaluator(c.X, c.types, { normalization: 'vector' });
  const w = T.normalizeWeights(c.w);
  closeArr(ev(w), T.topsis(c.X, c.w, c.types).C, 1e-12);
});

test('interval stabilitas: peringkat pertama tetap di dalam interval dan berganti di luar', () => {
  for (const c of FX.cases.slice(0, 12)) {
    const ev = T.evaluator(c.X, c.types, {});
    const w0 = T.normalizeWeights(c.w);
    for (let idx = 0; idx < w0.length; idx++) {
      const s = T.stabilityInterval(ev, w0, idx);
      assert.ok(s.lo <= s.x0 + 1e-9 && s.hi >= s.x0 - 1e-9, 'x0 di dalam interval');
      const topAt = (x) => T.argmax(ev(T.adjustWeights(w0, idx, x)));
      for (const f of [0.1, 0.5, 0.9]) {
        const x = s.lo + (s.hi - s.lo) * f;
        // abaikan segmen sempit yang lolos dari kisi pemindaian
        if (s.hi - s.lo > 0.01) assert.equal(topAt(x), s.top, `${c.name} idx ${idx} x ${x}`);
      }
      if (s.hiBy !== null) assert.equal(topAt(Math.min(1, s.hi + 1e-5)), s.hiBy);
      if (s.loBy !== null) assert.equal(topAt(Math.max(0, s.lo - 1e-5)), s.loBy);
    }
  }
});

test('rank reversal: deteksi pasangan yang bertukar urutan', () => {
  // Contoh klasik: menghapus alternatif mengubah nilai normalisasi vektor
  const X = [[1, 9], [9, 1], [5, 5.2], [4.6, 5]];
  const rr = T.rankReversal(X, [1, 1], ['benefit', 'benefit'], {});
  assert.equal(rr.length, 4);
  rr.forEach((r) => { assert.equal(r.C[r.removed], null); assert.equal(r.order.length, 3); });
  const T2 = T.rankReversal([[1, 2], [2, 1]], [1, 1], ['benefit', 'benefit'], {});
  assert.equal(T2.length, 0);
});

test('perbandingan normalisasi menghasilkan rho = 1 untuk metode acuan', () => {
  const c = FX.cases[0];
  const r = T.compareNormalizations(c.X, c.w, c.types);
  close(r.vector.rho, 1);
  assert.deepEqual(Object.keys(r), ['vector', 'linear', 'minmax', 'sum']);
});
