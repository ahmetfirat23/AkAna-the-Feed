// lib/tfidf.ts — TF-IDF utilities for article feature extraction

export const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'has', 'have', 'had', 'will', 'would', 'could', 'should', 'may', 'might',
  'it', 'its', 'this', 'that', 'as', 'up', 'out', 'if', 'about', 'into',
  'not', 'no', 'so', 'do', 'did', 'does', 'how', 'what', 'why', 'when',
  'who', 'which', 'than', 'then', 'now', 'just', 'also', 'more', 'new',
])

/** Unigrams only (no bigrams), returned as a Set — used for duplicate detection. */
export function tokenizeSet(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 1 && !STOP_WORDS.has(w)),
  )
}

/**
 * Tokenize text into unigrams + bigrams (consecutive pairs of meaningful words),
 * with stop words filtered. Returns an array that may contain duplicates (needed
 * for TF calculation).
 */
export function tokenize(text: string): string[] {
  const words = Array.from(tokenizeSet(text))
  const tokens: string[] = [...words]
  for (let i = 0; i < words.length - 1; i++) {
    tokens.push(`${words[i]} ${words[i + 1]}`)
  }
  return tokens
}

/**
 * Compute TF-IDF scores for each unique term in the given token list.
 * Uses smoothed IDF: log((N+1) / (df+1)) + 1 to avoid zero IDF.
 *
 * @param terms    result of tokenize() — may contain duplicates
 * @param docFreqs map of term → global document frequency from tfidf_stats
 * @param N        total number of documents in corpus
 */
export function computeTfIdf(
  terms: string[],
  docFreqs: Map<string, number>,
  N: number,
): { term: string; score: number }[] {
  if (terms.length === 0) return []

  const termCounts = new Map<string, number>()
  for (const t of terms) {
    termCounts.set(t, (termCounts.get(t) ?? 0) + 1)
  }

  const safeN = Math.max(N, 1)
  const result: { term: string; score: number }[] = []

  for (const [term, count] of termCounts) {
    const tf = count / terms.length
    const df = docFreqs.get(term) ?? 0
    const idf = Math.log((safeN + 1) / (df + 1)) + 1
    result.push({ term, score: tf * idf })
  }

  return result
}

/**
 * Select top-K scored terms, returned as "term:score" strings (4 decimal places).
 * Safe if scored.length < k — returns all items.
 */
export function topK(scored: { term: string; score: number }[], k = 15): string[] {
  return [...scored]
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ term, score }) => `${term}:${score.toFixed(4)}`)
}

/**
 * Parse stored "term:score" strings back to a Map<term, score>.
 * Uses lastIndexOf(':') so terms with colons in them (rare but possible) parse correctly.
 */
export function parseTfidfTerms(tfidfTerms: string[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const entry of tfidfTerms) {
    const idx = entry.lastIndexOf(':')
    if (idx === -1) continue
    const term = entry.slice(0, idx)
    const score = parseFloat(entry.slice(idx + 1))
    if (!isNaN(score)) map.set(term, score)
  }
  return map
}

/**
 * Compute word-overlap similarity between two token sets.
 * Returns a value in [0, 1].
 */
export function tokenSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0
  let overlap = 0
  for (const word of setA) {
    if (setB.has(word)) overlap++
  }
  return overlap / Math.max(setA.size, setB.size)
}

/**
 * Combined content similarity: title-only when either summary is absent, or
 * a weighted blend (0.7 × title + 0.3 × summary) when both summaries exist and
 * the title similarity is in the borderline zone (0.15–0.30).
 *
 * Threshold for "is duplicate" is still > 0.3 at the call site.
 */
export function contentSimilarity(
  titleA: string,
  titleB: string,
  summaryA?: string | null,
  summaryB?: string | null,
): number {
  const titleSim = tokenSimilarity(tokenizeSet(titleA), tokenizeSet(titleB))

  if (titleSim >= 0.3) return titleSim   // already a clear duplicate

  if (titleSim >= 0.15 && summaryA && summaryB) {
    const summarySim = tokenSimilarity(tokenizeSet(summaryA), tokenizeSet(summaryB))
    return 0.7 * titleSim + 0.3 * summarySim
  }

  return titleSim
}

/**
 * Compute the dot product between an article's TF-IDF term map and a user
 * interest profile map. Returns a raw (unnormalised) score.
 */
export function computeDotProduct(
  articleTerms: Map<string, number>,
  userInterest: Map<string, number>,
): number {
  let sum = 0
  for (const [term, tfidfScore] of articleTerms) {
    const userScore = userInterest.get(term) ?? 0
    if (userScore !== 0) sum += tfidfScore * userScore
  }
  return sum
}
