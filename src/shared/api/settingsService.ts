/**
 * Settings Service - Supabase PostgreSQL
 * Tabel company_settings (company_id, settings jsonb). Baca langsung (RLS: anggota perusahaan); TULIS hanya lewat RPC
 * company_settings_patch (hanya ADMIN perusahaan itu / SUPERADMIN).
 */
import { supabase } from '@/shared/lib/supabase';
import { sanitizeTemplates, defaultDocumentTemplates } from '@/shared/lib/documentTemplates';
import type { DocumentTemplates } from '@/shared/lib/documentTemplates';

export interface TemplateConfig {
    primaryColor: string;
    logoBase64: string;
    logoWidthMm: number;
    logoHeightMm: number;
    logoPosition: "left" | "right";
    showTagline: boolean;
    showBranch: boolean;
    showPageNumber: boolean;
    customTaglineText: string;
}

export const TEMPLATE_DEFAULTS: TemplateConfig = {
    primaryColor:    "#1a5c38",
    logoBase64:      "",
    logoWidthMm:     40,
    logoHeightMm:    15,
    logoPosition:    "right",
    showTagline:     true,
    showBranch:      true,
    showPageNumber:  true,
    customTaglineText: "",
};

export interface CompanySettings {
    companyName:    string;
    companyTagline?: string;
    headOffice:     string;
    branchOffice?:  string;
    telp:           string;
    wa:             string;
    email:          string;
    website:        string;
    nomorPrefix:    string;
    /** Kota penerbit surat: "Tangerang Selatan, 12 Januari 2026". */
    kota?:          string;
    ttdNama?:       string;
    ttdJabatan?:    string;
    /** Template layout lama (legacy). */
    template?:      TemplateConfig;
    /** Template dokumen resmi (penawaran, laporan kunjungan) — diatur admin perusahaan. */
    documents?:     DocumentTemplates;
    /** false = perusahaan belum pernah menyimpan pengaturan (nilai di sini hanya bawaan). */
    hasSaved?:      boolean;
    updatedAt?:     Date;
    updatedBy?:     string;
}

/**
 * Bawaan NETRAL. Sebelumnya bawaan berisi nama, alamat, WA, dan email PT Guci Emas Pratama sehingga SETIAP
 * perusahaan baru yang belum mengisi pengaturan mencetak identitas Guci di dokumennya.
 */
function blankSettings(companyName = ""): CompanySettings {
    return {
        companyName, companyTagline: "", headOffice: "", branchOffice: "", telp: "", wa: "", email: "", website: "",
        nomorPrefix: "", kota: "", ttdNama: "", ttdJabatan: "",
        template: { ...TEMPLATE_DEFAULTS }, documents: defaultDocumentTemplates(), hasSaved: false,
    };
}

export async function getCompanySettings(companyId: string): Promise<CompanySettings> {
    const [settingsRes, companyRes] = await Promise.all([
        supabase.from("company_settings").select("settings").eq("company_id", companyId).maybeSingle(),
        supabase.from("companies").select("company_name").eq("id", companyId).maybeSingle(),
    ]);
    const companyName = (companyRes.data?.company_name as string | undefined) ?? "";
    // Galat jaringan/izin harus terlihat — jangan diam-diam mengembalikan bawaan lalu menimpa data asli saat disimpan.
    if (settingsRes.error) throw new Error(`Gagal memuat pengaturan perusahaan: ${settingsRes.error.message}`);
    if (!settingsRes.data) return blankSettings(companyName);

    const d = settingsRes.data.settings as Record<string, any>;
    const base = blankSettings(companyName);
    return {
        ...base,
        ...d,
        companyName: (d.companyName as string) || companyName,
        template: { ...TEMPLATE_DEFAULTS, ...((d.template as Partial<TemplateConfig>) ?? {}) },
        documents: sanitizeTemplates(d.documents),
        hasSaved: true,
        updatedAt: d.updatedAt ? new Date(d.updatedAt) : undefined,
    };
}

/**
 * Menyimpan pengaturan lewat RPC server (merge per kunci, atomik, berotorisasi). Menyimpan identitas/template
 * TIDAK menghapus kunci lain (mis. aturan risiko). Melempar error bila bukan admin perusahaan tsb.
 */
export async function saveCompanySettings(
    companyId: string,
    settings: Omit<CompanySettings, "updatedAt" | "hasSaved">,
    updatedBy: string,
): Promise<void> {
    const patch = {
        companyName: settings.companyName, companyTagline: settings.companyTagline ?? "",
        headOffice: settings.headOffice, branchOffice: settings.branchOffice ?? "",
        telp: settings.telp, wa: settings.wa, email: settings.email, website: settings.website,
        nomorPrefix: settings.nomorPrefix, kota: settings.kota ?? "",
        ttdNama: settings.ttdNama ?? "", ttdJabatan: settings.ttdJabatan ?? "",
        template: settings.template, documents: sanitizeTemplates(settings.documents),
        updatedAt: new Date().toISOString(), updatedBy,
    };
    const { error } = await supabase.rpc("company_settings_patch", { p_company: companyId, p_patch: patch });
    if (error) {
        console.error("Failed to save settings:", error);
        throw new Error(/42501|berwenang|admin perusahaan/i.test(error.message) ? "Hanya admin perusahaan yang dapat mengubah pengaturan & template." : error.message);
    }
}
