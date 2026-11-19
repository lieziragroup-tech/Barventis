export async function exportToPDF({ filename, title, tenantName, columns, rows, orientation = 'landscape' }) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const maxTextWidth = pageWidth - marginX * 2;

  // Header Brand (Left) & Print Metadata (Right) — zero overlap
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(String(tenantName || 'BARVENTIS - Sistem Manajemen Gudang'), marginX, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Dicetak: ${new Date().toLocaleString('id-ID')}`, pageWidth - marginX, 12.5, { align: 'right' });
  doc.text('CONFIDENTIAL - Internal Use Only', pageWidth - marginX, 17, { align: 'right' });

  // Subtle divider line
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.35);
  doc.line(marginX, 20.5, pageWidth - marginX, 20.5);

  // Dynamic multi-line title & metadata block
  const rawLines = String(title || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let cursorY = 27;
  if (rawLines.length > 0) {
    // First line as bold document heading
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(15, 23, 42);
    const wrappedHeading = doc.splitTextToSize(rawLines[0], maxTextWidth);
    doc.text(wrappedHeading, marginX, cursorY);
    cursorY += wrappedHeading.length * 5.5 + 1.5;

    // Subsequent lines as structured metadata (Tanggal, Supplier, Lokasi, Status, Catatan)
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

  const startY = Math.max(32, cursorY + 4);

  autoTable(doc, {
    startY,
    margin: { left: marginX, right: marginX },
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
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Halaman ${doc.internal.getNumberOfPages()}`,
        data.settings.margin.left,
        doc.internal.pageSize.getHeight() - 10
      );
    }
  });

  doc.save(`${filename}_${new Date().toISOString().split('T')[0]}.pdf`);
}
