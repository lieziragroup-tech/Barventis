import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPool } from './pool.js';

/**
 * Menjalankan supabase/migrations/*.sql secara berurutan, sekali per file (dilacak di tabel schema_migrations).
 *
 *  - Database KOSONG (dev/CI/staging baru): 00_baseline → 01 → 02 → 03 → 04 semuanya diterapkan.
 *  - Database LIVE yang sudah berisi tabel `users` tetapi belum punya pelacakan: 00 dan 01 otomatis dianggap
 *    SUDAH diterapkan (tabelnya memang sudah ada), lalu hanya 02 dan seterusnya yang dijalankan.
 *
 * Setiap file berjalan dalam satu transaksi: gagal di tengah = tidak ada yang berubah.
 */
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || join(process.cwd(), 'supabase', 'migrations');

async function migrate() {
  const client = await getPool().connect();
  try {
    await client.query(`create table if not exists public.schema_migrations (
      name text primary key, applied_at timestamptz not null default now())`);
    const files = readdirSync(MIGRATIONS_DIR).filter(f => /^\d+_.+\.sql$/.test(f)).sort();
    const applied = new Set<string>((await client.query('select name from public.schema_migrations')).rows.map(r => r.name));

    if (applied.size === 0) {
      const live = await client.query("select to_regclass('public.users') is not null as ok");
      if (live.rows[0].ok) {
        for (const f of files.filter(f => /^0[01]_/.test(f))) {
          await client.query('insert into public.schema_migrations(name) values ($1) on conflict do nothing', [f]);
          applied.add(f);
        }
        console.log('[migrate] database sudah berisi tabel — 00 & 01 ditandai sudah diterapkan.');
      }
    }

    let n = 0;
    for (const f of files) {
      if (applied.has(f)) continue;
      console.log(`[migrate] menerapkan ${f} ...`);
      try {
        await client.query('begin');
        await client.query(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
        await client.query('insert into public.schema_migrations(name) values ($1)', [f]);
        await client.query('commit');
        n++;
      } catch (err) {
        await client.query('rollback');
        throw new Error(`Migrasi ${f} gagal: ${(err as Error).message}`);
      }
    }
    console.log(n ? `[migrate] selesai — ${n} migrasi diterapkan.` : '[migrate] sudah mutakhir.');
  } finally {
    client.release();
  }
}

migrate()
  .then(() => getPool().end())
  .catch(err => {
    console.error('[migrate] failed:', err.message);
    getPool().end();
    process.exit(1);
  });
