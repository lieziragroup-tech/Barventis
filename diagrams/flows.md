# Arsitektur & Alur Bisnis Barventis (TO-BE)

## 1. Arsitektur Logistik & Inventaris
```mermaid
flowchart TD
    %% Entitas Eksternal
    V[Vendor / Supplier]
    POS[Mesin POS ESB]
    
    %% Gudang
    subgraph Sistem Barventis
        CW[(Central Warehouse)]
        RB[(Resto / Bar)]
        BOM{{Engine Resep / BOM}}
    end

    %% Alur Pengadaan
    V -- Grosir / Buffer --> CW
    V -- Bahan Segar --> RB
    
    %% Alur Internal
    CW -- Mutasi Internal --> RB
    
    %% Alur Keluar
    POS -- Ekspor Data Penjualan --> BOM
    BOM -- Pemotongan Stok Otomatis --> RB
    
    %% Audit & Closing
    RB -- Daily EOD Batch (Draft) --> DB[(Database)]
    RB -- Upload Foto Limbah (WebP) --> DB
```

## 2. Alur Kerja Harian Barista (Closing Shift)
```mermaid
stateDiagram-v2
    [*] --> Shift_Berjalan
    Shift_Berjalan --> Simpan_Draf_Berkala: Ada Barang Masuk/Limbah
    Simpan_Draf_Berkala --> Wajib_Foto_WASTE: Jika ada item basi/pecah
    Wajib_Foto_WASTE --> Shift_Berjalan
    
    Shift_Berjalan --> EOD_Closing: Tutup Operasional (23:00)
    EOD_Closing --> Hitung_FULL_dan_BROKEN: Sensus Fisik
    Hitung_FULL_dan_BROKEN --> Lock_Shift
    Lock_Shift --> [*]: Stok Awal H+1 Terkunci
```

## Dokumen Terkait
- [[business_goals|Business Goals]]
- [[gap_analysis|Gap Analysis]]
- [[business_process_discovery_barventis_13_sheets|BPD 13 Sheets]]
- [[master_roadmap|Roadmap Implementasi]]
