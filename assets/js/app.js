/*!
 * TOPSIS Decision Engine — antarmuka
 * (c) 2026 Alfredo Garcia — MIT License
 */
(function () {
  'use strict';

  const T = window.TopsisCore, M = window.TopsisModel, C = window.TopsisCharts, X = window.TopsisExport;

  const STEPS = [
    { id: 'criteria', label: 'Kriteria & bobot' },
    { id: 'matrix', label: 'Matriks keputusan' },
    { id: 'results', label: 'Hasil' },
    { id: 'sens', label: 'Sensitivitas' },
    { id: 'report', label: 'Laporan & unduh' }
  ];

  const S = {
    p: null, rev: 0, compCache: null, extraCache: null,
    ui: { step: 'criteria', sensTab: 'gradient', gradIdx: 0, whatIf: null },
    chartDefs: {}, charts: {}, focusKey: null, shareLink: '', fileMode: 'any'
  };

  /* ================================================================== *
   * Utilitas
   * ================================================================== */

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = C.esc;

  const ICON = {
    plus: 'M12 5v14M5 12h14',
    up: 'M12 19V5M6 11l6-6 6 6',
    down: 'M12 5v14M6 13l6 6 6-6',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
    upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
    table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14',
    help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.6 9a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .9-1 1.6v.6M12 17h.01',
    x: 'M6 6l12 12M18 6 6 18',
    check: 'M5 12.5l4.5 4.5L19 7',
    alert: 'M12 8v5M12 16.5h.01M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    copy: 'M8 8h11v11H8zM5 16V5h11',
    file: 'M6 3h8l4 4v14H6zM14 3v4h4',
    doc: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
    folder: 'M3 6h6l2 2h10v11H3z',
    clip: 'M9 4h6v3H9zM7 5H5v16h14V5h-2M8 12h8M8 16h5',
    arrowR: 'M5 12h14M13 6l6 6-6 6',
    arrowL: 'M19 12H5M11 6l-6 6 6 6',
    reset: 'M4 12a8 8 0 1 0 2.3-5.7L4 8.6M4 4v4.6h4.6',
    grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    eraser: 'M8 20h12M5.5 13.5l7-7a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L12 19H8.5l-3-3a1.8 1.8 0 0 1 0-2.5z'
  };
  const icon = (name, cls) => `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${ICON[name]}"/></svg>`;

  function dec() { return S.p.settings.decimals; }
  function num(x, d) { return C.num(x, d === undefined ? dec() : d); }
  function pct(x, d) { return C.pct(x, d === undefined ? 1 : d); }
  /** Nilai mentah tanpa pembulatan berlebih, dengan pemisah desimal lokal. */
  function raw(v) {
    if (v === null || v === undefined || !isFinite(v)) return '';
    const s = String(+Number(v).toPrecision(12));
    return S.p.settings.decimalSep === ',' ? s.replace('.', ',') : s;
  }
  function judgText(v) {
    if (v === null || v === undefined) return '';
    const s = T.formatJudgment(v, 3);
    return S.p.settings.decimalSep === ',' ? s.replace('.', ',') : s;
  }
  function theme() { return C.THEMES.light; }
  function today() {
    try { return new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return new Date().toISOString().slice(0, 10); }
  }
  const critLabel = (k) => k.name + (k.unit ? ` (${k.unit})` : '');

  /* ================================================================== *
   * State & perhitungan
   * ================================================================== */

  let saveTimer = null;
  function touch(rerender) {
    S.rev++;
    S.compCache = null;
    S.extraCache = null;
    S.ui.whatIf = null;
    S.shareLink = '';
    scheduleSave();
    if (rerender) render();
  }
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 300); }
  function saveNow() {
    clearTimeout(saveTimer);
    S.p.meta.updatedAt = new Date().toISOString();
    const ok = M.saveLocal(S.p);
    const el = $('#save-state');
    if (el) el.textContent = ok ? 'Tersimpan otomatis di browser ini' : 'Penyimpanan browser penuh — unduh proyek (.json)';
  }

  function comp() {
    if (!S.compCache) S.compCache = M.compute(S.p);
    return S.compCache;
  }

  /** Data turunan yang lebih berat (sensitivitas, uji ketahanan); dihitung bila diperlukan. */
  function extras() {
    const c = comp();
    if (!c.ok) return null;
    if (!S.extraCache) {
      const opts = { normalization: c.normalization };
      const ev = T.evaluator(c.X, c.types, opts);
      S.extraCache = { ev, sens: null, nc: null, rr: null };
    }
    const ex = S.extraCache;
    ex.getSens = () => {
      if (!ex.sens) ex.sens = S.p.criteria.map((k, i) => ({ name: k.name, idx: i, stability: T.stabilityInterval(ex.ev, c.res.w, i) }));
      return ex.sens;
    };
    ex.getNc = () => { if (!ex.nc) ex.nc = T.compareNormalizations(c.X, c.res.w, c.types); return ex.nc; };
    ex.getRr = () => { if (!ex.rr) ex.rr = T.rankReversal(c.X, c.res.w, c.types, { normalization: c.normalization }); return ex.rr; };
    return ex;
  }

  /** Kinerja relatif (v − A−)/(A+ − A−) ∈ [0,1]; null bila kriteria tidak bervariasi. */
  function relative(res) {
    return res.V.map((row) => row.map((v, j) => {
      const span = res.Apos[j] - res.Aneg[j];
      return Math.abs(span) > 1e-15 ? (v - res.Aneg[j]) / span : null;
    }));
  }

  /* ================================================================== *
   * Toast, modal, tooltip
   * ================================================================== */

  function toast(msg, kind, action) {
    const box = $('#toasts');
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || 'info');
    t.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    t.innerHTML = `${icon(kind === 'error' ? 'alert' : 'check')}<span>${esc(msg)}</span>`;
    if (action) {
      const b = document.createElement('button');
      b.className = 'toast-act';
      b.textContent = action.label;
      b.addEventListener('click', () => { action.run(); t.remove(); });
      t.appendChild(b);
    }
    box.appendChild(t);
    setTimeout(() => t.classList.add('out'), action ? 8000 : 4200);
    setTimeout(() => t.remove(), action ? 8400 : 4600);
  }

  let lastFocus = null;
  let pendingConfirm = null;
  function openModal(html, opts) {
    if (pendingConfirm) { const r = pendingConfirm; pendingConfirm = null; r(false); }
    const m = $('#modal');
    lastFocus = document.activeElement;
    $('#modal-body').innerHTML = html;
    $('#modal-card').className = 'modal-card' + (opts && opts.wide ? ' wide' : '');
    m.hidden = false;
    requestAnimationFrame(() => {
      m.classList.add('open');
      const first = $('#modal-body [autofocus]') || $('#modal-body button, #modal-body input, #modal-body select, #modal-body textarea, #modal-body a') || $('#modal-close');
      if (first) first.focus();
    });
  }
  function closeModal(answer) {
    const m = $('#modal');
    m.classList.remove('open');
    m.hidden = true;
    $('#modal-body').innerHTML = '';
    if (pendingConfirm) { const r = pendingConfirm; pendingConfirm = null; r(answer === true); }
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus();
  }
  function confirmBox(message, okLabel, danger) {
    return new Promise((resolve) => {
      openModal(`<h2 class="modal-title">Konfirmasi</h2><p class="modal-text">${esc(message)}</p>
        <div class="modal-actions"><button class="btn" data-act="confirm-no">Batal</button><button class="btn ${danger ? 'danger' : 'primary'}" data-act="confirm-yes" autofocus>${esc(okLabel || 'Lanjutkan')}</button></div>`);
      pendingConfirm = resolve;
    });
  }

  function showTip(target, x, y) {
    const tip = $('#tip');
    tip.textContent = target.getAttribute('data-tip');
    tip.hidden = false;
    placeTip(tip, x, y);
  }
  function placeTip(tip, x, y) {
    const r = tip.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
    tip.style.left = Math.max(8, left) + 'px';
    tip.style.top = Math.max(8, top) + 'px';
  }
  function hideTip() { $('#tip').hidden = true; }

  /* ================================================================== *
   * Render utama
   * ================================================================== */

  function render() {
    const active = document.activeElement;
    const fk = S.focusKey || (active && active.dataset ? active.dataset.fk : null);
    const sel = active && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
    S.focusKey = null;
    S.chartDefs = {};
    renderChrome();
    const main = $('#main');
    main.dataset.step = S.ui.step;
    main.innerHTML = renderStep();
    const idx = STEPS.findIndex((s) => s.id === S.ui.step);
    const h1 = $('.page-head h1', main);
    if (h1 && idx >= 0) h1.insertAdjacentHTML('afterbegin', `<span class="step-badge" aria-hidden="true">${idx + 1}</span>`);
    mountCharts(main);
    if (fk) {
      const el = $(`[data-fk="${CSS.escape(fk)}"]`);
      if (el) {
        el.focus({ preventScroll: true });
        if (sel && typeof el.setSelectionRange === 'function' && el === document.activeElement) {
          try { el.setSelectionRange(Math.min(sel[0], el.value.length), Math.min(sel[1], el.value.length)); } catch (e) { /* tipe input tanpa seleksi */ }
        }
      }
    }
  }

  function renderChrome() {
    const title = $('#project-title');
    if (document.activeElement !== title) title.value = S.p.meta.title;
    document.title = (S.p.meta.title ? S.p.meta.title + ' — ' : '') + 'Kalkulator TOPSIS';
    const c = comp();
    $('#steps').innerHTML = '<ol>' + STEPS.map((s, i) => {
      const warn = (s.id === 'matrix' && c.missing.length) ? ' has-warn' : '';
      return `<li><button class="step${S.ui.step === s.id ? ' on' : ''}${warn}" data-act="goto" data-step="${s.id}" ${S.ui.step === s.id ? 'aria-current="step"' : ''}><span class="step-no">${i + 1}</span><span class="step-label">${s.label}</span></button></li>`;
    }).join('') + '</ol>';
  }

  function renderStep() {
    switch (S.ui.step) {
      case 'matrix': return renderMatrix();
      case 'results': return renderResults();
      case 'sens': return renderSens();
      case 'report': return renderReport();
      default: return renderCriteria();
    }
  }

  /* ================================================================== *
   * Diagram (kartu)
   * ================================================================== */

  function chartCard(id, title, desc, build, opts) {
    opts = opts || {};
    S.chartDefs[id] = { build, title, file: opts.file || id, scroll: !!opts.scroll };
    return `<figure class="chart-card${opts.wide ? ' wide' : ''}${opts.plain ? ' plain' : ''}" data-chart="${id}">
      <figcaption>
        <div class="chart-cap"><h3>${esc(title)}</h3>${desc ? `<p>${desc}</p>` : ''}</div>
        <div class="chart-tools">
          <button class="btn ghost sm" data-act="chart-png" data-id="${id}" title="Unduh gambar PNG">${icon('download')}PNG</button>
          <button class="btn ghost sm" data-act="chart-svg" data-id="${id}" title="Unduh gambar vektor SVG">SVG</button>
          <button class="btn ghost sm" data-act="chart-table" data-id="${id}" aria-expanded="false">${icon('table')}Tabel</button>
        </div>
      </figcaption>
      <div class="chart-svg${opts.scroll ? ' scroll' : ''}" data-svg="${id}"></div>
      <div class="chart-table" hidden></div>
    </figure>`;
  }

  function tableHTML(t) {
    if (!t) return '';
    return `<div class="table-wrap"><table class="data"><thead><tr>${t.head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${esc(c)}</th>` : `<td class="num">${esc(c)}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function mountCharts(root) { $$('[data-chart]', root).forEach((fig) => mountChart(fig)); }

  function mountChart(fig) {
    const id = fig.dataset.chart;
    const def = S.chartDefs[id];
    if (!def) return;
    const box = fig.querySelector('.chart-svg');
    const width = Math.max(300, Math.floor(box.clientWidth || fig.clientWidth || 640));
    let ch = null;
    try { ch = def.build(width, theme()); } catch (e) { console.error(e); }
    if (!ch) { box.innerHTML = '<p class="empty">Belum ada data untuk diagram ini.</p>'; return; }
    S.charts[id] = ch;
    box.innerHTML = ch.svg;
    if (def.scroll && ch.width > width) {
      const svg = box.querySelector('svg');
      if (width / ch.width >= 0.7) { svg.style.maxWidth = '100%'; svg.style.width = '100%'; }
    }
    const tbl = fig.querySelector('.chart-table');
    if (!tbl.hidden) tbl.innerHTML = tableHTML(ch.table);
  }

  async function exportChart(id, kind) {
    const def = S.chartDefs[id];
    if (!def) return;
    const box = $(`[data-svg="${id}"]`);
    const width = Math.max(760, box ? box.clientWidth : 760);
    const ch = def.build(width, C.THEMES.light);
    const name = X.safeFileName(S.p.meta.title + '-' + def.file);
    if (kind === 'svg') { X.download(name + '.svg', ch.svg, 'image/svg+xml'); return; }
    try {
      const png = await X.svgToPng(ch.svg, ch.width, ch.height, 2);
      X.download(name + '.png', png.blob);
    } catch (e) { toast(e.message, 'error'); }
  }

  /* --- pembangun diagram (dipakai layar & laporan) --- */

  const CH = {
    closeness: (W, t) => {
      const c = comp();
      return C.closeness(S.p.alternatives.map((a, i) => ({ name: a.name, value: c.res.C[i], k: i })), t, { width: W, decimals: dec() });
    },
    distanceMap: (W, t) => {
      const c = comp();
      return C.distanceMap({ decimals: dec(), points: S.p.alternatives.map((a, i) => ({ name: a.name, dpos: c.res.Dpos[i], dneg: c.res.Dneg[i], c: c.res.C[i], k: i })) }, t, { width: W });
    },
    distanceBars: (W, t) => {
      const c = comp();
      return C.distanceBars({ decimals: dec(), items: c.res.order.map((i) => ({ name: S.p.alternatives[i].name, dpos: c.res.Dpos[i], dneg: c.res.Dneg[i] })) }, t, { width: W });
    },
    heatmap: (W, t) => {
      const c = comp();
      const rel = relative(c.res);
      return C.heatmap({
        rows: c.res.order.map((i) => ({ name: S.p.alternatives[i].name, rank: c.res.rank[i] })),
        cols: S.p.criteria.map((k) => ({ name: k.name, type: k.type })),
        vals: c.res.order.map((i) => rel[i]),
        extra: { name: 'C*', vals: c.res.order.map((i) => c.res.C[i]) }
      }, t, { width: W });
    },
    weights: (W, t) => {
      const c = comp();
      if (!S.p.criteria.length) return null;
      return C.weightBars({ items: S.p.criteria.map((k, j) => ({ name: k.name, value: c.weights.w[j], type: k.type })) }, t, { width: W });
    },
    radar: (W, t) => {
      const c = comp();
      if (S.p.criteria.length < 3) return null;
      const rel = relative(c.res);
      const top = c.res.order.slice(0, Math.min(5, S.p.alternatives.length));
      return C.radar({ axes: S.p.criteria.map((k) => k.name), series: top.map((i) => ({ name: S.p.alternatives[i].name, k: i, vals: rel[i] })) }, t, { width: W });
    },
    gradient: (idx) => (W, t) => {
      const c = comp();
      const ex = extras();
      const curves = T.gradientCurves(ex.ev, c.res.w, idx, 100);
      const st = ex.getSens()[idx].stability;
      const switches = st.switches.map((s) => Object.assign({}, s, { y: ex.ev(T.adjustWeights(c.res.w, idx, s.x))[s.to] }));
      return C.gradient({ critName: S.p.criteria[idx].name, xs: curves.xs, series: curves.series, x0: c.res.w[idx], alts: S.p.alternatives, stability: st, switches }, t, { width: W });
    },
    bump: (W, t) => {
      const ex = extras();
      const nc = ex.getNc();
      const methods = Object.keys(nc);
      return C.bump({ methods: methods.map((k) => T.NORMALIZATIONS[k].label), alts: S.p.alternatives.map((a, k) => ({ name: a.name, k })), ranks: S.p.alternatives.map((_, i) => methods.map((k) => nc[k].rank[i])) }, t, { width: W });
    }
  };

  /* ================================================================== *
   * Langkah 1: Kriteria & bobot
   * ================================================================== */

  function weightTotalText(c) {
    const p = S.p;
    if (p.weighting.method !== 'manual') return `Bobot ditentukan metode <b>${esc(M.WEIGHT_METHODS[p.weighting.method].label)}</b>. Total bobot akhir = 100%.`;
    const total = T.sum(p.criteria.map((k) => (k.weight > 0 ? k.weight : 0)));
    if (!(total > 0)) return '<span class="bad-text">Isi bobot minimal satu kriteria dengan angka lebih dari 0.</span>';
    return `Total bobot yang Anda isi: <b class="num">${esc(raw(total))}</b> — dinormalisasi otomatis sehingga totalnya menjadi 100%.`;
  }

  function methodMsg(c) {
    const p = S.p;
    const msgs = c.weights.errors.map((e) => `<p class="note warn">${icon('alert')}${esc(e)}</p>`).concat(c.weights.warnings.map((e) => `<p class="note warn">${icon('alert')}${esc(e)}</p>`));
    const m = p.weighting.method;
    let extra = '';
    if ((m === 'entropy' || m === 'critic') && !c.weights.errors.length) extra = `<p class="note">${icon('check')}Bobot dihitung dari ${p.alternatives.length} alternatif pada matriks keputusan dan diperbarui otomatis setiap nilai berubah.</p>`;
    if (m === 'ahp') extra = `<p class="note"><button class="link-btn" data-act="scroll-ahp">Isi perbandingan berpasangan di bawah ↓</button></p>`;
    return msgs.join('') + extra;
  }

  function renderCriteria() {
    const p = S.p;
    const c = comp();
    const manual = p.weighting.method === 'manual';
    const items = p.criteria.map((k, j) => `
      <li class="item">
        <span class="idx" aria-hidden="true">C${j + 1}</span>
        <label class="field grow"><span>Nama kriteria</span><input type="text" value="${esc(k.name)}" data-bind="crit-name" data-id="${k.id}" data-fk="cn-${k.id}" maxlength="160" autocomplete="off"></label>
        <label class="field type"><span>Jenis</span><select data-bind="crit-type" data-id="${k.id}" data-fk="ct-${k.id}">
          <option value="benefit"${k.type === 'benefit' ? ' selected' : ''}>Benefit ↑</option><option value="cost"${k.type === 'cost' ? ' selected' : ''}>Cost ↓</option></select></label>
        <label class="field unit"><span>Satuan</span><input type="text" value="${esc(k.unit)}" data-bind="crit-unit" data-id="${k.id}" data-fk="cu-${k.id}" maxlength="40" placeholder="opsional" autocomplete="off"></label>
        <div class="field weight"><span>${manual ? 'Bobot' : 'Bobot akhir'}</span>
          <div class="weight-box">${manual ? `<input type="text" inputmode="decimal" class="num" value="${esc(raw(k.weight))}" data-bind="crit-weight" data-id="${k.id}" data-fk="cw-${k.id}" aria-label="Bobot ${esc(k.name)}">` : ''}
          <span class="wpct num" data-wpct="${j}">${pct(c.weights.w[j], 1)}</span></div></div>
        <div class="row-actions">
          <button class="icon-btn" data-act="crit-up" data-id="${k.id}" ${j === 0 ? 'disabled' : ''} aria-label="Naikkan ${esc(k.name)}">${icon('up')}</button>
          <button class="icon-btn" data-act="crit-down" data-id="${k.id}" ${j === p.criteria.length - 1 ? 'disabled' : ''} aria-label="Turunkan ${esc(k.name)}">${icon('down')}</button>
          <button class="icon-btn danger" data-act="crit-del" data-id="${k.id}" aria-label="Hapus ${esc(k.name)}">${icon('trash')}</button>
        </div>
      </li>`).join('');
    const methods = Object.keys(M.WEIGHT_METHODS).map((key) => {
      const m = M.WEIGHT_METHODS[key];
      return `<label class="method${p.weighting.method === key ? ' on' : ''}"><input type="radio" name="wmethod" value="${key}" data-bind="weight-method" ${p.weighting.method === key ? 'checked' : ''}><span><b>${esc(m.label)}</b><small>${esc(m.text)}</small></span></label>`;
    }).join('');
    const normOpts = Object.keys(T.NORMALIZATIONS).map((k) => `<option value="${k}"${p.settings.normalization === k ? ' selected' : ''}>${esc(T.NORMALIZATIONS[k].label)}</option>`).join('');
    return `<div class="page-head"><div><h1>Kriteria & bobot</h1><p>Tentukan kriteria penilaian, jenis Benefit atau Cost, dan bobot kepentingannya.</p></div></div>
    <div class="crit-grid">
      <section class="panel">
        <div class="panel-head"><h2>Daftar kriteria</h2><span class="hint">${p.criteria.length} kriteria</span></div>
        <div class="notice"><strong>Benefit</strong>: nilai lebih tinggi lebih baik (misalnya kualitas). <strong>Cost</strong>: nilai lebih rendah lebih baik (misalnya harga atau waktu). Beri bobot lebih besar pada hal yang lebih penting.</div>
        ${p.criteria.length ? `<ol class="crit-list">${items}</ol>` : '<p class="empty">Belum ada kriteria.</p>'}
        <div class="toolbar"><button class="btn soft" data-act="crit-add">${icon('plus')}Tambah kriteria</button></div>
        <p class="small" id="weight-total">${weightTotalText(c)}</p>
      </section>
      <div class="side-col">
        <section class="panel">
          <div class="panel-head"><h2>Metode pembobotan</h2></div>
          <div class="method-list" role="radiogroup" aria-label="Metode pembobotan">${methods}</div>
          <div id="method-msg">${methodMsg(c)}</div>
          <div class="row-buttons"><button class="btn ghost sm" data-act="import-ahp">${icon('upload')}Impor bobot dari proyek AHP (.json)</button></div>
        </section>
        <section class="panel">
          <div class="panel-head"><h2>Pengaturan perhitungan</h2></div>
          <div class="settings">
            <label class="field"><span>Normalisasi matriks</span><select data-bind="set-norm">${normOpts}</select></label>
            <label class="field"><span>Angka di belakang koma</span><select data-bind="set-dec">${[2, 3, 4, 5, 6].map((d) => `<option value="${d}"${p.settings.decimals === d ? ' selected' : ''}>${d}</option>`).join('')}</select></label>
            <label class="field"><span>Pemisah desimal</span><select data-bind="set-sep"><option value=","${p.settings.decimalSep === ',' ? ' selected' : ''}>Koma (0,5)</option><option value="."${p.settings.decimalSep === '.' ? ' selected' : ''}>Titik (0.5)</option></select></label>
            <div class="field"><span>Ukuran jarak</span><p class="static">Euclidean</p></div>
          </div>
          <p class="note">TOPSIS klasik (Hwang &amp; Yoon, 1981) memakai normalisasi vektor. Metode lain disediakan untuk perbandingan.</p>
        </section>
      </div>
    </div>
    ${p.weighting.method === 'ahp' ? renderAhpPanel(c) : ''}
    ${p.criteria.length ? `<div class="chart-grid one">${chartCard('weights', 'Bobot akhir kriteria', 'Bobot ternormalisasi (w) yang dipakai dalam perhitungan TOPSIS.', CH.weights)}</div>` : ''}
    <div class="step-foot"><span></span><button class="btn primary lg" data-act="goto" data-step="matrix">Lanjut: matriks keputusan${icon('arrowR')}</button></div>`;
  }

  function ahpSide(c) {
    const a = c.weights.info;
    if (!a) return '';
    const ok = a.CR <= 0.1 + 1e-12;
    const filled = a.total - a.missing;
    return `<div class="cr-box ${ok ? 'ok' : 'bad'}">
        <div class="cr-main"><span class="cr-label">Rasio konsistensi (CR)</span><span class="cr-val num">${num(a.CR, 3)}</span></div>
        <div class="cr-status">${icon(ok ? 'check' : 'alert')}<span>${ok ? 'Konsisten (CR ≤ 0,10)' : 'Belum konsisten (CR > 0,10). Tinjau ulang penilaian.'}</span></div>
        <dl class="cr-detail"><div><dt>Terisi</dt><dd class="num">${filled}/${a.total}</dd></div><div><dt>λ maks</dt><dd class="num">${num(a.lambdaMax, 4)}</dd></div><div><dt>CI</dt><dd class="num">${num(a.CI, 4)}</dd></div><div><dt>RI</dt><dd class="num">${num(a.RI, 2)}</dd></div></dl>
      </div>
      <ul class="prio-bars">${S.p.criteria.map((k, j) => `<li><span class="pb-name">${esc(k.name)}</span><span class="pb-bar"><i style="width:${(a.w[j] / Math.max(...a.w) * 100).toFixed(2)}%"></i></span><span class="pb-val num">${pct(a.w[j], 1)}</span></li>`).join('')}</ul>`;
  }

  function renderAhpPanel(c) {
    const p = S.p;
    const ks = p.criteria;
    if (ks.length < 2) return '';
    const head = `<tr><th scope="col"></th>${ks.map((k, j) => `<th scope="col" title="${esc(k.name)}">C${j + 1} ${esc(k.name)}</th>`).join('')}</tr>`;
    const body = ks.map((a, i) => `<tr><th scope="row" title="${esc(a.name)}">C${i + 1} ${esc(a.name)}</th>${ks.map((b, j) => {
      if (i === j) return '<td class="diag">1</td>';
      const v = M.getJudgment(p, a.id, b.id);
      if (i < j) return `<td><input type="text" inputmode="decimal" value="${esc(judgText(v))}" placeholder="–" data-bind="ahp-cell" data-a="${a.id}" data-b="${b.id}" data-fk="ahp-${a.id}-${b.id}" aria-label="${esc(a.name)} dibanding ${esc(b.name)}"></td>`;
      return `<td class="recip num" data-recip="${a.id}>${b.id}">${v === null ? '–' : esc(judgText(v))}</td>`;
    }).join('')}</tr>`).join('');
    return `<section class="panel" id="ahp-panel">
      <div class="panel-head"><h2>Perbandingan berpasangan kriteria (AHP)</h2><span class="hint">skala Saaty 1–9</span></div>
      <p class="note">Isi seberapa penting kriteria pada <b>baris</b> dibanding kriteria pada <b>kolom</b>: 1 = sama penting, 3 = sedikit lebih penting, 5 = lebih penting, 7 = sangat lebih penting, 9 = mutlak lebih penting (2, 4, 6, 8 = nilai antara). Tulis 1/3, 1/5, … bila kriteria kolom yang lebih penting. Sel di bawah diagonal terisi otomatis.</p>
      <div class="ahp-wrap">
        <div class="table-wrap"><table class="matrix ahp"><thead>${head}</thead><tbody>${body}</tbody></table></div>
        <div class="ahp-side" id="ahp-side">${ahpSide(c)}</div>
      </div>
    </section>`;
  }

  function refreshWeights() {
    const c = comp();
    $$('[data-wpct]').forEach((el) => { el.textContent = pct(c.weights.w[Number(el.dataset.wpct)], 1); });
    const tot = $('#weight-total'); if (tot) tot.innerHTML = weightTotalText(c);
    const msg = $('#method-msg'); if (msg) msg.innerHTML = methodMsg(c);
    const side = $('#ahp-side'); if (side) side.innerHTML = ahpSide(c);
    const fig = $('[data-chart="weights"]'); if (fig) mountChart(fig);
    renderChrome();
  }

  /* ================================================================== *
   * Langkah 2: Matriks keputusan
   * ================================================================== */

  function matrixHint(c) {
    const p = S.p;
    return `${p.alternatives.length} alternatif × ${p.criteria.length} kriteria${c.missing.length ? ` · <span class="bad-text">${c.missing.length} sel kosong</span>` : ' · lengkap'}`;
  }

  function matrixStatus(c) {
    const msgs = c.errors;
    if (!msgs.length && !c.warnings.length) return `<p class="note ok-text">${icon('check')}Data lengkap dan siap dihitung.</p>`;
    return msgs.map((e) => `<p class="note warn">${icon('alert')}${esc(e)}</p>`).join('') + c.warnings.map((e) => `<p class="note">${icon('alert')}${esc(e)}</p>`).join('');
  }

  function renderMatrix() {
    const p = S.p;
    const c = comp();
    const ks = p.criteria;
    const head = `<tr><th scope="col" class="sticky">Alternatif</th>${ks.map((k, j) => `<th scope="col"><span class="ch-name">C${j + 1} · ${esc(k.name)}</span><span class="ch-meta"><span class="tag ${k.type}">${k.type === 'cost' ? 'Cost ↓' : 'Benefit ↑'}</span>${k.unit ? ` <span>${esc(k.unit)}</span>` : ''}</span></th>`).join('')}<th scope="col" class="act-col"><span class="sr">Aksi</span></th></tr>`;
    const body = p.alternatives.map((a, i) => `<tr>
      <th scope="row" class="sticky"><div class="alt-cell"><span class="row-no">A${i + 1}</span><input type="text" value="${esc(a.name)}" data-bind="alt-name" data-id="${a.id}" data-fk="an-${a.id}" maxlength="160" autocomplete="off" aria-label="Nama alternatif ${i + 1}"></div></th>
      ${ks.map((k, j) => `<td><input type="text" inputmode="decimal" class="num${M.getValue(p, a.id, k.id) === null ? ' empty-cell' : ''}" value="${esc(raw(M.getValue(p, a.id, k.id)))}" data-bind="cell" data-a="${a.id}" data-c="${k.id}" data-i="${i}" data-j="${j}" data-fk="v-${a.id}-${k.id}" aria-label="${esc(a.name)} — ${esc(k.name)}" autocomplete="off"></td>`).join('')}
      <td class="act-col"><div class="row-actions">
        <button class="icon-btn" data-act="alt-up" data-id="${a.id}" ${i === 0 ? 'disabled' : ''} aria-label="Naikkan ${esc(a.name)}">${icon('up')}</button>
        <button class="icon-btn danger" data-act="alt-del" data-id="${a.id}" aria-label="Hapus ${esc(a.name)}">${icon('trash')}</button></div></td>
    </tr>`).join('');
    return `<div class="page-head"><div><h1>Matriks keputusan</h1><p>Masukkan alternatif dan nilainya untuk setiap kriteria. Gunakan satuan yang sama dalam satu kolom.</p></div></div>
    <section class="panel">
      <div class="panel-head"><h2>Alternatif dan nilainya</h2><span class="hint" id="matrix-hint">${matrixHint(c)}</span></div>
      <div class="toolbar first">
        <button class="btn soft" data-act="alt-add">${icon('plus')}Tambah alternatif</button>
        <button class="btn" data-act="paste-open">${icon('clip')}Tempel dari Excel</button>
        <button class="btn" data-act="open-data">${icon('upload')}Impor CSV / Excel</button>
        <button class="btn ghost" data-act="dl-template">${icon('download')}Templat CSV</button>
        <button class="btn ghost" data-act="clear-values">${icon('eraser')}Kosongkan nilai</button>
      </div>
      <p class="note">Tip: salin blok angka dari Excel atau Google Sheets lalu tekan Ctrl+V di sel mana pun; nilai mengisi sel ke kanan dan ke bawah, baris baru ditambahkan bila perlu. Tekan Enter untuk turun ke baris berikutnya.</p>
      ${ks.length ? `<div class="matrix-wrap"><table class="dm"><thead>${head}</thead><tbody>${body}</tbody></table></div>` : '<p class="empty">Tambahkan kriteria di langkah 1 terlebih dahulu.</p>'}
      <div id="matrix-status">${matrixStatus(c)}</div>
    </section>
    <div class="step-foot"><button class="btn lg" data-act="goto" data-step="criteria">${icon('arrowL')}Kriteria & bobot</button><button class="btn primary lg" data-act="calc">Hitung peringkat TOPSIS${icon('arrowR')}</button></div>`;
  }

  function refreshMatrixStatus() {
    const c = comp();
    const h = $('#matrix-hint'); if (h) h.innerHTML = matrixHint(c);
    const s = $('#matrix-status'); if (s) s.innerHTML = matrixStatus(c);
    renderChrome();
  }

  /** Tempel blok sel dari clipboard mulai sel (i, j). */
  function pasteBlock(i0, j0, text) {
    const p = S.p;
    const grid = M.parseGrid(text);
    if (!grid.length) return false;
    const cells = [];
    grid.forEach((r) => r.forEach((x) => cells.push(x)));
    const sep = M.detectDecimal(cells, p.settings.decimalSep);
    let added = 0, bad = 0, cut = 0;
    grid.forEach((row, di) => {
      const i = i0 + di;
      while (i >= p.alternatives.length) { p.alternatives.push(M.alt('Alternatif ' + (p.alternatives.length + 1))); added++; }
      row.forEach((cell, dj) => {
        const j = j0 + dj;
        if (j >= p.criteria.length) { if (String(cell).trim() !== '') cut++; return; }
        const v = M.parseNumber(cell, sep);
        if (Number.isNaN(v)) { bad++; return; }
        M.setValue(p, p.alternatives[i].id, p.criteria[j].id, v);
      });
    });
    touch(true);
    const parts = [`${grid.length} baris × ${Math.max(...grid.map((r) => r.length))} kolom ditempel`];
    if (added) parts.push(`${added} alternatif baru`);
    if (bad) parts.push(`${bad} sel bukan angka dilewati`);
    if (cut) parts.push(`${cut} sel di luar kolom kriteria diabaikan`);
    toast(parts.join(', ') + '.', bad || cut ? 'error' : 'info');
    return true;
  }

  function openPaste() {
    openModal(`<h2 class="modal-title">Tempel tabel dari Excel / Google Sheets</h2>
      <p class="modal-text">Blok tabel di Excel (termasuk baris judul nama kriteria dan kolom nama alternatif), salin dengan Ctrl+C, lalu tempel di kotak ini dengan Ctrl+V. Baris opsional <b>Jenis</b> (Benefit/Cost), <b>Bobot</b>, dan <b>Satuan</b> juga dikenali.</p>
      <label class="field" style="margin-top:14px"><span>Tabel</span><textarea id="paste-text" rows="9" spellcheck="false" placeholder="Alternatif&#9;Kualitas&#9;Harga&#10;Jenis&#9;Benefit&#9;Cost&#10;Bobot&#9;60&#9;40&#10;Supplier A&#9;8&#9;10&#10;Supplier B&#9;9&#9;12" autofocus></textarea></label>
      <div id="paste-preview" class="paste-preview" aria-live="polite"><span class="muted">Pratinjau muncul setelah tabel ditempel.</span></div>
      <div class="modal-actions"><button class="btn" data-act="close-modal">Batal</button><button class="btn primary" data-act="paste-apply" disabled>Ganti tabel</button></div>`, { wide: true });
  }

  function pastePreview() {
    const box = $('#paste-preview');
    const btn = $('[data-act="paste-apply"]');
    const text = $('#paste-text').value;
    if (!text.trim()) { box.innerHTML = '<span class="muted">Pratinjau muncul setelah tabel ditempel.</span>'; btn.disabled = true; return null; }
    try {
      const g = M.interpretGrid(M.parseGrid(text), S.p.settings.decimalSep);
      const show = g.alts.slice(0, 6);
      box.innerHTML = `<p><b>${g.names.length} kriteria</b>, <b>${g.alts.length} alternatif</b>${g.types ? ' · jenis Benefit/Cost terbaca' : ''}${g.weights ? ' · bobot terbaca' : ''}${g.bad ? ` · <span class="bad-text">${g.bad} sel bukan angka</span>` : ''}. Pemisah desimal: ${g.decimalSep === ',' ? 'koma' : 'titik'}.</p>
        <div class="table-wrap"><table class="data compact"><thead><tr><th>Alternatif</th>${g.names.map((nm, j) => `<th>${esc(nm)}${g.types && g.types[j] ? `<br><small>${g.types[j] === 'cost' ? 'Cost' : 'Benefit'}</small>` : ''}</th>`).join('')}</tr></thead>
        <tbody>${show.map((a) => `<tr><th>${esc(a.name)}</th>${a.values.map((v) => `<td class="num">${v === null ? '–' : esc(raw(v))}</td>`).join('')}</tr>`).join('')}${g.alts.length > show.length ? `<tr><td colspan="${g.names.length + 1}" class="muted">… ${g.alts.length - show.length} baris lagi</td></tr>` : ''}</tbody></table></div>`;
      btn.disabled = false;
      return g;
    } catch (e) {
      box.innerHTML = `<p class="bad-text">${esc(e.message)}</p>`;
      btn.disabled = true;
      return null;
    }
  }

  /* ================================================================== *
   * Langkah 3: Hasil
   * ================================================================== */

  function conclusionText(c) {
    const p = S.p, res = c.res, o = res.order;
    const name = (i) => p.alternatives[i].name;
    const ties = o.filter((i) => res.rank[i] === 1);
    if (ties.length > 1) return `Alternatif ${ties.map(name).join(' dan ')} sama-sama berada di peringkat pertama dengan nilai preferensi C* = ${num(res.C[o[0]])}.`;
    let s = `Alternatif terbaik adalah ${name(o[0])} dengan nilai preferensi C* = ${num(res.C[o[0]])}`;
    if (o.length > 1) s += `, diikuti ${name(o[1])} (C* = ${num(res.C[o[1]])})`;
    if (o.length > 2) s += ` dan ${name(o[2])} (C* = ${num(res.C[o[2]])})`;
    return s + '.';
  }

  function errorsBanner(c) {
    return `<div class="banner warn">${icon('alert')}<div><b>Belum bisa dihitung.</b><ul>${c.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
      <div class="row-buttons"><button class="btn sm" data-act="goto" data-step="criteria">Ke kriteria & bobot</button><button class="btn sm" data-act="goto" data-step="matrix">Ke matriks keputusan</button></div></div></div>`;
  }
  function warningsBanner(c) {
    if (!c.warnings.length) return '';
    return `<div class="banner info">${icon('alert')}<div><b>Catatan</b><ul>${c.warnings.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div></div>`;
  }

  /** Contoh perhitungan untuk alternatif & kriteria pertama, seperti hitungan manual di buku. */
  function examples(c) {
    const p = S.p, res = c.res, X0 = c.X;
    const k0 = p.criteria[0], a0 = p.alternatives[0];
    const col = X0.map((r) => r[0]);
    const inf = res.info[0];
    let norm;
    if (res.normalization === 'vector') {
      const terms = col.length <= 6 ? col.map((x) => `${raw(x)}²`).join(' + ') : `${raw(col[0])}² + ${raw(col[1])}² + … + ${raw(col[col.length - 1])}²`;
      norm = `pembagi kriteria ${k0.name} = √(${terms}) = ${num(inf.divisor)}; r₁₁ = ${raw(X0[0][0])} / ${num(inf.divisor)} = ${num(res.R[0][0])}`;
    } else if (res.normalization === 'linear') norm = `maks |x| kriteria ${k0.name} = ${raw(inf.divisor)}; r₁₁ = ${raw(X0[0][0])} / ${raw(inf.divisor)} = ${num(res.R[0][0])}`;
    else if (res.normalization === 'sum') norm = `Σx kriteria ${k0.name} = ${raw(inf.divisor)}; r₁₁ = ${raw(X0[0][0])} / ${raw(inf.divisor)} = ${num(res.R[0][0])}`;
    else norm = `kriteria ${k0.name}: min = ${raw(inf.min)}, maks = ${raw(inf.max)}; r₁₁ = (${raw(X0[0][0])} − ${raw(inf.min)}) / (${raw(inf.max)} − ${raw(inf.min)}) = ${num(res.R[0][0])}`;
    const weighted = `v₁₁ = w₁ × r₁₁ = ${num(res.w[0])} × ${num(res.R[0][0])} = ${num(res.V[0][0])}`;
    const sq = res.V[0].map((v, j) => `(${num(v)} − ${num(res.Apos[j])})²`);
    const terms = sq.length <= 3 ? sq.join(' + ') : `${sq[0]} + … + ${sq[sq.length - 1]}`;
    const distance = `untuk ${a0.name}: D+ = √[${terms}] = ${num(res.Dpos[0])}; D− = ${num(res.Dneg[0])}; C* = ${num(res.Dneg[0])} / (${num(res.Dpos[0])} + ${num(res.Dneg[0])}) = ${num(res.C[0])}`;
    return { norm, weighted, distance };
  }

  /** Tabel matriks HTML (alternatif × kriteria) + baris tambahan opsional. */
  function matTable(id, rowNames, getter, extraRows, corner) {
    const ks = S.p.criteria;
    const rows = rowNames.map((nm, i) => `<tr><th scope="row">${esc(nm)}</th>${ks.map((_, j) => `<td class="num">${esc(getter(i, j))}</td>`).join('')}</tr>`).join('');
    const extra = (extraRows || []).map((er) => `<tr class="sum-row"><th scope="row">${esc(er.label)}</th>${ks.map((_, j) => `<td class="num">${esc(er.get(j))}</td>`).join('')}</tr>`).join('');
    return `<div class="table-wrap"><table class="data calc" data-copy="${id}"><thead><tr><th scope="col">${esc(corner === undefined ? 'Alternatif' : corner)}</th>${ks.map((k, j) => `<th scope="col">C${j + 1} ${esc(k.name)}</th>`).join('')}</tr></thead><tbody>${rows}${extra}</tbody></table></div>`;
  }
  const copyBtn = (id) => `<button class="btn ghost sm" data-act="copy-table" data-id="${id}" title="Salin tabel (bisa ditempel ke Excel/Word)">${icon('copy')}Salin</button>`;

  function weightDetail(c) {
    const p = S.p, w = c.weights, ks = p.criteria;
    const alts = p.alternatives.map((a) => a.name);
    if (w.method === 'entropy' && w.info) {
      const e = w.info;
      return `<div class="calc-step"><div class="cs-head"><h3>Rincian bobot Entropy</h3>${copyBtn('ent-p')}</div>
        <div class="formula">p<sub>ij</sub> = x<sub>ij</sub> / Σ<sub>i</sub> x<sub>ij</sub> &nbsp;·&nbsp; e<sub>j</sub> = −(1/ln m) Σ<sub>i</sub> p<sub>ij</sub> ln p<sub>ij</sub> &nbsp;·&nbsp; d<sub>j</sub> = 1 − e<sub>j</sub> &nbsp;·&nbsp; w<sub>j</sub> = d<sub>j</sub> / Σd</div>
        ${matTable('ent-p', alts, (i, j) => num(e.P[i][j]), [{ label: 'Σx', get: (j) => raw(e.colSum[j]) }, { label: 'e (entropi)', get: (j) => num(e.E[j]) }, { label: 'd = 1 − e', get: (j) => num(e.D[j]) }, { label: 'w', get: (j) => num(e.w[j]) }], 'p')}</div>`;
    }
    if (w.method === 'critic' && w.info) {
      const k = w.info;
      return `<div class="calc-step"><div class="cs-head"><h3>Rincian bobot CRITIC</h3>${copyBtn('cr-n')}</div>
        <div class="formula">N<sub>ij</sub> = (x − min)/(maks − min) untuk benefit, (maks − x)/(maks − min) untuk cost &nbsp;·&nbsp; C<sub>j</sub> = σ<sub>j</sub> Σ<sub>k</sub>(1 − r<sub>jk</sub>) &nbsp;·&nbsp; w<sub>j</sub> = C<sub>j</sub>/ΣC</div>
        ${matTable('cr-n', alts, (i, j) => num(k.N[i][j]), [{ label: 'σ (simpangan baku)', get: (j) => num(k.sigma[j]) }, { label: 'Σ(1 − r)', get: (j) => num(T.sum(k.corr[j].map((r) => 1 - r))) }, { label: 'C', get: (j) => num(k.C[j]) }, { label: 'w', get: (j) => num(k.w[j]) }], 'N')}
        <div class="cs-head"><h4>Matriks korelasi r</h4>${copyBtn('cr-r')}</div>
        ${matTable('cr-r', ks.map((x, j) => `C${j + 1} ${x.name}`), (i, j) => num(k.corr[i][j], 3), null, 'r')}</div>`;
    }
    if (w.method === 'ahp' && w.info) {
      const a = w.info;
      return `<div class="calc-step"><div class="cs-head"><h3>Rincian bobot AHP</h3>${copyBtn('ahp-n')}</div>
        <div class="formula">Bobot w = vektor eigen utama matriks A &nbsp;·&nbsp; λ<sub>maks</sub> = rata-rata (A·w)<sub>i</sub>/w<sub>i</sub> &nbsp;·&nbsp; CI = (λ<sub>maks</sub> − n)/(n − 1) &nbsp;·&nbsp; CR = CI/RI</div>
        ${matTable('ahp-n', ks.map((x, j) => `C${j + 1} ${x.name}`), (i, j) => num(a.normalized[i][j]), [{ label: 'Rata-rata baris (NCA)', get: (j) => num(a.nca[j]) }, { label: 'w (vektor eigen)', get: (j) => num(a.w[j]) }, { label: '(A·w)/w', get: (j) => num(a.cv[j]) }], 'Normalisasi A')}
        <p class="note">λ maks = ${num(a.lambdaMax)}; CI = ${num(a.CI)}; RI = ${num(a.RI, 2)}; <b>CR = ${num(a.CR)}</b> → ${a.CR <= 0.1 ? 'konsisten' : 'belum konsisten'}.${a.missing ? ` ${a.missing} penilaian kosong dilengkapi metode Harker.` : ''}</p></div>`;
    }
    return '';
  }

  function renderSteps(c) {
    const p = S.p, res = c.res, ks = p.criteria;
    const alts = p.alternatives.map((a) => a.name);
    const ex = examples(c);
    const normF = {
      vector: 'r<sub>ij</sub> = x<sub>ij</sub> / √(Σ<sub>i</sub> x<sub>ij</sub>²)',
      linear: 'r<sub>ij</sub> = x<sub>ij</sub> / maks<sub>i</sub> |x<sub>ij</sub>|',
      minmax: 'r<sub>ij</sub> = (x<sub>ij</sub> − min<sub>i</sub> x<sub>ij</sub>) / (maks<sub>i</sub> x<sub>ij</sub> − min<sub>i</sub> x<sub>ij</sub>)',
      sum: 'r<sub>ij</sub> = x<sub>ij</sub> / Σ<sub>i</sub> x<sub>ij</sub>'
    }[res.normalization];
    const divRows = res.normalization === 'minmax'
      ? [{ label: 'min', get: (j) => raw(res.info[j].min) }, { label: 'maks', get: (j) => raw(res.info[j].max) }]
      : [{ label: T.NORMALIZATIONS[res.normalization].divisorLabel, get: (j) => num(res.info[j].divisor) }];
    return `<section class="panel" id="steps-panel">
      <div class="panel-head"><h2>Langkah perhitungan</h2><span class="hint">cocokkan dengan hitungan manual Anda · tombol Salin menyalin tabel ke Excel/Word</span></div>
      <div class="calc-step"><div class="cs-head"><h3>Langkah 1 — Matriks keputusan (X) dan bobot</h3>${copyBtn('s-x')}</div>
        ${matTable('s-x', alts, (i, j) => raw(c.X[i][j]), [{ label: 'Jenis', get: (j) => (ks[j].type === 'cost' ? 'Cost' : 'Benefit') }, { label: 'Bobot w', get: (j) => num(res.w[j]) }])}</div>
      ${weightDetail(c)}
      <div class="calc-step"><div class="cs-head"><h3>Langkah 2 — Normalisasi (R)</h3>${copyBtn('s-r')}</div>
        <div class="formula">${normF}</div><p class="example">Contoh: ${esc(ex.norm)}</p>
        ${matTable('s-r', alts, (i, j) => num(res.R[i][j]), divRows)}</div>
      <div class="calc-step"><div class="cs-head"><h3>Langkah 3 — Normalisasi terbobot (V)</h3>${copyBtn('s-v')}</div>
        <div class="formula">v<sub>ij</sub> = w<sub>j</sub> × r<sub>ij</sub></div><p class="example">Contoh: ${esc(ex.weighted)}</p>
        ${matTable('s-v', alts, (i, j) => num(res.V[i][j]))}</div>
      <div class="calc-step"><div class="cs-head"><h3>Langkah 4 — Solusi ideal positif (A+) dan negatif (A−)</h3>${copyBtn('s-a')}</div>
        <div class="formula">A+<sub>j</sub> = maks v<sub>ij</sub> (benefit) atau min v<sub>ij</sub> (cost) &nbsp;·&nbsp; A−<sub>j</sub> = min v<sub>ij</sub> (benefit) atau maks v<sub>ij</sub> (cost)</div>
        ${matTable('s-a', ['A+', 'A−'], (i, j) => num(i === 0 ? res.Apos[j] : res.Aneg[j]), [{ label: 'Jenis', get: (j) => (ks[j].type === 'cost' ? 'Cost' : 'Benefit') }], '')}</div>
      <div class="calc-step"><div class="cs-head"><h3>Langkah 5 — Jarak, nilai preferensi, dan peringkat</h3>${copyBtn('s-d')}</div>
        <div class="formula">D+<sub>i</sub> = √Σ<sub>j</sub>(v<sub>ij</sub> − A+<sub>j</sub>)² &nbsp;·&nbsp; D−<sub>i</sub> = √Σ<sub>j</sub>(v<sub>ij</sub> − A−<sub>j</sub>)² &nbsp;·&nbsp; C*<sub>i</sub> = D−<sub>i</sub> / (D+<sub>i</sub> + D−<sub>i</sub>)</div><p class="example">Contoh: ${esc(ex.distance)}</p>
        <div class="table-wrap"><table class="data calc" data-copy="s-d"><thead><tr><th scope="col">Alternatif</th><th scope="col">D+</th><th scope="col">D−</th><th scope="col">C*</th><th scope="col">Peringkat</th></tr></thead>
        <tbody>${p.alternatives.map((a, i) => `<tr${res.rank[i] === 1 ? ' class="best"' : ''}><th scope="row">${esc(a.name)}</th><td class="num">${num(res.Dpos[i])}</td><td class="num">${num(res.Dneg[i])}</td><td class="num">${num(res.C[i])}</td><td class="num">${res.rank[i]}</td></tr>`).join('')}</tbody></table></div></div>
    </section>`;
  }

  function renderResults() {
    const p = S.p;
    const c = comp();
    const headP = '<div class="page-head"><div><h1>Hasil peringkat TOPSIS</h1><p>Skor kedekatan (C*) lebih tinggi menunjukkan alternatif lebih dekat ke solusi ideal positif dan lebih jauh dari solusi ideal negatif.</p></div>';
    if (!c.ok) return headP + '</div>' + errorsBanner(c);
    const res = c.res, o = res.order;
    const best = o[0];
    const gap = o.length > 1 ? res.C[best] - res.C[o[1]] : 0;
    const maxC = Math.max(...res.C, 1e-9);
    const rows = o.map((i) => `<tr${res.rank[i] === 1 ? ' class="best"' : ''}><td class="num rank">${res.rank[i]}</td><th scope="row">${esc(p.alternatives[i].name)}</th><td class="num dcol">${num(res.Dpos[i])}</td><td class="num dcol">${num(res.Dneg[i])}</td><td class="num strong">${num(res.C[i])}</td><td class="bar-cell"><div class="bar"><span style="width:${(res.C[i] / maxC * 100).toFixed(2)}%"></span></div></td></tr>`).join('');
    return `${headP}<div class="head-ctrls"><button class="btn" data-act="goto" data-step="report">${icon('download')}Unduh laporan</button></div></div>
    ${warningsBanner(c)}
    <div class="summary verdict">
      <div class="verdict-kicker">Alternatif terbaik</div>
      <div class="verdict-main"><span class="verdict-name">${esc(p.alternatives[best].name)}</span><span class="verdict-val num">C* = ${num(res.C[best])}</span></div>
      <p class="verdict-sub">${esc(conclusionText(c))}${o.length > 1 && res.rank[o[1]] !== 1 ? ` Selisih dengan peringkat kedua ${num(gap)}.` : ''} Bobot ${esc(M.WEIGHT_METHODS[c.weights.method].short)} · normalisasi ${esc(T.NORMALIZATIONS[res.normalization].label.toLowerCase())} · jarak Euclidean.</p>
    </div>
    <section class="panel">
      <div class="panel-head"><h2>Tabel peringkat</h2>${copyBtn('rank')}</div>
      <div class="table-wrap"><table class="data rank-table" data-copy="rank"><thead><tr><th scope="col" data-t="Peringkat"><span class="lg-only">Peringkat</span><span class="sm-only">#</span></th><th scope="col">Alternatif</th><th scope="col" class="dcol">D+</th><th scope="col" class="dcol">D−</th><th scope="col">C*</th><th scope="col" class="bar-head"><span class="sr">Grafik</span></th></tr></thead><tbody>${rows}</tbody></table></div>
    </section>
    <div class="chart-grid">
      ${chartCard('closeness', 'Nilai preferensi C*', 'Peringkat alternatif berdasarkan koefisien kedekatan relatif (0–1). Makin panjang batang, makin dekat ke solusi ideal.', CH.closeness, { wide: true })}
      ${chartCard('distance-map', 'Peta jarak ke solusi ideal', 'D+ (datar) vs D− (tegak). Kiri atas = paling dekat ke ideal; garis putus-putus = C* sama.', CH.distanceMap)}
      ${p.criteria.length >= 3 ? chartCard('radar', 'Radar alternatif teratas', 'Profil kinerja relatif hingga lima alternatif teratas (1 = setara ideal positif).', CH.radar) : chartCard('distance-bars', 'Jarak D+ dan D−', 'D+ kecil dan D− besar menghasilkan C* tinggi.', CH.distanceBars)}
      ${chartCard('heatmap', 'Kinerja relatif per kriteria', '1 = setara solusi ideal positif, 0 = setara solusi ideal negatif. Baris diurutkan menurut peringkat.', CH.heatmap, { wide: true, scroll: true })}
      ${p.criteria.length >= 3 ? chartCard('distance-bars', 'Jarak D+ dan D−', 'D+ kecil dan D− besar menghasilkan C* tinggi.', CH.distanceBars) : ''}
      ${chartCard('weights-r', 'Bobot kriteria', 'Bobot ternormalisasi (w) yang dipakai.', CH.weights, { wide: p.criteria.length < 3 })}
    </div>
    ${renderSteps(c)}
    <div class="step-foot"><button class="btn lg" data-act="goto" data-step="matrix">${icon('arrowL')}Matriks keputusan</button><button class="btn primary lg" data-act="goto" data-step="sens">Uji sensitivitas${icon('arrowR')}</button></div>`;
  }

  /* ================================================================== *
   * Langkah 4: Sensitivitas
   * ================================================================== */

  function currentWhatIf(c) { return S.ui.whatIf || c.res.w.slice(); }

  function dynBars(C0) {
    const p = S.p;
    const order = C0.map((_, k) => k).sort((a, b) => C0[b] - C0[a]);
    const ranks = T.rankDesc(C0);
    const max = Math.max(...C0, 1e-9);
    const base = comp().res;
    return order.map((k) => {
      const moved = base.rank[k] - ranks[k];
      return `<li><span class="pb-name"><span class="sw" style="background:${C.colorAt(theme(), k)}"></span><span class="pb-rank num">${ranks[k]}.</span>${esc(p.alternatives[k].name)}${moved ? `<span class="move ${moved > 0 ? 'upm' : 'downm'}">${moved > 0 ? '▲' : '▼'}${Math.abs(moved)}</span>` : ''}</span><span class="pb-bar"><i style="width:${(C0[k] / max * 100).toFixed(2)}%;background:${C.colorAt(theme(), k)}"></i></span><span class="pb-val num">${num(C0[k], 4)}</span></li>`;
    }).join('');
  }

  function renderSens() {
    const p = S.p;
    const c = comp();
    const headP = '<div class="page-head"><div><h1>Analisis sensitivitas</h1><p>Uji seberapa kuat peringkat bila bobot, metode normalisasi, atau daftar alternatif berubah.</p></div></div>';
    if (!c.ok) return headP + errorsBanner(c);
    const ex = extras();
    const tabs = [['gradient', 'Gradien bobot'], ['whatif', 'Simulasi bobot'], ['norm', 'Perbandingan normalisasi'], ['rr', 'Uji rank reversal']];
    const tab = S.ui.sensTab;
    let body = '';
    if (tab === 'gradient') {
      const idx = Math.min(S.ui.gradIdx, p.criteria.length - 1);
      const sens = ex.getSens();
      const rows = sens.map((s) => {
        const t = s.stability;
        const repl = [t.loBy !== null ? `&lt; ${pct(t.lo)}: ${esc(p.alternatives[t.loBy].name)}` : null, t.hiBy !== null ? `&gt; ${pct(t.hi)}: ${esc(p.alternatives[t.hiBy].name)}` : null].filter(Boolean).join('<br>') || '<span class="ok-text">Tidak berubah pada 0–100%</span>';
        const width = t.hi - t.lo;
        return `<tr><th scope="row">${esc(s.name)}</th><td class="num">${pct(t.x0)}</td><td>${esc(p.alternatives[t.top].name)}</td><td class="num">${pct(t.lo)} – ${pct(t.hi)}</td><td><div class="range-bar" title="Rentang stabil"><span style="left:${(t.lo * 100).toFixed(2)}%;width:${(width * 100).toFixed(2)}%"></span><i style="left:${(t.x0 * 100).toFixed(2)}%"></i></div></td><td>${repl}</td></tr>`;
      }).join('');
      body = `<div class="ctrl-row"><label class="field inline"><span>Kriteria yang bobotnya diubah</span><select data-bind="grad-idx">${p.criteria.map((k, j) => `<option value="${j}"${j === idx ? ' selected' : ''}>C${j + 1} ${esc(k.name)}</option>`).join('')}</select></label></div>
        <p class="lead">Grafik menunjukkan C* setiap alternatif bila bobot <b>${esc(p.criteria[idx].name)}</b> diubah dari 0% hingga 100%, sementara bobot kriteria lain diskalakan proporsional. Garis tegak = bobot saat ini; area biru muda = rentang bobot saat peringkat pertama tidak berubah; lingkaran = titik peringkat pertama berganti.</p>
        ${chartCard('sens-grad', `C* terhadap bobot ${p.criteria[idx].name}`, '', CH.gradient(idx), { plain: true, file: 'sensitivitas-' + (idx + 1) })}
        <h3 class="sub-h">Rentang stabil semua kriteria</h3>
        <div class="table-wrap"><table class="data"><thead><tr><th scope="col">Kriteria</th><th scope="col">Bobot saat ini</th><th scope="col">Peringkat 1</th><th scope="col">Rentang stabil</th><th scope="col">0–100%</th><th scope="col">Pengganti di batas</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    } else if (tab === 'whatif') {
      const w = currentWhatIf(c);
      const C0 = ex.ev(w);
      body = `<p class="lead">Geser bobot untuk melihat perubahan nilai C* dan peringkat secara langsung. Bobot lain menyesuaikan agar total tetap 100%. Simulasi ini tidak mengubah proyek.</p>
        <div class="dyn">
          <div class="dyn-col"><h3>Bobot kriteria</h3>${p.criteria.map((k, j) => `<div class="dyn-row"><label for="dw-${j}">${esc(k.name)}</label><input id="dw-${j}" type="range" min="0" max="1000" step="1" value="${Math.round(w[j] * 1000)}" style="--v:${(w[j] * 100).toFixed(2)}%" data-bind="dyn-w" data-i="${j}"><span class="num" data-dyn-val="${j}">${pct(w[j])}</span></div>`).join('')}
            <div class="row-buttons"><button class="btn sm" data-act="sens-reset" ${S.ui.whatIf ? '' : 'disabled'}>${icon('reset')}Kembalikan bobot awal</button></div></div>
          <div class="dyn-col"><h3>Peringkat simulasi</h3><ul class="prio-bars big" id="dyn-alts">${dynBars(C0)}</ul><p class="note">▲/▼ = perubahan peringkat dibanding hasil utama.</p></div>
        </div>`;
    } else if (tab === 'norm') {
      const nc = ex.getNc();
      const methods = Object.keys(nc);
      const rows = p.alternatives.map((a, i) => `<tr><th scope="row">${esc(a.name)}</th>${methods.map((k) => `<td class="num${k === c.normalization ? ' strong' : ''}">${nc[k].rank[i]} <span class="muted">(${num(nc[k].C[i], 4)})</span></td>`).join('')}</tr>`).join('');
      const allSame = methods.every((k) => nc[k].rank.every((r, i) => r === nc.vector.rank[i]));
      body = `<p class="lead">TOPSIS dihitung ulang dengan empat metode normalisasi memakai bobot yang sama. Peringkat yang konsisten antar metode menandakan hasil yang kokoh. Korelasi Spearman 1 berarti urutan identik dengan normalisasi vektor.</p>
        <div class="banner ${allSame ? 'ok' : 'info'}">${icon(allSame ? 'check' : 'alert')}<div>${allSame ? 'Peringkat sama pada keempat metode normalisasi.' : 'Sebagian peringkat berbeda antar metode normalisasi. Laporkan metode yang Anda pakai (vektor = TOPSIS klasik).'}</div></div>
        <div class="table-wrap"><table class="data" data-copy="norm"><thead><tr><th scope="col">Alternatif</th>${methods.map((k) => `<th scope="col">${esc(T.NORMALIZATIONS[k].label)}</th>`).join('')}</tr></thead>
        <tbody>${rows}<tr class="sum-row"><th scope="row">Spearman vs vektor</th>${methods.map((k) => `<td class="num">${num(nc[k].rho, 3)}</td>`).join('')}</tr></tbody></table></div>
        <div class="row-buttons">${copyBtn('norm')}</div>
        ${chartCard('bump', 'Peringkat pada setiap metode normalisasi', 'Angka dalam lingkaran = peringkat.', CH.bump, { plain: true })}`;
    } else {
      const rr = ex.getRr();
      if (!rr.length) body = '<p class="note">Uji rank reversal membutuhkan minimal 3 alternatif.</p>';
      else {
        const changed = rr.filter((r) => r.changed).length;
        body = `<p class="lead">Satu alternatif dihapus bergantian, lalu TOPSIS dihitung ulang dengan bobot yang sama. Bila urutan alternatif lain ikut berubah, terjadi <i>rank reversal</i> — sifat yang dikenal pada TOPSIS (García-Cascales &amp; Lamata, 2012).</p>
          <div class="banner ${changed ? 'info' : 'ok'}">${icon(changed ? 'alert' : 'check')}<div>${changed ? `${changed} dari ${rr.length} skenario penghapusan mengubah urutan alternatif lain.` : 'Tidak ada rank reversal: urutan alternatif lain tetap pada setiap skenario.'}</div></div>
          <div class="table-wrap"><table class="data" data-copy="rr"><thead><tr><th scope="col">Alternatif dihapus</th><th scope="col">Urutan baru</th><th scope="col">Pasangan bertukar</th><th scope="col">Peringkat 1 berubah?</th></tr></thead>
          <tbody>${rr.map((r) => `<tr><th scope="row">${esc(p.alternatives[r.removed].name)}</th><td>${r.order.map((i) => esc(p.alternatives[i].name)).join(' › ')}</td><td class="num">${r.flips.length ? `<span class="bad-text">${r.flips.length}</span>` : '0'}</td><td>${r.topChanged ? '<span class="bad-text">Ya</span>' : 'Tidak'}</td></tr>`).join('')}</tbody></table></div>
          <div class="row-buttons">${copyBtn('rr')}</div>`;
      }
    }
    return `${headP}
    <section class="panel">
      <div class="tabs" role="tablist">${tabs.map(([id, label]) => `<button role="tab" aria-selected="${tab === id}" class="${tab === id ? 'on' : ''}" data-act="sens-tab" data-id="${id}">${label}</button>`).join('')}</div>
      <div class="sens-body">${body}</div>
    </section>
    <div class="step-foot"><button class="btn lg" data-act="goto" data-step="results">${icon('arrowL')}Hasil</button><button class="btn primary lg" data-act="goto" data-step="report">Laporan & unduh${icon('arrowR')}</button></div>`;
  }

  /* ================================================================== *
   * Langkah 5: Laporan & unduh
   * ================================================================== */

  const CITE = () => `Tarigan, A. G. E. (2026). <i>TOPSIS Decision Engine</i> (Versi 2.0) [Perangkat lunak]. ${esc(X.TOOL_URL)}`;

  function references(c) {
    const out = ['Hwang, C. L., & Yoon, K. (1981). Multiple Attribute Decision Making: Methods and Applications. Springer-Verlag.'];
    const m = c.weights.method;
    if (m === 'entropy') out.push('Shannon, C. E. (1948). A mathematical theory of communication. Bell System Technical Journal, 27(3), 379–423.');
    if (m === 'critic') out.push('Diakoulaki, D., Mavrotas, G., & Papayannakis, L. (1995). Determining objective weights in multiple criteria problems: The CRITIC method. Computers & Operations Research, 22(7), 763–770.');
    if (m === 'ahp') {
      out.push('Saaty, T. L. (1980). The Analytic Hierarchy Process. McGraw-Hill.');
      if (c.weights.info && c.weights.info.missing) out.push('Harker, P. T. (1987). Incomplete pairwise comparisons in the analytic hierarchy process. Mathematical Modelling, 9(11), 837–848.');
    }
    out.push('García-Cascales, M. S., & Lamata, M. T. (2012). On rank reversal and TOPSIS method. Mathematical and Computer Modelling, 56(5–6), 123–132.');
    out.push('Tarigan, A. G. E. (2026). TOPSIS Decision Engine (Versi 2.0) [Perangkat lunak]. ' + X.TOOL_URL);
    return out;
  }

  function renderReport() {
    const p = S.p;
    const c = comp();
    const dis = c.ok ? '' : 'disabled';
    return `<div class="page-head"><div><h1>Laporan & unduh</h1><p>Semua berkas dibuat di browser Anda. Tidak ada data yang dikirim ke server.</p></div></div>
    ${c.ok ? '' : errorsBanner(c)}
    <section class="panel">
      <div class="panel-head"><h2>Identitas laporan</h2><span class="hint">opsional, tampil di PDF</span></div>
      <div class="settings two">
        <label class="field"><span>Disusun oleh</span><input type="text" value="${esc(p.meta.author)}" data-bind="meta-author" data-fk="meta-author" maxlength="120" placeholder="Nama / NIM" autocomplete="off"></label>
        <label class="field"><span>Keterangan singkat</span><input type="text" value="${esc(p.meta.description)}" data-bind="meta-desc" data-fk="meta-desc" maxlength="1000" placeholder="Misalnya: studi kasus PT Maju Jaya, 2026" autocomplete="off"></label>
      </div>
    </section>
    <div class="dl-grid">
      <button class="dl-card primary" data-act="dl-pdf" ${dis}><span class="dl-ic">${icon('file')}</span><span class="dl-text"><b>Laporan PDF lengkap</b><span>Hasil, semua diagram, langkah perhitungan dengan rumus dan contoh, rincian bobot, sensitivitas, uji ketahanan, dan rujukan.</span></span></button>
      <button class="dl-card" data-act="dl-docx" ${dis}><span class="dl-ic">${icon('doc')}</span><span class="dl-text"><b>Laporan Word (.docx)</b><span>Isi sama dengan PDF, dalam bentuk tabel dan gambar yang bisa disunting untuk Bab IV skripsi.</span></span></button>
      <button class="dl-card" data-act="dl-xlsx" ${dis}><span class="dl-ic">${icon('table')}</span><span class="dl-text"><b>Excel (.xlsx) dengan rumus</b><span>Sheet Data, Perhitungan (rumus SUMSQ, SUMXMY2, RANK), rincian bobot, sensitivitas. Ubah data, semua dihitung ulang.</span></span></button>
      <button class="dl-card" data-act="dl-csv-result" ${dis}><span class="dl-ic">${icon('download')}</span><span class="dl-text"><b>CSV hasil</b><span>Peringkat, D+, D−, dan C* setiap alternatif.</span></span></button>
      <button class="dl-card" data-act="dl-csv-data"><span class="dl-ic">${icon('grid')}</span><span class="dl-text"><b>CSV data</b><span>Kriteria, jenis, bobot, dan matriks keputusan; bisa diimpor kembali.</span></span></button>
      <button class="dl-card" data-act="dl-json"><span class="dl-ic">${icon('folder')}</span><span class="dl-text"><b>Simpan proyek (.json)</b><span>Buka lagi di perangkat lain lewat tombol Buka.</span></span></button>
    </div>
    <p class="note" id="dl-status" aria-live="polite"></p>
    <section class="panel">
      <div class="panel-head"><h2>Bagikan proyek lewat tautan</h2><span class="hint">tanpa server, tanpa akun</span></div>
      <p class="note">Tautan berisi seluruh data proyek (terkompresi). Cocok untuk dikirim ke dosen pembimbing atau rekan; penerima membuka tautan dan langsung melihat hasil yang sama.</p>
      <div class="share-row">
        <button class="btn primary" data-act="make-link">${icon('link')}Buat tautan</button>
        <input type="text" readonly id="share-link" value="${esc(S.shareLink)}" placeholder="Tautan muncul di sini" aria-label="Tautan proyek">
        <button class="btn" data-act="copy-link" ${S.shareLink ? '' : 'disabled'}>${icon('copy')}Salin</button>
      </div>
    </section>
    <section class="panel cite">
      <div class="panel-head"><h2>Cara mengutip</h2></div>
      <p>Bila Anda memakai alat ini untuk skripsi, tesis, atau publikasi, cantumkan:</p>
      <blockquote id="cite-text">${CITE()}</blockquote>
      <button class="btn sm" data-act="copy-cite">${icon('copy')}Salin kutipan</button>
      <p class="note">Rujukan metode: Hwang, C. L., &amp; Yoon, K. (1981). <i>Multiple Attribute Decision Making: Methods and Applications</i>. Springer-Verlag. Rujukan bobot (Entropy, CRITIC, AHP) dan rank reversal dicantumkan otomatis di laporan PDF sesuai metode yang dipakai.</p>
    </section>`;
  }

  function buildReport() {
    const c = comp();
    const ex = extras();
    const t = C.THEMES.light;
    const W = 760;
    const make = (fn) => { try { return fn(W, t); } catch (e) { console.error(e); return null; } };
    const charts = {
      closeness: make(CH.closeness), distanceMap: make(CH.distanceMap), distanceBars: make(CH.distanceBars),
      heatmap: make(CH.heatmap), weights: make(CH.weights), radar: S.p.criteria.length >= 3 ? make(CH.radar) : null, bump: make(CH.bump)
    };
    const sensitivity = ex.getSens().map((s) => Object.assign({}, s, { chart: make(CH.gradient(s.idx)) }));
    return {
      project: S.p, comp: c, dateLabel: today(), conclusion: conclusionText(c), charts, sensitivity,
      evaluate: ex.ev, normCompare: ex.getNc(), rankReversal: ex.getRr(), examples: examples(c), references: references(c),
      fmt: { num: (x, d) => C.num(x, d), pct: (x, d) => C.pct(x, d), raw, judg: judgText }
    };
  }

  // jsPDF (± 450 KB) dimuat hanya saat PDF diminta, agar halaman pertama tetap ringan di ponsel.
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Gagal memuat ' + src + '. Periksa koneksi lalu coba lagi.'));
      document.head.appendChild(s);
    });
  }
  async function loadPdfLib() {
    if (!(window.jspdf && window.jspdf.jsPDF)) await loadScript('assets/vendor/jspdf.umd.min.js');
    if (!window.autoTable && !(window.jspdf_autotable && window.jspdf_autotable.autoTable)) await loadScript('assets/vendor/jspdf.plugin.autotable.min.js');
  }
  async function loadAhpLib() {
    if (!window.AHPCore) await loadScript('assets/js/ahp/ahp-core.js');
    if (!window.AHPModel) await loadScript('assets/js/ahp/model.js');
  }

  async function downloadPdf(btn) {
    const status = $('#dl-status');
    btn.disabled = true;
    const label = btn.querySelector('b');
    const orig = label.textContent;
    try {
      label.textContent = 'Menyusun PDF…';
      await loadPdfLib();
      const blob = await X.buildPdf(buildReport(), (msg) => { if (status) status.textContent = 'Menyusun bagian: ' + msg; });
      X.download(X.safeFileName(S.p.meta.title, 'pdf'), blob);
      if (status) status.textContent = 'PDF selesai dibuat.';
      toast('Laporan PDF diunduh.');
    } catch (e) {
      console.error(e);
      toast('Gagal membuat PDF: ' + e.message, 'error');
      if (status) status.textContent = '';
    } finally {
      label.textContent = orig;
      btn.disabled = false;
    }
  }

  async function downloadDocx(btn) {
    const status = $('#dl-status');
    btn.disabled = true;
    const label = btn.querySelector('b');
    const orig = label.textContent;
    try {
      label.textContent = 'Menyusun dokumen…';
      const bytes = await X.buildDocx(buildReport(), (msg) => { if (status) status.textContent = 'Menyusun bagian: ' + msg; });
      X.download(X.safeFileName(S.p.meta.title, 'docx'), new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
      if (status) status.textContent = 'Dokumen Word selesai dibuat.';
      toast('Laporan Word diunduh.');
    } catch (e) {
      console.error(e);
      toast('Gagal membuat dokumen Word: ' + e.message, 'error');
      if (status) status.textContent = '';
    } finally {
      label.textContent = orig;
      btn.disabled = false;
    }
  }

  function downloadXlsx() {
    try {
      const bytes = X.buildXlsx(X.workbookFromReport(buildReport()));
      X.download(X.safeFileName(S.p.meta.title, 'xlsx'), new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      toast('Berkas Excel diunduh.');
    } catch (e) { console.error(e); toast('Gagal membuat Excel: ' + e.message, 'error'); }
  }

  /* ================================================================== *
   * Berkas masuk
   * ================================================================== */

  async function applyGridConfirmed(grid, source) {
    const g = M.interpretGrid(grid, S.p.settings.decimalSep);
    if (!(await confirmBox(`Ganti tabel dengan data dari ${source}? Terbaca ${g.names.length} kriteria dan ${g.alts.length} alternatif. Kriteria bernama sama mempertahankan jenis dan bobotnya.`, 'Ganti tabel'))) return;
    const r = M.applyGrid(S.p, g);
    S.ui.step = 'matrix';
    touch(true);
    toast(`${r.criteria} kriteria dan ${r.alternatives} alternatif diimpor${r.bad ? `; ${r.bad} sel bukan angka dikosongkan` : ''}.`, r.bad ? 'error' : 'info');
  }

  async function importAhp(obj) {
    await loadAhpLib();
    const ahp = window.AHPModel.normalizeProject(obj);
    if (!(await confirmBox(`Impor bobot dari proyek AHP "${ahp.meta.title}"? Daftar kriteria diganti dengan kriteria penilai AHP beserta bobot globalnya${ahp.alternatives.length >= 2 ? `, dan daftar alternatif diganti dengan ${ahp.alternatives.length} alternatif AHP` : ''}. Nilai yang sudah ada dipertahankan bila nama cocok.`, 'Impor bobot AHP'))) return;
    const r = M.importAhpProject(S.p, ahp, window.AHPModel);
    S.ui.step = 'criteria';
    touch(true);
    toast(`${r.criteria} kriteria dan bobot global AHP diimpor sebagai bobot manual${r.inconsistent ? `; perhatian: ${r.inconsistent} matriks AHP belum konsisten` : ''}.`, r.inconsistent ? 'error' : 'info');
  }

  async function handleFiles(files) {
    const mode = S.fileMode;
    S.fileMode = 'any';
    for (const file of files) {
      try {
        if (/\.xlsx$/i.test(file.name)) {
          const r = await X.readXlsx(await file.arrayBuffer());
          await applyGridConfirmed(r.grid, `sheet "${r.sheet}" di ${file.name}`);
          continue;
        }
        if (/\.xls$/i.test(file.name)) throw new Error('Format .xls lama belum didukung. Simpan ulang sebagai .xlsx atau CSV.');
        const text = await file.text();
        if (/\.(csv|tsv|txt)$/i.test(file.name) || !/^\s*\{/.test(text)) {
          await applyGridConfirmed(M.parseGrid(text), file.name);
          continue;
        }
        const obj = JSON.parse(text);
        if (obj.app === 'ahp-decision-engine' || Array.isArray(obj.nodes)) { await importAhp(obj); continue; }
        if (mode === 'ahp') throw new Error('Berkas ini bukan proyek AHP Decision Engine.');
        const p = M.normalizeProject(obj);
        if (!(await confirmBox(`Buka proyek "${p.meta.title}"? Proyek yang sedang terbuka akan diganti. Unduh dulu bila masih diperlukan.`, 'Buka proyek'))) continue;
        S.p = p;
        C.setLocale({ decimalSep: p.settings.decimalSep });
        S.ui.step = 'results';
        touch(true);
        toast('Proyek dibuka.');
      } catch (e) {
        console.error(e);
        toast(`${file.name}: ${e.message || 'berkas tidak dapat dibaca'}`, 'error');
      }
    }
  }

  /* ================================================================== *
   * Bantuan & contoh
   * ================================================================== */

  function openHelp() {
    openModal(`<h2 class="modal-title">Cara Menggunakan Kalkulator TOPSIS</h2>
      <div class="help">
        <h3>1. Tentukan hal-hal yang penting</h3>
        <p>Masukkan kriteria, bobot kepentingannya, lalu pilih <b>Benefit</b> jika nilai yang besar lebih baik atau <b>Cost</b> jika nilai yang kecil lebih baik. Bobot boleh berupa angka bebas, misalnya 40, 35, dan 25; kalkulator menyesuaikan totalnya menjadi 100%. Bobot juga bisa dihitung objektif dari data (Entropy, CRITIC) atau dari perbandingan berpasangan AHP.</p>
        <h3>2. Masukkan alternatif dan nilainya</h3>
        <p>Tulis nama alternatif seperti nama supplier, produk, atau lokasi, lalu isi nilainya untuk setiap kriteria. Gunakan satuan yang konsisten dalam setiap kolom — misalnya harga dalam juta rupiah, waktu dalam hari, dan kualitas dengan skor 1–10. Data bisa ditempel langsung dari Excel atau diimpor dari CSV/XLSX.</p>
        <h3>3. Hitung dan bandingkan</h3>
        <p>Buka langkah <b>Hasil</b>. Nilai akhir C* antara 0 dan 1 menunjukkan kedekatan relatif terhadap solusi ideal yang dibentuk dari nilai terbaik dan terburuk dalam data Anda. Nilai yang lebih tinggi mendapat peringkat lebih baik. Semua langkah perhitungan (normalisasi, matriks terbobot, solusi ideal, jarak) ditampilkan lengkap dengan rumus dan contoh.</p>
        <div class="guide-example"><strong>Contoh supplier:</strong> kriteria kualitas (Benefit, bobot 40), ketepatan pengiriman (Benefit, bobot 35), dan harga (Cost, bobot 25). Muat lewat tombol <b>Contoh &amp; baru</b>. Angka contoh hanyalah ilustrasi.</div>
        <h3>4. Uji ketahanan dan unduh laporan</h3>
        <p>Langkah <b>Sensitivitas</b> menunjukkan rentang bobot yang mempertahankan alternatif terbaik, simulasi bobot langsung, perbandingan metode normalisasi, dan uji rank reversal. Langkah <b>Laporan</b> menghasilkan PDF, Excel dengan rumus hidup, CSV, dan berkas proyek.</p>
        <h3>Rumus TOPSIS</h3>
        <p>r<sub>ij</sub> = x<sub>ij</sub>/√Σx<sub>ij</sub>² → v<sub>ij</sub> = w<sub>j</sub>·r<sub>ij</sub> → A+ = nilai terbaik per kriteria, A− = nilai terburuk → D+<sub>i</sub> = √Σ(v<sub>ij</sub> − A+<sub>j</sub>)², D−<sub>i</sub> = √Σ(v<sub>ij</sub> − A−<sub>j</sub>)² → C*<sub>i</sub> = D−<sub>i</sub>/(D+<sub>i</sub> + D−<sub>i</sub>).</p>
        <h3>Catatan</h3>
        <p>TOPSIS membandingkan alternatif yang dimasukkan; hasil dapat berubah jika bobot, nilai, atau daftar alternatif berubah. Skor bukan probabilitas atau jaminan kinerja. Semua perhitungan berjalan di browser dan proyek tersimpan otomatis di browser ini; unduh berkas .json untuk cadangan atau pindah perangkat.</p>
      </div>
      <div class="modal-actions"><button class="btn primary" data-act="close-modal" autofocus>Mengerti</button></div>`, { wide: true });
  }

  function openSamples() {
    openModal(`<h2 class="modal-title">Mulai dari contoh atau proyek kosong</h2>
      <p class="modal-text">Proyek yang sedang terbuka akan diganti. Unduh dulu (.json) bila masih diperlukan.</p>
      <ul class="sample-list">${M.SAMPLE_INFO.map((s) => `<li><button class="sample" data-act="load-sample" data-id="${s.id}"><b>${esc(s.title)}</b><span>${esc(s.text)}</span></button></li>`).join('')}
        <li><button class="sample" data-act="load-sample" data-id="__empty"><b>Proyek kosong</b><span>Tiga kriteria dan tiga alternatif kosong untuk diisi sendiri.</span></button></li></ul>
      <div class="modal-actions"><button class="btn" data-act="close-modal">Batal</button></div>`);
  }

  /* ================================================================== *
   * Event: klik
   * ================================================================== */

  function moveItem(list, id, dir) {
    const i = list.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return false;
    [list[i], list[j]] = [list[j], list[i]];
    return true;
  }

  async function onClick(e) {
    const t = e.target.closest('[data-act]');
    if (!t || t.disabled) return;
    const act = t.dataset.act;
    const id = t.dataset.id;
    const p = S.p;
    switch (act) {
      case 'goto':
        S.ui.step = t.dataset.step;
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        $('#main').focus({ preventScroll: true });
        break;
      case 'calc': {
        const c = comp();
        S.ui.step = 'results';
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (!c.ok) toast(c.errors[0], 'error');
        break;
      }
      case 'samples': openSamples(); break;
      case 'load-sample':
        S.p = t.dataset.id === '__empty' ? M.newProject() : M.sampleProject(t.dataset.id);
        C.setLocale({ decimalSep: S.p.settings.decimalSep });
        S.ui.step = t.dataset.id === '__empty' ? 'criteria' : 'results';
        closeModal();
        touch(true);
        toast(t.dataset.id === '__empty' ? 'Proyek kosong dibuat.' : 'Contoh dimuat.');
        break;
      case 'help': openHelp(); break;
      case 'close-modal': closeModal(); break;
      case 'confirm-yes': closeModal(true); break;
      case 'confirm-no': closeModal(false); break;
      case 'open-file': case 'open-data': S.fileMode = 'any'; $('#file-input').click(); break;
      case 'import-ahp': S.fileMode = 'ahp'; $('#file-input').click(); break;
      case 'save-json':
      case 'dl-json':
        saveNow();
        X.download(X.safeFileName(p.meta.title, 'json'), M.serialize(p), 'application/json');
        toast('Proyek diunduh.');
        break;
      case 'crit-add': {
        const k = M.crit('Kriteria ' + (p.criteria.length + 1), 'benefit', 1);
        p.criteria.push(k);
        S.focusKey = 'cn-' + k.id;
        touch(true);
        break;
      }
      case 'crit-del': {
        const k = p.criteria.find((x) => x.id === id);
        if (!k) break;
        const hasData = p.alternatives.some((a) => M.getValue(p, a.id, id) !== null);
        if (hasData && !(await confirmBox(`Hapus kriteria "${k.name}" beserta nilainya di matriks keputusan?`, 'Hapus', true))) break;
        p.criteria = p.criteria.filter((x) => x.id !== id);
        M.prune(p);
        S.ui.gradIdx = 0;
        touch(true);
        break;
      }
      case 'crit-up': case 'crit-down':
        if (moveItem(p.criteria, id, act === 'crit-up' ? -1 : 1)) { S.focusKey = null; touch(true); }
        break;
      case 'alt-add': {
        const a = M.alt('Alternatif ' + (p.alternatives.length + 1));
        p.alternatives.push(a);
        S.focusKey = 'an-' + a.id;
        touch(true);
        break;
      }
      case 'alt-del': {
        const a = p.alternatives.find((x) => x.id === id);
        if (!a) break;
        const hasData = p.criteria.some((k) => M.getValue(p, id, k.id) !== null);
        if (hasData && !(await confirmBox(`Hapus alternatif "${a.name}" beserta nilainya?`, 'Hapus', true))) break;
        p.alternatives = p.alternatives.filter((x) => x.id !== id);
        M.prune(p);
        touch(true);
        break;
      }
      case 'alt-up': if (moveItem(p.alternatives, id, -1)) touch(true); break;
      case 'clear-values':
        if (!(await confirmBox('Kosongkan semua nilai di matriks keputusan? Nama kriteria dan alternatif tetap.', 'Kosongkan', true))) break;
        p.values = {};
        touch(true);
        break;
      case 'paste-open': openPaste(); break;
      case 'paste-apply': {
        const g = pastePreview();
        if (!g) break;
        const r = M.applyGrid(p, g);
        closeModal();
        S.ui.step = 'matrix';
        touch(true);
        toast(`${r.criteria} kriteria dan ${r.alternatives} alternatif ditempel${r.bad ? `; ${r.bad} sel bukan angka dikosongkan` : ''}.`, r.bad ? 'error' : 'info');
        break;
      }
      case 'dl-template':
        X.download(X.safeFileName(p.meta.title + '-templat', 'csv'), X.csvString(M.dataRows(p), p.settings.decimalSep), 'text/csv');
        toast('Templat CSV diunduh. Isi di Excel, lalu impor kembali.');
        break;
      case 'dl-csv-data':
        X.download(X.safeFileName(p.meta.title + '-data', 'csv'), X.csvString(M.dataRows(p), p.settings.decimalSep), 'text/csv');
        toast('CSV data diunduh.');
        break;
      case 'dl-csv-result': {
        const c = comp();
        if (!c.ok) break;
        X.download(X.safeFileName(p.meta.title + '-hasil', 'csv'), X.csvString(X.resultRows({ project: p, comp: c }), p.settings.decimalSep), 'text/csv');
        toast('CSV hasil diunduh.');
        break;
      }
      case 'dl-pdf': downloadPdf(t); break;
      case 'dl-xlsx': downloadXlsx(); break;
      case 'dl-docx': downloadDocx(t); break;
      case 'scroll-ahp': { const el = $('#ahp-panel'); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); const inp = $('[data-bind="ahp-cell"]', el); if (inp) setTimeout(() => inp.focus({ preventScroll: true }), 400); } break; }
      case 'chart-png': exportChart(id, 'png'); break;
      case 'chart-svg': exportChart(id, 'svg'); break;
      case 'chart-table': {
        const fig = t.closest('[data-chart]');
        const box = fig.querySelector('.chart-table');
        box.hidden = !box.hidden;
        t.setAttribute('aria-expanded', String(!box.hidden));
        if (!box.hidden) box.innerHTML = tableHTML(S.charts[id] && S.charts[id].table);
        break;
      }
      case 'copy-table': {
        const tb = $(`table[data-copy="${CSS.escape(id)}"]`);
        if (!tb) break;
        const cellsOf = (r) => Array.from(r.cells).filter((cell) => !cell.classList.contains('bar-cell') && !cell.classList.contains('bar-head'));
        const txt = (cell) => (cell.dataset.t || cell.textContent).replace(/\s+/g, ' ').trim();
        const tsv = Array.from(tb.rows).map((r) => cellsOf(r).map(txt).join('\t')).join('\n');
        const html = '<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;font-family:Times New Roman;font-size:10pt">' + Array.from(tb.rows).map((r, ri) => '<tr>' + cellsOf(r).map((cell, ci) => {
          const tag = ri === 0 && tb.tHead ? 'th' : 'td';
          return `<${tag} style="text-align:${ci > 0 && /^[-−]?[\d.,]+%?$/.test(txt(cell)) ? 'right' : 'left'}">${esc(txt(cell))}</${tag}>`;
        }).join('') + '</tr>').join('') + '</table>';
        copyRich(html, tsv, 'Tabel disalin. Tempel di Word atau Excel (sebagai tabel).');
        break;
      }
      case 'sens-tab': S.ui.sensTab = id; render(); break;
      case 'sens-reset': S.ui.whatIf = null; render(); break;
      case 'make-link': {
        try {
          const code = await M.encodePayload(p);
          S.shareLink = location.origin + location.pathname + '#proyek=' + code;
          const inp = $('#share-link');
          if (inp) inp.value = S.shareLink;
          const cb = $('[data-act="copy-link"]');
          if (cb) cb.disabled = false;
          if (S.shareLink.length > 8000) toast('Tautan cukup panjang; beberapa aplikasi chat mungkin memotongnya. Kirim berkas .json bila tautan tidak terbuka.', 'error');
          else toast('Tautan dibuat.');
        } catch (err) { toast('Gagal membuat tautan: ' + err.message, 'error'); }
        break;
      }
      case 'copy-link': copyText(S.shareLink, 'Tautan disalin.'); break;
      case 'copy-cite': copyText($('#cite-text').innerText, 'Kutipan disalin.'); break;
      default: break;
    }
  }

  async function copyRich(html, text, okMsg) {
    try {
      if (!(navigator.clipboard && window.ClipboardItem)) throw new Error('no rich clipboard');
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      toast(okMsg);
    } catch (e) { copyText(text, okMsg); }
  }

  async function copyText(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      toast(okMsg);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast(okMsg); } catch (err) { toast('Salin manual: tekan Ctrl+C.', 'error'); }
      ta.remove();
    }
  }

  /* ================================================================== *
   * Event: input / change / paste / keyboard
   * ================================================================== */

  let weightTimer = null;
  function refreshWeightsSoon() { clearTimeout(weightTimer); weightTimer = setTimeout(refreshWeights, 120); }

  function onInput(e) {
    const t = e.target;
    const bind = t.dataset ? t.dataset.bind : null;
    const p = S.p;
    if (t.id === 'project-title') { p.meta.title = t.value.slice(0, 160) || 'Proyek TOPSIS'; touch(false); document.title = p.meta.title + ' — Kalkulator TOPSIS'; return; }
    if (t.id === 'paste-text') { pastePreview(); return; }
    if (!bind) return;
    switch (bind) {
      case 'crit-name': { const k = p.criteria.find((x) => x.id === t.dataset.id); if (k) { k.name = t.value.slice(0, 160); touch(false); refreshWeightsSoon(); } break; }
      case 'crit-unit': { const k = p.criteria.find((x) => x.id === t.dataset.id); if (k) { k.unit = t.value.slice(0, 40); touch(false); } break; }
      case 'crit-weight': {
        const k = p.criteria.find((x) => x.id === t.dataset.id);
        const v = M.parseNumber(t.value, p.settings.decimalSep);
        const bad = Number.isNaN(v) || (v !== null && v < 0);
        t.classList.toggle('invalid', bad);
        if (bad || !k) return;
        k.weight = v === null ? 0 : v;
        touch(false);
        refreshWeightsSoon();
        break;
      }
      case 'alt-name': { const a = p.alternatives.find((x) => x.id === t.dataset.id); if (a) { a.name = t.value.slice(0, 160); touch(false); } break; }
      case 'cell': {
        const v = M.parseNumber(t.value, p.settings.decimalSep);
        t.classList.toggle('invalid', Number.isNaN(v));
        if (Number.isNaN(v)) return;
        t.classList.toggle('empty-cell', v === null);
        M.setValue(p, t.dataset.a, t.dataset.c, v);
        touch(false);
        refreshMatrixStatus();
        break;
      }
      case 'meta-author': p.meta.author = t.value.slice(0, 120); touch(false); break;
      case 'meta-desc': p.meta.description = t.value.slice(0, 1000); touch(false); break;
      case 'dyn-w': {
        const c = comp();
        const ex = extras();
        const i = Number(t.dataset.i);
        const w = T.adjustWeights(currentWhatIf(c), i, Number(t.value) / 1000);
        S.ui.whatIf = w;
        $$('[data-bind="dyn-w"]').forEach((r) => {
          const k = Number(r.dataset.i);
          if (r !== t) r.value = Math.round(w[k] * 1000);
          r.style.setProperty('--v', (w[k] * 100).toFixed(2) + '%');
        });
        $$('[data-dyn-val]').forEach((s) => { s.textContent = pct(w[Number(s.dataset.dynVal)]); });
        $('#dyn-alts').innerHTML = dynBars(ex.ev(w));
        const reset = $('[data-act="sens-reset"]'); if (reset) reset.disabled = false;
        break;
      }
      default: break;
    }
  }

  function onChange(e) {
    const t = e.target;
    const p = S.p;
    if (t.id === 'file-input') { handleFiles(Array.from(t.files || [])); t.value = ''; return; }
    const bind = t.dataset ? t.dataset.bind : null;
    if (!bind) return;
    switch (bind) {
      case 'crit-name': case 'alt-name':
        // 'change' terjadi saat blur; jangan render ulang agar klik berikutnya tidak tertelan.
        if (!t.value.trim()) {
          const list = bind === 'crit-name' ? p.criteria : p.alternatives;
          const idx = list.findIndex((x) => x.id === t.dataset.id);
          t.value = (bind === 'crit-name' ? 'Kriteria ' : 'Alternatif ') + (idx + 1);
          onInput({ target: t });
        }
        break;
      case 'crit-weight': {
        const k = p.criteria.find((x) => x.id === t.dataset.id);
        if (k && t.classList.contains('invalid')) { toast('Bobot harus angka 0 atau lebih.', 'error'); t.value = raw(k.weight); t.classList.remove('invalid'); }
        break;
      }
      case 'cell': {
        if (t.classList.contains('invalid')) { toast('Isi dengan angka, misalnya 12, 3,5, atau 1.250.000.', 'error'); break; }
        const v = M.getValue(p, t.dataset.a, t.dataset.c);
        t.value = raw(v);
        break;
      }
      case 'crit-type': { const k = p.criteria.find((x) => x.id === t.dataset.id); if (k) { k.type = t.value === 'cost' ? 'cost' : 'benefit'; S.focusKey = t.dataset.fk; touch(true); } break; }
      case 'weight-method': p.weighting.method = t.value; touch(true); break;
      case 'set-norm': p.settings.normalization = t.value; touch(true); break;
      case 'set-dec': p.settings.decimals = Number(t.value); touch(true); break;
      case 'set-sep': p.settings.decimalSep = t.value; C.setLocale({ decimalSep: t.value }); touch(true); break;
      case 'grad-idx': S.ui.gradIdx = Number(t.value); render(); break;
      case 'ahp-cell': {
        const v = T.parseJudgment(t.value);
        if (Number.isNaN(v) || (v !== null && (v < 1 / 9 - 1e-9 || v > 9 + 1e-9))) {
          t.classList.add('invalid');
          toast('Isi angka 1/9 sampai 9, misalnya 3, 1/3, atau 2,5.', 'error');
          return;
        }
        t.classList.remove('invalid');
        M.setJudgment(p, t.dataset.a, t.dataset.b, v);
        touch(false);
        t.value = v === null ? '' : judgText(v);
        const rc = $(`[data-recip="${CSS.escape(t.dataset.b + '>' + t.dataset.a)}"]`);
        if (rc) rc.textContent = v === null ? '–' : judgText(1 / v);
        refreshWeights();
        break;
      }
      default: break;
    }
  }

  function onPaste(e) {
    const t = e.target;
    if (!t.dataset || t.dataset.bind !== 'cell') return;
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (!text || !/[\t\n\r]/.test(text.trim())) return;   // satu nilai: biarkan perilaku bawaan
    e.preventDefault();
    const i = Number(t.dataset.i), j = Number(t.dataset.j);
    S.focusKey = t.dataset.fk;
    pasteBlock(i, j, text);
  }

  function onKeydown(e) {
    if (e.key === 'Escape' && !$('#modal').hidden) { closeModal(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveNow();
      X.download(X.safeFileName(S.p.meta.title, 'json'), M.serialize(S.p), 'application/json');
      toast('Proyek diunduh.');
      return;
    }
    const t = e.target;
    if (t.dataset && t.dataset.bind === 'cell' && (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const i = Number(t.dataset.i) + (e.key === 'ArrowUp' ? -1 : 1), j = Number(t.dataset.j);
      const next = $(`input[data-bind="cell"][data-i="${i}"][data-j="${j}"]`);
      if (next) { e.preventDefault(); next.focus(); next.select(); }
      else if (e.key === 'Enter') e.preventDefault();
    }
  }

  /* --- tooltip & garis bantu grafik gradien --- */
  function onPointerMove(e) {
    const tipT = e.target.closest && e.target.closest('[data-tip]');
    if (tipT && tipT.closest('.chart-svg')) { showTip(tipT, e.clientX, e.clientY); return; }
    if (e.target.closest && e.target.closest('[data-svg="sens-grad"]')) { gradientHover(e); return; }
    hideTip();
  }

  function gradientHover(e) {
    const ch = S.charts['sens-grad'];
    const box = $('[data-svg="sens-grad"]');
    if (!ch || !box) return;
    const svg = box.querySelector('svg');
    const r = svg.getBoundingClientRect();
    const sx = ch.width / r.width;
    const x = ((e.clientX - r.left) * sx - ch.meta.left) / ch.meta.plotW;
    let ln = svg.querySelector('.hover-line');
    if (x < 0 || x > 1) { hideTip(); if (ln) ln.remove(); return; }
    const c = comp();
    const ex = extras();
    const idx = Math.min(S.ui.gradIdx, S.p.criteria.length - 1);
    const f = ex.ev(T.adjustWeights(c.res.w, idx, x));
    const order = f.map((_, k) => k).sort((a, b) => f[b] - f[a]);
    const tip = $('#tip');
    tip.textContent = `Bobot ${S.p.criteria[idx].name} ${pct(x)}\n` + order.map((k, r) => `${r + 1}. ${S.p.alternatives[k].name}: ${num(f[k], 4)}`).join('\n');
    tip.hidden = false;
    placeTip(tip, e.clientX, e.clientY);
    const px = ch.meta.left + x * ch.meta.plotW;
    if (!ln) {
      ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      ln.setAttribute('class', 'hover-line');
      ln.setAttribute('stroke', theme().ink2);
      ln.setAttribute('stroke-width', '1');
      ln.setAttribute('pointer-events', 'none');
      svg.appendChild(ln);
    }
    ln.setAttribute('x1', px); ln.setAttribute('x2', px);
    ln.setAttribute('y1', ch.meta.top); ln.setAttribute('y2', ch.meta.top + ch.meta.plotH);
  }

  /* ================================================================== *
   * Inisialisasi
   * ================================================================== */

  async function init() {
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    document.addEventListener('paste', onPaste);
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('pointermove', onPointerMove);
    document.documentElement.addEventListener('mouseleave', hideTip);
    window.addEventListener('scroll', hideTip, { passive: true, capture: true });
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.closest('#modal-close')) closeModal(); });
    window.addEventListener('beforeunload', saveNow);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });

    // seret & lepas berkas ke halaman
    document.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dropping'); });
    document.addEventListener('dragleave', (e) => { if (e.target === document.documentElement || e.clientX <= 0) document.body.classList.remove('dropping'); });
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      document.body.classList.remove('dropping');
      if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(Array.from(e.dataTransfer.files));
    });

    let resizeTimer = null;
    let lastW = window.innerWidth;
    window.addEventListener('resize', () => {
      if (Math.abs(window.innerWidth - lastW) < 8) return;
      lastW = window.innerWidth;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => mountCharts(document), 180);
    });

    const hash = location.hash || '';
    const params = new URLSearchParams(location.search);
    const saved = M.loadLocal();
    try {
      if (/^#proyek=/.test(hash)) {
        const linked = M.normalizeProject(await M.decodePayload(hash));
        history.replaceState(null, '', location.pathname + location.search);
        const same = saved && JSON.stringify(saved.values) === JSON.stringify(linked.values) && saved.criteria.length === linked.criteria.length;
        if (saved && !same) {
          S.p = saved;
          setTimeout(() => toast(`Tautan berisi proyek "${linked.meta.title}". Proyek Anda saat ini tetap dibuka.`, 'info', { label: 'Buka proyek tautan', run: () => { S.p = linked; C.setLocale({ decimalSep: linked.settings.decimalSep }); S.ui.step = 'results'; touch(true); } }), 50);
        } else {
          S.p = linked;
          S.ui.step = 'results';
        }
      } else if (params.get('contoh')) {
        const sampleId = params.get('contoh');
        history.replaceState(null, '', location.pathname);
        if (saved) {
          S.p = saved;
          setTimeout(() => toast('Proyek terakhir Anda tetap dibuka.', 'info', { label: 'Buka contoh', run: () => { S.p = M.sampleProject(sampleId); S.ui.step = 'results'; touch(true); } }), 50);
        } else {
          S.p = M.sampleProject(sampleId);
          S.ui.step = 'results';
        }
      } else {
        S.p = saved || M.sampleProject('supplier');
      }
    } catch (e) {
      console.error(e);
      S.p = saved || M.sampleProject('supplier');
      setTimeout(() => toast('Tautan tidak dapat dibuka: ' + e.message, 'error'), 50);
    }
    C.setLocale({ decimalSep: S.p.settings.decimalSep });
    render();
    saveNow();
  }

  // Ekspos untuk debugging & uji otomatis
  window.TopsisApp = { state: S, render, comp, extras, buildReport };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
