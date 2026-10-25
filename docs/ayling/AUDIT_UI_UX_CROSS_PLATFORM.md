# Laporan Audit UI/UX Cross-Platform: Web, Tablet, dan Mobile (Barventis ERP)

**Auditor**: Ayling (UI/UX & Specialist Orchestrator) / Rafi  
**Prinsip Audit**: Human-Centered Design, Antislop Standard (Mathematical Spacing, Zero Friction, Responsive Tap Target >= 44px, Zero Technique Without Purpose).  
**Perangkat Target**: 
1. **Desktop/Web (>= 1024px)**: Monitor kasir & office manager.
2. **Tablet (768px - 1023px)**: iPad/Android Tablet di bar table & kitchen station.
3. **Mobile (< 768px)**: Smartphone Android/iOS untuk operasional cepat barista & staff lapangan.

---

## 1. Temuan Kritis (Critical Friction Points)

### 🔴 Masalah 1: Ketiadaan `inputMode="decimal"` pada Input Angka Form EOD
- **Kondisi Saat Ini**: Input `IN (Total)` dan `Pemakaian (OUT)` menggunakan `<input type="number" ... />` tanpa atribut `inputMode="decimal"` atau `pattern="[0-9]*"`.
- **Dampak di Mobile/Tablet**: Keyboard default di iPhone/Android sering memunculkan keyboard teks penuh dengan deretan angka kecil di atas, bukan numeric keypad besar. Staf barista yang mengetik cepat saat closing malam harus beralih mode keyboard secara manual.
- **Rekomendasi**: Tambahkan `inputMode="decimal"` pada semua input numerik operasional.

### 🔴 Masalah 2: Hilangnya Kolom Sticky Header & Kolom Bahan Baku Saat Horisontal Scroll
- **Kondisi Saat Ini**: Tabel EOD di desktop/tablet memiliki `minWidth: 1120px` atau `1240px`. Ketika diakses di Tablet atau Mobile layar kecil, pengguna harus scroll ke kanan hingga 800px.
- **Dampak di Mobile/Tablet**: Ketika scroll ke kanan untuk melihat kolom "Stok Akhir" atau "Terpakai", nama bahan baku di kolom paling kiri menghilang dari pandangan. Barista tidak tahu baris mana yang sedang mereka lihat (*lost in context*).
- **Rekomendasi**:
  1. Buat kolom pertama (`Bahan Baku`) memiliki class `sticky left-0 bg-[var(--bg-primary)] z-10 shadow-sm`.
  2. Buat `thead` sticky top (`sticky top-0 z-20`) agar judul kolom tetap terlihat saat scroll ke bawah.

### 🟠 Masalah 3: Ukuran Tap Target Mobile pada Tombol Aksi (< 44px)
- **Kondisi Saat Ini**: Tombol `+ Catat` di kolom Waste berukuran font `text-[11px]` dengan padding tipis `px-2 py-1` (tinggi total ~24px).
- **Dampak di Mobile**: Jari staf mudah salah pencet (misfire) atau menekan baris tabel di dekatnya. Standar Apple HIG dan Material Design mewajibkan tap target minimal 44x44px.
- **Rekomendasi**: Tambahkan pseudo padding / minimum tap target wrapper minimal `h-9` atau `h-10` di mobile mode.

### 🟠 Masalah 4: Auto-Zoom iOS saat Focus Input
- **Kondisi Saat Ini**: Class `text-sm` di input tabel menghasilkan font-size `14px`. Di iOS Safari, setiap input `< 16px` memicu browser auto-zoom ke elemen tersebut, merusak layout viewport tabel.
- **Rekomendasi**: Terapkan rule media query iOS input font 16px khusus mobile atau `touch-action: manipulation` agar viewport tidak meloncat-loncat.

### 🟡 Masalah 5: Action Bar EOD (Kunci Closing & Simpan) Terkubur di Atas Tabel
- **Kondisi Saat Ini**: Tombol `Simpan Progress (Draf)` dan `Kunci Closing EOD` berada di bagian atas halaman.
- **Dampak di Mobile/Tablet**: Saat barista scroll sampai ke item ke-25 atau ke-50 di bawah, mereka harus scroll kembali jauh ke paling atas hanya untuk menekan tombol "Simpan" atau "Kunci".
- **Rekomendasi**: Sediakan floating bar ringkas di bawah layar (*Sticky Bottom Action Bar*) khusus untuk status Auto-Save dan tombol aksi cepat saat scroll ke bawah.

---

## 2. Rencana Perbaikan Bertahap (Action Plan)

1. **Phase 1: Input Ergonomics (Cepat & Berdampak Tinggi)**
   - Pasang `inputMode="decimal"` dan auto-select saat focus di seluruh input numerik EOD.
   - Atur minimum height tap target tombol modal & pagination agar nyaman disentuh jari.
2. **Phase 2: Table Usability (Tablet & Mobile)**
   - Sticky First Column (Nama Bahan Baku) + Sticky Table Header.
   - Indikator visual shadow saat tabel di-scroll horizontal.
3. **Phase 3: Floating Footer Mobile**
   - Bar bawah mengambang yang menampilkan status draft auto-save dan tombol simpan draf saat pengguna berada di posisi tengah/bawah tabel.
