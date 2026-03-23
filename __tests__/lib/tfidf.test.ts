import {
  tokenize,
  tokenizeSet,
  computeTfIdf,
  topK,
  parseTfidfTerms,
  tokenSimilarity,
  contentSimilarity,
  computeDotProduct,
  STOP_WORDS,
} from '@/lib/tfidf'

describe('STOP_WORDS', () => {
  it('contains common English words', () => {
    expect(STOP_WORDS.has('the')).toBe(true)
    expect(STOP_WORDS.has('and')).toBe(true)
    expect(STOP_WORDS.has('of')).toBe(true)
  })
})

describe('tokenizeSet', () => {
  it('returns unigrams only, lowercased', () => {
    const result = tokenizeSet('Hello World')
    expect(result).toEqual(new Set(['hello', 'world']))
  })

  it('strips stop words', () => {
    const result = tokenizeSet('the quick brown fox')
    expect(result.has('the')).toBe(false)
    expect(result.has('quick')).toBe(true)
    expect(result.has('brown')).toBe(true)
    expect(result.has('fox')).toBe(true)
  })

  it('strips punctuation', () => {
    const result = tokenizeSet('AI, ML, and NLP!')
    expect(result.has('ai')).toBe(true)
    expect(result.has('ml')).toBe(true)
    expect(result.has('nlp')).toBe(true)
    expect(result.has('and')).toBe(false)
  })

  it('filters single-character tokens', () => {
    const result = tokenizeSet('a b c hello')
    expect(result.has('a')).toBe(false)
    expect(result.has('b')).toBe(false)
    expect(result.has('hello')).toBe(true)
  })

  it('returns empty set for empty string', () => {
    expect(tokenizeSet('')).toEqual(new Set())
  })

  it('returns empty set for stop-word-only input', () => {
    expect(tokenizeSet('the and of')).toEqual(new Set())
  })
})

describe('tokenize', () => {
  it('includes both unigrams and bigrams', () => {
    const result = tokenize('apple watch review')
    expect(result).toContain('apple')
    expect(result).toContain('watch')
    expect(result).toContain('review')
    expect(result).toContain('apple watch')
    expect(result).toContain('watch review')
  })

  it('does not include stop words in bigrams', () => {
    // "the" is removed, so "apple the watch" → tokens ["apple","watch"] → bigram ["apple watch"]
    const result = tokenize('apple the watch')
    expect(result).toContain('apple watch')
    expect(result.some(t => t.includes('the'))).toBe(false)
  })

  it('returns empty array for empty string', () => {
    expect(tokenize('')).toEqual([])
  })

  it('returns only unigrams for single-word input', () => {
    const result = tokenize('hello')
    expect(result).toEqual(['hello'])
  })

  it('has correct count: 3 words → 3 unigrams + 2 bigrams = 5 tokens', () => {
    const result = tokenize('generative artificial intelligence')
    expect(result.length).toBe(5)
  })
})

describe('computeTfIdf', () => {
  it('returns empty array for empty terms', () => {
    expect(computeTfIdf([], new Map(), 100)).toEqual([])
  })

  it('returns non-zero scores for all unique terms', () => {
    const terms = ['apple', 'watch', 'apple']
    const docFreqs = new Map([['apple', 5], ['watch', 1]])
    const result = computeTfIdf(terms, docFreqs, 100)
    expect(result.length).toBe(2)
    result.forEach(r => expect(r.score).toBeGreaterThan(0))
  })

  it('rare term scores higher than common term', () => {
    const terms = ['elden', 'ring', 'game']
    const docFreqs = new Map([
      ['elden', 1],   // rare
      ['ring', 1],    // rare
      ['game', 90],   // common
    ])
    const result = computeTfIdf(terms, docFreqs, 100)
    const gameSc = result.find(r => r.term === 'game')!.score
    const eldenSc = result.find(r => r.term === 'elden')!.score
    expect(eldenSc).toBeGreaterThan(gameSc)
  })

  it('term appearing more often in doc scores higher (TF portion)', () => {
    const terms = ['apple', 'apple', 'watch'] // apple appears twice
    const docFreqs = new Map([['apple', 5], ['watch', 5]])
    const result = computeTfIdf(terms, docFreqs, 100)
    const appleSc = result.find(r => r.term === 'apple')!.score
    const watchSc = result.find(r => r.term === 'watch')!.score
    expect(appleSc).toBeGreaterThan(watchSc)
  })

  it('does not throw when N is 0', () => {
    expect(() => computeTfIdf(['test'], new Map(), 0)).not.toThrow()
  })

  it('handles unknown terms (df=0) without crashing', () => {
    const terms = ['unknown']
    const result = computeTfIdf(terms, new Map(), 100)
    expect(result.length).toBe(1)
    expect(result[0].score).toBeGreaterThan(0)
  })
})

describe('topK', () => {
  const mockScored = [
    { term: 'apple', score: 0.8 },
    { term: 'watch', score: 0.5 },
    { term: 'review', score: 0.2 },
    { term: 'pro', score: 0.9 },
  ]

  it('returns exactly K items when K < length', () => {
    expect(topK(mockScored, 2)).toHaveLength(2)
  })

  it('returns all items when K > length', () => {
    expect(topK(mockScored, 100)).toHaveLength(4)
  })

  it('returns items sorted by score descending', () => {
    const result = topK(mockScored, 4)
    expect(result[0]).toMatch(/^pro:/)
    expect(result[1]).toMatch(/^apple:/)
  })

  it('formats output as "term:score" with 4 decimal places', () => {
    const result = topK([{ term: 'test', score: 0.123456 }], 1)
    expect(result[0]).toBe('test:0.1235')
  })

  it('returns empty array for empty input', () => {
    expect(topK([], 5)).toEqual([])
  })

  it('handles default K=15', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ term: `t${i}`, score: i * 0.1 }))
    expect(topK(many)).toHaveLength(15)
  })
})

describe('parseTfidfTerms', () => {
  it('parses "term:score" strings correctly', () => {
    const result = parseTfidfTerms(['apple:0.8000', 'watch:0.5000'])
    expect(result.get('apple')).toBeCloseTo(0.8)
    expect(result.get('watch')).toBeCloseTo(0.5)
  })

  it('handles bigram terms (space in term)', () => {
    const result = parseTfidfTerms(['apple watch:0.7500'])
    expect(result.get('apple watch')).toBeCloseTo(0.75)
  })

  it('returns empty map for empty input', () => {
    expect(parseTfidfTerms([])).toEqual(new Map())
  })

  it('skips malformed entries (no colon)', () => {
    const result = parseTfidfTerms(['nocodon', 'valid:0.5'])
    expect(result.size).toBe(1)
    expect(result.get('valid')).toBeCloseTo(0.5)
  })

  it('skips entries where score is NaN', () => {
    const result = parseTfidfTerms(['term:notanumber'])
    expect(result.size).toBe(0)
  })
})

describe('tokenSimilarity', () => {
  it('returns 1.0 for identical sets', () => {
    const s = new Set(['apple', 'watch'])
    expect(tokenSimilarity(s, s)).toBe(1.0)
  })

  it('returns 0 for disjoint sets', () => {
    expect(tokenSimilarity(new Set(['apple']), new Set(['samsung']))).toBe(0)
  })

  it('returns 0 for empty sets', () => {
    expect(tokenSimilarity(new Set(), new Set(['a']))).toBe(0)
    expect(tokenSimilarity(new Set(['a']), new Set())).toBe(0)
  })

  it('returns partial overlap correctly', () => {
    const a = new Set(['a', 'b', 'c'])
    const b = new Set(['b', 'c', 'd'])
    // overlap = {b,c} = 2, max(3,3) = 3, so 2/3
    expect(tokenSimilarity(a, b)).toBeCloseTo(2 / 3)
  })
})

describe('contentSimilarity', () => {
  it('uses only title when summaries absent', () => {
    const sim = contentSimilarity('Apple Watch Review', 'Apple Watch Review')
    expect(sim).toBeCloseTo(1.0)
  })

  it('returns title similarity when clearly duplicate (>= 0.3)', () => {
    // Short titles with high overlap — similarity should be >= 0.3 on title alone
    const sim = contentSimilarity('elden ring new dlc', 'elden ring dlc released')
    expect(sim).toBeGreaterThanOrEqual(0.3)
  })

  it('blends summary when title sim is in 0.15–0.30 range and both summaries exist', () => {
    // Different titles, same-ish summaries
    const titleA = 'iPhone revealed today'
    const titleB = 'Apple announces product launch'
    const summaryA = 'Apple announced the new iPhone at a special event held in San Francisco'
    const summaryB = 'Apple revealed the new iPhone model at its San Francisco product launch event'

    const simWithSummary = contentSimilarity(titleA, titleB, summaryA, summaryB)
    const simTitleOnly = contentSimilarity(titleA, titleB)
    // With matching summaries the blended score should be >= title-only
    expect(simWithSummary).toBeGreaterThanOrEqual(simTitleOnly)
  })

  it('falls back to title-only when one summary is absent', () => {
    const sim1 = contentSimilarity('title a', 'title b', 'summary a', undefined)
    const sim2 = contentSimilarity('title a', 'title b')
    expect(sim1).toBe(sim2)
  })
})

describe('computeDotProduct', () => {
  it('returns 0 for empty maps', () => {
    expect(computeDotProduct(new Map(), new Map())).toBe(0)
  })

  it('returns 0 when no shared terms', () => {
    const articleTerms = new Map([['apple', 0.8]])
    const userInterest = new Map([['samsung', 1.5]])
    expect(computeDotProduct(articleTerms, userInterest)).toBe(0)
  })

  it('returns correct dot product for shared terms', () => {
    const articleTerms = new Map([['apple', 0.8], ['watch', 0.5]])
    const userInterest = new Map([['apple', 2.0], ['watch', 1.0]])
    // 0.8 * 2.0 + 0.5 * 1.0 = 1.6 + 0.5 = 2.1
    expect(computeDotProduct(articleTerms, userInterest)).toBeCloseTo(2.1)
  })

  it('ignores article terms not in user profile', () => {
    const articleTerms = new Map([['apple', 0.8], ['unknown', 0.5]])
    const userInterest = new Map([['apple', 2.0]])
    expect(computeDotProduct(articleTerms, userInterest)).toBeCloseTo(1.6)
  })
})
