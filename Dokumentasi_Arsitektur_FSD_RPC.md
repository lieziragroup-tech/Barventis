# Dokumentasi Sistem FieldWork-V2

> **Catatan pembaruan:** arsitektur autentikasi, isolasi perusahaan (RLS), RPC berotorisasi, dan sistem template dokumen telah diperbarui — lihat [docs/ARSITEKTUR.md](docs/ARSITEKTUR.md). Bagian di bawah (FSD, UX) tetap berlaku.

## 1. Arsitektur Clean Architecture (Feature-Sliced Design / FSD)

Aplikasi `FieldWork-V2` kini menggunakan standar arsitektur **Feature-Sliced Design (FSD)** untuk memastikan skalabilitas dan isolasi dependensi yang baik. Struktur folder telah diubah sebagai berikut:

*   **`src/app/`**: Lapisan teratas yang mengatur inisialisasi aplikasi (contoh: `App.tsx`, `main.tsx`, file CSS global, dan *providers* seperti `AuthContext`).
*   **`src/pages/`**: Komponen halaman utama (contoh: `DashboardPage`, `QuotationPage`). Halaman di sini tidak mengandung logika bisnis yang dalam, melainkan menyatukan widget dan *features*.
*   **`src/widgets/`**: Blok UI kompleks yang mandiri dan bisa digunakan ulang di berbagai halaman (contoh: `AdminDashboard`, `CreateSPKModal`, `LocationTracker`).
*   **`src/features/`**: (Disediakan untuk) Modul yang membawa nilai/logika bisnis spesifik pengguna, seperti autentikasi (login), sinkronisasi data *offline queue*, dsb.
*   **`src/entities/`**: Model data dasar, tipe TypeScript (`types.ts`), dan *state* fundamental (contoh: *store* konfigurasi).
*   **`src/shared/`**: Komponen paling primitif yang tidak terikat domain spesifik. Mencakup:
    *   `shared/ui/`: Komponen UI standar (Shadcn - Button, Input, Dialog, dll).
    *   `shared/api/`: Fungsi-fungsi pemanggilan database (contoh: `supabase.ts`, `spkService.ts`, `inventoryService.ts`).
    *   `shared/lib/` & `shared/utils/`: Utilitas murni dan konfigurasi *library* eksternal.

**Aturan Emas FSD**: Dependensi hanya boleh mengarah ke dalam / ke bawah. Lapisan `shared/` tidak boleh memanggil `widgets/` atau `pages/`.

---

## 2. Implementasi Shadcn UI & Validasi Form (Zod)

Standar *Enterprise* diterapkan pada komponen UI dan form. 
*   **Shadcn UI**: Digunakan secara ekstensif untuk komponen seperti `AlertDialog`, `Button`, dll., yang diekstrak langsung ke `src/shared/ui/`.
*   **Form Validation**: Modul formulir seperti `CreateSPKModal` telah direfaktor menggunakan **`react-hook-form`** dikombinasikan dengan **`zod`**.
*   **UX Validasi**: Saat pengguna mencoba melakukan *submit* tanpa mengisi kolom yang wajib, formulir secara *native* akan memblokir pengiriman (*Network Request* dihentikan sebelum terjadi) dan akan merender pesan teks *error* warna merah seketika (*real-time*) di bawah setiap input.

---

## 3. Atomic Database Transactions (Supabase RPC)

Untuk mencegah *race conditions* dan inkonsistensi data ketika sistem inventaris berjalan, manipulasi inventaris dan persetujuan (approval) status telah dipindahkan dari sisi *frontend* klien ke *backend* dalam wujud **Stored Procedures (RPC)**.

### Konsep Keamanan Row-Level Locking (ACID)
Setiap permintaan perubahan stok atau status SPK/Laporan akan mengeksekusi RPC di Supabase yang mengimplementasikan `FOR UPDATE`.
*   Jika dua koneksi dari PWA (*Offline Queue* sinkronisasi beruntun) mengenai server secara bersamaan, transaksi pertama akan mengunci baris data (contoh tabel `items`).
*   Transaksi kedua akan dipaksa menunggu hingga transaksi pertama selesai.
*   Jika perhitungan stok tidak mencukupi, sistem akan otomatis melakukan lempar *exception*, menghasilkan *HTTP Error* yang ditangani dengan elegan di frontend, bukan nilai stok negatif (integritas 100% aman).

RPC yang diimplementasikan:
1.  **`process_inventory_mutation`**: Menambah/mengurangi *stock* secara aman (kalkulasi server-side) dan menyisipkan riwayat pergerakan ke `inventory_logs` dalam satu nafas (*transaction block*).
2.  **`process_status_approval`**: Melakukan modifikasi terproteksi (*lock*) pada tabel laporan atau entitas bisnis lainnya untuk pembaruan *status* serta catatan tambahan.

---

## 4. Keamanan Aksi Destruktif (AlertDialog)
Tindakan dengan impak permanen seperti menghapus akun pengguna (di *Admin Dashboard*) kini diikat dengan pop-up khusus berjenis `AlertDialog`. Berbeda dengan `window.confirm` biasa, `AlertDialog` mengunci layar, mengharuskan pengguna membaca konsekuensi, dan secara spesifik menekan tombol peringatan (misal "Ya, Lanjutkan") sebelum fungsi penghapusan dijalankan. Ini mencegah penghapusan insidental (*accidental misclick*).

---

## 5. Adaptive UX & Mobile-First Interface (Standard Native)

Sistem telah mengadopsi standar antarmuka mutakhir (*Adaptive UX*) yang memberikan pengalaman sekelas aplikasi *Native* (iOS/Android) walau diakses melalui *browser*. Fitur-fitur ini dikelola oleh cangkang komponen `AppLayout.tsx`.

### A. Dynamic Island Navigation (Mobile)
Berfungsi sebagai substitusi dari menu *hamburger* konvensional. Di layar HP, menu navigasi akan bersembunyi di dalam sebuah kapsul melayang (*Dynamic Island*) di pojok kanan bawah layar (*Thumb-Zone*). 
- **Fungsi:** Menghemat ruang kerja (layar HP sangat sempit untuk tabel data) dan mempermudah navigasi dengan satu tangan.
- **Animasi:** Menggunakan *Framer Motion* untuk memberikan transisi mulus dan membal (*spring physics*) saat kapsul ditekan.

### B. Edge-Swipe Gesture Engine
Pengguna *mobile* dan *tablet* tidak lagi harus menekan ikon menu untuk membuka *Sidebar*.
- Telah ditanamkan *Custom Touch Listener* yang memantau interaksi jari pengguna.
- **Aksi:** Pengguna dapat "menggesek" (*swipe*) jari dari ujung kiri layar ke arah tengah untuk menarik *Sidebar* keluar. Fitur ini secara otomatis dinonaktifkan jika pengguna sedang menggulir (*scroll*) tabel secara horizontal untuk menghindari konflik *gesture*.

### C. Smart Responsive Sidebar
*Sidebar* dirancang responsif sesuai dengan ukuran layar perangkat:
- **Desktop (>1024px):** Terbuka penuh (*Expanded*).
- **Tablet:** Menyusut menjadi *Mini-Sidebar* (hanya menampilkan ikon). Jika pengguna mengarahkan *mouse* (Hover), sidebar akan mengembang (*Floating Expand*) menimpa konten tanpa merusak/menggeser tata letak tabel di sebelahnya.
- **Mobile (<768px):** Tersembunyi seutuhnya dan hanya muncul via *Edge-Swipe* atau tombol menu.

---

## 6. Human-Centered Copywriting (Usability)

Bahasa sistem (terutama peringatan dan validasi) telah dirombak dari bahasa pemrograman kaku (*robotic/technical*) menjadi bahasa yang memandu pengguna secara natural. Hal ini memangkas *learning curve* bagi staf lapangan yang mungkin tidak terbiasa dengan bahasa teknis.

**Contoh Perbandingan Validasi pada `CreateSPKModal`:**
- ❌ *Legacy:* `"quotationId is required"`
  ✅ *Baru:* **"⚠️ Dokumen penawaran belum dipilih. Silakan klik salah satu penawaran di atas."**
- ❌ *Legacy:* `"technicianId cannot be null"`
  ✅ *Baru:* **"⚠️ Teknisi belum ditugaskan. Mohon pilih salah satu teknisi untuk pekerjaan ini."**
- ❌ *Legacy:* `"scheduleDate error"`
  ✅ *Baru:* **"⚠️ Tanggal pengerjaan wajib diisi. Kapan teknisi harus berangkat?"**

Pesan state-kosong (*Empty State*) juga diubah menjadi lebih apresiatif, contohnya: **"Bagus! Saat ini tidak ada penawaran baru yang menunggu untuk dijadikan SPK."** dibandingkan hanya menuliskan *"Data tidak ditemukan"*.
