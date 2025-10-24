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
    const { ssid } = await req.json();

    if (!ssid) {
      throw new Error("Missing SSID");
    }

    // Validate SSID format - accept both auth and user_init formats
    if (!ssid.startsWith('42["auth",') && !ssid.startsWith('42["user_init",')) {
      throw new Error("Invalid SSID format. It should start with 42[\"auth\", or 42[\"user_init\",");
    }

    // Try to parse the SSID to validate JSON structure
    try {
      const jsonPart = ssid.substring(2); // Remove '42' prefix
      JSON.parse(jsonPart);
    } catch {
      throw new Error("Invalid SSID format. Unable to parse JSON structure");
    }

    console.log("SSID validation successful");

    return new Response(
      JSON.stringify({ success: true, message: "SSID format is valid" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error("SSID validation error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: error.message || "Validation failed" 
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
