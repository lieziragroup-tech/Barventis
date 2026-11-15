import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { Lock, Building, User, Mail, ShieldAlert, CheckCircle2, ArrowRight, Eye, EyeOff, Sparkles, Store, Zap, Database } from 'lucide-react';
import barventisIcon from '../../assets/barventis-icon.png';

export default function AuthScreen() {
  const { checkCurrentAuth } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'invite'
  const [inviteToken, setInviteToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [betaLoadingKey, setBetaLoadingKey] = useState('');
  const [seedLoading, setSeedLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showInvitePassword, setShowInvitePassword] = useState(false);

  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [inviteData, setInviteData] = useState({ name: '', email: '', password: '' });

  const betaPresets = typeof api.getBetaTestingPresets === 'function' ? api.getBetaTestingPresets() : [];

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('invite');
    if (token) {
      setInviteToken(token);
      setMode('invite');
    } else if (location.pathname === '/register') {
      setMode('register');
    } else {
      setMode('login');
    }
  }, [location]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      await api.login(loginData.email, loginData.password);
      await checkCurrentAuth();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBetaShortcutLogin = async (preset) => {
    if (!preset || loading || betaLoadingKey) return;
    setError('');
    setSuccessMsg('');
    setLoginData({ email: preset.email, password: preset.password });
    setBetaLoadingKey(preset.key);
    try {
      await api.loginWithBetaShortcut(preset.key);
      await checkCurrentAuth();
    } catch (err) {
      setError(err?.message || 'Gagal masuk dengan akun shortcut Beta Testing. Pastikan script SQL v13 sudah dijalankan di Supabase.');
    } finally {
      setBetaLoadingKey('');
    }
  };

  const handleFillOnly = (preset, e) => {
    e.stopPropagation();
    setError('');
    setLoginData({ email: preset.email, password: preset.password });
    setSuccessMsg(`Kredensial ${preset.label} (${preset.email}) telah diisi ke form login.`);
  };

  const handleInviteRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (inviteData.password.length < 6) throw new Error('Password minimal 6 karakter');
      await api.registerWithToken(inviteData.name, inviteData.email, inviteData.password, inviteToken);
      setSuccessMsg('Registrasi staf berhasil! Mengarahkan ke sistem...');
      setTimeout(async () => {
        await api.login(inviteData.email, inviteData.password);
        await checkCurrentAuth();
      }, 1500);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary)',
      padding: '20px',
      fontFamily: 'var(--font-sans)',
      color: 'var(--text-primary)'
    }}>
      <div className="glass-panel animate-fade-in" style={{
        maxWidth: mode === 'login' ? '520px' : '440px',
        width: '100%',
        padding: '36px 32px',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--border-strong)',
        boxShadow: 'var(--card-shadow)',
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--bg-secondary)'
      }}>
        {/* Top Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            width: '56px', height: '56px',
            borderRadius: '16px',
            background: 'var(--accent-glow)',
            border: '1px solid var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px',
            color: 'var(--accent)',
            boxShadow: '0 8px 16px -4px rgba(0, 0, 0, 0.2)'
          }}>
            <img src={barventisIcon} alt="Barventis" style={{ width: '38px', height: '38px', objectFit: 'contain' }} />
          </div>
          <h1 style={{ fontSize: '1.65rem', fontWeight: '800', letterSpacing: '-0.02em', marginBottom: '6px' }}>
            BARVENTIS
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            {mode === 'login' && 'Masuk ke Workspace Cost Control & Inventory Resto Umatis'}
            {mode === 'register' && 'Daftarkan Bisnis F&B / Restoran Baru'}
            {mode === 'invite' && 'Undangan Bergabung Staf Operasional'}
          </p>
        </div>

        {/* Alerts */}
        {error && (
          <div style={{
            padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 'var(--radius-md)',
            color: '#ef4444', fontSize: '0.85rem', marginBottom: '20px',
            display: 'flex', alignItems: 'center', gap: '10px'
          }}>
            <ShieldAlert size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div style={{
            padding: '12px 16px', background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 'var(--radius-md)',
            color: '#10b981', fontSize: '0.85rem', marginBottom: '20px',
            display: 'flex', alignItems: 'center', gap: '10px'
          }}>
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Forms */}
        {mode === 'login' && (
          <>
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  ALAMAT EMAIL
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={18} style={{ position: 'absolute', left: '14px', top: '12px', color: 'var(--text-muted)' }} />
                  <input
                    type="email"
                    required
                    placeholder="owner.beta@umatis.id"
                    value={loginData.email}
                    onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                    style={{
                      width: '100%', padding: '10px 14px 10px 42px',
                      borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
                      background: 'var(--bg-primary)', color: 'var(--text-primary)',
                      fontSize: '0.92rem'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  KATA SANDI
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={18} style={{ position: 'absolute', left: '14px', top: '12px', color: 'var(--text-muted)' }} />
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    value={loginData.password}
                    onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                    style={{
                      width: '100%', padding: '10px 42px 10px 42px',
                      borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
                      background: 'var(--bg-primary)', color: 'var(--text-primary)',
                      fontSize: '0.92rem'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    aria-label={showLoginPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                    style={{
                      position: 'absolute', right: '12px', top: '10px',
                      background: 'none', border: 'none', padding: '2px',
                      color: 'var(--text-muted)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || Boolean(betaLoadingKey)}
                style={{
                  marginTop: '4px', width: '100%', padding: '11px',
                  background: 'var(--accent)', color: 'var(--text-inverse)',
                  border: 'none', borderRadius: 'var(--radius-md)',
                  fontSize: '0.92rem', fontWeight: '700', cursor: (loading || betaLoadingKey) ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  transition: 'all 0.2s', opacity: (loading || betaLoadingKey) ? 0.7 : 1
                }}
              >
                {loading ? 'Memverifikasi...' : <>Masuk Sekarang <ArrowRight size={18} /></>}
              </button>
            </form>

            {/* BETA TESTING 1-CLICK LOGIN SHORTCUT PANEL */}
            {betaPresets.length > 0 && (
              <div style={{
                marginTop: '22px',
                padding: '16px',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <Zap size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.78rem', fontWeight: '800', letterSpacing: '0.03em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
                      Shortcut Login Beta Testing (Resto Umatis)
                    </span>
                  </div>
                  <span style={{
                    fontSize: '0.68rem',
                    fontWeight: '700',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    background: 'var(--accent-glow)',
                    color: 'var(--accent)',
                    border: '1px solid var(--accent)'
                  }}>
                    BSD & Kasuna
                  </span>
                </div>

                <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: '1.45' }}>
                  Klik salah satu akun sementara di bawah untuk langsung masuk (1-Klik) sesuai role dan cabang pengujian:
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {betaPresets.map((preset) => {
                    const isThisLoading = betaLoadingKey === preset.key;
                    return (
                      <div
                        key={preset.key}
                        onClick={() => handleBetaShortcutLogin(preset)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleBetaShortcutLogin(preset);
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '10px',
                          padding: '10px 12px',
                          borderRadius: 'var(--radius-md)',
                          border: isThisLoading ? '1px solid var(--accent)' : '1px solid var(--border)',
                          background: isThisLoading ? 'var(--accent-glow)' : 'var(--bg-secondary)',
                          cursor: (loading || betaLoadingKey) ? 'wait' : 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.84rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                              {preset.label}
                            </span>
                            <span style={{
                              fontSize: '0.65rem',
                              fontWeight: '700',
                              padding: '1px 6px',
                              borderRadius: '6px',
                              background: 'var(--bg-tertiary)',
                              color: 'var(--accent)',
                              border: '1px solid var(--border)'
                            }}>
                              {preset.badge}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {preset.sublabel} • <code style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{preset.email}</code>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                          <button
                            type="button"
                            onClick={(e) => handleFillOnly(preset, e)}
                            disabled={loading || Boolean(betaLoadingKey)}
                            title="Isi form email & password saja"
                            style={{
                              padding: '5px 8px',
                              fontSize: '0.7rem',
                              fontWeight: '600',
                              borderRadius: '6px',
                              border: '1px solid var(--border)',
                              background: 'var(--bg-primary)',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer'
                            }}
                          >
                            Isi Form
                          </button>
                          <span style={{
                            padding: '5px 10px',
                            fontSize: '0.72rem',
                            fontWeight: '700',
                            borderRadius: '6px',
                            background: 'var(--accent)',
                            color: 'var(--text-inverse)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            {isThisLoading ? 'Masuk...' : <>Masuk <ArrowRight size={13} /></>}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{
                  marginTop: '10px',
                  paddingTop: '8px',
                  borderTop: '1px dashed var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.71rem',
                  color: 'var(--text-muted)'
                }}>
                  <span>Password seragam: <strong>BetaUmatis2026!</strong></span>
                  <span>Data Dummy: <strong>BSD & Kasuna</strong></span>
                </div>
              </div>
            )}
          </>
        )}

        {mode === 'register' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{
              padding: '20px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              marginBottom: '20px'
            }}>
              <Building size={32} style={{ color: 'var(--accent)', margin: '0 auto 12px', display: 'block' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '8px', color: 'var(--text-primary)' }}>
                Pendaftaran Hanya Melalui Super Admin
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
                Pembuatan akun bisnis / restoran baru dikelola langsung oleh tim Barventis.
                Silakan hubungi Administrator untuk mendapatkan akses workspace restoran Anda, atau gunakan <strong>Shortcut Beta Testing</strong> pada halaman Login.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); }}
              style={{
                width: '100%', padding: '12px',
                background: 'var(--accent)', color: 'var(--text-inverse)',
                border: 'none', borderRadius: 'var(--radius-md)',
                fontSize: '0.95rem', fontWeight: '700', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
              }}
            >
              Kembali ke Halaman Login <ArrowRight size={18} />
            </button>
          </div>
        )}

        {mode === 'invite' && (
          <form onSubmit={handleInviteRegister} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ padding: '12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--accent)', fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
              Anda diundang untuk bergabung sebagai Staf Operasional. Silakan lengkapi profil Anda.
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                NAMA LENGKAP STAF
              </label>
              <div style={{ position: 'relative' }}>
                <User size={18} style={{ position: 'absolute', left: '14px', top: '12px', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  required
                  placeholder="Andi Barista"
                  value={inviteData.name}
                  onChange={(e) => setInviteData({ ...inviteData, name: e.target.value })}
                  style={{
                    width: '100%', padding: '10px 14px 10px 42px',
                    borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
                    background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.95rem'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                EMAIL STAF
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={18} style={{ position: 'absolute', left: '14px', top: '12px', color: 'var(--text-muted)' }} />
                <input
                  type="email"
                  required
                  placeholder="staf@restoran.com"
                  value={inviteData.email}
                  onChange={(e) => setInviteData({ ...inviteData, email: e.target.value })}
                  style={{
                    width: '100%', padding: '10px 14px 10px 42px',
                    borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
                    background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.95rem'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                BUAT KATA SANDI
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={{ position: 'absolute', left: '14px', top: '12px', color: 'var(--text-muted)' }} />
                <input
                  type={showInvitePassword ? 'text' : 'password'}
                  required
                  placeholder="Minimal 6 karakter"
                  value={inviteData.password}
                  onChange={(e) => setInviteData({ ...inviteData, password: e.target.value })}
                  style={{
                    width: '100%', padding: '10px 42px 10px 42px',
                    borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
                    background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.95rem'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowInvitePassword(!showInvitePassword)}
                  aria-label={showInvitePassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                  style={{
                    position: 'absolute', right: '12px', top: '10px',
                    background: 'none', border: 'none', padding: '2px',
                    color: 'var(--text-muted)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  {showInvitePassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: '8px', width: '100%', padding: '12px',
                background: 'var(--accent)', color: 'var(--text-inverse)',
                border: 'none', borderRadius: 'var(--radius-md)',
                fontSize: '0.95rem', fontWeight: '700', cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                transition: 'all 0.2s', opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? 'Bergabung...' : <>Selesaikan Pendaftaran <ArrowRight size={18} /></>}
            </button>
          </form>
        )}

      </div>
    </div>
  );
}
