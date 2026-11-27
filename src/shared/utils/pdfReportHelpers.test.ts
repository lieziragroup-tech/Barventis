import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPdfPhotoCaption,
  buildReportPdfFilename,
  formatFileSizeKb,
  needsRasterizationForPdf,
  sanitizePdfSegment,
} from './pdfReportHelpers';
import { visitReportFromWorkReport } from '@/shared/lib/visitReportPdf';
import type { WorkReport } from '@/entities/types';

test('buildReportPdfFilename distinguishes Anti Rayap and Pest Control cleanly', () => {
  const arName = buildReportPdfFilename({
    id: 'wr-contoh-lengkap-00',
    serviceType: 'TERMITE_CONTROL',
    clientName: 'PT Graha Nusantara Mandiri',
    projectName: 'Gedung Graha Nusantara',
    checkOutAt: '2026-11-20T03:17:00.000Z',
    checkInAt: '2026-11-20T01:02:00.000Z',
    createdAt: '2026-11-20T01:00:00.000Z',
  });
  assert.match(arName, /^Laporan_Anti_Rayap_PT_Graha_Nusantara_Mandiri_WO-\d{4}_2026-11-20\.pdf$/);

  const pcoName = buildReportPdfFilename({
    id: 'wr-pln-01',
    serviceType: 'GENERAL_PEST_CONTROL',
    clientName: 'PT PLN (Persero) UP3 Bulungan',
    projectName: 'PLN Bulungan',
    checkOutAt: null,
    checkInAt: '2026-11-20T02:00:00.000Z',
    createdAt: '2026-11-20T01:00:00.000Z',
  });
  assert.match(pcoName, /^Laporan_Pest_Control_PT_PLN_Persero_UP3_Bulungan_WO-\d{4}_2026-11-20\.pdf$/);
});

test('sanitizePdfSegment strips unsafe characters gracefully', () => {
  assert.equal(sanitizePdfSegment('  Gudang / Lt. 2 & Pantry!  '), 'Gudang_Lt_2_Pantry');
  assert.equal(sanitizePdfSegment('***'), 'Laporan');
});

test('buildPdfPhotoCaption labels check-in, before, process, after, and check-out photos', () => {
  assert.match(
    buildPdfPhotoCaption({ photoType: 'CHECK_IN', capturedAt: '2026-11-20T01:02:00.000Z' }, 0),
    /^Foto 1 - Kehadiran \(Check-In\) \(\d{2}\.\d{2} WIB\)$/
  );
  assert.match(
    buildPdfPhotoCaption({ photoType: 'PROGRESS', photoTag: 'BEFORE', capturedAt: '' }, 1),
    /^Foto 2 - Kondisi Awal \(Before\)$/
  );
  assert.match(
    buildPdfPhotoCaption({ photoType: 'PROGRESS', photoTag: 'AFTER', capturedAt: '' }, 4),
    /^Foto 5 - Hasil Akhir \(After\)$/
  );
  assert.match(
    buildPdfPhotoCaption({ photoType: 'CHECK_OUT', capturedAt: '' }, 5),
    /^Foto 6 - Penyelesaian \(Check-Out\)$/
  );
});

test('needsRasterizationForPdf flags SVG and non-base64 images while passing base64 PNG/JPEG', () => {
  assert.equal(needsRasterizationForPdf('data:image/svg+xml;utf8,%3Csvg%3E%3C/svg%3E'), true);
  assert.equal(needsRasterizationForPdf('https://example.com/photo.jpg'), true);
  assert.equal(needsRasterizationForPdf('data:image/jpeg;base64,/9j/4AAQ'), false);
  assert.equal(needsRasterizationForPdf('data:image/png;base64,iVBORw0KGgo='), false);
  assert.equal(needsRasterizationForPdf(null), false);
});

test('formatFileSizeKb formats kilobytes and megabytes cleanly', () => {
  assert.equal(formatFileSizeKb(150 * 1024), '150 KB');
  assert.equal(formatFileSizeKb(1.5 * 1024 * 1024), '1,5 MB');
  assert.equal(formatFileSizeKb(0), '0 KB');
});

test('visitReportFromWorkReport maps team, signatures, and termite details for offline PDF export', () => {
  const sampleReport: WorkReport = {
    id: 'wr-test-pdf-01',
    projectId: 'proj-test-01',
    projectName: 'Gedung Graha Nusantara',
    projectAddress: 'Jl. TB Simatupang Kav. 22, Jakarta Selatan',
    projectLatitude: -6.29214,
    projectLongitude: 106.81145,
    projectRadius: 100,
    clientName: 'PT Graha Nusantara Mandiri',
    serviceType: 'TERMITE_CONTROL',
    focusTarget: 'Rayap Tanah',
    targetFocus: ['Rayap Tanah'],
    buildingAreaSqm: 450,
    contractType: 'ONE_TIME',
    warrantyMonths: 36,
    scheduledStartTime: '08:00',
    executorId: 'tech-1',
    executorName: 'Budi Santoso',
    executorEmail: 'budi@gucimaspratama.co.id',
    teamMembers: [
      { id: 'tech-1', name: 'Budi Santoso' },
      { id: 'tech-2', name: 'Rian Setiawan' },
    ],
    status: 'COMPLETED',
    riskScore: 0,
    riskLevel: 'LOW',
    checkInAt: '2026-11-20T01:02:00.000Z',
    checkOutAt: '2026-11-20T03:17:00.000Z',
    durationSeconds: 8100,
    customerName: 'Ibu Nadia Permatasari',
    technicianSignature: 'data:image/png;base64,TECHSIG',
    customerSignature: 'data:image/png;base64,CLIENTSIG',
    notes: 'Selesai injeksi pondasi 120 titik.',
    treatmentRecord: null,
    photos: [],
    riskEvents: [],
    createdAt: '2026-11-20T01:00:00.000Z',
    updatedAt: '2026-11-20T03:17:00.000Z',
  };

  const data = visitReportFromWorkReport(sampleReport, {
    createdBy: 'Budi Santoso',
    saran: 'Jaga ventilasi gudang arsip.',
  });
  assert.equal(data.reportMode, 'AR');
  assert.equal(data.petugas, 'Budi Santoso, Rian Setiawan');
  assert.equal(data.petugasSignature, 'data:image/png;base64,TECHSIG');
  assert.equal(data.customerSignature, 'data:image/png;base64,CLIENTSIG');
  assert.match(data.warrantyStatusLabel || '', /36 Bulan/);
  assert.equal(data.saran, 'Jaga ventilasi gudang arsip.');
});
