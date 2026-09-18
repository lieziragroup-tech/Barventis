/* Trimming Production 2-Stage — V2 Module */
import { useState, useEffect } from 'react';
import { Camera, CheckCircle, AlertTriangle, Package, Scale } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

export default function TrimmingProduction() {
  const { profile } = useAuth();
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [batches, setBatches] = useState([]);

  // Form state
  const [form, setForm] = useState({
    batch_id: '',
    material_id: '',
    target_material_id: '',
    gross_weight: '',
    clean_weight: '',
    waste_weight: '',
    portion_size: 100,
    portion_unit: 'gr',
    max_shrinkage_pct: 30,
    notes: '',
    // Photos
    gross_photo: null,
    clean_photo: null,
    waste_photo: null,
  });
  const [stage, setStage] = useState(1); // 1 = raw input, 2 = trimming result

  useEffect(() => {
    fetchMaterials();
    fetchBatches();
  }, []);

  const fetchMaterials = async () => {
    try {
      const tenantId = await api.getActiveTenantId();
      const { data } = await supabase
        .from('materials')
        .select('id, name, unit, category')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name');
      setMaterials(data || []);
    } catch (err) {
    }
  };

  const fetchBatches = async () => {
    try {
      const tenantId = await api.getActiveTenantId();
      const { data } = await supabase
        .from('production_batches')
        .select('*, materials(name, unit)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(50);
      setBatches(data || []);
    } catch (err) {
    }
  };

  const compressImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            resolve(new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now()
            }));
          }, 'image/jpeg', 0.7);
        };
        img.onerror = (error) => reject(error);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const uploadPhoto = async (file, prefix) => {
    if (!file) return null;

    let fileToUpload = file;
    if (file.type.startsWith('image/')) {
      try {
        fileToUpload = await compressImage(file);
      } catch (err) {
      }
    }

    const fileName = `${prefix}_${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from('production-batches')
      .upload(fileName, fileToUpload, { contentType: 'image/jpeg' });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage
      .from('production-batches')
      .getPublicUrl(fileName);
    return publicUrl;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setNotification(null);

    try {
      const tenantId = await api.getActiveTenantId();
      const grossW = parseFloat(form.gross_weight) || 0;
      const cleanW = parseFloat(form.clean_weight) || 0;
      const wasteW = parseFloat(form.waste_weight) || 0;
      const portionSize = parseFloat(form.portion_size) || 100;

      if (grossW <= 0) throw new Error('Berat mentah harus lebih dari 0');
      if (stage === 2 && cleanW <= 0) throw new Error('Berat bersih harus lebih dari 0');
      if (stage === 2 && !form.target_material_id) throw new Error('Bahan Hasil (Pack Jadi) wajib dipilih di Tahap 2');

      // Upload photos
      const [grossPhotoUrl, cleanPhotoUrl, wastePhotoUrl] = await Promise.all([
        uploadPhoto(form.gross_photo, 'gross'),
        uploadPhoto(form.clean_photo, 'clean'),
        uploadPhoto(form.waste_photo, 'waste'),
      ]);

      // Calculate
      const shrinkagePct = grossW > 0 ? ((grossW - cleanW) / grossW * 100) : 0;
      const yieldStatus = shrinkagePct <= form.max_shrinkage_pct ? 'GOOD' : 'BAD';
      const resultPacks = portionSize > 0 ? Math.floor(cleanW / portionSize) : 0;

      if (stage === 1) {
        // Insert Tahap 1
        const { error } = await supabase.from('production_batches').insert({
          tenant_id: tenantId,
          material_id: form.material_id,
          operator_id: profile?.id,
          stage: 'raw',
          gross_weight: grossW,
          gross_photo_url: grossPhotoUrl,
          notes: form.notes,
        });
        if (error) throw error;

        // Potong stok bahan mentah
        const { error: rpcRawErr } = await supabase.rpc('deduct_stock_atomic', {
          p_material_id: form.material_id,
          p_deduct_qty: grossW
        });
        if (rpcRawErr) throw new Error(`Gagal potong stok mentah: ${rpcRawErr.message}`);
      } else {
        // Update Tahap 2
        if (!form.batch_id) throw new Error('Pilih batch mentah dahulu');

        const { error } = await supabase.from('production_batches')
          .update({
            target_material_id: form.target_material_id,
            stage: 'semi',
            clean_weight: cleanW,
            waste_weight: wasteW,
            clean_photo_url: cleanPhotoUrl,
            waste_photo_url: wastePhotoUrl,
            max_shrinkage_pct: form.max_shrinkage_pct,
            shrinkage_pct: shrinkagePct,
            yield_status: yieldStatus,
            result_packs: resultPacks,
            portion_size: portionSize,
            portion_unit: form.portion_unit,
          })
          .eq('id', form.batch_id);
        if (error) throw error;

        // Tambah stok pack jadi (qty negatif = tambah)
        if (resultPacks > 0) {
          const { error: rpcPackErr } = await supabase.rpc('deduct_stock_atomic', {
            p_material_id: form.target_material_id,
            p_deduct_qty: -resultPacks
          });
          if (rpcPackErr) throw new Error(`Gagal tambah stok pack: ${rpcPackErr.message}`);
        }
      }

      setNotification({
        type: yieldStatus === 'GOOD' ? 'success' : 'warning',
        text: stage === 1 ? `Berat mentah disimpan.` : `Trimming ${yieldStatus}. Susut: ${shrinkagePct.toFixed(1)}% → Hasil: ${resultPacks} pack`
      });

      // Reset form
      setForm({
        batch_id: '', material_id: '', target_material_id: '', gross_weight: '', clean_weight: '', waste_weight: '',
        portion_size: 100, portion_unit: 'gr', max_shrinkage_pct: 30, notes: '',
        gross_photo: null, clean_photo: null, waste_photo: null,
      });
      setStage(1);
      fetchBatches();
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // Kalkulasi live
  const grossW = parseFloat(form.gross_weight) || 0;
  const cleanW = parseFloat(form.clean_weight) || 0;
  const shrinkagePct = grossW > 0 ? ((grossW - cleanW) / grossW * 100) : 0;
  const yieldStatus = shrinkagePct <= form.max_shrinkage_pct ? 'GOOD' : 'BAD';
  const resultPacks = (parseFloat(form.portion_size) || 0) > 0 ? Math.floor(cleanW / parseFloat(form.portion_size)) : 0;

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Trimming & Produksi 2-Tahap</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Input berat mentah → hasil bersih & limbah → kalkulasi pack otomatis</p>
      </div>

      {/* Notification */}
      {notification && (
        <div style={{
          padding: '12px 16px', borderRadius: 'var(--radius-md)', fontSize: '0.85rem',
          background: notification.type === 'error' ? 'var(--danger-glow)' : notification.type === 'warning' ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)',
          color: notification.type === 'error' ? 'var(--danger-text)' : notification.type === 'warning' ? '#b45309' : '#047857',
          border: `1px solid ${notification.type === 'error' ? 'rgba(220,38,38,0.15)' : notification.type === 'warning' ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)'}`
        }}>
          {notification.type === 'warning' && <AlertTriangle size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />}
          {notification.type === 'success' && <CheckCircle size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />}
          {notification.text}
        </div>
      )}

      {/* Form */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Stage Indicator */}
          <div style={{ display: 'flex', gap: '8px', margin: '8px 0' }}>
            <button type="button" className={`btn ${stage === 1 ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, padding: '10px', fontSize: '0.85rem' }} onClick={() => setStage(1)}>
              <Scale size={14} style={{ marginRight: '6px' }} /> Tahap 1: Berat Mentah
            </button>
            <button type="button" className={`btn ${stage === 2 ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, padding: '10px', fontSize: '0.85rem' }} onClick={() => setStage(2)}>
              <Package size={14} style={{ marginRight: '6px' }} /> Tahap 2: Hasil & Limbah
            </button>
          </div>

          {/* Stage 1: Berat Mentah */}
          {stage === 1 && (
            <>
              <div className="form-group">
                <label className="form-label">Bahan Baku *</label>
                <select className="form-control" required value={form.material_id} onChange={e => setForm({ ...form, material_id: e.target.value })}>
                  <option value="">Pilih bahan baku...</option>
                  {materials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Berat Mentah (gram) *</label>
                  <input type="number" step="any" min="0" className="form-control" required placeholder="e.g. 5000" value={form.gross_weight} onChange={e => setForm({ ...form, gross_weight: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label text-xs">Foto Bukti Mentah *</label>
                  <div className="relative group cursor-pointer h-full">
                    <input type="file" accept="image/*" capture="environment" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" onChange={e => setForm({ ...form, gross_photo: e.target.files?.[0] || null })} />
                    <div className={`flex flex-col items-center justify-center p-4 h-24 border-2 border-dashed rounded-2xl transition-all ${form.gross_photo ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-[var(--bg-secondary)] border-[var(--border)]'}`}>
                      {form.gross_photo ? (
                        <>
                          <CheckCircle size={24} className="text-emerald-500 mb-1" />
                          <span className="font-bold text-xs text-emerald-600">Tersimpan</span>
                        </>
                      ) : (
                        <>
                          <Camera size={24} className="text-[var(--text-muted)] mb-1" />
                          <span className="font-bold text-xs">Jepret Foto</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Stage 2: Trimming Result */}
          {stage === 2 && (
            <>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">Batch Mentah *</label>
                <select className="form-control" required value={form.batch_id} onChange={e => {
                  const selectedBatchId = e.target.value;
                  const selectedBatch = batches.find(b => b.id === selectedBatchId);
                  setForm({
                    ...form,
                    batch_id: selectedBatchId,
                    gross_weight: selectedBatch ? selectedBatch.gross_weight : form.gross_weight,
                    material_id: selectedBatch ? selectedBatch.material_id : form.material_id
                  });
                }}>
                  <option value="">Pilih batch mentah...</option>
                  {batches.filter(b => b.stage === 'raw').map(b => (
                    <option key={b.id} value={b.id}>{new Date(b.created_at).toLocaleString('id-ID')} - {b.materials?.name} ({b.gross_weight}g)</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">Bahan Hasil (Pack Jadi) *</label>
                <select className="form-control" required value={form.target_material_id} onChange={e => setForm({ ...form, target_material_id: e.target.value })}>
                  <option value="">Pilih bahan hasil...</option>
                  {materials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Berat Bersih (gram) *</label>
                  <input type="number" step="any" min="0" className="form-control" required placeholder="e.g. 3500" value={form.clean_weight} onChange={e => setForm({ ...form, clean_weight: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Berat Limbah/Kulit (gram)</label>
                  <input type="number" step="any" min="0" className="form-control" placeholder="e.g. 1500" value={form.waste_weight} onChange={e => setForm({ ...form, waste_weight: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label text-xs">Foto Hasil (Bersih)</label>
                  <div className="relative group cursor-pointer h-full">
                    <input type="file" accept="image/*" capture="environment" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" onChange={e => setForm({ ...form, clean_photo: e.target.files?.[0] || null })} />
                    <div className={`flex flex-col items-center justify-center p-4 h-24 border-2 border-dashed rounded-2xl transition-all ${form.clean_photo ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-[var(--bg-secondary)] border-[var(--border)]'}`}>
                      {form.clean_photo ? <CheckCircle size={24} className="text-emerald-500" /> : <Camera size={24} className="text-[var(--text-muted)] mb-1" />}
                      <span className="font-bold text-xs mt-1 text-center">{form.clean_photo ? 'Tersimpan' : 'Jepret Foto'}</span>
                    </div>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label text-xs">Foto Limbah (Waste)</label>
                  <div className="relative group cursor-pointer h-full">
                    <input type="file" accept="image/*" capture="environment" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" onChange={e => setForm({ ...form, waste_photo: e.target.files?.[0] || null })} />
                    <div className={`flex flex-col items-center justify-center p-4 h-24 border-2 border-dashed rounded-2xl transition-all ${form.waste_photo ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-[var(--bg-secondary)] border-[var(--border)]'}`}>
                      {form.waste_photo ? <CheckCircle size={24} className="text-emerald-500" /> : <Camera size={24} className="text-[var(--text-muted)] mb-1" />}
                      <span className="font-bold text-xs mt-1 text-center">{form.waste_photo ? 'Tersimpan' : 'Jepret Foto'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Portion config */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Ukuran Porsi</label>
                  <input type="number" step="any" min="0" className="form-control" value={form.portion_size} onChange={e => setForm({ ...form, portion_size: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Satuan Porsi</label>
                  <input type="text" className="form-control" value={form.portion_unit} onChange={e => setForm({ ...form, portion_unit: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Toleransi Susut (%)</label>
                  <input type="number" step="0.1" min="0" max="100" className="form-control" value={form.max_shrinkage_pct} onChange={e => setForm({ ...form, max_shrinkage_pct: parseFloat(e.target.value) || 30 })} />
                </div>
              </div>

              {/* Live Preview */}
              {cleanW > 0 && (
                <div style={{
                  padding: '16px', borderRadius: 'var(--radius-md)',
                  background: yieldStatus === 'GOOD' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                  border: `1px solid ${yieldStatus === 'GOOD' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', textAlign: 'center'
                }}>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Susut</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: yieldStatus === 'GOOD' ? '#047857' : '#dc2626' }}>
                      {shrinkagePct.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</div>
                    <div style={{
                      fontSize: '1rem', fontWeight: 800,
                      color: yieldStatus === 'GOOD' ? '#047857' : '#dc2626'
                    }}>
                      {yieldStatus === 'GOOD' ? '✓ GOOD YIELD' : '✗ BAD YIELD'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Hasil Pack</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--accent)' }}>
                      {resultPacks} <span style={{ fontSize: '0.7rem' }}>{form.portion_unit}</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Notes */}
          <div className="form-group">
            <label className="form-label">Catatan</label>
            <textarea className="form-control" rows="2" placeholder="Catatan tambahan..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ padding: '12px', fontWeight: 700 }}>
            {loading ? 'Menyimpan...' : `Simpan ${stage === 1 ? 'Berat Mentah' : 'Hasil Trimming'}`}
          </button>
        </form>
      </div>

      {/* History */}
      <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Riwayat Produksi</h3>
        </div>
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Bahan</th>
                <th style={{ textAlign: 'right' }}>Mentah (g)</th>
                <th style={{ textAlign: 'right' }}>Bersih (g)</th>
                <th style={{ textAlign: 'right' }}>Susut %</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'right' }}>Pack</th>
              </tr>
            </thead>
            <tbody>
              {batches.map(b => (
                <tr key={b.id}>
                  <td style={{ fontSize: '0.8rem' }}>{new Date(b.created_at).toLocaleDateString('id-ID')}</td>
                  <td style={{ fontWeight: 600 }}>{b.materials?.name || '-'}</td>
                  <td style={{ textAlign: 'right' }}>{b.gross_weight}</td>
                  <td style={{ textAlign: 'right' }}>{b.clean_weight || '-'}</td>
                  <td style={{ textAlign: 'right' }}>{b.shrinkage_pct != null ? `${b.shrinkage_pct}%` : '-'}</td>
                  <td style={{ textAlign: 'center' }}>
                    {b.yield_status && (
                      <span className={`badge ${b.yield_status === 'GOOD' ? 'badge-success' : 'badge-danger'}`}>
                        {b.yield_status}
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{b.result_packs || '-'}</td>
                </tr>
              ))}
              {batches.length === 0 && (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>Belum ada data produksi.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
