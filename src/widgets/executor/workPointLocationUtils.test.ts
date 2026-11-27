import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatAccuracyLabel,
  formatWorkPointCoordinates,
  getWorkPointStorageKey,
  isValidCoordinate,
  mapGeolocationErrorToIndonesian,
  parseWorkPointLocation,
  resolveReportDisplayLocation,
} from './workPointLocationUtils';

describe('workPointLocationUtils', () => {
  it('validates real coordinates and rejects invalid or sentinel values', () => {
    assert.equal(isValidCoordinate(-6.241612, 106.798045), true);
    assert.equal(isValidCoordinate(0, 0), false);
    assert.equal(isValidCoordinate(95, 106.8), false);
    assert.equal(isValidCoordinate(-6.2, 181), false);
    assert.equal(isValidCoordinate(Number.NaN, 106.8), false);
    assert.equal(isValidCoordinate(null, undefined), false);
  });

  it('formats coordinates and GPS accuracy cleanly', () => {
    assert.equal(formatWorkPointCoordinates(-6.24161234, 106.79804512), '-6.241612, 106.798045');
    assert.equal(formatWorkPointCoordinates(-6.241612, 106.798045, 4), '-6.2416, 106.7980');
    assert.equal(formatAccuracyLabel(8.4), '±8 m');
    assert.equal(formatAccuracyLabel(0), null);
    assert.equal(formatAccuracyLabel(null), null);
  });

  it('parses serialized work-point payloads safely', () => {
    const valid = parseWorkPointLocation(
      JSON.stringify({
        latitude: -6.241612,
        longitude: 106.798045,
        accuracy: 7.6,
        capturedAt: '2026-11-20T04:40:00.000Z',
        source: 'MANUAL_GPS',
      })
    );
    assert.deepEqual(valid, {
      latitude: -6.241612,
      longitude: 106.798045,
      accuracy: 8,
      capturedAt: '2026-11-20T04:40:00.000Z',
      source: 'MANUAL_GPS',
    });

    assert.equal(parseWorkPointLocation('not-json'), null);
    assert.equal(parseWorkPointLocation(JSON.stringify({ latitude: 0, longitude: 0 })), null);
    assert.equal(getWorkPointStorageKey('wr-101'), 'gep_workpoint_coords_wr-101');
  });

  it('prioritizes saved manual GPS over check-in and project coordinates', () => {
    const baseReport = {
      id: 'wr-1',
      checkInLatitude: -6.2419,
      checkInLongitude: 106.7982,
      checkInAt: '2026-11-20T02:00:00.000Z',
      projectLatitude: -6.2415,
      projectLongitude: 106.798,
    };

    const manualSaved = {
      latitude: -6.241612,
      longitude: 106.798045,
      accuracy: 8,
      capturedAt: '2026-11-20T03:15:00.000Z',
      source: 'MANUAL_GPS' as const,
    };

    const resolvedManual = resolveReportDisplayLocation(baseReport, manualSaved);
    assert.ok(resolvedManual);
    assert.equal(resolvedManual.source, 'MANUAL_GPS');
    assert.equal(resolvedManual.label, 'Titik Pengerjaan (GPS Tersimpan)');
    assert.equal(resolvedManual.latitude, -6.241612);
    assert.equal(typeof resolvedManual.distanceToProjectMeters, 'number');
    assert.ok((resolvedManual.distanceToProjectMeters ?? 999) < 30);

    const resolvedCheckIn = resolveReportDisplayLocation(baseReport, null);
    assert.ok(resolvedCheckIn);
    assert.equal(resolvedCheckIn.source, 'CHECK_IN');
    assert.equal(resolvedCheckIn.latitude, -6.2419);

    const resolvedProject = resolveReportDisplayLocation(
      { id: 'wr-2', projectLatitude: -6.2415, projectLongitude: 106.798 },
      null
    );
    assert.ok(resolvedProject);
    assert.equal(resolvedProject.source, 'PROJECT');
    assert.equal(resolvedProject.distanceToProjectMeters, null);

    assert.equal(resolveReportDisplayLocation({ id: 'wr-empty' }, null), null);
  });

  it('maps browser geolocation error codes to clear Indonesian messages', () => {
    assert.match(mapGeolocationErrorToIndonesian(1), /Izin lokasi ditolak/i);
    assert.match(mapGeolocationErrorToIndonesian(2), /Sinyal GPS belum terdeteksi/i);
    assert.match(mapGeolocationErrorToIndonesian(3), /terlalu lama/i);
    assert.match(mapGeolocationErrorToIndonesian(undefined), /Gagal membaca koordinat/i);
  });
});
