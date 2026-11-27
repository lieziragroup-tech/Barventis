/** Uji sistem template per-perusahaan (murni, tanpa DB). Jalankan: bash scripts/build-run.sh scripts/template-test.ts */
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  markupToBlocks, blocksToMarkup, sanitizeTemplates, defaultDocumentTemplates, applyTemplatesToQuotation, buildLetterhead,
  reportOptionsFromTemplates, pestBlocks, rodentKontrakBlocks,
} from '../src/shared/lib/documentTemplates';
import { programPest, programRodentKontrak, programRodentStandalone } from '../src/shared/lib/quotationTemplates';
import { generateQuotationPDF } from '../src/shared/lib/pdfGenerator';
import { generateVisitReportPDF } from '../src/shared/lib/visitReportPdf';
import { previewQuotation, previewVisitReport } from '../src/shared/lib/sampleDocuments';
import { GUCI_HEADER_LOGO } from '../src/shared/lib/brandAssets.guci';

const OUT = process.env.PDF_OUT ?? '/tmp/tpl-out';
mkdirSync(OUT, { recursive: true });
let fail = 0;
const t = (name: string, ok: boolean, info = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
// Normalisasi representasi yang setara: labelW dihitung ulang, marker bawaan '-' , justify:false pada paragraf 1-baris.
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
const norm = (b: any[]) => b.map(x => {
  const o: any = JSON.parse(JSON.stringify(x, (k, v) => (k === 'labelW' ? undefined : v)));
  if (o.t === 'bullets' || o.t === 'kv') o.marker = o.marker ?? '-';
  if (o.t === 'p') delete o.justify;
  if (o.t === 'title') o.underline = !!o.underline;
  return o;
});

// 1. round-trip markup
for (const [name, blocks] of [['pest', programPest('{company}')], ['rodent-kontrak', programRodentKontrak('{company}')], ['rodent-standalone', programRodentStandalone()]] as const) {
  const again = markupToBlocks(blocksToMarkup(blocks));
  // 'gap' beruntun dilebur oleh parser; bandingkan setelah menghapus gap berulang
  const dedupe = (a: any[]) => a.filter((x, i) => !(x.t === 'gap' && a[i - 1]?.t === 'gap'));
  const A = norm(dedupe(again)), B = norm(dedupe(blocks as any));
  const idx = A.findIndex((x, i) => canon(x) !== canon(B[i]));
  t(`1. markup round-trip: program ${name}`, A.length === B.length && idx === -1, idx >= 0 ? `blok #${idx}: ${JSON.stringify(A[idx]).slice(0, 110)} ≠ ${JSON.stringify(B[idx]).slice(0, 110)}` : A.length !== B.length ? `panjang ${A.length}≠${B.length}` : '');
}

// 2. sanitasi
const evil: any = JSON.parse(JSON.stringify({
  letterhead: { mode: 'image', headerLogo: 'data:image/svg+xml;base64,PHN2Zz4=', brandColor: 'red; background:url(x)', headerLogoWidthMm: 99999,
    footerLogos: [{ src: 'data:image/png;base64,AAAA', widthMm: -5 }, { src: 'javascript:alert(1)', widthMm: 10 }, { src: 'data:image/png;base64,AAAA' }, { src: 'data:image/png;base64,AAAA' }, { src: 'data:image/png;base64,AAAA' }],
    footerLines: ['ok', 123, null, 'x'.repeat(5000)] },
  surat: { masaBerlakuHari: 'abc', salamPest: 'y'.repeat(999) },
  antiRayap: { garansiTahun: 1e9, skemaPembayaran: 'bukan array' },
  laporan: { judul: '', tampilkanFooter: 'ya' },
  hack: { a: 1 },
})) ;
const polluted = JSON.parse('{"__proto__":{"polluted":"yes"},"letterhead":{"__proto__":{"polluted2":"yes"}}}');
const s1 = sanitizeTemplates(evil), s2 = sanitizeTemplates(polluted);
t('2a. gambar SVG / javascript: / base64 rusak ditolak', s1.letterhead.headerLogo === '' && s1.letterhead.footerLogos.every(l => l.src.startsWith('data:image/png')));
t('2b. warna tak valid, lebar & angka di luar rentang dikoreksi', s1.letterhead.brandColor === '#1a5c38' && s1.letterhead.headerLogoWidthMm === 140 && s1.surat.masaBerlakuHari === 30 && s1.antiRayap.garansiTahun === 30);
t('2c. logo footer dibatasi 3 & lebar minimal', s1.letterhead.footerLogos.length <= 3 && s1.letterhead.footerLogos.every(l => l.widthMm >= 8));
t('2d. panjang teks dipotong, tipe salah → bawaan, kunci asing dibuang', s1.letterhead.footerLines.every(l => l.length <= 200) && s1.surat.salamPest.length === 60 && Array.isArray(s1.antiRayap.skemaPembayaran) && s1.laporan.judul === 'LAPORAN KUNJUNGAN' && s1.laporan.tampilkanFooter === true && !('hack' in s1));
t('2e. polusi prototipe (__proto__) tidak berpengaruh', ({} as any).polluted === undefined && ({} as any).polluted2 === undefined && s2.version === 1);
t('2f. gambar > batas ukuran ditolak', sanitizeTemplates({ letterhead: { headerLogo: 'data:image/png;base64,' + 'A'.repeat(700_000) } }).letterhead.headerLogo === '');

// 3. dua perusahaan berbeda
const sbiId = { companyName: 'PT Sarana Bumi Indonesia', headOffice: 'Jalan Tole Iskandar No. 41, Depok', telp: '(021) 111222', wa: '0812 3456 7890', email: 'info@sbi.co.id', website: 'www.sbi.co.id', kota: 'Depok' };
const sbi = defaultDocumentTemplates();
sbi.letterhead.brandName = 'SARANA BUMI'; sbi.letterhead.tagline = 'Pest Control Profesional'; sbi.letterhead.brandColor = '#0b5cad';
sbi.surat.masaBerlakuHari = 14; sbi.surat.salamAntiRayap = 'Salam hormat,'; sbi.surat.kontakKantor = '(021) 999000';
sbi.antiRayap.garansiTahun = 5; sbi.antiRayap.tampilkanPengontrolan = true; sbi.antiRayap.garansiCatatan = 'Garansi gugur bila bangunan direnovasi tanpa pemberitahuan.';
sbi.antiRayap.skemaPembayaran = ['DP 30% saat kontrak.', 'Pelunasan 70% setelah pekerjaan selesai.'];
sbi.pest.programPest = '# I. PROGRAM KHUSUS SBI\n## Metode\n- Fogging dengan {company} standar internal.\n@Target | Kecoa & nyamuk untuk {klien}';
sbi.laporan.judul = 'BERITA ACARA KUNJUNGAN'; sbi.laporan.saranDefault = 'Lakukan sanitasi rutin setiap minggu.'; sbi.laporan.tampilkanFooter = false;
const sbiClean = sanitizeTemplates(sbi);

const q = (kind: any, tpl: any, id: any) => generateQuotationPDF(applyTemplatesToQuotation(previewQuotation(kind, tpl, id), tpl, id));
const save = async (name: string, b: Blob) => writeFileSync(`${OUT}/${name}.pdf`, Buffer.from(await b.arrayBuffer()));
await save('sbi_anti_rayap', q('anti-rayap', sbiClean, sbiId));
await save('sbi_pest_rodent', q('pest-rodent', sbiClean, sbiId));
const ro = reportOptionsFromTemplates(sbiClean);
await save('sbi_laporan', generateVisitReportPDF(previewVisitReport(buildLetterhead(sbiClean, sbiId), { judul: ro.judul, jenisPekerjaan: ro.jenisPekerjaan, saran: ro.saran, tampilkanFooter: ro.tampilkanFooter })));

// tenant kedua: gambar kop + footer otomatis, tanpa kustomisasi teks
const imgId = { companyName: 'CV Nusantara Hama Bebas', headOffice: 'Jl. Merdeka 1, Bandung', telp: '022-1234', wa: '', email: 'cs@nhb.id', website: '', kota: 'Bandung' };
const imgTpl = defaultDocumentTemplates(); imgTpl.letterhead.mode = 'image'; imgTpl.letterhead.headerLogo = GUCI_HEADER_LOGO; imgTpl.letterhead.headerLogoWidthMm = 80;
await save('nhb_anti_rayap', q('anti-rayap', sanitizeTemplates(imgTpl), imgId));

// 4. nilai eksplisit menang atas template
const explicit = applyTemplatesToQuotation({ ...previewQuotation('anti-rayap', sbiClean, sbiId), garansiTahun: 2, masaBerlakuHari: 7, salam: 'Dengan hormat,' }, sbiClean, sbiId);
t('4. nilai eksplisit pemanggil menang atas template', explicit.garansiTahun === 2 && explicit.masaBerlakuHari === 7 && explicit.salam === 'Dengan hormat,' && explicit.tampilkanPengontrolan === true);
t('5. placeholder {company}/{klien} terisi di program', JSON.stringify(pestBlocks(sbiClean, sbiId, 'PT Klien A')).includes('PT Sarana Bumi Indonesia') && JSON.stringify(pestBlocks(sbiClean, sbiId, 'PT Klien A')).includes('PT Klien A') && !JSON.stringify(rodentKontrakBlocks(sbiClean, sbiId, 'PT Klien A')).includes('{klien}'));
console.log(fail ? `\nGAGAL: ${fail}` : '\nSEMUA LULUS');
process.exit(fail ? 1 : 0);
