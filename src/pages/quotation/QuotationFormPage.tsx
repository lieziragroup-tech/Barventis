import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
    ArrowLeft, ArrowRight, Check, FileText,
    Plus, Trash2, Loader2, AlertCircle,
    Clock, Hash, Calculator, Ruler, Eye,
    FileCheck2, Database, ShieldCheck,
    Camera, X, FlaskConical, ChevronDown, ChevronUp, MessageCircle, MapPin, Sparkles, Calendar, Phone,
} from "lucide-react";
import { useAuthStore } from '@/app/store/authStore';
import { commitNomorSurat, previewNomorSurat } from '@/shared/api/nomorSuratService';
import { saveQuotationDraft, getQuotations } from '@/shared/api/quotationService';
import { LAYANAN_CONFIG, calcTotals, fmtIDR, TIPE_LABELS } from '@/shared/lib/quotationConfig';
import {
    WARRANTY_PRESET_OPTIONS,
    getPresetsForService,
    resolvePresetPriceByWarranty,
    formatWarrantyDurationText,
    generateDefaultFoggingSchedule,
    PRESET_WORK_ITEMS,
} from '@/shared/lib/warrantyPricingEngine';
import { evaluateVolumeFormula, formatVolumeID } from '@/shared/utils/volumeCalculator';
import { generateCompanyQuotationPDF } from '@/shared/api/documentConfig';
import { PhotoMeasureFallback } from '@/pages/field/PhotoMeasureFallback';
import type {
    JenisLayanan, TipeKontrak, KategoriSurat, QuotationItem, BiayaTambahan,
    SurveyPhoto, ChemicalItem, KondisiBangunan, GaransiUnit, PdfTemplateVariant, FoggingScheduleItem,
} from '@/entities/types';
import {
    DEFAULT_CHEMICALS_AR, DEFAULT_CHEMICALS_PCO,
    DEFAULT_FOCUS_TARGET, DEFAULT_TEKNIK_PCO, METODE_BY_LAYANAN,
} from '@/entities/types';

const STEPS = [
    { label: "Layanan & Template" },
    { label: "Klien & Objek Survey" },
    { label: "Garansi, Volume & Harga" },
    { label: "Hasil & Foto Survey" },
    { label: "Review & Kirim Draft" },
];

export const PDF_VARIANT_OPTIONS: { value: PdfTemplateVariant; label: string; desc: string; badge: string }[] = [
    {
        value: "auto",
        label: "Otomatis Sesuai Layanan",
        desc: "Sistem memilih tata letak resmi terbaik berdasarkan jenis layanan",
        badge: "Direkomendasikan",
    },
    {
        value: "ar_pra_profile_8p",
        label: "Tipe 1 — Proposal Pra-Konstruksi + Pipa (8 Halaman)",
        desc: "Cover + Edukasi Rayap + Company Profile Guci Emas + Koloni + Metode SNI + Pipa + Survey + Biaya (Contoh: PT Oreka 0005)",
        badge: "AR 8 Hal",
    },
    {
        value: "ar_pasca_standar_4p",
        label: "Tipe 2 — Penawaran Pasca-Konstruksi / Retreatment (4 Halaman)",
        desc: "Cover + Hasil Survey & Solusi Barrier + Tabel Rumus Volume + Tabel Biaya & Diskon Upah + Garansi (Contoh: Bank Victoria 0022)",
        badge: "AR 4 Hal",
    },
    {
        value: "pco_rodent_survey_4p",
        label: "Tipe 3 — Proposal Lengkap Rodent Control A–E (4 Halaman)",
        desc: "Cover + Hasil Survey Tikus + Program Kerja A–D (Tabel Planning Indoor/Outdoor) + E. Tabel Biaya Oranye (Contoh: Puskesmas 0009)",
        badge: "PCO Proposal",
    },
    {
        value: "pco_korporat_boq_3p",
        label: "Tipe 4 — Penawaran Pest & Rodent Korporat / BUMN (3 Halaman)",
        desc: "Cover dengan Total Harga + Metode I. Pest & II. Rodent + Tabel BOQ DPP Nilai Lain 11/12 & PPN 12% (Contoh: PLN 0003)",
        badge: "PCO BOQ",
    },
    {
        value: "pco_jadwal_fogging_1p",
        label: "Tipe 5 — Surat Jadwal Kerja Fogging 12 Bulan (1 Halaman)",
        desc: "Surat pengantar + Tabel Jadwal Kerja Januari s/d Desember (Tgl I & II) + TTD/Stempel (Contoh: Ibu Dita 0015)",
        badge: "PCO 1 Hal",
    },
];

function StepIndicator({ current }: { current: number }) {
    return (
        <div className="flex items-center gap-0 mb-6 mx-auto max-w-2xl">
            {STEPS.map((s, i) => (
                <div key={i} className="flex-1 flex flex-col items-center">
                    <div className="flex items-center w-full">
                        <div className={`flex-1 h-0.5 ${i === 0 ? "opacity-0" : i <= current ? "bg-[var(--accent)]" : "bg-[var(--border-subtle)]"}`} />
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all
                            ${i < current ? "bg-[var(--accent)] text-white" : i === current ? "bg-[var(--accent)] text-white ring-4 ring-emerald-100" : "bg-[var(--bg-tertiary)] text-[var(--text-muted)]"}`}>
                            {i < current ? <Check size={14} /> : i + 1}
                        </div>
                        <div className={`flex-1 h-0.5 ${i === STEPS.length - 1 ? "opacity-0" : i < current ? "bg-[var(--accent)]" : "bg-[var(--border-subtle)]"}`} />
                    </div>
                    <span className={`text-[11px] mt-1.5 font-semibold hidden sm:block text-center ${i === current ? "text-[var(--accent)]" : i < current ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]"}`}>
                        {s.label}
                    </span>
                </div>
            ))}
        </div>
    );
}

function Field({ label, required, error, hint, children }: {
    label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                {label}{required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            {children}
            {hint && <p className="text-[11px] text-[var(--text-muted)] italic">{hint}</p>}
            {error && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={11} />{error}</p>}
        </div>
    );
}

const inputCls = "w-full px-3 py-2 text-sm border border-[var(--border-subtle)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] bg-white text-[var(--text-primary)]";

export interface QuotationFormPageProps {
    onSavedSuccess?: () => void;
    onCancel?: () => void;
}

export function QuotationFormPage({ onSavedSuccess, onCancel }: QuotationFormPageProps = {}) {
    const navigate = useNavigate();
    const { user } = useAuthStore();

    const goBackToList = () => {
        if (onSavedSuccess) onSavedSuccess();
        else navigate("/quotations");
    };

    const handleCancel = () => {
        if (onCancel) onCancel();
        else navigate("/quotations");
    };

    const [step, setStep] = useState(0);

    // ── Step 1 State: Layanan, Kategori, Template, Preview GP-DRF ─────────────
    const [jenisLayanan, setJenisLayanan] = useState<JenisLayanan>("anti_rayap_injeksi");
    const [pdfVariant, setPdfVariant] = useState<PdfTemplateVariant>("auto");
    const [isRevisi, setIsRevisi] = useState(false);
    const [kategoriProyek, setKategoriProyek] = useState<any>("Residensial");
    const [tipe, setTipe] = useState<TipeKontrak>("PH");
    const [kondisiBangunan, setKondisiBangunan] = useState<KondisiBangunan>("pasca_konstruksi");
    const [kepada, setKepada] = useState("");
    const [noPreview, setNoPreview] = useState("");

    // ── Step 2 State: Data Klien vs Objek & Lokasi Survey ─────────────────────
    const [kepadaNama, setKepadaNama] = useState("");
    const [kepadaAlamat, setKepadaAlamat] = useState<string[]>(["", ""]);
    const [kepadaUp, setKepadaUp] = useState("");
    const [kepadaWa, setKepadaWa] = useState("");
    const [objekPekerjaan, setObjekPekerjaan] = useState("");
    const [lokasiSamaDenganSurat, setLokasiSamaDenganSurat] = useState(true);
    const [lokasiPekerjaan, setLokasiPekerjaan] = useState("");

    // ── Step 3 State: Garansi (Preset + Custom Bulan/Tahun), Volume & Harga ───
    const [garansiPresetId, setGaransiPresetId] = useState<string>("3_tahun");
    const [garansiNilai, setGaransiNilai] = useState<number>(3);
    const [garansiUnit, setGaransiUnit] = useState<GaransiUnit>("tahun");
    const [jenisGaransi, setJenisGaransi] = useState("Anti Rayap");
    const [tampilkanPengontrolan, setTampilkanPengontrolan] = useState(true);

    const [items, setItems] = useState<QuotationItem[]>([
        { presetCode: "ar_pondasi_1_sisi", desc: "Pondasi 1 sisi", volumeFormula: "", qty: 1, unit: "m¹", harga: 19000 },
    ]);
    const [upahPeralatanPct, setUpahPeralatanPct] = useState<number>(0);
    const [diskonUpahPct, setDiskonUpahPct] = useState<number>(0);
    const [biayaTambahan, setBiayaTambahan] = useState<BiayaTambahan[]>([]);
    const [diskonPct, setDiskonPct] = useState(0);
    const [ppn, setPpn] = useState(false);
    const [ppnDppFaktor, setPpnDppFaktor] = useState(0);
    const [pembulatanRp, setPembulatanRp] = useState(0);
    const [estimasiHari, setEstimasiHari] = useState(2);

    // Khusus PCO Rodent / Jadwal Fogging 12 Bulan
    const [kunjunganPerBulan, setKunjunganPerBulan] = useState<number>(3);
    const [jadwalFoggingTahun, setJadwalFoggingTahun] = useState<number>(new Date().getFullYear());
    const [jadwalFoggingRows, setJadwalFoggingRows] = useState<FoggingScheduleItem[]>(() =>
        generateDefaultFoggingSchedule(new Date().getFullYear())
    );

    // ── Step 4 State: Hasil Survey, Temuan, Foto, & Teknis ────────────────────
    const [surveyor, setSurveyor] = useState<string>(user?.name ?? "");
    const [tanggalSurvey, setTanggalSurvey] = useState<string>(() => new Date().toISOString().slice(0, 10));
    const [hasilSurvey, setHasilSurvey] = useState<string>("");
    const [surveyPhotos, setSurveyPhotos] = useState<SurveyPhoto[]>([]);
    const [lampiranPages, setLampiranPages] = useState<SurveyPhoto[]>([]);
    const [showCameraMeasureForIdx, setShowCameraMeasureForIdx] = useState<number | null>(null);

    const isAR = LAYANAN_CONFIG[jenisLayanan]?.isAR ?? false;
    const kategori: KategoriSurat = LAYANAN_CONFIG[jenisLayanan]?.kategori ?? "PCO";

    const [chemicals, setChemicals] = useState<ChemicalItem[]>(() =>
        DEFAULT_CHEMICALS_AR.map(c => ({ ...c }))
    );
    const [metode, setMetode] = useState<string[]>(() =>
        (METODE_BY_LAYANAN[jenisLayanan] ?? METODE_BY_LAYANAN["anti_rayap_injeksi"]).map(m => m)
    );
    const [focusTarget, setFocusTarget] = useState(DEFAULT_FOCUS_TARGET);
    const [teknikPelaksanaan, setTeknikPelaksanaan] = useState<string[]>(DEFAULT_TEKNIK_PCO.map(t => t));

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [savedResult, setSavedResult] = useState<{ noSurat: string; id: string } | null>(null);
    const [previewBusy, setPreviewBusy] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (user?.name && !surveyor) setSurveyor(user.name);
    }, [user?.name, surveyor]);

    // Update preview nomor surat (selalu stage 'DRF' saat pembuatan awal oleh Surveyor/Marketing)
    useEffect(() => {
        if (!user?.companyId) return;
        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                const no = await previewNomorSurat(kategori, tipe, user.companyId, jenisLayanan, "DRF");
                if (!cancelled) setNoPreview(no);
            } catch {
                const ym = `${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, "0")}`;
                if (!cancelled) setNoPreview(`GP-DRF/${kategori}/${tipe}/${ym}/0001`);
            }
        }, 200);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [kategori, tipe, jenisLayanan, user?.companyId]);

    // Saat ganti layanan, sesuaikan default garansi, item preset pertama, chemical, dan metode
    const handleSelectLayanan = (nextLayanan: JenisLayanan) => {
        const nextIsAR = LAYANAN_CONFIG[nextLayanan]?.isAR ?? false;
        setJenisLayanan(nextLayanan);

        let nextGaransiNilai = garansiNilai;
        let nextGaransiUnit: GaransiUnit = garansiUnit;

        if (nextIsAR) {
            if (nextLayanan === "anti_rayap_soil") {
                setKondisiBangunan("pra_konstruksi");
                setGaransiPresetId("5_tahun");
                nextGaransiNilai = 5;
                nextGaransiUnit = "tahun";
                setGaransiNilai(5);
                setGaransiUnit("tahun");
                setPdfVariant("ar_pra_profile_8p");
            } else {
                setKondisiBangunan("pasca_konstruksi");
                setGaransiPresetId("3_tahun");
                nextGaransiNilai = 3;
                nextGaransiUnit = "tahun";
                setGaransiNilai(3);
                setGaransiUnit("tahun");
                setPdfVariant("ar_pasca_standar_4p");
            }
        } else {
            setKondisiBangunan(null);
            setGaransiPresetId("0_tahun");
            nextGaransiNilai = 0;
            nextGaransiUnit = "tahun";
            setGaransiNilai(0);
            setGaransiUnit("tahun");
            if (nextLayanan === "pest_rodent") setPdfVariant("pco_rodent_survey_4p");
            else if (nextLayanan === "pest_fogging") setPdfVariant("pco_jadwal_fogging_1p");
            else setPdfVariant("pco_korporat_boq_3p");
        }

        const presets = getPresetsForService(nextLayanan);
        const firstPreset = presets[0];
        if (firstPreset) {
            const autoPrice = resolvePresetPriceByWarranty(firstPreset, nextGaransiNilai, nextGaransiUnit);
            setItems([{
                presetCode: firstPreset.code,
                desc: firstPreset.label,
                volumeFormula: "",
                qty: nextLayanan === "pest_rodent" ? 3 : 1,
                unit: firstPreset.unit,
                harga: autoPrice,
            }]);
        }

        setChemicals(nextIsAR ? DEFAULT_CHEMICALS_AR.map(c => ({ ...c })) : DEFAULT_CHEMICALS_PCO.map(c => ({ ...c })));
        setMetode((METODE_BY_LAYANAN[nextLayanan] ?? METODE_BY_LAYANAN["anti_rayap_injeksi"]).map(m => m));
    };

    // Saat durasi garansi (nilai atau unit bulan/tahun) berubah, otomatis perbarui harga item yang memakai preset
    const applyWarrantyChange = (nextNilai: number, nextUnit: GaransiUnit, presetId: string) => {
        setGaransiNilai(nextNilai);
        setGaransiUnit(nextUnit);
        setGaransiPresetId(presetId);

        setItems(prev => prev.map(it => {
            if (!it.presetCode) return it;
            const found = PRESET_WORK_ITEMS.find(p => p.code === it.presetCode);
            if (!found) return it;
            return {
                ...it,
                harga: resolvePresetPriceByWarranty(found, nextNilai, nextUnit),
            };
        }));
    };

    // Handler perubahan item (pilih preset, ketik rumus volume, dll.)
    const handleSelectPresetForItem = (idx: number, presetCode: string) => {
        const found = PRESET_WORK_ITEMS.find(p => p.code === presetCode);
        if (!found) {
            setItems(prev => prev.map((it, i) => i === idx ? { ...it, presetCode: undefined } : it));
            return;
        }
        const autoHarga = resolvePresetPriceByWarranty(found, garansiNilai, garansiUnit);
        setItems(prev => prev.map((it, i) => i === idx ? {
            ...it,
            presetCode: found.code,
            desc: found.label,
            unit: found.unit,
            harga: autoHarga,
        } : it));
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

    const updateItemField = (idx: number, field: keyof QuotationItem, val: any) => {
        setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));
    };

    const addItemRow = () => {
        const presets = getPresetsForService(jenisLayanan, kategori);
        const def = presets[items.length % Math.max(1, presets.length)] ?? presets[0];
        setItems(prev => [
            ...prev,
            {
                presetCode: def?.code,
                desc: def?.label ?? "",
                volumeFormula: "",
                qty: 1,
                unit: def?.unit ?? (isAR ? "m²" : "Kali"),
                harga: def ? resolvePresetPriceByWarranty(def, garansiNilai, garansiUnit) : 0,
            },
        ]);
    };

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

    // Validasi per step
    const validateStep = useCallback((): boolean => {
        const e: Record<string, string> = {};
        if (step === 0 && !kepada.trim() && !kepadaNama.trim()) {
            e.kepada = "Nama klien / perusahaan wajib diisi.";
        }
        if (step === 1) {
            if (!(kepadaNama || kepada).trim()) e.nama = "Nama klien wajib diisi.";
            if (!kepadaAlamat.some(l => l.trim())) e.alamat = "Alamat surat klien minimal 1 baris.";
            const cleanWa = kepadaWa.replace(/\D/g, "");
            if (!kepadaWa.trim()) {
                e.wa = "Nomor telepon / WhatsApp wajib diisi.";
            } else if (cleanWa.length < 8 || cleanWa.length > 16) {
                e.wa = "Nomor telepon / WhatsApp tidak valid (minimal 8 digit).";
            }
        }
        if (step === 2) {
            if (items.length === 0) e.items = "Minimal 1 baris pekerjaan.";
            else if (items.some(it => !it.desc.trim())) e.items = "Deskripsi pekerjaan wajib diisi.";
            else if (items.some(it => it.qty <= 0)) e.items = "Volume kerja harus lebih dari 0.";
            else if (items.some(it => it.harga <= 0)) e.items = "Harga satuan harus lebih dari 0.";
        }
        setErrors(e);
        return Object.keys(e).length === 0;
    }, [step, kepada, kepadaNama, kepadaAlamat, items]);

    const handleNext = () => {
        if (!validateStep()) return;
        if (step === 0 && !kepadaNama && kepada) setKepadaNama(kepada);
        setStep(s => Math.min(STEPS.length - 1, s + 1));
    };

    // Upload & kompresi ringan foto survey
    const handleAddPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = ev => {
                const base64 = (ev.target?.result as string) ?? "";
                setSurveyPhotos(prev => [...prev, { base64, caption: file.name.replace(/\.[^.]+$/, "") }]);
            };
            reader.readAsDataURL(file);
        });
        e.target.value = "";
    };

    // Pratinjau PDF langsung di browser
    const handlePreviewPdf = async () => {
        setPreviewBusy(true);
        try {
            const effectiveVariant: PdfTemplateVariant = pdfVariant === "auto"
                ? (jenisLayanan === "anti_rayap_soil" ? "ar_pra_profile_8p"
                    : isAR ? "ar_pasca_standar_4p"
                    : jenisLayanan === "pest_rodent" ? "pco_rodent_survey_4p"
                    : jenisLayanan === "pest_fogging" ? "pco_jadwal_fogging_1p"
                    : "pco_korporat_boq_3p")
                : pdfVariant;

            const blob = await generateCompanyQuotationPDF({
                noSurat: noPreview || `GP-DRF/${kategori}/${tipe}/2026/10/0001`,
                isDraft: true,
                isApproved: false,
                tanggal: new Date(),
                kepadaNama: (kepadaNama || kepada).trim() || "PT Contoh Klien",
                kepadaAlamatLines: kepadaAlamat.filter(Boolean),
                kepadaUp: kepadaUp || undefined,
                kepadaWa: kepadaWa || undefined,
                objekPekerjaan: objekPekerjaan || undefined,
                lokasiPekerjaan: lokasiSamaDenganSurat ? kepadaAlamat.filter(Boolean).join(", ") : lokasiPekerjaan,
                jenisLayanan,
                pdfVariant: effectiveVariant,
                isRevisi,
                perihal: LAYANAN_CONFIG[jenisLayanan]?.perihal,
                items,
                biayaTambahan,
                upahPeralatanPct: upahPeralatanPct || undefined,
                diskonUpahPct: diskonUpahPct || undefined,
                diskonPct,
                ppn,
                ppnDppFaktor: ppnDppFaktor || undefined,
                garansiTahun: garansiUnit === "tahun" ? garansiNilai : Number((garansiNilai / 12).toFixed(2)),
                garansiNilai,
                garansiUnit,
                jenisGaransi,
                tampilkanPengontrolan,
                surveyor: surveyor || user?.name,
                tanggalSurvey: tanggalSurvey ? new Date(`${tanggalSurvey}T00:00:00+07:00`) : new Date(),
                hasilSurvey: hasilSurvey || undefined,
                kunjunganPerBulan,
                jadwalFoggingTahun,
                jadwalFoggingRows,
                surveyPhotos,
                lampiranPages,
                chemicals,
                metode,
                focusTarget,
                teknikPelaksanaan,
                marketingNama: user?.name,
                marketingWa: user?.wa,
            }, user?.companyId);

            const url = URL.createObjectURL(blob);
            window.open(url, "_blank");
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        } catch (err) {
            alert(err instanceof Error ? err.message : "Gagal membuat pratinjau PDF.");
        } finally {
            setPreviewBusy(false);
        }
    };

    // Simpan Draft Survey dengan kode GP-DRF
    const handleSubmitDraft = async () => {
        if (!user) return;
        setSubmitting(true);
        setSubmitError(null);
        try {
            const kepadaFinal = (kepadaNama || kepada).trim();
            const now = new Date();
            const effectiveVariant: PdfTemplateVariant = pdfVariant === "auto"
                ? (jenisLayanan === "anti_rayap_soil" ? "ar_pra_profile_8p"
                    : isAR ? "ar_pasca_standar_4p"
                    : jenisLayanan === "pest_rodent" ? "pco_rodent_survey_4p"
                    : jenisLayanan === "pest_fogging" ? "pco_jadwal_fogging_1p"
                    : "pco_korporat_boq_3p")
                : pdfVariant;

            // Step 1: Terbitkan Nomor Draft (GP-DRF/AR/... atau GP-DRF/PCO/...)
            const nomorEntry = await commitNomorSurat({
                kategori,
                tipe,
                jenisLayanan,
                kepada: kepadaFinal,
                byUid: user.uid,
                byName: user.name,
                companyId: user.companyId,
                stage: "DRF",
            });

            // Step 2: Simpan Quotation Draft ke Database
            const saved = await saveQuotationDraft({
                noSurat: nomorEntry.noSurat,
                draftNoSurat: nomorEntry.noSurat,
                stage: "DRF",
                kategori,
                tipeKontrak: tipe,
                jenisLayanan,
                pdfVariant: effectiveVariant,
                isRevisi,
                kategoriProyek,
                perihal: LAYANAN_CONFIG[jenisLayanan]?.perihal ?? "Penawaran Harga",
                kepadaNama: kepadaFinal,
                kepadaAlamatLines: kepadaAlamat.filter(Boolean),
                kepadaUp: kepadaUp || undefined,
                kepadaWa: kepadaWa || undefined,
                objekPekerjaan: objekPekerjaan || undefined,
                lokasiPekerjaan: lokasiSamaDenganSurat ? kepadaAlamat.filter(Boolean).join(", ") : lokasiPekerjaan,
                tanggal: now,
                items,
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
                jenisGaransi: jenisGaransi || undefined,
                tampilkanPengontrolan,
                estimasiHari: estimasiHari || undefined,
                subtotal: calc.subtotal,
                diskonRp: calc.diskonRp,
                ppnRp: calc.ppnRp,
                total: totalFinal,
                marketingUid: user.uid,
                marketingNama: user.name,
                marketingWa: user.wa,
                status: "pending",
                companyId: user.companyId,
                surveyor: surveyor || user.name,
                tanggalSurvey,
                hasilSurvey: hasilSurvey || undefined,
                kunjunganPerBulan: !isAR ? kunjunganPerBulan : undefined,
                jadwalFoggingTahun: effectiveVariant === "pco_jadwal_fogging_1p" ? jadwalFoggingTahun : undefined,
                jadwalFoggingRows: effectiveVariant === "pco_jadwal_fogging_1p" ? jadwalFoggingRows : undefined,
                surveyPhotos: surveyPhotos.length > 0 ? surveyPhotos : undefined,
                lampiranPages: lampiranPages.length > 0 ? lampiranPages : undefined,
                chemicals: chemicals.length > 0 ? chemicals : undefined,
                metode: isAR && metode.length > 0 ? metode : undefined,
                focusTarget: !isAR ? focusTarget : undefined,
                teknikPelaksanaan: !isAR && teknikPelaksanaan.length > 0 ? teknikPelaksanaan : undefined,
                kondisiBangunan: kondisiBangunan || undefined,
            }, nomorEntry.id);

            setSavedResult({ noSurat: saved.noSurat, id: saved.id });
        } catch (err) {
            setSubmitError(err instanceof Error ? err.message : "Gagal menyimpan draft penawaran.");
        } finally {
            setSubmitting(false);
        }
    };

    // Modal Kamera Ukur Lapangan (PhotoMeasureFallback)
    if (showCameraMeasureForIdx !== null) {
        return (
            <div className="fixed inset-0 z-50 bg-black">
                <PhotoMeasureFallback
                    onBack={() => setShowCameraMeasureForIdx(null)}
                    onApplyMeasurement={(totalMeter, annotatedPhotoBase64) => {
                        const targetIdx = showCameraMeasureForIdx;
                        if (targetIdx !== null && totalMeter > 0) {
                            const roundedM = Math.round(totalMeter * 100) / 100;
                            setItems(prev => prev.map((it, i) => {
                                if (i !== targetIdx) return it;
                                const nextFormula = it.volumeFormula
                                    ? `${it.volumeFormula}+${String(roundedM).replace(".", ",")}`
                                    : String(roundedM).replace(".", ",");
                                const ev = evaluateVolumeFormula(nextFormula);
                                return {
                                    ...it,
                                    volumeFormula: nextFormula,
                                    qty: ev.isValid ? ev.value : roundedM,
                                };
                            }));
                        }
                        if (annotatedPhotoBase64) {
                            setSurveyPhotos(prev => [
                                ...prev,
                                { base64: annotatedPhotoBase64, caption: ` Pengukuran Lapangan (${totalMeter.toFixed(2)} m)` },
                            ]);
                        }
                        setShowCameraMeasureForIdx(null);
                    }}
                />
            </div>
        );
    }

    if (savedResult) {
        return (
            <div className="max-w-xl mx-auto py-8 px-4">
                <div className="clean-card p-6 sm:p-8 text-center space-y-5">
                    <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                        <Clock size={32} />
                    </div>
                    <div>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[var(--status-draft-bg)] text-[var(--status-draft-text)] mb-2">
                            STAGE 1: DRAFT TERKIRIM KE ADMIN
                        </span>
                        <h2 className="text-xl font-bold text-[var(--text-primary)]">Data Hasil Survey & Draft Tersimpan!</h2>
                        <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
                            Draft ini telah dikunci dengan kode <strong>GP-DRF</strong> dan siap diverifikasi atau di-adjust oleh Admin.
                        </p>
                    </div>

                    <div className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-xl p-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-1">
                            Kode Nomor Surat Draft
                        </span>
                        <code className="text-base sm:text-lg font-bold font-mono text-[var(--accent)]">
                            {savedResult.noSurat}
                        </code>
                    </div>

                    <div className="text-left bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 space-y-1.5 text-xs text-emerald-900">
                        <p className="font-bold flex items-center gap-1.5">
                            <ShieldCheck size={15} className="text-emerald-700" /> Alur Selanjutnya (Negosiasi & Approval):
                        </p>
                        <p>1. Jika customer meminta negosiasi harga (misal turun garansi dari {formatWarrantyDurationText(garansiNilai, garansiUnit)} menjadi 1 tahun atau minta diskon), konfirmasikan ke Admin.</p>
                        <p>2. Admin dapat langsung melakukan <strong>Adjustment Garansi / Harga</strong> dan menyimpan ulang draft <code>{savedResult.noSurat}</code>.</p>
                        <p>3. Saat disetujui (Approve), kode <strong>-DRF</strong> otomatis dihapus menjadi nomor surat resmi <strong>GP/{kategori}/{tipe}/...</strong>.</p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
                        <button
                            type="button"
                            onClick={handlePreviewPdf}
                            disabled={previewBusy}
                            className="flex-1 py-2.5 px-4 rounded-xl border border-[var(--border-subtle)] bg-white hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-xs sm:text-sm font-semibold flex items-center justify-center gap-2"
                        >
                            <Eye size={15} /> {previewBusy ? "Membuka PDF..." : "Lihat Pratinjau PDF Draft"}
                        </button>
                        <button
                            type="button"
                            onClick={goBackToList}
                            className="flex-1 py-2.5 px-4 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2"
                        >
                            Buka Daftar Quotation <ArrowRight size={15} />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const arEntries = Object.entries(LAYANAN_CONFIG).filter(([, c]) => c.isAR);
    const pcoEntries = Object.entries(LAYANAN_CONFIG).filter(([, c]) => !c.isAR);
    const availablePresets = getPresetsForService(jenisLayanan, kategori);
    const isCustomWarranty = garansiPresetId === "custom";

    return (
        <div className="max-w-4xl mx-auto py-2 px-1 sm:px-2 space-y-5">
            {/* Top Bar */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={handleCancel}
                        className="p-2 rounded-xl border border-[var(--border-subtle)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                    >
                        <ArrowLeft size={16} />
                    </button>
                    <div>
                        <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                            <FileText size={18} className="text-[var(--accent)]" />
                            Input Hasil Survey & Automation Quotation
                        </h2>
                        <p className="text-xs text-[var(--text-muted)]">
                            Fieldwork — Alur Draft Survey <span className="font-mono font-bold text-amber-700">GP-DRF/...</span> → Approved Resmi <span className="font-mono font-bold text-emerald-700">GP/...</span>
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={handlePreviewPdf}
                    disabled={previewBusy}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-white hover:bg-[var(--bg-tertiary)] text-xs font-semibold text-[var(--text-primary)] shadow-2xs"
                >
                    <Eye size={14} className="text-[var(--accent)]" />
                    {previewBusy ? "Merender..." : "Preview PDF"}
                </button>
            </div>

            <StepIndicator current={step} />

            <div className="clean-card p-4 sm:p-6 space-y-6">
                {/* ── STEP 0: LAYANAN, TIPE & TEMPLATE PDF ────────────────────────── */}
                {step === 0 && (
                    <div className="space-y-6">
                        <Field label="1. Pilih Kategori & Jenis Layanan (AR vs PCO)" required>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Kolom AR */}
                                <div className="p-3.5 rounded-xl border border-purple-200 bg-purple-50/30 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-purple-800 uppercase tracking-wider">🛡️ Anti Rayap (Kode: AR)</span>
                                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-800">GP-DRF/AR/...</span>
                                    </div>
                                    <div className="space-y-1.5">
                                        {arEntries.map(([val, cfg]) => {
                                            const sel = jenisLayanan === val;
                                            return (
                                                <button
                                                    key={val}
                                                    type="button"
                                                    onClick={() => handleSelectLayanan(val as JenisLayanan)}
                                                    className={`w-full px-3 py-2.5 rounded-lg border text-left text-xs transition-all flex items-center justify-between ${
                                                        sel
                                                            ? "border-purple-600 bg-purple-600 text-white font-bold shadow-xs"
                                                            : "border-purple-200/80 bg-white text-[var(--text-primary)] hover:bg-purple-50"
                                                    }`}
                                                >
                                                    <span>{cfg.label.replace("Anti Rayap — ", "")}</span>
                                                    {sel && <Check size={14} />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Kolom PCO */}
                                <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/30 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider">🦟 Pest Control (Kode: PCO)</span>
                                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">GP-DRF/PCO/...</span>
                                    </div>
                                    <div className="space-y-1.5">
                                        {pcoEntries.map(([val, cfg]) => {
                                            const sel = jenisLayanan === val;
                                            return (
                                                <button
                                                    key={val}
                                                    type="button"
                                                    onClick={() => handleSelectLayanan(val as JenisLayanan)}
                                                    className={`w-full px-3 py-2.5 rounded-lg border text-left text-xs transition-all flex items-center justify-between ${
                                                        sel
                                                            ? "border-[var(--accent)] bg-[var(--accent)] text-white font-bold shadow-xs"
                                                            : "border-emerald-200/80 bg-white text-[var(--text-primary)] hover:bg-emerald-50"
                                                    }`}
                                                >
                                                    <span>{cfg.label.replace("Pest Control — ", "")}</span>
                                                    {sel && <Check size={14} />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </Field>

                        {/* Pilihan Varian Template PDF PT Guci Emas Pratama */}
                        <Field label="2. Format Template Dokumen PDF PT Guci Emas Pratama" required>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {PDF_VARIANT_OPTIONS.map(opt => {
                                    const sel = pdfVariant === opt.value;
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => setPdfVariant(opt.value)}
                                            className={`p-3 rounded-xl border text-left transition-all ${
                                                sel
                                                    ? "border-[var(--accent)] bg-[var(--accent-glow)] ring-1 ring-[var(--accent)]"
                                                    : "border-[var(--border-subtle)] bg-white hover:bg-[var(--bg-tertiary)]"
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                <span className="text-xs font-bold text-[var(--text-primary)]">{opt.label}</span>
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-[var(--border-subtle)] text-[var(--accent)] shrink-0">
                                                    {opt.badge}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-[var(--text-secondary)] leading-snug">{opt.desc}</p>
                                        </button>
                                    );
                                })}
                            </div>
                        </Field>

                        {/* Tipe Surat & Status Revisi */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="3. Tipe Surat">
                                <div className="grid grid-cols-3 gap-2">
                                    {([
                                        { v: "PH", l: "PH (Penawaran)" },
                                        { v: "K",  l: "K (Kontrak)" },
                                        { v: "U",  l: "U (Umum)" },
                                    ] as const).map(x => (
                                        <button
                                            key={x.v}
                                            type="button"
                                            onClick={() => setTipe(x.v)}
                                            className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                                                tipe === x.v
                                                    ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                                                    : "border-[var(--border-subtle)] bg-white text-[var(--text-secondary)]"
                                            }`}
                                        >
                                            {x.l}
                                        </button>
                                    ))}
                                </div>
                            </Field>

                            <Field label="4. Opsi Revisi / Retreatment">
                                <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isRevisi}
                                        onChange={e => setIsRevisi(e.target.checked)}
                                        className="w-4 h-4 accent-[var(--accent)] rounded"
                                    />
                                    <div className="text-xs">
                                        <span className="font-bold text-[var(--text-primary)] block">Tandai sebagai Revisi / Retreatment</span>
                                        <span className="text-[10px] text-[var(--text-muted)]">Perihal otomatis diawali "Revisi Penawaran..." (Contoh Bank Victoria)</span>
                                    </div>
                                </label>
                            </Field>
                        </div>

                        <Field label="5. Ditujukan Kepada (Nama Klien / Instansi / Perusahaan)" required error={errors.kepada}>
                            <input
                                className={inputCls}
                                value={kepada}
                                onChange={e => { setKepada(e.target.value); setKepadaNama(e.target.value); }}
                                placeholder="Contoh: PT Oreka Solusi Kreatif / Bank Victoria / UPTD Puskesmas Pisangan / Ibu Dita"
                            />
                        </Field>

                        {/* Banner Preview Dual-Stage Numbering GP-DRF -> Nomor Resmi (GP/AR/... atau GP/PCO/...) */}
                        <div className="p-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                                    Preview Penomoran Otomatis 2 Tahap (Dual-Stage)
                                </span>
                                <div className="flex items-center gap-2 flex-wrap mt-1">
                                    <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-[var(--status-draft-bg)] text-[var(--status-draft-text)] border border-amber-300">
                                        Draft: {noPreview || `GP-DRF/${kategori}/${tipe}/...`}
                                    </span>
                                    <ArrowRight size={14} className="text-[var(--text-muted)]" />
                                    <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-[var(--status-approved-bg)] text-[var(--status-approved-text)] border border-emerald-300">
                                        Saat Approve (DRF Hilang): {(noPreview || `GP-DRF/${kategori}/${tipe}/...`).replace("-DRF/", "/")}
                                    </span>
                                </div>
                            </div>
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold self-start sm:self-center ${
                                kategori === "AR" ? "bg-purple-100 text-purple-800" : "bg-emerald-100 text-emerald-800"
                            }`}>
                                {kategori === "AR" ? "Kategori: Anti Rayap (AR)" : "Kategori: Pest Control (PCO)"}
                            </span>
                        </div>
                    </div>
                )}

                {/* ── STEP 1: DATA KLIEN VS OBJEK & LOKASI SURVEY ─────────────────── */}
                {step === 1 && (
                    <div className="space-y-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Nama Klien / Perusahaan (Tujuan Surat)" required error={errors.nama}>
                                <input
                                    className={inputCls}
                                    value={kepadaNama}
                                    onChange={e => setKepadaNama(e.target.value)}
                                    placeholder="PT Oreka Solusi Kreatif"
                                />
                            </Field>
                            <Field label="U.p. / PIC / Pejabat Terkait" hint="Contoh: Bapak Chairi / Ibu Hetin">
                                <input
                                    className={inputCls}
                                    value={kepadaUp}
                                    onChange={e => setKepadaUp(e.target.value)}
                                    placeholder="Bapak Chairi"
                                />
                            </Field>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field
                                label="Alamat 1 (Nama Jalan, Perumahan / Gedung, No. Blok)"
                                required
                                error={errors.alamat}
                                hint="Isi nama jalan, nama perumahan atau gedung, nomor rumah, dan blok"
                            >
                                <input
                                    className={inputCls}
                                    value={kepadaAlamat[0] ?? ""}
                                    onChange={e => setKepadaAlamat([e.target.value, kepadaAlamat[1] ?? ""])}
                                    placeholder="Contoh: Perumahan Griya Indah, Jl. Melati Raya Blok C2 No. 14"
                                />
                            </Field>
                            <Field
                                label="Alamat 2 (Kecamatan, Kelurahan, Kota, Provinsi)"
                                hint="Isi kelurahan, kecamatan, kota/kabupaten, dan provinsi"
                            >
                                <input
                                    className={inputCls}
                                    value={kepadaAlamat[1] ?? ""}
                                    onChange={e => setKepadaAlamat([kepadaAlamat[0] ?? "", e.target.value])}
                                    placeholder="Contoh: Kel. Serua, Kec. Ciputat, Kota Tangerang Selatan, Banten"
                                />
                            </Field>
                        </div>

                        <div className="p-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-1.5">
                                    <MapPin size={14} className="text-[var(--accent)]" /> Objek & Lokasi Pekerjaan Hasil Survey
                                </span>
                                <span className="text-[11px] text-[var(--text-muted)]">Tercetak tebal pada paragraf pembuka surat</span>
                            </div>

                            <Field
                                label="Nama Objek Pekerjaan / Bangunan yang Disurvey"
                                hint="Contoh: bangunan rumah tinggal pra konstruksi / Bank Victoria Cabang Fatmawati / UPTD Puskesmas Pisangan"
                            >
                                <input
                                    className={inputCls}
                                    value={objekPekerjaan}
                                    onChange={e => setObjekPekerjaan(e.target.value)}
                                    placeholder={isAR ? "bangunan rumah tinggal pra konstruksi" : `lingkungan ${kepadaNama || "Klien"}`}
                                />
                            </Field>

                            <label className="flex items-center gap-2 text-xs font-medium text-[var(--text-primary)] cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={lokasiSamaDenganSurat}
                                    onChange={e => setLokasiSamaDenganSurat(e.target.checked)}
                                    className="w-4 h-4 accent-[var(--accent)] rounded"
                                />
                                Alamat lokasi pekerjaan sama dengan alamat surat klien di atas
                            </label>

                            {!lokasiSamaDenganSurat && (
                                <Field
                                    label="Alamat Lengkap Lokasi Pekerjaan (Jika berbeda dari alamat kantor/surat)"
                                    hint="Contoh: Jl. RC. Veteran Raya No. 9, RT.001 / RW.003, Bintaro, Kec. Pesanggrahan, Jakarta Selatan"
                                >
                                    <input
                                        className={inputCls}
                                        value={lokasiPekerjaan}
                                        onChange={e => setLokasiPekerjaan(e.target.value)}
                                        placeholder="Jl. RC. Veteran Raya No. 9, RT.001 / RW.003, Bintaro, Jakarta Selatan"
                                    />
                                </Field>
                            )}
                        </div>

                        <Field label="Nomor Telepon / WhatsApp *" error={errors.wa}>
                            <div className="relative">
                                <Phone size={15} className="text-slate-500 absolute left-3 top-2.5" />
                                <input
                                    className={`${inputCls} pl-9`}
                                    value={kepadaWa}
                                    onChange={e => {
                                        setKepadaWa(e.target.value);
                                        if (errors.wa) setErrors(prev => ({ ...prev, wa: "" }));
                                    }}
                                    placeholder="081234567890"
                                />
                            </div>
                        </Field>
                    </div>
                )}

                {/* ── STEP 2: GARANSI (PRESET + CUSTOM BULAN/TAHUN), RUMUS VOLUME & HARGA ── */}
                {step === 2 && (
                    <div className="space-y-6">
                        {/* Panel Pilihan Garansi Fleksibel (Preset + Custom dalam Bulan & Tahun) */}
                        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div>
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                                        <Sparkles size={14} className="text-amber-600" />
                                        1. Durasi Garansi & Penyesuaian Harga Satuan Otomatis
                                    </h3>
                                    <p className="text-[11px] text-amber-800 mt-0.5">
                                        Pilih preset atau pilih <strong>Custom</strong> untuk mengisi durasi garansi dalam <strong>Bulan</strong> (mis. 6 Bulan, 18 Bulan) atau <strong>Tahun</strong> (mis. 2 Tahun, 4 Tahun). Harga satuan item akan menyesuaikan otomatis.
                                    </p>
                                </div>
                                <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 shrink-0">
                                    Aktif: {formatWarrantyDurationText(garansiNilai, garansiUnit)}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                {WARRANTY_PRESET_OPTIONS.map(opt => {
                                    const active = garansiPresetId === opt.id;
                                    return (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => {
                                                if (opt.isCustom) {
                                                    setGaransiPresetId("custom");
                                                } else {
                                                    applyWarrantyChange(opt.nilai, opt.unit, opt.id);
                                                }
                                            }}
                                            className={`p-2.5 rounded-xl border text-left transition-all ${
                                                active
                                                    ? "border-amber-600 bg-amber-600 text-white font-bold shadow-xs"
                                                    : "border-amber-200 bg-white text-[var(--text-primary)] hover:bg-amber-50"
                                            }`}
                                        >
                                            <div className="text-xs font-bold leading-tight">{opt.label}</div>
                                            <div className={`text-[10px] mt-0.5 leading-tight ${active ? "text-amber-100" : "text-[var(--text-muted)]"}`}>
                                                {opt.sublabel}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Input Custom Garansi dalam Bulan atau Tahun */}
                            {(isCustomWarranty || garansiPresetId === "custom") && (
                                <div className="pt-2 border-t border-amber-200/80 flex flex-col sm:flex-row sm:items-center gap-3">
                                    <span className="text-xs font-bold text-amber-900">Input Garansi Custom:</span>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min={0}
                                            max={360}
                                            step={0.5}
                                            value={garansiNilai}
                                            onChange={e => applyWarrantyChange(parseFloat(e.target.value) || 0, garansiUnit, "custom")}
                                            className="w-24 px-3 py-1.5 text-sm font-bold font-mono border border-amber-300 rounded-lg bg-white text-center"
                                        />
                                        <select
                                            value={garansiUnit}
                                            onChange={e => applyWarrantyChange(garansiNilai, e.target.value as GaransiUnit, "custom")}
                                            className="px-3 py-1.5 text-sm font-bold border border-amber-300 rounded-lg bg-white text-amber-900"
                                        >
                                            <option value="tahun">Tahun</option>
                                            <option value="bulan">Bulan</option>
                                        </select>
                                    </div>
                                    <span className="text-xs text-amber-800">
                                        → Tercetak di PDF: <strong>&ldquo;Selama {formatWarrantyDurationText(garansiNilai, garansiUnit)}&rdquo;</strong>
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Daftar Item Pekerjaan + Satuan Otomatis + Kalkulator Rumus Volume */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                                        2. Tabel Item Pekerjaan & Kalkulator Volume Survey
                                    </h3>
                                    <p className="text-[11px] text-[var(--text-muted)]">
                                        Pilih preset pekerjaan agar <strong>Satuan</strong> & <strong>Harga Satuan</strong> terisi otomatis. Ketik deret ukuran di kolom <strong>Rumus Volume</strong> (contoh: <code>37+37+5,5+9+6+5</code>) untuk menghitung volume otomatis.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={addItemRow}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--accent)] text-white text-xs font-bold hover:bg-[var(--accent-hover)]"
                                >
                                    <Plus size={13} /> Tambah Item
                                </button>
                            </div>

                            {errors.items && (
                                <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12} />{errors.items}</p>
                            )}

                            <div className="space-y-3">
                                {items.map((item, idx) => {
                                    const formulaEval = item.volumeFormula ? evaluateVolumeFormula(item.volumeFormula) : null;
                                    return (
                                        <div key={idx} className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-tertiary)]/50 space-y-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-xs font-bold text-[var(--accent)] uppercase tracking-wider">
                                                    Item Pekerjaan #{idx + 1}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowCameraMeasureForIdx(idx)}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-primary)] hover:border-[var(--accent)]"
                                                        title="Ukur panjang tembok dari foto kamera lapangan"
                                                    >
                                                        <Ruler size={12} className="text-[var(--accent)]" /> Ukur via Foto Kamera
                                                    </button>
                                                    {items.length > 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setItems(items.filter((_, i) => i !== idx))}
                                                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-[10px] font-bold uppercase text-[var(--text-secondary)] mb-1">
                                                        Pilih Preset Katalog (Auto Satuan & Harga)
                                                    </label>
                                                    <select
                                                        value={item.presetCode ?? ""}
                                                        onChange={e => handleSelectPresetForItem(idx, e.target.value)}
                                                        className={inputCls}
                                                    >
                                                        <option value="">-- Custom / Ketik Manual --</option>
                                                        {availablePresets.map(p => (
                                                            <option key={p.code} value={p.code}>
                                                                {p.label} (Satuan: {p.unit} · {fmtIDR(resolvePresetPriceByWarranty(p, garansiNilai, garansiUnit))})
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div>
                                                    <label className="block text-[10px] font-bold uppercase text-[var(--text-secondary)] mb-1">
                                                        Uraian / Nama Pekerjaan di PDF *
                                                    </label>
                                                    <input
                                                        className={inputCls}
                                                        value={item.desc}
                                                        onChange={e => updateItemField(idx, "desc", e.target.value)}
                                                        placeholder="Contoh: Pondasi 1 sisi / Luas Permukaan / Pemipaan"
                                                    />
                                                </div>
                                            </div>

                                            {/* Baris Kalkulator Rumus Volume */}
                                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                                                <div className="sm:col-span-5">
                                                    <label className="block text-[10px] font-bold uppercase text-[var(--text-secondary)] mb-1 flex items-center gap-1">
                                                        <Calculator size={11} className="text-[var(--accent)]" />
                                                        Rumus Rincian Ukuran Survey (Opsional)
                                                    </label>
                                                    <input
                                                        className={`${inputCls} font-mono text-xs`}
                                                        value={item.volumeFormula ?? ""}
                                                        onChange={e => handleFormulaChange(idx, e.target.value)}
                                                        placeholder="Contoh: 37+37+5,5+9+6+5 atau 37 x 9 x 4"
                                                    />
                                                    {formulaEval && (
                                                        <p className={`text-[11px] mt-1 font-mono ${formulaEval.isValid ? "text-emerald-700 font-semibold" : "text-red-600"}`}>
                                                            {formulaEval.isValid
                                                                ? `✓ Hasil hitung otomatis: ${formatVolumeID(formulaEval.value)} ${item.unit} (tercetak di tabel rincian volume PDF)`
                                                                : `⚠ ${formulaEval.error}`}
                                                        </p>
                                                    )}
                                                </div>

                                                <div className="sm:col-span-2">
                                                    <label className="block text-[10px] font-bold uppercase text-[var(--text-secondary)] mb-1">
                                                        Volume (Qty) *
                                                    </label>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        step="0.01"
                                                        className={`${inputCls} font-mono font-bold tabular-nums`}
                                                        value={item.qty}
                                                        onChange={e => updateItemField(idx, "qty", parseFloat(e.target.value) || 0)}
                                                    />
                                                </div>

                                                <div className="sm:col-span-2">
                                                    <label className="block text-[10px] font-bold uppercase text-[var(--text-secondary)] mb-1">
                                                        Satuan (Otomatis)
                                                    </label>
                                                    <select
                                                        className={`${inputCls} font-semibold`}
                                                        value={item.unit}
                                                        onChange={e => updateItemField(idx, "unit", e.target.value)}
                                                    >
                                                        {["m²", "m¹", "m³", "Kali", "Lot", "Kunjungan", "Periode", "Titik", "Unit", "ls"].map(u => (
                                                            <option key={u} value={u}>{u}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div className="sm:col-span-3">
                                                    <label className="block text-[10px] font-bold uppercase text-[var(--text-secondary)] mb-1">
                                                        Harga Satuan (Rp) *
                                                    </label>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        step={500}
                                                        className={`${inputCls} font-mono font-bold tabular-nums`}
                                                        value={item.harga}
                                                        onChange={e => updateItemField(idx, "harga", parseInt(e.target.value) || 0)}
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)] text-xs">
                                                <span className="text-[var(--text-muted)]">
                                                    Subtotal Baris ({formatVolumeID(item.qty)} {item.unit} × {fmtIDR(item.harga)})
                                                </span>
                                                <span className="font-mono font-bold text-sm text-[var(--text-primary)] tabular-nums">
                                                    {fmtIDR(item.qty * item.harga)}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Diskon Penawaran (%) & Skema PPN (Radio / Button: Non PPN vs PPN 12% DPP Nilai Lain) */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-3 border-t border-[var(--border-subtle)] items-start">
                            <div className="md:col-span-4">
                                <Field
                                    label="Diskon Penawaran (%)"
                                    hint="Potongan harga langsung dari subtotal pekerjaan (opsional)"
                                >
                                    <div className="relative">
                                        <input
                                            type="number"
                                            min={0}
                                            max={100}
                                            step={0.5}
                                            className={`${inputCls} font-mono font-bold pr-9`}
                                            value={diskonPct}
                                            onChange={e => setDiskonPct(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                                            placeholder="0"
                                        />
                                        <span className="absolute right-3 top-2.5 text-xs font-bold text-[var(--text-muted)]">%</span>
                                    </div>
                                </Field>
                            </div>

                            <div className="md:col-span-8">
                                <Field
                                    label="Skema PPN (Pilih Salah Satu)"
                                    hint="Upah & Peralatan Kerja (default 25%) sudah di-take out dari input manual. Pilih skema pajak penawaran:"
                                >
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                        <label
                                            onClick={() => { setPpn(false); setPpnDppFaktor(0); }}
                                            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                                                !ppn
                                                    ? "border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent)] font-bold shadow-2xs"
                                                    : "border-[var(--border-subtle)] bg-white text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="skema_ppn_form"
                                                checked={!ppn}
                                                onChange={() => { setPpn(false); setPpnDppFaktor(0); }}
                                                className="w-4 h-4 accent-[var(--accent)]"
                                            />
                                            <div>
                                                <div className="text-xs font-bold">Non PPN</div>
                                                <div className="text-[10.5px] text-[var(--text-muted)] font-normal">Harga bersih tanpa PPN</div>
                                            </div>
                                        </label>

                                        <label
                                            onClick={() => { setPpn(true); setPpnDppFaktor(11 / 12); }}
                                            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                                                ppn
                                                    ? "border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent)] font-bold shadow-2xs"
                                                    : "border-[var(--border-subtle)] bg-white text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="skema_ppn_form"
                                                checked={ppn}
                                                onChange={() => { setPpn(true); setPpnDppFaktor(11 / 12); }}
                                                className="w-4 h-4 accent-[var(--accent)]"
                                            />
                                            <div>
                                                <div className="text-xs font-bold">PPN 12% (DPP Nilai Lain)</div>
                                                <div className="text-[10.5px] text-[var(--text-muted)] font-normal">DPP 11/12 × Tarif PPN 12%</div>
                                            </div>
                                        </label>
                                    </div>
                                </Field>
                            </div>
                        </div>

                        {/* Jika Varian Jadwal Fogging 12 Bulan (Contoh PDF 0015 Ibu Dita) */}
                        {(pdfVariant === "pco_jadwal_fogging_1p" || jenisLayanan === "pest_fogging") && (
                            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-950 flex items-center gap-1.5">
                                        <Calendar size={14} className="text-emerald-700" />
                                        Jadwal Kerja Pest Control (Fogging) 12 Bulan (Tipe 5 — Contoh Ibu Dita)
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-emerald-800">Tahun:</span>
                                        <input
                                            type="number"
                                            value={jadwalFoggingTahun}
                                            onChange={e => {
                                                const y = parseInt(e.target.value) || new Date().getFullYear();
                                                setJadwalFoggingTahun(y);
                                                setJadwalFoggingRows(generateDefaultFoggingSchedule(y));
                                            }}
                                            className="w-20 px-2 py-1 text-xs font-bold font-mono bg-white border border-emerald-300 rounded-lg"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                    {jadwalFoggingRows.map((r, rIdx) => (
                                        <div key={r.no} className="p-2 rounded-lg bg-white border border-emerald-200 text-xs space-y-1">
                                            <div className="font-bold text-[11px] text-emerald-950">{r.no}. {r.bulan}</div>
                                            <div className="flex items-center gap-1.5">
                                                <input
                                                    className="w-full px-1.5 py-1 text-center font-mono border border-slate-200 rounded"
                                                    value={r.tgl1}
                                                    onChange={e => {
                                                        const copy = [...jadwalFoggingRows];
                                                        copy[rIdx] = { ...r, tgl1: e.target.value };
                                                        setJadwalFoggingRows(copy);
                                                    }}
                                                    title="Tanggal Kunjungan I"
                                                />
                                                <input
                                                    className="w-full px-1.5 py-1 text-center font-mono border border-slate-200 rounded"
                                                    value={r.tgl2}
                                                    onChange={e => {
                                                        const copy = [...jadwalFoggingRows];
                                                        copy[rIdx] = { ...r, tgl2: e.target.value };
                                                        setJadwalFoggingRows(copy);
                                                    }}
                                                    title="Tanggal Kunjungan II"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Ringkasan Kalkulasi Harga */}
                        <div className="p-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] space-y-2 text-sm">
                            <div className="flex justify-between text-[var(--text-secondary)]">
                                <span>Subtotal Pekerjaan</span>
                                <span className="font-mono font-semibold tabular-nums">{fmtIDR(calc.subtotal)}</span>
                            </div>
                            {calc.upahPeralatanRp > 0 && (
                                <div className="flex justify-between text-[var(--text-secondary)]">
                                    <span>Upah & Peralatan Kerja ({upahPeralatanPct}%)</span>
                                    <span className="font-mono tabular-nums">+ {fmtIDR(calc.upahPeralatanRp)}</span>
                                </div>
                            )}
                            {calc.diskonRp > 0 && (
                                <div className="flex justify-between text-red-600">
                                    <span>Diskon Penawaran ({diskonPct}%)</span>
                                    <span className="font-mono tabular-nums">- {fmtIDR(calc.diskonRp)}</span>
                                </div>
                            )}
                            {calc.diskonUpahRp > 0 && (
                                <div className="flex justify-between text-red-600">
                                    <span>(Diskon Upah & Peralatan Kerja {diskonUpahPct}%)</span>
                                    <span className="font-mono tabular-nums">- {fmtIDR(calc.diskonUpahRp)}</span>
                                </div>
                            )}
                            {calc.dpp != null && (
                                <div className="flex justify-between text-[var(--text-secondary)]">
                                    <span>DPP Nilai Lain (11/12)</span>
                                    <span className="font-mono tabular-nums">{fmtIDR(calc.dpp)}</span>
                                </div>
                            )}
                            {calc.ppnRp > 0 && (
                                <div className="flex justify-between text-[var(--text-secondary)]">
                                    <span>PPN ({calc.dpp != null ? "12%" : "11%"})</span>
                                    <span className="font-mono tabular-nums">+ {fmtIDR(calc.ppnRp)}</span>
                                </div>
                            )}
                            <div className="pt-2 border-t border-[var(--border-subtle)] flex justify-between items-baseline font-bold text-base">
                                <span className="text-[var(--text-primary)]">TOTAL PENAWARAN</span>
                                <span className="font-mono text-lg text-[var(--accent)] tabular-nums">{fmtIDR(totalFinal)}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── STEP 3: HASIL SURVEY, TEMUAN, FOTO DOKUMENTASI & TEKNIS ─────── */}
                {step === 3 && (
                    <div className="space-y-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Nama Surveyor Lapangan" hint="Contoh: Bagas / Jono">
                                <input
                                    className={inputCls}
                                    value={surveyor}
                                    onChange={e => setSurveyor(e.target.value)}
                                    placeholder="Bagas"
                                />
                            </Field>
                            <Field label="Hari / Tanggal Pelaksanaan Survey">
                                <input
                                    type="date"
                                    className={inputCls}
                                    value={tanggalSurvey}
                                    onChange={e => setTanggalSurvey(e.target.value)}
                                />
                            </Field>
                        </div>

                        <Field
                            label="Hasil / Temuan Survey di Lapangan"
                            hint="Tercetak pada bagian HASIL SURVEY di PDF (Contoh Bank Victoria: 'Kami menemukan bekas serangan rayap pada kusen dan plafon kamar mandi lantai 1' / Contoh Puskesmas: 'Kami menemukan indikasi kendala tikus.')"
                        >
                            <textarea
                                rows={2}
                                className={inputCls}
                                value={hasilSurvey}
                                onChange={e => setHasilSurvey(e.target.value)}
                                placeholder={
                                    isAR
                                        ? "Kami menemukan bekas serangan rayap pada kusen dan plafon kamar mandi lantai 1."
                                        : "Kami menemukan indikasi kendala tikus."
                                }
                            />
                        </Field>

                        {/* Upload Foto Dokumentasi Survey (Tersedia untuk AR maupun PCO) */}
                        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-white space-y-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-1.5">
                                        <Camera size={14} className="text-[var(--accent)]" />
                                        Dokumentasi Foto Hasil Survey ({surveyPhotos.length} Foto)
                                    </h4>
                                    <p className="text-[11px] text-[var(--text-muted)]">
                                        Otomatis disusun ke dalam tabel <strong>Dokumentasi Survey</strong> pada PDF penawaran.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="px-3 py-1.5 rounded-xl bg-[var(--accent-glow)] text-[var(--accent)] text-xs font-bold hover:bg-emerald-100"
                                >
                                    + Upload Foto Survey
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="hidden"
                                    onChange={handleAddPhotos}
                                />
                            </div>

                            {surveyPhotos.length === 0 ? (
                                <div className="py-6 text-center text-xs text-[var(--text-muted)] border border-dashed border-[var(--border-subtle)] rounded-xl">
                                    Belum ada foto survey yang diunggah. Klik &ldquo;+ Upload Foto Survey&rdquo; atau gunakan fitur &ldquo;Ukur via Foto Kamera&rdquo;.
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    {surveyPhotos.map((p, idx) => (
                                        <div key={idx} className="relative rounded-xl border border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-tertiary)]">
                                            <img src={p.base64} alt={p.caption || "Survey"} className="w-full h-28 object-cover" />
                                            <button
                                                type="button"
                                                onClick={() => setSurveyPhotos(surveyPhotos.filter((_, i) => i !== idx))}
                                                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center shadow-xs"
                                            >
                                                <X size={12} />
                                            </button>
                                            <input
                                                className="w-full px-2 py-1 text-[11px] bg-white border-t border-[var(--border-subtle)] focus:outline-none"
                                                value={p.caption ?? ""}
                                                onChange={e => {
                                                    const copy = [...surveyPhotos];
                                                    copy[idx] = { ...p, caption: e.target.value };
                                                    setSurveyPhotos(copy);
                                                }}
                                                placeholder="Keterangan foto..."
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Termitisida / Pestisida */}
                        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-white space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-1.5">
                                    <FlaskConical size={14} className="text-[var(--accent)]" />
                                    Daftar {isAR ? "Termitisida" : "Pestisida"} yang Digunakan
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setChemicals([...chemicals, { bahanAktif: "", merkDagang: "" }])}
                                    className="text-xs font-bold text-[var(--accent)] hover:underline"
                                >
                                    + Tambah Bahan Aktif
                                </button>
                            </div>
                            <div className="space-y-2">
                                {chemicals.map((c, idx) => (
                                    <div key={idx} className="grid grid-cols-2 gap-2">
                                        <input
                                            className={inputCls}
                                            value={c.bahanAktif}
                                            onChange={e => setChemicals(chemicals.map((x, i) => i === idx ? { ...x, bahanAktif: e.target.value } : x))}
                                            placeholder="Bahan Aktif (mis. Cypermethrin)"
                                        />
                                        <div className="flex gap-1.5">
                                            <input
                                                className={inputCls}
                                                value={c.merkDagang}
                                                onChange={e => setChemicals(chemicals.map((x, i) => i === idx ? { ...x, merkDagang: e.target.value } : x))}
                                                placeholder="Merk Dagang (mis. Cypergard 100 EC)"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setChemicals(chemicals.filter((_, i) => i !== idx))}
                                                className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── STEP 4: KONFIRMASI & PREVIEW SEBELUM SUBMIT GP-DRF ──────────── */}
                {step === 4 && (
                    <div className="space-y-5">
                        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
                            <Hash size={18} className="text-amber-700 shrink-0 mt-0.5" />
                            <div className="text-xs text-amber-900 space-y-1">
                                <p className="font-bold">Konfirmasi Pengajuan Draft Hasil Survey (Kode GP-DRF)</p>
                                <p>
                                    Data survey dan kalkulasi harga ini akan disimpan dengan nomor draft <strong>{noPreview}</strong>.
                                    Admin dapat melakukan verifikasi, menyesuaikan garansi (dalam bulan/tahun) atau diskon bila ada negosiasi klien, lalu menerbitkan nomor surat resmi <strong>{noPreview.replace("-DRF/", "/")}</strong> saat <em>Approve</em>.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                            <div className="p-3.5 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
                                <span className="text-[10px] font-bold uppercase text-[var(--text-muted)] block">Nomor Draft (Stage 1)</span>
                                <span className="font-mono font-bold text-sm text-amber-800 mt-0.5 block">{noPreview}</span>
                            </div>
                            <div className="p-3.5 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
                                <span className="text-[10px] font-bold uppercase text-[var(--text-muted)] block">Klien & Objek Survey</span>
                                <span className="font-bold text-sm text-[var(--text-primary)] mt-0.5 block">{kepadaNama || kepada}</span>
                                <span className="text-[11px] text-[var(--text-secondary)]">{objekPekerjaan || LAYANAN_CONFIG[jenisLayanan]?.label}</span>
                            </div>
                            <div className="p-3.5 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
                                <span className="text-[10px] font-bold uppercase text-[var(--text-muted)] block">Garansi & Total Penawaran</span>
                                <span className="font-mono font-bold text-sm text-[var(--accent)] mt-0.5 block">{fmtIDR(totalFinal)}</span>
                                <span className="text-[11px] text-[var(--text-secondary)]">Garansi: {formatWarrantyDurationText(garansiNilai, garansiUnit)}</span>
                            </div>
                        </div>

                        {submitError && (
                            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                                <AlertCircle size={15} /> {submitError}
                            </div>
                        )}
                    </div>
                )}

                {/* Navigasi Bawah */}
                <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)]">
                    <button
                        type="button"
                        onClick={() => step === 0 ? handleCancel() : setStep(s => s - 1)}
                        disabled={submitting}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-white text-xs sm:text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
                    >
                        <ArrowLeft size={14} /> {step === 0 ? "Batal" : "Sebelumnya"}
                    </button>

                    <div className="flex items-center gap-2">
                        {step < STEPS.length - 1 ? (
                            <button
                                type="button"
                                onClick={handleNext}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs sm:text-sm font-bold shadow-xs"
                            >
                                Lanjut <ArrowRight size={14} />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleSubmitDraft}
                                disabled={submitting}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs sm:text-sm font-bold shadow-xs disabled:opacity-50"
                            >
                                {submitting ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                                {submitting ? "Menyimpan Draft GP-DRF..." : "Kirim Draft Survey (GP-DRF)"}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}