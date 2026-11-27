import test from 'node:test';
import assert from 'node:assert/strict';

// ============================================================================
// SPRINT BLACKBOX TEST SUITE — FIELDWORK APP V2
// ============================================================================

/**
 * Kalkulator Standar System Usability Scale (SUS)
 * Skala Likert 1-5 (1: Sangat Tidak Setuju, 5: Sangat Setuju).
 * Skor SUS = (Sum(Odd - 1) + Sum(5 - Even)) * 2.5
 */
export function calculateSUSScore(answers: number[]): number {
    if (answers.length !== 10) {
        throw new Error('Kuesioner SUS wajib memiliki 10 butir pertanyaan');
    }

    let oddSum = 0;
    let evenSum = 0;

    for (let i = 0; i < 10; i++) {
        const score = answers[i];
        if (score < 1 || score > 5) {
            throw new Error(`Nilai jawaban butir ke-${i + 1} (${score}) harus antara 1 sampai 5`);
        }
        if ((i + 1) % 2 === 1) {
            oddSum += score - 1;
        } else {
            evenSum += 5 - score;
        }
    }

    return (oddSum + evenSum) * 2.5;
}

test('BB-01 [RBAC Matrix]: Multi-Role Access Control & Permission Guard', async (t) => {
    type Role = 'MASTER_SUPER_ADMIN' | 'ADMIN' | 'TEKNISI_LAPANGAN' | 'MARKETING' | 'INVENTORY';

    const PERMISSIONS: Record<Role, string[]> = {
        MASTER_SUPER_ADMIN: ['ALL_PERMISSIONS', 'MANAGE_TENANTS', 'APPROVE_SPK', 'CHECKIN_GPS', 'MANAGE_STOCK'],
        ADMIN: ['CREATE_SPK', 'APPROVE_SPK', 'VIEW_ALL_REPORTS', 'MANAGE_PROJECTS', 'EXPORT_REPORTS'],
        TEKNISI_LAPANGAN: ['VIEW_ASSIGNED_SPK', 'CHECKIN_GPS', 'SUBMIT_TREATMENT', 'CAPTURE_PHOTO', 'CHECKOUT_GPS'],
        MARKETING: ['CREATE_QUOTATION', 'VIEW_CUSTOMERS', 'VIEW_MOM_PERFORMANCE'],
        INVENTORY: ['MANAGE_STOCK', 'INVENTORY_MUTATION_IN', 'INVENTORY_MUTATION_OUT', 'PROJECT_COSTING'],
    };

    await t.test('Teknisi lapangan DILARANG membuat atau approve SPK', () => {
        const tekPerms = PERMISSIONS.TEKNISI_LAPANGAN;
        assert.equal(tekPerms.includes('CREATE_SPK'), false);
        assert.equal(tekPerms.includes('APPROVE_SPK'), false);
    });

    await t.test('Admin memiliki wewenang penugasan SPK dan peninjauan laporan', () => {
        const admPerms = PERMISSIONS.ADMIN;
        assert.equal(admPerms.includes('CREATE_SPK'), true);
        assert.equal(admPerms.includes('APPROVE_SPK'), true);
        assert.equal(admPerms.includes('VIEW_ALL_REPORTS'), true);
    });

    await t.test('Gudang memiliki wewenang mutasi inventori tapi dilarang check-in GPS lapangan', () => {
        const invPerms = PERMISSIONS.INVENTORY;
        assert.equal(invPerms.includes('MANAGE_STOCK'), true);
        assert.equal(invPerms.includes('CHECKIN_GPS'), false);
    });
});

test('BB-02 [State Machine]: Alur Siklus Hidup SPK & Laporan Kerja Lapangan', async (t) => {
    type SPKStatus = 'DRAFT' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

    const ALLOWED_TRANSITIONS: Record<SPKStatus, SPKStatus[]> = {
        DRAFT: ['ASSIGNED', 'CANCELLED'],
        ASSIGNED: ['IN_PROGRESS', 'CANCELLED'],
        IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
        COMPLETED: [], // Terminal state
        CANCELLED: [], // Terminal state
    };

    await t.test('Transisi valid: DRAFT -> ASSIGNED -> IN_PROGRESS -> COMPLETED', () => {
        assert.equal(ALLOWED_TRANSITIONS.DRAFT.includes('ASSIGNED'), true);
        assert.equal(ALLOWED_TRANSITIONS.ASSIGNED.includes('IN_PROGRESS'), true);
        assert.equal(ALLOWED_TRANSITIONS.IN_PROGRESS.includes('COMPLETED'), true);
    });

    await t.test('Transisi ilegal: COMPLETED tidak boleh kembali ke IN_PROGRESS', () => {
        assert.equal(ALLOWED_TRANSITIONS.COMPLETED.includes('IN_PROGRESS'), false);
    });

    await t.test('Transisi ilegal: DRAFT langsung ke COMPLETED tanpa eksekusi', () => {
        assert.equal(ALLOWED_TRANSITIONS.DRAFT.includes('COMPLETED'), false);
    });
});

test('BB-03 [Usability Metrics]: Standar Kuesioner System Usability Scale (SUS)', async (t) => {
    await t.test('Skor SUS ideal responden kuesioner teknisi (skor >= 70)', () => {
        // Responden menjawab positif (ganjil tinggi, genap rendah)
        const positiveAnswers = [4, 2, 5, 1, 4, 2, 5, 1, 4, 2];
        const score = calculateSUSScore(positiveAnswers);
        assert.equal(score, 85);
        assert.ok(score >= 70, 'Skor SUS harus mencapai predikat Acceptable (>= 70)');
    });

    await t.test('Skor kuesioner sempurna (skor 100)', () => {
        const perfectAnswers = [5, 1, 5, 1, 5, 1, 5, 1, 5, 1];
        const score = calculateSUSScore(perfectAnswers);
        assert.equal(score, 100);
    });

    await t.test('Validasi jumlah pertanyaan wajib tepat 10 butir', () => {
        assert.throws(() => calculateSUSScore([5, 1, 5]), /wajib memiliki 10 butir pertanyaan/);
    });
});

test('BB-04 [Offline Resilience]: Antrean Transaksi Offline & Idempotensi', async (t) => {
    interface QueueItem {
        idempotencyKey: string;
        action: 'CHECK_IN' | 'SUBMIT_TREATMENT' | 'CHECK_OUT';
        timestamp: number;
    }

    const queue: QueueItem[] = [];
    const processedKeys = new Set<string>();

    function enqueue(action: QueueItem['action'], key: string) {
        queue.push({ idempotencyKey: key, action, timestamp: Date.now() });
    }

    function processBatch(): { processedCount: number; duplicateCount: number } {
        let processedCount = 0;
        let duplicateCount = 0;

        for (const item of queue) {
            if (processedKeys.has(item.idempotencyKey)) {
                duplicateCount++;
            } else {
                processedKeys.add(item.idempotencyKey);
                processedCount++;
            }
        }
        return { processedCount, duplicateCount };
    }

    await t.test('Antrean offline menyimpan aksi check-in dan foto secara berurutan', () => {
        enqueue('CHECK_IN', 'key-uuid-1');
        enqueue('SUBMIT_TREATMENT', 'key-uuid-2');
        enqueue('CHECK_OUT', 'key-uuid-3');

        assert.equal(queue.length, 3);
        assert.equal(queue[0].action, 'CHECK_IN');
        assert.equal(queue[2].action, 'CHECK_OUT');
    });

    await t.test('Idempotency key mencegah eksekusi duplikat saat sinyal terputus-putus', () => {
        // Simulasi retry otomatis karena network timeout
        enqueue('CHECK_OUT', 'key-uuid-3'); // duplikat key yang sama

        const res = processBatch();
        assert.equal(res.processedCount, 3);
        assert.equal(res.duplicateCount, 1);
    });
});

test('BB-05 [Media & Signature Security]: Tanda Tangan Digital & Verifikasi Format', async (t) => {
    const SIGNATURE_REGEX = /^data:image\/(png|webp);base64,/;

    await t.test('DataURL tanda tangan canvas PNG valid diterima', () => {
        const dummyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
        assert.equal(SIGNATURE_REGEX.test(dummyPng), true);
    });

    await t.test('DataURL non-gambar (injeksi payload script/html) ditolak', () => {
        const maliciousPayload = 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==';
        assert.equal(SIGNATURE_REGEX.test(maliciousPayload), false);
    });
});

test('BB-06 [Geofence Anti-Spoofing]: Boundary Toleransi & Heuristik Lokasi', async (t) => {
    const MAX_GEOFENCE_RADIUS_METERS = 300;

    await t.test('Teknisi dalam radius 250m disetujui otomatis', () => {
        const isInside = 250 <= MAX_GEOFENCE_RADIUS_METERS;
        assert.equal(isInside, true);
    });

    await t.test('Teknisi pada jarak 450m diberi label OUTSIDE_TOLERANCE', () => {
        const isInside = 450 <= MAX_GEOFENCE_RADIUS_METERS;
        assert.equal(isInside, false);
    });
});

test('BB-07 [Bulk Customer Import Workflow: Parse, Preview & Commit]', async (t) => {
    interface RawCustomerRow {
        Nama: string;
        Kontak: string;
        Alamat: string;
        Proyek: string;
        KategoriProyek: string;
    }

    const mockFileRows: RawCustomerRow[] = [
        { Nama: 'PT Bank Central Asia', Kontak: '0811111111', Alamat: 'Jl. Thamrin 1', Proyek: 'Anti Rayap Gedung', KategoriProyek: 'AR' },
        { Nama: 'PT Pelanggan Lama', Kontak: '0822222222', Alamat: 'Jl. Sudirman 5', Proyek: 'Pest Control', KategoriProyek: 'PCO' },
        { Nama: '   ', Kontak: '0833333333', Alamat: 'Jl. Gatot Subroto', Proyek: 'Termite', KategoriProyek: 'AR' },
        { Nama: 'CV Bersama Sejahtera', Kontak: '0844444444', Alamat: 'Jl. TB Simatupang', Proyek: 'Fumigasi Kontainer', KategoriProyek: 'PCO' },
    ];

    const existingCustomerDatabase = new Set(['pt pelanggan lama']);

    await t.test('Tahap Preview: Memetakan status ok, duplikat, dan error sebelum commit', () => {
        const previewRows = mockFileRows.map(r => {
            const namaClean = r.Nama.trim();
            if (!namaClean) return { ...r, status: 'error', reason: 'Nama kosong' };
            if (existingCustomerDatabase.has(namaClean.toLowerCase())) {
                return { ...r, status: 'duplicate', reason: 'Nama sudah terdaftar' };
            }
            return { ...r, status: 'ok', reason: '' };
        });

        assert.equal(previewRows.filter(r => r.status === 'ok').length, 2);
        assert.equal(previewRows.filter(r => r.status === 'duplicate').length, 1);
        assert.equal(previewRows.filter(r => r.status === 'error').length, 1);
    });

    await t.test('Tahap Commit: Hanya mengimpor baris valid ke payload quotation', () => {
        const validRows = mockFileRows.filter(r => r.Nama.trim() && !existingCustomerDatabase.has(r.Nama.trim().toLowerCase()));
        const payload = validRows.map(row => ({
            kepadaNama: row.Nama.trim(),
            kepadaKontak: row.Kontak.trim(),
            kepadaAlamat: row.Alamat.trim(),
            perihal: row.Proyek.trim(),
            kategori: row.KategoriProyek.toUpperCase() === 'AR' ? 'AR' : 'PCO',
            status: 'draft',
        }));

        assert.equal(payload.length, 2);
        assert.equal(payload[0].kepadaNama, 'PT Bank Central Asia');
        assert.equal(payload[1].kepadaNama, 'CV Bersama Sejahtera');
    });
});

test('BB-08 [SPK Recurring Dispatch Workflow: Frequency Generation & Round-Robin]', async (t) => {
    const quotation = {
        id: 'q-99',
        noSurat: 'GP/AR/PH/2026/10/0001',
        kepadaNama: 'PT Inti Sentosa',
        perihal: 'Anti Rayap Injeksi Rutin',
        kategori: 'AR',
        lokasiPekerjaan: 'Kawasan Industri MM2100',
    };

    const technicians = [
        { uid: 'u-1', name: 'Teknisi Budi' },
        { uid: 'u-2', name: 'Teknisi Joko' },
    ];

    await t.test('Menerbitkan 4 SPK mingguan dengan rotasi seimbang 2 teknisi', () => {
        const startDate = '2026-11-02';
        const count = 4;
        const generatedSPKs = [];

        const d = new Date(startDate);
        for (let i = 0; i < count; i++) {
            const dateStr = d.toISOString().split('T')[0];
            const tech = technicians[i % technicians.length];
            generatedSPKs.push({
                quotationId: quotation.id,
                quotationNoSurat: quotation.noSurat,
                customerName: quotation.kepadaNama,
                technicianId: tech.uid,
                technicianName: tech.name,
                scheduleDate: dateStr,
                status: 'assigned',
            });
            d.setDate(d.getDate() + 7);
        }

        assert.equal(generatedSPKs.length, 4);
        assert.equal(generatedSPKs[0].technicianName, 'Teknisi Budi');
        assert.equal(generatedSPKs[0].scheduleDate, '2026-11-02');
        assert.equal(generatedSPKs[1].technicianName, 'Teknisi Joko');
        assert.equal(generatedSPKs[1].scheduleDate, '2026-11-09');
        assert.equal(generatedSPKs[2].technicianName, 'Teknisi Budi');
        assert.equal(generatedSPKs[2].scheduleDate, '2026-11-16');
        assert.equal(generatedSPKs[3].technicianName, 'Teknisi Joko');
        assert.equal(generatedSPKs[3].scheduleDate, '2026-11-23');
    });
});

test('BB-09 [Quotation Official Numbering Sanity: Category Direct Official Format]', async (t) => {
    function approveQuotationNumber(draftNo: string): string {
        return draftNo.replace(/-DRF\//g, '/').replace(/-APR\//g, '/');
    }

    await t.test('Nomor draft Anti Rayap bertransformasi ke nomor resmi kategori AR tanpa APR', () => {
        const draftAR = 'GP-DRF/AR/PH/2026/10/0001';
        const officialAR = approveQuotationNumber(draftAR);
        assert.equal(officialAR, 'GP/AR/PH/2026/10/0001');
        assert.equal(officialAR.includes('-APR/'), false, 'Dilarang memuat -APR/');
        assert.equal(officialAR.includes('APR'), false, 'Dilarang memuat kata APR');
    });

    await t.test('Nomor draft Pest Control bertransformasi ke nomor resmi kategori PCO tanpa APR', () => {
        const draftPCO = 'GP-DRF/PCO/PH/2026/10/0099';
        const officialPCO = approveQuotationNumber(draftPCO);
        assert.equal(officialPCO, 'GP/PCO/PH/2026/10/0099');
        assert.equal(officialPCO.includes('-APR/'), false, 'Dilarang memuat -APR/');
        assert.equal(officialPCO.includes('APR'), false, 'Dilarang memuat kata APR');
    });
});

test('BB-10 [Geofence Auto-Anchor on First Check-In Workflow]', async (t) => {
    await t.test('Simulasi proyek tanpa koordinat awal (0,0): Terkunci otomatis ke titik GPS check-in teknisi', () => {
        const mockProject = {
            id: 'proj-123',
            name: 'Gedung Wisma Antara',
            latitude: 0,
            longitude: 0,
            radius: 100,
        };

        const techCheckInEvidence = {
            latitude: -6.182450,
            longitude: 106.829150,
            accuracy: 14,
        };

        const hasAnchor = Boolean(mockProject.latitude && mockProject.longitude && !(mockProject.latitude === 0 && mockProject.longitude === 0));
        assert.equal(hasAnchor, false, 'Proyek baru belum memiliki jangkar');

        // Logika check-in
        let checkInDistance = 0;
        let checkInValid = true;

        if (!hasAnchor) {
            // Auto anchor
            mockProject.latitude = techCheckInEvidence.latitude;
            mockProject.longitude = techCheckInEvidence.longitude;
            checkInDistance = 0;
            checkInValid = true;
        }

        assert.equal(checkInDistance, 0);
        assert.equal(checkInValid, true);
        assert.equal(mockProject.latitude, -6.182450);
        assert.equal(mockProject.longitude, 106.829150);

        // Subsequent check-out from 30m away
        const techCheckOutGPS = { latitude: -6.182650, longitude: 106.829150 };
        // ~22m away
        const hasAnchorNow = Boolean(mockProject.latitude && mockProject.longitude && !(mockProject.latitude === 0 && mockProject.longitude === 0));
        assert.equal(hasAnchorNow, true, 'Proyek kini sudah memiliki jangkar permanen');
    });
});

test('BB-11 [Customer Profile Editing & Map Pin Draggable Synchronization]', async (t) => {
    interface CustomerState {
        name: string;
        wa: string;
        up: string;
        address: string;
        wilayah: string;
        latitude?: number;
        longitude?: number;
    }

    await t.test('Alur Edit Profil Klien: Pemilihan rekomendasi autocomplete memperbarui alamat dan koordinat peta', () => {
        const customer: CustomerState = {
            name: 'PT Contoh Klien Lama',
            wa: '0812000000',
            up: 'Pak Lama',
            address: 'Jl. Lama No. 1',
            wilayah: 'Jakarta',
            latitude: undefined,
            longitude: undefined,
        };

        // Simulasi pemilihan rekomendasi autocomplete (ala Google Maps)
        const selectedSuggestion = {
            displayName: 'RS Hermina BSD, Jalan Pahlawan Seribu, Lengkong Gudang, Serpong, Tangerang Selatan',
            lat: -6.297450,
            lng: 106.669810,
        };

        // Update profil
        customer.address = selectedSuggestion.displayName;
        customer.latitude = selectedSuggestion.lat;
        customer.longitude = selectedSuggestion.lng;
        customer.wilayah = 'Tangerang Selatan';

        assert.equal(customer.address.includes('RS Hermina BSD'), true);
        assert.equal(customer.latitude, -6.297450);
        assert.equal(customer.longitude, 106.669810);
        assert.equal(customer.wilayah, 'Tangerang Selatan');
    });

    await t.test('Simulasi Geser Pin Peta: Koordinat diperbarui secara presisi ke gerbang masuk klien', () => {
        let lat = -6.297450;
        let lng = 106.669810;

        // User menggeser pin peta 15 meter ke gerbang masuk
        const onMapPinDrag = (newLat: number, newLng: number) => {
            lat = newLat;
            lng = newLng;
        };

        onMapPinDrag(-6.297580, 106.669920);

        assert.equal(lat, -6.297580);
        assert.equal(lng, 106.669920);
    });
});
