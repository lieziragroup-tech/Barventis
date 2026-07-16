import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { api } from '../../services/api';
import { ArrowLeft, ShoppingCart, Search, Plus, Minus, Trash2, CreditCard, Loader2 } from 'lucide-react';
import './PosTerminal.css';

export default function PosTerminal() {
  const navigate = useNavigate();
  // eslint-disable-next-line no-unused-vars
  const { recipes, loadingData, refreshData } = useData();
  const { activeUser } = useAuth();
  const { showSuccess, showError, showWarning } = useToast();
  
  // Persistent cart
  const [cart, setCart] = useState(() => {
    const saved = localStorage.getItem('barventis_pos_cart');
    if (saved) {
      try { return JSON.parse(saved); } catch { return []; }
    }
    return [];
  });
  
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('CASH');

  useEffect(() => {
    localStorage.setItem('barventis_pos_cart', JSON.stringify(cart));
  }, [cart]);

  // Filter only active/ready recipes
  const activeMenus = recipes.filter(r => r.selling_price > 0);

  const categories = ['ALL', ...new Set(activeMenus.map(m => m.category || 'Lainnya'))];

  const filteredMenus = activeMenus.filter(menu => {
    const matchCategory = activeCategory === 'ALL' || (menu.category || 'Lainnya') === activeCategory;
    const matchSearch = menu.menu_name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchCategory && matchSearch;
  });

  const addToCart = (menu) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === menu.id);
      if (existing) {
        return prev.map(item => item.id === menu.id ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...prev, { ...menu, qty: 1 }];
    });
  };

  const updateQty = (id, delta) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.id === id) {
          const newQty = item.qty + delta;
          return newQty > 0 ? { ...item, qty: newQty } : item;
        }
        return item;
      });
    });
  };

  const removeFromCart = (id) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.selling_price * item.qty), 0);
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);

  const formatPrice = (price) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(price);
  };

  const handleProcessCheckout = async () => {
    if (cart.length === 0) return;
    setIsProcessing(true);
    
    try {
      const res = await api.processPosCheckout(cart, paymentMethod);
      if (res.success) {
        showSuccess(`Pembayaran berhasil! No Order: ${res.orderNo}`);
        setCart([]); // Clear cart
        localStorage.removeItem('barventis_pos_cart');
        setShowCheckoutModal(false);
        setIsCartOpen(false); // Close cart on mobile if open
        await refreshData(); // Refresh stock in background
        if (res.warnings && res.warnings.length > 0) {
          setTimeout(() => {
            showWarning('Beberapa stok bahan baku habis saat order diproses.');
          }, 2000);
        }
      }
    } catch (err) {
      showError('Gagal memproses pembayaran: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const basePath = activeUser?.role === 'Staff' ? '/staff' : '/owner';

  return (
    <div className="pos-terminal-container">
      {/* HEADER SECTION */}
      <header className="pos-header">
        <div className="pos-header-left">
          <button className="btn-back" onClick={() => navigate(basePath)}>
            <ArrowLeft size={20} />
            Kembali
          </button>
          <div className="pos-title">
            <h2>POS Terminal</h2>
            <span>{activeUser?.tenant_name?.toUpperCase() || 'TENANT'}</span>
          </div>
        </div>
        
        <div className="pos-search-bar">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            placeholder="Cari menu masakan/minuman..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="pos-header-right">
          <div className="user-badge">
            <span className="user-name">{activeUser?.name}</span>
            <span className="user-role">{activeUser?.role}</span>
          </div>
        </div>
      </header>

      {/* MOBILE FLOATING CART BUTTON */}
      <div className="mobile-floating-cart">
        <button className="floating-cart-btn" onClick={() => setIsCartOpen(true)}>
          <div className="floating-cart-icon">
            <ShoppingCart size={20} />
            <span className="floating-cart-badge">{cartCount}</span>
          </div>
          <div className="floating-cart-total">{formatPrice(cartTotal)}</div>
        </button>
      </div>

      {/* MOBILE CART OVERLAY */}
      {isCartOpen && (
        <div className="mobile-cart-overlay" onClick={() => setIsCartOpen(false)}></div>
      )}

      {/* MAIN CONTENT */}
      <main className="pos-main">
        {/* LEFT PANEL: Menu Grid */}
        <section className="pos-menu-section">
          {/* Mobile search bar visible only on small screens */}
          <div className="pos-mobile-search">
            <Search size={16} className="search-icon" />
            <input 
              type="text" 
              placeholder="Cari menu..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ fontSize: '16px' }} /* iOS prevents zoom if >=16px */
            />
          </div>

          <div className="category-pills">
            {categories.map(cat => (
              <button 
                key={cat}
                className={`category-pill ${activeCategory === cat ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="menu-grid">
            {filteredMenus.map(menu => (
              <div key={menu.id} className="menu-card" onClick={() => addToCart(menu)}>
                <div className="menu-card-image">
                  <div className="image-placeholder">{menu.menu_name.charAt(0)}</div>
                </div>
                <div className="menu-card-info">
                  <h4 className="menu-name">{menu.menu_name}</h4>
                  <div className="menu-price">{formatPrice(menu.selling_price)}</div>
                </div>
              </div>
            ))}
            {filteredMenus.length === 0 && (
              <div className="empty-state">
                <p>Tidak ada menu yang ditemukan.</p>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT PANEL: Cart */}
        <aside className={`pos-cart-section ${isCartOpen ? 'open' : ''}`}>
          <div className="cart-header">
            <h3>Pesanan Saat Ini</h3>
            <div className="cart-header-actions">
              <span className="cart-count">{cart.reduce((sum, item) => sum + item.qty, 0)} Item</span>
              <button className="mobile-close-cart" onClick={() => setIsCartOpen(false)}>✕</button>
            </div>
          </div>

          <div className="cart-items">
            {cart.length === 0 ? (
              <div className="empty-cart">
                <ShoppingCart size={48} className="empty-icon" />
                <p>Keranjang masih kosong</p>
                <span>Pilih menu di sebelah kiri untuk menambahkan</span>
              </div>
            ) : (
              cart.map(item => (
                <div key={item.id} className="cart-item">
                  <div className="cart-item-info">
                    <h5 className="cart-item-name">{item.menu_name}</h5>
                    <div className="cart-item-price">{formatPrice(item.selling_price)}</div>
                  </div>
                  <div className="cart-item-actions">
                    <button className="qty-btn" onClick={() => updateQty(item.id, -1)}><Minus size={14} /></button>
                    <span className="qty-display">{item.qty}</span>
                    <button className="qty-btn" onClick={() => updateQty(item.id, 1)}><Plus size={14} /></button>
                    <button className="delete-btn" onClick={() => removeFromCart(item.id)}><Trash2 size={14} /></button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="cart-footer">
            <div className="cart-summary">
              <div className="summary-row">
                <span>Subtotal</span>
                <span>{formatPrice(cartTotal)}</span>
              </div>
              <div className="summary-row">
                <span>Pajak (PB1)</span>
                <span>{formatPrice(0)}</span>
              </div>
              <div className="summary-row total">
                <span>Total Bayar</span>
                <span>{formatPrice(cartTotal)}</span>
              </div>
            </div>
            
            <button 
              className={`checkout-btn ${cart.length === 0 ? 'disabled' : ''}`}
              onClick={() => setShowCheckoutModal(true)}
              disabled={cart.length === 0}
            >
              <CreditCard size={20} />
              Proses Pembayaran
            </button>
          </div>
        </aside>
      </main>

      {/* CHECKOUT MODAL */}
      {showCheckoutModal && (
        <div className="checkout-modal-overlay">
          <div className="checkout-modal">
            <div className="checkout-modal-header">
              <h3>Selesaikan Pembayaran</h3>
              <button className="close-modal-btn" onClick={() => setShowCheckoutModal(false)}>✕</button>
            </div>
            
            <div className="checkout-modal-body">
              <div className="checkout-total-display">
                <span>Total Tagihan</span>
                <h2>{formatPrice(cartTotal)}</h2>
              </div>

              <div className="payment-methods">
                <p>Metode Pembayaran</p>
                <div className="method-grid">
                  {['CASH', 'QRIS', 'DEBIT', 'TRANSFER'].map(method => (
                    <button 
                      key={method}
                      className={`method-btn ${paymentMethod === method ? 'active' : ''}`}
                      onClick={() => setPaymentMethod(method)}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              {paymentMethod === 'CASH' && (
                <div className="cash-input-section">
                  <p>Uang Diterima (Opsional)</p>
                  <input type="number" placeholder="Contoh: 100000" className="cash-input" />
                </div>
              )}
            </div>

            <div className="checkout-modal-footer">
              <button 
                className={`confirm-payment-btn ${isProcessing ? 'processing' : ''}`}
                onClick={handleProcessCheckout}
                disabled={isProcessing}
              >
                {isProcessing ? <Loader2 size={20} className="spin" /> : <CreditCard size={20} />}
                {isProcessing ? 'Memproses Transaksi...' : `Bayar ${formatPrice(cartTotal)}`}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
