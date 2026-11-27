# Panduan Admin: Template & Pengaturan Perusahaan

Menu **Template & Pengaturan** hanya muncul untuk **Admin perusahaan** (dan Super Admin setelah memilih perusahaan).
Semua perubahan berlaku **hanya untuk perusahaan Anda** dan dipakai otomatis oleh Penawaran dan Laporan Kunjungan.

## Alur singkat
1. Buka **Template & Pengaturan** di sidebar.
2. Isi/ubah bagian di tab, lihat hasilnya lewat **Pratinjau PDF** (belum perlu disimpan).
3. Klik **Simpan**. Dokumen berikutnya langsung memakai template baru.

## Tab
| Tab | Yang diatur |
|---|---|
| **Identitas & Kop** | Nama, alamat, kontak, kota penerbit surat, prefix nomor surat; kop (teks atau gambar); footer kustom; logo asosiasi di footer (maks. 3) |
| **Surat Penawaran** | Masa berlaku, salam penutup, kontak di bagian Penutup, tanda tangan/stempel bawaan |
| **Anti Rayap** | Garansi (tahun, catatan), skema pembayaran, daftar pengontrolan, catatan pajak |
| **Pest & Rodent** | Isi program pest/rodent (teks berformat sederhana, lihat di bawah) dan sistem pembayaran |
| **Laporan Kunjungan** | Judul dokumen, jenis pekerjaan, saran bawaan, tampil/sembunyikan baris "created by" |

## Format teks program (Pest & Rodent)
```
# I. PEST CONTROL            judul          #_ Judul   judul bergaris bawah
## Hama yang dikendalikan    sub-judul      ### Teks   tebal-miring
- butir daftar
-2 U L V | Thermal Fogger | B & G     daftar 2 kolom
@Nyamuk | nyamuk rumah, nyamuk hitam  baris "label : isi"   (@@ = tanpa tanda "-")
(baris kosong = jarak)   --- = halaman baru
Tag: <b>tebal</b> <i>miring</i> <u>garis bawah</u>
Placeholder: {company} = nama perusahaan Anda, {klien} = nama klien pada penawaran
```
Tombol **Bawaan** mengembalikan satu program ke teks standar.

## Catatan
- Gambar: PNG/JPG/WEBP (SVG tidak diterima). Sistem memperkecil otomatis; gunakan PNG transparan untuk logo/stempel.
- Nilai yang Anda isi di form penawaran (mis. garansi 2 tahun) **selalu menang** atas template.
- Perusahaan yang belum menyimpan apa pun memakai tampilan bawaan netral. Isi identitas dulu agar kop/footer lengkap.
- Hanya Admin perusahaan yang bisa menyimpan; role lain hanya membaca (ditegakkan di database, bukan hanya di tampilan).
