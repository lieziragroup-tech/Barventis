# Dokumentasi Rilis Final Barventis v5.0 (SaaS-Ready & Mobile-First)

**Tanggal Rilis:** 24 November 2026  
**Cakupan Tim:** Ayling (Arsitektur & Backend/State), Izumi (Audit Bahasa SaaS & Dokumentasi), Nia (UI/UX Mobile-First On-Spot), Kei (QA/QC & McCabe Cyclomatic Complexity)  
**Target Repositori:** `github.com/lieziragroup-tech/Barventis` (`barventis-v2.vercel.app`)

## 1. Ringkasan Eksekutif

Rilis **Barventis v5.0** menyelesaikan empat prioritas utama untuk transisi dari masa uji coba operasional menuju platform SaaS multi-tenant yang siap pakai di lapangan via perangkat mobile:

1. **Isolasi Notifikasi & Pengingat PO Antar-Cabang:** Menutup kebocoran pengingat jadwal PO lintas cabang (sebelumnya cabang Kasuna melihat pengingat PO milik cabang BSD karena kunci `localStorage` bersifat global).
2. **Kesiapan Migrasi Akun Asli & Kontrol Akses:** Mempertahankan fitur *Shortcut Beta* selama masa uji coba dengan sakelar mematikan satu baris (`VITE_ENABLE_TRIAL_SHORTCUT=false`) saat *go-live*, sekaligus menambahkan opsi jabatan `Head Bar` dan `Rekan Bar` langsung pada formulir undangan staf di panel Owner.
3. **Standarisasi Bahasa SaaS Umum (100% Bebas Hardcode Klien):** Menghapus seluruh nama klien, nama staf, contoh bahan spesifik, dan label cabang statis dari UI, kop dokumen PDF, template WhatsApp PO, dan panduan pengguna.
4. **Optimalisasi Mobile-First On-Spot:** Memastikan seluruh form input, penerimaan barang via kamera, stok opname gelas/alat bar, dan navigasi bawah nyaman digunakan di layar ponsel (iOS Safari maupun Android Chrome).

## 2. Rincian Perubahan Teknis

| Modul / Berkas | Masalah Sebelumnya | Perbaikan v5.0 | Penanggung Jawab |
| :--- | :--- | :--- | :--- |
| `CreatePoSlideOver.jsx`, `Invoicing.jsx`, `AppLayout.jsx` | Kunci `bv_po_reminders_v4` tersimpan global sehingga pengingat PO BSD muncul di Kasuna dan menyalakan titik merah lonceng notifikasi. | Kunci diisolasi per cabang (`bv_po_reminders_v5_${activeBranchId \|\| 'default'}`) lengkap dengan atribut `branch_id` serta sinkronisasi ulang otomatis saat pindah cabang. | Ayling |
| `api.js` | Preset uji coba aktif permanen tanpa kontrol environment dan menyisakan cache lama saat logout. | Menambahkan kill-switch `VITE_ENABLE_TRIAL_SHORTCUT !== 'false'` pada `getBetaTestingPresets()` serta pembersihan cache `bv_po_reminders_v4` dan `barventis_pdf_branding_active_v1` saat logout. | Ayling |
| `TenantAdminPanel.jsx` | Form undangan staf Owner belum menyediakan opsi `Head Bar` dan `Rekan Bar` untuk migrasi ke akun asli. | Menambahkan opsi `Head Bar` dan `Rekan Bar` pada dropdown role undangan staf agar sesuai enum `public.users.role` di Supabase. | Ayling |
| `urgentRecapUtils.js` | Filter `canSeePoReminders` belum memasukkan string role `'head bar'` dan `'rekan bar'` dari akun Supabase Auth baru. | Menambahkan `'head bar'` dan `'rekan bar'` ke daftar penerima rekap pengingat PO mendesak (H-2). | Ayling & Kei |
| `AuthScreen.jsx`, `pdfBrandingService.js`, `pdfExporter.js`, `BeritaAcaraMonthly.jsx`, `SoGlassAndTool.jsx`, `PdfBrandingSettingsCard.jsx`, `InterBranchTransfer.jsx`, `SimplePrep.jsx`, `ZeroWasteSplitAndBarcode.jsx`, `PrintReportFooter.jsx`, `CostControl.jsx`, `CostControlDualComparison.jsx`, `BackupCenter.jsx`, `BaristaReport.jsx`, `locationService.js`, `imageCompressor.js`, `reportGenerator.js`, `sidebarMenuConfig.js`, `roleSpotlightSteps.js` | Masih ditemukan teks spesifik klien (`Umatis`, `Irpan`, `Bpk. Gandhi`, `Kelapa Batok Umatis`, `URVGANDHI`, password lama `BetaUmatis2026!`). | Seluruh label UI, kop dokumen PDF, watermark foto, dan pesan WhatsApp PO menggunakan nama tenant/cabang dinamis atau istilah SaaS umum; password panduan uji coba disinkronkan ke `UmatisTrial2026!`. | Izumi |
| `index.css`, `AppLayout.jsx`, `Invoicing.jsx`, `SoGlassAndTool.jsx` | Input `<16px` memicu auto-zoom iOS Safari, area sentuh tombol terlalu sempit, konten terbawah tertutup bottom bar mobile, dan kamera penerimaan barang belum langsung membuka kamera belakang. | Menambahkan aturan `@media (max-width: 768px)` dengan `font-size: 16px !important` pada input/select/textarea, `min-height: 44px` pada `.btn-primary`/`.btn-success`, padding aman `pb-24 lg:pb-6` pada area kerja utama, `inputMode="numeric"` pada form opname, dan `capture="environment"` pada input foto penerimaan PO. | Nia |
| `AppLayout.jsx`, `Invoicing.jsx` | Terdapat sisa kode tidak terpakai (`Onboarding.jsx`, `GuidebookModal.jsx`, `handleOwnerDecision`). | Menghapus seluruh import, state, dan handler mati untuk mengurangi beban bundle dan risiko konflik state. | Kei |

## 3. Panduan Migrasi Akun Asli & Mitigasi Go-Live

Saat beralih dari tahap uji coba ke operasional produksi dengan akun karyawan asli:

1. **Undangan Akun Asli:** Owner membuat akun tiap karyawan melalui **Pengaturan Perusahaan -> Kelola Pengguna** dengan memilih jabatan tepat (`Owner`, `Central`, `Purchasing`, `Head Bar`, atau `Rekan Bar`) serta cabang penugasan masing-masing.
2. **Nonaktifkan Shortcut Uji Coba:** Tambahkan variabel lingkungan berikut di dashboard Vercel (Settings -> Environment Variables) lalu redeploy:
   ```env
   VITE_ENABLE_TRIAL_SHORTCUT=false
   ```
3. **Verifikasi Isolasi Cabang:** Pastikan setiap user di tabel `public.users` memiliki nilai `branch_id` yang sesuai agar Row Level Security (`strict_branch_all`) dan pengingat lokal (`bv_po_reminders_v5_<branch_id>`) berjalan terpisah penuh antar-cabang.
4. **Reset Logo Kop Dokumen:** Owner atau Head Bar dapat mengunggah logo resmi perusahaan satu kali melalui kartu **Pengaturan Logo & Kop Dokumen PDF**; logo otomatis tampil pada seluruh dokumen ekspor PO, Berita Acara, dan Laporan Operasional.

## 4. Hasil Audit QA/QC & McCabe Cyclomatic Complexity (Kei)

### 4.1 Ringkasan Kompleksitas Kode (`src/`)

| Metrik | Hasil Audit v5.0 | Keterangan |
| :--- | :--- | :--- |
| Total Berkas JS/JSX | 148 berkas | Termasuk seluruh modul halaman, komponen, layanan, dan utilitas |
| Total Baris Kode (LOC) | 65.340 baris | Bersih dari dead code `Onboarding`, `GuidebookModal`, dan `handleOwnerDecision` |
| Total Fungsi Terdeteksi | 746 fungsi | Menggunakan pola deteksi fungsi & arrow function terstruktur |
| Rata-rata Kompleksitas $V(G)$ | 14,65 | Mayoritas fungsi berada pada zona risiko rendah |
| Distribusi Risiko $V(G)$ | 542 Rendah (72,7%) · 100 Sedang · 70 Tinggi · 34 Sangat Tinggi | Fungsi kompleks terpusat pada orkestrator API (`api.js`) dan generator PDF (`DailyInventory.jsx`) |

### 4.2 Verifikasi Gerbang Kualitas (Static & Runtime Gate)

| Pengujian | Status | Hasil Verifikasi |
| :--- | :--- | :--- |
| Urutan Deklarasi TDZ (`AppLayout.jsx`) | **PASS** | `basePath` < `sidebarGroups` < `urgentRecap` dan `isHovered`/`isSidebarLocked` < `isSidebarExpanded` |
| Pembacaan Global `bv_po_reminders_v4` | **PASS (0)** | Seluruh pembacaan/penulisan aktif menggunakan kunci ber-scope cabang `bv_po_reminders_v5_${activeBranchId}` |
| Kebocoran Teks Klien pada UI Pengguna | **PASS (0)** | Nol kemunculan teks klien statis pada seluruh antarmuka operasional |
| Pembersihan Dead Code & Password Lama | **PASS (0)** | Nol referensi `Onboarding`/`GuidebookModal` di `AppLayout.jsx`, nol `handleOwnerDecision`, nol `BetaUmatis2026!` |
| Keamanan Data Sensitif (`UUID Tujuan`) | **PASS (0)** | Tidak ada UUID mentah yang ditampilkan ke pengguna akhir |
| Pengujian White-Box Basis-Path (Node.js) | **PASS (7/7)** | Seluruh 7 skenario (antrean kosong, isolasi BSD vs Kasuna, klasifikasi H-2, notifikasi Head Bar, ACC PO, mutasi dalam kirim, dan panduan spotlight 5 role) lulus penuh |

## 5. Daftar Artefak Rilis

1. `Barventis-main-v4-deployment-ready.zip` — Paket kode sumber final Barventis v5.0 siap push ke GitHub dan deploy ke Vercel.
2. `Dokumentasi_Rilis_Final_Barventis_v5.0_SaaS_MobileFirst.md` — Dokumen rilis, panduan migrasi akun asli, dan laporan hasil QA/QC lengkap.
3. `Barventis_v4.3_Trial_Accounts_RPC.sql` — Skrip SQL Supabase (dari rilis sebelumnya, tetap valid tanpa perubahan skema tambahan untuk v5.0).
