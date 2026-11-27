/** Klien Supabase TIRUAN (in-memory) untuk menguji lapisan kompatibilitas. Meniru PostgREST: batas 1000 baris per permintaan. */
type Row = Record<string, any>;
export const store: Record<string, Row[]> = {};
export const calls: string[] = [];
class Q {
  private f: Array<(r: Row) => boolean> = []; private ord: [string, boolean] | null = null; private rg: [number, number] | null = null;
  private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select'; private body: any; private single: 'maybe' | 'one' | null = null;
  constructor(private t: string) { store[t] ??= []; }
  private val(r: Row, c: string) { if (c.includes('->>')) { const [a, b] = c.split('->>'); return r[a]?.[b]; } return r[c]; }
  select() { return this; }
  eq(c: string, v: any) { calls.push(`eq ${c}`); this.f.push(r => this.val(r, c) === v); return this; }
  neq(c: string, v: any) { this.f.push(r => this.val(r, c) !== v); return this; }
  in(c: string, v: any[]) { calls.push(`in ${c}`); this.f.push(r => v.includes(this.val(r, c))); return this; }
  gt(c: string, v: any) { this.f.push(r => this.val(r, c) > v); return this; }
  gte(c: string, v: any) { this.f.push(r => this.val(r, c) >= v); return this; }
  lt(c: string, v: any) { this.f.push(r => this.val(r, c) < v); return this; }
  lte(c: string, v: any) { this.f.push(r => this.val(r, c) <= v); return this; }
  contains() { return this; }
  order(c: string, o: { ascending: boolean }) { this.ord = [c, o.ascending]; return this; }
  range(a: number, b: number) { this.rg = [a, b]; return this; }
  maybeSingle() { this.single = 'maybe'; return this; }
  insert(b: any) { this.op = 'insert'; this.body = b; return this; }
  update(b: any) { this.op = 'update'; this.body = b; return this; }
  upsert(b: any) { this.op = 'upsert'; this.body = b; return this; }
  delete() { this.op = 'delete'; return this; }
  then(res: (v: any) => any, rej?: (e: any) => any) { return Promise.resolve(this.run()).then(res, rej); }
  private run() {
    const rows = store[this.t];
    if (this.op === 'insert') { const r = { id: `id${rows.length + 1}`, ...this.body }; rows.push(r); calls.push(`insert ${JSON.stringify(this.body)}`); return { data: r, error: null }; }
    if (this.op === 'upsert') { const i = rows.findIndex(r => r.id === this.body.id); if (i >= 0) rows[i] = { ...rows[i], ...this.body }; else rows.push(this.body); calls.push(`upsert ${JSON.stringify(this.body)}`); return { data: null, error: null }; }
    let m = rows.filter(r => this.f.every(fn => fn(r)));
    if (this.op === 'update') { m.forEach(r => Object.assign(r, this.body)); calls.push(`update ${JSON.stringify(this.body)}`); return { data: null, error: null }; }
    if (this.op === 'delete') { store[this.t] = rows.filter(r => !m.includes(r)); return { data: null, error: null }; }
    if (this.ord) { const [c, asc] = this.ord; m = [...m].sort((a, b) => (a[c] > b[c] ? 1 : -1) * (asc ? 1 : -1)); }
    const cap = this.rg ? this.rg[1] - this.rg[0] + 1 : 1000;
    const start = this.rg ? this.rg[0] : 0;
    const page = m.slice(start, start + Math.min(cap, 1000));          // PostgREST max-rows = 1000
    if (this.single) return { data: page[0] ?? null, error: null };
    return { data: page, error: null };
  }
}
export const supabase = { from: (t: string) => new Q(t), auth: { getSession: async () => ({ data: { session: null } }), signUp: async () => ({ data: { user: null }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signInWithPassword: async () => ({ data: {}, error: null }), signOut: async () => ({}), resetPasswordForEmail: async () => ({ error: null }) } };
export const createIsolatedSupabaseClient = () => supabase;
