# Barventis Business Goals & System Blueprint
**Sumber:** Audit Forensik 13 Sheet Operasional Umatis Resto (Agustus 2026)

## 1. Prioritas Utama (Fase 1: Role BAR First)
Hentikan pengembangan fitur kitchen/accounting kompleks. Fokus digitalisasi tertutup Segitiga Logistik Lantai Bar:
- **Daily Inventory Terpadu:** Gabungkan inventaris harian bahan racik dan bir (hilangkan input ganda). Wajib ada fitur **Simpan Draf (Incremental)** sebelum *Lock EOD*.
- **Bukti Fisik Limbah (Waste):** Sistem harus mewajibkan unggah foto terkompresi (WebP) berstempel waktu untuk item WASTE guna mencegah *moral hazard*.
- **Validasi Input:** Cegah salah ketik desimal (BROKEN) yang merusak HPP.

## 2. Segitiga Operasional & Logistik
Sistem harus mengakomodasi dua lokasi fisik yang saling berhubungan:
1. **Central Warehouse:** Gudang penyangga (*buffer*) untuk pembelian grosir/kartonan.
2. **Resto (Bar):** Titik layanan untuk bahan segar harian dan stok kerja.
- *Mutasi:* Wajib ada pencatatan transfer/requisition dari Central ke Resto.
- *Pembelian:* Faktur harus memisahkan tujuan pengiriman (Resto vs Central).

## 3. Integrasi & Otomasi (Target Pengurangan Kesalahan)
- **Parser Kasir (POS ESB):** Modul otomatis untuk menyerap file POS harian, mencocokkan varian menu (Hot/Ice) ke Master BOM (Bill of Materials), dan memotong stok resep otomatis.
- **Master Data (Marketlist):** *Single source of truth* untuk harga beli dasar dan konversi satuan (Pack ke Base Unit).
- **Rekonsiliasi HPP (Cost Control):** Otomasi rumus `COGS = Awal + Beli - Akhir` dan target *Beverage Cost <= 27%*, mengeliminasi risiko rumus Excel rusak (seperti kasus Rp 4,3 juta yang hilang).

## 4. Metrik Keberhasilan
- Beban waktu closing shift Barista turun drastis.
- *Unrecorded shrinkage* dan *phantom waste* mendekati 0%.
- Laporan laba kotor minuman selalu akurat (tanpa *broken link*).

## Dokumen Terkait
- [[business_process_discovery_barventis_13_sheets|Sumber: BPD 13 Sheets]]
- [[gap_analysis|Gap Analysis]]
- [[current_state_audit|Audit V2 Current State]]
- [[flows|Arsitektur TO-BE]]
- [[master_roadmap|Roadmap Implementasi]]
