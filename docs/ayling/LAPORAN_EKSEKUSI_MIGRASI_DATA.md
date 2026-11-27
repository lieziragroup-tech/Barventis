# Laporan Status Eksekusi Seeding & Migrasi Data Riil

**Tanggal**: 2026-10-23  
**Sumber**: `Data Source/SO BARISTA AGUSTUS 2026 (1).xlsx` & `Data Source/SO BARISTA AGUSTUS KASUNA.xlsx`  
**Status Eksekusi Script**: SEED SQL GENERATED & VALIDATED (Ready for Supabase Run)  

---

## 1. Artefak SQL yang Berhasil Di-Generate di Folder `db/`

1. **`db/seed_two_branches.sql`** (WBS 1.1):
   - Mendaftarkan 2 cabang resmi:
     - Cabang Utama: **UMATIS RESTO & VENUE (BSD)**
     - Cabang Satelit: **Kasuna by Umatis (Menara Astra)**
2. **`db/seed_phase1_materials.sql`** (WBS 1.2 & 1.3):
   - **128 Master Bahan Baku** diekstrak dari Sheet `MARKETLIST `.
   - **48 Master Supplier** unik didaftarkan ke `public.suppliers`.
   - Mengisi spesifikasi kemasan, pack size, dan satuan dasar (`ml`, `gr`, `pcs`).
3. **`db/seed_phase2_recipes.sql`** (WBS 2.0):
   - **54 Resep Minuman Komersial** & Bill of Materials lengkap diekstrak dari Sheet `COGS All Beverage `.
   - Perhitungan otomatis HPP Dasar, Biaya Listrik/Air/Gas (Fix Cost 5%), dan Target Margin Jual.
4. **`db/seed_rtd_beer_recipes.sql`** (WBS 2.2):
   - **9 Item Bir & Minuman RTD** (*Ready to Drink*) lengkap dengan harga pokok modal dan harga kasir.
5. **`db/seed_phase3_opening_and_purchases.sql`** (WBS 3.0 & 4.0):
   - Saldo Awal Fisik Per 1 Agustus 2026:
     - Saldo Awal Resto: **Rp 27.032.848** (Sesuai Sheet `COST CONTROL` sel J8).
     - Saldo Awal Central: **Rp 21.608.886** (Sesuai Sheet `COST CONTROL` sel J9).
     - Total Saldo Awal: **Rp 48.641.734**.
   - **137 Baris Faktur Pembelian Riil** dengan total belanja **Rp 31.246.478** diekstrak dari Sheet `Pembelian Harian` (tanggal serial 1899 sudah dinormalisasi ke Agustus 2026).

---

## 2. Cara Menjalankan ke Database Supabase Live

Seluruh script di atas dirancang dalam blok transaksi PL/pgSQL:
```sql
DO $$ ... END $$;
```
Script tersebut dapat dijalankan secara berurutan di **Supabase SQL Editor**:
1. Jalankan `db/seed_two_branches.sql`
2. Jalankan `db/seed_phase1_materials.sql`
3. Jalankan `db/seed_phase2_recipes.sql` & `db/seed_rtd_beer_recipes.sql`
4. Jalankan `db/seed_phase3_opening_and_purchases.sql`
