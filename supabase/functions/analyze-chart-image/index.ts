import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrls, symbol, entryType, content } = await req.json();

    if (!imageUrls || imageUrls.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No images provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Build image content for the multimodal request
    const imageContent = imageUrls.map((url: string) => ({
      type: 'image_url',
      image_url: { url }
    }));

    const systemPrompt = `You are an expert technical analyst specializing in chart pattern recognition and trading analysis.

When analyzing chart screenshots, provide:
1. **Pattern Identification**: Identify any chart patterns (head & shoulders, double tops/bottoms, flags, wedges, triangles, channels, etc.)
2. **Trend Analysis**: Determine the current trend direction and strength
3. **Key Levels**: Identify support and resistance levels visible in the chart
4. **Indicators**: Note any visible technical indicators and their signals (RSI, MACD, moving averages, volume, etc.)
5. **Entry/Exit Points**: Suggest potential entry and exit points based on the analysis
6. **Risk Assessment**: Evaluate the risk/reward ratio for potential trades
7. **Actionable Insights**: Provide 2-3 specific, actionable trading recommendations

Be specific about price levels when visible. Reference specific candlestick patterns if applicable.
Format your response with clear sections using markdown headers.`;

    const userPrompt = `Analyze ${imageUrls.length > 1 ? 'these chart screenshots' : 'this chart screenshot'}${symbol ? ` for ${symbol}` : ''}.

${content ? `Trader's notes: "${content}"` : ''}
${entryType ? `Entry type: ${entryType}` : ''}

Provide a comprehensive technical analysis with actionable insights.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          ...imageContent
        ]
      }
    ];

    console.log(`Analyzing ${imageUrls.length} chart image(s)${symbol ? ` for ${symbol}` : ''}`);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add funds to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content;

    if (!analysis) {
      throw new Error('No analysis generated');
    }

    console.log('Chart analysis completed successfully');

    return new Response(
      JSON.stringify({ 
        analysis,
        imagesAnalyzed: imageUrls.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-chart-image:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to analyze chart' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
