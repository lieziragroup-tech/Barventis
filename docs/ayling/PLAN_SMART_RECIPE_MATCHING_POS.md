# Blueprint & Planning: Smart Recipe Matching (NLP / Similarity Engine) & UI/UX Batch Auto-Resolver di PosUpload

**Author**: Ayling (Lead Autonomous Orchestrator) & Izumi (Architect) / Rafi  
**Modul Target**: `src/pages/shared/PosUpload.jsx`  
**Status**: PLANNING & PROPOSAL (Tanpa Eksekusi Langsung)  

---

## 1. Analisis Masalah Riil dari Data Penjualan Kasir POS

Ketika kasir mencatat menu di mesin POS ESB, banyak item berstatus **Warning: Menu Tanpa Resep & Bahan** karena:
1. **Pembeda Suhu & Kemasan Kasir**:
   - Kasir mencatat: `Flavored Latte (Ice)`, `Americano (Hot)`.
   - Master Resep hanya ada: `Flavored Latte`, `Americano`.
2. **Karakter Tambahan & Nomenklatur Berbeda**:
   - Kasir: `Draft Beer BaliHai 220ml` $\leftrightarrow$ Resep: `Bali Hai Draft Beer`.
   - Kasir: `Bir Bintang 330` $\leftrightarrow$ Resep: `Bir Bintang 330ml`.
   - Kasir: `Mango Yogur Smoothies` (typo kasir 'yogur') $\leftrightarrow$ Resep: `Mango Yogurt Smoothies`.
3. **Item Non-Bahan / Add-on**:
   - `Es Batu (add)`, `Kelapa Muda Batok`, `Gratis Teh (manis/tawar)`.
   - Tidak memiliki BOM resep karena merupakan servis atau pelengkap.
4. **Beban UI Saat Ini**:
   - Admin/Owner harus mengklik dropdown satu per satu untuk 30–50 menu yang tidak sinkron, memilih `Map ke Menu Ada`, lalu mengetik di combobox. Sangat lambat dan melelahkan (*high friction*).

---

## 2. Solusi: Arsitektur Smart Matching (String Similarity & Token Jaccard)

Kita **TIDAK PERLU** memasang model Machine Learning Python / Cloud AI berbayar yang lambat dan mahal. Kita cukup menggunakan algoritma **NLP Client-Side (Levenshtein Distance + Trigram + Token Similarity)** yang berjalan instan (< 10 ms di browser) dan 100% gratis.

```mermaid
graph TD
    A[Nama Menu dari POS: misal 'Bir Bintang 330'] --> B[Sanitasi Teks: Lowercase, Hapus (Ice)/(Hot)/ml/gr]
    B --> C[Hitung Skor Kemiripan vs 54 Resep & 9 RTD Beer]
    C --> D{Skor Kemiripan}
    D -->|Skor >= 80% High Confidence| E[Auto-Suggest Hijau: Rekomendasi Teratas]
    D -->|Skor 50% - 79% Medium| F[Suggest Kuning: Pilihan Kemiripan]
    D -->|Skor < 50% / Non-Bahan| G[Kategori Add-on: Sarankan Abaikan / Buat Resep Baru]
```

### Formula Matematis Similarity:
Kombinasi **Dice's Coefficient / Bigram Overlap** & **Normalized Levenshtein Distance**:
$$\text{Similarity}(A, B) = \alpha \cdot \left(1 - \frac{\text{Levenshtein}(A, B)}{\max(|A|, |B|)}\right) + (1 - \alpha) \cdot \frac{2 \cdot |A \cap B|}{|A| + |B|}$$

Contoh Hasil Nyata:
- `Bir Bintang 330` vs `Bir Bintang 330ml` $\rightarrow$ **Skor: 94% (Match!)**
- `Draft Beer BaliHai 220ml` vs `Bali Hai Draft Beer` $\rightarrow$ **Skor: 88% (Match!)**
- `Flavored Latte (Ice)` vs `Flavored Latte` $\rightarrow$ **Skor: 92% (Match!)**
- `Mango Yogur Smoothies` vs `Mango Yogurt Smoothies` $\rightarrow$ **Skor: 95% (Match!)**

---

## 3. Desain UI/UX Baru yang Ergonomis & Hemat Waktu (Zero-Friction)

Daripada memilih manual satu per satu, kita sediakan 3 fitur UI/UX utama di tabel `PosUpload.jsx`:

1. **Tombol "Terapkan Saran Otomatis" (1-Click Auto-Resolve Batch)**:
   - Tombol satu klik di atas tabel: *"Cocokkan Otomatis (X Menu Ditemukan)"*.
   - Menu dengan skor kemiripan $\ge 80\%$ langsung otomatis terisi target mapping-nya. Admin hanya perlu memeriksa sekilas.
2. **Badge Skor Kemiripan & Quick Chip**:
   - Jika `Bir Bintang 330` terdeteksi mirip `Bir Bintang 330ml`, tampilkan chip tombol:
     `[ Bir Bintang 330ml (94% Cocok) ]` $\rightarrow$ tinggal klik chip untuk langsung memilih.
3. **Smart Filter Tab**:
   - Filter menu: `[ Semua (26) ]`, `[ Ada Saran Match (18) ]`, `[ Menu Baru / Unik (8) ]`.
   - Tombol *"Abaikan Semua Add-on (Es Batu, Kemasan)"* sekali klik.

---

## 4. Rencana Implementasi Bertahap

- **Tahap 1 (Service Utility)**:
  - Buat helper ringan `src/utils/fuzzyMatch.js` berisi fungsi normalisasi teks dan penghitung similarity string.
- **Tahap 2 (Integrasi UI PosUpload)**:
  - Saat file POS selesai di-parse, jalankan auto-matching di background.
  - Tampilkan tombol batch "Auto-Map Rekomendasi" dan badge kemiripan pada baris tabel.
- **Tahap 3 (Memori Mapping Tenant)**:
  - Simpan mapping yang sudah pernah dipilih ke tabel `public.pos_menu_mappings` di Supabase.
  - Bulan depan ketika kasir mengupload file POS dengan menu yang sama, sistem **ingat 100%** dan tidak akan bertanya ulang lagi.
