# Blueprint Arsitektur & Pengawasan Batasan (Isolation Governance): Smart Recipe Matching di PosUpload

**Author**: Ayling (Lead Autonomous Orchestrator) & Izumi (Architect) / Rafi  
**Status**: APPROVED DESIGN BLUEPRINT (Siap Diimplementasikan dengan Boundary Guard)  
**Dokumen Standar**: `agent_lean_prompt_v2.md` & `skills/barventis-architect/SKILL.md`  

---

## 1. Prinsip Pengawasan & Isolasi Ruang Lingkup (Strict Boundary Guard)

Agar fitur baru ini **TIDAK MENYENTUH ATAU MERUSAK** modul lain (Daily Inventory, Cost Control, Database Migrations, dll), ditetapkan aturan batas isolasi ketat (*Zero Blast Radius*):

```
+-----------------------------------------------------------------------------------+
| RUANG LINGKUP FITUR INI (IN SCOPE):                                               |
| 1. Utility murni string fuzzy matching: `src/utils/fuzzyMatch.js`                 |
| 2. File UI Upload POS saja: `src/pages/shared/PosUpload.jsx`                     |
| 3. Unit test mandiri: `src/utils/__tests__/fuzzyMatch.test.js`                    |
+-----------------------------------------------------------------------------------+
| DILARANG DISENTUH (OUT OF SCOPE / ISOLATED):                                      |
| ❌ TIDAK MENGUBAH `DailyInventory.jsx` (Form EOD & Autosave sudah stabil 100%)    |
| ❌ TIDAK MENGUBAH `CostControl.jsx` & formula HPP matematis                      |
| ❌ TIDAK MENGUBAH alur API backend di `api.js` atau migrasi Supabase              |
| ❌ TIDAK MENGUBAH CSS variables global di `index.css` atau routing di `App.jsx`   |
+-----------------------------------------------------------------------------------+
```

---

## 2. Arsitektur Komponen: `src/utils/fuzzyMatch.js`

Utility fungsi murni (*pure functions*) tanpa dependensi eksternal, berbobot < 3 KB:
1. **`sanitizeMenuName(str)`**:
   - Menghapus stopwords & noise: `(MINUMAN)`, `(Ice)`, `(Hot)`, `(add)`, `330ml`, `500ml`, `220ml`, spasi ganda, dan karakter non-alfanumerik.
2. **`calculateSimilarity(str1, str2)`**:
   - Menghitung kombinasi **Bigram Token Jaccard** (kemiripan kata) dan **Levenshtein Distance** (toleransi typo).
   - Menghasilkan skor desimal `0.0` s/d `1.0` ($0\% - 100\%$).
3. **`findBestRecipeMatch(posMenuName, recipeList, threshold = 0.65)`**:
   - Mencocokkan nama menu POS terhadap seluruh master resep & RTD beer.
   - Mengembalikan `{ match: RecipeObject, score: number, confidence: 'high' | 'medium' | 'none' }`.

---

## 3. Desain UI/UX Ergonomis di `PosUpload.jsx` (User-Friendly & Zero-Friction)

```mermaid
graph TD
    A[Upload File POS ESB] --> B[Sistem Deteksi Menu Missing]
    B --> C[fuzzyMatch Engine Eksekusi di Client < 10ms]
    
    C --> D[Header Action Bar Baru]
    D --> D1[Tombol Hijau: Terapkan Semua Saran Cocok >= 75%]
    D --> D2[Tombol Abu: Abaikan Semua Add-on Es Batu/Gratis]
    
    C --> E[Tabel Menu Missing]
    E --> E1[Nama Menu POS + Qty Terjual]
    E --> E2[Badge Rekomendasi Cerdas: misal 'Bir Bintang 330ml (94% Cocok)']
    E --> E3[1-Click Quick Chip: Klik untuk Terima Saran]
    E --> E4[Dropdown Manual Tetap Ada Jika Ingin Ubah]
```

### Elemen Visual yang Disediakan:
1. **Stat Banner Ringkas**:
   - *"Ditemukan 26 menu tanpa resep. 18 menu memiliki saran kemiripan tinggi."*
2. **Tombol Aksi Cepat (1-Click Batch)**:
   - `[ ✨ Terapkan Semua Saran Otomatis (18 Menu) ]` $\rightarrow$ Sekali klik, 18 menu langsung ter-map tanpa pusing!
   - `[ 🚫 Abaikan Semua Item Add-on / Gratis ]` $\rightarrow$ Es batu & teh gratis langsung ter-set "Abaikan".
3. **Quick Accept Chip**:
   - Di samping dropdown, jika ada saran cocok $\ge 70\%$, muncul chip hijau:
     `👉 Cocok: Bir Bintang 330ml (94%)`
   - Staf tinggal klik chip tersebut jika ingin memeriksa satu per satu secara instan.

---

## 4. Rencana Pengujian (Test & Verification Gate)

1. **Whitebox Unit Test (`fuzzyMatch.test.js`)**:
   - Uji typo: `Mango Yogur Smoothies` vs `Mango Yogurt Smoothies` $\rightarrow$ skor $\ge 90\%$.
   - Uji varian suhu: `Flavored Latte (Ice)` vs `Flavored Latte` $\rightarrow$ skor $\ge 90\%$.
   - Uji ukuran: `Bir Bintang 330` vs `Bir Bintang 330ml` $\rightarrow$ skor $\ge 90\%$.
   - Uji add-on: `Es Batu (add)` tidak salah mencocokkan ke `Espresso`.
2. **Blackbox Integration Check**:
   - Buka halaman Upload POS $\rightarrow$ load file ESB Agustus $\rightarrow$ verifikasi tombol auto-resolve berfungsi mulus dan tidak ada error console.
   - Jalankan `npm test` untuk memastikan 222 test yang ada tetap 100% PASS.
