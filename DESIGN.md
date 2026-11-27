# DESIGN.md — Fieldwork Platform Design System (Redesign Edition)

> **Single Source of Truth (SSOT) untuk Desain Antarmuka, Token Visual, Tipografi, Komponen, dan Interaksi Platform PT Guci Emas Pratama.**  
> *Sintesis Elegan: Referensi Desain Modern (Redesign Lite) $\times$ Sistem Animasi Responsif Framer Motion Eksisting.*  
> *Kepatuhan Mutlak: Strict Anti-AI Slop Directive (`antislop.md`) — Zero Clutter, Zero Nested Cards, dan Kontras Terverifikasi WCAG AA.*

---

## 🧭 1. Identitas, Karakter & Filosofi Visual

Fieldwork Platform adalah ruang kerja digital enterprise untuk manajemen komersial dan operasional lapangan jasa penyehatan lingkungan (*pest & termite control*). Karakter desain yang diusung adalah:
- **Kredibel & Tenang (Mature Enterprise):** Menggantikan kesan "AI generik" atau warna biru SaaS template dengan palet **Deep Pine Green** (`#245c45`), kanvas off-white hangat (`#f6f8f6`), dan sidebar hijau hutan pekat (`#173f30`).
- **Tujuan Sebelum Teknik (Purpose Over Technique):** Setiap border, badge, dan garis aksen wajib memiliki fungsi hierarki informasi yang jelas, bukan sekadar hiasan.
- **Hierarki Tajam & Bernapas Lega:** Mengeliminasi tumpukan kartu bertingkat ganda (*no nested cards*), memberikan jarak bernapas yang lega (padding 16px–24px), dan tipografi berjarak rapat (*tight letter-spacing*).
- **Interaksi Taktil Nyata (60 FPS Motion):** Menggunakan animasi transisi bertahap (*staggered animations*) dan umpan balik tombol taktil (*button tactile feedback*) yang halus dan responsif.

---

## 🎨 2. Token Warna & Sistem Semantik (Color Tokens)

### A. Tema Terang (Light Mode — Default Bawaan)
```css
:root {
  /* Surfaces & Canvas */
  --canvas: #f6f8f6;            /* Latar belakang utama aplikasi (Warm Pine Off-White) */
  --surface: #ffffff;           /* Permukaan kartu, modal, dan tabel */
  --subtle: #eff3f0;            /* Background elemen sekunder / input background */
  --border: #e1e8e2;            /* Garis pembatas 1px yang tenang dan rapi */
  --border-focus: #245c45;      /* Border saat form fokus */

  /* Brand Colors */
  --green: #245c45;             /* Deep Pine Green (Brand Utama) */
  --green-hover: #1d4b38;       /* Hover state tombol primer */
  --green-soft: #e8f1eb;        /* Aksen lembut untuk badge aktif dan seleksi */
  --sidebar-bg: #173f30;        /* Deep Forest Green (Sidebar kontras tinggi) */
  --sidebar-text: #c9d8cf;      /* Teks menu sidebar */
  --sidebar-active-bg: rgba(255, 255, 255, 0.10);
  --sidebar-indicator: #a9c9b4; /* Garis vertikal penanda tab aktif */

  /* Text & Typography */
  --text: #17231c;              /* Deep Pine Charcoal (Teks utama, nyaman dibaca) */
  --secondary: #66736b;         /* Abu-abu lumut (Sub-judul & metadata, kontras 4.8:1) */
  --muted: #87928b;             /* Keterangan sekunder & unit ukuran */

  /* Status Semantik Fungsional */
  --success: #257a4b;           /* Status: Selesai / Valid / Sah */
  --success-bg: #e8f4ec;
  --warning: #a96b16;           /* Status: Perlu Perhatian / Segera Habis */
  --warning-bg: #fff4df;
  --danger: #b54141;            /* Status: Anomali Lokasi / Terlewat / Batal */
  --danger-bg: #fcecec;
  --info: #356c91;              /* Status: Sedang Dikerjakan / Siap */
  --info-bg: #eaf2f8;
  --reviewed: #287267;          /* Status: Tervalidasi Supervisor */
  --reviewed-bg: #e7f3f0;
}
```

### B. Tema Gelap (Dark Mode — Matte Slate Pine)
```css
html.dark, [data-theme="dark"] {
  --canvas: #0f1411;
  --surface: #181f1b;
  --subtle: #212b25;
  --border: #29362e;
  --border-focus: #4e8f73;

  --green: #4e8f73;
  --green-hover: #3d755d;
  --green-soft: rgba(78, 143, 115, 0.16);
  --sidebar-bg: #121814;
  --sidebar-text: #a1b5a9;

  --text: #f0f4f1;
  --secondary: #97a89d;
  --muted: #6b7a70;
}
```

---

## 📐 3. Skala Tipografi & Hirarki Spasi

| Skala / Elemen | Ukuran Font | Bobot (*Weight*) | Karakter (*Letter-Spacing*) | Penggunaan |
| :--- | :---: | :---: | :---: | :--- |
| **Page Title (H1)** | `28px` (Desktop) / `22px` (Mobile) | Bold (700) | `-0.03em` | Judul utama halaman di Header |
| **Panel Title (H2)** | `17px` | Bold (700) | `-0.015em` | Judul seksi kartu panel |
| **Section Head (H3)** | `14px` | SemiBold (600) | `normal` | Sub-seksi tabel / modal |
| **Body Text** | `13px - 14px` | Regular (400) | `normal` | Paragraf penjelasan & form label |
| **Table Data** | `13px` | Medium (500) | `normal` | Nilai baris tabel padat |
| **Label / Metadata** | `10px - 11px` | SemiBold (600) | `+0.04em` (Uppercase) | Label header tabel, badge, unit ukuran |
| **Financial / GPS** | `13px - 28px` | Bold (700) | Monospace Tabular | Angka rupiah, koordinat Lat/Lng, durasi |

### Standar Spasi & Breathing Room (C-1 / WB-09):
- **Card Padding:** `p-4` (`16px`) hingga `p-5` (`20px`) pada desktop; `14px` pada mobile.
- **Form Gap:** `gap-3` (`12px`) untuk input sejajar, `mb-4` (`16px`) antar-blok form.
- **Mobile Tap Target:** Minimal `44px` (input & button) untuk kemudahan operasional teknisi lapangan.

---

## 🧩 4. Anatomi Komponen Standar

### A. Kartu Metrik (KPI Card with Top Accent)
- **Struktur:** Kartu latar putih `#ffffff`, radius `12px`, border tipis `1px solid var(--border)`.
- **Garis Aksen Fungsional (Top Accent 2px):**
  - Siap / Berlangsung: `border-top: 2px solid #7295ab`
  - Selesai / Lunas: `border-top: 2px solid #6aa07e`
  - Anomali / Perlu Cek: `border-top: 2px solid #c87575`
- **Isi:** Label 11px abu-abu, angka besar `24px - 28px font-bold font-mono tabular-nums`, dan catatan status kecil.

### B. Navigasi Sidebar (Deep Forest Rail & Drawer)
- **Visual:** Background hijau hutan `#173f30`, teks `#c9d8cf`, hover `#ffffff` dengan background `rgba(255,255,255,0.08)`.
- **Indikator Aktif:** Garis vertikal lembut `#a9c9b4` di sisi kiri (`w-1 h-5 rounded-r-full`) + pill highlight halus.
- **Interaksi:** Rail `56px` melebar ke `252px` saat hover di desktop (bisa di-pin stay open); drawer hamburger di tablet/mobile.

### C. Halaman Login (Editorial Split 2-Kolom)
- **Desktop (>= 1024px):** Split grid 45% : 55%.
  - Kolom Kiri: Panel brand hijau pekat dengan aksen lingkaran konsentris elegan, logo resmi, headline nilai bisnis, dan catatan kepercayaan (*trust note*).
  - Kolom Kanan: Panel putih bersih berisi form login, tautan aktivasi token, dan grid tombol 1-klik akun demo perusahaan.
- **Mobile (< 1024px):** Tampilan bertumpuk bersih dengan logo di atas dan form terpusat.

### D. Tabel Data & Responsif Kartu Mobile
- **Desktop:** Header tabel abu-abu netral `#f8faf8` dengan teks 10px uppercase, padding 12px 16px, efek hover baris `#fbfcfb`.
- **Mobile (< 768px):** Otomatis berubah menjadi kartu ringkas (*Compact Cards*) yang menampilkan nama proyek, status, tanggal, dan tombol aksi tanpa geser horizontal (*no horizontal overflow*).

### E. Tanda Tangan Ganda (Dual Signatures Pad)
- Dua kotak canvas berdampingan:
  1. *Petugas Teknisi*: Mengesahkan perlakuan fisik telah sesuai SOP.
  2. *Pihak Pelanggan*: Mengesahkan penerimaan hasil kerja di lokasi.
- Garis putus-putus tipis saat kosong, berubah menjadi garis hijau solid saat terisi.

---

## ⚡ 5. Sistem Animasi & Interaksi Taktil (60 FPS Motion)

Platform memadukan sistem animasi interaktif yang halus:
1. **Button Tactile:**
   ```css
   .btn-tactile:active:not(:disabled) {
     transform: scale(0.97) translateY(1px);
     transition: transform 0.1s ease-out;
   }
   ```
2. **Staggered Row Entrance:**
   ```css
   .row-fade-in { animation: rowFadeIn 0.22s cubic-bezier(0.4, 0, 0.2, 1) backwards; }
   .row-fade-in:nth-child(1) { animation-delay: 0.02s; }
   .row-fade-in:nth-child(2) { animation-delay: 0.04s; }
   /* ... berurutan hingga child 10 */
   ```
3. **Page & Section Fade In:**
   ```css
   @keyframes pageContentIn {
     from { opacity: 0; transform: translateY(6px); }
     to { opacity: 1; transform: translateY(0); }
   }
   ```
4. **Modal Spring:** Transisi scale `0.97` ke `1.00` dengan timing `cubic-bezier(0.16, 1, 0.3, 1)`.
5. **Reduced Motion:** Otomatis mematikan animasi saat pengguna mengaktifkan preferensi OS `prefers-reduced-motion: reduce`.

---

## 🚫 6. Aturan Kepatuhan Anti-AI Slop (`antislop.md`)

1. **Eliminasi Ikon Mubazir:** Tidak menaruh ikon di depan setiap kata atau baris data. Ikon hanya digunakan untuk navigasi utama dan tombol aksi.
2. **Zero Nested Cards:** Hindari membungkus kartu di dalam kartu yang berada di dalam kartu lagi. Gunakan garis pemisah tipis `border-t border-[var(--border)]` atau jarak spasi.
3. **Bahasa Operasional Lugas:** Hindari jargon marketing palsu seperti *"Revolutionary"*, *"AI-Powered Magic"*, atau *"Seamless Next-Gen"*. Gunakan istilah bisnis nyata: *"Penugasan SPK"*, *"Laporan Lapangan"*, *"Verifikasi Geofence"*.
4. **Resilience & State:** Setiap komponen harus memiliki tampilan yang rapi pada kondisi kosong (*empty state*), proses memuat (*skeleton loader*), dan gagal (*error recovery banner*).
