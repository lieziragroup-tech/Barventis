import React from 'react';
import { api } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase';
import barventisIcon from '../../assets/barventis-icon.png';

export default function AuthScreen({ onAuthSuccess }) {
  const toast = useToast();
  const [email, setEmail] = React.useState(() => localStorage.getItem('savedEmail') || '');
  const [password, setPassword] = React.useState('');
  const [name, setName] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [rememberMe, setRememberMe] = React.useState(() => localStorage.getItem('rememberMe') === 'true');

  // Invite Token States
  const queryParams = new URLSearchParams(window.location.search);
  const inviteToken = queryParams.get('token');
  const [tokenStatus, setTokenStatus] = React.useState(inviteToken ? 'checking' : 'none');
  // SEC-FIX 2026-08: previously read straight from the URL's `?role=` query
  // param, which anyone can edit in the address bar. registerWithToken() on
  // the backend already ignores this and uses the server-side `invite_role`
  // column instead (see api.js SEC fix), but the UI here still displayed
  // whatever the URL said — misleading, even though harmless server-side.
  // Now sourced from the same validated invitation row, so what's shown
  // always matches what actually gets assigned.
  const [inviteRole, setInviteRole] = React.useState(null);

  React.useEffect(() => {
    if (!inviteToken) return;
    async function validateToken() {
      try {
        const { data, error } = await supabase
          .from('invitations')
          .select('is_used, expires_at, invite_role')
          .eq('token', inviteToken)
          .single();
          
        if (error || !data) {
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (inviteToken) {
        // Register flow. Role is resolved server-side from the invitation
        // record (see api.js registerWithToken) — not passed from here.
        await api.registerWithToken(name, email, password, inviteToken);
        // Clean URL to remove token so reload doesn't trigger register again
        window.history.replaceState({}, document.title, window.location.pathname);
        // Supabase auto-logins after signup if email verification is off
        // But the profile might not be perfectly fetched immediately. We can just alert success.
        toast.showSuccess(`Registrasi berhasil! Anda sekarang terdaftar sebagai ${inviteRole || 'Staff'}.`);
        setTimeout(() => window.location.reload(), 1500);
      } else {
        // Login flow
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
            fontSize: '1.6rem', 
            fontWeight: '800', 
            color: 'var(--text-primary)', 
            margin: '0',
            letterSpacing: '1px',
            transition: 'all 0.5s ease'
          }}>
            {inviteToken ? (tokenStatus === 'valid' ? `REGISTRASI ${(inviteRole || 'STAFF').toUpperCase()}` : 'UNDANGAN TIDAK VALID') : 'BARVENTIS'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '6px' }}>
            {inviteToken 
              ? (tokenStatus === 'valid' ? 'Selesaikan pendaftaran untuk mengelola Resto Anda.' : 'Silakan minta link undangan baru ke Administrator.')
              : 'Manajemen Stok & COGS Barventis Terpusat'}
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
            <button className="btn" style={{ marginTop: '20px', padding: '10px 20px' }} onClick={() => window.location.href = '/'}>Kembali ke Login</button>
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

        {(tokenStatus === 'none' || tokenStatus === 'valid') && (
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

            {/* Remember Me */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '-6px', marginBottom: '4px' }}>
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

            {/* Submit Button */}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{
                width: '100%', padding: '12px', borderRadius: 'var(--radius-md)', fontWeight: '700', fontSize: '0.9rem', marginTop: '10px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                background: 'var(--accent)', border: 'none', color: 'var(--text-inverse)',
                boxShadow: 'var(--shadow-md)', cursor: 'pointer'
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


