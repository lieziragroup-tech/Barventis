# Dokumentasi Final Rilis & Laporan QA/QC Cyclomatic Complexity Barventis v4.6

**Proyek:** Barventis (Resto Umatis — BSD, Kasuna & Central)  
**Tanggal Rilis:** 24 November 2026  
**Tim Kolaborasi:**
- **Ayling (System Architect & Executor):** Implementasi isolasi cabang, kontrol watermark PDF Head Bar, auto-rekap Berita Acara, live Urgent Recap H-2, dan pencatatan riwayat dinamika harga.
- **Kei (QA/QC & White-Box Cyclomatic Complexity Advisor):** Audit McCabe $V(G)$, TDZ guard verification, dan eksekusi White-Box Basis-Path Test Suite.
- **Izumi (Technical Documentation & Traceability):** Penyusunan dokumentasi rilis final dan matriks keterlacakan fitur terhadap kesepakatan rapat.

## 1. Ringkasan Penyempurnaan Final (v4.6)

1. **Pencatatan Otomatis Dinamika Harga (`material_price_history` di `api.js`):**
   - Setiap kali harga bon fisik diubah saat **Terima Barang (Goods Receipt)** (misalnya kenaikan mendadak harga pasar seperti Jeruk Pontianak Rp 20.000 ke Rp 35.000/kg), sistem otomatis menyimpan jejak `old_price` dan `new_price` ke tabel `material_price_history`, memperbarui `new_price` secara **Forward-Only**, dan menjaga seluruh laporan historis tetap terkunci memakai `unit_cost_snapshot`.
2. **Isolasi Cabang pada Cost Control & Buffet/Event (`CostControl.jsx` & `CostControlDualComparison.jsx`):**
   - Penyesuaian Buffet, Event, dan Compliment (Rp 0) kini dikirim bersama `branchId={activeBranch?.id}` ke `cost_control_adjustments` sehingga data Head Bar BSD dan Head Bar Kasuna terpisah penuh per cabang.
3. **Live Queue di Modal Rekap Urgent (`AppLayout.jsx` + `UrgentRecapModal.jsx`):**
   - Tab **Urgent Action** kini menarik langsung data real-time dari Supabase untuk PO Central berstatus `PENDING_HEADBAR` (menunggu ACC Head Bar) dan Mutasi Gudang berstatus `DISPATCHED` (menunggu konfirmasi terima), digabung dengan pengingat PO mendekati jadwal kirim **H-2**, sementara tab **Urgent Materials** menampilkan stok habis dan menipis.
4. **Kontrol Watermark PDF oleh Head Bar & Auto-Rekap Berita Acara (`BeritaAcaraMonthly.jsx` + `PdfBrandingSettingsCard.jsx`):**
   - Head Bar dapat mengatur foto/watermark validasi PDF Umatis langsung dari halaman Berita Acara tanpa merepotkan Owner, dan dokumen Berita Acara otomatis menarik rekap bulanan dari `waste_logs`, `daily_inventory_items`, serta `asset_opname_items` agar Head Bar cukup mengedit bagian yang perlu disesuaikan.
5. **Isolasi Rute Mutasi Cabang & Sidebar Lock di Bawah Profile (`InterBranchTransfer.jsx` + `AppLayout.jsx`):**
   - Rute mutasi akun cabang terkunci hanya ke Central dan cabangnya sendiri (BSD hanya melihat BSD, Kasuna hanya melihat Kasuna), tombol **Kunci Sidebar** berada di bawah Profile, dan seluruh tab duplikat sudah dibersihkan.

## 2. Laporan QA/QC McCabe Cyclomatic Complexity (Kei)

Hasil pemindaian seluruh kode produksi `src/`: **131 file**, **61.708 LOC**, **1.835 fungsi**, rata-rata **4,87 CC/fungsi**, dengan **88,3% (1.620 fungsi)** berada pada zona **Low Risk (1–10)**.

| Modul Inti v4.6 | LOC | File CC | Avg CC/Fungsi | Max Func CC | Kategori Risiko |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `src/config/sidebarMenuConfig.js` | 196 | 9 | 2,33 | 3 | **Low Risk** |
| `src/components/RoleSpotlightGuide.jsx` | 484 | 50 | 3,33 | 9 | **Low Risk** |
| `src/components/shared/PdfBrandingSettingsCard.jsx` | 207 | 24 | 3,56 | 9 | **Low Risk** |
| `src/config/roleSpotlightSteps.js` | 506 | 22 | 4,50 | 12 | **Low–Moderate** |
| `src/services/modules/urgentRecapUtils.js` | 123 | 29 | 5,00 | 23 | **Low–Moderate** |
| `src/components/UrgentRecapModal.jsx` | 221 | 23 | 12,00 | 19 | **Moderate** |
| `src/pages/shared/CostControl.jsx` | 699 | 122 | 7,05 | 40 | **Moderate–High** |
| `src/pages/shared/BeritaAcaraMonthly.jsx` | 1.139 | 163 | 7,23 | 36 | **Moderate–High** |
| `src/pages/shared/SoGlassAndTool.jsx` | 934 | 172 | 8,43 | 36 | **Moderate–High** |
| `src/components/AppLayout.jsx` | 1.686 | 252 | 10,30 | 85 | **TDZ Guard Verified OK** |

## 3. Hasil Pengujian QA/QC White-Box Basis-Path (Kei)

Dieksekusi langsung di runtime Node.js v18.20.4 terhadap modul produksi nyata:

| Kode Uji | Skenario Basis Path | Status |
| :---: | :--- | :---: |
| QC-01 | Ambang batas pengingat PO urgent tepat `2` hari (`H-2`) | **PASS** |
| QC-02 | Jadwal kirim `H-3` tidak masuk urgent (`NORMAL`), `H-2` masuk `SOON` (`H-2 Kirim`) | **PASS** |
| QC-03 | Urutan prioritas `Urgent Action` menempatkan `OVERDUE` lalu `TODAY` lalu `SOON` | **PASS** |
| QC-04 | PO `PENDING_HEADBAR` & Mutasi `DISPATCHED` muncul di `Urgent Action` Head Bar | **PASS** |
| QC-05 | Isolasi role: Rekan Bar tidak menerima item `ACC Head Bar` | **PASS** |
| QC-06 | `Urgent Materials` mengurutkan bahan `Habis` di atas bahan `Menipis` | **PASS** |
| QC-07 | Seluruh 8 role pada `roleSpotlightSteps.js` memiliki topik & langkah valid | **PASS** |
| TDZ-01 | Urutan inisialisasi `AppLayout.jsx` (`basePath:264 < sidebarGroups:268 < urgentRecap:332`) | **PASS** |

**Keputusan QA/QC (Kei):** `PASSED = 7/7 Basis-Path + TDZ Check OK` — **Layak Deploy ke Vercel**.
