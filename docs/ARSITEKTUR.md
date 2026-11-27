# Arsitektur FieldWork (kondisi terkini)

## 1. Dua jalur data, satu identitas

```
Browser ── Supabase Auth ──► sesi (access token)
   │
   ├─(A) Supabase langsung (anon key + RLS) ── users, companies, quotations, spk, inventory_*, company_settings,
   │        nomor_surat_logs, order_tracking, performa_targets, customer_checklists, invites
   │        └ Mutasi sensitif lewat RPC: process_inventory_mutation, process_status_approval, quotation_patch,
   │          generate_nomor_surat, company_settings_patch, accept_invite, get_invite_public
   │
   └─(B) API Express (Bearer = access token Supabase) ── projects, work_reports, foto, lokasi, admin, cron
            requireAuth → verifikasi JWT → muat user dari DB (role, company_id, is_active)
            withTenant  → company_id (SUPERADMIN: header X-Company-Id)
            query SELALU `... and company_id = $n`
```

## 2. Autentikasi
- `requireAuth` memverifikasi token dengan algoritma yang **dibatasi eksplisit** (HS256 ↔ `SUPABASE_JWT_SECRET`; ES256/RS256 ↔ JWKS dari `SUPABASE_URL`). Token tanpa tanda tangan (`alg=none`) atau klaim role palsu ditolak/diabaikan.
- Role, perusahaan, dan status aktif **selalu dari tabel `users`**, bukan dari token → akun dinonaktifkan langsung tertolak.
- Pendaftaran lewat undangan: `get_invite_public` (anon, hanya memvalidasi satu token) → `accept_invite` (membuat profil dengan perusahaan & role dari undangan; atomik, sekali pakai).
- Pembuatan/penghapusan akun oleh admin: `POST/DELETE /api/admin/users` (service-role di server, rollback otomatis).

## 3. Isolasi perusahaan
| Lapisan | Mekanisme |
|---|---|
| Browser → Supabase | RLS (`supabase/migrations/04_rls_policies.sql`) memakai `current_company_id()`, `is_company_admin()`, `has_company_role()` |
| Kolom sensitif | `password_hash` tidak dapat dibaca role `authenticated`/`anon`; update `users` hanya `name`, `phone` milik sendiri |
| Backend | `withTenant` + `company_id` di setiap query; laporan/foto perusahaan lain → 404 |
| Tabel khusus backend | RLS aktif tanpa policy (browser tertutup) |
| Aturan risiko | per perusahaan: `company_settings.settings.riskConfig` di atas nilai bawaan global `risk_config` |

## 4. Template dokumen per perusahaan
`company_settings.settings.documents` (kop, footer, isi surat, skema pembayaran/garansi/pengontrolan, program pest/rodent, laporan kunjungan).
- Ditulis **hanya** via RPC `company_settings_patch` (ADMIN perusahaan itu / SUPERADMIN); `riskConfig` tidak dapat ditimpa lewat jalur ini.
- Dibaca & disanitasi (`sanitizeTemplates`) sebelum dipakai: gambar hanya PNG/JPEG/WEBP data-URL ≤ ~450 KB, warna/angka divalidasi, kunci asing dibuang.
- Nilai yang diisi pemanggil (form penawaran) selalu menang atas template.
- Perusahaan baru memakai bawaan **netral** (tanpa identitas perusahaan lain). Preset contoh Guci hanya untuk perusahaan Guci yang belum menyimpan pengaturan.

## 5. Risk engine (anti-fraud lapangan)
Check-in/out dihitung **server**: jarak Haversine ke koordinat proyek, durasi, foto minimum, treatment, drift lokasi, keterlambatan (zona waktu `APP_TIMEZONE`). Aksi offline disinkronkan dengan waktu perangkat yang dibatasi (≤ `OFFLINE_MAX_AGE_HOURS`, tidak di masa depan, tidak mendahului aksi sebelumnya) dan ditandai di audit log.

## 6. Migrasi
`00_baseline` (DB baru) → `01_atomic_transactions` → `02_fix_drift_and_rpc` → `03_tenant_hardening` → `04_rls_policies`. Dijalankan `npm run db:migrate`.
