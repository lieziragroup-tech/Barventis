import { useState } from 'react';
import { 
  Package, 
  BookOpen, 
  ClipboardCheck, 
  UploadCloud, 
  ArrowRight, 
  Sparkles, 
  CheckCircle2, 
  HelpCircle,
  TrendingDown
} from 'lucide-react';

const STEPS = [
  {
    id: 'stock',
    icon: Package,
    badge: 'Langkah 1 • Master Data',
    title: 'Daftarkan Bahan Baku & Kemasan',
    subtitle: 'Kunci satuan dasar (gram / ml) dan ukuran pack botol/karton',
    description: 'Bahan baku adalah fondasi Barventis. Masukkan nama bahan, harga beli, dan ukuran kemasan (misal 1 botol = 750 ml). Sistem akan menggunakannya untuk menghitung stok utuh vs sisa timbang.',
    action: 'stock',
    actionLabel: 'Buka Stock Ledger →',
    color: 'var(--accent)',
    highlight: 'Contoh: Susu Fresh (1.000 ml), Biji Kopi House Blend (1.000 gr), Sirup Karamel (750 ml).'
  },
  {
    id: 'recipes',
    icon: BookOpen,
    badge: 'Langkah 2 • Costing / COGS',
    title: 'Buat Resep & Kunci HPP Menu',
    subtitle: 'Modal per porsi terhitung otomatis dari harga bahan baku',
    description: 'Rakit menu minuman/makanan dengan memasukkan gramasi atau mililiter bahan. HPP (Harga Pokok Penjualan) akan otomatis dihitung dan diperbarui real-time saat harga belanja berubah.',
    action: 'recipes',
    actionLabel: 'Buka Recipe Builder →',
    color: 'var(--success)',
    highlight: 'Contoh: 1 porsi Iced Latte = 18 gr Espresso + 150 ml Susu + 20 ml Sirup. HPP otomatis Rp 6.200.'
  },
  {
    id: 'daily',
    icon: ClipboardCheck,
    badge: 'Langkah 3 • Operasional EOD',
    title: 'Closing Harian: FULL & BROKEN',
    subtitle: 'Barista cukup hitung botol utuh dan timbang botol terbuka',
    description: 'Rahasia akurasi Barventis: Barista tidak perlu pusing mengira-ngira isi botol. Cukup catat kemasan utuh (FULL) di rak dan timbang kemasan yang sedang terpakai (BROKEN) dalam satuan ml/gr.',
    action: 'daily',
    actionLabel: 'Buka Daily Inventory →',
    color: '#06b6d4',
    highlight: 'Contoh: 3 botol Sirup utuh (FULL = 3) + 1 botol terbuka di meja bar ditimbang sisa 420 ml (BROKEN = 420).'
  },
  {
    id: 'pos',
    icon: UploadCloud,
    badge: 'Langkah 4 • Audit & Rekonsiliasi',
    title: 'Sinkronisasi POS & Deteksi Kebocoran',
    subtitle: 'Bandingkan pemakaian riil vs teoretis penjualan kasir',
    description: 'Tarik laporan kasir POS (ESB, Moka, dsb). Sistem akan memotong stok secara teoretis sesuai resep dan langsung membandingkannya dengan sisa fisik closing. Selisih (variance) bocor langsung terdeteksi!',
    action: 'pos',
    actionLabel: 'Buka POS Sync →',
    color: 'var(--warning)',
    highlight: 'Deteksi otomatis: over-portioning barista, tumpah tak tercatat, atau pemborosan bahan.'
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
        width: '100%', maxWidth: '560px',
        padding: '36px 32px',
        border: '1px solid var(--border)',
        boxShadow: '0 30px 60px rgba(0,0,0,0.5)',
        position: 'relative'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
            <Sparkles size={18} style={{ color: 'var(--warning)' }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>
              Setup Awal — {tenantName || 'Tenant Baru'}
            </span>
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
            Selamat Datang di Barventis!
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Pahami alur kerja Daily Inventory & Cost Control dalam 4 langkah mudah
          </p>
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', justifyContent: 'center' }}>
          {STEPS.map((s, i) => (
            <div 
              key={s.id} 
              onClick={() => setCurrentStep(i)}
              style={{
                flex: 1, height: '4px', borderRadius: '4px',
                background: i <= currentStep ? s.color : 'rgba(255,255,255,0.08)',
                cursor: 'pointer',
                transition: 'background 0.3s'
              }} 
            />
          ))}
        </div>

        {/* Step card */}
        <div style={{
          background: 'var(--bg-tertiary)',
          border: `1px solid ${step.color}33`,
          borderRadius: 'var(--radius-xl)',
          padding: '24px',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
            <div style={{
              width: '46px', height: '46px', borderRadius: 'var(--radius-lg)',
              background: `${step.color}18`, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              color: step.color, flexShrink: 0
            }}>
              <Icon size={24} />
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ 
                fontSize: '0.7rem', 
                color: step.color, 
                fontWeight: 700, 
                textTransform: 'uppercase', 
                letterSpacing: '0.5px' 
              }}>
                {step.badge}
              </span>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', margin: '4px 0 2px' }}>
                {step.title}
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
                {step.subtitle}
              </p>
            </div>
          </div>

          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.55, marginBottom: '14px' }}>
            {step.description}
          </p>

          <div style={{ 
            background: 'var(--bg-secondary)', 
            border: '1px solid var(--border)', 
            borderRadius: 'var(--radius-md)', 
            padding: '10px 12px', 
            marginBottom: '18px',
            fontSize: '0.78rem',
            color: 'var(--text-secondary)'
          }}>
            <strong style={{ color: 'var(--text-primary)' }}>💡 Praktik Lapangan: </strong> 
            {step.highlight}
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '10px 20px', gap: '8px' }}
            onClick={() => {
              onNavigate(step.action);
              onDismiss();
            }}
          >
            {step.actionLabel}
          </button>
        </div>

        {/* Navigation & Skip */}
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
