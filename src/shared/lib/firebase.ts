/**
 * Lapisan kompatibilitas bergaya Firestore di atas Supabase (PostgREST).
 *
 * Halaman lama memanggil API ala Firestore (collection/query/where/getDocs/updateDoc/Timestamp) dengan
 * nama field camelCase (`companyId`, `isActive`, `marketingUid`) dan mengharapkan dokumen "datar".
 * Skema live memakai kolom snake_case dan menyimpan isi dokumen utama pada kolom jsonb `payload`
 * (tabel `quotations`, `spk`). Lapisan ini menerjemahkan keduanya.
 *
 * Perilaku penting (berbeda dari versi sebelumnya yang MENELAN semua error → halaman tampil kosong
 * tanpa pesan, `addDoc` mengembalikan id palsu "temp-id", dan operator `in`/`!=` diabaikan diam-diam):
 *  - Error database DILEMPAR (bukan hanya console.error).
 *  - Operator yang tidak didukung melempar error — tidak pernah diabaikan.
 *  - Membaca tabel yang tidak ada di skema → peringatan + hasil kosong; MENULIS ke tabel itu → error.
 *  - `password_hash` tidak pernah dikembalikan ke UI.
 *  - `Timestamp` serialisasinya benar (ISO-8601); versi lama menjadi `{}` saat dikirim ke DB.
 */
import { supabase, createIsolatedSupabaseClient } from "./supabase";

// ─── Timestamp ───────────────────────────────────────────────────────────────

export class Timestamp {
    private readonly _d: Date;
    constructor(d: Date) { this._d = new Date(d.getTime()); }
    static fromDate(d: Date) { return new Timestamp(d); }
    static fromMillis(ms: number) { return new Timestamp(new Date(ms)); }
    static now() { return new Timestamp(new Date()); }
    toDate() { return new Date(this._d.getTime()); }
    toMillis() { return this._d.getTime(); }
    get seconds() { return Math.floor(this._d.getTime() / 1000); }
    get nanoseconds() { return (this._d.getTime() % 1000) * 1e6; }
    /** `new Date(ts)` dan perbandingan numerik tetap bekerja. */
    valueOf() { return this._d.getTime(); }
    /** Dipakai JSON.stringify (supabase-js) → tersimpan sebagai string ISO, bukan `{}`. */
    toJSON() { return this._d.toISOString(); }
}

// ─── Metadata tabel (dari dokumentasi skema live) ────────────────────────────

const COLUMNS: Record<string, string[]> = {
    companies: ["id", "company_name", "company_slug", "status", "subscription_plan", "created_at", "updated_at"],
    users: ["id", "company_id", "name", "email", "nip", "password_hash", "role", "phone", "is_active", "created_at", "updated_at"],
    quotations: ["id", "company_id", "marketing_uid", "status", "created_at", "payload"],
    spk: ["id", "company_id", "technician_id", "status", "schedule_date", "created_at", "payload"],
    inventory_items: ["id", "company_id", "nama", "kategori", "satuan", "stok", "min_alert", "created_at", "updated_at"],
    performa_targets: ["id", "company_id", "payload", "created_at"],
    customer_checklists: ["id", "company_id", "payload", "created_at"],
    invites: ["id", "company_id", "payload", "created_at"],
    inventory_logs: ["id", "company_id", "item_id", "tanggal", "qty_masuk", "qty_keluar", "sisa_stok", "proyek", "keterangan", "created_at"],
};
/** Tabel yang isi dokumennya disimpan di kolom jsonb `payload`. */
const PAYLOAD_TABLES = new Set(["quotations", "spk", "performa_targets", "customer_checklists", "invites"]);
/** Nama koleksi gaya Firestore → tabel. */
const TABLE_ALIAS: Record<string, string> = { performaTargets: "performa_targets", customerChecklists: "customer_checklists" };
const resolveTable = (path: string) => TABLE_ALIAS[path] ?? path;
/**
 * Alias nama field gaya Firestore → kolom, KHUSUS tabel users. Di tabel lain `uid` hanyalah field biasa (mis. uid
 * teknisi di performa_targets) — alias global sebelumnya membuat `uid` MENIMPA kolom `id` baris tersebut.
 */
const FIELD_ALIAS: Record<string, Record<string, string>> = { users: { uid: "id", wa: "phone" } };
/** Field UI yang memang tidak punya kolom (diturunkan dari kolom lain) — tidak ikut ditulis. */
const NON_PERSISTED: Record<string, string[]> = { users: ["jabatan"] };
const SENSITIVE: Record<string, string[]> = { users: ["password_hash"] };

const warned = new Set<string>();
function isKnownTable(table: string) { return table in COLUMNS; }
function warnUnknownTable(table: string) {
    if (warned.has(table)) return;
    warned.add(table);
    console.warn(`[firebase-compat] Tabel "${table}" tidak ada di skema database yang terdokumentasi — dibaca sebagai kosong. Buat tabelnya atau pindahkan fitur ini ke service Supabase.`);
}

const toSnake = (table: string, k: string) => FIELD_ALIAS[table]?.[k] ?? k.replace(/[A-Z]/g, c => "_" + c.toLowerCase());
const toCamel = (k: string) => k.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const ISO_DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function reviveValue(v: unknown): unknown {
    return typeof v === "string" && ISO_DT.test(v) && !Number.isNaN(Date.parse(v)) ? new Timestamp(new Date(v)) : v;
}

function rowToData(table: string, row: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    if (PAYLOAD_TABLES.has(table) && row.payload && typeof row.payload === "object") {
        for (const [k, v] of Object.entries(row.payload)) out[k] = reviveValue(v);
    }
    for (const [k, v] of Object.entries(row)) {
        if (k === "payload" || (SENSITIVE[table] ?? []).includes(k)) continue;
        out[toCamel(k)] = reviveValue(v);
    }
    if (table === "users") { out.uid = row.id; out.wa = row.phone; }
    return out;
}

function serialize(v: unknown): unknown {
    if (v instanceof Timestamp) return v.toJSON();
    if (v instanceof Date) return v.toISOString();
    return v;
}

function splitWrite(table: string, data: Record<string, unknown>) {
    if (!isKnownTable(table)) {
        throw new Error(`Tabel "${table}" tidak ada di skema database yang terdokumentasi — data TIDAK disimpan. Buat tabelnya terlebih dahulu.`);
    }
    const cols = COLUMNS[table];
    const columns: Record<string, unknown> = {};
    const payload: Record<string, unknown> = {};
    for (const [k, v0] of Object.entries(data)) {
        if (v0 === undefined) continue;
        if ((NON_PERSISTED[table] ?? []).includes(k)) continue;
        const v = serialize(v0);
        const snake = toSnake(table, k);
        if (cols.includes(snake)) columns[snake] = v;
        else if (PAYLOAD_TABLES.has(table)) payload[k] = v;
        else throw new Error(`Kolom "${k}" tidak dikenal pada tabel ${table}.`);
    }
    return { columns, payload };
}

/** Daftar kolom untuk SELECT: tanpa kolom sensitif (password_hash) — jangan pernah `select *` pada tabel users. */
function selectList(table: string): string {
    const cols = (COLUMNS[table] ?? []).filter(c => !(SENSITIVE[table] ?? []).includes(c));
    return cols.length ? cols.join(",") : "*";
}

function fail(op: string, error: { message: string; code?: string }): never {
    const e = new Error(`${op}: ${error.message}`) as Error & { code?: string };
    e.code = error.code;
    throw e;
}

// ─── Referensi, query ────────────────────────────────────────────────────────

export const db = {};
export const auth = {};
export const storage = {};
/** Klien auth terisolasi untuk membuat akun pengguna lain tanpa menimpa sesi admin. */
export const authSecondary: { client: ReturnType<typeof createIsolatedSupabaseClient> | null } = { client: null };

export function collection(_dbObj: unknown, path: string) { return { path: resolveTable(path) }; }
export function doc(_dbObj: unknown, path: string, id?: string) { return { path: resolveTable(path), id }; }
export function query(col: { path: string }, ...constraints: Constraint[]) { return { col, constraints }; }

type Op = "==" | "!=" | ">" | ">=" | "<" | "<=" | "in" | "array-contains";
type Constraint = { type: "where"; field: string; op: Op; value: unknown } | { type: "orderBy"; field: string; dir: string };

export function where(field: string, op: Op, value: unknown): Constraint { return { type: "where", field, op, value }; }
export function orderBy(field: string, dir: string = "asc"): Constraint { return { type: "orderBy", field, dir }; }

/** Kolom nyata → nama kolom; field non-kolom pada tabel payload → path jsonb `payload->>field`. */
function columnRef(table: string, field: string): string {
    const snake = toSnake(table, field);
    if (COLUMNS[table]?.includes(snake)) return snake;
    if (PAYLOAD_TABLES.has(table)) return `payload->>${field}`;
    return snake;
}

export async function getDocs(q: { col: { path: string }; constraints?: Constraint[] }) {
    const table = q.col.path;
    if (!isKnownTable(table)) {
        warnUnknownTable(table);
        return { docs: [], size: 0, empty: true };
    }
    // PostgREST membatasi 1000 baris per permintaan (max-rows) dan MEMOTONG hasil secara diam-diam. Ambil per halaman
    // sampai habis (batas keamanan 50 halaman = 50.000 baris). Tanpa orderBy dari pemanggil, urutkan per id agar paginasi stabil.
    const PAGE = 1000, MAX_PAGES = 50;
    const hasOrder = (q.constraints ?? []).some(c => c.type === "orderBy");
    const rows: Record<string, any>[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
        let sb: any = supabase.from(table).select(selectList(table));
        for (const c of q.constraints ?? []) {
            if (c.type === "orderBy") {
                sb = sb.order(columnRef(table, c.field), { ascending: c.dir === "asc" });
                continue;
            }
            const col = columnRef(table, c.field);
            const val = serialize(c.value);
            switch (c.op) {
                case "==": sb = sb.eq(col, val); break;
                case "!=": sb = sb.neq(col, val); break;
                case ">": sb = sb.gt(col, val); break;
                case ">=": sb = sb.gte(col, val); break;
                case "<": sb = sb.lt(col, val); break;
                case "<=": sb = sb.lte(col, val); break;
                case "in": sb = sb.in(col, val as unknown[]); break;
                case "array-contains": sb = sb.contains(col, [val]); break;
                default: throw new Error(`Operator where "${String(c.op)}" tidak didukung.`);
            }
        }
        if (!hasOrder) sb = sb.order("id", { ascending: true });
        const { data, error } = await sb.range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) fail(`getDocs(${table})`, error);
        const got = (data ?? []) as Record<string, any>[];
        rows.push(...got);
        if (got.length < PAGE) break;
    }
    return {
        docs: rows.map(r => ({ id: r.id as string, data: () => rowToData(table, r), ref: { path: table, id: r.id as string } })),
        size: rows.length,
        empty: rows.length === 0,
    };
}

export async function getDoc(ref: { path: string; id?: string }) {
    if (!isKnownTable(ref.path)) {
        warnUnknownTable(ref.path);
        return { exists: () => false, data: () => null, id: ref.id };
    }
    const { data, error } = await supabase.from(ref.path).select(selectList(ref.path)).eq("id", ref.id as string).maybeSingle();
    if (error) fail(`getDoc(${ref.path})`, error);
    if (!data) return { exists: () => false, data: () => null, id: ref.id };
    return { exists: () => true, data: () => rowToData(ref.path, data), id: ref.id, ref };
}

async function mergePayload(table: string, id: string, patch: Record<string, unknown>) {
    if (!Object.keys(patch).length) return undefined;
    const { data, error } = await supabase.from(table).select("payload").eq("id", id).maybeSingle();
    if (error) fail(`updateDoc(${table}) baca payload`, error);
    if (!data) throw new Error(`Dokumen ${table}/${id} tidak ditemukan.`);
    return { ...(data.payload ?? {}), ...patch };
}

export async function setDoc(ref: { path: string; id?: string }, data: Record<string, unknown>, _options?: unknown) {
    const { columns, payload } = splitWrite(ref.path, data);
    const row: Record<string, unknown> = { ...columns, id: ref.id };
    if (PAYLOAD_TABLES.has(ref.path)) row.payload = payload;
    const { error } = await supabase.from(ref.path).upsert(row);
    if (error) fail(`setDoc(${ref.path})`, error);
}

export async function updateDoc(ref: { path: string; id?: string }, data: Record<string, unknown>) {
    const { columns, payload } = splitWrite(ref.path, data);
    const patch: Record<string, unknown> = { ...columns };
    if (PAYLOAD_TABLES.has(ref.path)) {
        const merged = await mergePayload(ref.path, ref.id as string, payload);
        if (merged) patch.payload = merged;
    }
    if (!Object.keys(patch).length) return;
    const { error } = await supabase.from(ref.path).update(patch).eq("id", ref.id as string);
    if (error) fail(`updateDoc(${ref.path})`, error);
}

export async function addDoc(col: { path: string }, data: Record<string, unknown>) {
    const { columns, payload } = splitWrite(col.path, data);
    const row: Record<string, unknown> = { ...columns };
    if (PAYLOAD_TABLES.has(col.path)) row.payload = payload;
    const { data: res, error } = await supabase.from(col.path).insert(row).select().single();
    if (error) fail(`addDoc(${col.path})`, error);
    return { id: res.id as string };
}

export async function deleteDoc(ref: { path: string; id?: string }) {
    if (!isKnownTable(ref.path)) throw new Error(`Tabel "${ref.path}" tidak ada di skema database yang terdokumentasi.`);
    const { error } = await supabase.from(ref.path).delete().eq("id", ref.id as string);
    if (error) fail(`deleteDoc(${ref.path})`, error);
}

/** CATATAN: operasi dijalankan berurutan, TIDAK atomik. Bila satu gagal, yang sebelumnya tetap tersimpan. */
export function writeBatch(_dbObj: unknown) {
    const ops: Array<{ type: "set" | "update" | "delete"; ref: { path: string; id?: string }; data?: Record<string, unknown> }> = [];
    return {
        set: (ref: { path: string; id?: string }, data: Record<string, unknown>) => { ops.push({ type: "set", ref, data }); },
        update: (ref: { path: string; id?: string }, data: Record<string, unknown>) => { ops.push({ type: "update", ref, data }); },
        delete: (ref: { path: string; id?: string }) => { ops.push({ type: "delete", ref }); },
        commit: async () => {
            for (const op of ops) {
                if (op.type === "set") await setDoc(op.ref, op.data!);
                else if (op.type === "update") await updateDoc(op.ref, op.data!);
                else await deleteDoc(op.ref);
            }
        },
    };
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export function onAuthStateChanged(_authObj: unknown, callback: (user: { uid: string; emailVerified: boolean } | null) => void) {
    supabase.auth.getSession().then(({ data: { session } }) => {
        callback(session?.user ? { uid: session.user.id, emailVerified: true } : null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        callback(session?.user ? { uid: session.user.id, emailVerified: true } : null);
    });
    return () => subscription.unsubscribe();
}

export async function signInWithEmailAndPassword(_authObj: unknown, email: string, pass: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
    return { user: { uid: data.user.id } };
}

export async function signOut(authObj: { client?: ReturnType<typeof createIsolatedSupabaseClient> | null } | unknown) {
    const client = (authObj as { client?: typeof supabase | null })?.client ?? supabase;
    await client.auth.signOut();
}

export async function sendPasswordResetEmail(_authObj: unknown, email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
}

/** Bila `authObj` = authSecondary, akun dibuat lewat klien terisolasi sehingga sesi admin TIDAK berpindah. */
export async function createUserWithEmailAndPassword(authObj: unknown, email: string, pass: string) {
    let client = supabase;
    if (authObj === authSecondary) {
        authSecondary.client ??= createIsolatedSupabaseClient();
        client = authSecondary.client;
    }
    const { data, error } = await client.auth.signUp({ email, password: pass });
    if (error) throw error;
    if (!data.user) throw new Error("Pendaftaran akun gagal: tidak ada data pengguna dari Supabase Auth.");
    return { user: { uid: data.user.id } };
}
