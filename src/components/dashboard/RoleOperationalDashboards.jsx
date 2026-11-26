import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, Truck, Package, AlertTriangle,
  ArrowRightLeft, ShoppingCart, Search, Calendar, ClipboardCheck,
  Scissors, Trash2, FileText, GlassWater, CheckCircle
} from 'lucide-react';
import { FocalActionBanner, CalmKpiCard, StatusPill, SectionHeader } from './DashboardPrimitives';
import { formatCleanQty } from '../../services/modules/roleBoundaryUtils';

/**
 * ============================================================================
 * VIEW A: CENTRAL WAREHOUSE & DISTRIBUTION DASHBOARD
 * Strict Boundary:
 * - ONLY POs with location === 'CENTRAL' (0 RESTO / branch POs)
 * - ONLY Transfers involving Central (Central <-> Branch)
 * - ZERO financial Rupiah valuations exposed to warehouse staff
 * ============================================================================
 */
export function CentralDashboardView({
  period,
  setPeriod,
  periodOptions,
  periodLabel,
  centralMetrics,
  centralLowStockItems,
  loadingRoleData,
  navigate,
}) {
  const [poSearch, setPoSearch] = useState('');

  const filteredCentralPos = useMemo(() => {
    const q = poSearch.trim().toLowerCase();
    const list = centralMetrics?.centralPos || [];
    if (!q) return list;
    return list.filter((inv) =>
      String(inv.invoice_no || '').toLowerCase().includes(q) ||
      String(inv.supplier || '').toLowerCase().includes(q) ||
      String(inv.workflow_status || inv.status || '').toLowerCase().includes(q)
    );
  }, [centralMetrics?.centralPos, poSearch]);

  const pendingPoCount = centralMetrics?.pendingCentralPos?.length || 0;
  const lowStockCount = centralLowStockItems?.length || 0;

  const bannerTone = lowStockCount > 0 ? 'warning' : pendingPoCount > 0 ? 'neutral' : 'success';
  const bannerTitle = lowStockCount > 0
    ? `${lowStockCount} bahan Gudang Central di bawah stok minimum`
    : pendingPoCount > 0
      ? `${pendingPoCount} PO khusus Central sedang berjalan`
      : 'Operasional Gudang Central dalam kondisi aman';
  const bannerDesc = pendingPoCount > 0
    ? `Pantau ${pendingPoCount} antrean penerimaan PO Central dan distribusi barang keluar ke cabang tujuan pada ${periodLabel}.`
    : `Semua jadwal penerimaan PO Central dan distribusi ke cabang pada ${periodLabel} sudah terkendali.`;

  return (
    <div className="fade-in space-y-5">
      {/* Period Selector Bar */}
      <div className="glass-card p-3.5 sm:px-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-glow)] text-[var(--accent)] flex items-center justify-center shrink-0" aria-hidden="true">
            <Calendar size={16} />
          </div>
          <span className="text-xs sm:text-sm font-bold text-[var(--text-secondary)]">Periode Logistik:</span>
          <select
            className="form-control w-[180px]"
            style={{ padding: '7px 12px', fontSize: '0.85rem', fontWeight: 600 }}
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            {periodOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <span className="text-xs font-semibold text-[var(--text-muted)]">
          Cakupan Data: Khusus Gudang Central &amp; Distribusi
        </span>
      </div>

      {/* F-Pattern Focal Action Banner */}
      <FocalActionBanner
        eyebrow="Fokus Gudang Central"
        title={bannerTitle}
        description={bannerDesc}
        tone={bannerTone}
        primaryAction={{
          label: '+ Mutasi ke Cabang',
          icon: <ArrowRightLeft size={15} />,
          onClick: () => navigate('/dashboard/transfer'),
        }}
        secondaryActions={[
          {
            label: 'PO Central',
            icon: <ShoppingCart size={14} />,
            onClick: () => navigate('/dashboard/procurement?tab=invoicing'),
          },
          {
            label: 'Stok Central',
            icon: <Package size={14} />,
            onClick: () => navigate('/dashboard/sistem?tab=stock-ledger'),
          },
        ]}
      />

      {/* 4 Operational KPI Cards (ZERO Financial Valuation Exposure) */}
      <div className="kpi-grid">
        <CalmKpiCard
          label="Barang Masuk Central"
          value={`${formatCleanQty(centralMetrics.totalInboundQty)} unit`}
          subtext={`${centralMetrics.totalInboundCount}x penerimaan di Central (${periodLabel})`}
          icon={<ArrowDownLeft size={19} />}
          tone="success"
        />
        <CalmKpiCard
          label="Mutasi Keluar ke Cabang"
          value={`${formatCleanQty(centralMetrics.totalOutboundQty)} unit`}
          subtext={`${centralMetrics.totalOutboundCount}x pengiriman ke ${centralMetrics.destinations.length} tujuan`}
          icon={<ArrowUpRight size={19} />}
          tone="neutral"
          onClick={() => navigate('/dashboard/transfer')}
          actionHint="Mutasi"
        />
        <CalmKpiCard
          label="Antrean PO Central"
          value={`${pendingPoCount} PO`}
          subtext={`${centralMetrics.centralPos.length} PO tujuan Central bulan ini`}
          icon={<Truck size={19} />}
          tone={pendingPoCount > 0 ? 'warning' : 'success'}
          onClick={() => navigate('/dashboard/procurement?tab=invoicing')}
          actionHint="Cek PO"
        />
        <CalmKpiCard
          label="Stok Kritis Central"
          value={`${lowStockCount} item`}
          subtext={lowStockCount > 0 ? 'Perlu pengisian ulang Gudang Central' : 'Seluruh stok Central aman'}
          icon={<AlertTriangle size={19} />}
          tone={lowStockCount > 0 ? 'danger' : 'success'}
          onClick={() => navigate('/dashboard/sistem?tab=stock-ledger')}
          actionHint="Lihat Stok"
        />
      </div>

      {/* Gestalt Paired Operational Flow Panels (Outbound vs Inbound, Pure Quantities) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="glass-card p-5">
          <SectionHeader
            title="Distribusi Keluar: Central ke Cabang"
            subtitle={`Rekap pengiriman barang dari Gudang Central (${periodLabel}).`}
            action={
              <button
                type="button"
                onClick={() => navigate('/dashboard/transfer')}
                className="btn btn-secondary text-xs font-semibold px-3 py-1.5"
              >
                Kelola Mutasi
              </button>
            }
          />
          {loadingRoleData ? (
            <div className="py-8 text-center text-xs text-[var(--text-muted)]">Memuat data distribusi...</div>
          ) : centralMetrics.destinations.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-muted)]">
              Belum ada pengiriman mutasi dari Central pada {periodLabel}.
            </div>
          ) : (
            <div className="overflow-x-auto" tabIndex={0} aria-label="Tabel data operasional">
              <table className="custom-table w-full text-xs">
                <thead>
                  <tr>
                    <th>Tujuan Cabang / Unit</th>
                    <th className="text-right">Frekuensi</th>
                    <th className="text-right">Total Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {centralMetrics.destinations.map((dest) => (
                    <tr key={dest.destination} className="hover:bg-[var(--bg-tertiary)]/50">
                      <td className="font-semibold text-[var(--text-primary)]">{dest.destination}</td>
                      <td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{dest.count}x mutasi</td>
                      <td className="text-right font-mono tabular-nums font-bold text-[var(--text-primary)]">
                        {formatCleanQty(dest.totalQty)} unit
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="glass-card p-5">
          <SectionHeader
            title="Sumber Barang Masuk ke Central"
            subtitle={`Penerimaan PO dan stok masuk khusus Gudang Central (${periodLabel}).`}
            action={
              <button
                type="button"
                onClick={() => navigate('/dashboard/procurement?tab=invoicing')}
                className="btn btn-secondary text-xs font-semibold px-3 py-1.5"
              >
                PO Central
              </button>
            }
          />
          {loadingRoleData ? (
            <div className="py-8 text-center text-xs text-[var(--text-muted)]">Memuat sumber barang masuk...</div>
          ) : centralMetrics.inboundSources.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-muted)]">
              Belum ada penerimaan barang ke Gudang Central pada {periodLabel}.
            </div>
          ) : (
            <div className="overflow-x-auto" tabIndex={0} aria-label="Tabel data operasional">
              <table className="custom-table w-full text-xs">
                <thead>
                  <tr>
                    <th>Asal / Supplier</th>
                    <th className="text-right">Frekuensi</th>
                    <th className="text-right">Total Qty Masuk</th>
                  </tr>
                </thead>
                <tbody>
                  {centralMetrics.inboundSources.map((src) => (
                    <tr key={src.source} className="hover:bg-[var(--bg-tertiary)]/50">
                      <td className="font-semibold text-[var(--text-primary)]">{src.source}</td>
                      <td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{src.count}x</td>
                      <td className="text-right font-mono tabular-nums font-bold text-[#047857]">
                        {formatCleanQty(src.totalQty)} unit
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Purchase Orders Strictly Scoped to CENTRAL Destination Only */}
      <div className="glass-card p-5 bv-defer-section">
        <SectionHeader
          title="Purchase Order Khusus Gudang Central"
          subtitle="Hanya menampilkan PO dengan tujuan pengiriman Gudang Central (PO langsung cabang tidak ditampilkan)."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <search className="relative min-w-[200px]">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="text"
                  className="form-control pl-8 py-1.5 text-xs"
                  placeholder="Cari No. PO atau supplier..."
                  value={poSearch}
                  onChange={(e) => setPoSearch(e.target.value)}
                />
              </search>
              <button
                type="button"
                onClick={() => navigate('/dashboard/procurement?tab=invoicing')}
                className="btn btn-primary text-xs font-bold px-3.5 py-2 whitespace-nowrap"
              >
                Buka Penerimaan PO
              </button>
            </div>
          }
        />

        {loadingRoleData ? (
          <div className="py-10 text-center text-xs text-[var(--text-muted)]">Memuat PO Gudang Central...</div>
        ) : filteredCentralPos.length === 0 ? (
          <div className="py-10 text-center text-xs text-[var(--text-muted)]">
            Tidak ada Purchase Order tujuan Gudang Central pada {periodLabel}.
          </div>
        ) : (
          <div className="overflow-x-auto" tabIndex={0} aria-label="Tabel data operasional">
            <table className="custom-table w-full text-xs">
              <thead>
                <tr>
                  <th>No. PO</th>
                  <th>Tanggal</th>
                  <th>Supplier</th>
                  <th>Tujuan</th>
                  <th className="text-right">Jumlah Item</th>
                  <th>Status</th>
                  <th className="text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredCentralPos.map((inv) => (
                  <tr key={inv.id} className="hover:bg-[var(--bg-tertiary)]/50">
                    <td className="font-mono font-bold text-[var(--accent)] whitespace-nowrap">{inv.invoice_no}</td>
                    <td className="font-mono tabular-nums text-[var(--text-secondary)] whitespace-nowrap">{inv.date}</td>
                    <td className="font-semibold text-[var(--text-primary)]">{inv.supplier}</td>
                    <td>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                        CENTRAL
                      </span>
                    </td>
                    <td className="text-right font-mono tabular-nums">{(inv.items || []).length} bahan</td>
                    <td>
                      <StatusPill status={inv.workflow_status || inv.status} />
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={() => navigate('/dashboard/procurement?tab=invoicing')}
                        className="btn btn-secondary text-[11px] font-semibold px-2.5 py-1.5 whitespace-nowrap"
                      >
                        Detail PO
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * ============================================================================
 * VIEW B: HEAD BAR OPERATIONAL DASHBOARD (OWN BRANCH ONLY)
 * Strict Boundary:
 * - ZERO financial Rupiah metrics, ZERO company sales/COGS, ZERO other branches
 * - Focuses on branch stock health, incoming transfers, branch PO requests, & ops
 * ============================================================================
 */
export function HeadBarDashboardView({
  activeBranchName,
  branchStockItems,
  branchLowStockItems,
  branchPos,
  incomingTransfers,
  navigate,
}) {
  const lowCount = branchLowStockItems.length;
  const activePoCount = branchPos.filter(
    (inv) => !['RECEIVED', 'CANCELLED', 'REJECTED'].includes(String(inv.workflow_status || inv.status).toUpperCase())
  ).length;
  const pendingTransferCount = incomingTransfers.length;

  const tone = lowCount > 0 ? 'warning' : pendingTransferCount > 0 ? 'neutral' : 'success';
  const title = lowCount > 0
    ? `${lowCount} bahan di Bar ${activeBranchName} perlu segera diisi ulang`
    : pendingTransferCount > 0
      ? `${pendingTransferCount} pengiriman mutasi sedang menuju ${activeBranchName}`
      : `Operasional Bar ${activeBranchName} terkendali dengan baik`;
  const desc = `Ringkasan operasional khusus Cabang ${activeBranchName}. Pantau stok kritis, permintaan barang, dan kelengkapan laporan bulanan tanpa distraksi data cabang lain.`;

  return (
    <div className="fade-in space-y-5">
      <FocalActionBanner
        eyebrow={`Head Bar · Cabang ${activeBranchName}`}
        title={title}
        description={desc}
        tone={tone}
        primaryAction={{
          label: 'Input Stok Harian',
          icon: <ClipboardCheck size={15} />,
          onClick: () => navigate('/dashboard/daily-inventory'),
        }}
        secondaryActions={[
          {
            label: 'Minta Barang (Mutasi)',
            icon: <ArrowRightLeft size={14} />,
            onClick: () => navigate('/dashboard/transfer'),
          },
          {
            label: 'Berita Acara',
            icon: <FileText size={14} />,
            onClick: () => navigate('/dashboard/berita-acara'),
          },
        ]}
      />

      {/* 4 Branch Operational KPI Cards (ZERO Rupiah) */}
      <div className="kpi-grid">
        <CalmKpiCard
          label="Stok Kritis Bar"
          value={`${lowCount} item`}
          subtext={lowCount > 0 ? 'Di bawah batas minimum cabang' : 'Semua bahan di atas minimum'}
          icon={<AlertTriangle size={19} />}
          tone={lowCount > 0 ? 'danger' : 'success'}
          onClick={() => navigate('/dashboard/daily-inventory')}
          actionHint="Cek"
        />
        <CalmKpiCard
          label="Total SKU Bar Aktif"
          value={`${branchStockItems.length} item`}
          subtext={`Terdaftar di Cabang ${activeBranchName}`}
          icon={<Package size={19} />}
          tone="neutral"
        />
        <CalmKpiCard
          label="Mutasi Masuk Aktif"
          value={`${pendingTransferCount} kirim`}
          subtext={pendingTransferCount > 0 ? 'Menunggu verifikasi atau penerimaan' : 'Tidak ada antrean mutasi'}
          icon={<Truck size={19} />}
          tone={pendingTransferCount > 0 ? 'warning' : 'success'}
          onClick={() => navigate('/dashboard/transfer')}
          actionHint="Mutasi"
        />
        <CalmKpiCard
          label="Permintaan PO Cabang"
          value={`${activePoCount} PO`}
          subtext={`${branchPos.length} total PO cabang tercatat`}
          icon={<ShoppingCart size={19} />}
          tone={activePoCount > 0 ? 'warning' : 'neutral'}
          onClick={() => navigate('/dashboard/procurement?tab=invoicing')}
          actionHint="PO"
        />
      </div>

      {/* Gestalt 2-Column Operational Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="glass-card p-5">
          <SectionHeader
            title="Prioritas Restock Bahan Bar"
            subtitle={`Daftar bahan di Cabang ${activeBranchName} yang stoknya menipis.`}
            action={
              <button
                type="button"
                onClick={() => navigate('/dashboard/transfer')}
                className="btn btn-secondary text-xs font-semibold px-3 py-1.5"
              >
                Ajukan Mutasi
              </button>
            }
          />
          {lowCount === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-muted)] flex flex-col items-center gap-2">
              <CheckCircle size={24} className="text-[#10b981]" />
              <span>Semua bahan Bar di Cabang {activeBranchName} berada pada stok aman.</span>
            </div>
          ) : (
            <div className="overflow-x-auto" tabIndex={0} aria-label="Tabel data operasional">
              <table className="custom-table w-full text-xs">
                <thead>
                  <tr>
                    <th>Nama Bahan</th>
                    <th className="text-right">Stok Bar</th>
                    <th className="text-right">Minimum</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {branchLowStockItems.slice(0, 8).map((item) => {
                    const qty = Number(item.qty_resto || 0);
                    const min = Number(item.min_stock || 15);
                    return (
                      <tr key={item.id} className="hover:bg-[var(--bg-tertiary)]/50">
                        <td className="font-semibold text-[var(--text-primary)]">{item.name}</td>
                        <td className="text-right font-mono tabular-nums font-bold text-[#b91c1c]">
                          {formatCleanQty(qty)} {item.unit || ''}
                        </td>
                        <td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">
                          {formatCleanQty(min)} {item.unit || ''}
                        </td>
                        <td>
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold"
                            style={{
                              background: qty <= 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                              color: qty <= 0 ? '#b91c1c' : '#b45309',
                            }}
                          >
                            {qty <= 0 ? 'Habis' : 'Menipis'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="glass-card p-5">
          <SectionHeader
            title="Status Permintaan PO Cabang"
            subtitle={`Daftar PO khusus operasional Cabang ${activeBranchName}.`}
            action={
              <button
                type="button"
                onClick={() => navigate('/dashboard/procurement?tab=invoicing')}
                className="btn btn-secondary text-xs font-semibold px-3 py-1.5"
              >
                Semua PO
              </button>
            }
          />
          {branchPos.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-muted)]">
              Belum ada permintaan PO cabang yang tercatat.
            </div>
          ) : (
            <div className="overflow-x-auto" tabIndex={0} aria-label="Tabel data operasional">
              <table className="custom-table w-full text-xs">
                <thead>
                  <tr>
                    <th>No. PO</th>
                    <th>Supplier</th>
                    <th className="text-right">Item</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {branchPos.slice(0, 6).map((inv) => (
                    <tr key={inv.id} className="hover:bg-[var(--bg-tertiary)]/50">
                      <td className="font-mono font-bold text-[var(--accent)] whitespace-nowrap">{inv.invoice_no}</td>
                      <td className="font-semibold text-[var(--text-primary)]">{inv.supplier}</td>
                      <td className="text-right font-mono tabular-nums">{(inv.items || []).length} bahan</td>
                      <td>
                        <StatusPill status={inv.workflow_status || inv.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Head Bar Quick Governance Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Opname Gelas & Alat Bar', sub: 'Catat pecah & sinkron ke Berita Acara', icon: <GlassWater size={18} />, path: '/dashboard/so-glass-tool' },
          { label: 'Urgent Cutting Portion', sub: 'Kontrol persiapan porsi harian', icon: <Scissors size={18} />, path: '/dashboard/simple-prep' },
          { label: 'Berita Acara Bulanan', sub: 'Rekap otomatis waste & logo kop PDF', icon: <FileText size={18} />, path: '/dashboard/berita-acara' },
        ].map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={() => navigate(card.path)}
            className="glass-card p-4 text-left flex items-center gap-3 hover:border-[var(--accent)] transition-colors cursor-pointer min-h-[60px]"
          >
            <div className="w-10 h-10 rounded-xl bg-[var(--bg-tertiary)] text-[var(--accent)] flex items-center justify-center shrink-0" aria-hidden="true">
              {card.icon}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-[var(--text-primary)] truncate">{card.label}</div>
              <div className="text-xs text-[var(--text-secondary)] truncate">{card.sub}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * ============================================================================
 * VIEW C: REKAN BAR / BARISTA SHIFT DASHBOARD (ULTRA-CALM FLOOR VIEW)
 * Strict Boundary:
 * - ZERO financial Rupiah values, ZERO PO pricing, ZERO other branches
 * - Optimized for on-spot mobile usage (Hick's Law: 3 clear shift tasks)
 * ============================================================================
 */
export function RekanBarDashboardView({
  activeBranchName,
  branchLowStockItems,
  incomingTransfers,
  navigate,
}) {
  const lowCount = branchLowStockItems.length;
  const incomingCount = incomingTransfers.length;

  return (
    <div className="fade-in space-y-5">
      <FocalActionBanner
        eyebrow={`Shift Bar · Cabang ${activeBranchName}`}
        title={lowCount > 0 ? `${lowCount} bahan di Bar perlu diperhatikan shift ini` : `Stok Bar ${activeBranchName} siap untuk layanan shift`}
        description="Pilih tugas harian shift di bawah ini. Seluruh pencatatan langsung tersinkronisasi untuk pemeriksaan Head Bar."
        tone={lowCount > 0 ? 'warning' : 'success'}
        primaryAction={{
          label: 'Mulai Input Stok Harian',
          icon: <ClipboardCheck size={15} />,
          onClick: () => navigate('/dashboard/daily-inventory'),
        }}
      />

      {/* 3 Large Touch-Friendly Shift Action Cards (Mobile-First 56px+ height) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {[
          {
            title: 'Input Stok Harian',
            desc: 'Catat stok awal, pemakaian, & sisa shift',
            icon: <ClipboardCheck size={20} />,
            path: '/dashboard/daily-inventory',
          },
          {
            title: 'Urgent Cutting Portion',
            desc: 'Catat porsi persiapan bahan segar',
            icon: <Scissors size={20} />,
            path: '/dashboard/simple-prep',
          },
          {
            title: 'Catat Pecah / Waste',
            desc: 'Laporkan barang rusak atau gelas pecah',
            icon: <Trash2 size={20} />,
            path: '/dashboard/so-glass-tool',
          },
        ].map((item) => (
          <button
            key={item.title}
            type="button"
            onClick={() => navigate(item.path)}
            className="glass-card p-4 text-left flex items-start gap-3.5 hover:border-[var(--accent)] transition-all cursor-pointer min-h-[72px]"
          >
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-glow)] text-[var(--accent)] flex items-center justify-center shrink-0" aria-hidden="true">
              {item.icon}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-[var(--text-primary)]">{item.title}</div>
              <div className="text-xs text-[var(--text-secondary)] mt-0.5 leading-snug">{item.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* 2 Simple Operational Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CalmKpiCard
          label="Bahan Menipis di Bar"
          value={`${lowCount} item`}
          subtext={lowCount > 0 ? 'Segera informasikan ke Head Bar' : 'Semua bahan utama tersedia'}
          icon={<AlertTriangle size={19} />}
          tone={lowCount > 0 ? 'danger' : 'success'}
        />
        <CalmKpiCard
          label="Pengiriman Masuk Cabang"
          value={`${incomingCount} kirim`}
          subtext={incomingCount > 0 ? 'Cek kelengkapan barang saat tiba' : 'Belum ada pengiriman aktif'}
          icon={<Truck size={19} />}
          tone={incomingCount > 0 ? 'warning' : 'neutral'}
          onClick={() => navigate('/dashboard/transfer')}
          actionHint="Lihat"
        />
      </div>

      {/* Clean Scannable Low-Stock List (No Prices) */}
      <div className="glass-card p-5">
        <SectionHeader
          title="Daftar Bahan Kritis Shift Ini"
          subtitle={`Menampilkan sisa stok fisik di Bar Cabang ${activeBranchName}.`}
        />
        {lowCount === 0 ? (
          <div className="py-8 text-center text-xs text-[var(--text-muted)] flex flex-col items-center gap-2">
            <CheckCircle size={24} className="text-[#10b981]" />
            <span>Tidak ada bahan yang habis atau menipis saat ini.</span>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {branchLowStockItems.slice(0, 10).map((item) => {
              const qty = Number(item.qty_resto || 0);
              return (
                <div key={item.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[var(--text-primary)] truncate">{item.name}</div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      Batas minimum: {formatCleanQty(item.min_stock || 15)} {item.unit || ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="font-mono tabular-nums text-sm font-bold text-[#b91c1c]">
                      {formatCleanQty(qty)} {item.unit || ''}
                    </span>
                    <span
                      className="px-2.5 py-1 rounded-full text-[11px] font-bold"
                      style={{
                        background: qty <= 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                        color: qty <= 0 ? '#b91c1c' : '#b45309',
                      }}
                    >
                      {qty <= 0 ? 'Habis' : 'Menipis'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
