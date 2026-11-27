# Dokumentasi Optimasi Barventis v5.3 (Modern Web Guidance & Skill 4 Persona)

**Tanggal Rilis:** 26 November 2026  
**Cakupan Tim:** Ayling (Coding & Performance), Nia (Minimalist Modern CSS & UX), Kei (Accessibility & CWV QA/QC), Izumi (Dokumentasi & Standar Baseline)  
**Target Repositori:** `github.com/lieziragroup-tech/Barventis` (`barventis-v2.vercel.app`)

## 1. Integrasi Skill `modern-web-guidance` (4 Persona)

Paket resmi **Modern Web Guidance** (Chrome, Edge, Firefox, MDN — 211 panduan yang dikonsolidasikan ke dalam 17 handbook domain di dalam skill) telah disimpan sebagai skill aktif **`modern-web-guidance`** dengan matriks aktivasi khusus:

- **Ayling (Coding):** Performa native (`content-visibility: auto`, `scheduler.yield()`, `fetchpriority`), HTML semantik (`<search>`, `<dialog>`), form aman (`autocomplete`, `spellcheck="false"`, `inputmode`), dan sanitasi frontend.
- **Kei (Testing & QA/QC):** Validasi Core Web Vitals (LCP, INP, CLS), aksesibilitas keyboard & screen reader (`:user-invalid`, `:focus-visible`, `prefers-reduced-motion`), serta kompatibilitas *Baseline*.
- **Nia (Design UI/UX):** Desain tenang dan minimalis berbasis CSS native (`dvh`, `accent-color`, `overscroll-behavior: contain`, `text-wrap: balance/pretty`, `tabular-nums`, dan `respect-os-text-scale`).
- **Izumi (Dokumentasi):** Pencatatan standar web platform yang diterapkan beserta jaminan fallback browser pada setiap rilis.

## 2. Optimasi yang Diterapkan ke Barventis v5.3

| Area Optimasi | Panduan Modern Web | Implementasi di Barventis v5.3 | Dampak & Fallback Baseline |
| :--- | :--- | :--- | :--- |
| **OS Text Scaling & Preconnect** | `respect-os-text-scale`, `performance` | Menambahkan `<meta name="text-scale" content="scale" />`, preconnect Google Fonts, dan perbaikan path favicon pada `index.html`. | Mendukung Dynamic Type iOS & skala font Android; aman diabaikan browser lama. |
| **Minimalist Modern CSS & A11y** | `brand-consistent-forms`, `validate-input-after-interaction`, `autofill-highlight-inputs`, `prevent-page-scroll-under-modal-dialog`, `motion`, `responsive-design` | Menambahkan `accent-color: var(--accent)`, `:user-invalid` (validasi hanya setelah interaksi, tidak langsung merah saat halaman dimuat), `:autofill` inset ring tanpa *layout shift*, `min-height: 100dvh` (fallback `100vh`), `overscroll-behavior: contain` pada modal/tabel, `text-wrap: balance/pretty`, `:focus-visible` ring bersih, dan dukungan penuh `prefers-reduced-motion: reduce` di `src/index.css`. | Tampilan tetap clean, minimalis, stabil di layar HP, dan ramah keyboard/screen reader. |
| **Below-the-Fold Rendering Containment** | `defer-rendering-heavy-content` | Menambahkan kelas `.bv-defer-section` (`content-visibility: auto; contain-intrinsic-size: auto 420px`) pada panel tabel bawah di `RoleOperationalDashboards.jsx` serta `tabIndex={0}` pada wrapper tabel scroll horizontal dan landmark `<search>`. | Mempercepat render awal halaman dan mencegah *layout thrashing* tanpa mengorbankan LCP. |
| **INP Long-Task Yielding** | `break-up-long-tasks` | Menambahkan utilitas `src/utils/yieldToMain.js` (`scheduler.yield()` dengan fallback `setTimeout(0)`) dan mengintegrasikannya pada proses parsing `BulkImport.jsx`. | Menjaga antarmuka tetap responsif saat mengimpor berkas Excel/CSV berukuran besar. |
| **Sign-In Autofill Hygiene** | `autofill-sign-in-form` | Menambahkan `autoComplete="email"`, `spellCheck={false}`, `autoCapitalize="none"`, `autoCorrect="off"`, dan `autoComplete="current-password"` di `src/pages/auth/AuthScreen.jsx`. | Mencegah *autocorrect* HP merusak pengetikan email login dan memperlancar *password manager*. |

## 3. Verifikasi QA/QC v5.3 (Kei)

Seluruh gerbang verifikasi v5.3 terkonfirmasi **PASS**:
- Skill `modern-web-guidance` aktif tersimpan dengan 17 handbook domain.
- `index.html` memuat `meta[name="text-scale"]` dan preconnect font.
- `src/index.css` memuat `accent-color`, `:user-invalid`, `100dvh`, `overscroll-behavior: contain`, `.bv-defer-section`, `text-wrap: balance`, `:focus-visible`, dan `prefers-reduced-motion`.
- `yieldToMain.js` lulus pengujian eksekusi langsung di Node.js.
- Seluruh proteksi keamanan v5.2 (`vercel.json` 6 security headers, 0 `dangerouslySetInnerHTML`, 5 MB upload cap, isolasi role boundaries) tetap terjaga penuh.
