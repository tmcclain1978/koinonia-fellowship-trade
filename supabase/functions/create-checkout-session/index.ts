import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tier, userId } = await req.json();
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL");

    if (!STRIPE_SECRET_KEY) {
      throw new Error("Stripe secret key not configured");
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2023-10-16",
    });

    // Define pricing for each tier
    const prices: Record<string, { amount: number; name: string }> = {
      basic: { amount: 4900, name: "Basic Plan" },
      pro: { amount: 14900, name: "Pro Plan" },
      enterprise: { amount: 49900, name: "Enterprise Plan" },
    };

    const priceInfo = prices[tier];
    if (!priceInfo) {
      throw new Error("Invalid tier");
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: priceInfo.name,
              description: `Koinonia ${priceInfo.name} - Monthly Subscription`,
            },
            unit_amount: priceInfo.amount,
            recurring: {
              interval: "month",
            },
          },
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${SUPABASE_URL?.replace('/functions/v1', '') || 'http://localhost:8080'}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SUPABASE_URL?.replace('/functions/v1', '') || 'http://localhost:8080'}/pricing`,
      client_reference_id: userId,
      metadata: {
        userId,
        tier,
      },
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});