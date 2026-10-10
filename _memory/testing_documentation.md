# Dokumentasi Testing Barventis V2 Core (Phase 1-4)

## 1. White Box Testing (Struktural & Logika)
*Dilakukan melalui penelusuran kode dan skema database secara langsung.*

**Fokus Audit:** Integritas Relasi (Foreign Keys), RPC Atomik, dan Parser ESB.
**Hasil Temuan & Tindakan:**
- **[DEFECT]** Relasi `material_id` pada tabel `stock_adjustments` dan `daily_inventory_items` hilang di skema awal. Hal ini menyebabkan error `400 Bad Request` saat PostgREST (Supabase API) melakukan *join* ke tabel `materials(name,unit)`.
- **[FIX]** Telah dibuatkan skrip `db/fix_all_missing_fks.sql` untuk menyuntikkan `FOREIGN KEY` secara paksa agar relasi API kembali terhubung.
- **[AUDIT RPC]** Fungsi `atomic_record_waste` awalnya tidak menerima argumen URL foto. Telah dimodifikasi agar menerima `p_photo_url` dan menyimpannya secara atomik bersama transaksi pemotongan stok (Phase 3).
- **[AUDIT ESB]** Logika *double-counting* akibat `PACKAGE HEAD` dan `PACKAGE CONTENT` berhasil dimitigasi dengan pengkondisian `itemType` di dalam `PosUpload.jsx`.

## 2. Black Box Testing (Fungsional)
*Dilakukan melalui pengujian User Interface tanpa melihat struktur kode.*

**Skenario Uji:**
1. **[EOD Batching]** Memasukkan data inventaris ratusan item dalam satu layar.
   - *Expected:* Bisa disimpan sebagai *Draft* sebelum finalisasi EOD.
   - *Result:* Sukses. Transisi dari Maker-Checker per-item menjadi sistem Grid EOD terverifikasi di komponen `DailyInventoryEOD.jsx`.
2. **[Upload Bukti Limbah]** Melaporkan `WASTE` dan memicu kewajiban unggah foto.
   - *Expected:* Kamera/File terbuka, gambar terkompresi (WebP), dan url tersimpan ke server.
   - *Result:* Sukses. UI memblokir *submit* jika `photo_evidence` kosong. Setelah foto diunggah ke *Bucket* `waste-evidences`, link mengalir sempurna ke DB.
3. **[Unggah Laporan POS Kasir]** Mengunggah Excel ekspor ESB.
   - *Expected:* Sistem memisahkan omset dan pemotongan stok otomatis dari menu combo.
   - *Result:* Sukses. Stok terpotong tanpa merusak perhitungan *Food Cost*.
