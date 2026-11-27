/**
 * Dokumen CONTOH bernilai netral untuk pratinjau template. Isinya sengaja bukan data perusahaan mana pun —
 * yang berbeda antar perusahaan hanyalah kop, footer, dan teks template yang mereka atur sendiri.
 */
import type { QuotationPDFData } from './pdfGenerator';
import type { VisitReportData } from './visitReportPdf';
import type { CompanyIdentity, DocumentTemplates } from './documentTemplates';
import { pestBlocks, rodentKontrakBlocks } from './documentTemplates';

export type PreviewKind = 'anti-rayap' | 'pest-rodent' | 'rodent' | 'perpanjangan' | 'laporan';

export const PREVIEW_LABELS: Record<PreviewKind, string> = {
    'anti-rayap': 'Penawaran Anti Rayap',
    'pest-rodent': 'Penawaran Pest + Rodent (BOQ)',
    'rodent': 'Penawaran Rodent Control',
    'perpanjangan': 'Surat Penawaran Ulang',
    'laporan': 'Laporan Kunjungan',
};

const KLIEN = 'PT Contoh Klien Sejahtera';
const ALAMAT = ['Jl. Contoh Raya No. 10, Kelurahan Contoh', 'Jakarta Selatan - 12345'];

export function previewQuotation(kind: Exclude<PreviewKind, 'laporan'>, tpl: DocumentTemplates, id: CompanyIdentity): QuotationPDFData {
    const now = new Date();
    const ym = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    const base = { tanggal: now, kepadaNama: KLIEN, kepadaAlamatLines: ALAMAT, marketingNama: 'Nama Penandatangan' };

    if (kind === 'anti-rayap') {
        return {
            ...base, noSurat: `CONTOH-PCO/PH/${ym}/0001`, jenisLayanan: 'anti_rayap_injeksi', perihal: 'Penawaran Harga Anti Rayap',
            objekPekerjaan: 'Bangunan Kantor dan Gudang', lokasiPekerjaan: 'Jl. Contoh Raya No. 10, Jakarta Selatan',
            surveyor: 'Petugas Survey', tanggalSurvey: new Date(now.getTime() - 3 * 86400000),
            metodeIntro: 'Dari survey yang dilakukan, kami menyimpulkan bahwa metode pengendalian yang perlu dilakukan adalah dengan menerapkan <b>BARRIER SYSTEM – Paska Konstruksi</b>. Berikut adalah rinciannya :',
            items: [
                { desc: 'Gedung Utama', qty: 400, unit: 'm²', harga: 30000 },
                { desc: 'Gudang', qty: 150.5, unit: 'm²', harga: 30000 },
            ],
            diskonPct: 5, ppn: false,
        };
    }
    if (kind === 'pest-rodent') {
        return {
            ...base, noSurat: `CONTOH-PCO/PH/${ym}/0002`, jenisLayanan: 'pest_umum', perihal: 'Penawaran <i>Pest Control</i> dan <i>Rodent Control</i>',
            objekPekerjaan: `lingkungan ${KLIEN}`,
            items: [
                { desc: 'Pest Control', qty: 1, unit: 'kali', harga: 5700000 },
                { desc: 'Rodent Control (8x kunjungan)', qty: 1, unit: 'lot', harga: 4800000 },
            ],
            ppn: true, ppnDppFaktor: 11 / 12, boqSubjudul: KLIEN.toUpperCase(),
            programs: [pestBlocks(tpl, id, KLIEN), rodentKontrakBlocks(tpl, id, KLIEN)],
        };
    }
    if (kind === 'rodent') {
        return {
            ...base, noSurat: `CONTOH-PCO/PH/${ym}/0003`, jenisLayanan: 'pest_rodent', perihal: 'Penawaran Harga <i>Rodent Control</i>',
            objekPekerjaan: `bangunan kantor ${KLIEN}`,
            items: [{ desc: 'Biaya Rodent Control (Pengendalian Tikus)', qty: 4, unit: 'kunjungan', harga: 750000 }],
            ppn: true,
        };
    }
    return {
        ...base, noSurat: `CONTOH-PCO/PH/${ym}/0004`, jenisLayanan: 'pest_umum', tipeSurat: 'perpanjangan', suratSaja: true,
        perihal: 'Pemberitahuan Masa Kontrak Kerja dan Penawaran Ulang <i>Pest Control</i>',
        items: [{ desc: 'Pest Control', qty: 4, unit: 'periode', harga: 900000 }], ppn: true,
        suratBlocks: [
            { t: 'p', text: 'Dengan hormat,', justify: false },
            { t: 'p', text: 'Melalui surat ini kami beritahukan bahwa masa kontrak kerja pelaksanaan <i>Pest Control</i> di lokasi Bapak/Ibu akan segera berakhir.' },
            { t: 'p', text: 'Maka sehubungan hal tersebut, perkenankan kami mengajukan kembali penawaran harga untuk periode selanjutnya dengan sistem kontrak 1 tahun (4 kali pengendalian).' },
            { t: 'p', text: 'Demikian surat penawaran kami, atas perhatian dan persetujuan yang akan diberikan kami ucapkan terima kasih.', justify: false },
        ],
    };
}

export function previewVisitReport(
    letterhead: VisitReportData['letterhead'],
    o: { judul: string; jenisPekerjaan: string; saran?: string; tampilkanFooter: boolean; kategori?: 'Pest Control' | 'Anti Rayap' }
): VisitReportData {
    const isAntiRayap = o.kategori === 'Anti Rayap';
    return {
        letterhead,
        judul: o.judul,
        tampilkanFooter: o.tampilkanFooter,
        idCustomer: 'CUST-001',
        customerName: KLIEN,
        kategori: isAntiRayap ? 'Anti Rayap' : 'Pest Control',
        alamat: 'Jl. Contoh Raya No. 10, Jakarta Selatan 12345',
        tanggal: new Date(),
        petugas: 'Nama Teknisi',
        jenisPekerjaan: o.jenisPekerjaan,
        findings: isAntiRayap
            ? [
                { hama: 'Rayap Tanah (Coptotermes)', quantity: '-', penanganan: 'Injeksi & Soil Treatment', lokasi: 'Perimeter Pondasi & Jalur Pipa', notes: 'Injeksi larutan termitisida pada titik bor lantai dan dinding.' },
                { hama: 'Inspeksi Umpan Rayap', quantity: '-', penanganan: 'Monitoring & Pengontrolan', lokasi: 'Area Taman & Gudang', notes: 'Kondisi stasiun umpan aman dan bebas aktivitas koloni baru.' },
            ]
            : [
                { hama: 'Kecoa & Semut', quantity: '-', penanganan: 'Spraying (Cypermethrin)', lokasi: 'Dapur, Pantry & Koridor', notes: 'Treatment residual pada titik persembunyian hama.' },
                { hama: 'Tikus (Rodent)', quantity: '-', penanganan: 'Baiting & Trapping', lokasi: 'Gudang & Area Luar', notes: 'Umpan dipasang dan dikontrol secara berkala.' },
            ],
        catatan: isAntiRayap
            ? 'Pelaksanaan treatment & pengontrolan Anti Rayap berjalan lancar sesuai standar teknis.'
            : 'Pelaksanaan treatment Pest Control rutin berjalan lancar sesuai jadwal.',
        saran: o.saran,
        customerNama: 'Perwakilan Pelanggan',
        photos: [{}, {}],
        createdBy: 'Nama Teknisi',
    };
}
