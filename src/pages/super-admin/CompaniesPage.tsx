import React, { useState, useEffect } from "react";
import {
    Building2, Plus, RefreshCw, AlertCircle, Loader2,
    Crown, Lock, Unlock, KeyRound, Copy, Check, Trash2, Link2, ShieldCheck,
} from "lucide-react";
import {
    getCompanies, setCompanyStatus, createCompany,
} from '@/shared/api/companyService';
import { getUsersByCompany, setUserActive } from '@/shared/api/userService';
import { generateInvite } from '@/shared/api/auth';
import { getInvitesByCompany, revokeInvite, type Invite } from '@/shared/api/inviteService';
import { useAuthStore } from '@/app/store/authStore';
import type { Company, AppUser } from '@/entities/types';

export function CompaniesPage() {
    const { user } = useAuthStore();
    const [companies, setCompanies] = useState<Company[]>([]);
    const [superadminsByCompany, setSuperadminsByCompany] = useState<Record<string, AppUser[]>>({});
    const [invitesByCompany, setInvitesByCompany] = useState<Record<string, Invite[]>>({});
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [showAdd, setShowAdd] = useState(false);
    const [newName, setNewName] = useState("");
    const [newPlan, setNewPlan] = useState<"free" | "pro">("pro");
    const [error, setError] = useState("");
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const copyText = (text: string, key: string) => {
        navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(prev => (prev === key ? null : prev)), 2000);
    };

    const load = async () => {
        setLoading(true);
        setError("");
        try {
            const list = await getCompanies();
            setCompanies(list);
            const superMap: Record<string, AppUser[]> = {};
            const invMap: Record<string, Invite[]> = {};
            await Promise.all(
                list.map(async c => {
                    try {
                        const [users, invites] = await Promise.all([
                            getUsersByCompany(c.id, "SUPERADMIN"),
                            getInvitesByCompany(c.id, "SUPERADMIN"),
                        ]);
                        superMap[c.id] = users.filter(u => u.role === "SUPERADMIN");
                        invMap[c.id] = invites;
                    } catch {
                        superMap[c.id] = [];
                        invMap[c.id] = [];
                    }
                })
            );
            setSuperadminsByCompany(superMap);
            setInvitesByCompany(invMap);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memuat daftar perusahaan SaaS.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    const handleChangeCompanyStatus = async (companyId: string, status: "ACTIVE" | "TRIAL" | "SUSPENDED" | "EXPIRED") => {
        const impactMsg = status === "SUSPENDED"
            ? "Menangguhkan (SUSPEND) perusahaan ini akan membatasi akses seluruh pengguna tenant terkait. Lanjutkan?"
            : `Ubah status perusahaan tenant menjadi ${status}?`;
        if (!window.confirm(impactMsg)) return;
        setBusyId(companyId);
        try {
            await setCompanyStatus(companyId, status);
            await load();
        } catch (e) {
            alert(e instanceof Error ? e.message : "Gagal mengubah status perusahaan.");
        } finally {
            setBusyId(null);
        }
    };

    const handleToggleSuperadminUser = async (u: AppUser) => {
        if (u.role !== "SUPERADMIN") return;
        setBusyId(u.uid);
        try {
            await setUserActive(u.uid, !u.isActive);
            await load();
        } catch (e) {
            alert(e instanceof Error ? e.message : "Gagal mengubah status akun Superadmin.");
        } finally {
            setBusyId(null);
        }
    };

    const handleGenerateSuperadminToken = async (company: Company) => {
        if (!user) return;
        setBusyId(`invite-${company.id}`);
        try {
            await generateInvite("SUPERADMIN", {
                companyId: company.id,
                createdBy: user.uid,
            });
            const updatedInvites = await getInvitesByCompany(company.id, "SUPERADMIN");
            setInvitesByCompany(prev => ({ ...prev, [company.id]: updatedInvites }));
        } catch (e) {
            alert(e instanceof Error ? e.message : "Gagal membuat token undangan Superadmin.");
        } finally {
            setBusyId(null);
        }
    };

    const handleRevokeToken = async (companyId: string, token: string) => {
        setBusyId(`revoke-${token}`);
        try {
            await revokeInvite(token);
            const updatedInvites = await getInvitesByCompany(companyId, "SUPERADMIN");
            setInvitesByCompany(prev => ({ ...prev, [companyId]: updatedInvites }));
        } catch (e) {
            alert(e instanceof Error ? e.message : "Gagal mencabut token undangan.");
        } finally {
            setBusyId(null);
        }
    };

    const handleCreateTenant = async () => {
        if (!newName.trim()) return;
        setBusyId("create");
        try {
            await createCompany({ name: newName.trim(), plan: newPlan, status: "ACTIVE" });
            setNewName("");
            setShowAdd(false);
            await load();
        } catch (e) {
            alert(e instanceof Error ? e.message : "Gagal membuat tenant perusahaan.");
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="space-y-5">
            <div className="clean-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-emerald-200 bg-gradient-to-r from-emerald-50/70 via-white to-amber-50/40">
                <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-[var(--accent)] text-white flex items-center justify-center shrink-0 shadow-xs">
                        <Crown size={22} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)]">
                                Konsol SaaS — Kelola Perusahaan &amp; Token Undangan Superadmin
                            </h1>
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#1A5C38] text-white">
                                KONTEKS PLATFORM SAAS • ISOLASI MULTI-TENANT
                            </span>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                            Kelola status langganan Perusahaan Tenant (Active, Trial, Suspend), terbitkan Token Undangan khusus akun Superadmin perusahaan terkait, dan kelola status aktif Superadmin masing-masing perusahaan.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={load}
                        className="p-2 rounded-xl border border-[var(--border-subtle)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] cursor-pointer"
                        title="Segarkan Data Perusahaan"
                    >
                        <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                    </button>
                    <button
                        onClick={() => setShowAdd(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold shadow-xs cursor-pointer"
                    >
                        <Plus size={14} /> Tambah Perusahaan SaaS
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                    <AlertCircle size={15} /> {error}
                </div>
            )}

            {loading ? (
                <div className="py-16 text-center text-sm text-[var(--text-muted)] flex items-center justify-center gap-2">
                    <Loader2 size={18} className="animate-spin text-[var(--accent)]" /> Memuat daftar perusahaan tenant SaaS...
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {companies.map(c => {
                        const superadmins = superadminsByCompany[c.id] || [];
                        const invites = invitesByCompany[c.id] || [];
                        const st = c.status || (c.isActive ? "ACTIVE" : "SUSPENDED");
                        const origin = typeof window !== "undefined" ? window.location.origin : "";

                        return (
                            <div
                                key={c.id}
                                className={`clean-card p-4 sm:p-5 space-y-4 border-l-4 ${
                                    st === "SUSPENDED"
                                        ? "border-l-red-600 bg-red-50/20"
                                        : st === "TRIAL"
                                        ? "border-l-amber-500"
                                        : "border-l-emerald-600"
                                }`}
                            >
                                {/* Baris Header Perusahaan & Kontrol Status Langganan */}
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Building2 size={18} className="text-[var(--accent)]" />
                                            <h2 className="text-base font-bold text-[var(--text-primary)]">{c.name}</h2>
                                            <span className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ${
                                                st === "ACTIVE"
                                                    ? "bg-emerald-100 text-emerald-800"
                                                    : st === "TRIAL"
                                                    ? "bg-amber-100 text-amber-800"
                                                    : "bg-red-600 text-white"
                                            }`}>
                                                {st === "ACTIVE" ? "ACTIVE (Aktif)" : st === "TRIAL" ? "TRIAL (Masa Uji)" : "SUSPENDED (Ditangguhkan)"}
                                            </span>
                                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                                PLAN: {c.plan.toUpperCase()}
                                            </span>
                                        </div>
                                        <p className="text-xs text-[var(--text-muted)] font-mono mt-1">
                                            Company ID: {c.id} • Akun Superadmin Terdaftar: {superadmins.length}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2 flex-wrap">
                                        <button
                                            type="button"
                                            disabled={busyId === `invite-${c.id}`}
                                            onClick={() => handleGenerateSuperadminToken(c)}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                                        >
                                            <KeyRound size={13} />
                                            {busyId === `invite-${c.id}` ? "Membuat Token..." : "Buat Token Undangan Superadmin"}
                                        </button>

                                        {st !== "ACTIVE" && (
                                            <button
                                                type="button"
                                                disabled={busyId === c.id}
                                                onClick={() => handleChangeCompanyStatus(c.id, "ACTIVE")}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                                            >
                                                <Unlock size={13} /> Aktifkan Perusahaan
                                            </button>
                                        )}

                                        {st !== "TRIAL" && st !== "SUSPENDED" && (
                                            <button
                                                type="button"
                                                disabled={busyId === c.id}
                                                onClick={() => handleChangeCompanyStatus(c.id, "TRIAL")}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold cursor-pointer"
                                            >
                                                Set Trial
                                            </button>
                                        )}

                                        {st !== "SUSPENDED" && (
                                            <button
                                                type="button"
                                                disabled={busyId === c.id}
                                                onClick={() => handleChangeCompanyStatus(c.id, "SUSPENDED")}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
                                            >
                                                <Lock size={13} /> Suspend Perusahaan
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Bagian 1: Daftar Token Undangan Superadmin (Via Token / Link) */}
                                <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                                            <KeyRound size={13} className="text-[var(--accent)]" /> Token Undangan Akun Superadmin ({invites.length})
                                        </span>
                                        <span className="text-[10.5px] text-[var(--text-muted)]">
                                            Berlaku 7 hari • Sekali pakai untuk registrasi Direktur / Superadmin Perusahaan
                                        </span>
                                    </div>

                                    {invites.length === 0 ? (
                                        <div className="p-3 rounded-xl bg-[#faf9f7] border border-dashed border-[#e8e5e0] text-xs text-[var(--text-muted)]">
                                            Belum ada token undangan Superadmin untuk perusahaan ini. Klik <b>&ldquo;Buat Token Undangan Superadmin&rdquo;</b> di kanan atas kartu perusahaan untuk menerbitkan token baru.
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                            {invites.map(inv => {
                                                const isExpired = inv.expiresAt.getTime() <= Date.now();
                                                const signupUrl = `${origin}/signup?invite=${inv.id}`;
                                                return (
                                                    <div
                                                        key={inv.id}
                                                        className={`p-3 rounded-xl border text-xs space-y-2 ${
                                                            inv.used
                                                                ? "bg-slate-50 border-slate-200 opacity-75"
                                                                : isExpired
                                                                ? "bg-rose-50/40 border-rose-200"
                                                                : "bg-emerald-50/40 border-emerald-200"
                                                        }`}
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-slate-900 text-white">
                                                                    ROLE: SUPERADMIN
                                                                </span>
                                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                                    inv.used
                                                                        ? "bg-slate-200 text-slate-700"
                                                                        : isExpired
                                                                        ? "bg-rose-100 text-rose-700"
                                                                        : "bg-emerald-100 text-emerald-800"
                                                                }`}>
                                                                    {inv.used ? "Sudah Digunakan" : isExpired ? "Kedaluwarsa" : "Aktif (Siap Pakai)"}
                                                                </span>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                disabled={busyId === `revoke-${inv.id}`}
                                                                onClick={() => handleRevokeToken(c.id, inv.id)}
                                                                title="Hapus / Cabut Token Undangan"
                                                                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>

                                                        <div className="space-y-1">
                                                            <div className="text-[10px] font-semibold text-[var(--text-muted)]">
                                                                Kode Token Undangan:
                                                            </div>
                                                            <div className="flex items-center gap-1.5">
                                                                <code className="flex-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 font-mono text-[11px] font-bold text-slate-800 truncate">
                                                                    {inv.id}
                                                                </code>
                                                                {!inv.used && !isExpired && (
                                                                    <>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => copyText(inv.id, `tok-${inv.id}`)}
                                                                            className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-[10.5px] inline-flex items-center gap-1 shrink-0 cursor-pointer"
                                                                            title="Salin Kode Token"
                                                                        >
                                                                            {copiedKey === `tok-${inv.id}` ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                                                                            Token
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => copyText(signupUrl, `url-${inv.id}`)}
                                                                            className="px-2.5 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold text-[10.5px] inline-flex items-center gap-1 shrink-0 cursor-pointer"
                                                                            title="Salin Link Pendaftaran Undangan"
                                                                        >
                                                                            {copiedKey === `url-${inv.id}` ? <Check size={12} /> : <Link2 size={12} />}
                                                                            Salin Link
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="text-[10px] text-[var(--text-muted)] flex items-center justify-between">
                                                            <span>Kedaluwarsa: {inv.expiresAt.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</span>
                                                            {!inv.used && !isExpired && (
                                                                <span className="font-mono text-emerald-700 truncate max-w-[180px]" title={signupUrl}>
                                                                    /signup?invite={inv.id.slice(0, 8)}...
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Bagian 2: Daftar Akun SUPERADMIN Terkait Perusahaan Ini */}
                                <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                                        <ShieldCheck size={13} className="text-[var(--accent)]" /> Akun Superadmin Terkait ({superadmins.length})
                                    </span>
                                    {superadmins.length === 0 ? (
                                        <div className="p-3 rounded-xl bg-[#faf9f7] border border-[#e8e5e0] text-xs text-[var(--text-muted)]">
                                            Belum ada akun <b>SUPERADMIN</b> yang terdaftar di perusahaan ini. Bagikan Token / Link Undangan di atas kepada Direktur/Owner perusahaan untuk mendaftar.
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                            {superadmins.map(u => (
                                                <div
                                                    key={u.uid}
                                                    className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                                                        u.isActive ? "bg-white border-slate-200" : "bg-red-50/50 border-red-200"
                                                    }`}
                                                >
                                                    <div className="min-w-0">
                                                        <div className="font-bold text-[var(--text-primary)] truncate">{u.name}</div>
                                                        <div className="text-[10.5px] font-mono text-[var(--text-muted)] truncate">{u.email}</div>
                                                        <div className="flex items-center gap-1.5 mt-1">
                                                            <span className="px-1.5 py-0.2 rounded bg-emerald-900 text-white font-mono text-[9.5px] font-bold">
                                                                SUPERADMIN
                                                            </span>
                                                            <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold ${
                                                                u.isActive ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"
                                                            }`}>
                                                                {u.isActive ? "Aktif" : "Suspended"}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        disabled={busyId === u.uid}
                                                        onClick={() => handleToggleSuperadminUser(u)}
                                                        className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold shrink-0 cursor-pointer ${
                                                            u.isActive
                                                                ? "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                                                                : "bg-emerald-600 text-white hover:bg-emerald-700"
                                                        }`}
                                                    >
                                                        {u.isActive ? "Suspend" : "Aktifkan"}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {showAdd && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
                    <div className="clean-card max-w-md w-full p-6 space-y-4">
                        <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                            <Building2 size={18} className="text-[var(--accent)]" /> Tambah Perusahaan Tenant SaaS Baru
                        </h3>
                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="block font-bold text-[var(--text-secondary)] mb-1">Nama Perusahaan Tenant *</label>
                                <input
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    placeholder="Contoh: PT Mitra Pestindo Nusantara"
                                    className="w-full px-3 py-2 border border-[var(--border-subtle)] rounded-xl text-sm"
                                />
                            </div>
                            <div>
                                <label className="block font-bold text-[var(--text-secondary)] mb-1">Paket Langganan SaaS</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {(["pro", "free"] as const).map(p => (
                                        <button
                                            key={p}
                                            type="button"
                                            onClick={() => setNewPlan(p)}
                                            className={`py-2 rounded-xl border font-bold uppercase cursor-pointer ${
                                                newPlan === p
                                                    ? "border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent)]"
                                                    : "border-slate-200 bg-white text-slate-600"
                                            }`}
                                        >
                                            {p === "pro" ? "PRO Enterprise" : "Basic / Trial"}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowAdd(false)}
                                className="flex-1 py-2.5 rounded-xl bg-[var(--bg-tertiary)] text-xs font-semibold text-[var(--text-secondary)] cursor-pointer"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                disabled={!newName.trim() || busyId === "create"}
                                onClick={handleCreateTenant}
                                className="flex-1 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
                            >
                                {busyId === "create" ? "Menyimpan..." : "Simpan Tenant"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
