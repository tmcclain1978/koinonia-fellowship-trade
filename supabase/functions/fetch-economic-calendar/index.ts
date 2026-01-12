import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EconomicEvent {
  id: string;
  date: string;
  time: string;
  country: string;
  countryCode: string;
  event: string;
  importance: 'high' | 'medium' | 'low';
  previous: string;
  forecast: string;
  actual?: string;
}

// Event templates for generating realistic mock data
const eventTemplates = [
  { country: 'US', countryCode: 'US', event: 'Non-Farm Payrolls', importance: 'high' as const, prev: '216K', forecast: '180K' },
  { country: 'US', countryCode: 'US', event: 'CPI m/m', importance: 'high' as const, prev: '0.3%', forecast: '0.2%' },
  { country: 'US', countryCode: 'US', event: 'FOMC Rate Decision', importance: 'high' as const, prev: '5.50%', forecast: '5.50%' },
  { country: 'US', countryCode: 'US', event: 'GDP q/q', importance: 'high' as const, prev: '3.3%', forecast: '2.5%' },
  { country: 'US', countryCode: 'US', event: 'Core CPI m/m', importance: 'high' as const, prev: '0.3%', forecast: '0.3%' },
  { country: 'US', countryCode: 'US', event: 'Retail Sales m/m', importance: 'medium' as const, prev: '0.6%', forecast: '0.4%' },
  { country: 'US', countryCode: 'US', event: 'Initial Jobless Claims', importance: 'medium' as const, prev: '187K', forecast: '195K' },
  { country: 'US', countryCode: 'US', event: 'ISM Manufacturing PMI', importance: 'medium' as const, prev: '49.1', forecast: '49.5' },
  { country: 'US', countryCode: 'US', event: 'ISM Services PMI', importance: 'medium' as const, prev: '52.7', forecast: '52.0' },
  { country: 'US', countryCode: 'US', event: 'Consumer Confidence', importance: 'medium' as const, prev: '114.8', forecast: '112.0' },
  { country: 'US', countryCode: 'US', event: 'Durable Goods Orders m/m', importance: 'medium' as const, prev: '0.0%', forecast: '0.5%' },
  { country: 'US', countryCode: 'US', event: 'Core PPI m/m', importance: 'low' as const, prev: '0.0%', forecast: '0.2%' },
  { country: 'US', countryCode: 'US', event: 'Empire State Manufacturing', importance: 'low' as const, prev: '-14.5', forecast: '-5.0' },
  { country: 'EU', countryCode: 'EU', event: 'ECB Rate Decision', importance: 'high' as const, prev: '4.50%', forecast: '4.50%' },
  { country: 'EU', countryCode: 'EU', event: 'CPI y/y', importance: 'high' as const, prev: '2.8%', forecast: '2.6%' },
  { country: 'EU', countryCode: 'EU', event: 'GDP q/q', importance: 'high' as const, prev: '0.0%', forecast: '0.1%' },
  { country: 'UK', countryCode: 'GB', event: 'BoE Rate Decision', importance: 'high' as const, prev: '5.25%', forecast: '5.25%' },
  { country: 'UK', countryCode: 'GB', event: 'CPI y/y', importance: 'high' as const, prev: '4.0%', forecast: '3.8%' },
  { country: 'JP', countryCode: 'JP', event: 'BoJ Rate Decision', importance: 'high' as const, prev: '-0.10%', forecast: '-0.10%' },
  { country: 'JP', countryCode: 'JP', event: 'GDP q/q', importance: 'high' as const, prev: '-0.1%', forecast: '0.3%' },
  { country: 'CN', countryCode: 'CN', event: 'GDP y/y', importance: 'high' as const, prev: '5.2%', forecast: '4.8%' },
  { country: 'CN', countryCode: 'CN', event: 'Trade Balance', importance: 'medium' as const, prev: '$75.3B', forecast: '$70.0B' },
  { country: 'CA', countryCode: 'CA', event: 'BoC Rate Decision', importance: 'high' as const, prev: '5.00%', forecast: '5.00%' },
  { country: 'AU', countryCode: 'AU', event: 'RBA Rate Decision', importance: 'high' as const, prev: '4.35%', forecast: '4.35%' },
];

// Generate economic calendar events
function generateEvents(startDate: Date, endDate: Date, countries?: string[]): EconomicEvent[] {
  const events: EconomicEvent[] = [];
  const current = new Date(startDate);
  let eventId = 0;
  
  while (current <= endDate) {
    // Skip weekends
    if (current.getDay() !== 0 && current.getDay() !== 6) {
      // Add 1-4 events per day
      const numEvents = Math.floor(Math.random() * 4) + 1;
      
      for (let i = 0; i < numEvents; i++) {
        const template = eventTemplates[Math.floor(Math.random() * eventTemplates.length)];
        
        // Filter by country if specified
        if (countries && countries.length > 0 && !countries.includes(template.countryCode)) {
          continue;
        }
        
        const hours = 8 + Math.floor(Math.random() * 8);
        const minutes = Math.random() > 0.5 ? 30 : 0;
        
        events.push({
          id: `event-${eventId++}`,
          date: current.toISOString().split('T')[0],
          time: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ET`,
          country: template.country,
          countryCode: template.countryCode,
          event: template.event,
          importance: template.importance,
          previous: template.prev,
          forecast: template.forecast,
          // Add actual value for past events
          actual: current < new Date() ? template.forecast : undefined,
        });
      }
    }
    
    current.setDate(current.getDate() + 1);
  }
  
  return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { startDate, endDate, countries, importance } = await req.json();

    // Default to next 14 days if no dates provided
    const start = startDate ? new Date(startDate) : new Date();
    const end = endDate ? new Date(endDate) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    console.log(`Fetching economic calendar from ${start.toISOString()} to ${end.toISOString()}`);

    let events = generateEvents(start, end, countries);

    // Filter by importance if specified
    if (importance && Array.isArray(importance) && importance.length > 0) {
      events = events.filter(e => importance.includes(e.importance));
    }

    console.log(`Generated ${events.length} economic events`);

    return new Response(
      JSON.stringify({ events }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in fetch-economic-calendar:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
