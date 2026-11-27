/** Angka → kata dalam Bahasa Indonesia ("Sebelas Juta Enam Ratus Lima Puluh Lima Ribu"). */
const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];

function words(n: number): string {
    n = Math.floor(n);
    if (n < 12) return SATUAN[n];
    if (n < 20) return words(n - 10) + ' belas';
    if (n < 100) return words(Math.floor(n / 10)) + ' puluh' + (n % 10 ? ' ' + words(n % 10) : '');
    if (n < 200) return 'seratus' + (n - 100 ? ' ' + words(n - 100) : '');
    if (n < 1000) return words(Math.floor(n / 100)) + ' ratus' + (n % 100 ? ' ' + words(n % 100) : '');
    if (n < 2000) return 'seribu' + (n - 1000 ? ' ' + words(n - 1000) : '');
    if (n < 1e6) return words(Math.floor(n / 1000)) + ' ribu' + (n % 1000 ? ' ' + words(n % 1000) : '');
    if (n < 1e9) return words(Math.floor(n / 1e6)) + ' juta' + (n % 1e6 ? ' ' + words(n % 1e6) : '');
    if (n < 1e12) return words(Math.floor(n / 1e9)) + ' miliar' + (n % 1e9 ? ' ' + words(n % 1e9) : '');
    return words(Math.floor(n / 1e12)) + ' triliun' + (n % 1e12 ? ' ' + words(n % 1e12) : '');
}

const titleCase = (s: string) => s.replace(/\b\p{L}/gu, c => c.toUpperCase());

export function terbilang(n: number): string {
    if (!Number.isFinite(n) || n < 0) return '';
    return n === 0 ? 'Nol' : titleCase(words(n));
}

/** 11655000 → "Sebelas Juta Enam Ratus Lima Puluh Lima Ribu Rupiah" */
export function terbilangRupiah(n: number): string {
    return `${terbilang(Math.round(n))} Rupiah`;
}
