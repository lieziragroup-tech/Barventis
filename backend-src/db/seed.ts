import { getPool, withTransaction } from './pool.js';
import { evaluateWorkReportRisk, DEFAULT_RISK_CONFIG } from '../modules/risk/riskEngine.js';
import { savePhoto } from '../modules/photos/storage.js';
import { getSupabaseClient } from '../lib/supabase.js';

// Subquery perusahaan demo — dipakai di semua INSERT agar setiap baris punya company_id.
const CO = "(select id from companies where company_slug = 'demo')";

// A minimal valid 8x8 gray JPEG, used as a placeholder so seeded photo
// records resolve to a real file instead of a broken link.
const PLACEHOLDER_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';

async function seedPlaceholderPhoto(): Promise<string> {
  return savePhoto(Buffer.from(PLACEHOLDER_JPEG_BASE64, 'base64'), 'jpg');
}

/**
 * Seeds a believable pest control operations dataset covering the services
 * a real anti-rayap / pest control / fumigasi company runs day to day:
 * an ongoing termite job, a completed general pest control job with a full
 * treatment record, a flagged fumigation job missing its aeration data
 * (a safety compliance gap, not just a paperwork one), and a job ready to
 * start. Enough to exercise every screen without pretending it's bigger
 * than it is.
 */

async function seed() {
  await withTransaction(async client => {
    const existingUsers = await client.query('select count(*)::int as n from companies');
    if (existingUsers.rows[0].n > 0) {
      console.log('[seed] data sudah ada — dilewati (kosongkan tabel dulu bila ingin seed ulang).');
      return;
    }

    await client.query(`insert into companies (company_name, company_slug, status, subscription_plan) values ('PT Demo Pest Control', 'demo', 'ACTIVE', 'PRO')`);

    /**
     * Login dikelola Supabase Auth. SEED_SUPABASE_AUTH=true membuat akun login sungguhan lewat Admin API
     * (butuh SUPABASE_SERVICE_ROLE_KEY; password dari SEED_PASSWORD). Tanpa itu, hanya baris `users` yang dibuat —
     * buat akun Auth dengan email yang sama secara manual lalu samakan `users.id` dengan id akun tersebut.
     */
    const makeUser = async (name: string, email: string, nip: string | null, role: string, phone: string, companyScoped = true) => {
      let authId: string | null = null;
      if (process.env.SEED_SUPABASE_AUTH === 'true') {
        const { data, error } = await getSupabaseClient().auth.admin.createUser({
          email, password: process.env.SEED_PASSWORD || 'Demo12345!', email_confirm: true,
        });
        if (error) throw new Error(`Gagal membuat akun Auth ${email}: ${error.message}`);
        authId = data.user.id;
      }
      const r = await client.query(
        `insert into users (id, company_id, name, email, nip, password_hash, role, phone, is_active)
         values (coalesce($1::uuid, gen_random_uuid()), ${companyScoped ? CO : 'null'}, $2, $3, $4, 'managed-by-supabase-auth', $5::user_role, $6, true) returning id`,
        [authId, name, email, nip, role, phone]
      );
      return r.rows[0].id as string;
    };

    await makeUser('Super Admin', 'superadmin@fieldwork.id', null, 'SUPERADMIN', '0812-0000-0000', false);
    const adminId = await makeUser('Ahmad Fauzi', 'admin.fauzi@fieldwork.id', 'OPS-198804-001', 'ADMIN', '0812-1000-2001');
    const budiId = await makeUser('Budi Santoso', 'budi.santoso@fieldwork.id', 'TEK-202108-014', 'TEKNISI_LAPANGAN', '0813-2000-3014');
    const sintaId = await makeUser('Sinta Maharani', 'sinta.maharani@fieldwork.id', 'TEK-202203-029', 'TEKNISI_LAPANGAN', '0814-3000-4029');
    const andiId = await makeUser('Andi Pratama', 'andi.pratama@fieldwork.id', 'TEK-202301-042', 'TEKNISI_LAPANGAN', '0815-4000-5042');

    // --- Job 1: Budi — Anti Rayap (Termite Control), sedang berlangsung ---
    const projTermite = await client.query(
      `insert into projects (
        project_name, client_name, address, latitude, longitude, radius, work_date, work_type,
        service_type, focus_target, building_area_sqm, contract_type, warranty_months, scheduled_start_time, created_by, locked_at, company_id
      ) values ($1,$2,$3,$4,$5,$6,current_date,$7,'TERMITE_CONTROL',$8,$9,'ONE_TIME',24,'08:00',$10, now(), ${CO})
       returning id`,
      ['RS Hermina BSD', 'RS Hermina BSD', 'Jl. Pahlawan Seribu Kav. 1, BSD City, Serpong, Tangerang Selatan', -6.298144, 106.671342, 100,
        'Anti Rayap Pasca Konstruksi — Gedung Rawat Inap', 'Rayap Tanah (Subterranean Termite)', 850, budiId]
    );
    const checkInBudi = new Date();
    checkInBudi.setHours(8, 12, 0, 0);
    const reportBudi = await client.query(
      `insert into work_reports (company_id, project_id, executor_id, status, check_in_at, check_in_latitude, check_in_longitude, check_in_accuracy, check_in_distance, check_in_valid)
       values (${CO}, $1,$2,'WORKING',$3,-6.298151,106.671355,8,12,true) returning id`,
      [projTermite.rows[0].id, budiId, checkInBudi.toISOString()]
    );
    await client.query(
      `insert into documentation_photos (work_report_id, photo_type, storage_path, latitude, longitude, accuracy, distance_to_project, is_within_radius, captured_at, metadata)
       values ($1,'CHECK_IN',$2,-6.298151,106.671355,8,12,true,$3,$4)`,
      [reportBudi.rows[0].id, await seedPlaceholderPhoto(), checkInBudi.toISOString(), JSON.stringify({ seed: true, executorName: 'Budi Santoso', projectName: 'RS Hermina BSD' })]
    );

    // --- Job 2: Sinta — Fumigasi gudang, selesai tapi FLAGGED (di luar radius + data aerasi belum tercatat) ---
    const projFumigasi = await client.query(
      `insert into projects (
        project_name, client_name, address, latitude, longitude, radius, work_date, work_type,
        service_type, focus_target, building_area_sqm, contract_type, warranty_months, scheduled_start_time, created_by, locked_at, company_id
      ) values ($1,$2,$3,$4,$5,$6,current_date,$7,'FUMIGATION',$8,$9,'ONE_TIME',0,'09:00',$10, now(), ${CO})
       returning id`,
      ['Gudang Logistik Cikupa', 'PT Logistik Cikupa', 'Jl. Raya Cikupa No. 22, Cikupa, Tangerang', -6.223, 106.531, 100,
        'Fumigasi Gudang Komoditas Ekspor', 'Serangga Gudang & Hama Komoditas', 1200, sintaId]
    );
    const sintaCheckIn = new Date();
    sintaCheckIn.setHours(9, 14, 0, 0);
    const sintaCheckOut = new Date();
    sintaCheckOut.setHours(9, 41, 0, 0);
    const sintaTreatment = {
      applicationMethod: 'FOGGING' as const,
      chemicalName: 'Phostoxin Tablet',
      activeIngredient: 'Aluminium Phosphide 56%',
      dosage: '3 tablet / m³ ruang tertutup',
      treatmentAreaSqm: 1200,
      fumigantType: 'Phosphine (PH3)',
      gasConcentrationPpm: 1200,
      sealingStartedAt: sintaCheckIn.toISOString(),
      aerationCompletedAt: null, // sengaja kosong — memicu flag keselamatan fumigasi
    };
    const reportSintaDraft = {
      scheduledStartTime: '09:00',
      checkInAt: sintaCheckIn.toISOString(),
      checkOutAt: sintaCheckOut.toISOString(),
      checkInLatitude: -6.229, checkInLongitude: 106.538,
      checkOutLatitude: -6.229, checkOutLongitude: 106.538,
      checkInDistance: 740, checkOutDistance: 740,
      projectRadius: 100,
      photos: [{ photoType: 'CHECK_IN' as const }],
      serviceType: 'FUMIGATION' as const,
      treatmentRecord: sintaTreatment,
    };
    const riskEval = evaluateWorkReportRisk(reportSintaDraft as any, DEFAULT_RISK_CONFIG);
    const reportSinta = await client.query(
      `insert into work_reports (company_id, project_id, executor_id, status, check_in_at, check_in_latitude, check_in_longitude, check_in_accuracy, check_in_distance, check_in_valid,
        check_out_at, check_out_latitude, check_out_longitude, check_out_accuracy, check_out_distance, check_out_valid, duration_seconds, risk_score, risk_level)
       values (${CO}, $1,$2,'FLAGGED',$3,-6.229,106.538,14,740,false,$4,-6.229,106.538,15,740,false,$5,$6,$7) returning id`,
      [projFumigasi.rows[0].id, sintaId, sintaCheckIn.toISOString(), sintaCheckOut.toISOString(),
        Math.round((sintaCheckOut.getTime() - sintaCheckIn.getTime()) / 1000), riskEval.score, riskEval.level]
    );
    await client.query(
      `insert into documentation_photos (work_report_id, photo_type, storage_path, latitude, longitude, accuracy, distance_to_project, is_within_radius, captured_at, metadata)
       values ($1,'CHECK_IN',$2,-6.229,106.538,14,740,false,$3,$4)`,
      [reportSinta.rows[0].id, await seedPlaceholderPhoto(), sintaCheckIn.toISOString(), JSON.stringify({ seed: true, executorName: 'Sinta Maharani', projectName: 'Gudang Logistik Cikupa' })]
    );
    await client.query(
      `insert into treatment_records (work_report_id, application_method, chemical_name, active_ingredient, dosage, treatment_area_sqm, fumigant_type, gas_concentration_ppm, sealing_started_at, aeration_completed_at, safety_notes)
       values ($1,'FOGGING','Phostoxin Tablet','Aluminium Phosphide 56%','3 tablet / m³ ruang tertutup',1200,'Phosphine (PH3)',1200,$2,null,'Area disegel penuh dengan plastik sheet sebelum aplikasi.')`,
      [reportSinta.rows[0].id, sintaCheckIn.toISOString()]
    );
    for (const ev of riskEval.events) {
      await client.query(
        `insert into risk_events (work_report_id, event_type, points, severity, title, description, expected_value, actual_value)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [reportSinta.rows[0].id, ev.eventType, ev.points, ev.severity, ev.title, ev.description, ev.expectedValue ?? null, ev.actualValue ?? null]
      );
    }

    // --- Job 3: Andi — Pengendalian Tikus, siap check-in ---
    const projRodent = await client.query(
      `insert into projects (
        project_name, client_name, address, latitude, longitude, radius, work_date, work_type,
        service_type, focus_target, building_area_sqm, contract_type, warranty_months, next_service_date, scheduled_start_time, created_by, company_id
      ) values ($1,$2,$3,$4,$5,$6,current_date,$7,'GENERAL_PEST_CONTROL',$8,$9,'RECURRING',6,current_date + interval '1 month','08:00',$10, ${CO})
       returning id`,
      ['Kantor Cabang Sudirman', 'Bank Central Asia', 'Jl. Jend. Sudirman Kav. 22-23, Jakarta Selatan', -6.224, 106.809, 100,
        'Pengendalian Tikus Rutin Bulanan', 'Tikus Got & Tikus Rumah', 620, andiId]
    );
    await client.query(
      `insert into work_reports (company_id, project_id, executor_id, status)
       values (${CO}, $1,$2,'READY')`,
      [projRodent.rows[0].id, andiId]
    );

    // --- Job 4: Budi — Pest Control Umum, selesai bersih dengan data treatment lengkap ---
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const projPestControl = await client.query(
      `insert into projects (
        project_name, client_name, address, latitude, longitude, radius, work_date, work_type,
        service_type, focus_target, building_area_sqm, contract_type, warranty_months, next_service_date, scheduled_start_time, created_by, locked_at, company_id
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,'GENERAL_PEST_CONTROL',$9,$10,'RECURRING',3,current_date + interval '3 months','13:00',$11, now(), ${CO})
       returning id`,
      ['Ruko Cempaka Mas Blok C3', 'Toko Elektronik Cempaka', 'Jl. Cempaka Mas Raya Blok C3 No. 12, Jakarta Pusat', -6.166, 106.885, 80,
        yesterday.toISOString().slice(0, 10), 'Pest Control Umum Bulanan — Kecoa & Semut', 'Kecoa, Semut, Laba-laba', 180, budiId]
    );
    const pcCheckIn = new Date(yesterday); pcCheckIn.setHours(13, 5, 0, 0);
    const pcCheckOut = new Date(yesterday); pcCheckOut.setHours(14, 20, 0, 0);
    const reportPestControl = await client.query(
      `insert into work_reports (company_id, project_id, executor_id, status, check_in_at, check_in_latitude, check_in_longitude, check_in_accuracy, check_in_distance, check_in_valid,
        check_out_at, check_out_latitude, check_out_longitude, check_out_accuracy, check_out_distance, check_out_valid, duration_seconds, risk_score, risk_level)
       values (${CO}, $1,$2,'COMPLETED',$3,-6.166,106.885,6,4,true,$4,-6.1661,106.8851,7,9,true,$5,5,'NORMAL') returning id`,
      [projPestControl.rows[0].id, budiId, pcCheckIn.toISOString(), pcCheckOut.toISOString(), Math.round((pcCheckOut.getTime() - pcCheckIn.getTime()) / 1000)]
    );
    await client.query(
      `insert into documentation_photos (work_report_id, photo_type, photo_tag, storage_path, latitude, longitude, accuracy, distance_to_project, is_within_radius, captured_at, metadata)
       values
        ($1,'CHECK_IN',null,$2,-6.166,106.885,6,4,true,$3,$4),
        ($1,'PROGRESS','BEFORE',$2,-6.166,106.885,6,4,true,$5,$4),
        ($1,'PROGRESS','AFTER',$2,-6.166,106.885,6,4,true,$6,$4),
        ($1,'CHECK_OUT',null,$2,-6.1661,106.8851,7,9,true,$7,$4)`,
      [reportPestControl.rows[0].id, await seedPlaceholderPhoto(), pcCheckIn.toISOString(),
        JSON.stringify({ seed: true, executorName: 'Budi Santoso', projectName: 'Ruko Cempaka Mas Blok C3' }),
        new Date(pcCheckIn.getTime() + 15 * 60000).toISOString(), new Date(pcCheckIn.getTime() + 60 * 60000).toISOString(), pcCheckOut.toISOString()]
    );
    await client.query(
      `insert into treatment_records (work_report_id, application_method, chemical_name, active_ingredient, dosage, treatment_area_sqm, technician_notes)
       values ($1,'SPRAYING','Zenith Prime EC','Imidacloprid 10%','1:200 diencerkan dengan air',180,'Fokus di area dapur, gudang stok, dan celah dinding belakang etalase.')`,
      [reportPestControl.rows[0].id]
    );

    await client.query(
      `insert into audit_logs (user_id, user_name, user_role, action, entity_type, entity_id, details, company_id)
       values
        ($1,'Ahmad Fauzi','ADMIN','LOGIN','system',null,'Akun admin awal dibuat oleh seed script.',${CO}),
        ($2,'Budi Santoso','TEKNISI_LAPANGAN','CHECK_IN','work_report',$3,'Check-in valid di dalam radius proyek — Anti Rayap RS Hermina BSD.',${CO}),
        ($4,'Sinta Maharani','TEKNISI_LAPANGAN','CHECK_OUT','work_report',$5,'Check-out di luar radius, data aerasi fumigasi belum tercatat — laporan ditandai untuk peninjauan.',${CO}),
        ($2,'Budi Santoso','TEKNISI_LAPANGAN','CHECK_OUT','work_report',$6,'Pest control umum selesai, treatment tercatat lengkap.',${CO})`,
      [adminId, budiId, reportBudi.rows[0].id, sintaId, reportSinta.rows[0].id, reportPestControl.rows[0].id]
    );

    console.log('[seed] dibuat: 1 perusahaan (PT Demo Pest Control), 5 user (1 SUPERADMIN, 1 ADMIN, 3 TEKNISI), 4 proyek, 4 laporan.');
    console.log(process.env.SEED_SUPABASE_AUTH === 'true'
      ? `[seed] akun login dibuat di Supabase Auth (password: ${process.env.SEED_PASSWORD || 'Demo12345!'}).`
      : '[seed] CATATAN: akun login belum dibuat. Jalankan ulang dengan SEED_SUPABASE_AUTH=true, atau buat akun di Supabase → Authentication dengan email yang sama.');
  });
}

seed()
  .then(() => getPool().end())
  .catch(err => {
    console.error('[seed] failed:', err);
    getPool().end();
    process.exit(1);
  });
