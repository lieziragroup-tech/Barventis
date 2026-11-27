/**
 * Kalkulator Rumus Volume Survey Lapangan (Safe Deterministic Recursive-Descent Parser)
 *
 * Mendukung penulisan rincian ukuran lapangan seperti pada PDF resmi PT Guci Emas Pratama
 * (contoh: 0022 - Bank Victoria Cabang Fatmawati):
 *   - "37+37+5,5+9+6+5"                                          -> 99.5
 *   - "1,5+1,5+2,5+3,5+9+3+3+3+3,5+4"                            -> 34.5
 *   - "37 x 9 x 4"                                               -> 1332
 *   - "(7+7+5+3+13+6+3+3+30+5+5+5+5+2+4+4+37+5+5+5+3+3+22+22) x 3" -> 627
 *
 * TANPA eval() atau new Function() sehingga 100% aman dari code injection & CSP.
 */

export interface VolumeEvalResult {
    isValid: boolean;
    value: number;
    normalizedDisplay: string;
    error?: string;
}

/**
 * Mengubah ekspresi ukuran berformat Indonesia (desimal koma `,`, kali `x` / `×`, bagi `:`)
 * menjadi ekspresi standar yang siap dihitung sekaligus tampilan rapi untuk tabel PDF.
 */
export function normalizeVolumeFormulaDisplay(raw: string): string {
    return raw
        .trim()
        .replace(/\*/g, ' x ')
        .replace(/×/g, ' x ')
        .replace(/\s*[xX]\s*/g, ' x ')
        .replace(/\s*\+\s*/g, '+')
        .replace(/\s+/g, ' ');
}

/**
 * Mengevaluasi rumus volume secara aman.
 */
export function evaluateVolumeFormula(raw: string): VolumeEvalResult {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) {
        return { isValid: false, value: 0, normalizedDisplay: '' };
    }

    // Ganti koma desimal Indonesia (contoh: 5,5 -> 5.5), simbol kali (x, X, × -> *), simbol bagi (: -> /)
    const expr = trimmed
        .replace(/(\d),(\d)/g, '$1.$2')
        .replace(/[xX×]/g, '*')
        .replace(/:/g, '/')
        .replace(/\s+/g, '');

    // Hanya karakter angka, titik desimal, operator +-*/, dan tanda kurung () yang diizinkan
    if (!/^[0-9.+\-*/()]+$/.test(expr)) {
        return {
            isValid: false,
            value: 0,
            normalizedDisplay: normalizeVolumeFormulaDisplay(trimmed),
            error: 'Rumus hanya boleh berisi angka, koma/titik, +, -, x, /, dan tanda kurung ().',
        };
    }

    let pos = 0;

    function peek(): string {
        return expr[pos] ?? '';
    }

    function consume(): string {
        return expr[pos++] ?? '';
    }

    function parseExpression(): number {
        let left = parseTerm();
        while (peek() === '+' || peek() === '-') {
            const op = consume();
            const right = parseTerm();
            left = op === '+' ? left + right : left - right;
        }
        return left;
    }

    function parseTerm(): number {
        let left = parseFactor();
        while (peek() === '*' || peek() === '/') {
            const op = consume();
            const right = parseFactor();
            if (op === '/') {
                if (right === 0) throw new Error('Pembagian dengan nol');
                left = left / right;
            } else {
                left = left * right;
            }
        }
        return left;
    }

    function parseFactor(): number {
        if (peek() === '+') {
            consume();
            return parseFactor();
        }
        if (peek() === '-') {
            consume();
            return -parseFactor();
        }
        if (peek() === '(') {
            consume(); // '('
            const val = parseExpression();
            if (peek() !== ')') throw new Error('Kurung tutup ")" belum lengkap');
            consume(); // ')'
            return val;
        }
        const start = pos;
        let dotCount = 0;
        while (pos < expr.length && ((expr[pos] >= '0' && expr[pos] <= '9') || expr[pos] === '.')) {
            if (expr[pos] === '.') dotCount++;
            if (dotCount > 1) throw new Error('Format angka desimal tidak valid');
            pos++;
        }
        if (start === pos) {
            throw new Error('Angka tidak lengkap pada rumus');
        }
        const num = Number(expr.slice(start, pos));
        if (!Number.isFinite(num)) throw new Error('Angka tidak valid');
        return num;
    }

    try {
        const result = parseExpression();
        if (pos < expr.length) {
            return {
                isValid: false,
                value: 0,
                normalizedDisplay: normalizeVolumeFormulaDisplay(trimmed),
                error: 'Sintaks rumus belum selesai',
            };
        }
        const rounded = Math.round(result * 100) / 100;
        if (!Number.isFinite(rounded) || rounded < 0) {
            return {
                isValid: false,
                value: 0,
                normalizedDisplay: normalizeVolumeFormulaDisplay(trimmed),
                error: 'Hasil volume tidak boleh negatif',
            };
        }
        return {
            isValid: true,
            value: rounded,
            normalizedDisplay: normalizeVolumeFormulaDisplay(trimmed),
        };
    } catch (err) {
        return {
            isValid: false,
            value: 0,
            normalizedDisplay: normalizeVolumeFormulaDisplay(trimmed),
            error: err instanceof Error ? err.message : 'Rumus tidak valid',
        };
    }
}

/**
 * Memformat angka volume gaya Indonesia ("99,5", "1.332").
 */
export function formatVolumeID(n: number): string {
    if (!Number.isFinite(n)) return '0';
    const rounded = Math.round(n * 100) / 100;
    const [intPart, decPart] = String(rounded).split('.');
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return decPart ? `${formattedInt},${decPart}` : formattedInt;
}
