/**
 * SPK Service - Supabase PostgreSQL
 */
import { supabase } from '@/shared/lib/supabase';
import type { SPK } from '@/entities/types';

function toSPK(data: any): SPK {
    const p = data.payload || {};
    return {
        id: data.id,
        ...p,
        companyId: data.company_id,
        status: data.status,
        technicianId: data.technician_id,
        scheduleDate: new Date(data.schedule_date),
        createdAt: new Date(data.created_at),
        actualStart: p.actualStart ? new Date(p.actualStart) : undefined,
        actualEnd: p.actualEnd ? new Date(p.actualEnd) : undefined,
    };
}

export interface CreateSPKParams {
    quotationId: string;
    quotationNoSurat: string;
    customerName: string;
    technicianId: string;
    technicianName: string;
    scheduleDate: Date;
    serviceType: SPK["serviceType"];
    perihal: string;
    lokasi: string;
    notes: string;
    companyId: string;
    createdBy: string;
    createdByName: string;
}

export async function createSPK(params: CreateSPKParams): Promise<SPK> {
    const now = new Date();
    const payload = {
        ...params,
        scheduleDate: params.scheduleDate.toISOString(),
        createdAt: now.toISOString(),
    };

    const { data, error } = await supabase
        .from("spk")
        .insert({
            company_id: params.companyId,
            technician_id: params.technicianId,
            status: "assigned",
            schedule_date: params.scheduleDate.toISOString(),
            payload
        })
        .select()
        .single();

    if (error) throw error;
    return toSPK(data);
}

export interface GetSPKFilters {
    companyId: string;
    status?: SPK["status"];
    technicianId?: string;
}

export async function getSPKList(filters: GetSPKFilters): Promise<SPK[]> {
    let query = supabase
        .from("spk")
        .select("*")
        .eq("company_id", filters.companyId);

    if (filters.status) query = query.eq("status", filters.status);
    if (filters.technicianId) query = query.eq("technician_id", filters.technicianId);

    const { data, error } = await query.order("schedule_date", { ascending: false });
    if (error) throw error;

    return data.map(toSPK);
}

export async function getSPKById(id: string): Promise<SPK | null> {
    const { data, error } = await supabase.from("spk").select("*").eq("id", id).single();
    if (error || !data) return null;
    return toSPK(data);
}

export async function updateSPKStatus(id: string, status: SPK["status"]): Promise<void> {
    const { data: current } = await supabase.from("spk").select("payload").eq("id", id).single();
    if (!current) return;

    const payload = current.payload;
    if (status === "in_progress") payload.actualStart = new Date().toISOString();
    if (status === "done") payload.actualEnd = new Date().toISOString();

    const { error } = await supabase.from("spk").update({ status, payload }).eq("id", id);
    if (error) throw error;
}

export async function reassignSPK(
    id: string,
    technicianId: string,
    technicianName: string,
    scheduleDate: Date,
): Promise<void> {
    const { data: current } = await supabase.from("spk").select("payload").eq("id", id).single();
    if (!current) return;

    const payload = current.payload;
    payload.technicianId = technicianId;
    payload.technicianName = technicianName;
    payload.scheduleDate = scheduleDate.toISOString();

    const { error } = await supabase.from("spk").update({
        technician_id: technicianId,
        schedule_date: scheduleDate.toISOString(),
        status: "assigned",
        payload
    }).eq("id", id);

    if (error) throw error;
}
