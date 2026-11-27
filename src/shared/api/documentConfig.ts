import { getCompanySettings } from '@/shared/api/settingsService';
import type { CompanySettings } from '@/shared/api/settingsService';
import { GUCI_LETTERHEAD } from '@/shared/lib/quotationLetterPdf';
import type { Letterhead } from '@/shared/lib/quotationLetterPdf';
import { generateQuotationPDF } from '@/shared/lib/pdfGenerator';
import type { QuotationPDFData } from '@/shared/lib/pdfGenerator';
import {
    applyTemplatesToQuotation, buildLetterhead, defaultDocumentTemplates, reportOptionsFromTemplates, sanitizeTemplates,
} from '@/shared/lib/documentTemplates';
import type { CompanyIdentity, DocumentTemplates } from '@/shared/lib/documentTemplates';
import { GUCI_IDENTITY, guciTemplates, isGuciName } from '@/shared/lib/documentPresets';

export interface DocumentConfig {
    identity: CompanyIdentity;
    templates: DocumentTemplates;
    letterhead: Letterhead;
    settings?: CompanySettings;
}

export const identityFromSettings = (s: CompanySettings): CompanyIdentity => ({
    companyName: s.companyName, companyTagline: s.companyTagline, headOffice: s.headOffice, branchOffice: s.branchOffice,
    telp: s.telp, wa: s.wa, email: s.email, website: s.website, kota: s.kota,
});

const GUCI_CONFIG = (): DocumentConfig => ({ identity: GUCI_IDENTITY, templates: guciTemplates(), letterhead: GUCI_LETTERHEAD });

/**
 * Konfigurasi dokumen (kop + template + identitas) sebuah perusahaan, dari company_settings.
 *  - Tanpa companyId atau gagal dimuat → preset Guci (perilaku lama; dokumen tetap bisa dicetak).
 *  - Perusahaan Guci yang belum pernah menyimpan pengaturan → preset Guci (tampilan dokumen tidak berubah).
 *  - Selain itu → pengaturan yang disimpan admin perusahaan tersebut (bawaan netral bila belum diisi).
 */
export async function resolveDocumentConfig(companyId?: string | null): Promise<DocumentConfig> {
    if (!companyId) return GUCI_CONFIG();
    try {
        const settings = await getCompanySettings(companyId);
        if (!settings.hasSaved && isGuciName(settings.companyName)) return { ...GUCI_CONFIG(), settings };
        const templates = settings.documents ?? defaultDocumentTemplates();
        const identity = identityFromSettings(settings);
        return { identity, templates, letterhead: buildLetterhead(templates, identity), settings };
    } catch (err) {
        console.warn('[documentConfig] gagal memuat pengaturan perusahaan, memakai kop bawaan:', err);
        return GUCI_CONFIG();
    }
}

/** Membuat PDF penawaran dengan kop & template milik perusahaan. Nilai di `data` yang sudah terisi tidak ditimpa template. */
export async function generateCompanyQuotationPDF(data: QuotationPDFData, companyId?: string | null): Promise<Blob> {
    const cfg = await resolveDocumentConfig(companyId);
    return generateQuotationPDF(applyTemplatesToQuotation(data, cfg.templates, cfg.identity));
}

export { reportOptionsFromTemplates, sanitizeTemplates };
