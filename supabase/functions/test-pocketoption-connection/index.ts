import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { apiKey, ssid } = await req.json();

    if (!apiKey || !ssid) {
      throw new Error("Missing API Key or SSID");
    }

    // Test connection to PocketOption API
    // Note: Replace with actual PocketOption API endpoint
    const response = await fetch("https://api.po.trade/api/v2/profile", {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
        "X-SSID": ssid,
      },
    });

    if (!response.ok) {
      throw new Error(`Connection failed: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("PocketOption connection test successful:", data);

    return new Response(
      JSON.stringify({ success: true, message: "Connection successful" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error("PocketOption connection error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: error.message || "Connection failed" 
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
