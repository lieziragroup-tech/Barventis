import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Factory, FlaskConical, Package, Plus, Save, RefreshCw, Play, Pencil, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { getLocalDateISO } from '../../services/dailyInventoryMath';

const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100';
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500';
const cardClass = 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm';
const makeRequestKey = () => (globalThis.crypto?.randomUUID?.() || `production-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const fmtQty = (value) => Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 4 });
const fmtRp = (value) => `Rp ${Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;

export default function MaterialProduction() {
  const { activeUser } = useAuth();
  const role = activeUser?.role === 'SuperAdmin' ? 'Super Admin' : activeUser?.role;
  const canManageRecipes = ['Admin / Owner', 'Owner', 'Supervisor', 'Super Admin'].includes(role);
  const [materials, setMaterials] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [postingRun, setPostingRun] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [date, setDate] = useState(() => getLocalDateISO());
  const [location, setLocation] = useState('RESTO');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [outputQty, setOutputQty] = useState('');
  const [runNotes, setRunNotes] = useState('');
  const requestKeyRef = useRef(null);
  const [editingId, setEditingId] = useState(null);
  const [recipeForm, setRecipeForm] = useState({
    batch_name: '', output_material_id: '', yield_qty: '1', yield_unit: '', source_note: '',
    ingredients: [{ material_id: '', qty: '', unit: '' }],
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [materialRows, recipeRows, runRows] = await Promise.all([
        api.getMaterials(), api.getProductionRecipes(), api.getProductionRuns(date, location),
      ]);
      setMaterials((materialRows || []).filter(m => (m.category || '').toUpperCase() !== 'ASSET' && m.is_active !== false));
      setRecipes(recipeRows || []);
      setRuns(runRows || []);
      if (selectedBatchId && !(recipeRows || []).some(r => String(r.id) === String(selectedBatchId))) setSelectedBatchId('');
    } catch (err) {
      setError(err?.message || 'Gagal memuat data produksi. Pastikan migration Cost Control v3 sudah diterapkan.');
    } finally {
      setLoading(false);
    }
  }, [date, location, selectedBatchId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const selectedRecipe = useMemo(
    () => recipes.find(r => String(r.id) === String(selectedBatchId)) || null,
    [recipes, selectedBatchId],
  );
  const scale = selectedRecipe && Number(selectedRecipe.yield_qty) > 0 && Number(outputQty) > 0
    ? Number(outputQty) / Number(selectedRecipe.yield_qty) : 0;
  const productionPreview = useMemo(() => (selectedRecipe?.ingredients || []).map(ingredient => ({
    ...ingredient,
    plannedQty: Number(ingredient.qty || 0) * scale,
  })), [selectedRecipe, scale]);

  const resetRecipeForm = () => {
    setEditingId(null);
    setRecipeForm({ batch_name: '', output_material_id: '', yield_qty: '1', yield_unit: '', source_note: '', ingredients: [{ material_id: '', qty: '', unit: '' }] });
  };

  const beginEdit = (recipe) => {
    setEditingId(recipe.id);
    setRecipeForm({
      batch_name: recipe.batch_name || '',
      output_material_id: String(recipe.output_material_id || ''),
      yield_qty: String(recipe.yield_qty || '1'),
      yield_unit: recipe.yield_unit || recipe.output_material?.unit || '',
      source_note: recipe.source_note || '',
      ingredients: (recipe.ingredients || []).map(i => ({ material_id: String(i.material_id), qty: String(i.qty), unit: i.unit || i.material?.unit || '' })),
    });
    window.scrollTo?.({ top: 0, behavior: 'smooth' });
  };

  const updateIngredient = (index, field, value) => {
    setRecipeForm(prev => ({
      ...prev,
      ingredients: prev.ingredients.map((ingredient, i) => {
        if (i !== index) return ingredient;
        if (field === 'material_id') {
          const material = materials.find(m => String(m.id) === String(value));
          return { ...ingredient, material_id: value, unit: material?.unit || ingredient.unit };
        }
        return { ...ingredient, [field]: value };
      }),
    }));
  };

  const handleSaveRecipe = async (event) => {
    event.preventDefault();
    setError(''); setNotice(''); setSavingRecipe(true);
    try {
      const cleanedIngredients = recipeForm.ingredients.map(i => ({ material_id: i.material_id, qty: i.qty, unit: i.unit }));
      const result = await api.saveProductionRecipe({ ...recipeForm, id: editingId, ingredients: cleanedIngredients });
      setNotice(`Resep produksi berhasil ${editingId ? 'diperbarui' : 'dibuat'} (ID ${result.batch_id}).`);
      resetRecipeForm();
      await loadAll();
    } catch (err) {
      setError(err?.message || 'Gagal menyimpan resep produksi.');
    } finally {
      setSavingRecipe(false);
    }
  };

  const handleRecordRun = async (event) => {
    event.preventDefault();
    if (!selectedRecipe) { setError('Pilih resep produksi terlebih dahulu.'); return; }
    setError(''); setNotice(''); setPostingRun(true);
    if (!requestKeyRef.current) requestKeyRef.current = makeRequestKey();
    try {
      const result = await api.recordProductionRun({
        batchId: selectedRecipe.id,
        outputQty: Number(outputQty),
        date,
        location,
        notes: runNotes,
        requestKey: requestKeyRef.current,
      });
      requestKeyRef.current = null;
      setOutputQty(''); setRunNotes('');
      setNotice(result.duplicate
        ? 'Permintaan produksi yang sama sudah pernah berhasil diposting; tidak ada mutasi baru.'
        : `Produksi tercatat. Output ${fmtQty(result.output_stock_qty)} satuan stok dengan biaya ${fmtRp(result.total_cost)}.`);
      await loadAll();
    } catch (err) {
      // Keep the request key on failure so a retry is idempotent at the database boundary.
      setError(err?.message || 'Gagal mencatat produksi.');
    } finally {
      setPostingRun(false);
    }
  };

  const materialName = (id) => materials.find(m => Number(m.id) === Number(id))?.name || 'Bahan tidak ditemukan';

  return (
    <div className="space-y-5 p-3 md:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-indigo-700"><Factory size={22} /><span className="text-xs font-bold uppercase tracking-[0.15em]">Inventory Operations</span></div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Proses Produksi Bahan</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">Kelola resep bahan setengah jadi dan catat setiap batch produksi. Saat batch diposting, bahan mentah berkurang dan hasil produksi bertambah secara atomik—tanpa input OUT kedua di Daily Inventory.</p>
        </div>
        <button type="button" onClick={loadAll} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Muat ulang</button>
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle size={18} className="mt-0.5 shrink-0" /><span>{error}</span></div>}
      {notice && <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 size={18} className="mt-0.5 shrink-0" /><span>{notice}</span></div>}

      <div className={`grid grid-cols-1 gap-5 ${canManageRecipes ? 'xl:grid-cols-2' : ''}`}>
        {canManageRecipes && <section className={cardClass}>
          <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-bold text-slate-900">{editingId ? 'Edit Resep Produksi' : 'Master Resep Produksi'}</h2><p className="mt-1 text-xs text-slate-500">Contoh: bahan mentah → tea base / gula cair / juice base.</p></div><FlaskConical className="text-indigo-600" size={22} /></div>
          <form className="space-y-3" onSubmit={handleSaveRecipe}>
            <div><label className={labelClass}>Nama resep / batch</label><input className={inputClass} required maxLength={120} value={recipeForm.batch_name} onChange={e => setRecipeForm(p => ({ ...p, batch_name: e.target.value }))} placeholder="Tea Base 1 Liter" /></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><label className={labelClass}>Material hasil produksi</label><select className={inputClass} required value={recipeForm.output_material_id} onChange={e => { const m = materials.find(item => String(item.id) === e.target.value); setRecipeForm(p => ({ ...p, output_material_id: e.target.value, yield_unit: p.yield_unit || m?.unit || '' })); }}><option value="">Pilih bahan hasil...</option>{materials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit || 'unit'})</option>)}</select></div>
              <div className="grid grid-cols-2 gap-2"><div><label className={labelClass}>Yield standar</label><input className={inputClass} type="number" min="0.0001" step="any" required value={recipeForm.yield_qty} onChange={e => setRecipeForm(p => ({ ...p, yield_qty: e.target.value }))} /></div><div><label className={labelClass}>Satuan yield</label><input className={inputClass} required value={recipeForm.yield_unit} onChange={e => setRecipeForm(p => ({ ...p, yield_unit: e.target.value }))} placeholder="ml / gr / pcs" /></div></div>
            </div>
            <div><label className={labelClass}>Catatan proses</label><input className={inputClass} value={recipeForm.source_note} onChange={e => setRecipeForm(p => ({ ...p, source_note: e.target.value }))} placeholder="Langkah singkat / catatan yield" /></div>
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-slate-800">Bahan input resep</h3><button type="button" onClick={() => setRecipeForm(p => ({ ...p, ingredients: [...p.ingredients, { material_id: '', qty: '', unit: '' }] }))} className="inline-flex items-center gap-1 rounded-md border border-indigo-200 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"><Plus size={14} /> Tambah bahan</button></div>
              {recipeForm.ingredients.map((ingredient, index) => <div key={`ingredient-${index}`} className="grid grid-cols-12 gap-2 rounded-lg bg-slate-50 p-2">
                <div className="col-span-6"><label className={labelClass}>Bahan</label><select className={inputClass} required value={ingredient.material_id} onChange={e => updateIngredient(index, 'material_id', e.target.value)}><option value="">Pilih bahan...</option>{materials.filter(m => String(m.id) !== String(recipeForm.output_material_id)).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
                <div className="col-span-3"><label className={labelClass}>Qty resep</label><input className={inputClass} type="number" min="0.0001" step="any" required value={ingredient.qty} onChange={e => updateIngredient(index, 'qty', e.target.value)} placeholder="0" /></div>
                <div className="col-span-3"><label className={labelClass}>Satuan</label><input className={inputClass} required value={ingredient.unit} onChange={e => updateIngredient(index, 'unit', e.target.value)} placeholder="gr / ml" /></div>
                {recipeForm.ingredients.length > 1 && <div className="col-span-12 flex justify-end"><button type="button" className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => setRecipeForm(p => ({ ...p, ingredients: p.ingredients.filter((_, i) => i !== index) }))}>Hapus baris</button></div>}
              </div>)}
            </div>
            <div className="flex flex-wrap gap-2 pt-1"><button type="submit" disabled={savingRecipe || loading} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"><Save size={16} />{savingRecipe ? 'Menyimpan...' : 'Simpan resep'}</button>{editingId && <button type="button" onClick={resetRecipeForm} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Batal edit</button>}</div>
          </form>
        </section>}

        <section className={cardClass}>
          <div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold text-slate-900">Catat Batch Produksi</h2><p className="mt-1 text-xs text-slate-500">Setiap submit menghasilkan mutasi stok satu kali dengan request key idempotent.</p></div><Package className="text-emerald-600" size={22} /></div>
          <form className="space-y-3" onSubmit={handleRecordRun}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div><label className={labelClass}><CalendarDays className="mr-1 inline" size={13} />Tanggal produksi</label><input type="date" className={inputClass} required value={date} onChange={e => { requestKeyRef.current = null; setDate(e.target.value); }} /></div><div><label className={labelClass}>Lokasi stok</label><select className={inputClass} value={location} onChange={e => { requestKeyRef.current = null; setLocation(e.target.value); }}><option value="RESTO">Resto</option><option value="CENTRAL">Central</option></select></div></div>
            <div><label className={labelClass}>Resep produksi</label><select className={inputClass} required value={selectedBatchId} onChange={e => { requestKeyRef.current = null; setSelectedBatchId(e.target.value); }}><option value="">Pilih resep aktif...</option>{recipes.map(r => <option key={r.id} value={r.id}>{r.batch_name} → {r.output_material?.name || 'Output belum ada'}</option>)}</select></div>
            {selectedRecipe && <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 text-sm"><div className="font-semibold text-indigo-950">Output: {selectedRecipe.output_material?.name || 'Material output'} | standar {fmtQty(selectedRecipe.yield_qty)} {selectedRecipe.yield_unit}</div><div className="mt-1 text-xs text-indigo-800">Resep akan diskalakan berdasarkan kuantitas aktual batch di bawah.</div></div>}
            <div><label className={labelClass}>Kuantitas hasil aktual ({selectedRecipe?.yield_unit || 'satuan resep'})</label><input className={inputClass} type="number" min="0.0001" step="any" required value={outputQty} onChange={e => { requestKeyRef.current = null; setOutputQty(e.target.value); }} placeholder="Contoh: 2500" /></div>
            {productionPreview.length > 0 && <div className="rounded-lg border border-slate-200 p-3"><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Pratinjau konsumsi bahan (estimasi)</h3><div className="space-y-1.5">{productionPreview.map(item => <div key={item.material_id} className="flex items-center justify-between gap-3 text-sm"><span className="text-slate-700">{item.material?.name || materialName(item.material_id)}</span><span className="whitespace-nowrap font-mono font-semibold">{fmtQty(item.plannedQty)} {item.unit}</span></div>)}</div><p className="mt-2 text-[11px] text-slate-500">Pemakaian final dikonversi ke satuan stok dan divalidasi oleh database. Batch ditolak jika stok input tidak mencukupi atau konversi tidak valid.</p></div>}
            <div><label className={labelClass}>Catatan</label><textarea className={inputClass} rows={2} value={runNotes} onChange={e => setRunNotes(e.target.value)} placeholder="Mis. produksi untuk shift siang" /></div>
            <button type="submit" disabled={postingRun || loading || !recipes.length} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><Play size={16} />{postingRun ? 'Memproses batch...' : 'Posting produksi'}</button>
          </form>
        </section>
      </div>

      <section className={cardClass}>
        <div className="mb-3 flex items-center justify-between"><div><h2 className="font-bold text-slate-900">Resep Produksi Aktif</h2><p className="mt-1 text-xs text-slate-500">Mengubah resep tidak menimpa snapshot batch produksi yang sudah pernah diposting.</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{recipes.length} resep</span></div>
        {loading ? <p className="py-6 text-center text-sm text-slate-500">Memuat data produksi...</p> : recipes.length === 0 ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Belum ada resep. Hubungi Admin/Owner untuk menyiapkan master resep produksi.</p> : <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{recipes.map(recipe => <article key={recipe.id} className="rounded-lg border border-slate-200 p-3"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-slate-900">{recipe.batch_name}</h3><p className="mt-1 text-xs text-slate-500">Output: {recipe.output_material?.name || 'Tidak ditemukan'} — {fmtQty(recipe.yield_qty)} {recipe.yield_unit}</p></div>{canManageRecipes && <button type="button" onClick={() => beginEdit(recipe)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Pencil size={13} /> Edit</button>}</div><ul className="mt-3 space-y-1">{(recipe.ingredients || []).map(i => <li key={i.material_id} className="flex justify-between gap-2 text-xs text-slate-600"><span>{i.material?.name || materialName(i.material_id)}</span><span className="whitespace-nowrap font-mono">{fmtQty(i.qty)} {i.unit}</span></li>)}</ul></article>)}</div>}
      </section>

      <section className={cardClass}>
        <div className="mb-3 flex items-center justify-between"><div><h2 className="font-bold text-slate-900">Riwayat Produksi</h2><p className="mt-1 text-xs text-slate-500">Tanggal {date} · {location === 'RESTO' ? 'Resto' : 'Central'}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{runs.length} batch</span></div>
        {loading ? <p className="py-6 text-center text-sm text-slate-500">Memuat riwayat...</p> : runs.length === 0 ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Belum ada batch produksi di tanggal dan lokasi ini.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-3">Waktu</th><th className="p-3">Resep</th><th className="p-3">Hasil</th><th className="p-3">Bahan keluar</th><th className="p-3 text-right">Total biaya</th><th className="p-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{runs.map(run => <tr key={run.id}><td className="p-3 text-xs text-slate-500">{run.created_at ? new Date(run.created_at).toLocaleString('id-ID') : run.run_date}</td><td className="p-3 font-semibold text-slate-800">{run.recipe_name_snapshot}</td><td className="p-3">{fmtQty(run.output_qty)} {run.yield_unit_snapshot}<div className="text-xs text-slate-500">{run.output_material?.name || 'Output'}</div></td><td className="p-3 text-xs text-slate-600">{(run.ingredients || []).map(i => `${i.material_name_snapshot}: ${fmtQty(i.input_stock_qty)} ${i.material?.unit || ''}`).join(' · ')}</td><td className="p-3 text-right font-mono font-semibold">{fmtRp(run.total_cost)}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${run.status === 'POSTED' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{run.status}</span></td></tr>)}</tbody></table></div>}
      </section>
    </div>
  );
}
