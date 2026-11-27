import { useState, useEffect, useMemo } from "react";
import { MapPin, RefreshCw, Loader2, Search, X, ChevronDown, ChevronUp, Users, TrendingUp, CheckCircle2, Shield } from "lucide-react";
import { useAuthStore } from '@/app/store/authStore';
import { getQuotations } from '@/shared/api/quotationService';
import { formatRupiah } from '@/shared/lib/utils';
import type { Quotation } from '@/entities/types';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function extractWilayah(alamat: string): string {
    if (!alamat) return "Tidak Diketahui";
    const lower = alamat.toLowerCase();
    // Jakarta areas
    if (lower.includes("jakarta utara") || lower.includes("jakut"))     return "Jakarta Utara";
    if (lower.includes("jakarta selatan") || lower.includes("jaksel"))  return "Jakarta Selatan";
    if (lower.includes("jakarta barat") || lower.includes("jakbar"))    return "Jakarta Barat";
    if (lower.includes("jakarta timur") || lower.includes("jaktim"))    return "Jakarta Timur";
    if (lower.includes("jakarta pusat") || lower.includes("jakpus"))    return "Jakarta Pusat";
    if (lower.includes("jakarta"))                                        return "Jakarta";
    // Bodetabek
    if (lower.includes("bogor"))    return "Bogor";
    if (lower.includes("depok"))    return "Depok";
    if (lower.includes("tangerang selatan") || lower.includes("tangsel")) return "Tangerang Selatan";
    if (lower.includes("tangerang")) return "Tangerang";
    if (lower.includes("bekasi"))   return "Bekasi";
    // Other cities
    if (lower.includes("bandung"))  return "Bandung";
    if (lower.includes("surabaya")) return "Surabaya";
    if (lower.includes("medan"))    return "Medan";
    if (lower.includes("semarang")) return "Semarang";
    if (lower.includes("yogyakarta") || lower.includes("jogja")) return "Yogyakarta";
    if (lower.includes("bali"))     return "Bali";
    // Fallback: take first meaningful word
    const words = alamat.split(/[\s,./]+/).filter(w => w.length > 3);
    return words[0] ? words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase() : "Lainnya";
}

interface WilayahData {
    nama: string;
    customers: { name: string; address: string; wa: string; totalDeal: number; totalRevenue: number; hasWarranty: boolean; quotations: Quotation[] }[];
    totalCustomers: number;
    totalDeal: number;
    totalRevenue: number;
    activeWarranty: number;
}

// ─── WILAYAH CARD ─────────────────────────────────────────────────────────────

function WilayahCard({ wilayah, expanded, onToggle }: {
    wilayah: WilayahData;
    expanded: boolean;
    onToggle: () => void;
}) {
    const dealRate = wilayah.totalCustomers > 0 ? Math.round(wilayah.totalDeal / wilayah.totalCustomers * 100) : 0;
    return (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <button onClick={onToggle} className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-slate-50 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                    <MapPin size={18} className="text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900">{wilayah.nama}</p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Users size={11} /> {wilayah.totalCustomers} klien
                        </span>
                        {wilayah.totalDeal > 0 && (
                            <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                                <CheckCircle2 size={11} /> {wilayah.totalDeal} deal ({dealRate}%)
                            </span>
                        )}
                        {wilayah.totalRevenue > 0 && (
                            <span className="text-xs text-blue-600 font-semibold flex items-center gap-1">
                                <TrendingUp size={11} /> {formatRupiah(wilayah.totalRevenue)}
                            </span>
                        )}
                        {wilayah.activeWarranty > 0 && (
                            <span className="text-xs text-purple-600 flex items-center gap-1">
                                <Shield size={11} /> {wilayah.activeWarranty} garansi aktif
                            </span>
                        )}
                    </div>
                </div>
                {/* Deal rate bar */}
                <div className="hidden sm:flex flex-col items-end gap-1 shrink-0 w-20">
                    <span className="text-xs text-slate-400">Konversi</span>
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${dealRate}%` }} />
                    </div>
                    <span className="text-xs font-bold text-emerald-600">{dealRate}%</span>
                </div>
                <div className="shrink-0 text-slate-400">{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</div>
            </button>

            {expanded && (
                <div className="border-t border-slate-100 divide-y divide-slate-50">
                    {wilayah.customers.map((c, i) => (
                        <div key={i} className="px-5 py-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
                                <p className="text-xs text-slate-400 truncate">{c.address}</p>
                                {c.wa && (
                                    <a href={`https://wa.me/${c.wa.replace(/^0/, "62").replace(/\D/g, "")}`}
                                        target="_blank" rel="noopener noreferrer"
                                        className="text-[10px] text-green-600 hover:underline">📱 {c.wa}</a>
                                )}
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                                {c.totalDeal > 0 && (
                                    <span className="text-xs font-bold text-emerald-600">{c.totalDeal} deal</span>
                                )}
                                {c.totalRevenue > 0 && (
                                    <span className="text-xs text-slate-500 font-mono">{formatRupiah(c.totalRevenue)}</span>
                                )}
                                {c.hasWarranty && (
                                    <span className="text-[10px] text-purple-500">🛡 Garansi</span>
                                )}
                                {c.totalDeal === 0 && (
                                    <span className="text-[10px] text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded">Prospek</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export function AreaPage() {
    const { user } = useAuthStore();
    const [quotations, setQuotations] = useState<Quotation[]>([]);
    const [loading,    setLoading]    = useState(true);
    const [search,     setSearch]     = useState("");
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [sortBy,     setSortBy]     = useState<"revenue" | "customers" | "name">("revenue");

    const load = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const data = await getQuotations({ companyId: user.companyId });
            setQuotations(data);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [user]);

    const wilayahMap = useMemo(() => {
        const map = new Map<string, WilayahData>();
        const now = new Date();

        // Group customers by name first
        const customerMap = new Map<string, { name: string; address: string; wa: string; totalDeal: number; totalRevenue: number; hasWarranty: boolean; quotations: Quotation[] }>();
        quotations.forEach(q => {
            const key = q.kepadaNama.trim().toLowerCase().replace(/\s+/g, "_");
            if (!customerMap.has(key)) {
                customerMap.set(key, { name: q.kepadaNama, address: q.kepadaAlamatLines?.[0] ?? "", wa: q.kepadaWa ?? "", totalDeal: 0, totalRevenue: 0, hasWarranty: false, quotations: [] });
            }
            const c = customerMap.get(key)!;
            c.quotations.push(q);
            if (q.status === "deal") {
                c.totalDeal++;
                c.totalRevenue += q.total;
                if (q.garansiTahun && q.garansiTahun > 0 && q.dealAt) {
                    const exp = new Date(q.dealAt);
                    exp.setFullYear(exp.getFullYear() + q.garansiTahun);
                    if (exp > now) c.hasWarranty = true;
                }
            }
            if (!c.address && q.kepadaAlamatLines?.[0]) c.address = q.kepadaAlamatLines[0];
            if (!c.wa && q.kepadaWa) c.wa = q.kepadaWa;
        });

        // Now group customers by wilayah
        customerMap.forEach(c => {
            const wilayah = extractWilayah(c.address);
            if (!map.has(wilayah)) {
                map.set(wilayah, { nama: wilayah, customers: [], totalCustomers: 0, totalDeal: 0, totalRevenue: 0, activeWarranty: 0 });
            }
            const w = map.get(wilayah)!;
            w.customers.push(c);
            w.totalCustomers++;
            w.totalDeal      += c.totalDeal;
            w.totalRevenue   += c.totalRevenue;
            if (c.hasWarranty) w.activeWarranty++;
        });

        return map;
    }, [quotations]);

    let wilayahs = Array.from(wilayahMap.values());

    if (search) {
        const s = search.toLowerCase();
        wilayahs = wilayahs.filter(w =>
            w.nama.toLowerCase().includes(s) ||
            w.customers.some(c => c.name.toLowerCase().includes(s)),
        );
    }

    wilayahs.sort((a, b) =>
        sortBy === "name"      ? a.nama.localeCompare(b.nama)
        : sortBy === "customers" ? b.totalCustomers - a.totalCustomers
        : b.totalRevenue - a.totalRevenue,
    );

    const totalWilayah   = wilayahMap.size;
    const totalCustomers = Array.from(wilayahMap.values()).reduce((s, w) => s + w.totalCustomers, 0);
    const totalRevenue   = Array.from(wilayahMap.values()).reduce((s, w) => s + w.totalRevenue, 0);
    const topWilayah     = wilayahs[0];

    return (
        <div className="p-4 md:p-6 max-w-screen-lg mx-auto space-y-5 pb-8">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <MapPin size={20} className="text-blue-600" /> Area Lokasi
                    </h1>
                    <p className="text-sm text-slate-400 mt-0.5">Klasifikasi pelanggan berdasarkan wilayah</p>
                </div>
                <button onClick={load} className="p-2 border border-slate-200 bg-white rounded-xl text-slate-400 hover:bg-slate-50">
                    <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-white border border-slate-200 rounded-xl p-3">
                    <p className="text-2xl font-bold text-slate-800">{totalWilayah}</p>
                    <p className="text-xs text-slate-500">Wilayah</p>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                    <p className="text-2xl font-bold text-blue-700">{totalCustomers}</p>
                    <p className="text-xs text-slate-500">Total Klien</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                    <p className="text-sm font-bold text-emerald-700 truncate">{formatRupiah(totalRevenue)}</p>
                    <p className="text-xs text-slate-500">Total Revenue</p>
                </div>
            </div>

            {/* Top wilayah highlight */}
            {topWilayah && topWilayah.totalRevenue > 0 && (
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-4 text-white">
                    <p className="text-xs font-bold uppercase tracking-wide opacity-80 mb-1">🏆 Wilayah Teratas</p>
                    <p className="text-lg font-bold">{topWilayah.nama}</p>
                    <div className="flex items-center gap-4 mt-1 text-sm opacity-90">
                        <span>{topWilayah.totalCustomers} klien</span>
                        <span>·</span>
                        <span>{topWilayah.totalDeal} deal</span>
                        <span>·</span>
                        <span>{formatRupiah(topWilayah.totalRevenue)}</span>
                    </div>
                </div>
            )}

            {/* Search + Sort */}
            <div className="flex gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-1 min-w-0 bg-white border border-slate-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-blue-100">
                    <Search size={14} className="text-slate-400 shrink-0" />
                    <input className="flex-1 text-sm bg-transparent outline-none text-slate-800 placeholder:text-slate-400 min-w-0"
                        placeholder="Cari wilayah atau nama klien..."
                        value={search} onChange={e => setSearch(e.target.value)} />
                    {search && <button onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600 shrink-0"><X size={13} /></button>}
                </div>
                <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
                    className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white text-slate-600 focus:outline-none shrink-0">
                    <option value="revenue">Revenue</option>
                    <option value="customers">Jumlah Klien</option>
                    <option value="name">Nama A-Z</option>
                </select>
            </div>

            {/* List */}
            {loading ? (
                <div className="flex items-center justify-center py-16 text-slate-400">
                    <Loader2 size={24} className="animate-spin mr-2" /> Memuat data...
                </div>
            ) : wilayahs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-center">
                    <MapPin size={36} className="mb-3 opacity-20" />
                    <p className="font-medium text-slate-500">Belum ada data wilayah</p>
                    <p className="text-sm mt-1">Data muncul otomatis dari alamat pada quotation.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {wilayahs.map(w => (
                        <WilayahCard key={w.nama} wilayah={w}
                            expanded={expandedId === w.nama}
                            onToggle={() => setExpandedId(prev => prev === w.nama ? null : w.nama)} />
                    ))}
                    <p className="text-xs text-slate-400 text-center pt-1">{wilayahs.length} wilayah · {totalCustomers} klien</p>
                </div>
            )}
        </div>
    );
}