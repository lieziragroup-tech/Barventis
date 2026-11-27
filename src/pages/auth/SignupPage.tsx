import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from '@/shared/lib/supabase';
import {
    getInviteByToken,
    acceptInvite,
    completeInviteRegistration,
    rememberPendingInvite,
    type Invite,
} from '@/shared/api/inviteService';
import { fetchAppUser } from '@/shared/api/authProfile';
import { useAuthStore } from '@/app/store/authStore';
import {
    AlertCircle, Loader2, User, Mail, Lock, Eye, EyeOff,
    ShieldCheck, CheckCircle2, ArrowLeft, KeyRound, ArrowRight
} from "lucide-react";

const ROLE_DISPLAY_NAMES: Record<string, string> = {
    SUPERADMIN: "Superadmin (Direktur Perusahaan)",
    ADMIN: "Admin Operasional Perusahaan",
    MARKETING: "Marketing / Surveyor",
    INVENTORY: "Admin Gudang & Chemical",
    TEKNISI_LAPANGAN: "Teknisi Lapangan",
};

export function SignupPage() {
    const navigate = useNavigate();
    const { setUser } = useAuthStore();
    const [searchParams, setSearchParams] = useSearchParams();
    const rawParamToken = searchParams.get("invite") || searchParams.get("token") || "";
    const inviteToken = rawParamToken.replace(/^["']|["']$/g, "").trim();

    const [manualToken, setManualToken] = useState("");
    const [invite, setInvite] = useState<Invite | null>(null);
    const [inviteChecking, setInviteChecking] = useState(Boolean(inviteToken));
    const [inviteError, setInviteError] = useState("");

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);
    const [successNote, setSuccessNote] = useState("");

    const [form, setForm] = useState({
        userName: "",
        email: "",
        password: "",
        confirmPassword: "",
    });
    const [showPassword, setShowPassword] = useState(false);

    // Deteksi dan bersihkan parameter hash atau query error Supabase (contoh: #error=access_denied&error_code=otp_expired)
    useEffect(() => {
        if (typeof window === "undefined") return;
        const hashStr = window.location.hash.startsWith("#") ? window.location.hash.substring(1) : "";
        const hashParams = new URLSearchParams(hashStr);
        const errCode = hashParams.get("error_code") || searchParams.get("error_code");
        const errDesc = hashParams.get("error_description") || searchParams.get("error_description") || searchParams.get("error");
        if (errCode || errDesc) {
            window.history.replaceState(null, "", window.location.pathname + (inviteToken ? `?invite=${encodeURIComponent(inviteToken)}` : ""));
            if (errCode === "otp_expired" || (errDesc && errDesc.toLowerCase().includes("expired"))) {
                setError("Tautan konfirmasi email dari tautan sebelumnya telah kedaluwarsa. Jika Anda mendaftar melalui token undangan, akun Anda akan langsung aktif tanpa memerlukan verifikasi email.");
            } else {
                setError(decodeURIComponent(errDesc?.replace(/\+/g, " ") || "Terjadi kendala pada tautan verifikasi email."));
            }
        }
    }, [searchParams, inviteToken]);

    useEffect(() => {
        if (!inviteToken) {
            setInvite(null);
            setInviteChecking(false);
            return;
        }

        let isMounted = true;
        setInviteChecking(true);
        setInviteError("");
        const checkInvite = async () => {
            try {
                const inv = await getInviteByToken(inviteToken);
                if (!isMounted) return;
                if (!inv) {
                    setInvite(null);
                    setInviteError("Token undangan tidak valid, sudah pernah digunakan, atau sudah kedaluwarsa.");
                } else {
                    setInvite(inv);
                }
            } catch (err: any) {
                if (isMounted) {
                    setInvite(null);
                    setInviteError("Gagal memverifikasi token undangan: " + (err.message || ""));
                }
            } finally {
                if (isMounted) setInviteChecking(false);
            }
        };

        checkInvite();
        return () => { isMounted = false; };
    }, [inviteToken]);

    const handleVerifyManualToken = (e: React.FormEvent) => {
        e.preventDefault();
        const raw = manualToken.trim();
        if (!raw) return;
        let extracted = raw;
        try {
            if (raw.includes("invite=") || raw.includes("token=")) {
                const u = new URL(raw.startsWith("http") ? raw : `http://localhost/${raw}`);
                extracted = u.searchParams.get("invite") || u.searchParams.get("token") || raw;
            }
        } catch {
            extracted = raw;
        }
        extracted = extracted.replace(/^["']|["']$/g, "").trim();
        setSearchParams({ invite: extracted });
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm(prev => ({ ...prev, [e.target.id]: e.target.value }));
    };

    const handleSignupWithInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!invite || !inviteToken) return;

        setError("");
        if (form.password !== form.confirmPassword) {
            setError("Konfirmasi password tidak cocok.");
            return;
        }
        if (form.password.length < 6) {
            setError("Password minimal 6 karakter.");
            return;
        }

        const cleanEmail = form.email.trim().toLowerCase();
        const cleanName = form.userName.trim();
        const cleanToken = inviteToken.trim();

        setLoading(true);
        // Simpan token di localStorage sebagai jaring pengaman apabila sesi baru aktif saat login berikutnya
        rememberPendingInvite(cleanToken, cleanName, undefined, cleanEmail);

        try {
            // 1. Coba melalui endpoint server /api/auth/register-invite (dengan parsing JSON yang aman terhadap error HTML/teks)
            let registeredViaApi = false;
            try {
                const resp = await fetch("/api/auth/register-invite", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        token: cleanToken,
                        name: cleanName,
                        email: cleanEmail,
                        password: form.password,
                    }),
                });
                const rawText = await resp.text();
                let data: any = null;
                try {
                    data = rawText ? JSON.parse(rawText) : null;
                } catch {
                    data = null;
                }

                if (resp.ok && data?.success) {
                    registeredViaApi = true;
                } else if (data?.message && (resp.status === 400 || resp.status === 404)) {
                    throw new Error(data.message);
                }
            } catch (apiErr: any) {
                const msg = apiErr?.message || "";
                if (msg.includes("sudah pernah digunakan") || msg.includes("kedaluwarsa") || msg.includes("tidak ditemukan")) {
                    throw apiErr;
                }
                console.warn("[signup] Melanjutkan registrasi via Supabase RPC/Auth langsung:", msg);
            }

            // 2. Jalur utama client-side: Supabase Auth signUp + RPC complete_invite_registration (SECURITY DEFINER)
            if (!registeredViaApi) {
                const { data: authData, error: authErr } = await supabase.auth.signUp({
                    email: cleanEmail,
                    password: form.password,
                    options: {
                        data: {
                            full_name: cleanName,
                            invite_token: cleanToken,
                            company_id: invite.companyId,
                            role: invite.role,
                        },
                    },
                });

                // Jika user sebelumnya sudah sempat klik daftar (sehingga terdaftar di auth.users namun belum selesai klaim invite),
                // jangan gagalkan alur — lanjutkan ke completeInviteRegistration untuk mengonfirmasi & menautkan profilnya!
                if (authErr && !authErr.message.toLowerCase().includes("already registered")) {
                    throw authErr;
                }

                // Panggil RPC complete_invite_registration (auto-confirm email di auth.users + buat public.users + tandai invite used)
                const rpcResult = await completeInviteRegistration({
                    token: cleanToken,
                    email: cleanEmail,
                    name: cleanName,
                });

                // Jika signUp langsung menghasilkan session aktif dan RPC baru belum terpasang, pastikan acceptInvite terpanggil
                if (!rpcResult.ok && authData?.session) {
                    await acceptInvite(cleanToken, cleanName);
                }
            }

            // 3. Login otomatis dan validasi sesi
            const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
                email: cleanEmail,
                password: form.password,
            });

            if (!signInErr && signInData?.user) {
                // Pastikan klaim undangan tuntas jika sebelumnya menunggu sesi login aktif
                const profileRes = await fetchAppUser(signInData.user.id);
                if (profileRes.user) {
                    setUser(profileRes.user);
                    setSuccessNote("Akun Anda telah aktif dan berhasil masuk secara otomatis. Mengalihkan ke dashboard...");
                    setSuccess(true);
                    setTimeout(() => {
                        navigate("/");
                    }, 1200);
                    return;
                }
            }

            if (signInErr) {
                const errLower = signInErr.message.toLowerCase();
                if (errLower.includes("not confirmed") || errLower.includes("unconfirmed")) {
                    setError(
                        "Akun Anda telah terdaftar, namun Supabase masih menunggu konfirmasi email. " +
                        "Silakan jalankan file migrasi SQL `06_fix_invite_auth_and_autoconfirm.sql` di Supabase SQL Editor (atau matikan fitur 'Confirm email' di Supabase Dashboard → Authentication → Providers → Email) agar akun undangan langsung aktif tanpa verifikasi email."
                    );
                    return;
                }
                if (errLower.includes("invalid login credentials")) {
                    setError(
                        "Email ini sudah pernah didaftarkan sebelumnya dengan password yang berbeda, atau akun belum terkonfirmasi di Supabase. Gunakan password yang sesuai atau jalankan script SQL perbaikan invite di Supabase SQL Editor."
                    );
                    return;
                }
                throw signInErr;
            }

            setSuccessNote("Akun Anda telah aktif dan terhubung ke perusahaan. Silakan masuk menggunakan email dan password Anda.");
            setSuccess(true);
            setTimeout(() => {
                navigate("/login");
            }, 1500);
        } catch (err: any) {
            setError(err.message || "Gagal menyelesaikan pendaftaran.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-[100dvh] bg-[var(--bg-primary)] flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 selection:bg-[var(--accent-glow)]">
            <div className="w-full max-w-sm sm:max-w-[410px] md:max-w-[430px] mx-auto">
                <div className="text-center mb-6">
                    <h1 className="font-sans text-2xl sm:text-3xl font-black tracking-tight leading-tight text-slate-900 select-none">
                        Field<span className="text-[var(--accent)]">Work</span>
                    </h1>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">
                        Aktivasi Akun via Token Undangan Resmi
                    </p>
                </div>

                {inviteChecking ? (
                    <div className="bg-white rounded-2xl shadow-lg border border-[var(--border-subtle)] p-6 text-center space-y-2.5">
                        <Loader2 size={28} className="animate-spin text-[var(--accent)] mx-auto" />
                        <p className="text-xs sm:text-sm font-semibold text-[var(--text-secondary)]">Memeriksa token undangan...</p>
                    </div>
                ) : invite && !success ? (
                    <div className="bg-white rounded-2xl shadow-lg border border-[var(--border-subtle)] p-5 sm:p-7">
                        <div className="mb-4 pb-3 border-b border-[var(--border-subtle)]">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg w-fit mb-1.5">
                                <ShieldCheck size={14} />
                                <span>Token Undangan Valid</span>
                            </div>
                            <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
                                {invite.role === "SUPERADMIN" ? "Registrasi Akun Superadmin Perusahaan" : "Registrasi Akun Anggota Perusahaan"}
                            </h2>
                            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                Anda diundang bergabung ke <strong className="text-slate-900">{invite.companyName}</strong> sebagai{" "}
                                <strong className="text-[var(--accent)]">{ROLE_DISPLAY_NAMES[invite.role] || invite.role}</strong>.
                            </p>
                        </div>

                        <form onSubmit={handleSignupWithInvite} className="space-y-3.5">
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-[var(--text-secondary)]">Nama Lengkap</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                        <User size={16} className="text-[var(--text-muted)]" />
                                    </div>
                                    <input
                                        id="userName"
                                        type="text"
                                        value={form.userName}
                                        onChange={handleChange}
                                        required
                                        placeholder="Masukkan nama lengkap Anda"
                                        className="w-full pl-10 pr-3.5 py-2.5 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-[var(--text-secondary)]">Email</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                        <Mail size={16} className="text-[var(--text-muted)]" />
                                    </div>
                                    <input
                                        id="email"
                                        type="email"
                                        value={form.email}
                                        onChange={handleChange}
                                        required
                                        placeholder="nama@perusahaan.com"
                                        className="w-full pl-10 pr-3.5 py-2.5 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-[var(--text-secondary)]">Password</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                        <Lock size={16} className="text-[var(--text-muted)]" />
                                    </div>
                                    <input
                                        id="password"
                                        type={showPassword ? "text" : "password"}
                                        value={form.password}
                                        onChange={handleChange}
                                        required
                                        placeholder="Minimal 6 karakter"
                                        className="w-full pl-10 pr-10 py-2.5 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                    >
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-[var(--text-secondary)]">Konfirmasi Password</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                        <Lock size={16} className="text-[var(--text-muted)]" />
                                    </div>
                                    <input
                                        id="confirmPassword"
                                        type={showPassword ? "text" : "password"}
                                        value={form.confirmPassword}
                                        onChange={handleChange}
                                        required
                                        placeholder="Ulangi password"
                                        className="w-full pl-10 pr-3.5 py-2.5 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                                    />
                                </div>
                            </div>

                            {error && (
                                <div className="flex items-start gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs font-semibold leading-relaxed">
                                    <AlertCircle size={15} className="shrink-0 mt-0.5" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-2.5 px-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-bold rounded-xl shadow-xs transition-all disabled:opacity-70 flex items-center justify-center gap-2 mt-2 cursor-pointer"
                            >
                                {loading ? <><Loader2 size={16} className="animate-spin" /> Mengaktifkan Akun...</> : "Selesaikan Pendaftaran"}
                            </button>
                        </form>

                        <div className="mt-4 pt-3.5 border-t border-[var(--border-subtle)] text-center">
                            <Link to="/login" className="text-xs font-semibold text-[var(--text-muted)] hover:text-emerald-700 inline-flex items-center gap-1.5">
                                <ArrowLeft size={14} /> Kembali ke Halaman Masuk
                            </Link>
                        </div>
                    </div>
                ) : success ? (
                    <div className="bg-white rounded-2xl shadow-lg border border-[var(--border-subtle)] p-6 text-center space-y-3">
                        <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mx-auto">
                            <CheckCircle2 size={26} />
                        </div>
                        <h2 className="text-lg font-bold text-slate-900">Pendaftaran Berhasil!</h2>
                        <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                            {successNote || "Akun Anda telah aktif dan terhubung ke perusahaan."}
                        </p>
                        <Link
                            to="/"
                            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[var(--accent)] text-white text-xs sm:text-sm font-bold rounded-xl"
                        >
                            Masuk ke Dashboard
                        </Link>
                    </div>
                ) : (
                    /* Form Input Kode Token Undangan Manual */
                    <div className="bg-white rounded-2xl shadow-lg border border-[var(--border-subtle)] p-5 sm:p-7 space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 bg-emerald-50 text-[var(--accent)] border border-emerald-200 rounded-xl flex items-center justify-center shrink-0">
                                <KeyRound size={20} />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-slate-900">Verifikasi Token Undangan</h2>
                                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                    Masukkan kode token undangan atau tautan undangan yang Anda terima untuk mengaktifkan akun Superadmin atau Staf Perusahaan.
                                </p>
                            </div>
                        </div>

                        {inviteError && (
                            <div className="flex items-start gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs font-medium">
                                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                                <span>{inviteError}</span>
                            </div>
                        )}

                        <form onSubmit={handleVerifyManualToken} className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-[#2d2a26] mb-1">
                                    Kode Token / Link Undangan
                                </label>
                                <input
                                    type="text"
                                    value={manualToken}
                                    onChange={e => setManualToken(e.target.value)}
                                    placeholder="Tempel kode token undangan di sini..."
                                    required
                                    className="w-full px-3.5 py-2.5 bg-[#faf9f7] border border-[#e8e5e0] rounded-xl text-xs sm:text-sm font-mono focus:outline-none focus:bg-white focus:border-[var(--accent)]"
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full py-2.5 px-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs sm:text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                                Verifikasi Token Undangan <ArrowRight size={15} />
                            </button>
                        </form>

                        <div className="pt-3 border-t border-[#e8e5e0] text-center">
                            <Link
                                to="/login"
                                className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--accent)]"
                            >
                                <ArrowLeft size={14} /> Kembali ke Halaman Masuk
                            </Link>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
