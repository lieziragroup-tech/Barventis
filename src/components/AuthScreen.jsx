import React, { useState } from 'react';
import { api } from '../services/api';

export default function AuthScreen({ onAuthSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [tenantName, setTenantName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        // Authenticate user (SuperAdmin tidak perlu tenantName)
        const data = await api.login(tenantName, email, password);
        if (data.user.role === 'SuperAdmin') {
          onAuthSuccess(data.user, 'superadmin');
        } else {
          onAuthSuccess(data.user, data.tenant.name);
        }
      } else {
        // Register new restaurant / tenant and run programmatic migrations
        const data = await api.register(tenantName, companyName, adminName, email, password);
        onAuthSuccess(data.user, data.tenant.name);
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
      background: 'radial-gradient(ellipse at bottom, #111a2e 0%, #060913 100%)',
      padding: '20px'
    }}>
      <div className="auth-card" style={{
        width: '100%',
        maxWidth: '440px',
        background: 'rgba(30, 41, 59, 0.45)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '36px',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
        transition: 'all 0.3s ease'
      }}>
        {/* Brand header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '52px',
            height: '52px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            color: '#fff',
            fontSize: '1.75rem',
            fontWeight: '800',
            marginBottom: '12px',
            boxShadow: '0 0 20px rgba(59, 130, 246, 0.4)'
          }}>B</div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: '800', color: '#f8fafc', margin: '0' }}>BARVENTIS</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '6px' }}>
            {isLogin ? 'Manajemen Stok & COGS Barventis Terpusat' : 'Daftarkan Restoran Anda di Platform Barventis'}
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

        {isLogin && (
          <div style={{
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: '8px',
            padding: '12px 14px',
            color: '#93c5fd',
            fontSize: '0.75rem',
            lineHeight: '1.5',
            marginBottom: '20px'
          }}>
            💡 <strong>Info Sistem Kolaboratif:</strong><br/>
            • Akun pertama yang didaftarkan otomatis menjadi <strong>Owner</strong> (akses penuh + kontrol penuh).<br/>
            • Kedua peran <strong>Owner</strong> dan <strong>Admin</strong> dapat mengakses semua fitur. Semua aktivitas dicatat di <strong>Audit Trail</strong> untuk akuntabilitas.
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Tenant Subdomain / ID */}
          <div>
            <label className="form-label" style={{ display: 'block', marginBottom: '6px', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
              Subdomain / ID Restoran
            </label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. barventis (kosongkan jika Super Admin)"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
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

          {!isLogin && (
            <>
              {/* Restaurant Business Name */}
              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '6px', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                  Nama Bisnis Restoran / Venue
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. PT Barventis Group"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required={!isLogin}
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

              {/* Owner / Administrator Name */}
              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '6px', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                  Nama Lengkap Admin / Owner
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Ghandi Barventis"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  required={!isLogin}
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
            </>
          )}

          {/* Email Address */}
          <div>
            <label className="form-label" style={{ display: 'block', marginBottom: '6px', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
              Alamat Email
            </label>
            <input
              type="email"
              className="form-control"
              placeholder="e.g. owner@barventis.com atau headbar@umatis.com"
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
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)'
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
            {loading ? 'Sedang Memproses...' : (isLogin ? 'Masuk ke Sistem' : 'Daftar & Konfigurasi database')}
          </button>
        </form>

        {/* CSS for Spinner animation */}
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>

        {/* Form Toggle */}
        <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '0.825rem', color: 'var(--text-muted)' }}>
          {isLogin ? (
            <span>
              Belum terdaftar?{' '}
              <button
                type="button"
                onClick={() => { setIsLogin(false); setError(''); }}
                style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: '600', cursor: 'pointer', padding: '0' }}
              >
                Buat Akun Resto Baru
              </button>
            </span>
          ) : (
            <span>
              Sudah memiliki akun?{' '}
              <button
                type="button"
                onClick={() => { setIsLogin(true); setError(''); }}
                style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: '600', cursor: 'pointer', padding: '0' }}
              >
                Silakan Masuk
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}