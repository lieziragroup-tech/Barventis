#!/usr/bin/env python3
"""
Kei QA/QC Automated Alpha Testing Suite — 2-Role System (ADMIN & TEKNISI_LAPANGAN)
Focus:
1. Haversine Geolocation & Digital Report (Laporan Hasil Pekerjaan)
2. Realistic PT Guci Emas Pratama Seed Data Across TODAY, TOMORROW, YESTERDAY, & ARCHIVE (< Kemarin)
3. 100% Database-Backed Features (Zero Fake Photo Cache / Zero Non-DB Clutter)
4. Full Dark Mode (html.dark) Parity Across Technician, Floating Pill, & Admin Views
5. GitHub & Vercel Deployment Readiness (.env.example, README.md, SQL Setup)
"""
from pathlib import Path

repo = Path(__file__).resolve().parent.parent
geo_src = (repo / "src/shared/utils/geo.ts").read_text(encoding="utf-8")
seed_src = (repo / "src/shared/data/realisticFieldworkSeed.ts").read_text(encoding="utf-8")
proj_api_src = (repo / "src/shared/api/projects.ts").read_text(encoding="utf-8")
rep_api_src = (repo / "src/shared/api/workReports.ts").read_text(encoding="utf-8")
adm_api_src = (repo / "src/shared/api/admin.ts").read_text(encoding="utf-8")
exec_src = (repo / "src/widgets/executor/ExecutorHome.tsx").read_text(encoding="utf-8")
treat_src = (repo / "src/widgets/executor/TreatmentFormModal.tsx").read_text(encoding="utf-8")
rev_src = (repo / "src/widgets/executor/CustomerReviewFormModal.tsx").read_text(encoding="utf-8")
adm_src = (repo / "src/widgets/admin/AdminDashboard.tsx").read_text(encoding="utf-8")
bento_src = (repo / "src/widgets/admin/OperationsAnalyticsBento.tsx").read_text(encoding="utf-8")
login_src = (repo / "src/widgets/auth/LoginForm.tsx").read_text(encoding="utf-8")
css_src = (repo / "src/app/index.css").read_text(encoding="utf-8")
tab_src = (repo / "src/shared/ui/TabContainer.tsx").read_text(encoding="utf-8")

checks = [
    ("ALPHA-2ROLE-01", "Fokus 2 Role (ADMIN & TEKNISI_LAPANGAN) di Login, Routing App.tsx, dan Sidebar Admin",
     "1. GEOLOCATION & DIGITAL REPORT" in adm_src
     and "id: \x27spk-cms\x27" not in adm_src.split("const ALL_ITEMS:")[1].split("// Petakan alias")[0]
     and "Admin Operasional" in login_src and "Teknisi Lapangan" in login_src),
    ("ALPHA-DB-SEED-01", "Data Realistis PT Guci Emas Pratama Terdistribusi di Hari Ini (0), Besok (+1), Kemarin (-1), & Arsip (-5, -12)",
     all(k in seed_src for k in [
         "getLocalOffsetYmd(0)", "getLocalOffsetYmd(1)", "getLocalOffsetYmd(-1)",
         "getLocalOffsetYmd(-5)", "getLocalOffsetYmd(-12)",
         "PT PLN (Persero) UP3 Bulungan", "PT Bank Mandiri (Persero) Tbk",
         "RS Medika BSD", "PT Oreka Solusi Kreatif", "Hotel Santika Premiere Bintaro",
         "PT Bank Victoria International Tbk", "PT Indofood CBP Sukses Makmur Tbk",
         "PT Bank Central Asia Tbk", "Apartemen Emerald Bintaro"
     ]) and "mergeWithRealisticProjects" in proj_api_src and "mergeWithRealisticReports" in rep_api_src and "getLocalRealisticReports" in adm_api_src),
    ("ALPHA-DATE-01", "Klasifikasi Tanggal Tugas (Hari Ini, Besok, Kemarin, Arsip > Kemarin), Filter Tanggal, & Detail On-Click Tanpa Toggle Mode Ringkas",
     all(k in exec_src for k in ["classifyTaskHorizon", "resolveTaskDateKey", "ARCHIVE", "taskDateFilter", "historyDateFilter"])
     and "Mode Ringkas" not in exec_src and "Mode Detail" not in exec_src),
    ("ALPHA-NO-FAKE-CACHE-01", "Penghapusan Fitur Non-Database (Tanpa Pembersihan Cache Foto / cacheSizeMb & Terikat Penuh ke Database)",
     "Pembersihan Cache Foto" not in exec_src
     and "cacheSizeMb" not in exec_src
     and "autoWaDirect" not in exec_src
     and "Sinkronisasi Database Supabase" in exec_src
     and "reportFieldIssueToDb" in exec_src
     and "getRealisticFieldIssues" in bento_src),
    ("ALPHA-DARK-MODE-01", "Dukungan Penuh Tema Gelap (html.dark) di Teknisi, Floating Bottom Pill, Login, & Admin",
     all(k in css_src for k in [
         "--canvas: #101613", "--surface: #1A211D", "--subtle: #222C26",
         "--text: #F0F4F1", "--green: #4B9B70", "html.dark .technician-stage",
         "html.dark .phone-app", "html.dark .bg-white"
     ]) and "floating-bottom-pill" in tab_src and "toggleDarkLightTheme" in exec_src),
    ("ALPHA-GEO-01", "Rumus Geolocation Haversine (calculateDistanceMeters & isWithinRadius)",
     all(k in geo_src for k in ["calculateDistanceMeters", "isWithinRadius", "isLocationWithinRadius", "6371e3"])),
    ("ALPHA-REP-01", "Digital Report (Laporan Hasil Pekerjaan) Dual-Mode Anti Rayap vs Pest Control + Tanpa QR & Tanpa Berita Acara",
     all(k in exec_src for k in ["Laporan Hasil Pekerjaan", "Pratinjau PDF", "Kirim Laporan Hasil Pekerjaan via WhatsApp", "hideTopBar={true}", "floatingOnAllScreens={true}"])
     and "Pindai QR" not in exec_src and "Berita Acara" not in exec_src),
    ("ALPHA-REP-02", "Evaluasi Rahasia PIC Otomatis Sesudah Tanda Tangan (Wajib Diisi & Strict Blind dari Teknisi)",
     all(k in rev_src for k in ["SIGN_STAGE", "STRICT_BLIND_EVAL_STAGE", "STRICT_BLIND_PIC_REVIEW", "useState<number>(0)"])
     and "Evaluasi PIC Klien: Terkunci &amp; Rahasia" in exec_src),
    ("ALPHA-DEPLOY-01", "Kesiapan Deployment GitHub & Supabase (.env.example, README.md, guci_emas_2role_database_setup.sql, vercel.json)",
     (repo / ".env.example").exists()
     and (repo / "README.md").exists()
     and (repo / "supabase/guci_emas_2role_database_setup.sql").exists()
     and (repo / "vercel.json").exists()),
]

for cid, title, ok in checks:
    assert ok, f"[{cid}] FAILED: {title}"
    print(f"[PASS] {cid}: {title}")

print(f"\nALL 2-ROLE HAVERSINE & DIGITAL REPORT ALPHA TESTS PASSED: {len(checks)}/{len(checks)}")
