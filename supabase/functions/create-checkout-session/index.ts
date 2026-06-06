// Creates a Stripe Checkout session for a subscription.
//
// SECURITY: the user is derived from the verified Supabase JWT, never from
// the request body. A caller cannot create a session attributed to someone
// else. Set [functions.create-checkout-session] verify_jwt = true in
// config.toml (we ALSO verify here for defense in depth).
//
// Required secrets: STRIPE_SECRET_KEY, SUPABASE_URL,
//   SUPABASE_SERVICE_ROLE_KEY, APP_URL (e.g. https://app.yourdomain.com),
//   ALLOWED_ORIGINS (for CORS).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const PRICES: Record<string, { amount: number; name: string }> = {
  basic: { amount: 4900, name: "Basic Plan" },
  pro: { amount: 14900, name: "Pro Plan" },
  enterprise: { amount: 49900, name: "Enterprise Plan" },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    // --- Authenticate the caller from the JWT ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing authorization" }, 401, req);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authErr || !user) return jsonResponse({ error: "Invalid authentication token" }, 401, req);

    const userId = user.id; // <-- derived from token, NOT from the body

    // --- Validate requested tier (body userId, if any, is ignored) ---
    const { tier } = await req.json();
    const priceInfo = PRICES[tier];
    if (!priceInfo) return jsonResponse({ error: "Invalid tier" }, 400, req);

    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) return jsonResponse({ error: "Stripe not configured" }, 500, req);

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const appUrl = Deno.env.get("APP_URL") || "http://localhost:8080";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: user.email ?? undefined,
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: priceInfo.name,
            description: `Koinonia ${priceInfo.name} - Monthly Subscription`,
          },
          unit_amount: priceInfo.amount,
          recurring: { interval: "month" },
        },
        quantity: 1,
      }],
      client_reference_id: userId,
      // Stamp identity on BOTH the session and the subscription so every
      // downstream webhook event (renewal, cancellation) maps to this user.
      metadata: { userId, tier },
      subscription_data: { metadata: { userId, tier } },
      success_url: `${appUrl}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pricing`,
    });

    return jsonResponse({ url: session.url }, 200, req);
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
      req,
    );
  }
});
