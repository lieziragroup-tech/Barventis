import React, { useState, useEffect, useMemo } from "react";
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { Pagination } from '@/shared/ui/Pagination';
import {
    Users, ShieldCheck, RefreshCw, Search, MessageCircle,
    CalendarClock, AlertTriangle, CheckCircle2, BellRing, CalendarCheck, X, Wrench,
} from "lucide-react";
import { useAuthStore } from '@/app/store/authStore';
import { getQuotations } from '@/shared/api/quotationService';
import { supabase } from '@/shared/lib/supabase';
import { warrantyToTotalMonths, formatWarrantyDurationText } from '@/shared/lib/warrantyPricingEngine';
import { PageHeader } from '@/shared/ui/PageHeader';
import type { Quotation } from '@/entities/types';

export type WarrantyAlertLevel = "overdue" | "expiring" | "safe";
const KONTROL_PAGE_SIZE = 10;

interface KontrolRow {
    id: string;
    noSurat: string;
    nama: string;
    telp: string;
    alamat: string;
    startDate: string;
    expiry: string;
    nextControlDate: string;
    daysToExpiry: number;
    daysToControl: number;
    garansiLabel: string;
    nextControlLabel: string;
    alertLevel: WarrantyAlertLevel;
    status: "Terlewat / Habis" | "Akan Habis / Segera Kontrol" | "Garansi & Kontrol Aman";
    lastHandledNote?: string;
}

const FALLBACK_KONTROL: KontrolRow[] = [
    {
        id: "1",
        noSurat: "GP/AR/PH/2023/10/0012",
        nama: "Ibu Lince Susanty",
        telp: "0811-9922-781",
        alamat: "Metland Puri, Blok F4 No. 28B, Tangerang",
        startDate: "2023-10-15",
        expiry: "2026-10-15",
        nextControlDate: "2026-10-15",
        daysToExpiry: -8,
        daysToControl: -8,
        garansiLabel: "Selama 3 (Tiga) tahun",
        nextControlLabel: "Terlewat 8 Hari (Wajib Tindak Lanjut)",
        alertLevel: "overdue",
        status: "Terlewat / Habis",
    },
    {
        id: "2",
        noSurat: "GP/AR/PH/2024/11/0018",
        nama: "Bapak Heri Mukti",
        telp: "0811-116-860",
        alamat: "Citra Fine Homes L05 No. 12, Jakarta Barat",
        startDate: "2024-11-10",
        expiry: "2026-11-10",
        nextControlDate: "2026-11-02",
        daysToExpiry: 18,
        daysToControl: 10,
        garansiLabel: "Selama 2 (Dua) tahun",
        nextControlLabel: "Kontrol Berkala IV (10 Hari Lagi)",
        alertLevel: "expiring",
        status: "Akan Habis / Segera Kontrol",
    },
    {
        id: "3",
        noSurat: "GP/AR/PH/2026/01/0005",
        nama: "PT Oreka Solusi Kreatif",
        telp: "0817-0795-959",
        alamat: "Jl. RC. Veteran Raya No. 9, Bintaro, Jakarta Selatan",
        startDate: "2026-01-05",
        expiry: "2031-01-05",
        nextControlDate: "2027-01-05",
        daysToExpiry: 1535,
        daysToControl: 74,
        garansiLabel: "Selama 5 (Lima) tahun",
        nextControlLabel: "Pengontrolan II (Terjadwal Aman)",
        alertLevel: "safe",
        status: "Garansi & Kontrol Aman",
    },
    {
        id: "4",
        noSurat: "GP/AR/PH/2026/01/0022",
        nama: "PT Bank Victoria International Tbk",
        telp: "0811-9988-776",
        alamat: "Jl. RS. Fatmawati Raya No. 39, Cilandak, Jakarta Selatan",
        startDate: "2026-04-28",
        expiry: "2029-04-28",
        nextControlDate: "2026-10-28",
        daysToExpiry: 918,
        daysToControl: 5,
        garansiLabel: "Selama 3 (Tiga) tahun",
        nextControlLabel: "Pengontrolan III (5 Hari Lagi)",
        alertLevel: "expiring",
        status: "Akan Habis / Segera Kontrol",
    },
];

export function KontrolRayapPage() {
    const { user, activeCompanyId } = useAuthStore();
    const companyId = (user?.role === "MASTER_SUPER_ADMIN" || user?.role === "SUPERADMIN")
        ? (activeCompanyId || user?.companyId)
        : user?.companyId;

    const [rows, setRows] = useState<KontrolRow[]>(FALLBACK_KONTROL);
    const [loading, setLoading] = useState(false);
    const [searchQ, setSearchQ] = useState("");
    const [page, setPage] = useState(1);
    const debouncedSearch = useDebouncedValue(searchQ, 300);
    const [statusFilter, setStatusFilter] = useState<"all" | "overdue" | "expiring" | "safe">("all");
    const [handlerTarget, setHandlerTarget] = useState<KontrolRow | null>(null);
    const [nextDateInput, setNextDateInput] = useState("");
    const [handlerNote, setHandlerNote] = useState("");
    const [savingHandler, setSavingHandler] = useState(false);

    const load = async () => {
        if (!companyId) return;
        setLoading(true);
        try {
            const quos = await getQuotations({ companyId, kategori: "AR" });
            const activeAr = quos.filter(q => q.status === "approved" || q.status === "deal" || q.status === "sent_to_client");
            if (activeAr.length > 0) {
                const nowMs = Date.now();
                const mapped: KontrolRow[] = activeAr.map((q: Quotation) => {
                    const gUnit = q.garansiUnit ?? "tahun";
                    const gNilai = q.garansiNilai ?? q.garansiTahun ?? 3;
                    const totalMonths = warrantyToTotalMonths(gNilai, gUnit) || 36;
                    const start = new Date(q.dealAt ?? q.approvedAt ?? q.tanggal);
                    const exp = new Date(start);
                    exp.setMonth(exp.getMonth() + totalMonths);

                    const nextCtrl = new Date(start);
                    nextCtrl.setMonth(nextCtrl.getMonth() + 6);

                    const daysToExpiry = Math.ceil((exp.getTime() - nowMs) / 86400000);
                    const daysToControl = Math.ceil((nextCtrl.getTime() - nowMs) / 86400000);

                    let alertLevel: WarrantyAlertLevel = "safe";
                    let status: KontrolRow["status"] = "Garansi & Kontrol Aman";
                    let nextControlLabel = `Kontrol Berikutnya (${daysToControl} hari lagi)`;

                    if (daysToExpiry < 0 || daysToControl < 0) {
                        alertLevel = "overdue";
                        status = "Terlewat / Habis";
                        const lateDays = Math.abs(Math.min(daysToExpiry, daysToControl));
                        nextControlLabel = `Terlewat ${lateDays} Hari (Wajib Tindak Lanjut)`;
                    } else if (daysToExpiry <= 60 || daysToControl <= 14) {
                        alertLevel = "expiring";
                        status = "Akan Habis / Segera Kontrol";
                        nextControlLabel = daysToControl <= 14
                            ? `Jadwal Kontrol ${daysToControl} Hari Lagi`
                            : `Garansi Habis ${daysToExpiry} Hari Lagi`;
                    }

                    return {
                        id: q.id,
                        noSurat: q.noSurat.replace(/-DRF\//g, "/").replace(/-APR\//g, "/"),
                        nama: q.kepadaNama,
                        telp: q.kepadaWa ?? "0817-0795-959",
                        alamat: q.lokasiPekerjaan ?? (q.kepadaAlamatLines ?? []).join(", "),
                        startDate: start.toISOString().slice(0, 10),
                        expiry: exp.toISOString().slice(0, 10),
                        nextControlDate: nextCtrl.toISOString().slice(0, 10),
                        daysToExpiry,
                        daysToControl,
                        garansiLabel: formatWarrantyDurationText(gNilai, gUnit),
                        nextControlLabel,
                        alertLevel,
                        status,
                    };
                });
                setRows([...mapped, ...FALLBACK_KONTROL.filter(f => !mapped.some(m => m.nama === f.nama))]);
            }
        } catch {
            // Gunakan fallback apabila offline
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, [companyId]);

    const { statsOverdue, statsExpiring, statsSafe } = useMemo(() => ({
        statsOverdue: rows.filter(r => r.alertLevel === "overdue").length,
        statsExpiring: rows.filter(r => r.alertLevel === "expiring").length,
        statsSafe: rows.filter(r => r.alertLevel === "safe").length,
    }), [rows]);

    const filtered = useMemo(() => {
        const q = debouncedSearch.trim().toLowerCase();
        return rows.filter(r => {
            if (statusFilter !== "all" && r.alertLevel !== statusFilter) return false;
            if (!q) return true;
            return r.nama.toLowerCase().includes(q) ||
                r.noSurat.toLowerCase().includes(q) ||
                r.alamat.toLowerCase().includes(q);
        });
    }, [rows, statusFilter, debouncedSearch]);
    const pagedRows = useMemo(() => filtered.slice((page - 1) * KONTROL_PAGE_SIZE, page * KONTROL_PAGE_SIZE), [filtered, page]);
    const totalPages = Math.max(1, Math.ceil(filtered.length / KONTROL_PAGE_SIZE));
    useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

    const openHandlerModal = (row: KontrolRow) => {
        const next6Mo = new Date();
        next6Mo.setMonth(next6Mo.getMonth() + 6);
        setHandlerTarget(row);
        setNextDateInput(next6Mo.toISOString().slice(0, 10));
        setHandlerNote(`Kontrol berkala telah dijadwalkan / diselesaikan untuk ${row.nama}`);
    };

    const handleResolveControl = async () => {
        if (!handlerTarget) return;
        setSavingHandler(true);
        try {
            if (companyId) {
                await supabase.from("customer_checklists").upsert({
                    id: `ctrl_${handlerTarget.id}_${Date.now()}`,
                    company_id: companyId,
                    payload: {
                        customerId: handlerTarget.id,
                        customerName: handlerTarget.nama,
                        noSurat: handlerTarget.noSurat,
                        nextControlDate: nextDateInput,
                        note: handlerNote,
                        handledBy: user?.name || "Admin",
                        handledAt: new Date().toISOString(),
                    },
                });
            }
            const nextDt = new Date(nextDateInput);
            const daysCtrl = Math.ceil((nextDt.getTime() - Date.now()) / 86400000);
            setRows(prev =>
                prev.map(r =>
                    r.id === handlerTarget.id
                        ? {
                              ...r,
                              nextControlDate: nextDateInput,
                              daysToControl: daysCtrl,
                              alertLevel: daysCtrl < 0 ? "overdue" : daysCtrl <= 14 ? "expiring" : "safe",
                              status: daysCtrl < 0 ? "Terlewat / Habis" : daysCtrl <= 14 ? "Akan Habis / Segera Kontrol" : "Garansi & Kontrol Aman",
                              nextControlLabel: `Terjadwal Ulang (${nextDateInput})`,
                              lastHandledNote: handlerNote,
                          }
                        : r
                )
            );
            setHandlerTarget(null);
        } finally {
            setSavingHandler(false);
        }
    };

    return (
        <div className="space-y-4">
            <PageHeader
                title="Monitoring Garansi & Color-Code Jadwal Kontrol"
                subtitle="Indikator warna otomatis: Merah (Terlewat / Habis), Kuning (Akan Habis / Segera Kontrol), dan Hijau (Aman), lengkap dengan tombol Handler Tindak Lanjut."
                icon={<ShieldCheck size={18} />}
                actions={
                    <button
                        onClick={load}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-white text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] cursor-pointer"
                    >
                        <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Segarkan
                    </button>
                }
            />

            {/* Banner Peringatan & Handler Terinformasi */}
            {(statsOverdue > 0 || statsExpiring > 0) && (
                <div className="p-4 rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 via-amber-50/70 to-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0">
                            <BellRing size={18} />
                        </div>
                        <div>
                            <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                                Peringatan Kontrol & Garansi Pelanggan!
                            </h3>
                            <p className="text-xs text-slate-700 mt-0.5">
                                Terdapat <strong className="text-red-700">{statsOverdue} pelanggan TERLEWAT jadwal kontrol / garansi habis (Merah)</strong> dan{" "}
                                <strong className="text-amber-800">{statsExpiring} pelanggan AKAN HABIS / jatuh tempo dekat (Kuning)</strong>. Klik tombol <strong>&ldquo;Tindak Lanjut&rdquo;</strong> pada baris terkait.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {statsOverdue > 0 && (
                            <button
                                onClick={() => { setStatusFilter("overdue"); setPage(1); }}
                                className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold"
                            >
                                Lihat {statsOverdue} Terlewat (Merah)
                            </button>
                        )}
                        {statsExpiring > 0 && (
                            <button
                                onClick={() => { setStatusFilter("expiring"); setPage(1); }}
                                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold"
                            >
                                Lihat {statsExpiring} Akan Habis (Kuning)
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* 4 Kartu Filter Color-Code */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <button
                    type="button"
                    onClick={() => { setStatusFilter("all"); setPage(1); }}
                    className={`clean-card p-3.5 text-left transition-all cursor-pointer ${statusFilter === "all" ? "ring-2 ring-[var(--accent)]" : "hover:border-slate-300"}`}
                >
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block">Semua Kontrak</span>
                    <div className="text-xl font-bold font-mono text-[var(--text-primary)] mt-0.5">{rows.length}</div>
                    <span className="text-[10px] text-[var(--text-secondary)]">Total pelanggan garansi</span>
                </button>

                <button
                    type="button"
                    onClick={() => { setStatusFilter("overdue"); setPage(1); }}
                    className={`clean-card p-3.5 text-left border-l-4 border-l-red-600 border-red-200 bg-red-50/40 transition-all cursor-pointer ${statusFilter === "overdue" ? "ring-2 ring-red-600" : "hover:border-red-300"}`}
                >
                    <span className="text-[10px] font-bold uppercase tracking-wider text-red-800 flex items-center gap-1">
                        <AlertTriangle size={12} /> Merah: Terlewat / Habis
                    </span>
                    <div className="text-xl font-bold font-mono text-red-700 mt-0.5">{statsOverdue}</div>
                    <span className="text-[10px] text-red-700">Wajib segera ditindaklanjuti</span>
                </button>

                <button
                    type="button"
                    onClick={() => { setStatusFilter("expiring"); setPage(1); }}
                    className={`clean-card p-3.5 text-left border-l-4 border-l-amber-500 border-amber-200 bg-amber-50/40 transition-all cursor-pointer ${statusFilter === "expiring" ? "ring-2 ring-amber-500" : "hover:border-amber-300"}`}
                >
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1">
                        <CalendarClock size={12} /> Kuning: Akan Habis / H-14
                    </span>
                    <div className="text-xl font-bold font-mono text-amber-800 mt-0.5">{statsExpiring}</div>
                    <span className="text-[10px] text-amber-800">Segera jadwalkan kunjungan</span>
                </button>

                <button
                    type="button"
                    onClick={() => { setStatusFilter("safe"); setPage(1); }}
                    className={`clean-card p-3.5 text-left border-l-4 border-l-emerald-600 border-emerald-200 bg-emerald-50/35 transition-all cursor-pointer ${statusFilter === "safe" ? "ring-2 ring-emerald-600" : "hover:border-emerald-300"}`}
                >
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                        <CheckCircle2 size={12} /> Hijau: Aktif & Aman
                    </span>
                    <div className="text-xl font-bold font-mono text-emerald-800 mt-0.5">{statsSafe}</div>
                    <span className="text-[10px] text-emerald-700">Dalam masa garansi & terkontrol</span>
                </button>
            </div>

            {/* Search & Filter Bar */}
            <div className="clean-card p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                        value={searchQ}
                        onChange={e => { setSearchQ(e.target.value); setPage(1); }}
                        placeholder="Cari nama pelanggan, nomor surat resmi, atau alamat lokasi..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] focus:bg-white focus:outline-none focus:border-[var(--accent)]"
                    />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                    {([
                        { id: "all", label: "Semua" },
                        { id: "overdue", label: "Merah (Terlewat)" },
                        { id: "expiring", label: "Kuning (Akan Habis)" },
                        { id: "safe", label: "Hijau (Aman)" },
                    ] as const).map(f => (
                        <button
                            key={f.id}
                            type="button"
                            onClick={() => { setStatusFilter(f.id); setPage(1); }}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                                statusFilter === f.id
                                    ? "bg-[var(--accent)] text-white"
                                    : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-slate-200"
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="clean-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs min-w-[880px]">
                        <thead className="bg-[var(--bg-tertiary)] border-b border-[var(--border-subtle)] text-[10.5px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                            <tr>
                                <th className="py-2.5 px-3.5">Indikator & Nomor Surat</th>
                                <th className="py-2.5 px-3.5">Pelanggan &amp; Kontak</th>
                                <th className="py-2.5 px-3.5">Lokasi Objek</th>
                                <th className="py-2.5 px-3.5">Durasi Garansi</th>
                                <th className="py-2.5 px-3.5">Masa Berlaku</th>
                                <th className="py-2.5 px-3.5">Status Kontrol</th>
                                <th className="py-2.5 px-3.5 text-right">Handler &amp; Tindak Lanjut</th>
                            </tr>
                        </thead>
                        <tbody key={page} className="divide-y divide-[var(--border-subtle)] result-enter">
                            {filtered.length === 0 && (
                                <tr><td colSpan={7} className="p-8 text-center text-[var(--text-muted)]">Tidak ada data pelanggan yang sesuai dengan pencarian atau filter.</td></tr>
                            )}
                            {pagedRows.map(row => {
                                const waNumber = row.telp.replace(/^0/, "62").replace(/\D/g, "");
                                const waText = encodeURIComponent(
                                    row.alertLevel === "overdue"
                                        ? `Halo Bapak/Ibu ${row.nama},\n\nKami dari PT Guci Emas Pratama menginformasikan bahwa jadwal kontrol / masa garansi Anti Rayap (${row.noSurat}) di ${row.alamat} telah melewati tanggal terjadwal. Kami siap menjadwalkan kunjungan pemeriksaan minggu ini. Mohon konfirmasi hari yang sesuai.`
                                        : row.alertLevel === "expiring"
                                        ? `Halo Bapak/Ibu ${row.nama},\n\nPengingat jadwal pengontrolan berkala / masa akhir garansi Anti Rayap (${row.noSurat}) di ${row.alamat} pada tanggal ${row.nextControlDate}. Mohon konfirmasi jadwal kunjungan tim kami.`
                                        : `Halo Bapak/Ibu ${row.nama},\n\nKami dari PT Guci Emas Pratama menginformasikan jadwal ${row.nextControlLabel} untuk perlindungan Anti Rayap (${row.noSurat}) di ${row.alamat}.`
                                );

                                const rowColorCls =
                                    row.alertLevel === "overdue"
                                        ? "border-l-4 border-l-red-600 bg-red-50/35 hover:bg-red-50/60"
                                        : row.alertLevel === "expiring"
                                        ? "border-l-4 border-l-amber-500 bg-amber-50/35 hover:bg-amber-50/60"
                                        : "border-l-4 border-l-emerald-500 hover:bg-[var(--bg-tertiary)]/50";

                                const badgeCls =
                                    row.alertLevel === "overdue"
                                        ? "bg-red-600 text-white"
                                        : row.alertLevel === "expiring"
                                        ? "bg-amber-500 text-white"
                                        : "bg-emerald-100 text-emerald-800 border border-emerald-300";

                                return (
                                    <tr key={row.id} className={`transition-colors ${rowColorCls}`}>
                                        <td className="py-3 px-3.5 whitespace-nowrap">
                                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold mb-1 ${badgeCls}`}>
                                                {row.alertLevel === "overdue" ? "MERAH • TERLEWAT" : row.alertLevel === "expiring" ? "KUNING • AKAN HABIS" : "HIJAU • AMAN"}
                                            </span>
                                            <div className="font-mono font-bold text-[var(--text-primary)]">{row.noSurat}</div>
                                        </td>
                                        <td className="py-3 px-3.5">
                                            <p className="font-bold text-[var(--text-primary)]">{row.nama}</p>
                                            <p className="text-[10.5px] text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                                                <Users size={11} /> {row.telp}
                                            </p>
                                        </td>
                                        <td className="py-3 px-3.5 text-[var(--text-secondary)] max-w-[200px] truncate" title={row.alamat}>
                                            {row.alamat}
                                        </td>
                                        <td className="py-3 px-3.5 whitespace-nowrap">
                                            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-white text-slate-800 border border-slate-200">
                                                {row.garansiLabel}
                                            </span>
                                        </td>
                                        <td className="py-3 px-3.5 whitespace-nowrap font-mono text-[11px] text-[var(--text-secondary)]">
                                            <div>Mulai: {row.startDate}</div>
                                            <div>Habis: <strong>{row.expiry}</strong></div>
                                        </td>
                                        <td className="py-3 px-3.5">
                                            <div className="font-semibold text-[var(--text-primary)] flex items-center gap-1">
                                                <CalendarClock size={12} className={row.alertLevel === "overdue" ? "text-red-600" : row.alertLevel === "expiring" ? "text-amber-600" : "text-emerald-600"} />
                                                {row.nextControlLabel}
                                            </div>
                                            <div className="text-[10.5px] text-[var(--text-muted)] font-mono">
                                                Jadwal Kontrol: {row.nextControlDate}
                                            </div>
                                            {row.lastHandledNote && (
                                                <div className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                                                    ✓ {row.lastHandledNote}
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-3 px-3.5 text-right whitespace-nowrap">
                                            <div className="inline-flex items-center gap-1.5 justify-end">
                                                <button
                                                    type="button"
                                                    onClick={() => openHandlerModal(row)}
                                                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold shadow-2xs cursor-pointer ${
                                                        row.alertLevel === "overdue"
                                                            ? "bg-red-600 hover:bg-red-700 text-white"
                                                            : row.alertLevel === "expiring"
                                                            ? "bg-amber-500 hover:bg-amber-600 text-white"
                                                            : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200"
                                                    }`}
                                                >
                                                    <Wrench size={12} /> Tindak Lanjut
                                                </button>
                                                {waNumber && (
                                                    <a
                                                        href={`https://wa.me/${waNumber}?text=${waText}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-bold transition-colors"
                                                        title="Kirim Pengingat WA"
                                                    >
                                                        <MessageCircle size={12} /> WA
                                                    </a>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <Pagination page={page} pageSize={KONTROL_PAGE_SIZE} totalItems={filtered.length}
                    onPageChange={setPage} itemLabel="pelanggan" />
            </div>

            {/* Modal Handler Tindak Lanjut Kontrol / Garansi */}
            {handlerTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
                    <div className="clean-card max-w-md w-full p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                                <CalendarCheck size={17} className="text-[var(--accent)]" />
                                Handler Tindak Lanjut Garansi & Kontrol
                            </h3>
                            <button onClick={() => setHandlerTarget(null)} className="text-slate-400 hover:text-slate-600">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                            <div>Pelanggan: <strong>{handlerTarget.nama}</strong></div>
                            <div>No. Surat: <span className="font-mono font-bold">{handlerTarget.noSurat}</span></div>
                            <div>Status Saat Ini: <strong>{handlerTarget.status}</strong></div>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="block font-bold text-[var(--text-secondary)] mb-1">
                                    Jadwal Kontrol Berikutnya (Setelah Ditindaklanjuti) *
                                </label>
                                <input
                                    type="date"
                                    value={nextDateInput}
                                    onChange={e => setNextDateInput(e.target.value)}
                                    className="w-full px-3 py-2 border border-[var(--border-subtle)] rounded-xl font-mono"
                                />
                            </div>
                            <div>
                                <label className="block font-bold text-[var(--text-secondary)] mb-1">
                                    Catatan Tindakan / Hasil Kontrol *
                                </label>
                                <textarea
                                    rows={3}
                                    value={handlerNote}
                                    onChange={e => setHandlerNote(e.target.value)}
                                    className="w-full px-3 py-2 border border-[var(--border-subtle)] rounded-xl"
                                    placeholder="Contoh: Sudah dihubungi & dijadwalkan kunjungan teknisi / Kontrol selesai dilaksanakan..."
                                />
                            </div>
                        </div>

                        <div className="flex gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => setHandlerTarget(null)}
                                className="flex-1 py-2.5 rounded-xl bg-[var(--bg-tertiary)] text-xs font-semibold text-[var(--text-secondary)]"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleResolveControl}
                                disabled={savingHandler}
                                className="flex-1 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold"
                            >
                                {savingHandler ? "Menyimpan..." : "Simpan & Tandai Ter-Handle"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
