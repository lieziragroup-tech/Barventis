import React from 'react';
import { api } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase';
import barventisIcon from '../../assets/barventis-icon.png';

export default function AuthScreen({ onAuthSuccess, initialMode }) {
  const toast = useToast();

  // Mode: 'login' | 'forgot' | 'reset'
  const getInitialMode = () => {
    if (initialMode) return initialMode;
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      const search = window.location.search;
      const path = window.location.pathname;
      if (path === '/reset-password' || hash.includes('type=recovery') || search.includes('type=recovery')) {
        return 'reset';
      }
      if (path === '/forgot-password') {
        return 'forgot';
      }
    }
    return 'login';
  };

  const [mode, setMode] = React.useState(getInitialMode);

  // Login & Register Form State
  const [email, setEmail] = React.useState(() => localStorage.getItem('savedEmail') || '');
  const [password, setPassword] = React.useState('');
  const [name, setName] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [rememberMe, setRememberMe] = React.useState(() => localStorage.getItem('rememberMe') === 'true');

  // Forgot Password State
  const [forgotEmail, setForgotEmail] = React.useState(() => localStorage.getItem('savedEmail') || '');
  const [forgotLoading, setForgotLoading] = React.useState(false);
  const [forgotSent, setForgotSent] = React.useState(false);
  const [countdown, setCountdown] = React.useState(0);

  // Reset Password State
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showNewPassword, setShowNewPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [resetLoading, setResetLoading] = React.useState(false);
  const [resetSuccess, setResetSuccess] = React.useState(false);

  // Invite Token States
  const queryParams = new URLSearchParams(window.location.search);
  const inviteToken = queryParams.get('token');
  const [tokenStatus, setTokenStatus] = React.useState(inviteToken ? 'checking' : 'none');
  const [inviteRole, setInviteRole] = React.useState(null);

  // Listen for Supabase recovery events and hash changes
  React.useEffect(() => {
    const checkRecovery = () => {
      const hash = window.location.hash;
      const search = window.location.search;
      const path = window.location.pathname;
      if (path === '/reset-password' || hash.includes('type=recovery') || search.includes('type=recovery')) {
        setMode('reset');
      }
    };
    checkRecovery();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('reset');
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Resend Countdown Timer
  React.useEffect(() => {
    let timer;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  // Invitation token validation
  React.useEffect(() => {
    if (!inviteToken) return;
    async function validateToken() {
      try {
        const { data, error: fetchErr } = await supabase
          .from('invitations')
          .select('is_used, expires_at, invite_role')
          .eq('token', inviteToken)
          .single();
          
        if (fetchErr || !data) {
          setTokenStatus('invalid');
          return;
        }
        if (data.is_used) {
          setTokenStatus('used');
          return;
        }
        if (new Date(data.expires_at) < new Date()) {
          setTokenStatus('expired');
          return;
        }
        
        setInviteRole(data.invite_role || 'Staff');
        setTokenStatus('valid');
      } catch {
        setTokenStatus('invalid');
      }
    }
    validateToken();
  }, [inviteToken]);

  // Handle Login or Invite Registration
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (inviteToken) {
        await api.registerWithToken(name, email, password, inviteToken);
        window.history.replaceState({}, document.title, window.location.pathname);
        toast.showSuccess(`Registrasi berhasil! Anda sekarang terdaftar sebagai ${inviteRole || 'Staff'}.`);
        setTimeout(() => window.location.reload(), 1500);
      } else {
        if (rememberMe) {
          localStorage.setItem('rememberMe', 'true');
          localStorage.setItem('savedEmail', email);
        } else {
          localStorage.removeItem('rememberMe');
          localStorage.removeItem('savedEmail');
        }
        const sanitizedEmail = email.trim();
        const data = await api.login(sanitizedEmail, password.trim());
        if (onAuthSuccess) {
          onAuthSuccess(data.user, data.tenant.name);
        }
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Terjadi kesalahan sistem. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Forgot Password Request
  const handleForgotSubmit = async (e) => {
    if (e) e.preventDefault();
    setError('');
    const targetEmail = (forgotEmail || email).trim();
    if (!targetEmail) {
      setError('Silakan masukkan alamat email Anda.');
      return;
    }

    setForgotLoading(true);
    try {
      await api.resetPasswordForEmail(targetEmail);
      setForgotSent(true);
      setCountdown(60);
      toast.showSuccess('Link reset password berhasil dikirim ke email Anda.');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Gagal mengirim email reset password. Pastikan email terdaftar.');
    } finally {
      setForgotLoading(false);
    }
  };

  // Handle Reset Password (Setting new password)
  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('Password baru minimal harus 6 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi password tidak cocok dengan password baru.');
      return;
    }

    setResetLoading(true);
    try {
      await api.updatePassword(newPassword);
      setResetSuccess(true);
      toast.showSuccess('Password Anda berhasil diperbarui!');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Gagal memperbarui password. Silakan minta tautan baru.');
    } finally {
      setResetLoading(false);
    }
  };

  // Compute Page Header Content
  const getHeaderInfo = () => {
    if (inviteToken) {
      return {
        title: tokenStatus === 'valid' ? `REGISTRASI ${(inviteRole || 'STAFF').toUpperCase()}` : 'UNDANGAN TIDAK VALID',
        subtitle: tokenStatus === 'valid' ? 'Selesaikan pendaftaran untuk mengelola Resto Anda.' : 'Silakan minta link undangan baru ke Administrator.'
      };
    }
    if (mode === 'forgot') {
      return {
        title: 'LUPA PASSWORD',
        subtitle: 'Masukkan email terdaftar Anda untuk menerima tautan pemulihan kata sandi.'
      };
    }
    if (mode === 'reset') {
      return {
        title: 'ATUR ULANG PASSWORD',
        subtitle: 'Buat password baru yang aman untuk akun Barventis Anda.'
      };
    }
    return {
      title: 'BARVENTIS',
      subtitle: 'Manajemen Stok & COGS Barventis Terpusat'
    };
  };

  const header = getHeaderInfo();

  return (
    <div className="auth-wrapper" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      padding: '20px',
      transition: 'background 0.5s ease'
    }}>
      <div className="auth-card" style={{
        width: '100%',
        maxWidth: '440px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)',
        padding: '36px',
        boxShadow: 'var(--card-shadow)',
        transition: 'all 0.5s ease'
      }}>
        {/* Brand header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '48px',
            height: '48px',
            marginBottom: '12px',
            transition: 'all 0.5s ease'
          }}>
            <img src={barventisIcon} alt="Barventis" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          
          <h2 style={{ 
            fontSize: '1.5rem', 
            fontWeight: '800', 
            color: 'var(--text-primary)', 
            margin: '0',
            letterSpacing: '0.5px',
            transition: 'all 0.5s ease'
          }}>
            {header.title}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '6px', lineHeight: 1.4 }}>
            {header.subtitle}
          </p>
        </div>

        {/* Token Validation Status UI */}
        {inviteToken && tokenStatus === 'checking' && (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
            <span className="spinner" style={{ display: 'inline-block', width: '24px', height: '24px', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '10px' }}></span>
            <p style={{ fontSize: '0.9rem' }}>Memvalidasi undangan...</p>
          </div>
        )}

        {inviteToken && (tokenStatus === 'invalid' || tokenStatus === 'used' || tokenStatus === 'expired') && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ background: 'var(--danger-glow)', color: 'var(--danger-text)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(220, 38, 38, 0.15)' }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem' }}>
                {tokenStatus === 'invalid' && 'Undangan Tidak Ditemukan'}
                {tokenStatus === 'used' && 'Undangan Sudah Dipakai'}
                {tokenStatus === 'expired' && 'Undangan Sudah Kadaluarsa'}
              </h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Link yang Anda gunakan sudah tidak berlaku. Harap hubungi Admin Resto atau Super Admin untuk membuatkan link baru.
              </p>
            </div>
            <button className="btn" style={{ marginTop: '20px', padding: '10px 20px' }} onClick={() => window.location.href = '/login'}>Kembali ke Login</button>
          </div>
        )}

        {error && (
          <div style={{
            background: 'var(--danger-glow)',
            border: '1px solid rgba(220, 38, 38, 0.15)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            color: 'var(--danger-text)',
            fontSize: '0.825rem',
            marginBottom: '20px',
            lineHeight: '1.4'
          }}>
            {error}
          </div>
        )}

        {/* 1. FORGOT PASSWORD MODE */}
        {!inviteToken && mode === 'forgot' && (
          <>
            {forgotSent ? (
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'var(--success-glow, rgba(5, 150, 105, 0.1))',
                  color: 'var(--success, #059669)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px'
                }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Email Terkirim!
                </h3>
                <p style={{ margin: '0 0 14px 0', fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Kami telah mengirimkan tautan reset kata sandi ke:
                </p>
                <div style={{
                  background: 'var(--bg-tertiary)',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  color: 'var(--text-primary)',
                  marginBottom: '16px',
                  wordBreak: 'break-all'
                }}>
                  {forgotEmail || email}
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: 1.4 }}>
                  Periksa kotak masuk (inbox) atau folder Spam Anda. Klik tautan yang dikirim untuk mengatur kata sandi baru Anda.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={handleForgotSubmit}
                    disabled={countdown > 0 || forgotLoading}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: 'var(--radius-md)',
                      background: countdown > 0 ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      color: countdown > 0 ? 'var(--text-muted)' : 'var(--text-primary)',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      cursor: countdown > 0 ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {countdown > 0 ? `Kirim Ulang Email (${countdown}s)` : 'Kirim Ulang Email'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotSent(false);
                      setMode('login');
                      setError('');
                    }}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: 'var(--radius-md)',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      fontSize: '0.85rem',
                      cursor: 'pointer'
                    }}
                  >
                    ← Kembali ke Halaman Login
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div>
                  <label className="form-label" style={{ display: 'block', marginBottom: '6px', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                    Alamat Email Terdaftar
                  </label>
                  <input
                    type="email"
                    className="form-control"
                    placeholder="e.g. admin@barventis.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                    disabled={forgotLoading}
                    style={{
                      width: '100%', padding: '10px 14px', background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none'
                    }}
                  />
                  <p style={{ margin: '6px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Kami akan mengirimkan tautan aman untuk mengubah password Anda.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={forgotLoading || !forgotEmail.trim()}
                  style={{
                    width: '100%', padding: '12px', borderRadius: 'var(--radius-md)', fontWeight: '700', fontSize: '0.9rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    background: 'var(--accent)', border: 'none', color: 'var(--text-inverse)',
                    boxShadow: 'var(--shadow-md)', cursor: forgotLoading || !forgotEmail.trim() ? 'not-allowed' : 'pointer',
                    opacity: forgotLoading || !forgotEmail.trim() ? 0.7 : 1
                  }}
                >
                  {forgotLoading ? (
                    <span className="spinner" style={{
                      display: 'inline-block', width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.3)',
                      borderTopColor: 'var(--text-inverse)', borderRadius: '50%', animation: 'spin 0.8s linear infinite'
                    }}></span>
                  ) : null}
                  {forgotLoading ? 'Mengirim Link...' : 'Kirim Link Reset Password'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError('');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    marginTop: '4px',
                    textAlign: 'center'
                  }}
                >
                  ← Kembali ke Halaman Login
                </button>
              </form>
            )}
          </>
        )}

        {/* 2. RESET PASSWORD MODE (Entering New Password) */}
        {!inviteToken && mode === 'reset' && (
          <>
            {resetSuccess ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'var(--success-glow, rgba(5, 150, 105, 0.1))',
                  color: 'var(--success, #059669)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px'
                }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Password Berhasil Diperbarui!
                </h3>
                <p style={{ margin: '0 0 20px 0', fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Kata sandi baru Anda telah aktif. Anda sekarang dapat masuk menggunakan password baru tersebut.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setResetSuccess(false);
                    setMode('login');
                    window.history.replaceState({}, document.title, '/login');
                  }}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--accent)',
                    border: 'none',
                    color: 'var(--text-inverse)',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    boxShadow: 'var(--shadow-md)'
                  }}
                >
                  Masuk Sekarang
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div>
                  <label className="form-label" style={{ display: 'block', marginBottom: '6px', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                    Password Baru
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showNewPassword ? "text" : "password"}
                      className="form-control"
                      placeholder="Minimal 6 karakter"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                      disabled={resetLoading}
                      style={{
                        width: '100%', padding: '10px 40px 10px 14px', background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      style={{
                        position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px'
                      }}
                      tabIndex="-1"
                    >
                      {showNewPassword ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="form-label" style={{ display: 'block', marginBottom: '6px', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                    Konfirmasi Password Baru
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      className="form-control"
                      placeholder="Ulangi password baru"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      disabled={resetLoading}
                      style={{
                        width: '100%', padding: '10px 40px 10px 14px', background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      style={{
                        position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px'
                      }}
                      tabIndex="-1"
                    >
                      {showConfirmPassword ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Validation indicators */}
                <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '6px', padding: '2px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: newPassword.length >= 6 ? 'var(--success, #059669)' : 'var(--text-muted)' }}>
                    <span>{newPassword.length >= 6 ? '✓' : '•'}</span>
                    <span>Minimal 6 karakter</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: confirmPassword && newPassword === confirmPassword ? 'var(--success, #059669)' : 'var(--text-muted)' }}>
                    <span>{confirmPassword && newPassword === confirmPassword ? '✓' : '•'}</span>
                    <span>Konfirmasi password cocok</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={resetLoading || newPassword.length < 6 || newPassword !== confirmPassword}
                  style={{
                    width: '100%', padding: '12px', borderRadius: 'var(--radius-md)', fontWeight: '700', fontSize: '0.9rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    background: 'var(--accent)', border: 'none', color: 'var(--text-inverse)',
                    boxShadow: 'var(--shadow-md)',
                    cursor: resetLoading || newPassword.length < 6 || newPassword !== confirmPassword ? 'not-allowed' : 'pointer',
                    opacity: resetLoading || newPassword.length < 6 || newPassword !== confirmPassword ? 0.7 : 1
                  }}
                >
                  {resetLoading ? (
                    <span className="spinner" style={{
                      display: 'inline-block', width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.3)',
                      borderTopColor: 'var(--text-inverse)', borderRadius: '50%', animation: 'spin 0.8s linear infinite'
                    }}></span>
                  ) : null}
                  {resetLoading ? 'Menyimpan Password...' : 'Simpan Password Baru'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError('');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    marginTop: '4px',
                    textAlign: 'center'
                  }}
                >
                  ← Kembali ke Halaman Login
                </button>
              </form>
            )}
          </>
        )}

        {/* 3. DEFAULT LOGIN & REGISTRATION MODE */}
        {(tokenStatus === 'none' || tokenStatus === 'valid') && mode === 'login' && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Nama Lengkap (Only for Registration) */}
            {inviteToken && (
              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '6px', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Budi Santoso"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={!!inviteToken}
                  disabled={loading}
                  style={{
                    width: '100%', padding: '10px 14px', background: 'var(--bg-primary)',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none'
                  }}
                />
              </div>
            )}

            {/* Email Address */}
            <div>
              <label className="form-label" style={{ display: 'block', marginBottom: '6px', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                Alamat Email
              </label>
              <input
                type="email"
                className="form-control"
                placeholder="e.g. admin@barventis.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                style={{
                  width: '100%', padding: '10px 14px', background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none'
                }}
              />
            </div>

            {/* Password */}
            <div>
              <label className="form-label" style={{ display: 'block', marginBottom: '6px', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? "text" : "password"}
                  className="form-control"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  style={{
                    width: '100%', padding: '10px 40px 10px 14px', background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px'
                  }}
                  tabIndex="-1"
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  )}
                </button>
              </div>
            </div>

            {/* Remember Me & Forgot Password Row */}
            {!inviteToken && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '-6px', marginBottom: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="rememberMe"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <label htmlFor="rememberMe" style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    Ingat Saya
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setForgotEmail(email);
                    setForgotSent(false);
                    setMode('forgot');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent)',
                    fontSize: '0.825rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  Lupa Password?
                </button>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{
                width: '100%', padding: '12px', borderRadius: 'var(--radius-md)', fontWeight: '700', fontSize: '0.9rem', marginTop: '10px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                background: 'var(--accent)', border: 'none', color: 'var(--text-inverse)',
                boxShadow: 'var(--shadow-md)', cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? (
                <span className="spinner" style={{
                  display: 'inline-block', width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: 'var(--text-inverse)', borderRadius: '50%', animation: 'spin 0.8s linear infinite'
                }}></span>
              ) : null}
              {loading ? 'Sedang Memproses...' : (inviteToken ? 'Buat Akun' : 'Masuk ke Sistem')}
            </button>
          </form>
        )}

        {/* CSS for Spinner animation */}
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}
