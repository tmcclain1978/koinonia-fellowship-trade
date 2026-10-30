
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ScannerFilters {
  minPrice: number
  maxPrice: number
  minVolume: number
  maxFloat?: number
  patterns?: string[]
  // New advanced filters
  unusualVolumeOnly?: boolean      // Require volume ≥ 3 std devs above mean
  floatRotationMin?: number        // Min % of float traded today
  accumulationDetect?: boolean     // Detect accumulation patterns
  preLaunchOnly?: boolean          // Focus on coiled springs (low price move + high volume)
}

interface PennyStockCandidate {
  symbol: string
  companyName: string
  price: number
  changePercent: number
  volume: number
  avgVolume: number
  relativeVolume: number
  marketCap: number
  floatShares: number
  shortInterest: number
  technicals: {
    rsi: number
    vwap: number
    sma20: number
    ema9: number
    ema20: number
    momentum5d: number
    nearHigh52w: boolean
    aboveVwap: boolean
    emaCrossover: boolean
  }
  patterns: {
    bullFlag: boolean
    flatTopBreakout: boolean
    pennant: boolean
    fishHook: boolean
    gapUp: boolean
  }
  sentiment: {
    score: number
    label: 'Bullish' | 'Bearish' | 'Neutral'
    catalystType: string | null
    headline: string | null
  }
  prediction: {
    breakoutProbability: number
    confidenceRank: 'High' | 'Moderate' | 'Low'
    reasoning: string
    keyFactors: string[]
    riskFlags: string[]
  }
  totalScore: number
  // New advanced metrics
  advancedMetrics?: {
    volumeZScore: number            // How many std devs above mean volume
    floatRotation: number           // % of float traded today
    accumulationScore: number       // 0-100 accumulation vs distribution
    preLaunchScore: number          // Coiled spring / pre-ignition score
    volumeProfile: string           // 'accumulation' | 'distribution' | 'climactic' | 'normal'
    marketStructure: string         // 'basing' | 'breakout' | 'markup' | 'distribution' | 'decline'
    daysSinceBase: number           // Days in consolidation
    compressionRatio: number        // Price range compression (tighter = more explosive)
    smartMoneySignal: boolean       // Unusual block trade / dark pool proxy
  }
}

// ── Technical indicator helpers ──

function calculateRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50
  let gains = 0, losses = 0
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1]
    if (change > 0) gains += change; else losses -= change
  }
  let avgGain = gains / period, avgLoss = losses / period
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1]
    if (change > 0) { avgGain = (avgGain * (period - 1) + change) / period; avgLoss = (avgLoss * (period - 1)) / period }
    else { avgGain = (avgGain * (period - 1)) / period; avgLoss = (avgLoss * (period - 1) - change) / period }
  }
  if (avgLoss === 0) return 100
  return 100 - (100 / (1 + avgGain / avgLoss))
}

function calculateEMA(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1] || 0
  const m = 2 / (period + 1)
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < data.length; i++) ema = (data[i] - ema) * m + ema
  return ema
}

function calculateSMA(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1] || 0
  return data.slice(-period).reduce((a, b) => a + b, 0) / period
}

function calculateVWAP(highs: number[], lows: number[], closes: number[], volumes: number[]): number {
  let tpv = 0, vol = 0
  for (let i = 0; i < highs.length; i++) { tpv += ((highs[i] + lows[i] + closes[i]) / 3) * volumes[i]; vol += volumes[i] }
  return vol > 0 ? tpv / vol : 0
}

// ── NEW: Volume Z-Score (standard deviations above mean) ──

function calculateVolumeZScore(volumes: number[], currentVolume: number): number {
  if (volumes.length < 5) return 0
  const mean = volumes.reduce((a, b) => a + b, 0) / volumes.length
  const variance = volumes.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / volumes.length
  const stdDev = Math.sqrt(variance)
  if (stdDev === 0) return 0
  return (currentVolume - mean) / stdDev
}

// ── NEW: Float Rotation % ──

function calculateFloatRotation(volume: number, floatShares: number): number {
  if (floatShares <= 0) return 0
  return (volume / floatShares) * 100
}

// ── NEW: Accumulation/Distribution Score ──
// Uses price position within bar + volume to determine buying vs selling pressure

function calculateAccumulationScore(opens: number[], highs: number[], lows: number[], closes: number[], volumes: number[]): number {
  if (closes.length < 5) return 50
  const lookback = Math.min(closes.length, 20)
  let adSum = 0, volSum = 0

  for (let i = closes.length - lookback; i < closes.length; i++) {
    const range = highs[i] - lows[i]
    if (range <= 0) continue
    // Close Location Value: +1 = closed at high, -1 = closed at low
    const clv = ((closes[i] - lows[i]) - (highs[i] - closes[i])) / range
    adSum += clv * volumes[i]
    volSum += volumes[i]
  }

  if (volSum === 0) return 50
  // Normalize to 0-100 scale
  const ratio = adSum / volSum // -1 to +1
  return Math.round(Math.max(0, Math.min(100, (ratio + 1) * 50)))
}

// ── NEW: Pre-Launch / Coiled Spring Detection ──
// High beta DNA + low recent price move + elevated volume = accumulation phase

function calculatePreLaunchScore(
  closes: number[], volumes: number[], avgVolume: number, relativeVolume: number
): number {
  if (closes.length < 10) return 0
  let score = 0

  // 1. Price compression: low recent range relative to longer-term range
  const recent5 = closes.slice(-5)
  const recent20 = closes.slice(-20)
  const range5 = (Math.max(...recent5) - Math.min(...recent5)) / Math.min(...recent5)
  const range20 = recent20.length >= 10 ? (Math.max(...recent20) - Math.min(...recent20)) / Math.min(...recent20) : range5

  const compression = range20 > 0 ? 1 - (range5 / range20) : 0
  if (compression > 0.6) score += 30   // Very compressed
  else if (compression > 0.4) score += 20
  else if (compression > 0.2) score += 10

  // 2. Volume building while price is flat (accumulation signature)
  const recentVols = volumes.slice(-5)
  const prevVols = volumes.slice(-10, -5)
  if (prevVols.length >= 3) {
    const recentAvg = recentVols.reduce((a, b) => a + b, 0) / recentVols.length
    const prevAvg = prevVols.reduce((a, b) => a + b, 0) / prevVols.length
    const volGrowth = prevAvg > 0 ? (recentAvg - prevAvg) / prevAvg : 0
    if (volGrowth > 0.5 && range5 < 0.05) score += 25  // Volume growing, price flat
    else if (volGrowth > 0.3) score += 15
    else if (volGrowth > 0.1) score += 8
  }

  // 3. Relative volume spike today
  if (relativeVolume >= 3) score += 25
  else if (relativeVolume >= 2) score += 15
  else if (relativeVolume >= 1.5) score += 10

  // 4. Monthly performance is low (hasn't mooned yet)
  const monthlyPerf = closes.length >= 20 ? ((closes[closes.length - 1] - closes[closes.length - 20]) / closes[closes.length - 20]) * 100 : 0
  if (monthlyPerf >= 0 && monthlyPerf <= 15) score += 20  // Sweet spot: positive but not extended
  else if (monthlyPerf >= -5 && monthlyPerf <= 25) score += 10

  return Math.min(score, 100)
}

// ── NEW: Market Structure Classification ──

function classifyMarketStructure(closes: number[], volumes: number[]): { structure: string; daysSinceBase: number; compressionRatio: number } {
  if (closes.length < 10) return { structure: 'unknown', daysSinceBase: 0, compressionRatio: 1 }

  const recent = closes.slice(-5)
  const prev = closes.slice(-10, -5)
  const longer = closes.slice(-20)

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length
  const prevAvg = prev.reduce((a, b) => a + b, 0) / prev.length
  const recentRange = (Math.max(...recent) - Math.min(...recent)) / Math.min(...recent)
  const longerRange = longer.length >= 10 ? (Math.max(...longer) - Math.min(...longer)) / Math.min(...longer) : recentRange

  const compressionRatio = longerRange > 0 ? recentRange / longerRange : 1

  // Count days price stayed in a tight range (basing)
  let daysSinceBase = 0
  const basePrice = closes[closes.length - 1]
  for (let i = closes.length - 1; i >= 0; i--) {
    if (Math.abs(closes[i] - basePrice) / basePrice < 0.05) daysSinceBase++
    else break
  }

  let structure = 'unknown'
  const trend = (recentAvg - prevAvg) / prevAvg

  if (recentRange < 0.03 && daysSinceBase >= 5) structure = 'basing'
  else if (trend > 0.05 && recentRange > 0.05) structure = 'breakout'
  else if (trend > 0.02 && trend <= 0.05) structure = 'markup'
  else if (trend < -0.02 && recentRange > 0.05) structure = 'decline'
  else if (trend < -0.02 && recentRange < 0.03) structure = 'distribution'
  else structure = 'basing'

  return { structure, daysSinceBase, compressionRatio }
}

// ── NEW: Volume Profile Classification ──

function classifyVolumeProfile(volumes: number[], closes: number[], currentVolume: number): string {
  if (volumes.length < 10) return 'normal'
  const avgVol = volumes.reduce((a, b) => a + b, 0) / volumes.length
  const ratio = currentVolume / avgVol
  const priceChange = closes.length >= 2 ? (closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2] : 0

  if (ratio > 4 && Math.abs(priceChange) > 0.1) return 'climactic'
  if (ratio > 2 && priceChange > 0) return 'accumulation'
  if (ratio > 2 && priceChange < 0) return 'distribution'
  return 'normal'
}

// ── NEW: Smart Money / Dark Pool Proxy Detection ──
// Large volume with minimal price impact suggests institutional accumulation

function detectSmartMoneySignal(volumes: number[], closes: number[], opens: number[]): boolean {
  if (volumes.length < 5) return false
  const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(volumes.length, 20)

  // Look for days with >2x volume but <1% price move (block trades absorbing supply)
  let smartDays = 0
  const lookback = Math.min(5, volumes.length)
  for (let i = volumes.length - lookback; i < volumes.length; i++) {
    const volRatio = avgVol > 0 ? volumes[i] / avgVol : 1
    const priceMove = Math.abs(closes[i] - opens[i]) / opens[i]
    if (volRatio > 2 && priceMove < 0.01) smartDays++
  }
  return smartDays >= 2 // 2+ days of high volume with minimal price change
}

function detectPatterns(opens: number[], highs: number[], lows: number[], closes: number[], volumes: number[]) {
  const patterns = { bullFlag: false, flatTopBreakout: false, pennant: false, fishHook: false, gapUp: false }
  if (closes.length < 15) return patterns
  const recent = closes.slice(-10), recentHighs = highs.slice(-10), recentLows = lows.slice(-10)
  // Bull Flag
  const initMove = closes.length >= 15 ? (closes[closes.length - 10] - closes[closes.length - 15]) / closes[closes.length - 15] : 0
  const consRange = (Math.max(...recent) - Math.min(...recent)) / Math.min(...recent)
  if (initMove > 0.1 && consRange < 0.05) patterns.bullFlag = true
  // Flat Top
  const maxH = Math.max(...recentHighs)
  if (recentHighs.filter(h => Math.abs(h - maxH) / maxH < 0.02).length >= 3 && closes[closes.length - 1] >= maxH * 0.98) patterns.flatTopBreakout = true
  // Pennant
  if ((recentHighs[recentHighs.length - 1] - recentHighs[0]) / recentHighs[0] < 0 && (recentLows[recentLows.length - 1] - recentLows[0]) / recentLows[0] > 0) patterns.pennant = true
  // Fish Hook
  const mid = Math.floor(recent.length / 2), fh = recent.slice(0, mid), sh = recent.slice(mid)
  if ((Math.min(...fh) - fh[0]) / fh[0] < -0.1 && (sh[sh.length - 1] - Math.min(...fh)) / Math.min(...fh) > 0.08) patterns.fishHook = true
  // Gap Up
  if (opens.length >= 2 && (opens[opens.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2] > 0.03) patterns.gapUp = true
  return patterns
}

function calculateFeatureScore(c: Partial<PennyStockCandidate>): number {
  let s = 0

  // Original scoring
  const rvol = c.relativeVolume || 1
  s += rvol >= 2 ? 20 : rvol >= 1.5 ? 15 : rvol >= 1.2 ? 10 : 5
  const mom = c.technicals?.momentum5d || 0
  s += mom >= 10 ? 20 : mom >= 5 ? 15 : mom >= 2 ? 10 : 5
  const rsi = c.technicals?.rsi || 50
  s += (rsi >= 40 && rsi <= 70) ? 15 : (rsi >= 30 && rsi <= 80) ? 10 : 5
  const p = c.patterns
  s += (p?.bullFlag || p?.pennant) ? 15 : (p?.flatTopBreakout || p?.fishHook) ? 12 : p?.gapUp ? 8 : 3
  const sent = c.sentiment?.score || 0
  s += (sent > 0.3 && c.sentiment?.catalystType) ? 15 : sent > 0.1 ? 10 : sent >= 0 ? 5 : 2
  const fl = c.floatShares || 100000000, si = c.shortInterest || 0
  s += (fl < 20000000 && si > 15) ? 10 : (fl < 20000000 || si > 15) ? 5 : 2
  if (c.technicals?.nearHigh52w) s += 5

  // NEW: Advanced metrics boost (up to +30 additional points on a 130 scale, then normalize)
  const adv = c.advancedMetrics
  if (adv) {
    // Volume Z-Score bonus (extreme unusual volume)
    if (adv.volumeZScore >= 4) s += 10
    else if (adv.volumeZScore >= 3) s += 7
    else if (adv.volumeZScore >= 2) s += 4

    // Float rotation bonus
    if (adv.floatRotation >= 100) s += 8   // Full float rotation
    else if (adv.floatRotation >= 50) s += 5
    else if (adv.floatRotation >= 25) s += 3

    // Accumulation score
    if (adv.accumulationScore >= 70) s += 5
    else if (adv.accumulationScore <= 30) s -= 3 // Distribution penalty

    // Pre-launch coiled spring
    if (adv.preLaunchScore >= 60) s += 7
    else if (adv.preLaunchScore >= 40) s += 4

    // Smart money signal
    if (adv.smartMoneySignal) s += 5

    // Market structure bonus
    if (adv.marketStructure === 'basing' && adv.compressionRatio < 0.3) s += 5
    if (adv.marketStructure === 'breakout') s += 3
  }

  return Math.min(Math.round(s), 100)
}

function getConfidenceRank(score: number): 'High' | 'Moderate' | 'Low' {
  return score >= 75 ? 'High' : score >= 55 ? 'Moderate' : 'Low'
}

// ── Data fetching: FMP primary, Polygon fallback ──

async function fetchScreenedStocks(filters: ScannerFilters, fmpKey: string): Promise<any[]> {
  const allStocks: any[] = []
  const seen = new Set<string>()

  const addStocks = (stocks: any[]) => {
    for (const s of stocks) {
      if (!s.symbol || seen.has(s.symbol)) continue
      const price = s.price || s.changesPercentage ? s.price : 0
      if (price >= filters.minPrice && price <= filters.maxPrice) {
        seen.add(s.symbol)
        allStocks.push(s)
      }
    }
  }

  // 1. Gainers
  try {
    const res = await fetch(`https://financialmodelingprep.com/stable/biggest-gainers?apikey=${fmpKey}`)
    if (res.ok) { const data = await res.json(); if (Array.isArray(data)) { addStocks(data); console.log(`Gainers: ${data.length} total, ${allStocks.length} match price filter`) } }
  } catch (e) { console.error('Gainers error:', e) }

  // 2. Most active
  try {
    const res = await fetch(`https://financialmodelingprep.com/stable/most-actives?apikey=${fmpKey}`)
    if (res.ok) { const data = await res.json(); if (Array.isArray(data)) { addStocks(data); console.log(`After actives: ${allStocks.length}`) } }
  } catch (e) { console.error('Actives error:', e) }

  // 3. Losers (reversal candidates)
  try {
    const res = await fetch(`https://financialmodelingprep.com/stable/biggest-losers?apikey=${fmpKey}`)
    if (res.ok) { const data = await res.json(); if (Array.isArray(data)) { addStocks(data); console.log(`After losers: ${allStocks.length}`) } }
  } catch (e) { console.error('Losers error:', e) }

  console.log(`Total unique penny stocks found: ${allStocks.length}`)
  return allStocks
}

async function fetchFMPQuoteBatch(symbols: string[], fmpKey: string): Promise<Map<string, any>> {
  const map = new Map()
  const batches: string[][] = []
  for (let i = 0; i < symbols.length; i += 50) batches.push(symbols.slice(i, i + 50))

  for (const batch of batches) {
    try {
      const res = await fetch(`https://financialmodelingprep.com/stable/quote?symbol=${batch.join(',')}&apikey=${fmpKey}`)
      if (!res.ok) continue
      const data = await res.json()
      if (Array.isArray(data)) data.forEach((q: any) => map.set(q.symbol, q))
    } catch (e) { console.error('FMP quote batch error:', e) }
  }
  return map
}

async function fetchHistoricalBars(symbol: string, fmpKey: string, polygonKey: string | null): Promise<{ opens: number[]; highs: number[]; lows: number[]; closes: number[]; volumes: number[] }> {
  const empty = { opens: [], highs: [], lows: [], closes: [], volumes: [] }

  try {
    const res = await fetch(`https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${symbol}&timeseries=30&apikey=${fmpKey}`)
    if (res.ok) {
      const data = await res.json()
      const hist = (data.historical || []).reverse()
      if (hist.length >= 5) {
        return {
          opens: hist.map((r: any) => r.open),
          highs: hist.map((r: any) => r.high),
          lows: hist.map((r: any) => r.low),
          closes: hist.map((r: any) => r.close),
          volumes: hist.map((r: any) => r.volume),
        }
      }
    }
  } catch (e) { console.error(`FMP bars error for ${symbol}:`, e) }

  if (polygonKey) {
    try {
      const end = new Date(), start = new Date()
      start.setDate(start.getDate() - 45)
      const res = await fetch(`https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${start.toISOString().split('T')[0]}/${end.toISOString().split('T')[0]}?adjusted=true&sort=asc&apiKey=${polygonKey}`)
      if (res.ok) {
        const data = await res.json()
        const results = data.results || []
        if (results.length >= 5) {
          return {
            opens: results.map((r: any) => r.o),
            highs: results.map((r: any) => r.h),
            lows: results.map((r: any) => r.l),
            closes: results.map((r: any) => r.c),
            volumes: results.map((r: any) => r.v),
          }
        }
      }
    } catch (e) { console.error(`Polygon bars error for ${symbol}:`, e) }
  }

  return empty
}

async function fetchNewsSentiment(symbol: string, fmpKey: string): Promise<{ score: number; label: 'Bullish' | 'Bearish' | 'Neutral'; catalystType: string | null; headline: string | null }> {
  const neutral = { score: 0, label: 'Neutral' as const, catalystType: null, headline: null }
  try {
    const res = await fetch(`https://financialmodelingprep.com/stable/news/stock?tickers=${symbol}&limit=5&apikey=${fmpKey}`)
    if (!res.ok) return neutral
    const articles = await res.json()
    if (!Array.isArray(articles) || articles.length === 0) return neutral

    let sentimentSum = 0
    let catalystType: string | null = null
    const headline = articles[0]?.title || null

    for (const a of articles) {
      const text = ((a.title || '') + ' ' + (a.text || '')).toLowerCase()
      const positiveWords = ['surge', 'breakout', 'soar', 'jump', 'rally', 'gain', 'bullish', 'upgrade', 'beat', 'strong', 'approval', 'partnership', 'deal']
      const negativeWords = ['crash', 'plunge', 'drop', 'fall', 'bearish', 'downgrade', 'miss', 'weak', 'dilution', 'offering', 'lawsuit']
      const posCount = positiveWords.filter(w => text.includes(w)).length
      const negCount = negativeWords.filter(w => text.includes(w)).length
      sentimentSum += (posCount - negCount) * 0.2

      if (!catalystType) {
        if (text.includes('fda') || text.includes('approval')) catalystType = 'FDA'
        else if (text.includes('earnings') || text.includes('revenue')) catalystType = 'Earnings'
        else if (text.includes('partnership') || text.includes('deal') || text.includes('contract')) catalystType = 'Partnership'
        else if (text.includes('merger') || text.includes('acquisition')) catalystType = 'M&A'
        else if (text.includes('offering') || text.includes('dilution')) catalystType = 'Offering'
      }
    }

    const avg = sentimentSum / articles.length
    const label = avg > 0.15 ? 'Bullish' : avg < -0.15 ? 'Bearish' : 'Neutral'
    return { score: avg, label, catalystType, headline }
  } catch (e) {
    console.error(`News error for ${symbol}:`, e)
    return neutral
  }
}

// ── AI prediction ──

async function getAIPrediction(candidate: Partial<PennyStockCandidate>): Promise<{ reasoning: string; keyFactors: string[]; riskFlags: string[] }> {
  const fallback = { reasoning: 'Score-based analysis', keyFactors: ['Technical indicators', 'Volume patterns'], riskFlags: ['Manual review recommended'] }
  try {
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')
    if (!lovableApiKey) return fallback

    const adv = candidate.advancedMetrics
    const advContext = adv ? `
Volume Z-Score: ${adv.volumeZScore.toFixed(1)} std devs | Float Rotation: ${adv.floatRotation.toFixed(1)}%
Accumulation Score: ${adv.accumulationScore}/100 | Pre-Launch Score: ${adv.preLaunchScore}/100
Volume Profile: ${adv.volumeProfile} | Market Structure: ${adv.marketStructure}
Compression Ratio: ${adv.compressionRatio.toFixed(2)} | Days Basing: ${adv.daysSinceBase}
Smart Money Signal: ${adv.smartMoneySignal ? 'DETECTED' : 'None'}` : ''

    const prompt = `You are an expert penny stock analyst combining methods from Timothy Sykes, Ross Cameron, Humbled Trader, and Jason Bond.

Analyze this penny stock:
Symbol: ${candidate.symbol} | Price: $${candidate.price?.toFixed(2)} | Change: ${candidate.changePercent?.toFixed(2)}%
Volume: ${candidate.volume?.toLocaleString()} (${candidate.relativeVolume?.toFixed(1)}x avg) | Float: ${candidate.floatShares ? (candidate.floatShares / 1e6).toFixed(1) + 'M' : 'Unknown'}
RSI: ${candidate.technicals?.rsi?.toFixed(1)} | Above VWAP: ${candidate.technicals?.aboveVwap} | EMA Cross: ${candidate.technicals?.emaCrossover}
Momentum 5d: ${candidate.technicals?.momentum5d?.toFixed(1)}% | Patterns: ${Object.entries(candidate.patterns || {}).filter(([,v]) => v).map(([k]) => k).join(', ') || 'None'}
Sentiment: ${candidate.sentiment?.label} | Catalyst: ${candidate.sentiment?.catalystType || 'None'}
${advContext}

Return ONLY valid JSON: {"reasoning":"2-3 sentences","keyFactors":["factor1","factor2","factor3"],"riskFlags":["flag1"]}`

    const res = await fetch('https://ai.lovable.dev/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${lovableApiKey}` },
      body: JSON.stringify({ model: 'google/gemini-2.5-flash-lite', messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 300 })
    })
    if (!res.ok) return fallback
    const data = await res.json()
    const text = data.choices?.[0]?.message?.content || ''
    const match = text.match(/\{[\s\S]*\}/)
    if (match) { const p = JSON.parse(match[0]); return { reasoning: p.reasoning || fallback.reasoning, keyFactors: p.keyFactors || [], riskFlags: p.riskFlags || [] } }
    return fallback
  } catch (e) { console.error('AI error:', e); return fallback }
}

// ── Main scanner ──

async function scanPennyStocks(filters: ScannerFilters, fmpKey: string, polygonKey: string | null): Promise<PennyStockCandidate[]> {
  const screened = await fetchScreenedStocks(filters, fmpKey)
  if (screened.length === 0) {
    console.log('No penny stocks found matching filters')
    return []
  }
  return processStocks(screened, filters, fmpKey, polygonKey)
}

async function processStocks(stocks: any[], filters: ScannerFilters, fmpKey: string, polygonKey: string | null): Promise<PennyStockCandidate[]> {
  const candidates: PennyStockCandidate[] = []

  const symbols = stocks.slice(0, 60).map((s: any) => s.symbol)
  const quotes = await fetchFMPQuoteBatch(symbols, fmpKey)

  const toProcess = symbols.slice(0, 20)
  console.log(`Processing ${toProcess.length} stocks for full analysis...`)

  for (const symbol of toProcess) {
    try {
      const screenerData = stocks.find((s: any) => s.symbol === symbol) || {}
      const quoteData = quotes.get(symbol) || {}

      const price = quoteData.price || screenerData.price || 0
      if (price < filters.minPrice || price > filters.maxPrice) continue

      const volume = quoteData.volume || screenerData.volume || 0
      const avgVolume = quoteData.avgVolume || screenerData.avgVolume || volume
      const relativeVolume = avgVolume > 0 ? volume / avgVolume : 1
      const changePercent = quoteData.changesPercentage || screenerData.changesPercentage || 0
      const marketCap = quoteData.marketCap || screenerData.marketCap || 0
      const floatShares = screenerData.floatShares || screenerData.float || 0
      const shortInterest = 0

      // Fetch historical bars
      const bars = await fetchHistoricalBars(symbol, fmpKey, polygonKey)

      let rsi = 50, ema9 = price, ema20 = price, sma20 = price, vwap = price, momentum5d = 0, nearHigh52w = false
      let patterns = { bullFlag: false, flatTopBreakout: false, pennant: false, fishHook: false, gapUp: false }

      // NEW: Advanced metrics
      let advancedMetrics = {
        volumeZScore: 0,
        floatRotation: 0,
        accumulationScore: 50,
        preLaunchScore: 0,
        volumeProfile: 'normal',
        marketStructure: 'unknown',
        daysSinceBase: 0,
        compressionRatio: 1,
        smartMoneySignal: false,
      }

      if (bars.closes.length >= 10) {
        rsi = calculateRSI(bars.closes)
        ema9 = calculateEMA(bars.closes, 9)
        ema20 = calculateEMA(bars.closes, 20)
        sma20 = calculateSMA(bars.closes, 20)
        vwap = calculateVWAP(bars.highs, bars.lows, bars.closes, bars.volumes)
        momentum5d = bars.closes.length >= 6 ? ((bars.closes[bars.closes.length - 1] - bars.closes[bars.closes.length - 6]) / bars.closes[bars.closes.length - 6]) * 100 : 0
        const high20d = Math.max(...bars.highs.slice(-20))
        nearHigh52w = price >= high20d * 0.95
        patterns = detectPatterns(bars.opens, bars.highs, bars.lows, bars.closes, bars.volumes)

        // Compute advanced metrics
        advancedMetrics.volumeZScore = calculateVolumeZScore(bars.volumes, volume)
        advancedMetrics.floatRotation = calculateFloatRotation(volume, floatShares)
        advancedMetrics.accumulationScore = calculateAccumulationScore(bars.opens, bars.highs, bars.lows, bars.closes, bars.volumes)
        advancedMetrics.preLaunchScore = calculatePreLaunchScore(bars.closes, bars.volumes, avgVolume, relativeVolume)
        advancedMetrics.volumeProfile = classifyVolumeProfile(bars.volumes, bars.closes, volume)
        const ms = classifyMarketStructure(bars.closes, bars.volumes)
        advancedMetrics.marketStructure = ms.structure
        advancedMetrics.daysSinceBase = ms.daysSinceBase
        advancedMetrics.compressionRatio = ms.compressionRatio
        advancedMetrics.smartMoneySignal = detectSmartMoneySignal(bars.volumes, bars.closes, bars.opens)
      }

      // ── Apply advanced filters ──

      // Unusual volume filter: require volume Z-score ≥ 3 standard deviations
      if (filters.unusualVolumeOnly && advancedMetrics.volumeZScore < 3) continue

      // Float rotation filter
      if (filters.floatRotationMin && advancedMetrics.floatRotation < filters.floatRotationMin) continue

      // Pre-launch only filter
      if (filters.preLaunchOnly && advancedMetrics.preLaunchScore < 40) continue

      // Pattern filters
      if (filters.patterns && filters.patterns.length > 0) {
        const hasMatch = filters.patterns.some(p => {
          switch (p) {
            case 'bull_flag': return patterns.bullFlag
            case 'flat_top': return patterns.flatTopBreakout
            case 'pennant': return patterns.pennant
            case 'fish_hook': return patterns.fishHook
            case 'gap_up': return patterns.gapUp
            default: return false
          }
        })
        if (!hasMatch) continue
      }

      // Fetch sentiment
      const sentiment = await fetchNewsSentiment(symbol, fmpKey)

      const partial: Partial<PennyStockCandidate> = {
        symbol,
        companyName: quoteData.name || screenerData.companyName || symbol,
        price, changePercent, volume, avgVolume, relativeVolume,
        marketCap, floatShares, shortInterest,
        technicals: { rsi, vwap, sma20, ema9, ema20, momentum5d, nearHigh52w, aboveVwap: price > vwap, emaCrossover: ema9 > ema20 },
        patterns, sentiment,
        advancedMetrics,
      }

      const totalScore = calculateFeatureScore(partial)
      const confidenceRank = getConfidenceRank(totalScore)

      let aiPred = { reasoning: 'Score-based analysis', keyFactors: [] as string[], riskFlags: [] as string[] }
      if (totalScore >= 50) aiPred = await getAIPrediction(partial)

      const keyFactors = aiPred.keyFactors.length > 0 ? aiPred.keyFactors : [
        advancedMetrics.volumeZScore >= 3 ? `${advancedMetrics.volumeZScore.toFixed(1)}σ unusual volume` : relativeVolume >= 1.5 ? `${relativeVolume.toFixed(1)}x relative volume` : null,
        advancedMetrics.floatRotation >= 25 ? `${advancedMetrics.floatRotation.toFixed(0)}% float rotation` : null,
        advancedMetrics.smartMoneySignal ? 'Smart money accumulation detected' : null,
        advancedMetrics.preLaunchScore >= 50 ? 'Pre-launch coiled spring pattern' : null,
        patterns.bullFlag ? 'Bull flag pattern' : patterns.flatTopBreakout ? 'Flat top breakout' : null,
        sentiment.label === 'Bullish' ? 'Bullish sentiment' : null,
        nearHigh52w ? 'Near 52-week high' : null,
        momentum5d > 5 ? `${momentum5d.toFixed(1)}% 5d momentum` : null,
      ].filter(Boolean) as string[]

      const riskFlags = aiPred.riskFlags.length > 0 ? aiPred.riskFlags : [
        rsi > 80 ? 'Overbought (RSI > 80)' : null,
        advancedMetrics.volumeProfile === 'climactic' ? 'Climactic volume - potential blowoff top' : null,
        advancedMetrics.volumeProfile === 'distribution' ? 'Distribution pattern detected' : null,
        relativeVolume > 5 ? 'Unusual volume spike' : null,
        changePercent > 30 ? 'Extended - may need pullback' : null,
        sentiment.catalystType === 'Offering' ? 'Dilution risk' : null,
      ].filter(Boolean) as string[]

      candidates.push({
        ...(partial as PennyStockCandidate),
        totalScore,
        prediction: {
          breakoutProbability: Math.min(totalScore, 95),
          confidenceRank,
          reasoning: aiPred.reasoning,
          keyFactors: keyFactors.slice(0, 4),
          riskFlags: riskFlags.slice(0, 3),
        },
      })
    } catch (e) { console.error(`Error processing ${symbol}:`, e) }
  }

  candidates.sort((a, b) => b.totalScore - a.totalScore)
  return candidates
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const fmpKey = Deno.env.get('FMP_API_KEY')
    const polygonKey = Deno.env.get('POLYGON_API_KEY') || null

    if (!fmpKey) {
      return new Response(JSON.stringify({ error: 'FMP_API_KEY not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const body = await req.json().catch(() => ({}))
    const filters: ScannerFilters = {
      minPrice: body.minPrice || 0.5,
      maxPrice: body.maxPrice || 10,
      minVolume: body.minVolume || 500000,
      maxFloat: body.maxFloat,
      patterns: body.patterns,
      unusualVolumeOnly: body.unusualVolumeOnly || false,
      floatRotationMin: body.floatRotationMin,
      accumulationDetect: body.accumulationDetect || false,
      preLaunchOnly: body.preLaunchOnly || false,
    }

    console.log('Starting penny stock scan with filters:', filters)
    const candidates = await scanPennyStocks(filters, fmpKey, polygonKey)
    console.log(`Scan complete. Found ${candidates.length} candidates`)

    return new Response(JSON.stringify({ success: true, candidates, scannedAt: new Date().toISOString(), filters }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('Penny stock engine error:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
