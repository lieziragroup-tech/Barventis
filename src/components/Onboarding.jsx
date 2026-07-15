import { useState } from 'react';
import { Package, BookOpen, UploadCloud, ArrowRight, Sparkles } from 'lucide-react';

const STEPS = [
  {
    icon: Package,
    title: 'Tambah Bahan Baku Pertama',
    subtitle: 'Mulai dengan mendaftarkan bahan-bahan yang digunakan di restoran Anda',
    description: 'Bahan baku adalah fondasi sistem ini. Setelah ditambahkan, semua stok, resep, dan laporan HPP akan terhubung ke sini.',
    action: 'stock',
    actionLabel: 'Buka Manajemen Stok →',
    color: 'var(--accent)'
  },
  {
    icon: BookOpen,
    title: 'Buat Resep & Hitung HPP',
    subtitle: 'Daftarkan resep menu beserta komposisi bahan dan biaya produksinya',
    description: 'Sistem akan otomatis menghitung Harga Pokok Produksi (HPP) setiap menu berdasarkan bahan yang Anda input.',
    action: 'recipes',
    actionLabel: 'Buka Recipe Builder →',
    color: 'var(--success)'
  },
  {
    icon: UploadCloud,
    title: 'Sinkronisasi Data POS',
    subtitle: 'Upload laporan penjualan dari kasir POS Anda untuk deduct stok otomatis',
    description: 'Upload file Excel dari Moka, Pawoon, Olsera, atau kasir apapun. Sistem akan mencocokkan menu dan memotong stok bahan secara otomatis.',
    action: 'pos',
    actionLabel: 'Buka POS Sync →',
    color: 'var(--warning)'
  }
];

export default function Onboarding({ onNavigate, onDismiss, tenantName }) {
  const [currentStep, setCurrentStep] = useState(0);
  const step = STEPS[currentStep];
  const Icon = step.icon;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(6, 9, 19, 0.88)',
      backdropFilter: 'blur(16px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2000, padding: '20px'
    }}>
      <div className="glass-card" style={{
        width: '100%', maxWidth: '520px',
        padding: '40px 36px',
        border: '1px solid var(--border)',
        boxShadow: '0 30px 60px rgba(0,0,0,0.5)',
        position: 'relative'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
            <Sparkles size={18} style={{ color: 'var(--warning)' }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>
              Setup Awal — {tenantName || 'Tenant Baru'}
            </span>
          </div>
           <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-inverse)', marginBottom: '4px' }}>
            Selamat Datang di Barventis! 🎉
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Ikuti 3 langkah ini untuk mulai menggunakan sistem
          </p>
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '28px', justifyContent: 'center' }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{
              flex: 1, height: '4px', borderRadius: '4px',
              // Each completed bar uses its OWN step color (was always the active step's). (LOW #24)
              background: i <= currentStep ? s.color : 'rgba(255,255,255,0.08)',
              transition: 'background 0.3s'
            }} />
          ))}
        </div>

        {/* Step card */}
        <div style={{
          background: 'var(--bg-tertiary)',
          border: `1px solid ${step.color}22`,
          borderRadius: 'var(--radius-xl)',
          padding: '28px 24px',
          marginBottom: '24px'
        }}>
          <div style={{
            width: '52px', height: '52px', borderRadius: 'var(--radius-lg)',
            background: `${step.color}18`, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: step.color, marginBottom: '16px'
          }}>
            <Icon size={26} />
          </div>
          <span style={{ fontSize: '0.7rem', color: step.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Langkah {currentStep + 1} dari 3
          </span>
           <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-inverse)', margin: '6px 0 8px' }}>
            {step.title}
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.55, marginBottom: '20px' }}>
            {step.description}
          </p>
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '10px 20px' }}
            onClick={() => {
              onNavigate(step.action);
              onDismiss();
            }}
          >
            {step.actionLabel}
          </button>
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {currentStep > 0 && (
              <button
                className="btn btn-secondary"
                style={{ padding: '8px 14px', fontSize: '0.8rem' }}
                onClick={() => setCurrentStep(s => s - 1)}
              >
                ← Kembali
              </button>
            )}
            {currentStep < STEPS.length - 1 && (
              <button
                className="btn btn-secondary"
                style={{ padding: '8px 14px', fontSize: '0.8rem', display: 'flex', gap: '6px', alignItems: 'center' }}
                onClick={() => setCurrentStep(s => s + 1)}
              >
                Langkah Berikutnya <ArrowRight size={14} />
              </button>
            )}
          </div>
          <button
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer', padding: '8px' }}
            onClick={onDismiss}
          >
            Lewati Setup →
          </button>
        </div>
      </div>
    </div>
  );
}
