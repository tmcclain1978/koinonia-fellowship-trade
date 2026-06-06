// Stripe webhook handler.
//
// This is the ONLY trustworthy place to grant a paid tier. The browser
// redirect to success_url proves nothing — only a signed Stripe event does.
//
// config.toml MUST set:  [functions.stripe-webhook]  verify_jwt = false
//   (Stripe calls this server-to-server with no Supabase JWT; we authenticate
//    the request via the Stripe signature instead.)
//
// Required secrets:
//   STRIPE_SECRET_KEY            - your Stripe secret key
//   STRIPE_WEBHOOK_SECRET        - the signing secret for THIS endpoint
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Configure the endpoint in the Stripe dashboard to send at least:
//   checkout.session.completed, invoice.paid,
//   customer.subscription.updated, customer.subscription.deleted

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logAudit } from "../_shared/audit.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

// Deno's runtime needs the async + SubtleCrypto signature verifier.
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

const PAID_TIERS = new Set(["basic", "pro", "enterprise"]);

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// Grant or change a user's tier. Mirrors redeem-promo-code's grant path:
// (1) user_roles.role  AND  (2) the subscriptions row — both are read by
// the useSubscription hook, so both must be written or nothing unlocks.
async function setTier(opts: {
  userId: string;
  tier: string; // 'free_user' | 'basic' | 'pro' | 'enterprise'
  status: string; // 'active' | 'past_due' | 'canceled'
  endDate?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}) {
  const supabase = admin();
  const nowIso = new Date().toISOString();

  // (1) user_roles — update if present, else insert.
  const { data: existingRole } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("user_id", opts.userId)
    .maybeSingle();

  if (existingRole) {
    await supabase
      .from("user_roles")
      .update({ role: opts.tier })
      .eq("user_id", opts.userId);
  } else {
    await supabase
      .from("user_roles")
      .insert({ user_id: opts.userId, role: opts.tier });
  }

  // (2) subscriptions — upsert on the unique user_id (avoids the
  // duplicate-key error that a plain insert hits on renewal).
  await supabase
    .from("subscriptions")
    .upsert(
      {
        user_id: opts.userId,
        plan_name: opts.tier,
        status: opts.status,
        start_date: nowIso,
        end_date: opts.endDate ?? null,
        stripe_customer_id: opts.stripeCustomerId ?? null,
        stripe_subscription_id: opts.stripeSubscriptionId ?? null,
        updated_at: nowIso,
      },
      { onConflict: "user_id" },
    );
}

// Resolve the app user id from a Stripe subscription's metadata, falling back
// to the stored stripe_subscription_id / stripe_customer_id mapping.
async function resolveUserId(
  metadataUserId: string | undefined,
  stripeSubscriptionId?: string | null,
  stripeCustomerId?: string | null,
): Promise<string | null> {
  if (metadataUserId) return metadataUserId;
  const supabase = admin();
  if (stripeSubscriptionId) {
    const { data } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_subscription_id", stripeSubscriptionId)
      .maybeSingle();
    if (data?.user_id) return data.user_id;
  }
  if (stripeCustomerId) {
    const { data } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", stripeCustomerId)
      .maybeSingle();
    if (data?.user_id) return data.user_id;
  }
  return null;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text(); // must be the raw, unparsed body
  if (!signature) {
    return new Response("Missing stripe-signature", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      WEBHOOK_SECRET,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed:", err);
    return new Response("Signature verification failed", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const userId = (s.client_reference_id ||
          s.metadata?.userId) as string | undefined;
        const tier = s.metadata?.tier as string | undefined;

        if (!userId || !tier || !PAID_TIERS.has(tier)) {
          console.warn("[stripe-webhook] checkout completed without valid userId/tier", {
            userId, tier,
          });
          break;
        }
        await setTier({
          userId,
          tier,
          status: "active",
          stripeCustomerId: (s.customer as string) ?? null,
          stripeSubscriptionId: (s.subscription as string) ?? null,
        });
        await logAudit({
          userId,
          action: "subscription.activated",
          resourceType: "subscription",
          resourceId: (s.subscription as string) ?? undefined,
          details: { tier, via: "checkout.session.completed" },
        });
        break;
      }

      case "invoice.paid": {
        // Recurring renewal — keep the tier active and extend the period.
        const inv = event.data.object as Stripe.Invoice;
        const subId = inv.subscription as string | null;
        const customerId = inv.customer as string | null;
        // Newer API mirrors subscription metadata onto the invoice.
        const metaUserId = (inv as unknown as {
          subscription_details?: { metadata?: Record<string, string> };
        }).subscription_details?.metadata?.userId;
        const metaTier = (inv as unknown as {
          subscription_details?: { metadata?: Record<string, string> };
        }).subscription_details?.metadata?.tier;

        const userId = await resolveUserId(metaUserId, subId, customerId);
        if (!userId) break;

        // Prefer metadata tier; otherwise keep whatever tier is on file.
        const tier = metaTier && PAID_TIERS.has(metaTier) ? metaTier : undefined;
        const periodEnd = inv.lines?.data?.[0]?.period?.end
          ? new Date(inv.lines.data[0].period.end * 1000).toISOString()
          : null;

        if (tier) {
          await setTier({
            userId, tier, status: "active", endDate: periodEnd,
            stripeCustomerId: customerId, stripeSubscriptionId: subId,
          });
          await logAudit({
            userId, action: "subscription.renewed", resourceType: "subscription",
            resourceId: subId ?? undefined, details: { tier, periodEnd },
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await resolveUserId(
          sub.metadata?.userId, sub.id, sub.customer as string,
        );
        if (!userId) break;
        const tier = sub.metadata?.tier as string | undefined;
        const periodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null;

        if (sub.status === "active" || sub.status === "trialing") {
          if (tier && PAID_TIERS.has(tier)) {
            await setTier({
              userId, tier, status: "active", endDate: periodEnd,
              stripeCustomerId: sub.customer as string, stripeSubscriptionId: sub.id,
            });
          }
        } else if (sub.status === "past_due" || sub.status === "unpaid") {
          // Grace period: flag status but don't strip access yet.
          if (tier) {
            await setTier({
              userId, tier, status: "past_due", endDate: periodEnd,
              stripeCustomerId: sub.customer as string, stripeSubscriptionId: sub.id,
            });
          }
        } else if (sub.status === "canceled") {
          await setTier({
            userId, tier: "free_user", status: "canceled",
            stripeCustomerId: sub.customer as string, stripeSubscriptionId: sub.id,
          });
        }
        await logAudit({
          userId, action: "subscription.updated", resourceType: "subscription",
          resourceId: sub.id, details: { status: sub.status, tier },
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await resolveUserId(
          sub.metadata?.userId, sub.id, sub.customer as string,
        );
        if (!userId) break;
        await setTier({
          userId, tier: "free_user", status: "canceled",
          stripeCustomerId: sub.customer as string, stripeSubscriptionId: sub.id,
        });
        await logAudit({
          userId, action: "subscription.canceled", resourceType: "subscription",
          resourceId: sub.id, details: {},
        });
        break;
      }

      default:
        // Ignore unhandled event types.
        break;
    }
  } catch (err) {
    // Return 500 so Stripe retries — don't silently drop a paid event.
    console.error("[stripe-webhook] handler error:", err);
    return new Response("Handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
