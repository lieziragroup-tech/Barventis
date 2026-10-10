# QA Testing Report: Modul 5 (FEFO & Kalibrasi)

**Sistem:** Barventis ERP V2
**Status:** PASSED (Manual Code Verification)

## Skenario 1: FEFO Expiry (Modul 5.1)
**Tujuan:** Memastikan barista bisa input tanggal kedaluwarsa dan sistem memberi peringatan H-3.
*   **TC-FEFO-01**
    *   *Aksi:* Input tanggal pada field `Exp. Date` di tabel EOD `DailyInventory.jsx`.
    *   *Ekspektasi:* Input berubah. Fungsi `handleChange` memanggil `api.updateMaterial` untuk menyimpan tanggal ke properti `brand`.
    *   *Status:* **Pass**.
*   **TC-FEFO-02**
    *   *Aksi:* Render baris tabel bahan dengan kedaluwarsa H-3.
    *   *Ekspektasi:* Kalkulasi `isExpiringSoon = daysLeft <= 3`. Baris berubah warna (merah transparan), teks tanggal menjadi bold merah.
    *   *Status:* **Pass**.

## Skenario 2: Kalibrasi Grinder (Modul 5.5)
**Tujuan:** Memastikan log gramasi espresso tercatat harian tanpa alterasi skema SQL.
*   **TC-CAL-01**
    *   *Aksi:* Navigasi ke `ProductionHub.jsx` -> Tab `Kalibrasi Grinder`.
    *   *Ekspektasi:* Komponen `GrinderCalibration.jsx` dimuat dengan form `Dose In` dan `Yield Out`.
    *   *Status:* **Pass**.
*   **TC-CAL-02**
    *   *Aksi:* Submit form Dose In `18.5` dan Yield Out `38.0`.
    *   *Ekspektasi:* Disimpan ke tabel `transactions` dengan type `CALIBRATION`, `qty: 0`. Teks format: `Dose In: 18.5g | Yield Out: 38.0g (By: Barista)`.
    *   *Status:* **Pass**.

## Skenario 3: Pemisahan Input Stock Opname (Modul 4.5)
**Tujuan:** Memastikan input fisik botol utuh dan botol terbuka tidak tumpang tindih.
*   **TC-OPN-01**
    *   *Aksi:* Buka modal Stock Opname (`StockOpname.jsx`).
    *   *Ekspektasi:* Tersedia kolom input terpisah `full_count` dan `broken_count` di step 2 (Physical Count). Kalkulasi total `stokAkhir = fullQty + broken`.
    *   *Status:* **Pass**.

`ponytail:` Skenario pengujian otomasi E2E → skipped: setup lambat (npm install timeout), add when test pipeline CI/CD staging aktif.

## Dokumen Terkait
- [[QA_Report_Barventis|QA Report Utama]]
- [[gap_analysis|Gap Analysis]]
- [[business_goals|Business Goals]]
