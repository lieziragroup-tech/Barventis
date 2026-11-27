import { supabase } from '@/shared/lib/supabase';
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, updateDoc } from '@/shared/lib/firebase';
import { db } from '@/shared/lib/firebase';
import { useAuthStore } from '@/app/store/authStore';
import {
    User, Lock, Phone, Briefcase, CheckCircle2,
    Eye, EyeOff, AlertCircle, Loader2, LogOut,
} from "lucide-react";

export function ProfilePage() {
    const { user, setUser } = useAuthStore();
    const navigate = useNavigate();

    // ── Profile info ──────────────────────────────────────────────────────────
    const [jabatan, setJabatan] = useState(user?.jabatan ?? "");
    const [wa, setWa] = useState(user?.wa ?? "");
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const handleSaveProfile = async () => {
        if (!user) return;
        setSavingProfile(true);
        setProfileMsg(null);
        try {
            await updateDoc(doc(db, "users", user.uid), {
                jabatan: jabatan.trim(),
                wa: wa.trim(),
            });
            setUser({ ...user, jabatan: jabatan.trim(), wa: wa.trim() });
            setProfileMsg({ type: "success", text: "Profil berhasil diperbarui." });
        } catch {
            setProfileMsg({ type: "error", text: "Gagal menyimpan profil." });
        } finally {
            setSavingProfile(false);
        }
    };

    // ── Change password ───────────────────────────────────────────────────────
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [changingPw, setChangingPw] = useState(false);
    const [pwMsg, setPwMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const handleChangePassword = async () => {
        setPwMsg(null);
        if (!currentPassword) { setPwMsg({ type: "error", text: "Masukkan password saat ini." }); return; }
        if (newPassword.length < 8) { setPwMsg({ type: "error", text: "Password baru minimal 8 karakter." }); return; }
        if (newPassword !== confirmPassword) { setPwMsg({ type: "error", text: "Konfirmasi password tidak cocok." }); return; }
        
        setChangingPw(true);
        try {
            // Supabase password update
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;

            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            setPwMsg({ type: "success", text: "Password berhasil diubah. Gunakan password baru saat login berikutnya." });
        } catch (err) {
            const msg = err instanceof Error ? err.message : "";
            if (msg.includes("wrong-password") || msg.includes("invalid-credential")) {
                setPwMsg({ type: "error", text: "Password saat ini salah." });
            } else if (msg.includes("requires-recent-login")) {
                setPwMsg({ type: "error", text: "Sesi sudah lama. Silakan logout dan login ulang, lalu coba lagi." });
            } else {
                setPwMsg({ type: "error", text: `Gagal: ${msg}` });
            }
        } finally {
            setChangingPw(false);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        setUser(null);
        navigate("/login");
    };

    if (!user) return null;

    const ROLE_LABELS: Record<string, string> = {
        administrator: "Administrator",
        marketing: "Marketing",
        admin_ops: "Admin Operasional",
        teknisi: "Teknisi",
        super_admin: "Super Admin",
    };

    return (
        <div className="p-4 md:p-6 max-w-screen-sm mx-auto space-y-5">
            {/* Header */}
            <div>
                <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <User size={20} className="text-blue-600" />
                    Profil Saya
                </h1>
                <p className="text-sm text-slate-400 mt-0.5">Kelola informasi dan keamanan akun kamu</p>
            </div>

            {/* Identity card (read-only) */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-2xl font-bold text-blue-600">
                            {user.name.charAt(0).toUpperCase()}
                        </span>
                    </div>
                    <div>
                        <p className="font-bold text-slate-900 text-base">{user.name}</p>
                        <p className="text-sm text-slate-400">{user.email}</p>
                        <span className="inline-flex mt-1 px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-700">
                            {ROLE_LABELS[user.role] ?? user.role}
                        </span>
                    </div>
                </div>
            </div>

            {/* Edit profile */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h2 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                    <Briefcase size={15} /> Informasi Tambahan
                </h2>
                <div className="space-y-3">
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Jabatan</label>
                        <input
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                            value={jabatan}
                            onChange={e => setJabatan(e.target.value)}
                            placeholder="Jabatan kamu"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1 flex items-center gap-1">
                            <Phone size={11} /> No. WhatsApp
                        </label>
                        <input
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                            value={wa}
                            onChange={e => setWa(e.target.value)}
                            placeholder="08xxxxxxxxxx"
                        />
                    </div>
                    {profileMsg && (
                        <div className={`flex items-center gap-2 text-sm p-3 rounded-lg border
                            ${profileMsg.type === "success"
                                ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                                : "bg-red-50 border-red-100 text-red-600"}`}>
                            {profileMsg.type === "success" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                            {profileMsg.text}
                        </div>
                    )}
                    <button onClick={handleSaveProfile} disabled={savingProfile}
                        className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                        {savingProfile && <Loader2 size={13} className="animate-spin" />}
                        {savingProfile ? "Menyimpan..." : "Simpan Profil"}
                    </button>
                </div>
            </div>

            {/* Change password */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h2 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                    <Lock size={15} /> Ganti Password
                </h2>
                <div className="space-y-3">
                    {/* Current password */}
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Password Saat Ini *</label>
                        <div className="relative">
                            <input
                                type={showCurrent ? "text" : "password"}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 pr-10"
                                value={currentPassword}
                                onChange={e => setCurrentPassword(e.target.value)}
                                placeholder="Password lama kamu"
                            />
                            <button type="button" onClick={() => setShowCurrent(v => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                        </div>
                    </div>

                    {/* New password */}
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">
                            Password Baru * <span className="text-slate-300 font-normal">(min. 8 karakter)</span>
                        </label>
                        <div className="relative">
                            <input
                                type={showNew ? "text" : "password"}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 pr-10"
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                placeholder="Password baru"
                            />
                            <button type="button" onClick={() => setShowNew(v => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                        </div>
                    </div>

                    {/* Confirm password */}
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Konfirmasi Password Baru *</label>
                        <input
                            type={showNew ? "text" : "password"}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            placeholder="Ulangi password baru"
                        />
                    </div>

                    {pwMsg && (
                        <div className={`flex items-start gap-2 text-sm p-3 rounded-lg border
                            ${pwMsg.type === "success"
                                ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                                : "bg-red-50 border-red-100 text-red-600"}`}>
                            {pwMsg.type === "success" ? <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" /> : <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />}
                            {pwMsg.text}
                        </div>
                    )}

                    <button onClick={handleChangePassword} disabled={changingPw}
                        className="w-full py-2.5 bg-slate-800 text-white text-sm font-semibold rounded-lg hover:bg-slate-900 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                        {changingPw && <Loader2 size={13} className="animate-spin" />}
                        {changingPw ? "Mengubah Password..." : "Ubah Password"}
                    </button>
                </div>
            </div>

            {/* Logout */}
            <button onClick={handleLogout}
                className="w-full py-2.5 border border-red-200 text-red-600 text-sm font-semibold rounded-xl hover:bg-red-50 flex items-center justify-center gap-2 transition-colors">
                <LogOut size={15} />
                Keluar dari Akun
            </button>
        </div>
    );
}
