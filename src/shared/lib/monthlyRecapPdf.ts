/**
 * Generator PDF "LAPORAN REKAPITULASI BULANAN" — Membedakan penuh antara:
 *   1. Mode PCO: "LAPORAN REKAPITULASI PEST & RODENT CONTROL" (Standar RSPON + Permenkes No. 2 Tahun 2023)
 *   2. Mode AR : "LAPORAN REKAPITULASI PENGENDALIAN & MONITORING ANTI RAYAP" (Termite Control, Baiting & Garansi)
 *
 * Aturan Inti:
 * - Hanya dapat digenerate oleh Admin (`canGenerateMonthlyRecap(userRole)`).
 * - Hanya menampilkan dan memvisualisasikan hama/indikasi yang memiliki total > 0 (`activePests`).
 * - Menampilkan kalkulator Permenkes 2023 (untuk PCO) atau Kalkulator Proteksi Struktur & Baiting (untuk Anti Rayap) yang di-toggle ON.
 */
import jsPDF from 'jspdf';
import type { Letterhead } from './quotationLetterPdf';
import { GUCI_LETTERHEAD } from './quotationLetterPdf';
import {
  RoomPestEntry,
  PermenkesToggleConfig,
  PermenkesCalculationInput,
  EditableRecapNarratives,
  ReportCategoryMode,
  buildFilteredRecapMatrix,
  calculatePermenkesMetrics,
  canGenerateMonthlyRecap,
} from './permenkesRecapEngine';

export interface MonthlyRecapReportData {
  userRole?: string | null;
  categoryMode?: ReportCategoryMode; // 'PCO' | 'AR'
  letterhead?: Letterhead;
  customerName: string;
  customerAddress?: string;
  periodLabel: string;
  compilerName: string;
  supervisorName: string;
  entries: RoomPestEntry[];
  toggles: PermenkesToggleConfig;
  calcInput: PermenkesCalculationInput;
  narratives: EditableRecapNarratives;
  photos?: { dataUrl?: string; caption?: string; category?: string }[];
}

const PW = 210;
const PH = 297;
const ML = 14;
const MR = 14;
const TW = PW - ML - MR;
const BOTTOM = 278;

export function generateMonthlyRecapPDF(data: MonthlyRecapReportData): Blob {
  if (!canGenerateMonthlyRecap(data.userRole)) {
    throw new Error('FORBIDDEN: Hanya Admin yang dapat men-generate Laporan Rekapitulasi Bulanan.');
  }

  const mode: ReportCategoryMode = data.categoryMode ?? 'PCO';
  const isTermite = mode === 'AR';
  const primaryColor = isTermite ? '#5b21b6' : '#0f766e'; // Ungu tua untuk Anti Rayap, Hijau Teal untuk Pest Control

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const lh = data.letterhead ?? GUCI_LETTERHEAD;
  const matrix = buildFilteredRecapMatrix(data.entries);
  const metrics = calculatePermenkesMetrics(matrix, data.calcInput, data.toggles, mode);
  const enabledMetrics = metrics.filter(m => m.enabled);

  let y = 20;

  const drawPageChrome = (pageTitle?: string) => {
    let topY = 12;
    if (lh.headerLogo) {
      try {
        const props = doc.getImageProperties(lh.headerLogo);
        const w = Math.min(lh.headerLogoWidthMm ?? 48, 55);
        const h = w * (lh.headerLogoRatio ?? props.height / props.width);
        doc.addImage(lh.headerLogo, props.fileType, ML, topY, w, h);
        topY += h + 2;
      } catch {
        // ignore broken logo
      }
    }
    doc.setTextColor('#0f172a');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(lh.companyName.toUpperCase(), ML, topY + 3);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(data.customerName.toUpperCase(), PW - MR, 15, { align: 'right' });
    doc.text(
      `${isTermite ? 'Kategori: Anti Rayap (Termite Control)' : 'Kategori: Pest & Rodent Control'} | Periode: ${data.periodLabel}`,
      PW - MR,
      19.5,
      { align: 'right' }
    );

    doc.setDrawColor('#cbd5e1');
    doc.setLineWidth(0.4);
    const sepY = Math.max(topY + 6, 26);
    doc.line(ML, sepY, PW - MR, sepY);
    y = sepY + 8;

    if (pageTitle) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor('#0f172a');
      doc.text(pageTitle.toUpperCase(), PW / 2, y, { align: 'center' });
      y += 7;
    }
  };

  const ensureSpace = (neededMm: number, nextTitle?: string) => {
    if (y + neededMm > BOTTOM) {
      doc.addPage();
      drawPageChrome(nextTitle);
    }
  };

  // ── HALAMAN 1: COVER RESMI LAPORAN REKAPITULASI (PCO vs ANTI RAYAP) ──────
  doc.setFillColor('#f8fafc');
  doc.rect(0, 0, PW, PH, 'F');
  doc.setDrawColor(primaryColor);
  doc.setLineWidth(1.2);
  doc.rect(10, 10, PW - 20, PH - 20);

  if (lh.headerLogo) {
    try {
      const props = doc.getImageProperties(lh.headerLogo);
      const w = 65;
      const h = w * (lh.headerLogoRatio ?? props.height / props.width);
      doc.addImage(lh.headerLogo, props.fileType, (PW - w) / 2, 42, w, h);
    } catch {
      // ignore
    }
  }

  doc.setTextColor('#0f172a');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(
    isTermite ? 'LAPORAN PENGENDALIAN & MONITORING ANTI RAYAP' : 'LAPORAN PEST & RODENT CONTROL',
    PW / 2,
    106,
    { align: 'center' }
  );

  doc.setFontSize(11);
  doc.setTextColor('#475569');
  doc.text(
    isTermite
      ? '(TERMITE CONTROL, BAITING SYSTEM & EVALUASI GARANSI STRUKTUR)'
      : '(REKAPITULASI KUNJUNGAN & EVALUASI BAKU MUTU PERMENKES NO. 2 TAHUN 2023)',
    PW / 2,
    114,
    { align: 'center' }
  );

  doc.setFontSize(14);
  doc.setTextColor(primaryColor);
  const custLines = doc.splitTextToSize(data.customerName.toUpperCase(), TW - 20) as string[];
  custLines.forEach((ln, idx) => {
    doc.text(ln, PW / 2, 128 + idx * 7, { align: 'center' });
  });

  const periodY = 132 + custLines.length * 7 + 14;
  doc.setTextColor('#0f172a');
  doc.setFontSize(12);
  doc.text(`PERIODE ${data.periodLabel.toUpperCase()}`, PW / 2, periodY, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Disusun Oleh : ${data.compilerName}`, PW / 2, 235, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(lh.companyName.toUpperCase(), PW / 2, 246, { align: 'center' });

  // ── HALAMAN 2: REKAPITULASI TABEL TEMUAN AKTIF (> 0) & GRAFIK ────────────
  doc.addPage();
  const page2Title = isTermite
    ? 'REKAPITULASI INDIKASI & PERLAKUAN ANTI RAYAP AKTIF (> 0)'
    : 'REKAPITULASI TABEL TEMUAN HAMA PEST CONTROL AKTIF (> 0)';
  drawPageChrome(page2Title);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor('#475569');
  doc.text(
    isTermite
      ? 'Catatan: Hanya menampilkan indikasi rayap, titik injeksi, atau stasiun umpan yang tercatat > 0 pada periode berjalan.'
      : 'Catatan: Hanya menampilkan jenis hama yang terdata > 0 ekor pada periode berjalan.',
    ML,
    y
  );
  y += 5;

  const colW = [14, 54, 28, TW - 96];
  const colX = [ML, ML + 14, ML + 68, ML + 96];

  const drawSummaryRow = (cells: string[], isHeader = false, isTotal = false) => {
    doc.setFont('helvetica', isHeader || isTotal ? 'bold' : 'normal');
    doc.setFontSize(isHeader ? 8.8 : 8.5);
    const wrapped = cells.map((c, i) => doc.splitTextToSize(c, colW[i] - 4) as string[]);
    const rowH = Math.max(7, Math.max(...wrapped.map(w => w.length)) * 4 + 3);
    ensureSpace(rowH + 2, page2Title);

    if (isHeader) {
      doc.setFillColor(primaryColor);
      doc.rect(ML, y, TW, rowH, 'F');
      doc.setTextColor('#ffffff');
    } else if (isTotal) {
      doc.setFillColor('#f1f5f9');
      doc.rect(ML, y, TW, rowH, 'F');
      doc.setTextColor('#0f172a');
    } else {
      doc.setTextColor('#0f172a');
    }

    cells.forEach((_, i) => {
      doc.setDrawColor('#cbd5e1');
      doc.setLineWidth(0.25);
      doc.rect(colX[i], y, colW[i], rowH);
      const align = i === 0 || i === 2 ? 'center' : 'left';
      const tx = align === 'center' ? colX[i] + colW[i] / 2 : colX[i] + 2;
      wrapped[i].forEach((ln, k) => {
        doc.text(ln, tx, y + 4.3 + k * 3.8, { align });
      });
    });
    y += rowH;
  };

  drawSummaryRow(
    isTermite
      ? ['NO', 'INDIKASI / PERLAKUAN RAYAP (> 0)', 'JUMLAH (Titik/Unit)', 'STRUKTUR / LOKASI RUANGAN']
      : ['NO', 'JENIS HAMA (> 0)', 'JUMLAH (Ekor)', 'RUANGAN / LOKASI DITEMUKAN'],
    true
  );
  if (matrix.summaryRows.length === 0) {
    drawSummaryRow(['-', 'Tidak ada temuan aktif (> 0)', '0', '-']);
  } else {
    for (const row of matrix.summaryRows) {
      drawSummaryRow([String(row.no), row.pestName, String(row.totalQuantity), row.roomsSummary]);
    }
  }
  drawSummaryRow(
    [
      '',
      isTermite ? 'TOTAL TITIK TEMUAN & PERLAKUAN RAYAP' : 'TOTAL TEMUAN HAMA AKTIF',
      String(matrix.grandTotalQuantity),
      `${matrix.totalInfectedRooms} Titik Lokasi/Ruangan Terdata`,
    ],
    false,
    true
  );

  // Visual Bar Chart untuk Hama / Indikasi Aktif (> 0)
  if (matrix.summaryRows.length > 0) {
    y += 8;
    ensureSpace(58, 'GRAFIK TEMUAN AKTIF (> 0)');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor('#0f172a');
    doc.text(
      `${isTermite ? 'GRAFIK DISTRIBUSI TITIK ANTI RAYAP (> 0)' : 'GRAFIK JUMLAH TEMUAN HAMA AKTIF (> 0)'} — ${data.periodLabel.toUpperCase()}`,
      ML,
      y
    );
    y += 4;

    const chartH = 42;
    const chartW = TW;
    doc.setDrawColor('#cbd5e1');
    doc.rect(ML, y, chartW, chartH);

    const maxVal = Math.max(1, ...matrix.summaryRows.map(r => r.totalQuantity));
    const slotW = Math.min(26, (chartW - 16) / Math.max(1, matrix.summaryRows.length));
    matrix.summaryRows.forEach((row, idx) => {
      const barH = Math.max(2, (row.totalQuantity / maxVal) * (chartH - 16));
      const bx = ML + 8 + idx * slotW + 2;
      const bw = Math.max(6, slotW - 5);
      const by = y + chartH - 8 - barH;
      doc.setFillColor(primaryColor);
      doc.rect(bx, by, bw, barH, 'F');
      doc.setFontSize(7.5);
      doc.setTextColor('#0f172a');
      doc.text(String(row.totalQuantity), bx + bw / 2, by - 1.5, { align: 'center' });
      const shortPest = row.pestName.length > 10 ? row.pestName.slice(0, 9) + '…' : row.pestName;
      doc.setFontSize(6.5);
      doc.text(shortPest, bx + bw / 2, y + chartH - 3, { align: 'center' });
    });
    y += chartH + 8;
  }

  // ── HALAMAN 3: TABEL RINCIAN PER GEDUNG/ZONA/RUANGAN (HANYA > 0) ─────────
  if (matrix.roomRows.length > 0 && matrix.activePests.length > 0) {
    doc.addPage();
    const matrixTitle = isTermite
      ? 'TABEL RINCIAN TITIK ANTI RAYAP PER GEDUNG, ZONA & STRUKTUR (> 0)'
      : 'TABEL RINCIAN TEMUAN HAMA PER GEDUNG, LANTAI & RUANGAN (> 0)';
    drawPageChrome(matrixTitle);

    const fixedLeftW = 68;
    const totalColW = 14;
    const dynamicAreaW = TW - fixedLeftW - totalColW;
    const perPestW = Math.max(11, dynamicAreaW / matrix.activePests.length);

    const mCols = [22, 18, 28, ...matrix.activePests.map(() => perPestW), totalColW];
    const mXs = mCols.reduce<number[]>((acc, _w, i) => {
      acc.push(i === 0 ? ML : acc[i - 1] + mCols[i - 1]);
      return acc;
    }, []);

    const drawMatrixRow = (cells: string[], isHeader = false, isTotal = false) => {
      doc.setFont('helvetica', isHeader || isTotal ? 'bold' : 'normal');
      doc.setFontSize(isHeader ? 7.2 : 7.5);
      const wrapped = cells.map((c, i) => doc.splitTextToSize(c, mCols[i] - 2) as string[]);
      const h = Math.max(6.5, Math.max(...wrapped.map(w => w.length)) * 3.4 + 2.5);
      ensureSpace(h + 2, matrixTitle);

      if (isHeader) {
        doc.setFillColor('#1e293b');
        doc.rect(ML, y, mCols.reduce((a, b) => a + b, 0), h, 'F');
        doc.setTextColor('#ffffff');
      } else if (isTotal) {
        doc.setFillColor('#f1f5f9');
        doc.rect(ML, y, mCols.reduce((a, b) => a + b, 0), h, 'F');
        doc.setTextColor('#0f172a');
      } else {
        doc.setTextColor('#0f172a');
      }

      cells.forEach((_, i) => {
        doc.setDrawColor('#cbd5e1');
        doc.setLineWidth(0.2);
        doc.rect(mXs[i], y, mCols[i], h);
        const isNum = i >= 3;
        const tx = isNum ? mXs[i] + mCols[i] / 2 : mXs[i] + 1.5;
        wrapped[i].forEach((ln, k) => {
          doc.text(ln, tx, y + 4 + k * 3.2, { align: isNum ? 'center' : 'left' });
        });
      });
      y += h;
    };

    drawMatrixRow(
      [
        'GEDUNG',
        isTermite ? 'ZONA' : 'LANTAI',
        isTermite ? 'STRUKTUR / AREA' : 'RUANGAN',
        ...matrix.activePests,
        'TOTAL',
      ],
      true
    );
    for (const r of matrix.roomRows) {
      drawMatrixRow([
        r.buildingName,
        r.floorOrZone,
        r.roomName,
        ...matrix.activePests.map(p => (r.countsByActivePest[p] > 0 ? String(r.countsByActivePest[p]) : '-')),
        String(r.rowTotal),
      ]);
    }
    drawMatrixRow(
      [
        'TOTAL',
        '',
        '',
        ...matrix.activePests.map(p => String(matrix.totalsByPest[p] || 0)),
        String(matrix.grandTotalQuantity),
      ],
      false,
      true
    );
  }

  // ── HALAMAN 4: KALKULASI INDIKATOR (PERMENKES PCO vs PROTEKSI ANTI RAYAP) ─
  if (enabledMetrics.length > 0) {
    doc.addPage();
    const calcTitle = isTermite
      ? 'EVALUASI PROTEKSI STRUKTUR, STASIUN UMPAN & BARIER ANTI RAYAP'
      : 'PERHITUNGAN INDEKS BAKU MUTU PERMENKES RI NO. 2 TAHUN 2023';
    drawPageChrome(calcTitle);

    for (const metric of enabledMetrics) {
      ensureSpace(34, calcTitle);
      doc.setDrawColor('#cbd5e1');
      doc.setFillColor('#f8fafc');
      doc.rect(ML, y, TW, 28, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor('#0f172a');
      doc.text(metric.title, ML + 3, y + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor('#334155');
      doc.text(`Rumus Evaluasi: ${metric.formulaText}`, ML + 3, y + 11.5);
      doc.text(`Perhitungan Periode ${data.periodLabel}: ${metric.calculationBreakdown}`, ML + 3, y + 16.5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(primaryColor);
      doc.text(`Hasil: ${metric.numericValue} ${metric.unit} (Acuan: ${metric.sbmklThresholdText})`, ML + 3, y + 22);

      if (data.toggles.showSbmklComplianceBadge) {
        doc.setTextColor(metric.isCompliant ? '#047857' : '#b45309');
        doc.text(`Status: ${metric.statusLabel}`, PW - MR - 3, y + 22, { align: 'right' });
      }
      y += 33;
    }
  }

  // ── HALAMAN 5: ANALISA NARATIF, SARAN, RENCANA TINDAK LANJUT & TTD ────────
  doc.addPage();
  const page5Title = isTermite
    ? 'ANALISA STRUKTUR ANTI RAYAP, SARAN & JADWAL KONTROL GARANSI'
    : 'ANALISA TEMUAN HAMA PEST CONTROL, SARAN & RENCANA TINDAK LANJUT';
  drawPageChrome(page5Title);

  const drawNarrativeBlock = (heading: string, content: string) => {
    const lines = doc.splitTextToSize(content || '-', TW - 6) as string[];
    const h = Math.max(14, lines.length * 4.2 + 9);
    ensureSpace(h + 4, page5Title);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor('#0f172a');
    doc.text(heading, ML, y + 4);

    doc.setDrawColor('#cbd5e1');
    doc.rect(ML, y + 6, TW, h - 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor('#1e293b');
    lines.forEach((ln, idx) => {
      doc.text(ln, ML + 3, y + 11 + idx * 4.2);
    });
    y += h + 4;
  };

  if (isTermite) {
    drawNarrativeBlock('1. Analisa Aktivitas Rayap Tanah & Subterranean', data.narratives.analisaTikusDanKucing);
    drawNarrativeBlock('2. Analisa Rayap Kayu Kering & Struktur Kayu', data.narratives.analisaKecoaDanSemut);
    drawNarrativeBlock('3. Evaluasi Barier Injeksi & Stasiun Umpan (Baiting System)', data.narratives.analisaLalatDanNyamuk);
    drawNarrativeBlock('4. Status Perlindungan & Masa Garansi Anti Rayap', data.narratives.analisaHamaLainnya);
    drawNarrativeBlock('5. Saran Perbaikan Fisik & Kelembaban Bangunan', data.narratives.saranRekomendasi);
    drawNarrativeBlock('6. Rencana Tindak Lanjut & Jadwal Kontrol Berkala', data.narratives.rencanaTindakLanjut);
  } else {
    drawNarrativeBlock('1. Analisa Tikus dan Kucing', data.narratives.analisaTikusDanKucing);
    drawNarrativeBlock('2. Analisa Hama Kecoa dan Semut', data.narratives.analisaKecoaDanSemut);
    drawNarrativeBlock('3. Analisa Serangga Lalat dan Nyamuk', data.narratives.analisaLalatDanNyamuk);
    drawNarrativeBlock('4. Analisa Hama Lainnya (> 0)', data.narratives.analisaHamaLainnya);
    drawNarrativeBlock('5. Saran dan Rekomendasi', data.narratives.saranRekomendasi);
    drawNarrativeBlock('6. Rencana Tindak Lanjut', data.narratives.rencanaTindakLanjut);
  }

  ensureSpace(38);
  y += 6;
  const sigX = PW - MR - 60;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor('#0f172a');
  doc.text('Mengetahui,', sigX + 30, y, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.text('Supervisor Operasional', sigX + 30, y + 5, { align: 'center' });
  doc.text(data.supervisorName || 'Supervisor', sigX + 30, y + 26, { align: 'center' });
  doc.setDrawColor('#0f172a');
  doc.line(sigX + 5, y + 27, sigX + 55, y + 27);

  return doc.output('blob');
}
