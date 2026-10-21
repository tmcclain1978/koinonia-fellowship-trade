import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NewsArticle {
  title: string;
  link: string;
  published: string;
  source: string;
}

interface SentimentResult {
  score: number; // -1 to 1
  label: 'Bullish' | 'Bearish' | 'Neutral';
  confidence: number;
}

interface ArticleSentiment extends NewsArticle {
  sentiment: SentimentResult;
}

// Parse RSS XML using regex (Deno edge functions don't support DOMParser for XML)
function parseRssXml(xmlText: string): NewsArticle[] {
  const articles: NewsArticle[] = [];
  
  // Match all <item> blocks
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let itemMatch;
  
  while ((itemMatch = itemRegex.exec(xmlText)) !== null) {
    const itemContent = itemMatch[1];
    
    // Extract title - handle CDATA
    const titleMatch = itemContent.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    let title = titleMatch ? titleMatch[1].trim() : '';
    // Clean up any remaining CDATA markers and HTML tags
    title = title.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]*>/g, '').trim();
    
    // Extract link
    const linkMatch = itemContent.match(/<link>([\s\S]*?)<\/link>/i);
    const link = linkMatch ? linkMatch[1].trim() : '';
    
    // Extract pubDate
    const pubDateMatch = itemContent.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    const published = pubDateMatch ? pubDateMatch[1].trim() : '';
    
    // Extract source
    const sourceMatch = itemContent.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
    const source = sourceMatch ? sourceMatch[1].trim() : 'Unknown';
    
    if (title) {
      articles.push({ title, link, published, source });
    }
  }
  
  return articles;
}

// Fetch news from Google News RSS
async function fetchGoogleNews(query: string, numArticles: number = 10): Promise<NewsArticle[]> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const rssUrl = `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-US&gl=US&ceid=US:en`;
    
    console.log(`Fetching news for: ${query}`);
    
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      console.error(`RSS fetch failed: ${response.status}`);
      return [];
    }
    
    const xmlText = await response.text();
    
    // Use regex-based parsing instead of DOMParser
    const allArticles = parseRssXml(xmlText);
    const articles = allArticles.slice(0, numArticles);
    
    console.log(`Found ${articles.length} articles for ${query}`);
    return articles;
  } catch (error) {
    console.error(`Error fetching news for ${query}:`, error);
    return [];
  }
}

// Analyze sentiment using AI
async function analyzeSentimentBatch(articles: NewsArticle[], apiKey: string): Promise<ArticleSentiment[]> {
  if (articles.length === 0) return [];
  
  const headlines = articles.map((a, i) => `${i + 1}. ${a.title}`).join('\n');
  
  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a financial sentiment analyzer specializing in market news. Analyze each headline for trading sentiment.

For each headline, determine:
- score: A number from -1 (very bearish) to 1 (very bullish), 0 is neutral
- label: "Bullish", "Bearish", or "Neutral"
- confidence: 0-100 indicating how confident you are

Consider financial context: earnings, revenue, guidance, layoffs, acquisitions, legal issues, product launches, analyst ratings, etc.`
          },
          {
            role: 'user',
            content: `Analyze sentiment for these headlines:\n\n${headlines}`
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'analyze_sentiments',
              description: 'Return sentiment analysis for each headline',
              parameters: {
                type: 'object',
                properties: {
                  sentiments: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        index: { type: 'number', description: 'Article index (1-based)' },
                        score: { type: 'number', minimum: -1, maximum: 1 },
                        label: { type: 'string', enum: ['Bullish', 'Bearish', 'Neutral'] },
                        confidence: { type: 'number', minimum: 0, maximum: 100 }
                      },
                      required: ['index', 'score', 'label', 'confidence']
                    }
                  }
                },
                required: ['sentiments'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'analyze_sentiments' } }
      }),
    });

    if (!response.ok) {
      console.error('AI sentiment analysis failed:', response.status);
      // Return neutral sentiments as fallback
      return articles.map(article => ({
        ...article,
        sentiment: { score: 0, label: 'Neutral' as const, confidence: 50 }
      }));
    }

    const data = await response.json();
    const toolCall = data.choices[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      return articles.map(article => ({
        ...article,
        sentiment: { score: 0, label: 'Neutral' as const, confidence: 50 }
      }));
    }

    const { sentiments } = JSON.parse(toolCall.function.arguments);
    
    return articles.map((article, idx) => {
      const sentiment = sentiments.find((s: any) => s.index === idx + 1) || 
        { score: 0, label: 'Neutral', confidence: 50 };
      return {
        ...article,
        sentiment: {
          score: sentiment.score,
          label: sentiment.label,
          confidence: sentiment.confidence
        }
      };
    });
  } catch (error) {
    console.error('Error analyzing sentiment:', error);
    return articles.map(article => ({
      ...article,
      sentiment: { score: 0, label: 'Neutral' as const, confidence: 50 }
    }));
  }
}

// Calculate aggregate sentiment
function calculateAggregateSentiment(articles: ArticleSentiment[]): {
  overallScore: number;
  overallLabel: 'Bullish' | 'Bearish' | 'Neutral';
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  averageConfidence: number;
  weightedScore: number;
} {
  if (articles.length === 0) {
    return {
      overallScore: 0,
      overallLabel: 'Neutral',
      bullishCount: 0,
      bearishCount: 0,
      neutralCount: 0,
      averageConfidence: 0,
      weightedScore: 0
    };
  }

  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  let totalScore = 0;
  let totalConfidence = 0;
  let weightedSum = 0;
  let weightTotal = 0;

  for (const article of articles) {
    const { score, label, confidence } = article.sentiment;
    
    if (label === 'Bullish') bullishCount++;
    else if (label === 'Bearish') bearishCount++;
    else neutralCount++;
    
    totalScore += score;
    totalConfidence += confidence;
    
    // Weight by confidence
    weightedSum += score * (confidence / 100);
    weightTotal += confidence / 100;
  }

  const overallScore = totalScore / articles.length;
  const averageConfidence = totalConfidence / articles.length;
  const weightedScore = weightTotal > 0 ? weightedSum / weightTotal : 0;
  
  let overallLabel: 'Bullish' | 'Bearish' | 'Neutral';
  if (overallScore > 0.1) overallLabel = 'Bullish';
  else if (overallScore < -0.1) overallLabel = 'Bearish';
  else overallLabel = 'Neutral';

  return {
    overallScore,
    overallLabel,
    bullishCount,
    bearishCount,
    neutralCount,
    averageConfidence,
    weightedScore
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, queries, numArticlesPerQuery = 5 } = await req.json();
    
    if (!symbol && (!queries || queries.length === 0)) {
      return new Response(
        JSON.stringify({ error: 'Symbol or queries array required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Generate search queries based on symbol or use provided queries
    const searchQueries = queries || [
      `${symbol} stock`,
      `${symbol} stock news`,
      `${symbol} earnings`,
      `${symbol} analyst`
    ];

    console.log(`Scanning news sentiment for: ${symbol || 'custom queries'}`);
    console.log(`Queries: ${searchQueries.join(', ')}`);

    // Fetch news from all queries in parallel
    const newsPromises = searchQueries.map((query: string) => 
      fetchGoogleNews(query, numArticlesPerQuery)
    );
    const newsResults = await Promise.all(newsPromises);
    
    // Flatten and deduplicate by title
    const allArticles: NewsArticle[] = [];
    const seenTitles = new Set<string>();
    
    for (const articles of newsResults) {
      for (const article of articles) {
        const normalizedTitle = article.title.toLowerCase().trim();
        if (!seenTitles.has(normalizedTitle)) {
          seenTitles.add(normalizedTitle);
          allArticles.push(article);
        }
      }
    }

    console.log(`Total unique articles: ${allArticles.length}`);

    // Analyze sentiment for all articles
    const analyzedArticles = await analyzeSentimentBatch(allArticles, LOVABLE_API_KEY);
    
    // Calculate aggregate sentiment
    const aggregate = calculateAggregateSentiment(analyzedArticles);
    
    // Sort by sentiment score (most relevant first)
    const sortedArticles = [...analyzedArticles].sort((a, b) => 
      Math.abs(b.sentiment.score) - Math.abs(a.sentiment.score)
    );

    // Get top bullish and bearish headlines
    const topBullish = sortedArticles
      .filter(a => a.sentiment.label === 'Bullish')
      .slice(0, 3);
    const topBearish = sortedArticles
      .filter(a => a.sentiment.label === 'Bearish')
      .slice(0, 3);

    // Calculate breakdown percentages safely
    const totalArticles = analyzedArticles.length;
    const sentimentBreakdown = totalArticles > 0 ? {
      bullishPercent: (aggregate.bullishCount / totalArticles) * 100,
      bearishPercent: (aggregate.bearishCount / totalArticles) * 100,
      neutralPercent: (aggregate.neutralCount / totalArticles) * 100
    } : {
      bullishPercent: 0,
      bearishPercent: 0,
      neutralPercent: 0
    };

    // Build result with both old field names (for backward compatibility) and new ones
    const result = {
      symbol,
      timestamp: new Date().toISOString(),
      totalArticlesAnalyzed: totalArticles,
      // New field names that frontend expects
      overall: aggregate.overallLabel,
      score: aggregate.overallScore,
      weightedScore: aggregate.weightedScore,
      articlesAnalyzed: totalArticles,
      breakdown: sentimentBreakdown,
      // Legacy field names
      aggregate,
      topBullish: topBullish.map(a => ({ title: a.title, score: a.sentiment.score, confidence: a.sentiment.confidence })),
      topBearish: topBearish.map(a => ({ title: a.title, score: a.sentiment.score, confidence: a.sentiment.confidence })),
      articles: analyzedArticles.slice(0, 20), // Return top 20 articles
      sentimentBreakdown
    };

    console.log(`Sentiment analysis complete: ${aggregate.overallLabel} (${aggregate.overallScore.toFixed(2)}) from ${totalArticles} articles`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in news-sentiment-scanner:', error);
    return new Response(
      JSON.stringify({ error: (error as any).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
