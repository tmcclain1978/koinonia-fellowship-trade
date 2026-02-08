import "jsr:@supabase/functions-js/edge-runtime.d.ts"

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
}

// Calculate RSI from price data
function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return 50
  
  let gains = 0
  let losses = 0
  
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1]
    if (change > 0) gains += change
    else losses -= change
  }
  
  let avgGain = gains / period
  let avgLoss = losses / period
  
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1]
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period
      avgLoss = (avgLoss * (period - 1)) / period
    } else {
      avgGain = (avgGain * (period - 1)) / period
      avgLoss = (avgLoss * (period - 1) - change) / period
    }
  }
  
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - (100 / (1 + rs))
}

// Calculate EMA
function calculateEMA(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1] || 0
  
  const multiplier = 2 / (period + 1)
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period
  
  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema
  }
  
  return ema
}

// Calculate SMA
function calculateSMA(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1] || 0
  return data.slice(-period).reduce((a, b) => a + b, 0) / period
}

// Calculate VWAP (simplified - uses typical price * volume)
function calculateVWAP(highs: number[], lows: number[], closes: number[], volumes: number[]): number {
  if (highs.length === 0) return 0
  
  let cumulativeTPV = 0
  let cumulativeVolume = 0
  
  for (let i = 0; i < highs.length; i++) {
    const typicalPrice = (highs[i] + lows[i] + closes[i]) / 3
    cumulativeTPV += typicalPrice * volumes[i]
    cumulativeVolume += volumes[i]
  }
  
  return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : 0
}

// Detect chart patterns
function detectPatterns(
  opens: number[], 
  highs: number[], 
  lows: number[], 
  closes: number[],
  volumes: number[]
): { bullFlag: boolean; flatTopBreakout: boolean; pennant: boolean; fishHook: boolean; gapUp: boolean } {
  const patterns = {
    bullFlag: false,
    flatTopBreakout: false,
    pennant: false,
    fishHook: false,
    gapUp: false
  }
  
  if (closes.length < 10) return patterns
  
  const recent = closes.slice(-10)
  const recentHighs = highs.slice(-10)
  const recentLows = lows.slice(-10)
  
  // Bull Flag: Strong move up followed by consolidation
  const initialMove = (closes[closes.length - 10] - closes[closes.length - 15]) / closes[closes.length - 15]
  const consolidationRange = (Math.max(...recent) - Math.min(...recent)) / Math.min(...recent)
  if (initialMove > 0.1 && consolidationRange < 0.05) {
    patterns.bullFlag = true
  }
  
  // Flat Top Breakout: Multiple touches at resistance
  const maxHigh = Math.max(...recentHighs)
  const touchCount = recentHighs.filter(h => Math.abs(h - maxHigh) / maxHigh < 0.02).length
  if (touchCount >= 3 && closes[closes.length - 1] >= maxHigh * 0.98) {
    patterns.flatTopBreakout = true
  }
  
  // Pennant: Converging highs and lows
  const highsTrend = (recentHighs[recentHighs.length - 1] - recentHighs[0]) / recentHighs[0]
  const lowsTrend = (recentLows[recentLows.length - 1] - recentLows[0]) / recentLows[0]
  if (highsTrend < 0 && lowsTrend > 0) {
    patterns.pennant = true
  }
  
  // Fish Hook: Sharp drop followed by recovery (Jason Bond pattern)
  const midPoint = Math.floor(recent.length / 2)
  const firstHalf = recent.slice(0, midPoint)
  const secondHalf = recent.slice(midPoint)
  const drop = (Math.min(...firstHalf) - firstHalf[0]) / firstHalf[0]
  const recovery = (secondHalf[secondHalf.length - 1] - Math.min(...firstHalf)) / Math.min(...firstHalf)
  if (drop < -0.1 && recovery > 0.08) {
    patterns.fishHook = true
  }
  
  // Gap Up: Today's open significantly above yesterday's close
  if (opens.length >= 2) {
    const gapPercent = (opens[opens.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2]
    if (gapPercent > 0.03) {
      patterns.gapUp = true
    }
  }
  
  return patterns
}

// Calculate feature score based on PDF research methodology
function calculateFeatureScore(candidate: Partial<PennyStockCandidate>): number {
  let score = 0
  
  // Volume Score (max 20)
  const rvol = candidate.relativeVolume || 1
  if (rvol >= 2) score += 20
  else if (rvol >= 1.5) score += 15
  else if (rvol >= 1.2) score += 10
  else score += 5
  
  // Momentum Score (max 20)
  const momentum = candidate.technicals?.momentum5d || 0
  if (momentum >= 10) score += 20
  else if (momentum >= 5) score += 15
  else if (momentum >= 2) score += 10
  else score += 5
  
  // RSI Score (max 15)
  const rsi = candidate.technicals?.rsi || 50
  if (rsi >= 40 && rsi <= 70) score += 15
  else if (rsi >= 30 && rsi <= 80) score += 10
  else score += 5
  
  // Pattern Score (max 15)
  const patterns = candidate.patterns
  if (patterns?.bullFlag || patterns?.pennant) score += 15
  else if (patterns?.flatTopBreakout || patterns?.fishHook) score += 12
  else if (patterns?.gapUp) score += 8
  else score += 3
  
  // Sentiment Score (max 15)
  const sentimentScore = candidate.sentiment?.score || 0
  const hasCatalyst = candidate.sentiment?.catalystType != null
  if (sentimentScore > 0.3 && hasCatalyst) score += 15
  else if (sentimentScore > 0.1) score += 10
  else if (sentimentScore >= 0) score += 5
  else score += 2
  
  // Float/Short Score (max 10)
  const floatShares = candidate.floatShares || 100000000
  const shortInterest = candidate.shortInterest || 0
  const lowFloat = floatShares < 20000000
  const highShort = shortInterest > 15
  if (lowFloat && highShort) score += 10
  else if (lowFloat || highShort) score += 5
  else score += 2
  
  // Near High Score (max 5)
  if (candidate.technicals?.nearHigh52w) score += 5
  
  return score
}

// Get confidence rank from score
function getConfidenceRank(score: number): 'High' | 'Moderate' | 'Low' {
  if (score >= 75) return 'High'
  if (score >= 55) return 'Moderate'
  return 'Low'
}

// Use Lovable AI for prediction analysis
async function getAIPrediction(
  candidate: Partial<PennyStockCandidate>
): Promise<{ reasoning: string; keyFactors: string[]; riskFlags: string[] }> {
  try {
    const prompt = `You are an expert penny stock analyst combining methods from:
- Timothy Sykes (momentum, pre-spike patterns, avoiding pump-and-dumps)
- Ross Cameron (bull flags, first pullback entries, VWAP breaks)
- Humbled Trader (VWAP analysis, market cycles, risk management)
- Jason Bond (pennants, rockets, fishhooks patterns)

Analyze this penny stock for breakout potential:

Symbol: ${candidate.symbol}
Price: $${candidate.price?.toFixed(2)}
Change: ${candidate.changePercent?.toFixed(2)}%
Volume: ${candidate.volume?.toLocaleString()} (${candidate.relativeVolume?.toFixed(1)}x avg)
Float: ${candidate.floatShares ? (candidate.floatShares / 1000000).toFixed(1) + 'M' : 'Unknown'}
Short Interest: ${candidate.shortInterest?.toFixed(1) || 0}%

Technical Indicators:
- RSI: ${candidate.technicals?.rsi?.toFixed(1)}
- Above VWAP: ${candidate.technicals?.aboveVwap ? 'Yes' : 'No'}
- EMA Crossover: ${candidate.technicals?.emaCrossover ? 'Yes' : 'No'}
- 5-Day Momentum: ${candidate.technicals?.momentum5d?.toFixed(1)}%
- Near 52W High: ${candidate.technicals?.nearHigh52w ? 'Yes' : 'No'}

Patterns Detected:
${candidate.patterns?.bullFlag ? '- Bull Flag ✓' : ''}
${candidate.patterns?.flatTopBreakout ? '- Flat Top Breakout ✓' : ''}
${candidate.patterns?.pennant ? '- Pennant ✓' : ''}
${candidate.patterns?.fishHook ? '- Fish Hook ✓' : ''}
${candidate.patterns?.gapUp ? '- Gap Up ✓' : ''}

Sentiment: ${candidate.sentiment?.label} (Score: ${candidate.sentiment?.score?.toFixed(2)})
${candidate.sentiment?.catalystType ? `Catalyst: ${candidate.sentiment.catalystType}` : 'No catalyst detected'}
${candidate.sentiment?.headline ? `News: "${candidate.sentiment.headline}"` : ''}

Provide a concise analysis in JSON format with:
1. "reasoning": 2-3 sentence explanation of breakout potential
2. "keyFactors": Array of top 3 contributing factors
3. "riskFlags": Array of any warnings (dilution risk, pump-and-dump signs, overextended, etc.)

Return ONLY valid JSON.`

    // Use Lovable AI endpoint
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')
    const aiUrl = lovableApiKey 
      ? 'https://ai.lovable.dev/api/v1/chat/completions'
      : null
    
    if (!aiUrl || !lovableApiKey) {
      return {
        reasoning: 'AI analysis not available - using rule-based scoring',
        keyFactors: ['Technical indicators', 'Volume patterns'],
        riskFlags: ['Manual review recommended']
      }
    }

    const response = await fetch(aiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 500
      })
    })

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`)
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content || ''
    
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        reasoning: parsed.reasoning || 'Analysis pending',
        keyFactors: parsed.keyFactors || [],
        riskFlags: parsed.riskFlags || []
      }
    }
    
    return {
      reasoning: 'Unable to generate detailed analysis',
      keyFactors: ['Volume spike', 'Price momentum'],
      riskFlags: ['Conduct additional due diligence']
    }
  } catch (error) {
    console.error('AI prediction error:', error)
    return {
      reasoning: 'AI analysis temporarily unavailable',
      keyFactors: ['Technical indicators', 'Volume patterns'],
      riskFlags: ['Manual review recommended']
    }
  }
}

// Fetch stock data from Polygon.io
async function fetchStockData(
  symbols: string[],
  polygonApiKey: string
): Promise<Map<string, any>> {
  const results = new Map()
  
  // Batch fetch snapshots for all symbols
  try {
    const response = await fetch(
      `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${polygonApiKey}`
    )
    
    if (!response.ok) {
      console.error('Polygon snapshot error:', response.status)
      return results
    }
    
    const data = await response.json()
    const tickers = data.tickers || []
    
    for (const ticker of tickers) {
      if (symbols.length === 0 || symbols.includes(ticker.ticker)) {
        results.set(ticker.ticker, ticker)
      }
    }
  } catch (error) {
    console.error('Error fetching stock data:', error)
  }
  
  return results
}

// Fetch historical bars for technical analysis
async function fetchHistoricalBars(
  symbol: string,
  polygonApiKey: string,
  days: number = 30
): Promise<{ opens: number[]; highs: number[]; lows: number[]; closes: number[]; volumes: number[] }> {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  
  try {
    const response = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${startDate.toISOString().split('T')[0]}/${endDate.toISOString().split('T')[0]}?adjusted=true&sort=asc&apiKey=${polygonApiKey}`
    )
    
    if (!response.ok) {
      return { opens: [], highs: [], lows: [], closes: [], volumes: [] }
    }
    
    const data = await response.json()
    const results = data.results || []
    
    return {
      opens: results.map((r: any) => r.o),
      highs: results.map((r: any) => r.h),
      lows: results.map((r: any) => r.l),
      closes: results.map((r: any) => r.c),
      volumes: results.map((r: any) => r.v)
    }
  } catch (error) {
    console.error(`Error fetching bars for ${symbol}:`, error)
    return { opens: [], highs: [], lows: [], closes: [], volumes: [] }
  }
}

// Fetch news sentiment for a symbol
async function fetchNewsSentiment(
  symbol: string,
  polygonApiKey: string
): Promise<{ score: number; label: 'Bullish' | 'Bearish' | 'Neutral'; catalystType: string | null; headline: string | null }> {
  try {
    const response = await fetch(
      `https://api.polygon.io/v2/reference/news?ticker=${symbol}&limit=5&apiKey=${polygonApiKey}`
    )
    
    if (!response.ok) {
      return { score: 0, label: 'Neutral', catalystType: null, headline: null }
    }
    
    const data = await response.json()
    const articles = data.results || []
    
    if (articles.length === 0) {
      return { score: 0, label: 'Neutral', catalystType: null, headline: null }
    }
    
    // Calculate average sentiment from insights
    let totalSentiment = 0
    let count = 0
    let latestHeadline = articles[0]?.title || null
    let catalystType: string | null = null
    
    for (const article of articles) {
      const insights = article.insights || []
      for (const insight of insights) {
        if (insight.ticker === symbol) {
          if (insight.sentiment === 'positive') totalSentiment += 1
          else if (insight.sentiment === 'negative') totalSentiment -= 1
          count++
        }
      }
      
      // Detect catalyst type from keywords
      const text = (article.title + ' ' + (article.description || '')).toLowerCase()
      if (text.includes('fda') || text.includes('approval')) catalystType = 'FDA'
      else if (text.includes('earnings') || text.includes('revenue')) catalystType = 'Earnings'
      else if (text.includes('partnership') || text.includes('deal')) catalystType = 'Partnership'
      else if (text.includes('contract') || text.includes('award')) catalystType = 'Contract'
      else if (text.includes('merger') || text.includes('acquisition')) catalystType = 'M&A'
    }
    
    const avgSentiment = count > 0 ? totalSentiment / count : 0
    const label = avgSentiment > 0.2 ? 'Bullish' : avgSentiment < -0.2 ? 'Bearish' : 'Neutral'
    
    return { score: avgSentiment, label, catalystType, headline: latestHeadline }
  } catch (error) {
    console.error(`Error fetching news for ${symbol}:`, error)
    return { score: 0, label: 'Neutral', catalystType: null, headline: null }
  }
}

// Main scanner function
async function scanPennyStocks(
  filters: ScannerFilters,
  polygonApiKey: string
): Promise<PennyStockCandidate[]> {
  const candidates: PennyStockCandidate[] = []
  
  // Fetch all penny stock snapshots
  const allStocks = await fetchStockData([], polygonApiKey)
  
  // Filter based on criteria
  const filteredSymbols: string[] = []
  const stockDataMap = new Map<string, any>()
  
  for (const [symbol, data] of allStocks) {
    const price = data.day?.c || data.prevDay?.c || 0
    const volume = data.day?.v || 0
    const avgVolume = data.prevDay?.v || volume
    
    // Apply filters
    if (price < filters.minPrice || price > filters.maxPrice) continue
    if (volume < filters.minVolume) continue
    
    // Skip very illiquid stocks
    if (avgVolume < 100000) continue
    
    filteredSymbols.push(symbol)
    stockDataMap.set(symbol, data)
    
    // Limit to top 50 candidates for processing
    if (filteredSymbols.length >= 50) break
  }
  
  console.log(`Found ${filteredSymbols.length} symbols matching initial filters`)
  
  // Process each candidate
  for (const symbol of filteredSymbols.slice(0, 20)) { // Process top 20 for performance
    try {
      const stockData = stockDataMap.get(symbol)
      const price = stockData.day?.c || stockData.prevDay?.c || 0
      const volume = stockData.day?.v || 0
      const prevVolume = stockData.prevDay?.v || volume
      const relativeVolume = prevVolume > 0 ? volume / prevVolume : 1
      const changePercent = stockData.todaysChangePerc || 0
      
      // Fetch historical data for technical analysis
      const bars = await fetchHistoricalBars(symbol, polygonApiKey, 30)
      
      if (bars.closes.length < 10) continue
      
      // Calculate technical indicators
      const rsi = calculateRSI(bars.closes)
      const ema9 = calculateEMA(bars.closes, 9)
      const ema20 = calculateEMA(bars.closes, 20)
      const sma20 = calculateSMA(bars.closes, 20)
      const vwap = calculateVWAP(bars.highs, bars.lows, bars.closes, bars.volumes)
      
      // Calculate momentum
      const momentum5d = bars.closes.length >= 5 
        ? ((bars.closes[bars.closes.length - 1] - bars.closes[bars.closes.length - 6]) / bars.closes[bars.closes.length - 6]) * 100
        : 0
      
      // Check if near 52-week high (using 20-day high as proxy)
      const high20d = Math.max(...bars.highs.slice(-20))
      const nearHigh52w = price >= high20d * 0.95
      
      // Detect patterns
      const patterns = detectPatterns(bars.opens, bars.highs, bars.lows, bars.closes, bars.volumes)
      
      // Filter by patterns if specified
      if (filters.patterns && filters.patterns.length > 0) {
        const hasMatchingPattern = filters.patterns.some(p => {
          switch (p) {
            case 'bull_flag': return patterns.bullFlag
            case 'flat_top': return patterns.flatTopBreakout
            case 'pennant': return patterns.pennant
            case 'fish_hook': return patterns.fishHook
            case 'gap_up': return patterns.gapUp
            default: return false
          }
        })
        if (!hasMatchingPattern) continue
      }
      
      // Fetch news sentiment
      const sentiment = await fetchNewsSentiment(symbol, polygonApiKey)
      
      // Build partial candidate for scoring
      const partialCandidate: Partial<PennyStockCandidate> = {
        symbol,
        companyName: symbol, // Would need separate lookup for full name
        price,
        changePercent,
        volume,
        avgVolume: prevVolume,
        relativeVolume,
        marketCap: 0, // Would need separate lookup
        floatShares: 0, // Would need separate lookup
        shortInterest: 0, // Would need separate lookup
        technicals: {
          rsi,
          vwap,
          sma20,
          ema9,
          ema20,
          momentum5d,
          nearHigh52w,
          aboveVwap: price > vwap,
          emaCrossover: ema9 > ema20
        },
        patterns,
        sentiment
      }
      
      // Calculate feature score
      const totalScore = calculateFeatureScore(partialCandidate)
      const confidenceRank = getConfidenceRank(totalScore)
      
      // Get AI prediction for high-scoring candidates
      let aiPrediction = {
        reasoning: 'Score-based analysis',
        keyFactors: [] as string[],
        riskFlags: [] as string[]
      }
      
      if (totalScore >= 50) {
        aiPrediction = await getAIPrediction(partialCandidate)
      }
      
      // Build key factors from analysis
      const keyFactors = aiPrediction.keyFactors.length > 0 
        ? aiPrediction.keyFactors
        : [
            relativeVolume >= 1.5 ? `${relativeVolume.toFixed(1)}x relative volume` : null,
            patterns.bullFlag ? 'Bull flag pattern' : null,
            patterns.flatTopBreakout ? 'Flat top breakout' : null,
            sentiment.label === 'Bullish' ? 'Bullish sentiment' : null,
            nearHigh52w ? 'Near 52-week high' : null,
            momentum5d > 5 ? `${momentum5d.toFixed(1)}% 5-day momentum` : null
          ].filter(Boolean) as string[]
      
      // Build risk flags
      const riskFlags = aiPrediction.riskFlags.length > 0
        ? aiPrediction.riskFlags
        : [
            rsi > 80 ? 'Overbought (RSI > 80)' : null,
            relativeVolume > 5 ? 'Unusual volume spike - verify catalyst' : null,
            changePercent > 30 ? 'Extended - may need pullback' : null
          ].filter(Boolean) as string[]
      
      const candidate: PennyStockCandidate = {
        ...partialCandidate as PennyStockCandidate,
        totalScore,
        prediction: {
          breakoutProbability: Math.min(totalScore, 95),
          confidenceRank,
          reasoning: aiPrediction.reasoning,
          keyFactors: keyFactors.slice(0, 3),
          riskFlags: riskFlags.slice(0, 3)
        }
      }
      
      candidates.push(candidate)
    } catch (error) {
      console.error(`Error processing ${symbol}:`, error)
    }
  }
  
  // Sort by total score descending
  candidates.sort((a, b) => b.totalScore - a.totalScore)
  
  return candidates
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const polygonApiKey = Deno.env.get('POLYGON_API_KEY')
    
    if (!polygonApiKey) {
      return new Response(
        JSON.stringify({ error: 'Polygon API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json().catch(() => ({}))
    
    const filters: ScannerFilters = {
      minPrice: body.minPrice || 0.5,
      maxPrice: body.maxPrice || 10,
      minVolume: body.minVolume || 500000,
      maxFloat: body.maxFloat,
      patterns: body.patterns
    }

    console.log('Starting penny stock scan with filters:', filters)
    
    const candidates = await scanPennyStocks(filters, polygonApiKey)
    
    console.log(`Scan complete. Found ${candidates.length} candidates`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        candidates,
        scannedAt: new Date().toISOString(),
        filters
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Penny stock engine error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
