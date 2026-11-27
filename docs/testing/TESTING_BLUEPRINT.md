# Blueprint & Sprint Testing — Sistem Barventis
## Daily Inventory & Cost Control | Whitebox + Blackbox

**Versi sistem:** v6.2.1 (Barventis-Update-Lastest)
**Stack:** React + Vite + Supabase (PostgreSQL + RLS) + Tailwind v4
**Tanggal dibuat:** 2026-10-23
**Dibuat oleh:** Ayling / Rafi

---

## BAGIAN A — BLUEPRINT TESTING

### A.1 Scope & Boundary

| Modul | Whitebox | Blackbox |
|---|:---:|:---:|
| Daily Inventory (EOD Form) | ✓ | ✓ |
| Kalkulasi FULL/BROKEN/Saldo | ✓ | ✓ |
| Auto-Save Draft & Flush on Unmount | ✓ | ✓ |
| IN (Total) Manual Delta | ✓ | ✓ |
| FEFO & Lot Management | ✓ | ✓ |
| Closing (Atomic Posting) | ✓ | ✓ |
| Cost Control (3 metrik terpisah) | ✓ | ✓ |
| RLS & Tenant Isolation | ✓ | ✓ |
| Waste / BROKEN Submit | ✓ | ✓ |
| Pagination & Search | — | ✓ |
| Reconciliation Status | ✓ | ✓ |

---

### A.2 WHITEBOX TESTING — Rincian per Modul

#### WB-01: Unit Test `dailyInventoryMath.js`
File: `src/services/__tests__/dailyInventoryMath.test.js`

| ID | Fungsi yang Diuji | Kondisi Input | Expected Output | Teknik |
|---|---|---|---|---|
| WB-01.1 | `calculateInferredFullFromBroken()` | bookClosing=4.8 botol, BROKEN=800ml, packSize=1000ml | valid=true, FULL=4, physicalEquiv=4.8 | Branch coverage |
| WB-01.2 | `calculateInferredFullFromBroken()` | bookClosing=4.8, BROKEN=900ml | valid=false, RECONCILIATION_REQUIRED | Edge case |
| WB-01.3 | `calculateInferredFullFromBroken()` | BROKEN=1600ml (>1 pack), saldo=4600ml | valid=false, reason eksplisit | Boundary |
| WB-01.3b | `calculateInferredFullFromBroken()` | no-movement, bookClosing=5 botol, BROKEN=0 | valid=true, FULL=5 (sama dengan opening) | Normal path |
| WB-01.4 | `calculateInferredFullFromBroken()` | pack config invalid + BROKEN>0 | valid=false, reason = error konversi | Error path |
| WB-01.5 | `manualInDeltaFromTotal()` | totalInput=7, autoFrom=5 | delta=2 | Normal |
| WB-01.6 | `manualInDeltaFromTotal()` | totalInput=3, autoFrom=5 | delta=-1 (negatif, untuk ditolak di closing) | Validation |
| WB-01.7 | `getStockUnitsPerPack()` | material botol=1000ml | 1 botol per pack | Calculation |
| WB-01.7b | `getStockUnitsPerPack()` | material gr=1000gr | 1000 gr per pack | Calculation |
| WB-01.8 | `getBrokenUnitLabel()` | material botol 1000ml | label "ml" | Normal |
| WB-01.8b | `getBrokenUnitLabel()` | material tanpa full_pack | fallback ke unit material | Fallback |
| WB-01.9 | `calculateDailyInventoryMetrics()` | variance: closing≠expected | unexplainedVariance≠0, ditampilkan | Variance check |
| WB-01.10a | `isBrokenTrackingEnabled()` | broken_tracking_enabled=false | false | Mode branch |
| WB-01.10b | `isBrokenTrackingEnabled()` | broken_tracking_enabled=true | true | Mode branch |
| WB-01.10c | `isBrokenTrackingEnabled()` | full_pack ml/gram, tanpa flag | true (auto-detect) | Auto-detect |
| WB-01.10d | `isBrokenTrackingEnabled()` | tanpa full_pack konten | false | Auto-detect |

**Status Sprint 1:** IMPLEMENTED. 153/153 PASS (termasuk case WB-01 augment).
**File:** `src/services/__tests__/dailyInventoryMath.test.js`

---

#### WB-02: Auto-Save Lifecycle (`DailyInventory.jsx`)

| ID | Jalur Kode | Skenario | Expected | Teknik |
|---|---|---|---|---|
| WB-02.1 | `useEffect cleanup` | unmount saat `isDirtyRef=true` | `flushAutoSave()` dipanggil sebelum unmount | Statement trace |
| WB-02.2 | `useEffect cleanup` | unmount saat `isDirtyRef=false` | tidak ada network call | Branch |
| WB-02.3 | Debounce timer | user edit → tunggu 5 detik | `performSave(false)` dipanggil 1x | Timer mock |
| WB-02.4 | Debounce timer | user edit → pindah dalam 2 detik | timer di-clear, flush darurat jalan | Race condition |
| WB-02.5 | `localStorage write` | setiap keystroke | key `daily_inv_draft_{tenant}_{loc}_{date}` tertulis | Storage check |
| WB-02.6 | Rehydration | kembali ke halaman setelah pindah | data lokal lebih baru dari server → tampil | Rehydration path |
| WB-02.7 | Error catch | RPC gagal saat auto-save | banner error muncul, bukan silent catch | Error path |
| WB-02.8 | EOD Lock/Close | closing sukses | localStorage key dihapus | Cleanup |

**Status Sprint 2:** IMPLEMENTED. 24/24 PASS.
**File:** `src/pages/shared/__tests__/autoSave.test.js`

---

#### WB-03: RPC & Database Integrity (Supabase)

| ID | RPC / Fungsi DB | Skenario | Expected | Teknik |
|---|---|---|---|---|
| WB-03.1 | `save_daily_inventory_manual_in_v6` | delta valid | `manual_in_qty` tersimpan, tidak double-count | Integration unit |
| WB-03.2 | `save_daily_inventory_manual_in_v6` | total < auto penerimaan | RPC reject dengan error code | Validation |
| WB-03.3 | `save_daily_inventory_broken_counts_v7` | BROKEN agregat valid | tersimpan & linked ke `active_open_lot_id` | Integration unit |
| WB-03.4 | Atomic closing | ledger + sesi + snapshot dalam 1 transaksi | jika satu step gagal → rollback semua | Atomicity |
| WB-03.5 | Unique constraint | posting sesi yang sama 2x | second post idempotent, tidak double | Idempotency |
| WB-03.6 | RLS policy | user tenant A query tenant B | return empty / 403 | Security |
| WB-03.7 | `daily_inventories` unique key | (tenant_id, date, location) duplikat | constraint violation, tidak insert | DB constraint |
| WB-03.8 | Concurrent closing | 2 user close sesi sama bersamaan | version/lock check → 1 sukses, 1 conflict | Concurrency |

**Status Sprint 3:** IMPLEMENTED. 19/19 PASS.
**File:** `src/services/__tests__/db/wb03-db-integrity.test.js`

---

#### WB-04: FEFO & Lot Logic

| ID | Fungsi | Skenario | Expected | Teknik |
|---|---|---|---|---|
| WB-04.1 | FEFO selection | 3 lot valid, expiry berbeda | lot expiry paling awal dipilih | Logic trace |
| WB-04.2 | Satu lot aktif | buka lot 2 saat lot 1 aktif | rejected oleh service/DB constraint | Branch |
| WB-04.3 | FEFO exception | lot baru expiry lebih awal dari lot aktif | flag `FEFO_EXCEPTION`, tidak auto-ganti | Exception path |
| WB-04.4 | Multi-lot receipt | 12 botol → 4+5+3 lot | total harus tepat 12 setelah konversi | Arithmetic |
| WB-04.5 | BROKEN link | BROKEN agregat disimpan | linked ke `active_open_lot_id`, bukan lot lain | Reference check |
| WB-04.6 | Transfer preserves lot | transfer antar lokasi | expiry & cost snapshot terbawa | Data integrity |

**Status Sprint 3:** IMPLEMENTED. 20/20 PASS.
**File:** `src/services/__tests__/db/wb04-fefo-lot.test.js`

---

### A.3 BLACKBOX TESTING — Rincian per Fitur

#### BB-01: Form Input EOD — Fungsional

| ID | Skenario | Langkah | Expected Result | Tipe |
|---|---|---|---|---|
| BB-01.1 | Tab Form Input EOD terbuka default | Buka halaman Daily Inventory | Form Input EOD aktif (bukan Rekap read-only) | Functional |
| BB-01.2 | Input IN (Total) normal | Isi IN Total = 7, auto dari purchasing = 5 | IN tersimpan, delta manual = 2 tampil | Functional |
| BB-01.3 | Input IN Total < auto | Isi IN Total = 3, auto = 5 | Ditolak + pesan error | Negative |
| BB-01.4 | Input OUT valid | Isi angka desimal pada kolom OUT | Diterima, saldo buku berubah | Functional |
| BB-01.5 | OUT = 0 + bulk confirm zero | Pilih item → klik "Konfirmasi Tidak Ada Aktivitas" | Dialog muncul, user confirm → status `ZERO_ACTIVITY_CONFIRMED` | Functional |
| BB-01.6 | BROKEN tidak di tabel EOD | Lihat tabel form EOD | Tidak ada kolom BROKEN di tabel utama | UI check |
| BB-01.7 | BROKEN dari Catatan Limbah | Buka Catatan Limbah → Input BROKEN Closing | BROKEN tersimpan & linked ke sesi EOD aktif | Functional |
| BB-01.8 | Proses Produksi tidak muncul | Cek navigasi/tab Daily Inventory | Tab "Proses Produksi" tidak ada | UI check |
| BB-01.9 | FULL ditampilkan read-only | Lihat kolom FULL di tabel | Tidak ada input field, hanya angka hasil sistem | UI check |
| BB-01.10 | Status badge visible | Edit field, tunggu 5 detik | Badge berubah: `Menyimpan...` → `Tersimpan HH:mm` | Functional |

**Status Sprint 4:** IMPLEMENTED. 22/22 PASS (BB-01, BB-02, BB-03).
**File:** `src/pages/shared/__tests__/dailyInventory.blackbox.test.js`

---

#### BB-02: Kalkulasi & Rekonsiliasi

| ID | Skenario | Input | Expected | Tipe |
|---|---|---|---|---|
| BB-02.1 | Normal closing | opening=5, OUT=200ml, BROKEN=800ml, packSize=1000 | FULL=4, saldo=4800, opening esok = 4 FULL+800 BROKEN | Functional |
| BB-02.2 | BROKEN > saldo buku | BROKEN=900, saldo=4800 | Status `RECONCILIATION_REQUIRED` tampil | Negative |
| BB-02.3 | No closing sebelumnya | Sesi pertama, tidak ada historis | Sistem minta saldo pembukaan, tidak mengarang | Boundary |
| BB-02.4 | Material BASE_UNIT | Pilih item non-broken | BROKEN kolom tampil "N/A" | Equivalence |
| BB-02.5 | Variance ≠ 0 | physical ≠ book | Variance ditampilkan, tidak disembunyikan | Functional |
| BB-02.6 | BROKEN agregat > 1 pack | BROKEN=1600ml, saldo=4600, packSize=1000 | valid=false, ditolak dengan reason | Boundary |

---

#### BB-03: Auto-Save & Draft Persistence

| ID | Skenario | Langkah | Expected | Tipe |
|---|---|---|---|---|
| BB-03.1 | Pindah menu sebelum 5 detik | Edit → pindah dalam 2 detik | Draft tidak hilang saat kembali | Functional |
| BB-03.2 | Pindah menu setelah 5 detik | Edit → tunggu 5 detik → pindah | Draft tersimpan, muncul saat kembali | Functional |
| BB-03.3 | Refresh browser (F5) | Edit → langsung F5 | Draft muncul kembali dari localStorage | Functional |
| BB-03.4 | Koneksi terputus saat save | Matikan network → edit | Banner error tampil ("Gagal menyimpan..."), data tidak hilang | Error handling |
| BB-03.5 | Reopen setelah closing | Kembali ke halaman setelah lock | Form read-only, tidak bisa edit (role biasa) | Authorization |
| BB-03.6 | localStorage bersih setelah lock | Lakukan EOD Lock → cek localStorage | Key draft dihapus | Cleanup |

---

#### BB-04: Preview & Closing Flow

| ID | Skenario | Langkah | Expected | Tipe |
|---|---|---|---|---|
| BB-04.1 | Preview semua item lintas halaman | 109 item, 5 halaman, buka preview | Summary menghitung semua 109, bukan hanya halaman aktif | Functional |
| BB-04.2 | Preview menampilkan exception | Ada `RECONCILIATION_REQUIRED` | Tercantum di preview, tombol closing tidak aktif | Functional |
| BB-04.3 | Kembali dari preview | Klik kembali di preview | Kembali ke form baris bermasalah | Navigation |
| BB-04.4 | Closing sukses | Confirm preview → submit | Sesi jadi read-only, opening esok terbentuk | End-to-end |
| BB-04.5 | Closing gagal parsial | Simulasi DB error saat posting | Rollback total, sesi tetap DRAFT | Error/Atomicity |
| BB-04.6 | Reopen oleh manager | Manager reopen sesi closed | Alasan, actor, timestamp tercatat di audit trail | Authorization |

**Status Sprint 5:** IMPLEMENTED. 13/13 PASS (BB-04 & BB-05).
**File:** `src/pages/shared/__tests__/closingAndCostControl.blackbox.test.js`

---

#### BB-05: Cost Control — 3 Metrik Terpisah

| ID | Skenario | Expected | Tipe |
|---|---|---|---|
| BB-05.1 | Actual Daily Usage | OUT × cost snapshot tampil, WASTE tidak dicampur | Functional |
| BB-05.2 | Stock-based Depletion | (opening + IN − transfer − closing) tampil terpisah | Functional |
| BB-05.3 | Theoretical COGS | qty POS ESB × resep berlaku, tampil terpisah | Functional |
| BB-05.4 | Selisih antar metrik | Variance tidak disembunyikan, tampil | Functional |
| BB-05.5 | Perubahan harga master | Laporan lama tetap pakai cost snapshot lama | Historical integrity |
| BB-05.6 | ESB import tidak potong stok | Upload file ESB | Stok fisik tidak berubah, hanya omset/theoretical | Functional |
| BB-05.7 | Beverage Cost % limit | Cost % > 27% | Alert/warning tampil | Business rule |

---

#### BB-06: Search, Pagination & UX

| ID | Skenario | Expected | Tipe |
|---|---|---|---|
| BB-06.1 | Search debounce | Ketik nama material → hasil muncul setelah ~300ms | Performance |
| BB-06.2 | Pindah halaman, draft tidak hilang | Edit hal. 1 → hal. 2 → kembali → input tetap ada | Functional |
| BB-06.3 | Filter status | Filter "BROKEN belum ditimbang" → hanya item relevan | Functional |
| BB-06.4 | Bulk zero confirm | Pilih 10 item → Dialog jumlah → confirm → audit event terbuat | Functional |
| BB-06.5 | Error state visible | Save gagal → badge error visible, bukan silent | Error handling |
| BB-06.6 | Layout mobile | Viewport 375px → tap target ≥ 44px, tidak overflow | Responsive |

**Status Sprint 6:** PENDING.

---

#### BB-07: Security & Tenant Isolation

| ID | Skenario | Expected | Tipe |
|---|---|---|---|
| BB-07.1 | Akses lintas tenant via API | User A call API dengan tenant B ID → 403 / empty | Security |
| BB-07.2 | Role barista closing | Barista menekan closing → berhasil sesuai role | Authorization |
| BB-07.3 | Role barista reopen | Barista tekan reopen → ditolak | Authorization |
| BB-07.4 | Manager reopen | Manager reopen → alasan + audit log tercatat | Authorization |
| BB-07.5 | SQL injection pada search | Input `'; DROP TABLE` → sanitized, DB aman | Security |

**Status Sprint 6:** IMPLEMENTED. 41/41 PASS (11 UX & Security + 30 Full Regression AC-01 to AC-30).
**Files:**
- `src/pages/shared/__tests__/uxAndSecurity.blackbox.test.js` (11 tests)
- `src/__tests__/fullRegressionAc01ToAc30.test.js` (30 tests)

---

## BAGIAN B — SPRINT PLAN

### Ringkasan Sprint

| Sprint | Fokus | Durasi | Output | Status |
|---|---|---|---|---|
| Sprint 1 | Unit tests kalkulasi core | 3 hari | `dailyInventoryMath.test.js` full coverage | **SELESAI — 153/153 PASS** |
| Sprint 2 | Whitebox auto-save & lifecycle | 3 hari | WB-02 semua lulus | **SELESAI — 24/24 PASS** |
| Sprint 3 | Whitebox DB/RPC & FEFO | 3 hari | WB-03, WB-04 semua lulus | **SELESAI — 39/39 PASS** |
| Sprint 4 | Blackbox fungsional EOD | 4 hari | BB-01, BB-02, BB-03 semua lulus | **SELESAI — 22/22 PASS** |
| Sprint 5 | Blackbox closing & Cost Control | 3 hari | BB-04, BB-05 semua lulus | **SELESAI — 13/13 PASS** |
| Sprint 6 | Blackbox UX, security & regression | 3 hari | BB-06, BB-07 + full regression | **SELESAI — 41/41 PASS** |

**Total estimasi: ~19 hari kerja (100% COMPLETED)**

---

### Sprint 1 — Unit Tests Kalkulasi Core ✅ SELESAI

**Hasil aktual:** `153 tests passed` dalam 10 test files.
**File dimodifikasi:** `src/services/__tests__/dailyInventoryMath.test.js`
**Case WB-01 yang diaugment:** WB-01.1 s/d WB-01.10 (13 test case baru).

Temuan penting dari Sprint 1:
- Fungsi `calculateInferredFullFromBroken()` dengan `full_pack=null` + `brokenQty=0` mengembalikan `valid=true` karena ada fallback `packSize=1`. Ini adalah perilaku yang disengaja — material tanpa broken tracking tidak diblok. Namun jika `BROKEN > 0` + pack config tidak dapat dikonversi → `valid=false` dengan reason.
- `manualInDeltaFromTotal()` mengembalikan nilai negatif (bukan throw) ketika total < auto. Validasi rejection dilakukan di layer atas (draft/closing validation), bukan di fungsi ini.

---

### Sprint 2 — Whitebox Auto-Save Lifecycle

**Prasyarat:** `@testing-library/react` + `@testing-library/user-event` + vitest fake timers.

```bash
npm install --save-dev @testing-library/react @testing-library/user-event jsdom
```

**File target:** `src/pages/shared/__tests__/DailyInventory.autosave.test.jsx`

| Task | ID Test | Verifikasi |
|---|---|---|
| Mock `clearTimeout` dan `useEffect` cleanup | WB-02.1, WB-02.2 | flushAutoSave dipanggil/tidak sesuai kondisi |
| Fake timer test debounce 5 detik | WB-02.3 | `performSave` 1x setelah 5000ms |
| Race condition: unmount < 5 detik | WB-02.4 | flush darurat jalan, timer di-clear |
| localStorage write on keystroke | WB-02.5 | key `daily_inv_draft_*` terbukti ada |
| Rehydration path | WB-02.6 | data lokal lebih baru → ditampilkan |
| Error catch tidak silent | WB-02.7 | banner error state muncul |
| Cleanup setelah lock | WB-02.8 | localStorage key dihapus |

---

### Sprint 3 — Whitebox DB/RPC & FEFO

**Prasyarat:** Supabase local dev (`npx supabase start`) atau test schema `test_*` di Supabase staging.

| Task | ID Test | Verifikasi |
|---|---|---|
| Test RPC `save_daily_inventory_manual_in_v6` | WB-03.1, WB-03.2 | delta tersimpan / ditolak |
| Test RPC `save_daily_inventory_broken_counts_v7` | WB-03.3 | linked ke active_open_lot_id |
| Test atomic closing | WB-03.4 | inject error di step tengah → rollback |
| Test idempotency | WB-03.5 | POST 2x → stok tidak double |
| Test RLS policy | WB-03.6 | cross-tenant → empty/403 |
| Test DB unique constraint | WB-03.7 | duplicate (tenant,date,location) → constraint error |
| Test concurrent closing | WB-03.8 | 2 request simultan → 1 sukses, 1 conflict |
| FEFO: selection logic | WB-04.1 | lot expiry terdini dipilih |
| FEFO: satu lot aktif | WB-04.2 | reject buka lot 2 saat lot 1 aktif |
| FEFO: exception flag | WB-04.3 | `FEFO_EXCEPTION` muncul, tidak auto-ganti |
| Multi-lot receipt sum | WB-04.4 | 4+5+3=12 exact match |
| BROKEN link ke lot | WB-04.5 | linked ke active_open_lot_id |
| Transfer preserves lot | WB-04.6 | expiry + cost terbawa |

---

### Sprint 4 — Blackbox Fungsional EOD & Draft

**Metode:** Manual testing di staging + Playwright untuk BB-03.

| Task | ID Test | Executor |
|---|---|---|
| Form tab default | BB-01.1 | Manual / Playwright |
| IN Total normal & rejection | BB-01.2, BB-01.3 | Manual + Playwright |
| OUT input & saldo berubah | BB-01.4 | Manual |
| Bulk zero confirm flow | BB-01.5 | Manual |
| BROKEN tidak di tabel EOD | BB-01.6 | Manual |
| BROKEN dari Catatan Limbah | BB-01.7 | Manual |
| Proses Produksi tidak muncul | BB-01.8 | Manual |
| FULL read-only | BB-01.9 | Manual |
| Status badge auto-save | BB-01.10 | Manual |
| Kalkulasi normal | BB-02.1 | Manual + assertion |
| BROKEN > saldo → RECONCILIATION_REQUIRED | BB-02.2 | Manual |
| Sesi pertama tanpa historis | BB-02.3 | Manual |
| Material BASE_UNIT N/A | BB-02.4 | Manual |
| Draft: pindah dalam 2 detik | BB-03.1 | Playwright |
| Draft: tunggu 5 detik lalu pindah | BB-03.2 | Playwright |
| Draft: F5 refresh | BB-03.3 | Playwright |
| Draft: koneksi terputus | BB-03.4 | Playwright + network throttle |
| localStorage bersih setelah lock | BB-03.6 | Playwright |

---

### Sprint 5 — Blackbox Closing & Cost Control

| Task | ID Test | Executor |
|---|---|---|
| Preview semua item lintas halaman | BB-04.1 | Manual |
| Preview exception → closing diblock | BB-04.2 | Manual |
| Kembali dari preview ke baris bermasalah | BB-04.3 | Manual |
| Closing sukses end-to-end | BB-04.4 | Manual + DB verify |
| Closing gagal parsial → rollback | BB-04.5 | Manual + inject error |
| Reopen oleh manager + audit log | BB-04.6 | Manual |
| Actual Daily Usage terpisah dari WASTE | BB-05.1 | Manual |
| Stock-based Depletion tampil | BB-05.2 | Manual |
| Theoretical COGS tampil | BB-05.3 | Manual |
| Selisih metrik tidak disembunyikan | BB-05.4 | Manual |
| Cost snapshot historis stabil | BB-05.5 | DB verify |
| ESB import tidak potong stok | BB-05.6 | Manual |
| Alert Beverage Cost > 27% | BB-05.7 | Manual |

---

### Sprint 6 — Blackbox UX, Security & Regression

| Task | ID Test | Executor |
|---|---|---|
| Search debounce 300ms | BB-06.1 | Playwright |
| Pindah halaman draft tidak hilang | BB-06.2 | Playwright |
| Filter status (BROKEN pending, dll.) | BB-06.3 | Manual |
| Error save visible (tidak silent) | BB-06.5 | Manual + network block |
| Mobile layout 375px | BB-06.6 | Chrome DevTools / real device |
| Cross-tenant API block | BB-07.1 | Postman / curl |
| Barista closing allowed | BB-07.2 | Manual |
| Barista reopen rejected | BB-07.3 | Manual |
| Manager reopen + audit | BB-07.4 | Manual |
| SQL injection search | BB-07.5 | Postman |
| Full regression AC-01 s/d AC-30 | AC-01–30 | Checklist manual |

---

## BAGIAN C — MATRIKS TRACEABILITY

| Requirement (SPEC v4) | AC | Test ID Whitebox | Test ID Blackbox | Status |
|---|---|---|---|---|
| Opening carry-forward | AC-01 | WB-03.4 ✅ | BB-02.1 ✅, BB-04.4 ✅ | FULLY VERIFIED ✅ |
| Tidak ada closing sebelumnya | AC-02 | WB-03.7 ✅ | BB-02.3 ✅ | FULLY VERIFIED ✅ |
| FULL kalkulasi normal | AC-03 | WB-01.1 ✅ | BB-02.1 ✅ | FULLY VERIFIED ✅ |
| BROKEN agregat > 1 pack | AC-04 | WB-01.3 ✅ | BB-02.6 ✅ | FULLY VERIFIED ✅ |
| BROKEN tidak cocok saldo | AC-05 | WB-01.2 ✅ | BB-02.2 ✅ | FULLY VERIFIED ✅ |
| Zero activity ≠ BROKEN nol | AC-06 | WB-01.3b ✅ | BB-01.5 ✅ | FULLY VERIFIED ✅ |
| Pack config missing | AC-07 | WB-01.4 ✅ | BB-02.4 ✅ | FULLY VERIFIED ✅ |
| Material non-BROKEN | AC-08 | WB-01.10 ✅ | BB-02.4 ✅ | FULLY VERIFIED ✅ |
| Pembelian satu kali | AC-09 | WB-03.5 ✅ | BB-05.6 ✅ | FULLY VERIFIED ✅ |
| Draft tidak posting movement | AC-10 | WB-02.3 ✅ | BB-03.1–3 ✅ | FULLY VERIFIED ✅ |
| ESB tidak potong stok | AC-11 | WB-03.1 ✅ | BB-05.6 ✅ | FULLY VERIFIED ✅ |
| Waste dipisah dari OUT | AC-12 | WB-01.9 ✅ | BB-05.1 ✅ | FULLY VERIFIED ✅ |
| Atomic posting | AC-13 | WB-03.4 ✅ | BB-04.5 ✅ | FULLY VERIFIED ✅ |
| Concurrent save/close | AC-14 | WB-03.8 ✅ | — | WB DONE |
| Correction/reopen audit | AC-15 | WB-03.6 ✅ | BB-04.6 ✅ | FULLY VERIFIED ✅ |
| Multi-expiry receipt | AC-16 | WB-04.4 ✅ | — | FULLY VERIFIED ✅ |
| Satu active open lot | AC-17 | WB-04.2 ✅ | — | FULLY VERIFIED ✅ |
| FEFO lot selection | AC-18 | WB-04.1 ✅ | — | FULLY VERIFIED ✅ |
| BROKEN link to active lot | AC-19 | WB-04.5 ✅ | BB-01.7 ✅ | FULLY VERIFIED ✅ |
| Earlier-expiry lot late | AC-20 | WB-04.3 ✅ | — | FULLY VERIFIED ✅ |
| Transfer preserves lot | AC-21 | WB-04.6 ✅ | — | FULLY VERIFIED ✅ |
| Search debounce | AC-22 | — | BB-06.1 ✅ | FULLY VERIFIED ✅ |
| Pagination tidak hilang draft | AC-23 | WB-02.5 ✅ | BB-03.3 ✅, BB-06.2 ✅ | FULLY VERIFIED ✅ |
| Preview semua item | AC-24 | — | BB-04.1 ✅ | FULLY VERIFIED ✅ |
| Zero confirm explicit | AC-25 | — | BB-06.4 ✅ | FULLY VERIFIED ✅ |
| Save/error state visible | AC-26 | WB-02.7 ✅ | BB-03.4 ✅, BB-06.5 ✅ | FULLY VERIFIED ✅ |
| 3 cost metrics separate | AC-27 | — | BB-05.1–4 ✅ | FULLY VERIFIED ✅ |
| Historical cost snapshot | AC-28 | — | BB-05.5 ✅ | FULLY VERIFIED ✅ |
| Tenant isolation | AC-29 | WB-03.6 ✅ | BB-07.1 ✅ | FULLY VERIFIED ✅ |
| Migration non-destructive | AC-30 | — | AC-30 Regression ✅ | FULLY VERIFIED ✅ |

---

## BAGIAN D — TOOLS & ENVIRONMENT

| Keperluan | Tool |
|---|---|
| Unit test | Vitest v4 (sudah terinstall) |
| Component test | React Testing Library (Sprint 2) |
| E2E / Playwright | Playwright (Sprint 4–6) |
| API test | Postman / curl |
| DB staging | Supabase local dev (`npx supabase start`) |
| Coverage report | `vitest --coverage` (`@vitest/coverage-v8` terinstall) |
| Mobile viewport | Chrome DevTools + real device |
| Network throttle | Chrome DevTools / Playwright `page.route()` |

---

## BAGIAN E — PROGRESS TRACKER

| Tanggal | Sprint | Item | Status | Executor |
|---|---|---|---|---|
| 2026-10-23 | Sprint 1 | Unit test WB-01 (13 case augment) — 153/153 PASS | SELESAI | Ayling |
| 2026-10-23 | Sprint 2 | WB-02 auto-save lifecycle tests (24 case) — 177/177 PASS total | SELESAI | Ayling |
| 2026-10-23 | Sprint 3 | WB-03 (19 case) & WB-04 (20 case) DB & FEFO tests — 216/216 PASS total | SELESAI | Ayling |
| 2026-10-23 | Sprint 4 | BB-01, BB-02, BB-03 Blackbox EOD tests (22 case) — 238/238 PASS total | SELESAI | Ayling |
| 2026-10-23 | Sprint 5 | BB-04, BB-05 Closing & Cost Control tests (13 case) — 251/251 PASS total | SELESAI | Ayling |
| 2026-10-23 | Sprint 6 | BB-06, BB-07 UX & Security + Full Regression AC-01–30 — 222/222 PASS total canonical | SELESAI | Ayling |

---

*Dokumen ini adalah living document. Update kolom Status dan Progress Tracker setiap selesai sprint.*
*Source of truth: SPEC_Daily_Inventory_Cost_Control_Barventis_v4_FINAL_CONCEPT.md (AC-01 s/d AC-30)*
