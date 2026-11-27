import { supabase } from '@/shared/lib/supabase';

export interface InventoryItem {
    id: string;
    companyId: string;
    nama: string;
    kategori: string;
    satuan: string;
    stok: number;
    minAlert: number;
    hargaSatuan: number;
}

export interface InventoryLog {
    id: string;
    itemId: string;
    tanggal: string;      // YYYY-MM-DD
    qtyMasuk: number;
    qtyKeluar: number;
    sisaStok: number;
    projectId: string | null;
    proyek: string | null;
    tipeCatatan: 'ESTIMASI' | 'REALISASI';
    biayaTotal: number;
    keterangan: string | null;
    createdAt: Date;
}

const DEFAULT_HPP_BY_NAME: Record<string, number> = {
    'cypergard': 185000,
    'safe 1': 210000,
    'demand cs': 650000,
    'klerat': 145000,
    'lem tikus': 15000,
    'pipa pvc': 42000,
};

function inferDefaultHpp(nama: string, dbHarga: any): number {
    const n = Number(dbHarga ?? 0);
    if (n > 0) return n;
    const lower = (nama || '').toLowerCase();
    for (const [k, v] of Object.entries(DEFAULT_HPP_BY_NAME)) {
        if (lower.includes(k)) return v;
    }
    return 125000;
}

const toItem = (r: any): InventoryItem => ({
    id: r.id,
    companyId: r.company_id,
    nama: r.nama,
    kategori: r.kategori,
    satuan: r.satuan,
    stok: Number(r.stok),
    minAlert: Number(r.min_alert),
    hargaSatuan: inferDefaultHpp(r.nama, r.harga_satuan),
});

const toLog = (r: any): InventoryLog => ({
    id: r.id,
    itemId: r.item_id,
    tanggal: r.tanggal,
    qtyMasuk: Number(r.qty_masuk),
    qtyKeluar: Number(r.qty_keluar),
    sisaStok: Number(r.sisa_stok),
    projectId: r.project_id ?? null,
    proyek: r.proyek ?? null,
    tipeCatatan: (r.tipe_catatan === 'ESTIMASI' ? 'ESTIMASI' : 'REALISASI'),
    biayaTotal: Number(r.biaya_total ?? 0),
    keterangan: r.keterangan ?? null,
    createdAt: new Date(r.created_at),
});

export async function getInventoryItems(companyId: string): Promise<InventoryItem[]> {
    const { data, error } = await supabase.from('inventory_items').select('*').eq('company_id', companyId).order('nama');
    if (error) throw new Error(error.message);
    return (data ?? []).map(toItem);
}

export async function getInventoryLogs(companyId: string, opts: { from?: string; to?: string; limit?: number } = {}): Promise<InventoryLog[]> {
    let q = supabase.from('inventory_logs').select('*').eq('company_id', companyId);
    if (opts.from) q = q.gte('tanggal', opts.from);
    if (opts.to) q = q.lte('tanggal', opts.to);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(opts.limit ?? 300);
    if (error) throw new Error(error.message);
    return (data ?? []).map(toLog);
}

/**
 * Mutasi stok & pencatatan estimasi chemical per ID Proyek secara ATOMIK di server.
 */
export async function processInventoryRPC(p: {
    itemId: string;
    quantity: number;
    type: 'IN' | 'OUT';
    notes?: string;
    proyek?: string;
    projectId?: string | null;
    tipeCatatan?: 'ESTIMASI' | 'REALISASI';
}) {
    // Coba panggil RPC 7/8 parameter (mendukung p_project_id & p_tipe_catatan)
    const { data, error } = await supabase.rpc('process_inventory_mutation', {
        p_item_id: p.itemId,
        p_quantity: p.quantity,
        p_type: p.type,
        p_notes: p.notes ?? null,
        p_pencatat_id: null,
        p_proyek: p.proyek ?? null,
        p_project_id: p.projectId ?? null,
        p_tipe_catatan: p.tipeCatatan ?? 'REALISASI',
    });
    if (!error && data) {
        return data as { success: boolean; log_id: string; new_stock: number; biaya_total?: number };
    }

    // Fallback ke RPC 5-parameter bila skema lama
    const { data: fbData, error: fbErr } = await supabase.rpc('process_inventory_mutation', {
        p_item_id: p.itemId,
        p_quantity: p.quantity,
        p_type: p.type,
        p_notes: p.notes ?? null,
        p_proyek: p.proyek ?? null,
    });
    if (fbErr) throw new Error(fbErr.message);
    return fbData as { success: boolean; log_id: string; new_stock: number };
}

export interface NewItemInput {
    nama: string;
    kategori: string;
    satuan: string;
    stokAwal: number;
    minAlert: number;
    hargaSatuan?: number;
}

export async function createInventoryItem(companyId: string, input: NewItemInput): Promise<InventoryItem> {
    const payload: Record<string, unknown> = {
        company_id: companyId,
        nama: input.nama.trim(),
        kategori: input.kategori.trim() || 'Lainnya',
        satuan: input.satuan.trim() || 'Pcs',
        stok: 0,
        min_alert: input.minAlert,
    };
    if (input.hargaSatuan && input.hargaSatuan > 0) {
        payload.harga_satuan = input.hargaSatuan;
    }
    const { data, error } = await supabase.from('inventory_items').insert(payload).select().single();
    if (error) throw new Error(error.message);
    if (input.stokAwal > 0) await processInventoryRPC({ itemId: data.id, quantity: input.stokAwal, type: 'IN', notes: 'Stok awal' });
    return toItem({ ...data, stok: input.stokAwal });
}
