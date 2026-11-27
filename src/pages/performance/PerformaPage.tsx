import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuthStore } from '@/app/store/authStore';
import { getQuotations } from '@/shared/api/quotationService';
import { supabase } from '@/shared/lib/supabase';
import { formatRupiah } from '@/shared/lib/utils';
import {
    TrendingUp, Award, ChevronDown, RefreshCw, Loader2,
    SlidersHorizontal, Check, X, Percent, ArrowUpRight,
    ArrowDownRight, Minus, BarChart3, Target, Users, ShieldCheck, Bug,
} from "lucide-react";
import type { Quotation } from '@/entities/types';

interface MarketingTarget {
    uid: string;
    year: number;
    month: number;
    targetRevenue: number;
    targetCount: number;
    targetPct?: number;
}

interface MonthPerfBucket {
    key: string;
    shortLabel: string;
    label: string;
    year: number;
    month: number;
    totalSurvey: number;
    approvedCount: number;
    dealCount: number;
    approvalRatePct: number;
    dealRatePct: number;
    momGrowthPct: number | null;
    revenue: number;
}

type VisualMetric = "approval_pct" | "deal_pct" | "survey_count";
type RangeMonths = 3 | 6 | 12;

interface MoMCustomConfig {
    rangeMonths: RangeMonths;
    metric: VisualMetric;
    benchmarkPct: number;
    showTeamCards: boolean;
}

const DEFAULT_MOM_CONFIG: MoMCustomConfig = {
    rangeMonths: 6,
    metric: "approval_pct",
    benchmarkPct: 60,
    showTeamCards: true,
};

const MOM_CONFIG_STORAGE_KEY = "fw_mom_visual_config_v1";
const MONTHS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];

function isMasterSuperAdminEntry(uid?: string, name?: string): boolean {
    if (uid === "00000000-0000-4000-b000-000000000000") return true;
    const lower = (name || "").toLowerCase();
    return lower.includes("master super admin") || lower.includes("master all-role") || lower.includes("lieziragroup");
}

export function PerformaPage() {
    const { user, activeCompanyId } = useAuthStore();
    const isMarketing = user?.role === "MARKETING";
    const isAdminOrSuper = user?.role === "SUPERADMIN" || user?.role === "ADMIN";
    const companyId = user?.role === "SUPERADMIN"
        ? (activeCompanyId || user?.companyId || "")
        : (user?.companyId ?? "");

    const [quotations, setQuotations] = useState<Quotation[]>([]);
    const [targets, setTargets] = useState<MarketingTarget[]>([]);
    const [loading, setLoading] = useState(true);

    // Custom Setup MoM State (tersimpan di localStorage + dapat disesuaikan kapan saja)
    const [config, setConfig] = useState<MoMCustomConfig>(() => {
        try {
            const raw = localStorage.getItem(MOM_CONFIG_STORAGE_KEY);
            if (raw) return { ...DEFAULT_MOM_CONFIG, ...JSON.parse(raw) };
        } catch { /* ignore */ }
        return DEFAULT_MOM_CONFIG;
    });
    const [showSetup, setShowSetup] = useState(false);

    const [editingUid, setEditingUid] = useState<string | null>(null);
    const [editCnt, setEditCnt] = useState("");
    const [editRev, setEditRev] = useState("");
    const [savingTarget, setSavingTarget] = useState(false);

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const [filterYear, setFilterYear] = useState(currentYear);
    const [filterMonth, setFilterMonth] = useState(currentMonth);

    const updateConfig = (patch: Partial<MoMCustomConfig>) => {
        setConfig(prev => {
            const next = { ...prev, ...patch };
            try { localStorage.setItem(MOM_CONFIG_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
            return next;
        });
    };

    const yearOptions = useMemo(() => {
        const y: number[] = [];
        for (let i = currentYear; i >= currentYear - 2; i--) y.push(i);
        return y;
    }, [currentYear]);

    const load = useCallback(async () => {
        if (!companyId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const quos = await getQuotations({
                companyId,
                byUid: isMarketing ? user?.uid : undefined,
            });
            // Pastikan tidak pernah menyertakan data uji Master Super Admin yang berdiri sendiri
            const cleanQuos = quos.filter(q => !isMasterSuperAdminEntry(q.marketingUid, q.surveyor || q.marketingNama));
            setQuotations(cleanQuos);

            if (isAdminOrSuper) {
                const { data: tRows } = await supabase
                    .from("performa_targets")
                    .select("*")
                    .eq("company_id", companyId);
                setTargets(
                    (tRows || []).map((r: any) => ({
                        uid: r.payload?.uid ?? "",
                        year: Number(r.payload?.year ?? currentYear),
                        month: Number(r.payload?.month ?? currentMonth),
                        targetRevenue: Number(r.payload?.targetRevenue ?? 0),
                        targetCount: Number(r.payload?.targetCount ?? 0),
                    }))
                );
            }
        } catch {
            // fallback
        } finally {
            setLoading(false);
        }
    }, [companyId, isMarketing, isAdminOrSuper, user?.uid, currentYear, currentMonth]);

    useEffect(() => {
        load();
    }, [load]);

    const currentMarketingUid = user?.uid;
    const currentMarketingName = (user?.name || "").toLowerCase().trim();

    // Jika user role MARKETING, batasi hanya data penawaran miliknya sendiri
    const scopedQuotations = useMemo(() => {
        if (!isMarketing) return quotations;
        return quotations.filter(q => {
            const mUid = q.marketingUid || "";
            const sName = (q.surveyor || q.marketingNama || "").toLowerCase().trim();
            return (
                mUid === currentMarketingUid ||
                (currentMarketingName && sName.includes(currentMarketingName)) ||
                (currentMarketingName && currentMarketingName.includes(sName))
            );
        });
    }, [quotations, isMarketing, currentMarketingUid, currentMarketingName]);

    const isARQuotation = useCallback((q: Quotation) => {
        const kat = (q.kategori || "").toUpperCase();
        const projKat = (q.kategoriProyek || "").toUpperCase();
        const jns = (q.jenisLayanan || "").toUpperCase();
        const no = (q.noSurat || q.draftNoSurat || "").toUpperCase();
        return kat === "AR" || projKat === "ANTI_RAYAP" || jns.includes("RAYAP") || jns.includes("TERMITE") || no.includes("/AR/");
    }, []);

    const isDealOrApproved = useCallback((q: Quotation) => {
        return q.status === "approved" || q.status === "sent_to_client" || q.status === "deal";
    }, []);

    const monthlyBuckets = useMemo<MonthPerfBucket[]>(() => {
        const raw: Omit<MonthPerfBucket, "momGrowthPct">[] = [];
        for (let i = config.rangeMonths - 1; i >= 0; i--) {
            const d = new Date(filterYear, filterMonth - 1 - i, 1);
            const y = d.getFullYear();
            const m = d.getMonth() + 1;
            const monthQuos = scopedQuotations.filter(q => {
                const dt = q.tanggal instanceof Date ? q.tanggal : new Date(q.createdAt);
                return dt.getFullYear() === y && dt.getMonth() + 1 === m;
            });
            const totalSurvey = monthQuos.length;
            const approvedList = monthQuos.filter(isDealOrApproved);
            const dealList = monthQuos.filter(isDealOrApproved);
            const approvedCount = approvedList.length;
            const dealCount = dealList.length;
            const approvalRatePct = totalSurvey > 0 ? Math.round((approvedCount / totalSurvey) * 100) : 0;
            const dealRatePct = totalSurvey > 0 ? Math.round((dealCount / totalSurvey) * 100) : 0;
            const revenue = approvedList.reduce((acc, q) => acc + (q.total || 0), 0);

            raw.push({
                key: `${y}-${String(m).padStart(2, "0")}`,
                shortLabel: MONTHS_ID[m - 1],
                label: `${MONTHS_ID[m - 1]} ${y}`,
                year: y,
                month: m,
                totalSurvey,
                approvedCount,
                dealCount,
                approvalRatePct,
                dealRatePct,
                revenue,
            });
        }

        return raw.map((b, idx) => {
            if (idx === 0) return { ...b, momGrowthPct: null };
            const prev = raw[idx - 1];
            const momGrowthPct = b.approvalRatePct - prev.approvalRatePct;
            return { ...b, momGrowthPct };
        });
    }, [scopedQuotations, filterYear, filterMonth, config.rangeMonths, isDealOrApproved]);

    const currentBucket = monthlyBuckets[monthlyBuckets.length - 1] ?? {
        key: "", shortLabel: MONTHS_ID[filterMonth - 1], label: `${MONTHS_ID[filterMonth - 1]} ${filterYear}`,
        year: filterYear, month: filterMonth, totalSurvey: 0, approvedCount: 0, dealCount: 0,
        approvalRatePct: 0, dealRatePct: 0, momGrowthPct: 0, revenue: 0,
    };
    const prevBucket = monthlyBuckets[monthlyBuckets.length - 2] ?? {
        key: "", shortLabel: "Bln Lalu", label: "Bulan Lalu",
        year: filterYear, month: filterMonth - 1, totalSurvey: 0, approvedCount: 0, dealCount: 0,
        approvalRatePct: 0, dealRatePct: 0, momGrowthPct: 0, revenue: 0,
    };

    const diffApprovalVsPrevMonth = currentBucket.approvalRatePct - prevBucket.approvalRatePct;
    const diffVsBenchmark = currentBucket.approvalRatePct - config.benchmarkPct;

    // Analisis Kategori Spesifik: Anti Rayap (AR) vs Pest Control (PCO)
    const categoryStats = useMemo(() => {
        const currMonthQuos = scopedQuotations.filter(q => {
            const dt = q.tanggal instanceof Date ? q.tanggal : new Date(q.createdAt);
            return dt.getFullYear() === filterYear && dt.getMonth() + 1 === filterMonth;
        });

        const prevMonthQuos = scopedQuotations.filter(q => {
            const dt = q.tanggal instanceof Date ? q.tanggal : new Date(q.createdAt);
            return dt.getFullYear() === prevBucket.year && dt.getMonth() + 1 === prevBucket.month;
        });

        // Anti Rayap (AR)
        const arCurr = currMonthQuos.filter(isARQuotation);
        const arCurrDeals = arCurr.filter(isDealOrApproved);
        const arDealPct = arCurr.length > 0 ? Math.round((arCurrDeals.length / arCurr.length) * 100) : 0;
        const arRevenue = arCurrDeals.reduce((acc, q) => acc + (q.total || 0), 0);

        const arPrev = prevMonthQuos.filter(isARQuotation);
        const arPrevDeals = arPrev.filter(isDealOrApproved);
        const arPrevDealPct = arPrev.length > 0 ? Math.round((arPrevDeals.length / arPrev.length) * 100) : 0;
        const arDeltaMoM = arDealPct - arPrevDealPct;

        // Pest Control (PCO)
        const pestCurr = currMonthQuos.filter(q => !isARQuotation(q));
        const pestCurrDeals = pestCurr.filter(isDealOrApproved);
        const pestDealPct = pestCurr.length > 0 ? Math.round((pestCurrDeals.length / pestCurr.length) * 100) : 0;
        const pestRevenue = pestCurrDeals.reduce((acc, q) => acc + (q.total || 0), 0);

        const pestPrev = prevMonthQuos.filter(q => !isARQuotation(q));
        const pestPrevDeals = pestPrev.filter(isDealOrApproved);
        const pestPrevDealPct = pestPrev.length > 0 ? Math.round((pestPrevDeals.length / pestPrev.length) * 100) : 0;
        const pestDeltaMoM = pestDealPct - pestPrevDealPct;

        return {
            ar: {
                totalSurvey: arCurr.length,
                dealCount: arCurrDeals.length,
                dealPct: arDealPct,
                prevDealPct: arPrevDealPct,
                revenue: arRevenue,
                deltaMoM: arDeltaMoM,
            },
            pest: {
                totalSurvey: pestCurr.length,
                dealCount: pestCurrDeals.length,
                dealPct: pestDealPct,
                prevDealPct: pestPrevDealPct,
                revenue: pestRevenue,
                deltaMoM: pestDeltaMoM,
            },
        };
    }, [scopedQuotations, filterYear, filterMonth, prevBucket.year, prevBucket.month, isARQuotation, isDealOrApproved]);

    const perMarketing = useMemo(() => {
        const map = new Map<string, {
            uid: string;
            nama: string;
            currTotal: number;
            currApproved: number;
            prevTotal: number;
            prevApproved: number;
            currPct: number;
            prevPct: number;
            momDeltaPct: number;
            revenue: number;
        }>();

        scopedQuotations.forEach(q => {
            const uid = q.marketingUid || "mkt";
            const nama = q.surveyor || q.marketingNama || "Surveyor / Marketing";
            if (isMasterSuperAdminEntry(uid, nama)) return;

            if (!map.has(uid)) {
                map.set(uid, {
                    uid, nama, currTotal: 0, currApproved: 0, prevTotal: 0, prevApproved: 0,
                    currPct: 0, prevPct: 0, momDeltaPct: 0, revenue: 0,
                });
            }
            const entry = map.get(uid)!;
            const dt = q.tanggal instanceof Date ? q.tanggal : new Date(q.createdAt);
            const y = dt.getFullYear();
            const m = dt.getMonth() + 1;
            const isApp = isDealOrApproved(q);

            if (y === currentBucket.year && m === currentBucket.month) {
                entry.currTotal++;
                if (isApp) {
                    entry.currApproved++;
                    entry.revenue += q.total || 0;
                }
            } else if (y === prevBucket.year && m === prevBucket.month) {
                entry.prevTotal++;
                if (isApp) entry.prevApproved++;
            }
        });

        return Array.from(map.values()).map(item => {
            const currPct = item.currTotal > 0 ? Math.round((item.currApproved / item.currTotal) * 100) : 0;
            const prevPct = item.prevTotal > 0 ? Math.round((item.prevApproved / item.prevTotal) * 100) : 0;
            return {
                ...item,
                currPct,
                prevPct,
                momDeltaPct: currPct - prevPct,
            };
        });
    }, [scopedQuotations, currentBucket, prevBucket, isDealOrApproved]);

    const visibleMarketingList = useMemo(() => {
        if (!isMarketing) return perMarketing;
        return perMarketing.filter(m =>
            m.uid === currentMarketingUid ||
            (currentMarketingName && m.nama.toLowerCase().includes(currentMarketingName)) ||
            (currentMarketingName && currentMarketingName.includes(m.nama.toLowerCase()))
        );
    }, [perMarketing, isMarketing, currentMarketingUid, currentMarketingName]);
    const handleSaveTarget = async (uid: string, nama: string) => {
        if (!isAdminOrSuper || !companyId) return;
        setSavingTarget(true);
        try {
            const id = `${uid}_${filterYear}_${String(filterMonth).padStart(2, "0")}`;
            const targetRevenue = Number(editRev.replace(/\D/g, "")) || 0;
            const targetCount = Number(editCnt) || 0;
            await supabase.from("performa_targets").upsert({
                id,
                company_id: companyId,
                payload: { uid, nama, year: filterYear, month: filterMonth, targetRevenue, targetCount },
            });
            setEditingUid(null);
            await load();
        } finally {
            setSavingTarget(false);
        }
    };

    const renderDeltaBadge = (delta: number, suffix = "%") => {
        if (delta > 0) {
            return (
                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                    <ArrowUpRight size={12} /> +{delta}{suffix} MoM
                </span>
            );
        }
        if (delta < 0) {
            return (
                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700">
                    <ArrowDownRight size={12} /> {delta}{suffix} MoM
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">
                <Minus size={12} /> 0{suffix} MoM
            </span>
        );
    };

    const maxSurveyInBuckets = useMemo(
        () => Math.max(5, ...monthlyBuckets.map(b => b.totalSurvey)),
        [monthlyBuckets]
    );

    const getBucketMetricValue = (b: MonthPerfBucket): number => {
        if (config.metric === "approval_pct") return b.approvalRatePct;
        if (config.metric === "deal_pct") return b.dealRatePct;
        return b.totalSurvey;
    };

    const getBucketBarHeightPct = (b: MonthPerfBucket): number => {
        if (config.metric === "survey_count") {
            return Math.round((b.totalSurvey / maxSurveyInBuckets) * 100);
        }
        return Math.min(100, Math.max(0, getBucketMetricValue(b)));
    };

    return (
        <div className="space-y-6">
            {/* Header Ringkas + Tombol Custom Setup MoM */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 clean-card p-5 sm:p-6">
                <div>
                    <h1 className="text-base sm:text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <BarChart3 size={20} className="text-[var(--accent)]" />
                        Visual Performa Bulanan (MoM)
                    </h1>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        Grafik ringkas perbandingan performa bulan berjalan terhadap bulan-bulan sebelumnya.
                    </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        type="button"
                        onClick={() => setShowSetup(v => !v)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                            showSetup
                                ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                                : "bg-[#faf9f7] text-[#2d2a26] border-[#e8e5e0] hover:bg-[#f5f3ef]"
                        }`}
                    >
                        <SlidersHorizontal size={13} /> Custom Setup MoM
                    </button>

                    <div className="relative">
                        <select
                            value={filterMonth}
                            onChange={e => setFilterMonth(Number(e.target.value))}
                            className="appearance-none pl-3 pr-7 py-1.5 text-xs font-bold border border-[var(--border-subtle)] rounded-xl bg-white cursor-pointer"
                        >
                            {MONTHS_ID.map((m, i) => (
                                <option key={i} value={i + 1}>{m}</option>
                            ))}
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                    <div className="relative">
                        <select
                            value={filterYear}
                            onChange={e => setFilterYear(Number(e.target.value))}
                            className="appearance-none pl-3 pr-7 py-1.5 text-xs font-bold border border-[var(--border-subtle)] rounded-xl bg-white cursor-pointer"
                        >
                            {yearOptions.map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                    <button
                        onClick={load}
                        className="p-2 rounded-xl border border-[var(--border-subtle)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] cursor-pointer"
                        title="Segarkan Data"
                    >
                        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                    </button>
                </div>
            </div>

            {/* Panel Custom Setup MoM */}
            {showSetup && (
                <div className="clean-card p-4 border-emerald-200 bg-emerald-50/30 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--accent)] flex items-center gap-1.5">
                            <SlidersHorizontal size={14} /> Pengaturan Custom Visual MoM
                        </span>
                        <button
                            type="button"
                            onClick={() => setShowSetup(false)}
                            className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                        >
                            <X size={15} />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                        {/* 1. Rentang Bulan */}
                        <div className="bg-white p-3 rounded-xl border border-[#e8e5e0] space-y-1.5">
                            <label className="block font-bold text-slate-700">Rentang Perbandingan Bulan</label>
                            <div className="grid grid-cols-3 gap-1.5">
                                {([3, 6, 12] as RangeMonths[]).map(rm => (
                                    <button
                                        key={rm}
                                        type="button"
                                        onClick={() => updateConfig({ rangeMonths: rm })}
                                        className={`py-1.5 rounded-lg font-bold border cursor-pointer ${
                                            config.rangeMonths === rm
                                                ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                                                : "bg-[#faf9f7] text-slate-600 border-slate-200"
                                        }`}
                                    >
                                        {rm} Bln
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 2. Metrik Utama Grafik */}
                        <div className="bg-white p-3 rounded-xl border border-[#e8e5e0] space-y-1.5">
                            <label className="block font-bold text-slate-700">Indikator Grafik Utama</label>
                            <select
                                value={config.metric}
                                onChange={e => updateConfig({ metric: e.target.value as VisualMetric })}
                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-[#faf9f7] font-semibold text-slate-800"
                            >
                                <option value="approval_pct">% Persentase Approval</option>
                                <option value="deal_pct">% Rasio Konversi Deal</option>
                                <option value="survey_count">Jumlah Aktivitas Survey</option>
                            </select>
                        </div>

                        {/* 3. Target Benchmark (%) */}
                        <div className="bg-white p-3 rounded-xl border border-[#e8e5e0] space-y-1.5">
                            <div className="flex items-center justify-between">
                                <label className="font-bold text-slate-700">Target Benchmark (%)</label>
                                <span className="font-mono font-bold text-[var(--accent)]">{config.benchmarkPct}%</span>
                            </div>
                            <input
                                type="range"
                                min={20}
                                max={100}
                                step={5}
                                value={config.benchmarkPct}
                                onChange={e => updateConfig({ benchmarkPct: Number(e.target.value) })}
                                className="w-full accent-[var(--accent)] cursor-pointer"
                            />
                        </div>

                        {/* 4. Tampilkan Kartu Tim */}
                        <div className="bg-white p-3 rounded-xl border border-[#e8e5e0] flex flex-col justify-between">
                            <label className="font-bold text-slate-700">Kartu Performa Surveyor</label>
                            <button
                                type="button"
                                onClick={() => updateConfig({ showTeamCards: !config.showTeamCards })}
                                className={`py-1.5 px-3 rounded-lg font-bold border text-center cursor-pointer ${
                                    config.showTeamCards
                                        ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                        : "bg-slate-100 text-slate-600 border-slate-200"
                                }`}
                            >
                                {config.showTeamCards ? "Ditampilkan" : "Disembunyikan"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="py-16 text-center text-sm text-[var(--text-muted)] flex items-center justify-center gap-2">
                    <Loader2 size={18} className="animate-spin text-[var(--accent)]" /> Memuat grafik performa...
                </div>
            ) : (
                <>
                    {/* Banner Personal Marketing View */}
                    {isMarketing && (
                        <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-[var(--accent)] text-white flex items-center justify-center font-black text-xs shrink-0 shadow-xs">
                                    MKT
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-emerald-950 text-sm">
                                        Performa Penawaran Saya: {user?.name || "Marketing"}
                                    </h3>
                                    <p className="text-emerald-800 text-[11.5px] mt-0.5">
                                        Hanya menampilkan quotation &amp; rasio deal milik Anda untuk kategori Pest Control dan Anti Rayap.
                                    </p>
                                </div>
                            </div>
                            <span className="px-3 py-1 rounded-full bg-emerald-200/90 text-emerald-900 font-bold text-[10.5px] self-start sm:self-center shrink-0">
                                🔒 Data Terisolasi Pribadi
                            </span>
                        </div>
                    )}

                    {/* 3 Kartu Visual MoM: Breakdown Kategori Pest & Anti Rayap */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
                        {/* KARTU 1: ANTI RAYAP (TERMITE CONTROL) */}
                        <div className="clean-card p-5 sm:p-6 flex items-center justify-between gap-3 border-purple-100 bg-gradient-to-br from-white to-purple-50/25">
                            <div className="space-y-1">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700 flex items-center gap-1.5">
                                    <ShieldCheck size={14} className="text-purple-600" />
                                    Anti Rayap (Termite)
                                </span>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl sm:text-3xl font-extrabold font-mono text-[var(--text-primary)]">
                                        {categoryStats.ar.dealPct}%
                                    </span>
                                    {renderDeltaBadge(categoryStats.ar.deltaMoM, "%")}
                                </div>
                                <span className="text-[11px] text-[var(--text-muted)] block">
                                    <strong>{categoryStats.ar.dealCount} Deal</strong> dari {categoryStats.ar.totalSurvey} quotation (Bln lalu: {categoryStats.ar.prevDealPct}%)
                                </span>
                                <span className="text-[11px] font-mono text-purple-900 font-semibold block pt-0.5">
                                    Nilai Deal: {formatRupiah(categoryStats.ar.revenue)}
                                </span>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-purple-50 border border-purple-200 text-purple-600 flex items-center justify-center shrink-0">
                                <ShieldCheck size={22} />
                            </div>
                        </div>

                        {/* KARTU 2: PEST CONTROL (PCO / GENERAL PEST) */}
                        <div className="clean-card p-5 sm:p-6 flex items-center justify-between gap-3 border-emerald-100 bg-gradient-to-br from-white to-emerald-50/25">
                            <div className="space-y-1">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
                                    <Bug size={14} className="text-emerald-600" />
                                    Pest Control (PCO)
                                </span>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl sm:text-3xl font-extrabold font-mono text-[var(--text-primary)]">
                                        {categoryStats.pest.dealPct}%
                                    </span>
                                    {renderDeltaBadge(categoryStats.pest.deltaMoM, "%")}
                                </div>
                                <span className="text-[11px] text-[var(--text-muted)] block">
                                    <strong>{categoryStats.pest.dealCount} Deal</strong> dari {categoryStats.pest.totalSurvey} quotation (Bln lalu: {categoryStats.pest.prevDealPct}%)
                                </span>
                                <span className="text-[11px] font-mono text-emerald-900 font-semibold block pt-0.5">
                                    Nilai Deal: {formatRupiah(categoryStats.pest.revenue)}
                                </span>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-[var(--accent)] flex items-center justify-center shrink-0">
                                <Bug size={22} />
                            </div>
                        </div>

                        {/* KARTU 3: TOTAL DEAL SEMUA LAYANAN */}
                        <div className="clean-card p-5 sm:p-6 flex items-center justify-between gap-3 border-amber-100 bg-gradient-to-br from-white to-amber-50/25">
                            <div className="space-y-1">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                                    <TrendingUp size={14} className="text-amber-600" />
                                    Total Deal ({currentBucket.shortLabel})
                                </span>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl sm:text-3xl font-extrabold font-mono text-[var(--text-primary)]">
                                        {currentBucket.dealRatePct}%
                                    </span>
                                    {renderDeltaBadge(diffApprovalVsPrevMonth, "%")}
                                </div>
                                <span className="text-[11px] text-[var(--text-muted)] block">
                                    <strong>{currentBucket.dealCount} Deal</strong> dari {currentBucket.totalSurvey} survey total
                                </span>
                                <span className="text-[11px] font-mono text-amber-900 font-semibold block pt-0.5">
                                    Total Omset: {formatRupiah(currentBucket.revenue)}
                                </span>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
                                <TrendingUp size={22} />
                            </div>
                        </div>
                    </div>

                    {/* Grafik Batang Visual MoM (Interactive Visual Bar Chart) */}
                    <div className="clean-card p-5 sm:p-6 space-y-5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                                <h2 className="text-sm font-bold text-[var(--text-primary)]">
                                    Grafik Perbandingan {config.rangeMonths} Bulan Terakhir ({
                                        config.metric === "approval_pct"
                                            ? "% Persentase Approval"
                                            : config.metric === "deal_pct"
                                            ? "% Konversi Deal"
                                            : "Jumlah Survey"
                                    })
                                </h2>
                                <p className="text-[11px] text-[var(--text-muted)]">
                                    Garis putus-putus hijau menunjukkan Target Benchmark ({config.benchmarkPct}%)
                                </p>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] font-semibold text-[var(--text-secondary)]">
                                <span className="inline-flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded-xs bg-[var(--accent)] inline-block" /> Bulan Berjalan
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded-xs bg-emerald-200 inline-block" /> Bulan Sebelumnya
                                </span>
                            </div>
                        </div>

                        {/* Area Grafik Visual (Responsive Scrollable on Small Phones) */}
                        <div className="overflow-x-auto no-scrollbar pb-1">
                            <div className="relative h-52 pt-6 pb-2 px-2 sm:px-4 bg-[#faf9f7] rounded-2xl border border-[#e8e5e0] flex items-end justify-between gap-2 sm:gap-4 min-w-[340px] sm:min-w-full">
                            {config.metric !== "survey_count" && (
                                <div
                                    className="absolute left-3 right-3 border-t-2 border-dashed border-emerald-600/50 pointer-events-none flex items-center justify-end"
                                    style={{ bottom: `calc(${Math.min(95, Math.max(5, config.benchmarkPct))}% * 0.72 + 28px)` }}
                                >
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-700 text-white text-[9.5px] font-mono font-bold -mt-5">
                                        Target {config.benchmarkPct}%
                                    </span>
                                </div>
                            )}

                            {monthlyBuckets.map((b, idx) => {
                                const isCurrent = idx === monthlyBuckets.length - 1;
                                const val = getBucketMetricValue(b);
                                const heightPct = Math.max(8, getBucketBarHeightPct(b));
                                const suffix = config.metric === "survey_count" ? "" : "%";

                                return (
                                    <div key={b.key} className="flex-1 flex flex-col items-center justify-end h-full min-w-0 group">
                                        {/* Nilai di atas batang */}
                                        <div className={`text-[11px] font-mono font-bold mb-1 ${
                                            isCurrent ? "text-[var(--accent)]" : "text-slate-600"
                                        }`}>
                                            {val}{suffix}
                                        </div>

                                        {/* Track & Batang Visual */}
                                        <div className="w-full max-w-[54px] h-[72%] bg-slate-200/70 rounded-t-xl flex items-end overflow-hidden p-0.5">
                                            <div
                                                className={`w-full rounded-t-lg transition-all duration-300 ${
                                                    isCurrent
                                                        ? "bg-[var(--accent)] shadow-xs"
                                                        : val >= config.benchmarkPct && config.metric !== "survey_count"
                                                        ? "bg-emerald-400"
                                                        : "bg-emerald-300/80"
                                                }`}
                                                style={{ height: `${heightPct}%` }}
                                                title={`${b.label}: ${val}${suffix} (${b.approvedCount}/${b.totalSurvey} survey)`}
                                            />
                                        </div>

                                        {/* Label Bulan */}
                                        <div className={`mt-2 text-[10.5px] font-bold truncate max-w-full ${
                                            isCurrent ? "text-[var(--accent)]" : "text-slate-600"
                                        }`}>
                                            {b.shortLabel}
                                        </div>
                                        <div className="text-[9.5px] text-slate-400 font-mono">
                                            {b.approvedCount}/{b.totalSurvey}
                                        </div>
                                    </div>
                                );
                            })}
                            </div>
                        </div>
                    </div>

                    {/* Kartu Ringkas Progress Bar per Surveyor / Marketing */}
                    {config.showTeamCards && (
                        <div className="clean-card p-4 sm:p-5 space-y-3">
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                                    <Users size={16} className="text-[var(--accent)]" />
                                    {isMarketing ? "Rincian KPI & Capaian Saya" : `Performa Tim Surveyor / Marketing (${currentBucket.label})`}
                                </h2>
                                <span className="text-[11px] text-[var(--text-muted)]">
                                    Visual rasio keberhasilan &amp; selisih MoM
                                </span>
                            </div>

                            {visibleMarketingList.length === 0 ? (
                                <div className="py-8 text-center text-xs text-[var(--text-muted)]">
                                    Belum ada aktivitas survey pada periode ini.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {visibleMarketingList.map(m => {

                                        const tgt = targets.find(t => t.uid === m.uid && t.year === filterYear && t.month === filterMonth);
                                        const isEditing = editingUid === m.uid;

                                        return (
                                            <div key={m.uid} className="p-3.5 rounded-xl border border-[#e8e5e0] bg-[#faf9f7] space-y-2.5">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div>
                                                        <div className="font-bold text-xs sm:text-sm text-[var(--text-primary)]">{m.nama}</div>
                                                        <div className="text-[11px] text-[var(--text-muted)]">
                                                            Bulan ini: <b>{m.currApproved}/{m.currTotal}</b> disetujui • Bulan lalu: <b>{m.prevPct}%</b>
                                                        </div>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <div className="text-base font-extrabold font-mono text-[var(--accent)]">{m.currPct}%</div>
                                                        {renderDeltaBadge(m.momDeltaPct, "%")}
                                                    </div>
                                                </div>

                                                {/* Visual Progress Bar */}
                                                <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all ${
                                                            m.currPct >= config.benchmarkPct ? "bg-[var(--accent)]" : "bg-amber-500"
                                                        }`}
                                                        style={{ width: `${Math.min(100, Math.max(4, m.currPct))}%` }}
                                                    />
                                                </div>

                                                {/* Target Setup Khusus Direktur / Admin */}
                                                {isAdminOrSuper && (
                                                    <div className="pt-1.5 border-t border-[#e8e5e0] flex items-center justify-between gap-2 text-[11px]">
                                                        {isEditing ? (
                                                            <div className="flex items-center gap-1.5 w-full">
                                                                <input
                                                                    type="number"
                                                                    placeholder="Target Survey"
                                                                    value={editCnt}
                                                                    onChange={e => setEditCnt(e.target.value)}
                                                                    className="w-24 px-2 py-1 text-xs border border-slate-300 rounded-lg bg-white"
                                                                />
                                                                <input
                                                                    type="text"
                                                                    placeholder="Target Rp (Opsional)"
                                                                    value={editRev}
                                                                    onChange={e => setEditRev(e.target.value)}
                                                                    className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    disabled={savingTarget}
                                                                    onClick={() => handleSaveTarget(m.uid, m.nama)}
                                                                    className="p-1.5 rounded-lg bg-emerald-600 text-white cursor-pointer"
                                                                >
                                                                    <Check size={12} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setEditingUid(null)}
                                                                    className="p-1.5 rounded-lg bg-slate-200 text-slate-700 cursor-pointer"
                                                                >
                                                                    <X size={12} />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <span className="text-[var(--text-muted)]">
                                                                    Target Bulanan:{" "}
                                                                    {tgt && (tgt.targetCount > 0 || tgt.targetRevenue > 0) ? (
                                                                        <strong className="text-slate-700">
                                                                            {tgt.targetCount} survey {tgt.targetRevenue > 0 ? `• ${formatRupiah(tgt.targetRevenue)}` : ""}
                                                                        </strong>
                                                                    ) : (
                                                                        <span>Standar ({config.benchmarkPct}%)</span>
                                                                    )}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setEditingUid(m.uid);
                                                                        setEditCnt(String(tgt?.targetCount ?? 5));
                                                                        setEditRev(String(tgt?.targetRevenue ?? 0));
                                                                    }}
                                                                    className="text-[var(--accent)] font-bold hover:underline cursor-pointer"
                                                                >
                                                                    Atur Target
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
