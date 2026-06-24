import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '300px',
          padding: '40px',
          textAlign: 'center',
          background: 'rgba(239, 68, 68, 0.03)',
          border: '1px solid rgba(239, 68, 68, 0.15)',
          borderRadius: '16px',
          margin: '16px 0'
        }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '12px',
            background: 'rgba(239,68,68,0.1)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: '#ef4444', marginBottom: '16px'
          }}>
            <AlertTriangle size={28} />
          </div>
          <h3 style={{ color: 'white', fontSize: '1.1rem', fontWeight: 700, marginBottom: '8px' }}>
            Terjadi Kesalahan Sistem
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '8px', maxWidth: '400px' }}>
            {this.props.label || 'Komponen ini'} mengalami error tidak terduga.
          </p>
          {this.state.error && (
            <code style={{
              fontSize: '0.72rem', color: '#ef4444',
              background: 'rgba(239,68,68,0.08)', padding: '8px 14px',
              borderRadius: '8px', marginBottom: '20px',
              maxWidth: '500px', wordBreak: 'break-all', display: 'block'
            }}>
              {this.state.error.message}
            </code>
          )}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              className="btn btn-secondary"
              style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
              onClick={() => {
                this.setState({ hasError: false, error: null, errorInfo: null });
                window.location.reload();
              }}
            >
              <RefreshCw size={14} /> Muat Ulang Halaman
            </button>
            <button
              className="btn btn-primary"
              style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
              onClick={() => {
                this.setState({ hasError: false, error: null, errorInfo: null });
                if (this.props.role === 'Super Admin' || this.props.role === 'SuperAdmin') {
                  window.location.href = '/superadmin';
                } else {
                  window.location.href = '/';
                }
              }}
            >
              Kembali ke Dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
