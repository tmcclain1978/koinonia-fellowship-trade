import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, timeframe } = await req.json();
    
    if (!symbol) {
      return new Response(
        JSON.stringify({ error: 'Symbol is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    console.log('Fetching news sentiment for:', symbol);
    
    // Fetch advanced news sentiment
    const sentimentResponse = await fetch(`${supabaseUrl}/functions/v1/news-sentiment-scanner`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        symbol,
        queries: [
          `${symbol} stock`,
          `${symbol} stock news`,
          `${symbol} earnings`,
          `${symbol} analyst`
        ],
        numArticlesPerQuery: 5
      })
    });
    
    const sentimentData = sentimentResponse.ok ? await sentimentResponse.json() : null;
    const aggregate = sentimentData?.aggregate || { overallLabel: 'Neutral', overallScore: 0 };
    const breakdown = sentimentData?.sentimentBreakdown || {};
    
    // Build sentiment context for AI
    const sentimentContext = sentimentData ? `
📰 NEWS SENTIMENT ANALYSIS:
- Overall Sentiment: ${aggregate.overallLabel} (Score: ${(aggregate.overallScore * 100).toFixed(1)}%)
- Articles Analyzed: ${sentimentData.totalArticlesAnalyzed || 0}
- Breakdown: ${breakdown.bullishPercent?.toFixed(1)}% Bullish, ${breakdown.bearishPercent?.toFixed(1)}% Bearish, ${breakdown.neutralPercent?.toFixed(1)}% Neutral

Top Bullish Headlines:
${sentimentData.topBullish?.map((h: any) => `• ${h.title}`).join('\n') || 'None'}

Top Bearish Headlines:
${sentimentData.topBearish?.map((h: any) => `• ${h.title}`).join('\n') || 'None'}
` : 'News sentiment data unavailable.';

    // AI analysis prompt
    const systemPrompt = `You are an expert stock options trading analyst with access to real-time news sentiment data. Analyze the given stock symbol and provide:
1. Trading recommendation (CALL or PUT)
2. Confidence score (0-100)
3. Entry price suggestion
4. Target price
5. Stop loss level
6. Risk analysis
7. Market sentiment based on news
8. News sentiment impact on trading decision

Be specific and actionable. Base recommendations on technical analysis principles and the provided sentiment data.`;

    const userPrompt = `Analyze ${symbol} for options trading. Timeframe: ${timeframe || 'day trading'}.

${sentimentContext}

Provide a structured analysis with specific price levels and reasoning. Incorporate the news sentiment into your recommendation.`;

    console.log('Calling Lovable AI for stock analysis:', symbol);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits depleted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const analysis = data.choices[0].message.content;

    console.log('AI Analysis completed for:', symbol);

    return new Response(
      JSON.stringify({
        symbol,
        analysis,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-stock:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});