# Barventis — Platform Inventory & Cost Control F&B

Barventis adalah platform SaaS multi-tenant untuk inventory management dan cost control khusus industri Food & Beverage Indonesia.

## Stack
- **Frontend**: React 19 + Vite 8
- **Backend**: Supabase (PostgreSQL 16 + Auth + Realtime + RLS)
- **Deployment**: Vercel
- **Payment**: Midtrans *(planned)*

## Arsitektur
- Single codebase, satu folder, deploy ke Vercel
- Multi-tenant via Supabase Row Level Security (RLS)
- Setiap tenant terisolasi otomatis oleh `tenant_id` di setiap tabel
- Tidak ada server/backend terpisah — semua via Supabase client SDK

## Setup Development

```bash
# Clone & install
npm install

# Buat file .env (copy dari .env.example)
cp .env.example .env
# Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY dari Supabase dashboard

# Jalankan dev server
npm run dev
```

## Setup Supabase

1. Buat project baru di supabase.com
2. Buka SQL Editor
3. Jalankan `database/supabase_schema_complete.sql` (schema lengkap: tabel, RLS, RPC, storage, seed — satu file, idempotent)
4. Copy URL dan anon key ke file `.env`

## Deploy ke Vercel

1. Push ke GitHub
2. Buka vercel.com → New Project → import repo
3. Set Environment Variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy

## Fitur Phase 1
- [x] Auth multi-tenant (register outlet, login, logout)
- [x] Stock Materials CRUD
- [x] Recipe / COGS management
- [x] POS Upload (Excel parser, multi-template, deduplication)
- [x] Purchase Invoice & Stock-In
- [x] Stock Opname (digital signature)
- [x] Cost Control dashboard (< 27% target)
- [x] Audit Trail
- [x] Backup & Restore

## Roadmap
- [ ] Bulk Import Excel (Materials, Recipes)
- [ ] Super Admin dashboard (`admin.barventis.id`)
- [ ] Billing via Midtrans
- [ ] Subscription plans (Starter / Professional / Enterprise)
