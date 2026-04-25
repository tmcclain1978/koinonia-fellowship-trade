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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // 1. Verify JWT from Authorization header
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const authedUser = userData.user;

    const { userId, email } = await req.json();
    if (!userId || !email) {
      return new Response(
        JSON.stringify({ error: "Missing userId or email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Caller must match the userId AND email they are claiming to link
    if (
      authedUser.id !== userId ||
      (authedUser.email || "").toLowerCase() !== String(email).toLowerCase()
    ) {
      console.warn("link-family-member identity mismatch", {
        authedId: authedUser.id,
        claimedId: userId,
      });
      return new Response(
        JSON.stringify({ error: "Forbidden: identity mismatch" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Use service-role for the privileged update only after auth checks pass
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: familyMember, error: fetchError } = await supabase
      .from("family_members")
      .select("*")
      .eq("member_email", email.toLowerCase())
      .in("status", ["pending", "active"])
      .maybeSingle();

    if (fetchError) {
      console.error("Error fetching family member:", fetchError);
      throw fetchError;
    }

    if (!familyMember) {
      return new Response(
        JSON.stringify({ linked: false, message: "No family membership found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: updateError } = await supabase
      .from("family_members")
      .update({
        member_user_id: userId,
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", familyMember.id);

    if (updateError) {
      console.error("Error updating family member:", updateError);
      throw updateError;
    }

    return new Response(
      JSON.stringify({
        linked: true,
        message: "Family membership linked and activated",
        tier: "enterprise",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in link-family-member:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
