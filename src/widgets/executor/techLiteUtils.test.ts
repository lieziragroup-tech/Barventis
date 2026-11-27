import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatWoCode,
  getDayBucket,
  formatDurationId,
  formatTimeWib,
  extractSeverityFromFindings,
  extractColonyFromFindings,
  getTechnicianTeamList,
  resolveLockedWorksheetMode,
  isSampleCompleteReport,
  SAMPLE_COMPLETE_REPORT_ID,
} from './techLiteUtils';

test('formatWoCode produces stable WO-xxxx codes', () => {
  assert.equal(formatWoCode('WO-8492'), 'WO-8492');
  assert.equal(formatWoCode('abc-123456'), 'WO-3456');
  assert.match(formatWoCode('uuid-alpha-beta'), /^WO-\d{4}$/);
  assert.equal(formatWoCode(''), 'WO-0000');
});

test('getDayBucket classifies yesterday, today, tomorrow, and other accurately', () => {
  const ref = new Date(2026, 4, 15, 10, 30, 0); // 2026-05-15
  assert.equal(getDayBucket('2026-05-14', ref), 'yesterday');
  assert.equal(getDayBucket('2026-05-15', ref), 'today');
  assert.equal(getDayBucket('2026-05-16', ref), 'tomorrow');
  assert.equal(getDayBucket('2026-05-20', ref), 'other');
  assert.equal(getDayBucket(null, ref), 'today');
});

test('formatDurationId formats seconds and check-in/out deltas cleanly', () => {
  assert.equal(formatDurationId(6300), '1 Jam 45 Menit');
  assert.equal(formatDurationId(3600), '1 Jam');
  assert.equal(formatDurationId(1800), '30 Menit');
  assert.equal(
    formatDurationId(null, '2026-05-15T08:00:00Z', '2026-05-15T09:15:00Z'),
    '1 Jam 15 Menit'
  );
  assert.equal(formatDurationId(null, null, null), '-');
});

test('formatTimeWib handles HH:mm strings and ISO timestamps', () => {
  assert.equal(formatTimeWib('08:30'), '08.30 WIB');
  assert.equal(formatTimeWib('14.15'), '14.15 WIB');
  assert.equal(formatTimeWib(null, '09.00'), '09.00 WIB');
});

test('extractSeverityFromFindings and extractColonyFromFindings parse bracket metadata', () => {
  const findings = [
    { notes: '[Keparahan: Kritis | Koloni: > 5.000 | Sarang/Mud Tube]' },
  ];
  assert.equal(extractSeverityFromFindings(findings), 'Kritis');
  assert.equal(extractColonyFromFindings(findings), '> 5.000');
  assert.equal(extractSeverityFromFindings([{ notes: 'Normal' }]), null);
});

test('getTechnicianTeamList falls back to solo executor cleanly', () => {
  const solo = getTechnicianTeamList({ executorName: 'Budi Santoso', teamMembers: [] });
  assert.equal(solo.length, 1);
  assert.equal(solo[0].name, 'Budi Santoso');

  const team = getTechnicianTeamList({
    executorName: 'Budi Santoso',
    teamMembers: [
      { name: 'Budi Santoso', role: 'Ketua Tim' },
      { name: 'Rendi Pratama' },
    ],
  });
  assert.equal(team.length, 2);
  assert.equal(team[1].role, 'Anggota Tim');
});

test('resolveLockedWorksheetMode strictly locks AR to TERMITE_CONTROL and PCO to others', () => {
  assert.equal(resolveLockedWorksheetMode('TERMITE_CONTROL'), 'AR');
  assert.equal(resolveLockedWorksheetMode('GENERAL_PEST_CONTROL'), 'PCO');
  assert.equal(resolveLockedWorksheetMode('FUMIGATION'), 'PCO');
  assert.equal(resolveLockedWorksheetMode(undefined), 'PCO');
});

test('isSampleCompleteReport identifies the complete sample report id', () => {
  assert.equal(isSampleCompleteReport(SAMPLE_COMPLETE_REPORT_ID), true);
  assert.equal(isSampleCompleteReport('wr-pln-bulungan-01'), false);
  assert.equal(isSampleCompleteReport(null), false);
});
