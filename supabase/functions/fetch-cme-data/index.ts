import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Note: CME Group data requires a commercial data license for real-time data
// This function provides mock data for demo purposes and structure for real integration

interface FuturesContract {
  symbol: string;
  expiry: string;
  price: number;
  openInterest: number;
  volume: number;
  change: number;
  changePercent: number;
}

interface TermStructure {
  contracts: FuturesContract[];
  isContango: boolean;
  spreadPercent: number;
}

// Generate mock term structure data for demo
function generateMockTermStructure(symbol: string): TermStructure {
  const months = ['F', 'G', 'H', 'J', 'K', 'M', 'N', 'Q', 'U', 'V', 'X', 'Z'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  
  let basePrice = 0;
  let spread = 0;
  
  switch (symbol) {
    case 'ES':
      basePrice = 5200 + (Math.random() - 0.5) * 50;
      spread = 5 + Math.random() * 3;
      break;
    case 'NQ':
      basePrice = 18500 + (Math.random() - 0.5) * 200;
      spread = 15 + Math.random() * 10;
      break;
    case 'CL':
      basePrice = 75 + (Math.random() - 0.5) * 5;
      spread = -0.5 - Math.random() * 0.5; // Usually backwardation
      break;
    case 'GC':
      basePrice = 2050 + (Math.random() - 0.5) * 30;
      spread = 3 + Math.random() * 2;
      break;
    case 'ZB':
      basePrice = 118 + (Math.random() - 0.5) * 2;
      spread = 0.25 + Math.random() * 0.25;
      break;
    case 'ZN':
      basePrice = 110 + (Math.random() - 0.5) * 1.5;
      spread = 0.125 + Math.random() * 0.125;
      break;
    default:
      basePrice = 100;
      spread = 0.5;
  }
  
  const contracts: FuturesContract[] = [];
  
  for (let i = 0; i < 8; i++) {
    const monthIndex = (currentMonth + i) % 12;
    const year = currentYear + Math.floor((currentMonth + i) / 12);
    const yearSuffix = year.toString().slice(-2);
    
    const price = basePrice + (spread * i) + (Math.random() - 0.5) * Math.abs(spread) * 0.5;
    const change = (Math.random() - 0.5) * Math.abs(spread) * 2;
    
    contracts.push({
      symbol: `${symbol}${months[monthIndex]}${yearSuffix}`,
      expiry: `${monthNames[monthIndex]} ${year}`,
      price: parseFloat(price.toFixed(2)),
      openInterest: Math.floor(50000 + Math.random() * 150000 - i * 10000),
      volume: Math.floor(20000 + Math.random() * 80000 - i * 5000),
      change: parseFloat(change.toFixed(2)),
      changePercent: parseFloat((change / price * 100).toFixed(2)),
    });
  }
  
  const firstPrice = contracts[0].price;
  const lastPrice = contracts[contracts.length - 1].price;
  const isContango = lastPrice > firstPrice;
  const spreadPercent = ((lastPrice - firstPrice) / firstPrice) * 100;
  
  return {
    contracts,
    isContango,
    spreadPercent: parseFloat(spreadPercent.toFixed(2)),
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbols, dataType = 'term-structure' } = await req.json();

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return new Response(
        JSON.stringify({ error: 'symbols array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching CME data for: ${symbols.join(', ')}, type: ${dataType}`);

    const results: Record<string, TermStructure> = {};

    for (const symbol of symbols) {
      // In production, you would fetch real data from CME Group API or a data provider
      // For now, we generate realistic mock data
      results[symbol] = generateMockTermStructure(symbol);
    }

    console.log(`Generated data for ${Object.keys(results).length} symbols`);

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in fetch-cme-data:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
