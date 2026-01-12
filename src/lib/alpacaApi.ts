import { supabase } from "@/integrations/supabase/client";

/**
 * Alpaca API Client - TypeScript wrapper for Alpaca edge functions
 * Documentation: https://docs.alpaca.markets/
 */

export interface AlpacaAccount {
  id: string;
  account_number: string;
  status: string;
  currency: string;
  buying_power: string;
  cash: string;
  portfolio_value: string;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
  transfers_blocked: boolean;
  account_blocked: boolean;
  trade_suspended_by_user: boolean;
  shorting_enabled: boolean;
  equity: string;
  last_equity: string;
  long_market_value: string;
  short_market_value: string;
  initial_margin: string;
  maintenance_margin: string;
  daytrade_count?: number;
  daytrading_buying_power?: string;
}

export interface AlpacaPosition {
  asset_id: string;
  symbol: string;
  exchange: string;
  asset_class: string;
  qty: string;
  avg_entry_price: string;
  side: string;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  unrealized_intraday_pl: string;
  unrealized_intraday_plpc: string;
  current_price: string;
  lastday_price: string;
  change_today: string;
}

export interface AlpacaOrder {
  id: string;
  client_order_id: string;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  filled_at?: string;
  expired_at?: string;
  canceled_at?: string;
  failed_at?: string;
  asset_id: string;
  symbol: string;
  asset_class: string;
  qty: string;
  filled_qty: string;
  type: string;
  side: string;
  time_in_force: string;
  limit_price?: string;
  stop_price?: string;
  filled_avg_price?: string;
  status: string;
  extended_hours: boolean;
  legs?: AlpacaOrder[];
}

export interface AlpacaQuote {
  symbol: string;
  latestTrade?: {
    t: string; // timestamp
    x: string; // exchange
    p: number; // price
    s: number; // size
  };
  latestQuote?: {
    t: string;
    bp: number; // bid price
    bs: number; // bid size
    ap: number; // ask price
    as: number; // ask size
  };
  dailyBar?: {
    t: string;
    o: number; // open
    h: number; // high
    l: number; // low
    c: number; // close
    v: number; // volume
  };
  previousDailyBar?: {
    t: string;
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
  };
}

export interface AlpacaOrderRequest {
  symbol: string;
  qty?: number;
  notional?: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit' | 'trailing_stop';
  time_in_force: 'day' | 'gtc' | 'opg' | 'cls' | 'ioc' | 'fok';
  limit_price?: string;
  stop_price?: string;
  trail_price?: string;
  trail_percent?: string;
  extended_hours?: boolean;
  client_order_id?: string;
  order_class?: 'simple' | 'bracket' | 'oco' | 'oto';
  take_profit?: {
    limit_price: string;
  };
  stop_loss?: {
    stop_price: string;
    limit_price?: string;
  };
}

class AlpacaApiClient {
  /**
   * Get account details
   */
  async getAccount(): Promise<AlpacaAccount> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('alpaca-accounts', {
      body: { action: 'account' },
    });

    if (error) throw new Error(error.message);
    if (data.error) throw new Error(data.error);

    return data.data;
  }

  /**
   * Get all positions
   */
  async getPositions(): Promise<AlpacaPosition[]> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('alpaca-accounts', {
      body: { action: 'positions' },
    });

    if (error) throw new Error(error.message);
    if (data.error) throw new Error(data.error);

    return data.data || [];
  }

  /**
   * Get a specific position
   */
  async getPosition(symbol: string): Promise<AlpacaPosition> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('alpaca-accounts', {
      body: { action: 'position', symbol },
    });

    if (error) throw new Error(error.message);
    if (data.error) throw new Error(data.error);

    return data.data;
  }

  /**
   * Close all positions
   */
  async closeAllPositions(cancelOrders: boolean = false): Promise<any[]> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('alpaca-accounts', {
      body: { action: 'close_all', cancel_orders: cancelOrders },
    });

    if (error) throw new Error(error.message);
    if (data.error) throw new Error(data.error);

    return data.data || [];
  }

  /**
   * Get quotes for symbols
   */
  async getQuotes(symbols: string[]): Promise<AlpacaQuote[]> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('alpaca-quotes', {
      body: { symbols },
    });

    if (error) throw new Error(error.message);
    if (data.error) throw new Error(data.error);

    return data.quotes || [];
  }

  /**
   * Get historical bars
   */
  async getBars(
    symbols: string[],
    timeframe: string = '1Day',
    start?: string,
    end?: string,
    limit?: number
  ): Promise<any> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('alpaca-quotes', {
      body: { 
        action: 'bars',
        symbols, 
        timeframe,
        start,
        end,
        limit,
      },
    });

    if (error) throw new Error(error.message);
    if (data.error) throw new Error(data.error);

    return data.bars || {};
  }

  /**
   * Get all orders
   */
  async getOrders(options?: {
    status?: 'open' | 'closed' | 'all';
    limit?: number;
    after?: string;
    until?: string;
    direction?: 'asc' | 'desc';
  }): Promise<AlpacaOrder[]> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('alpaca-orders', {
      body: { action: 'list', ...options },
    });

    if (error) throw new Error(error.message);
    if (data.error) throw new Error(data.error);

    return data.data || [];
  }

  /**
   * Get a specific order
   */
  async getOrder(orderId: string): Promise<AlpacaOrder> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('alpaca-orders', {
      body: { action: 'get', orderId },
    });

    if (error) throw new Error(error.message);
    if (data.error) throw new Error(data.error);

    return data.data;
  }

  /**
   * Place an order
   */
  async placeOrder(order: AlpacaOrderRequest): Promise<AlpacaOrder> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('alpaca-orders', {
      body: { action: 'place', order },
    });

    if (error) throw new Error(error.message);
    if (data.error) throw new Error(data.error);

    return data.data;
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<{ success: boolean }> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('alpaca-orders', {
      body: { action: 'cancel', orderId },
    });

    if (error) throw new Error(error.message);
    if (data.error) throw new Error(data.error);

    return { success: true };
  }

  /**
   * Cancel all orders
   */
  async cancelAllOrders(): Promise<any[]> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('alpaca-orders', {
      body: { action: 'cancel_all' },
    });

    if (error) throw new Error(error.message);
    if (data.error) throw new Error(data.error);

    return data.data || [];
  }

  /**
   * Replace an order
   */
  async replaceOrder(
    orderId: string, 
    updates: {
      qty?: number;
      time_in_force?: string;
      limit_price?: string;
      stop_price?: string;
      trail?: string;
      client_order_id?: string;
    }
  ): Promise<AlpacaOrder> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('alpaca-orders', {
      body: { action: 'replace', orderId, updates },
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
    qty: number,
    side: 'buy' | 'sell'
  ): AlpacaOrderRequest {
    return {
      symbol,
      qty,
      side,
      type: 'market',
      time_in_force: 'day',
    };
  }

  /**
   * Helper: Create a limit order
   */
  createLimitOrder(
    symbol: string,
    qty: number,
    limitPrice: number,
    side: 'buy' | 'sell',
    timeInForce: 'day' | 'gtc' = 'day'
  ): AlpacaOrderRequest {
    return {
      symbol,
      qty,
      side,
      type: 'limit',
      time_in_force: timeInForce,
      limit_price: limitPrice.toFixed(2),
    };
  }

  /**
   * Helper: Create a stop order
   */
  createStopOrder(
    symbol: string,
    qty: number,
    stopPrice: number,
    side: 'buy' | 'sell'
  ): AlpacaOrderRequest {
    return {
      symbol,
      qty,
      side,
      type: 'stop',
      time_in_force: 'day',
      stop_price: stopPrice.toFixed(2),
    };
  }

  /**
   * Helper: Create a bracket order
   */
  createBracketOrder(
    symbol: string,
    qty: number,
    side: 'buy' | 'sell',
    limitPrice: number,
    takeProfitPrice: number,
    stopLossPrice: number
  ): AlpacaOrderRequest {
    return {
      symbol,
      qty,
      side,
      type: 'limit',
      time_in_force: 'day',
      limit_price: limitPrice.toFixed(2),
      order_class: 'bracket',
      take_profit: {
        limit_price: takeProfitPrice.toFixed(2),
      },
      stop_loss: {
        stop_price: stopLossPrice.toFixed(2),
      },
    };
  }
}

// Export singleton instance
export const alpacaApi = new AlpacaApiClient();
