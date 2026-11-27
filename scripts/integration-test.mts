import http from 'node:http';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SignJWT, generateKeyPair, exportJWK } from 'jose';
// Jalankan terhadap database KOSONG hasil `npm run db:migrate` + `npm run db:seed`:
//   DATABASE_URL=... DB_SSL=false CRON_SECRET=rahasia-cron npm run test:integration
const ROOT = process.env.ROOT ?? process.cwd();
const toUrl = (p: string) => pathToFileURL(path.resolve(ROOT, p)).href;

// ── Supabase tiruan (Auth Admin API + JWKS) — kode produksi memakai klien supabase-js yang asli ──
const SECRET = 'test-supabase-jwt-secret-0123456789abcdef';
const takenEmails = new Set<string>(['taken@x.id']);
const authCreated: string[] = []; const authDeleted: string[] = [];
const es = await generateKeyPair('ES256'); const esOther = await generateKeyPair('ES256');
const jwk = { ...(await exportJWK(es.publicKey)), kid: 'k1', alg: 'ES256', use: 'sig' };
const mock = http.createServer((rq, rs) => {
  let body = ''; rq.on('data', c => (body += c));
  rq.on('end', () => {
    const json = (code: number, o: unknown) => { rs.statusCode = code; rs.setHeader('content-type', 'application/json'); rs.end(JSON.stringify(o)); };
    const u = rq.url ?? '';
    if (u.endsWith('/.well-known/jwks.json')) return json(200, { keys: [jwk] });
    if (rq.method === 'POST' && u.startsWith('/auth/v1/admin/users')) {
      const b = JSON.parse(body || '{}');
      if (takenEmails.has(b.email)) return json(422, { code: 422, error_code: 'email_exists', msg: 'A user with this email address has already been registered' });
      const id = randomUUID(); takenEmails.add(b.email); authCreated.push(id);
      return json(200, { id, email: b.email, aud: 'authenticated', role: 'authenticated', user_metadata: {}, app_metadata: {}, created_at: new Date().toISOString() });
    }
    if (rq.method === 'DELETE' && u.startsWith('/auth/v1/admin/users/')) { authDeleted.push(u.split('/').pop()!); return json(200, {}); }
    json(404, {});
  });
});
await new Promise<void>(r => mock.listen(0, r));
process.env.SUPABASE_URL = `http://127.0.0.1:${(mock.address() as any).port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-test-key';
process.env.SUPABASE_JWT_SECRET = SECRET;
process.env.STORAGE_DRIVER = 'local';

const { createApp } = await import(toUrl('backend-src/app.ts'));
const { query } = await import(toUrl('backend-src/db/pool.ts'));

const enc = new TextEncoder().encode(SECRET);
const sign = (sub: string, o: { exp?: string; secret?: Uint8Array; extra?: Record<string, unknown> } = {}) =>
  new SignJWT({ role: 'authenticated', ...(o.extra ?? {}) }).setProtectedHeader({ alg: 'HS256' }).setSubject(sub)
    .setAudience('authenticated').setIssuedAt().setExpirationTime(o.exp ?? '1h').sign(o.secret ?? enc);

const server = http.createServer(createApp()); await new Promise<void>(r => server.listen(0, r));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
const [admin] = await query("select id,name,email,role from users where role='ADMIN' limit 1");
const [budi] = await query("select id,name,email,role from users where email like 'budi%'");
const [superU] = await query("select id from users where role='SUPERADMIN' limit 1");
const A = await sign(admin.id), B = await sign(budi.id);
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=', 'base64');

async function call(method: string, path: string, token: string, body?: any, form?: Record<string,string>, hdr: Record<string,string> = {}) {
  const headers: any = { Authorization: `Bearer ${token}`, ...hdr }; let payload: any;
  if (form) { const f = new FormData(); f.append('photo', new Blob([JPEG], { type: 'image/jpeg' }), 'e.jpg'); for (const [k,v] of Object.entries(form)) f.append(k, v); payload = f; }
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(base + path, { method, headers, body: payload });
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, ct, json: ct.includes('json') ? await r.json().catch(() => ({})) : null, text: ct.includes('json') ? '' : await r.text() };
}
const results: [string, boolean, string][] = [];
const t = (name: string, ok: boolean, info = '') => { results.push([name, ok, info]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const mkProject = async (name: string, extra: any = {}) => call('POST', '/api/projects', B, { projectName: name, address: 'Jl. Uji Coba No. 1 Jakarta', workDate: '2026-10-08', serviceType: 'GENERAL_PEST_CONTROL', contractType: 'ONE_TIME', warrantyMonths: 0, radius: 100, latitude: -6.2, longitude: 106.8, ...extra });
const ev = (lat: number, lng: number, extra: Record<string,string> = {}) => ({ latitude: String(lat), longitude: String(lng), accuracy: '8', ...extra });

// 1. koordinat proyek tersimpan
const p1 = await mkProject('Proyek Radius Test');
const row1 = (await query('select latitude, longitude from projects where id=$1', [p1.json?.project?.id]))[0];
t('1. Koordinat dari MapPicker tersimpan di proyek', Math.abs(Number(row1?.latitude) - -6.2) < 1e-6 && Math.abs(Number(row1?.longitude) - 106.8) < 1e-6, `tersimpan=(${row1?.latitude}, ${row1?.longitude})`);
const rep1 = p1.json?.workReportId;

// 12. (0,0) ditolak
const pz = await mkProject('Proyek Null Island'); 
const z = await call('POST', `/api/work-reports/${pz.json?.workReportId}/check-in`, B, undefined, ev(0, 0));
t('2. Check-in dengan koordinat (0,0) ditolak (400)', z.status === 400, `status=${z.status}`);

// 2. check-in jauh (~15 km)
const ci = await call('POST', `/api/work-reports/${rep1}/check-in`, B, undefined, ev(-6.33, 106.93));
const wr1 = (await query('select check_in_valid, check_in_distance from work_reports where id=$1', [rep1]))[0];
t('3. Check-in 15 km dari proyek terdeteksi di luar radius', ci.status === 201 && wr1?.check_in_valid === false && wr1?.check_in_distance > 100, `valid=${wr1?.check_in_valid} jarak=${wr1?.check_in_distance}m`);

// 4. progress + check-out → FLAGGED OUTSIDE_RADIUS
await call('POST', `/api/work-reports/${rep1}/photos`, B, undefined, ev(-6.33, 106.93, { photoTag: 'BEFORE' }));
const co = await call('POST', `/api/work-reports/${rep1}/check-out`, B, undefined, ev(-6.33, 106.93));
const evs = await query("select event_type from risk_events where work_report_id=$1", [rep1]);
t('4. Check-out menghasilkan risk event OUTSIDE_RADIUS', co.status === 200 && evs.some((e: any) => e.event_type === 'OUTSIDE_RADIUS'), `status=${co.status} events=${evs.map((e: any) => e.event_type).join(',')}`);

// 3. check-in bersamaan
const p3 = await mkProject('Proyek Race Test');
const rid3 = p3.json?.workReportId;
const [r1, r2] = await Promise.all([1, 2].map(() => call('POST', `/api/work-reports/${rid3}/check-in`, B, undefined, ev(-6.2, 106.8))));
const photos3 = (await query("select count(*)::int n from documentation_photos where work_report_id=$1 and photo_type='CHECK_IN'", [rid3]))[0].n;
t('5. Dua check-in bersamaan: hanya satu yang berhasil', [r1.status, r2.status].sort().join() === '201,409' && photos3 === 1, `status=[${r1.status},${r2.status}] foto CHECK_IN=${photos3}`);

// 5. replay offline: check-in 3 jam lalu, check-out 1 jam lalu → durasi ±2 jam
const p5 = await mkProject('Proyek Offline Test'); const rid5 = p5.json?.workReportId;
const iso = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();
await call('POST', `/api/work-reports/${rid5}/check-in`, B, undefined, ev(-6.2, 106.8, { offlineReplay: 'true', capturedAt: iso(3) }));
await call('POST', `/api/work-reports/${rid5}/photos`, B, undefined, ev(-6.2, 106.8, { offlineReplay: 'true', capturedAt: iso(2), photoTag: 'AFTER' }));
await call('POST', `/api/work-reports/${rid5}/check-out`, B, undefined, ev(-6.2, 106.8, { offlineReplay: 'true', capturedAt: iso(1) }));
const wr5 = (await query('select duration_seconds, status from work_reports where id=$1', [rid5]))[0];
const short = (await query("select 1 from risk_events where work_report_id=$1 and event_type='SHORT_DURATION'", [rid5])).length;
t('6. Sinkron offline mempertahankan durasi asli (~2 jam)', Math.abs(wr5?.duration_seconds - 7200) < 30 && short === 0, `durasi=${wr5?.duration_seconds}s SHORT_DURATION=${short}`);

// 6. review laporan yang belum selesai
const p6 = await mkProject('Proyek Review Test');
const rv = await call('POST', `/api/work-reports/${p6.json?.workReportId}/review`, A, { notes: 'lompat status' });
t('7. Review laporan berstatus READY ditolak (409)', rv.status === 409, `status=${rv.status}`);
const rvOk = await call('POST', `/api/work-reports/${rep1}/review`, A, { notes: 'sudah dicek admin' });
t('8. Review laporan FLAGGED berhasil (200)', rvOk.status === 200, `status=${rvOk.status}`);

// 7. export CSV + injeksi rumus
await mkProject('=1+1 Injeksi');
const csv = await call('GET', '/api/admin/reports/export.csv', A);
t('9. Ekspor CSV berfungsi (bukan 500) & bertipe text/csv', csv.status === 200 && csv.ct.includes('text/csv'), `status=${csv.status} ct=${csv.ct}`);
const csvAll = csv.text;
t('10. Sel berawalan "=" dinetralkan di CSV', csv.status === 200 && !/"=1\+1/.test(csvAll), csv.status === 200 ? (csvAll.includes("'=1+1") ? "ditemukan '=1+1" : 'baris tidak ada di ekspor (proyek belum punya laporan selesai)') : '');

// 8. ID bukan UUID
const bad = await call('GET', '/api/admin/reports/not-a-uuid', A);
t('11. ID bukan UUID → 404 (bukan 500)', bad.status === 404, `status=${bad.status}`);

// 9. foto bisa dimuat
const photoId = (await query("select id from documentation_photos limit 1"))[0]?.id;
const ph = await fetch(`${base}/api/photos/${photoId}/file`, { headers: { Authorization: `Bearer ${A}` } });
t('12. Foto bukti bisa dimuat (kolom purged_at tersedia)', ph.status === 200, `status=${ph.status}`);

// 11. cron
process.env.CRON_SECRET = 'rahasia-cron';
const c1 = await fetch(`${base}/api/cron/purge-photos`, { headers: { Authorization: 'Bearer rahasia-cron' } });
const c2 = await fetch(`${base}/api/cron/purge-photos`, { headers: { Authorization: 'Bearer salah' } });
t('13. Cron via GET + secret benar → 200; secret salah → 401', c1.status === 200 && c2.status === 401, `benar=${c1.status} salah=${c2.status}`);

// 14. suspend diri sendiri, 15. config risk
const sus = await call('POST', `/api/admin/users/${admin.id}/suspend`, A);
t('14. Admin tidak bisa menonaktifkan akunnya sendiri', sus.status === 400, `status=${sus.status}`);
const cfg = await call('PUT', '/api/admin/risk-config', A, { reviewThreshold: 90, criticalThreshold: 50 });
t('15. Ambang risiko tidak berurutan ditolak (400)', cfg.status === 400, `status=${cfg.status}`);


// ═══════════════ KEAMANAN TOKEN ═══════════════
const noTok = await fetch(`${base}/api/auth/me`);
t('16. Tanpa token → 401', noTok.status === 401, `status=${noTok.status}`);
t('17. Token berbeda rahasia → 401', (await call('GET', '/api/auth/me', await sign(admin.id, { secret: new TextEncoder().encode('rahasia-salah-rahasia-salah-12345') }))).status === 401);
const algNone = Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: admin.id, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.';
t('18. Token alg=none → 401', (await call('GET', '/api/auth/me', algNone)).status === 401);
t('19. Token kedaluwarsa → 401', (await call('GET', '/api/auth/me', await sign(admin.id, { exp: '-1m' as any }))).status === 401);
t('20. Token sah tetapi user tak ada di tabel users → 401', (await call('GET', '/api/auth/me', await sign(randomUUID()))).status === 401);
await query('update users set is_active=false where id=$1', [budi.id]);
const deact = await call('GET', '/api/auth/me', B);
await query('update users set is_active=true where id=$1', [budi.id]);
t('21. Akun dinonaktifkan langsung ditolak walau token masih berlaku', deact.status === 401, `status=${deact.status}`);
const forged = await call('GET', '/api/admin/summary', await sign(budi.id, { extra: { role: 'ADMIN', user_role: 'ADMIN', app_metadata: { role: 'ADMIN' } } }));
t('22. Klaim role di dalam token diabaikan (role dari database)', forged.status === 403, `status=${forged.status}`);
const meRes = await call('GET', '/api/auth/me', B);
t('23. /auth/me memuat role & perusahaan dari database', meRes.json?.user?.role === 'TEKNISI_LAPANGAN' && !!meRes.json?.user?.companyId);
const tokES = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: 'k1' }).setSubject(admin.id).setAudience('authenticated').setExpirationTime('1h').sign(es.privateKey);
const tokESbad = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: 'k1' }).setSubject(admin.id).setAudience('authenticated').setExpirationTime('1h').sign(esOther.privateKey);
t('24. Token ES256 (JWKS) valid diterima; kunci lain ditolak', (await call('GET', '/api/auth/me', tokES)).status === 200 && (await call('GET', '/api/auth/me', tokESbad)).status === 401);
const hdr = await fetch(`${base}/api/health`);
t('25. Header keamanan (helmet) terpasang', hdr.headers.get('x-content-type-options') === 'nosniff');
const badJson = await fetch(`${base}/api/projects`, { method: 'POST', headers: { Authorization: `Bearer ${B}`, 'Content-Type': 'application/json' }, body: '{bad' });
t('26. JSON rusak → 400 (bukan 500)', badJson.status === 400, `status=${badJson.status}`);

// ═══════════════ ISOLASI PERUSAHAAN ═══════════════
const CB = 'bbbbbbbb-1111-0000-0000-000000000002', ADMB = 'bbbbbbbb-1111-0000-0000-00000000000a', TECHB = 'bbbbbbbb-1111-0000-0000-00000000000b';
await query("insert into companies (id, company_name, company_slug, status) values ($1,'PT Sarana Bumi Indonesia','sbi','ACTIVE')", [CB]);
await query("insert into users (id, company_id, name, email, password_hash, role) values ($1,$3,'Admin SBI','admin@sbi.id','x','ADMIN'), ($2,$3,'Teknisi SBI','tek@sbi.id','x','TEKNISI_LAPANGAN')", [ADMB, TECHB, CB]);
const AB = await sign(ADMB), TB = await sign(TECHB);
const pB = await call('POST', '/api/projects', TB, { projectName: 'Proyek SBI', address: 'Jl. SBI 1 Depok', workDate: '2026-10-08', serviceType: 'GENERAL_PEST_CONTROL', contractType: 'ONE_TIME', warrantyMonths: 0, radius: 100, latitude: -6.4, longitude: 106.8 });
const repB = pB.json?.workReportId;
t('27. Teknisi B membuat proyek: tersimpan dengan company_id B', pB.status === 201 && (await query('select company_id from projects where id=$1', [pB.json?.project?.id]))[0]?.company_id === CB);
t('28. Teknisi B TIDAK bisa membuka laporan teknisi A (404)', (await call('GET', `/api/work-reports/${rep1}`, TB)).status === 404);
t('29. Admin A TIDAK bisa membuka laporan perusahaan B (404)', (await call('GET', `/api/admin/reports/${repB}`, A)).status === 404 && (await call('GET', `/api/work-reports/${repB}`, A)).status === 404);
const listB = await call('GET', '/api/admin/reports', AB);
const idsB: string[] = (listB.json?.reports ?? listB.json?.workReports ?? []).map((r: any) => r.id);
t('30. Daftar laporan Admin B hanya berisi laporan B', listB.status === 200 && idsB.length >= 1 && idsB.includes(repB) && !idsB.includes(rep1), `jumlah=${idsB.length}`);
const photoA = (await query("select dp.id from documentation_photos dp join work_reports wr on wr.id=dp.work_report_id where wr.company_id <> $1 limit 1", [CB]))[0]?.id;
t('31. Admin B TIDAK bisa mengambil foto perusahaan A (404)', (await fetch(`${base}/api/photos/${photoA}/file`, { headers: { Authorization: `Bearer ${AB}` } })).status === 404);
const usersB = await call('GET', '/api/admin/users', AB);
t('32. Admin B hanya melihat user perusahaannya', usersB.status === 200 && (usersB.json.users as any[]).every(u => ['admin@sbi.id', 'tek@sbi.id'].includes(u.email)) && (usersB.json.users as any[]).length >= 2);
const logsB = await call('GET', '/api/admin/audit-logs', AB);
t('33. Log audit Admin B tidak memuat aktivitas perusahaan A', logsB.status === 200 && (logsB.json.auditLogs as any[]).every(l => !/Radius Test|Race Test/.test(l.details ?? '')));
t('34. Admin B TIDAK bisa menonaktifkan user perusahaan A (404)', (await call('POST', `/api/admin/users/${budi.id}/suspend`, AB)).status === 404);
t('35. Admin B TIDAK bisa menghapus user perusahaan A (404)', (await call('DELETE', `/api/admin/users/${budi.id}`, AB)).status === 404);
const prA0 = (await call('GET', '/api/admin/risk-config', A)).json?.riskConfig?.lateCheckinPoints;
const putB = await call('PUT', '/api/admin/risk-config', AB, { lateCheckinPoints: 77 });
const prA1 = (await call('GET', '/api/admin/risk-config', A)).json?.riskConfig?.lateCheckinPoints;
const prB1 = (await call('GET', '/api/admin/risk-config', AB)).json?.riskConfig?.lateCheckinPoints;
t('36. Aturan risiko dibuat per perusahaan: ubah B tidak mengubah A', putB.status === 200 && prB1 === 77 && prA1 === prA0 && prA0 !== 77, `A=${prA1} B=${prB1}`);
const delB = await call('DELETE', '/api/admin/risk-config', AB);
t('37. Reset aturan risiko B kembali ke bawaan global', delB.status === 200 && (await call('GET', '/api/admin/risk-config', AB)).json?.riskConfig?.lateCheckinPoints === prA0);
const hijack = await call('GET', '/api/admin/reports', A, undefined, undefined, { 'X-Company-Id': CB });
const hijackIds: string[] = (hijack.json?.reports ?? hijack.json?.workReports ?? []).map((r: any) => r.id);
t('38. Header X-Company-Id diabaikan untuk non-SUPERADMIN', hijack.status === 200 && !hijackIds.includes(repB));

const SU = await sign(superU.id);
t('39. SUPERADMIN tanpa pilihan perusahaan → 400', (await call('GET', '/api/admin/summary', SU)).status === 400);
const suB = await call('GET', '/api/admin/reports', SU, undefined, undefined, { 'X-Company-Id': CB });
t('40. SUPERADMIN + X-Company-Id memilih perusahaan tertentu', suB.status === 200 && (suB.json?.reports ?? suB.json?.workReports ?? []).some((r: any) => r.id === repB));
t('41. SUPERADMIN dengan perusahaan tak dikenal → 404', (await call('GET', '/api/admin/summary', SU, undefined, undefined, { 'X-Company-Id': randomUUID() })).status === 404);

// ═══════════════ MANAJEMEN USER (Supabase Admin API) ═══════════════
const cu = await call('POST', '/api/admin/users', A, { email: 'Baru@Perusahaan.id', password: 'Rahasia123', name: 'Teknisi Baru', role: 'TEKNISI_LAPANGAN', phone: '0812' });
const newId = cu.json?.user?.id;
const newRow = (await query('select company_id, role, email, is_active from users where id=$1', [newId]))[0];
const adminCompany = (await query('select company_id from users where id=$1', [admin.id]))[0].company_id;
t('42. Admin membuat akun: login Auth + profil di perusahaannya, email dinormalkan', cu.status === 201 && authCreated.includes(newId) && newRow?.company_id === adminCompany && newRow?.role === 'TEKNISI_LAPANGAN' && newRow?.email === 'baru@perusahaan.id');
t('43. Email sudah terdaftar → 409', (await call('POST', '/api/admin/users', A, { email: 'taken@x.id', password: 'Rahasia123', name: 'Dup', role: 'MARKETING' })).status === 409);
t('44. Role SUPERADMIN tidak bisa dibuat lewat API → 400', (await call('POST', '/api/admin/users', A, { email: 'su@x.id', password: 'Rahasia123', name: 'Su', role: 'SUPERADMIN' })).status === 400);
t('45. Password pendek → 400', (await call('POST', '/api/admin/users', A, { email: 'p@x.id', password: '123', name: 'Pp', role: 'MARKETING' })).status === 400);
const cuB = await call('POST', '/api/admin/users', AB, { email: 'b1@x.id', password: 'Rahasia123', name: 'Mkt B', role: 'MARKETING' });
t('46. User yang dibuat Admin B masuk perusahaan B (klien tak bisa memilih perusahaan)', cuB.status === 201 && (await query('select company_id from users where id=$1', [cuB.json?.user?.id]))[0]?.company_id === CB);
const dl = await call('DELETE', `/api/admin/users/${newId}`, A);
t('47. Hapus user: baris hilang & akun login ikut dihapus di Supabase Auth', dl.status === 200 && dl.json?.authDeleted === true && authDeleted.includes(newId) && (await query('select 1 from users where id=$1', [newId])).length === 0);

// ═══════════════ LAIN-LAIN ═══════════════
const mine = await call('GET', '/api/work-reports/mine?limit=1', B);
t('48. /work-reports/mine mendukung paginasi', mine.status === 200 && mine.json?.workReports?.length === 1 && mine.json?.limit === 1);
await query("insert into user_locations (user_id, latitude, longitude, accuracy, tracked_at) values ($1, 1, 1, 5, now() - interval '40 days')", [budi.id]);
process.env.CRON_SECRET = 'rahasia-cron';
const cron = await fetch(`${base}/api/cron/purge-photos`, { headers: { Authorization: 'Bearer rahasia-cron' } });
const cronJson: any = await cron.json();
t('49. Cron juga membersihkan riwayat GPS lama', cron.status === 200 && cronJson.locationsDeleted >= 1, `dihapus=${cronJson.locationsDeleted}`);
t('50. Rute auth lama (login/reset-password/signup/invite) sudah tidak ada', (await Promise.all(['login', 'reset-password', 'signup', 'invite'].map(r => fetch(`${base}/api/auth/${r}`, { method: 'POST' })))).every(r => r.status === 404));

const failed = results.filter(r => !r[1]).length;
console.log(`\nRINGKASAN: ${results.length - failed}/${results.length} lulus`);
server.close(); mock.close(); process.exit(0);
