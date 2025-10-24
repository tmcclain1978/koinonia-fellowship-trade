import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { pair } = await req.json();

    // Fetch historical data for pattern analysis
    // This is a simplified pattern detection algorithm
    // In production, you would use more sophisticated ML/AI techniques
    
    const patterns = [];
    const currentTime = new Date();
    
    // Simulate pattern detection (replace with real algorithm)
    // Pattern types: Double Top, Double Bottom, Head and Shoulders, etc.
    const patternTypes = [
      { type: "Double Top", direction: "down" as const, confidence: 75, accuracy: 68 },
      { type: "Double Bottom", direction: "up" as const, confidence: 82, accuracy: 71 },
      { type: "Head and Shoulders", direction: "down" as const, confidence: 70, accuracy: 65 },
      { type: "Ascending Triangle", direction: "up" as const, confidence: 85, accuracy: 73 },
      { type: "Descending Triangle", direction: "down" as const, confidence: 78, accuracy: 69 },
    ];

    // Detect 2-3 patterns for the pair
    const detectedPatterns = patternTypes
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.floor(Math.random() * 2) + 2);

    for (const pattern of detectedPatterns) {
      const expiresAt = new Date(currentTime.getTime() + 15 * 60 * 1000); // 15 minutes

      const { error } = await supabaseClient
        .from('pocketoption_patterns')
        .insert({
          user_id: user.id,
          pair,
          pattern_type: pattern.type,
          confidence: pattern.confidence,
          predicted_direction: pattern.direction,
          expires_at: expiresAt.toISOString(),
          accuracy_rate: pattern.accuracy,
        });

      if (error) {
        console.error("Error inserting pattern:", error);
      } else {
        patterns.push(pattern);
      }
    }

    console.log(`Analyzed ${pair}: Found ${patterns.length} patterns`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        patterns_detected: patterns.length,
        patterns 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error("Pattern analysis error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: error.message || "Analysis failed" 
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
