# Gap Analysis: Current System vs Business Goals

| Fitur | Status Barventis Saat Ini (V2 Core) | Kebutuhan Bisnis Aktual (SO Barista) | Keputusan (Action Plan) |
| :--- | :--- | :--- | :--- |
| **Arsitektur Lokasi** | 1 Gudang tunggal (Items). | 2 Lokasi fisik (Central Warehouse & Resto Bar). | **UBAH:** Tambah entitas Lokasi. Pisahkan stok Central & Resto. Buat modul Transfer/Mutasi internal. |
| **Pencatatan Transaksi** | Per-item IN/OUT dengan Maker-Checker (Canvas Signature). | *Batch* harian (Ratusan item sekaligus saat Closing EOD). | **ROMBAK:** Ganti form per-item dengan *Grid* Daily Inventory. Tambah fitur *Simpan Draf* & *Lock EOD*. |
| **Validasi & Approval** | Pengawas *approve* tiap baris log masuk/keluar pakai TTD. | Bukti validasi adalah **Foto Fisik WebP** (terutama untuk `WASTE` dan `IN` Vendor). | **PANGKAS:** Hapus TTD digital per-baris. Ganti dengan kewajiban *Upload Foto* berstempel waktu. |
| **Pemotongan Stok Keluar (OUT)** | Manual input "OUT" di aplikasi. | Otomatis lewat *Parser* data POS ESB (berdasarkan Resep/BOM). | **UBAH:** Hapus manual OUT untuk penjualan. Bangun modul impor POS & *Recipe Engine* (BOM). |
| **Kategori Item** | *Flat list* (Nama, Kode, Stok). | 9 Kategori, pemisahan Bahan & Bir secara logis, satuan Pack vs Base. | **TAMBAH:** Relasi Unit Konversi (Karton -> Pcs, Pack -> Gram) di Master Data. |

## Kesimpulan
Sistem saat ini terlalu generik dan berfokus pada birokrasi *approval* (Maker-Checker per log) yang memperlambat operasional. Bisnis riil butuh kecepatan (Drafting, Batch EOD) dan bukti empiris (Foto fisik limbah), bukan TTD digital.

## Dokumen Terkait
- [[current_state_audit|Audit V2 Current State]]
- [[business_goals|Business Goals]]
- [[business_process_discovery_barventis_13_sheets|BPD 13 Sheets]]
- [[flows|Arsitektur TO-BE]]
- [[master_roadmap|Roadmap Implementasi]]
