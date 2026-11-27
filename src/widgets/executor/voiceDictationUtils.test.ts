import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLiveDictationPreview,
  extractSpeechEventTranscripts,
  isSpeechRecognitionSupported,
  mapSpeechErrorToIndonesian,
  mergeDictationText,
} from './voiceDictationUtils';

test('mergeDictationText capitalizes initial phrase on empty textarea', () => {
  assert.equal(
    mergeDictationText('', 'ditemukan jalur rayap di kusen pintu belakang'),
    'Ditemukan jalur rayap di kusen pintu belakang'
  );
  assert.equal(mergeDictationText('   ', '  area dapur lembab  '), 'Area dapur lembab');
});

test('mergeDictationText appends smoothly with single space or new sentence capitalization', () => {
  assert.equal(
    mergeDictationText('Sudah dilakukan injeksi pondasi', 'sebanyak 40 titik'),
    'Sudah dilakukan injeksi pondasi sebanyak 40 titik'
  );
  assert.equal(
    mergeDictationText('Area pantry sudah disemprot.', 'saran tutup celah bawah pintu'),
    'Area pantry sudah disemprot. Saran tutup celah bawah pintu'
  );
  assert.equal(
    mergeDictationText('Catatan awal ', 'lanjutan observasi'),
    'Catatan awal lanjutan observasi'
  );
});

test('mergeDictationText preserves existing text when dictated chunk is empty', () => {
  assert.equal(mergeDictationText('Catatan tetap aman', '   '), 'Catatan tetap aman');
});

test('extractSpeechEventTranscripts separates final and interim segments accurately', () => {
  const result = extractSpeechEventTranscripts({
    resultIndex: 1,
    results: [
      { isFinal: true, length: 1, 0: { transcript: 'lama diabaikan' } },
      { isFinal: true, length: 1, 0: { transcript: 'ditemukan jejak kecoa' } },
      { isFinal: false, length: 1, 0: { transcript: 'di dekat saluran air' } },
    ],
  });
  assert.deepEqual(result, {
    finalText: 'ditemukan jejak kecoa',
    interimText: 'di dekat saluran air',
  });
});

test('buildLiveDictationPreview formats live interim speech cleanly', () => {
  assert.equal(buildLiveDictationPreview('', 'sedang mengecek plafon'), 'Sedang mengecek plafon');
  assert.equal(buildLiveDictationPreview('Sudah dicek', 'bagian gudang'), 'bagian gudang');
  assert.equal(buildLiveDictationPreview('Sudah dicek', '   '), '');
});

test('mapSpeechErrorToIndonesian returns clear technician messages', () => {
  assert.match(mapSpeechErrorToIndonesian('not-allowed'), /Izin mikrofon/i);
  assert.match(mapSpeechErrorToIndonesian('no-speech'), /Suara belum terdengar/i);
  assert.match(mapSpeechErrorToIndonesian('audio-capture'), /Mikrofon tidak terdeteksi/i);
  assert.match(mapSpeechErrorToIndonesian('network'), /Koneksi internet/i);
  assert.equal(mapSpeechErrorToIndonesian('aborted'), '');
});

test('isSpeechRecognitionSupported detects standard and webkit constructors', () => {
  assert.equal(isSpeechRecognitionSupported({}), false);
  assert.equal(isSpeechRecognitionSupported({ SpeechRecognition: function Mock() {} }), true);
  assert.equal(isSpeechRecognitionSupported({ webkitSpeechRecognition: function Mock() {} }), true);
});
