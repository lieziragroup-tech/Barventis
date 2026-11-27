/**
 * Quotation Service - Supabase PostgreSQL CRUD
 * Mendukung:
 *   1. Pembuatan Draft Survey oleh Marketing/Surveyor dengan kode GP-DRF/AR/... atau GP-DRF/PCO/...
 *   2. Adjustment & Negosiasi oleh Admin (ubah garansi bulan/tahun, harga satuan, diskon upah) + Re-Save Draft
 *   3. Approval oleh Admin yang menerbitkan nomor resmi GP/AR/... atau GP/PCO/... (tanpa kode APR) + Auto-Generate PDF
 */
import { supabase } from '@/shared/lib/supabase';
import { commitNomorSurat } from './nomorSuratService';
import type { Quotation, QuotationStatus, KategoriSurat, TipeKontrak, AdjustmentLogEntry } from '@/entities/types';

export async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

export function base64ToBlob(base64: string, type = "application/pdf"): Blob {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    return new Blob([bytes], { type });
}

function toQuotation(data: any): Quotation {
    const p = data.payload ?? {};
    const noSurat: string = p.noSurat ?? "";
    const inferredStage = p.stage ?? ((data.status === "approved" || data.status === "sent_to_client" || data.status === "deal" || (!noSurat.includes("-DRF/") && noSurat.includes("/"))) ? "OFFICIAL" : "DRF");
    return {
        id: data.id,
        ...p,
        stage: inferredStage,
        companyId: data.company_id,
        marketingUid: data.marketing_uid,
        status: data.status,
        createdAt: new Date(data.created_at),
        tanggal: p.tanggal ? new Date(p.tanggal) : new Date(),
        approvedAt: p.approvedAt ? new Date(p.approvedAt) : undefined,
        dealAt: p.dealAt ? new Date(p.dealAt) : undefined,
        sentToClientAt: p.sentToClientAt ? new Date(p.sentToClientAt) : undefined,
        signedAt: p.signedAt ? new Date(p.signedAt) : undefined,
        hasPdf: data.has_pdf ?? Boolean(p.pdfBase64),
        hasSignedPdf: data.has_signed_pdf ?? Boolean(p.signedPdfBase64),
    };
}

export async function saveQuotationBatch(
    data: Omit<Quotation, "id" | "createdAt">,
    nomorSuratLogId: string,
    pdfBlob: Blob,
): Promise<Quotation> {
    const pdfBase64 = await blobToBase64(pdfBlob);

    const payload = {
        ...data,
        pdfBase64,
        pdfUrl: null,
        tanggal: data.tanggal.toISOString(),
        approvedAt: data.approvedAt ? data.approvedAt.toISOString() : null,
    };

    const { data: quoDoc, error: quoErr } = await supabase
        .from("quotations")
        .insert({
            company_id: data.companyId,
            marketing_uid: data.marketingUid,
            status: data.status,
            payload
        })
        .select()
        .single();

    if (quoErr) throw quoErr;

    const { error: logErr } = await supabase
        .from("nomor_surat_logs")
        .update({ status: "pending", quoId: quoDoc.id })
        .eq("id", nomorSuratLogId);

    if (logErr) throw logErr;

    return toQuotation(quoDoc);
}

export interface GetQuotationsFilters {
    companyId: string;
    byUid?: string;
    kategori?: KategoriSurat;
    tipeKontrak?: TipeKontrak;
    status?: QuotationStatus;
}

export async function getQuotations(filters: GetQuotationsFilters): Promise<Quotation[]> {
    const PAGE_SIZE = 1000;
    const MAX_PAGES = 10;
    const allRows: any[] = [];

    for (let page = 0; page < MAX_PAGES; page++) {
        let query = supabase
            .from("quotations_light")
            .select("*")
            .eq("company_id", filters.companyId);

        if (filters.byUid) query = query.eq("marketing_uid", filters.byUid);
        if (filters.status) query = query.eq("status", filters.status);
        if (filters.kategori) query = query.eq("payload->>kategori", filters.kategori);
        if (filters.tipeKontrak) query = query.eq("payload->>tipeKontrak", filters.tipeKontrak);

        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        const { data, error } = await query
            .order("created_at", { ascending: false })
            .range(from, to);

        if (error) throw error;
        if (!data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < PAGE_SIZE) break;
    }

    return allRows.map(toQuotation);
}

export async function getQuotationById(id: string): Promise<Quotation | null> {
    const { data, error } = await supabase.from("quotations").select("*").eq("id", id).single();
    if (error || !data) return null;
    return toQuotation(data);
}

export async function getQuotationPdf(id: string, which: "pdfBase64" | "signedPdfBase64"): Promise<string | null> {
    const { data, error } = await supabase.from("quotations").select(`pdf:payload->>${which}`).eq("id", id).maybeSingle();
    if (error) throw error;
    return (data as { pdf?: string | null } | null)?.pdf ?? null;
}

async function patchQuotation(id: string, status: QuotationStatus | null, patch: Record<string, unknown>): Promise<void> {
    const { error } = await supabase.rpc("quotation_patch", {
        p_id: id, p_status: status, p_patch: JSON.parse(JSON.stringify(patch)),
    });
    if (error) throw new Error(error.message);
}

export async function updateQuotationStatus(
    id: string,
    status: QuotationStatus,
    approvedBy?: string,
    rejectionReason?: string,
    notesMarketing?: string,
    extraPatch?: Record<string, unknown>,
): Promise<void> {
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { ...(extraPatch ?? {}) };

    if (status === "approved") {
        if (approvedBy) patch.approvedBy = approvedBy;
        patch.approvedAt = now;
        patch.rejectionReason = null;
        patch.notesMarketing = null;
        patch.stage = "APR";
    }
    if (status === "rejected") {
        if (rejectionReason) patch.rejectionReason = rejectionReason;
        if (notesMarketing) patch.notesMarketing = notesMarketing;
        patch.approvedAt = now;
    }
    if (status === "sent_to_client") patch.sentToClientAt = now;
    if (status === "deal") patch.dealAt = now;

    await patchQuotation(id, status, patch);
    await supabase.from("nomor_surat_logs").update({ status }).eq("quoId", id);
}

/**
 * Meng-approve Quotation dari fase Draft (GP-DRF) ke nomor surat resmi (GP/AR/... atau GP/PCO/...):
 *   1. Menerbitkan/membersihkan nomor surat menjadi kode resmi (tanpa kode APR)
 *   2. Menyimpan nomor GP-DRF lama ke `draftNoSurat` sebagai jejak audit
 *   3. Meng-update `noSurat` utama menjadi nomor resmi
 *   4. Mengembalikan nomor resmi yang siap dicetak pada PDF resmi.
 */
export async function approveAndIssueOfficialNumber(params: {
    quotation: Quotation;
    approvedByUid: string;
    approvedByName: string;
    approvalSignatureBase64?: string;
    approvalSignedByRole?: string;
}): Promise<{ approvedNoSurat: string; draftNoSurat: string }> {
    const { quotation, approvedByUid, approvedByName, approvalSignatureBase64, approvalSignedByRole } = params;
    const currentNo = quotation.noSurat;
    const draftNoSurat = quotation.draftNoSurat ?? currentNo;

    // Hilangkan kode -DRF maupun -APR sehingga nomor surat resmi bersih (contoh: GP/AR/PH/2026/10/0001)
    let approvedNoSurat = (quotation.approvedNoSurat || currentNo)
        .replace(/-DRF\//g, "/")
        .replace(/-APR\//g, "/");

    if (!approvedNoSurat || approvedNoSurat.includes("-DRF/")) {
        const aprLog = await commitNomorSurat({
            kategori: quotation.kategori,
            tipe: quotation.tipeKontrak,
            jenisLayanan: quotation.jenisLayanan,
            kepada: quotation.kepadaNama,
            byUid: approvedByUid,
            byName: approvedByName,
            companyId: quotation.companyId,
            stage: "OFFICIAL",
        });
        approvedNoSurat = aprLog.noSurat.replace(/-DRF\//g, "/").replace(/-APR\//g, "/");
        await supabase
            .from("nomor_surat_logs")
            .update({ status: "approved", quoId: quotation.id, noSurat: approvedNoSurat, stage: "OFFICIAL", draftNoSurat })
            .eq("id", aprLog.id);
    } else {
        // Update log nomor surat yang sudah terkait dengan quotation ini agar bersih tanpa -DRF
        await supabase
            .from("nomor_surat_logs")
            .update({ status: "approved", noSurat: approvedNoSurat, stage: "OFFICIAL", draftNoSurat })
            .eq("quoId", quotation.id);
    }

    const extra: Record<string, unknown> = {
        noSurat: approvedNoSurat,
        draftNoSurat,
        approvedNoSurat,
        stage: "OFFICIAL",
    };
    if (approvalSignatureBase64) {
        extra.approvalSignatureBase64 = approvalSignatureBase64;
        extra.approvalSignedAt = new Date().toISOString();
    }
    if (approvalSignedByRole) {
        extra.approvalSignedByRole = approvalSignedByRole;
    }

    await updateQuotationStatus(
        quotation.id,
        "approved",
        approvedByName,
        undefined,
        undefined,
        extra,
    );

    return { approvedNoSurat, draftNoSurat };
}

/** Alias kompatibilitas */
export const approveAndIssueAprNumber = approveAndIssueOfficialNumber;

export async function saveQuotationDraft(
    data: Omit<Quotation, "id" | "createdAt" | "pdfBase64" | "pdfUrl">,
    nomorSuratLogId: string,
): Promise<Quotation> {
    const payload = {
        ...data,
        stage: data.stage ?? "DRF",
        draftNoSurat: data.draftNoSurat ?? data.noSurat,
        pdfBase64: null,
        pdfUrl: null,
        tanggal: data.tanggal.toISOString(),
        approvedAt: data.approvedAt ? data.approvedAt.toISOString() : null,
    };

    const { data: quoDoc, error: quoErr } = await supabase
        .from("quotations")
        .insert({
            company_id: data.companyId,
            marketing_uid: data.marketingUid,
            status: data.status,
            payload
        })
        .select()
        .single();
    if (quoErr) throw quoErr;

    const { error: logErr } = await supabase
        .from("nomor_surat_logs")
        .update({ status: "pending", quoId: quoDoc.id })
        .eq("id", nomorSuratLogId);
    if (logErr) throw logErr;

    return toQuotation(quoDoc);
}

export async function updateQuotationData(
    id: string,
    data: Partial<Quotation>,
    newAdjustmentLog?: AdjustmentLogEntry,
): Promise<void> {
    const patchData: Record<string, unknown> = { ...(data as Record<string, unknown>) };
    if (newAdjustmentLog) {
        const existing = Array.isArray(data.adjustmentHistory) ? data.adjustmentHistory : [];
        patchData.adjustmentHistory = [...existing, newAdjustmentLog];
    }
    await patchQuotation(id, null, patchData);
}

export async function attachPdfToQuotation(id: string, pdfBase64: string): Promise<void> {
    await updateQuotationData(id, { pdfBase64 });
}

export async function deleteQuotation(id: string): Promise<void> {
    const { error } = await supabase.from("quotations").delete().eq("id", id);
    if (error) throw error;
}

export interface UpdateCustomerProfileInput {
    companyId: string;
    originalName: string;
    newName: string;
    wa?: string;
    up?: string;
    address: string;
    addressFull?: string[];
    latitude?: number;
    longitude?: number;
}

/**
 * Menyimpan pembaruan profil pelanggan (nama, WA, PIC, alamat, dan koordinat GPS)
 * ke seluruh penawaran yang terhubung di database.
 */
export async function updateCustomerProfileQuotations(input: UpdateCustomerProfileInput): Promise<number> {
    const { companyId, originalName, newName, wa, up, address, addressFull, latitude, longitude } = input;

    const { data, error } = await supabase
        .from("quotations")
        .select("id, payload")
        .eq("company_id", companyId);

    if (error) throw error;
    if (!data || data.length === 0) return 0;

    const origKey = originalName.trim().toLowerCase();
    const matched = data.filter(row => {
        const p = row.payload || {};
        const qName = String(p.kepadaNama || '').trim().toLowerCase();
        return qName === origKey;
    });

    for (const item of matched) {
        const p = item.payload || {};
        const updatedPayload = {
            ...p,
            kepadaNama: newName.trim(),
            kepadaWa: wa !== undefined ? wa.trim() : p.kepadaWa,
            kepadaUp: up !== undefined ? up.trim() : p.kepadaUp,
            kepadaAlamatLines: addressFull && addressFull.length > 0 ? addressFull : [address.trim()],
            kepadaAlamat: address.trim(),
            lokasiPekerjaan: address.trim(),
            latitude: latitude !== undefined ? latitude : p.latitude,
            longitude: longitude !== undefined ? longitude : p.longitude,
        };

        await supabase
            .from("quotations")
            .update({ payload: updatedPayload })
            .eq("id", item.id);
    }

    return matched.length;
}
