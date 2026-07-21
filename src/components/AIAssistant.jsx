import { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Sparkles, Loader, ChevronRight } from 'lucide-react';
import { useData } from '../contexts/DataContext';

// Context-aware response engine using real stock/recipe/transaction data
function buildAIResponse(input, { stock, recipes, transactions }) {
  const q = input.toLowerCase().trim();

  // --- DATA CONTEXT CALCULATIONS ---
  const lowStock = stock.filter(i => ((i.qty_resto || 0) + (i.qty_central || 0)) < (i.min_stock || 15));
  const criticalStock = stock.filter(i => ((i.qty_resto || 0) + (i.qty_central || 0)) === 0);
  const stockValuation = stock.reduce((s, i) => s + ((i.qty_resto || 0) + (i.qty_central || 0)) * (i.new_price || i.price || 0), 0);

  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const monthSales = (transactions || [])
    .filter(tx => tx.type === 'POS_SALE' && (tx.date || '').startsWith(currentMonth))
    .reduce((s, tx) => s + Math.abs(parseFloat(tx.amount || 0)), 0);
  const monthCogs = (transactions || [])
    .filter(tx => (tx.type === 'POS_DEDUCTION' || tx.type === 'OUT') && (tx.date || '').startsWith(currentMonth))
    .reduce((s, tx) => s + Math.abs(parseFloat(tx.amount || 0)), 0);
  const costPct = monthSales > 0 ? ((monthCogs / monthSales) * 100).toFixed(1) : null;

  const fmtIDR = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);

  // --- QUESTION MATCHING ---

  // Low stock / stok habis
  if (/stok.*(habis|kritis|critical|low|rendah)|habis.*stok|bahan.*habis/.test(q)) {
    if (criticalStock.length === 0 && lowStock.length === 0) {
      return '✅ Semua bahan baku saat ini dalam kondisi aman — tidak ada yang di bawah batas minimum.';
    }
    let resp = '';
    if (criticalStock.length > 0) {
      resp += `🔴 **Stok HABIS (${criticalStock.length} bahan):**\n`;
      resp += criticalStock.slice(0, 5).map(i => `• ${i.name} (${i.category})`).join('\n');
      if (criticalStock.length > 5) resp += `\n  ...dan ${criticalStock.length - 5} lainnya.`;
      resp += '\n\n';
    }
    if (lowStock.length > 0) {
      const nonCritical = lowStock.filter(i => ((i.qty_resto || 0) + (i.qty_central || 0)) > 0);
      if (nonCritical.length > 0) {
        resp += `⚠️ **Stok Rendah (${nonCritical.length} bahan):**\n`;
        resp += nonCritical.slice(0, 5).map(i => {
          const qty = ((i.qty_resto || 0) + (i.qty_central || 0));
          return `• ${i.name}: ${qty.toFixed(1)} ${i.unit}`;
        }).join('\n');
      }
    }
    return resp.trim() || 'Semua stok dalam kondisi aman.';
  }

  // Cost % / HPP / beverage cost
  if (/cost|hpp|beverage|persen|%|target/.test(q)) {
    if (!costPct) {
      return '📊 Belum ada data penjualan POS bulan ini. Upload file POS terlebih dahulu melalui menu **Upload POS Sales** agar Beverage Cost % dapat dihitung.';
    }
    const pctNum = parseFloat(costPct);
    const status = pctNum < 27 ? '✅ **Aman** — di bawah target 27%' : '🔴 **Perhatian** — melebihi target 27%!';
    return `📊 **Beverage Cost % Bulan Ini: ${costPct}%**\n\nStatus: ${status}\n\nDetail:\n• Penjualan POS: ${fmtIDR(monthSales)}\n• Pemakaian Bahan: ${fmtIDR(monthCogs)}\n\nUntuk analisis lebih detail, buka menu **Cost Control**.`;
  }

  // Valuasi stok
  if (/nilai.*stok|stok.*nilai|valuas|inventory.*value|aset/.test(q)) {
    const restoVal = stock.reduce((s, i) => s + (i.qty_resto || 0) * (i.new_price || i.price || 0), 0);
    const centralVal = stock.reduce((s, i) => s + (i.qty_central || 0) * (i.new_price || i.price || 0), 0);
    return `📦 **Valuasi Stok Saat Ini:**\n\n• RESTO: ${fmtIDR(restoVal)}\n• CENTRAL: ${fmtIDR(centralVal)}\n• **Total: ${fmtIDR(stockValuation)}**\n\nTotal ${stock.length} jenis bahan baku aktif terdaftar.`;
  }

  // Resep / COGS
  if (/resep|recipe|cogs|bahan.*menu|menu.*bahan|ingredient/.test(q)) {
    if (recipes.length === 0) {
      return '🍹 Belum ada resep yang terdaftar. Tambahkan resep pertama Anda melalui menu **F&B Recipes (COGS)** untuk mulai menghitung HPP per menu.';
    }
    const sortedByCost = [...recipes].sort((a, b) => b.food_cost_pct - a.food_cost_pct).slice(0, 3);
    let resp = `🍹 **${recipes.length} resep** terdaftar di sistem.\n\n**Top 3 resep dengan Food Cost % tertinggi:**\n`;
    sortedByCost.forEach((r, i) => {
      const pct = (parseFloat(r.food_cost_pct) * 100).toFixed(1);
      resp += `${i + 1}. ${r.menu_name} — ${pct}% (HPP: ${fmtIDR(r.basic_cost)})\n`;
    });
    resp += '\nBuka menu **F&B Recipes** untuk melihat dan mengedit semua resep.';
    return resp;
  }

  // POS upload
  if (/pos|upload|kasir|penjualan|sales.*upload|upload.*sales/.test(q)) {
    return '📤 **Cara Upload POS:**\n\n1. Export laporan harian dari aplikasi kasir (Moka, Pawoon, dll) ke format Excel\n2. Buka menu **Upload POS Sales**\n3. Drag & drop atau pilih file Excel\n4. Sistem akan otomatis mendeteksi kolom dan memotong stok sesuai resep\n\n💡 Tip: Pastikan semua menu di POS sudah terdaftar di resep agar deduction berjalan akurat.';
  }

  // Invoice / PO
  if (/invoice|po\b|purchase.*order|pembelian|beli.*bahan/.test(q)) {
    return '📋 **Purchase Order (PO):**\n\nBuat PO melalui menu **Invoicing / PO**:\n1. Klik tombol "Buat PO Baru"\n2. Pilih supplier dan tambahkan bahan\n3. Status DRAFT → RECEIVED untuk auto-tambah stok\n\n💡 Tip: Gunakan fitur **Bulk Import** untuk import puluhan PO sekaligus dari Excel.';
  }

  // Opname
  if (/opname|stok.*akhir|akhir.*bulan|counting|hitung.*fisik/.test(q)) {
    return '📋 **Stock Opname:**\n\nLakukan opname melalui menu **Stock Opname**:\n1. Pilih lokasi (RESTO atau CENTRAL)\n2. Isi qty fisik per bahan\n3. Rekonsiliasi selisih\n4. Tandatangani digital\n\n💡 Opname wajib dilakukan tiap akhir bulan untuk kalkulasi Cost Control yang akurat.';
  }

  // Jumlah bahan / material
  if (/berapa.*bahan|jumlah.*bahan|total.*bahan|bahan.*ada/.test(q)) {
    const byCategory = {};
    stock.forEach(i => { byCategory[i.category] = (byCategory[i.category] || 0) + 1; });
    let resp = `📦 Total **${stock.length} bahan baku** aktif:\n\n`;
    Object.entries(byCategory).forEach(([cat, count]) => { resp += `• ${cat}: ${count} item\n`; });
    return resp.trim();
  }

  // Saran / tips
  if (/saran|tips|rekomendasi|cara.*efisien|optimas/.test(q)) {
    const tips = [];
    if (criticalStock.length > 0) tips.push(`🔴 Segera restock ${criticalStock.length} bahan yang habis`);
    if (costPct && parseFloat(costPct) > 27) tips.push(`📉 Beverage Cost ${costPct}% melebihi target — review resep berbiaya tinggi`);
    if (recipes.length === 0) tips.push(`🍹 Tambahkan resep agar deduction POS bisa berjalan`);
    if (tips.length === 0) tips.push('✅ Sistem berjalan dengan baik. Lanjutkan upload POS harian dan opname bulanan secara rutin.');
    return `💡 **Rekomendasi Saat Ini:**\n\n${tips.join('\n')}`;
  }

  // Default — navigasi help
  return `Saya bisa membantu Anda dengan:\n\n• **"stok habis"** — cek bahan yang low/critical\n• **"beverage cost"** — lihat HPP bulan ini\n• **"valuasi stok"** — total nilai inventory\n• **"resep"** — info COGS & food cost %\n• **"cara upload POS"** — panduan integrasi kasir\n• **"saran"** — rekomendasi berdasarkan data\n\nCoba ketik salah satu di atas! 😊`;
}

// Quick suggestion chips
const QUICK_CHIPS = [
  'Stok habis?',
  'Beverage cost bulan ini',
  'Valuasi stok',
  'Saran optimasi',
];

export default function AIAssistant() {
  const { stock = [], recipes = [], transactions = [] } = useData() || {};
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Halo! 👋 Saya asisten AI Barventis yang terkoneksi dengan data inventory Anda secara real-time. Tanya saya tentang stok, HPP, cost control, atau cara kerja sistem.' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const sendMessage = (text) => {
    if (!text.trim()) return;
    const userMessage = { role: 'user', text };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    // Simulate brief "thinking" delay then respond with context-aware answer
    setTimeout(() => {
      const response = buildAIResponse(text, { stock, recipes, transactions });
      setMessages(prev => [...prev, { role: 'assistant', text: response }]);
      setIsTyping(false);
    }, 700);
  };

  const handleSend = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        title="Barventis AI Assistant"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'var(--accent)',
          border: 'none',
          boxShadow: 'var(--shadow-lg)',
          color: 'var(--text-inverse)',
          display: isOpen ? 'none' : 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 9998,
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(59,130,246,0.6)'; }}
        onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(59,130,246,0.45)'; }}
      >
        <Sparkles size={24} />
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="ai-assistant-panel" style={{
          background: 'rgba(15, 17, 23, 0.97)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          borderRadius: '20px',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: "'Outfit', sans-serif",
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 18px',
            background: 'linear-gradient(90deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15))',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                background: 'var(--accent)',
                padding: '7px', borderRadius: 'var(--radius-lg)', color: 'var(--text-inverse)', display: 'flex',
              }}>
                <Bot size={16} />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-inverse)', fontWeight: 700 }}>Barventis AI</h4>
                <span style={{ fontSize: '0.68rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
                  Terkoneksi dengan data Anda
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {messages.map((msg, idx) => (
              <div key={idx} style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '90%',
              }}>
                <div style={{
                  background: msg.role === 'user'
                    ? 'var(--accent)'
                    : 'rgba(255, 255, 255, 0.05)',
                  color: 'var(--text-inverse)',
                  padding: '10px 14px',
                  borderRadius: '14px',
                  borderBottomRightRadius: msg.role === 'user' ? '4px' : '14px',
                  borderBottomLeftRadius: msg.role === 'assistant' ? '4px' : '14px',
                  fontSize: '0.82rem',
                  lineHeight: '1.55',
                  border: msg.role === 'assistant' ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  whiteSpace: 'pre-wrap',
                }}>
                  {msg.text}
                </div>
              </div>
            ))}

            {isTyping && (
              <div style={{
                alignSelf: 'flex-start',
                background: 'rgba(255,255,255,0.05)',
                padding: '10px 16px',
                borderRadius: '14px',
                borderBottomLeftRadius: '4px',
                display: 'flex', gap: '4px', alignItems: 'center',
              }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)',
                    animation: `aiDotBounce 1.2s ${i * 0.2}s ease-in-out infinite`,
                    display: 'inline-block',
                  }} />
                ))}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Chips */}
          {messages.length <= 2 && (
            <div style={{ padding: '0 14px 8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {QUICK_CHIPS.map(chip => (
                <button
                  key={chip}
                  onClick={() => sendMessage(chip)}
                  style={{
                    background: 'var(--accent-glow)', border: '1px solid rgba(59, 130, 246, 0.25)',
                    borderRadius: '20px', padding: '5px 12px',
                    color: 'var(--accent)', fontSize: '0.72rem', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '4px',
                    fontFamily: "'Outfit', sans-serif", fontWeight: '600',
                    transition: 'background 0.15s',
                  }}
                  onMouseOver={e => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)'}
                  onMouseOut={e => e.currentTarget.style.background = 'var(--accent-glow)'}
                >
                  {chip} <ChevronRight size={11} />
                </button>
              ))}
            </div>
          )}

          {/* Input Area */}
          <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.25)' }}>
            <form onSubmit={handleSend} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Tanya tentang stok, HPP, opname..."
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '20px',
                  padding: '10px 16px',
                  color: 'var(--text-inverse)',
                  fontSize: '0.82rem',
                  outline: 'none',
                  fontFamily: "'Outfit', sans-serif",
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(59, 130, 246, 0.5)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
              <button
                type="submit"
                disabled={!input.trim() || isTyping}
                style={{
                  background: input.trim() && !isTyping ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                  border: 'none',
                  width: '40px', height: '40px',
                  borderRadius: '50%',
                  color: 'var(--text-inverse)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: input.trim() && !isTyping ? 'pointer' : 'not-allowed',
                  transition: 'background 0.2s',
                  flexShrink: 0,
                }}
              >
                {isTyping ? <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={15} style={{ marginLeft: '2px' }} />}
              </button>
            </form>
            <div style={{ textAlign: 'center', marginTop: '6px', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
              Data-driven · Terkoneksi dengan inventory real-time
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes aiDotBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </>
  );
}