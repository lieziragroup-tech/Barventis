/**
 * Preset contoh: identitas & template PT Guci Emas Pratama (sesuai surat penawaran resmi).
 * Dipakai (1) otomatis hanya untuk perusahaan Guci yang BELUM pernah menyimpan pengaturan — agar tampilan dokumen
 * mereka tidak berubah — dan (2) sebagai tombol "Muat contoh" di halaman Template. Perusahaan lain tidak terpengaruh.
 */
import type { CompanyIdentity, DocumentTemplates } from './documentTemplates';
import { defaultDocumentTemplates } from './documentTemplates';
import { COMPANY } from './quotationConfig';
import { GUCI_HEADER_LOGO, GUCI_LOGO_APMA, GUCI_LOGO_ASPPHAMI } from './brandAssets.guci';

export const GUCI_IDENTITY: CompanyIdentity = {
    companyName: COMPANY.name,
    companyTagline: '',
    headOffice: COMPANY.head.replace(/ - /g, ' – '),
    branchOffice: COMPANY.branch.replace(/ - /g, ' – '),
    telp: COMPANY.telp,
    wa: COMPANY.wa,
    email: COMPANY.email,
    website: COMPANY.web,
    kota: 'Tangerang Selatan',
};

export function guciTemplates(): DocumentTemplates {
    const t = defaultDocumentTemplates();
    t.letterhead = {
        mode: 'image', headerLogo: GUCI_HEADER_LOGO, headerLogoWidthMm: 92, brandName: '', tagline: '', brandColor: '#1a5c38',
        footerLogos: [{ src: GUCI_LOGO_ASPPHAMI, widthMm: 17 }, { src: GUCI_LOGO_APMA, widthMm: 22 }],
        footerLines: [],
    };
    t.surat.kontakKantor = COMPANY.telp.replace(/^\(021\) /, '(021) ');
    t.surat.kontakWa = COMPANY.wa.replace(/ /g, '-');
    return t;
}

export const isGuciName = (name: string) => /guci\s*emas\s*pratama/i.test(name);
