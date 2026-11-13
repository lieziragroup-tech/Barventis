import React from 'react';
import {
  parseStructuredFullPack,
  resolvePackInfo,
  getPackUnitInfo,
  getUnitPrice,
} from '../../services/costUtils';

export const PACK_UNIT_OPTIONS = [
  { value: 'pck', label: 'pck (Pack)', defaultContentQty: 1000, defaultContentUnit: 'gr' },
  { value: 'Btl', label: 'Btl (Botol)', defaultContentQty: 750, defaultContentUnit: 'ml' },
  { value: 'Carton', label: 'Carton (Dus/Karton)', defaultContentQty: 24, defaultContentUnit: 'pcs' },
  { value: 'kaleng', label: 'kaleng (Can)', defaultContentQty: 370, defaultContentUnit: 'gr' },
  { value: 'pcs', label: 'pcs (Buah/Pcs)', defaultContentQty: 1, defaultContentUnit: 'pcs' },
  { value: 'Galon', label: 'Galon', defaultContentQty: 19000, defaultContentUnit: 'ml' },
  { value: 'Kg', label: 'Kg (Kilogram)', defaultContentQty: 1000, defaultContentUnit: 'gr' },
  { value: 'gr', label: 'gr (Gram)', defaultContentQty: 1000, defaultContentUnit: 'gr' },
  { value: 'grm', label: 'grm (Gram)', defaultContentQty: 1000, defaultContentUnit: 'gr' },
  { value: 'ml', label: 'ml (Mililiter)', defaultContentQty: 1000, defaultContentUnit: 'ml' },
  { value: 'drigen', label: 'drigen (Jerigen)', defaultContentQty: 5000, defaultContentUnit: 'ml' },
];

export const CONTENT_UNIT_OPTIONS = [
  { value: 'gr', label: 'gr (Gram)' },
  { value: 'ml', label: 'ml (Mililiter)' },
  { value: 'pcs', label: 'pcs (Pcs)' },
];

const normalizeUnitDisplay = (u) => {
  const raw = String(u || '').trim();
  const lower = raw.toLowerCase();
  if (lower === 'grm' || lower === 'gram' || lower === 'grams') return 'gr';
  if (lower === 'l' || lower === 'ltr' || lower === 'liter' || lower === 'litre') return 'ml';
  return lower || 'gr';
};

/**
 * Parse material's unit & full_pack using the exact same Single Source of Truth
 * as StockLedger.jsx (`resolvePackInfo` & `parseStructuredFullPack` in costUtils.js).
 * Preserves `unit` as configured in Stock Ledger without forcing `gr` -> `pck` or `ml` -> `btl`.
 */
export function parseTwoTierConfig(unit = 'pck', fullPack = '') {
  const packUnit = String(unit || 'pck').trim() || 'pck';
  const rawFullPack = String(fullPack || '').trim();

  // 1. Check structured "PackLabel = Qty Unit" format (same as KonversiSatuanFields in StockLedger.jsx)
  const structured = parseStructuredFullPack(rawFullPack);
  if (structured && structured.contentQty > 0) {
    const contentUnit = normalizeUnitDisplay(structured.contentUnit || packUnit);
    const normPack = normalizeUnitDisplay(packUnit);
    return {
      packUnit,
      contentQty: structured.contentQty,
      contentUnit,
      hasTwoTier: Boolean(structured.contentQty > 1 || normPack !== contentUnit),
      fullPackString: rawFullPack,
      consistent: true,
    };
  }

  // 2. Use Stock Ledger's single source of truth: resolvePackInfo(fullPack, unit)
  const resolved = resolvePackInfo(rawFullPack, packUnit);
  const { contentUnit: resolvedContentUnit } = getPackUnitInfo(rawFullPack, packUnit);
  const contentUnit = normalizeUnitDisplay(resolved.unit || resolvedContentUnit || packUnit);
  const contentQty = resolved.size > 0 ? resolved.size : 0;
  const normPack = normalizeUnitDisplay(packUnit);

  return {
    packUnit,
    contentQty,
    contentUnit,
    hasTwoTier: Boolean(contentQty > 0 && (contentQty > 1 || normPack !== contentUnit)),
    fullPackString: rawFullPack || (contentQty > 0 ? `${contentQty} ${contentUnit}` : ''),
    consistent: resolved.consistent,
  };
}

export function formatTwoTierFullPack(packUnit, contentQty, contentUnit) {
  const cleanPack = String(packUnit || 'pck').trim() || 'pck';
  const cleanQty = Math.max(0.01, Number(contentQty) || 1);
  const cleanContent = ['gr', 'ml', 'pcs'].includes(String(contentUnit || '').toLowerCase().trim())
    ? String(contentUnit).toLowerCase().trim()
    : normalizeUnitDisplay(contentUnit);
  return `${cleanPack} = ${cleanQty} ${cleanContent}`;
}

export default function TwoTierConversionEditor({
  unit = 'pck',
  fullPack = '',
  price = 0,
  onChange,
  compact = false,
  instanceId = 'default',
}) {
  const parsed = parseTwoTierConfig(unit, fullPack);
  const structured = parseStructuredFullPack(fullPack);
  const packUnit = String(unit || parsed.packUnit || 'pck').trim();
  const contentQty = parsed.contentQty > 0 ? parsed.contentQty : '';
  const contentUnit = parsed.contentUnit || 'gr';

  const unitPriceInfo = getUnitPrice({
    unit: packUnit,
    full_pack: fullPack,
    price: Number(price) || 0,
  });
  const hppPerContentUnit = unitPriceInfo.resolved ? unitPriceInfo.unitPrice : 0;

  const packDatalistId = `marketlist-pack-unit-${instanceId}`;
  const contentDatalistId = `marketlist-content-unit-${instanceId}`;

  const handlePackUnitChange = (nextPackUnit) => {
    const cleanNextUnit = nextPackUnit;
    // Mirror StockLedger.jsx line 900-904: if full_pack is structured "X = Y unit", keep left side in sync
    const curStructured = parseStructuredFullPack(fullPack);
    const nextFullPack = curStructured
      ? `${cleanNextUnit || 'pck'} = ${curStructured.contentQty}${curStructured.contentUnit ? ' ' + curStructured.contentUnit : ''}`
      : fullPack;
    onChange?.({
      unit: cleanNextUnit,
      full_pack: nextFullPack,
      contentQty: curStructured?.contentQty ?? parsed.contentQty,
      contentUnit: curStructured?.contentUnit ?? contentUnit,
    });
  };

  const handleFullPackDirectChange = (nextRawFullPack) => {
    const nextParsed = parseTwoTierConfig(packUnit, nextRawFullPack);
    onChange?.({
      unit: packUnit,
      full_pack: nextRawFullPack,
      contentQty: nextParsed.contentQty,
      contentUnit: nextParsed.contentUnit,
    });
  };

  const handleStructuredChange = (nextQtyRaw, nextContentUnit) => {
    const num = parseFloat(nextQtyRaw);
    if (nextQtyRaw === '' || isNaN(num) || num <= 0) {
      if (structured) {
        onChange?.({
          unit: packUnit,
          full_pack: '',
          contentQty: 0,
          contentUnit: nextContentUnit || contentUnit,
        });
      }
      return;
    }
    const label = packUnit || 'pck';
    const nextFullPack = `${label} = ${nextQtyRaw}${nextContentUnit ? ' ' + nextContentUnit : ''}`;
    onChange?.({
      unit: packUnit,
      full_pack: nextFullPack,
      contentQty: num,
      contentUnit: nextContentUnit || contentUnit,
    });
  };

  if (compact) {
    return (
      <div className="flex flex-col gap-1.5 min-w-[230px]">
        <div className="grid grid-cols-2 gap-1">
          <div>
            <span className="block text-[9px] font-semibold text-slate-500 mb-0.5">Satuan Pack</span>
            <input
              type="text"
              list={packDatalistId}
              className="form-control py-1 px-1.5 text-xs font-semibold w-full"
              placeholder="pck / Btl / Carton"
              value={unit || ''}
              onChange={e => handlePackUnitChange(e.target.value)}
              aria-label="Satuan Pack"
            />
            <datalist id={packDatalistId}>
              {['pck', 'Btl', 'Carton', 'kaleng', 'pcs', 'Galon', 'Kg', 'gr', 'ml'].map(u => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </div>
          <div>
            <span className="block text-[9px] font-semibold text-slate-500 mb-0.5">Ukuran / Konversi Pack</span>
            <input
              type="text"
              className="form-control py-1 px-1.5 text-xs font-mono w-full"
              placeholder="mis. 1000 grm / Carton = 24 pcs"
              value={fullPack || ''}
              onChange={e => handleFullPackDirectChange(e.target.value)}
              aria-label="Full Pack Size"
            />
          </div>
        </div>

        <div className="flex items-center gap-1 bg-slate-50 px-1.5 py-1 rounded border border-slate-200">
          <span className="text-[10px] font-semibold text-slate-600 whitespace-nowrap">
            1 {packUnit || 'Pack'} =
          </span>
          <input
            type="number"
            min="0"
            step="any"
            className="form-control py-0.5 px-1.5 text-xs font-mono text-right"
            style={{ width: '68px' }}
            placeholder="Isi"
            value={contentQty}
            onChange={e => handleStructuredChange(e.target.value, contentUnit)}
            aria-label="Isi per Kemasan"
          />
          <input
            type="text"
            list={contentDatalistId}
            className="form-control py-0.5 px-1.5 text-xs font-semibold"
            style={{ width: '58px' }}
            placeholder="gr/ml/pcs"
            value={structured ? structured.contentUnit : contentUnit}
            onChange={e => handleStructuredChange(String(contentQty || ''), e.target.value)}
            aria-label="Satuan Isi"
          />
          <datalist id={contentDatalistId}>
            <option value="pcs" />
            <option value="gr" />
            <option value="ml" />
          </datalist>
        </div>

        {unitPriceInfo.resolved && (
          <div className="text-[10px] text-emerald-700 font-mono">
            Konversi: {Number(parsed.contentQty).toLocaleString('id-ID')} {parsed.contentUnit.toUpperCase()} • Rp{' '}
            {hppPerContentUnit.toLocaleString('id-ID', { maximumFractionDigits: 2 })} / {parsed.contentUnit}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3.5 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-1">
        <span className="text-xs font-bold text-slate-800">
          Satuan & Konversi Isi (Selaras dengan Stock Ledger)
        </span>
        {parsed.contentQty > 0 && (
          <span className="text-[11px] font-mono font-semibold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded">
            1 {packUnit} = {Number(parsed.contentQty).toLocaleString('id-ID')} {parsed.contentUnit.toUpperCase()}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
            Pack Unit (Satuan Stok) *
          </label>
          <input
            type="text"
            list={packDatalistId}
            className="form-control w-full text-xs font-semibold"
            placeholder="mis. Carton, pck, Btl, kaleng"
            value={unit || ''}
            onChange={e => handlePackUnitChange(e.target.value)}
          />
          <datalist id={packDatalistId}>
            {['pck', 'Btl', 'Carton', 'kaleng', 'pcs', 'Galon', 'Kg', 'gr', 'ml'].map(u => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
            Full Pack Size (Ukuran Pack) *
          </label>
          <input
            type="text"
            className="form-control w-full text-xs font-mono"
            placeholder="e.g. 1000 grm atau Carton = 24 pcs"
            value={fullPack || ''}
            onChange={e => handleFullPackDirectChange(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
          Konversi Isi (1 {packUnit || 'Pack'} = Berapa Satuan Resep?)
        </label>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-600 whitespace-nowrap font-medium">
            1 {packUnit || 'Pack'} =
          </span>
          <input
            type="number"
            min="0"
            step="any"
            className="form-control text-xs font-mono font-bold"
            style={{ width: '100px' }}
            placeholder="mis. 1000 / 24"
            value={contentQty}
            onChange={e => handleStructuredChange(e.target.value, contentUnit)}
          />
          <input
            type="text"
            list={contentDatalistId}
            className="form-control text-xs font-semibold"
            style={{ width: '110px' }}
            placeholder="pcs / gr / ml"
            value={structured ? structured.contentUnit : contentUnit}
            onChange={e => handleStructuredChange(String(contentQty || ''), e.target.value)}
          />
          <datalist id={contentDatalistId}>
            <option value="pcs" />
            <option value="gr" />
            <option value="ml" />
          </datalist>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-blue-200/60 text-xs">
        <span className="text-slate-600">Estimasi HPP Takaran Resep:</span>
        <span className="font-mono font-bold text-emerald-700">
          {unitPriceInfo.resolved
            ? `Rp ${hppPerContentUnit.toLocaleString('id-ID', { maximumFractionDigits: 2 })} / ${parsed.contentUnit}`
            : 'Isi ukuran pack yang valid'}
        </span>
      </div>
    </div>
  );
}
