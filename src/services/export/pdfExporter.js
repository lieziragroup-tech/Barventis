import {
  drawPdfBrandHeaderLogo,
  drawPdfValidationFooter,
  drawPdfValidationSealBlock
} from '../pdfBrandingService';

export async function exportToPDF({ filename, title, tenantName, columns, rows, orientation = 'landscape' }) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const maxTextWidth = pageWidth - marginX * 2;

  // Official Enlarged Umatis Letterhead Logo (Top-Left) — zero overlap
  const brandMeta = drawPdfBrandHeaderLogo(doc, {
    marginX,
    topY: 7,
    maxWidthMm: 28,
    maxHeightMm: 18
  });

  const brandTextX = brandMeta.textOffsetX;
  const headerBottomY = brandMeta.headerBottomY;

  // Official Company Letterhead Title (Left) & Print Metadata (Right)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(brandMeta.logoRendered ? 15 : 13);
  doc.setTextColor(15, 23, 42);
  const officialTitle = brandMeta.logoRendered
    ? String(brandMeta.validationLabel || 'Dokumen Resmi Perusahaan')
    : String(tenantName || 'Dokumen Resmi Perusahaan');
  doc.text(officialTitle, brandTextX, brandMeta.logoRendered ? 14.5 : 13.5);

  if (brandMeta.logoRendered) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text('Dokumen Resmi Purchase Order & Inventaris', brandTextX, 20);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Dicetak: ${new Date().toLocaleString('id-ID')}`, pageWidth - marginX, 12.5, { align: 'right' });
  doc.text('CONFIDENTIAL - Internal Use Only', pageWidth - marginX, 17, { align: 'right' });

  // Subtle divider line
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.35);
  doc.line(marginX, headerBottomY, pageWidth - marginX, headerBottomY);

  // Dynamic multi-line title & metadata block
  const rawLines = String(title || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let cursorY = headerBottomY + 6.5;
  if (rawLines.length > 0) {
    // First line as bold document heading
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(15, 23, 42);
    const wrappedHeading = doc.splitTextToSize(rawLines[0], maxTextWidth);
    doc.text(wrappedHeading, marginX, cursorY);
    cursorY += wrappedHeading.length * 5.5 + 1.5;

    // Subsequent lines as structured metadata (Tanggal, Tanggal Kirim, Supplier, Lokasi, Status, Catatan)
    if (rawLines.length > 1) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(51, 65, 85);
      for (let i = 1; i < rawLines.length; i++) {
        const wrappedMeta = doc.splitTextToSize(rawLines[i], maxTextWidth);
        doc.text(wrappedMeta, marginX, cursorY);
        cursorY += wrappedMeta.length * 4.8;
      }
    }
  }

  const startY = Math.max(headerBottomY + 12, cursorY + 4);

  autoTable(doc, {
    startY,
    margin: { left: marginX, right: marginX, bottom: 18 },
    head: [columns.map((c) => c.label)],
    body: rows.map((r) => columns.map((c) => r[c.key] ?? '')),
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 3,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.2
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    didParseCell: (hookData) => {
      if (hookData.section === 'body') {
        const rowText = (hookData.row.raw || []).join(' ').toUpperCase();
        if (rowText.includes('TOTAL PEMBELIAN') || rowText.includes('TOTAL HARGA')) {
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fillColor = [241, 245, 249];
          hookData.cell.styles.textColor = [15, 23, 42];
        }
      }
    },
    didDrawPage: (data) => {
      drawPdfValidationFooter(doc, data.settings.margin.left);
    }
  });


  doc.save(`${filename}_${new Date().toISOString().split('T')[0]}.pdf`);
}
