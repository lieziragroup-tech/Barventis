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


## Daily Inventory & Cost Control v3 implementation package

File: `supabase/migrations/20261020000000_daily_inventory_cost_control_v3.sql`

The v3 working copy consolidates daily inventory under `daily_inventories` + `daily_inventory_items`, uses `transactions` as the stock-movement source of truth, makes EOD close/reopen and purchase/transfer/waste/production posting transactional and idempotent, and separates staff-confirmed actual OUT from theoretical COGS derived from ESB sales and recipes. The semi-finished-material production workflow is available as the `Proses Produksi` tab inside Daily Inventory Hub.

**Deployment status:** the migration has not been applied to a live database, and no live Supabase connection was provided. Back up the database and apply/test the migration in staging first. See `IMPLEMENTATION_NOTES_Daily_Inventory_Cost_Control_v3.md` for rollout order, known constraints, reconciliation items, and acceptance checklist. A frontend syntax check passed, but the full npm build/tests could not be run because dependency installation timed out in this environment.
