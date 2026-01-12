import { supabase } from "@/integrations/supabase/client";

/**
 * Schwab API Client - TypeScript wrapper for Schwab edge functions
 * Based on Schwabdev patterns: https://github.com/tylerebowers/Schwabdev
 */

export interface SchwabQuote {
  symbol: string;
  lastPrice: number;
  bidPrice?: number;
  askPrice?: number;
  bidSize?: number;
  askSize?: number;
  volume?: number;
  openPrice?: number;
  highPrice?: number;
  lowPrice?: number;
  closePrice?: number;
  netChange?: number;
  netPercentChange?: number;
  high52Week?: number;
  low52Week?: number;
  mark?: number;
  postMarketChange?: number;
  peRatio?: number;
  eps?: number;
  divYield?: number;
  description?: string;
  exchange?: string;
  isShortable?: boolean;
  source?: string;
}

export interface LinkedAccount {
  accountNumber: string;
  hashValue: string;
}

export interface AccountPosition {
  shortQuantity: number;
  averagePrice: number;
  currentDayProfitLoss: number;
  currentDayProfitLossPercentage: number;
  longQuantity: number;
  settledLongQuantity: number;
  settledShortQuantity: number;
  instrument: {
    assetType: string;
    cusip: string;
    symbol: string;
    netChange?: number;
  };
  marketValue: number;
  maintenanceRequirement: number;
}

export interface SchwabOrder {
  orderType: 'LIMIT' | 'MARKET' | 'STOP' | 'STOP_LIMIT' | 'TRAILING_STOP';
  session: 'NORMAL' | 'AM' | 'PM' | 'SEAMLESS';
  duration: 'DAY' | 'GOOD_TILL_CANCEL' | 'FILL_OR_KILL';
  orderStrategyType: 'SINGLE' | 'OCO' | 'TRIGGER';
  price?: string;
  stopPrice?: string;
  stopPriceLinkBasis?: 'MANUAL' | 'BASE' | 'TRIGGER' | 'LAST' | 'BID' | 'ASK';
  stopPriceLinkType?: 'VALUE' | 'PERCENT';
  stopPriceOffset?: number;
  orderLegCollection: Array<{
    instruction: 'BUY' | 'SELL' | 'BUY_TO_COVER' | 'SELL_SHORT' | 'BUY_TO_OPEN' | 'SELL_TO_OPEN' | 'BUY_TO_CLOSE' | 'SELL_TO_CLOSE';
    quantity: number;
    instrument: {
      symbol: string;
      assetType: 'EQUITY' | 'OPTION' | 'INDEX' | 'MUTUAL_FUND' | 'CASH_EQUIVALENT' | 'FIXED_INCOME' | 'CURRENCY';
    };
  }>;
  childOrderStrategies?: SchwabOrder[];
}

// Options-specific order types
export interface OptionsOrderLeg {
  instruction: 'BUY_TO_OPEN' | 'SELL_TO_OPEN' | 'BUY_TO_CLOSE' | 'SELL_TO_CLOSE';
  quantity: number;
  instrument: {
    symbol: string; // OCC format: AAPL  250117C00250000
    assetType: 'OPTION';
  };
}

export interface SchwabOptionsOrder extends Omit<SchwabOrder, 'orderLegCollection'> {
  orderLegCollection: OptionsOrderLeg[];
  complexOrderStrategyType?: 'VERTICAL' | 'STRADDLE' | 'STRANGLE' | 'IRON_CONDOR' | 'BUTTERFLY' | 'CONDOR' | 'DIAGONAL' | 'COLLAR' | 'COVERED' | 'CUSTOM';
}

/**
 * Format OCC option symbol
 * OCC Format: AAPL  250117C00250000
 * - 6 chars: underlying (left padded with spaces)
 * - 6 chars: expiration YYMMDD
 * - 1 char: C (call) or P (put)
 * - 8 chars: strike * 1000 (left padded with zeros)
 */
export function formatOCCSymbol(
  underlying: string,
  expiration: string, // YYYY-MM-DD format
  strike: number,
  type: 'CALL' | 'PUT'
): string {
  // Pad underlying to 6 chars
  const paddedUnderlying = underlying.toUpperCase().padEnd(6, ' ');
  
  // Convert expiration to YYMMDD
  const expDate = new Date(expiration);
  const yy = expDate.getFullYear().toString().slice(-2);
  const mm = (expDate.getMonth() + 1).toString().padStart(2, '0');
  const dd = expDate.getDate().toString().padStart(2, '0');
  const expFormatted = `${yy}${mm}${dd}`;
  
  // Option type
  const optType = type === 'CALL' ? 'C' : 'P';
  
  // Strike price * 1000, padded to 8 digits
  const strikeFormatted = Math.round(strike * 1000).toString().padStart(8, '0');
  
  return `${paddedUnderlying}${expFormatted}${optType}${strikeFormatted}`;
}

/**
 * Parse OCC option symbol back to components
 */
export function parseOCCSymbol(occSymbol: string): {
  underlying: string;
  expiration: string;
  strike: number;
  type: 'CALL' | 'PUT';
} | null {
  if (occSymbol.length !== 21) return null;
  
  const underlying = occSymbol.slice(0, 6).trim();
  const expYY = occSymbol.slice(6, 8);
  const expMM = occSymbol.slice(8, 10);
  const expDD = occSymbol.slice(10, 12);
  const optType = occSymbol.slice(12, 13);
  const strikeStr = occSymbol.slice(13, 21);
  
  const year = parseInt(expYY) + 2000;
  const expiration = `${year}-${expMM}-${expDD}`;
  const strike = parseInt(strikeStr) / 1000;
  const type = optType === 'C' ? 'CALL' : 'PUT';
  
  return { underlying, expiration, strike, type };
}

class SchwabApiClient {
  /**
   * Check if response indicates OAuth is required
   */
  private checkOAuthRequired(data: any): void {
    if (data?.requires_oauth) {
      const error = new Error('OAuth required');
      (error as any).requiresOAuth = true;
      throw error;
    }
  }

  /**
   * Get all linked Schwab accounts
   */
  async getLinkedAccounts(): Promise<LinkedAccount[]> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('schwab-accounts', {
      body: { action: 'linked_accounts' },
    });

    if (error) throw new Error(error.message);
    this.checkOAuthRequired(data);
    if (data.error) throw new Error(data.error);
    
    return data.data || [];
  }

  /**
   * Get account details for all accounts
   * @param includePositions - Whether to include current positions
   */
  async getAccountDetailsAll(includePositions = true): Promise<any[]> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('schwab-accounts', {
      body: { 
        action: 'account_details_all',
        fields: includePositions ? 'positions' : undefined,
      },
    });

    if (error) throw new Error(error.message);
    this.checkOAuthRequired(data);
    if (data.error) throw new Error(data.error);
    
    return data.data || [];
  }

  /**
   * Get account details for a specific account
   * @param accountHash - The account hash from getLinkedAccounts
   * @param includePositions - Whether to include current positions
   */
  async getAccountDetails(accountHash: string, includePositions = true): Promise<any> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('schwab-accounts', {
      body: { 
        action: 'account_details',
        accountHash,
        fields: includePositions ? 'positions' : undefined,
      },
    });

    if (error) throw new Error(error.message);
    this.checkOAuthRequired(data);
    if (data.error) throw new Error(data.error);
    
    return data.data;
  }

  /**
   * Get user preferences including streaming info
   */
  async getPreferences(): Promise<any> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('schwab-accounts', {
      body: { action: 'preferences' },
    });

    if (error) throw new Error(error.message);
    this.checkOAuthRequired(data);
    if (data.error) throw new Error(data.error);
    
    return data.data;
  }

  /**
   * Get real-time quotes for symbols
   * @param symbols - Array of symbols or comma-separated string
   */
  async getQuotes(symbols: string | string[]): Promise<SchwabQuote[]> {
    const normalizedSymbols = (Array.isArray(symbols) ? symbols : symbols.split(','))
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const isNotFoundError = (err: any) =>
      err?.code === 'NOT_FOUND' ||
      /requested function was not found/i.test(String(err?.message ?? ''));

    // 1) Prefer Schwab quotes when authenticated
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        const delays = [0, 600, 1500]; // brief deploy window retries

        for (const delayMs of delays) {
          if (delayMs) await wait(delayMs);

          try {
            const { data, error } = await supabase.functions.invoke('schwab-quotes', {
              body: { symbols: normalizedSymbols },
            });

            if (error) throw error;
            if (data?.error) throw new Error(data.error);

            return (data?.quotes as SchwabQuote[]) || [];
          } catch (err: any) {
            if (isNotFoundError(err)) {
              // likely deploying/routing; retry
              continue;
            }

            // Non-404 errors fall through to Polygon-backed fallback below.
            console.warn('[schwabApi.getQuotes] Schwab quotes failed, falling back:', err);
            break;
          }
        }
      }
    } catch (err) {
      console.warn('[schwabApi.getQuotes] Session/Schwab fetch failed, falling back:', err);
    }

    // 2) Fallback to Polygon-backed quotes
    try {
      const delays = [0, 600, 1500];

      for (const delayMs of delays) {
        if (delayMs) await wait(delayMs);

        const { data, error } = await supabase.functions.invoke('market-data-stream', {
          body: { action: 'get_quotes', symbols: normalizedSymbols },
        });

        if (error) {
          if (isNotFoundError(error)) continue;
          throw error;
        }

        const quotes = (data?.quotes || []) as Array<any>;
        return quotes
          .filter((q) => q && !q.error)
          .map((q) => ({
            symbol: q.symbol,
            lastPrice: q.price,
            bidPrice: q.bid,
            askPrice: q.ask,
            volume: q.volume,
            openPrice: q.open,
            highPrice: q.high,
            lowPrice: q.low,
            closePrice: q.close,
            netChange: q.change,
            netPercentChange: q.changePercent,
            source: q.source || data?.source || 'polygon',
          })) as SchwabQuote[];
      }

      return [];
    } catch (err) {
      console.error('[schwabApi.getQuotes] Fallback quotes failed:', err);
      return [];
    }
  }

  /**
   * Get orders for a specific account
   */
  async getOrders(
    accountHash: string, 
    options?: {
      fromEnteredTime?: string;
      toEnteredTime?: string;
      maxResults?: number;
      status?: string;
    }
  ): Promise<any[]> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('schwab-orders', {
      body: { 
        action: 'get_orders',
        accountHash,
        ...options,
      },
    });

    if (error) throw new Error(error.message);
    this.checkOAuthRequired(data);
    if (data.error) throw new Error(data.error);
    
    return data.data || [];
  }

  /**
   * Get a specific order
   */
  async getOrder(accountHash: string, orderId: string): Promise<any> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('schwab-orders', {
      body: { 
        action: 'get_order',
        accountHash,
        orderId,
      },
    });

    if (error) throw new Error(error.message);
    this.checkOAuthRequired(data);
    if (data.error) throw new Error(data.error);
    
    return data.data;
  }

  /**
   * Place an order
   */
  async placeOrder(accountHash: string, order: SchwabOrder): Promise<{ orderId?: string; success: boolean; requiresOAuth?: boolean }> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('schwab-orders', {
      body: { 
        action: 'place_order',
        accountHash,
        order,
      },
    });

    if (error) throw new Error(error.message);
    if (data?.requires_oauth) {
      return { success: false, requiresOAuth: true };
    }
    if (data.error) throw new Error(data.error);
    
    return data.data;
  }

  /**
   * Preview an order (get fees, validation) without placing it
   */
  async previewOrder(accountHash: string, order: SchwabOrder): Promise<any> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('schwab-orders', {
      body: { 
        action: 'preview_order',
        accountHash,
        order,
      },
    });

    if (error) throw new Error(error.message);
    this.checkOAuthRequired(data);
    if (data.error) throw new Error(data.error);
    
    return data.data;
  }

  /**
   * Cancel an order
   */
  async cancelOrder(accountHash: string, orderId: string): Promise<{ success: boolean }> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('schwab-orders', {
      body: { 
        action: 'cancel_order',
        accountHash,
        orderId,
      },
    });

    if (error) throw new Error(error.message);
    this.checkOAuthRequired(data);
    if (data.error) throw new Error(data.error);
    
    return data.data;
  }

  /**
   * Replace an existing order
   */
  async replaceOrder(accountHash: string, orderId: string, newOrder: SchwabOrder): Promise<{ orderId?: string; success: boolean }> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('schwab-orders', {
      body: { 
        action: 'replace_order',
        accountHash,
        orderId,
        order: newOrder,
      },
    });

    if (error) throw new Error(error.message);
    this.checkOAuthRequired(data);
    if (data.error) throw new Error(data.error);
    
    return data.data;
  }

  /**
   * Helper: Create a simple market order
   */
  createMarketOrder(
    symbol: string, 
    quantity: number, 
    instruction: 'BUY' | 'SELL'
  ): SchwabOrder {
    return {
      orderType: 'MARKET',
      session: 'NORMAL',
      duration: 'DAY',
      orderStrategyType: 'SINGLE',
      orderLegCollection: [{
        instruction,
        quantity,
        instrument: {
          symbol,
          assetType: 'EQUITY',
        },
      }],
    };
  }

  /**
   * Helper: Create a limit order
   */
  createLimitOrder(
    symbol: string, 
    quantity: number, 
    price: number,
    instruction: 'BUY' | 'SELL',
    duration: 'DAY' | 'GOOD_TILL_CANCEL' = 'DAY'
  ): SchwabOrder {
    return {
      orderType: 'LIMIT',
      session: 'NORMAL',
      duration,
      orderStrategyType: 'SINGLE',
      price: price.toFixed(2),
      orderLegCollection: [{
        instruction,
        quantity,
        instrument: {
          symbol,
          assetType: 'EQUITY',
        },
      }],
    };
  }

  /**
   * Helper: Create a stop order
   */
  createStopOrder(
    symbol: string, 
    quantity: number, 
    stopPrice: number,
    instruction: 'BUY' | 'SELL'
  ): SchwabOrder {
    return {
      orderType: 'STOP',
      session: 'NORMAL',
      duration: 'DAY',
      orderStrategyType: 'SINGLE',
      stopPrice: stopPrice.toFixed(2),
      orderLegCollection: [{
        instruction,
        quantity,
        instrument: {
          symbol,
          assetType: 'EQUITY',
        },
      }],
    };
  }
}

// Export singleton instance
export const schwabApi = new SchwabApiClient();
