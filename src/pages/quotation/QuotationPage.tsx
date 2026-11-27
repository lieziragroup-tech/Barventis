import { supabase } from '@/shared/lib/supabase';
import React, { useState, useEffect, useMemo } from "react";
import { SignatureModal } from '@/widgets/common/SignatureModal';
import { useCompanyTemplate } from '@/shared/hooks/useCompanyTemplate';
import {
    Plus, Search, RefreshCw,
    CheckCircle2, XCircle,
} from "lucide-react";
import { useAuthStore } from '@/app/store/authStore';
import {
    getQuotations, updateQuotationStatus, deleteQuotation,
    attachPdfToQuotation, getQuotationPdf, getQuotationById,
    approveAndIssueAprNumber, blobToBase64,
} from '@/shared/api/quotationService';
import { generateCompanyQuotationPDF } from '@/shared/api/documentConfig';
import { LAYANAN_CONFIG } from '@/shared/lib/quotationConfig';
import { formatWarrantyDurationText } from '@/shared/lib/warrantyPricingEngine';
import { formatDate, formatRupiah } from '@/shared/lib/utils';
import { TabContainer } from '@/shared/ui/TabContainer';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Pagination } from '@/shared/ui/Pagination';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { QuotationFormPage } from './QuotationFormPage';
import { QuotationEditPage } from './QuotationEditPage';
import { StatusPHPage } from '../status-ph/StatusPHPage';
import { NomorSuratLogPage } from '../nomor-surat/NomorSuratLogPage';
import type { Quotation, QuotationStatus, KategoriSurat, TipeKontrak } from '@/entities/types';

const STATUS_CFG: Record<QuotationStatus, { label: string; bg: string; text: string; dot: string }> = {
    draft:          { label: "Draft (GP-DRF)",        bg: "var(--status-draft-bg)",     text: "var(--status-draft-text)",     dot: "#f59e0b" },
    pending:        { label: "Menunggu Verifikasi",   bg: "var(--status-draft-bg)",     text: "var(--status-draft-text)",     dot: "#f59e0b" },
    approved:       { label: "Approved (Resmi)",      bg: "var(--status-completed-bg)", text: "var(--status-completed-text)", dot: "#16a34a" },
    rejected:       { label: "Perlu Revisi",          bg: "var(--status-flagged-bg)",   text: "var(--status-flagged-text)",   dot: "#ef4444" },
    sent_to_client: { label: "Dikirim ke Klien",      bg: "var(--status-working-bg)",   text: "var(--status-working-text)",   dot: "#3b82f6" },
    deal:           { label: "Deal Kontrak",          bg: "var(--status-completed-bg)", text: "var(--status-completed-text)", dot: "#059669" },
    cancelled:      { label: "Batal",                 bg: "var(--status-ready-bg)",     text: "var(--status-ready-text)",     dot: "#9ca3af" },
};

function StatusBadge({ status }: { status: QuotationStatus }) {
    const c = STATUS_CFG[status] ?? STATUS_CFG.pending;
    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{ background: c.bg, color: c.text }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
            {c.label}
        </span>
    );
}

function KategoriBadge({ kategori }: { kategori: KategoriSurat }) {
    const isAR = kategori === "AR";
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold
            ${isAR ? "bg-[var(--status-working-bg)] text-[var(--status-working-text)]" : "bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]"}`}>
            {isAR ? "AR" : "PCO"}
        </span>
    );
}

type HubSubTab = "list" | "new" | "edit" | "pipeline" | "nomor-log";

const PER_PAGE = 10;

export function QuotationPage() {
    const { user } = useAuthStore();
    const templateConfig = useCompanyTemplate();

    const [subTab, setSubTab] = useState<HubSubTab>("list");
    const [editingQuotationId, setEditingQuotationId] = useState<string | null>(null);

    const [quotations, setQuotations] = useState<Quotation[]>([]);
    const [signatureTarget, setSignatureTarget] = useState<Quotation | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [filterKat, setFilterKat] = useState<"all" | KategoriSurat>("all");
    const [filterTipe, setFilterTipe] = useState<"all" | TipeKontrak>("all");
    const [filterStatus, setFilterStatus] = useState<"all" | QuotationStatus>("all");
    const [page, setPage] = useState(1);
    const debouncedSearch = useDebouncedValue(search, 300);

    const [approveTarget, setApproveTarget] = useState<Quotation | null>(null);
    const [approvalModalSig, setApprovalModalSig] = useState<string>("");
    const [viewProofTarget, setViewProofTarget] = useState<Quotation | null>(null);
    const [rejectTarget, setRejectTarget] = useState<Quotation | null>(null);
    const [rejectReason, setRejectReason] = useState("");
    const [rejectNotes, setRejectNotes] = useState("");
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const isDirector = user?.role === "SUPERADMIN";
    const canSeeAll = user?.role !== "MARKETING";
    const canApprove = user?.role === "SUPERADMIN" || user?.role === "ADMIN";
    const canCreate = user?.role === "ADMIN" || user?.role === "MARKETING";
    const canDelete = user?.role === "ADMIN";

    const load = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const data = await getQuotations({
                companyId: user.companyId,
                byUid: canSeeAll ? undefined : user.uid,
            });
            setQuotations(data);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [user]);

    const handleOpenOrRenderPdf = async (q: Quotation, download = false) => {
        const isApproved = q.status === "approved" || q.status === "deal";
        if (download && !isApproved) {
            alert("Dokumen penawaran berstatus Draft belum dapat diunduh. Berkas resmi hanya dapat diunduh setelah disetujui (ACC) oleh Admin atau Direktur.");
            return;
        }
        setActionLoading(q.id);
        try {
            let b64 = (!download && !isApproved) ? null : (q.pdfBase64 ?? (q.hasPdf ? await getQuotationPdf(q.id, "pdfBase64") : null));
            if (!b64) {
                const full = (await getQuotationById(q.id)) ?? q;
                const blob = await generateCompanyQuotationPDF({
                    noSurat: full.noSurat,
                    tanggal: full.tanggal instanceof Date ? full.tanggal : new Date(full.tanggal),
                    isDraft: !isApproved,
                    isApproved: isApproved,
                    kepadaNama: full.kepadaNama,
                    kepadaAlamatLines: full.kepadaAlamatLines,
                    kepadaUp: full.kepadaUp,
                    kepadaWa: full.kepadaWa,
                    objekPekerjaan: full.objekPekerjaan,
                    lokasiPekerjaan: full.lokasiPekerjaan,
                    jenisLayanan: full.jenisLayanan,
                    pdfVariant: full.pdfVariant,
                    isRevisi: full.isRevisi,
                    perihal: full.perihal,
                    items: full.items,
                    biayaTambahan: full.biayaTambahan,
                    upahPeralatanPct: full.upahPeralatanPct,
                    diskonUpahPct: full.diskonUpahPct,
                    diskonPct: full.diskonPct,
                    ppn: full.ppn,
                    ppnDppFaktor: full.ppnDppFaktor,
                    garansiTahun: full.garansiTahun,
                    garansiNilai: full.garansiNilai,
                    garansiUnit: full.garansiUnit,
                    jenisGaransi: full.jenisGaransi,
                    tampilkanPengontrolan: full.tampilkanPengontrolan,
                    surveyor: full.surveyor,
                    tanggalSurvey: full.tanggalSurvey ? new Date(`${full.tanggalSurvey}T00:00:00+07:00`) : full.tanggal,
                    hasilSurvey: full.hasilSurvey,
                    kunjunganPerBulan: full.kunjunganPerBulan,
                    jadwalFoggingTahun: full.jadwalFoggingTahun,
                    jadwalFoggingRows: full.jadwalFoggingRows,
                    surveyPhotos: full.surveyPhotos,
                    lampiranPages: full.lampiranPages,
                    chemicals: full.chemicals,
                    metode: full.metode,
                    focusTarget: full.focusTarget,
                    teknikPelaksanaan: full.teknikPelaksanaan,
                    marketingNama: full.marketingNama,
                    marketingWa: full.marketingWa,
                    templateConfig,
                }, user?.companyId);
                b64 = await blobToBase64(blob);
            }
            const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: "application/pdf" });
            const url = URL.createObjectURL(blob);
            if (download) {
                const a = document.createElement("a");
                a.href = url;
                a.download = `${q.noSurat.replace(/\//g, "-")}.pdf`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } else {
                window.open(url, "_blank");
            }
            setTimeout(() => URL.revokeObjectURL(url), 8000);
        } catch (err) {
            alert(err instanceof Error ? err.message : "Gagal membuka PDF penawaran.");
        } finally {
            setActionLoading(null);
        }
    };

    const generateQuickApprovalStamp = (signerName: string, signerRole: string) => {
        const dateStr = new Date().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="130" viewBox="0 0 420 130">
            <rect width="416" height="126" x="2" y="2" rx="12" fill="#f0fdf4" stroke="#16a34a" stroke-width="2" stroke-dasharray="6,4"/>
            <text x="20" y="28" font-family="monospace" font-size="10" font-weight="bold" fill="#15803d">BUKTI APPROVAL INTERNAL FIELDWORK (NON-DOWNLOAD)</text>
            <path d="M35 82 C 75 38, 115 95, 160 54 C 195 25, 225 88, 275 48 C 305 32, 340 68, 380 45" fill="none" stroke="#1a5c38" stroke-width="3.2" stroke-linecap="round"/>
            <text x="20" y="102" font-family="sans-serif" font-size="13" font-weight="bold" fill="#0f172a">${signerName.replace(/[<>&"']/g, "")} (${signerRole})</text>
            <text x="20" y="118" font-family="monospace" font-size="10" fill="#475569">Disetujui: ${dateStr} WIB</text>
        </svg>`;
        return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
    };

    // Approve: Hilangkan kode -DRF -> Nomor Resmi GP/... + Simpan Bukti Approval Non-Download + Auto-Sync Proyek
    // adjustmentHistory tetap dipertahankan untuk audit
    const handleApprove = async () => {
        if (!approveTarget || !user) return;
        setActionLoading(approveTarget.id);
        try {
            const full = (await getQuotationById(approveTarget.id)) ?? approveTarget;
            const sigProof = approvalModalSig || generateQuickApprovalStamp(user.name, user.role);
            const { approvedNoSurat } = await approveAndIssueAprNumber({
                quotation: full,
                approvedByUid: user.uid,
                approvedByName: user.name,
                approvalSignatureBase64: sigProof,
                approvalSignedByRole: user.role,
            });

            const pdfBlob = await generateCompanyQuotationPDF({
                noSurat: approvedNoSurat,
                tanggal: full.tanggal,
                kepadaNama: full.kepadaNama,
                kepadaAlamatLines: full.kepadaAlamatLines,
                kepadaUp: full.kepadaUp,
                kepadaWa: full.kepadaWa,
                objekPekerjaan: full.objekPekerjaan,
                lokasiPekerjaan: full.lokasiPekerjaan,
                jenisLayanan: full.jenisLayanan,
                pdfVariant: full.pdfVariant,
                isRevisi: full.isRevisi,
                perihal: full.perihal,
                items: full.items,
                biayaTambahan: full.biayaTambahan,
                upahPeralatanPct: full.upahPeralatanPct,
                diskonUpahPct: full.diskonUpahPct,
                diskonPct: full.diskonPct,
                ppn: full.ppn,
                ppnDppFaktor: full.ppnDppFaktor,
                garansiTahun: full.garansiTahun,
                garansiNilai: full.garansiNilai,
                garansiUnit: full.garansiUnit,
                jenisGaransi: full.jenisGaransi,
                tampilkanPengontrolan: full.tampilkanPengontrolan,
                surveyor: full.surveyor,
                tanggalSurvey: full.tanggalSurvey ? new Date(`${full.tanggalSurvey}T00:00:00+07:00`) : full.tanggal,
                hasilSurvey: full.hasilSurvey,
                kunjunganPerBulan: full.kunjunganPerBulan,
                jadwalFoggingTahun: full.jadwalFoggingTahun,
                jadwalFoggingRows: full.jadwalFoggingRows,
                surveyPhotos: full.surveyPhotos,
                lampiranPages: full.lampiranPages,
                chemicals: full.chemicals,
                metode: full.metode,
                focusTarget: full.focusTarget,
                teknikPelaksanaan: full.teknikPelaksanaan,
                marketingNama: full.marketingNama,
                marketingWa: full.marketingWa,
                templateConfig,
            }, user.companyId);

            const pdfBase64 = await blobToBase64(pdfBlob);
            await attachPdfToQuotation(full.id, pdfBase64);
            try {
                const warrantyMonths = (full.garansiUnit === "bulan" ? (full.garansiNilai ?? 0) : ((full.garansiNilai ?? full.garansiTahun ?? 0) * 12));
                await supabase.from("projects").upsert({
                    id: full.id,
                    company_id: full.companyId,
                    project_name: `${full.kepadaNama} - ${full.perihal || approvedNoSurat}`,
                    client_name: full.kepadaNama,
                    address: full.lokasiPekerjaan || (full.kepadaAlamatLines || []).join(", ") || "-",
                    latitude: (typeof full.latitude === 'number' && Number.isFinite(full.latitude)) ? full.latitude : -6.283812,
                    longitude: (typeof full.longitude === 'number' && Number.isFinite(full.longitude)) ? full.longitude : 106.796641,
                    radius: 120,
                    work_date: new Date().toISOString().slice(0, 10),
                    work_type: full.perihal || "Layanan Pest / Termite Control",
                    service_type: full.kategori === "AR" ? "TERMITE_CONTROL" : "GENERAL_PEST_CONTROL",
                    focus_target: full.focusTarget || full.hasilSurvey || "Sesuai Penawaran " + approvedNoSurat,
                    warranty_months: warrantyMonths,
                    contract_value: full.total,
                    quotation_id: full.id,
                    notes: `No. Surat Resmi: ${approvedNoSurat} | Nilai Kontrak: Rp ${(full.total || 0).toLocaleString("id-ID")}`,
                }, { onConflict: "id" });
            } catch {
                // Abaikan jika proyek sudah ada
            }
            setApproveTarget(null);
            setApprovalModalSig("");
            await load();
        } catch (err) {
            alert(err instanceof Error ? err.message : "Gagal menyetujui penawaran.");
        } finally {
            setActionLoading(null);
        }
    };

    const handleReject = async () => {
        if (!rejectTarget || !rejectReason.trim()) return;
        setActionLoading(rejectTarget.id);
        try {
            await updateQuotationStatus(rejectTarget.id, "rejected", user?.name, rejectReason.trim(), rejectNotes.trim());
            setRejectTarget(null);
            setRejectReason("");
            setRejectNotes("");
            await load();
        } finally {
            setActionLoading(null);
        }
    };

    const { statsTotal, statsDraftPending, statsApproved, statsDeal } = useMemo(() => ({
        statsTotal: quotations.length,
        statsDraftPending: quotations.filter(q => q.status === "pending" || q.status === "draft").length,
        statsApproved: quotations.filter(q => q.status === "approved" || q.status === "sent_to_client").length,
        statsDeal: quotations.filter(q => q.status === "deal").length,
    }), [quotations]);

    const listTabLabel = isDirector
        ? { label: "Pantau & Approval", shortLabel: "Approval" }
        : user?.role === "MARKETING"
            ? { label: "Penawaran Saya", shortLabel: "Penawaran Saya" }
            : { label: "Daftar Penawaran", shortLabel: "Daftar" };

    const hubTabs = [
        { id: "list", label: listTabLabel.label, shortLabel: listTabLabel.shortLabel, badge: statsDraftPending, badgeTone: "warning" as const },
        ...(canCreate ? [{ id: "new", label: "Buat Penawaran Baru", shortLabel: "Buat Baru" }] : []),
        { id: "pipeline", label: user?.role === "MARKETING" ? "Status Deal Saya" : "Status Deal & Kontrak", shortLabel: user?.role === "MARKETING" ? "Deal Saya" : "Status Deal", badge: statsApproved, badgeTone: "success" as const },
        { id: "nomor-log", label: "Buku Nomor Surat", shortLabel: "Nomor Surat" },
    ];

    const displayed = useMemo(() => {
        let rows = quotations;
        const s = debouncedSearch.trim().toLowerCase();
        if (s) rows = rows.filter(q =>
            q.noSurat.toLowerCase().includes(s) ||
            (q.draftNoSurat ?? "").toLowerCase().includes(s) ||
            q.kepadaNama.toLowerCase().includes(s) ||
            (q.objekPekerjaan ?? "").toLowerCase().includes(s) ||
            q.marketingNama.toLowerCase().includes(s)
        );
        if (filterKat !== "all") rows = rows.filter(q => q.kategori === filterKat);
        if (filterTipe !== "all") rows = rows.filter(q => q.tipeKontrak === filterTipe);
        if (filterStatus !== "all") rows = rows.filter(q => q.status === filterStatus);
        return rows;
    }, [quotations, debouncedSearch, filterKat, filterTipe, filterStatus]);

    const totalPages = Math.max(1, Math.ceil(displayed.length / PER_PAGE));
    const paged = useMemo(() => displayed.slice((page - 1) * PER_PAGE, page * PER_PAGE), [displayed, page]);
    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);


    if (subTab === "new") {
        return (
            <div className="space-y-4">
                <TabContainer tabs={hubTabs} activeTab={subTab} onChange={id => setSubTab(id as HubSubTab)} showFloatingBottom={false} />
                <QuotationFormPage
                    onSavedSuccess={() => { setSubTab("list"); load(); }}
                    onCancel={() => setSubTab("list")}
                />
            </div>
        );
    }

    if (subTab === "edit" && editingQuotationId) {
        return (
            <div className="space-y-4">
                <TabContainer tabs={hubTabs} activeTab="list" onChange={id => setSubTab(id as HubSubTab)} showFloatingBottom={false} />
                <QuotationEditPage
                    quotationIdProp={editingQuotationId}
                    onSavedSuccess={() => { setEditingQuotationId(null); setSubTab("list"); load(); }}
                    onCancel={() => { setEditingQuotationId(null); setSubTab("list"); }}
                />
            </div>
        );
    }

    if (subTab === "pipeline") {
        return (
            <div className="space-y-4">
                <TabContainer tabs={hubTabs} activeTab={subTab} onChange={id => setSubTab(id as HubSubTab)} showFloatingBottom={false} />
                <StatusPHPage />
            </div>
        );
    }

    if (subTab === "nomor-log") {
        return (
            <div className="space-y-4">
                <TabContainer tabs={hubTabs} activeTab={subTab} onChange={id => setSubTab(id as HubSubTab)} showFloatingBottom={false} />
                <NomorSuratLogPage />
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {signatureTarget && (
                <SignatureModal
                    quotation={signatureTarget}
                    signerName={user?.name ?? "Marketing"}
                    templateConfig={templateConfig}
                    onClose={() => setSignatureTarget(null)}
                    onSigned={() => {
                        setQuotations(prev => prev.map(q =>
                            q.id === signatureTarget.id ? { ...q, hasSignedPdf: true, signedAt: new Date(), signedBy: user?.name } : q
                        ));
                        setSignatureTarget(null);
                    }}
                />
            )}

            <TabContainer tabs={hubTabs} activeTab={subTab} onChange={id => setSubTab(id as HubSubTab)} showFloatingBottom={false} />

            <PageHeader
                title={isDirector ? "Approval & Pemantauan Penawaran Harga" : "Surat Penawaran Harga — PT Guci Emas Pratama"}
                subtitle={isDirector
                    ? "Tinjau draf penawaran yang diajukan tim, sesuaikan harga atau garansi, dan berikan persetujuan."
                    : "Buat draf penawaran dari hasil survei lapangan, sesuaikan harga atau garansi saat negosiasi, lalu setujui untuk cetak PDF resmi."}
                actions={
                    <>
                        <button
                            onClick={load}
                            className="p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] cursor-pointer"
                            title="Muat Ulang Data"
                        >
                            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                        </button>
                        {canCreate && (
                            <button
                                onClick={() => setSubTab("new")}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs sm:text-sm font-bold shadow-xs btn-tactile cursor-pointer"
                            >
                                <Plus size={15} /> Buat Penawaran Baru
                            </button>
                        )}
                    </>
                }
            />

            {/* Interactive 4-Step Workflow & KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <button
                    type="button"
                    onClick={() => { setFilterStatus("all"); setPage(1); }}
                    className={`clean-card p-4 text-left transition-all cursor-pointer ${filterStatus === "all" ? "ring-2 ring-[var(--accent)]" : ""}`}
                >
                    <span className="text-xs font-semibold text-[var(--text-secondary)] block">Semua Penawaran</span>
                    <div className="text-2xl font-bold font-mono text-[var(--text-primary)] mt-1 tabular-nums">{statsTotal}</div>
                    <span className="text-xs text-[var(--text-muted)]">Tampilkan semua</span>
                </button>
                <button
                    type="button"
                    onClick={() => { setFilterStatus("pending"); setPage(1); }}
                    className={`clean-card p-4 text-left transition-all cursor-pointer ${filterStatus === "pending" ? "ring-2 ring-amber-600" : ""}`}
                >
                    <span className="text-xs font-semibold text-[var(--status-draft-text)] block">Tahap Draft (GP-DRF)</span>
                    <div className="text-2xl font-bold font-mono text-[var(--status-draft-text)] mt-1 tabular-nums">{statsDraftPending}</div>
                    <span className="text-xs text-[var(--text-muted)]">Menunggu Nego / Approve</span>
                </button>
                <button
                    type="button"
                    onClick={() => { setFilterStatus("approved"); setPage(1); }}
                    className={`clean-card p-4 text-left transition-all cursor-pointer ${filterStatus === "approved" ? "ring-2 ring-emerald-600" : ""}`}
                >
                    <span className="text-xs font-semibold text-[var(--status-completed-text)] block">Sudah Disetujui (Resmi)</span>
                    <div className="text-2xl font-bold font-mono text-[var(--status-completed-text)] mt-1 tabular-nums">{statsApproved}</div>
                    <span className="text-xs text-[var(--text-muted)]">Siap PDF &amp; Kirim WA</span>
                </button>
                <button
                    type="button"
                    onClick={() => setSubTab("pipeline")}
                    className="clean-card p-4 text-left transition-all cursor-pointer"
                >
                    <span className="text-xs font-semibold text-[var(--accent-text)] block">Deal &amp; Pipeline SPK</span>
                    <div className="text-2xl font-bold font-mono text-[var(--accent-text)] mt-1 tabular-nums">{statsDeal}</div>
                    <span className="text-xs text-[var(--text-muted)]">Buka Pipeline Deal</span>
                </button>
            </div>

            {/* Filter & Search Bar */}
            <div className="clean-card p-4 space-y-3">
                <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                    <div className="relative flex-1">
                        <Search size={15} className="absolute left-3.5 top-3 text-[var(--text-muted)]" />
                        <input
                            value={search}
                            onChange={e => { setSearch(e.target.value); setPage(1); }}
                            placeholder="Cari nomor surat, nama klien, objek survey, atau surveyor..."
                            className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-[var(--border-subtle)] rounded-xl bg-[var(--bg-tertiary)] text-[var(--text-primary)] focus:bg-[var(--bg-card)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                        />
                    </div>
                    <div className="flex flex-wrap gap-1.5 items-center">
                        {(["all", "AR", "PCO"] as const).map(v => (
                            <button
                                key={v}
                                onClick={() => { setFilterKat(v); setPage(1); }}
                                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                                    filterKat === v
                                        ? "bg-[var(--accent)] text-white"
                                        : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                }`}
                            >
                                {v === "all" ? "Semua Kategori" : v === "AR" ? "Anti Rayap (AR)" : "Pest Control (PCO)"}
                            </button>
                        ))}
                        <select
                            value={filterStatus}
                            onChange={e => { setFilterStatus(e.target.value as typeof filterStatus); setPage(1); }}
                            className="px-3 py-2 text-xs font-semibold border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-card)] text-[var(--text-primary)]"
                        >
                            <option value="all">Semua Status</option>
                            <option value="pending">Draft / Menunggu (GP-DRF)</option>
                            <option value="approved">Disetujui (Resmi)</option>
                            <option value="sent_to_client">Dikirim ke Klien</option>
                            <option value="deal">Deal Kontrak</option>
                            <option value="rejected">Perlu Revisi</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Tabel Utama Daftar Quotation */}
            <div className="clean-card overflow-hidden">
                {loading ? (
                    <div className="py-16 text-center text-sm text-[var(--text-muted)] flex items-center justify-center gap-2">
                        <RefreshCw size={18} className="animate-spin text-[var(--accent-text)]" /> Memuat daftar penawaran...
                    </div>
                ) : paged.length === 0 ? (
                    <div className="py-16 text-center text-[var(--text-muted)] space-y-2">
                        <p className="font-semibold text-sm text-[var(--text-secondary)]">Belum ada dokumen penawaran yang sesuai filter</p>
                        {canCreate && (
                            <button
                                onClick={() => setSubTab("new")}
                                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-bold cursor-pointer"
                            >
                                <Plus size={14} /> Buat Draft Survey Pertama (GP-DRF)
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[920px]">
                            <thead className="bg-[var(--bg-tertiary)] border-b border-[var(--border-subtle)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                <tr>
                                    <th className="px-4 py-3">Nomor Surat (DRF / Resmi)</th>
                                    <th className="px-4 py-3">Kategori & Layanan</th>
                                    <th className="px-4 py-3">Klien & Objek Survey</th>
                                    <th className="px-4 py-3">Garansi</th>
                                    <th className="px-4 py-3 text-right">Total Harga</th>
                                    <th className="px-4 py-3">Surveyor / Mkt</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3 text-right">Tindakan</th>
                                </tr>
                            </thead>
                            <tbody key={page} className="divide-y divide-[var(--border-subtle)] text-xs result-enter">
                                {paged.map(q => {
                                    const isPending = q.status === "pending" || q.status === "draft";
                                    const isApproved = q.status === "approved" || q.status === "sent_to_client" || q.status === "deal";
                                    const isOfficial = isApproved || q.stage === "OFFICIAL" || (!q.noSurat.includes("-DRF/") && q.noSurat.includes("/"));
                                    const gText = formatWarrantyDurationText(
                                        q.garansiNilai ?? q.garansiTahun ?? 0,
                                        q.garansiUnit ?? "tahun"
                                    );
                                    const isActing = actionLoading === q.id;

                                    return (
                                        <tr key={q.id} className={`row-fade-in hover:bg-[var(--bg-tertiary)]/60 transition-colors ${isPending ? "bg-[var(--status-draft-bg)]/20" : ""}`}>
                                            <td className="px-4 py-3.5 whitespace-nowrap">
                                                <code className={`px-2 py-1 rounded-md font-mono font-bold text-xs block w-max ${
                                                    isOfficial
                                                        ? "bg-[var(--status-approved-bg)] text-[var(--status-approved-text)]"
                                                        : "bg-[var(--status-draft-bg)] text-[var(--status-draft-text)]"
                                                }`}>
                                                    {q.noSurat}
                                                </code>
                                                {q.draftNoSurat && q.draftNoSurat !== q.noSurat && (
                                                    <span className="text-xs font-mono text-[var(--text-muted)] block mt-0.5">
                                                        Ex-Draft: {q.draftNoSurat}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <div className="flex items-center gap-1.5">
                                                    <KategoriBadge kategori={q.kategori} />
                                                    <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                                                        {q.tipeKontrak}
                                                    </span>
                                                </div>
                                                <span className="text-xs text-[var(--text-secondary)] block mt-1">
                                                    {LAYANAN_CONFIG[q.jenisLayanan]?.label.split("—")[1]?.trim() ?? q.jenisLayanan}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5 max-w-[240px]">
                                                <div className="font-bold text-sm text-[var(--text-primary)] truncate">{q.kepadaNama}</div>
                                                {q.kepadaWa && (
                                                    <div className="text-[11px] font-mono text-[var(--text-muted)] truncate mt-0.5">
                                                        📞 {q.kepadaWa}
                                                    </div>
                                                )}
                                                {q.objekPekerjaan && (
                                                    <div className="text-xs text-[var(--accent-text)] font-medium truncate mt-0.5">
                                                        Objek: {q.objekPekerjaan}
                                                    </div>
                                                )}
                                                {q.kepadaAlamatLines?.[0] && (
                                                    <div className="text-xs text-[var(--text-muted)] truncate mt-0.5">{q.kepadaAlamatLines[0]}</div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3.5 whitespace-nowrap">
                                                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--status-draft-bg)] text-[var(--status-draft-text)] border border-[var(--status-draft-border)]">
                                                    {gText}
                                                </span>
                                                {(q.adjustmentHistory?.length ?? 0) > 0 && (
                                                    <span className="block text-xs text-[var(--status-draft-text)] font-medium mt-1">
                                                        {q.adjustmentHistory!.length}x penyesuaian
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3.5 text-right font-mono font-bold text-sm text-[var(--text-primary)] whitespace-nowrap tabular-nums">
                                                {formatRupiah(q.total)}
                                            </td>
                                            <td className="px-4 py-3.5 whitespace-nowrap">
                                                <span className="font-semibold text-[var(--text-primary)] block">{q.surveyor || q.marketingNama}</span>
                                                <span className="text-xs text-[var(--text-muted)]">{formatDate(q.tanggal)}</span>
                                            </td>
                                            <td className="px-4 py-3.5 whitespace-nowrap">
                                                <StatusBadge status={q.status} />
                                            </td>
                                            <td className="px-4 py-3.5 text-right whitespace-nowrap">
                                                <div className="inline-flex items-center gap-1.5 justify-end">
                                                    <button
                                                        onClick={() => handleOpenOrRenderPdf(q, false)}
                                                        disabled={isActing}
                                                        className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] text-xs font-semibold cursor-pointer"
                                                        title={isApproved ? "Lihat PDF Resmi" : "Pratinjau Draft Internal (Belum Di-ACC - Tidak Dapat Diunduh)"}
                                                    >
                                                        {isApproved ? "Lihat PDF" : "Pratinjau Draft"}
                                                    </button>

                                                    <button
                                                        onClick={() => { setEditingQuotationId(q.id); setSubTab("edit"); }}
                                                        className="px-2.5 py-1.5 rounded-lg bg-[var(--status-draft-bg)] hover:opacity-90 text-[var(--status-draft-text)] border border-[var(--status-draft-border)] text-xs font-semibold cursor-pointer"
                                                        title="Ubah Garansi, Volume, atau Harga"
                                                    >
                                                        Ubah
                                                    </button>

                                                    {canApprove && isPending && (
                                                        <>
                                                            <button
                                                                onClick={() => setApproveTarget(q)}
                                                                disabled={isActing}
                                                                className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold cursor-pointer shadow-2xs"
                                                                title="Approve & Terbitkan Nomor Resmi"
                                                            >
                                                                Setujui (ACC)
                                                            </button>
                                                            <button
                                                                onClick={() => setRejectTarget(q)}
                                                                disabled={isActing}
                                                                className="px-2.5 py-1.5 rounded-lg border border-[var(--status-flagged-border)] text-[var(--status-flagged-text)] hover:bg-[var(--status-flagged-bg)] text-xs font-semibold cursor-pointer"
                                                                title="Minta Revisi ke Surveyor"
                                                            >
                                                                Revisi
                                                            </button>
                                                        </>
                                                    )}

                                                    {isApproved ? (
                                                        <>
                                                            <button
                                                                onClick={() => handleOpenOrRenderPdf(q, true)}
                                                                className="px-2.5 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold cursor-pointer"
                                                                title="Unduh PDF Resmi"
                                                            >
                                                                Unduh
                                                            </button>
                                                            <button
                                                                onClick={() => setViewProofTarget(q)}
                                                                className="px-2.5 py-1.5 rounded-lg bg-[var(--status-completed-bg)] text-[var(--status-completed-text)] border border-[var(--status-completed-border)] text-xs font-semibold cursor-pointer"
                                                                title="Lihat Bukti TTD Approval (Non-Download)"
                                                            >
                                                                Bukti Approve
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <span className="px-2 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[10.5px] font-semibold">
                                                            Menunggu ACC
                                                        </span>
                                                    )}
                                                    {canDelete && (
                                                        <button
                                                            onClick={async () => {
                                                                if (!confirm(`Hapus penawaran ${q.noSurat}?`)) return;
                                                                await deleteQuotation(q.id);
                                                                await load();
                                                            }}
                                                            className="px-2.5 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--status-flagged-text)] hover:bg-[var(--status-flagged-bg)] text-xs font-semibold cursor-pointer"
                                                            title="Hapus Penawaran"
                                                        >
                                                            Hapus
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                <Pagination page={page} pageSize={PER_PAGE} totalItems={displayed.length}
                    onPageChange={setPage} itemLabel="penawaran" />
            </div>

            {/* Modal Section Approval (TTD Bukti Approval Non-Downloadable & Penghapusan Kode DRF) */}
            {approveTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
                    <div
                        className="clean-card max-w-lg w-full p-6 space-y-4 select-none"
                        onContextMenu={e => e.preventDefault()}
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                                <CheckCircle2 size={24} />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-[var(--text-primary)]">
                                    Section Approval Penawaran (Bukti TTD Internal)
                                </h3>
                                <p className="text-xs text-[var(--text-secondary)]">
                                    Klien: <strong>{approveTarget.kepadaNama}</strong> · Nilai: <strong>{formatRupiah(approveTarget.total)}</strong>
                                </p>
                            </div>
                        </div>

                        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1.5">
                            <p className="font-bold">Perubahan Nomor Surat Otomatis (Tanpa DRF / APR):</p>
                            <div className="flex items-center gap-2 flex-wrap font-mono text-xs">
                                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 line-through">{approveTarget.noSurat}</span>
                                <span>&rarr;</span>
                                <span className="px-2.5 py-0.5 rounded bg-emerald-700 text-white font-bold">
                                    {approveTarget.noSurat.replace(/-DRF\//g, "/").replace(/-APR\//g, "/")}
                                </span>
                            </div>
                            <p className="text-[11px] text-emerald-800 pt-1">
                                Kode <code>DRF</code> otomatis dihilangkan (tanpa tambahan <code>APR</code>) dan proyek langsung terhubung ke modul Gudang & Teknisi.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-[var(--text-primary)]">
                                    Tanda Tangan / Paraf Bukti Approval (Non-Downloadable) *
                                </label>
                                <button
                                    type="button"
                                    onClick={() => user && setApprovalModalSig(generateQuickApprovalStamp(user.name, user.role))}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-[11px] font-bold"
                                >
                                    {approvalModalSig ? "Perbarui Paraf Saya" : "Bubuhkan Paraf Digital Saya"}
                                </button>
                            </div>

                            {approvalModalSig ? (
                                <div
                                    className="relative rounded-xl border border-emerald-300 bg-white p-3 text-center select-none overflow-hidden"
                                    onContextMenu={e => e.preventDefault()}
                                >
                                    <img
                                        src={approvalModalSig}
                                        alt="Bukti Approval Non-Download"
                                        draggable={false}
                                        onContextMenu={e => e.preventDefault()}
                                        className="max-h-28 mx-auto pointer-events-none select-none"
                                    />
                                    <span className="inline-block mt-1 text-[10px] font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                        TERKUNCI SEBAGAI BUKTI APPROVAL INTERNAL (NON-DOWNLOAD)
                                    </span>
                                </div>
                            ) : (
                                <div
                                    onClick={() => user && setApprovalModalSig(generateQuickApprovalStamp(user.name, user.role))}
                                    className="cursor-pointer rounded-xl border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/30 p-4 text-center text-xs text-emerald-800 transition-colors"
                                >
                                    Klik di sini untuk membubuhkan <strong>Paraf Bukti Approval ({user?.name})</strong>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2 pt-1">
                            <button
                                onClick={() => { setApproveTarget(null); setApprovalModalSig(""); }}
                                className="flex-1 py-2.5 rounded-xl bg-[var(--bg-tertiary)] text-xs font-semibold text-[var(--text-secondary)]"
                            >
                                Batal
                            </button>
                            <button
                                onClick={handleApprove}
                                disabled={actionLoading === approveTarget.id}
                                className="flex-1 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold flex items-center justify-center gap-1.5"
                            >
                                {actionLoading === approveTarget.id && <RefreshCw size={13} className="animate-spin" />}
                                Approve & Sahkan Surat
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Lihat Bukti Approval Non-Downloadable */}
            {viewProofTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
                    <div
                        className="clean-card max-w-md w-full p-6 space-y-4 select-none"
                        onContextMenu={e => e.preventDefault()}
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                                <CheckCircle2 size={17} className="text-emerald-600" />
                                Bukti TTD Approval Internal (Non-Download)
                            </h3>
                            <button
                                onClick={() => setViewProofTarget(null)}
                                className="text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            >
                                Tutup
                            </button>
                        </div>
                        <div className="p-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-xs space-y-1">
                            <div>No. Surat Resmi: <strong className="font-mono">{viewProofTarget.noSurat}</strong></div>
                            {viewProofTarget.draftNoSurat && (
                                <div>Asal Draft: <span className="font-mono text-amber-800">{viewProofTarget.draftNoSurat}</span></div>
                            )}
                            <div>Disetujui Oleh: <strong>{viewProofTarget.approvedBy || "Direktur / Admin"}</strong></div>
                        </div>
                        <div
                            className="rounded-xl border border-emerald-300 bg-white p-4 text-center select-none overflow-hidden"
                            onContextMenu={e => e.preventDefault()}
                        >
                            {viewProofTarget.approvalSignatureBase64 ? (
                                <img
                                    src={viewProofTarget.approvalSignatureBase64}
                                    alt="Bukti Approval Non-Download"
                                    draggable={false}
                                    onContextMenu={e => e.preventDefault()}
                                    className="max-h-32 mx-auto pointer-events-none select-none"
                                />
                            ) : (
                                <img
                                    src={generateQuickApprovalStamp(viewProofTarget.approvedBy || "H. Fakhrurrazi, S.E.", viewProofTarget.approvalSignedByRole || "SUPERADMIN")}
                                    alt="Bukti Approval Non-Download"
                                    draggable={false}
                                    onContextMenu={e => e.preventDefault()}
                                    className="max-h-32 mx-auto pointer-events-none select-none"
                                />
                            )}
                            <p className="text-[10px] font-mono font-bold text-emerald-800 mt-2">
                                DOKUMEN BUKTI PERSETUJUAN INTERNAL • TIDAK DAPAT DIUNDUH
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Tolak / Minta Revisi */}
            {rejectTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
                    <div className="clean-card max-w-md w-full p-6 space-y-4">
                        <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                            <XCircle size={18} className="text-red-600" /> Kembalikan Draft untuk Revisi
                        </h3>
                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="font-bold block mb-1">Alasan Revisi / Penolakan *</label>
                                <textarea
                                    rows={2}
                                    value={rejectReason}
                                    onChange={e => setRejectReason(e.target.value)}
                                    className="w-full p-2.5 border border-[var(--border-subtle)] rounded-xl"
                                    placeholder="Contoh: Foto dokumentasi area belakang belum diunggah..."
                                />
                            </div>
                            <div>
                                <label className="font-bold block mb-1">Instruksi ke Surveyor / Marketing</label>
                                <textarea
                                    rows={2}
                                    value={rejectNotes}
                                    onChange={e => setRejectNotes(e.target.value)}
                                    className="w-full p-2.5 border border-[var(--border-subtle)] rounded-xl"
                                    placeholder="Catatan tambahan..."
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setRejectTarget(null)} className="px-4 py-2 rounded-xl bg-[var(--bg-tertiary)] text-xs font-semibold">
                                Batal
                            </button>
                            <button
                                onClick={handleReject}
                                disabled={!rejectReason.trim()}
                                className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-bold disabled:opacity-40"
                            >
                                Kirim Instruksi Revisi
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}