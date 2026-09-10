# Barventis Enterprise Changelog (V3)
*Dokumentasi Perubahan & Peningkatan Infrastruktur - QA Phase*

Dokumen ini merangkum seluruh pembaruan sistem yang telah diselesaikan untuk mengeskalasi Barventis dari aplikasi MVP menjadi sistem kelas *Enterprise* yang aman, andal, dan minim cacat (*Zero Mistakes Policy*).

---

## 1. Integrasi Fitur ESB & Smart POS Parser (New Feature)
- **Modul `ESBUpload.jsx`**: Pembuatan halaman cerdas untuk membaca *raw data* dari sistem POS eksternal (ESB).
- **Auto-Deduct (Real-Time COGS)**: Mengganti alur lama ("menunggu Stock Opname") menjadi pemotongan fisik gudang secara absolut di saat file POS diunggah.
- **Deteksi Missing Recipe**: Sistem dapat mendeteksi menu POS yang belum memiliki Master Resep di Barventis, memisahkannya ke dalam tabel *Warning* agar tidak merusak kalkulasi.
- **Rollback & Anti-Duplicate**: Menambahkan mode *Overwrite* yang tidak sekadar menghapus data lama, melainkan secara otomatis **mengembalikan stok bahan baku (Refund/Rollback)** ke gudang sebelum menimpa data penjualan baru.

## 2. Keamanan Tingkat Database (Database Security & RLS)
- **Migrasi `0002_security_and_audit.sql`**: Meluncurkan standarisasi Row Level Security (RLS) di lapisan PostgreSQL untuk mengisolasi data antar tenant (restoran).
- **Audit Log Immutability**: Memasang `Database Trigger` pada tabel `audit_logs` yang secara mutlak **menolak** *query* `UPDATE` maupun `DELETE` dari *client* maupun *Super Admin*, menjamin histori tetap utuh.
- **Server-Side Audit Trails**: Mutasi tabel kritis (`materials`, `recipes`, `invoices`, dll) kini otomatis direkam perubahannya (JSON `old_data` vs `new_data`) oleh database, bukan lagi bergantung pada API React.

## 3. Peningkatan Observability & CI/CD
- **Sentry Error Tracking (`src/lib/logger.js`)**: Pembuatan modul *Structured Logger* dan integrasi Sentry untuk menangkap *exception* di produksi secara *real-time*.
- **Pipeline GitHub Actions (`.github/workflows/ci.yml`)**: Mengotomatisasi proses pengujian (*Linting*, *Build Check*) untuk mencegah developer me-merge kode yang rusak (*broken code*).
- **Dependabot (`.github/dependabot.yml`)**: Pemindaian kerentanan dependensi NPM secara otomatis setiap minggu.

## 4. Perbaikan UX & Pelaporan (Reporting)
- **Daily Inventory Export**: Menambahkan fungsi Export Excel pada modul Barang Rusak (*Waste*), memanfaatkan komponen modular `ExportButton.jsx` dan `exportWithAudit`.
- **Excel Serial Date Fix**: Menambahkan *interceptor* di *Parser* POS untuk menerjemahkan format tanggal bawaan Excel (Windows 1900 Date System, misal `45000`) ke format standar kalender ISO, mencegah *error insertion* ke PostgreSQL.

## 5. Cleaning Code (Penghapusan Dead Code)
- Menghapus skrip migrasi/sementara yang mengotori *workspace*.
- Menghapus komponen `src/components/AuditLogs.jsx` (duplikat dari komponen Pages).
- Menghapus integrasi lawas `src/services/nestApi.js` yang tidak terpakai dan mengumpulkan beban memori.
- Membersihkan panggilan `flush-logs` (*beacon*) yang rusak pada `activityLogService.js` yang membebani jaringan *client*.

---
*Status: IMPLEMENTED & VERIFIED.*
*Semua fitur telah diuji untuk memastikan stabilitas dan kompatibilitas dengan flow sistem sebelumnya (Backward Compatible).*