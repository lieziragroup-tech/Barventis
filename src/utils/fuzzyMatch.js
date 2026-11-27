/**
 * String Similarity & Fuzzy Matching Utility for POS Menu to Recipe/Materials Mapping
 * Pure functions — zero external dependencies, ultra-fast client-side execution (<5ms).
 */

const NOISE_WORDS = [
  '\\(minuman\\)',
  '\\(ice\\)',
  '\\(hot\\)',
  '\\(add\\)',
  '\\(coffee\\)',
  '\\(manis/tawar\\)',
  '\\(pck\\)',
  '\\(btl\\)',
  '\\b330ml\\b',
  '\\b500ml\\b',
  '\\b220ml\\b',
  '\\b330\\b',
  '\\b500\\b',
  '\\b220\\b',
  '\\bsmall\\b',
  '\\blarge\\b',
  '\\bpot\\b',
  '\\bby\\b',
  '\\bice\\b',
  '\\bhot\\b',
  '\\bdingin\\b',
  '\\bpanas\\b'
];

const NOISE_REGEX = new RegExp(NOISE_WORDS.join('|'), 'gi');

/**
 * Normalizes a menu string by removing temperature variants, serving sizes, and punctuation.
 * @param {string} str
 * @returns {string}
 */
export function sanitizeMenuName(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(NOISE_REGEX, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Calculates Levenshtein edit distance between two strings.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val = a[i - 1] === b[j - 1] ? row[j - 1] : Math.min(row[j - 1], prev, row[j]) + 1;
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

/**
 * Calculates Dice's bigram coefficient for token/word similarity.
 * @param {string} a
 * @param {string} b
 * @returns {number} (0.0 to 1.0)
 */
export function bigramSimilarity(a, b) {
  if (!a.length || !b.length) return 0;
  if (a === b) return 1;
  if (a.length === 1 || b.length === 1) return a === b ? 1 : 0;

  const getBigrams = (str) => {
    const s = new Set();
    for (let i = 0; i < str.length - 1; i++) {
      s.add(str.slice(i, i + 2));
    }
    return s;
  };

  const bgA = getBigrams(a);
  const bgB = getBigrams(b);
  let intersection = 0;
  for (const bg of bgA) {
    if (bgB.has(bg)) intersection++;
  }
  return (2 * intersection) / (bgA.size + bgB.size);
}

/**
 * Calculates combined similarity score (0.0 to 1.0) using normalized Levenshtein & Bigram.
 * @param {string} s1
 * @param {string} s2
 * @returns {number}
 */
export function calculateSimilarity(s1, s2) {
  const clean1 = sanitizeMenuName(s1);
  const clean2 = sanitizeMenuName(s2);

  if (!clean1 || !clean2) return 0;
  if (clean1 === clean2) return 1.0;

  // Exact substring match bonus (e.g. "Americano" inside "Americano (Ice)")
  if (clean1.includes(clean2) || clean2.includes(clean1)) {
    const ratio = Math.min(clean1.length, clean2.length) / Math.max(clean1.length, clean2.length);
    return Math.max(0.85, Number((0.85 + ratio * 0.15).toFixed(2)));
  }

  // Token set matching (handles word reordering like "Draft Beer Bali Hai" vs "Bali Hai Draft Beer")
  const tokens1 = new Set(clean1.split(/\s+/).filter(Boolean));
  const tokens2 = new Set(clean2.split(/\s+/).filter(Boolean));
  let tokenMatchCount = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) {
      tokenMatchCount++;
    } else {
      for (const t2 of tokens2) {
        if (t.includes(t2) || t2.includes(t)) {
          tokenMatchCount += 0.8;
          break;
        }
      }
    }
  }
  const tokenJaccard = (2 * tokenMatchCount) / (tokens1.size + tokens2.size);
  if (tokenJaccard >= 0.75) {
    return Number(Math.max(0.78, tokenJaccard).toFixed(2));
  }

  const maxLen = Math.max(clean1.length, clean2.length);
  const levScore = 1 - levenshteinDistance(clean1, clean2) / maxLen;
  const biScore = bigramSimilarity(clean1, clean2);

  const score = tokenJaccard * 0.40 + biScore * 0.35 + levScore * 0.25;
  return Number(Math.max(0, Math.min(1, score)).toFixed(2));
}

/**
 * Finds the best matching recipe/item from target catalog for a given POS menu name.
 * @param {string} posName
 * @param {Array<{ id: any, name: string, category?: string }>} candidates
 * @param {number} minThreshold (default: 0.60)
 * @returns {{ match: object|null, score: number, confidence: 'high'|'medium'|'none' }}
 */
export function findBestMatch(posName, candidates = [], minThreshold = 0.60) {
  if (!posName || !Array.isArray(candidates) || candidates.length === 0) {
    return { match: null, score: 0, confidence: 'none' };
  }

  let best = null;
  let highestScore = 0;

  for (const c of candidates) {
    const targetName = c.name || c.menu_name || '';
    const score = calculateSimilarity(posName, targetName);
    if (score > highestScore) {
      highestScore = score;
      best = c;
    }
  }

  if (highestScore >= 0.80) {
    return { match: best, score: highestScore, confidence: 'high' };
  }
  if (highestScore >= minThreshold) {
    return { match: best, score: highestScore, confidence: 'medium' };
  }
  return { match: null, score: highestScore, confidence: 'none' };
}

/**
 * Determines whether a POS item is likely an add-on, free perk, or non-BOM item.
 * @param {string} name
 * @returns {boolean}
 */
export function isLikelyAddonOrFree(name) {
  if (!name) return false;
  const lower = name.toLowerCase();
  return (
    lower.includes('(add)') ||
    lower.includes('gratis') ||
    lower.includes('free') ||
    lower.includes('es batu') ||
    lower.includes('ice cube') ||
    lower.includes('kelapa muda batok') ||
    lower.includes('kemasan') ||
    lower.includes('paper bag') ||
    lower.includes('takeaway')
  );
}
