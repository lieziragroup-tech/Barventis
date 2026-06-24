import { useState, useEffect } from 'react';
import { 
  Database, Download, Trash2, RefreshCw, UploadCloud, 
  AlertTriangle, ShieldAlert, CheckCircle, Clock, FileArchive, X, Info
} from 'lucide-react';
import { api } from '../services/api';
import { supabase } from '../lib/supabase';
import confetti from 'canvas-confetti';

export default function BackupCenter() {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // File Upload states
  const [dragActive, setDragActive] = useState(false);
  const [, setUploadedFile] = useState(null);

  // Restore Modal states
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [selectedRestoreBackup, setSelectedRestoreBackup] = useState(null); // Local backup or uploaded file
  const [restoreConfirmText, setRestoreConfirmText] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    fetchBackups();
  }, []);

  const fetchBackups = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getBackups();
      setBackups(data);
    } catch (err) {
      console.error("Error loading backups:", err);
      setError(err.message || "Gagal memuat daftar file backup.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBackup = async () => {
    setActionLoading(true);
    try {
      const res = await api.createBackup();
      
      // Update list
      setBackups(prev => [res.backup, ...prev]);

      // Explode confetti on success
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#4c6ef5', '#51cf66', '#fcc419', '#845ef7']
      });

    } catch (err) {
      alert("Gagal membuat backup: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadBackup = async (filename) => {
    try {
      await api.downloadBackup(filename);
    } catch (err) {
      alert("Gagal mengunduh file backup: " + err.message);
    }
  };

  const handleDeleteBackup = async (filename) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus file cadangan "${filename}"? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }

    setActionLoading(true);
    try {
      await api.deleteBackup(filename);
      setBackups(prev => prev.filter(b => b.filename !== filename));
    } catch (err) {
      alert("Gagal menghapus backup: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Drag and Drop File Handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.zip')) {
        setUploadedFile(file);
        triggerRestoreModal(file);
      } else {
        alert("File harus berformat ZIP cadangan SQLite UMATIS.");
      }
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.name.endsWith('.zip')) {
        setUploadedFile(file);
        triggerRestoreModal(file);
      } else {
        alert("File harus berformat ZIP cadangan SQLite UMATIS.");
      }
    }
  };

  const triggerRestoreModal = (backupObjOrFile) => {
    setSelectedRestoreBackup(backupObjOrFile);
    setRestoreConfirmText('');
    setShowRestoreModal(true);
  };

  const closeRestoreModal = () => {
    if (isRestoring) return;
    setShowRestoreModal(false);
    setSelectedRestoreBackup(null);
    setUploadedFile(null);
    setRestoreConfirmText('');
  };

  const handleExecuteRestore = async () => {
    if (restoreConfirmText !== 'PULIHKAN') {
      alert("Konfirmasi tidak cocok. Harap ketik 'PULIHKAN' untuk melanjutkan.");
      return;
    }

    setIsRestoring(true);
    try {
      // If restoring from uploaded file
      if (selectedRestoreBackup instanceof File) {
        const formData = new FormData();
        formData.append('backup_file', selectedRestoreBackup);
        await api.restoreBackup(formData);
      }
      // If restoring from local file list
      else {
        await api.restoreBackup(selectedRestoreBackup.filename);
      }

      // Success Confetti
      confetti({
        particleCount: 200,
        spread: 100,
        colors: ['#51cf66', '#20c997']
      });

      alert(`Sukses! Database berhasil dipulihkan.\n\nSistem akan logout otomatis untuk memuat ulang sesi database.`);
      
      // Sign out via Supabase — App.jsx onAuthStateChange will handle cleanup
      await supabase.auth.signOut();
      window.location.reload();

    } catch (err) {
      alert("Pemulihan Gagal: " + err.message);
      setIsRestoring(false);
    }
  };

  // Helpers
  const formatDateTime = (isoString) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date);
  };

  // Accumulate stats
  const totalBackupsCount = backups.length;
  const totalSizeBytes = backups.reduce((acc, b) => acc + (b.size_bytes || 0), 0);
  const totalSizeFormatted = (totalSizeBytes / 1048576).toFixed(2) + ' MB';
  const lastBackupTime = backups.length > 0 ? formatDateTime(backups[0].created_at) : 'Belum pernah';

  return (
    <div className="backup-center-container">
      {/* KPI Cards */}
      <div className="kpi-grid" style={{ marginBottom: '24px' }}>
        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Total File Cadangan</span>
            <div className="kpi-icon-wrap" style={{ background: 'rgba(76, 110, 245, 0.1)', color: 'var(--accent)' }}>
              <Database size={20} />
            </div>
          </div>
          <div className="kpi-value">{totalBackupsCount}</div>
          <div className="kpi-footer">
            <span style={{ color: 'var(--text-secondary)' }}>ZIP SQLite per tenant</span>
          </div>
        </div>

        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Kapasitas Penyimpanan</span>
            <div className="kpi-icon-wrap" style={{ background: 'rgba(132, 94, 247, 0.1)', color: '#845ef7' }}>
              <FileArchive size={20} />
            </div>
          </div>
          <div className="kpi-value">{totalSizeFormatted}</div>
          <div className="kpi-footer">
            <span style={{ color: 'var(--text-secondary)' }}>Terkompresi hemat server</span>
          </div>
        </div>

        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Status Database</span>
            <div className="kpi-icon-wrap" style={{ background: 'rgba(81, 207, 102, 0.1)', color: 'var(--success)' }}>
              <CheckCircle size={20} />
            </div>
          </div>
          <div className="kpi-value" style={{ color: 'var(--success)' }}>TERHUBUNG</div>
          <div className="kpi-footer">
            <span style={{ color: 'var(--text-secondary)' }}>Koneksi SQLite Aktif</span>
          </div>
        </div>

        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Cadangan Terakhir</span>
            <div className="kpi-icon-wrap" style={{ background: 'rgba(252, 196, 25, 0.1)', color: 'var(--warning)' }}>
              <Clock size={20} />
            </div>
          </div>
          <div className="kpi-value" style={{ fontSize: backups.length > 0 ? '1.15rem' : '1.8rem', paddingTop: backups.length > 0 ? '6px' : '0' }}>
            {lastBackupTime}
          </div>
          <div className="kpi-footer">
            <span style={{ color: 'var(--text-secondary)' }}>Backup manual instan</span>
          </div>
        </div>
      </div>

      {/* Row 1: Backup trigger and drag-drop upload zone */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        {/* Generator card */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '8px' }}>Buat Cadangan Baru (Instant Backup)</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.5', marginBottom: '20px' }}>
              Membuat snapshot instan dari seluruh database Anda saat ini (stok bahan, riwayat transaksi, invoices, resep COGS, dan audit logs). File cadangan akan dikompresi ke dalam arsip ZIP yang aman dan disimpan di server.
            </p>
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '12px 16px',
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              marginBottom: '20px',
              display: 'flex',
              gap: '10px',
              alignItems: 'center'
            }}>
              <Info size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <span>Seluruh proses aman dilakukan saat server aktif. Sambungan database akan disegarkan otomatis.</span>
            </div>
          </div>
          <button 
            className="btn btn-primary" 
            onClick={handleCreateBackup}
            disabled={actionLoading || loading}
            style={{ width: '100%', padding: '12px', borderRadius: '10px', fontWeight: '700', display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}
          >
            <RefreshCw size={16} className={actionLoading ? 'animate-spin' : ''} style={{ animation: actionLoading ? 'spin 1s linear infinite' : 'none' }} />
            {actionLoading ? 'Memproses Arsip ZIP...' : 'Buat Backup Sekarang (ZIP)'}
          </button>
        </div>

        {/* Upload restore card */}
        <div className="glass-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '8px' }}>Pulihkan dari File Luar (Restore Backup)</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.5', marginBottom: '16px' }}>
            Unggah file backup ZIP yang pernah Anda unduh sebelumnya untuk memulihkan seluruh data sistem ke titik waktu cadangan tersebut.
          </p>

          <form 
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            style={{
              border: dragActive ? '2px dashed var(--accent)' : '2px dashed var(--border)',
              background: dragActive ? 'var(--accent-glow)' : 'rgba(255,255,255,0.01)',
              borderRadius: '12px',
              padding: '24px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              position: 'relative',
              transition: 'all 0.2s'
            }}
          >
            <input
              type="file"
              id="input-file-upload"
              accept=".zip"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <label htmlFor="input-file-upload" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <UploadCloud size={32} style={{ color: 'var(--accent)', marginBottom: '4px' }} />
              <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>Tarik & lepas file ZIP cadangan Anda</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>atau klik untuk menelusuri dari folder</span>
            </label>
          </form>
        </div>
      </div>

      {/* Row 2: List of backups */}
      <div className="glass-card" style={{ padding: '0px', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>Riwayat File Cadangan di Server</h3>
          <button 
            className="btn btn-secondary" 
            onClick={fetchBackups} 
            disabled={loading}
            style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', gap: '6px', alignItems: 'center' }}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Segarkan Tabel
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <div style={{
              display: 'inline-block',
              width: '28px',
              height: '28px',
              border: '3px solid rgba(255,255,255,0.1)',
              borderTopColor: 'var(--accent)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              marginBottom: '12px'
            }}></div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Memuat daftar cadangan...</p>
          </div>
        ) : error ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--danger)' }}>
            <AlertTriangle size={32} style={{ margin: '0 auto 12px' }} />
            <p style={{ fontSize: '0.9rem' }}>{error}</p>
          </div>
        ) : backups.length === 0 ? (
          <div style={{ padding: '60px 40px', textAlign: 'center' }}>
            <Database size={40} style={{ margin: '0 auto 12px', color: 'var(--text-muted)' }} />
            <h4 style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>Belum Ada File Cadangan</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Klik tombol "Buat Backup Sekarang" di atas untuk membuat file cadangan pertama Anda.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.01)' }}>
                  <th style={{ padding: '14px 20px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Nama File Backup</th>
                  <th style={{ padding: '14px 20px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Ukuran File</th>
                  <th style={{ padding: '14px 20px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Tanggal Pembuatan</th>
                  <th style={{ padding: '14px 20px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', textAlign: 'right' }}>Aksi Kelola</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.filename} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
                    <td style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <FileArchive size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.875rem', fontWeight: '600', fontFamily: 'monospace' }}>{b.filename}</span>
                      {b.filename.includes('recovery_before_restore') && (
                        <span style={{ 
                          fontSize: '0.65rem', 
                          background: 'rgba(252, 196, 25, 0.12)', 
                          color: 'var(--warning)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          border: '1px solid rgba(252,196,25,0.2)'
                        }}>
                          Recovery Point
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {b.size_formatted}
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {formatDateTime(b.created_at)}
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '8px' }}>
                        <button 
                          className="btn btn-secondary"
                          onClick={() => handleDownloadBackup(b.filename)}
                          title="Unduh File ZIP ke Komputer"
                          style={{ padding: '8px', borderRadius: '6px' }}
                        >
                          <Download size={14} />
                        </button>
                        
                        <button 
                          className="btn btn-secondary"
                          onClick={() => triggerRestoreModal(b)}
                          title="Kembalikan Sistem ke Titik Waktu Ini"
                          style={{ padding: '8px', color: 'var(--success)', borderColor: 'rgba(81, 207, 102, 0.2)', background: 'rgba(81, 207, 102, 0.03)' }}
                        >
                          <RefreshCw size={14} />
                        </button>

                        <button 
                          className="btn btn-secondary"
                          onClick={() => handleDeleteBackup(b.filename)}
                          disabled={actionLoading}
                          title="Hapus Cadangan Permanen"
                          style={{ padding: '8px', color: 'var(--danger)', borderColor: 'rgba(255, 107, 107, 0.2)', background: 'rgba(255, 107, 107, 0.03)' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* STRICT RESTORE MODAL */}
      {showRestoreModal && selectedRestoreBackup && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 17, 23, 0.85)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div className="glass-card" style={{
            width: '100%',
            maxWidth: '520px',
            position: 'relative',
            padding: '30px',
            border: '1px solid rgba(255, 107, 107, 0.2)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)'
          }}>
            {!isRestoring && (
              <button 
                onClick={closeRestoreModal}
                style={{
                  position: 'absolute',
                  top: '20px',
                  right: '20px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer'
                }}
              >
                <X size={20} />
              </button>
            )}

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: 'rgba(255, 107, 107, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--danger)',
                border: '1px solid rgba(255, 107, 107, 0.2)'
              }}>
                <ShieldAlert size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#fff' }}>PERINGATAN PEMULIHAN DATA!</h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tindakan Administratif Berisiko Tinggi</span>
              </div>
            </div>

            {isRestoring ? (
              <div style={{ textAlign: 'center', padding: '30px 10px' }}>
                <div style={{
                  display: 'inline-block',
                  width: '40px',
                  height: '40px',
                  border: '4px solid rgba(255,255,255,0.1)',
                  borderTopColor: 'var(--success)',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  marginBottom: '20px'
                }}></div>
                <h4 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '8px' }}>Merekam Recovery Snapshot & Menulis Ulang SQLite...</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Harap tunggu, proses restorasi sedang berjalan di server. Jangan menutup browser.</p>
              </div>
            ) : (
              <div>
                <div style={{
                  background: 'rgba(255, 107, 107, 0.05)',
                  border: '1px solid rgba(255, 107, 107, 0.15)',
                  borderRadius: '10px',
                  padding: '14px',
                  fontSize: '0.85rem',
                  lineHeight: '1.5',
                  color: 'var(--text-primary)',
                  marginBottom: '20px'
                }}>
                  <p style={{ marginBottom: '8px' }}>
                    Anda akan memulihkan database sistem menggunakan cadangan:
                  </p>
                  <p style={{ fontFamily: 'monospace', fontWeight: '700', color: 'var(--danger)', fontSize: '0.8rem', background: 'rgba(0,0,0,0.2)', padding: '6px 10px', borderRadius: '6px', marginBottom: '8px', wordBreak: 'break-all' }}>
                    {selectedRestoreBackup instanceof File ? selectedRestoreBackup.name : selectedRestoreBackup.filename}
                  </p>
                  <p style={{ fontWeight: '600' }}>
                    ⚠️ PERHATIAN: Semua perubahan data yang dilakukan SEJAK cadangan ini dibuat akan tertimpa dan terhapus secara permanen!
                  </p>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '8px', textTransform: 'uppercase' }}>
                    Harap ketik kata <span style={{ color: 'var(--danger)', fontWeight: '700' }}>PULIHKAN</span> untuk mengonfirmasi:
                  </label>
                  <input
                    type="text"
                    placeholder="Ketik PULIHKAN"
                    value={restoreConfirmText}
                    onChange={(e) => setRestoreConfirmText(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      fontSize: '0.9rem',
                      fontWeight: '700',
                      letterSpacing: '1px',
                      textAlign: 'center',
                      outline: 'none'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <button 
                    className="btn btn-secondary" 
                    onClick={closeRestoreModal}
                    style={{ padding: '10px 20px', borderRadius: '8px' }}
                  >
                    Batal
                  </button>
                  <button 
                    className="btn btn-primary"
                    disabled={restoreConfirmText !== 'PULIHKAN'}
                    onClick={handleExecuteRestore}
                    style={{
                      padding: '10px 20px',
                      borderRadius: '8px',
                      background: restoreConfirmText === 'PULIHKAN' ? 'var(--danger)' : 'var(--bg-tertiary)',
                      borderColor: restoreConfirmText === 'PULIHKAN' ? 'var(--danger)' : 'var(--border)',
                      color: restoreConfirmText === 'PULIHKAN' ? '#fff' : 'var(--text-muted)',
                      fontWeight: '700'
                    }}
                  >
                    Eksekusi Restorasi Data
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
