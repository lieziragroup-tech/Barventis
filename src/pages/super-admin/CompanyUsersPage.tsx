import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    ArrowLeft, UserPlus, RefreshCw, Loader2,
    CheckCircle2, XCircle, Users, AlertCircle,
    Eye, EyeOff, Mail, Check, Link,
} from "lucide-react";
import { getCompanyById } from '@/shared/api/companyService';
import { getUsersByCompany, setUserActive } from '@/shared/api/userService';
import { createUserByAdmin, sendActivationEmail } from '@/shared/api/adminCreateUser';
import { useAuthStore } from '@/app/store/authStore';
import type { Company, AppUser } from '@/entities/types';

const ROLE_LABELS: Record<string, string> = {
    administrator: "Administrator",
    marketing: "Marketing",
    admin_ops: "Admin Ops",
    teknisi: "Teknisi",
    super_admin: "Super Admin",
};
const ROLE_COLORS: Record<string, string> = {
    administrator: "bg-indigo-100 text-indigo-700",
    marketing: "bg-blue-100 text-blue-700",
    admin_ops: "bg-amber-100 text-amber-700",
    teknisi: "bg-emerald-100 text-emerald-700",
    super_admin: "bg-slate-200 text-slate-600",
};

// ─── CREATE ADMIN MODAL ───────────────────────────────────────────────────────

function CreateAdminModal({
    companyId,
    companyName,
    onClose,
    onCreated,
}: {
    companyId: string;
    companyName: string;
    onClose: () => void;
    onCreated: () => void;
}) {
    const [step, setStep] = useState<"form" | "success">("form");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [jabatan, setJabatan] = useState("Administrator");
    const [showPw, setShowPw] = useState(false);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");

    const [createdEmail, setCreatedEmail] = useState("");
    const [sendingLink, setSendingLink] = useState(false);
    const [linkSent, setLinkSent] = useState(false);
    const [linkErr, setLinkErr] = useState("");

    const handleCreate = async () => {
        setErr("");
        if (!name.trim()) { setErr("Nama wajib diisi."); return; }
        if (!email.trim()) { setErr("Email wajib diisi."); return; }
        if (password.length < 8) { setErr("Password minimal 8 karakter."); return; }
        if (password !== confirmPassword) { setErr("Konfirmasi password tidak cocok."); return; }

        setSaving(true);
        try {
            await createUserByAdmin({
                email: email.trim(),
                password,
                name: name.trim(),
                role: "ADMIN",
                companyId,
                jabatan: jabatan.trim(),
            });
            setCreatedEmail(email.trim());
            setStep("success");
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes("email-already-in-use")) {
                setErr("Email sudah terdaftar. Gunakan email lain.");
            } else if (msg.includes("permission-denied")) {
                setErr("Akses ditolak Firestore. Periksa Security Rules untuk collection 'users'.");
            } else {
                setErr(`Gagal membuat akun: ${msg}`);
            }
        } finally {
            setSaving(false);
        }
    };

    const handleSendActivationLink = async () => {
        setSendingLink(true);
        setLinkErr("");
        try {
            await sendActivationEmail(createdEmail);
            setLinkSent(true);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setLinkErr(`Gagal kirim email: ${msg}`);
        } finally {
            setSendingLink(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl p-6">

                {step === "form" ? (
                    <>
                        <h3 className="text-base font-bold text-slate-900 mb-1 flex items-center gap-2">
                            <UserPlus size={18} className="text-indigo-600" /> Buat Akun Administrator
                        </h3>
                        <p className="text-sm text-slate-400 mb-5">
                            Untuk <span className="font-semibold text-slate-600">{companyName}</span>.
                            Setelah dibuat, kamu bisa kirim link aktivasi agar admin set password sendiri.
                        </p>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Nama Lengkap *</label>
                                <input
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                    value={name} onChange={e => setName(e.target.value)}
                                    placeholder="Nama administrator"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Jabatan</label>
                                <input
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                    value={jabatan} onChange={e => setJabatan(e.target.value)}
                                    placeholder="Administrator"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Email *</label>
                                <input
                                    type="email"
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                    value={email} onChange={e => setEmail(e.target.value)}
                                    placeholder="admin@perusahaan.com"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">
                                    Password Awal * <span className="text-slate-300 font-normal">(min. 8 karakter)</span>
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPw ? "text" : "password"}
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 pr-10"
                                        value={password} onChange={e => setPassword(e.target.value)}
                                        placeholder="Buat password awal"
                                    />
                                    <button type="button" onClick={() => setShowPw(v => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                        {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Konfirmasi Password *</label>
                                <input
                                    type={showPw ? "text" : "password"}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                    value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                                    placeholder="Ulangi password"
                                />
                            </div>

                            {err && (
                                <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
                                    <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                                    <span>{err}</span>
                                </div>
                            )}

                            <div className="flex gap-2 pt-1">
                                <button onClick={onClose}
                                    className="flex-1 py-2.5 rounded-lg bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200">
                                    Batal
                                </button>
                                <button onClick={handleCreate} disabled={saving}
                                    className="flex-1 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                                    {saving && <Loader2 size={13} className="animate-spin" />}
                                    {saving ? "Membuat..." : "Buat Akun"}
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    /* ── SUCCESS STEP ── */
                    <div>
                        <div className="text-center mb-5">
                            <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                                <CheckCircle2 size={28} className="text-emerald-600" />
                            </div>
                            <h3 className="text-base font-bold text-slate-900">Akun Berhasil Dibuat!</h3>
                            <p className="text-sm text-slate-400 mt-1">
                                <span className="font-semibold text-slate-600">{name}</span> sudah bisa login
                                dengan password yang kamu buat tadi.
                            </p>
                        </div>

                        {/* Link aktivasi */}
                        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-4">
                            <div className="flex items-start gap-3 mb-3">
                                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <Link size={14} className="text-indigo-600" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-indigo-900">Kirim Link Aktivasi (Opsional)</p>
                                    <p className="text-xs text-indigo-600 mt-0.5 leading-relaxed">
                                        Kirim email ke <span className="font-mono font-bold">{createdEmail}</span> agar admin bisa set password sendiri — tidak perlu share password secara manual.
                                    </p>
                                </div>
                            </div>

                            {linkSent ? (
                                <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                                    <Check size={13} /> Email aktivasi terkirim ke {createdEmail}
                                </div>
                            ) : (
                                <>
                                    <button
                                        onClick={handleSendActivationLink}
                                        disabled={sendingLink}
                                        className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                                    >
                                        {sendingLink
                                            ? <><Loader2 size={13} className="animate-spin" /> Mengirim...</>
                                            : <><Mail size={13} /> Kirim Link Aktivasi</>
                                        }
                                    </button>
                                    {linkErr && (
                                        <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                                            <AlertCircle size={11} /> {linkErr}
                                        </p>
                                    )}
                                </>
                            )}
                        </div>

                        <button
                            onClick={onCreated}
                            className="w-full py-2.5 bg-slate-100 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-200 transition-colors"
                        >
                            Selesai
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export function CompanyUsersPage() {
    const { companyId } = useParams<{ companyId: string }>();
    const navigate = useNavigate();
    useAuthStore();

    const [company, setCompany] = useState<Company | null>(null);
    const [users, setUsers] = useState<AppUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [togglingUid, setTogglingUid] = useState<string | null>(null);
    const [resendingUid, setResendingUid] = useState<string | null>(null);
    const [resendDoneUid, setResendDoneUid] = useState<string | null>(null);

    const load = async () => {
        if (!companyId) return;
        setLoading(true);
        try {
            const [comp, usr] = await Promise.all([
                getCompanyById(companyId),
                getUsersByCompany(companyId),
            ]);
            setCompany(comp);
            setUsers(usr);
        } finally {
            setLoading(false);
        }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load(); }, [companyId]);

    const handleToggleActive = async (u: AppUser) => {
        setTogglingUid(u.uid);
        try {
            await setUserActive(u.uid, !u.isActive);
            await load();
        } finally {
            setTogglingUid(null);
        }
    };

    const handleResendActivation = async (u: AppUser) => {
        setResendingUid(u.uid);
        setResendDoneUid(null);
        try {
            await sendActivationEmail(u.email);
            setResendDoneUid(u.uid);
            setTimeout(() => setResendDoneUid(null), 4000);
        } finally {
            setResendingUid(null);
        }
    };

    const hasAdmin = users.some(u => u.role === "ADMIN");

    return (
        <div className="p-4 md:p-6 max-w-screen-lg mx-auto space-y-5">
            {/* Header */}
            <div className="flex items-center gap-3">
                <button onClick={() => navigate("/super-admin/companies")}
                    className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                    <ArrowLeft size={16} />
                </button>
                <div className="flex-1">
                    <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <Users size={20} className="text-indigo-600" />
                        {loading ? "Memuat..." : company?.name ?? "Perusahaan"}
                    </h1>
                    <p className="text-sm text-slate-400 mt-0.5">Kelola akun pengguna perusahaan</p>
                </div>
                <button onClick={load}
                    className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                    <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            {/* Administrator status card */}
            <div className={`rounded-xl border p-5 ${hasAdmin ? "bg-white border-slate-200" : "bg-indigo-50 border-indigo-200"}`}>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="font-semibold text-slate-900">
                            {hasAdmin ? "✅ Administrator sudah ada" : "⚠️ Belum ada Administrator"}
                        </p>
                        <p className="text-sm text-slate-500 mt-1">
                            {hasAdmin
                                ? "Perusahaan ini sudah memiliki Administrator. Administrator dapat mengelola tim dari menu Tim."
                                : "Buat akun Administrator untuk perusahaan ini. Mereka yang akan mengelola Marketing, Admin Ops, dan Teknisi."}
                        </p>
                    </div>
                    {!hasAdmin && (
                        <button onClick={() => setCreateOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap flex-shrink-0">
                            <UserPlus size={14} />
                            Buat Akun Administrator
                        </button>
                    )}
                </div>
            </div>

            {/* Users table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100">
                    <span className="text-sm font-semibold text-slate-700">Daftar User ({users.length})</span>
                </div>
                {loading ? (
                    <div className="flex items-center justify-center py-12 text-slate-400">
                        <Loader2 size={20} className="animate-spin mr-2" /> Memuat...
                    </div>
                ) : users.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                        <Users size={32} className="mx-auto mb-3 opacity-30" />
                        <p className="text-sm">Belum ada user di perusahaan ini.</p>
                    </div>
                ) : (
                    <>
                    {/* Desktop table */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr>
                                    {["Nama", "Email", "Role", "Status", "Aksi"].map(h => (
                                        <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-400 border-b border-slate-100 bg-slate-50 whitespace-nowrap">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(u => (
                                    <tr key={u.uid} className="hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
                                        <td className="px-4 py-3">
                                            <div className="text-sm font-semibold text-slate-900">{u.name}</div>
                                            {u.jabatan && <div className="text-xs text-slate-400">{u.jabatan}</div>}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-600">{u.email}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${ROLE_COLORS[u.role] ?? ""}`}>
                                                {ROLE_LABELS[u.role] ?? u.role}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold
                                                ${u.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                                                {u.isActive
                                                    ? <><CheckCircle2 size={11} /> Aktif</>
                                                    : <><XCircle size={11} /> Nonaktif</>}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                {/* Toggle aktif/nonaktif */}
                                                <button
                                                    onClick={() => handleToggleActive(u)}
                                                    disabled={togglingUid === u.uid}
                                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40
                                                        ${u.isActive
                                                            ? "bg-red-50 text-red-600 hover:bg-red-100"
                                                            : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}
                                                >
                                                    {togglingUid === u.uid
                                                        ? <Loader2 size={11} className="animate-spin" />
                                                        : u.isActive ? <XCircle size={11} /> : <CheckCircle2 size={11} />}
                                                    {u.isActive ? "Nonaktifkan" : "Aktifkan"}
                                                </button>

                                                {/* Kirim ulang link aktivasi */}
                                                <button
                                                    onClick={() => handleResendActivation(u)}
                                                    disabled={resendingUid === u.uid}
                                                    title="Kirim link aktivasi/reset password ke email ini"
                                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors disabled:opacity-40"
                                                >
                                                    {resendingUid === u.uid
                                                        ? <Loader2 size={11} className="animate-spin" />
                                                        : resendDoneUid === u.uid
                                                            ? <Check size={11} className="text-emerald-600" />
                                                            : <Mail size={11} />}
                                                    {resendDoneUid === u.uid ? "Terkirim!" : "Link Aktivasi"}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="md:hidden divide-y divide-slate-100">
                        {users.map(u => (
                            <div key={u.uid} className="p-4 flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-sm shrink-0">
                                    {u.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-slate-900 truncate">{u.name}</p>
                                    <p className="text-xs text-slate-400 truncate">{u.email}</p>
                                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${ROLE_COLORS[u.role] ?? ""}`}>
                                            {ROLE_LABELS[u.role] ?? u.role}
                                        </span>
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${u.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                                            {u.isActive ? <><CheckCircle2 size={10} /> Aktif</> : <><XCircle size={10} /> Nonaktif</>}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1 shrink-0">
                                    <button onClick={() => handleToggleActive(u)} disabled={togglingUid === u.uid}
                                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 ${u.isActive ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}>
                                        {togglingUid === u.uid ? <Loader2 size={11} className="animate-spin" /> : u.isActive ? <XCircle size={11} /> : <CheckCircle2 size={11} />}
                                        {u.isActive ? "Nonaktif" : "Aktifkan"}
                                    </button>
                                    <button onClick={() => handleResendActivation(u)} disabled={resendingUid === u.uid}
                                        title="Kirim link aktivasi/reset password ke email ini"
                                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors disabled:opacity-40">
                                        {resendingUid === u.uid ? <Loader2 size={11} className="animate-spin" /> : resendDoneUid === u.uid ? <Check size={11} className="text-emerald-600" /> : <Mail size={11} />}
                                        {resendDoneUid === u.uid ? "Terkirim!" : "Link"}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                    </>
                )}
            </div>

            {/* Create admin modal */}
            {createOpen && companyId && company && (
                <CreateAdminModal
                    companyId={companyId}
                    companyName={company.name}
                    onClose={() => setCreateOpen(false)}
                    onCreated={() => { setCreateOpen(false); load(); }}
                />
            )}
        </div>
    );
}