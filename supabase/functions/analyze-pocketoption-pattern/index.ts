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

    const { data: { user } } = await supabaseClient.auth.getUser((req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, ''));
    if (!user) throw new Error("Not authenticated");

    const { pair } = await req.json();

    // This used to pick 2-3 chart patterns AT RANDOM, with made-up confidence
    // and accuracy numbers, save them as predictions, and let the user trade
    // on them. There is no real pattern detection behind it, so it now says
    // so and saves nothing.
    console.log(`Pattern analysis requested for ${pair}: not available`);
    return new Response(
      JSON.stringify({
        success: false,
        available: false,
        patterns_detected: 0,
        patterns: [],
        message: "Pattern detection isn't available yet, so no prediction was made. Use the AI candle prediction instead.",
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error("Pattern analysis error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: (error as any).message || "Analysis failed" 
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
