export async function exportToPDF({ filename, title, tenantName, columns, rows, orientation = 'landscape' }) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });

  doc.setFontSize(14); doc.text(tenantName || 'Barventis', 14, 15);
  doc.setFontSize(10); doc.text(title, 14, 22);
  doc.text(`Dicetak: ${new Date().toLocaleString('id-ID')}`, 14, 27);
  doc.text('CONFIDENTIAL — Internal Use Only', 14, 31); // watermark

  autoTable(doc, {
    startY: 36,
    head: [columns.map(c => c.label)],
    body: rows.map(r => columns.map(c => r[c.key])),
    didDrawPage: (data) => {
      doc.setFontSize(8);
      doc.text(`Halaman ${doc.internal.getNumberOfPages()}`, data.settings.margin.left, doc.internal.pageSize.height - 10);
    },
  });
  doc.save(`${filename}_${new Date().toISOString().split('T')[0]}.pdf`);
}
