import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, ClipboardCheck, ArrowRight, ShieldCheck, 
  MapPin, CheckCircle, Save, FileText, RefreshCw, X, Palette
} from 'lucide-react';
import confetti from 'canvas-confetti';

export default function StockOpname({ stock, transactions, onCompleteOpname }) {
  const [step, setStep] = useState(1); // 1: Init, 2: Count, 3: Reconcile, 4: Approve & Sign
  const [location, setLocation] = useState('RESTO'); // RESTO, CENTRAL
  const [opnameItems, setOpnameItems] = useState([]);
  const [signatureData, setSignatureData] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [activeCategory, setActiveCategory] = useState('');
  
  const canvasRef = useRef(null);

  // 1. Unique categories
  const categories = [...new Set(stock.map(item => item.category))];

  // 2. Initialize Opname
  const handleStartOpname = () => {
    // Populate items with their book stock at the selected location
    const items = stock.map(item => ({
      name: item.name,
      category: item.category,
      unit: item.unit,
      price: item.new_price || item.price,
      book_qty: location === 'RESTO' ? (item.qty_resto || 0) : (item.qty_central || 0),
      physical_qty: '',
      notes: ''
    }));
    setOpnameItems(items);
    setActiveCategory(categories[0] || '');
    setStep(2);
  };

  // 3. Row Qty updates
  const handlePhysicalQtyChange = (name, val) => {
    const updated = opnameItems.map(item => {
      if (item.name === name) {
        return {
          ...item,
          physical_qty: val === '' ? '' : parseFloat(val) || 0
        };
      }
      return item;
    });
    setOpnameItems(updated);
  };

  const handleNotesChange = (name, val) => {
    const updated = opnameItems.map(item => {
      if (item.name === name) {
        return { ...item, notes: val };
      }
      return item;
    });
    setOpnameItems(updated);
  };

  // 4. Digital Signature Pad drawing controls
  useEffect(() => {
    if (step === 4 && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
    }
  }, [step]);

  const startDrawing = (e) => {
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.beginPath();
    }
  };

  const draw = (e) => {
    if (!isDrawing || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Get mouse/touch position relative to canvas
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const clearSignature = () => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setSignatureData(null);
    }
  };

  const saveSignature = () => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const dataUrl = canvas.toDataURL();
      setSignatureData(dataUrl);
    }
  };

  // 5. Complete and Commit Opname
  const handleCommitOpname = () => {
    saveSignature();
    
    // Calculate total variance and value adjustment
    const reconciliation = opnameItems.map(item => {
      const pQty = item.physical_qty === '' ? item.book_qty : item.physical_qty;
      const variance = pQty - item.book_qty;
      return {
        ...item,
        physical_qty: pQty,
        variance: variance,
        valAdjustment: variance * item.price
      };
    });

    onCompleteOpname(location, reconciliation, signatureData);
    
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 }
    });
    
    // Back to step 1
    setStep(1);
    setOpnameItems([]);
    setSignatureData(null);
  };

  // Format currency
  const formatIDR = (num) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num);
  };

  // Categorize items
  const filteredOpnameItems = opnameItems.filter(item => item.category === activeCategory);
  
  // Calculate total differences for Step 3
  const itemsWithVariance = opnameItems.filter(item => {
    const pQty = item.physical_qty === '' ? item.book_qty : item.physical_qty;
    return pQty !== item.book_qty;
  });

  return (
    <div>
      {/* Step 1: Initialize Opname */}
      {step === 1 && (
        <div className="glass-card" style={{ maxWidth: '520px', margin: '40px auto', padding: '32px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', textAlign: 'center', marginBottom: '24px' }}>
            <div className="upload-icon-circle" style={{ background: 'var(--accent-glow)', color: 'var(--accent)', width: '72px', height: '72px' }}>
              <ClipboardCheck size={36} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'white', marginBottom: '8px' }}>
                Stock Opname & Audit Wizard
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Initialize stocktaking records. This locks system book inventory levels for variance reconciliation.
              </p>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Audit Warehouse Location</label>
            <select className="form-control" value={location} onChange={e => setLocation(e.target.value)}>
              <option value="RESTO">Resto Bar (Main Outlet)</option>
              <option value="CENTRAL">Central Warehouse (Storage)</option>
            </select>
          </div>

          <button className="btn btn-primary" style={{ width: '100%', marginTop: '16px', display: 'flex', justifyContent: 'center' }} onClick={handleStartOpname}>
            Start Stocktaking Wizard <ArrowRight size={16} />
          </button>
        </div>
      )}

      {/* Step 2: Physical Count Input Grid */}
      {step === 2 && (
        <div className="glass-card" style={{ padding: '28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '16px', marginBottom: '24px' }}>
            <div>
              <span className="badge badge-info" style={{ marginBottom: '6px' }}>Step 2: Counting</span>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'white' }}>Audit Inventory: {location} Location</h3>
            </div>
            
            {/* Category tabs */}
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', maxWidth: '60%' }}>
              {categories.map(cat => (
                <button 
                  key={cat} 
                  className={`btn ${activeCategory === cat ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Items Table for counting */}
          <div className="table-container" style={{ maxHeight: 'calc(100vh - 420px)', overflowY: 'auto', marginBottom: '24px' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th style={{ width: '40%' }}>Raw Material Name</th>
                  <th style={{ width: '15%', textAlign: 'right' }}>Book Qty</th>
                  <th style={{ width: '10%' }}>Unit</th>
                  <th style={{ width: '20%', textAlign: 'right' }}>Physical Qty</th>
                  <th style={{ width: '15%', textAlign: 'right' }}>Live Variance</th>
                </tr>
              </thead>
              <tbody>
                {filteredOpnameItems.map(item => {
                  const physicalVal = item.physical_qty;
                  const variance = physicalVal === '' ? 0 : physicalVal - item.book_qty;
                  
                  let varianceStyle = 'var(--text-muted)';
                  if (variance > 0) {
                    varianceStyle = 'var(--success)';
                  } else if (variance < 0) {
                    varianceStyle = 'var(--danger)';
                  }

                  return (
                    <tr key={item.name}>
                      <td style={{ fontWeight: 600 }}>{item.name}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{item.book_qty.toFixed(0)}</td>
                      <td>{item.unit}</td>
                      <td style={{ textAlign: 'right' }}>
                        <input 
                          type="number"
                          step="any"
                          className="form-control"
                          style={{ padding: '6px 12px', fontSize: '0.85rem', textAlign: 'right', width: '120px', marginLeft: 'auto' }}
                          placeholder={item.book_qty.toFixed(0)}
                          value={item.physical_qty}
                          onChange={e => handlePhysicalQtyChange(item.name, e.target.value)}
                        />
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: varianceStyle }}>
                        {variance === 0 ? '0' : variance > 0 ? `+${variance.toFixed(0)}` : variance.toFixed(0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Action Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button className="btn btn-secondary" onClick={() => setStep(1)}>Cancel Opname</button>
            <button className="btn btn-primary" onClick={() => setStep(3)}>
              Reconciliation Review <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Reconciliation Review */}
      {step === 3 && (
        <div className="glass-card" style={{ padding: '28px' }}>
          <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px', marginBottom: '24px' }}>
            <span className="badge badge-warning" style={{ marginBottom: '6px' }}>Step 3: Reconciliation</span>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'white' }}>Audit Reconciliation Discrepancy Sheet</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
              The items listed below have discrepancies between physical count and system records. Add audit notes if required.
            </p>
          </div>

          {/* Table displaying items with discrepancies */}
          <div className="table-container" style={{ maxHeight: 'calc(100vh - 420px)', overflowY: 'auto', marginBottom: '24px' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th style={{ width: '35%' }}>Discrepant Item</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Book Stock</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Physical Count</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Variance</th>
                  <th style={{ width: '14%', textAlign: 'right' }}>Valuation Adjust</th>
                  <th style={{ width: '25%' }}>Audit Explanation / Action Notes</th>
                </tr>
              </thead>
              <tbody>
                {itemsWithVariance.map(item => {
                  const pQty = item.physical_qty;
                  const variance = pQty - item.book_qty;
                  const valAdjustment = variance * item.price;

                  return (
                    <tr key={item.name}>
                      <td style={{ fontWeight: 600 }}>{item.name}</td>
                      <td style={{ textAlign: 'right' }}>{item.book_qty.toFixed(0)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{pQty.toFixed(0)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: variance > 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {variance > 0 ? `+${variance.toFixed(0)}` : variance.toFixed(0)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: valAdjustment > 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {formatIDR(valAdjustment)}
                      </td>
                      <td>
                        <input 
                          type="text" 
                          className="form-control" 
                          placeholder="e.g. Broken packaging, waste..." 
                          style={{ padding: '6px 12px', fontSize: '0.825rem' }}
                          value={item.notes}
                          onChange={e => handleNotesChange(item.name, e.target.value)}
                        />
                      </td>
                    </tr>
                  );
                })}
                {itemsWithVariance.length === 0 && (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--success)', fontWeight: 600 }}>
                      🎉 Zero discrepancies found! Perfect stock matches all round.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Action Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button className="btn btn-secondary" onClick={() => setStep(2)}>Back to Counting</button>
            <button className="btn btn-primary" onClick={() => setStep(4)}>
              Approve & Signature <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Digital Signature Canvas */}
      {step === 4 && (
        <div className="glass-card" style={{ maxWidth: '520px', margin: '40px auto', padding: '32px' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <span className="badge badge-success" style={{ marginBottom: '8px' }}>Step 4: Approval</span>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
              Approve Stocktaking Audit
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Sign with your mouse/touchscreen inside the box below to authorize these adjustments.
            </p>
          </div>

          {/* Drawing Canvas */}
          <div className="signature-canvas-container">
            <canvas 
              ref={canvasRef}
              className="signature-canvas"
              width={456}
              height={200}
              onMouseDown={startDrawing}
              onMouseUp={stopDrawing}
              onMouseOut={stopDrawing}
              onMouseMove={draw}
              onTouchStart={startDrawing}
              onTouchEnd={stopDrawing}
              onTouchMove={draw}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
            <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={clearSignature}>
              Clear Signature
            </button>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Palette size={12} /> Canvas Active
            </span>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setStep(3)}>Back</button>
            <button className="btn btn-success" style={{ flex: 2, display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center' }} onClick={handleCommitOpname}>
              <ShieldCheck size={18} /> Approve & Reconcile Stock
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
