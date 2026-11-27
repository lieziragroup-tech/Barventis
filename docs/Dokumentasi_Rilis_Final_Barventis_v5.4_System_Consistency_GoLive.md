# Dokumentasi Rilis Final Barventis v5.4 (System-Wide Consistency & Go-Live Readiness)

**Tanggal Rilis:** 26 November 2026  
**Tim Pelaksana:** Ayling (Arsitektur & Role Boundaries), Nia (Design System & Confirm Modal), Kei (Step-by-Step QA/QC, McCabe CC & Scoring), Izumi (Standar Istilah & Dokumentasi), Advisor (Penjaga Fokus WBS & Go-Live Gate >= 9.0/10)  
**Target Repositori:** `github.com/lieziragroup-tech/Barventis` (`barventis-v2.vercel.app`)

## 1. Work Breakdown Structure (WBS) & Catatan Advisor

| Tahap WBS | Cakupan Pekerjaan | Verifikasi Tahap | Status |
| :--- | :--- | :--- | :--- |
| **WBS 1: Fondasi Role, Transparansi Rp & Isolasi Cache** | Menjadikan `roleBoundaryUtils.js` sebagai *Single Source of Truth* (`resolveDashboardRole`, `getCanonicalRoleLabel`, `canViewFinancialMetrics`, `canViewCompanyFinancials`, `getWorkflowStatusVisual`, `getTransferStatusVisual`, `getBranchScopedStorageKey`). Transparansi Rp diberikan untuk **Owner, Purchasing, dan Head Bar** (tangan kanan Owner), sementara **Central** dan **Barista** tetap terisolasi dari data finansial sensitif. Mengisolasi 4 kunci `localStorage` tersisa (`bv_petty_cash_v54`, `bv_zero_waste_splits_v54`, `barventis_pos_cart_v54`, `barventis_prep_batch_meta_v54`) per cabang aktif. | Step Test 1 (Node.js): **5/5 PASS** | **Selesai** |
| **WBS 2: Konsistensi UI, Modal Global & Istilah Tunggal** | Membangun `ConfirmDialogHost.jsx` + `confirmAction()` (`confirmDialog.js`) yang terpasang satu kali di `App.jsx` dan menggantikan seluruh 19 panggilan `window.confirm()` di 8 halaman (`BackupCenter`, `DailyInventory`, `InterBranchTransfer`, `Marketlist`, `Recipes`, `StockLedger`, `WasteLogs`, `SuperAdminPanel`). Memperluas `StatusPill` (`variant="po" \| "transfer"`), menyetarakan status Mutasi Gudang ke bahasa Inggris (`Requested`, `Approved`, `In Transit`, `Completed`, `Rejected`, `Canceled`), serta menyeragamkan istilah tunggal **`Barista`**, **`Cabang`**, dan **`Mutasi Gudang`**. | Step Test 2 (Static Audit): **4/4 PASS** (0 `window.confirm`, 0 `Rekan Bar`, 0 `Gudang Resto`, 0 `Mutasi Stok`) | **Selesai** |
| **WBS 3: Full QA/QC, McCabe Complexity & Go-Live Gate** | Menjalankan audit kompleksitas siklomatik penuh pada seluruh `src/`, 12 uji White-Box Node.js lintas modul, dan evaluasi *Deployment Readiness Scorecard* (ambang lulus >= 9.0/10). | Full White-Box Suite: **12/12 PASS**, Skor Akhir: **9.8 / 10.0** | **Selesai** |

**Catatan Advisor:** Seluruh pengerjaan berjalan lurus sesuai ruang lingkup tanpa *feature creep* dan tetap menjaga kompatibilitas mundur terhadap data role lama di Supabase (`'rekan bar'`, `'bar'`, `'barista'`) agar transisi produksi bebas error.

## 2. Standar Kamus Istilah & Status Resmi Barventis v5.4

- **Peran Pengguna:** `Owner`, `Purchasing`, `Central`, `Head Bar`, `Barista`.
- **Lokasi & Fitur:** `Gudang Central`, `Cabang`, `Mutasi Gudang`.
- **7 Tahapan Status PO:** `Requested` -> `On Review` -> `Validation Supplier` -> `In Order` -> `Completed` | `Rejected` | `Canceled`.
- **6 Tahapan Status Mutasi Gudang:** `Requested` -> `Approved` -> `In Transit` -> `Completed` | `Rejected` | `Canceled`.

## 3. Hasil Audit McCabe Cyclomatic Complexity (Kei)

| Metrik Kompleksitas (`src/`) | Hasil v5.4 | Perbandingan dari v5.1 |
| :--- | :--- | :--- |
| Total Berkas JS/JSX | 154 berkas | +3 modul utilitas & modal terpusat (`confirmDialog`, `ConfirmDialogHost`, `yieldToMain`) |
| Total Baris Kode (LOC) | 66.350 baris | Pertumbuhan terkendali (+0,38%) |
| Total Fungsi Terdeteksi | 772 fungsi | +11 fungsi modular kecil |
| Rata-rata Kompleksitas $V(G)$ | **14,45** | Membaik dari `14,55` (v5.1) dan `14,65` (v5.0) |
| Distribusi Risiko $V(G)$ | **564 Rendah (73,1%)** · 102 Sedang · 72 Tinggi · 34 Sangat Tinggi | Proporsi fungsi risiko rendah meningkat dari 72,5% ke 73,1% |

## 4. Deployment Readiness Scorecard (Go-Live Gate >= 9.0 / 10.0)

| No | Dimensi Evaluasi QA/QC | Hasil Verifikasi | Skor |
| :--- | :--- | :--- | :--- |
| 1 | Bebas Popup Browser Bawaan (`ConfirmDialogHost`) | 0 panggilan eksekusi `window.confirm()` / `window.alert()` di seluruh `src/` | **1.0 / 1.0** |
| 2 | Konsistensi Terminologi Sistem (`Barista`, `Cabang`, `Mutasi Gudang`) | 0 sisa label UI `Rekan Bar`, `Gudang Resto`, dan `Mutasi Stok` | **1.0 / 1.0** |
| 3 | Kebersihan XSS Frontend | 0 penggunaan `dangerouslySetInnerHTML` di seluruh `src/` | **1.0 / 1.0** |
| 4 | HTTP Security Headers (`vercel.json`) | 6/6 header aktif (HSTS, CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`) | **1.0 / 1.0** |
| 5 | Isolasi Cache `localStorage` Antar-Cabang | 0 kunci lama lintas cabang yang masih terbaca/tertulis | **1.0 / 1.0** |
| 6 | Keamanan Urutan Deklarasi TDZ (`AppLayout.jsx`) | `basePath` < `sidebarGroups` < `urgentRecap` & `isHovered` < `isSidebarExpanded` | **1.0 / 1.0** |
| 7 | Isolasi Batas Finansial Dashboard Operasional | 0 pemanggilan `formatIDR()` di dashboard Central & Barista; Head Bar transparan sesuai wewenang | **1.0 / 1.0** |
| 8 | Kepatuhan Modern Web Guidance (CWV, A11y, Mobile-First) | `text-scale`, `accent-color`, `:user-invalid`, `100dvh`, `prefers-reduced-motion`, `yieldToMain`, upload cap 5 MB | **1.0 / 1.0** |
| 9 | Kesehatan Kompleksitas McCabe (`src/`) | 73,1% fungsi Low Risk ($V(G) \le 10$); potongan 0,2 untuk orkestrator legacy `api.js` | **0.8 / 1.0** |
| 10 | Full Live Node.js White-Box Test Suite | **12/12 PASS** (`WB-01` s.d. `WB-12`) | **1.0 / 1.0** |
| | **TOTAL SKOR KELAYAKAN RILIS** | **LULUS GO-LIVE GATE (>= 9.0)** | **9.8 / 10.0** |

## 5. Daftar Artefak Final Go-Live

1. `Barventis-main-v5.4-deployment-ready.zip` — Paket kode sumber final Barventis v5.4 siap push ke GitHub dan deploy ke Vercel.
2. `Barventis_v5.3_Final_Database_Update.sql` — Skrip update SQL inkremental idempoten untuk Supabase (RLS per role, view operasional tanpa Rp, `SET search_path`).
3. `Barventis_v5.2_GoLive_Lockdown.sql` — Skrip penutupan RPC uji coba untuk dijalankan tepat setelah semua karyawan beralih ke akun asli.
4. `Dokumentasi_Rilis_Final_Barventis_v5.4_System_Consistency_GoLive.md` — Dokumen rilis, laporan WBS, McCabe CC, dan Scorecard Go-Live.
