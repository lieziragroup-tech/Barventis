# Analisis & Solusi Error HTTP 400 Supabase (`transactions` & `materials`)

Dokumen ini merangkum hasil audit **Ayling** dan **Izumi** terhadap 3 log error `HTTP 400 (Bad Request)` yang muncul pada konsol browser saat mengakses modul **Transfer Stok** dan **Setup Bahan Baru (`SimplePrep` / `materialsRepo`)**.

## Ringkasan Eksekutif Penyebab Error

| No | Endpoint yang Gagal (`HTTP 400`) | Penyebab Utama di Database / Kode | Dampak ke Pengguna |
| :--- | :--- | :--- | :--- |
| **1** | `GET /rest/v1/transactions?...&type=eq.TRANSFER_REQUEST` | Nilai `'TRANSFER_REQUEST'` belum terdaftar di dalam tipe data `ENUM public.transaction_type` pada PostgreSQL Supabase. | Muncul error merah 400 di konsol setiap kali membuka halaman Transfer Stok, dan pengajuan *Request Transfer* baru akan gagal disimpan. |
| **2** | `POST /rest/v1/materials?columns=..."shelf_life_days"...` *(Percobaan Insert ke-1)* | Kolom `shelf_life_days` belum ada di tabel `public.materials` pada database Supabase aktif (migrasi `20261016000000_add_shelf_life_days.sql` belum dijalankan). | `materialsRepo.create()` gagal pada percobaan pertama, lalu otomatis mencoba *fallback* ke percobaan kedua tanpa `shelf_life_days`. |
| **3** | `POST /rest/v1/materials?columns="name","category","unit","full_pack","price","qty_resto","min_stock","is_preparable","tenant_id"` *(Percobaan Insert ke-2 / Fallback)* | Payload *insert* dari `SimplePrep.jsx` tidak menyertakan kolom **`supplier`** dan **`new_price`**, padahal di skema tabel `public.materials` kolom `supplier` dan `new_price` berstatus **`NOT NULL` tanpa nilai `DEFAULT`**. | Pendaftaran bahan baru melalui modal **Setup Bahan Mentah Baru** gagal total dengan status `400 Bad Request (null value in column "supplier" violates not-null constraint)`. |

## 1. Bedah Error 1: `invalid input value for enum transaction_type: "TRANSFER_REQUEST"`

### Log Error
```text
GET https://nooqzgaagmiaykxjqoaj.supabase.co/rest/v1/transactions?select=*,materials(id,name,sku,unit,qty_resto,qty_central)&tenant_id=eq.bbff24dc-efae-4a9a-8fac-e5e8969791b9&type=eq.TRANSFER_REQUEST&order=id.desc 400 (Bad Request)
Transfer requests not available in DB transaction_type enum: invalid input value for enum transaction_type: "TRANSFER_REQUEST"
```

### Akar Masalah
1. Pada tabel `public.transactions`, kolom `type` bertipe `ENUM public.transaction_type`.
2. Di database Supabase saat ini, anggota enum `transaction_type` belum memiliki nilai `'TRANSFER_REQUEST'`. Saat `api.getTransferRequests()` (`src/services/api.js:1767`) menjalankan filter `.eq('type', 'TRANSFER_REQUEST')`, PostgreSQL menolak query tersebut dengan kode `22P02 (invalid input value for enum)`.
3. Selain itu, pada `api.createTransferRequest()` (`src/services/api.js:1750`), kolom `location` diisi `target_branch` (berisi teks `'Resto Bar'` atau `'Central Warehouse'`), padahal kolom `location` bertipe `ENUM public.stock_location` yang hanya menerima `'RESTO'` atau `'CENTRAL'`.

### Solusi (SQL & Kode Frontend)

#### A. Jalankan di Supabase SQL Editor (Permanen di Database)
```sql
-- Tambahkan nilai 'TRANSFER_REQUEST' ke dalam enum transaction_type
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'TRANSFER_REQUEST';
```

#### B. Perbaikan di `src/services/api.js` (Baris 1740–1780)
Pastikan `location` pada `createTransferRequest` dinormalisasi ke `'RESTO'` atau `'CENTRAL'`, serta simpan flag di memori agar `getTransferRequests` tidak terus-menerus menembak request 400 jika enum belum dimigrasi:

```javascript
  // Tambahkan variabel penanda di atas objek api:
  // let isTransferRequestEnumSupported = true;

  createTransferRequest: async ({ material_id, qty, source_branch, target_branch, notes }) => {
    const tenantId = await getActiveTenantId();
    const { data: mat } = await supabase.from('materials').select('price, new_price').eq('id', material_id).single();
    const unitPrice = parseFloat(mat?.new_price || mat?.price) || 0;
    const safeLocation = String(target_branch || '').toUpperCase().includes('CENTRAL') ? 'CENTRAL' : 'RESTO';

    const { data, error } = await supabase.from('transactions').insert({
      tenant_id: tenantId,
      date: new Date().toISOString().split('T')[0],
      material_id: material_id,
      type: 'TRANSFER_REQUEST',
      location: safeLocation,
      qty: parseFloat(qty),
      amount: Math.round(parseFloat(qty) * unitPrice),
      notes: `Request Transfer [${source_branch} ➔ ${target_branch}] - ${notes || ''}`
    }).select().single();

    if (error) throw new Error('Gagal membuat request transfer: ' + error.message);
    return data;
  },
```

## 2. Bedah Error 2 & 3: Dua Kali `HTTP 400` Saat Insert ke Tabel `materials`

### Log Error
```text
POST https://nooqzgaagmiaykxjqoaj.supabase.co/rest/v1/materials?columns="name","category","unit","full_pack","price","qty_resto","shelf_life_days","min_stock","is_preparable","tenant_id"&select=* 400 (Bad Request)

POST https://nooqzgaagmiaykxjqoaj.supabase.co/rest/v1/materials?columns="name","category","unit","full_pack","price","qty_resto","min_stock","is_preparable","tenant_id"&select=* 400 (Bad Request)
```

### Akar Masalah
Mengapa muncul **dua** request `POST /rest/v1/materials` secara berurutan dan keduanya gagal dengan status `400`?

1. **Penyebab Gagalnya Request Pertama (`shelf_life_days`)**:
   Pada `src/data/materialsRepo.js` (baris 71–75), fungsi `materialsRepo.create()` mencoba menyimpan objek `material` lengkap beserta properti `shelf_life_days`. Karena di tabel `public.materials` Supabase kolom `shelf_life_days` **belum dibuat**, PostgREST menolak request pertama dengan error `Could not find the 'shelf_life_days' column of 'materials' in the schema cache (HTTP 400)`.
2. **Penyebab Gagalnya Request Kedua (Kolom `supplier` & `new_price` Wajib `NOT NULL`, serta `price` Bertipe `int8`)**:
   Setelah menangkap error pertama, blok `catch` di `materialsRepo.create()` (baris 80–87) menghapus `shelf_life_days` lalu mengirim ulang request kedua. Namun, perhatikan struktur tabel `public.materials` di database Supabase kamu:
   * `supplier` (`varchar`) -> **NOT NULL** (Wajib ada, tidak boleh `NULL`)
   * `new_price` (`numeric`) -> **NOT NULL**
   * `price` (`int8` / `bigint`) -> **NOT NULL** dan wajib bilangan bulat
   * `qty_central` (`numeric`) -> **NOT NULL**
   * `par_stock` (`numeric`) -> **NOT NULL**
   * `is_active` (`bool`) -> **NOT NULL**

   Ketika kamu menekan tombol **Simpan ke Database & Pilih** pada modal **Setup Bahan Mentah Baru** di `SimplePrep.jsx`, payload yang dikirim hanya berisi `name, category, unit, full_pack, price, qty_resto, min_stock, is_preparable` **tanpa `supplier` dan tanpa `new_price`**. Akibatnya, PostgreSQL kembali menolak request kedua dengan status **HTTP 400 (`null value in column "supplier" of relation "materials" violates not-null constraint`)**.

### Solusi Lengkap (SQL & Kode `materialsRepo.js`)

#### A. Jalankan di Supabase SQL Editor (Agar Skema Database Sinkron)
Jalankan query berikut satu kali di SQL Editor Supabase agar kolom `shelf_life_days` tersedia dan kolom wajib di `materials` memiliki nilai `DEFAULT` yang aman:

```sql
-- 1. Tambahkan kolom shelf_life_days jika belum ada
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS shelf_life_days integer DEFAULT NULL;

-- 2. Berikan nilai DEFAULT pada kolom NOT NULL di tabel materials
ALTER TABLE public.materials
  ALTER COLUMN supplier SET DEFAULT '-',
  ALTER COLUMN full_pack SET DEFAULT '1 pcs',
  ALTER COLUMN price SET DEFAULT 0,
  ALTER COLUMN new_price SET DEFAULT 0,
  ALTER COLUMN qty_resto SET DEFAULT 0,
  ALTER COLUMN qty_central SET DEFAULT 0,
  ALTER COLUMN min_stock SET DEFAULT 5,
  ALTER COLUMN par_stock SET DEFAULT 0,
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN is_preparable SET DEFAULT false,
  ALTER COLUMN broken_tracking_enabled SET DEFAULT false,
  ALTER COLUMN expiry_tracking_enabled SET DEFAULT false;
```

#### B. Perbaiki `src/data/materialsRepo.js` (Baris 67–94)
Di sisi aplikasi, lengkapi `materialsRepo.create()` dengan **normalisasi nilai default untuk seluruh kolom `NOT NULL`** serta simpan status ketersediaan kolom `shelf_life_days` agar aplikasi tidak perlu gagal 400 terlebih dahulu di setiap pembuatan bahan baru:

```javascript
// Tambahkan di bagian atas src/data/materialsRepo.js (di bawah SHELF_LIFE_STORAGE_PREFIX):
let dbSupportsShelfLifeColumn = true;

function normalizeMaterialCreatePayload(tenantId, material) {
  const roundedPrice = Math.round(Number(material.price) || 0);
  const newPrice = Number(material.new_price ?? material.price ?? 0);
  const unit = (material.unit || 'pcs').trim();
  const defaultFullPack =
    unit === 'kg' ? '1000 gr' :
    unit === 'L' ? '1000 ml' :
    `1 ${unit}`;

  return {
    ...material,
    tenant_id: tenantId,
    name: String(material.name || '').trim(),
    category: material.category || 'Bahan Mentah / Raw Material',
    supplier: material.supplier != null && String(material.supplier).trim() !== '' ? String(material.supplier).trim() : '-',
    unit: unit,
    full_pack: material.full_pack != null && String(material.full_pack).trim() !== '' ? String(material.full_pack).trim() : defaultFullPack,
    price: roundedPrice,
    new_price: newPrice,
    qty_resto: Number(material.qty_resto) || 0,
    qty_central: Number(material.qty_central) || 0,
    min_stock: Number(material.min_stock ?? 5),
    par_stock: Number(material.par_stock ?? 0),
    is_active: material.is_active ?? true,
    is_preparable: Boolean(material.is_preparable),
    broken_tracking_enabled: Boolean(material.broken_tracking_enabled),
    expiry_tracking_enabled: Boolean(material.expiry_tracking_enabled)
  };
}
```

Lalu ganti fungsi `create` di dalam `src/data/materialsRepo.js` (baris 67–94) menjadi:

```javascript
  create: async (tenantId, material) => {
    if (!tenantId) throw new Error("Missing active session.");
    const shelfLifeVal = material.shelf_life_days;
    const basePayload = normalizeMaterialCreatePayload(tenantId, material);

    if (!dbSupportsShelfLifeColumn) {
      delete basePayload.shelf_life_days;
    }

    try {
      const { data, error } = await supabase
        .from('materials')
        .insert([basePayload])
        .select()
        .single();
      if (error) throw error;
      if (shelfLifeVal !== undefined) setLocalShelfLife(tenantId, data.id, shelfLifeVal);
      return { ...data, shelf_life_days: data.shelf_life_days ?? shelfLifeVal ?? null };
    } catch (insertErr) {
      if (insertErr.message && insertErr.message.includes('shelf_life_days')) {
        dbSupportsShelfLifeColumn = false;
        const fallbackMaterial = { ...basePayload };
        delete fallbackMaterial.shelf_life_days;
        const { data, error } = await supabase
          .from('materials')
          .insert([fallbackMaterial])
          .select()
          .single();
        if (error) throw error;
        if (shelfLifeVal !== undefined) setLocalShelfLife(tenantId, data.id, shelfLifeVal);
        return { ...data, shelf_life_days: shelfLifeVal ?? null };
      }
      throw insertErr;
    }
  },
```
