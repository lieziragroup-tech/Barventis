/**
 * Render contoh "Laporan Kunjungan" (data dari contoh RS Permata Sarana Husada).
 * Opsional: SAMPLE_PHOTOS_DIR=<folder berisi f-000.jpg ... f-005.jpg>. Tanpa itu, foto tampil sebagai placeholder.
 * Jalankan: scripts/build-run.sh scripts/render-visit-sample.ts
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { generateVisitReportPDF } from '../src/shared/lib/visitReportPdf';
import type { Letterhead } from '../src/shared/lib/quotationLetterPdf';

const OUT = process.env.PDF_OUT ?? './out/pdf-samples';
mkdirSync(OUT, { recursive: true });

// Tenant lain (bukan Guci): kop teks + footer dari company_settings.
const SBI: Letterhead = {
  companyName: 'PT. SARANA BUMI INDONESIA',
  kota: 'Depok',
  brandName: 'PT. SARANA BUMI INDONESIA',
  footerLines: ['Head Office : Jalan Tole Iskandar No. 41 Sukmajaya ,Kota Depok, Jawa Barat.'],
};

const LOKASI = 'Halaman, Parkiran | Loby Area | Koridor, Lantai | Toilet | Ruang Office, Meeting | Pantry, Kicthen | Lobby | Ruang Public | Workshop | Kamar | Gudang';
const f = (hama: string, penanganan: string, notes: string) => ({ hama, quantity: 0, penanganan, lokasi: LOKASI, notes });

const dir = process.env.SAMPLE_PHOTOS_DIR;
const photos = Array.from({ length: 6 }, (_, i) => {
  const p = dir && `${dir}/f-00${i}.jpg`; // gunakan JPEG berukuran wajar (≤1280px), seperti yang dilakukan aplikasi
  return { dataUrl: p && existsSync(p) ? `data:image/jpeg;base64,${readFileSync(p).toString('base64')}` : undefined };
});

const blob = generateVisitReportPDF({
  letterhead: SBI,
  idCustomer: 'cust010',
  customerName: 'RS PERMATA SARANA HUSADA PAMULANG',
  kategori: '',
  alamat: 'Jl. Pamulang Permai 1 No.1-3 Blok D3 Pamulang Bar. Kec. Pamulang Kota Tangerang Selatan Banten 15417',
  tanggal: new Date('2026-08-23T04:27:00Z'),
  petugas: 'ganang agista sinada',
  jenisPekerjaan: 'Treatment',
  findings: [
    f('Kecoa', 'Cold Fog | Lainnya', 'hasil tidak ditemukan adanya indikasi pest kecoa pada saat dilakukan monitoring dan treatment coldfog pada area dalam .'),
    f('Lalat', 'Cold Fog | Lainnya', 'hasil tidak ditemukan adanya indikasi pest lalat pada saat dilakukan monitoring dan treatment coldfog pada area dalam .'),
    f('Semut', 'Cold Fog | Lainnya', 'hasil tidak ditemukan adanya indikasi pest semut pada saat dilakukan monitoring dan treatment coldfog pada area dalam .'),
    f('Tikus', 'Trapping | Lainnya', 'hasil tidak ditemukan adanya indikasi pest tikus yang terjerat pada saat dilakukan monitoring pada area dalam .'),
    f('Nyamuk', 'Cold Fog | Lainnya', 'hasil tidak ditemukan adanya indikasi pest nyamuk pada saat dilakukan monitoring dan treatment coldfog pada area dalam .'),
  ],
  customerNama: 'pak Muhaimi scurity',
  photos,
  createdBy: 'ganang agista sinada',
  createdAt: new Date('2026-08-23T04:27:08Z'),
});
writeFileSync(`${OUT}/Laporan_Kunjungan_RS_Permata_Pamulang.pdf`, Buffer.from(await blob.arrayBuffer()));
console.log('ok Laporan_Kunjungan_RS_Permata_Pamulang');
