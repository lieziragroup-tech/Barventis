/**
 * Nomor Surat Service - Supabase PostgreSQL
 * Mendukung Penomoran 2 Tahap (Dual-Stage):
 *   - Fase Draft (Surveyor/Marketing submit): GP-DRF/AR/PH/YYYY/MM/NNNN atau GP-DRF/PCO/PH/YYYY/MM/NNNN
 *   - Fase Approved / Resmi (Admin menyetujui): Langsung GP/AR/PH/YYYY/MM/NNNN atau GP/PCO/PH/YYYY/MM/NNNN (tanpa kode APR)
 */
import { supabase } from '@/shared/lib/supabase';
import { TIPE_LABELS } from '@/shared/lib/quotationConfig';
import type { NomorSuratLog, KategoriSurat, TipeKontrak, JenisLayanan, QuotationStatus, NomorStage } from '@/entities/types';

function toLog(data: any): NomorSuratLog {
    return {
        id: data.id,
        noSurat: data.noSurat,
        stage: data.stage,
        draftNoSurat: data.draftNoSurat,
        kategori: data.kategori,
        tipe: data.tipe,
        tipeLabel: data.tipeLabel,
        jenisLayanan: data.jenisLayanan,
        kepada: data.kepada,
        byUid: data.byUid,
        byName: data.byName,
        dibuat: new Date(data.dibuat),
        status: data.status,
        quoId: data.quoId,
        companyId: data.companyId,
        isManual: data.isManual,
        keteranganManual: data.keteranganManual,
    };
}

/**
 * Memastikan format nomor surat sesuai dengan stage ('DRF' | 'OFFICIAL' | 'APR').
 * Untuk nomor resmi: hilangkan kode -DRF maupun -APR sehingga menjadi bersih (contoh: GP/AR/PH/2026/10/0001 atau GP/PCO/PH/2026/10/0001).
 */
export function ensureStageInNomorSurat(noSurat: string, stage: NomorStage, kategori: KategoriSurat): string {
    if (!noSurat) return noSurat;
    // Jika stage === 'OFFICIAL' atau stage === 'APR' (Approved / Resmi): hilangkan kode -DRF atau -APR sehingga bersih
    if (stage === 'OFFICIAL' || stage === 'APR') {
        const mStage = noSurat.match(/^([A-Z0-9]+)-(DRF|APR)\/(AR|PCO)\/(.*)$/);
        if (mStage) {
            return `${mStage[1]}/${kategori || mStage[3]}/${mStage[4]}`;
        }
        const mLegacy = noSurat.match(/^([A-Z0-9]+)-(AR|PCO)\/(.*)$/);
        if (mLegacy) {
            return `${mLegacy[1]}/${mLegacy[2]}/${mLegacy[3]}`;
        }
        return noSurat.replace(/-DRF\//g, '/').replace(/-APR\//g, '/');
    }
    // Jika stage === 'DRF' (Draft): pastikan memakai -DRF/ (contoh: GP-DRF/AR/PH/2026/10/0001)
    if (noSurat.includes('-DRF/')) return noSurat;
    const mClean = noSurat.match(/^([A-Z0-9]+)\/(AR|PCO)\/(.*)$/);
    if (mClean) {
        return `${mClean[1]}-DRF/${mClean[2]}/${mClean[3]}`;
    }
    const m = noSurat.match(/^([A-Z0-9]+)-(AR|PCO)\/(.*)$/);
    if (m) {
        return `${m[1]}-DRF/${m[2]}/${m[3]}`;
    }
    const mStage = noSurat.match(/^([A-Z0-9]+)-(DRF|APR)\/(AR|PCO)\/(.*)$/);
    if (mStage) {
        return `${mStage[1]}-DRF/${kategori || mStage[3]}/${mStage[4]}`;
    }
    return noSurat;
}

export interface GenerateNomorParams {
    kategori: KategoriSurat;
    tipe: TipeKontrak;
    jenisLayanan: JenisLayanan;
    kepada: string;
    byUid: string;
    byName: string;
    companyId: string;
    stage?: NomorStage;
    dryRun?: boolean;
}

async function callGenerate(p: {
    kategori: KategoriSurat;
    tipe: string;
    tipeLabel?: string;
    kepada?: string;
    stage?: NomorStage;
    dryRun: boolean;
}): Promise<NomorSuratLog> {
    const stage: NomorStage = p.stage ?? 'DRF';
    // Mapping stage untuk kompatibilitas RPC database (DRF / APR)
    const rpcStage = (stage === 'OFFICIAL' || stage === 'APR') ? 'APR' : 'DRF';
    // Coba panggil RPC 8-argumen (dengan p_stage)
    const { data, error } = await supabase.rpc('generate_nomor_surat', {
        p_kategori: p.kategori,
        p_tipe: p.tipe,
        p_tipe_label: p.tipeLabel ?? null,
        p_kepada: p.kepada ?? null,
        p_by_name: null,
        p_dry_run: p.dryRun,
        p_tz: 'Asia/Jakarta',
        p_stage: rpcStage,
    });

    if (!error && data) {
        const log = toLog(data);
        log.noSurat = ensureStageInNomorSurat(log.noSurat, stage, p.kategori);
        log.stage = (stage === 'APR' || stage === 'OFFICIAL') ? 'OFFICIAL' : 'DRF';
        return log;
    }

    // Fallback ke RPC 6/7-argumen bila migrasi 05 belum dijalankan di DB live
    const { data: fbData, error: fbErr } = await supabase.rpc('generate_nomor_surat', {
        p_kategori: p.kategori,
        p_tipe: p.tipe,
        p_tipe_label: p.tipeLabel ?? null,
        p_kepada: p.kepada ?? null,
        p_by_name: null,
        p_dry_run: p.dryRun,
    });
    if (fbErr) throw new Error(fbErr.message);

    const log = toLog(fbData);
    const formattedNo = ensureStageInNomorSurat(log.noSurat, stage, p.kategori);
    if (!p.dryRun && formattedNo !== log.noSurat && log.id && log.id !== 'preview') {
        await supabase.from('nomor_surat_logs').update({ noSurat: formattedNo }).eq('id', log.id);
    }
    log.noSurat = formattedNo;
    log.stage = (stage === 'APR' || stage === 'OFFICIAL') ? 'OFFICIAL' : 'DRF';
    return log;
}

/**
 * Pratinjau nomor surat berikutnya.
 * Default stage = 'DRF' (GP-DRF/AR/... atau GP-DRF/PCO/...).
 */
export async function previewNomorSurat(
    kategori: KategoriSurat,
    tipe: TipeKontrak,
    _companyId?: string,
    _jenisLayanan?: string,
    stage: NomorStage = 'DRF',
): Promise<string> {
    return (await callGenerate({ kategori, tipe, stage, dryRun: true })).noSurat;
}

export async function generateNomorSurat(params: GenerateNomorParams): Promise<NomorSuratLog> {
    const { kategori, tipe, kepada, stage = 'DRF', dryRun = false } = params;
    return callGenerate({ kategori, tipe, tipeLabel: TIPE_LABELS[tipe] ?? tipe, kepada, stage, dryRun });
}

/**
 * Mengunci nomor surat di database.
 * - Saat Surveyor/Marketing membuat draft: stage = 'DRF' -> GP-DRF/AR/... atau GP-DRF/PCO/...
 * - Saat Admin melakukan Approve:         stage = 'APR' -> GP-APR/AR/... atau GP-APR/PCO/...
 */
export async function commitNomorSurat(params: GenerateNomorParams & { noSurat?: string }): Promise<NomorSuratLog> {
    const { kategori, tipe, kepada, stage = 'DRF' } = params;
    return callGenerate({ kategori, tipe, tipeLabel: TIPE_LABELS[tipe] ?? tipe, kepada, stage, dryRun: false });
}

export interface GetLogFilters {
    byUid?: string;
    kategori?: KategoriSurat;
    tipe?: TipeKontrak;
    status?: QuotationStatus;
    companyId: string;
}

export async function getNomorSuratLog(filters: GetLogFilters): Promise<NomorSuratLog[]> {
    let query = supabase.from("nomor_surat_logs").select("*").eq("companyId", filters.companyId);

    if (filters.byUid) query = query.eq("byUid", filters.byUid);
    if (filters.kategori) query = query.eq("kategori", filters.kategori);
    if (filters.tipe) query = query.eq("tipe", filters.tipe);
    if (filters.status) query = query.eq("status", filters.status);

    const { data, error } = await query;
    if (error) throw error;

    return data.map(toLog).sort((a, b) => b.dibuat.getTime() - a.dibuat.getTime());
}

export async function updateNomorSuratStatus(logId: string, status: QuotationStatus, quoId?: string): Promise<void> {
    const payload: any = { status };
    if (quoId) payload.quoId = quoId;

    const { error } = await supabase.from("nomor_surat_logs").update(payload).eq("id", logId);
    if (error) throw error;
}

export async function deleteNomorSurat(logId: string): Promise<void> {
    const { error } = await supabase.from("nomor_surat_logs").delete().eq("id", logId);
    if (error) throw error;
}

export interface AddManualNomorParams {
    noSurat: string;
    kategori: KategoriSurat;
    tipe: TipeKontrak;
    jenisLayanan: JenisLayanan;
    kepada: string;
    byUid: string;
    byName: string;
    companyId: string;
    keteranganManual?: string;
    dibuat?: Date;
}

export async function addManualNomorSurat(params: AddManualNomorParams): Promise<NomorSuratLog> {
    const now = params.dibuat ?? new Date();
    const entry = {
        noSurat: params.noSurat,
        kategori: params.kategori,
        tipe: params.tipe,
        tipeLabel: TIPE_LABELS[params.tipe] ?? params.tipe,
        jenisLayanan: params.jenisLayanan || "",
        kepada: params.kepada,
        byUid: params.byUid,
        byName: params.byName,
        dibuat: now.toISOString(),
        status: "draft",
        quoId: null,
        companyId: params.companyId,
        isManual: true,
        keteranganManual: params.keteranganManual ?? "",
    };

    const { data, error } = await supabase.from("nomor_surat_logs").insert(entry).select().single();
    if (error) throw error;
    return toLog(data);
}
