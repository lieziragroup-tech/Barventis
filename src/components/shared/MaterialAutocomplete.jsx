import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, Plus, Package, Check } from 'lucide-react';
import useDebounce from '../../hooks/useDebounce';

export default function MaterialAutocomplete({
  materials = [],
  value = '',
  onSelect,
  placeholder = 'Ketik nama bahan atau SKU...',
  sourceLocation = 'CENTRAL',
  clearOnSelect = false,
  disabled = false,
  maxResults = 8,
  onCreateNew = null,
  className = ''
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const debouncedQuery = useDebounce(query, 250);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  const selectedItem = useMemo(() => {
    if (!value) return null;
    return materials.find(m => String(m.id) === String(value)) || null;
  }, [materials, value]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setTimeout(() => setIsOpen(false), 120);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    const list = materials || [];
    if (!q) {
      return list.slice(0, maxResults);
    }
    return list
      .filter(m => {
        const nameMatch = (m.name || '').toLowerCase().includes(q);
        const skuMatch = (m.sku || m.item_code || '').toLowerCase().includes(q);
        const catMatch = (m.category || '').toLowerCase().includes(q);
        return nameMatch || skuMatch || catMatch;
      })
      .slice(0, maxResults);
  }, [materials, debouncedQuery, maxResults]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [debouncedQuery]);

  const handleChoose = (item) => {
    if (onSelect) onSelect(item);
    if (clearOnSelect) {
      setQuery('');
      setIsOpen(false);
    } else {
      setQuery('');
      setIsOpen(false);
    }
  };

  const handleKeyDown = (e) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setIsOpen(true);
      return;
    }
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => Math.min(prev + 1, Math.max(0, filtered.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      if (filtered[highlightIndex]) {
        e.preventDefault();
        handleChoose(filtered[highlightIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const isSourceCentral = String(sourceLocation || '').toUpperCase().includes('CENTRAL');

  if (!clearOnSelect && selectedItem && !isOpen) {
    const restoStock = Number(selectedItem.qty_resto ?? selectedItem.stock ?? 0);
    const centralStock = Number(selectedItem.qty_central ?? 0);
    return (
      <div ref={wrapperRef} className={`relative ${className}`}>
        <div
          onClick={() => {
            if (!disabled) {
              setIsOpen(true);
              setTimeout(() => inputRef.current?.focus(), 20);
            }
          }}
          className="form-control flex items-center justify-between gap-2 cursor-pointer py-2 px-3 bg-[var(--bg-secondary)] hover:border-[var(--accent)] transition-colors"
        >
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-xs md:text-sm text-[var(--text-primary)] truncate">
              {selectedItem.name} {selectedItem.sku ? `(${selectedItem.sku})` : ''}
            </div>
            <div className="text-[11px] text-[var(--text-secondary)] flex flex-wrap items-center gap-2 mt-0.5">
              <span>Satuan: <strong>{selectedItem.unit || 'unit'}</strong></span>
              {selectedItem.category && <span>• {selectedItem.category}</span>}
              <span>• Central: <strong>{centralStock.toLocaleString('id-ID')}</strong></span>
              <span>• Resto: <strong>{restoStock.toLocaleString('id-ID')}</strong></span>
            </div>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onSelect) onSelect(null);
                setQuery('');
                setIsOpen(true);
              }}
              className="p-1 rounded-md text-[var(--text-muted)] hover:text-rose-500"
              title="Ganti bahan"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className={`relative ${className}`} style={{ zIndex: isOpen ? 40 : 10 }}>
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          className="form-control pl-10 pr-8 py-2.5 text-sm w-full"
          style={{
            background: 'var(--bg-tertiary)',
            borderColor: isOpen ? 'var(--accent)' : 'var(--border)'
          }}
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {isOpen && (
        <div
          className="glass-card"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '6px',
            padding: '6px',
            maxHeight: '290px',
            overflowY: 'auto',
            boxShadow: '0 12px 28px rgba(0,0,0,0.22)',
            border: '1px solid var(--accent)',
            background: 'var(--bg-card, var(--bg-primary))'
          }}
        >
          {filtered.length > 0 ? (
            filtered.map((m, idx) => {
              const centralStock = Number(m.qty_central ?? 0);
              const restoStock = Number(m.qty_resto ?? m.stock ?? 0);
              const activeSourceQty = isSourceCentral ? centralStock : restoStock;
              const isSelected = String(m.id) === String(value);

              return (
                <div
                  key={m.id}
                  onClick={() => handleChoose(m)}
                  onMouseEnter={() => setHighlightIndex(idx)}
                  style={{
                    padding: '9px 11px',
                    cursor: 'pointer',
                    borderRadius: 'var(--radius-sm)',
                    background: idx === highlightIndex ? 'var(--bg-tertiary)' : 'transparent',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.86rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="truncate">{m.name}</span>
                      {m.sku && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>({m.sku})</span>}
                      {isSelected && <Check size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                    </div>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: '2px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      <span>Satuan: <strong>{m.unit || 'unit'}</strong></span>
                      {m.category && <span>• {m.category}</span>}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 7px',
                        borderRadius: '999px',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        background: activeSourceQty > 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                        color: activeSourceQty > 0 ? 'var(--success, #10b981)' : 'var(--danger, #ef4444)'
                      }}
                    >
                      {isSourceCentral ? `Central: ${centralStock.toLocaleString('id-ID')}` : `Resto: ${restoStock.toLocaleString('id-ID')}`} {m.unit || ''}
                    </span>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {isSourceCentral ? `Resto: ${restoStock.toLocaleString('id-ID')}` : `Central: ${centralStock.toLocaleString('id-ID')}`}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ padding: '14px 12px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              <Package size={20} style={{ margin: '0 auto 6px', opacity: 0.45 }} />
              Bahan "{query}" tidak ditemukan.
            </div>
          )}

          {onCreateNew && query.trim() !== '' && (
            <div style={{ borderTop: '1px solid var(--border)', marginTop: '4px', paddingTop: '4px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%', justifyContent: 'center', color: 'var(--accent)', border: 'none', background: 'transparent', fontSize: '0.8rem', padding: '8px' }}
                onClick={() => {
                  const nameToCreate = query.trim();
                  setIsOpen(false);
                  setQuery('');
                  onCreateNew(nameToCreate);
                }}
              >
                <Plus size={15} style={{ marginRight: '6px' }} /> Tambah "{query.trim()}" ke Master Data
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
