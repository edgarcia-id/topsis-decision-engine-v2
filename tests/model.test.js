'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../assets/js/topsis-core.js');
const M = require('../assets/js/model.js');

const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= (tol || 1e-10), `${a} ≠ ${b}`);

test('semua contoh dapat dihitung tanpa galat', () => {
  for (const s of M.SAMPLE_INFO) {
    const p = M.sampleProject(s.id);
    const c = M.compute(p);
    assert.equal(c.ok, true, s.id + ': ' + c.errors.join('; '));
    assert.equal(c.res.C.length, p.alternatives.length);
    close(T.sum(c.weights.w), 1, 1e-12);
  }
});

test('contoh supplier sama dengan kalkulator versi pertama', () => {
  const c = M.compute(M.sampleProject('supplier'));
  assert.deepEqual(c.res.rank, [3, 1, 2]);
  close(c.res.C[1], 0.5633017079480954, 1e-12);
});

test('contoh AHP-TOPSIS konsisten (CR < 0,1)', () => {
  const c = M.compute(M.sampleProject('laptop'));
  assert.equal(c.weights.method, 'ahp');
  assert.ok(c.weights.info.CR < 0.1, 'CR ' + c.weights.info.CR);
  assert.equal(c.weights.info.missing, 0);
  assert.ok(c.weights.w[0] > c.weights.w[1] && c.weights.w[1] > c.weights.w[2] && c.weights.w[2] > c.weights.w[3]);
});

test('normalizeProject: membersihkan id ganda, nilai bukan angka, penilaian kriteria hilang', () => {
  const raw = {
    app: 'topsis-decision-engine', meta: { title: '' },
    criteria: [{ id: 'k1', name: 'Harga', type: 'cost', weight: 2 }, { id: 'k1', name: 'Mutu', type: 'x', weight: -3 }],
    alternatives: [{ id: 'a1', name: 'A' }, { name: '' }],
    values: { a1: { k1: 5, zz: 3 } },
    weighting: { method: 'ahp', ahp: { 'k1>zz': 3 } },
    settings: { normalization: 'aneh', decimals: 9 }
  };
  const p = M.normalizeProject(raw);
  assert.equal(p.meta.title, 'Proyek TOPSIS');
  assert.notEqual(p.criteria[0].id, p.criteria[1].id);
  assert.equal(p.criteria[1].type, 'benefit');
  assert.equal(p.criteria[1].weight, 1);
  assert.equal(p.alternatives[1].name, 'Alternatif 2');
  assert.deepEqual(p.values, { a1: { k1: 5 } });
  assert.deepEqual(p.weighting.ahp, {});
  assert.equal(p.settings.normalization, 'vector');
  assert.equal(p.settings.decimals, 4);
  assert.throws(() => M.normalizeProject({ app: 'ahp-decision-engine', nodes: [] }), /proyek AHP/);
});

test('parseNumber: format Indonesia dan Inggris', () => {
  const P = M.parseNumber;
  assert.equal(P('3,5', ','), 3.5);
  assert.equal(P('3.5', ','), 3.5);
  assert.equal(P('1.234', ','), 1234);
  assert.equal(P('1.234', '.'), 1.234);
  assert.equal(P('1.234.567', '.'), 1234567);
  assert.equal(P('1.234,56', '.'), 1234.56);
  assert.equal(P('1,234.56', ','), 1234.56);
  assert.equal(P('0.125', ','), 0.125);
  assert.equal(P('Rp 12.500', ','), 12500);
  assert.equal(P('85%', ','), 85);
  assert.equal(P('(12)', ','), -12);
  assert.equal(P('', ','), null);
  assert.ok(Number.isNaN(P('abc', ',')));
  assert.ok(Number.isNaN(P('12a', ',')));
});

test('tempel dari Excel: judul, kolom nama, baris jenis & bobot', () => {
  const text = 'Alternatif\tKualitas\tHarga\tWaktu\nJenis\tBenefit\tCost\tbiaya\nBobot\t40\t35\t25\nSupplier A\t8\t10,5\t3\nSupplier B\t9\t12\t2\nSupplier C\t7\t9,25\t4\n';
  const g = M.interpretGrid(M.parseGrid(text), ',');
  assert.deepEqual(g.names, ['Kualitas', 'Harga', 'Waktu']);
  assert.deepEqual(g.types, ['benefit', 'cost', 'cost']);
  assert.deepEqual(g.weights, [40, 35, 25]);
  assert.equal(g.alts.length, 3);
  assert.deepEqual(g.alts[0].values, [8, 10.5, 3]);
  assert.equal(g.decimalSep, ',');
  const p = M.sampleProject('supplier');
  const kualitasId = p.criteria[0].id;
  const r = M.applyGrid(p, g);
  assert.equal(r.criteria, 3);
  assert.equal(p.criteria[0].id, kualitasId, 'kriteria bernama sama mempertahankan id');
  assert.equal(p.criteria[2].type, 'cost');
  assert.equal(M.getValue(p, p.alternatives[2].id, p.criteria[1].id), 9.25);
  assert.equal(M.compute(p).ok, true);
});

test('tempel angka saja (tanpa judul & nama) memakai kriteria yang ada', () => {
  const p = M.sampleProject('supplier');
  const ids = p.criteria.map((c) => c.id);
  const g = M.interpretGrid(M.parseGrid('1\t2\t3\n4\t5\t6'), ',');
  assert.equal(g.hasHeader, false);
  assert.equal(g.hasNameCol, false);
  M.applyGrid(p, g);
  assert.deepEqual(p.criteria.map((c) => c.id), ids);
  assert.equal(p.alternatives.length, 2);
  assert.equal(M.getValue(p, p.alternatives[1].id, ids[2]), 6);
});

test('CSV berpemisah titik koma (Excel Indonesia) dan satu kolom berkoma desimal', () => {
  const g = M.interpretGrid(M.parseGrid('Nama;IPK;Gaji\nA;3,5;4,25\nB;3,75;2\n'), ',');
  assert.deepEqual(g.names, ['IPK', 'Gaji']);
  assert.deepEqual(g.alts[1].values, [3.75, 2]);
  const one = M.parseGrid('3,5\n4,25\n');
  assert.deepEqual(one, [['3,5'], ['4,25']]);
  const en = M.interpretGrid(M.parseGrid('name,a,b\nX,"1,200.5",2.25\nY,800,1.5\n'), ',');
  assert.deepEqual(en.alts[0].values, [1200.5, 2.25]);
});

test('dataRows dapat diimpor kembali tanpa kehilangan informasi', () => {
  const p = M.sampleProject('beasiswa');
  const rows = M.dataRows(p);
  const g = M.interpretGrid(rows.map((r) => r.map(String)), ',');
  const q = M.newProject();
  M.applyGrid(q, g);
  assert.deepEqual(q.criteria.map((c) => [c.name, c.type, c.weight, c.unit]), p.criteria.map((c) => [c.name, c.type, c.weight, c.unit]));
  const a = M.compute(p), b = M.compute(q);
  a.res.C.forEach((v, i) => close(v, b.res.C[i], 1e-12));
});

test('compute melaporkan sel kosong, bobot nol, dan metode objektif tanpa data', () => {
  const p = M.sampleProject('supplier');
  M.setValue(p, p.alternatives[0].id, p.criteria[0].id, null);
  let c = M.compute(p);
  assert.equal(c.ok, false);
  assert.match(c.errors.join(' '), /1 sel/);
  p.weighting.method = 'entropy';
  c = M.compute(p);
  assert.match(c.errors.join(' '), /Entropy/);
  const q = M.sampleProject('supplier');
  q.criteria.forEach((x) => { x.weight = 0; });
  assert.match(M.compute(q).errors.join(' '), /bobot/i);
});

test('penilaian AHP simetris dan prune setelah kriteria dihapus', () => {
  const p = M.sampleProject('laptop');
  const [a, b] = p.criteria;
  close(M.getJudgment(p, b.id, a.id), 0.5);
  M.setJudgment(p, b.id, a.id, 4);
  close(M.getJudgment(p, a.id, b.id), 0.25);
  assert.equal(Object.keys(p.weighting.ahp).filter((k) => k.includes(a.id) && k.includes(b.id)).length, 1);
  p.criteria.splice(0, 1);
  M.prune(p);
  assert.ok(Object.keys(p.weighting.ahp).every((k) => !k.includes(a.id)));
});

test('impor proyek AHP Decision Engine: nama kriteria daun + bobot global + data nyata', () => {
  const AHPModel = require('../assets/js/ahp/model.js');
  const ahp = AHPModel.normalizeProject(AHPModel.sampleProject('laptop'));
  const comp = AHPModel.compute(ahp, 'combined');
  const p = M.newProject();
  const r = M.importAhpProject(p, ahp, AHPModel);
  assert.equal(r.criteria, comp.synth.leaves.length);
  close(T.sum(p.criteria.map((c) => c.weight)), 100, 1e-6);
  assert.equal(p.alternatives.length, ahp.alternatives.length);
  const leaf = comp.synth.leaves.find((id) => AHPModel.nodeById(ahp, id).mode === 'data');
  if (leaf) {
    const node = AHPModel.nodeById(ahp, leaf);
    const cr = p.criteria.find((c) => c.name === node.name);
    assert.equal(cr.type, node.dataType === 'cost' ? 'cost' : 'benefit');
    const v = ahp.data[leaf][ahp.alternatives[0].id];
    if (typeof v === 'number') assert.equal(M.getValue(p, p.alternatives[0].id, cr.id), v);
  }
});

test('encode/decode tautan proyek', async () => {
  const p = M.sampleProject('lokasi');
  const code = await M.encodePayload(p);
  const back = M.normalizeProject(await M.decodePayload('https://x/#proyek=' + code));
  assert.deepEqual(back.values, p.values);
  assert.equal(back.weighting.method, 'entropy');
});
