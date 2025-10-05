import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { feature, userId } = await req.json();
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Check if record exists for this period
    const { data: existingUsage } = await supabase
      .from("usage_tracking")
      .select("*")
      .eq("user_id", userId)
      .eq("feature", feature)
      .eq("period_start", periodStart.toISOString())
      .maybeSingle();

    if (existingUsage) {
      // Increment existing record
      const { error } = await supabase
        .from("usage_tracking")
        .update({ count: existingUsage.count + 1 })
        .eq("id", existingUsage.id);

      if (error) throw error;
    } else {
      // Create new record
      const { error } = await supabase
        .from("usage_tracking")
        .insert({
          user_id: userId,
          feature,
          count: 1,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
        });

      if (error) throw error;
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error tracking usage:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});