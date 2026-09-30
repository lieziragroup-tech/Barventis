import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { api } from '../../services/api';

import { ArrowLeft, ShoppingCart, Search, Plus, Minus, Trash2, CreditCard, Loader2, History, Bell, ClipboardList, CheckCircle, XCircle, Settings } from 'lucide-react';
import './PosTerminal.css';

export default function PosTerminal() {
  const navigate = useNavigate();
  // eslint-disable-next-line no-unused-vars
  const { recipes, loadingData, refreshData, currentTenant } = useData();
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
  const [customerName, setCustomerName] = useState('');

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showStockCheckModal, setShowStockCheckModal] = useState(false);
  const [ordersHistory, setOrdersHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedStockMenu, setSelectedStockMenu] = useState(null);
  const [menuStockStatus, setMenuStockStatus] = useState([]);
  const [isUpdatingStock, setIsUpdatingStock] = useState(false);

  const [selectedOrder, setSelectedOrder] = useState(null);
  
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [historyFilter, setHistoryFilter] = useState('ALL'); // ALL, CASH, QRIS, DEBIT, TRANSFER

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [taxRate, setTaxRate] = useState(0);
  const [serviceCharge, setServiceCharge] = useState(0);
  const [isSavingSettings, setIsSavingSettings] = useState(false);


  const [selectedOrderItems, setSelectedOrderItems] = useState([]);
  const [loadingOrderItems, setLoadingOrderItems] = useState(false);

  const filteredHistory = ordersHistory.filter(order => {
    const matchSearch = order.order_no.toLowerCase().includes(historySearchTerm.toLowerCase()) || 
                        (order.customer_name && order.customer_name.toLowerCase().includes(historySearchTerm.toLowerCase()));
    const matchFilter = historyFilter === 'ALL' || order.payment_method === historyFilter;
    return matchSearch && matchFilter;
  });



  const [notifications, setNotifications] = useState([]);


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

  
  useEffect(() => {
    if (currentTenant) {
      setTimeout(() => {
        setTaxRate(parseFloat(currentTenant.pos_tax_rate) || 0);
        setServiceCharge(parseFloat(currentTenant.pos_service_charge) || 0);
      }, 0);
    }
  }, [currentTenant]);

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      await api.updateTenantSettings({
        pos_tax_rate: taxRate,
        pos_service_charge: serviceCharge
      });
      showSuccess('Pengaturan berhasil disimpan');
      setShowSettingsModal(false);
      refreshData();
    } catch (error) {
      showError('Gagal menyimpan pengaturan: ' + error.message);
    } finally {
      setIsSavingSettings(false);
    }
  };


  const removeFromCart = (id) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const activeTaxRate = currentTenant?.pos_tax_rate ? parseFloat(currentTenant.pos_tax_rate) : 0;
  const activeServiceChargeRate = currentTenant?.pos_service_charge ? parseFloat(currentTenant.pos_service_charge) : 0;

  const cartSubtotal = cart.reduce((sum, item) => sum + (item.selling_price * item.qty), 0);
  const cartServiceCharge = (cartSubtotal * activeServiceChargeRate) / 100;
  const cartTax = ((cartSubtotal + cartServiceCharge) * activeTaxRate) / 100;
  const cartTotal = cartSubtotal + cartServiceCharge + cartTax;
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);

  const formatPrice = (price) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(price);
  };

  
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const data = await api.getPOSOrders();
      setOrdersHistory(data || []);
    } catch (error) {
      showError('Gagal memuat history order: ' + error.message);
    } finally {
      setLoadingHistory(false);
    }
  }, [showError]);

  useEffect(() => {
    let isMounted = true;
    if (showHistoryModal) {
      setTimeout(() => {
        if (isMounted) loadHistory();
      }, 0);
    }
    return () => { isMounted = false; };
  }, [showHistoryModal, loadHistory]);

  
  const handleViewOrder = async (order) => {
    if (selectedOrder?.id === order.id) {
      setSelectedOrder(null);
      return;
    }
    setSelectedOrder(order);
    setLoadingOrderItems(true);
    try {
      const items = await api.getPOSOrderItems(order.id);
      setSelectedOrderItems(items || []);
    } catch (error) {
      showError('Gagal memuat detail order: ' + error.message);
    } finally {
      setLoadingOrderItems(false);
    }
  };

  const handlePrintReceipt = (order, items) => {
    import('jspdf').then(({ default: jsPDF }) => {
      import('jspdf-autotable').then(() => {
        const doc = new jsPDF();
        doc.setFontSize(16);
        doc.text('RESI PEMBAYARAN - POS TERMINAL', 14, 20);
        doc.setFontSize(10);
        doc.text(`No. Order: ${order.order_no}`, 14, 28);
        doc.text(`Tanggal: ${new Date(order.created_at).toLocaleString('id-ID')}`, 14, 34);
        if (order.customer_name) doc.text(`Pelanggan: ${order.customer_name}`, 14, 40);
        doc.text(`Pembayaran: ${order.payment_method}`, 14, order.customer_name ? 46 : 40);

        const tableData = items.map(item => [
          item.recipes?.menu_name || 'Menu',
          item.qty,
          'Rp ' + item.unit_price.toLocaleString('id-ID'),
          'Rp ' + item.subtotal.toLocaleString('id-ID')
        ]);
        
        
        const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
        const total = order.total_amount;
        const taxAndService = total - subtotal;

        doc.autoTable({
          startY: 50,
          head: [['Menu', 'Qty', 'Harga', 'Subtotal']],
          body: tableData,
          foot: [
            ['', '', 'Subtotal', 'Rp ' + subtotal.toLocaleString('id-ID')],
            ['', '', 'Pajak & Layanan', 'Rp ' + taxAndService.toLocaleString('id-ID')],
            ['', '', 'TOTAL', 'Rp ' + total.toLocaleString('id-ID')]
          ],
          theme: 'grid',
          headStyles: { fillColor: [59, 130, 246] },
          footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' }
        });

        
        doc.save(`Resi_${order.order_no}.pdf`);
      });
    });
  };

  const exportHistory = (period) => {
    import('xlsx').then((XLSX) => {
      const now = new Date();
      let filtered = ordersHistory;
      if (period === 'day') {
        const today = now.toISOString().split('T')[0];
        filtered = ordersHistory.filter(o => o.created_at.startsWith(today));
      } else if (period === 'week') {
        const lastWeek = new Date(now.setDate(now.getDate() - 7));
        filtered = ordersHistory.filter(o => new Date(o.created_at) >= lastWeek);
      } else if (period === 'month') {
        const lastMonth = new Date(now.setMonth(now.getMonth() - 1));
        filtered = ordersHistory.filter(o => new Date(o.created_at) >= lastMonth);
      }
      
      const wsData = filtered.map(o => ({
        'No Order': o.order_no,
        'Tanggal': new Date(o.created_at).toLocaleString('id-ID'),
        'Pelanggan': o.customer_name || '-',
        'Metode Pembayaran': o.payment_method,
        'Total (Rp)': o.total_amount
      }));
      
      const ws = XLSX.utils.json_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'History');
      XLSX.writeFile(wb, `History_POS_${period}.xlsx`);
    });
  };

  const handleCheckStock = (menu) => {
    setSelectedStockMenu(menu);
    if (!menu.recipe_ingredients) {
      setMenuStockStatus([]);
      setShowStockCheckModal(true);
      return;
    }

    const status = menu.recipe_ingredients.map(ing => {
      const mat = ing.materials;
      if (!mat) return null;
      
      let factor = 1.0;
      const ingUnit = (ing.unit || '').toLowerCase().trim();
      const matUnit = (mat.unit || '').toLowerCase().trim();
      if (ingUnit !== matUnit) {
        const isIngGramMl = (ingUnit === 'gr' || ingUnit === 'ml' || ingUnit === 'grm');
        const isMatKgL = (matUnit === 'kg' || matUnit === 'l' || matUnit === 'liter' || matUnit === 'ltr');
        if (isIngGramMl && isMatKgL) factor = 1000.0;
      }
      
      const needed = parseFloat(ing.qty_in_use) / factor;
      const available = parseFloat(mat.qty_resto || 0);
      return {
        id: mat.id,
        name: mat.name,
        needed,
        available,
        unit: matUnit,
        isSufficient: available >= needed
      };
    }).filter(Boolean);

    setMenuStockStatus(status);
    setShowStockCheckModal(true);
  };

  const handleUpdateStockManual = async (materialId, newValue) => {
    if (isNaN(newValue)) return;
    setIsUpdatingStock(true);
    try {
      // Direct update for stock check correction
      const { error } = await api.supabase
        .from('materials')
        .update({ qty_resto: parseFloat(newValue) })
        .eq('id', materialId);
        
      if (error) throw error;
      showSuccess('Stok berhasil diperbarui.');
      
      // Update local state temporarily so user sees change
      setMenuStockStatus(prev => prev.map(s => s.id === materialId ? { ...s, available: parseFloat(newValue), isSufficient: parseFloat(newValue) >= s.needed } : s));
      refreshData();
    } catch (err) {
      showError('Gagal update stok: ' + err.message);
    } finally {
      setIsUpdatingStock(false);
    }
  };
  
  // generate dummy notifications for demo based on stock
  useEffect(() => {
    const lowStockAlerts = [];
    recipes.forEach(r => {
       r.recipe_ingredients?.forEach(ing => {
         const mat = ing.materials;
         if (mat && mat.qty_resto < 5) {
           lowStockAlerts.push(`Stok ${mat.name} menipis (${mat.qty_resto} ${mat.unit})`);
         }
       });
    });
    setTimeout(() => setNotifications([...new Set(lowStockAlerts)]), 0);
  }, [recipes]);

  const handleProcessCheckout = async () => {
    if (cart.length === 0) return;
    setIsProcessing(true);
    
    try {
      const res = await api.processPosCheckout(cart, paymentMethod, customerName);
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
            <div className="flex items-center gap-2">
              <h2>POS Terminal</h2>
              <span className="bg-[#ffddb8]/20 text-[#825100] border border-[#ffddb8] px-2 py-0.5 rounded text-[10px] font-bold">LITE</span>
            </div>
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
          <button className="btn-icon" onClick={() => setShowStockCheckModal(true)} title="Cek Stok Menu">
            <ClipboardList size={20} />
          </button>
          <button className="btn-icon" onClick={() => setShowHistoryModal(true)} title="Riwayat Order">
            <History size={20} />
          </button>
          <button className="btn-icon" onClick={() => setShowNotificationModal(true)} title="Notifikasi" style={{ position: 'relative' }}>
            <Bell size={20} />
            {notifications.length > 0 && <span className="notif-badge">{notifications.length}</span>}
          </button>
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
        {/* LEFT PANEL: Category Sidebar */}
        
        <aside className="pos-category-sidebar">
          {categories.map(cat => (
            <div 
              key={cat}
              className={`category-item ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              <span className="category-name">{cat}</span>
            </div>
          ))}
          <div 
            className="sidebar-setup-btn"
            onClick={() => setShowSettingsModal(true)}
          >
            <Settings size={20} />
            <span className="category-name" style={{fontSize: '0.7rem'}}>Setup</span>
          </div>
        </aside>


        {/* CENTER PANEL: Menu Grid */}
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

          <div className="menu-grid">
            {filteredMenus.map(menu => (
              <div key={menu.id} className="menu-card" onClick={() => addToCart(menu)}>
                <div className="menu-card-image" style={{ overflow: 'hidden' }}>
                  {menu.image_url ? (
                    <img src={menu.image_url} alt={menu.menu_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
                  ) : (
                    <div className="image-placeholder">{menu.menu_name.charAt(0)}</div>
                  )}
                </div>
                
                
                <div className="menu-card-info">
                  <div className="text-[10px] font-bold text-emerald-600 mb-1">{menu.category || 'Lainnya'}</div>
                  <h4 className="menu-name">{menu.menu_name}</h4>
                  <div className="menu-price">{formatPrice(menu.selling_price)}</div>
                  <button className="btn-check-stock" onClick={(e) => { e.stopPropagation(); handleCheckStock(menu); }}>
                    Cek Stok
                  </button>
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
                    <div className="qty-controls">
                      <button className="qty-btn" onClick={() => updateQty(item.id, -1)}><Minus size={14} /></button>
                      <span className="qty-display">{item.qty}</span>
                      <button className="qty-btn" onClick={() => updateQty(item.id, 1)}><Plus size={14} /></button>
                    </div>
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
                <span>{formatPrice(cartSubtotal)}</span>
              </div>
              {activeServiceChargeRate > 0 && (
                <div className="summary-row">
                  <span>Service Charge ({activeServiceChargeRate}%)</span>
                  <span>{formatPrice(cartServiceCharge)}</span>
                </div>
              )}
              {activeTaxRate > 0 && (
                <div className="summary-row">
                  <span>Pajak ({activeTaxRate}%)</span>
                  <span>{formatPrice(cartTax)}</span>
                </div>
              )}
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

      
      {/* HISTORY MODAL */}
      {showHistoryModal && (
        <div className="checkout-modal-overlay">
          <div className="checkout-modal" style={{ maxWidth: '600px' }}>
            <div className="checkout-modal-header">
              <h3>Riwayat Transaksi POS</h3>
              <button className="close-modal-btn" onClick={() => setShowHistoryModal(false)}>✕</button>
            </div>
            
            <div className="checkout-modal-body" style={{ maxHeight: '60vh', overflowY: 'auto', padding: '16px' }}>
              
              <div className="flex gap-2 mb-4 flex-wrap">
                <input 
                  type="text" 
                  placeholder="Cari No Order / Pelanggan..." 
                  value={historySearchTerm}
                  onChange={(e) => setHistorySearchTerm(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-sm flex-1 min-w-[150px]"
                />
                <select 
                  value={historyFilter} 
                  onChange={(e) => setHistoryFilter(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                >
                  <option value="ALL">Semua Pembayaran</option>
                  <option value="CASH">CASH</option>
                  <option value="QRIS">QRIS</option>
                  <option value="DEBIT">DEBIT</option>
                  <option value="TRANSFER">TRANSFER</option>
                </select>
                <div className="flex gap-2">
                  <button onClick={() => exportHistory('day')} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Export 1 Hari</button>
                  <button onClick={() => exportHistory('week')} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Export 1 Minggu</button>
                  <button onClick={() => exportHistory('month')} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Export 1 Bulan</button>
                </div>
              </div>

              {loadingHistory ? (
                <div className="flex justify-center p-8"><Loader2 size={30} className="spin text-emerald-500" /></div>
              ) : filteredHistory.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Belum ada riwayat transaksi hari ini.</p>
              ) : (
                <div className="history-list space-y-4">
                  {filteredHistory.map(order => (
                    <div key={order.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50 flex flex-col">
                      <div className="flex justify-between items-center cursor-pointer" onClick={() => handleViewOrder(order)}>
                        <div>
                          <div className="font-bold text-gray-800 flex items-center gap-2">
                            {order.order_no} 
                            {order.customer_name && <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded text-xs">{order.customer_name}</span>}
                          </div>
                          <div className="text-sm text-gray-500">{new Date(order.created_at).toLocaleString('id-ID')} - {order.payment_method}</div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="font-bold text-emerald-600">{formatPrice(order.total_amount)}</div>
                          <button className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded" onClick={(e) => { e.stopPropagation(); handleViewOrder(order); }}>Detail</button>
                        </div>
                      </div>
                      
                      {selectedOrder?.id === order.id && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          {loadingOrderItems ? (
                            <div className="text-center text-xs text-gray-500">Memuat detail...</div>
                          ) : (
                            <div>
                              <table className="w-full text-xs text-left mb-2">
                                <thead>
                                  <tr className="border-b">
                                    <th className="pb-1">Item</th>
                                    <th className="pb-1 text-center">Qty</th>
                                    <th className="pb-1 text-right">Subtotal</th>
                                  </tr>
                                </thead>
                                
                                <tbody>
                                  {selectedOrderItems.map(item => (
                                    <tr key={item.id} className="border-b border-gray-100 last:border-0">
                                      <td className="py-1">{item.recipes?.menu_name || 'Menu'}</td>
                                      <td className="py-1 text-center">{item.qty}</td>
                                      <td className="py-1 text-right">{formatPrice(item.subtotal)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr>
                                    <td colSpan="2" className="py-1 text-right text-gray-500">Subtotal</td>
                                    <td className="py-1 text-right text-gray-500">{formatPrice(selectedOrderItems.reduce((sum, item) => sum + item.subtotal, 0))}</td>
                                  </tr>
                                  <tr>
                                    <td colSpan="2" className="py-1 text-right text-gray-500">Pajak & Layanan</td>
                                    <td className="py-1 text-right text-gray-500">{formatPrice(order.total_amount - selectedOrderItems.reduce((sum, item) => sum + item.subtotal, 0))}</td>
                                  </tr>
                                  <tr>
                                    <td colSpan="2" className="py-1 text-right font-bold">Total</td>
                                    <td className="py-1 text-right font-bold text-emerald-600">{formatPrice(order.total_amount)}</td>
                                  </tr>
                                </tfoot>

                              </table>
                              <button onClick={() => handlePrintReceipt(order, selectedOrderItems)} className="text-xs bg-gray-800 text-white px-3 py-1.5 rounded flex items-center gap-1">
                                Cetak Resi PDF
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      
      {/* SETTINGS MODAL */}
      {showSettingsModal && (
        <div className="checkout-modal-overlay">
          <div className="checkout-modal" style={{ maxWidth: '400px' }}>
            <div className="checkout-modal-header">
              <h3>Pengaturan POS</h3>
              <button className="close-modal-btn" onClick={() => setShowSettingsModal(false)}>✕</button>
            </div>
            <div className="checkout-modal-body" style={{ padding: '16px' }}>
              <div className="mb-4">
                <label className="block text-sm font-bold text-gray-700 mb-2">Pajak (%)</label>
                <input 
                  type="number" 
                  value={taxRate}
                  onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                  className="w-full border border-gray-300 rounded p-2 focus:outline-none focus:border-emerald-500"
                  min="0"
                  max="100"
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-bold text-gray-700 mb-2">Service Charge (%)</label>
                <input 
                  type="number" 
                  value={serviceCharge}
                  onChange={(e) => setServiceCharge(parseFloat(e.target.value) || 0)}
                  className="w-full border border-gray-300 rounded p-2 focus:outline-none focus:border-emerald-500"
                  min="0"
                  max="100"
                />
              </div>
              <button 
                className={`w-full bg-emerald-600 text-white font-bold py-3 rounded-lg flex justify-center items-center gap-2 ${isSavingSettings ? 'opacity-70' : 'hover:bg-emerald-700'}`}
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
              >
                {isSavingSettings ? <Loader2 size={20} className="spin" /> : <Settings size={20} />}
                {isSavingSettings ? 'Menyimpan...' : 'Simpan Pengaturan'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* NOTIFICATION MODAL */}
      {showNotificationModal && (
        <div className="checkout-modal-overlay">
          <div className="checkout-modal" style={{ maxWidth: '400px' }}>
            <div className="checkout-modal-header">
              <h3>Notifikasi Sistem</h3>
              <button className="close-modal-btn" onClick={() => setShowNotificationModal(false)}>✕</button>
            </div>
            <div className="checkout-modal-body" style={{ maxHeight: '60vh', overflowY: 'auto', padding: '16px' }}>
              {notifications.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Tidak ada notifikasi.</p>
              ) : (
                <div className="space-y-3">
                  {notifications.map((notif, i) => (
                    <div key={i} className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
                      {notif}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STOCK CHECKER MODAL */}
      {showStockCheckModal && (
        <div className="checkout-modal-overlay">
          <div className="checkout-modal" style={{ maxWidth: '600px' }}>
            <div className="checkout-modal-header">
              <h3>{selectedStockMenu ? `Status Stok: ${selectedStockMenu.menu_name}` : 'Cek Ketersediaan Stok'}</h3>
              <button className="close-modal-btn" onClick={() => { setShowStockCheckModal(false); setSelectedStockMenu(null); }}>✕</button>
            </div>
            <div className="checkout-modal-body" style={{ maxHeight: '60vh', overflowY: 'auto', padding: '16px' }}>
              {!selectedStockMenu ? (
                <p className="text-center text-gray-500">Pilih menu dari tombol "Cek Stok" pada kartu menu.</p>
              ) : menuStockStatus.length === 0 ? (
                <p className="text-center text-gray-500">Menu ini tidak memiliki komposisi bahan baku (resep).</p>
              ) : (
                <div className="space-y-4">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="pb-2">Bahan Baku</th>
                        <th className="pb-2 text-right">Dibutuhkan</th>
                        <th className="pb-2 text-right">Tersedia</th>
                        <th className="pb-2 text-center">Status</th>
                        <th className="pb-2 text-right">Koreksi Manual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {menuStockStatus.map((item, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-3">{item.name}</td>
                          <td className="py-3 text-right">{item.needed.toFixed(2)} {item.unit}</td>
                          <td className="py-3 text-right">{item.available.toFixed(2)} {item.unit}</td>
                          <td className="py-3 text-center">
                            {item.isSufficient ? <CheckCircle size={16} className="text-green-500 mx-auto" /> : <XCircle size={16} className="text-red-500 mx-auto" />}
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <input 
                                type="number" 
                                className="border rounded px-2 py-1 w-20 text-right"
                                defaultValue={item.available}
                                id={`stock-input-${item.id}`}
                              />
                              <button 
                                className="bg-emerald-600 text-white px-2 py-1 rounded text-xs"
                                onClick={() => {
                                  const val = document.getElementById(`stock-input-${item.id}`).value;
                                  handleUpdateStockManual(item.id, val);
                                }}
                                disabled={isUpdatingStock}
                              >
                                {isUpdatingStock ? '...' : 'Update'}
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
          </div>
        </div>
      )}


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
              <div className="customer-name-input mb-4">
                <p className="text-sm font-bold text-gray-700 mb-2">Nama Pelanggan / Nomor Meja</p>
                <input 
                  type="text" 
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Opsional"
                  className="w-full border border-gray-300 rounded p-2 focus:outline-none focus:border-emerald-500"
                />
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
