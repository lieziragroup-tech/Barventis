import { store, calls } from './stubs/supabase';
import { collection, query, where, orderBy, getDocs, getDoc, doc, setDoc, updateDoc, addDoc, Timestamp, db } from '../src/shared/lib/firebase';
let fail = 0; const t = (n: string, ok: boolean, i = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`); };

store.quotations = Array.from({ length: 2300 }, (_, i) => ({ id: `q${String(i).padStart(4, '0')}`, company_id: i % 2 ? 'B' : 'A', marketing_uid: 'm1', status: i % 3 ? 'approved' : 'deal', created_at: '2026-01-02T03:04:05Z',
  payload: { noSurat: `N-${i}`, total: 100 + i, tanggal: '2026-02-03T00:00:00Z', pdfBase64: 'X'.repeat(10) } }));
store.users = [{ id: 'u1', company_id: 'A', name: 'Budi', email: 'b@x', role: 'ADMIN', is_active: true, phone: '081', password_hash: 'RAHASIA' }];
store.performa_targets = [];

const all = await getDocs(query(collection(db, 'quotations'), where('companyId', '==', 'A')));
t('1. paginasi: 1150 baris perusahaan A semua terambil (bukan terpotong 1000)', all.size === 1150, `size=${all.size}`);
const one = all.docs[0].data();
t('2. payload diratakan + kolom di-camelCase-kan', one.noSurat?.startsWith('N-') && one.total >= 100 && one.companyId === 'A' && one.marketingUid === 'm1');
t('3. string ISO jadi Timestamp (toDate/valueOf)', typeof one.tanggal.toDate === 'function' && one.tanggal.toDate().getUTCFullYear() === 2026 && new Date(one.createdAt).getUTCFullYear() === 2026);
const inq = await getDocs(query(collection(db, 'quotations'), where('companyId', '==', 'A'), where('status', 'in', ['deal'])));
t('4. operator "in" bekerja (sebelumnya diabaikan diam-diam)', inq.size > 0 && inq.docs.every(d => d.data().status === 'deal'));
const u = (await getDocs(query(collection(db, 'users'), where('role', '==', 'ADMIN')))).docs[0].data();
t('5. password_hash tidak pernah dikembalikan; uid & wa tersedia', !('passwordHash' in u) && !('password_hash' in u) && u.uid === 'u1' && u.wa === '081');
try { await getDocs(query(collection(db, 'quotations'), { type: 'where', field: 'x', op: 'regex' as any, value: 1 })); t('6. operator tak dikenal melempar error', false); } catch { t('6. operator tak dikenal melempar error', true); }
await setDoc(doc(db, 'performaTargets', 'u9_2026_10'), { uid: 'u9', companyId: 'A', year: 2026, updatedAt: Timestamp.fromDate(new Date('2026-10-01T00:00:00Z')) });
const row = store.performa_targets[0];
t('7. alias tabel performaTargets→performa_targets; `uid` TIDAK menimpa id', row.id === 'u9_2026_10' && row.company_id === 'A' && row.payload.uid === 'u9');
t('8. Timestamp tersimpan sebagai ISO string (bukan {})', row.payload.updatedAt === '2026-10-01T00:00:00.000Z');
await updateDoc(doc(db, 'quotations', 'q0000'), { status: 'approved', approvedAt: Timestamp.fromDate(new Date('2026-03-04T00:00:00Z')) });
const q0 = store.quotations.find(r => r.id === 'q0000')!;
t('9. updateDoc: kolom → kolom, sisanya merge ke payload tanpa menghapus kunci lain', q0.status === 'approved' && q0.payload.approvedAt === '2026-03-04T00:00:00.000Z' && q0.payload.noSurat === 'N-0');
try { await setDoc(doc(db, 'tabelTidakAda', 'x'), { a: 1 }); t('10. tulis ke tabel tak dikenal ditolak', false); } catch { t('10. tulis ke tabel tak dikenal ditolak', true); }
const none = await getDocs(query(collection(db, 'tabelTidakAda')));
t('11. baca tabel tak dikenal → kosong (tanpa crash)', none.size === 0);
await setDoc(doc(db, 'users', 'u1'), { wa: '0899', jabatan: 'abaikan' });
t('12. users: wa→phone, field tanpa kolom (jabatan) tidak ditulis', store.users[0].phone === '0899' && !('jabatan' in store.users[0]));
console.log(fail ? `\nGAGAL: ${fail}` : '\nSEMUA LULUS'); process.exit(fail ? 1 : 0);
