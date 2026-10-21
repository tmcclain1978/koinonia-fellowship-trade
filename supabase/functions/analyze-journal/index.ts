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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const { journalId } = await req.json();

    // Get journal entry
    const { data: entry, error: entryError } = await supabase
      .from('trading_journal')
      .select('*')
      .eq('id', journalId)
      .single();

    if (entryError) throw entryError;

    // Get user's recent trading history for context
    const { data: recentTrades } = await supabase
      .from('paper_trades')
      .select('*')
      .eq('user_id', user.id)
      .order('executed_at', { ascending: false })
      .limit(10);

    // Calculate trading stats
    const profitableTrades = recentTrades?.filter(t => t.profit_loss && t.profit_loss > 0).length || 0;
    const totalTrades = recentTrades?.length || 0;
    const winRate = totalTrades > 0 ? (profitableTrades / totalTrades * 100).toFixed(1) : '0';

    // Build AI prompt
    const systemPrompt = `You are an expert trading psychology coach and technical analyst. Analyze the trader's journal entry and trading patterns to provide actionable insights.`;
    
    const userPrompt = `
Journal Entry:
Type: ${entry.entry_type}
Content: ${entry.content}
Emotions: ${entry.emotions?.join(', ') || 'None recorded'}
Symbol: ${entry.symbol || 'N/A'}

Recent Trading Performance:
- Total trades: ${totalTrades}
- Win rate: ${winRate}%
- Recent P/L: ${recentTrades?.slice(0, 5).map(t => t.profit_loss).join(', ')}

Analyze this journal entry and provide:
1. Key psychological patterns or biases
2. Specific trading mistakes or good decisions
3. 3-5 actionable suggestions for improvement
Format as JSON: { "analysis": "string", "suggestions": ["string"] }
`;

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`AI API error: ${aiResponse.statusText}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices[0].message.content;
    
    // Parse AI response
    let analysis, suggestions;
    try {
      const parsed = JSON.parse(aiContent);
      analysis = parsed.analysis;
      suggestions = parsed.suggestions;
    } catch {
      // Fallback if not JSON
      analysis = aiContent;
      suggestions = ['Continue journaling your trades', 'Review your trading plan regularly', 'Focus on risk management'];
    }

    // Update journal entry with AI insights
    await supabase
      .from('trading_journal')
      .update({
        ai_analysis: analysis,
        ai_suggestions: suggestions,
        analyzed_at: new Date().toISOString()
      })
      .eq('id', journalId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        analysis,
        suggestions
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-journal:', error);
    return new Response(
      JSON.stringify({ error: (error as any).message }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});