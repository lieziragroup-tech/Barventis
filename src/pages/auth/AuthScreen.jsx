import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase';

export default function AuthScreen({ onAuthSuccess }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Invite Token States
  const queryParams = new URLSearchParams(window.location.search);
  const inviteToken = queryParams.get('token');
  const [tokenStatus, setTokenStatus] = useState(inviteToken ? 'checking' : 'none');
  const [inviteRole, setInviteRole] = useState('');

  useEffect(() => {
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
        
        setInviteRole(data.invite_role || 'Owner');
        setTokenStatus('valid');
      } catch (err) {
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
        // Register flow
        const user = await api.registerWithToken(name, email, password, inviteToken);
        // Clean URL to remove token so reload doesn't trigger register again
        window.history.replaceState({}, document.title, window.location.pathname);
        // Supabase auto-logins after signup if email verification is off
        // But the profile might not be perfectly fetched immediately. We can just alert success.
        toast.showSuccess('Registrasi berhasil! Anda sekarang adalah Owner dari Tenant ini.');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        // Login flow
        const data = await api.login(email, password);
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
            borderRadius: 'var(--radius-lg)',
            background: 'var(--accent)',
            color: 'var(--text-inverse)',
            fontSize: '1.5rem',
            fontWeight: '800',
            marginBottom: '12px',
            boxShadow: 'var(--shadow-md)',
            transition: 'all 0.5s ease'
          }}>B</div>
          
          <h2 style={{ 
            fontSize: '1.6rem', 
            fontWeight: '800', 
            color: 'var(--text-primary)', 
            margin: '0',
            letterSpacing: '1px',
            transition: 'all 0.5s ease'
          }}>
            {inviteToken ? (tokenStatus === 'valid' ? `REGISTRASI ${inviteRole.toUpperCase()}` : 'UNDANGAN TIDAK VALID') : 'BARVENTIS'}
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
              <input
                type="password"
                className="form-control"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                style={{
                  width: '100%', padding: '10px 14px', background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none'
                }}
              />
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


