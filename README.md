# ⚖️ TOPSIS Decision Engine

**Kalkulator TOPSIS gratis untuk mahasiswa, dosen, dan peneliti.** Masukkan kriteria benefit/cost dan alternatif, pilih metode bobot (manual, sama rata, Entropy, CRITIC, atau AHP), lihat setiap langkah perhitungan lengkap dengan rumus dan contoh, uji sensitivitas, lalu unduh laporan PDF, Word, dan Excel yang siap dilampirkan di skripsi atau tesis. Semuanya berjalan di browser: tanpa akun, tanpa server, tanpa biaya.

*English: a free, browser-only TOPSIS calculator with objective (Entropy, CRITIC) and AHP weighting, step-by-step calculation tables, sensitivity and robustness analysis, and PDF/Excel reports with live formulas.*

[![Buka aplikasi](https://img.shields.io/badge/Buka_aplikasi-TOPSIS_Decision_Engine-4f46e5?style=for-the-badge&logo=githubpages)](https://edgarcia-id.github.io/topsis-decision-engine-v2/)
[![Metode](https://img.shields.io/badge/Metode-TOPSIS_Hwang_%26_Yoon-10b981?style=for-the-badge)](#metode-dan-rumus)
[![Arsitektur](https://img.shields.io/badge/Arsitektur-100%25_di_browser-f59e0b?style=for-the-badge)](#privasi)
[![Lisensi](https://img.shields.io/badge/Lisensi-MIT-0f172a?style=for-the-badge)](LICENSE)

👉 **[edgarcia-id.github.io/topsis-decision-engine-v2](https://edgarcia-id.github.io/topsis-decision-engine-v2/)**

---

## Fitur

### Input data
- Kriteria tanpa batas praktis, masing-masing dengan **jenis Benefit/Cost**, satuan, dan bobot.
- Matriks keputusan seperti spreadsheet: **salin blok dari Excel/Google Sheets lalu Ctrl+V di sel mana pun**, Enter untuk turun baris.
- **Tempel tabel utuh** (judul kriteria, nama alternatif, baris opsional *Jenis*, *Bobot*, *Satuan*) dengan pratinjau.
- **Impor CSV** (pemisah `,` atau `;`, desimal koma atau titik) dan **impor Excel .xlsx** (sheet bernama *Data* atau sheet pertama).
- Angka format Indonesia maupun Inggris dikenali: `3,5`, `1.250.000`, `1,234.5`, `Rp 12.500`, `85%`.
- Empat contoh siap pakai: pemilihan supplier (contoh versi pertama), seleksi penerima beasiswa, lokasi usaha (Entropy-TOPSIS), dan pemilihan laptop (AHP-TOPSIS).

### Pembobotan
| Metode | Keterangan |
|---|---|
| Manual | angka bebas (mis. 40, 35, 25), dinormalisasi otomatis menjadi 100% |
| Sama rata | semua kriteria sama penting |
| **Entropy** | bobot objektif dari keragaman data (Shannon) |
| **CRITIC** | bobot objektif dari kontras dan konflik antar kriteria (Diakoulaki dkk., 1995) |
| **AHP** | perbandingan berpasangan skala Saaty 1–9 di dalam aplikasi, vektor eigen utama, CR, metode Harker untuk sel kosong |
| Impor AHP | ambil kriteria, bobot global, alternatif, dan data nyata dari berkas proyek [AHP Decision Engine versi 2](https://edgarcia-id.github.io/ahp-decision-engine-v2/) |

### Hasil
- Kesimpulan otomatis, tabel peringkat (D+, D−, C*), dan **langkah perhitungan lengkap**: matriks keputusan, pembagi normalisasi, matriks R, matriks terbobot V, solusi ideal A+/A−, jarak D+/D−, nilai preferensi C*, peringkat — masing-masing dengan rumus, **contoh hitung manual**, dan tombol *Salin* yang menempel sebagai tabel di Word maupun Excel.
- Rincian bobot Entropy (p, e, d, w), CRITIC (N, σ, korelasi, C, w), atau AHP (normalisasi, NCA, vektor eigen, λ maks, CI, RI, CR).
- Diagram: nilai preferensi C*, peta jarak D+ vs D− dengan garis iso-C*, peta panas kinerja relatif per kriteria, jarak D+/D−, radar alternatif teratas, bobot kriteria. Setiap diagram bisa diunduh **PNG/SVG** dan dilihat sebagai tabel.

### Uji ketahanan
- **Gradien bobot**: C* tiap alternatif saat bobot satu kriteria diubah 0–100%, titik pergantian peringkat pertama, dan **rentang stabil** untuk semua kriteria.
- **Simulasi bobot**: geser slider, peringkat berubah langsung.
- **Perbandingan normalisasi**: vektor, linear, min–maks, jumlah, dengan korelasi Spearman.
- **Uji rank reversal**: hapus satu alternatif bergantian dan periksa apakah urutan alternatif lain berubah.

### Unduhan
- **Laporan PDF**: identitas, kesimpulan, hasil, bobot dan rinciannya, lima langkah TOPSIS dengan rumus dan contoh, semua diagram, sensitivitas, uji ketahanan, dan rujukan yang sesuai metode.
- **Laporan Word (.docx)**: isi yang sama dengan PDF dalam bentuk judul, tabel bernomor, dan gambar bernomor yang bisa disunting langsung untuk Bab IV skripsi.
- **Excel (.xlsx) dengan rumus hidup**: sheet *Data* (bisa diedit dan diimpor kembali), *Perhitungan* (`SQRT(SUMSQ())`, `SUMXMY2`, `RANK`), sheet bobot (*Bobot Entropy* / *Bobot CRITIC* dengan rumus `LN`, `STDEV`, `CORREL`; *Bobot AHP* dengan NCA, λ maks, CI, CR), *Sensitivitas*, dan *Uji ketahanan*. Ubah satu nilai di sheet Data, seluruh langkah dihitung ulang.
- **CSV** hasil dan data, **proyek .json**, dan **tautan proyek** (data terkompresi di dalam tautan, tanpa server) untuk dikirim ke dosen pembimbing.

## Cara memakai

1. **Kriteria & bobot**: tulis kriteria, pilih Benefit/Cost, isi bobot atau pilih metode bobot.
2. **Matriks keputusan**: isi nilai setiap alternatif (ketik, tempel dari Excel, atau impor CSV/XLSX).
3. **Hasil**: peringkat, diagram, dan langkah perhitungan.
4. **Sensitivitas**: gradien bobot, simulasi, perbandingan normalisasi, rank reversal.
5. **Laporan & unduh**: PDF, Word, Excel, CSV, JSON, tautan.

## Metode dan rumus

1. Normalisasi vektor: r<sub>ij</sub> = x<sub>ij</sub> / √(Σ<sub>i</sub> x<sub>ij</sub>²). Pilihan lain: linear (x / maks|x|), min–maks, jumlah (x / Σx). Semua normalisasi mempertahankan arah data; jenis benefit/cost diterapkan saat menentukan solusi ideal.
2. Matriks terbobot: v<sub>ij</sub> = w<sub>j</sub> · r<sub>ij</sub>, dengan Σw = 1.
3. Solusi ideal: A+<sub>j</sub> = maks v<sub>ij</sub> (benefit) atau min v<sub>ij</sub> (cost); A−<sub>j</sub> sebaliknya.
4. Jarak Euclidean: D+<sub>i</sub> = √Σ<sub>j</sub>(v<sub>ij</sub> − A+<sub>j</sub>)², D−<sub>i</sub> = √Σ<sub>j</sub>(v<sub>ij</sub> − A−<sub>j</sub>)².
5. Nilai preferensi: C*<sub>i</sub> = D−<sub>i</sub> / (D+<sub>i</sub> + D−<sub>i</sub>); peringkat 1 = C* terbesar (nilai seri mendapat peringkat sama seperti `RANK()` di Excel).

Bobot objektif:
- **Entropy**: p<sub>ij</sub> = x<sub>ij</sub>/Σ<sub>i</sub>x<sub>ij</sub>; e<sub>j</sub> = −(1/ln m) Σ p<sub>ij</sub> ln p<sub>ij</sub>; d<sub>j</sub> = 1 − e<sub>j</sub>; w<sub>j</sub> = d<sub>j</sub>/Σd (membutuhkan nilai ≥ 0).
- **CRITIC**: normalisasi min–maks searah (cost dibalik), σ<sub>j</sub> simpangan baku sampel, r<sub>jk</sub> korelasi Pearson, C<sub>j</sub> = σ<sub>j</sub> Σ<sub>k</sub>(1 − r<sub>jk</sub>), w<sub>j</sub> = C<sub>j</sub>/ΣC.
- **AHP**: vektor eigen utama; CR = CI/RI dengan RI Saaty (n=3: 0,58; 4: 0,90; 5: 1,12; 6: 1,24; 7: 1,32; 8: 1,41; 9: 1,45; 10: 1,49).

Sensitivitas: bobot satu kriteria diubah, kriteria lain diskalakan proporsional. Karena C* tidak linear terhadap bobot, titik pergantian peringkat pertama dicari dengan pemindaian rapat lalu *bisection* hingga presisi 10⁻¹².

### Validasi

- 26 unit test (`node --test tests/*.test.js`), termasuk pembanding terhadap implementasi numpy independen untuk 26 kasus × 4 normalisasi, bobot Entropy/CRITIC, dan `numpy.linalg.eig` untuk AHP.
- Contoh supplier menghasilkan peringkat dan nilai yang sama dengan kalkulator versi pertama (B 0,5633; C 0,5318; A 0,4015).
- Rumus berkas Excel dihitung ulang di LibreOffice untuk 80 kombinasi (4 contoh × 5 metode bobot × 4 normalisasi) dan cocok dengan aplikasi hingga 10⁻⁹, tanpa sel galat.
- Uji end-to-end di Chromium (desktop dan ponsel 360 px) untuk seluruh alur, termasuk tempel, impor, unduhan, dan tautan.

## Privasi

Semua perhitungan berjalan di browser Anda. Proyek tersimpan otomatis di penyimpanan lokal browser; unduh berkas `.json` untuk cadangan. Tidak ada analitik, tidak ada pelacak, tidak ada data yang dikirim ke server. Font dan pustaka PDF disertakan di repositori sehingga aplikasi tetap berjalan tanpa CDN.

## Untuk pengembang

```text
index.html                  kerangka halaman
assets/js/topsis-core.js    mesin hitung murni (normalisasi, TOPSIS, Entropy, CRITIC, AHP, sensitivitas, rank reversal)
assets/js/model.js          model proyek, contoh, impor tabel (tempel/CSV), impor proyek AHP, tautan
assets/js/charts.js         diagram SVG tanpa pustaka
assets/js/export.js         XLSX dengan rumus & DOCX (penulis ZIP sendiri), pembaca XLSX, CSV, PNG/SVG, PDF (jsPDF)
assets/js/app.js            antarmuka
assets/js/ahp/              modul AHP Decision Engine, dimuat hanya saat mengimpor proyek AHP
assets/vendor/              jsPDF 3.0.4 + jsPDF-AutoTable 5.0.9 (MIT), dimuat saat PDF diminta
assets/fonts/               Inter (SIL OFL)
tests/                      unit test Node + data pembanding numpy
```

Jalankan lokal tanpa build:

```bash
python3 -m http.server 8000      # lalu buka http://localhost:8000
node --test tests/*.test.js      # unit test
```

> **Laragon/Apache:** bila server lokal memetakan `.html` ke PHP sehingga halaman tampil *Not Found*, tambahkan berkas `.htaccess` berisi `DirectoryIndex index.html index.php` dan `AddType text/html .html .htm` di folder proyek (tidak diperlukan untuk GitHub Pages).

## Cara mengutip

Bila Anda memakai alat ini dalam skripsi, tesis, atau publikasi:

> Tarigan, A. G. E. (2026). *TOPSIS Decision Engine* (Versi 2.0) [Perangkat lunak]. https://edgarcia-id.github.io/topsis-decision-engine-v2/

Metadata kutipan juga tersedia di [`CITATION.cff`](CITATION.cff) (tombol **Cite this repository** di GitHub).

Rujukan metode: Hwang, C. L., & Yoon, K. (1981). *Multiple Attribute Decision Making: Methods and Applications*. Springer-Verlag. · Shannon, C. E. (1948). A mathematical theory of communication. *Bell System Technical Journal, 27*(3), 379–423. · Diakoulaki, D., Mavrotas, G., & Papayannakis, L. (1995). Determining objective weights in multiple criteria problems: The CRITIC method. *Computers & Operations Research, 22*(7), 763–770. · Saaty, T. L. (1980). *The Analytic Hierarchy Process*. McGraw-Hill. · García-Cascales, M. S., & Lamata, M. T. (2012). On rank reversal and TOPSIS method. *Mathematical and Computer Modelling, 56*(5–6), 123–132.

---

## Pengembang

**Alfredo (Ed) Garcia** — [LinkedIn](https://www.linkedin.com/in/alfredo-garcia-elbarta-tarigan/) · ORCID [0009-0001-4549-5129](https://orcid.org/0009-0001-4549-5129)

---
*© 2026 Alfredo Garcia. Dirilis dengan lisensi MIT.*
