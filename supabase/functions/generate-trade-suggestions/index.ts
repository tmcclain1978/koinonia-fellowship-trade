import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Fetch sentiment for popular stocks
    const stockSymbols = ['AAPL', 'TSLA', 'NVDA', 'META', 'GOOGL', 'MSFT', 'AMZN'];
    
    console.log('Fetching news sentiment for trade suggestions...');
    
    // Fetch market-wide sentiment
    const sentimentResponse = await fetch(`${supabaseUrl}/functions/v1/news-sentiment-scanner`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        queries: [
          'stock market today',
          'tech stocks news',
          'S&P 500',
          'NASDAQ news',
          'stock earnings today'
        ],
        numArticlesPerQuery: 4
      })
    });
    
    const marketSentiment = sentimentResponse.ok ? await sentimentResponse.json() : null;
    const aggregate = marketSentiment?.aggregate || { overallLabel: 'Neutral', overallScore: 0 };
    
    // Build sentiment context
    const sentimentContext = marketSentiment ? `
CURRENT MARKET SENTIMENT:
- Overall Market Mood: ${aggregate.overallLabel} (Score: ${(aggregate.overallScore * 100).toFixed(1)}%)
- Articles Analyzed: ${marketSentiment.totalArticlesAnalyzed || 0}
- Bullish Headlines: ${marketSentiment.topBullish?.length || 0}
- Bearish Headlines: ${marketSentiment.topBearish?.length || 0}

Key Bullish News:
${marketSentiment.topBullish?.slice(0, 2).map((h: any) => `• ${h.title}`).join('\n') || 'None'}

Key Bearish News:
${marketSentiment.topBearish?.slice(0, 2).map((h: any) => `• ${h.title}`).join('\n') || 'None'}
` : '';

    // Get market data and generate suggestions using AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an expert stock market analyst specializing in options trading with access to real-time news sentiment data. Generate 3 high-confidence trade suggestions based on current market conditions and sentiment analysis.
            
            For each suggestion, provide:
            1. Symbol (stock ticker)
            2. Action (BUY or SELL)
            3. Confidence level (70-95%)
            4. Target price
            5. Brief reasoning that incorporates sentiment analysis (2-3 sentences)
            
            Focus on liquid, well-known stocks with clear technical or fundamental signals.
            Consider: momentum, volatility, support/resistance levels, and the provided news sentiment data.`,
          },
          {
            role: "user",
            content: `Generate 3 trade suggestions for today based on current market analysis.

${sentimentContext}

Consider the market sentiment when making your recommendations. If sentiment is bearish, consider more defensive plays or short positions. If bullish, consider momentum plays.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_suggestions",
              description: "Generate trade suggestions with structured data",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        symbol: { type: "string" },
                        action: { type: "string", enum: ["BUY", "SELL"] },
                        confidence: { type: "number", minimum: 70, maximum: 95 },
                        targetPrice: { type: "number" },
                        reasoning: { type: "string" },
                      },
                      required: ["symbol", "action", "confidence", "targetPrice", "reasoning"],
                    },
                    minItems: 3,
                    maxItems: 3,
                  },
                },
                required: ["suggestions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_suggestions" } },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", errorText);
      throw new Error("Failed to generate suggestions");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      throw new Error("No suggestions generated");
    }

    const suggestions = JSON.parse(toolCall.function.arguments).suggestions;

    return new Response(
      JSON.stringify({ suggestions }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error generating suggestions:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        suggestions: [],
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});