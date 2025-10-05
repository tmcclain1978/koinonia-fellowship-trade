import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import Stripe from "https://esm.sh/stripe@14.21.0";

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2023-10-16',
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionId, userId } = await req.json();

    console.log('Checking Stripe verification status for session:', sessionId);

    // Retrieve the verification session
    const verificationSession = await stripe.identity.verificationSessions.retrieve(sessionId);

    console.log('Verification session status:', verificationSession.status);

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Update profile based on verification status
    if (verificationSession.status === 'verified') {
      const { error } = await supabaseClient
        .from('profiles')
        .update({
          id_verification_status: 'stripe_verified',
          stripe_verified_at: new Date().toISOString(),
          stripe_verification_session_id: sessionId,
          account_status: 'active',
        })
        .eq('user_id', userId);

      if (error) {
        console.error('Error updating profile:', error);
        throw error;
      }

      console.log('Profile updated to verified status');
    } else if (verificationSession.status === 'requires_input') {
      await supabaseClient
        .from('profiles')
        .update({
          id_verification_status: 'stripe_pending',
          stripe_verification_session_id: sessionId,
        })
        .eq('user_id', userId);
    }

    return new Response(
      JSON.stringify({
        status: verificationSession.status,
        verified: verificationSession.status === 'verified',
        lastError: verificationSession.last_error,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error checking Stripe verification:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});