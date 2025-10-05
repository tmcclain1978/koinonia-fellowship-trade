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
            content: `You are an expert stock market analyst specializing in options trading. Generate 3 high-confidence trade suggestions based on current market conditions. 
            
            For each suggestion, provide:
            1. Symbol (stock ticker)
            2. Action (BUY or SELL)
            3. Confidence level (70-95%)
            4. Target price
            5. Brief reasoning (2-3 sentences)
            
            Focus on liquid, well-known stocks with clear technical or fundamental signals.
            Consider: momentum, volatility, support/resistance levels, and market sentiment.`,
          },
          {
            role: "user",
            content: "Generate 3 trade suggestions for today based on current market analysis.",
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