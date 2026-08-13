/** Strategic-originality utilities: fingerprinting and lexical similarity of content ideas. */

const STOPWORDS = new Set([
  "the","a","an","and","or","of","for","to","in","on","with","that","this","is","are","be","as","by","from",
  "how","why","what","when","it","its","your","you","we","our","their","at","into","more","than","can","using",
  "use","make","makes","creates","create","design","designs","designed",
]);

export function fingerprintTerms(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .map(stem);
  return Array.from(new Set(words)).sort();
}

/** Very small suffix stemmer — enough to collapse clarity/clear, mixers/mixer, mounted/mounting. */
function stem(word: string): string {
  return word
    .replace(/(ings|ing|ities|ity|ness|ments|ment|ions|ion|ers|er|ies|ed|es|s)$/u, "")
    .replace(/(clarit|clear|clean)/u, "clar");
}

export function contentFingerprint(parts: string[]): string {
  return fingerprintTerms(parts.join(" ")).slice(0, 24).join("-");
}

/** Jaccard similarity of two fingerprints (0 = unrelated, 1 = identical idea). */
export function similarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  let shared = 0;
  for (const t of new Set(a)) if (setB.has(t)) shared += 1;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : shared / union;
}

export const SIMILARITY_LIMIT = 0.45;

export function maxSimilarity(terms: string[], previous: string[][]): number {
  return previous.reduce((max, prev) => Math.max(max, similarity(terms, prev)), 0);
}
