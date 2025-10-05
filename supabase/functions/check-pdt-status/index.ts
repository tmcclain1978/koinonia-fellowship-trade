import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from JWT
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      throw new Error('Invalid user token');
    }

    const { symbol, isSell } = await req.json();

    // Get user's account credentials and settings
    const { data: credentials, error: credError } = await supabase
      .from('user_api_credentials')
      .select('account_type, account_value, trading_mode')
      .eq('user_id', user.id)
      .single();

    if (credError || !credentials) {
      return new Response(
        JSON.stringify({ 
          error: 'No account credentials found. Please configure your settings.',
          canTrade: false
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PDT rules only apply to margin accounts in live trading mode
    const isPaperTrading = credentials.trading_mode === 'paper';
    const isMarginAccount = credentials.account_type === 'margin';
    const accountValue = parseFloat(credentials.account_value) || 0;

    // If paper trading, allow all trades
    if (isPaperTrading) {
      return new Response(
        JSON.stringify({ 
          canTrade: true,
          isPaperTrading: true,
          message: 'Paper trading - no PDT restrictions'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If cash account, no PDT rules apply
    if (!isMarginAccount) {
      return new Response(
        JSON.stringify({ 
          canTrade: true,
          isMarginAccount: false,
          message: 'Cash account - no PDT restrictions'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If account value >= $25,000, PDT rules don't apply
    if (accountValue >= 25000) {
      return new Response(
        JSON.stringify({ 
          canTrade: true,
          accountValue,
          message: 'Account value above $25k - no PDT restrictions'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Count day trades in last 5 trading days
    const { data: countResult, error: countError } = await supabase
      .rpc('count_recent_day_trades', { _user_id: user.id });

    if (countError) {
      console.error('Error counting day trades:', countError);
      throw new Error('Failed to check day trade count');
    }

    const dayTradeCount = countResult || 0;

    // Check if this would be a day trade (sell same day as buy)
    // In production, you'd check open positions to see if bought today
    const wouldBeDayTrade = isSell; // Simplified logic

    if (wouldBeDayTrade) {
      // Warning at 2 day trades
      if (dayTradeCount === 2) {
        return new Response(
          JSON.stringify({ 
            canTrade: true,
            warning: true,
            dayTradeCount,
            message: '⚠️ WARNING: This will be your 3rd day trade. One more within 5 trading days will flag you as a Pattern Day Trader and may restrict your account.',
            accountValue
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Block at 3+ day trades
      if (dayTradeCount >= 3) {
        return new Response(
          JSON.stringify({ 
            canTrade: false,
            blocked: true,
            dayTradeCount,
            message: '🚫 BLOCKED: You have made 3 day trades in the last 5 trading days. Pattern Day Trading rules prevent additional day trades until your account value exceeds $25,000 or the 5-day window resets.',
            accountValue,
            requiresMinimum: 25000
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Allow trade
    return new Response(
      JSON.stringify({ 
        canTrade: true,
        dayTradeCount,
        accountValue,
        message: dayTradeCount === 1 
          ? `You have made 1 day trade. You can make 2 more before PDT restrictions apply.`
          : 'Trade allowed'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in check-pdt-status:', error);
    return new Response(
      JSON.stringify({ error: error.message, canTrade: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
