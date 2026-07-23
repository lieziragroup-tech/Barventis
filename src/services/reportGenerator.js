/**
 * Report Generator for Barista/Beverage Reports
 * Generates 13 sheets matching "Pendataan yang ingin dicapai" folder structure
 * Output: individual Excel files, combined Excel, and full PDF
 */

const MONTHS_ID = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// ── Parse ESB Daily Sales Menu Report ──
export function parseSalesReport(workbook, XLSX, categoryFilter = null) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // Find header row (contains "Branch", "Sales Date", "Menu Name")
  let headerIdx = -1;
  for (let i = 0; i < Math.min(raw.length, 20); i++) {
    const row = raw[i].map(c => String(c).toLowerCase().trim());
    if (row.includes('branch') && row.includes('menu name')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) throw new Error('Header row tidak ditemukan di file. Pastikan format ESB Daily Sales Menu Report.');

  const headers = raw[headerIdx].map(h => String(h).toLowerCase().trim());
  const colIdx = {
    branch: headers.indexOf('branch'),
    salesDate: headers.indexOf('sales date'),
    category: headers.indexOf('category'),
    categoryDetail: headers.indexOf('category detail'),
    menuName: headers.indexOf('menu name'),
    menuCode: headers.indexOf('menu code'),
    type: headers.indexOf('type'),
    qty: headers.indexOf('qty'),
    subtotal: headers.indexOf('subtotal'),
    serviceCharge: headers.indexOf('service charge'),
    taxTotal: headers.indexOf('tax total'),
    vatTotal: headers.indexOf('vat total'),
    total: headers.indexOf('total'),
  };

  // Extract metadata from header rows
  const metadata = {};
  for (let i = 0; i < headerIdx; i++) {
    const key = String(raw[i][0] || '').trim();
    const val = String(raw[i][1] || '').trim();
    if (key && val) metadata[key.toLowerCase()] = val;
  }

  // Parse data rows
  const sales = [];
  const categories = new Set();
  for (let i = headerIdx + 1; i < raw.length; i++) {
    const row = raw[i];
    const menuName = String(row[colIdx.menuName] || '').trim();
    if (!menuName) continue; // skip empty/subtotal rows

    const category = String(row[colIdx.category] || '').trim();
    if (!category) continue;
    categories.add(category);

    // Apply category filter
    if (categoryFilter && categoryFilter.length > 0) {
      if (!categoryFilter.includes(category)) continue;
    }

    let salesDate = row[colIdx.salesDate];
    if (salesDate instanceof Date) {
      // already Date
    } else if (typeof salesDate === 'number') {
      // Excel serial date
      salesDate = new Date((salesDate - 25569) * 86400 * 1000);
    } else {
      salesDate = new Date(String(salesDate));
    }

    sales.push({
      branch: String(row[colIdx.branch] || '').trim(),
      salesDate,
      salesDateStr: formatDateStr(salesDate),
      category,
      categoryDetail: String(row[colIdx.categoryDetail] || '').trim(),
      menuName,
      menuCode: String(row[colIdx.menuCode] || '').trim(),
      type: String(row[colIdx.type] || '').trim(),
      qty: Number(row[colIdx.qty]) || 0,
      subtotal: Number(row[colIdx.subtotal]) || 0,
      serviceCharge: Number(row[colIdx.serviceCharge]) || 0,
      taxTotal: Number(row[colIdx.taxTotal]) || 0,
      vatTotal: Number(row[colIdx.vatTotal]) || 0,
      total: Number(row[colIdx.total]) || 0,
    });
  }

  // Detect period from data
  let periodMonth = null, periodYear = null;
  if (sales.length > 0) {
    const d = sales[0].salesDate;
    if (d instanceof Date && !isNaN(d)) {
      periodMonth = d.getMonth() + 1;
      periodYear = d.getFullYear();
    }
  }

  return {
    metadata,
    sales,
    categories: [...categories],
    periodMonth,
    periodYear,
    totalRows: sales.length
  };
}

function formatDateStr(d) {
  if (!(d instanceof Date) || isNaN(d)) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Generate all report sheets ──
export async function generateReports(salesData, dbData, XLSX) {
  const { period } = dbData;
  const daysInMonth = period.lastDay;
  const sheets = {};

  // 1. Penjualan Beverage (ESB)
  sheets['Penjualan Beverage(ESB)'] = buildPenjualanSheet(salesData, period, XLSX);

  // 2. Daily Inventory Barang
  sheets['Daily Iventory Bahan '] = buildDailyInventorySheet(dbData, daysInMonth, XLSX);

  // 3. Daily Inventory Beer
  sheets['Daily Iventory Beer'] = buildDailyInventoryBeerSheet(salesData, dbData, daysInMonth, XLSX);

  // 4. Pemakaian Harian
  sheets['Pemakaian Harian'] = buildPemakaianHarianSheet(salesData, dbData, daysInMonth, XLSX);

  // 5. Pembelian Harian
  sheets['Pembelian Harian'] = buildPembelianHarianSheet(dbData, XLSX);

  // 6. Marketlist
  sheets['MARKETLIST '] = buildMarketlistSheet(dbData, XLSX);

  // 7. Menu Pricing
  sheets['MENU PRICING'] = buildMenuPricingSheet(dbData, XLSX);

  // 8. COGS All Beverages
  sheets['COGS All Beverage '] = buildCOGSSheet(dbData, XLSX);

  // 9. Stock Opname RESTO
  sheets['STOCK OPNAME RESTO'] = buildStockOpnameSheet(dbData, 'RESTO', period, XLSX);

  // 10. Stock Opname CENTRAL
  sheets['STOCK OPNAME CENTRAL'] = buildStockOpnameSheet(dbData, 'CENTRAL', period, XLSX);

  // 11. SO Glass & Tool
  sheets['SO Glass & Tool'] = buildSOGlassToolSheet(dbData, XLSX);

  // 12. Proses Produksi Bahan
  sheets['Proses Produksi Bahan'] = buildProsesProduksiSheet(dbData, XLSX);

  // 13. Cost Control
  sheets['COST CONTROL'] = buildCostControlSheet(salesData, dbData, daysInMonth, period, XLSX);

  return sheets;
}

// ── Build combined workbook ──
export function buildCombinedWorkbook(sheets, XLSX) {
  const wb = XLSX.utils.book_new();
  for (const [name, ws] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, ws, name.substring(0, 31)); // Excel max 31 chars
  }
  return wb;
}

// ── Build individual workbooks ──
export function buildIndividualWorkbooks(sheets, XLSX) {
  const workbooks = {};
  for (const [name, ws] of Object.entries(sheets)) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    workbooks[name] = wb;
  }
  return workbooks;
}

// ── Generate PDF from sheets data ──
export async function generatePDF(salesData, dbData) {
  const { default: jsPDF } = await import('jspdf');
  await import('jspdf-autotable');

  const { period } = dbData;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const monthName = MONTHS_ID[period.month] || '';
  const title = `SO BARISTA ${monthName} ${period.year}`;

  let firstPage = true;
  const addPage = (sectionTitle) => {
    if (!firstPage) doc.addPage();
    firstPage = false;
    doc.setFontSize(14);
    doc.text(title, 14, 15);
    doc.setFontSize(11);
    doc.text(sectionTitle, 14, 22);
    return 28;
  };

  // 1. Penjualan Beverage Summary
  {
    const y = addPage('Penjualan Beverage (ESB)');
    const dailySales = groupSalesByDate(salesData.sales);
    const rows = Object.entries(dailySales).sort().map(([date, items]) => {
      const totalQty = items.reduce((s, i) => s + i.qty, 0);
      const totalAmount = items.reduce((s, i) => s + i.subtotal, 0);
      return [date, totalQty, fmtNum(totalAmount)];
    });
    const grandTotal = salesData.sales.reduce((s, i) => s + i.subtotal, 0);
    rows.push(['TOTAL', salesData.sales.reduce((s, i) => s + i.qty, 0), fmtNum(grandTotal)]);

    doc.autoTable({
      startY: y,
      head: [['Tanggal', 'Total Qty', 'Total Penjualan']],
      body: rows,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] }
    });
  }

  // 2. Marketlist
  {
    const y = addPage('MARKETLIST');
    const rows = dbData.materials.map((m, i) => [
      i + 1, m.name, m.unit, m.full_pack, fmtNum(m.price), fmtNum(m.new_price || 0), m.supplier
    ]);
    doc.autoTable({
      startY: y,
      head: [['No', 'Nama Item', 'Unit', 'Full Pack', 'Price', 'New Price', 'Supplier']],
      body: rows,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [41, 128, 185] }
    });
  }

  // 3. Menu Pricing
  {
    const y = addPage('MENU PRICING');
    const rows = dbData.recipes.map((r, i) => [
      i + 1, r.menu_name, fmtNum(r.basic_cost), `${((r.food_cost_pct || 0) * 100).toFixed(1)}%`,
      fmtNum(r.selling_price), fmtNum(r.selling_price)
    ]);
    doc.autoTable({
      startY: y,
      head: [['No', 'Nama Menu', 'COGS', 'Cost %', 'Selling Price', 'Selling Price (Final)']],
      body: rows,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [41, 128, 185] }
    });
  }

  // 4. Stock Opname RESTO
  {
    const y = addPage('STOCK OPNAME RESTO');
    const items = dbData.opnameResto?.stock_opname_items || [];
    const rows = items.map((item, i) => [
      i + 1, item.materials?.name || '', item.materials?.unit || '',
      fmtNum(item.materials?.price || 0), item.physical_qty ?? item.book_qty ?? 0,
      fmtNum((item.physical_qty ?? item.book_qty ?? 0) * (item.materials?.price || 0))
    ]);
    doc.autoTable({
      startY: y,
      head: [['No', 'Name Of Item', 'Unit', 'Harga', 'Sisa Stok', 'Total Price']],
      body: rows,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [41, 128, 185] }
    });
  }

  // 5. Stock Opname CENTRAL
  {
    const y = addPage('STOCK OPNAME CENTRAL');
    const items = dbData.opnameCentral?.stock_opname_items || [];
    const rows = items.map((item, i) => [
      i + 1, item.materials?.name || '', item.materials?.unit || '',
      fmtNum(item.materials?.price || 0), item.physical_qty ?? item.book_qty ?? 0,
      fmtNum((item.physical_qty ?? item.book_qty ?? 0) * (item.materials?.price || 0))
    ]);
    doc.autoTable({
      startY: y,
      head: [['No', 'Name Of Item', 'Unit', 'Harga', 'Sisa Stok', 'Total Price']],
      body: rows,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [41, 128, 185] }
    });
  }

  // 6. Pembelian Harian
  {
    const y = addPage('Pembelian Harian');
    const rows = dbData.purchases.map(p => [
      p.date, p.materials?.name || '', p.qty, p.unit,
      fmtNum(p.unit_price), p.suppliers?.name || '', fmtNum(p.qty * p.unit_price)
    ]);
    doc.autoTable({
      startY: y,
      head: [['Tanggal', 'Nama Item', 'QTY', 'Unit', 'Harga', 'Supplier', 'Total']],
      body: rows,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [41, 128, 185] }
    });
  }

  // 7. Pemakaian Harian
  {
    const y = addPage('Pemakaian Harian');
    const dailyUsage = computeDailyUsage(salesData, dbData);
    const rows = Object.entries(dailyUsage).sort().map(([date, u]) => [
      date, fmtNum(u.bahan), fmtNum(u.beer), fmtNum(u.bahan + u.beer)
    ]);
    const totals = Object.values(dailyUsage).reduce((s, u) => ({
      bahan: s.bahan + u.bahan, beer: s.beer + u.beer
    }), { bahan: 0, beer: 0 });
    rows.push(['TOTAL', fmtNum(totals.bahan), fmtNum(totals.beer), fmtNum(totals.bahan + totals.beer)]);

    doc.autoTable({
      startY: y,
      head: [['Tanggal', 'Pemakaian Bahan', 'Pemakaian Beer', 'Total Pemakaian']],
      body: rows,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] }
    });
  }

  // 8. COGS Summary
  {
    const y = addPage('COGS ALL BEVERAGES');
    const rows = dbData.recipes.map(r => {
      const ings = r.recipe_ingredients || [];
      const subtotal = ings.reduce((s, ig) => s + (Number(ig.amount) || 0), 0);
      const fixCost = subtotal * 0.05;
      return [
        r.menu_name, r.category, fmtNum(subtotal), fmtNum(fixCost),
        fmtNum(subtotal + fixCost), `${((r.food_cost_pct || 0) * 100).toFixed(1)}%`,
        fmtNum(r.selling_price)
      ];
    });
    doc.autoTable({
      startY: y,
      head: [['Menu', 'Category', 'Subtotal', 'Fix Cost (5%)', 'Basic Cost', 'Food Cost %', 'Selling Price']],
      body: rows,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [41, 128, 185] }
    });
  }

  // 9. Cost Control Summary
  {
    const y = addPage('COST CONTROL');
    const dailySales = groupSalesByDate(salesData.sales);
    const dailyPurchases = {};
    (dbData.purchases || []).forEach(p => {
      const d = p.date;
      dailyPurchases[d] = (dailyPurchases[d] || 0) + (p.qty * p.unit_price);
    });
    const allDates = new Set([...Object.keys(dailySales), ...Object.keys(dailyPurchases)]);
    const rows = [...allDates].sort().map(date => {
      const purchaseAmt = dailyPurchases[date] || 0;
      const salesAmt = (dailySales[date] || []).reduce((s, i) => s + i.subtotal, 0);
      const pct = salesAmt > 0 ? (purchaseAmt / salesAmt * 100).toFixed(2) + '%' : '-';
      return [date, fmtNum(purchaseAmt), fmtNum(salesAmt), pct];
    });
    doc.autoTable({
      startY: y,
      head: [['Tanggal', 'Pembelian Harian', 'Total Penjualan Beverage', 'Presentase %']],
      body: rows,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] }
    });
  }

  // 10. SO Glass & Tool
  {
    const y = addPage('SO Glass & Tool');
    // ponytail: placeholder — glass & tool data is manual, not in DB
    doc.setFontSize(9);
    doc.text('Data SO Glass & Tool diambil dari input manual.', 14, y + 5);
    doc.text('Lengkapi data aset dan gelas melalui halaman Stock Opname.', 14, y + 11);
  }

  // 11. Proses Produksi Bahan
  {
    const y = addPage('Proses Produksi Bahan');
    doc.setFontSize(9);
    doc.text('Data Proses Produksi Bahan berisi cutting portion dan produksi bahan.', 14, y + 5);
    doc.text('Data ini diambil dari recipe ingredients yang sudah terdaftar di sistem.', 14, y + 11);

    const rows = dbData.recipes.slice(0, 50).map(r => {
      const ings = r.recipe_ingredients || [];
      const ingList = ings.map(ig => `${ig.materials?.name || '?'} ${ig.qty_in_use}${ig.unit}`).join(', ');
      return [r.menu_name, ingList, fmtNum(r.basic_cost)];
    });
    doc.autoTable({
      startY: y + 16,
      head: [['Menu', 'Bahan (Qty)', 'Basic Cost']],
      body: rows,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [41, 128, 185] }
    });
  }

  // 12. Daily Inventory Barang summary
  {
    const y = addPage('Daily Inventory Barang');
    const invDays = dbData.dailyInventories.length;
    doc.setFontSize(9);
    doc.text(`Data Daily Inventory: ${invDays} hari tercatat dari ${dbData.period.lastDay} hari.`, 14, y + 5);
    if (invDays > 0) {
      const firstInv = dbData.dailyInventories[0];
      const items = firstInv.daily_inventory_items || [];
      const rows = items.slice(0, 40).map((it, i) => [
        i + 1, it.materials?.name || '', it.materials?.unit || '',
        it.in_qty || 0, it.out_qty || 0, it.full_qty || 0,
        it.broken_qty || 0, it.waste_qty || 0, it.terpakai_qty || 0
      ]);
      doc.autoTable({
        startY: y + 10,
        head: [['No', 'Item', 'Unit', 'IN', 'OUT', 'FULL', 'BROKEN', 'WASTE', 'TERPAKAI']],
        body: rows,
        styles: { fontSize: 7 },
        headStyles: { fillColor: [41, 128, 185] }
      });
    }
  }

  // 13. Daily Inventory Beer
  {
    const y = addPage('Daily Inventory Beer');
    const beerSales = salesData.sales.filter(s =>
      s.categoryDetail?.toLowerCase().includes('bir') ||
      s.categoryDetail?.toLowerCase().includes('alkohol') ||
      s.categoryDetail?.toLowerCase().includes('beer')
    );
    const beerByName = {};
    beerSales.forEach(s => {
      if (!beerByName[s.menuName]) beerByName[s.menuName] = { total: 0, totalAmt: 0 };
      beerByName[s.menuName].total += s.qty;
      beerByName[s.menuName].totalAmt += s.subtotal;
    });
    const rows = Object.entries(beerByName).map(([name, d], i) => [
      i + 1, name, d.total, fmtNum(d.totalAmt)
    ]);
    doc.autoTable({
      startY: y,
      head: [['No', 'Nama Beer', 'Total Qty', 'Total Penjualan']],
      body: rows,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] }
    });
  }

  return doc;
}

// ── Download helpers ──
export async function downloadAsZip(workbooks, XLSX) {
  const JSZip = (await import('jszip')).default;
  const { saveAs } = await import('file-saver');
  const zip = new JSZip();

  for (const [name, wb] of Object.entries(workbooks)) {
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    zip.file(`${name}.xlsx`, buf);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, 'Barista_Report_Files.zip');
}

export function downloadWorkbook(wb, filename, XLSX) {
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadPDF(doc, filename) {
  doc.save(filename);
}

// ═══════════════════════════════════════════════════
// Sheet builders
// ═══════════════════════════════════════════════════

function buildPenjualanSheet(salesData, period, XLSX) {
  const rows = [];
  // Header metadata
  rows.push(['Daily Sales Menu Report']);
  rows.push(['Generated', new Date().toLocaleString('id-ID')]);
  rows.push(['Period', `${period.startDate} - ${period.endDate}`]);
  rows.push(['']);
  rows.push(['Branch', 'Sales Date', 'Sales Type', 'Category', 'Category Detail', 'Menu Name', 'Menu Code', 'Type', 'Qty', 'Subtotal', 'Service Charge', 'Tax Total', 'VAT Total', 'Total']);

  // Group by date with subtotals
  const byDate = groupSalesByDate(salesData.sales);
  for (const date of Object.keys(byDate).sort()) {
    const items = byDate[date];
    for (const s of items) {
      rows.push([s.branch, s.salesDateStr, 'Sales', s.category, s.categoryDetail, s.menuName, s.menuCode, s.type, s.qty, s.subtotal, s.serviceCharge, s.taxTotal, s.vatTotal, s.total]);
    }
    // Daily subtotal
    const dQty = items.reduce((s, i) => s + i.qty, 0);
    const dSub = items.reduce((s, i) => s + i.subtotal, 0);
    rows.push(['', '', '', '', '', '', '', '', dQty, dSub, '', '', '', '']);
  }

  return XLSX.utils.aoa_to_sheet(rows);
}

function buildDailyInventorySheet(dbData, daysInMonth, XLSX) {
  const rows = [];
  // Build header spanning all days
  const dateHeaders = ['DATE', '', '', ''];
  const subHeaders = ['No.', 'ITEM', ' QTY', 'PRICE'];
  for (let d = 1; d <= Math.min(daysInMonth, 3); d++) {
    dateHeaders.push(d, '', '', '', '', '', '');
    subHeaders.push('IN', 'OUT', 'FULL', 'BROKEN', 'WASTE', 'TERPAKAI', 'PRICE');
  }
  dateHeaders.push('Total Pakai');
  subHeaders.push('');

  rows.push(dateHeaders);
  rows.push(subHeaders);

  // Get unique materials from daily inventories
  const invByDate = {};
  (dbData.dailyInventories || []).forEach(inv => {
    const day = new Date(inv.date).getDate();
    invByDate[day] = inv.daily_inventory_items || [];
  });

  // Get all material names across all days
  const allMats = {};
  Object.values(invByDate).forEach(items => {
    items.forEach(it => {
      const name = it.materials?.name || `Material #${it.material_id}`;
      if (!allMats[name]) allMats[name] = { unit: it.materials?.unit || '', price: it.materials?.price || 0, category: it.materials?.category || '' };
    });
  });

  // Also add materials from DB
  (dbData.materials || []).forEach(m => {
    if (!allMats[m.name]) allMats[m.name] = { unit: m.unit, price: m.price, category: m.category };
  });

  // Group by category
  const byCategory = {};
  Object.entries(allMats).forEach(([name, info]) => {
    const cat = info.category || 'Lainnya';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push({ name, ...info });
  });

  let num = 0;
  for (const [cat, items] of Object.entries(byCategory)) {
    rows.push(['', cat]);
    for (const mat of items) {
      num++;
      const row = [num, mat.name, mat.unit, mat.price];
      let totalPakai = 0;
      for (let d = 1; d <= Math.min(daysInMonth, 3); d++) {
        const dayItems = invByDate[d] || [];
        const item = dayItems.find(di => (di.materials?.name || '') === mat.name);
        if (item) {
          const terpakai = item.terpakai_qty || 0;
          const price = terpakai * mat.price;
          row.push(item.in_qty || '', item.out_qty || '', item.full_qty || '', item.broken_qty || '', item.waste_qty || '', terpakai, price);
          totalPakai += terpakai;
        } else {
          row.push('', '', '', '', '', 0, 0);
        }
      }
      row.push(totalPakai);
      rows.push(row);
    }
  }

  return XLSX.utils.aoa_to_sheet(rows);
}

function buildDailyInventoryBeerSheet(salesData, dbData, daysInMonth, XLSX) {
  const rows = [];

  // Get beer sales grouped by menu and day
  const beerSales = salesData.sales.filter(s =>
    s.categoryDetail?.toLowerCase().includes('bir') ||
    s.categoryDetail?.toLowerCase().includes('alkohol') ||
    s.categoryDetail?.toLowerCase().includes('beer')
  );

  const beerMenus = {};
  beerSales.forEach(s => {
    if (!beerMenus[s.menuName]) beerMenus[s.menuName] = { price: 0 };
    if (s.qty > 0) beerMenus[s.menuName].price = Math.round(s.subtotal / s.qty);
  });

  // Also check materials for beer prices
  (dbData.materials || []).forEach(m => {
    const lower = m.name.toLowerCase();
    if (lower.includes('bintang') || lower.includes('heineken') || lower.includes('bali hai') ||
        lower.includes('prost') || lower.includes('konig') || lower.includes('kaltenberg') ||
        lower.includes('iceland') || lower.includes('beer') || lower.includes('bir')) {
      if (!beerMenus[m.name]) beerMenus[m.name] = { price: m.price };
    }
  });

  // Header
  const header1 = ['No.', 'Nama Barang', 'Harga', '', ''];
  for (let d = 1; d <= daysInMonth; d++) {
    header1.push(d, 'Total');
  }
  header1.push('TOTAL JUMLAH 1 BULAN', '', 'TOTAL PENJUALAN 1 BULAN');
  rows.push(header1);

  // Data rows
  let no = 0;
  for (const [name, info] of Object.entries(beerMenus)) {
    no++;
    const row = [no, name, info.price, '', ''];
    let totalQty = 0;
    let totalVal = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const daySales = beerSales.filter(s => s.salesDate.getDate() === d && s.menuName === name);
      const qty = daySales.reduce((s, i) => s + i.qty, 0);
      const val = qty * info.price;
      row.push(qty || '', val || 0);
      totalQty += qty;
      totalVal += val;
    }
    row.push(totalQty, '', totalVal);
    rows.push(row);
  }

  // Total row
  const totalRow = ['', '', '', '', ''];
  let grandQty = 0, grandVal = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dayQty = beerSales.filter(s => s.salesDate.getDate() === d).reduce((s, i) => s + i.qty, 0);
    const dayVal = beerSales.filter(s => s.salesDate.getDate() === d).reduce((s, i) => s + i.subtotal, 0);
    totalRow.push(dayQty, dayVal);
    grandQty += dayQty;
    grandVal += dayVal;
  }
  totalRow.push('Total Pemakaian beer', '', 'Harga Pemakaian beer');
  rows.push(totalRow);
  rows.push(['', '', '', ' ', '', ...Array(daysInMonth * 2).fill(''), grandQty, '', grandVal]);

  return XLSX.utils.aoa_to_sheet(rows);
}

function buildPemakaianHarianSheet(salesData, dbData, daysInMonth, XLSX) {
  const rows = [];
  rows.push(['', 'Data Harga Pemakaian Bahan Beverage ']);
  rows.push(['']);
  rows.push(['', 'Tanggal', 'Pemakaian Bahan', 'Pemakaian Beer', 'Total Pemakaian']);

  const dailyUsage = computeDailyUsage(salesData, dbData);
  let totalBahan = 0, totalBeer = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${dbData.period.year}-${String(dbData.period.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const u = dailyUsage[dateStr] || { bahan: 0, beer: 0 };
    rows.push(['', dateStr, u.bahan, u.beer, u.bahan + u.beer]);
    totalBahan += u.bahan;
    totalBeer += u.beer;
  }

  rows.push(['', '', 'Total Pemakaian 1 bulan =', '', totalBahan + totalBeer]);

  return XLSX.utils.aoa_to_sheet(rows);
}

function buildPembelianHarianSheet(dbData, XLSX) {
  const rows = [];
  rows.push(['Daftar Pembelian Harian', '', '', '', '', '', '', '', 'Daftar Pembelian Bahan Stock Dalam Satu bulan']);
  rows.push(['TANGGAL', 'NAMA ITEM', 'QTY', 'Unit', 'HARGA/KG', 'SUPPLIER', 'TOTAL', '', 'TANGGAL', 'NAMA ITEM', 'QTY', 'Unit', 'HARGA/KG', 'SUPPLIER', 'Total']);

  // Group purchases by date for left section
  const byDate = {};
  (dbData.purchases || []).forEach(p => {
    if (!byDate[p.date]) byDate[p.date] = [];
    byDate[p.date].push(p);
  });

  // Group by supplier for right section
  const bySupplier = {};
  (dbData.purchases || []).forEach(p => {
    const supplier = p.suppliers?.name || 'Unknown';
    if (!bySupplier[supplier]) bySupplier[supplier] = [];
    bySupplier[supplier].push(p);
  });

  // Left section
  let totalPembelian = 0;
  let totalPendapatan = 0; // will compute from sales

  for (const [date, purchases] of Object.entries(byDate).sort()) {
    let isFirst = true;
    for (const p of purchases) {
      const total = p.qty * p.unit_price;
      totalPembelian += total;
      rows.push([
        isFirst ? date : '',
        p.materials?.name || '', p.qty, p.unit,
        p.unit_price, p.suppliers?.name || '', total
      ]);
      isFirst = false;
    }
  }

  rows.push(['', '', '', '', 'Pembelian', totalPembelian]);

  return XLSX.utils.aoa_to_sheet(rows);
}

function buildMarketlistSheet(dbData, XLSX) {
  const rows = [];
  rows.push(['']);
  rows.push(['', 'PERISHABLE']);
  rows.push(['']);
  rows.push(['NO', 'NAMA ITEM', 'KUANTITI', 'UNIT', 'Full', 'Price', 'NEW Price', 'SUPPLIER']);
  rows.push(['']);

  const byCategory = {};
  (dbData.materials || []).forEach(m => {
    const cat = m.category || 'Lainnya';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(m);
  });

  for (const [cat, items] of Object.entries(byCategory)) {
    rows.push(['', cat]);
    for (const m of items) {
      rows.push(['', m.name, 1, m.unit, m.full_pack, m.price, m.new_price || '', m.supplier]);
    }
    rows.push(['']);
  }

  return XLSX.utils.aoa_to_sheet(rows);
}

function buildMenuPricingSheet(dbData, XLSX) {
  const rows = [];
  rows.push(['']);
  rows.push(['MENU PRICING']);
  rows.push(['']);
  rows.push(['NO', 'NAMA MENU', 'COGS', 'COST PRECENTAGE (%)', 'SELLING PRICE', 'SELLING PRICE (FINAL)']);
  rows.push(['']);

  const byCategory = {};
  (dbData.recipes || []).forEach(r => {
    const cat = r.category || 'Lainnya';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(r);
  });

  let no = 0;
  for (const [cat, recipes] of Object.entries(byCategory)) {
    rows.push(['', `Menu ${cat}`]);
    for (const r of recipes) {
      no++;
      rows.push([no, r.menu_name, r.basic_cost || '', r.food_cost_pct || 0, r.selling_price || '', r.selling_price || '']);
    }
  }

  return XLSX.utils.aoa_to_sheet(rows);
}

function buildCOGSSheet(dbData, XLSX) {
  const rows = [];
  rows.push(['']);

  // Build COGS cards for each recipe (6 per row like the template)
  const recipes = dbData.recipes || [];
  const COLS_PER_RECIPE = 6;
  const perRow = 6; // 6 recipes per horizontal group

  for (let batch = 0; batch < recipes.length; batch += perRow) {
    const chunk = recipes.slice(batch, batch + perRow);

    // Category headers
    const catRow = [];
    chunk.forEach((r, i) => {
      catRow.push(`FORM COGS ${(r.category || '').toUpperCase()}`);
      for (let j = 1; j < COLS_PER_RECIPE; j++) catRow.push('');
    });
    rows.push(catRow);
    rows.push([]); // spacer

    // Menu name row
    const nameRow = [];
    chunk.forEach(r => {
      nameRow.push(r.menu_name);
      for (let j = 1; j < COLS_PER_RECIPE; j++) nameRow.push('');
    });
    rows.push(nameRow);

    // Total Cost Price row
    const costRow = [];
    chunk.forEach(r => {
      costRow.push('Total Cost Price :');
      costRow.push(r.basic_cost || 0);
      costRow.push('');
      costRow.push('Yield :');
      costRow.push('');
      costRow.push('');
    });
    rows.push(costRow);

    // Column headers
    const ingHead = [];
    chunk.forEach(() => {
      ingHead.push('Item', 'Qty in Use', 'Unit', 'Unit Price', 'Amount', '');
    });
    rows.push(ingHead);

    // Ingredient rows — find max ingredients
    const maxIngs = Math.max(...chunk.map(r => (r.recipe_ingredients || []).length), 1);
    for (let ig = 0; ig < maxIngs; ig++) {
      const ingRow = [];
      chunk.forEach(r => {
        const ings = r.recipe_ingredients || [];
        if (ig < ings.length) {
          const ing = ings[ig];
          ingRow.push(ing.materials?.name || '', ing.qty_in_use, ing.unit, ing.unit_price, ing.amount, '');
        } else {
          ingRow.push('', '', '', '', '', '');
        }
      });
      rows.push(ingRow);
    }

    // Subtotal, Fix Cost, Basic Cost, Food Cost, Selling Price
    const subtotalRow = [], fixRow = [], basicRow = [], fcRow = [], spRow = [];
    chunk.forEach(r => {
      const ings = r.recipe_ingredients || [];
      const sub = ings.reduce((s, i) => s + (Number(i.amount) || 0), 0);
      const fix = sub * 0.05;
      subtotalRow.push('', '', 'Subtotal', '', sub, '');
      fixRow.push('', '', 'Fix Cost', 0.05, fix, '');
      basicRow.push('', '', 'Basic Cost', '', sub + fix, '');
      fcRow.push('', '', 'Food Cost', r.food_cost_pct || 0, r.selling_price || '', '');
      spRow.push('', '', 'Selling Price', '', r.selling_price || '', '');
    });
    rows.push(subtotalRow);
    rows.push(fixRow);
    rows.push(basicRow);
    rows.push(fcRow);
    rows.push(spRow);
    rows.push([]); // spacer between batches
  }

  return XLSX.utils.aoa_to_sheet(rows);
}

function buildStockOpnameSheet(dbData, location, period, XLSX) {
  const rows = [];
  rows.push(['UMATIS RESTO AND VENUE']);
  rows.push(['BSD CITY, KAVLING TAMAN KOTA BARAT LOT No.II.6, SAMPORA, KEC.CISAUK, KABUPATEN TANGERANG, BANTEN 15345']);
  rows.push(['08197888123']);
  rows.push([`Stock Opname ${MONTHS_ID[period.month]} ${period.year}`, '', location]);
  rows.push(['No', 'Name Of Item', 'Unit', 'Harga', 'Sisa Stok', 'Total Price']);

  const opname = location === 'RESTO' ? dbData.opnameResto : dbData.opnameCentral;
  const items = opname?.stock_opname_items || [];

  // Group by category
  const byCategory = {};
  items.forEach(item => {
    const cat = item.materials?.category || 'Lainnya';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  });

  let no = 0;
  let grandTotal = 0;
  for (const [cat, catItems] of Object.entries(byCategory)) {
    rows.push(['', cat, '', '', '', 0]);
    for (const item of catItems) {
      no++;
      const qty = item.physical_qty ?? item.book_qty ?? 0;
      const price = item.materials?.price || 0;
      const total = qty * price;
      grandTotal += total;
      rows.push([no, item.materials?.name || '', item.materials?.unit || '', price, qty, total]);
    }
  }

  rows.push(['', '', '', '', 'TOTAL', grandTotal]);

  return XLSX.utils.aoa_to_sheet(rows);
}

function buildSOGlassToolSheet(dbData, XLSX) {
  const rows = [];
  rows.push(['']);
  rows.push(['']);
  rows.push(['', '             BERITA ACARA STOCK OPNAME BULANAN TEAM BARISTA']);
  rows.push(['']);
  rows.push(['No.', 'Nama Barang ', 'Qnty', 'Stock Awal', 'Stock akhir ', 'Adjusment Kuantitas Fisik', '', '', 'Selisih tidak ']);
  rows.push(['', '', '', '', '', '( + )', '( - )', 'Keterangan', 'Teridentifikasi']);

  // ponytail: Glass & Tool data is manual — populate from materials with tool-like categories
  const toolMats = (dbData.materials || []).filter(m => {
    const cat = (m.category || '').toLowerCase();
    return cat.includes('gelas') || cat.includes('tool') || cat.includes('aset') || cat.includes('alat') || cat.includes('glass');
  });

  rows.push(['', 'Aset Barista']);
  rows.push(['']);

  toolMats.forEach((m, i) => {
    rows.push([i + 1, m.name, m.unit, m.qty_resto || '', '', '', '', '', '']);
  });

  if (toolMats.length === 0) {
    // Placeholder
    rows.push(['', '(Data aset & gelas belum tersedia di database - input manual)']);
  }

  return XLSX.utils.aoa_to_sheet(rows);
}

function buildProsesProduksiSheet(dbData, XLSX) {
  const rows = [];
  rows.push(['Cutting Portion', '', '', '', '', '', '', '', '', 'Produksi Bahan']);
  rows.push(['']);
  rows.push(['TANGGAL/BULAN', 'NAMA ITEM', 'Qnty', 'Berat Awal ', 'Tripping', 'Berat Bersih', 'qty recipe', 'Portion', '', 'Nama Manu', 'QTY RECIPE', 'YIELD ', 'PORTION', 'Harga']);

  // Build from recipes
  const recipes = dbData.recipes || [];
  for (const r of recipes) {
    const ings = r.recipe_ingredients || [];
    if (ings.length === 0) continue;

    rows.push(['', '', '', '', '', '', '', '', '', `Produksi ${r.menu_name}`]);
    for (const ig of ings) {
      rows.push(['', '', '', '', '', '', '', '', '',
        r.menu_name, `${ig.materials?.name || ''} = ${ig.qty_in_use} ${ig.unit}`,
        '', '1 Porsi', r.basic_cost || ''
      ]);
    }
    rows.push([]); // spacer
  }

  return XLSX.utils.aoa_to_sheet(rows);
}

function buildCostControlSheet(salesData, dbData, daysInMonth, period, XLSX) {
  const rows = [];
  rows.push(['']);

  // Date header row
  const dateRow = ['Tanggal :'];
  for (let d = 1; d <= daysInMonth; d++) {
    dateRow.push(`${period.year}-${String(period.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  dateRow.push('Online Purchase', 'Jumlah 1 Bulan');
  rows.push(dateRow);

  // Pembelian Harian row
  const purchaseRow = ['Pembelian Harian '];
  let totalPurchase = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${period.year}-${String(period.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayPurchases = (dbData.purchases || []).filter(p => p.date === dateStr);
    const dayTotal = dayPurchases.reduce((s, p) => s + (p.qty * p.unit_price), 0);
    purchaseRow.push(dayTotal);
    totalPurchase += dayTotal;
  }
  purchaseRow.push(0, totalPurchase);
  rows.push(purchaseRow);

  // Total Penjualan Beverage row
  const salesRow = ['Total penjualan Beverage'];
  let totalSales = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const daySales = salesData.sales.filter(s => s.salesDate.getDate() === d);
    const dayTotal = daySales.reduce((s, i) => s + i.subtotal, 0);
    salesRow.push(dayTotal);
    totalSales += dayTotal;
  }
  salesRow.push('', totalSales);
  rows.push(salesRow);

  // Presentase row
  const pctRow = ['Presentase %'];
  for (let d = 1; d <= daysInMonth; d++) {
    const purch = purchaseRow[d];
    const sale = salesRow[d];
    pctRow.push(sale > 0 ? purch / sale : 0);
  }
  pctRow.push('', totalSales > 0 ? totalPurchase / totalSales : 0);
  rows.push(pctRow);

  // Summary section
  rows.push([]);
  rows.push([]);
  rows.push([]);
  rows.push([]);

  // Stock Opname values
  const prevRestoVal = computeOpnameValue(dbData.prevOpnameResto);
  const prevCentralVal = computeOpnameValue(dbData.prevOpnameCentral);
  const curRestoVal = computeOpnameValue(dbData.opnameResto);
  const curCentralVal = computeOpnameValue(dbData.opnameCentral);

  const prevMonthName = MONTHS_ID[period.month === 1 ? 12 : period.month - 1];
  const curMonthName = MONTHS_ID[period.month];

  rows.push(['PERIODE ', '', '', '', '', '', `Stock Opname  Resto ${prevMonthName} ${period.month === 1 ? period.year - 1 : period.year}`, '', '', prevRestoVal, prevRestoVal + prevCentralVal, prevRestoVal + prevCentralVal + totalPurchase]);
  rows.push(['Pemakaian Bulan ', '', '', '', '', '', `Stock Opname Central ${prevMonthName} ${period.month === 1 ? period.year - 1 : period.year}`, '', '', prevCentralVal]);
  rows.push(['', '', '', '', '', '', 'Pembelian harian + Online', '', '', totalPurchase]);
  rows.push(['Penjualan Bulan', totalSales, '', '', '', '', `Stock Opname  Resto 31 ${curMonthName.toLowerCase()} ${period.year}`, '', '', curRestoVal, curRestoVal + curCentralVal]);
  rows.push(['', '', '', '', '', '', `Stock Opname Central 31 ${curMonthName.toLowerCase()} ${period.year}`, '', '', curCentralVal]);

  // Compute pemakaian bulan = (opening stock + purchases) - closing stock
  const openingStock = prevRestoVal + prevCentralVal;
  const closingStock = curRestoVal + curCentralVal;
  const pemakaianBulan = openingStock + totalPurchase - closingStock;

  rows.push([]);
  rows.push(['PEMAKAIAN BULAN  / PENJUALAN BULAN ']);
  rows.push([]);
  rows.push(['Presentase %', totalSales > 0 ? pemakaianBulan / totalSales : 0]);
  rows.push(['Presentase Bar (Beverage) Aman Dibawah Angka 27%']);

  return XLSX.utils.aoa_to_sheet(rows);
}

// ═══════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════

function groupSalesByDate(sales) {
  const byDate = {};
  sales.forEach(s => {
    const key = s.salesDateStr;
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(s);
  });
  return byDate;
}

function computeDailyUsage(salesData, dbData) {
  const result = {};

  // From daily inventory items: sum terpakai * price per day
  (dbData.dailyInventories || []).forEach(inv => {
    const dateStr = inv.date;
    if (!result[dateStr]) result[dateStr] = { bahan: 0, beer: 0 };
    (inv.daily_inventory_items || []).forEach(item => {
      const terpakai = Number(item.terpakai_qty) || 0;
      const price = Number(item.materials?.price) || 0;
      const cat = (item.materials?.category || '').toLowerCase();
      const isBeer = cat.includes('beer') || cat.includes('bir') || cat.includes('alkohol');
      if (isBeer) {
        result[dateStr].beer += terpakai * price;
      } else {
        result[dateStr].bahan += terpakai * price;
      }
    });
  });

  // Fallback: if no daily inventory, estimate from sales + recipe costs
  if (Object.keys(result).length === 0) {
    const recipeMap = {};
    (dbData.recipes || []).forEach(r => { recipeMap[r.menu_name] = r; });

    salesData.sales.forEach(s => {
      if (!result[s.salesDateStr]) result[s.salesDateStr] = { bahan: 0, beer: 0 };
      const recipe = recipeMap[s.menuName];
      const cost = recipe ? (recipe.basic_cost || 0) * s.qty : 0;
      const isBeer = s.categoryDetail?.toLowerCase().includes('bir') ||
                     s.categoryDetail?.toLowerCase().includes('beer') ||
                     s.categoryDetail?.toLowerCase().includes('alkohol');
      if (isBeer) {
        result[s.salesDateStr].beer += cost;
      } else {
        result[s.salesDateStr].bahan += cost;
      }
    });
  }

  return result;
}

function computeOpnameValue(opname) {
  if (!opname?.stock_opname_items) return 0;
  return opname.stock_opname_items.reduce((sum, item) => {
    const qty = item.physical_qty ?? item.book_qty ?? 0;
    const price = item.materials?.price || 0;
    return sum + qty * price;
  }, 0);
}

function fmtNum(n) {
  if (typeof n !== 'number' || isNaN(n)) return 0;
  return Math.round(n);
}
