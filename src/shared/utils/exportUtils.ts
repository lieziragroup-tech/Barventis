import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function exportTableToExcel(data: any[], filename: string) {
  if (!data || data.length === 0) return;
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportTableToPDF(data: any[], columns: string[], title: string, filename: string) {
  if (!data || data.length === 0) return;
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(title, 14, 20);

  const tableData = data.map(row => columns.map(col => String(row[col] || '-')));

  autoTable(doc, {
    startY: 30,
    head: [columns],
    body: tableData,
  });

  doc.save(`${filename}.pdf`);
}
