Lonjakan ekstrem Food Cost pada screenshot terbaru (**Black berries coffee mocktail** menjadi **Rp 1.847.249 / 4861.2%** dan **Avocado Coffee** menjadi **Rp 3.201.240 / 8424.3%**) serta angka **Stock Converted** yang mencapai jutaan di **Buku Stok (Stock Ledger)** disebabkan oleh **benturan antara perubahan fungsi getPackUnitInfo() di costUtils.js dengan data Pack Unit (unit) di database yang terisi "gr" sedangkan Full Pack Size (full\_pack) terisi "1000 ml"**.  
Berikut adalah analisis forensik beserta pembuktian perhitungannya oleh **Ayling** dan **Izumi**, dibandingkan langsung terhadap file Excel **SO BARISTA AGUSTUS 2026 (1) (1).xlsx**.

### **1\. Pembuktian Matematika: Mengapa Angka HPP Meledak di Screenshot Terbaru?**

Pada file Barventis-main (1).zip, fungsi getPackUnitInfo(fullPack, materialUnit) di src/services/costUtils.js:135-142 diubah menjadi:

JavaScript  
const match \= legacy.match(/(\[\\d.\]+)\\s\*(gr\|grm\|gram\|grams\|kg\|ml\|l\|ltr\|liter\|litre\|pcs\|pck\|can\|btl)\\b/i);  
if (match) {  
  return {  
    packUnitLabel: normalizeUnitToken(materialUnit), // menjadi 'gr'  
    contentUnit: normalizeUnitToken(match\[2\])        // menjadi 'ml'  
  };  
}

Akibat perubahan tersebut, ketika sebuah bahan di database memiliki **unit \= "gr"** dan **full\_pack \= "1000 ml"** (terlihat pada kolom PACK INFO: 1000 ml / GR di screenshot), fungsi calculateIngredientCost() (src/services/costUtils.js:209-211) menjalankan logika berikut:

JavaScript  
if (packUnitLabel && contentUnit && ru && ru \=== packUnitLabel && ru \!== contentUnit) {  
  qty \= qty \* (packSize \|\| 1);  
}

Karena satuan di resep (ru \= "gr") sama dengan packUnitLabel ("gr") dan berbeda dari contentUnit ("ml"), **sistem mengira "gr" adalah satuan kardus/kemasan besar (seperti "Carton") lalu mengalikan kuantitas resep dengan packSize (1000)\!**

#### **A. Bukti Hitungan Black berries coffee mocktail (image\_5d5e38.png)**

Harga Jual: **Rp 38.000** \| Fix Cost: **5%**

| Bahan Baku | Qty & Satuan Resep | Data Master di App (PACK INFO & Harga) | Hitungan Sistem Saat Ini (Bug costUtils.js) | Nilai di Excel (COGS All Beverage Col Y) | Pembagi (Full Pack) Asli di Excel |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **Strawberry Fruit** | 1 gr *(Excel: 1 pcs)* | 500 gr / GR @ Rp 12.000 | $1\times \frac{12.000}{500}=$ **Rp 24** | **Rp 300** | Di Excel 1 pcs dari 40 pcs/pack ($\frac{12.000}{40}=300$) atau 12,5 gr dari 500 gr |
| **Mix Berries Fruit Pulp** | 20 gr *(Excel: 20 ml)* | pck \= 220 gr / PCK @ Rp 166.500 | $20\times \frac{166.500}{220}=$ **Rp 15.136** *(Salah isi 220 gr)* | **Rp 4.381** | Di Excel dibagi **760 ml** ($20\times \frac{166.500}{760}=4.381,5$). Di *Marketlist* R67: 1030 grm (Rp 3.233) |
| **Strawberry syrup** | 10 gr *(Excel: 10 ml)* | 1000 ml / GR @ Rp 111.000 | $10\times 1000\times \frac{111.000}{1000}=$ **Rp 1.110.000** *(Bug 1000x)* | **Rp 1.460** *(Mocktail)* / **Rp 1.110** *(Non-Kopi)* | Di *Marketlist* R81: 750 ml (di COGS Mocktail dibagi **760 ml** \= Rp 1.460; di Non-Kopi dibagi **1000 ml** \= Rp 1.110) |
| **Peach syrup** | 10 ml | 1000 ml / ML @ Rp 111.000 | $10\times \frac{111.000}{1000}=$ **Rp 1.110** *(Normal karena unit sama-sama ML)* | **Rp 1.460** | Di *Marketlist* R68: 750 ml (di COGS Mocktail dibagi **760 ml** \= Rp 1.460; jika dibagi **1000 ml** \= Rp 1.110) |
| **Soda Water** | 90 gr | 1000 ml / GR @ Rp 7.000 | $90\times 1000\times \frac{7.000}{1000}=$ **Rp 630.000** *(Bug 1000x)* | **Rp 700** | Di Sheet Proses Produksi Bahan: 1 Charger CO2 (Rp 7.000) menghasilkan **900 gr** Soda Water ($90\times \frac{7.000}{900}=700$) |
| **Espresso** | 20 gr | 2000 gr / GR @ Rp 220.000 | $20\times \frac{220.000}{2000}=$ **Rp 2.200** | **Rp 2.200** | **2000 gr** yield cair (dari 1000 gr biji kopi @ Rp 220.000) |
| **Es Batu Kristal** | 150 gr | 10000 gr / GR @ Rp 21.000 | $150\times \frac{21.000}{10000}=$ **Rp 315** | **Rp 620** *(atau Rp 636\)* | Di *Marketlist* R91: 5000 grm @ Rp 18.000 (atau Rp 21.000 / 5000 gr \= **Rp 630**) |
| **Strawberry Love & Mint** | 1 pcs | 1 pcs / PCS @ Rp 500 | $1\times \frac{500}{1}=$ **Rp 500** | **Rp 500** | **1 pcs** @ Rp 500 |
| **Subtotal Bahan** |  |  | **Rp 1.759.285** | **Rp 11.621** | *(Jika pakai basis 1000 ml sirup & 5000 gr es: **Rp 10.625**)* |
| **Fix Cost (5%)** |  |  | **Rp 87.964** | **Rp 581,05** | **Rp 531** |
| **HPP (Basic Cost)** |  |  | **Rp 1.847.249 (FC 4861.2%)** | **Rp 12.202,05 (FC 32.1%)** | **Rp 11.156 (FC 29.4%)** |

#### **B. Bukti Hitungan Avocado Coffee (image\_5d5e56.png)**

Harga Jual: **Rp 38.000** \| Fix Cost: **5%**

| Bahan Baku | Qty & Satuan Resep | Data Master di App (PACK INFO & Harga) | Hitungan Sistem Saat Ini (Bug costUtils.js) | Nilai di Excel (COGS All Beverage Col A R107) | Penjelasan Rekonsiliasi Excel vs App |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **Espresso** | 20 gr | 2000 gr / GR @ Rp 220.000 | **Rp 2.200** | **Rp 1.100** | Di Excel khusus Avocado Coffee & Salted Caramel, 20 gr espresso dihitung Rp 1.100 (1 single shot), sedangkan di Cappuccino/Latte 20 gr dihitung **Rp 2.200**. |
| **Powder Avocado** | 30 gr | 1000 gr / GR @ Rp 115.000 | **Rp 3.450** | **Rp 3.484** | Excel membagi dengan yield efektif 990 gr ($\frac{30}{990}\times 115.000=3.484,8$); pembagian 1000 gr menghasilkan **Rp 3.450**. |
| **Fresh Milk** | 160 gr | 1000 ml / GR @ Rp 19.000 | $160\times 1000\times \frac{19.000}{1000}=$ **Rp 3.040.000** *(Bug 1000x)* | **Rp 1.900** *(Proporsional 160 gr \= **Rp 3.040**)* | Di Excel tertulis 160 gr tetapi nilai Amount diketik statis 1900 (sama dengan 100 gr). Secara matematis, $160\times \frac{19.000}{1000}=$ **Rp 3.040**. |
| **Foaming Bravocado** | 30 gr | 1000 gr / GR @ Rp 105.000 | **Rp 3.150** | **Rp 3.181** | Excel membagi 990 gr (Rp 3.181,8); pembagian 1000 gr menghasilkan **Rp 3.150**. |
| **Subtotal \+ Fix Cost 5%** |  |  | **Rp 3.048.800 \+ Rp 152.440 \= Rp 3.201.240 (8424.3%)** | **Rp 9.665 \+ Rp 483,25 \= Rp 10.148,25 (26.7%)** | Begitu bug 1000 ml / GR diperbaiki, HPP otomatis kembali ke **Rp 12.432 (FC 32.7%)** (persis seperti di Tab 1 screenshot awal Anda\!). |

### **2\. Mengapa Setup di Buku Stok (Stock Ledger) (image\_5d615d.png) Ikut Error & Anomali?**

Pada image\_5d615d.png (Pengaturan & Sistem \-\> Buku Stok), terdapat **3 kesalahan konfigurasi master data (materials)** yang membuat konversi stok dan HPP menjadi kacau:

> 1. **Kesalahan Pengisian Pack Unit dengan Satuan Dasar (gr/grm/ml) alih-alih Satuan Kemasan Beli (pck/Btl/Carton):**

Di StockLedger.jsx:610, kolom **STOCK (CONVERTED)** dihitung dengan rumus:

$$StockConverted=Stock(Pack)\times FullPackSize$$

*   
  * Pada database Anda saat ini, banyak barang yang stok fisiknya (qty\_resto / qty\_central) sudah dicatat dalam gram (1000 gr atau 1400 gr), tetapi Pack Unit ditulis gr dan Full Pack Size ditulis 1000 gr / 1000 ml. Akibatnya:  
    * **Air Kelapa**: Stock (Pack) \= 1400.0 gr $\times$ 1000 ml \= **1.400.000 ML** (1.400 Liter\!). Seharusnya Pack Unit \= pck, Full Pack Size \= 1000 ml, dan Stock (Pack) \= 1.4 pck (sehingga Stock Converted \= 1400 ML).  
    * **Avocado Bubuqu**: Stock (Pack) \= 1000.0 gr $\times$ 1000 gr \= **1.000.000 GR** (1 Ton\!). Seharusnya Pack Unit \= pck, Full Pack Size \= 1000 gr, dan Stock (Pack) \= 1.0 pck (sehingga Stock Converted \= 1000 GR).  
    * **Air Mineral**: Stock (Pack) \= 329520.0 pcs $\times$ 600 ml \= **197.712.000 ML**. Padahal Air Mineral dijual per botol (pcs), bukan ditakar per ml di dalam resep\! Seharusnya Pack Unit \= pcs, Full Pack Size \= 1 pcs (atau jika disimpan per dus: Pack Unit \= Carton, Konversi Isi: 1 Carton \= 24 pcs).  
> 2. **Kesalahan Fatal Full Pack Size \= 1 grm pada Bahan Cair/Bubuk (Almond Milk):**  
   * Pada panel kanan image\_5d615d.png, **Almond Milk** diatur dengan Pack Unit \= grm, Full Pack Size \= 1 grm, dan Price/Pack \= Rp 39.500.  
   * Ini membuat sistem menghitung harga **1 gram Almond Milk \= Rp 39.500**\! Jika dipakai 150 gr di resep, HPP menu tersebut langsung meledak menjadi **Rp 5.925.000**.  
   * **Seharusnya:** Pack Unit \= pck (atau Btl), Full Pack Size \= 1000 ml (atau 1000 gr), dan **Konversi Isi (opsional) dikosongkan saja** (atau diisi 1 pck \= 1000 ml), sehingga harga per ml/gr menjadi $\frac{Rp39.500}{1000}=Rp39,5$.  
> 3. **Kapan Field Konversi Isi (opsional) di Edit Material Dipakai?**  
   * Di StockLedger.jsx:28-75, field **Konversi Isi (1 \[Pack Unit\] \= \[Qty\] \[Satuan\])** sebenarnya menimpa (*overwrite*) field **Full Pack Size** menjadi format "PackUnit \= Qty Satuan" (contoh: "Carton \= 24 pcs" atau "pck \= 1000 gr").  
   * Jadi, jika Pack Unit sudah diisi pck dan Full Pack Size sudah diisi 1000 gr, Anda **tidak wajib** mengisi Konversi Isi kecuali ingin memperjelas bahwa 1 pck \= 1000 gr (atau untuk barang kartonan/porsi seperti 1 Carton \= 24 pcs dan 1 pck \= 6 pcs). **Jangan pernah mengisi Pack Unit \= grm dengan Full Pack Size \= 1 grm** untuk barang yang harganya adalah harga per kemasan 1 Liter / 1 Kg.

### **3\. Tabel Standar Setup Konversi Material (Sesuai Excel SO BARISTA AGUSTUS 2026\)**

Agar nilai harga satuan, stok konversi, dan HPP resep di aplikasi **sama persis dan masuk akal sesuai Excel**, gunakan panduan standar berikut pada **Buku Stok (Stock Ledger)**:

| Kategori Bahan di Excel | Contoh Nama Bahan (dari MARKETLIST & COGS) | Pack Unit (unit) yang Benar | Full Pack Size (full\_pack) yang Benar | Price/Pack (Sesuai Excel) | Harga Satuan Dasar Hasil Konversi | Cara Pakai di Resep (Recipes.jsx) |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| **Biji Kopi & Espresso** | Coffee Bean 50:50 Espresso (Ekstrak) | pck pck | 1000 gr 2000 gr | Rp 220.000 Rp 220.000 | Rp 220 / gr Rp 110 / gr (ml) | Input 20 gr Espresso $\rightarrow$ **Rp 2.200** |
| **Susu Cair & Santan** | Fresh Milk Almond Milk Oat Milk Skm Santan kara | pck pck pck kaleng pcs | 1000 ml 1000 ml 1000 ml 300 gr 200 gr | Rp 19.000 *(atau 19.739)* Rp 39.500 Rp 11.500 Rp 11.500 Rp 14.000 | Rp 19 / ml (gr) Rp 39,5 / ml (gr) Rp 11,5 / ml Rp 38,33 / gr Rp 70 / gr | Input 100 gr atau 100 ml Fresh Milk $\rightarrow$ **Rp 1.900** |
| **Powder Minuman** | Matcha (Denali) Chocolate (Dripp) Powder Avocado Avocado Base Denali Avocado Bubuqu Lemongrass tea Lychee Tea / Lemon Tea | pck pck pck pck pck pck pck | 1000 gr 1000 gr 1000 gr 1000 gr 1000 gr 1000 gr 500 gr | Rp 180.000 Rp 135.000 *(atau 156.000)* Rp 115.000 Rp 104.880 Rp 62.000 Rp 93.000 Rp 40.191 | Rp 180 / gr Rp 135 / gr Rp 115 / gr Rp 104,88 / gr Rp 62 / gr Rp 93 / gr Rp 80,38 / gr | Input 30 gr Powder Avocado $\rightarrow$ **Rp 3.450** |
| **Sirup Botol (Dripp / Delifru)** | Strawberry syrup Peach syrup Lychee / Mint / Honey / Pandan / Butterscotch / Hazelnut / Osmanthus | Btl | 750 ml *(Marketlist)* atau 1000 ml *(COGS Non-Kopi)* atau 760 ml *(COGS Mocktail)* | Rp 111.000 | Rp 148 / ml *(750 ml)* Rp 146,05 / ml *(760 ml)* Rp 111 / ml *(1000 ml)* | Input 10 ml atau 10 gr $\rightarrow$ **Rp 1.460** *(760 ml)* atau **Rp 1.110** *(1000 ml)* |
| **Fruit Pulp (Dripp)** | Mix Berries Fruit Pulp Harum Manis Fruit Pulp Kiwie fruit Pulp | Btl | 1030 gr *(Marketlist)* atau 1000 gr *(COGS)* atau 760 ml *(Mocktail)* | Rp 166.500 | Rp 161,65 / gr *(1030 gr)* Rp 166,5 / gr *(1000 gr)* Rp 219,08 / ml *(760 ml)* | **Ubah dari pck \= 220 gr\!** Input 20 ml $\rightarrow$ **Rp 4.381** *(760 ml)* atau **Rp 3.233** *(1030 gr)* |
| **Jus Kemasan & Air** | Peinapple juice Lemon Juice Orange juice premium Air Kelapa | Btl Btl Btl pck | 1090 gr *(atau 1000 ml)* 1090 gr *(atau 1000 ml)* 1000 gr 1000 ml | Rp 16.095 Rp 18.315 Rp 18.315 Rp 14.500 *(atau 16.000)* | Rp 14,77 / gr Rp 16,80 / gr Rp 18,32 / gr Rp 14,5 \- 16 / ml | Input 30 gr Pineapple Juice $\rightarrow$ **Rp 443 \- Rp 483** |
| **Bahan Produksi / Batching Bar** *(Sheet 10\)* | Soda Water Teh Base Gula Cair Foaming Bravocado Foaming Cheese | Btl pck Btl pck pck | 900 gr 10000 gr 800 gr 1000 gr 1000 gr | Rp 7.000 Rp 5.400 Rp 17.500 Rp 105.000 Rp 120.000 | Rp 7,78 / gr Rp 0,54 / gr Rp 21,88 / gr Rp 105 / gr Rp 120 / gr | Input 90 gr Soda Water $\rightarrow$ **Rp 700**; Input 40 gr Gula Cair $\rightarrow$ **Rp 875** |
| **Frozen Pack / Pouch Porsi** | Berry Much Smoothies Tropical Smoothies Manggo Yogurt Alpukat / Sirsak / Jambu / Mangga Green Delight / Dragon Beet / Betta Carrot | pck pck pck pck pck | pck \= 6 pcs *(atau 1 pcs @ Rp 11.655)* pck \= 6 pcs pck \= 6 pcs pck \= 10 pcs *(atau 1 pcs @ Rp 10.500)* 1 pck *(200 gr \= 1 porsi)* | Rp 93.240 *(atau 69.930/6)* Rp 93.240 Rp 93.240 Rp 105.000 Rp 9.049 / Rp 10.100 | Rp 15.540 / pcs *(di SO Resto Rp 11.655/porsi)* Rp 10.500 / pcs Rp 9.049 \- 10.100 / pck | Input 1 pcs (atau 1 pck jika harga master sudah per porsi Rp 10.500 / Rp 11.655) |
| **Minuman Botol / RTD / Bir** | Air Mineral (Pristine) Bintang / Bali Hai (9 item) | Carton *(atau pcs)* | Carton \= 24 pcs *(atau 1 pcs jika harga per botol)* | Rp 58.000 / Carton *(atau Rp 2.300 \- 2.416 / pcs)* | Rp 2.416 / pcs | Input 1 pcs (Jangan isi 600 ml di Full Pack Air Mineral\!) |
| **Es Batu & Garnish** | Es Batu Kristal Toothpick Bamboe Payung Garnish | pck pck pck | 5000 gr *(atau 10000 gr)* pck \= 50 pcs pck \= 50 pcs | Rp 18.000 *(atau 21.000)* Rp 31.500 Rp 50.000 | Rp 3,6 \- 4,2 / gr Rp 630 / pcs Rp 1.000 / pcs | Input 150 gr Es Batu $\rightarrow$ **Rp 540 \- Rp 630**; Input 1 pcs Payung $\rightarrow$ **Rp 1.000** |

### **4\. Perbaikan Kode src/services/costUtils.js (Agar gr vs ml Tidak Dikali 1000x)**

Akar masalah di kode Barventis-main (1).zip adalah getPackUnitInfo() dan calculateIngredientCost() belum membedakan antara **satuan wadah/kemasan (pck, btl, carton, kaleng)** dengan **satuan dasar takaran (gr, ml)**. Di dunia F\&B/barista, gr dan ml memiliki rasio 1:1 pada takaran resep, sehingga jika material.unit tertulis gr dan full\_pack tertulis 1000 ml, keduanya adalah satuan dasar (bukan 1 gr berisi 1000 ml\!).  
Berikut adalah perbaikan tepat sasaran pada src/services/costUtils.js:

JavaScript  
const BASE\_WEIGHT\_VOL\_UNITS \= \['gr', 'ml'\];  
const PACKAGE\_CONTAINER\_UNITS \= \[  
  'pck', 'pack', 'btl', 'botol', 'bottle', 'carton', 'karton', 'crtn', 'ctn',  
  'dus', 'box', 'kaleng', 'can', 'galon', 'jerigen', 'drigen', 'sachet', 'jar'  
\];

export function isPackUnitConsistent(unit, fullPack) {  
  const u \= (unit \|\| '').toLowerCase().trim();  
  const fp \= (fullPack \|\| '').toLowerCase().trim();  
  if (\!fp) return false;  
  if (fp.includes('=')) return true;

  const weightVolUnits \= \['gr', 'grm', 'gram', 'grams', 'ml', 'kg', 'l', 'ltr', 'liter', 'litre'\];  
  const isWeightVolUnit \= weightVolUnits.includes(u);  
  const hasWeightVolInFullPack \= /(gr\|grm\|gram\|grams\|ml\|kg\|l\|ltr\|liter\|litre)\\b/i.test(fp);

  if (isWeightVolUnit) return hasWeightVolInFullPack;  
  return true;  
}

export function getPackUnitInfo(fullPack, materialUnit) {  
  const structured \= parseStructuredFullPack(fullPack);  
  if (structured) {  
    return {  
      packUnitLabel: normalizeUnitToken(structured.packLabel) \|\| normalizeUnitToken(materialUnit),  
      contentUnit: normalizeUnitToken(structured.contentUnit) \|\| normalizeUnitToken(materialUnit)  
    };  
  }  
  const normMatUnit \= normalizeUnitToken(materialUnit);  
  const legacy \= String(fullPack \|\| '').trim();  
  const match \= legacy.match(/(\[\\d.\]+)\\s\*(gr\|grm\|gram\|grams\|kg\|ml\|l\|ltr\|liter\|litre\|pcs\|pck\|can\|btl)\\b/i);  
  if (match) {  
    const parsedContentUnit \= normalizeUnitToken(match\[2\]);  
    // Jika material.unit sudah berupa gr/ml dan full\_pack juga gr/ml (mis. unit='gr', full\_pack='1000 ml'),  
    // jangan perlakukan material.unit sebagai satuan kardus/pack agar tidak dikali 1000x\!  
    if (BASE\_WEIGHT\_VOL\_UNITS.includes(normMatUnit) && BASE\_WEIGHT\_VOL\_UNITS.includes(parsedContentUnit)) {  
      return {  
        packUnitLabel: parsedContentUnit,  
        contentUnit: parsedContentUnit  
      };  
    }  
    return {  
      packUnitLabel: normMatUnit,  
      contentUnit: parsedContentUnit  
    };  
  }  
  return { packUnitLabel: normMatUnit, contentUnit: normMatUnit };  
}

Dan di dalam calculateIngredientCost(material, qtyInUse, recipeUnit, unitConversionMap) (src/services/costUtils.js:200-215):

JavaScript  
export function calculateIngredientCost(material, qtyInUse, recipeUnit, unitConversionMap) {  
  const { unitPrice, resolved, packSize, packUnitLabel, contentUnit } \= getUnitPrice(material, unitConversionMap);  
  let qty \= Number(qtyInUse ?? 0);  
  if (\!resolved \|\| qty \<= 0) return 0;

  const ru \= normalizeUnitToken(recipeUnit);  
  const isRuContainer \= PACKAGE\_CONTAINER\_UNITS.includes(ru);  
  const isContentBase \= BASE\_WEIGHT\_VOL\_UNITS.includes(contentUnit) \|\| contentUnit \=== 'pcs';

  // Hanya kalikan dengan packSize jika resep benar-benar meminta satuan KEMASAN UTUH  
  // (mis. resep memakai '1 Carton' atau '1 pck' saat isi kemasan adalah '24 pcs' atau '1000 gr').  
  // Jangan pernah mengalikan packSize jika resep memakai satuan takaran dasar ('gr' atau 'ml')\!  
  if (  
    packUnitLabel &&  
    contentUnit &&  
    ru &&  
    ru \=== packUnitLabel &&  
    ru \!== contentUnit &&  
    isRuContainer &&  
    isContentBase  
  ) {  
    qty \= qty \* (packSize \|\| 1);  
  }  
  return Math.round(qty \* unitPrice);  
}

Apakah Anda ingin saya langsung menerapkan perbaikan kode costUtils.js ini ke dalam proyek Barventis-main (1) Anda sekaligus membuatkan **script SQL otomatis (fix\_materials\_unit\_conversion.sql)** untuk merapikan seluruh unit dan full\_pack di database Supabase agar langsung sinkron dengan Excel SO BARISTA AGUSTUS 2026?