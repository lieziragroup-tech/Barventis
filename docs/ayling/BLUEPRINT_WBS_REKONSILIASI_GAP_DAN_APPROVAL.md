# Blueprint & WBS: Rekonsiliasi GAP Fisik vs POS Teoretis & Approval Keterangan Event (Head -> Direktur)

**Author**: Ayling (Lead Autonomous Orchestrator) & Izumi (Architect) / Rafi  
**Status**: APPROVED EXECUTION BLUEPRINT & WBS  
**Dokumen Standar**: `agent_lean_prompt_v2.md` & `skills/barventis-architect/SKILL.md`  

---

## 1. Arsitektur Alur & WBS (Work Breakdown Structure)

```
WBS 1.0 — Penggabungan Data GAP di Layar UI (UsageRecap.jsx)
  ├── 1.1 Tarik data teoretis dari expected_usage untuk rentang tanggal terpilih
  ├── 1.2 Hitung selisih: GAP Qty = Actual Terpakai - Theoretical POS
  ├── 1.3 Hitung nilai kerugian/variansi rupiah: GAP Value = GAP Qty * Unit Cost
  └── 1.4 Render kolom visual: [Fisik EOD] | [Teoretis POS] | [GAP Selisih] | [Status Badge]

WBS 2.0 — Dialog Pengajuan Justifikasi oleh Head Divisi (Maker/Justifier)
  ├── 2.1 Modal ringkas: "Beri Keterangan Selisih / Event"
  ├── 2.2 Pilihan Kategori: EVENT_NON_POS, TASTING_VIP, KALIBRASI_RASA, SPILLAGE
  ├── 2.3 Form Input: Keterangan Event & Qty yang diajukan
  └── 2.4 Simpan ke tabel stock_adjustments (status: 'pending')

WBS 3.0 — Panel Persetujuan & ACC oleh Owner / Manajer / Direktur (Approver)
  ├── 3.1 Integrasi ke modul StockAdjustments.jsx (Tab Audit Selisih Stok)
  ├── 3.2 Notifikasi badge jumlah pengajuan yang menunggu ACC
  ├── 3.3 Aksi Direktur: Tombol [ Setujui / ACC ] dan [ Tolak ]
  └── 3.4 Audit Trail: Catat approved_by dan approved_at di database
```

---

## 2. Rincian Teknis Implementasi

### A. Komparasi Kolom di Tabel `UsageRecap.jsx`:
| Kolom Baru | Formula / Sumber | Tampilan Visual |
|---|---|---|
| **Fisik (EOD)** | `daily_inventory_items.terpakai_qty` | Angka fisik riil |
| **Teori (POS)** | `expected_usage.expected_qty` | Angka seharusnya habis |
| **GAP Selisih** | $\text{Fisik} - \text{Teori}$ | Hijau ($0$), Kuning ($< 5\%$), Merah ($> 5\%$) |
| **Aksi Head** | Tombol jika ada GAP merah/kuning | `[ 📝 Ajukan Keterangan Event ]` |

### B. Form Modal Keterangan Event:
- **Pemicu**: Diklik oleh Head of Bar / SPV saat melihat baris bahan yang tekor karena event.
- **Kategori**:
  1. `EVENT_NON_POS` (Acara Gathering, Wedding, Borongan tanpa struk kasir).
  2. `TASTING_VIP` (Minuman tester tamu penting / compli).
  3. `KALIBRASI_RASA` (Dial-in espresso pagi hari).
  4. `LAINNYA` (Kerusakan tak terduga).
- **Backend Call**: Memanggil `adjustmentApi.createAdjustment()` yang sudah teruji di `src/services/upgradeModulesApi.js`.

### C. Hak Wewenang Approval:
- **Role Head / Staff**: Hanya bisa mengajukan (`createAdjustment`).
- **Role Admin / Owner / Direktur**: Memiliki tombol `[ Setujui / ACC ]` dan `[ Tolak ]`.
