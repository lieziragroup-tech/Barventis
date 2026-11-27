/**
 * QuotationEditPage — Panel Verifikasi, Negosiasi & Adjustment Quotation (Admin & Marketing)
 *
 * Fitur Utama:
 *   1. Adjustment Garansi Fleksibel (Preset + Custom dalam BULAN maupun TAHUN, misal dari 3 Tahun -> 2 Tahun / 1 Tahun / 6 Bulan)
 *      dengan opsi 1-klik "Sesuaikan Harga Satuan Otomatis ke Tarif Garansi Baru" saat customer minta turun harga.
 *   2. Kalkulator Rumus Volume (37+37+5,5 = 99,5 m¹) & Auto-Unit.
 *   3. Pengaturan Upah & Peralatan Kerja (mis. 25%) + Diskon Upah (mis. 15%) + PPN (11% atau DPP 11/12 + PPN 12%).
 *   4. Tombol "Simpan Revisi Draft (Update GP-DRF)" yang menyimpan ulang draft dan mencatat riwayat negosiasi (`adjustmentHistory`).
 *   5. Tombol Khusus Admin: "Simpan & Approve (Terbitkan GP-APR + Generate PDF)".
 */

import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    ArrowLeft, Check, Save, Plus, Trash2, Loader2, AlertCircle,
    FileText, Calculator, Sparkles, Eye, ShieldCheck, History, Camera, X,
} from "lucide-react";
import { useAuthStore } from '@/app/store/authStore';
import {
    getQuotationById, updateQuotationData, approveAndIssueOfficialNumber,
    attachPdfToQuotation, blobToBase64,
} from '@/shared/api/quotationService';
import { generateCompanyQuotationPDF } from '@/shared/api/documentConfig';
import { calcTotals, fmtIDR, LAYANAN_CONFIG } from '@/shared/lib/quotationConfig';
import {
    WARRANTY_PRESET_OPTIONS,
    getPresetsForService,
    resolvePresetPriceByWarranty,
    formatWarrantyDurationText,
    PRESET_WORK_ITEMS,
} from '@/shared/lib/warrantyPricingEngine';
import { evaluateVolumeFormula, formatVolumeID } from '@/shared/utils/volumeCalculator';
import { PDF_VARIANT_OPTIONS } from './QuotationFormPage';
import type {
    Quotation, QuotationItem, BiayaTambahan, SurveyPhoto, ChemicalItem,
    GaransiUnit, PdfTemplateVariant, AdjustmentLogEntry,
} from '@/entities/types';
import { DEFAULT_CHEMICALS_AR, DEFAULT_CHEMICALS_PCO, METODE_BY_LAYANAN } from '@/entities/types';

const inputCls = "w-full px-3 py-2 text-sm border border-[var(--border-subtle)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] bg-white text-[var(--text-primary)]";

export interface QuotationEditPageProps {
    quotationIdProp?: string;
    onSavedSuccess?: () => void;
    onCancel?: () => void;
}

export function QuotationEditPage({ quotationIdProp, onSavedSuccess, onCancel }: QuotationEditPageProps = {}) {
    const params = useParams<{ id: string }>();
    const id = quotationIdProp ?? params.id;
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const isAdmin = user?.role === "MASTER_SUPER_ADMIN" || user?.role === "SUPERADMIN" || user?.role === "ADMIN";

    const goBack = () => {
        if (onSavedSuccess) onSavedSuccess();
        else navigate("/quotations");
    };

    const handleCancel = () => {
        if (onCancel) onCancel();
        else navigate("/quotations");
    };

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [approving, setApproving] = useState(false);
    const [previewBusy, setPreviewBusy] = useState(false);
    const [error, setError] = useState("");
    const [quotation, setQuotation] = useState<Quotation | null>(null);

    // Editable fields
    const [nama, setNama] = useState("");
    const [alamatLines, setAlamatLines] = useState<string[]>(["", ""]);
    const [approvalSig, setApprovalSig] = useState<string>("");
    const [up, setUp] = useState("");
    const [wa, setWa] = useState("");
    const [objekPekerjaan, setObjekPekerjaan] = useState("");
    const [lokasiPekerjaan, setLokasiPekerjaan] = useState("");
    const [pdfVariant, setPdfVariant] = useState<PdfTemplateVariant>("auto");
    const [isRevisi, setIsRevisi] = useState(false);

    // Garansi (Bulan & Tahun)
    const [garansiNilai, setGaransiNilai] = useState<number>(3);
    const [garansiUnit, setGaransiUnit] = useState<GaransiUnit>("tahun");
    const [jenisGaransi, setJenisGaransi] = useState("Anti Rayap");
    const [tampilkanPengontrolan, setTampilkanPengontrolan] = useState(true);

    // Items & Commercials
    const [items, setItems] = useState<QuotationItem[]>([]);
    const [upahPeralatanPct, setUpahPeralatanPct] = useState<number>(0);
    const [diskonUpahPct, setDiskonUpahPct] = useState<number>(0);
    const [biayaTambahan, setBiayaTambahan] = useState<BiayaTambahan[]>([]);
    const [diskonPct, setDiskonPct] = useState(0);
    const [ppn, setPpn] = useState(false);
    const [ppnDppFaktor, setPpnDppFaktor] = useState(0);
    const [pembulatanRp, setPembulatanRp] = useState(0);

    // Survey & Technical
    const [surveyor, setSurveyor] = useState("");
    const [tanggalSurvey, setTanggalSurvey] = useState("");
    const [hasilSurvey, setHasilSurvey] = useState("");
    const [surveyPhotos, setSurveyPhotos] = useState<SurveyPhoto[]>([]);
    const [chemicals, setChemicals] = useState<ChemicalItem[]>([]);
    const [metode, setMetode] = useState<string[]>([]);
    const [adjustmentReason, setAdjustmentReason] = useState("");

    useEffect(() => {
        if (!id) { handleCancel(); return; }
        setLoading(true);
        getQuotationById(id)
            .then(q => {
                if (!q) { handleCancel(); return; }
                setQuotation(q);
                setNama(q.kepadaNama);
                setAlamatLines([q.kepadaAlamatLines?.[0] ?? "", q.kepadaAlamatLines?.[1] ?? ""]);
                setApprovalSig(q.approvalSignatureBase64 ?? "");
                setUp(q.kepadaUp ?? "");
                setWa(q.kepadaWa ?? "");
                setObjekPekerjaan(q.objekPekerjaan ?? "");
                setLokasiPekerjaan(q.lokasiPekerjaan ?? (q.kepadaAlamatLines ?? []).join(", "));
                setPdfVariant(q.pdfVariant ?? "auto");
                setIsRevisi(Boolean(q.isRevisi));

                const gUnit: GaransiUnit = q.garansiUnit ?? "tahun";
                const gNilai = q.garansiNilai ?? q.garansiTahun ?? 0;
                setGaransiUnit(gUnit);
                setGaransiNilai(gNilai);
                setJenisGaransi(q.jenisGaransi ?? "Anti Rayap");
                setTampilkanPengontrolan(q.tampilkanPengontrolan !== false);

                setItems(q.items ?? [{ desc: "", qty: 1, unit: "m²", harga: 0 }]);
                setUpahPeralatanPct(q.upahPeralatanPct ?? 0);
                setDiskonUpahPct(q.diskonUpahPct ?? 0);
                setBiayaTambahan(q.biayaTambahan ?? []);
                setDiskonPct(q.diskonPct ?? 0);
                setPpn(q.ppn ?? false);
                setPpnDppFaktor(q.ppnDppFaktor ?? 0);

                const calcRes = calcTotals({
                    items: q.items ?? [],
                    biayaTambahan: q.biayaTambahan ?? [],
                    upahPeralatanPct: q.upahPeralatanPct ?? 0,
                    diskonUpahPct: q.diskonUpahPct ?? 0,
                    diskonPct: q.diskonPct ?? 0,
                    ppn: q.ppn ?? false,
                    ppnDppFaktor: q.ppnDppFaktor || undefined,
                });
                setPembulatanRp(Math.round((q.total ?? 0) - calcRes.total));

                const isAR = LAYANAN_CONFIG[q.jenisLayanan]?.isAR ?? false;
                setSurveyor(q.surveyor ?? q.marketingNama ?? "");
                setTanggalSurvey(q.tanggalSurvey ?? q.tanggal.toISOString().slice(0, 10));
                setHasilSurvey(q.hasilSurvey ?? "");
                setSurveyPhotos(q.surveyPhotos ?? []);
                setChemicals(q.chemicals?.length ? q.chemicals : (isAR ? DEFAULT_CHEMICALS_AR : DEFAULT_CHEMICALS_PCO));
                setMetode(q.metode?.length ? q.metode : (METODE_BY_LAYANAN[q.jenisLayanan] ?? []));
            })
            .catch(() => handleCancel())
            .finally(() => setLoading(false));
    }, [id]);

    if (loading || !quotation) {
        return (
            <div className="py-16 text-center text-sm text-[var(--text-muted)] flex items-center justify-center gap-2">
                <Loader2 size={18} className="animate-spin text-[var(--accent)]" /> Memuat data draft quotation...
            </div>
        );
    }

    const isAR = LAYANAN_CONFIG[quotation.jenisLayanan]?.isAR ?? false;
    const availablePresets = getPresetsForService(quotation.jenisLayanan, quotation.kategori);
    const calc = calcTotals({
        items,
        biayaTambahan,
        upahPeralatanPct,
        diskonUpahPct,
        diskonPct,
        ppn,
        ppnDppFaktor: ppnDppFaktor || undefined,
    });
    const totalFinal = calc.total + pembulatanRp;

    const generateStampSignatureBase64 = (signerName: string, signerRole: string) => {
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

    // Recalculate unit prices based on new warranty duration (Years or Months)
    const handleApplyWarrantyToPrices = (nextNilai: number, nextUnit: GaransiUnit) => {
        setGaransiNilai(nextNilai);
        setGaransiUnit(nextUnit);
        setItems(prev => prev.map(it => {
            const preset = it.presetCode
                ? PRESET_WORK_ITEMS.find(p => p.code === it.presetCode)
                : PRESET_WORK_ITEMS.find(p => p.label.toLowerCase() === it.desc.toLowerCase());
            if (!preset) return it;
            return {
                ...it,
                presetCode: preset.code,
                harga: resolvePresetPriceByWarranty(preset, nextNilai, nextUnit),
            };
        }));
    };

    const handleFormulaChange = (idx: number, rawFormula: string) => {
        const evalRes = evaluateVolumeFormula(rawFormula);
        setItems(prev => prev.map((it, i) => {
            if (i !== idx) return it;
            return {
                ...it,
                volumeFormula: rawFormula,
                qty: evalRes.isValid && evalRes.value > 0 ? evalRes.value : it.qty,
            };
        }));
    };

    const buildUpdatedFields = (): Partial<Quotation> => {
        const cleanItems = items
            .map(it => ({
                ...it,
                desc: it.desc.trim(),
                qty: Number(it.qty) || 0,
                harga: Math.round(Number(it.harga) || 0),
            }))
            .filter(it => it.desc.length > 0 || it.qty > 0 || it.harga > 0);

        return {
            kepadaNama: nama.trim(),
            kepadaAlamatLines: alamatLines.map(l => l.trim()).filter(Boolean),
            kepadaUp: up || undefined,
            kepadaWa: wa || undefined,
            objekPekerjaan: objekPekerjaan || undefined,
            lokasiPekerjaan: lokasiPekerjaan || undefined,
            pdfVariant,
            isRevisi,
            items: cleanItems.length > 0 ? cleanItems : items,
            biayaTambahan,
            upahPeralatanPct: upahPeralatanPct || undefined,
            diskonUpahPct: diskonUpahPct || undefined,
            upahPeralatanRp: calc.upahPeralatanRp || undefined,
            diskonUpahRp: calc.diskonUpahRp || undefined,
            diskonPct,
            ppn,
            ppnDppFaktor: ppnDppFaktor || undefined,
            garansiTahun: garansiUnit === "tahun" ? garansiNilai : Number((garansiNilai / 12).toFixed(2)),
            garansiNilai,
            garansiUnit,
            jenisGaransi,
            tampilkanPengontrolan,
            subtotal: calc.subtotal,
            diskonRp: calc.diskonRp,
            ppnRp: calc.ppnRp,
            total: totalFinal,
            surveyor: surveyor || undefined,
            tanggalSurvey: tanggalSurvey || undefined,
            hasilSurvey: hasilSurvey || undefined,
            surveyPhotos: surveyPhotos.length > 0 ? surveyPhotos : undefined,
            chemicals: chemicals.length > 0 ? chemicals : undefined,
            metode: isAR && metode.length > 0 ? metode : undefined,
            adjustmentHistory: quotation.adjustmentHistory ?? [],
        };
    };

    // Pratinjau PDF dari isian adjustment saat ini
    const handlePreviewPdf = async () => {
        setPreviewBusy(true);
        try {
            const fields = buildUpdatedFields();
            const isApproved = quotation.status === "approved" || quotation.status === "deal";
            const blob = await generateCompanyQuotationPDF({
                noSurat: quotation.noSurat,
                isDraft: !isApproved,
                isApproved,
                tanggal: quotation.tanggal,
                kepadaNama: fields.kepadaNama!,
                kepadaAlamatLines: fields.kepadaAlamatLines!,
                kepadaUp: fields.kepadaUp,
                kepadaWa: fields.kepadaWa,
                objekPekerjaan: fields.objekPekerjaan,
                lokasiPekerjaan: fields.lokasiPekerjaan,
                jenisLayanan: quotation.jenisLayanan,
                pdfVariant: fields.pdfVariant,
                isRevisi: fields.isRevisi,
                perihal: quotation.perihal,
                items: fields.items!,
                biayaTambahan: fields.biayaTambahan,
                upahPeralatanPct: fields.upahPeralatanPct,
                diskonUpahPct: fields.diskonUpahPct,
                diskonPct: fields.diskonPct,
                ppn: fields.ppn,
                ppnDppFaktor: fields.ppnDppFaktor,
                garansiTahun: fields.garansiTahun,
                garansiNilai: fields.garansiNilai,
                garansiUnit: fields.garansiUnit,
                jenisGaransi: fields.jenisGaransi,
                tampilkanPengontrolan: fields.tampilkanPengontrolan,
                surveyor: fields.surveyor,
                tanggalSurvey: fields.tanggalSurvey ? new Date(`${fields.tanggalSurvey}T00:00:00+07:00`) : quotation.tanggal,
                hasilSurvey: fields.hasilSurvey,
                surveyPhotos: fields.surveyPhotos,
                chemicals: fields.chemicals,
                metode: fields.metode,
                marketingNama: quotation.marketingNama,
                marketingWa: quotation.marketingWa,
            }, quotation.companyId);

            const url = URL.createObjectURL(blob);
            window.open(url, "_blank");
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        } catch (err) {
            alert(err instanceof Error ? err.message : "Gagal merender pratinjau PDF.");
        } finally {
            setPreviewBusy(false);
        }
    };

    // Simpan Revisi Draft
    const handleSaveDraftAdjustment = async () => {
        if (!quotation || !id || !user) return;
        if (!nama.trim()) {
            setError("Nama klien wajib diisi.");
            return;
        }
        if (!wa.trim()) {
            setError("Nomor telepon / WhatsApp wajib diisi.");
            return;
        }
        setSaving(true);
        setError("");
        try {
            const fields = buildUpdatedFields();
            const prevGaransi = formatWarrantyDurationText(
                quotation.garansiNilai ?? quotation.garansiTahun ?? 0,
                quotation.garansiUnit ?? "tahun"
            );
            const newGaransi = formatWarrantyDurationText(garansiNilai, garansiUnit);

            const logEntry: AdjustmentLogEntry = {
                adjustedAt: new Date().toISOString(),
                adjustedByUid: user.uid,
                adjustedByName: user.name,
                prevGaransiLabel: prevGaransi,
                newGaransiLabel: newGaransi,
                prevTotal: quotation.total,
                newTotal: totalFinal,
                reason: adjustmentReason.trim() || `Adjustment garansi (${prevGaransi} -> ${newGaransi}) / penyesuaian harga`,
            };

            await updateQuotationData(id, fields, logEntry);
            goBack();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal menyimpan revisi draft.");
        } finally {
            setSaving(false);
        }
    };

    // Simpan Adjustment & Langsung Approve (Konversi GP-DRF -> GP-APR + Auto-Generate PDF)
    const handleSaveAndApprove = async () => {
        if (!quotation || !id || !user || !isAdmin) return;
        if (!nama.trim()) {
            setError("Nama klien wajib diisi.");
            return;
        }
        if (!wa.trim()) {
            setError("Nomor telepon / WhatsApp wajib diisi.");
            return;
        }
        setApproving(true);
        setError("");
        try {
            const fields = buildUpdatedFields();
            const prevGaransi = formatWarrantyDurationText(
                quotation.garansiNilai ?? quotation.garansiTahun ?? 0,
                quotation.garansiUnit ?? "tahun"
            );
            const newGaransi = formatWarrantyDurationText(garansiNilai, garansiUnit);

            const logEntry: AdjustmentLogEntry = {
                adjustedAt: new Date().toISOString(),
                adjustedByUid: user.uid,
                adjustedByName: user.name,
                prevGaransiLabel: prevGaransi,
                newGaransiLabel: newGaransi,
                prevTotal: quotation.total,
                newTotal: totalFinal,
                reason: adjustmentReason.trim() || `Disetujui & diterbitkan nomor resmi oleh ${user.name}`,
            };

            await updateQuotationData(id, fields, logEntry);

            const mergedQuotation: Quotation = { ...quotation, ...fields };
            const finalSig = approvalSig || generateStampSignatureBase64(user.name, user.role);
            const { approvedNoSurat } = await approveAndIssueOfficialNumber({
                quotation: mergedQuotation,
                approvedByUid: user.uid,
                approvedByName: user.name,
                approvalSignatureBase64: finalSig,
                approvalSignedByRole: user.role,
            });

            // Generate PDF resmi dengan nomor surat resmi baru
            const pdfBlob = await generateCompanyQuotationPDF({
                noSurat: approvedNoSurat,
                tanggal: quotation.tanggal,
                kepadaNama: fields.kepadaNama!,
                kepadaAlamatLines: fields.kepadaAlamatLines!,
                kepadaUp: fields.kepadaUp,
                kepadaWa: fields.kepadaWa,
                objekPekerjaan: fields.objekPekerjaan,
                lokasiPekerjaan: fields.lokasiPekerjaan,
                jenisLayanan: quotation.jenisLayanan,
                pdfVariant: fields.pdfVariant,
                isRevisi: fields.isRevisi,
                perihal: quotation.perihal,
                items: fields.items!,
                biayaTambahan: fields.biayaTambahan,
                upahPeralatanPct: fields.upahPeralatanPct,
                diskonUpahPct: fields.diskonUpahPct,
                diskonPct: fields.diskonPct,
                ppn: fields.ppn,
                ppnDppFaktor: fields.ppnDppFaktor,
                garansiTahun: fields.garansiTahun,
                garansiNilai: fields.garansiNilai,
                garansiUnit: fields.garansiUnit,
                jenisGaransi: fields.jenisGaransi,
                tampilkanPengontrolan: fields.tampilkanPengontrolan,
                surveyor: fields.surveyor,
                tanggalSurvey: fields.tanggalSurvey ? new Date(`${fields.tanggalSurvey}T00:00:00+07:00`) : quotation.tanggal,
                hasilSurvey: fields.hasilSurvey,
                surveyPhotos: fields.surveyPhotos,
                chemicals: fields.chemicals,
                metode: fields.metode,
                marketingNama: quotation.marketingNama,
                marketingWa: quotation.marketingWa,
            }, quotation.companyId);

            const pdfBase64 = await blobToBase64(pdfBlob);
            await attachPdfToQuotation(id, pdfBase64);

            goBack();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal menyetujui dan menerbitkan nomor resmi.");
        } finally {
            setApproving(false);
        }
    };

    const isDraftStage = quotation.stage === "DRF" || quotation.noSurat.includes("-DRF/");

    return (
        <div className="max-w-4xl mx-auto py-2 px-1 sm:px-2 space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={handleCancel}
                        className="p-2 rounded-xl border border-[var(--border-subtle)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
                    >
                        <ArrowLeft size={16} />
                    </button>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
                                Panel Adjustment & Negosiasi Quotation
                            </h2>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold ${
                                isDraftStage
                                    ? "bg-[var(--status-draft-bg)] text-[var(--status-draft-text)] border border-amber-300"
                                    : "bg-[var(--status-approved-bg)] text-[var(--status-approved-text)] border border-emerald-300"
                            }`}>
                                {quotation.noSurat}
                            </span>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                            Surveyor/Marketing: <strong>{quotation.marketingNama}</strong> · Layanan: <strong>{LAYANAN_CONFIG[quotation.jenisLayanan]?.label}</strong>
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={handlePreviewPdf}
                    disabled={previewBusy}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-white hover:bg-[var(--bg-tertiary)] text-xs font-bold text-[var(--text-primary)]"
                >
                    <Eye size={14} className="text-[var(--accent)]" />
                    {previewBusy ? "Merender..." : "Pratinjau PDF Hasil Adjust"}
                </button>
            </div>

            <div className="clean-card p-4 sm:p-6 space-y-6">
                {/* 1. Panel Negosiasi Garansi Fleksibel (Preset + Custom Bulan / Tahun) */}
                <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                                <Sparkles size={14} className="text-amber-600" />
                                1. Adjustment Durasi Garansi (Bulan / Tahun) & Penyesuaian Tarif Negosiasi
                            </h3>
                            <p className="text-[11px] text-amber-800 mt-0.5">
                                Jika customer meminta penurunan harga, ubah durasi garansi (misal dari 3 Tahun ke 2 Tahun, 1 Tahun, atau Custom Bulan) untuk menyesuaikan harga satuan otomatis.
                            </p>
                        </div>
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 shrink-0">
                            Garansi Saat Ini: {formatWarrantyDurationText(garansiNilai, garansiUnit)}
                        </span>
                    </div>

                    {/* Tombol Cepat Preset Garansi */}
                    <div className="flex flex-wrap gap-2">
                        {WARRANTY_PRESET_OPTIONS.filter(o => !o.isCustom).map(opt => {
                            const isSel = garansiNilai === opt.nilai && garansiUnit === opt.unit;
                            return (
                                <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => handleApplyWarrantyToPrices(opt.nilai, opt.unit)}
                                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                                        isSel
                                            ? "border-amber-600 bg-amber-600 text-white shadow-xs"
                                            : "border-amber-200 bg-white text-amber-900 hover:bg-amber-100/60"
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Input Bebas Custom dalam Bulan maupun Tahun */}
                    <div className="pt-2 border-t border-amber-200/80 flex flex-wrap items-center gap-3">
                        <span className="text-xs font-bold text-amber-900">Atau Isi Custom (Bulan / Tahun):</span>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                min={0}
                                max={360}
                                step={0.5}
                                value={garansiNilai}
                                onChange={e => setGaransiNilai(parseFloat(e.target.value) || 0)}
                                className="w-24 px-3 py-1.5 text-sm font-bold font-mono border border-amber-300 rounded-lg bg-white text-center"
                            />
                            <select
                                value={garansiUnit}
                                onChange={e => setGaransiUnit(e.target.value as GaransiUnit)}
                                className="px-3 py-1.5 text-sm font-bold border border-amber-300 rounded-lg bg-white text-amber-900"
                            >
                                <option value="tahun">Tahun</option>
                                <option value="bulan">Bulan</option>
                            </select>
                            <button
                                type="button"
                                onClick={() => handleApplyWarrantyToPrices(garansiNilai, garansiUnit)}
                                className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold"
                            >
                                Terapkan Tarif Garansi {formatWarrantyDurationText(garansiNilai, garansiUnit)}
                            </button>
                        </div>
                    </div>
                </div>

                {/* 2. Tabel Item Volume & Harga Satuan */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                            2. Rincian Volume Kerja & Adjustment Harga Satuan
                        </h3>
                        <button
                            type="button"
                            onClick={() => setItems([...items, { desc: "", volumeFormula: "", qty: 1, unit: isAR ? "m²" : "Kali", harga: 0 }])}
                            className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent)] hover:underline"
                        >
                            <Plus size={13} /> Tambah Baris Item
                        </button>
                    </div>

                    <div className="space-y-2.5">
                        {items.map((it, idx) => (
                            <div key={idx} className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-tertiary)]/50 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                                <div className="sm:col-span-4">
                                    <label className="block text-[10px] font-bold uppercase text-[var(--text-secondary)] mb-1">Uraian Pekerjaan</label>
                                    <input
                                        className={inputCls}
                                        value={it.desc}
                                        onChange={e => setItems(items.map((x, i) => i === idx ? { ...x, desc: e.target.value } : x))}
                                    />
                                </div>
                                <div className="sm:col-span-3">
                                    <label className="block text-[10px] font-bold uppercase text-[var(--text-secondary)] mb-1 flex items-center gap-1">
                                        <Calculator size={10} /> Rumus Ukuran
                                    </label>
                                    <input
                                        className={`${inputCls} font-mono text-xs`}
                                        value={it.volumeFormula ?? ""}
                                        onChange={e => handleFormulaChange(idx, e.target.value)}
                                        placeholder="37+37+5,5..."
                                    />
                                </div>
                                <div className="sm:col-span-1">
                                    <label className="block text-[10px] font-bold uppercase text-[var(--text-secondary)] mb-1">Qty</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className={`${inputCls} font-mono font-bold`}
                                        value={it.qty}
                                        onChange={e => setItems(items.map((x, i) => i === idx ? { ...x, qty: parseFloat(e.target.value) || 0 } : x))}
                                    />
                                </div>
                                <div className="sm:col-span-1">
                                    <label className="block text-[10px] font-bold uppercase text-[var(--text-secondary)] mb-1">Satuan</label>
                                    <select
                                        className={inputCls}
                                        value={it.unit}
                                        onChange={e => setItems(items.map((x, i) => i === idx ? { ...x, unit: e.target.value } : x))}
                                    >
                                        {["m²", "m¹", "m³", "Kali", "Lot", "Kunjungan", "Periode", "Titik", "Unit", "ls"].map(u => (
                                            <option key={u} value={u}>{u}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-[10px] font-bold uppercase text-[var(--text-secondary)] mb-1">Harga Satuan</label>
                                    <input
                                        type="number"
                                        step={500}
                                        className={`${inputCls} font-mono font-bold`}
                                        value={it.harga}
                                        onChange={e => setItems(items.map((x, i) => i === idx ? { ...x, harga: parseInt(e.target.value) || 0 } : x))}
                                    />
                                </div>
                                <div className="sm:col-span-1 flex justify-end pb-1">
                                    {items.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => setItems(items.filter((_, i) => i !== idx))}
                                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 3. Diskon (%) & Skema PPN (Radio / Button: Non PPN vs PPN 12% DPP Nilai Lain) */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-3 border-t border-[var(--border-subtle)]">
                    <div className="md:col-span-4">
                        <label className="block text-[10px] font-bold uppercase text-[var(--text-secondary)] mb-1">Diskon Penawaran (%)</label>
                        <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            className={`${inputCls} font-mono font-bold`}
                            value={diskonPct}
                            onChange={e => setDiskonPct(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                        />
                        <p className="text-[10.5px] text-[var(--text-muted)] mt-1">Upah & Peralatan Kerja (default 25%) sudah di-take out.</p>
                    </div>
                    <div className="md:col-span-8">
                        <label className="block text-[10px] font-bold uppercase text-[var(--text-secondary)] mb-1">Skema PPN (Radio / Button)</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <label
                                onClick={() => { setPpn(false); setPpnDppFaktor(0); }}
                                className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${
                                    !ppn
                                        ? "border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent)] font-bold"
                                        : "border-[var(--border-subtle)] bg-white text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                                }`}
                            >
                                <input
                                    type="radio"
                                    name="skema_ppn_edit"
                                    checked={!ppn}
                                    onChange={() => { setPpn(false); setPpnDppFaktor(0); }}
                                    className="w-4 h-4 accent-[var(--accent)]"
                                />
                                <div>
                                    <div className="text-xs font-bold">Non PPN</div>
                                    <div className="text-[10px] text-[var(--text-muted)] font-normal">Tanpa PPN</div>
                                </div>
                            </label>
                            <label
                                onClick={() => { setPpn(true); setPpnDppFaktor(11 / 12); }}
                                className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${
                                    ppn
                                        ? "border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent)] font-bold"
                                        : "border-[var(--border-subtle)] bg-white text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                                }`}
                            >
                                <input
                                    type="radio"
                                    name="skema_ppn_edit"
                                    checked={ppn}
                                    onChange={() => { setPpn(true); setPpnDppFaktor(11 / 12); }}
                                    className="w-4 h-4 accent-[var(--accent)]"
                                />
                                <div>
                                    <div className="text-xs font-bold">PPN 12% (DPP Nilai Lain)</div>
                                    <div className="text-[10px] text-[var(--text-muted)] font-normal">DPP 11/12 × PPN 12%</div>
                                </div>
                            </label>
                        </div>
                    </div>
                </div>

                {/* 4. Data Klien, Alamat 1 & 2 (dengan Hint), Objek Survey & Varian Template PDF */}
                <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div>
                            <label className="block text-[10px] font-bold uppercase text-[var(--text-secondary)] mb-1">Nama Klien *</label>
                            <input className={inputCls} value={nama} onChange={e => setNama(e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold uppercase text-[var(--text-secondary)] mb-1">Nomor Telepon / WhatsApp *</label>
                            <input
                                className={inputCls}
                                value={wa}
                                onChange={e => setWa(e.target.value)}
                                placeholder="081234567890"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold uppercase text-[var(--text-secondary)] mb-1">Objek Pekerjaan Survey</label>
                            <input className={inputCls} value={objekPekerjaan} onChange={e => setObjekPekerjaan(e.target.value)} placeholder="bangunan rumah tinggal / kantor..." />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold uppercase text-[var(--text-secondary)] mb-1">Template PDF Fieldwork</label>
                            <select
                                value={pdfVariant}
                                onChange={e => setPdfVariant(e.target.value as PdfTemplateVariant)}
                                className={inputCls}
                            >
                                {PDF_VARIANT_OPTIONS.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] font-bold uppercase text-[var(--text-secondary)] mb-0.5">
                                Alamat 1 (Nama Jalan, Perumahan, No. Blok)
                            </label>
                            <p className="text-[10px] text-[var(--text-muted)] mb-1">Hint: Isi nama jalan, perumahan/gedung, dan nomor blok</p>
                            <input
                                className={inputCls}
                                value={alamatLines[0] ?? ""}
                                onChange={e => setAlamatLines([e.target.value, alamatLines[1] ?? ""])}
                                placeholder="Contoh: Perumahan Griya Indah, Jl. Melati Raya Blok C2 No. 14"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold uppercase text-[var(--text-secondary)] mb-0.5">
                                Alamat 2 (Kecamatan, Kelurahan, Kota, Provinsi)
                            </label>
                            <p className="text-[10px] text-[var(--text-muted)] mb-1">Hint: Isi kelurahan, kecamatan, kota/kabupaten, dan provinsi</p>
                            <input
                                className={inputCls}
                                value={alamatLines[1] ?? ""}
                                onChange={e => setAlamatLines([alamatLines[0] ?? "", e.target.value])}
                                placeholder="Contoh: Kel. Serua, Kec. Ciputat, Kota Tangerang Selatan, Banten"
                            />
                        </div>
                    </div>
                </div>

                {/* 5. Catatan Negosiasi / Alasan Adjustment & Ringkasan Harga */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[var(--border-subtle)]">
                    <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase text-[var(--text-secondary)]">
                            Catatan Negosiasi / Alasan Adjustment (Tercatat di Riwayat Draft)
                        </label>
                        <textarea
                            rows={3}
                            className={inputCls}
                            value={adjustmentReason}
                            onChange={e => setAdjustmentReason(e.target.value)}
                            placeholder="Contoh: Atas permintaan klien via Surveyor Bagas, garansi diturunkan dari 3 tahun ke 1 tahun agar masuk budget klien..."
                        />
                        {(quotation.adjustmentHistory?.length ?? 0) > 0 && (
                            <div className="p-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] space-y-1.5 text-[11px]">
                                <span className="font-bold text-[var(--text-primary)] flex items-center gap-1">
                                    <History size={12} /> Riwayat Adjustment Sebelumnya ({quotation.adjustmentHistory!.length}):
                                </span>
                                {quotation.adjustmentHistory!.slice(-3).map((h, i) => (
                                    <div key={i} className="text-[var(--text-secondary)] border-l-2 border-amber-400 pl-2">
                                        <span className="font-semibold">{h.adjustedByName}</span> ({new Date(h.adjustedAt).toLocaleString("id-ID")}): {h.reason} ({fmtIDR(h.prevTotal)} → <strong>{fmtIDR(h.newTotal)}</strong>)
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="p-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] space-y-2 text-xs">
                        <div className="flex justify-between">
                            <span className="text-[var(--text-secondary)]">Total Sebelumnya</span>
                            <span className="font-mono text-[var(--text-muted)] line-through">{fmtIDR(quotation.total)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[var(--text-secondary)]">Subtotal Item Baru</span>
                            <span className="font-mono font-semibold">{fmtIDR(calc.subtotal)}</span>
                        </div>
                        {calc.upahPeralatanRp > 0 && (
                            <div className="flex justify-between">
                                <span>Upah & Peralatan ({upahPeralatanPct}%)</span>
                                <span className="font-mono">+ {fmtIDR(calc.upahPeralatanRp)}</span>
                            </div>
                        )}
                        {calc.diskonUpahRp > 0 && (
                            <div className="flex justify-between text-red-600">
                                <span>(Diskon Upah {diskonUpahPct}%)</span>
                                <span className="font-mono">- {fmtIDR(calc.diskonUpahRp)}</span>
                            </div>
                        )}
                        {calc.ppnRp > 0 && (
                            <div className="flex justify-between">
                                <span>PPN</span>
                                <span className="font-mono">+ {fmtIDR(calc.ppnRp)}</span>
                            </div>
                        )}
                        <div className="pt-2 border-t border-[var(--border-subtle)] flex justify-between items-baseline text-sm font-bold">
                            <span>TOTAL SETELAH ADJUSTMENT</span>
                            <span className="font-mono text-base text-[var(--accent)]">{fmtIDR(totalFinal)}</span>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                        <AlertCircle size={15} /> {error}
                    </div>
                )}

                {/* 6. Section Approval (TTD Bukti Approval Internal - Non-Downloadable & Penghapusan Kode DRF) */}
                {isAdmin && (
                    <div
                        className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-3 select-none"
                        onContextMenu={e => e.preventDefault()}
                    >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-950 flex items-center gap-1.5">
                                    <ShieldCheck size={15} className="text-emerald-700" />
                                    Section Approval (Bukti TTD Approval Internal - Non-Download)
                                </h3>
                                <p className="text-[11px] text-emerald-800 mt-0.5">
                                    Tanda tangan di bawah ini dikunci sebagai <strong>bukti persetujuan internal (tidak dapat diunduh)</strong>. Saat klik <strong>Approve</strong>, kode <code>-DRF</code> otomatis dihapus menjadi <strong>{quotation.noSurat.replace(/-DRF\//g, "/").replace(/-APR\//g, "/")}</strong>.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => user && setApprovalSig(generateStampSignatureBase64(user.name, user.role))}
                                className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shrink-0"
                            >
                                {approvalSig ? "Perbarui Paraf Bukti Approval" : "Bubuhkan Paraf Bukti Approval"}
                            </button>
                        </div>

                        {approvalSig ? (
                            <div
                                className="relative rounded-xl border border-emerald-300 bg-white p-3 overflow-hidden select-none"
                                onContextMenu={e => e.preventDefault()}
                            >
                                <img
                                    src={approvalSig}
                                    alt="Bukti TTD Approval Non-Download"
                                    draggable={false}
                                    onContextMenu={e => e.preventDefault()}
                                    className="max-h-28 mx-auto pointer-events-none select-none"
                                />
                                <div className=" inset-0 pointer-events-none flex items-center justify-center">
                                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-900/60 bg-emerald-50/80 px-2.5 py-0.5 rounded border border-emerald-200">
                                        BUKTI APPROVAL INTERNAL • NON-DOWNLOADABLE
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-xl border border-dashed border-emerald-300 bg-white/70 p-3 text-center text-xs text-emerald-800">
                                Klik <strong>&ldquo;Bubuhkan Paraf Bukti Approval&rdquo;</strong> atau langsung klik tombol <strong>Approve</strong> di bawah untuk mengesahkan penawaran dan menghapus kode <code>DRF</code>.
                            </div>
                        )}
                    </div>
                )}

                {/* Action Footer: Simpan Ulang Draft (GP-DRF) vs Approve & Hilangkan DRF */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-[var(--border-subtle)]">
                    <button
                        type="button"
                        onClick={handleCancel}
                        className="px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-white text-xs sm:text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
                    >
                        Batal
                    </button>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                        <button
                            type="button"
                            onClick={handleSaveDraftAdjustment}
                            disabled={saving || approving}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold shadow-xs disabled:opacity-50"
                        >
                            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                            Simpan Revisi Draft (Update GP-DRF)
                        </button>

                        {isAdmin && (
                            <button
                                type="button"
                                onClick={handleSaveAndApprove}
                                disabled={saving || approving}
                                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs sm:text-sm font-bold shadow-xs disabled:opacity-50"
                            >
                                {approving ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                                Simpan & Approve (Hilangkan DRF & Sahkan)
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}