import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FamilyInviteRequest {
  memberEmail: string;
  inviterName?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const resend = new Resend(resendApiKey);
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify admin is making this request
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    // Check if user is admin
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (roleData?.role !== "admin") {
      throw new Error("Only admins can send family invites");
    }

    const { memberEmail, inviterName }: FamilyInviteRequest = await req.json();

    if (!memberEmail) {
      throw new Error("Member email is required");
    }

    // Get the signup URL
    const appUrl = Deno.env.get("VITE_SUPABASE_URL")?.replace("/rest/v1", "").replace("https://", "https://") || "https://koinonia-trading.lovable.app";
    const signupUrl = `${appUrl.replace('.supabase.co', '.lovable.app')}/auth`;

    console.log(`Sending family invite to: ${memberEmail}`);

    const emailResponse = await resend.emails.send({
      from: "Koinonia Trading <invites@koinoniatrading.org>",
      to: [memberEmail],
      subject: "🎉 You've Been Invited to Koinonia Trading Family Subscription!",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td align="center" style="padding: 40px 20px;">
                <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #1e293b; border-radius: 16px; overflow: hidden;">
                  <!-- Header -->
                  <tr>
                    <td style="padding: 40px 40px 20px 40px; text-align: center;">
                      <div style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #3b82f6, #8b5cf6); border-radius: 50px; margin-bottom: 24px;">
                        <span style="color: #ffffff; font-size: 24px;">👨‍👩‍👧‍👦</span>
                      </div>
                      <h1 style="color: #f8fafc; font-size: 28px; font-weight: 700; margin: 0 0 8px 0;">
                        You're Invited!
                      </h1>
                      <p style="color: #94a3b8; font-size: 16px; margin: 0;">
                        Family Subscription to Koinonia Trading
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Content -->
                  <tr>
                    <td style="padding: 20px 40px 40px 40px;">
                      <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
                        ${inviterName ? `<strong>${inviterName}</strong> has` : "You've been"} added you to their Koinonia Trading family subscription! 
                        This means you'll get <strong style="color: #a78bfa;">Enterprise-level access</strong> to all our premium features.
                      </p>
                      
                      <div style="background-color: #0f172a; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                        <h3 style="color: #f8fafc; font-size: 16px; font-weight: 600; margin: 0 0 16px 0;">
                          ✨ What you'll get access to:
                        </h3>
                        <ul style="color: #94a3b8; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
                          <li>Unlimited AI trading analyses</li>
                          <li>Unlimited trading signals</li>
                          <li>Auto-trading bot access</li>
                          <li>Koinonia AI Indicator (FREE)</li>
                          <li>Advanced charting tools</li>
                          <li>Priority support</li>
                        </ul>
                      </div>
                      
                      <div style="text-align: center; margin-bottom: 24px;">
                        <a href="${signupUrl}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                          Complete Your Sign Up →
                        </a>
                      </div>
                      
                      <p style="color: #64748b; font-size: 14px; text-align: center; margin: 0;">
                        Sign up with this email address (<strong>${memberEmail}</strong>) to automatically activate your family subscription.
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="padding: 24px 40px; background-color: #0f172a; border-top: 1px solid #334155;">
                      <p style="color: #64748b; font-size: 12px; text-align: center; margin: 0;">
                        Koinonia Trading • AI-Powered Trading Platform
                        <br>
                        Questions? Reply to this email or contact our support team.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });

    console.log("Family invite email sent successfully:", emailResponse);

    // Update the family member record to note that invite was sent
    await supabase
      .from("family_members")
      .update({ updated_at: new Date().toISOString() })
      .eq("member_email", memberEmail.toLowerCase());

    return new Response(
      JSON.stringify({ success: true, message: "Invite sent successfully" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error sending family invite:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
