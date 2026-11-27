import { useState, useEffect } from "react";
import {
    Users, UserPlus, RefreshCw, Loader2,
    CheckCircle2, XCircle, Copy, Check, AlertCircle,
} from "lucide-react";
import { useAuthStore } from '@/app/store/authStore';
import { getUsersByCompany, setUserActive, countActiveUsers, MAX_USERS_PER_COMPANY } from '@/shared/api/userService';
import { createInvite } from '@/shared/api/inviteService';
import type { AppUser, UserRole } from '@/entities/types';

const ROLE_LABELS: Record<string, string> = {
    marketing: "Marketing",
    admin_ops: "Admin Operasional",
    teknisi: "Teknisi",
};
const ROLE_COLORS: Record<string, string> = {
    administrator: "bg-indigo-100 text-indigo-700",
    marketing: "bg-blue-100 text-blue-700",
    admin_ops: "bg-amber-100 text-amber-700",
    teknisi: "bg-emerald-100 text-emerald-700",
};
const ALL_ROLE_LABELS: Record<string, string> = {
    ...ROLE_LABELS,
    administrator: "Administrator",
};

// ─── INVITE MODAL ─────────────────────────────────────────────────────────────

function InviteModal({
    companyId, companyName, createdBy,
    onClose,
}: {
    companyId: string;
    companyName: string;
    createdBy: string;
    onClose: () => void;
}) {
    const [role, setRole] = useState<"MARKETING" | "ADMIN" | "TEKNISI_LAPANGAN">("MARKETING");
    const [generating, setGenerating] = useState(false);
    const [link, setLink] = useState("");
    const [copied, setCopied] = useState(false);

    const handleGenerate = async () => {
        setGenerating(true);
        try {
            const token = await createInvite({ companyId, companyName, role, createdBy });
            setLink(`${window.location.origin}/signup?invite=${token}`);
        } finally {
            setGenerating(false);
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl p-6">
                <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <UserPlus size={18} className="text-blue-600" /> Undang Anggota Tim
                </h3>

                {!link ? (
                    <>
                        <div className="mb-4">
                            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                                Role
                            </label>
                            <div className="space-y-2">
                                {(["MARKETING", "ADMIN", "TEKNISI_LAPANGAN"] as const).map(r => (
                                    <button key={r} type="button" onClick={() => setRole(r)}
                                        className={`w-full flex items-center gap-3 px-4 py-3 border rounded-xl text-left transition-all
                                            ${role === r ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                                        <span className={`w-2 h-2 rounded-full ${role === r ? "bg-blue-500" : "bg-slate-300"}`} />
                                        <div>
                                            <div className={`text-sm font-semibold ${role === r ? "text-blue-700" : "text-slate-700"}`}>
                                                {ROLE_LABELS[r]}
                                            </div>
                                            <div className="text-xs text-slate-400">
                                                {r === "MARKETING" && "Buat & kelola quotation"}
                                                {r === "ADMIN" && "Lihat quotation & laporan"}
                                                {r === "TEKNISI_LAPANGAN" && "Laporan pekerjaan lapangan"}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={onClose}
                                className="flex-1 py-2.5 rounded-lg bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200">
                                Batal
                            </button>
                            <button onClick={handleGenerate} disabled={generating}
                                className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                                {generating && <Loader2 size={13} className="animate-spin" />}
                                {generating ? "Membuat..." : "Buat Link Undangan"}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4">
                            <p className="text-xs font-semibold text-emerald-700 mb-2">
                                ✅ Link undangan sebagai {ROLE_LABELS[role]} siap!
                            </p>
                            <p className="text-xs text-slate-500 font-mono break-all">{link}</p>
                        </div>
                        <p className="text-xs text-slate-400 mb-4">
                            Link berlaku <strong>7 hari</strong>. Kirim ke calon anggota tim secara manual (WhatsApp, email, dll).
                        </p>
                        <div className="flex gap-2">
                            <button onClick={handleCopy}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors
                                    ${copied ? "bg-emerald-600 text-white" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
                                {copied ? <><Check size={14} /> Tersalin!</> : <><Copy size={14} /> Salin Link</>}
                            </button>
                            <button onClick={onClose}
                                className="px-4 py-2.5 rounded-lg bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200">
                                Selesai
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ─── CONFIRM DEACTIVATE MODAL ─────────────────────────────────────────────────

function ConfirmToggleModal({
    target, onClose, onConfirm,
}: { target: AppUser | null; onClose: () => void; onConfirm: () => void }) {
    if (!target) return null;
    const willActivate = !target.isActive;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4
                    ${willActivate ? "bg-emerald-100" : "bg-red-100"}`}>
                    {willActivate ? <CheckCircle2 size={24} className="text-emerald-600" /> : <XCircle size={24} className="text-red-600" />}
                </div>
                <h3 className="font-bold text-slate-900 mb-2">
                    {willActivate ? "Aktifkan" : "Nonaktifkan"} {target.name}?
                </h3>
                <p className="text-sm text-slate-500 mb-6">
                    {willActivate
                        ? "User ini akan bisa login kembali."
                        : "User ini tidak akan bisa login."}
                </p>
                <div className="flex gap-2">
                    <button onClick={onClose}
                        className="flex-1 py-2 text-sm rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 font-medium">
                        Batal
                    </button>
                    <button onClick={onConfirm}
                        className={`flex-1 py-2 text-sm rounded-lg text-white font-semibold
                            ${willActivate ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}>
                        {willActivate ? "Aktifkan" : "Nonaktifkan"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

const INVITE_ROLES: UserRole[] = ["MARKETING", "ADMIN", "TEKNISI_LAPANGAN"];

export function TeamPage() {
    const { user } = useAuthStore();
    const [members, setMembers] = useState<AppUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeCount, setActiveCount] = useState(0);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [toggleTarget, setToggleTarget] = useState<AppUser | null>(null);
    const [toggling, setToggling] = useState<string | null>(null);

    const load = async () => {
        if (!user?.companyId) return;
        setLoading(true);
        try {
            const [list, count] = await Promise.all([
                getUsersByCompany(user.companyId),
                countActiveUsers(user.companyId),
            ]);
            // Sort: administrator first, then by name
            list.sort((a, b) => {
                if (a.role === "ADMIN") return -1;
                if (b.role === "ADMIN") return 1;
                return a.name.localeCompare(b.name);
            });
            setMembers(list);
            setActiveCount(count);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [user?.companyId]);

    const canInvite = INVITE_ROLES.includes(user?.role as UserRole)
        ? false
        : activeCount < MAX_USERS_PER_COMPANY;

    const handleToggle = async () => {
        if (!toggleTarget) return;
        setToggling(toggleTarget.uid);
        setToggleTarget(null);
        try {
            await setUserActive(toggleTarget.uid, !toggleTarget.isActive);
            await load();
        } finally {
            setToggling(null);
        }
    };

    const slotUsed = activeCount;
    const slotMax = MAX_USERS_PER_COMPANY;
    const slotPct = Math.min((slotUsed / slotMax) * 100, 100);

    return (
        <div className="p-4 md:p-6 max-w-screen-lg mx-auto space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <Users size={20} className="text-blue-600" />
                        Manajemen Tim
                    </h1>
                    <p className="text-sm text-slate-400 mt-0.5">Kelola anggota tim perusahaan kamu</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={load}
                        className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                        <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                    </button>
                    <button
                        onClick={() => setInviteOpen(true)}
                        disabled={!canInvite}
                        title={!canInvite ? `Slot penuh (${slotMax} user)` : "Undang anggota baru"}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                        <UserPlus size={16} />
                        Undang Anggota
                    </button>
                </div>
            </div>

            {/* Slot usage */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-slate-700">Slot Pengguna Aktif</span>
                    <span className={`text-sm font-bold ${slotUsed >= slotMax ? "text-red-600" : "text-slate-900"}`}>
                        {slotUsed} / {slotMax}
                    </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                    <div
                        className={`h-2 rounded-full transition-all ${slotUsed >= slotMax ? "bg-red-500" : "bg-blue-500"}`}
                        style={{ width: `${slotPct}%` }}
                    />
                </div>
                {slotUsed >= slotMax && (
                    <p className="text-xs text-red-600 flex items-center gap-1 mt-2">
                        <AlertCircle size={11} />
                        Slot penuh. Nonaktifkan salah satu user untuk mengundang anggota baru.
                    </p>
                )}
            </div>

            {/* Table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-12 text-slate-400">
                        <Loader2 size={20} className="animate-spin mr-2" /> Memuat tim...
                    </div>
                ) : members.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                        <Users size={32} className="mx-auto mb-3 opacity-30" />
                        <p className="text-sm">Belum ada anggota tim.</p>
                    </div>
                ) : (
                    <>
                    {/* Desktop table */}
                    <div className="hidden md:block overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr>
                                {["Anggota", "Role", "WA", "Status", "Aksi"].map(h => (
                                    <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-400 border-b border-slate-100 bg-slate-50 whitespace-nowrap">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {members.map(m => (
                                <tr key={m.uid} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-3">
                                        <div className="text-sm font-semibold text-slate-900">{m.name}</div>
                                        <div className="text-xs text-slate-400">{m.email}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${ROLE_COLORS[m.role] ?? "bg-slate-100 text-slate-500"}`}>
                                            {ALL_ROLE_LABELS[m.role] ?? m.role}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-slate-500">
                                        {m.wa || <span className="text-slate-300">—</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold
                                            ${m.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${m.isActive ? "bg-emerald-500" : "bg-red-500"}`} />
                                            {m.isActive ? "Aktif" : "Nonaktif"}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        {/* Cannot deactivate yourself or administrator */}
                                        {m.uid !== user?.uid && m.role !== "ADMIN" ? (
                                            <button
                                                onClick={() => setToggleTarget(m)}
                                                disabled={toggling === m.uid}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                                                    ${m.isActive
                                                        ? "bg-red-50 text-red-600 hover:bg-red-100"
                                                        : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}
                                                    disabled:opacity-40`}>
                                                {toggling === m.uid
                                                    ? <Loader2 size={11} className="animate-spin" />
                                                    : m.isActive ? <XCircle size={11} /> : <CheckCircle2 size={11} />}
                                                {m.isActive ? "Nonaktifkan" : "Aktifkan"}
                                            </button>
                                        ) : (
                                            <span className="text-xs text-slate-300">
                                                {m.uid === user?.uid ? "Kamu" : "—"}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="md:hidden divide-y divide-slate-100">
                        {members.map(m => (
                            <div key={m.uid} className="p-4 flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                                    {m.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-slate-900 truncate">{m.name}</p>
                                    <p className="text-xs text-slate-400 truncate">{m.email}</p>
                                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${ROLE_COLORS[m.role] ?? "bg-slate-100 text-slate-500"}`}>
                                            {ALL_ROLE_LABELS[m.role] ?? m.role}
                                        </span>
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${m.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${m.isActive ? "bg-emerald-500" : "bg-red-500"}`} />
                                            {m.isActive ? "Aktif" : "Nonaktif"}
                                        </span>
                                    </div>
                                </div>
                                {m.uid !== user?.uid && m.role !== "ADMIN" && (
                                    <button onClick={() => setToggleTarget(m)} disabled={toggling === m.uid}
                                        className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40
                                            ${m.isActive ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}>
                                        {toggling === m.uid ? <Loader2 size={11} className="animate-spin" /> : m.isActive ? <XCircle size={11} /> : <CheckCircle2 size={11} />}
                                        {m.isActive ? "Nonaktif" : "Aktifkan"}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                    </>
                )}
            </div>

            {/* Modals */}
            {inviteOpen && user && (
                <InviteModal
                    companyId={user.companyId}
                    companyName={user.name}
                    createdBy={user.uid}
                    onClose={() => { setInviteOpen(false); load(); }}
                />
            )}
            <ConfirmToggleModal
                target={toggleTarget}
                onClose={() => setToggleTarget(null)}
                onConfirm={handleToggle}
            />
        </div>
    );
}
