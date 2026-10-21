import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FRED_API_KEY = Deno.env.get('FRED_API_KEY');

interface FREDObservation {
  date: string;
  value: string;
}

interface FREDResponse {
  observations: FREDObservation[];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { seriesIds, timeRange = '5y' } = await req.json();

    if (!FRED_API_KEY) {
      console.error('FRED_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'FRED API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!seriesIds || !Array.isArray(seriesIds) || seriesIds.length === 0 || seriesIds.length > 20 || !seriesIds.every((id) => typeof id === 'string' && /^[A-Z0-9_]{1,30}$/.test(id))) {
      return new Response(
        JSON.stringify({ error: 'seriesIds must be 1-20 FRED series IDs (letters, numbers, _)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate observation start date based on time range
    const now = new Date();
    let startDate = new Date();
    
    switch (timeRange) {
      case '1y':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      case '2y':
        startDate.setFullYear(now.getFullYear() - 2);
        break;
      case '5y':
        startDate.setFullYear(now.getFullYear() - 5);
        break;
      case '10y':
        startDate.setFullYear(now.getFullYear() - 10);
        break;
      case 'max':
        startDate = new Date('1990-01-01');
        break;
      default:
        startDate.setFullYear(now.getFullYear() - 5);
    }

    const observationStart = startDate.toISOString().split('T')[0];
    const observationEnd = now.toISOString().split('T')[0];

    console.log(`Fetching FRED data for series: ${seriesIds.join(', ')}, range: ${observationStart} to ${observationEnd}`);

    const results: Record<string, { date: string; value: number }[]> = {};

    // Fetch data for each series in parallel
    const fetchPromises = seriesIds.map(async (seriesId: string) => {
      try {
        const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(seriesId)}&api_key=${FRED_API_KEY}&file_type=json&observation_start=${observationStart}&observation_end=${observationEnd}`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
          console.error(`FRED API error for ${seriesId}: ${response.status}`);
          return { seriesId, data: [] };
        }

        const data: FREDResponse = await response.json();
        
        // Transform observations to our format
        const observations = data.observations
          .filter(obs => obs.value !== '.')
          .map(obs => ({
            date: obs.date,
            value: parseFloat(obs.value),
          }));

        return { seriesId, data: observations };
      } catch (error) {
        console.error(`Error fetching ${seriesId}:`, error);
        return { seriesId, data: [] };
      }
    });

    const fetchResults = await Promise.all(fetchPromises);
    
    fetchResults.forEach(({ seriesId, data }) => {
      results[seriesId] = data;
    });

    console.log(`Successfully fetched data for ${Object.keys(results).length} series`);

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in fetch-fred-data:', error);
    return new Response(
      JSON.stringify({ error: (error as any).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
