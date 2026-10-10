# PRD Phase 2: System Hardening & Optimization
**Status:** DRAFT
**Prioritas:** P0 (Kritis untuk Skalabilitas)

## 1. Ringkasan
Fokus rilis ini murni pada stabilitas, kecepatan, dan perlindungan dari *human/network error*. Tidak ada penambahan modul bisnis baru; yang dilakukan adalah pengubahan cara kerja mesin di balik layar.

## 2. Fitur & Spesifikasi Teknis

### Epik 1: Backend Hardening (The Math Lock)
- **Kebutuhan:** Memutus peran *Frontend* dari menghitung kerugian (*Cost Loss*) dan *Variance*.
- **Spesifikasi:** 
  - Buat *Trigger Function* di PostgreSQL bernama `trg_calculate_variance_and_cost`.
  - Fungsi ini aktif `BEFORE INSERT OR UPDATE` pada tabel `daily_inventory_items` dan `stock_adjustments`.
  - Fungsi ini akan otomatis mengambil *Harga Rata-Rata (Avg Cost)* dari Master Bahan, lalu mengalikannya dengan fisik terbuang.

### Epik 2: UI Virtualization (The Lag Killer)
- **Kebutuhan:** *Form* Daily Inventory yang menampung ratusan bahan harus di-*scroll* secara halus (60fps) di perangkat *mobile*/tablet.
- **Spesifikasi:**
  - Implementasi *virtual scroll* (hanya merender 15-20 DOM node aktif).
  - Integrasi dengan fungsi pecarian (*fast text filtering*).

### Epik 3: Offline Drafting (The Iron Grip)
- **Kebutuhan:** Mencegah jerih payah Barista (mencatat ratusan item selama 30 menit) hilang karena sesi habis atau internet mati.
- **Spesifikasi:**
  - Tiap 3 detik (*debounce*), *state* input *inventory* disalin ke penyimpanan *IndexedDB* lokal.
  - Saat *submit*, jika `navigator.onLine === false`, beri notifikasi visual dan antre *request* tersebut.

## 3. Scope Penolakan (Out of Scope)
- Membangun UI *Progressive Web App* (PWA) penuh untuk keseluruhan *dashboard*.
- Migrasi *database* (Tetap menggunakan PostgreSQL di Supabase).
