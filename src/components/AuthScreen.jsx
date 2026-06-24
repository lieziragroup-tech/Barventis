import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

export default function AuthScreen({ onAuthSuccess, isSuperAdminMode = false }) {
  const navigate = useNavigate();
  const [tenantName, setTenantName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const activeTenant = isSuperAdminMode ? 'superadmin' : tenantName;

      // H-4: Super Admin authority is verified server-side by DB role (api.login +
      // RLS is_super_admin()), so no hardcoded-email gate is needed in the client.
      const data = await api.login(activeTenant, email, password);
      onAuthSuccess(data.user, data.tenant.name);
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
      background: isSuperAdminMode
        ? 'radial-gradient(ellipse at bottom, #1e150a 0%, #060503 100%)'
        : 'radial-gradient(ellipse at bottom, #111a2e 0%, #060913 100%)',
      padding: '20px',
      transition: 'background 0.5s ease'
    }}>
      <div className="auth-card" style={{
        width: '100%',
        maxWidth: '440px',
        background: isSuperAdminMode ? 'rgba(30, 25, 20, 0.45)' : 'rgba(30, 41, 59, 0.45)',
        backdropFilter: 'blur(20px)',
        border: isSuperAdminMode ? '1px solid rgba(245, 158, 11, 0.15)' : '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '36px',
        boxShadow: isSuperAdminMode ? '0 20px 40px rgba(245, 158, 11, 0.05)' : '0 20px 40px rgba(0, 0, 0, 0.4)',
        transition: 'all 0.5s ease'
      }}>
        {/* Brand header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '52px',
            height: '52px',
            borderRadius: '12px',
            background: isSuperAdminMode 
              ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' 
              : 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            color: '#fff',
            fontSize: '1.75rem',
            fontWeight: '800',
            marginBottom: '12px',
            boxShadow: isSuperAdminMode 
              ? '0 0 20px rgba(245, 158, 11, 0.4)' 
              : '0 0 20px rgba(59, 130, 246, 0.4)',
            transition: 'all 0.5s ease'
          }}>B</div>
          
          <h2 style={{ 
            fontSize: '1.6rem', 
            fontWeight: '800', 
            color: isSuperAdminMode ? '#fbbf24' : '#f8fafc', 
            margin: '0',
            letterSpacing: '1px',
            textShadow: isSuperAdminMode ? '0 0 10px rgba(251, 191, 36, 0.2)' : 'none',
            transition: 'all 0.5s ease'
          }}>
            {isSuperAdminMode ? 'BARVENTIS SYSTEM' : 'BARVENTIS'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '6px' }}>
            {isSuperAdminMode ? 'Super Admin Central Console Portal' : 'Manajemen Stok & COGS Barventis Terpusat'}
          </p>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            padding: '12px 16px',
            color: '#fca5a5',
            fontSize: '0.825rem',
            marginBottom: '20px',
            lineHeight: '1.4'
          }}>
            {error}
          </div>
        )}

        {isSuperAdminMode && (
          <div style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.2)',
            borderRadius: '8px',
            padding: '12px 14px',
            color: '#fef08a',
            fontSize: '0.75rem',
            lineHeight: '1.5',
            marginBottom: '20px'
          }}>
            🛡️ <strong>Portal Keamanan Tinggi:</strong><br/>
            Sesi masuk ini dipantau. Hak akses Super Admin digunakan untuk manajemen lisensi tenant global, template POS, dan log audit sistem.
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Tenant Subdomain / ID */}
          {!isSuperAdminMode && (
            <div>
              <label className="form-label" style={{ display: 'block', marginBottom: '6px', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                Subdomain / ID Restoran
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. barventis"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                required={!isSuperAdminMode}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              />
              <small style={{ color: 'var(--text-muted)', fontSize: '0.725rem', display: 'block', marginTop: '4px' }}>
                Digunakan untuk menghubungkan ke database terisolasi Anda.
              </small>
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
                width: '100%',
                padding: '10px 14px',
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '0.9rem',
                outline: 'none'
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
                width: '100%',
                padding: '10px 14px',
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              fontWeight: '700',
              fontSize: '0.9rem',
              marginTop: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              background: isSuperAdminMode 
                ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' 
                : 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              border: 'none',
              color: '#fff',
              boxShadow: isSuperAdminMode 
                ? '0 4px 12px rgba(245, 158, 11, 0.25)' 
                : '0 4px 12px rgba(59, 130, 246, 0.25)',
              cursor: 'pointer'
            }}
          >
            {loading ? (
              <span className="spinner" style={{
                display: 'inline-block',
                width: '18px',
                height: '18px',
                border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: '#fff',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite'
              }}></span>
            ) : null}
            {loading ? 'Sedang Memproses...' : 'Masuk ke Sistem'}
          </button>
        </form>

        {/* Toggle between Tenant Login and Super Admin Portal */}
        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button
            type="button"
            onClick={() => navigate(isSuperAdminMode ? '/' : '/superadmin')}
            style={{
              background: 'none',
              border: 'none',
              color: isSuperAdminMode ? '#fbbf24' : '#3b82f6',
              fontSize: '0.8rem',
              cursor: 'pointer',
              textDecoration: 'underline',
              opacity: 0.8
            }}
          >
            {isSuperAdminMode ? 'Masuk sebagai Tenant / Restoran' : 'Portal Keamanan Super Admin'}
          </button>
        </div>

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
