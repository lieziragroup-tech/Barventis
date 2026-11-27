import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../../db/pool.js';
import { asyncHandler, HttpError } from '../../utils/asyncHandler.js';
import { requireAuth, requireRole, withTenant } from '../../middleware/auth.js';
import { ADMIN_ROLES } from '../../types.js';
import { getSupabaseClient, isSupabaseStorageConfigured } from '../../lib/supabase.js';
import { getRiskConfig, updateRiskConfig, resetRiskConfig } from '../risk/riskConfigRepository.js';
import { logAction } from '../../utils/audit.js';
import { getReportOrThrow, mapReportFull } from '../workReports/reportMapper.js';
import { previewPhotoPurge, purgeOldPhotos } from '../photos/retention.js';
import { uuidParam } from '../../utils/validate.js';
import { APP_TIMEZONE } from '../risk/riskEngine.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, withTenant, requireRole(...ADMIN_ROLES));
adminRouter.param('id', uuidParam);

// ==========================================
// USER MANAGEMENT ROUTES
// ==========================================

/** Role yang boleh diberikan di dalam sebuah perusahaan. SUPERADMIN tidak pernah dibuat lewat API ini. */
const TENANT_ROLES = ['ADMIN', 'MARKETING', 'INVENTORY', 'TEKNISI_LAPANGAN'] as const;

adminRouter.get('/users', asyncHandler(async (req, res) => {
  const rows = await query(
    "select id, name, email, nip, phone, role, is_active, created_at from users where company_id = $1 order by created_at desc",
    [req.user!.companyId]
  );
  res.json({ users: rows });
}));

/** Tolak aksi bila `id` adalah satu-satunya ADMIN aktif di perusahaannya — perusahaan tidak boleh kehilangan semua admin. */
async function assertNotLastActiveAdmin(id: string, companyId: string) {
  const rows = await query<{ role: string; is_active: boolean }>('select role, is_active from users where id = $1 and company_id = $2', [id, companyId]);
  const target = rows[0];
  if (!target || target.role !== 'ADMIN' || !target.is_active) return;
  const others = await query<{ n: string }>(
    "select count(*)::text as n from users where role = 'ADMIN' and is_active = true and company_id = $2 and id <> $1", [id, companyId]
  );
  if (Number(others[0]?.n ?? 0) === 0) {
    throw new HttpError(400, 'Tidak dapat melakukan aksi ini pada satu-satunya Admin aktif.');
  }
}

const createUserSchema = z.object({
  email: z.string().email('Email tidak valid.').max(254),
  password: z.string().min(8, 'Password minimal 8 karakter.').max(128),
  name: z.string().trim().min(2, 'Nama wajib diisi.').max(120),
  role: z.enum(TENANT_ROLES),
  phone: z.string().trim().max(30).optional(),
  nip: z.string().trim().max(40).optional(),
});

/**
 * Membuat akun login (Supabase Auth) + profil `users` untuk perusahaan admin yang sedang login.
 * Dilakukan di server dengan service-role key, sehingga: sesi admin tidak berpindah, akun yatim bisa
 * dibatalkan otomatis bila penyimpanan profil gagal, dan role/perusahaan TIDAK ditentukan klien.
 */
adminRouter.post('/users', asyncHandler(async (req, res) => {
  if (!isSupabaseStorageConfigured) throw new HttpError(500, 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di server.');
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.errors[0]?.message ?? 'Data tidak valid.');
  const d = parsed.data;
  const companyId = req.user!.companyId!;

  const { data: created, error } = await getSupabaseClient().auth.admin.createUser({
    email: d.email, password: d.password, email_confirm: true,
  });
  if (error || !created.user) {
    const dup = /already|registered|exists/i.test(error?.message ?? '');
    throw new HttpError(dup ? 409 : 400, dup ? 'Email sudah terdaftar.' : `Gagal membuat akun login: ${error?.message ?? 'tidak diketahui'}`);
  }
  const uid = created.user.id;

  try {
    await query(
      `insert into users (id, company_id, name, email, password_hash, role, phone, nip, is_active)
       values ($1,$2,$3,$4,'managed-by-supabase-auth',$5,$6,$7,true)`,
      [uid, companyId, d.name, d.email.toLowerCase(), d.role, d.phone || null, d.nip || null]
    );
  } catch (err) {
    // Batalkan akun login agar tidak ada akun yatim tanpa profil.
    await getSupabaseClient().auth.admin.deleteUser(uid).catch(e => console.error('[admin] rollback akun auth gagal', uid, e));
    if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'Email atau NIP sudah dipakai pengguna lain.');
    throw err;
  }
  await logAction(req.user!, 'CREATE_USER', 'users', uid, `Membuat akun ${d.name} (${d.role}).`);
  res.status(201).json({ user: { id: uid, name: d.name, email: d.email.toLowerCase(), role: d.role, is_active: true } });
}));

adminRouter.post('/users/:id/suspend', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const companyId = req.user!.companyId!;
  if (req.user?.id === id) throw new HttpError(400, 'Tidak dapat menonaktifkan akun Anda sendiri.');
  await assertNotLastActiveAdmin(id, companyId);

  const targetUserRows = await query<{ role: string }>('select role from users where id = $1 and company_id = $2', [id, companyId]);
  if (targetUserRows.length === 0) throw new HttpError(404, 'User tidak ditemukan.');
  if (req.user!.role === 'ADMIN' && targetUserRows[0].role === 'ADMIN') {
    throw new HttpError(403, 'Admin tidak memiliki wewenang untuk menonaktifkan akun Admin lainnya. Hanya Direktur yang berwenang.');
  }

  const result = await query(
    "update users set is_active = false, updated_at = now() where id = $1 and company_id = $2 returning id",
    [id, companyId]
  );
  if (result.length === 0) throw new HttpError(404, 'User tidak ditemukan.');
  await logAction(req.user!, 'SUSPEND_USER', 'users', id, 'Akun dinonaktifkan.');
  res.json({ success: true });
}));

adminRouter.post('/users/:id/activate', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const companyId = req.user!.companyId!;
  const targetUserRows = await query<{ role: string }>('select role from users where id = $1 and company_id = $2', [id, companyId]);
  if (targetUserRows.length === 0) throw new HttpError(404, 'User tidak ditemukan.');
  if (req.user!.role === 'ADMIN' && targetUserRows[0].role === 'ADMIN') {
    throw new HttpError(403, 'Admin tidak memiliki wewenang untuk mengaktifkan akun Admin lainnya. Hanya Direktur yang berwenang.');
  }

  const result = await query(
    "update users set is_active = true, updated_at = now() where id = $1 and company_id = $2 returning id",
    [id, companyId]
  );
  if (result.length === 0) throw new HttpError(404, 'User tidak ditemukan.');
  await logAction(req.user!, 'ACTIVATE_USER', 'users', id, 'Akun diaktifkan kembali.');
  res.json({ success: true });
}));

adminRouter.delete('/users/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const companyId = req.user!.companyId!;
  if (req.user?.id === id) throw new HttpError(400, 'Tidak dapat menghapus akun Anda sendiri.');
  await assertNotLastActiveAdmin(id, companyId);

  await withTransaction(async (client) => {
    const userCheck = await client.query('select name, role from users where id = $1 and company_id = $2', [id, companyId]);
    if (userCheck.rowCount === 0) throw new HttpError(404, 'User tidak ditemukan.');
    if (req.user!.role === 'ADMIN' && userCheck.rows[0].role === 'ADMIN') {
      throw new HttpError(403, 'Admin tidak memiliki wewenang untuk menghapus akun Admin lainnya. Hanya Direktur yang berwenang.');
    }
    const userName = userCheck.rows[0].name;
    await client.query('update audit_logs set user_id = null where user_id = $1', [id]);
    await client.query('update risk_config set updated_by = null where updated_by = $1', [id]);
    await client.query('update company_settings set updated_by = null where updated_by = $1', [id]);
    await client.query('update projects set created_by = null where created_by = $1', [id]);
    await client.query('update work_reports set executor_id = null where executor_id = $1', [id]);
    await client.query('update work_reports set reviewed_by = null where reviewed_by = $1', [id]);
    await client.query('delete from user_locations where user_id = $1', [id]);
    await client.query('delete from users where id = $1 and company_id = $2', [id, companyId]);

    await client.query(
      `insert into audit_logs (user_id, user_name, user_role, action, entity_type, entity_id, details, company_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [req.user!.id, req.user!.name, req.user!.role, 'DELETE_USER', 'users', id, `Akun pengguna ${userName} telah dihapus permanen.`, companyId]
    );
  });

  // Hapus juga akun login-nya agar tidak ada kredensial yang masih berlaku tanpa profil.
  let authDeleted = true;
  if (isSupabaseStorageConfigured) {
    const { error } = await getSupabaseClient().auth.admin.deleteUser(id);
    if (error && !/not found/i.test(error.message)) { authDeleted = false; console.error('[admin] gagal menghapus akun auth', id, error.message); }
  }
  res.json({ success: true, authDeleted, message: authDeleted ? 'User berhasil dihapus.' : 'Profil dihapus, tetapi akun login belum terhapus — hapus manual di Supabase → Authentication.' });
}));

adminRouter.post('/invites', asyncHandler(async (req, res) => {
  const schema = z.object({
    role: z.enum(['SUPERADMIN', 'ADMIN', 'MARKETING', 'INVENTORY', 'TEKNISI_LAPANGAN']),
    companyId: z.string().uuid().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.errors[0]?.message ?? 'Data undangan tidak valid.');

  const companyId = parsed.data.companyId || req.user!.companyId!;
  const co = await query<{ company_name: string }>('select company_name from companies where id = $1', [companyId]);
  const companyName = co[0]?.company_name || 'PT Guci Emas Pratama';

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const payload = {
    companyId,
    companyName,
    role: parsed.data.role,
    createdBy: req.user!.id,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    used: false,
    usedBy: null,
  };

  const result = await query<{ id: string }>(
    `insert into invites (company_id, payload, created_at)
     values ($1, $2, now())
     returning id`,
    [companyId, JSON.stringify(payload)]
  );

  await logAction(req.user!, 'CREATE_INVITE', 'invites', result[0].id, `Membuat token undangan ${parsed.data.role}.`);
  res.status(201).json({
    token: result[0].id,
    expiresAt: expiresAt.toISOString(),
    role: parsed.data.role,
    companyName,
  });
}));

adminRouter.get('/invites', asyncHandler(async (req, res) => {
  const companyId = req.user!.companyId!;
  const rows = await query<{ id: string; company_id: string; payload: any; created_at: string }>(
    'select id, company_id, payload, created_at from invites where company_id = $1 order by created_at desc',
    [companyId]
  );
  res.json({
    invites: rows.map(r => ({
      id: r.id,
      companyId: r.company_id,
      companyName: r.payload?.companyName || '',
      role: r.payload?.role || 'TEKNISI_LAPANGAN',
      createdBy: r.payload?.createdBy || '',
      createdAt: r.created_at,
      expiresAt: r.payload?.expiresAt || '',
      used: Boolean(r.payload?.used),
      usedBy: r.payload?.usedBy || null,
    })),
  });
}));

adminRouter.delete('/invites/:token', asyncHandler(async (req, res) => {
  const companyId = req.user!.companyId!;
  const { token } = req.params;
  await query('delete from invites where id = $1 and company_id = $2', [token, companyId]);
  res.json({ success: true });
}));

// ==========================================


const filterSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  timeStart: z.string().optional(), // "HH:MM", applied to check_in_at's local time
  timeEnd: z.string().optional(),
  executorId: z.string().optional(),
  projectId: z.string().optional(),
  riskLevel: z.string().optional(),
  status: z.string().optional(),
  serviceType: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().min(1).optional(),
  limit: z.coerce.number().min(1).max(5000).optional(),
});

/**
 * PRD Section 28: filtering must happen in the database, not on data already
 * downloaded to the browser. Every clause below is optional and additive
 * (PRD Section 29 — filters combine with AND).
 */
function buildReportFilter(q: z.infer<typeof filterSchema>, companyId: string) {
  // SELALU dibatasi perusahaan: klausa pertama, tak bisa dilewati oleh filter lain.
  const clauses: string[] = ['wr.company_id = $1'];
  const params: unknown[] = [companyId];
  let i = 2;

  if (q.startDate) {
    clauses.push(`(wr.created_at at time zone $${i++})::date >= $${i++}::date`);
    params.push(APP_TIMEZONE, q.startDate);
  }
  if (q.endDate) {
    clauses.push(`(wr.created_at at time zone $${i++})::date <= $${i++}::date`);
    params.push(APP_TIMEZONE, q.endDate);
  }
  if (q.timeStart) {
    clauses.push(`(wr.check_in_at is null or (wr.check_in_at at time zone $${i++})::time >= $${i++}::time)`);
    params.push(APP_TIMEZONE, q.timeStart);
  }
  if (q.timeEnd) {
    clauses.push(`(wr.check_in_at is null or (wr.check_in_at at time zone $${i++})::time <= $${i++}::time)`);
    params.push(APP_TIMEZONE, q.timeEnd);
  }
  if (q.executorId && q.executorId !== 'ALL') {
    clauses.push(`wr.executor_id = $${i++}`);
    params.push(q.executorId);
  }
  if (q.projectId && q.projectId !== 'ALL') {
    clauses.push(`wr.project_id = $${i++}`);
    params.push(q.projectId);
  }
  if (q.riskLevel && q.riskLevel !== 'ALL') {
    clauses.push(`wr.risk_level = $${i++}`);
    params.push(q.riskLevel);
  }
  if (q.status && q.status !== 'ALL') {
    clauses.push(`wr.status = $${i++}`);
    params.push(q.status);
  }
  if (q.serviceType && q.serviceType !== 'ALL') {
    clauses.push(`p.service_type = $${i++}`);
    params.push(q.serviceType);
  }
  if (q.search && q.search.trim()) {
    clauses.push(`(p.project_name ilike $${i} or u.name ilike $${i})`);
    params.push(`%${q.search.trim()}%`);
    i++;
  }

  return { where: clauses.length ? `where ${clauses.join(' and ')}` : '', params };
}

const REPORT_LIST_SQL = `
  select wr.id, wr.status, wr.check_in_at, wr.check_out_at, wr.duration_seconds,
         wr.risk_score, wr.risk_level, wr.check_in_distance, wr.check_out_distance,
         wr.check_in_valid, wr.check_out_valid, wr.created_at,
         p.id as project_id, p.project_name, p.client_name, p.address, p.service_type, p.focus_target, p.target_focus,
         u.id as executor_id, coalesce(u.name, '(pengguna dihapus)') as executor_name,
         tr.application_method, tr.chemical_name, tr.dosage
  from work_reports wr
  join projects p on p.id = wr.project_id
  left join users u on u.id = wr.executor_id
  left join treatment_records tr on tr.work_report_id = wr.id
`;

function mapListRow(r: any) {
  return {
    id: r.id,
    status: r.status,
    checkInAt: r.check_in_at,
    checkOutAt: r.check_out_at,
    durationSeconds: r.duration_seconds,
    riskScore: r.risk_score,
    riskLevel: r.risk_level,
    checkInValid: r.check_in_valid,
    checkOutValid: r.check_out_valid,
    checkInDistance: r.check_in_distance,
    checkOutDistance: r.check_out_distance,
    createdAt: r.created_at,
    project: { id: r.project_id, name: r.project_name, clientName: r.client_name, address: r.address, serviceType: r.service_type, focusTarget: r.focus_target, targetFocus: typeof r.target_focus === 'string' ? JSON.parse(r.target_focus) : (r.target_focus || []) },
    executor: { id: r.executor_id, name: r.executor_name },
    treatmentSummary: r.chemical_name ? { applicationMethod: r.application_method, chemicalName: r.chemical_name, dosage: r.dosage } : null,
  };
}

adminRouter.get(
  '/reports',
  asyncHandler(async (req, res) => {
    const parsed = filterSchema.safeParse(req.query);
    if (!parsed.success) throw new HttpError(400, 'Filter tidak valid.');
    const { where, params } = buildReportFilter(parsed.data, req.user!.companyId!);
    
    // Total count for pagination
    const countResult = await query(`select count(*) as total from work_reports wr join projects p on p.id = wr.project_id left join users u on u.id = wr.executor_id ${where}`, params);
    const totalCount = parseInt(countResult[0].total, 10);
    
    // Pagination parameters
    const page = parsed.data.page || 1;
    const limit = parsed.data.limit || 20;
    const offset = (page - 1) * limit;
    
    // Add offset and limit params
    const queryParams = [...params, limit, offset];
    const limitParamIdx = params.length + 1;
    const offsetParamIdx = params.length + 2;

    const rows = await query(`${REPORT_LIST_SQL} ${where} order by wr.created_at desc limit $${limitParamIdx} offset $${offsetParamIdx}`, queryParams);
    res.json({ reports: rows.map(mapListRow), count: rows.length, totalCount, page, totalPages: Math.ceil(totalCount / limit) });
  })
);

function csvCell(v: unknown): string {
  let str = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  return `"${str.replace(/"/g, '""')}"`;
}

function fmtLocalDateTime(d: unknown): string {
  if (!d) return '';
  return new Intl.DateTimeFormat('sv-SE', { timeZone: APP_TIMEZONE, dateStyle: 'short', timeStyle: 'medium' }).format(new Date(d as string));
}

// PENTING: rute statis ini HARUS didaftarkan sebelum '/reports/:id'.
adminRouter.get(
  '/reports/export.csv',
  asyncHandler(async (req, res) => {
    const parsed = filterSchema.safeParse(req.query);
    if (!parsed.success) throw new HttpError(400, 'Filter tidak valid.');
    const { where, params } = buildReportFilter(parsed.data, req.user!.companyId!);
    const rows = await query(`${REPORT_LIST_SQL} ${where} order by wr.created_at desc limit 5000`, params);

    const header = ['Tanggal', 'Pelaksana', 'Proyek', 'Jenis Layanan', 'Status', 'Check-in', 'Check-out', 'Durasi (menit)', 'Risk Score', 'Risk Level', 'Jarak Check-in (m)', 'Jarak Check-out (m)', 'Metode Aplikasi', 'Bahan/Produk', 'Dosis'];
    const lines = [header.map(csvCell).join(',')];
    for (const r of rows) {
      lines.push([
        r.created_at ? fmtLocalDateTime(r.created_at).slice(0, 10) : '',
        r.executor_name,
        r.project_name,
        r.service_type,
        r.status,
        fmtLocalDateTime(r.check_in_at),
        fmtLocalDateTime(r.check_out_at),
        r.duration_seconds ? Math.round(r.duration_seconds / 60) : '',
        r.risk_score,
        r.risk_level,
        r.check_in_distance ?? '',
        r.check_out_distance ?? '',
        r.application_method ?? '',
        r.chemical_name ?? '',
        r.dosage ?? '',
      ].map(csvCell).join(','));
    }

    await logAction(req.user!, 'EXPORT_REPORTS', 'system', null, `Mengekspor ${rows.length} laporan ke CSV.`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="fieldwork-reports-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('\uFEFF' + lines.join('\r\n'));
  })
);

adminRouter.get(
  '/reports/:id',
  asyncHandler(async (req, res) => {
    const report = await getReportOrThrow(req.params.id, req.user!.companyId!);
    res.json({ workReport: await mapReportFull(report) });
  })
);

const summaryQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(90).optional(),
});

const CANONICAL_STATUSES = ['COMPLETED', 'REVIEWED', 'WORKING', 'READY', 'DRAFT', 'FLAGGED'] as const;

adminRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const parsed = summaryQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new HttpError(400, 'Parameter periode ringkasan tidak valid.');
    const windowDays = parsed.data.days ?? 30;
    const companyId = req.user!.companyId!;

    const [kpiRows, trendRows, statusRows, priorityRows] = await Promise.all([
      query<{
        total: string;
        completed: string;
        working: string;
        flagged: string;
        high_risk: string;
        priority_unique: string;
        avg_duration: string | null;
        avg_risk: string | null;
        period_start: string;
        period_end: string;
      }>(`
        with bounds as (
          select
            ((now() at time zone $2)::date - ($3::int - 1)) as start_date,
            (now() at time zone $2)::date as end_date
        )
        select
          count(*) as total,
          count(*) filter (where wr.status in ('COMPLETED','REVIEWED')) as completed,
          count(*) filter (where wr.status = 'WORKING') as working,
          count(*) filter (where wr.status = 'FLAGGED') as flagged,
          count(*) filter (where wr.risk_level in ('HIGH_RISK','CRITICAL')) as high_risk,
          count(*) filter (where wr.status = 'FLAGGED' or wr.risk_level in ('HIGH_RISK','CRITICAL')) as priority_unique,
          avg(wr.duration_seconds) filter (where wr.duration_seconds is not null and wr.duration_seconds > 0) as avg_duration,
          avg(wr.risk_score) as avg_risk,
          (select start_date::text from bounds) as period_start,
          (select end_date::text from bounds) as period_end
        from work_reports wr
        cross join bounds b
        where wr.company_id = $1
          and (wr.created_at at time zone $2)::date between b.start_date and b.end_date
      `, [companyId, APP_TIMEZONE, windowDays]),

      query<{
        day: string;
        total: string;
        completed: string;
        flagged: string;
      }>(`
        with days as (
          select generate_series(
            (now() at time zone $2)::date - ($3::int - 1),
            (now() at time zone $2)::date,
            interval '1 day'
          )::date as d
        )
        select
          days.d::text as day,
          count(wr.id) as total,
          count(wr.id) filter (where wr.status in ('COMPLETED','REVIEWED')) as completed,
          count(wr.id) filter (where wr.status = 'FLAGGED') as flagged
        from days
        left join work_reports wr
          on wr.company_id = $1
         and (wr.created_at at time zone $2)::date = days.d
        group by days.d
        order by days.d asc
      `, [companyId, APP_TIMEZONE, windowDays]),

      query<{ status: string; count: string }>(`
        with bounds as (
          select
            ((now() at time zone $2)::date - ($3::int - 1)) as start_date,
            (now() at time zone $2)::date as end_date
        )
        select wr.status, count(*)::text as count
        from work_reports wr
        cross join bounds b
        where wr.company_id = $1
          and (wr.created_at at time zone $2)::date between b.start_date and b.end_date
        group by wr.status
      `, [companyId, APP_TIMEZONE, windowDays]),

      query<{
        id: string;
        project_id: string;
        project_name: string;
        client_name: string;
        service_type: string;
        executor_name: string;
        status: string;
        risk_score: number;
        risk_level: string;
        check_in_valid: boolean | null;
        check_in_distance: number | null;
        duration_seconds: number | null;
        created_at: string;
      }>(`
        with bounds as (
          select
            ((now() at time zone $2)::date - ($3::int - 1)) as start_date,
            (now() at time zone $2)::date as end_date
        )
        select
          wr.id,
          p.id as project_id,
          p.project_name,
          p.client_name,
          p.service_type,
          coalesce(u.name, 'Teknisi Lapangan') as executor_name,
          wr.status,
          wr.risk_score,
          wr.risk_level,
          wr.check_in_valid,
          wr.check_in_distance,
          wr.duration_seconds,
          wr.created_at
        from work_reports wr
        join projects p on p.id = wr.project_id
        left join users u on u.id = wr.executor_id
        cross join bounds b
        where wr.company_id = $1
          and (wr.created_at at time zone $2)::date between b.start_date and b.end_date
          and (wr.status = 'FLAGGED' or wr.risk_level in ('HIGH_RISK', 'CRITICAL'))
        order by
          (case when wr.risk_level = 'CRITICAL' then 40 when wr.risk_level = 'HIGH_RISK' then 30 else 0 end
           + case when wr.status = 'FLAGGED' then 25 else 0 end) desc,
          wr.risk_score desc,
          wr.created_at desc
        limit 5
      `, [companyId, APP_TIMEZONE, windowDays]),
    ]);

    const s = kpiRows[0] || {
      total: '0',
      completed: '0',
      working: '0',
      flagged: '0',
      high_risk: '0',
      priority_unique: '0',
      avg_duration: null,
      avg_risk: null,
      period_start: '',
      period_end: '',
    };

    const statusMap = new Map<string, number>();
    for (const r of statusRows) {
      statusMap.set(r.status, Number(r.count));
    }

    res.json({
      totalJobs: Number(s.total),
      completedJobs: Number(s.completed),
      workingJobs: Number(s.working),
      flaggedJobs: Number(s.flagged),
      highRiskCount: Number(s.high_risk),
      avgDurationMinutes: s.avg_duration ? Math.round(Number(s.avg_duration) / 60) : 0,
      avgRiskScore: s.avg_risk ? Math.round(Number(s.avg_risk)) : 0,
      windowDays,
      periodStart: s.period_start,
      periodEnd: s.period_end,
      generatedAt: new Date().toISOString(),
      priorityUniqueCount: Number(s.priority_unique),
      dailyTrend: trendRows.map(r => ({
        date: r.day,
        total: Number(r.total),
        completed: Number(r.completed),
        flagged: Number(r.flagged),
      })),
      statusBreakdown: CANONICAL_STATUSES.map(status => ({
        status,
        count: statusMap.get(status) ?? 0,
      })),
      priorityReports: priorityRows.map(r => ({
        id: r.id,
        projectId: r.project_id,
        projectName: r.project_name,
        clientName: r.client_name,
        serviceType: r.service_type,
        executorName: r.executor_name,
        status: r.status,
        riskScore: Number(r.risk_score ?? 0),
        riskLevel: r.risk_level,
        checkInValid: r.check_in_valid,
        checkInDistance: r.check_in_distance != null ? Number(r.check_in_distance) : null,
        durationSeconds: r.duration_seconds != null ? Number(r.duration_seconds) : null,
        createdAt: r.created_at,
      })),
    });
  })
);

adminRouter.get(
  '/executors',
  asyncHandler(async (req, res) => {
    const rows = await query(`
      select u.id, u.name, u.email, u.nip, u.phone, u.is_active,
        count(wr.id) as total_jobs,
        count(wr.id) filter (where wr.status in ('COMPLETED','REVIEWED')) as completed_jobs,
        count(wr.id) filter (where wr.risk_level in ('HIGH_RISK','CRITICAL')) as high_risk_jobs,
        avg(wr.duration_seconds) filter (where wr.duration_seconds is not null) as avg_duration
      from users u
      left join work_reports wr on wr.executor_id = u.id
      where u.role = 'TEKNISI_LAPANGAN' and u.company_id = $1
      group by u.id
      order by u.name asc
    `, [req.user!.companyId]);
    res.json({
      executors: rows.map(r => ({
        id: r.id, name: r.name, email: r.email, nip: r.nip, phone: r.phone, isActive: r.is_active,
        totalJobs: Number(r.total_jobs), completedJobs: Number(r.completed_jobs),
        highRiskJobs: Number(r.high_risk_jobs),
        avgDurationMinutes: r.avg_duration ? Math.round(Number(r.avg_duration) / 60) : 0,
      })),
    });
  })
);

const projectFilterSchema = z.object({
  search: z.string().optional(),
  serviceType: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().min(1).optional(),
  limit: z.coerce.number().min(1).max(500).optional(),
});

adminRouter.get(
  '/projects',
  asyncHandler(async (req, res) => {
    const parsed = projectFilterSchema.safeParse(req.query);
    if (!parsed.success) throw new HttpError(400, 'Filter tidak valid.');
    const q = parsed.data;
    
    let where = 'where p.company_id = $1';
    const params: unknown[] = [req.user!.companyId];
    let i = 2;
    
    if (q.search) {
      where += " and (p.project_name ilike $" + i + " or p.client_name ilike $" + i + " or p.address ilike $" + i + " or u.name ilike $" + i + ")";
      params.push("%" + q.search + "%");
      i++;
    }
    if (q.serviceType && q.serviceType !== 'ALL') {
      where += " and p.service_type = $" + i;
      params.push(q.serviceType);
      i++;
    }
    if (q.status === 'LOCKED') {
      where += " and p.locked_at is not null";
    } else if (q.status === 'OPEN') {
      where += " and p.locked_at is null";
    }
    
    const countResult = await query("select count(*) as total from projects p left join users u on u.id = p.created_by " + where, params);
    const totalCount = parseInt(countResult[0].total, 10);
    
    const page = q.page || 1;
    const limit = q.limit || 8;
    const offset = (page - 1) * limit;
    
    const queryParams = [...params, limit, offset];
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;

    const rows = await query("select p.*, u.name as created_by_name from projects p left join users u on u.id = p.created_by " + where + " order by p.created_at desc limit $" + limitIdx + " offset $" + offsetIdx, queryParams);
    
    res.json({
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit),
      projects: rows.map(r => ({
        id: r.id, projectName: r.project_name, clientName: r.client_name, address: r.address,
        latitude: Number(r.latitude), longitude: Number(r.longitude), radius: r.radius,
        workDate: r.work_date, workType: r.work_type, serviceType: r.service_type, focusTarget: r.focus_target, targetFocus: typeof r.target_focus === 'string' ? JSON.parse(r.target_focus) : (r.target_focus || []),
        buildingAreaSqm: r.building_area_sqm !== null ? Number(r.building_area_sqm) : null,
        contractType: r.contract_type, warrantyMonths: r.warranty_months, nextServiceDate: r.next_service_date,
        createdByName: r.created_by_name, createdAt: r.created_at, lockedAt: r.locked_at,
      })),
    });
  })
);

adminRouter.get(
  '/audit-logs',
  asyncHandler(async (req, res) => {
    const rows = await query('select * from audit_logs where company_id = $1 order by created_at desc limit 200', [req.user!.companyId]);
    res.json({
      auditLogs: rows.map(r => ({
        id: r.id, userName: r.user_name, userRole: r.user_role, action: r.action,
        entityType: r.entity_type, entityId: r.entity_id, details: r.details, createdAt: r.created_at,
      })),
    });
  })
);

adminRouter.get(
  '/risk-config',
  asyncHandler(async (req, res) => {
    res.json({ riskConfig: await getRiskConfig(req.user!.companyId!) });
  })
);

const riskConfigUpdateSchema = z.object({
  lateCheckinThresholdMinutes: z.number().int().min(0).optional(),
  lateCheckinPoints: z.number().int().min(0).optional(),
  outsideRadiusPoints: z.number().int().min(0).optional(),
  shortDurationCriticalMinutes: z.number().int().min(0).optional(),
  shortDurationCriticalPoints: z.number().int().min(0).optional(),
  shortDurationWarningMinutes: z.number().int().min(0).optional(),
  shortDurationWarningPoints: z.number().int().min(0).optional(),
  minTotalPhotos: z.number().int().min(0).optional(),
  minTotalPhotosPoints: z.number().int().min(0).optional(),
  requireProgressPhoto: z.boolean().optional(),
  noProgressPhotoPoints: z.number().int().min(0).optional(),
  locationDriftThresholdMeters: z.number().int().min(0).optional(),
  locationDriftPoints: z.number().int().min(0).optional(),
  missingTreatmentRecordPoints: z.number().int().min(0).optional(),
  fumigationMissingAerationPoints: z.number().int().min(0).optional(),
  reviewThreshold: z.number().int().min(0).max(200).optional(),
  highRiskThreshold: z.number().int().min(0).max(200).optional(),
  criticalThreshold: z.number().int().min(0).max(200).optional(),
  lowRiskThreshold: z.number().int().min(0).max(200).optional(),
});

adminRouter.delete(
  '/risk-config',
  asyncHandler(async (req, res) => {
    const config = await resetRiskConfig(req.user!.companyId!);
    await logAction(req.user!, 'UPDATE_RISK_CONFIG', 'risk_config', null, 'Aturan risiko dikembalikan ke nilai bawaan.');
    res.json({ riskConfig: config });
  })
);

adminRouter.put(
  '/risk-config',
  asyncHandler(async (req, res) => {
    const parsed = riskConfigUpdateSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.errors[0]?.message ?? 'Konfigurasi tidak valid.');
    const merged = { ...(await getRiskConfig(req.user!.companyId!)), ...parsed.data };
    if (!(merged.lowRiskThreshold <= merged.reviewThreshold && merged.reviewThreshold <= merged.highRiskThreshold && merged.highRiskThreshold <= merged.criticalThreshold)) {
      throw new HttpError(400, 'Ambang risiko harus berurutan: Low ≤ Review ≤ High ≤ Critical.');
    }
    if (merged.shortDurationCriticalMinutes > merged.shortDurationWarningMinutes) {
      throw new HttpError(400, 'Batas durasi kritis tidak boleh lebih besar dari batas durasi peringatan.');
    }
    const config = await updateRiskConfig(parsed.data, req.user!.id, req.user!.companyId!);
    await logAction(req.user!, 'UPDATE_CONFIG', 'system', null, 'Admin memperbarui konfigurasi risk engine.');
    res.json({ riskConfig: config });
  })
);

const purgeQuerySchema = z.object({
  olderThanMonths: z.coerce.number().int().min(1).max(60).optional(),
});

adminRouter.get(
  '/photos/purge-preview',
  asyncHandler(async (req, res) => {
    const parsed = purgeQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new HttpError(400, 'Parameter tidak valid.');
    const preview = await previewPhotoPurge(parsed.data.olderThanMonths, req.user!.companyId!);
    res.json(preview);
  })
);

adminRouter.post(
  '/photos/purge',
  asyncHandler(async (req, res) => {
    const parsed = purgeQuerySchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Parameter tidak valid.');
    const months = parsed.data.olderThanMonths ?? 2;

    const result = await purgeOldPhotos(months, req.user!.companyId!);
    await logAction(
      req.user!,
      'PURGE_PHOTOS',
      'system',
      null,
      `Menghapus file foto lebih lama dari ${months} bulan (sebelum ${new Date(result.cutoffDate).toLocaleDateString('id-ID')}): ${result.purgedCount} berhasil, ${result.failedCount} gagal. Data laporan/riwayat lain tidak diubah.`
    );
    res.json(result);
  })
);
