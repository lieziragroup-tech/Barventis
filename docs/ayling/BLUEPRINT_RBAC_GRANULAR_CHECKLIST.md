# Blueprint: RBAC Granular Matrix (Checklist-Based Access) & Arsitektur Multi-Role (Bar, Kitchen, Service, Admin)

**Author**: Ayling & Izumi / Rafi  
**Status**: PLANNING & PROPOSAL (Tanpa Eksekusi Langsung)  
**Tujuan**: Memberikan kontrol wewenang berbasis matriks checklist per role di `TenantAdminPanel.jsx` serta pemisahan ruang kerja Bar, Kitchen, Service, dan Admin Monitoring.

---

## 1. Arsitektur Pemisahan Cabang (Umatis BSD vs Kasuna Menara Astra)

Di database, struktur cabang sudah terpisah 100% menggunakan tabel `public.branches`:
- `code: 'BSD'` $\rightarrow$ **UMATIS RESTO & VENUE (BSD)** (`is_central: true`)
- `code: 'ASTRA'` $\rightarrow$ **Kasuna by Umatis (Menara Astra)** (`is_central: false`)

Setiap transaksi persediaan (`transactions`, `daily_inventories`, `purchase_entries`, `material_batches`) mengikat `tenant_id` dan `location` (`RESTO` / `CENTRAL`). Di masa mendatang, `branch_id` akan mengisolasi inventaris masing-masing gerai, sementara Owner/Admin di Headquarter BSD dapat memonitor konsolidasi keduanya secara *real-time*.

---

## 2. Blueprint RBAC Matriks Checklist (Tenant Admin Panel)

Saat ini role diundang menggunakan dropdown statis (`Staff`, `Admin / Owner`, `Supervisor`, `Bar`, `Kitchen`, `Service`). Rencana pengembangannya adalah membuat **Permission Checklist Matrix UI** di `TenantAdminPanel`:

### Matriks Hak Akses Modul per Peran

| Modul Sistem | BAR (Barista) | KITCHEN (Dapur) | SERVICE (Pelayanan/Kasir) | OWNER / ADMIN | Keterangan Operasional |
|---|:---:|:---:|:---:|:---:|---|
| **Daily EOD Closing** | ✅ (Hanya Minuman) | ✅ (Hanya Makanan) | ❌ | ✅ (All Access + Reopen) | Barista & Chef hanya closing divisi masing-masing |
| **Catatan Limbah (Waste)** | ✅ (Foto Limbah Bar) | ✅ (Foto Limbah Dapur) | ✅ (Lapor Piring/Gelas Pecah) | ✅ (Semua Divisi) | Wajib upload bukti WebP |
| **Olah Bahan (SimplePrep)** | ✅ (Jus & Sirup) | ✅ (Daging & Saus) | ❌ | ✅ | Konversi bahan mentah $\rightarrow$ olahan batch |
| **POS Terminal (Kasir Web)** | ❌ | ❌ | ✅ | ✅ | Terminal kasir transaksi tamu |
| **Upload POS ESB** | ❌ | ❌ | ✅ | ✅ | Upload omset dan integrasi resep |
| **Marketlist & PO Belanja** | 👁️ (View Only) | 👁️ (View Only) | ❌ | ✅ (Create & Approve) | Bar/Kitchen hanya request; Admin belanja |
| **Menu Pricing & COGS BOM** | ❌ | ❌ | ❌ | ✅ | Rahasia margin bisnis & formula resep |
| **Stock Opname Bulanan** | ✅ (Fisik Meja Bar) | ✅ (Fisik Chiller Dapur) | ❌ | ✅ (Konsolidasi HPP) | Sensus fisik akhir bulan |
| **Cost Control & Finansial** | ❌ | ❌ | ❌ | ✅ (Full Monitoring) | Dashboard analitik HPP $\le 27\%$ |
| **Pengaturan & Sistem (RBAC)**| ❌ | ❌ | ❌ | ✅ | Kelola cabang, user, dan hak akses |

---

## 3. Rencana UI Checklist di Admin Tenant
Pada tab "Pengguna & Akses" di `TenantAdminPanel.jsx`, akan disediakan:
1. **Role Template Selector**: Pilihan cepat `[BAR]`, `[KITCHEN]`, `[SERVICE]`, `[CUSTOM]`.
2. **Permission Checkboxes**:
   - `[x] Akses Daily Inventory (Minuman)`
   - `[ ] Akses Daily Inventory (Makanan)`
   - `[x] Lapor Limbah (Waste)`
   - `[ ] Akses Menu Pricing & Resep COGS`
   - `[ ] Akses Laporan Finansial Cost Control`
3. **Simpan ke Database**: Disimpan dalam kolom `permissions jsonb` di tabel `public.users` atau relasi `role_permissions`.
