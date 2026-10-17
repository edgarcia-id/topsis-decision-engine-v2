/*!
 * TOPSIS Decision Engine — diagram SVG (tanpa pustaka)
 * (c) 2026 Alfredo Garcia — MIT License
 *
 * Setiap fungsi mengembalikan { svg, width, height, table, meta }:
 *  - svg   : string SVG mandiri (warna eksplisit, siap diekspor PNG/SVG/PDF)
 *  - table : { head: [...], rows: [[...]] } untuk tampilan tabel aksesibel
 *  - meta  : geometri untuk interaksi (crosshair)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TopsisCharts = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FONT = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

  // Palet kategorikal tervalidasi (aman untuk buta warna, urutan tetap). Warna alternatif k selalu sama di semua diagram.
  const THEMES = {
    light: {
      name: 'light', surface: '#ffffff', ink: '#182230', ink2: '#475569', muted: '#64748b',
      grid: '#e2e8f0', axis: '#cbd5e1', band: '#eef2ff', brand: '#4f46e5', navy: '#312e81',
      good: '#059669', critical: '#e11d48', seqLo: '#eef2ff', seqHi: '#312e81',
      series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
      overflow: '#94a3b8'
    }
  };

  let locale = { decimalSep: ',' };
  function setLocale(l) { locale = Object.assign({}, locale, l || {}); }
  function num(x, d) {
    if (x === null || x === undefined || !isFinite(x)) return '–';
    let s = Number(x).toFixed(d === undefined ? 2 : d);
    if (/^-0[.,]?0*$/.test(s)) s = s.slice(1);
    return locale.decimalSep === ',' ? s.replace('.', ',') : s;
  }
  function pct(x, d) { return num(x * 100, d === undefined ? 1 : d) + '%'; }

  function colorAt(theme, i) { return i < theme.series.length ? theme.series[i] : theme.overflow; }

  /* ------------------------------------------------------------------ *
   * Primitif
   * ------------------------------------------------------------------ */

  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function f(n) { return Math.round(n * 100) / 100; }
  function attrs(o) {
    let s = '';
    for (const k of Object.keys(o)) if (o[k] !== undefined && o[k] !== null && o[k] !== false) s += ' ' + k + '="' + esc(o[k]) + '"';
    return s;
  }
  function text(x, y, s, o) {
    o = o || {};
    return '<text' + attrs({
      x: f(x), y: f(y), 'font-size': o.size || 12, 'font-weight': o.weight || null,
      fill: o.fill, 'text-anchor': o.anchor || null, 'dominant-baseline': o.baseline || 'middle',
      'font-variant-numeric': o.tabular ? 'tabular-nums' : null, opacity: o.opacity, transform: o.transform || null
    }) + '>' + esc(s) + '</text>';
  }
  function line(x1, y1, x2, y2, stroke, w, extra) {
    return '<line' + attrs(Object.assign({ x1: f(x1), y1: f(y1), x2: f(x2), y2: f(y2), stroke, 'stroke-width': w || 1 }, extra || {})) + '/>';
  }
  /** Batang horizontal: ujung data membulat 4px, sisi baseline persegi. */
  function hbar(x0, y, len, h, fill, extra) {
    len = Math.max(0, len);
    if (len < 0.5) return '';
    const r = Math.min(4, len, h / 2);
    const x1 = x0 + len;
    const d = `M${f(x0)},${f(y)}H${f(x1 - r)}Q${f(x1)},${f(y)} ${f(x1)},${f(y + r)}V${f(y + h - r)}Q${f(x1)},${f(y + h)} ${f(x1 - r)},${f(y + h)}H${f(x0)}Z`;
    return '<path' + attrs(Object.assign({ d, fill }, extra || {})) + '/>';
  }

  let measureCtx = null;
  function measure(s, size, weight) {
    s = String(s);
    if (typeof document !== 'undefined') {
      try {
        if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
        measureCtx.font = (weight || 400) + ' ' + size + 'px ' + FONT;
        return measureCtx.measureText(s).width;
      } catch (e) { /* fallback */ }
    }
    return s.length * size * 0.56;
  }
  function ellipsize(s, maxW, size, weight) {
    s = String(s);
    if (measure(s, size, weight) <= maxW) return s;
    let lo = 0, hi = s.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (measure(s.slice(0, mid) + '…', size, weight) <= maxW) lo = mid; else hi = mid - 1;
    }
    return s.slice(0, Math.max(1, lo)).trimEnd() + '…';
  }
  function wrap(s, maxW, size, lines, weight) {
    const words = String(s).split(/\s+/).filter(Boolean);
    const out = [];
    let cur = '';
    for (let i = 0; i < words.length; i++) {
      const tryS = cur ? cur + ' ' + words[i] : words[i];
      if (measure(tryS, size, weight) <= maxW || !cur) { cur = tryS; continue; }
      out.push(cur);
      cur = words[i];
      if (out.length === lines - 1) { cur = words.slice(i).join(' '); break; }
    }
    if (cur) out.push(cur);
    return out.slice(0, lines).map((l, i) => (i === lines - 1 || measure(l, size, weight) > maxW ? ellipsize(l, maxW, size, weight) : l));
  }
  function niceMax(v) {
    if (!(v > 0)) return 1;
    const exp = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / exp;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * exp;
  }
  function ticks(max, count) {
    const step = niceMax(max / (count || 4));
    const out = [];
    for (let v = 0; v <= max + step * 1e-6; v += step) out.push(+v.toFixed(10));
    return out;
  }
  function decimalsFor(step) {
    for (let d = 0; d <= 6; d++) { const s = step * Math.pow(10, d); if (Math.abs(Math.round(s) - s) < 1e-7) return d; }
    return 6;
  }
  function mix(hex, toHex, t) {
    const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const a = p(hex), b = p(toHex);
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }
  function luminance(hex) {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function onColor(hex) { return luminance(hex) > 0.36 ? '#14213d' : '#ffffff'; }

  function open(w, h, theme, label) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(w)} ${f(h)}" width="${f(w)}" height="${f(h)}" font-family="${esc(FONT)}" role="img" aria-label="${esc(label || '')}">` +
      `<rect width="${f(w)}" height="${f(h)}" fill="${theme.surface}"/>`;
  }
  function legend(items, x, y, maxW, theme) {
    let cx = x, cy = y, out = '';
    const size = 12, gap = 18, rowH = 20;
    for (const it of items) {
      const label = ellipsize(it.label, Math.min(200, maxW - 24), size);
      const w = 16 + measure(label, size) + gap;
      if (cx + w > x + maxW && cx > x) { cx = x; cy += rowH; }
      if (it.shape === 'line') out += line(cx, cy, cx + 12, cy, it.color, 2.5, { 'stroke-linecap': 'round' });
      else if (it.shape === 'dot') out += `<circle cx="${f(cx + 6)}" cy="${f(cy)}" r="5" fill="${it.color}"/>`;
      else out += `<rect x="${f(cx)}" y="${f(cy - 6)}" width="12" height="12" rx="3" fill="${it.color}"/>`;
      out += text(cx + 17, cy + 0.5, label, { fill: theme.ink2, size });
      cx += w;
    }
    return { svg: out, height: cy - y + rowH };
  }
  function legendHeight(items, maxW) {
    let cx = 0, rows = 1;
    for (const it of items) {
      const w = 16 + Math.min(measure(it.label, 12), 200) + 18;
      if (cx + w > maxW && cx > 0) { cx = 0; rows++; }
      cx += w;
    }
    return rows * 20;
  }
  function finish(svg, w, h, table, meta) { return { svg: svg + '</svg>', width: w, height: h, table, meta: meta || {} }; }

  /* ------------------------------------------------------------------ *
   * 1. Nilai preferensi C* (peringkat)
   * ------------------------------------------------------------------ */

  function closeness(items, theme, opts) {
    // items: [{name, value, k}] — k = indeks alternatif (untuk warna titik)
    opts = opts || {};
    const W = Math.max(320, opts.width || 640);
    const d = opts.decimals === undefined ? 4 : opts.decimals;
    const sorted = items.map((x, i) => Object.assign({ i }, x)).sort((a, b) => (b.value - a.value) || (a.i - b.i));
    const labelW = Math.min(Math.max(...sorted.map((x, r) => measure(`${r + 1}. ${x.name}`, 13, 600)), 60) + 16, W * 0.4);
    const valueW = 62, ROW = 34, BAR = 20, TOP = 6, AX = 26;
    const plotW = W - labelW - valueW - 6;
    const H = TOP + sorted.length * ROW + AX;
    const xOf = (v) => labelW + plotW * Math.max(0, Math.min(1, v));
    let s = open(W, H, theme, 'Nilai preferensi C* tiap alternatif');
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      s += line(xOf(t), TOP, xOf(t), H - AX + 2, t === 0 ? theme.axis : theme.grid, 1);
      s += text(xOf(t), H - AX + 14, num(t, 2), { anchor: 'middle', fill: theme.muted, size: 10.5, tabular: true });
    }
    let prevRank = 0, prevV = null;
    sorted.forEach((it, r) => {
      const rank = prevV !== null && Math.abs(prevV - it.value) < 1e-10 ? prevRank : r + 1;
      prevRank = rank; prevV = it.value;
      const y = TOP + r * ROW + (ROW - BAR) / 2;
      const len = plotW * Math.max(0, Math.min(1, it.value));
      const top = rank === 1;
      s += `<g data-tip="${esc(`Peringkat ${rank}: ${it.name}\nC* = ${num(it.value, d)}`)}">`;
      s += `<rect x="0" y="${f(TOP + r * ROW)}" width="${f(W)}" height="${ROW}" fill="transparent"/>`;
      s += text(labelW - 10, y + BAR / 2, ellipsize(`${rank}. ${it.name}`, labelW - 14, 13, top ? 700 : 500), { anchor: 'end', fill: theme.ink, size: 13, weight: top ? 700 : 500 });
      s += hbar(labelW, y, len, BAR, top ? theme.brand : mix(theme.brand, theme.surface, 0.42));
      s += text(labelW + len + 8, y + BAR / 2, num(it.value, d), { fill: theme.ink, size: 12.5, weight: top ? 700 : 500, tabular: true });
      s += '</g>';
    });
    return finish(s, W, H, { head: ['Peringkat', 'Alternatif', 'C*'], rows: sorted.map((x, r) => [r + 1, x.name, num(x.value, d)]) });
  }

  /* ------------------------------------------------------------------ *
   * 2. Peta jarak D+ vs D−
   * ------------------------------------------------------------------ */

  function distanceMap(d, theme, opts) {
    // d: points [{name, dpos, dneg, c, k}], decimals
    opts = opts || {};
    const W = Math.max(320, Math.min(opts.width || 600, 680));
    const dec = d.decimals === undefined ? 4 : d.decimals;
    const left = 58, right = 24, top = 18, bottom = 50;
    const H = Math.round(Math.min(W * 0.78, 480));
    const plotW = W - left - right, plotH = H - top - bottom;
    const maxX = niceMax(Math.max(...d.points.map((p) => p.dpos), 1e-9) * 1.12);
    const maxY = niceMax(Math.max(...d.points.map((p) => p.dneg), 1e-9) * 1.12);
    const xOf = (v) => left + plotW * v / maxX;
    const yOf = (v) => top + plotH - plotH * v / maxY;
    let s = open(W, H, theme, 'Peta jarak ke solusi ideal positif dan negatif');
    const tx = ticks(maxX, 4), ty = ticks(maxY, 4);
    const dx = decimalsFor(tx[1] - tx[0] || 1), dy = decimalsFor(ty[1] - ty[0] || 1);
    for (const t of tx) { s += line(xOf(t), top, xOf(t), top + plotH, theme.grid, 1); s += text(xOf(t), top + plotH + 14, num(t, dx), { anchor: 'middle', fill: theme.muted, size: 10.5, tabular: true }); }
    for (const t of ty) { s += line(left, yOf(t), left + plotW, yOf(t), theme.grid, 1); s += text(left - 8, yOf(t), num(t, dy), { anchor: 'end', fill: theme.muted, size: 10.5, tabular: true }); }
    // garis iso-C*: D− = C/(1−C) · D+
    s += `<clipPath id="dm-clip"><rect x="${f(left)}" y="${f(top)}" width="${f(plotW)}" height="${f(plotH)}"/></clipPath><g clip-path="url(#dm-clip)">`;
    for (const c of [0.25, 0.5, 0.75]) {
      const k = c / (1 - c);
      let x2 = maxX, y2 = k * maxX;
      if (y2 > maxY) { y2 = maxY; x2 = maxY / k; }
      s += line(xOf(0), yOf(0), xOf(x2), yOf(y2), theme.axis, 1.2, { 'stroke-dasharray': '5 4' });
    }
    s += '</g>';
    const fixedBoxes = [];
    const boxAt = (lx, ly, w, anchor) => { const x1 = anchor === 'start' ? lx : anchor === 'end' ? lx - w : lx - w / 2; return { x1, x2: x1 + w, y1: ly - 7, y2: ly + 7 }; };
    for (const c of [0.25, 0.5, 0.75]) {
      const k = c / (1 - c);
      let x2 = maxX, y2 = k * maxX;
      const onTop = y2 > maxY;
      if (onTop) { y2 = maxY; x2 = maxY / k; }
      const lab = `C* = ${num(c, 2)}`;
      const w = measure(lab, 10);
      const lx = onTop ? Math.max(left + w / 2 + 2, Math.min(xOf(x2), left + plotW - w / 2 - 2)) : xOf(x2) - 4;
      const ly = yOf(y2) + (onTop ? 9 : -8);
      fixedBoxes.push(boxAt(lx, ly, w, onTop ? 'middle' : 'end'));
      s += text(lx, ly, lab, { anchor: onTop ? 'middle' : 'end', fill: theme.muted, size: 10 });
    }
    s += line(left, top + plotH, left + plotW, top + plotH, theme.axis, 1);
    s += line(left, top, left, top + plotH, theme.axis, 1);
    const hint = '↖ lebih dekat ke ideal';
    const hb = boxAt(left + 8, top + 10, measure(hint, 11, 600), 'start');
    if (!fixedBoxes.some((q) => hb.x1 < q.x2 && hb.x2 > q.x1 && hb.y1 < q.y2 && hb.y2 > q.y1)) {
      fixedBoxes.push(hb);
      s += text(left + 8, top + 10, hint, { fill: theme.good, size: 11, weight: 600 });
    }
    s += text(left + plotW / 2, H - 10, 'D+ (jarak ke solusi ideal positif, makin kecil makin baik)', { anchor: 'middle', fill: theme.ink2, size: 11, weight: 600 });
    s += text(13, top + plotH / 2, 'D− (jarak ke ideal negatif)', { anchor: 'middle', fill: theme.ink2, size: 11, weight: 600, transform: `rotate(-90 13 ${f(top + plotH / 2)})` });
    // Penempatan label: coba beberapa posisi, pilih yang tidak menabrak titik lain atau label sebelumnya.
    const order = d.points.map((p, i) => i).sort((a, b) => d.points[b].c - d.points[a].c);
    const dots = d.points.map((p) => ({ x: xOf(p.dpos), y: yOf(p.dneg) }));
    const boxes = fixedBoxes.slice();
    const hit = (b) => boxes.some((q) => b.x1 < q.x2 && b.x2 > q.x1 && b.y1 < q.y2 && b.y2 > q.y1) ||
      dots.some((pt) => pt.x > b.x1 - 8 && pt.x < b.x2 + 8 && pt.y > b.y1 - 8 && pt.y < b.y2 + 8) ||
      b.x1 < left + 2 || b.x2 > left + plotW - 2 || b.y1 < top || b.y2 > top + plotH;
    let marks = '';
    order.forEach((i, r) => {
      const p = d.points[i];
      const { x, y } = dots[i];
      const col = colorAt(theme, p.k === undefined ? i : p.k);
      marks += `<circle cx="${f(x)}" cy="${f(y)}" r="${r === 0 ? 7.5 : 6.5}" fill="${col}" stroke="${r === 0 ? theme.ink : theme.surface}" stroke-width="2" data-tip="${esc(`${p.name}\nD+ = ${num(p.dpos, dec)}\nD− = ${num(p.dneg, dec)}\nC* = ${num(p.c, dec)}`)}"/>`;
      const label = ellipsize(p.name, 140, 11.5, 600);
      const w = measure(label, 11.5, 600), h = 14;
      const cands = [[x + 11, y, 'start'], [x - 11, y, 'end'], [x, y - 15, 'middle'], [x, y + 16, 'middle'], [x + 9, y - 13, 'start'], [x + 9, y + 13, 'start'], [x - 9, y - 13, 'end'], [x - 9, y + 13, 'end']];
      const boxOf = ([lx, ly, a]) => { const x1 = a === 'start' ? lx : a === 'end' ? lx - w : lx - w / 2; return { x1, x2: x1 + w, y1: ly - h / 2, y2: ly + h / 2 }; };
      // titik sendiri tidak dihitung sebagai tabrakan
      const own = dots[i];
      dots[i] = { x: -1e6, y: -1e6 };
      let pick = cands.find((cnd) => !hit(boxOf(cnd))) || cands[0];
      dots[i] = own;
      boxes.push(boxOf(pick));
      marks += text(pick[0], pick[1], label, { anchor: pick[2], fill: theme.ink, size: 11.5, weight: 600 });
    });
    s += marks;
    return finish(s, W, H, { head: ['Alternatif', 'D+', 'D−', 'C*'], rows: order.map((i) => { const p = d.points[i]; return [p.name, num(p.dpos, dec), num(p.dneg, dec), num(p.c, dec)]; }) });
  }

  /* ------------------------------------------------------------------ *
   * 3. Peta panas kinerja relatif per kriteria
   * ------------------------------------------------------------------ */

  function heatmap(d, theme, opts) {
    // d: rows [{name, rank}], cols [{name, type}], vals[i][j] ∈ [0,1] | null, extra {name, vals[i]} (opsional)
    opts = opts || {};
    const W0 = Math.max(320, opts.width || 760);
    const n = d.cols.length + (d.extra ? 1 : 0);
    const labelW = Math.min(Math.max(...d.rows.map((r) => measure(`${r.rank}. ${r.name}`, 12.5, 600)), 60) + 14, Math.max(110, W0 * 0.28));
    const cellW = Math.max(62, Math.min(150, (W0 - labelW - 8 - (d.extra ? 10 : 0)) / n));
    const W = Math.max(W0, labelW + cellW * n + 8 + (d.extra ? 10 : 0));
    const headLines = d.cols.map((c) => wrap(c.name, cellW - 8, 11.5, 2, 600));
    const headH = 18 + Math.max(...headLines.map((l) => l.length)) * 14 + 14;
    const ROW = 32;
    const legendH = 34;
    const H = headH + d.rows.length * ROW + legendH;
    let s = open(W, H, theme, 'Peta panas kinerja relatif alternatif per kriteria');
    const colX = (j) => labelW + j * cellW + (d.extra && j >= d.cols.length ? 10 : 0);
    d.cols.forEach((c, j) => {
      const cx = colX(j) + cellW / 2;
      headLines[j].forEach((l, li) => { s += text(cx, 14 + li * 14, l, { anchor: 'middle', fill: theme.ink, size: 11.5, weight: 600 }); });
      s += text(cx, headH - 10, c.type === 'cost' ? 'cost ↓' : 'benefit ↑', { anchor: 'middle', fill: c.type === 'cost' ? '#b45309' : theme.good, size: 10.5, weight: 600 });
    });
    if (d.extra) {
      const cx = colX(d.cols.length) + cellW / 2;
      s += text(cx, 14, d.extra.name, { anchor: 'middle', fill: theme.navy, size: 12, weight: 700 });
      s += text(cx, headH - 10, 'hasil', { anchor: 'middle', fill: theme.muted, size: 10.5 });
    }
    d.rows.forEach((r, i) => {
      const y = headH + i * ROW;
      s += text(labelW - 10, y + ROW / 2, ellipsize(`${r.rank}. ${r.name}`, labelW - 14, 12.5, r.rank === 1 ? 700 : 500), { anchor: 'end', fill: theme.ink, size: 12.5, weight: r.rank === 1 ? 700 : 500 });
      const cells = d.vals[i].slice();
      if (d.extra) cells.push(d.extra.vals[i]);
      cells.forEach((v, j) => {
        const x = colX(j);
        const isExtra = d.extra && j === d.cols.length;
        const fill = v === null ? theme.grid : mix(theme.seqLo, isExtra ? '#065f46' : theme.seqHi, Math.max(0, Math.min(1, v)));
        const name = isExtra ? d.extra.name : d.cols[j].name;
        const tip = v === null ? `${r.name} — ${name}: semua alternatif sama` : `${r.name} — ${name}: ${num(v, 3)}${isExtra ? '' : ' (1 = setara solusi ideal positif, 0 = setara ideal negatif)'}`;
        s += `<rect x="${f(x + 1.5)}" y="${f(y + 1.5)}" width="${f(cellW - 3)}" height="${ROW - 3}" rx="5" fill="${fill}" data-tip="${esc(tip)}"/>`;
        s += text(x + cellW / 2, y + ROW / 2, v === null ? '–' : num(v, isExtra ? 4 : 2), { anchor: 'middle', fill: v === null ? theme.muted : onColor(fill), size: 11.5, weight: 600, tabular: true });
      });
    });
    // legenda skala
    const ly = H - 18, lx = labelW, lw = Math.min(220, W - labelW - 20);
    s += `<defs><linearGradient id="hm-grad"><stop offset="0" stop-color="${theme.seqLo}"/><stop offset="1" stop-color="${theme.seqHi}"/></linearGradient></defs>`;
    s += text(lx - 8, ly, 'ideal negatif', { anchor: 'end', fill: theme.muted, size: 10.5 });
    s += `<rect x="${f(lx)}" y="${f(ly - 5)}" width="${f(lw)}" height="10" rx="5" fill="url(#hm-grad)"/>`;
    s += text(lx + lw + 8, ly, 'ideal positif', { fill: theme.muted, size: 10.5 });
    const head = ['Alternatif'].concat(d.cols.map((c) => c.name), d.extra ? [d.extra.name] : []);
    return finish(s, W, H, { head, rows: d.rows.map((r, i) => [`${r.rank}. ${r.name}`].concat(d.vals[i].map((v) => (v === null ? '–' : num(v, 3))), d.extra ? [num(d.extra.vals[i], 4)] : [])) });
  }

  /* ------------------------------------------------------------------ *
   * 4. Bobot kriteria
   * ------------------------------------------------------------------ */

  function weightBars(d, theme, opts) {
    // d: items [{name, value, type}], title
    opts = opts || {};
    const W = Math.max(320, opts.width || 640);
    const items = d.items;
    const cB = colorAt(theme, 0), cC = colorAt(theme, 1);
    const leg = [{ label: 'Benefit (makin besar makin baik)', color: cB }, { label: 'Cost (makin kecil makin baik)', color: cC }];
    const legH = legendHeight(leg, W - 8) + 8;
    const labelW = Math.min(Math.max(...items.map((x) => measure(x.name, 13, 500)), 60) + 16, W * 0.4);
    const valueW = 58, ROW = 32, BAR = 18, TOP = legH + 6;
    const plotW = W - labelW - valueW - 6;
    const max = Math.max(...items.map((x) => x.value), 1e-9);
    const H = TOP + items.length * ROW + 6;
    let s = open(W, H, theme, 'Bobot kriteria');
    s += legend(leg, 4, 12, W - 8, theme).svg;
    s += line(labelW, TOP, labelW, H - 4, theme.axis, 1);
    items.forEach((it, r) => {
      const y = TOP + r * ROW + (ROW - BAR) / 2;
      const len = plotW * it.value / max;
      s += `<g data-tip="${esc(`${it.name} (${it.type === 'cost' ? 'cost' : 'benefit'}): ${pct(it.value, 2)}`)}">`;
      s += `<rect x="0" y="${f(TOP + r * ROW)}" width="${f(W)}" height="${ROW}" fill="transparent"/>`;
      s += text(labelW - 10, y + BAR / 2, ellipsize(it.name, labelW - 14, 13, 500), { anchor: 'end', fill: theme.ink, size: 13, weight: 500 });
      s += hbar(labelW, y, len, BAR, it.type === 'cost' ? cC : cB);
      s += text(labelW + len + 8, y + BAR / 2, pct(it.value, 1), { fill: theme.ink, size: 12.5, weight: 600, tabular: true });
      s += '</g>';
    });
    return finish(s, W, H, { head: ['Kriteria', 'Jenis', 'Bobot'], rows: items.map((x) => [x.name, x.type === 'cost' ? 'Cost' : 'Benefit', pct(x.value, 2)]) });
  }

  /* ------------------------------------------------------------------ *
   * 5. Radar profil alternatif
   * ------------------------------------------------------------------ */

  function radar(d, theme, opts) {
    // d: axes [names], series [{name, k, vals[]}] (nilai 0..1)
    opts = opts || {};
    const W = Math.max(320, Math.min(opts.width || 640, 700));
    const leg = d.series.map((x) => ({ label: x.name, color: colorAt(theme, x.k), shape: 'line' }));
    const legH = legendHeight(leg, W - 8) + 10;
    const n = d.axes.length;
    const labelSpace = W < 440 ? 70 : 96;
    const R = Math.max(70, Math.min((W - 2 * labelSpace) / 2, 190));
    const cx = W / 2, cy = legH + 26 + R;
    const H = Math.round(cy + R + 40);
    const ang = (j) => -Math.PI / 2 + 2 * Math.PI * j / n;
    const pt = (j, v) => [cx + Math.cos(ang(j)) * R * v, cy + Math.sin(ang(j)) * R * v];
    let s = open(W, H, theme, 'Radar kinerja relatif alternatif');
    s += legend(leg, 4, 12, W - 8, theme).svg;
    for (const ring of [0.25, 0.5, 0.75, 1]) {
      const pts = d.axes.map((_, j) => pt(j, ring).map(f).join(',')).join(' ');
      s += `<polygon points="${pts}" fill="none" stroke="${ring === 1 ? theme.axis : theme.grid}" stroke-width="1"/>`;
      s += text(cx + 4, cy - R * ring - 6, num(ring, 2), { fill: theme.muted, size: 9.5, tabular: true });
    }
    d.axes.forEach((name, j) => {
      const [x, y] = pt(j, 1);
      s += line(cx, cy, x, y, theme.grid, 1);
      const [lx, ly] = pt(j, 1.12);
      const c = Math.cos(ang(j));
      const anchor = Math.abs(c) < 0.2 ? 'middle' : c > 0 ? 'start' : 'end';
      const lines = wrap(name, labelSpace - 8, 11.5, 2, 600);
      const off = Math.sin(ang(j)) < -0.5 ? -(lines.length - 1) * 13 : Math.sin(ang(j)) > 0.5 ? 0 : -(lines.length - 1) * 6.5;
      lines.forEach((l, li) => { s += text(lx, ly + off + li * 13, l, { anchor, fill: theme.ink, size: 11.5, weight: 600 }); });
    });
    d.series.forEach((se) => {
      const col = colorAt(theme, se.k);
      const pts = se.vals.map((v, j) => pt(j, v === null ? 0 : Math.max(0, Math.min(1, v))).map(f).join(',')).join(' ');
      s += `<polygon points="${pts}" fill="${col}" fill-opacity="0.08" stroke="${col}" stroke-width="2.2" stroke-linejoin="round"/>`;
      se.vals.forEach((v, j) => {
        const [x, y] = pt(j, v === null ? 0 : Math.max(0, Math.min(1, v)));
        s += `<circle cx="${f(x)}" cy="${f(y)}" r="3.5" fill="${col}" data-tip="${esc(`${se.name} — ${d.axes[j]}: ${v === null ? '–' : num(v, 3)}`)}"/>`;
      });
    });
    return finish(s, W, H, { head: ['Alternatif'].concat(d.axes), rows: d.series.map((se) => [se.name].concat(se.vals.map((v) => (v === null ? '–' : num(v, 3))))) });
  }

  /* ------------------------------------------------------------------ *
   * 6. Sensitivitas gradien bobot
   * ------------------------------------------------------------------ */

  function gradient(d, theme, opts) {
    // d: critName, xs[], series[k][], x0, alts [{name}], stability {lo, hi}, switches [{x, from, to, y}]
    opts = opts || {};
    const W = Math.max(340, opts.width || 720);
    const leg = d.alts.map((a, k) => ({ label: a.name, color: colorAt(theme, k), shape: 'line' }));
    const legH = legendHeight(leg, W - 8) + 6;
    const endLabels = d.alts.length <= 6 && W >= 520;
    const endW = endLabels ? Math.min(130, Math.max(...d.alts.map((a) => measure(a.name, 11.5))) + 14) : 0;
    const left = 62, right = 16 + endW, top = legH + 26, bottom = 46;
    const H = top + 250 + bottom;
    const plotH = H - top - bottom, plotW = W - left - right;
    const all = d.series.flat();
    // Sumbu C* diperbesar ke rentang data (dibulatkan ke 0,1) agar perbedaan kecil tetap terlihat.
    const max = Math.min(1, Math.ceil((Math.max(...all) + 0.02) * 10) / 10);
    const min = Math.max(0, Math.floor((Math.min(...all) - 0.02) * 10) / 10);
    const span = Math.max(max - min, 1e-9);
    const xOf = (x) => left + plotW * x;
    const yOf = (v) => top + plotH - plotH * (v - min) / span;
    let s = open(W, H, theme, `Sensitivitas C* terhadap bobot ${d.critName}`);
    s += legend(leg, 4, 12, W - 8, theme).svg;
    if (d.stability && d.alts.length > 1) {
      s += `<rect x="${f(xOf(d.stability.lo))}" y="${f(top)}" width="${f(Math.max(0, xOf(d.stability.hi) - xOf(d.stability.lo)))}" height="${f(plotH)}" fill="${theme.band}"/>`;
    }
    const step = niceMax(span / 4);
    const yd = decimalsFor(step);
    for (let t = Math.ceil(min / step - 1e-9) * step; t <= max + 1e-9; t += step) {
      s += line(left, yOf(t), left + plotW, yOf(t), theme.grid, 1);
      s += text(left - 8, yOf(t), num(t, yd), { anchor: 'end', fill: theme.muted, size: 10.5, tabular: true });
    }
    for (let t = 0; t <= 10; t += 2) s += text(xOf(t / 10), top + plotH + 15, pct(t / 10, 0), { anchor: 'middle', fill: theme.muted, size: 10.5, tabular: true });
    s += line(left, top + plotH, left + plotW, top + plotH, theme.axis, 1);
    s += text(left + plotW / 2, H - 10, `Bobot ${d.critName}`, { anchor: 'middle', fill: theme.ink2, size: 11.5, weight: 600 });
    s += text(14, top + plotH / 2, 'C*', { anchor: 'middle', fill: theme.ink2, size: 11.5, weight: 600, transform: `rotate(-90 14 ${f(top + plotH / 2)})` });
    d.series.forEach((vals, k) => {
      const pts = d.xs.map((x, i) => f(xOf(x)) + ',' + f(yOf(vals[i]))).join(' ');
      s += `<polyline points="${pts}" fill="none" stroke="${colorAt(theme, k)}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
    });
    for (const c of (d.switches || [])) {
      if (c.y === undefined || c.y === null) continue;
      s += `<circle cx="${f(xOf(c.x))}" cy="${f(yOf(c.y))}" r="4.5" fill="${theme.surface}" stroke="${theme.ink}" stroke-width="1.6" data-tip="${esc(`Pada bobot ${pct(c.x, 1)} peringkat pertama berganti dari ${d.alts[c.from].name} ke ${d.alts[c.to].name}`)}"/>`;
    }
    const x0 = xOf(d.x0);
    s += line(x0, top - 6, x0, top + plotH, theme.ink, 1.5);
    s += text(Math.min(Math.max(x0, left + 64), left + plotW - 64), top - 14, `bobot saat ini ${pct(d.x0, 1)}`, { anchor: 'middle', fill: theme.ink, size: 11, weight: 600 });
    if (endLabels) {
      const ends = d.series.map((vals, k) => ({ k, y: yOf(vals[vals.length - 1]) })).sort((a, b) => a.y - b.y);
      let lastY = -Infinity;
      ends.forEach((e) => {
        const y = Math.max(e.y, lastY + 13);
        lastY = y;
        s += text(left + plotW + 8, y, ellipsize(d.alts[e.k].name, endW - 10, 11.5), { fill: colorAt(theme, e.k) === theme.overflow ? theme.ink2 : theme.ink, size: 11.5 });
      });
    }
    const rows = [];
    for (let i = 0; i < d.xs.length; i += Math.max(1, Math.round((d.xs.length - 1) / 10))) rows.push([pct(d.xs[i], 0)].concat(d.series.map((v) => num(v[i], 4))));
    return finish(s, W, H, { head: [`Bobot ${d.critName}`].concat(d.alts.map((a) => a.name)), rows }, { left, top, plotW, plotH, min, max });
  }

  /* ------------------------------------------------------------------ *
   * 7. Perbandingan peringkat antar normalisasi (bump chart)
   * ------------------------------------------------------------------ */

  function bump(d, theme, opts) {
    // d: methods [label], alts [{name, k}], ranks[a][mi]
    opts = opts || {};
    const W = Math.max(340, opts.width || 720);
    const m = d.alts.length, nm = d.methods.length;
    const sideW = Math.min(150, Math.max(...d.alts.map((a) => measure(a.name, 12, 600))) + 34);
    const left = sideW, right = sideW, top = 40, ROW = 30;
    const H = top + m * ROW + 12;
    const plotW = W - left - right;
    const xOf = (mi) => left + (nm > 1 ? plotW * mi / (nm - 1) : plotW / 2);
    const yOf = (r) => top + (r - 0.5) * ROW;
    let s = open(W, H, theme, 'Perbandingan peringkat antar metode normalisasi');
    d.methods.forEach((lab, mi) => {
      const ls = wrap(lab, Math.max(70, plotW / Math.max(1, nm - 1) - 10), 11.5, 2, 600);
      ls.forEach((l, li) => { s += text(xOf(mi), 12 + li * 13, l, { anchor: 'middle', fill: theme.ink, size: 11.5, weight: 600 }); });
      s += line(xOf(mi), top - 4, xOf(mi), H - 8, theme.grid, 1);
    });
    d.alts.forEach((a, ai) => {
      const col = colorAt(theme, a.k);
      const pts = d.ranks[ai].map((r, mi) => f(xOf(mi)) + ',' + f(yOf(r))).join(' ');
      s += `<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round" opacity="0.9"/>`;
      d.ranks[ai].forEach((r, mi) => {
        s += `<circle cx="${f(xOf(mi))}" cy="${f(yOf(r))}" r="9" fill="${col}" data-tip="${esc(`${a.name} — ${d.methods[mi]}: peringkat ${r}`)}"/>`;
        s += text(xOf(mi), yOf(r) + 0.5, r, { anchor: 'middle', fill: onColor(col), size: 10.5, weight: 700, tabular: true });
      });
      s += text(xOf(0) - 16, yOf(d.ranks[ai][0]), ellipsize(a.name, sideW - 22, 12, 600), { anchor: 'end', fill: theme.ink, size: 12, weight: 600 });
      s += text(xOf(nm - 1) + 16, yOf(d.ranks[ai][nm - 1]), ellipsize(a.name, sideW - 22, 12, 500), { fill: theme.ink2, size: 12 });
    });
    return finish(s, W, H, { head: ['Alternatif'].concat(d.methods), rows: d.alts.map((a, ai) => [a.name].concat(d.ranks[ai])) });
  }

  /* ------------------------------------------------------------------ *
   * 8. Jarak D+ dan D− (batang berpasangan)
   * ------------------------------------------------------------------ */

  function distanceBars(d, theme, opts) {
    // d: items [{name, dpos, dneg}] (urutan peringkat), decimals
    opts = opts || {};
    const W = Math.max(320, opts.width || 640);
    const dec = d.decimals === undefined ? 4 : d.decimals;
    const cP = '#e34948', cN = colorAt(theme, 2);
    const leg = [{ label: 'D+ ke ideal positif (kecil = baik)', color: cP }, { label: 'D− ke ideal negatif (besar = baik)', color: cN }];
    const legH = legendHeight(leg, W - 8) + 8;
    const labelW = Math.min(Math.max(...d.items.map((x) => measure(x.name, 12.5, 500)), 60) + 16, W * 0.36);
    const valueW = 64, GROUP = 44, BAR = 14, TOP = legH + 6;
    const plotW = W - labelW - valueW - 6;
    const max = Math.max(...d.items.map((x) => Math.max(x.dpos, x.dneg)), 1e-9);
    const H = TOP + d.items.length * GROUP + 6;
    let s = open(W, H, theme, 'Jarak D+ dan D− tiap alternatif');
    s += legend(leg, 4, 12, W - 8, theme).svg;
    s += line(labelW, TOP, labelW, H - 4, theme.axis, 1);
    d.items.forEach((it, r) => {
      const y = TOP + r * GROUP + (GROUP - 2 * BAR - 3) / 2;
      s += `<g data-tip="${esc(`${it.name}\nD+ = ${num(it.dpos, dec)}\nD− = ${num(it.dneg, dec)}`)}">`;
      s += `<rect x="0" y="${f(TOP + r * GROUP)}" width="${f(W)}" height="${GROUP}" fill="transparent"/>`;
      s += text(labelW - 10, y + BAR + 1.5, ellipsize(it.name, labelW - 14, 12.5, 500), { anchor: 'end', fill: theme.ink, size: 12.5, weight: 500 });
      const l1 = plotW * it.dpos / max, l2 = plotW * it.dneg / max;
      s += hbar(labelW, y, l1, BAR, cP);
      s += text(labelW + l1 + 6, y + BAR / 2, num(it.dpos, dec), { fill: theme.ink2, size: 11, tabular: true });
      s += hbar(labelW, y + BAR + 3, l2, BAR, cN);
      s += text(labelW + l2 + 6, y + BAR * 1.5 + 3, num(it.dneg, dec), { fill: theme.ink2, size: 11, tabular: true });
      s += '</g>';
    });
    return finish(s, W, H, { head: ['Alternatif', 'D+', 'D−'], rows: d.items.map((x) => [x.name, num(x.dpos, dec), num(x.dneg, dec)]) });
  }

  return {
    THEMES, FONT, setLocale, num, pct, colorAt, esc, mix, measure, ellipsize, wrap, niceMax,
    closeness, distanceMap, heatmap, weightBars, radar, gradient, bump, distanceBars
  };
}));
