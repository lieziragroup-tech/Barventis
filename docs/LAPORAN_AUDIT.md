# Laporan Audit & Perbaikan — Fieldwork (hasil akhir)

Permintaan: **(1)** perbaiki semua bug dan defect, **(2)** semua template perusahaan dapat diatur oleh admin masing-masing perusahaan.
Perbandingan dilakukan terhadap kode asli di `fieldwork.zip` dan skema DB live yang Anda lampirkan.
Perubahan: 96 file (34 baru, 58 diubah, 4 dihapus); tanpa noise line-ending: +6.313 / −4.025 baris.

---

## 1. Bukti pengujian (semua dijalankan, bukan hanya dibaca)

| Uji | Kode asli | Hasil akhir |
|---|---|---|
| `tsc --noEmit` | 1 error | 0 error |
| `vite build` + bundle server | gagal pada instalasi bersih | sukses; bundle produksi dijalankan (health 200, tanpa token 401, rute login lama 404, header keamanan ada) |
| Migrasi pada DB kosong (`npm run db:migrate`) | gagal | 5 migrasi sukses; diulang = "sudah mutakhir" |
| Migrasi pada DB **live** (tabel sudah ada) | — | `00`/`01` otomatis ditandai selesai, hanya `02`–`04` diterapkan |
| Integrasi Express + PostgreSQL (`npm run test:integration`) | 1/15 | **50/50** (token, isolasi 2 perusahaan, SUPERADMIN, user, aturan risiko, cron, dll.) |
| RLS & RPC SQL dengan role `authenticated`/`anon` sungguhan (`supabase/tests/rls_test.sql`) | — | **48/48** |
| Penomoran surat, 25 sesi serentak | nomor ganda mungkin | 25 nomor unik berurutan |
| Sistem template (`npm run test:templates`) | — | 11/11 (sanitasi, markup, 2 perusahaan berbeda, tanpa kebocoran identitas) |
| Lapisan Firestore→Supabase (`npm run test:shim`) | halaman kosong / crash | 12/12 (paginasi 1.150 baris, payload, Timestamp, operator `in`, alias) |
| PDF vs contoh asli | berbeda | struktur, teks, dan angka sama (5 penawaran + laporan kunjungan) |

---

## 2. Template per perusahaan — diatur admin masing-masing

Menu baru **Template & Pengaturan** di sidebar (hanya ADMIN perusahaan, dan SUPERADMIN setelah memilih perusahaan).
Panduan untuk admin: `docs/PANDUAN_ADMIN_TEMPLATE.md`.

| Yang bisa diatur | Detail |
|---|---|
| Identitas & kop | nama, alamat, kontak, kota penerbit surat, prefix nomor surat; kop berupa **teks** (nama, tagline, warna) atau **gambar** (unggah, lebar mm); footer kustom atau otomatis dari kontak; hingga 3 logo footer |
| Surat penawaran | masa berlaku, salam penutup, kontak di bagian Penutup, tanda tangan/stempel bawaan |
| Anti rayap | garansi (tahun, catatan), skema pembayaran, daftar pengontrolan, catatan pajak |
| Pest & rodent | isi program (teks sederhana dengan placeholder `{company}` / `{klien}`), sistem pembayaran |
| Laporan kunjungan | judul, jenis pekerjaan, saran bawaan, tampil/sembunyikan baris "created by" |
| Pratinjau | PDF asli dirender dari isian yang sedang diedit (belum perlu disimpan) |

**Keamanan.** Tulis hanya lewat RPC `company_settings_patch`: ADMIN perusahaan itu atau SUPERADMIN. MARKETING, INVENTORY, TEKNISI, dan admin perusahaan lain **ditolak oleh database** (bukan hanya disembunyikan di UI); tulis langsung ke tabel ditutup. Gambar dibatasi PNG/JPEG/WEBP (SVG ditolak), diperkecil otomatis, ≤ ~450 KB. Data tersimpan disanitasi saat dibaca (tipe, rentang, kunci asing, `__proto__`).

**Perilaku.** Nilai yang diisi di form penawaran selalu menang atas template. Perusahaan baru memakai bawaan **netral**. Sebelumnya bawaan berisi nama/alamat/WA/email Guci, sehingga **setiap perusahaan baru mencetak identitas Guci**; kini hanya perusahaan Guci yang belum menyimpan pengaturan yang tetap memakai tampilan Guci.

---

## 3. Semua temuan dan statusnya

### P0 — keamanan & autentikasi (sebelumnya menunggu konfirmasi, kini **diterapkan**)
| # | Temuan | Perbaikan |
|---|---|---|
| 1 | Login Supabase tidak tersambung ke API Express (semua 401); role `ADMIN/EXECUTOR` ≠ enum live; `company_id` tak diisi | `requireAuth` memverifikasi token Supabase (HS256 / JWKS ES256·RS256, algoritma dibatasi eksplisit); role, perusahaan, dan status aktif dari DB pada tiap request; klien memakai sesi Supabase |
| 2 | `POST /auth/reset-password` tanpa autentikasi (reset password siapa pun) | Rute dihapus; Express tak lagi mengurus kata sandi |
| 3 | Rahasia JWT bawaan di kode | Dihapus; tanpa konfigurasi autentikasi semua request ditolak |
| 4 | RPC `SECURITY DEFINER` tanpa otorisasi | Semua RPC memeriksa `auth.uid()` + perusahaan + role; hak eksekusi dicabut dari `anon` |
| 5 | Browser→Supabase tanpa RLS terdokumentasi; `password_hash` terbaca | Migrasi `04`: RLS per perusahaan; `password_hash` tak terbaca; update `users` hanya `name`/`phone` milik sendiri; tabel khusus backend tertutup |
| 6 | Pendaftaran undangan: role/perusahaan dikirim klien (bisa mendaftar sebagai admin perusahaan lain) dan insert gagal (`password_hash` NOT NULL) | RPC `accept_invite` (atomik, sekali pakai, nilai dari undangan); anon hanya memvalidasi satu token |
| 7 | Backend tidak tenant-aware: admin satu perusahaan bisa melihat/mengubah perusahaan lain; aturan risiko global | Semua query dibatasi `company_id`; aturan risiko per perusahaan; log audit per perusahaan; SUPERADMIN memilih perusahaan |

### P1 — alur utama (diperbaiki)
Validasi radius mati (koordinat proyek ditimpa GPS teknisi) dan koordinat MapPicker dibuang · mode offline merusak durasi & antrean terblokir · bug zona waktu risk engine · foto tak termuat (`purged_at`) · `db:migrate` gagal · ekspor CSV selalu 500 · RPC `process_status_approval` gagal 100% dan stok `INT` · race check-in/check-out/review · shim Firebase menelan error (halaman kosong), field & operator salah, `Timestamp` menjadi `{}`, `uid` menimpa `id` · state login hilang setelah refresh · role frontend salah dipetakan · pembuatan user memindahkan sesi admin · dependency hilang · cron retensi tidak berjalan · tanggal PDF mundur 1 hari · **nomor surat ganda** (dihitung di klien) dan prefix `GP-` di-hardcode · penawaran: PDF base64 ikut di setiap baris daftar dan read-modify-write saling menimpa · `saveCompanySettings` menghapus kunci lain (mis. aturan risiko) · `.gitignore` mengabaikan `.env.example` · Inventori menampilkan `DUMMY_STOK` dan RPC tak terpasang (kini data nyata: stok, mutasi masuk/keluar, log, rekap bulanan, item baru, import tervalidasi) · `performaTargets`/`customerChecklists`/`invites` menulis ke tabel yang tidak ada (kini tabel + RLS).

### P2 (diperbaiki)
Error handler membocorkan stack/SQL · CSV injection · filter jam/tanggal memakai UTC · admin bisa menonaktifkan diri/admin terakhir · ambang risiko tak divalidasi · ID non-UUID → 500 · MulterError/JSON rusak → 500 · folder upload di luar proyek · MIME `image/jpg` · env Supabase placeholder · foto PDF tak dikompres (22 MB → 0,6 MB) · SSL DB tanpa verifikasi (kini `DB_SSL_CA`; peringatan bila kosong) · tanpa rate-limit dan `helmet` (kini ada) · `user_locations` tumbuh tanpa batas (retensi 30 hari di cron) · `/work-reports/mine` N+1 dan tanpa paginasi · PostgREST memotong 1000 baris · 4 dependensi tak terpakai dihapus (`bcryptjs`, `jsonwebtoken`, `@google/genai`, tipe) · `bun.lock` ganda dan skema SQL kembar usang dihapus.

### Koreksi atas laporan sebelumnya
- Dugaan "kolom `quoId` camelCase adalah bug" **salah**: insert dan filter memakai nama yang sama; tidak diubah.
- Lima butir P0 yang tadinya "menunggu konfirmasi" kini semuanya diterapkan dan diuji.

### Belum / tidak dapat diselesaikan (jujur)
1. **`xlsx@0.18.5`** punya advisori keamanan yang hanya diperbaiki pada rilis CDN SheetJS; tidak bisa dipasang dari lingkungan ini. Impor dibatasi (2 MB, 500 baris, validasi baris). Mutakhirkan sesuai `docs/PANDUAN_DEPLOY.md`.
2. **Form penawaran belum punya input** untuk field per-penawaran baru (objek pekerjaan, surveyor, lampiran denah, dll.). Generator mendukungnya; sementara nilainya berasal dari template/bawaan.
3. Halaman lama yang **tidak terhubung ke navigasi** (`TeamPage`, `CompaniesPage`, dll.) menulis `users` langsung dan akan ditolak RLS bila diaktifkan kembali; gunakan endpoint admin. `CompanyUsersPage` sudah dialihkan ke backend.
4. `tsconfig` non-strict, satu bundle JS >500 kB, line-ending campur: kebersihan kode, tidak diubah.

---

## 4. Yang perlu Anda ketahui sebelum produksi
- **Belum diuji di browser dan di Supabase live Anda.** Frontend lolos `tsc` dan `vite build`; shim diuji dengan klien Supabase tiruan; backend dengan PostgreSQL 16 + server Supabase tiruan (Auth Admin dan JWKS). PDF dirender dan dibandingkan secara visual.
- **Migrasi `04` mengganti semua policy lama** pada tabel yang dikelola dan mengaktifkan RLS; `DATABASE_URL` wajib memakai role `postgres`. Uji di staging dulu (lihat `docs/PANDUAN_DEPLOY.md`). `rls_test.sql` mengosongkan data: jalankan hanya pada salinan.
- Pengguna lama harus punya akun Supabase Auth dengan `users.id` yang sama. Env baru: `SUPABASE_URL`, `SUPABASE_JWT_SECRET` (atau JWKS), `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `DB_SSL_CA` (disarankan).
- **Prefix nomor surat:** isi "Prefix nomor surat" = `GP` di Template & Pengaturan bila ingin urutan lama berlanjut.
- Asumsi saya (koreksi bila keliru): perusahaan berstatus `TRIAL` boleh login; aksi offline dipercaya ≤ 24 jam; PostgreSQL ≥ 15.
- Endpoint Express `/auth/login|signup|reset-password|invite` dihapus.

## 5. File penting
Baru: `supabase/migrations/00..04`, `supabase/tests/rls_test.sql`, `backend-src/utils/validate.ts`,
`src/shared/lib/{documentTemplates,documentPresets,sampleDocuments,quotationLetterPdf,quotationTemplates,visitReportPdf,terbilang,roles}.ts`,
`src/shared/api/{documentConfig,authProfile}.ts`, `src/widgets/admin/{TemplateSettingsPanel,CompanyPicker}.tsx`, `scripts/*`, `docs/*`.
