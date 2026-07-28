import { X, BookOpen, Settings, ShoppingCart, Calculator, Store, LineChart, Database, FileText, FileSpreadsheet, Activity, ClipboardCheck, Laptop, Users } from 'lucide-react';

export default function GuidebookModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', animation: 'fadeIn 0.2s ease-out' }}>
      <div style={{ background: 'var(--bg-primary)', width: '100%', maxWidth: '800px', maxHeight: '90vh', borderRadius: 'var(--radius-xl)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
        
        {/* Header */}
        <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--accent-glow)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BookOpen size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Buku Panduan Sistem</h2>
              <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Pahami alur kerja Barventis dalam 4 langkah mudah</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)', transition: 'all 0.2s' }} onMouseOver={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--text-secondary)'; }} onMouseOut={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '32px', overflowY: 'auto', background: 'var(--bg-primary)' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
            {/* Connection Line */}
            <div style={{ position: 'absolute', left: '23px', top: '40px', bottom: '40px', width: '2px', background: 'var(--border)', zIndex: 0 }}></div>

            {/* Step 1 */}
            <div style={{ display: 'flex', gap: '24px', position: 'relative', zIndex: 1 }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--bg-primary)', border: '2px solid var(--info)', color: 'var(--info)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 0 4px var(--bg-primary)' }}>
                <Settings size={22} />
              </div>
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px', flex: 1, display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>1. Persiapan Data Master</h3>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    Mulai dengan mengisi <strong>Stock Ledger</strong> (Daftar bahan baku dasar seperti Biji Kopi, Gula) beserta harganya. Kemudian, racik bahan tersebut menjadi sebuah menu di <strong>COGS / Resep</strong> (contoh: 1 porsi Kopi Susu butuh 15g Kopi & 20g Gula).
                  </p>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <span className="badge badge-info">Stock Ledger</span>
                    <span className="badge badge-info">COGS / Resep</span>
                  </div>
                </div>
                <img src="/images/guide_step1.jpg" alt="Master Data" style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
              </div>
            </div>

            {/* Step 2 */}
            <div style={{ display: 'flex', gap: '24px', position: 'relative', zIndex: 1 }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--bg-primary)', border: '2px solid var(--warning)', color: 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 0 4px var(--bg-primary)' }}>
                <ShoppingCart size={22} />
              </div>
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px', flex: 1, display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>2. Pembelian & Stok Masuk</h3>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    Gunakan menu <strong>Purchasing</strong> untuk mencatat pengeluaran harian atau menu <strong>Invoicing</strong> jika Anda memesan dalam partai besar (PO) ke Supplier. Saat barang diterima (Received), stok akan <em>otomatis bertambah</em> di Gudang Utama (Central).
                  </p>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <span className="badge badge-warning">Purchasing</span>
                    <span className="badge badge-warning">Invoicing</span>
                  </div>
                </div>
                <img src="/images/guide_step2.jpg" alt="Pembelian" style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
              </div>
            </div>

            {/* Step 3 */}
            <div style={{ display: 'flex', gap: '24px', position: 'relative', zIndex: 1 }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--bg-primary)', border: '2px solid var(--accent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 0 4px var(--bg-primary)' }}>
                <Store size={22} />
              </div>
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px', flex: 1, display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>3. Kasir & Penjualan (POS)</h3>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    Setiap kali ada pesanan di <strong>POS Terminal</strong>, sistem akan otomatis melihat resep dari menu tersebut dan <em>mengurangi stok bahan baku</em> yang sesuai dari Gudang Resto secara seketika (Real-time deduction).
                  </p>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <span className="badge badge-accent">POS Terminal</span>
                    <span className="badge badge-accent">Auto-Deduction</span>
                  </div>
                </div>
                <img src="/images/guide_step3.jpg" alt="Kasir POS" style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
              </div>
            </div>

            {/* Step 4 */}
            <div style={{ display: 'flex', gap: '24px', position: 'relative', zIndex: 1 }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--bg-primary)', border: '2px solid var(--success)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 0 4px var(--bg-primary)' }}>
                <LineChart size={22} />
              </div>
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px', flex: 1, display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>4. Laporan & Kontrol</h3>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    Di penghujung hari/bulan, buka <strong>Barista Report</strong> untuk melihat total penjualan dan <strong>Cost Control</strong> untuk melihat Margin Keuntungan. Lakukan <strong>Stock Opname</strong> sesekali untuk menyamakan stok fisik dengan sistem.
                  </p>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <span className="badge badge-success">Barista Report</span>
                    <span className="badge badge-success">Cost Control</span>
                    <span className="badge badge-success">Stock Opname</span>
                  </div>
                </div>
                <img src="/images/guide_step4.jpg" alt="Laporan" style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
              </div>
            </div>

          </div>

          <div style={{ marginTop: '32px', background: 'var(--bg-secondary)', padding: '16px', borderRadius: 'var(--radius-md)', display: 'flex', gap: '16px', alignItems: 'center', border: '1px dashed var(--border)' }}>
            <div style={{ color: 'var(--text-muted)' }}>
              <Calculator size={24} />
            </div>
            <div>
              <h4 style={{ margin: '0 0 4px', fontSize: '0.9rem', fontWeight: 700 }}>Tips HPP (Harga Pokok Penjualan)</h4>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Harga bahan di Resep akan selalu mengikuti harga rata-rata bahan terakhir Anda (dari Purchasing/Invoice). Margin Anda selalu dihitung secara real-time.</p>
            </div>
          </div>

          <div style={{ marginTop: '40px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', borderBottom: '2px solid var(--border)', paddingBottom: '12px' }}>Panduan Menu (Sesuai Sidebar)</h3>
            
            {/* Group: Menu Utama */}
            <div style={{ marginBottom: '24px' }}>
              <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent)', marginBottom: '16px' }}>📁 Menu Utama</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                <div className="guide-card">
                  <h5>Dashboard</h5>
                  <p><strong>Fungsi:</strong> Ringkasan performa bisnis, grafik pendapatan, dan peringatan dini stok kritis.</p>
                  <p className="how-to"><strong>Cara Pakai:</strong> Buka untuk melihat omset hari ini. Cek bagian "Critical Stock" untuk tahu barang apa yang harus segera dibeli.</p>
                </div>
                <div className="guide-card">
                  <h5>Stock Ledger</h5>
                  <p><strong>Fungsi:</strong> Buku besar tempat pendaftaran bahan baku dasar (kopi, gula, susu) dan monitor sisa stok (Resto vs Central).</p>
                  <p className="how-to"><strong>Cara Pakai:</strong> Klik "Tambah Item" untuk bahan baru. Klik tombol mata untuk melihat mutasi/histori keluar-masuk stok barang tersebut.</p>
                </div>
                <div className="guide-card">
                  <h5>Daily Inventory</h5>
                  <p><strong>Fungsi:</strong> Pencatatan stok harian ringan oleh Barista (biasanya di awal atau akhir shift).</p>
                  <p className="how-to"><strong>Cara Pakai:</strong> Masukkan angka fisik di bar dan klik Save. Sistem akan mencatatnya tanpa melakukan koreksi sistem berat.</p>
                </div>
                <div className="guide-card">
                  <h5>Upload POS Sales</h5>
                  <p><strong>Fungsi:</strong> Mengunggah laporan penjualan dari mesin kasir (jika tidak terhubung otomatis) untuk memotong stok sesuai resep.</p>
                  <p className="how-to"><strong>Cara Pakai:</strong> Upload file Excel/CSV hasil tarikan dari Moka/Majoo/kasir. Sistem akan memotong stok otomatis.</p>
                </div>
                <div className="guide-card">
                  <h5>F&B Recipes</h5>
                  <p><strong>Fungsi:</strong> Pembuatan racikan menu (COGS). Menghitung modal (HPP) per porsi berdasarkan harga bahan baku.</p>
                  <p className="how-to"><strong>Cara Pakai:</strong> Pilih menu, tambahkan bahan-bahannya (misal: 15g kopi), lalu klik "Simpan". HPP akan langsung terhitung.</p>
                </div>
                <div className="guide-card">
                  <h5>Menu Pricing</h5>
                  <p><strong>Fungsi:</strong> Penentuan harga jual menu agar margin keuntungan selalu terjaga di persentase ideal.</p>
                  <p className="how-to"><strong>Cara Pakai:</strong> Lihat HPP menu, masukkan harga jual yang Anda inginkan, sistem akan menampilkan persentase margin keuntungan Anda.</p>
                </div>
              </div>
            </div>

            {/* Group: Operasional */}
            <div style={{ marginBottom: '24px' }}>
              <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--warning)', marginBottom: '16px' }}>⚙️ Operasional</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                <div className="guide-card">
                  <h5>Pembelian & Supplier</h5>
                  <p><strong>Fungsi:</strong> Mencatat nota belanja harian dan mengelola kontak Supplier.</p>
                  <p className="how-to"><strong>Cara Pakai:</strong> Buka tab "Input Pembelian", masukkan bahan yang dibeli, QTY, dan Harga. Otomatis menambah stok dan memperbarui harga rata-rata.</p>
                </div>
                <div className="guide-card">
                  <h5>Invoicing / PO</h5>
                  <p><strong>Fungsi:</strong> Membuat Purchase Order partai besar ke Supplier dan bisa dicetak (PDF).</p>
                  <p className="how-to"><strong>Cara Pakai:</strong> Klik "Buat Invoice Baru", isi barang. Klik "Cetak / PDF" untuk dikirim ke Supplier via WhatsApp. Klik "Terima" jika barang sudah sampai.</p>
                </div>
                <div className="guide-card">
                  <h5>Stock Opname</h5>
                  <p><strong>Fungsi:</strong> Menyamakan jumlah stok fisik di gudang dengan data di sistem (komputer).</p>
                  <p className="how-to"><strong>Cara Pakai:</strong> Buat Opname Baru, keliling gudang & hitung fisik barang, masukkan ke sistem, lalu "Selesaikan Opname" agar sistem menyesuaikan selisihnya.</p>
                </div>
                <div className="guide-card">
                  <h5>Cek Fisik & Waste</h5>
                  <p><strong>Fungsi:</strong> Mencatat barang yang tumpah, basi, atau terbuang (waste).</p>
                  <p className="how-to"><strong>Cara Pakai:</strong> Jika ada susu basi, catat di sini beserta alasannya (misal: "Basi karena kulkas mati"). Stok akan otomatis dikurangi.</p>
                </div>
                <div className="guide-card">
                  <h5>Asset & Equipment</h5>
                  <p><strong>Fungsi:</strong> Mencatat barang non-konsumsi (Mesin Kopi, Chiller, Meja) dan melacak nilai penyusutan.</p>
                  <p className="how-to"><strong>Cara Pakai:</strong> Tambah aset beserta masa pakainya (misal: 3 tahun). Sistem akan menghitung penyusutan per bulan.</p>
                </div>
                <div className="guide-card">
                  <h5>Cost Control</h5>
                  <p><strong>Fungsi:</strong> Laporan laba/rugi kotor berdasarkan HPP vs Harga Jual (Profit Margin).</p>
                  <p className="how-to"><strong>Cara Pakai:</strong> Buka untuk menganalisa menu mana yang paling menguntungkan dan mana yang marginnya bocor (kemahalan bahan).</p>
                </div>
              </div>
            </div>

            {/* Group: System */}
            <div>
              <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '16px' }}>🛡️ System</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                <div className="guide-card">
                  <h5>Audit Logs</h5>
                  <p><strong>Fungsi:</strong> CCTV Sistem. Mencatat setiap perubahan data dan aktivitas (Siapa melakukan apa dan jam berapa).</p>
                  <p className="how-to"><strong>Cara Pakai:</strong> Gunakan kotak pencarian untuk melacak jika ada stok yang tiba-tiba berubah secara mencurigakan.</p>
                </div>
                <div className="guide-card">
                  <h5>Tenant Settings</h5>
                  <p><strong>Fungsi:</strong> Mengganti profil perusahaan (Nama, Logo, Alamat).</p>
                  <p className="how-to"><strong>Cara Pakai:</strong> Sesuaikan data restoran Anda di sini. Data ini akan muncul di kop Invoice/PO cetak.</p>
                </div>
                <div className="guide-card">
                  <h5>Backup & Restore</h5>
                  <p><strong>Fungsi:</strong> Menyimpan database secara manual ke dalam file (Export) untuk keamanan.</p>
                  <p className="how-to"><strong>Cara Pakai:</strong> Klik "Backup Data" secara berkala (misal: seminggu sekali) agar data Anda memiliki cadangan aman.</p>
                </div>
                <div className="guide-card">
                  <h5>Maintenance</h5>
                  <p><strong>Fungsi:</strong> Pengaturan akun Staff (Karyawan), Hak Akses (Role), dan kalkulasi ulang HPP seluruh sistem.</p>
                  <p className="how-to"><strong>Cara Pakai:</strong> Tambah akun untuk Barista/Gudang di sini. Jika HPP dirasa tidak sinkron, gunakan tombol "Hitung Ulang HPP".</p>
                </div>
              </div>
            </div>

          </div>

          <style>{`
            .guide-card {
              background: var(--bg-secondary);
              padding: 16px;
              border-radius: var(--radius-lg);
              border: 1px solid var(--border);
            }
            .guide-card h5 {
              margin: 0 0 8px 0;
              font-size: 1rem;
              font-weight: 700;
              color: var(--text-primary);
            }
            .guide-card p {
              margin: 0 0 8px 0;
              font-size: 0.85rem;
              color: var(--text-secondary);
              line-height: 1.5;
            }
            .guide-card p.how-to {
              background: rgba(0,0,0,0.03);
              padding: 8px;
              border-radius: var(--radius-sm);
              border-left: 3px solid var(--accent);
              margin-bottom: 0;
            }
          `}</style>

        </div>
      </div>
    </div>
  );
}
