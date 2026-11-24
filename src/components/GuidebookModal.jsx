import { useState } from 'react';
import { 
  X, 
  BookOpen, 
  Settings, 
  ShoppingCart, 
  Calculator, 
  Store, 
  LineChart, 
  Scale, 
  HelpCircle, 
  LayoutDashboard, 
  ClipboardList, 
  Boxes, 
  Trash2, 
  ArrowRight, 
  CheckCircle2, 
  AlertTriangle,
  Flame,
  Layers
} from 'lucide-react';

export default function GuidebookModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('workflow');

  if (!isOpen) return null;

  return (
    <div style={{ 
      position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, 
      background: 'rgba(6, 9, 19, 0.85)', 
      backdropFilter: 'blur(12px)', 
      zIndex: 9999, 
      display: 'flex', alignItems: 'center', justifyContent: 'center', 
      padding: '20px', 
      animation: 'fadeIn 0.2s ease-out' 
    }}>
      <div style={{ 
        background: 'var(--bg-primary)', 
        width: '100%', maxWidth: '860px', maxHeight: '92vh', 
        borderRadius: 'var(--radius-xl)', 
        boxShadow: '0 30px 60px -12px rgba(0,0,0,0.6)', 
        border: '1px solid var(--border)', 
        display: 'flex', flexDirection: 'column', 
        overflow: 'hidden' 
      }}>
        
        {/* Header */}
        <div style={{ 
          padding: '20px 28px', 
          borderBottom: '1px solid var(--border)', 
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
          background: 'var(--bg-secondary)' 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ 
              width: '42px', height: '42px', borderRadius: '12px', 
              background: 'var(--accent-glow, rgba(99,102,241,0.15))', 
              color: 'var(--accent)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center' 
            }}>
              <BookOpen size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Buku Panduan Sistem Barventis
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Pedoman alur kerja operasional F&B: Bar, Kitchen, Purchasing & Cost Control
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            style={{ 
              background: 'var(--bg-primary)', 
              border: '1px solid var(--border)', 
              borderRadius: '50%', 
              width: '36px', height: '36px', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', 
              cursor: 'pointer', color: 'var(--text-muted)', 
              transition: 'all 0.2s' 
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Buttons */}
        <div style={{ 
          display: 'flex', gap: '8px', padding: '12px 28px', 
          background: 'var(--bg-tertiary, var(--bg-secondary))', 
          borderBottom: '1px solid var(--border)',
          overflowX: 'auto'
        }}>
          {[
            { id: 'workflow', label: '1. Alur Kerja Utama', icon: Layers },
            { id: 'full-broken', label: '2. Rahasia FULL & BROKEN', icon: Scale },
            { id: 'modules', label: '3. Kamus Modul & Menu', icon: LayoutDashboard },
            { id: 'faq', label: '4. FAQ & Anti-Bocor HPP', icon: HelpCircle }
          ].map(tab => {
            const TabIcon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 16px', borderRadius: 'var(--radius-md)',
                  fontSize: '0.82rem', fontWeight: isActive ? 700 : 500,
                  background: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--text-secondary)',
                  border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease'
                }}
              >
                <TabIcon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <div style={{ padding: '28px', overflowY: 'auto', background: 'var(--bg-primary)', flex: 1 }}>
          
          {/* TAB 1: WORKFLOW */}
          {activeTab === 'workflow' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                padding: '16px 20px',
                display: 'flex', alignItems: 'center', gap: '14px'
              }}>
                <div style={{ color: 'var(--accent)' }}>
                  <Layers size={24} />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Segitiga Operasional: Barista (Resto) ⇄ Purchasing ⇄ Central Warehouse
                  </h4>
                  <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    Barventis menyelaraskan pengadaan barang kartonan di Central, stok racik harian di Resto, dan audit variansi HPP bulanan.
                  </p>
                </div>
              </div>

              {/* Step 1 */}
              <div className="flow-card">
                <div className="flow-number" style={{ borderColor: 'var(--info)', color: 'var(--info)' }}>1</div>
                <div className="flow-content">
                  <div className="flow-header">
                    <div>
                      <h3>1. Master Bahan Baku & Resep Menu</h3>
                      <p>Daftarkan bahan baku di <strong>Stock Ledger</strong> dengan satuan dasar (gram/ml) dan ukuran kemasan (pack). Setelah itu, racik menu di <strong>COGS / Resep</strong>. HPP modal per porsi langsung terkunci otomatis.</p>
                      <div className="badge-row">
                        <span className="badge badge-info">Stock Ledger</span>
                        <span className="badge badge-info">COGS / Resep</span>
                        <span className="badge badge-info">Menu Pricing</span>
                      </div>
                    </div>
                    <img src="/images/guide_step1.jpg" alt="Master Data" className="guide-thumb" />
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flow-card">
                <div className="flow-number" style={{ borderColor: 'var(--warning)', color: 'var(--warning)' }}>2</div>
                <div className="flow-content">
                  <div className="flow-header">
                    <div>
                      <h3>2. Belanja (Purchasing) & Transfer Central-ke-Resto</h3>
                      <p>Belanja harian (pasar/supplier) dicatat di <strong>Marketlist & Pembelian</strong>. Pengadaan grosir kartonan masuk ke Central. Saat meja bar kekurangan bahan, lakukan <strong>Transfer Bahan</strong> dari Central ke Resto.</p>
                      <div className="badge-row">
                        <span className="badge badge-warning">Purchasing / PO</span>
                        <span className="badge badge-warning">Transfer Internal</span>
                        <span className="badge badge-warning">Penerimaan (GRN)</span>
                      </div>
                    </div>
                    <img src="/images/guide_step2.jpg" alt="Pembelian" className="guide-thumb" />
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flow-card">
                <div className="flow-number" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>3</div>
                <div className="flow-content">
                  <div className="flow-header">
                    <div>
                      <h3>3. Kasir Berjalan & Closing EOD Barista</h3>
                      <p>Setiap transaksi penjualan kasir (POS) memotong stok teoretis sesuai resep. Di akhir shift malam, barista cukup mengisi <strong>Daily Inventory</strong>: hitung kemasan utuh (FULL) dan timbang kemasan buka (BROKEN).</p>
                      <div className="badge-row">
                        <span className="badge badge-accent">POS Terminal</span>
                        <span className="badge badge-accent">Daily Inventory EOD</span>
                        <span className="badge badge-accent">Lapor Limbah (Waste)</span>
                      </div>
                    </div>
                    <img src="/images/guide_step3.jpg" alt="Kasir & Closing" className="guide-thumb" />
                  </div>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flow-card">
                <div className="flow-number" style={{ borderColor: 'var(--success)', color: 'var(--success)' }}>4</div>
                <div className="flow-content">
                  <div className="flow-header">
                    <div>
                      <h3>4. Rekonsiliasi Otomatis & Cost Control</h3>
                      <p>Sistem membandingkan pemakaian fisik aktual (EOD) dengan penjualan kasir (POS). Selisih porsi (over-portioning) atau barang hilang langsung muncul di <strong>Cost Control Report</strong>. Lakukan Stock Opname bulanan untuk audit final.</p>
                      <div className="badge-row">
                        <span className="badge badge-success">Cost Control Hub</span>
                        <span className="badge badge-success">Audit Variansi Biaya</span>
                        <span className="badge badge-success">Stock Opname</span>
                      </div>
                    </div>
                    <img src="/images/guide_step4.jpg" alt="Cost Control" className="guide-thumb" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: FULL & BROKEN */}
          {activeTab === 'full-broken' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(6,182,212,0.08) 100%)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-xl)',
                padding: '24px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <Scale size={24} style={{ color: 'var(--accent)' }} />
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Mengapa Barventis Memakai Konsep FULL & BROKEN?
                  </h3>
                </div>
                <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Di industri F&B, sumber kekacauan stok terbesar adalah <strong>botol yang sudah dibuka di meja bar</strong>. Jika staf hanya menebak "kira-kira tinggal setengah botol", maka dalam seminggu stok sistem akan rusak dan perhitungan HPP tidak akurat.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                <div style={{
                  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)', padding: '20px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <span style={{ 
                      background: 'rgba(59,130,246,0.15)', color: '#3b82f6', 
                      fontWeight: 800, padding: '4px 10px', borderRadius: '6px', fontSize: '0.8rem' 
                    }}>
                      FULL
                    </span>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Kemasan Utuh (Belum Dibuka)
                    </h4>
                  </div>
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                    Jumlah botol, karton, atau pack yang masih bersegel rapi di rak/chiller. Dihitung per satuan pack (misal: <strong>3 botol</strong>).
                  </p>
                </div>

                <div style={{
                  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)', padding: '20px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <span style={{ 
                      background: 'rgba(6,182,212,0.15)', color: '#06b6d4', 
                      fontWeight: 800, padding: '4px 10px', borderRadius: '6px', fontSize: '0.8rem' 
                    }}>
                      BROKEN
                    </span>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Kemasan Terbuka (Timbang Aktual)
                    </h4>
                  </div>
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                    Sisa isi dari botol yang sedang dipakai di speed rail meja bar. Timbang dengan timbangan digital dalam satuan dasar (misal: <strong>350 ml</strong> atau <strong>180 gr</strong>).
                  </p>
                </div>
              </div>

              {/* Ilustrasi Rumus */}
              <div style={{
                background: 'var(--bg-secondary)', border: '1px dashed var(--border)',
                borderRadius: 'var(--radius-lg)', padding: '20px'
              }}>
                <h4 style={{ margin: '0 0 10px', fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent)' }}>
                  📐 Rumus Stok Closing Otomatis Sistem
                </h4>
                <div style={{
                  background: 'var(--bg-primary)', padding: '12px 16px', borderRadius: 'var(--radius-md)',
                  fontFamily: 'monospace', fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '12px',
                  border: '1px solid var(--border)'
                }}>
                  Total Stok Fisik = (FULL × Ukuran Pack) + BROKEN
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                  <strong>Contoh Sirup Karamel (1 pack = 750 ml):</strong> Barista mencatat 2 botol utuh di chiller (FULL = 2) dan 1 botol terbuka di meja bar ditimbang sisa 250 ml (BROKEN = 250). Sistem otomatis mengunci stok riil adalah <strong>1.750 ml</strong>. Besok paginya, angka 1.750 ml otomatis diwariskan jadi <em>Saldo Awal (Opening)</em>.
                </p>
              </div>

              <div style={{
                background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)',
                borderRadius: 'var(--radius-md)', padding: '14px 18px', display: 'flex', gap: '12px', alignItems: 'center'
              }}>
                <AlertTriangle size={20} style={{ color: '#f59e0b', flexShrink: 0 }} />
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  <strong>Aturan EOD:</strong> Jika suatu bahan tidak ada pemakaian hari ini, jangan diisi 0. Sistem akan mempertahankan stok warisan closing kemarin.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: MODULES DIRECTORY */}
          {activeTab === 'modules' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--accent)', marginBottom: '12px' }}>
                  🍹 Lantai Bar & Dapur (Operasional Shift)
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px' }}>
                  <div className="module-item">
                    <h5>Daily Inventory EOD</h5>
                    <p>Form pencatatan fisik penutupan shift (FULL & BROKEN). Diisi barista tiap malam.</p>
                  </div>
                  <div className="module-item">
                    <h5>Olah Bahan (Simple Prep)</h5>
                    <p>Mencatat produksi batch setengah jadi (rebusan teh 10L, simple syrup, perasan jeruk).</p>
                  </div>
                  <div className="module-item">
                    <h5>Lapor Limbah (Waste)</h5>
                    <p>Mencatat bahan basi, tumpah, atau botol pecah dengan lampiran foto bukti.</p>
                  </div>
                </div>
              </div>

              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--warning)', marginBottom: '12px' }}>
                  📦 Gudang Central & Pengadaan (Purchasing)
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px' }}>
                  <div className="module-item">
                    <h5>Marketlist & Pembelian</h5>
                    <p>Daftar rencana belanja harian dan input nota belanjaan pasar langsung ke resto.</p>
                  </div>
                  <div className="module-item">
                    <h5>Invoicing / PO Supplier</h5>
                    <p>Pemesanan kartonan besar ke supplier resmi lengkap dengan cetak format PDF.</p>
                  </div>
                  <div className="module-item">
                    <h5>Transfer Central ⇄ Resto</h5>
                    <p>Pencatatan perpindahan bahan dari gudang pusat ke meja bar agar stok sinkron.</p>
                  </div>
                </div>
              </div>

              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--success)', marginBottom: '12px' }}>
                  📊 Resep, Finansial & Cost Control
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px' }}>
                  <div className="module-item">
                    <h5>Recipe Builder & HPP (COGS)</h5>
                    <p>Menentukan komposisi racikan menu. HPP dihitung otomatis dari harga beli rata-rata.</p>
                  </div>
                  <div className="module-item">
                    <h5>Upload Penjualan POS</h5>
                    <p>Mengunggah laporan omzet dari kasir POS untuk pemotongan stok otomatis via resep.</p>
                  </div>
                  <div className="module-item">
                    <h5>Cost Control Report</h5>
                    <p>Audit variansi biaya bulanan, deteksi pemborosan barista, dan target rasio biaya ≤27%.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: FAQ & ANTI-BOCOR */}
          {activeTab === 'faq' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                {
                  q: 'Kenapa HPP menu saya tiba-tiba naik atau berwarna merah?',
                  a: 'HPP Barventis menggunakan metode rata-rata tertimbang (Moving Weighted Average) dari belanja terbaru. Jika supplier menaikkan harga atau ada input harga nota yang salah di menu Purchasing, HPP resep akan otomatis menyesuaikan.'
                },
                {
                  q: 'Kenapa ada variansi (selisih) antara sisa fisik dan penjualan POS?',
                  a: 'Ada 3 kemungkinan utama: (1) Barista over-portioning (menuang takaran melebihi resep standar), (2) Ada tumpahan/waste yang belum dilaporkan di form Lapor Limbah, atau (3) Nama item di kasir POS belum dipetakan (mapping) ke resep COGS.'
                },
                {
                  q: 'Kapan sebaiknya melakukan Stock Opname menyeluruh?',
                  a: 'Disarankan dilakukan di akhir bulan secara serentak di dua zona (Resto dan Central). Stock Opname berfungsi mereset baseline fisik resmi dan menghitung audit laba/rugi bulanan.'
                },
                {
                  q: 'Bagaimana cara menangani bahan olahan batch (seperti Simple Syrup atau Seduhan Teh)?',
                  a: 'Gunakan modul "Olah Bahan / Simple Prep". Masukkan bahan mentah yang dipakai (misal 1 kg Gula + 1 liter Air), sistem akan memotong stok gula dan air, lalu menambah stok baru "Simple Syrup 1.500 ml" dengan HPP yang sudah terakumulasi.'
                }
              ].map((item, idx) => (
                <div key={idx} style={{
                  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)', padding: '16px 20px'
                }}>
                  <h4 style={{ margin: '0 0 6px', fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    ❓ {item.q}
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                    {item.a}
                  </p>
                </div>
              ))}
            </div>
          )}

          <style>{`
            .flow-card {
              display: flex;
              gap: 18px;
              position: relative;
            }
            .flow-number {
              width: 38px;
              height: 38px;
              border-radius: 50%;
              background: var(--bg-primary);
              border: 2px solid;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: 800;
              font-size: 0.9rem;
              flex-shrink: 0;
            }
            .flow-content {
              background: var(--bg-secondary);
              border: 1px solid var(--border);
              border-radius: var(--radius-lg);
              padding: 18px 20px;
              flex: 1;
            }
            .flow-header {
              display: flex;
              gap: 16px;
              align-items: center;
              justify-content: space-between;
              flex-wrap: wrap;
            }
            .flow-header h3 {
              margin: 0 0 6px;
              font-size: 1.05rem;
              font-weight: 700;
              color: var(--text-primary);
            }
            .flow-header p {
              margin: 0 0 10px;
              font-size: 0.85rem;
              color: var(--text-secondary);
              line-height: 1.5;
              max-width: 540px;
            }
            .guide-thumb {
              width: 100px;
              height: 100px;
              object-fit: cover;
              border-radius: var(--radius-md);
              border: 1px solid var(--border);
              box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
            }
            .badge-row {
              display: flex;
              gap: 8px;
              flex-wrap: wrap;
            }
            .badge {
              font-size: 0.72rem;
              font-weight: 600;
              padding: 3px 8px;
              border-radius: 4px;
            }
            .badge-info {
              background: rgba(59,130,246,0.15);
              color: #3b82f6;
            }
            .badge-warning {
              background: rgba(245,158,11,0.15);
              color: #f59e0b;
            }
            .badge-accent {
              background: rgba(99,102,241,0.15);
              color: var(--accent);
            }
            .badge-success {
              background: rgba(16,185,129,0.15);
              color: #10b981;
            }
            .module-item {
              background: var(--bg-tertiary, var(--bg-primary));
              padding: 14px;
              border-radius: var(--radius-md);
              border: 1px solid var(--border);
            }
            .module-item h5 {
              margin: 0 0 4px 0;
              font-size: 0.88rem;
              font-weight: 700;
              color: var(--text-primary);
            }
            .module-item p {
              margin: 0;
              font-size: 0.78rem;
              color: var(--text-muted);
              line-height: 1.45;
            }
          `}</style>
        </div>
      </div>
    </div>
  );
}
