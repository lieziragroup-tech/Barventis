import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Package, FileText, Search, Plus, Download, UploadCloud,
    ArrowDownCircle, ArrowUpCircle, X, Loader2, AlertTriangle,
    ClipboardList, Trash2, Briefcase, Calculator, TrendingUp, CheckCircle2,
    Lock, ArrowRight, Eye, AlertCircle, CheckSquare, FlaskConical, BarChart3, Droplets, Layers,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useAuthStore } from '@/app/store/authStore';
import {
    getInventoryItems, getInventoryLogs, processInventoryRPC, createInventoryItem,
} from '@/shared/api/inventoryService';
import type { InventoryItem, InventoryLog } from '@/shared/api/inventoryService';
import { supabase } from '@/shared/lib/supabase';
import { getQuotations } from '@/shared/api/quotationService';
import { formatRupiah } from '@/shared/lib/utils';
import { TabContainer } from '@/shared/ui/TabContainer';
import { Pagination } from '@/shared/ui/Pagination';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { isDirectorUser } from '@/shared/lib/roles';
import { GUCI_WAREHOUSE_CATALOG } from '@/shared/data/warehouseCatalog';
import type { Quotation } from '@/entities/types';

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_ROWS = 500;
const INVENTORY_PAGE_SIZE = 10;
const fmt = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 3 });
const monthStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

// ─── INVENTORY BULK IMPORT PREVIEW ───────────────────────────────────────────

interface InventoryImportRow {
    nama: string;
    kategori: string;
    satuan: string;
    stokAwal: number;
    minAlert: number;
    hargaSatuan: number;
    _status: "ok" | "duplicate" | "error";
    _reason?: string;
}

function InventoryImportPreviewModal({
    rows,
    existingNames,
    onConfirm,
    onClose,
    importing,
}: {
    rows: InventoryImportRow[];
    existingNames: Set<string>;
    onConfirm: (validRows: InventoryImportRow[]) => void;
    onClose: () => void;
    importing: boolean;
}) {
    const tagged = useMemo<InventoryImportRow[]>(() => rows.map(r => {
        if (!r.nama.trim()) return { ...r, _status: "error", _reason: "Nama kosong" };
        if (!Number.isFinite(r.stokAwal) || r.stokAwal < 0) return { ...r, _status: "error", _reason: "Stok tidak valid" };
        if (existingNames.has(r.nama.trim().toLowerCase())) return { ...r, _status: "duplicate", _reason: "Sudah ada di gudang" };
        return { ...r, _status: "ok" };
    }), [rows, existingNames]);

    const okRows = tagged.filter(r => r._status === "ok");
    const dupRows = tagged.filter(r => r._status === "duplicate");
    const errRows = tagged.filter(r => r._status === "error");

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[88vh]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <div>
                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <Eye size={16} className="text-emerald-600" /> Preview Import Stok Gudang
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">Periksa data sebelum menyimpan ke inventaris</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
                        <X size={18} />
                    </button>
                </div>

                <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-4 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-700">
                        <CheckSquare size={13} /> {okRows.length} siap import
                    </span>
                    {dupRows.length > 0 && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs font-bold text-amber-700">
                            <AlertTriangle size={13} /> {dupRows.length} duplikat (dilewati)
                        </span>
                    )}
                    {errRows.length > 0 && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-xs font-bold text-red-700">
                            <AlertCircle size={13} /> {errRows.length} error (dilewati)
                        </span>
                    )}
                </div>

                <div className="overflow-auto flex-1 px-6 py-3">
                    <table className="w-full text-left text-xs border-collapse min-w-[700px]">
                        <thead className="sticky top-0 bg-white">
                            <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wide text-[10px]">
                                <th className="px-3 py-2 rounded-l-lg">Status</th>
                                <th className="px-3 py-2">Nama Item</th>
                                <th className="px-3 py-2">Kategori</th>
                                <th className="px-3 py-2">Satuan</th>
                                <th className="px-3 py-2 text-right">Stok Awal</th>
                                <th className="px-3 py-2 text-right">Min Alert</th>
                                <th className="px-3 py-2 text-right rounded-r-lg">HPP/Satuan</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {tagged.map((r, i) => (
                                <tr key={i} className={
                                    r._status === "ok" ? "bg-white" :
                                    r._status === "duplicate" ? "bg-amber-50/60" : "bg-red-50/60"
                                }>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        {r._status === "ok" ? (
                                            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold"><CheckCircle2 size={11} /> OK</span>
                                        ) : r._status === "duplicate" ? (
                                            <span className="inline-flex items-center gap-1 text-amber-700 font-semibold" title={r._reason}><AlertTriangle size={11} /> Duplikat</span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-red-700 font-semibold" title={r._reason}><AlertCircle size={11} /> Error</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 font-medium text-slate-800 max-w-[180px] truncate">{r.nama || "—"}</td>
                                    <td className="px-3 py-2 text-slate-600">{r.kategori}</td>
                                    <td className="px-3 py-2 text-slate-500">{r.satuan}</td>
                                    <td className="px-3 py-2 text-right font-mono text-slate-700">{fmt(r.stokAwal)}</td>
                                    <td className="px-3 py-2 text-right font-mono text-slate-500">{fmt(r.minAlert)}</td>
                                    <td className="px-3 py-2 text-right font-mono text-slate-700">Rp {r.hargaSatuan.toLocaleString("id-ID")}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200">
                        Batal
                    </button>
                    <button
                        onClick={() => onConfirm(okRows)}
                        disabled={okRows.length === 0 || importing}
                        className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {importing ? <><Loader2 size={13} className="animate-spin" /> Menyimpan...</> : <><CheckSquare size={13} /> Import {okRows.length} Item</>}
                    </button>
                </div>
            </div>
        </div>
    );
}

type Mutation = { item: InventoryItem | null; type: "IN" | "OUT"; presetProjectId?: string; presetTipe?: "ESTIMASI" | "REALISASI" } | null;
type InvTab = "stok" | "chemical-trend" | "proyek" | "rekap" | "log" | "alert";
type StockHealthFilter = "ALL" | "SAFE" | "LOW" | "EMPTY";
type ChemicalFormFilter = "ALL" | "LIQUID" | "SOLID";
type TrendPeriodFilter = "7d" | "30d" | "month" | "all";

function classifyChemicalForm(item?: InventoryItem): "LIQUID" | "SOLID" {
    const unit = (item?.satuan || "").toLowerCase();
    const name = (item?.nama || "").toLowerCase();
    if (
        unit.includes("ml") ||
        unit.includes("liter") ||
        unit.includes("ltr") ||
        unit.includes("botol") ||
        unit.includes("jerigen") ||
        unit.includes("kaleng") ||
        name.includes("ec") ||
        name.includes("sc") ||
        name.includes("cs") ||
        name.includes("cair")
    ) {
        return "LIQUID";
    }
    return "SOLID";
}

interface ProjectCostRow {
    id: string;
    code: string;
    projectName: string;
    clientName: string;
    serviceLabel: string;
    workDate: string;
    contractValue: number;
}

export function InventoryPage() {
    const user = useAuthStore(s => s.user);
    const activeCompanyId = useAuthStore(s => s.activeCompanyId);
    const companyId = (user?.role === "MASTER_SUPER_ADMIN" || user?.role === "SUPERADMIN")
        ? (activeCompanyId || user?.companyId || null)
        : (user?.companyId ?? null);
    const isDirector = isDirectorUser(user);
    const isAdminOrDirector = isDirector || user?.role === "ADMIN" || user?.role === "SUPERADMIN";
    const isWarehouseOnly = user?.role === "INVENTORY";
    const isWarehouseRole = user?.role === "INVENTORY" || user?.role === "ADMIN";
    const canWrite = isWarehouseRole;
    const canAccessChemicalTrend = isAdminOrDirector || user?.role === "INVENTORY";

    // Role Gudang (INVENTORY) langsung masuk ke Mode Kerja Gudang Minimalis ("stok")
    const [tab, setTab] = useState<InvTab>(isDirector ? "proyek" : "stok");
    const [stockHealthFilter, setStockHealthFilter] = useState<StockHealthFilter>("ALL");
    const [chemFormFilter, setChemFormFilter] = useState<ChemicalFormFilter>("ALL");
    const [trendPeriod, setTrendPeriod] = useState<TrendPeriodFilter>("30d");

    const [searchQ, setSearchQ] = useState("");
    const [itemsPage, setItemsPage] = useState(1);
    const [projectPage, setProjectPage] = useState(1);
    const [logsPage, setLogsPage] = useState(1);
    const debouncedSearch = useDebouncedValue(searchQ, 300);
    const [kategoriFilter, setKategoriFilter] = useState("ALL");
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [logs, setLogs] = useState<InventoryLog[]>([]);
    const [projects, setProjects] = useState<ProjectCostRow[]>([]);
    const [recapLogs, setRecapLogs] = useState<InventoryLog[]>([]);
    const [month, setMonth] = useState(monthStr());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [mutation, setMutation] = useState<Mutation>(null);
    const [mQty, setMQty] = useState("");
    const [mNote, setMNote] = useState("");
    const [mProjectId, setMProjectId] = useState("");
    const [mProyek, setMProyek] = useState("");
    const [mTipeCatatan, setMTipeCatatan] = useState<"ESTIMASI" | "REALISASI">("REALISASI");
    const [selectedItemIdForProj, setSelectedItemIdForProj] = useState("");

    const [busy, setBusy] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [newItem, setNewItem] = useState({ nama: "", kategori: "Chemical", satuan: "Botol 500ml", stokAwal: "0", minAlert: "5", hargaSatuan: "185000" });
    const [isImporting, setIsImporting] = useState(false);
    const [importPreviewRows, setImportPreviewRows] = useState<InventoryImportRow[] | null>(null);

    const itemName = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);

    const reload = useCallback(async () => {
        if (!companyId) { setItems([]); setLogs([]); setProjects([]); return; }
        setLoading(true); setError(null);
        try {
            const [it, lg, projRes, quos] = await Promise.all([
                getInventoryItems(companyId),
                getInventoryLogs(companyId),
                supabase.from("projects").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
                getQuotations({ companyId }).catch((): Quotation[] => []),
            ]);
            setItems(it);
            setLogs(lg);
            // Do not auto-default to items[0]; require explicit user selection (Whole-App Spec Section 7.7)

            const quoMap = new Map(quos.map(q => [q.id, q]));
            const byClientMap = new Map(quos.map(q => [q.kepadaNama.toLowerCase(), q]));

            const mappedProjs: ProjectCostRow[] = (projRes.data || []).map((p: any) => {
                const matchedQuo = (p.quotation_id && quoMap.get(p.quotation_id))
                    || quoMap.get(p.id)
                    || byClientMap.get(String(p.client_name || "").toLowerCase());
                const contractVal = Number(p.contract_value || 0) || matchedQuo?.total || 15000000;
                const code = matchedQuo?.noSurat?.replace(/-DRF\//g, "/").replace(/-APR\//g, "/")
                    || `PRJ-${String(p.id).slice(-6).toUpperCase()}`;
                return {
                    id: p.id,
                    code,
                    projectName: p.project_name,
                    clientName: p.client_name || matchedQuo?.kepadaNama || "-",
                    serviceLabel: p.work_type || p.service_type || "Pest / Termite Control",
                    workDate: p.work_date || new Date().toISOString().slice(0, 10),
                    contractValue: contractVal,
                };
            });

            // Tambahkan quotation approved yang belum masuk ke tabel projects agar Gudang langsung melihat Proyek Baru
            for (const q of quos) {
                if ((q.status === "approved" || q.status === "deal" || q.status === "sent_to_client") && !mappedProjs.some(mp => mp.id === q.id || mp.clientName.toLowerCase() === q.kepadaNama.toLowerCase())) {
                    mappedProjs.push({
                        id: q.id,
                        code: q.noSurat.replace(/-DRF\//g, "/").replace(/-APR\//g, "/"),
                        projectName: `${q.kepadaNama} - ${q.perihal}`,
                        clientName: q.kepadaNama,
                        serviceLabel: q.perihal,
                        workDate: (q.tanggal instanceof Date ? q.tanggal : new Date()).toISOString().slice(0, 10),
                        contractValue: q.total || 0,
                    });
                }
            }

            setProjects(mappedProjs);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memuat data gudang.");
        } finally {
            setLoading(false);
        }
    }, [companyId, selectedItemIdForProj]);

    useEffect(() => { void reload(); }, [reload]);

    useEffect(() => {
        if (tab !== "rekap" || !companyId) return;
        const [y, m] = month.split("-").map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        const from = `${month}-01`;
        const to = `${month}-${String(lastDay).padStart(2, "0")}`;
        getInventoryLogs(companyId, { from, to, limit: 5000 }).then(setRecapLogs).catch(e => setError(e instanceof Error ? e.message : "Gagal memuat rekap."));
    }, [tab, month, companyId]);

    const recap = useMemo(() => {
        const by = new Map<string, { masuk: number; keluar: number; akhir: number | null; t: number }>();
        for (const l of recapLogs) {
            const r = by.get(l.itemId) ?? { masuk: 0, keluar: 0, akhir: null, t: 0 };
            r.masuk += l.qtyMasuk; r.keluar += l.qtyKeluar;
            if (l.createdAt.getTime() >= r.t) { r.t = l.createdAt.getTime(); r.akhir = l.sisaStok; }
            by.set(l.itemId, r);
        }
        return items.map(i => ({ item: i, ...(by.get(i.id) ?? { masuk: 0, keluar: 0, akhir: null }) })).filter(r => r.masuk || r.keluar);
    }, [recapLogs, items]);

    const openMutationModal = (item: InventoryItem | null, type: "IN" | "OUT", presetProjectId = "", presetTipe: "ESTIMASI" | "REALISASI" = "REALISASI") => {
        const projObj = projects.find(p => p.id === presetProjectId);
        setMutation({ item, type, presetProjectId, presetTipe });
        setMProjectId(presetProjectId);
        setMProyek(projObj ? `${projObj.code} - ${projObj.projectName}` : "");
        setMTipeCatatan(presetTipe);
        setMQty("");
        setMNote(presetTipe === "ESTIMASI" ? "Estimasi kebutuhan chemical proyek oleh Gudang" : "");
    };

    const submitMutation = async () => {
        if (!mutation || !mutation.item) { alert("Pilih barang/item inventaris secara eksplisit terlebih dahulu."); return; }
        if (mutation.type === "OUT" && !mProjectId) { alert("Pilih proyek tujuan secara eksplisit terlebih dahulu."); return; }
        const qty = Number(mQty.replace(",", "."));
        if (!Number.isFinite(qty) || qty <= 0) { alert("Jumlah harus lebih dari 0."); return; }
        setBusy(true);
        try {
            const selectedProj = projects.find(p => p.id === mProjectId);
            const labelProyek = selectedProj ? `[ID:${selectedProj.code}] ${selectedProj.projectName}` : (mProyek || undefined);
            await processInventoryRPC({
                itemId: mutation.item.id,
                quantity: qty,
                type: mutation.type,
                notes: mNote ? `[${mTipeCatatan}] ${mNote}` : `[${mTipeCatatan}] Dicatat oleh ${user?.name || "Gudang"}`,
                proyek: labelProyek,
                projectId: selectedProj ? selectedProj.id : null,
                tipeCatatan: mTipeCatatan,
            });
            setMutation(null); setMQty(""); setMNote(""); setMProyek(""); setMProjectId("");
            await reload();
        } catch (e) { alert(e instanceof Error ? e.message : "Gagal mencatat mutasi."); }
        finally { setBusy(false); }
    };

    const submitNewItem = async () => {
        if (!companyId) return;
        if (!newItem.nama.trim()) { alert("Nama item wajib diisi."); return; }
        const stokAwal = Number(newItem.stokAwal.replace(",", "."));
        const minAlert = Number(newItem.minAlert.replace(",", "."));
        const hargaSatuan = Number(newItem.hargaSatuan.replace(/\D/g, "")) || 0;
        if (![stokAwal, minAlert].every(n => Number.isFinite(n) && n >= 0)) { alert("Stok awal dan min alert harus angka ≥ 0."); return; }
        setBusy(true);
        try {
            await createInventoryItem(companyId, {
                nama: newItem.nama,
                kategori: newItem.kategori,
                satuan: newItem.satuan,
                stokAwal,
                minAlert,
                hargaSatuan,
            });
            setShowNew(false);
            setNewItem({ nama: "", kategori: "Chemical", satuan: "Botol 500ml", stokAwal: "0", minAlert: "5", hargaSatuan: "185000" });
            await reload();
        } catch (e) { alert(e instanceof Error ? e.message : "Gagal menambah item."); }
        finally { setBusy(false); }
    };

    const downloadTemplate = () => {
        const wb = XLSX.utils.book_new();
        const header = ["Nama Item", "Kategori (Chemical/Alat/Perangkap)", "Satuan", "Stok Awal", "Min Alert", "Harga Satuan HPP"];
        const sheets: { name: string; examples: (string | number)[][] }[] = [
            {
                name: "Obat & Chemical",
                examples: [
                    ["Termidor 25 WG", "Chemical", "Kg", 10, 2, 850000],
                    ["Demand CS 50ml", "Chemical", "Botol 50ml", 20, 5, 185000],
                    ["Solfac 50ml", "Chemical", "Botol 50ml", 15, 3, 210000],
                ],
            },
            {
                name: "Alat Proyek",
                examples: [
                    ["Mesin Pompa Injeksi", "Alat", "Unit", 3, 1, 2500000],
                    ["Selang Pompa 10m", "Alat", "Pcs", 5, 2, 350000],
                    ["Bor Listrik", "Alat", "Unit", 4, 1, 1200000],
                ],
            },
            {
                name: "Perangkap & Sanitation",
                examples: [
                    ["Perangkap Tikus Kotak", "Perangkap", "Pcs", 20, 5, 45000],
                    ["Glue Board Tikus", "Perangkap", "Pcs", 50, 10, 12000],
                    ["Bait Station Rayap", "Perangkap", "Pcs", 15, 5, 75000],
                ],
            },
            {
                name: "Pipa & Aksesoris",
                examples: [
                    ["Pipa PVC 1/2 inch 4m", "Pipa", "Batang", 30, 5, 35000],
                    ["Elbow 1/2 inch", "Pipa", "Pcs", 100, 20, 3500],
                    ["Konektor T 1/2 inch", "Pipa", "Pcs", 80, 20, 4000],
                ],
            },
            {
                name: "Sparepart",
                examples: [
                    ["Filter Pompa", "Sparepart", "Pcs", 10, 2, 85000],
                    ["Seal Kit Pompa", "Sparepart", "Set", 5, 2, 150000],
                    ["Nozzle Semprot", "Sparepart", "Pcs", 20, 5, 25000],
                ],
            },
        ];
        for (const s of sheets) {
            const ws = XLSX.utils.aoa_to_sheet([header, ...s.examples]);
            XLSX.utils.book_append_sheet(wb, ws, s.name);
        }
        XLSX.writeFile(wb, "Template_Stok_Gudang.xlsx");
    };

    const loadGuciWarehouseCatalog = async () => {
        if (!companyId) return;
        if (!confirm("Muat seluruh katalog inventaris riil PT Guci Emas Pratama dari Data Gudang (Obat, Alat, Sparepart, Pipa, Perangkap)?")) return;
        setIsImporting(true);
        try {
            let addedCount = 0;
            const existingNames = new Set(items.map(i => i.nama.toLowerCase().trim()));
            for (const item of GUCI_WAREHOUSE_CATALOG) {
                if (!existingNames.has(item.nama.toLowerCase().trim())) {
                    await createInventoryItem(companyId, item);
                    addedCount++;
                }
            }
            await reload();
            alert(`Berhasil memuat ${addedCount} item inventaris dari katalog Data Gudang September.`);
        } catch (err) {
            alert(`Gagal memuat katalog: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsImporting(false);
        }
    };

    const handleImportBulk = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file || !companyId) return;
        if (file.size > MAX_IMPORT_BYTES) { alert("File terlalu besar (maksimal 2 MB)."); return; }
        const reader = new FileReader();
        reader.onload = evt => {
            try {
                const wb = XLSX.read(evt.target?.result, { type: file.name.endsWith('.csv') ? "string" : "binary" });
                const allRows: InventoryImportRow[] = [];
                for (const sheetName of wb.SheetNames) {
                    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName]);
                    for (const r of raw) {
                        const nama = String(r["Nama Item"] || r["NAMA OBAT"] || r["NAMA ALAT"] || r["NAMA BARANG"] || "").trim();
                        if (!nama) continue;
                        allRows.push({
                            nama,
                            kategori: String(r["Kategori (Chemical/Alat/Perangkap)"] || r["Kategori"] || r["KATEGORI"] || "Lainnya"),
                            satuan: String(r["Satuan"] || r["SATUAN"] || "Pcs"),
                            stokAwal: Number(r["Stok Awal"] || r["JUMLAH"] || r["Jumlah"] || r["Stok"] || 0),
                            minAlert: Number(r["Min Alert"] || r["Batas Minimum"] || 5),
                            hargaSatuan: Number(r["Harga Satuan HPP"] || r["HARGA"] || r["Harga"] || 150000),
                            _status: "ok",
                        });
                    }
                }
                if (allRows.length === 0) { alert("File kosong atau format tidak sesuai."); return; }
                if (allRows.length > MAX_IMPORT_ROWS) { alert(`Maksimal ${MAX_IMPORT_ROWS} baris per import.`); return; }
                setImportPreviewRows(allRows);
            } catch (err) {
                alert(`Gagal membaca file: ${err instanceof Error ? err.message : String(err)}`);
            }
        };
        if (file.name.endsWith('.csv') || file.type.includes('csv')) {
            reader.readAsText(file, 'utf-8');
        } else {
            reader.readAsBinaryString(file);
        }
    };

    const handleConfirmInventoryImport = async (validRows: InventoryImportRow[]) => {
        if (!companyId) return;
        setIsImporting(true);
        try {
            let ok = 0;
            for (const r of validRows) {
                await createInventoryItem(companyId, {
                    nama: r.nama,
                    kategori: r.kategori,
                    satuan: r.satuan,
                    stokAwal: r.stokAwal,
                    minAlert: r.minAlert,
                    hargaSatuan: r.hargaSatuan,
                });
                ok++;
            }
            await reload();
            setImportPreviewRows(null);
            alert(`Berhasil mengimpor ${ok} item ke gudang.`);
        } catch (err) {
            alert(`Gagal import: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsImporting(false);
        }
    };

    const categories = useMemo(() => {
        const set = new Set<string>();
        items.forEach(i => { if (i.kategori) set.add(i.kategori); });
        return Array.from(set);
    }, [items]);

    const safeStockItems = useMemo(() => items.filter(s => s.stok > s.minAlert), [items]);
    const lowStockItems = useMemo(() => items.filter(s => s.stok <= s.minAlert), [items]);
    const emptyStockItems = useMemo(() => items.filter(s => s.stok <= 0), [items]);

    const filtered = useMemo(() => {
        let base = tab === "alert" ? lowStockItems : items;
        if (tab === "stok") {
            if (stockHealthFilter === "SAFE") base = safeStockItems;
            else if (stockHealthFilter === "LOW") base = lowStockItems;
            else if (stockHealthFilter === "EMPTY") base = emptyStockItems;
        }
        if (kategoriFilter !== "ALL") base = base.filter(s => s.kategori === kategoriFilter);
        const search = debouncedSearch.trim().toLowerCase();
        if (search) base = base.filter(s => s.nama.toLowerCase().includes(search));
        return base;
    }, [items, safeStockItems, lowStockItems, emptyStockItems, tab, stockHealthFilter, kategoriFilter, debouncedSearch]);

    const pagedItems = useMemo(
        () => filtered.slice((itemsPage - 1) * INVENTORY_PAGE_SIZE, itemsPage * INVENTORY_PAGE_SIZE),
        [filtered, itemsPage],
    );
    const pagedLogs = useMemo(
        () => logs.slice((logsPage - 1) * INVENTORY_PAGE_SIZE, logsPage * INVENTORY_PAGE_SIZE),
        [logs, logsPage],
    );
    const itemTotalPages = Math.max(1, Math.ceil(filtered.length / INVENTORY_PAGE_SIZE));
    const logTotalPages = Math.max(1, Math.ceil(logs.length / INVENTORY_PAGE_SIZE));
    useEffect(() => { if (itemsPage > itemTotalPages) setItemsPage(itemTotalPages); }, [itemsPage, itemTotalPages]);
    useEffect(() => { if (logsPage > logTotalPages) setLogsPage(logTotalPages); }, [logsPage, logTotalPages]);

    // ─── ANALITIK TREN BAHAN KIMIA (CAIR & PADAT) — KHUSUS ADMIN, DIREKTUR, & GUDANG ───
    const chemicalTrendAnalytics = useMemo(() => {
        const now = new Date();
        const cutoffMs = (() => {
            if (trendPeriod === "7d") return now.getTime() - 7 * 86400_000;
            if (trendPeriod === "30d") return now.getTime() - 30 * 86400_000;
            if (trendPeriod === "month") return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
            return 0;
        })();

        const outLogs = logs.filter(l => {
            if ((l.qtyKeluar || 0) <= 0) return false;
            const logTime = l.createdAt instanceof Date ? l.createdAt.getTime() : new Date(l.tanggal).getTime();
            if (cutoffMs > 0 && logTime < cutoffMs) return false;
            const it = itemName.get(l.itemId);
            const form = classifyChemicalForm(it);
            if (chemFormFilter !== "ALL" && form !== chemFormFilter) return false;
            return true;
        });

        const byDate = new Map<string, { date: string; liquidQty: number; solidQty: number; totalQty: number; totalCost: number }>();
        const byChemical = new Map<string, { id: string; nama: string; satuan: string; form: "LIQUID" | "SOLID"; qty: number; cost: number; count: number }>();
        const byProject = new Map<string, { projectLabel: string; liquidQty: number; solidQty: number; itemsUsed: string[]; totalCost: number; lastDate: string }>();

        let totalLiquidQty = 0;
        let totalSolidQty = 0;
        let totalCostUsed = 0;

        for (const l of outLogs) {
            const it = itemName.get(l.itemId);
            const form = classifyChemicalForm(it);
            const qty = l.qtyKeluar || 0;
            const cost = l.biayaTotal > 0 ? l.biayaTotal : qty * (it?.hargaSatuan ?? 150000);
            const dKey = l.tanggal || new Date().toISOString().slice(0, 10);

            if (form === "LIQUID") totalLiquidQty += qty;
            else totalSolidQty += qty;
            totalCostUsed += cost;

            const dRec = byDate.get(dKey) ?? { date: dKey, liquidQty: 0, solidQty: 0, totalQty: 0, totalCost: 0 };
            if (form === "LIQUID") dRec.liquidQty += qty;
            else dRec.solidQty += qty;
            dRec.totalQty += qty;
            dRec.totalCost += cost;
            byDate.set(dKey, dRec);

            const cKey = l.itemId;
            const cRec = byChemical.get(cKey) ?? {
                id: cKey,
                nama: it?.nama ?? "Bahan Kimia",
                satuan: it?.satuan ?? "Unit",
                form,
                qty: 0,
                cost: 0,
                count: 0,
            };
            cRec.qty += qty;
            cRec.cost += cost;
            cRec.count += 1;
            byChemical.set(cKey, cRec);

            const pLabel = l.proyek || "Pemakaian Operasional Umum";
            const pRec = byProject.get(pLabel) ?? {
                projectLabel: pLabel,
                liquidQty: 0,
                solidQty: 0,
                itemsUsed: [],
                totalCost: 0,
                lastDate: dKey,
            };
            if (form === "LIQUID") pRec.liquidQty += qty;
            else pRec.solidQty += qty;
            const itemEntry = `${it?.nama ?? "Chemical"} (${fmt(qty)} ${it?.satuan ?? ""})`;
            if (!pRec.itemsUsed.includes(itemEntry)) pRec.itemsUsed.push(itemEntry);
            pRec.totalCost += cost;
            if (dKey > pRec.lastDate) pRec.lastDate = dKey;
            byProject.set(pLabel, pRec);
        }

        const dailySeries = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
        const peakDay = dailySeries.reduce<{ date: string; totalQty: number } | null>(
            (best, cur) => (!best || cur.totalQty > best.totalQty ? { date: cur.date, totalQty: cur.totalQty } : best),
            null
        );
        const lowestDay = dailySeries.reduce<{ date: string; totalQty: number } | null>(
            (best, cur) => (!best || cur.totalQty < best.totalQty ? { date: cur.date, totalQty: cur.totalQty } : best),
            null
        );
        const totalCombinedQty = totalLiquidQty + totalSolidQty;
        const avgDailyQty = dailySeries.length > 0 ? totalCombinedQty / dailySeries.length : 0;

        return {
            totalLiquidQty,
            totalSolidQty,
            totalCombinedQty,
            totalCostUsed,
            peakDay,
            lowestDay,
            avgDailyQty,
            dailySeries,
            topChemicals: Array.from(byChemical.values()).sort((a, b) => b.qty - a.qty),
            projectUsage: Array.from(byProject.values()).sort((a, b) => b.lastDate.localeCompare(a.lastDate)),
        };
    }, [logs, itemName, trendPeriod, chemFormFilter]);

    // Hitung Estimasi Chemical & Analisis Untung Rugi per ID Proyek (Untuk Gudang, Admin, Marketing, & Superadmin)
    const projectProfitability = useMemo(() => {
        return projects.map(proj => {
            const matchedLogs = logs.filter(l =>
                l.projectId === proj.id ||
                (l.proyek && (l.proyek.includes(proj.code) || l.proyek.toLowerCase().includes(proj.clientName.toLowerCase()) || l.proyek.toLowerCase().includes(proj.projectName.toLowerCase())))
            );

            const chemicalEntries = matchedLogs.map(l => {
                const it = itemName.get(l.itemId);
                const qty = l.qtyKeluar || l.qtyMasuk || 0;
                const unitCost = it?.hargaSatuan ?? 150000;
                const totalCost = l.biayaTotal > 0 ? l.biayaTotal : qty * unitCost;
                return {
                    logId: l.id,
                    itemName: it?.nama ?? "Chemical",
                    satuan: it?.satuan ?? "Unit",
                    qty,
                    unitCost,
                    totalCost,
                    tipe: l.tipeCatatan,
                    tanggal: l.tanggal,
                    notes: l.keterangan,
                };
            });

            const hasManualLogs = chemicalEntries.length > 0;
            const totalChemicalCost = hasManualLogs
                ? chemicalEntries.reduce((acc, c) => acc + c.totalCost, 0)
                : Math.round(proj.contractValue * 0.14);

            const operationalCost = Math.round(proj.contractValue * 0.12);
            const grossProfit = proj.contractValue - totalChemicalCost - operationalCost;
            const marginPct = proj.contractValue > 0 ? Math.round((grossProfit / proj.contractValue) * 100) : 0;

            return {
                ...proj,
                hasManualLogs,
                chemicalEntries,
                totalChemicalCost,
                operationalCost,
                grossProfit,
                marginPct,
            };
        });
    }, [projects, logs, itemName]);

    const pagedProjectProfitability = useMemo(
        () => projectProfitability.slice((projectPage - 1) * INVENTORY_PAGE_SIZE, projectPage * INVENTORY_PAGE_SIZE),
        [projectProfitability, projectPage],
    );
    const projectTotalPages = Math.max(1, Math.ceil(projectProfitability.length / INVENTORY_PAGE_SIZE));
    useEffect(() => { if (projectPage > projectTotalPages) setProjectPage(projectTotalPages); }, [projectPage, projectTotalPages]);

    const invTabs: { id: InvTab; label: string; shortLabel: string; icon: React.ReactNode; badge?: number; badgeTone?: "danger" }[] = isDirector ? [
        { id: "proyek", label: "Analisis Untung Rugi & Keuntungan Chemical", shortLabel: "Untung Rugi", icon: <Calculator size={15} />, badge: projects.length },
        { id: "stok",   label: "Daftar Stok Obat & Alat", shortLabel: "Semua Stok", icon: <ClipboardList size={15} />, badge: items.length },
        { id: "chemical-trend", label: "Tren Bahan Kimia (Cair & Padat)", shortLabel: "Tren Kimia", icon: <FlaskConical size={15} /> },
        { id: "rekap",  label: "Rekap Bulanan", shortLabel: "Rekap", icon: <FileText size={15} /> },
        { id: "log",    label: "Riwayat Masuk / Keluar", shortLabel: "Riwayat", icon: <Trash2 size={15} />, badge: logs.length },
        { id: "alert",  label: "Stok Hampir Habis", shortLabel: "Stok Minim", icon: <AlertTriangle size={15} />, badge: lowStockItems.length, badgeTone: "danger" as const },
    ] : [
        { id: "stok",   label: "Daftar Stok Obat & Alat", shortLabel: "Stok Gudang", icon: <ClipboardList size={15} />, badge: items.length },
        { id: "alert",  label: "Stok Hampir Habis", shortLabel: "Perlu Beli", icon: <AlertTriangle size={15} />, badge: lowStockItems.length, badgeTone: "danger" as const },
        { id: "proyek", label: "Alokasi Pemakaian ke Proyek", shortLabel: "Alokasi Proyek", icon: <Briefcase size={15} />, badge: projects.length },
        ...(canAccessChemicalTrend
            ? [{ id: "chemical-trend" as InvTab, label: "Tren Bahan Kimia (Cair & Padat)", shortLabel: "Tren Kimia", icon: <FlaskConical size={15} /> }]
            : []),
        { id: "log",    label: "Riwayat Masuk / Keluar", shortLabel: "Riwayat", icon: <Trash2 size={15} />, badge: logs.length },
        { id: "rekap",  label: "Rekap Bulanan", shortLabel: "Rekap", icon: <FileText size={15} /> },
    ];

    if (!companyId) {
        return <div className="p-6 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl m-4">Pilih perusahaan pada menu di sidebar untuk melihat gudang.</div>;
    }

    return (
        <div className="space-y-5">
            {/* Pusat Aksi Cepat Minimalis (1-Klik Barang Masuk & Dipakai Proyek) */}
            {canWrite && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                        type="button"
                        onClick={() => {
                            if (items.length > 0) openMutationModal(null, "IN", "", "REALISASI");
                            else setShowNew(true);
                        }}
                        className="clean-card p-4 flex items-center justify-between gap-3 text-left hover:border-emerald-500 bg-gradient-to-r from-emerald-50/70 to-white dark:from-emerald-950/30 dark:to-[var(--bg-card)] transition-all cursor-pointer group shadow-2xs"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                                <ArrowDownCircle size={20} />
                            </div>
                            <div>
                                <span className="font-extrabold text-sm text-[var(--text-primary)] block">
                                    + Catat Barang Masuk (IN)
                                </span>
                                <span className="text-xs text-[var(--text-secondary)] mt-0.5 block">
                                    1-klik tambah stok obat atau alat dari supplier
                                </span>
                            </div>
                        </div>
                        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 hidden sm:inline-flex items-center gap-1 shrink-0">
                            Catat <ArrowRight size={13} />
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            if (items.length > 0) openMutationModal(null, "OUT", "", "REALISASI");
                            else setTab("proyek");
                        }}
                        className="clean-card p-4 flex items-center justify-between gap-3 text-left hover:border-amber-500 bg-gradient-to-r from-amber-50/70 to-white dark:from-amber-950/30 dark:to-[var(--bg-card)] transition-all cursor-pointer group shadow-2xs"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                                <ArrowUpCircle size={20} />
                            </div>
                            <div>
                                <span className="font-extrabold text-sm text-[var(--text-primary)] block">
                                    - Keluarkan ke Proyek / Teknisi (OUT)
                                </span>
                                <span className="text-xs text-[var(--text-secondary)] mt-0.5 block">
                                    1-klik catat obat/alat yang dibawa teknisi ke lokasi klien
                                </span>
                            </div>
                        </div>
                        <span className="text-xs font-bold text-amber-700 dark:text-amber-400 hidden sm:inline-flex items-center gap-1 shrink-0">
                            Catat <ArrowRight size={13} />
                        </span>
                    </button>
                </div>
            )}

            {/* Sub-tab internal Gudang, Tren Bahan Kimia & Analisis Direktur */}
            {(isWarehouseRole || isDirector) && (
                <TabContainer
                    tabs={invTabs}
                    activeTab={tab}
                    onChange={(id) => setTab(id as InvTab)}
                    showFloatingBottom={false}
                />
            )}

            {/* Header & Action Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <div>
                    <h2 className="text-lg sm:text-xl font-extrabold text-[var(--text-primary)] tracking-tight">
                        {tab === "proyek"
                            ? isDirector
                                ? "Estimasi Chemical per ID Proyek & Analisis Untung Rugi"
                                : "Alokasi Bahan Chemical per ID Proyek"
                            : tab === "chemical-trend"
                            ? "Analitik & Tren Pemakaian Bahan Kimia (Cair & Padat)"
                            : "Mode Kerja Gudang Minimalis — Stok Obat & Alat"}
                    </h2>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        {tab === "proyek"
                            ? isDirector
                                ? "Pantau nilai kontrak, biaya chemical, operasional teknisi, dan margin untung rugi per proyek."
                                : "Catat alokasi chemical ke ID proyek untuk operasional. Estimasi keuntungan dan margin finansial dikunci khusus Direktur."
                            : tab === "chemical-trend"
                            ? "Evaluasi tren pemakaian bahan kimia cair (mL/Liter) dan padat/umpan (gr/Kg/Butir) per periode dan per proyek."
                            : "Klik kartu status di bawah untuk menyaring stok, atau klik tombol [+ Masuk] / [- Pakai Proyek] langsung pada baris barang."}
                    </p>
                </div>
                {canWrite && (
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={() => setTab("chemical-trend")}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[var(--accent-text)] bg-[var(--accent-glow)] border border-[var(--border-subtle)] rounded-xl transition-colors cursor-pointer"
                        >
                            <FlaskConical size={14} /> Cek Tren Kimia
                        </button>
                        <button
                            onClick={() => setShowNew(true)}
                            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-[var(--accent)] text-white rounded-xl hover:bg-[var(--accent-hover)] transition-colors shadow-xs cursor-pointer"
                        >
                            <Plus size={14} /> Tambah Barang Baru
                        </button>
                    </div>
                )}
            </div>

            {error && <div className="p-3 rounded-xl text-sm border border-red-200 bg-red-50 text-red-700">{error}</div>}

            {loading && <div className="py-10 text-center text-sm text-slate-400"><Loader2 className="inline animate-spin mr-2" size={14} />Memuat data gudang & proyek...</div>}

            {/* ═══════════════════════════════════════════════════════════════════════
                TAB BARU (PHASE 2): TREN BAHAN KIMIA (CAIR & PADAT)
                Diakses oleh: SUPERADMIN (Direktur), ADMIN, dan INVENTORY (Gudang)
               ═══════════════════════════════════════════════════════════════════════ */}
            {!loading && tab === "chemical-trend" && canAccessChemicalTrend && (
                <div className="space-y-5">
                    {/* Baris Filter Mode Wujud Kimia (Cair vs Padat) & Periode */}
                    <div className="clean-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-bold text-[var(--text-secondary)] mr-1">Wujud Kimia:</span>
                            {([
                                { id: "ALL", label: "Semua Bahan Kimia", icon: <Layers size={13} /> },
                                { id: "LIQUID", label: "Bahan Kimia Cair (mL / Liter)", icon: <Droplets size={13} /> },
                                { id: "SOLID", label: "Bahan Kimia Padat & Umpan (gr / Kg / Pcs)", icon: <FlaskConical size={13} /> },
                            ] as const).map(opt => (
                                <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => setChemFormFilter(opt.id)}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                                        chemFormFilter === opt.id
                                            ? "bg-[var(--accent)] text-white border-[var(--accent)] shadow-2xs"
                                            : "bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--bg-tertiary)]"
                                    }`}
                                >
                                    {opt.icon}
                                    <span>{opt.label}</span>
                                </button>
                            ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-bold text-[var(--text-secondary)] mr-1">Periode:</span>
                            {([
                                { id: "7d", label: "7 Hari" },
                                { id: "30d", label: "30 Hari" },
                                { id: "month", label: "Bulan Ini" },
                                { id: "all", label: "Semua" },
                            ] as const).map(p => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => setTrendPeriod(p.id)}
                                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                                        trendPeriod === p.id
                                            ? "bg-[#1e3a8a] text-white border-[#3b82f6]"
                                            : "bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--bg-tertiary)]"
                                    }`}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 4 Kartu Ringkasan Metrik Tren Bahan Kimia (Gaya Jarivis Analytics PCO) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                        <div className="clean-card p-4 border-l-4 border-l-[#3b82f6] space-y-1">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                TOTAL PENGGUNAAN PERIODE
                            </span>
                            <div className="text-xl font-black font-mono text-[var(--text-primary)]">
                                {fmt(chemicalTrendAnalytics.totalCombinedQty)} <span className="text-xs font-semibold text-[var(--text-secondary)]">Unit</span>
                            </div>
                            <p className="text-[11px] text-[var(--text-secondary)]">
                                Cair: <strong>{fmt(chemicalTrendAnalytics.totalLiquidQty)}</strong> • Padat: <strong>{fmt(chemicalTrendAnalytics.totalSolidQty)}</strong>
                            </p>
                        </div>

                        <div className="clean-card p-4 border-l-4 border-l-emerald-500 space-y-1">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                PUNCAK PENGGUNAAN TERTINGGI
                            </span>
                            <div className="text-xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                                {chemicalTrendAnalytics.peakDay ? `${fmt(chemicalTrendAnalytics.peakDay.totalQty)} Unit` : "0 Unit"}
                            </div>
                            <p className="text-[11px] text-[var(--text-secondary)]">
                                {chemicalTrendAnalytics.peakDay ? `Tanggal: ${chemicalTrendAnalytics.peakDay.date}` : "Belum ada pemakaian tercatat"}
                            </p>
                        </div>

                        <div className="clean-card p-4 border-l-4 border-l-amber-500 space-y-1">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                PENGGUNAAN TERENDAH (HARI AKTIF)
                            </span>
                            <div className="text-xl font-black font-mono text-amber-600 dark:text-amber-400">
                                {chemicalTrendAnalytics.lowestDay ? `${fmt(chemicalTrendAnalytics.lowestDay.totalQty)} Unit` : "0 Unit"}
                            </div>
                            <p className="text-[11px] text-[var(--text-secondary)]">
                                {chemicalTrendAnalytics.lowestDay ? `Tanggal: ${chemicalTrendAnalytics.lowestDay.date}` : "Belum ada pemakaian tercatat"}
                            </p>
                        </div>

                        <div className="clean-card p-4 border-l-4 border-l-purple-500 space-y-1">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                RATA-RATA HARIAN
                            </span>
                            <div className="text-xl font-black font-mono text-[var(--text-primary)]">
                                {fmt(chemicalTrendAnalytics.avgDailyQty)} <span className="text-xs font-semibold text-[var(--text-secondary)]">Unit / Hari</span>
                            </div>
                            <p className="text-[11px] text-[var(--text-secondary)]">
                                {isAdminOrDirector
                                    ? `Nilai HPP Terpakai: ${formatRupiah(chemicalTrendAnalytics.totalCostUsed)}`
                                    : `${chemicalTrendAnalytics.dailySeries.length} hari kerja aktif`}
                            </p>
                        </div>
                    </div>

                    {/* Grid Grafik Tren Harian & Komposisi Bahan Kimia Teratas */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                        {/* Grafik Tren Penggunaan Harian (7 cols) */}
                        <div className="lg:col-span-7 clean-card p-5 space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                                        <BarChart3 size={16} className="text-[var(--accent)]" />
                                        Grafik Tren Pemakaian Bahan Kimia Harian
                                    </h3>
                                    <p className="text-xs text-[var(--text-secondary)]">
                                        Perbandingan volume bahan kimia Cair (Biru) vs Padat/Umpan (Hijau Emerald)
                                    </p>
                                </div>
                            </div>

                            {chemicalTrendAnalytics.dailySeries.length === 0 ? (
                                <div className="py-12 text-center text-xs text-[var(--text-muted)] border border-dashed border-[var(--border-subtle)] rounded-xl">
                                    Belum ada riwayat pengeluaran bahan kimia pada periode ini. Klik <strong>- Pakai Proyek</strong> di tab Stok untuk mulai mencatat.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="h-48 flex items-end gap-2 pt-4 pb-2 px-2 overflow-x-auto border-b border-[var(--border-subtle)]">
                                        {chemicalTrendAnalytics.dailySeries.map(d => {
                                            const maxVal = Math.max(1, ...chemicalTrendAnalytics.dailySeries.map(x => x.totalQty));
                                            const heightPct = Math.max(10, Math.round((d.totalQty / maxVal) * 100));
                                            const liqRatio = d.totalQty > 0 ? Math.round((d.liquidQty / d.totalQty) * 100) : 0;
                                            return (
                                                <div key={d.date} className="flex-1 min-w-[44px] flex flex-col items-center gap-1.5 group">
                                                    <span className="text-[10px] font-mono font-bold text-[var(--text-secondary)]">
                                                        {fmt(d.totalQty)}
                                                    </span>
                                                    <div className="w-full max-w-[32px] h-32 bg-[var(--bg-tertiary)] rounded-t-lg flex flex-col justify-end overflow-hidden border border-[var(--border-subtle)]">
                                                        <div
                                                            style={{ height: `${heightPct}%` }}
                                                            className="w-full flex flex-col justify-end transition-all duration-300"
                                                            title={`${d.date}: Cair ${fmt(d.liquidQty)} | Padat ${fmt(d.solidQty)}`}
                                                        >
                                                            <div
                                                                style={{ height: `${liqRatio}%` }}
                                                                className="w-full bg-[#3b82f6]"
                                                            />
                                                            <div
                                                                style={{ height: `${100 - liqRatio}%` }}
                                                                className="w-full bg-emerald-600"
                                                            />
                                                        </div>
                                                    </div>
                                                    <span className="text-[10px] font-mono text-[var(--text-muted)] whitespace-nowrap">
                                                        {d.date.slice(5)}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="flex items-center justify-center gap-5 text-xs">
                                        <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                                            <span className="w-3 h-3 rounded-xs bg-[#3b82f6]" /> Kimia Cair (mL/Liter/Botol)
                                        </span>
                                        <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                                            <span className="w-3 h-3 rounded-xs bg-emerald-600" /> Kimia Padat &amp; Umpan (gr/Kg/Pcs)
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Top Bahan Kimia Paling Banyak Digunakan (5 cols) */}
                        <div className="lg:col-span-5 clean-card p-5 space-y-3">
                            <h3 className="text-sm font-bold text-[var(--text-primary)]">
                                Peringkat Konsumsi Bahan Kimia Teratas
                            </h3>
                            <p className="text-xs text-[var(--text-secondary)]">
                                Urutan item berdasarkan total volume pemakaian di lapangan
                            </p>

                            {chemicalTrendAnalytics.topChemicals.length === 0 ? (
                                <div className="py-10 text-center text-xs text-[var(--text-muted)]">
                                    Belum ada item bahan kimia yang dikeluarkan pada periode ini.
                                </div>
                            ) : (
                                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                                    {chemicalTrendAnalytics.topChemicals.slice(0, 8).map(c => {
                                        const maxC = Math.max(1, chemicalTrendAnalytics.topChemicals[0]?.qty || 1);
                                        const pct = Math.min(100, Math.round((c.qty / maxC) * 100));
                                        return (
                                            <div key={c.id} className="space-y-1 p-2.5 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
                                                <div className="flex items-center justify-between gap-2 text-xs">
                                                    <div className="font-bold text-[var(--text-primary)] truncate flex items-center gap-1.5">
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                            c.form === "LIQUID" ? "bg-blue-500/15 text-blue-600" : "bg-emerald-500/15 text-emerald-700"
                                                        }`}>
                                                            {c.form === "LIQUID" ? "CAIR" : "PADAT"}
                                                        </span>
                                                        <span className="truncate">{c.nama}</span>
                                                    </div>
                                                    <span className="font-mono font-bold text-[var(--text-primary)] shrink-0">
                                                        {fmt(c.qty)} {c.satuan}
                                                    </span>
                                                </div>
                                                <div className="w-full h-1.5 rounded-full bg-[var(--bg-card)] overflow-hidden">
                                                    <div
                                                        style={{ width: `${pct}%` }}
                                                        className={`h-full rounded-full ${c.form === "LIQUID" ? "bg-[#3b82f6]" : "bg-emerald-600"}`}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Tabel Rincian Pemakaian Bahan Kimia per Pelanggan / Proyek */}
                    <div className="clean-card overflow-hidden">
                        <div className="p-4 sm:p-5 border-b border-[var(--border-subtle)] flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                                    Rincian Pemakaian Bahan Kimia Berdasarkan Pelanggan / Proyek
                                </h3>
                                <p className="text-xs text-[var(--text-secondary)]">
                                    Rekapitulasi alokasi bahan kimia cair &amp; padat untuk setiap lokasi proyek
                                </p>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse min-w-[680px]">
                                <thead className="bg-[var(--bg-tertiary)] border-b border-[var(--border-subtle)] text-[10.5px] font-bold uppercase text-[var(--text-muted)]">
                                    <tr>
                                        <th className="py-3 px-4">Pelanggan / Proyek</th>
                                        <th className="py-3 px-4">Tanggal Terakhir</th>
                                        <th className="py-3 px-4 text-center">Kimia Cair</th>
                                        <th className="py-3 px-4 text-center">Kimia Padat</th>
                                        <th className="py-3 px-4">Rincian Material Dipakai</th>
                                        {isAdminOrDirector && <th className="py-3 px-4 text-right">Nilai HPP</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border-subtle)]">
                                    {chemicalTrendAnalytics.projectUsage.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="py-8 text-center text-[var(--text-muted)]">
                                                Belum ada data pemakaian bahan kimia per proyek.
                                            </td>
                                        </tr>
                                    ) : (
                                        chemicalTrendAnalytics.projectUsage.map((pu, idx) => (
                                            <tr key={idx} className="hover:bg-[var(--bg-tertiary)]/50">
                                                <td className="py-3 px-4 font-bold text-[var(--text-primary)]">{pu.projectLabel}</td>
                                                <td className="py-3 px-4 font-mono text-[var(--text-secondary)]">{pu.lastDate}</td>
                                                <td className="py-3 px-4 text-center font-mono font-bold text-blue-600">{fmt(pu.liquidQty)}</td>
                                                <td className="py-3 px-4 text-center font-mono font-bold text-emerald-700">{fmt(pu.solidQty)}</td>
                                                <td className="py-3 px-4 text-[var(--text-secondary)]">{pu.itemsUsed.join(", ")}</td>
                                                {isAdminOrDirector && (
                                                    <td className="py-3 px-4 text-right font-mono font-semibold text-[var(--text-primary)]">
                                                        {formatRupiah(pu.totalCost)}
                                                    </td>
                                                )}
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* SUB-TAB: PROYEK BARU, ESTIMASI CHEMICAL PER ID PROYEK, & ANALISIS UNTUNG RUGI */}
            {!loading && tab === "proyek" && (
                <div className="space-y-6">
                    {canWrite && items.length > 0 && projects.length > 0 && (
                        <div className="clean-card p-5 sm:p-6 border-emerald-200/80 bg-emerald-50/25 space-y-4">
                            <div>
                                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-950 flex items-center gap-1.5">
                                    <Briefcase size={14} className="text-emerald-700" />
                                    Input Cepat Estimasi / Realisasi Chemical ke ID Proyek
                                </h3>
                                <p className="text-[11px] text-emerald-800">
                                    Pilih proyek baru dan bahan chemical untuk dicatat ke ID proyek tersebut sebagai bahan analisis untung rugi internal.
                                </p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                                <div className="sm:col-span-5">
                                    <label className="block text-[10px] font-bold uppercase text-emerald-900 mb-1">Pilih Proyek Baru (ID Proyek)</label>
                                    <select
                                        value={mProjectId}
                                        onChange={e => setMProjectId(e.target.value)}
                                        className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-emerald-300 bg-white"
                                    >
                                        <option value="">-- Pilih Proyek Tujuan --</option>
                                        {projects.map(p => (
                                            <option key={p.id} value={p.id}>
                                                [{p.code}] {p.projectName} {isAdminOrDirector ? `(${formatRupiah(p.contractValue)})` : ""}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="sm:col-span-4">
                                    <label className="block text-[10px] font-bold uppercase text-emerald-900 mb-1">Pilih Chemical / Material Gudang</label>
                                    <select
                                        value={selectedItemIdForProj}
                                        onChange={e => setSelectedItemIdForProj(e.target.value)}
                                        className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-emerald-300 bg-white"
                                    >
                                        <option value="">-- Pilih Item / Chemical --</option>
                                        {items.map(it => (
                                            <option key={it.id} value={it.id}>
                                                {it.nama} ({it.satuan}{isAdminOrDirector ? ` • HPP ${formatRupiah(it.hargaSatuan)}` : ""})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="sm:col-span-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const chosenItem = items.find(i => i.id === selectedItemIdForProj) || null;
                                            openMutationModal(chosenItem, "OUT", mProjectId, "ESTIMASI");
                                        }}
                                        className="w-full py-2 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                                    >
                                        <Plus size={14} /> Masukan ke ID Proyek
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Tabel & Kartu Analisis Untung Rugi per Proyek */}
                    <div className="clean-card overflow-hidden">
                        <div className="p-5 sm:p-6 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                                <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                                    <TrendingUp size={16} className="text-[var(--accent)]" />
                                    Daftar Proyek Baru, Estimasi Chemical Gudang &amp; Analisis Untung Rugi (Internal)
                                </h3>
                                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                    Terintegrasi lintas role untuk Gudang, Admin, Marketing, dan Superadmin (Direktur)
                                </p>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs min-w-[920px]">
                                <thead className="bg-[var(--bg-tertiary)] border-b border-[var(--border-subtle)] text-[10.5px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                    <tr>
                                        <th className="py-3 px-4">ID Proyek &amp; Klien</th>
                                        <th className="py-3 px-4">Layanan &amp; Tanggal</th>
                                        <th className="py-3 px-4">Alokasi Chemical Gudang</th>
                                        {isDirector ? (
                                            <>
                                                <th className="py-3 px-4 text-right">Nilai Kontrak</th>
                                                <th className="py-3 px-4 text-right">HPP Chemical &amp; Ops</th>
                                                <th className="py-3 px-4 text-right">Estimasi Untung / Rugi</th>
                                            </>
                                        ) : (
                                            <th className="py-3 px-4 text-right">Analisis Margin &amp; Untung Rugi</th>
                                        )}
                                        {canWrite && <th className="py-3 px-4 text-right">Aksi Gudang</th>}
                                    </tr>
                                </thead>
                                <tbody key={projectPage} className="divide-y divide-[var(--border-subtle)] result-enter">
                                    {pagedProjectProfitability.map(p => {
                                        const isHealthy = p.marginPct >= 45;
                                        const isWarning = p.marginPct >= 20 && p.marginPct < 45;
                                        return (
                                            <tr key={p.id} className="hover:bg-[var(--bg-tertiary)]/50 align-top">
                                                <td className="py-3.5 px-4">
                                                    <span className="inline-block px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono font-bold text-[10.5px] text-[var(--accent)] mb-1">
                                                        ID: {p.code}
                                                    </span>
                                                    <div className="font-bold text-[var(--text-primary)]">{p.clientName}</div>
                                                    <div className="text-[11px] text-[var(--text-muted)]">{p.projectName}</div>
                                                </td>
                                                <td className="py-3.5 px-4">
                                                    <div className="font-semibold text-[var(--text-primary)]">{p.serviceLabel}</div>
                                                    <div className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">Jadwal: {p.workDate}</div>
                                                </td>
                                                <td className="py-3.5 px-4">
                                                    {p.chemicalEntries.length > 0 ? (
                                                        <div className="space-y-1">
                                                            {p.chemicalEntries.map(ce => (
                                                                <div key={ce.logId} className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px]">
                                                                    <div>
                                                                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold mr-1.5 ${
                                                                            ce.tipe === "ESTIMASI" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                                                                        }`}>
                                                                            {ce.tipe}
                                                                        </span>
                                                                        <strong>{ce.itemName}</strong> ({fmt(ce.qty)} {ce.satuan})
                                                                    </div>
                                                                    {isDirector && (
                                                                        <span className="font-mono font-semibold text-slate-700">{formatRupiah(ce.totalCost)}</span>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="text-[11px] text-amber-800 bg-amber-50/70 border border-amber-200 rounded-lg px-2.5 py-1.5">
                                                            {isDirector
                                                                ? `Belum ada input spesifik Gudang (baseline estimasi 14% = ${formatRupiah(p.totalChemicalCost)})`
                                                                : "Belum ada alokasi chemical tercatat dari Gudang"}
                                                        </div>
                                                    )}
                                                </td>
                                                {isDirector ? (
                                                    <>
                                                        <td className="py-3.5 px-4 text-right font-mono font-bold text-[var(--text-primary)] whitespace-nowrap">
                                                            {formatRupiah(p.contractValue)}
                                                        </td>
                                                        <td className="py-3.5 px-4 text-right font-mono whitespace-nowrap">
                                                            <div className="text-red-600 font-semibold">Chem: - {formatRupiah(p.totalChemicalCost)}</div>
                                                            <div className="text-[10.5px] text-[var(--text-muted)]">Ops: - {formatRupiah(p.operationalCost)}</div>
                                                        </td>
                                                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                                            <div className={`font-mono font-bold text-sm ${p.grossProfit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                                                                {formatRupiah(p.grossProfit)}
                                                            </div>
                                                            <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                                isHealthy
                                                                    ? "bg-emerald-100 text-emerald-800"
                                                                    : isWarning
                                                                    ? "bg-amber-100 text-amber-800"
                                                                    : "bg-red-100 text-red-700"
                                                            }`}>
                                                                Margin {p.marginPct}% ({p.grossProfit >= 0 ? "UNTUNG" : "RUGI"})
                                                            </span>
                                                        </td>
                                                    </>
                                                ) : (
                                                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 border border-slate-200 text-[11px] font-semibold">
                                                            <Lock size={12} className="text-amber-600" /> Khusus Direktur
                                                        </span>
                                                    </td>
                                                )}
                                                {canWrite && (
                                                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                openMutationModal(null, "OUT", p.id, "ESTIMASI");
                                                            }}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer"
                                                        >
                                                            <Plus size={12} /> Estimasi Chemical
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <Pagination page={projectPage} pageSize={INVENTORY_PAGE_SIZE} totalItems={projectProfitability.length}
                            onPageChange={setProjectPage} itemLabel="proyek" />
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════
                MODE KERJA GUDANG MINIMALIS (PHASE 1) — STOK & PERINGATAN RESTKOCK
               ═══════════════════════════════════════════════════════════════════════ */}
            {!loading && (tab === "stok" || tab === "alert") && (
                <div className="space-y-4">
                    {/* 4 Kartu Status Stok Warna Solid Interaktif (1-Klik Filter Cepat) */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <button
                            type="button"
                            onClick={() => { setTab("stok"); setStockHealthFilter("ALL"); setItemsPage(1); }}
                            className={`p-4 rounded-2xl text-left transition-all cursor-pointer border ${
                                tab === "stok" && stockHealthFilter === "ALL"
                                    ? "bg-[#1e293b] text-white border-[#3b82f6] ring-2 ring-[#3b82f6]/30 shadow-sm"
                                    : "bg-[var(--bg-card)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:bg-[var(--bg-tertiary)]"
                            }`}
                        >
                            <span className="text-[11px] font-bold uppercase tracking-wider opacity-80 block">Semua Item Gudang</span>
                            <span className="text-2xl font-black font-mono mt-1 block">{items.length}</span>
                            <span className="text-[11px] opacity-75 mt-0.5 block">Klik tampilkan semua</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => { setTab("stok"); setStockHealthFilter("SAFE"); setItemsPage(1); }}
                            className={`p-4 rounded-2xl text-left transition-all cursor-pointer border ${
                                tab === "stok" && stockHealthFilter === "SAFE"
                                    ? "bg-emerald-700 text-white border-emerald-500 ring-2 ring-emerald-500/30 shadow-sm"
                                    : "bg-emerald-50/70 dark:bg-emerald-950/25 text-emerald-950 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800/50 hover:bg-emerald-100/70"
                            }`}
                        >
                            <span className="text-[11px] font-bold uppercase tracking-wider opacity-80 block">Stok Aman</span>
                            <span className="text-2xl font-black font-mono mt-1 block">{safeStockItems.length}</span>
                            <span className="text-[11px] opacity-75 mt-0.5 block">Siap dialokasikan</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => { setTab("stok"); setStockHealthFilter("LOW"); setItemsPage(1); }}
                            className={`p-4 rounded-2xl text-left transition-all cursor-pointer border ${
                                (tab === "stok" && stockHealthFilter === "LOW") || tab === "alert"
                                    ? "bg-amber-600 text-white border-amber-400 ring-2 ring-amber-400/30 shadow-sm"
                                    : "bg-amber-50/70 dark:bg-amber-950/25 text-amber-950 dark:text-amber-200 border-amber-200 dark:border-amber-800/50 hover:bg-amber-100/70"
                            }`}
                        >
                            <span className="text-[11px] font-bold uppercase tracking-wider opacity-80 block">Stok Hampir Habis</span>
                            <span className="text-2xl font-black font-mono mt-1 block">{lowStockItems.length}</span>
                            <span className="text-[11px] opacity-75 mt-0.5 block">Perlu segera restock</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => { setTab("stok"); setStockHealthFilter("EMPTY"); setItemsPage(1); }}
                            className={`p-4 rounded-2xl text-left transition-all cursor-pointer border ${
                                tab === "stok" && stockHealthFilter === "EMPTY"
                                    ? "bg-rose-700 text-white border-rose-500 ring-2 ring-rose-500/30 shadow-sm"
                                    : "bg-rose-50/70 dark:bg-rose-950/25 text-rose-950 dark:text-rose-200 border-rose-200 dark:border-rose-800/50 hover:bg-rose-100/70"
                            }`}
                        >
                            <span className="text-[11px] font-bold uppercase tracking-wider opacity-80 block">Stok Habis (0)</span>
                            <span className="text-2xl font-black font-mono mt-1 block">{emptyStockItems.length}</span>
                            <span className="text-[11px] opacity-75 mt-0.5 block">Kosong di gudang</span>
                        </button>
                    </div>

                    <div className="clean-card p-4 sm:p-6 space-y-4">
                        {/* Barventis Filter & Action Row */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
                            <div className="flex flex-wrap items-center gap-2.5">
                                <span className="text-xs font-bold text-[var(--text-secondary)]">Kategori:</span>
                                <div className="flex flex-wrap gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => { setKategoriFilter("ALL"); setItemsPage(1); }}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                                            kategoriFilter === "ALL"
                                                ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                                                : "bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--bg-tertiary)]"
                                        }`}
                                    >
                                        Semua ({items.length})
                                    </button>
                                    {categories.map(c => (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => { setKategoriFilter(c); setItemsPage(1); }}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                                                kategoriFilter === c
                                                    ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                                                    : "bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--bg-tertiary)]"
                                            }`}
                                        >
                                            {c}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {canWrite && (
                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={loadGuciWarehouseCatalog}
                                        disabled={isImporting}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-xl hover:bg-emerald-100 transition-colors cursor-pointer"
                                        title="Muat otomatis master data inventaris dari arsip Data Gudang September"
                                    >
                                        <Package size={13} /> {isImporting ? "Memuat..." : "Muat Data Gudang"}
                                    </button>
                                    <button onClick={downloadTemplate} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer">
                                        <Download size={13} /> Template Excel
                                    </button>
                                    <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl hover:bg-[var(--bg-tertiary)] cursor-pointer transition-colors">
                                        {isImporting ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />} Import Excel
                                        <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={isImporting} onChange={handleImportBulk} />
                                    </label>
                                </div>
                            )}
                        </div>

                        {/* Search Bar Box */}
                        <div className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="relative flex-1">
                                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                                <input
                                    value={searchQ}
                                    onChange={e => { setSearchQ(e.target.value); setItemsPage(1); }}
                                    placeholder="Ketik nama obat/alat untuk langsung mencatat masuk atau keluar..."
                                    className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                                />
                                {searchQ && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchQ("")}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                            <span className="text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap">
                                Menampilkan <b>{filtered.length}</b> dari <b>{items.length}</b> barang
                            </span>
                        </div>

                        {/* Tampilan Mobile HP (< 768px): Kartu Gudang Minimalis Ramah Jempol */}
                        <div className="md:hidden space-y-2.5">
                            {pagedItems.map(s => {
                                const low = s.stok <= s.minAlert;
                                return (
                                    <div key={s.id} className="p-3.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] space-y-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                                                    {s.kategori}
                                                </span>
                                                <h4 className="font-extrabold text-sm text-[var(--text-primary)] mt-1">{s.nama}</h4>
                                                {!isWarehouseOnly && (
                                                    <p className="text-[11px] text-[var(--text-muted)] font-mono">
                                                        HPP: {formatRupiah(s.hargaSatuan)} / {s.satuan}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="text-right shrink-0">
                                                <span className={`inline-block px-3 py-1 rounded-xl font-mono font-black text-sm border ${
                                                    low ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-emerald-50 text-emerald-800 border-emerald-200"
                                                }`}>
                                                    {fmt(s.stok)} {s.satuan}
                                                </span>
                                                <span className="block text-[10px] text-[var(--text-muted)] mt-0.5">
                                                    Min: {fmt(s.minAlert)}
                                                </span>
                                            </div>
                                        </div>

                                        {canWrite && (
                                            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[var(--border-subtle)]">
                                                <button
                                                    type="button"
                                                    onClick={() => openMutationModal(s, "IN", "", "REALISASI")}
                                                    className="min-h-[42px] py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                                                >
                                                    <ArrowDownCircle size={15} /> + Stok Masuk
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => openMutationModal(s, "OUT", "", "REALISASI")}
                                                    className="min-h-[42px] py-2 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                                                >
                                                    <ArrowUpCircle size={15} /> - Pakai Proyek
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Tampilan Desktop (>= 768px): Barventis Pill Table */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-left border-collapse text-sm">
                                <thead>
                                    <tr className="bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-[11px] font-bold uppercase tracking-wider">
                                        <th className="p-3 rounded-l-xl">Barang / Material</th>
                                        <th className="p-3 text-center">Stok Saat Ini (Full)</th>
                                        <th className="p-3 text-center">Batas Minimum</th>
                                        <th className="p-3 text-center">Status Stok</th>
                                        {canWrite && <th className="p-3 text-center rounded-r-xl bg-emerald-500/10">Aksi Cepat 1-Klik (Masuk / Proyek)</th>}
                                    </tr>
                                </thead>
                                <tbody key={itemsPage} className="result-enter">
                                    {filtered.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-[var(--text-muted)]">
                                                {items.length === 0 ? (
                                                    <div className="max-w-md mx-auto space-y-3 py-4">
                                                        <Package size={32} className="mx-auto text-emerald-600 opacity-60" />
                                                        <div className="font-bold text-[var(--text-primary)] text-sm">Inventaris Gudang Belum Terisi</div>
                                                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                                                            Muat otomatis seluruh 35+ item obat anti rayap, pest control, mesin, sparepart, dan pipa dari arsip <b>Data Gudang September</b>.
                                                        </p>
                                                        {canWrite && (
                                                            <button
                                                                type="button"
                                                                onClick={loadGuciWarehouseCatalog}
                                                                disabled={isImporting}
                                                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                                                            >
                                                                <Package size={14} /> {isImporting ? "Memuat..." : "Muat 35+ Item Data Gudang"}
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    "Tidak ada hasil yang cocok dengan filter atau kata kunci."
                                                )}
                                            </td>
                                        </tr>
                                    )}
                                    {pagedItems.map(s => {
                                        const low = s.stok <= s.minAlert;
                                        return (
                                            <tr key={s.id} className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-tertiary)]/60 transition-colors">
                                                <td className="p-3">
                                                    <div className="font-bold text-[var(--text-primary)]">{s.nama}</div>
                                                    <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                                                        {s.kategori} • Satuan: <strong>{s.satuan}</strong>
                                                        {!isWarehouseOnly && (
                                                            <> • HPP: <span className="font-mono font-semibold">{formatRupiah(s.hargaSatuan)}</span></>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-3 text-center">
                                                    <span className={`inline-flex items-center justify-center min-w-[88px] px-3 py-1.5 rounded-full border text-xs font-bold font-mono ${
                                                        low ? "border-rose-300 bg-rose-50 text-rose-700" : "border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)]"
                                                    }`}>
                                                        {fmt(s.stok)} {s.satuan}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-center">
                                                    <span className="inline-flex items-center justify-center min-w-[76px] px-3 py-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] text-xs font-semibold text-[var(--text-secondary)] font-mono">
                                                        {fmt(s.minAlert)}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-center">
                                                    {low ? (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-bold">
                                                            <AlertTriangle size={12} /> Perlu Restock
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                                                            Aman
                                                        </span>
                                                    )}
                                                </td>
                                                {canWrite && (
                                                    <td className="p-3 text-center whitespace-nowrap">
                                                        <div className="inline-flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => openMutationModal(s, "IN", "", "REALISASI")}
                                                                className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] text-xs font-extrabold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl transition-all cursor-pointer shadow-2xs"
                                                                title="Catat Barang Masuk (+)"
                                                            >
                                                                <ArrowDownCircle size={15} className="text-emerald-700 shrink-0" />
                                                                <span>+ Masuk</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => openMutationModal(s, "OUT", "", "REALISASI")}
                                                                className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] text-xs font-extrabold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-xl transition-all cursor-pointer shadow-2xs"
                                                                title="Catat Dipakai Proyek (-)"
                                                            >
                                                                <ArrowUpCircle size={15} className="text-amber-700 shrink-0" />
                                                                <span>- Pakai Proyek</span>
                                                            </button>
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <Pagination page={itemsPage} pageSize={INVENTORY_PAGE_SIZE} totalItems={filtered.length}
                            onPageChange={setItemsPage} itemLabel="material" />
                    </div>
                </div>
            )}

            {!loading && tab === "log" && (
                <div className="clean-card overflow-hidden">
                    <div className="overflow-x-auto p-4">
                        <table className="w-full text-left border-collapse text-sm">
                            <thead>
                                <tr className="bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-xs uppercase font-bold">
                                    <th className="p-3 rounded-l-xl">Tanggal</th>
                                    <th className="p-3">Tipe</th>
                                    <th className="p-3">Item</th>
                                    <th className="p-3 text-right">Masuk (IN)</th>
                                    <th className="p-3 text-right">Keluar / Proyek</th>
                                    <th className="p-3 text-right">Sisa Stok</th>
                                    <th className="p-3">ID Proyek</th>
                                    <th className="p-3 rounded-r-xl">Keterangan</th>
                                </tr>
                            </thead>
                            <tbody key={logsPage} className="result-enter">
                                {logs.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-[var(--text-muted)]">Belum ada mutasi stok.</td></tr>}
                                {pagedLogs.map(l => (
                                    <tr key={l.id} className="border-t border-[var(--border-subtle)]">
                                        <td className="p-3 text-[var(--text-secondary)] whitespace-nowrap font-mono text-xs">{l.tanggal}</td>
                                        <td className="p-3">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${l.tipeCatatan === "ESTIMASI" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                                                {l.tipeCatatan}
                                            </span>
                                        </td>
                                        <td className="p-3 font-semibold text-[var(--text-primary)]">{itemName.get(l.itemId)?.nama ?? "—"}</td>
                                        <td className="p-3 text-right text-emerald-600 font-bold font-mono">{l.qtyMasuk ? `+${fmt(l.qtyMasuk)}` : "—"}</td>
                                        <td className="p-3 text-right text-orange-600 font-bold font-mono">{l.qtyKeluar ? `-${fmt(l.qtyKeluar)}` : "—"}</td>
                                        <td className="p-3 text-right font-semibold font-mono">{fmt(l.sisaStok)}</td>
                                        <td className="p-3 text-[var(--text-secondary)] font-mono text-xs">{l.proyek ?? "—"}</td>
                                        <td className="p-3 text-[var(--text-secondary)] text-xs">{l.keterangan ?? "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination page={logsPage} pageSize={INVENTORY_PAGE_SIZE} totalItems={logs.length}
                        onPageChange={setLogsPage} itemLabel="mutasi stok" />
                </div>
            )}

            {!loading && tab === "rekap" && (
                <div className="clean-card p-4 space-y-3">
                    <div className="pb-3 border-b border-[var(--border-subtle)] flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--text-secondary)]">Periode Bulan:</span>
                        <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)]" />
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-sm">
                            <thead>
                                <tr className="bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-xs uppercase font-bold">
                                    <th className="p-3 rounded-l-xl">Item</th>
                                    <th className="p-3 text-right">Total Masuk</th>
                                    <th className="p-3 text-right">Total Keluar</th>
                                    <th className="p-3 text-right">Stok Akhir Bulan</th>
                                    <th className="p-3 rounded-r-xl">Satuan</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recap.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-[var(--text-muted)]">Tidak ada mutasi pada bulan ini.</td></tr>}
                                {recap.map(r => (
                                    <tr key={r.item.id} className="border-t border-[var(--border-subtle)]">
                                        <td className="p-3 font-semibold text-[var(--text-primary)]">{r.item.nama}</td>
                                        <td className="p-3 text-right text-emerald-600 font-bold font-mono">{fmt(r.masuk)}</td>
                                        <td className="p-3 text-right text-orange-600 font-bold font-mono">{fmt(r.keluar)}</td>
                                        <td className="p-3 text-right font-semibold font-mono">{r.akhir == null ? "—" : fmt(r.akhir)}</td>
                                        <td className="p-3 text-[var(--text-secondary)]">{r.item.satuan}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modal Mutasi & Input Alokasi Gudang */}
            {mutation && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 modal-overlay-in" onClick={() => !busy && setMutation(null)}>
                    <div className="bg-white rounded-3xl p-5 sm:p-6 w-full max-w-lg space-y-4 shadow-2xl modal-card-in border border-[var(--border)]" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                            <div className="flex items-center gap-2.5">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white shadow-2xs ${
                                    mutation.type === "IN" ? "bg-emerald-600" : "bg-amber-600"
                                }`}>
                                    {mutation.type === "IN" ? <ArrowDownCircle size={18} /> : <ArrowUpCircle size={18} />}
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-slate-900 text-sm sm:text-base leading-tight">
                                        {mutation.type === "IN" ? "Catat Barang Masuk (Stok Nambah)" : "Catat Dipakai Proyek / Teknisi (Stok Keluar)"}
                                    </h3>
                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                        {mutation.type === "IN" ? "Saldo stok di gudang akan otomatis bertambah." : "Pilih proyek atau nama teknisi yang membawa barang ini."}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setMutation(null)}
                                disabled={busy}
                                className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 cursor-pointer"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-xs ${
                            mutation.type === "IN"
                                ? "bg-emerald-50/70 border-emerald-200 text-emerald-950"
                                : "bg-amber-50/70 border-amber-200 text-amber-950"
                        }`}>
                            <div>
                                <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider block">Stok Saat Ini</span>
                                <span className="text-base font-extrabold font-mono text-slate-900">
                                    {mutation.item ? `${fmt(mutation.item.stok)} ${mutation.item.satuan}` : "Pilih barang dahulu"}
                                </span>
                            </div>
                            <div className="text-right">
                                <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider block">
                                    {mutation.type === "IN" ? "Saldo Nanti (Setelah Masuk)" : "Sisa Nanti (Setelah Keluar)"}
                                </span>
                                <span className={`text-base font-extrabold font-mono ${
                                    !mutation.item
                                        ? "text-slate-400"
                                        : mutation.type === "IN"
                                        ? "text-emerald-700"
                                        : (mutation.item.stok - (Number(mQty.replace(",", ".")) || 0)) < 0
                                        ? "text-rose-700 font-bold"
                                        : "text-amber-800"
                                }`}>
                                    {!mutation.item
                                        ? "—"
                                        : mutation.type === "IN"
                                        ? `${fmt(mutation.item.stok + (Number(mQty.replace(",", ".")) || 0))} ${mutation.item.satuan}`
                                        : `${fmt(Math.max(0, mutation.item.stok - (Number(mQty.replace(",", ".")) || 0)))} ${mutation.item.satuan}`}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-1.5 text-xs">
                            <label className="block font-bold text-slate-800">Nama Barang / Obat / Alat *</label>
                            <select
                                value={mutation.item?.id ?? ""}
                                onChange={e => {
                                    const found = items.find(i => i.id === e.target.value) || null;
                                    setMutation({ ...mutation, item: found });
                                }}
                                className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 bg-white font-semibold text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-[var(--accent)]"
                            >
                                <option value="">-- Pilih Barang / Obat / Alat Secara Eksplisit --</option>
                                {items.map(it => (
                                    <option key={it.id} value={it.id}>
                                        {it.nama} — Sisa: {fmt(it.stok)} {it.satuan}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {mutation.type === "OUT" && (
                            <div className="space-y-3">
                                <div className="space-y-1.5 text-xs">
                                    <label className="block font-bold text-slate-800">Pilih Proyek / Nama Klien Tujuan *</label>
                                    <select
                                        value={mProjectId}
                                        onChange={e => {
                                            setMProjectId(e.target.value);
                                            const p = projects.find(x => x.id === e.target.value);
                                            if (p) setMProyek(`[ID:${p.code}] ${p.projectName}`);
                                        }}
                                        className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 bg-white font-semibold text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-[var(--accent)]"
                                    >
                                        <option value="">-- Pilih Nama Klien / Proyek --</option>
                                        {projects.map(p => (
                                            <option key={p.id} value={p.id}>
                                                {p.clientName} — {p.projectName} ({p.code})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-1.5 text-xs">
                                    <label className="block font-bold text-slate-800">Status Pencatatan</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setMTipeCatatan("REALISASI")}
                                            className={`p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                                                mTipeCatatan === "REALISASI"
                                                    ? "border-emerald-600 bg-emerald-50 text-emerald-900 shadow-2xs"
                                                    : "border-slate-200 bg-white text-slate-600"
                                            }`}
                                        >
                                            Pemakaian Aktual (Potong Stok)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setMTipeCatatan("ESTIMASI")}
                                            className={`p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                                                mTipeCatatan === "ESTIMASI"
                                                    ? "border-amber-600 bg-amber-50 text-amber-900 shadow-2xs"
                                                    : "border-slate-200 bg-white text-slate-600"
                                            }`}
                                        >
                                            Catatan Estimasi Saja
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-1.5 text-xs">
                            <label className="block font-bold text-slate-800">
                                Jumlah ({mutation.item?.satuan || "Satuan"}) Yang {mutation.type === "IN" ? "Masuk (+)" : "Dikeluarkan (-)"} *
                            </label>
                            <input
                                autoFocus
                                inputMode="decimal"
                                placeholder="Ketik angka jumlah (mis: 2 atau 5)"
                                value={mQty}
                                onChange={e => setMQty(e.target.value)}
                                className="w-full px-3.5 py-2.5 min-h-[46px] text-base rounded-xl border border-slate-300 font-mono font-bold text-slate-900 focus:outline-none focus:border-[var(--accent)]"
                            />
                            {isDirector && mutation.item && Number(mQty.replace(",", ".")) > 0 && (
                                <p className="text-[11px] text-emerald-800 font-semibold pt-0.5">
                                    Estimasi Nilai HPP: {formatRupiah(Number(mQty.replace(",", ".")) * mutation.item.hargaSatuan)}
                                </p>
                            )}
                        </div>

                        <div className="space-y-1.5 text-xs">
                            <label className="block font-bold text-slate-800">Catatan / Nama Teknisi Pembawa</label>
                            <input
                                placeholder="Contoh: Dibawa Teknisi Budi / Kunjungan rutin"
                                value={mNote}
                                onChange={e => setMNote(e.target.value)}
                                className="w-full px-3.5 py-2.5 min-h-[44px] text-xs sm:text-sm rounded-xl border border-slate-300 text-slate-900 focus:outline-none focus:border-[var(--accent)]"
                            />
                        </div>

                        <div className="pt-2">
                            <button
                                type="button"
                                onClick={submitMutation}
                                disabled={busy}
                                className={`w-full min-h-[48px] py-3 text-xs sm:text-sm font-extrabold rounded-xl text-white transition-all shadow-xs cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 ${
                                    mutation.type === "IN"
                                        ? "bg-emerald-700 hover:bg-emerald-800"
                                        : "bg-amber-600 hover:bg-amber-700"
                                }`}
                            >
                                {busy ? "Menyimpan ke Sistem..." : mutation.type === "IN" ? "Simpan Barang Masuk (+)" : "Simpan Barang Keluar (-)"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showNew && (
                <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4" onClick={() => !busy && setShowNew(false)}>
                    <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-slate-800">Tambah Chemical / Alat Baru</h3>
                            <button onClick={() => setShowNew(false)} disabled={busy}><X size={16} /></button>
                        </div>
                        <input autoFocus placeholder="Nama item" value={newItem.nama} onChange={e => setNewItem({ ...newItem, nama: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300" />
                        <div className="grid grid-cols-2 gap-2">
                            <select value={newItem.kategori} onChange={e => setNewItem({ ...newItem, kategori: e.target.value })} className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"><option>Chemical</option><option>Alat</option><option>Perangkap</option><option>Lainnya</option></select>
                            <input placeholder="Satuan (ml, Liter, Kg)" value={newItem.satuan} onChange={e => setNewItem({ ...newItem, satuan: e.target.value })} className="px-3 py-2 text-sm rounded-lg border border-slate-300" />
                            <input inputMode="decimal" placeholder="Stok awal" value={newItem.stokAwal} onChange={e => setNewItem({ ...newItem, stokAwal: e.target.value })} className="px-3 py-2 text-sm rounded-lg border border-slate-300" />
                            <input inputMode="decimal" placeholder="Min alert" value={newItem.minAlert} onChange={e => setNewItem({ ...newItem, minAlert: e.target.value })} className="px-3 py-2 text-sm rounded-lg border border-slate-300" />
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">Harga Pokok Satuan / HPP (Rp)</label>
                            <input inputMode="numeric" placeholder="185000" value={newItem.hargaSatuan} onChange={e => setNewItem({ ...newItem, hargaSatuan: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 font-mono" />
                        </div>
                        <button onClick={submitNewItem} disabled={busy} className="w-full py-2 text-sm font-bold rounded-lg bg-[var(--accent)] text-white disabled:opacity-50">{busy ? "Menyimpan..." : "Tambah Item"}</button>
                    </div>
                </div>
            )}

            {importPreviewRows && (
                <InventoryImportPreviewModal
                    rows={importPreviewRows}
                    existingNames={new Set(items.map(i => i.nama.toLowerCase().trim()))}
                    onConfirm={handleConfirmInventoryImport}
                    onClose={() => setImportPreviewRows(null)}
                    importing={isImporting}
                />
            )}
        </div>
    );
}

export default InventoryPage;
