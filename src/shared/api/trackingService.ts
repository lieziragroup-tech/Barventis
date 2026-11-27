/**
 * Tracking Service - Supabase PostgreSQL
 */
import { supabase } from '@/shared/lib/supabase';
import type { Quotation } from '@/entities/types';

export type StatusPembayaran = "belum_bayar" | "dp" | "lunas" | "nunggak";
export type StatusPengerjaan  = "pending" | "berlanjut" | "selesai" | "dibatalkan";

export interface TerminAR {
    nominalDP: number;
    tanggalDP?: Date;
    dibayarDP: boolean;
    tanggalBayarDP?: Date;
    catatanDP?: string;
    nominalPelunasan: number;
    tanggalPelunasan?: Date;
    dibayarPelunasan: boolean;
    tanggalBayarPelunasan?: Date;
    catatanPelunasan?: string;
}

export interface CicilanPCO {
    bulan: number;
    label: string;
    nominal: number;
    tanggalJatuhTempo?: Date;
    dibayar: boolean;
    tanggalBayar?: Date;
    catatan?: string;
}

export interface OrderTracking {
    id?: string;
    quotationId: string;
    noSurat: string;
    kepadaNama: string;
    total: number;
    kategori: "AR" | "PCO";
    companyId: string;
    marketingUid: string;
    marketingNama: string;
    tanggalDeal?: Date;
    statusPembayaran: StatusPembayaran;
    nominalDibayar: number;
    terminAR?: TerminAR;
    cicilanBulanan?: CicilanPCO[];
    durasiKontrak?: number;
    tanggalMulaiKontrak?: Date;
    statusPengerjaan: StatusPengerjaan;
    catatanPengerjaan?: string;
    tanggalMulai?: Date;
    tanggalSelesai?: Date;
    updatedAt: Date;
    createdAt: Date;
}

function parseDates(payload: any): any {
    if (!payload) return payload;
    const res = { ...payload };
    if (res.tanggalDeal) res.tanggalDeal = new Date(res.tanggalDeal);
    if (res.tanggalMulaiKontrak) res.tanggalMulaiKontrak = new Date(res.tanggalMulaiKontrak);
    if (res.tanggalMulai) res.tanggalMulai = new Date(res.tanggalMulai);
    if (res.tanggalSelesai) res.tanggalSelesai = new Date(res.tanggalSelesai);
    if (res.createdAt) res.createdAt = new Date(res.createdAt);
    if (res.updatedAt) res.updatedAt = new Date(res.updatedAt);

    if (res.terminAR) {
        if (res.terminAR.tanggalDP) res.terminAR.tanggalDP = new Date(res.terminAR.tanggalDP);
        if (res.terminAR.tanggalBayarDP) res.terminAR.tanggalBayarDP = new Date(res.terminAR.tanggalBayarDP);
        if (res.terminAR.tanggalPelunasan) res.terminAR.tanggalPelunasan = new Date(res.terminAR.tanggalPelunasan);
        if (res.terminAR.tanggalBayarPelunasan) res.terminAR.tanggalBayarPelunasan = new Date(res.terminAR.tanggalBayarPelunasan);
    }
    
    if (res.cicilanBulanan) {
        res.cicilanBulanan = res.cicilanBulanan.map((c: any) => ({
            ...c,
            tanggalJatuhTempo: c.tanggalJatuhTempo ? new Date(c.tanggalJatuhTempo) : undefined,
            tanggalBayar: c.tanggalBayar ? new Date(c.tanggalBayar) : undefined,
        }));
    }
    return res;
}

function stringifyDates(payload: any): any {
    if (!payload) return payload;
    const res = { ...payload };
    if (res.tanggalDeal) res.tanggalDeal = res.tanggalDeal.toISOString();
    if (res.tanggalMulaiKontrak) res.tanggalMulaiKontrak = res.tanggalMulaiKontrak.toISOString();
    if (res.tanggalMulai) res.tanggalMulai = res.tanggalMulai.toISOString();
    if (res.tanggalSelesai) res.tanggalSelesai = res.tanggalSelesai.toISOString();
    if (res.createdAt) res.createdAt = res.createdAt.toISOString();
    if (res.updatedAt) res.updatedAt = res.updatedAt.toISOString();

    if (res.terminAR) {
        if (res.terminAR.tanggalDP) res.terminAR.tanggalDP = res.terminAR.tanggalDP.toISOString();
        if (res.terminAR.tanggalBayarDP) res.terminAR.tanggalBayarDP = res.terminAR.tanggalBayarDP.toISOString();
        if (res.terminAR.tanggalPelunasan) res.terminAR.tanggalPelunasan = res.terminAR.tanggalPelunasan.toISOString();
        if (res.terminAR.tanggalBayarPelunasan) res.terminAR.tanggalBayarPelunasan = res.terminAR.tanggalBayarPelunasan.toISOString();
    }

    if (res.cicilanBulanan) {
        res.cicilanBulanan = res.cicilanBulanan.map((c: any) => ({
            ...c,
            tanggalJatuhTempo: c.tanggalJatuhTempo ? c.tanggalJatuhTempo.toISOString() : undefined,
            tanggalBayar: c.tanggalBayar ? c.tanggalBayar.toISOString() : undefined,
        }));
    }
    return res;
}

export async function getTracking(quotationId: string): Promise<OrderTracking | null> {
    const { data, error } = await supabase.from("order_tracking").select("payload").eq("id", quotationId).single();
    if (error || !data) return null;
    return parseDates(data.payload) as OrderTracking;
}

export async function getTrackingByCompany(companyId: string): Promise<OrderTracking[]> {
    const { data, error } = await supabase.from("order_tracking").select("payload").eq("company_id", companyId);
    if (error) throw error;
    return data.map((d: any) => parseDates(d.payload) as OrderTracking);
}

export async function upsertTracking(tracking: OrderTracking): Promise<void> {
    tracking.updatedAt = new Date();
    
    const { error } = await supabase.from("order_tracking").upsert({
        id: tracking.quotationId,
        company_id: tracking.companyId,
        payload: stringifyDates(tracking)
    }, { onConflict: 'id' });

    if (error) throw error;
}

export function generateTerminAR(total: number): TerminAR {
    const dp = total * 0.5;
    return {
        nominalDP: dp,
        dibayarDP: false,
        nominalPelunasan: total - dp,
        dibayarPelunasan: false,
    };
}

export function generateCicilanBulanan(total: number, durasiBulan: number, startDate?: Date): CicilanPCO[] {
    if (durasiBulan <= 0) return [];
    const perBulan = Math.round(total / durasiBulan);
    const sisa = total - (perBulan * (durasiBulan - 1));
    const cicilan: CicilanPCO[] = [];
    
    for (let i = 1; i <= durasiBulan; i++) {
        let jtDate: Date | undefined = undefined;
        if (startDate) {
            jtDate = new Date(startDate);
            jtDate.setMonth(jtDate.getMonth() + (i - 1));
        }
        cicilan.push({
            bulan: i,
            label: `Bulan ke-${i}`,
            nominal: i === durasiBulan ? sisa : perBulan,
            tanggalJatuhTempo: jtDate,
            dibayar: false,
        });
    }
    return cicilan;
}

export function computeStatusPembayaran(tracking: Partial<OrderTracking>): StatusPembayaran {
    if (tracking.kategori === "AR" && tracking.terminAR) {
        const { dibayarDP, dibayarPelunasan } = tracking.terminAR;
        if (dibayarDP && dibayarPelunasan) return "lunas";
        if (dibayarDP) return "dp";
        return "belum_bayar";
    }
    if (tracking.kategori === "PCO" && tracking.cicilanBulanan) {
        const allPaid = tracking.cicilanBulanan.every(c => c.dibayar);
        const anyPaid = tracking.cicilanBulanan.some(c => c.dibayar);
        if (allPaid) return "lunas";
        if (anyPaid) return "dp"; // using DP to mean partial payment
        return "belum_bayar";
    }
    return "belum_bayar";
}
