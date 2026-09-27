import { useState } from 'react';
import { Package, BookOpen, UploadCloud, ArrowRight, Sparkles, X } from 'lucide-react';

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
      background: 'rgba(6, 9, 19, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2000, padding: '16px'
    }}>
      <div className="glass-card" style={{
        width: '100%', maxWidth: '380px',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '20px 18px',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 20px 40px rgba(0,0,0,0.35)',
        position: 'relative',
        background: 'var(--bg-secondary)'
      }}>
        {/* Close Button */}
        <button
          onClick={onDismiss}
          title="Tutup Setup"
          style={{
            position: 'absolute', top: '12px', right: '12px',
            background: 'none', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', padding: '4px', display: 'flex',
            borderRadius: 'var(--radius-sm)'
          }}
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '16px', paddingRight: '12px', paddingLeft: '12px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '4px', background: 'var(--accent-glow)', padding: '2px 8px', borderRadius: '12px' }}>
            <Sparkles size={13} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '0.68rem', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
              Setup Awal — {tenantName || 'Tenant Baru'}
            </span>
          </div>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', margin: '4px 0 2px' }}>
            Selamat Datang di Barventis! 🎉
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', margin: 0, lineHeight: 1.35 }}>
            Ikuti 3 langkah mudah untuk mulai menggunakan sistem
          </p>
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', justifyContent: 'center' }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{
              flex: 1, height: '3px', borderRadius: '3px',
              background: i <= currentStep ? s.color : 'rgba(0,0,0,0.08)',
              transition: 'background 0.3s'
            }} />
          ))}
        </div>

        {/* Step card */}
        <div style={{
          background: 'var(--bg-tertiary)',
          border: `1px solid ${step.color}30`,
          borderRadius: 'var(--radius-md)',
          padding: '14px',
          marginBottom: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <div style={{
              width: '34px', height: '34px', borderRadius: 'var(--radius-sm)',
              background: `${step.color}18`, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              color: step.color, flexShrink: 0
            }}>
              <Icon size={18} />
            </div>
            <div>
              <span style={{ fontSize: '0.65rem', color: step.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block' }}>
                Langkah {currentStep + 1} dari 3
              </span>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                {step.title}
              </h3>
            </div>
          </div>

          <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', lineHeight: 1.45, marginBottom: '12px' }}>
            {step.description}
          </p>

          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '8px 14px', fontSize: '0.8rem', fontWeight: 600 }}
            onClick={() => {
              onNavigate(step.action);
              onDismiss();
            }}
          >
            {step.actionLabel}
          </button>
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '2px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            {currentStep > 0 && (
              <button
                className="btn btn-secondary"
                style={{ padding: '5px 10px', fontSize: '0.75rem' }}
                onClick={() => setCurrentStep(s => s - 1)}
              >
                ← Kembali
              </button>
            )}
            {currentStep < STEPS.length - 1 && (
              <button
                className="btn btn-secondary"
                style={{ padding: '5px 10px', fontSize: '0.75rem', display: 'flex', gap: '4px', alignItems: 'center' }}
                onClick={() => setCurrentStep(s => s + 1)}
              >
                Berikutnya <ArrowRight size={13} />
              </button>
            )}
          </div>
          <button
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer', padding: '5px' }}
            onClick={onDismiss}
          >
            Lewati Setup →
          </button>
        </div>
      </div>
    </div>
  );
}
