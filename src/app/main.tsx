import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/app/App';
import './index.css';

// Bersihkan Service Worker & Cache Workbox lama agar tidak mencegat modul JS baru dengan text/html
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', () => {
    window.location.reload();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then(registrations => {
        for (const registration of registrations) {
          registration.unregister().catch(() => {});
        }
      })
      .catch(() => {});
  }

  if ('caches' in window) {
    caches
      .keys()
      .then(keys => {
        for (const key of keys) {
          if (key.includes('workbox') || key.includes('precache')) {
            caches.delete(key).catch(() => {});
          }
        }
      })
      .catch(() => {});
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
