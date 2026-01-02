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
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { userId, email } = await req.json();

    if (!userId || !email) {
      throw new Error("Missing userId or email");
    }

    console.log(`Checking family membership for email: ${email}`);

    // Check if this email is in family_members as pending
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
      console.log("No family membership found for this email");
      return new Response(
        JSON.stringify({ linked: false, message: "No family membership found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Link the user to the family membership and activate
    const { error: updateError } = await supabase
      .from("family_members")
      .update({ 
        member_user_id: userId, 
        status: "active",
        updated_at: new Date().toISOString()
      })
      .eq("id", familyMember.id);

    if (updateError) {
      console.error("Error updating family member:", updateError);
      throw updateError;
    }

    console.log(`Successfully linked user ${userId} to family membership`);

    return new Response(
      JSON.stringify({ 
        linked: true, 
        message: "Family membership linked and activated",
        tier: "enterprise"
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
