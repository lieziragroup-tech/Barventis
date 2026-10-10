# Barventis ERP (V2 Core) 🚀

Platform ERP & Cost Control khusus F&B (Restoran, Cafe, Bar). Dirancang ulang berdasarkan audit proses bisnis riil (Sistem *Draft/Batch* EOD, bukan Maker-Checker birokratis).

## ⚡ Arsitektur Inti (TO-BE Blueprint)
- **Role BAR First:** Form EOD Harian dengan fitur *Draft* & *Lock*.
- **Pipa Bukti Limbah (Waste):** Integrasi *Photo Evidence* otomatis terkompresi (WebP) untuk transparansi.
- **Multi-Lokasi Logistik:** Manajemen stok terpisah untuk *Central Warehouse* (Buffer) dan *Resto Bar* (Bahan segar/kerja).
- **POS & BOM Engine:** Impor laporan POS ESB otomatis. Omset ditarik dari *Package Head*, pemotongan bahan ditarik dari *Package Content* sesuai resep (BOM).

## 🛠️ Tech Stack
- Frontend: React 19 + Vite + TailwindCSS
- Backend: Supabase (PostgreSQL + Auth + Storage)
- State & Memory: Obsidian Vault terintegrasi di folder root (`_memory/`)

## 📝 Dokumentasi Agen
Semua keputusan arsitektur, rekam jejak, dan *Business Goals* tersimpan dalam format Markdown di folder `_memory/`. Buka *root* repositori ini menggunakan aplikasi **Obsidian** untuk melihat *graph view* dan *roadmap* interaktif.
