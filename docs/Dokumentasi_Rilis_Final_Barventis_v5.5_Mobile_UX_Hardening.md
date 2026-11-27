# Dokumentasi Rilis Final Barventis v5.5 (Mobile UI/UX Polish, Overlay Queue & Closing Flow)

**Tanggal Rilis:** 26 November 2026  
**Tim Pelaksana:** Nia (UI/UX Lead Mobile-First), Ayling (Advisor & Overlay/Role Architecture), Izumi (Konsistensi Bahasa & Dokumentasi), Kei (Full QA/QC & McCabe CC)  
**Target Repositori:** `github.com/lieziragroup-tech/Barventis` (`barventis-v2.vercel.app`)

## 1. Ringkasan Perbaikan Berdasarkan Uji Lapangan Mobile

| Masalah di Layar HP | Solusi yang Diterapkan di v5.5 | Berkas Terkait |
| :--- | :--- | :--- |
| **Image 1 — Rekap Urgent Menimpa Tur Panduan** | Menerapkan **Mutual-Exclusion Overlay Queue**: auto-open `UrgentRecapModal` kini menunggu `barventis_spotlight_done_<userId> === 'true'` dan `spotlightMode === 'idle'`. Mengklik tombol **Panduan** langsung menutup `UrgentRecapModal`, dan `<UrgentRecapModal>` dikunci `isOpen={showUrgentModal && spotlightMode === 'idle'}` sehingga keduanya mustahil bertumpuk. | `src/components/AppLayout.jsx` |
| **Image 2 — Header Mobile Sempit & Duplikat Tombol** | Menghapus tombol **Panduan** ganda di baris 2 header mobile, menyeragamkan judul header dari `Daily Inventory` menjadi **`Stok Harian`** (seirama dengan *Bottom Nav* dan tidak terpotong), serta menyembunyikan tombol duplikat `Simpan Draf` / `Bukti Closing` / `Kunci EOD` di kartu atas pada layar mobile (`hidden lg:flex`). | `src/components/AppLayout.jsx`, `src/pages/shared/DailyInventory.jsx` |
| **Image 3 & 4 — Floating Save Bar Bertumpuk dengan Tabel & Pagination** | Mengganti kartu melayang 2 baris (`sticky bottom-[72px]`) menjadi **Slim Docked Action Bar 1 baris** (`fixed bottom-[60px] inset-x-0 z-30`) tepat di atas *Mobile Bottom Nav* (`z-40`) lengkap dengan pintasan 1 alur: `[Kamera Bukti]` + `[Draf]` + `[Kunci EOD]`. Menambahkan spacer bawah `h-24 lg:h-4` agar tombol Pagination `< Sebelumnya \| 1 \| Selanjutnya >` 100% bebas tidak tertutup, serta menurunkan `z-index` header tabel (`25 -> 15`) agar tidak pernah menabrak bar aksi. | `src/pages/shared/DailyInventory.jsx` |
| **Gap Wrapping Pill & Privasi Harga `Rp` Barista** | Memadatkan label pil filter menjadi `Selisih POS` & `Hasil Prep` (`whitespace-nowrap`) agar tidak patah 2 baris di layar 375px, serta menyembunyikan baris harga `Rp` di bawah nama bahan pada `DailyInventory.jsx` dan `SimplePrep.jsx` khusus untuk role **`Barista`** (`Head Bar` & `Owner` tetap transparan). | `src/pages/shared/DailyInventory.jsx`, `src/pages/shared/SimplePrep.jsx` |

## 2. Hasil Pengujian QA/QC & Skor Kelayakan Rilis v5.5 (Kei)

| Dimensi Uji | Status | Keterangan |
| :--- | :--- | :--- |
| Overlay Mutual Exclusion & TDZ Safety (`AppLayout.jsx`) | **PASS** | `UrgentRecapModal` dikunci menunggu `spotlight_done === 'true'` & `spotlightMode === 'idle'`; urutan deklarasi TDZ tetap utuh. |
| Mobile Header & Slim Docked Bar (`DailyInventory.jsx`) | **PASS** | 0 tombol Panduan ganda, judul `Stok Harian`, Slim Docked Bar `bottom-[60px]`, spacer Pagination `h-24`, `z-index` bersih. |
| Privasi Harga `Rp` Khusus Barista | **PASS** | `canViewFinancialMetrics()` aktif di `DailyInventory.jsx` & `SimplePrep.jsx` (Owner/Purchasing/Head Bar = tampil, Barista/Central = tersembunyi). |
| Keamanan & Konsistensi v5.2–v5.4 | **PASS** | 6/6 HTTP Security Headers (`vercel.json`), 0 `dangerouslySetInnerHTML`, 0 `window.confirm()`, 12/12 White-Box Node.js Tests PASS. |
| **Skor Kelayakan Go-Live v5.5** | **9.8 / 10.0** | **LULUS GO-LIVE GATE (>= 9.0)** |

## 3. Artefak Rilis

1. `Barventis-main-v5.5-deployment-ready.zip` — Paket kode sumber final Barventis v5.5 siap push ke GitHub dan deploy ke Vercel.
2. `Dokumentasi_Rilis_Final_Barventis_v5.5_Mobile_UX_Hardening.md` — Laporan lengkap perbaikan mobile UI/UX dan verifikasi QA/QC v5.5.
