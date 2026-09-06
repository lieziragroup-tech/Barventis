import { storeLog } from '../activityLogService';
import { exportToExcel } from './excelExporter';
import { exportToPDF } from './pdfExporter';

export async function exportWithAudit({ format, filename, title, tenantName, columns, rows, sheets, actionName }) {
  if (format === 'excel') {
    await exportToExcel({ filename, sheets: sheets || [{ name: 'Data', rows }] });
  } else if (format === 'pdf') {
    await exportToPDF({ filename, title, tenantName, columns, rows });
  } else {
    throw new Error('Unsupported export format');
  }
  storeLog({ action: 'EXPORT_DATA', description: `${actionName} (${rows?.length || 0} baris) sebagai ${format.toUpperCase()}` });
}
