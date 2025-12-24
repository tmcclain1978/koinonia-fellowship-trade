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
  orderType: 'LIMIT' | 'MARKET' | 'STOP' | 'STOP_LIMIT';
  session: 'NORMAL' | 'AM' | 'PM' | 'SEAMLESS';
  duration: 'DAY' | 'GOOD_TILL_CANCEL' | 'FILL_OR_KILL';
  orderStrategyType: 'SINGLE' | 'OCO' | 'TRIGGER';
  price?: string;
  stopPrice?: string;
  orderLegCollection: Array<{
    instruction: 'BUY' | 'SELL' | 'BUY_TO_COVER' | 'SELL_SHORT';
    quantity: number;
    instrument: {
      symbol: string;
      assetType: 'EQUITY' | 'OPTION' | 'INDEX' | 'MUTUAL_FUND' | 'CASH_EQUIVALENT' | 'FIXED_INCOME' | 'CURRENCY';
    };
  }>;
}

class SchwabApiClient {
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
    if (data.error) throw new Error(data.error);
    
    return data.data;
  }

  /**
   * Get real-time quotes for symbols
   * @param symbols - Array of symbols or comma-separated string
   */
  async getQuotes(symbols: string | string[]): Promise<SchwabQuote[]> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('schwab-quotes', {
      body: { symbols },
    });

    if (error) throw new Error(error.message);
    if (data.error) throw new Error(data.error);
    
    return data.quotes || [];
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
    if (data.error) throw new Error(data.error);
    
    return data.data;
  }

  /**
   * Place an order
   */
  async placeOrder(accountHash: string, order: SchwabOrder): Promise<{ orderId?: string; success: boolean }> {
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
