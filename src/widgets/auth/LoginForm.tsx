import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from '@/shared/lib/supabase';
import {
    useAuthStore,
    readRememberMeFlag,
    readRememberedEmail,
} from '@/app/store/authStore';
import {
    Loader2,
    Eye,
    EyeOff,
    KeyRound,
    X,
    CheckCircle2,
} from "lucide-react";
import type { AppUser } from '@/entities/types';
import { fetchAppUser } from '@/shared/api/authProfile';
import { readPendingInvite, repairPendingInviteUser } from '@/shared/api/inviteService';
import { sendPasswordResetEmail } from '@/shared/api/auth';

const QUICK_LOGIN_ACCOUNTS = [
    {
        label: "Admin Operasional",
        roleBadge: "ADMIN",
        email: "admin@gucimaspratama.co.id",
        pw: "GuciEmas123!",
    },
    {
        label: "Teknisi Lapangan",
        roleBadge: "TEKNISI",
        email: "teknisi@gucimaspratama.co.id",
        pw: "GuciEmas123!",
    },
];

export function LoginPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { setUser } = useAuthStore();
    const [email, setEmail] = useState(() => readRememberedEmail());
    const [password, setPassword] = useState("");
    const [rememberMe, setRememberMe] = useState<boolean>(() => readRememberMeFlag());
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    // Forgot Password Modal state
    const [showForgotModal, setShowForgotModal] = useState(false);
    const [recoveryEmail, setRecoveryEmail] = useState("");
    const [recoverySuccess, setRecoverySuccess] = useState<string | null>(null);
    const [recoveryError, setRecoveryError] = useState<string | null>(null);
    const [recoveryLoading, setRecoveryLoading] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const hashStr = window.location.hash.startsWith("#") ? window.location.hash.substring(1) : "";
        const hashParams = new URLSearchParams(hashStr);
        const errCode = hashParams.get("error_code") || searchParams.get("error_code");
        const errDesc = hashParams.get("error_description") || searchParams.get("error_description") || searchParams.get("error");
        if (errCode || errDesc) {
            window.history.replaceState(null, "", window.location.pathname);
            if (errCode === "otp_expired" || (errDesc && errDesc.toLowerCase().includes("expired"))) {
                setError("Tautan email telah kedaluwarsa atau sudah pernah diklik. Silakan langsung login dengan email dan password akun Anda di bawah ini.");
            } else {
                setError(decodeURIComponent(errDesc?.replace(/\+/g, " ") || "Terjadi kendala pada tautan verifikasi email."));
            }
        }
    }, [searchParams]);

    useEffect(() => {
        const inv = searchParams.get("invite") || searchParams.get("token");
        if (inv) {
            navigate(`/signup?invite=${encodeURIComponent(inv)}`, { replace: true });
        }
    }, [searchParams, navigate]);

    const performSignIn = async (loginEmail: string, loginPassword: string) => {
        setError("");
        setLoading(true);
        const cleanEmail = loginEmail.trim().toLowerCase();

        try {
            let { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
                email: cleanEmail,
                password: loginPassword,
            });

            if (authErr) {
                const pending = readPendingInvite();
                const repairedViaRpc = await repairPendingInviteUser(
                    cleanEmail,
                    pending?.token,
                    pending?.name
                );

                let repairedViaApi = false;
                if (!repairedViaRpc) {
                    try {
                        const confirmRes = await fetch("/api/auth/auto-confirm-email", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                email: cleanEmail,
                                token: pending?.token,
                                name: pending?.name,
                            }),
                        });
                        const rawText = await confirmRes.text();
                        const confirmData = rawText ? JSON.parse(rawText) : null;
                        repairedViaApi = Boolean(confirmData?.success);
                    } catch {
                        /* abaikan jika API backend tidak aktif */
                    }
                }

                if (repairedViaRpc || repairedViaApi) {
                    const retry = await supabase.auth.signInWithPassword({
                        email: cleanEmail,
                        password: loginPassword,
                    });
                    authData = retry.data;
                    authErr = retry.error;
                }
            }

            if (authErr || !authData.user) {
                if (authErr) {
                    const errLower = authErr.message.toLowerCase();
                    if (errLower.includes("not confirmed") || errLower.includes("unconfirmed")) {
                        throw new Error(
                            "Email akun Anda belum terkonfirmasi di Supabase. Jalankan file SQL `06_fix_invite_auth_and_autoconfirm.sql` di Supabase SQL Editor untuk mengaktifkan seluruh akun undangan secara otomatis."
                        );
                    }
                    if (errLower.includes("invalid login credentials")) {
                        throw new Error(
                            "Email atau kata sandi salah. Pastikan kredensial akun Supabase Anda sesuai."
                        );
                    }
                    throw authErr;
                }
                throw new Error("Login gagal. Silakan coba lagi.");
            }

            const res = await fetchAppUser(authData.user.id);
            if (!res.user) {
                await supabase.auth.signOut();
                setError(res.message ?? "Akun tidak ditemukan pada tabel pengguna perusahaan.");
                return;
            }
            const appUser: AppUser = res.user;
            setUser(appUser, rememberMe);
            navigate("/");
        } catch (err: any) {
            setError(err.message || "Email atau kata sandi salah. Silakan periksa kembali.");
        } finally {
            setLoading(false);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        await performSignIn(email, password);
    };

    const handleQuickLogin = async (accEmail: string, accPw: string) => {
        setEmail(accEmail);
        setPassword(accPw);
        await performSignIn(accEmail, accPw);
    };

    const handleOpenForgotModal = () => {
        setRecoveryEmail(email.trim());
        setRecoverySuccess(null);
        setRecoveryError(null);
        setShowForgotModal(true);
    };

    const handleSendResetEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        const target = recoveryEmail.trim().toLowerCase();
        if (!target) return;
        setRecoveryLoading(true);
        setRecoveryError(null);
        try {
            const msg = await sendPasswordResetEmail(target);
            setRecoverySuccess(msg);
        } catch (err: any) {
            setRecoveryError(err.message || "Gagal mengirim email pemulihan kata sandi.");
        } finally {
            setRecoveryLoading(false);
        }
    };

    return (
        <main className="min-h-screen grid grid-cols-1 lg:grid-cols-[minmax(420px,0.95fr)_minmax(480px,1.05fr)] bg-[var(--bg-card)] text-[var(--text-primary)]">
            {/* Left Aside — Minimalist Brand & Concise Statement */}
            <section className="hidden lg:flex flex-col justify-between bg-[#1A5C38] dark:bg-[#13291E] text-white p-12 xl:p-14 relative overflow-hidden">
                <div className="flex items-center gap-3 relative z-10">
                    <div className="brand-mark">
                        <span />
                        <span />
                        <span />
                    </div>
                    <div>
                        <strong className="block text-base leading-tight font-bold text-white">Fieldwork</strong>
                        <small className="block text-[11px] text-white/75 mt-0.5">PT Guci Emas Pratama</small>
                    </div>
                </div>

                <div className="max-w-md relative z-10 my-auto">
                    <h1 className="text-3xl xl:text-4xl font-bold leading-tight tracking-[-0.03em] text-white mb-3">
                        Laporan Kerja Digital.
                    </h1>
                    <p className="text-sm xl:text-base leading-relaxed text-[#dbe8df]">
                        Kelola penugasan, validasi geolocation Haversine, dan dokumentasi pekerjaan lapangan dalam satu tempat.
                    </p>
                </div>

                <div className="text-xs text-white/60 relative z-10">
                    PT Guci Emas Pratama
                </div>

                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute w-[420px] h-[420px] rounded-full border border-white/12 -right-[180px] -bottom-[150px] shadow-[0_0_0_70px_rgba(255,255,255,0.03),0_0_0_140px_rgba(255,255,255,0.025)]"
                />
            </section>

            {/* Right Login Panel — Direct & On-Point */}
            <section className="flex items-center justify-center p-6 sm:p-12 bg-[var(--bg-primary)]">
                <div className="w-full max-w-[380px]">
                    {/* Mobile Brand Header */}
                    <div className="flex lg:hidden items-center gap-3 mb-8">
                        <div className="brand-mark emerald-bg">
                            <span />
                            <span />
                            <span />
                        </div>
                        <div>
                            <strong className="block text-base leading-tight font-bold text-[var(--text-primary)]">Fieldwork</strong>
                            <small className="block text-[11px] text-[var(--text-secondary)] mt-0.5">PT Guci Emas Pratama</small>
                        </div>
                    </div>

                    <h2 className="text-2xl sm:text-[28px] font-bold tracking-[-0.025em] text-[var(--text-primary)] mb-1.5">
                        Masuk
                    </h2>
                    <p className="text-sm text-[var(--text-secondary)] mb-6">
                        Gunakan akun perusahaan Anda untuk melanjutkan.
                    </p>

                    <form onSubmit={handleLogin} className="space-y-4">
                        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[var(--text-secondary)]">
                            <span>Email</span>
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="nama@gucimaspratama.co.id"
                                required
                                className="w-full min-h-[44px] px-3 py-2.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)] text-sm font-normal focus:border-[#1A5C38] focus:outline-none focus:ring-3 focus:ring-[#1A5C38]/15 transition-all"
                            />
                        </label>

                        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[var(--text-secondary)]">
                            <span>Kata sandi</span>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="Masukkan kata sandi"
                                    required
                                    className="w-full min-h-[44px] pl-3 pr-11 py-2.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)] text-sm font-normal focus:border-[#1A5C38] focus:outline-none focus:ring-3 focus:ring-[#1A5C38]/15 transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    aria-label={showPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                                    title={showPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                                    className="absolute right-1 top-1 w-9 h-9 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                                >
                                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                                </button>
                            </div>
                        </label>

                        {/* Remember Me Checkbox & Forgot Password Link */}
                        <div className="flex items-center justify-between pt-0.5">
                            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={rememberMe}
                                    onChange={e => setRememberMe(e.target.checked)}
                                    className="w-4 h-4 rounded border-[var(--border-subtle)] text-[#1A5C38] focus:ring-[#1A5C38]/20 accent-[#1A5C38] cursor-pointer"
                                />
                                <span className="text-xs font-medium text-[var(--text-secondary)]">
                                    Ingat email saya
                                </span>
                            </label>

                            <button
                                type="button"
                                onClick={handleOpenForgotModal}
                                className="text-xs font-semibold text-[#1A5C38] dark:text-[#4B9B70] hover:underline cursor-pointer"
                            >
                                Lupa kata sandi?
                            </button>
                        </div>

                        {error && (
                            <div className="text-[#943838] dark:text-rose-200 bg-[#fcecec] dark:bg-rose-950/50 border border-[#f5c2c2] dark:border-rose-800 rounded-[10px] p-3 text-xs font-medium leading-relaxed">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full min-h-[46px] px-4 rounded-[10px] bg-[#1A5C38] hover:bg-[#13462A] text-white text-[13px] font-semibold flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-60 mt-1"
                        >
                            {loading ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" /> Memproses...
                                </>
                            ) : (
                                <span>Masuk</span>
                            )}
                        </button>
                    </form>

                    {/* Shortcut Akses Cepat (1-Klik langsung ke Supabase Auth) */}
                    <div className="mt-5 pt-4 border-t border-[var(--border-subtle)] space-y-2.5">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                                Shortcut Login (1-Klik)
                            </span>
                            <span className="text-[10px] text-[var(--text-muted)]">2 Peran Utama</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            {QUICK_LOGIN_ACCOUNTS.map(acc => (
                                <button
                                    key={acc.email}
                                    type="button"
                                    disabled={loading}
                                    onClick={() => handleQuickLogin(acc.email, acc.pw)}
                                    className={`flex flex-col items-start justify-between p-2.5 rounded-[10px] border text-left transition-all cursor-pointer disabled:opacity-60 ${
                                        email.trim().toLowerCase() === acc.email
                                            ? "border-[#1A5C38] dark:border-[#4B9B70] bg-[#EAF3EE]/70 dark:bg-emerald-950/50"
                                            : "border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-secondary)]"
                                    }`}
                                >
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[var(--bg-tertiary)] text-[#1A5C38] dark:text-[#4B9B70] mb-1">
                                        {acc.roleBadge}
                                    </span>
                                    <div className="font-semibold text-xs text-[var(--text-primary)] truncate w-full">
                                        {acc.label}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Forgot Password / Account Recovery Modal */}
            {showForgotModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
                    onClick={() => setShowForgotModal(false)}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Lupa Kata Sandi"
                >
                    <div
                        className="bg-[var(--bg-card)] rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border border-[var(--border-subtle)]"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-secondary)]">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-[#EAF3EE] dark:bg-emerald-950 text-[#1A5C38] dark:text-[#4B9B70] flex items-center justify-center">
                                    <KeyRound size={16} />
                                </div>
                                <h3 className="font-bold text-[var(--text-primary)] text-sm">
                                    Pemulihan Kata Sandi
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowForgotModal(false)}
                                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-full transition-colors cursor-pointer"
                            >
                                <X size={17} />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                                Masukkan email akun perusahaan Anda untuk menerima tautan pemulihan kata sandi dari Supabase Auth.
                            </p>

                            {recoverySuccess ? (
                                <div className="space-y-4">
                                    <div className="p-3.5 rounded-xl bg-[#EAF3EE] dark:bg-emerald-950/60 border border-[#c3d9cb] dark:border-emerald-800 text-[#173f30] dark:text-emerald-200 text-xs leading-relaxed flex items-start gap-2.5">
                                        <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-[#1A5C38] dark:text-[#4B9B70]" />
                                        <span>{recoverySuccess}</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowForgotModal(false)}
                                        className="w-full min-h-[42px] rounded-[10px] bg-[#1A5C38] hover:bg-[#13462A] text-white text-xs font-semibold transition-colors cursor-pointer"
                                    >
                                        Kembali ke Halaman Masuk
                                    </button>
                                </div>
                            ) : (
                                <form onSubmit={handleSendResetEmail} className="space-y-3.5">
                                    <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                                        <span>Email Akun</span>
                                        <input
                                            type="email"
                                            required
                                            value={recoveryEmail}
                                            onChange={e => setRecoveryEmail(e.target.value)}
                                            placeholder="nama@gucimaspratama.co.id"
                                            className="w-full min-h-[40px] px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-xs font-normal focus:border-[#1A5C38] focus:outline-none"
                                        />
                                    </label>

                                    {recoveryError && (
                                        <div className="text-[#943838] dark:text-rose-200 bg-[#fcecec] dark:bg-rose-950/50 border border-[#f5c2c2] dark:border-rose-800 rounded-[10px] p-2.5 text-xs">
                                            {recoveryError}
                                        </div>
                                    )}

                                    <div className="flex items-center gap-2 pt-1">
                                        <button
                                            type="button"
                                            onClick={() => setShowForgotModal(false)}
                                            className="flex-1 min-h-[40px] rounded-[10px] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-xs font-semibold hover:bg-[var(--bg-secondary)] transition-colors cursor-pointer"
                                        >
                                            Tutup
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={recoveryLoading}
                                            className="flex-1 min-h-[40px] px-3 rounded-[10px] bg-[#1A5C38] hover:bg-[#13462A] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
                                        >
                                            {recoveryLoading ? (
                                                <Loader2 size={14} className="animate-spin" />
                                            ) : (
                                                <span>Kirim Tautan Reset</span>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
