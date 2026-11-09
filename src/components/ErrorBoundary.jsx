import React from 'react';
import * as Sentry from '@sentry/react';

function isChunkLoadError(error) {
  const msg = String(error?.message || error || '');
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Expected a JavaScript-or-Wasm module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    error?.name === 'ChunkLoadError'
  );
}

async function clearCachesAndReload() {
  try {
    if (typeof window !== 'undefined' && 'caches' in window) {
      const keys = await window.caches.keys();
      await Promise.all(keys.map((k) => window.caches.delete(k)));
    }
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.update().catch(() => {})));
    }
  } catch (_) {
    // Ignore cache cleanup errors before reload
  }
  if (typeof window !== 'undefined') {
    const url = new URL(window.location.href);
    url.searchParams.set('_v', String(Date.now()));
    window.location.replace(url.toString());
  }
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, isChunkError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error, isChunkError: isChunkLoadError(error) };
  }

  componentDidCatch(error, errorInfo) {
    if (isChunkLoadError(error) && typeof window !== 'undefined') {
      const reloadKey = 'barventis_eb_chunk_reload_ts';
      const lastReload = Number(sessionStorage.getItem(reloadKey) || 0);
      const now = Date.now();
      if (now - lastReload > 15000) {
        sessionStorage.setItem(reloadKey, String(now));
        clearCachesAndReload();
        return;
      }
    }

    if (typeof Sentry !== 'undefined' && Sentry.captureException) {
      Sentry.captureException(error, { extra: errorInfo });
    }
    this.setState({ errorInfo });
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif' }}>
          <h2 style={{ color: '#ef4444' }}>
            {this.state.isChunkError ? 'Pembaruan Aplikasi Tersedia' : 'Terjadi Kesalahan Sistem'}
          </h2>
          <p style={{ color: '#475569', maxWidth: '460px', margin: '0.5rem auto 1rem' }}>
            {this.state.isChunkError
              ? 'Versi baru Barventis baru saja diterapkan di server. Silakan muat ulang halaman untuk menyinkronkan modul terbaru.'
              : 'Maaf, terjadi kesalahan yang tidak terduga pada halaman ini.'}
          </p>
          <button
            onClick={() => clearCachesAndReload()}
            style={{ marginTop: '0.5rem', padding: '10px 18px', background: '#15803d', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
          >
            Muat Ulang & Sinkronkan Versi Baru
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
