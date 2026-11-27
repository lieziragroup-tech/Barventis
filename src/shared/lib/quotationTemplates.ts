/**
 * Teks baku template surat penawaran resmi PT Guci Emas Pratama.
 * Mendukung seluruh 5 arketipe PDF penawaran resmi:
 *   1. Anti Rayap Pra-Konstruksi + Pipa + Company Profile & Edukasi (8 Halaman - PDF 0005)
 *   2. Anti Rayap Pasca-Konstruksi / Retreatment + Rumus Volume + Upah/Diskon (4 Halaman - PDF 0022)
 *   3. Proposal Lengkap Rodent Control Survey A-E (4 Halaman - PDF 0009)
 *   4. Penawaran Pest & Rodent Control Korporat BOQ + DPP 11/12 PPN 12% (3 Halaman - PDF 0003)
 *   5. Surat Jadwal Kerja Fogging 12 Bulan & Perpanjangan Kontrak (1 Halaman - PDF 0015 & 0276)
 */
export type PdfBlock =
    | { t: 'title'; text: string; underline?: boolean }   // judul program, mis. "I. <i>PEST CONTROL</i>"
    | { t: 'h'; text: string }                            // sub-judul tebal
    | { t: 'sub'; text: string }                          // tebal-miring, mis. "Pest Control :"
    | { t: 'p'; text: string; justify?: boolean }
    | { t: 'bullets'; items: string[]; marker?: string }
    | { t: 'bulletCols'; items: string[]; cols: number }
    | { t: 'kv'; rows: [string, string][]; labelW?: number; marker?: string }
    | { t: 'gap'; mm?: number }
    | { t: 'pageBreak' };

const K3_UMUM = ['Wear pack/pakaian kerja {company}', 'Helm, sepatu bot dan sarung tangan', 'Kacamata & Masker'];

/**
 * Halaman Edukasi Rayap, Company Profile Guci Emas Pratama (Sejak 1985), Koloni Rayap, & Metode Pra-Konstruksi SNI
 * sesuai dengan PDF 0005 (PT Oreka Solusi Kreatif - 8 Halaman).
 */
export function edukasiDanProfilPraKonstruksi(company: string): PdfBlock[] {
    return [
        // Halaman 2: Edukasi Bahaya Rayap
        { t: 'h', text: 'Lindungi Bangunan Anda Dari Serangan Rayap!' },
        { t: 'gap', mm: 2 },
        { t: 'p', text: 'Rayap adalah serangga hama yang keberadaannya mengganggu dan dapat menyebabkan kerugian material, karena rayap dapat merusak dan memakan seluruh barang berharga yang anda miliki. Rayap dapat memakan seluruh perabotan yang memiliki selulose seperti kayu pada furniture, <i>kitchen set</i>, plafon rumah, kertas, buku dan dokumen berharga. Berdasarkan hasil riset yang ada, kerugian yang disebabkan serangga hama Rayap dapat menyentuh angka Rp 4 Trilyun per-tahun. Hal ini membuktikan bahwa serangan rayap sangat merugikan manusia.' },
        { t: 'gap', mm: 2 },
        { t: 'p', text: 'Di alam bebas, rayap berguna untuk membantu mengurangi nutrisi tumbuhan mati menjadi tanah yang subur (serangga pengurai). Tetapi, akan menjadi ancaman serius ketika memasuki lingkungan tempat tinggal dan tempat kerja kita. Sekalipun rumah Anda dibangun dengan bahan utama batu bata, Anda tetap akan menemukan masalah dengan rayap, dikarenakan factor pendukung struktur dan komponen bangunan, rumah, atau Gedung masih menggunakan bahan yang mengandung selulose.' },
        { t: 'gap', mm: 2 },
        { t: 'p', text: 'Rayap bisa memakan kayu di dalam Gedung dari bawah sampai keatas atap. Dari waktu ke waktu, kerusakan yang disebabkan oleh rayap bisa terlihat sangat jelas dan kerusakan yang ditimbulkan menyebabkan tingginya biaya untuk perbaikan struktur bangunan. Maka pengendalian rayap akan efektif jika dilakukan oleh teknisi yang berpengalaman dan mengerti kebiasaan dan perilaku dari Rayap (morfologi) dengan melakukan observasi terhadap konstruksi bangunan, karakteristik tanah, dan kondisi yang disukai oleh rayap.' },
        { t: 'pageBreak' },

        // Halaman 3: Company Profile Guci Emas Pratama Sejak 1985
        { t: 'h', text: `${company} Penyedia Jasa Anti-Rayap Berpengalaman Sejak 1985.` },
        { t: 'gap', mm: 1.5 },
        { t: 'p', text: `${company} adalah perusahaan yang bergerak di bidang jasa Anti-Rayap dan pengendalian hama (<i>pest control</i>) seperti tikus, kecoa, lalat, nyamuk, kutu busuk dan hama pemukiman lainnya yang mengganggu kehidupan manusia.` },
        { t: 'gap', mm: 1.5 },
        { t: 'p', text: 'Kami memiliki izin resmi dari PTSP Tangerang Selatan yang merupakan instansi resmi penerbit izin untuk perusahaan pengendalian hama. Kami juga terdaftar di Asosiasi Perusahaan Pengendalian Hama Indonesia (ASPPHAMI).' },
        { t: 'gap', mm: 2 },
        { t: 'h', text: `Mengapa harus memilih ${company}?` },
        { t: 'p', text: `Sebagai perusahaan Anti-Rayap dan <i>pest control</i> berpengalaman, dan kami berkomitmen untuk memberikan pelayanan terbaik kepada seluruh konsumen yang telah memberikan kepercayaan kepada ${company}.` },
        { t: 'gap', mm: 1.5 },
        { t: 'bullets', marker: '•', items: [
            '<b>Garansi Hingga 5 Tahun</b> — Untuk memastikan bangunan anda selalu aman dari serangan rayap, kami memberikan garansi selama 5 Tahun untuk pekerjaan Anti-Rayap Pra-Konstruksi, dan Garansi 3 Tahun untuk pekerjaan Pasca-Konstruksi.',
            `<b>Teknisi Profesional dan Berpengalaman</b> — Berpengalaman sejak 1985, ${company} ahli dalam mengatasi permasalahan serangan anti-rayap pada bangunan.`,
        ] },
        { t: 'pageBreak' },

        // Halaman 4: Spesies Rayap & Susunan Koloni Rayap
        { t: 'h', text: 'Spesies Rayap' },
        { t: 'p', text: 'Terdapat kurang lebih 200 spesies rayap yang ada di Indonesia, namun hanya sedikit yang sering menyebabkan masalah, diantaranya :' },
        { t: 'bulletCols', cols: 2, items: [
            '<i>Coptotermes Gestroi</i>', '<i>Macrotermes Gilvus</i>',
            '<i>Coptotermes Curvignatus</i>', '<i>Macrotermes Pakistanicus</i>',
            '<i>Coptotermes Havilandi</i>', '<i>Globitermes sulphureus</i>',
            '<i>Coptotermes Kalshoven</i>', '<i>Schedorhinotermes sp.</i>',
            '<i>Coptotermes Sepangensis</i>', '<i>Microtermes sp</i>',
        ] },
        { t: 'gap', mm: 2 },
        { t: 'p', text: 'Hampir 90% kerusakan property dan perabot rumah di Indonesia disebabkan oleh spesies <i>Coptotermes</i>.' },
        { t: 'h', text: 'Susunan Koloni Rayap.' },
        { t: 'bullets', marker: '•', items: [
            '<b>Ratu Rayap</b> — Ratu Rayap memiliki tugas khusus untuk bereproduksi. Ratu Rayap yang siklus awalnya sebagai laron, mereka jatuh melepaskan sayapnya dan mencari pasangan untuk berkembang biak.',
            '<b>Rayap Prajurit</b> — Rayap prajurit memiliki tugas untuk mempertahankan koloni dari serangan musuh seperti semut.',
            '<b>Rayap Pekerja</b> — Adalah jenis dengan jumlah terbesar dalam suatu koloni. Mereka melakukan pekerjaan termasuk memberi makan, merawat koloni, menggali sarang dan membuat terowongan.',
            '<b>Laron/Rayap Reproduktif</b> — Laron atau alate adalah jenis rayap reproduktif bersayap yang keluar dari sarang untuk mendirikan koloni baru. Laron jantan dan betina akan berpasang dan mencari tempat yang cocok untuk bereproduksi.',
        ] },
        { t: 'pageBreak' },

        // Halaman 5: Metode Pengendalian Anti Rayap Pra-Konstruksi (SNI 03-2404-2000)
        { t: 'h', text: 'Metode Pengendalian Anti Rayap Pra-Konstruksi' },
        { t: 'h', text: '(Sesuai Standart Dep. PU. SK. SNI 03-2404-2000)' },
        { t: 'gap', mm: 1.5 },
        { t: 'p', text: 'Pengendalian rayap pada bangunan Pra-Konstruksi atau melakukan <i>treatment</i> tanah dengan cara membuat <b>penghalang (<i>barrier</i>)</b> menggunakan racun anti-rayap antara tanah dan struktur bangunan sebagai perlindungan terhadap kerusakan yang disebabkan oleh Rayap tanah. Pekerjaan ini dilakukan sebelum Gedung dibangun. Dengan penggunaan <b><i>Nozzle Spray Hydraulic</i></b>, pada lokasi konstruksi di aplikasikan <b>larutan racun anti-rayap</b> dengan bahan dasar air, pekerjaan dilakukan sebelum memasukan slab konkrit. <b>Anti-Rayap <i>non-repellent</i> membunuh rayap tanah melalui kontak dan memakannya.</b> Dengan memanfaatkan perilaku rayap berupa <b><i>Trophallaxis</i></b> dimana sesama penghuni koloni rayap akan melakukan <i>grooming</i> sehingga racun akan berpindah dari satu rayap, ke rayap lainnya dan racun akan <b>membunuh rayap secara perlahan.</b> Treatment ini kurang efektif apabila dilakukan pada tanah jenuh atau terlalu basah yang disebabkan seringnya turun hujan.' },
        { t: 'gap', mm: 2 },
        { t: 'p', text: 'Treatment ini bertujuan untuk membuat rintangan kimia didalam tanah/sekeliling pondasi bangunan agar rayap tidak dapat naik dan sekaligus memutus rayap pekerja dengan ratunya yang ada di dalam tanah.' },
        { t: 'h', text: 'Teknis Kerja Anti Rayap Pra Konstruksi (Soil Treatment) :' },
        { t: 'bullets', marker: '-', items: [
            'Pemaparan larutan termitisida pada permukaan tanah sebelum pemasangan lantai kerja dengan dosis 5 liter larutan termitisida per 1 m².',
            'Penginjeksian larutan termitisida pada <i>sloof</i> pondasi dengan jarak injeksi 40 – 50 cm dengan dosis 2,5 s.d 3 liter per titik.',
            'Membersihkan bekas-bekas pekerjaan anti rayap.',
            'Bahan aktif yang digunakan adalah <i>Cypermethrin</i> dengan merek dagang Cypergard, kemasan @500 ml, dosis 10 ml per 1 liter air.',
        ] },
    ];
}

export function programPest(company: string): PdfBlock[] {
    return [
        { t: 'title', text: 'I. <i>PEST CONTROL</i>' },
        { t: 'h', text: 'Hama yang dikendalikan :' },
        { t: 'kv', marker: '-', labelW: 22, rows: [
            ['Nyamuk', 'Nyamuk <i>Culex sp.</i>, Nyamuk Malaria (<i>Anopheles</i>) & Nyamuk Demam Berdarah (<i>Aedes aegypti</i>)'],
            ['Kecoa', 'Kecoa Jerman (<i>Blatella germanica</i>), Kecoa Amerika (<i>Periplaneta Americana</i>)'],
            ['Lalat', 'Lalat Hijau (<i>Calliphoridae</i>), Lalat Biru (<i>Protocalliphora</i>), Lalat Rumah (<i>Musca Domestica</i>)'],
        ] },
        { t: 'gap' },
        { t: 'h', text: 'Teknik Pelaksanaan :' },
        { t: 'bullets', items: [
            'Melakukan pengasapan (<i>fogging</i>) pada seluruh area luar gedung (<i>outdoor</i>) dengan menggunakan <i>Thermal Fogging</i>.',
            'Melakukan penyemprotan pada bagian luar gedung, saluran drainage, parit, semak/taman, got dan bak sampah dengan mengunakan B&G.',
            'Melakukan penyemprotan residual pada dinding di bagian dalam gedung (<i>indoor</i>) dengan mengunakan ULV.',
        ] },
        { t: 'gap' },
        { t: 'h', text: 'Pestisida yang digunakan :' },
        { t: 'p', text: 'Pestisida yang digunakan adalah pestisida khusus hygienic pest control (standart DKK DKI) yaitu: <i>Sinthetic Phirithroit</i>.' },
        { t: 'gap' },
        { t: 'h', text: 'Peralatan yang digunakan :' },
        { t: 'p', text: 'Alat yang digunakan:', justify: false },
        { t: 'bulletCols', cols: 2, items: ['U L V', '<i>Thermal fogger</i>', 'B&G'] },
        { t: 'p', text: 'Alat keselamatan kerja:', justify: false },
        { t: 'bulletCols', cols: 1, items: K3_UMUM.map(s => s.replace('{company}', company)) },
    ];
}

/** Rodent control sebagai bagian paket kontrak (II. RODENT CONTROL - sesuai PDF 0003 PLN Bulungan). */
export function programRodentKontrak(company: string): PdfBlock[] {
    return [
        { t: 'title', text: 'II. RODENT CONTROL' },
        { t: 'kv', marker: '', labelW: 40, rows: [
            ['Hama yang dikendalikan', 'Tikus got (<i>Rattus norvegicus</i>), tikus rumah (<i>Mus muscullus</i>) dan tikus atap (<i>Rattus rattus</i>), celurut (<i>Suncus murinus</i>), tikus wirok (<i>Bandicota indica</i>).'],
        ] },
        { t: 'gap' },
        { t: 'h', text: 'Teknik Pelaksanaan' },
        { t: 'p', text: 'Teknik pengendalian yang digunakan merupakan teknik standar yang sudah direkomendasi oleh Dinas Kesehatan.' },
        { t: 'h', text: 'Rodent Control: (8 kali kunjungan pengendalian tikus per periode)' },
        { t: 'bullets', items: [
            'Peletakan/pemberian umpan/racun tikus pada posisi-posisi yang sering dilalui tikus dan sekitarnya.',
            'Pemasangan perangkap dan lem tikus selama masa periode pengendalian.',
            'Pengontrolan dan penggantian umpan/racun tikus.',
            'Pembuangan bangkai tikus',
        ] },
        { t: 'p', text: '<b>Pestisida yang digunakan:</b> Brodifacum, Glue dan Bait', justify: false },
        { t: 'p', text: 'Note: Untuk pemasangan perangkap, lem dan baiting system disesuaikan dengan kondisi di lapangan, untuk jenis umpan bisa dipelajari dari kebiasaan makan tikus itu sendiri.' },
        { t: 'gap' },
        { t: 'h', text: 'Saran Pengendalian' },
        { t: 'p', text: 'Tikus adalah hama endemik pemukiman yang datang dari mana saja akibat dari adanya koloni manusia atau hewan peliharaan, sehingga pengendalian tikus harus dilakukan secara terus menerus.' },
        { t: 'gap' },
    ];
}

/** Rodent control berdiri sendiri (metode pelaksanaan + saran). Biaya & pembayaran disisipkan renderer. */
export function programRodentStandalone(): PdfBlock[] {
    return [
        { t: 'title', text: 'METODE PELAKSANAAN RODENT CONTROL', underline: true },
        { t: 'h', text: 'Hama yang dikendalikan' },
        { t: 'kv', marker: '', labelW: 14, rows: [['Tikus', 'tikus got (<i>Rattus norvegicus</i>), tikus rumah (<i>Mus Musculus</i>) dan tikus atap (<i>Rattus rattus</i>).']] },
        { t: 'gap' },
        { t: 'h', text: 'Teknik pengendalian tikus' },
        { t: 'bullets', items: [
            'Peletakan/pemberian umpan / racun tikus pada posisi-posisi yang sering dilalui tikus dan sekitarnya.',
            'Pemasangan perangkap dan lem tikus selama masa periode pengendalian',
            'Pengontrolan dan penggantian umpan/racun tikus.',
        ] },
        { t: 'p', text: '<b>Pestisida yang digunakan:</b> <i>Brodifacum</i>, <i>Glue</i> dan <i>Bait</i>' },
        { t: 'p', text: 'Note: Untuk selebihnya pemasangan perangkap, dan lem disesuaikan dengan kondisi di lapangan, untuk jenis umpan bisa di pelajari dari kebiasaan makan tikus itu sendiri.' },
        { t: 'gap' },
        { t: 'h', text: 'Saran pengendalian:' },
        { t: 'p', text: 'Tikus adalah hama endemik pemukiman yang datang dari mana saja akibat dari adanya koloni manusia atau hewan peliharaan, sehingga pengendalian tikus harus dilakukan secara terus menerus.' },
        { t: 'gap' },
    ];
}

export const PENGONTROLAN_AR = [
    '<b>Pengontrolan I</b> dilakukan 1 bulan, setelah pekerjaan selesai.',
    '<b>Pengontrolan II</b> dilakukan 3 bulan, setelah pekerjaan selesai.',
    '<b>Pengontrolan III</b> dilakukan 6 bulan, setelah pekerjaan selesai.',
    '<b>Pengontrolan IV</b> dst dilakukan setelah pengontrolan ke III, dan 6 bulan sekali sampai garansi habis masa berlakunya.',
];

export const PEMBAYARAN_AR_DUA_TAHAP = [
    'Tahap I, sebesar 50 % dari nilai kontrak, dibayar saat penandatanganan surat kontrak.',
    'Tahap II, sebesar 50 % dari nilai kontrak, dibayarkan setelah pekerjaan anti rayap selesai.',
];

export const JASA_LABEL: Record<string, string> = {
    anti_rayap_injeksi: 'Jasa Anti Rayap',
    anti_rayap_pipanisasi: 'Jasa Anti Rayap (Injeksi Pipa)',
    anti_rayap_baiting: 'Jasa Anti Rayap (Baiting System)',
    anti_rayap_soil: 'Jasa Anti Rayap',
    anti_rayap_fumigasi: 'Jasa Fumigasi Anti Rayap',
};
