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
    const { code, userId } = await req.json();
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validate promo code
    const { data: promoData, error: promoError } = await supabase
      .from("promo_codes")
      .select("*")
      .eq("code", code.toUpperCase())
      .maybeSingle();

    if (promoError || !promoData) {
      return new Response(
        JSON.stringify({ error: "Invalid promo code" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if code is still valid
    if (promoData.uses_remaining !== null && promoData.uses_remaining <= 0) {
      return new Response(
        JSON.stringify({ error: "Promo code has been fully redeemed" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (promoData.expires_at && new Date(promoData.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Promo code has expired" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Update user role
    const { error: roleError } = await supabase
      .from("user_roles")
      .update({ role: promoData.tier })
      .eq("user_id", userId);

    if (roleError) throw roleError;

    // Decrement uses_remaining if applicable
    if (promoData.uses_remaining !== null) {
      await supabase
        .from("promo_codes")
        .update({ uses_remaining: promoData.uses_remaining - 1 })
        .eq("id", promoData.id);
    }

    // Create subscription record
    await supabase
      .from("subscriptions")
      .insert({
        user_id: userId,
        plan_name: promoData.tier,
        status: "active",
        start_date: new Date().toISOString(),
      });

    return new Response(
      JSON.stringify({ success: true, tier: promoData.tier }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error redeeming promo code:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});