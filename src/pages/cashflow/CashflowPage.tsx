import { useState, useEffect, useMemo } from "react";
import { collection, query, where, getDocs, Timestamp } from '@/shared/lib/firebase';
import { db } from '@/shared/lib/firebase';
import { useAuthStore } from '@/app/store/authStore';
import { formatRupiah } from '@/shared/lib/utils';
import {
    DollarSign, TrendingDown, RefreshCw, Loader2, ChevronDown, BarChart3,
    ArrowUpRight, Minus, CheckCircle2, Target,
} from "lucide-react";

interface QuoRow {
    id: string;
    noSurat: string;
    kepadaNama: string;
    perihal: string;
    total: number;
    kategori: "AR" | "PCO";
    marketingNama: string;
    marketingUid: string;
    approvedAt: Date;
    createdAt: Date;
    jenisLayanan: string;
    status: "approved" | "deal";
}

interface MonthBucket {
    key: string;
    label: string;
    approved: number;  // nilai approved (belum tentu deal)
    deal: number;      // nilai deal (confirmed)
    countApproved: number;
    countDeal: number;
    ar: number;
    pco: number;
}

interface MarketingRevenue {
    uid: string;
    nama: string;
    revenue: number;
    countApproved: number;
    countDeal: number;
    ar: number;
    pco: number;
}

const MONTHS_ID = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agt","Sep","Okt","Nov","Des"];

function monthKey(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function monthLabel(key: string) {
    const [y, m] = key.split("-");
    return `${MONTHS_ID[parseInt(m)-1]} ${y}`;
}

function StatCard({ icon, label, value, sub, color, trend }: {
    icon: React.ReactNode; label: string; value: string;
    sub?: string; color: string; trend?: "up"|"down"|"neutral";
}) {
    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
                    {icon}
                </div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400 leading-tight">{label}</p>
            </div>
            <div className="min-w-0">
                <p className="text-base font-bold text-slate-900 leading-tight truncate">{value}</p>
                {sub && (
                    <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1 flex-wrap">
                        {trend === "up"      && <ArrowUpRight size={11} className="text-emerald-500" />}
                        {trend === "down"    && <TrendingDown size={11} className="text-red-400" />}
                        {trend === "neutral" && <Minus size={11} className="text-slate-400" />}
                        {sub}
                    </p>
                )}
            </div>
        </div>
    );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
    return <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">{children}</h2>;
}

// ─── BAR CHART: Approved vs Deal ──────────────────────────────────────────────

function RevenueBarChart({ buckets }: { buckets: MonthBucket[] }) {
    const maxVal = Math.max(...buckets.map(b => Math.max(b.approved, b.deal)), 1);
    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-5">
                <div>
                    <p className="text-sm font-bold text-slate-800">Approved vs Deal per Bulan</p>
                    <p className="text-xs text-slate-400 mt-0.5">Perbandingan penawaran disetujui & yang benar-benar deal</p>
                </div>
                <BarChart3 size={16} className="text-slate-300" />
            </div>
            <div className="flex items-end gap-1.5" style={{ height: 160 }}>
                {buckets.map((b, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full flex gap-0.5 items-end" style={{ height: 120 }}>
                            {/* Approved bar */}
                            <div className="flex-1 flex flex-col justify-end">
                                <div className="w-full bg-blue-200 rounded-t transition-all duration-500"
                                    style={{ height: `${maxVal > 0 ? (b.approved / maxVal) * 100 : 0}%`, minHeight: b.approved > 0 ? 3 : 0 }} />
                            </div>
                            {/* Deal bar */}
                            <div className="flex-1 flex flex-col justify-end">
                                <div className="w-full bg-emerald-500 rounded-t transition-all duration-500"
                                    style={{ height: `${maxVal > 0 ? (b.deal / maxVal) * 100 : 0}%`, minHeight: b.deal > 0 ? 3 : 0 }} />
                            </div>
                        </div>
                        <span className="text-[9px] text-slate-400 leading-none text-center">{b.label}</span>
                    </div>
                ))}
            </div>
            <div className="flex items-center gap-5 mt-4 pt-3 border-t border-slate-100">
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="w-3 h-3 rounded-sm bg-blue-200 inline-block" /> Approved
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" /> Deal
                </span>
            </div>
        </div>
    );
}

// ─── CONVERSION CHART ─────────────────────────────────────────────────────────

function ConversionPanel({ buckets }: { buckets: MonthBucket[] }) {
    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <SectionTitle>Konversi per Bulan</SectionTitle>
            <div className="space-y-3">
                {buckets.filter(b => b.countApproved > 0).slice(-6).map(b => {
                    const rate = b.countApproved > 0 ? Math.round(b.countDeal / b.countApproved * 100) : 0;
                    return (
                        <div key={b.key}>
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium text-slate-700">{b.label}</span>
                                <span className="text-xs font-bold" style={{ color: rate >= 60 ? "#15803d" : rate >= 30 ? "#d97706" : "#dc2626" }}>
                                    {rate}% deal ({b.countDeal}/{b.countApproved})
                                </span>
                            </div>
                            <div className="w-full bg-blue-100 rounded-full h-2">
                                <div className="h-2 rounded-full bg-emerald-500 transition-all duration-700"
                                    style={{ width: `${rate}%` }} />
                            </div>
                        </div>
                    );
                })}
                {buckets.every(b => b.countApproved === 0) && (
                    <p className="text-xs text-slate-400 text-center py-4">Belum ada data</p>
                )}
            </div>
        </div>
    );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export function CashflowPage() {
    const { user } = useAuthStore();
    const companyId = user?.companyId ?? "";

    const [rows, setRows] = useState<QuoRow[]>([]);
    const [loading, setLoading] = useState(true);

    const currentYear  = new Date().getFullYear();
    const [filterYear, setFilterYear] = useState(currentYear);
    const [filterMonth, setFilterMonth] = useState<number | "all">("all");

    const yearOptions = useMemo(() => {
        const years: number[] = [];
        for (let y = currentYear; y >= currentYear - 3; y--) years.push(y);
        return years;
    }, [currentYear]);

    const load = async () => {
        setLoading(true);
        try {
            const snap = await getDocs(query(
                collection(db, "quotations"),
                where("companyId", "==", companyId),
                where("status", "in", ["approved", "deal"]),
            ));
            setRows(snap.docs.map(d => {
                const x = d.data();
                return {
                    id: d.id,
                    noSurat: x.noSurat as string,
                    kepadaNama: x.kepadaNama as string,
                    perihal: x.perihal as string,
                    total: (x.total as number) ?? 0,
                    kategori: (x.kategori as "AR" | "PCO") ?? "PCO",
                    marketingNama: x.marketingNama as string,
                    marketingUid: x.marketingUid as string,
                    approvedAt: (x.dealAt || x.approvedAt)
                        ? ((x.dealAt || x.approvedAt) as Timestamp).toDate()
                        : (x.createdAt as Timestamp).toDate(),
                    createdAt: (x.createdAt as Timestamp).toDate(),
                    jenisLayanan: x.jenisLayanan as string,
                    status: x.status as "approved" | "deal",
                };
            }));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [companyId]); // eslint-disable-line

    const filtered = useMemo(() => rows.filter(r => {
        const y = r.approvedAt.getFullYear();
        const m = r.approvedAt.getMonth() + 1;
        if (y !== filterYear) return false;
        if (filterMonth !== "all" && m !== filterMonth) return false;
        return true;
    }), [rows, filterYear, filterMonth]);

    // Monthly buckets — approved & deal split
    const monthBuckets = useMemo<MonthBucket[]>(() => {
        const map: Record<string, MonthBucket> = {};
        for (let m = 1; m <= 12; m++) {
            const key = `${filterYear}-${String(m).padStart(2,"00"[0])}`;
            const k = `${filterYear}-${String(m).padStart(2,"0")}`;
            map[k] = { key: k, label: `${MONTHS_ID[m-1]}`, approved: 0, deal: 0, countApproved: 0, countDeal: 0, ar: 0, pco: 0 };
        }
        rows.filter(r => r.approvedAt.getFullYear() === filterYear).forEach(r => {
            const key = monthKey(r.approvedAt);
            if (!map[key]) return;
            map[key].countApproved++;
            map[key].approved += r.total;
            if (r.status === "deal") {
                map[key].deal += r.total;
                map[key].countDeal++;
            }
            if (r.kategori === "AR") map[key].ar += r.total;
            else map[key].pco += r.total;
        });
        return Object.values(map);
    }, [rows, filterYear]);

    const displayBuckets = useMemo(() => {
        if (filterMonth === "all") return monthBuckets;
        return monthBuckets.filter(b => b.key === `${filterYear}-${String(filterMonth).padStart(2,"0")}`);
    }, [monthBuckets, filterYear, filterMonth]);

    // Stats
    const totalApproved = filtered.reduce((s, r) => s + r.total, 0);
    const totalDeal     = filtered.filter(r => r.status === "deal").reduce((s, r) => s + r.total, 0);
    const countApproved = filtered.length;
    const countDeal     = filtered.filter(r => r.status === "deal").length;
    const convRate      = countApproved > 0 ? Math.round(countDeal / countApproved * 100) : 0;
    const arRevenue     = filtered.filter(r => r.kategori === "AR").reduce((s, r) => s + r.total, 0);
    const pcoRevenue    = filtered.filter(r => r.kategori === "PCO").reduce((s, r) => s + r.total, 0);
    const arPct         = totalApproved > 0 ? Math.round((arRevenue / totalApproved) * 100) : 0;

    const marketingMap = useMemo<MarketingRevenue[]>(() => {
        const map: Record<string, MarketingRevenue> = {};
        filtered.forEach(r => {
            if (!map[r.marketingUid]) {
                map[r.marketingUid] = { uid: r.marketingUid, nama: r.marketingNama, revenue: 0, countApproved: 0, countDeal: 0, ar: 0, pco: 0 };
            }
            map[r.marketingUid].revenue += r.total;
            map[r.marketingUid].countApproved++;
            if (r.status === "deal") map[r.marketingUid].countDeal++;
            if (r.kategori === "AR") map[r.marketingUid].ar += r.total;
            else map[r.marketingUid].pco += r.total;
        });
        return Object.values(map).sort((a, b) => b.revenue - a.revenue);
    }, [filtered]);

    const maxMktRevenue = marketingMap[0]?.revenue ?? 1;

    const thisMonthKey = monthKey(new Date());
    const lastMonthKey = (() => { const d = new Date(); d.setMonth(d.getMonth()-1); return monthKey(d); })();
    const thisMonthDeal = monthBuckets.find(b => b.key === thisMonthKey)?.deal ?? 0;
    const lastMonthDeal = monthBuckets.find(b => b.key === lastMonthKey)?.deal ?? 0;
    const delta = lastMonthDeal > 0 ? ((thisMonthDeal - lastMonthDeal) / lastMonthDeal) * 100 : null;

    const periodLabel = filterMonth === "all" ? `Tahun ${filterYear}` : `${MONTHS_ID[filterMonth-1]} ${filterYear}`;

    return (
        <div className="p-4 md:p-6 max-w-screen-xl mx-auto space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <DollarSign size={22} className="text-emerald-600" /> Cashflow
                    </h1>
                    <p className="text-sm text-slate-400 mt-0.5">Revenue dari quotation approved & deal</p>
                </div>
                <button onClick={load} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                    <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-400 mr-1">Periode:</span>
                <div className="relative">
                    <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}
                        className="appearance-none pl-3 pr-7 py-1.5 text-sm font-medium border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 cursor-pointer">
                        {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
                <div className="relative">
                    <select value={filterMonth} onChange={e => setFilterMonth(e.target.value === "all" ? "all" : Number(e.target.value))}
                        className="appearance-none pl-3 pr-7 py-1.5 text-sm font-medium border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 cursor-pointer">
                        <option value="all">Semua Bulan</option>
                        {MONTHS_ID.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
                <span className="text-xs text-slate-400 ml-1">— {periodLabel}</span>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20 text-slate-400">
                    <Loader2 size={22} className="animate-spin mr-2" /> Memuat data...
                </div>
            ) : (
                <>
                    {/* Approved vs Deal banner */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                            <p className="text-xs font-bold text-blue-500 uppercase tracking-wide mb-1">Approved</p>
                            <p className="text-xl font-bold text-blue-700">{countApproved}</p>
                            <p className="text-xs text-blue-500 mt-0.5">{formatRupiah(totalApproved)}</p>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                            <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide mb-1 flex items-center gap-1"><CheckCircle2 size={10} /> Deal</p>
                            <p className="text-xl font-bold text-emerald-700">{countDeal}</p>
                            <p className="text-xs text-emerald-600 mt-0.5">{formatRupiah(totalDeal)}</p>
                        </div>
                        <div className={`rounded-2xl p-4 border ${convRate >= 60 ? "bg-emerald-50 border-emerald-200" : convRate >= 30 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"}`}>
                            <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: convRate >= 60 ? "#15803d" : convRate >= 30 ? "#d97706" : "#dc2626" }}>
                                <Target size={10} className="inline mr-1" />Konversi
                            </p>
                            <p className="text-xl font-bold" style={{ color: convRate >= 60 ? "#15803d" : convRate >= 30 ? "#d97706" : "#dc2626" }}>{convRate}%</p>
                            <p className="text-xs mt-0.5" style={{ color: convRate >= 60 ? "#15803d" : convRate >= 30 ? "#d97706" : "#dc2626" }}>
                                {countDeal} dari {countApproved} penawaran
                            </p>
                        </div>
                        <StatCard icon={<DollarSign size={18} />} label="Revenue Deal"
                            value={formatRupiah(totalDeal)}
                            sub={delta !== null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% vs bln lalu` : "periode ini"}
                            color="bg-emerald-100 text-emerald-600"
                            trend={delta === null ? "neutral" : delta >= 0 ? "up" : "down"} />
                    </div>

                    {/* Charts */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <div className="md:col-span-2">
                            <RevenueBarChart buckets={filterMonth === "all" ? monthBuckets : displayBuckets} />
                        </div>
                        <ConversionPanel buckets={filterMonth === "all" ? monthBuckets : displayBuckets} />
                    </div>

                    {/* AR vs PCO breakdown */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                        <SectionTitle>Breakdown Layanan (dari semua approved)</SectionTitle>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {[
                                { label: "Anti Rayap", revenue: arRevenue, pct: arPct, color: "bg-purple-500" },
                                { label: "Pest Control", revenue: pcoRevenue, pct: 100 - arPct, color: "bg-cyan-500" },
                            ].map(s => (
                                <div key={s.label}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm font-medium text-slate-700">{s.label}</span>
                                        <span className="text-sm font-bold text-slate-900">{s.pct}%</span>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-2.5">
                                        <div className={`h-2.5 rounded-full ${s.color} transition-all duration-700`}
                                            style={{ width: `${s.pct}%` }} />
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">{formatRupiah(s.revenue)}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Marketing performance */}
                    {marketingMap.length > 0 && (
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                            <SectionTitle>Performance Marketing</SectionTitle>
                            <div className="space-y-4">
                                {marketingMap.map(m => {
                                    const mConv = m.countApproved > 0 ? Math.round(m.countDeal / m.countApproved * 100) : 0;
                                    return (
                                        <div key={m.uid}>
                                            <div className="flex items-start justify-between mb-1 gap-2">
                                                <div>
                                                    <span className="text-sm font-semibold text-slate-800">{m.nama}</span>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-xs text-slate-400">{m.countApproved} approved</span>
                                                        <span className="text-xs text-emerald-600 font-semibold">{m.countDeal} deal</span>
                                                        <span className="text-xs font-bold px-1.5 py-0.5 rounded"
                                                            style={{
                                                                background: mConv >= 60 ? "#dcfce7" : mConv >= 30 ? "#fef3c7" : "#fee2e2",
                                                                color: mConv >= 60 ? "#15803d" : mConv >= 30 ? "#d97706" : "#dc2626",
                                                            }}>
                                                            {mConv}% konversi
                                                        </span>
                                                    </div>
                                                </div>
                                                <span className="text-sm font-bold text-slate-900 shrink-0">{formatRupiah(m.revenue)}</span>
                                            </div>
                                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                                <div className="h-2 bg-blue-200 rounded-full" style={{ width: `${(m.revenue / maxMktRevenue) * 100}%` }}>
                                                    <div className="h-2 bg-emerald-500 rounded-full transition-all"
                                                        style={{ width: `${mConv}%` }} />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}