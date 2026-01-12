import { supabase } from "@/integrations/supabase/client";
import { schwabApi, type SchwabQuote, type SchwabOrder, type AccountPosition } from "./schwabApi";
import { alpacaApi, type AlpacaQuote, type AlpacaPosition, type AlpacaOrder } from "./alpacaApi";

/**
 * Broker Router Service
 * Provides a unified interface for multi-broker support
 */

export type BrokerType = 'schwab' | 'alpaca' | 'td_ameritrade' | 'etrade' | 'interactive_brokers';

export interface BrokerStatus {
  broker: BrokerType;
  connected: boolean;
  status: 'connected' | 'expired' | 'disconnected' | 'not_configured' | 'deprecated' | 'coming_soon';
  message: string;
  paperMode?: boolean;
}

export interface UnifiedAccount {
  id: string;
  broker: BrokerType;
  accountNumber: string;
  accountType?: string;
  cashBalance?: number;
  portfolioValue?: number;
  buyingPower?: number;
  dayTradesRemaining?: number;
}

export interface UnifiedPosition {
  symbol: string;
  quantity: number;
  averagePrice: number;
  currentPrice?: number;
  marketValue: number;
  unrealizedPnL?: number;
  unrealizedPnLPercent?: number;
  broker: BrokerType;
  assetType: 'EQUITY' | 'OPTION' | 'CRYPTO' | 'OTHER';
}

export interface UnifiedQuote {
  symbol: string;
  lastPrice: number;
  bidPrice?: number;
  askPrice?: number;
  volume?: number;
  change?: number;
  changePercent?: number;
  broker: BrokerType;
}

export interface UnifiedOrderRequest {
  symbol: string;
  quantity: number;
  side: 'buy' | 'sell';
  orderType: 'market' | 'limit' | 'stop' | 'stop_limit';
  limitPrice?: number;
  stopPrice?: number;
  duration: 'day' | 'gtc';
  assetType?: 'EQUITY' | 'OPTION';
}

export interface UnifiedOrderResult {
  success: boolean;
  orderId?: string;
  status?: string;
  message?: string;
  broker: BrokerType;
  requiresOAuth?: boolean;
}

class BrokerRouter {
  private cachedBrokerType: BrokerType | null = null;
  private cachedCredentials: any = null;
  private lastCredentialsFetch: number = 0;
  private readonly CREDENTIALS_CACHE_MS = 30000; // 30 seconds

  /**
   * Get current user's broker type from credentials
   */
  async getBrokerType(): Promise<BrokerType> {
    const credentials = await this.getCredentials();
    return (credentials?.broker_type as BrokerType) || 'schwab';
  }

  /**
   * Get cached or fresh credentials
   */
  private async getCredentials(): Promise<any> {
    const now = Date.now();
    if (this.cachedCredentials && (now - this.lastCredentialsFetch) < this.CREDENTIALS_CACHE_MS) {
      return this.cachedCredentials;
    }

    try {
      const { data, error } = await supabase.functions.invoke('encrypt-credentials', {
        body: { operation: 'load' },
      });

      if (error) {
        console.error('Failed to load credentials:', error);
        return null;
      }

      this.cachedCredentials = data?.credentials || null;
      this.lastCredentialsFetch = now;
      return this.cachedCredentials;
    } catch (e) {
      console.error('Error fetching credentials:', e);
      return null;
    }
  }

  /**
   * Clear credentials cache (call after saving new credentials)
   */
  clearCredentialsCache(): void {
    this.cachedCredentials = null;
    this.lastCredentialsFetch = 0;
  }

  /**
   * Get broker connection status
   */
  async getBrokerStatus(): Promise<BrokerStatus> {
    const credentials = await this.getCredentials();
    const brokerType = (credentials?.broker_type as BrokerType) || 'schwab';

    switch (brokerType) {
      case 'schwab':
        return this.getSchwabStatus(credentials);
      case 'alpaca':
        return this.getAlpacaStatus(credentials);
      case 'td_ameritrade':
        return {
          broker: 'td_ameritrade',
          connected: false,
          status: 'deprecated',
          message: 'TD Ameritrade API was sunset in September 2024. Please migrate to Charles Schwab.',
        };
      case 'etrade':
        return {
          broker: 'etrade',
          connected: false,
          status: 'coming_soon',
          message: 'E*TRADE integration requires OAuth 1.0a which is not yet implemented.',
        };
      case 'interactive_brokers':
        return {
          broker: 'interactive_brokers',
          connected: false,
          status: 'coming_soon',
          message: 'Interactive Brokers integration coming soon.',
        };
      default:
        return {
          broker: brokerType,
          connected: false,
          status: 'not_configured',
          message: 'Unknown broker type',
        };
    }
  }

  private async getSchwabStatus(credentials: any): Promise<BrokerStatus> {
    if (!credentials?.schwab_client_id) {
      return {
        broker: 'schwab',
        connected: false,
        status: 'not_configured',
        message: 'Schwab credentials not configured',
      };
    }

    try {
      const { data } = await supabase.functions.invoke('schwab-get-access-token');
      if (data?.access_token) {
        return {
          broker: 'schwab',
          connected: true,
          status: 'connected',
          message: 'Schwab account connected',
        };
      } else {
        return {
          broker: 'schwab',
          connected: false,
          status: 'expired',
          message: 'Schwab OAuth token expired. Please re-authorize.',
        };
      }
    } catch (e) {
      return {
        broker: 'schwab',
        connected: false,
        status: 'expired',
        message: 'Failed to verify Schwab connection',
      };
    }
  }

  private async getAlpacaStatus(credentials: any): Promise<BrokerStatus> {
    if (!credentials?.alpaca_api_key || !credentials?.alpaca_secret_key) {
      return {
        broker: 'alpaca',
        connected: false,
        status: 'not_configured',
        message: 'Alpaca credentials not configured',
        paperMode: credentials?.alpaca_paper_mode ?? true,
      };
    }

    try {
      const accounts = await alpacaApi.getAccount();
      return {
        broker: 'alpaca',
        connected: true,
        status: 'connected',
        message: 'Alpaca account connected',
        paperMode: credentials?.alpaca_paper_mode ?? true,
      };
    } catch (e) {
      return {
        broker: 'alpaca',
        connected: false,
        status: 'disconnected',
        message: 'Failed to connect to Alpaca. Check your API keys.',
        paperMode: credentials?.alpaca_paper_mode ?? true,
      };
    }
  }

  /**
   * Get all accounts for current broker
   */
  async getAccounts(): Promise<UnifiedAccount[]> {
    const brokerType = await this.getBrokerType();

    switch (brokerType) {
      case 'schwab':
        return this.getSchwabAccounts();
      case 'alpaca':
        return this.getAlpacaAccounts();
      default:
        console.warn(`Accounts not supported for broker: ${brokerType}`);
        return [];
    }
  }

  private async getSchwabAccounts(): Promise<UnifiedAccount[]> {
    try {
      const accounts = await schwabApi.getLinkedAccounts();
      return accounts.map(acc => ({
        id: acc.hashValue,
        broker: 'schwab' as BrokerType,
        accountNumber: acc.accountNumber,
      }));
    } catch (e) {
      console.error('Failed to get Schwab accounts:', e);
      return [];
    }
  }

  private async getAlpacaAccounts(): Promise<UnifiedAccount[]> {
    try {
      const account = await alpacaApi.getAccount();
      return [{
        id: account.id,
        broker: 'alpaca' as BrokerType,
        accountNumber: account.account_number,
        cashBalance: parseFloat(account.cash),
        portfolioValue: parseFloat(account.portfolio_value),
        buyingPower: parseFloat(account.buying_power),
        dayTradesRemaining: account.daytrade_count !== undefined ? 
          Math.max(0, 3 - account.daytrade_count) : undefined,
      }];
    } catch (e) {
      console.error('Failed to get Alpaca accounts:', e);
      return [];
    }
  }

  /**
   * Get positions for current broker
   */
  async getPositions(): Promise<UnifiedPosition[]> {
    const brokerType = await this.getBrokerType();

    switch (brokerType) {
      case 'schwab':
        return this.getSchwabPositions();
      case 'alpaca':
        return this.getAlpacaPositions();
      default:
        console.warn(`Positions not supported for broker: ${brokerType}`);
        return [];
    }
  }

  private async getSchwabPositions(): Promise<UnifiedPosition[]> {
    try {
      const accountsData = await schwabApi.getAccountDetailsAll(true);
      const positions: UnifiedPosition[] = [];

      for (const account of accountsData) {
        const accountPositions = account.securitiesAccount?.positions || [];
        for (const pos of accountPositions) {
          positions.push({
            symbol: pos.instrument?.symbol || 'Unknown',
            quantity: pos.longQuantity - pos.shortQuantity,
            averagePrice: pos.averagePrice,
            marketValue: pos.marketValue,
            unrealizedPnL: pos.currentDayProfitLoss,
            unrealizedPnLPercent: pos.currentDayProfitLossPercentage,
            broker: 'schwab',
            assetType: pos.instrument?.assetType === 'OPTION' ? 'OPTION' : 'EQUITY',
          });
        }
      }

      return positions;
    } catch (e) {
      console.error('Failed to get Schwab positions:', e);
      return [];
    }
  }

  private async getAlpacaPositions(): Promise<UnifiedPosition[]> {
    try {
      const positions = await alpacaApi.getPositions();
      return positions.map(pos => ({
        symbol: pos.symbol,
        quantity: parseFloat(pos.qty),
        averagePrice: parseFloat(pos.avg_entry_price),
        currentPrice: parseFloat(pos.current_price),
        marketValue: parseFloat(pos.market_value),
        unrealizedPnL: parseFloat(pos.unrealized_pl),
        unrealizedPnLPercent: parseFloat(pos.unrealized_plpc) * 100,
        broker: 'alpaca' as BrokerType,
        assetType: pos.asset_class === 'crypto' ? 'CRYPTO' : 'EQUITY',
      }));
    } catch (e) {
      console.error('Failed to get Alpaca positions:', e);
      return [];
    }
  }

  /**
   * Get quotes for symbols
   */
  async getQuotes(symbols: string[]): Promise<UnifiedQuote[]> {
    const brokerType = await this.getBrokerType();

    switch (brokerType) {
      case 'schwab':
        return this.getSchwabQuotes(symbols);
      case 'alpaca':
        return this.getAlpacaQuotes(symbols);
      default:
        // Fall back to Schwab quotes (they use polygon/alpha vantage)
        return this.getSchwabQuotes(symbols);
    }
  }

  private async getSchwabQuotes(symbols: string[]): Promise<UnifiedQuote[]> {
    try {
      const quotes = await schwabApi.getQuotes(symbols);
      return quotes.map(q => ({
        symbol: q.symbol,
        lastPrice: q.lastPrice,
        bidPrice: q.bidPrice,
        askPrice: q.askPrice,
        volume: q.volume,
        change: q.netChange,
        changePercent: q.netPercentChange,
        broker: 'schwab' as BrokerType,
      }));
    } catch (e) {
      console.error('Failed to get Schwab quotes:', e);
      return [];
    }
  }

  private async getAlpacaQuotes(symbols: string[]): Promise<UnifiedQuote[]> {
    try {
      const quotes = await alpacaApi.getQuotes(symbols);
      return quotes.map(q => ({
        symbol: q.symbol,
        lastPrice: q.latestTrade?.p || q.latestQuote?.ap || 0,
        bidPrice: q.latestQuote?.bp,
        askPrice: q.latestQuote?.ap,
        volume: q.dailyBar?.v,
        change: q.dailyBar ? (q.latestTrade?.p || 0) - q.dailyBar.o : undefined,
        changePercent: q.dailyBar ? 
          (((q.latestTrade?.p || 0) - q.dailyBar.o) / q.dailyBar.o) * 100 : undefined,
        broker: 'alpaca' as BrokerType,
      }));
    } catch (e) {
      console.error('Failed to get Alpaca quotes:', e);
      return [];
    }
  }

  /**
   * Place an order
   */
  async placeOrder(order: UnifiedOrderRequest, accountId?: string): Promise<UnifiedOrderResult> {
    const brokerType = await this.getBrokerType();

    switch (brokerType) {
      case 'schwab':
        return this.placeSchwabOrder(order, accountId);
      case 'alpaca':
        return this.placeAlpacaOrder(order);
      case 'td_ameritrade':
        return {
          success: false,
          message: 'TD Ameritrade API was sunset in September 2024. Please migrate to Charles Schwab.',
          broker: 'td_ameritrade',
        };
      case 'etrade':
        return {
          success: false,
          message: 'E*TRADE integration requires OAuth 1.0a which is not yet implemented.',
          broker: 'etrade',
        };
      case 'interactive_brokers':
        return {
          success: false,
          message: 'Interactive Brokers integration coming soon.',
          broker: 'interactive_brokers',
        };
      default:
        return {
          success: false,
          message: `Order placement not supported for broker: ${brokerType}`,
          broker: brokerType,
        };
    }
  }

  private async placeSchwabOrder(order: UnifiedOrderRequest, accountId?: string): Promise<UnifiedOrderResult> {
    try {
      // Get account hash if not provided
      let accountHash = accountId;
      if (!accountHash) {
        const accounts = await schwabApi.getLinkedAccounts();
        if (accounts.length === 0) {
          return {
            success: false,
            message: 'No Schwab accounts found',
            broker: 'schwab',
          };
        }
        accountHash = accounts[0].hashValue;
      }

      // Build Schwab order
      let schwabOrder: SchwabOrder;
      const instruction = order.side === 'buy' ? 'BUY' : 'SELL';

      switch (order.orderType) {
        case 'market':
          schwabOrder = schwabApi.createMarketOrder(order.symbol, order.quantity, instruction);
          break;
        case 'limit':
          if (!order.limitPrice) {
            return { success: false, message: 'Limit price required', broker: 'schwab' };
          }
          schwabOrder = schwabApi.createLimitOrder(
            order.symbol, 
            order.quantity, 
            order.limitPrice, 
            instruction,
            order.duration === 'gtc' ? 'GOOD_TILL_CANCEL' : 'DAY'
          );
          break;
        case 'stop':
          if (!order.stopPrice) {
            return { success: false, message: 'Stop price required', broker: 'schwab' };
          }
          schwabOrder = schwabApi.createStopOrder(order.symbol, order.quantity, order.stopPrice, instruction);
          break;
        default:
          return { success: false, message: `Unsupported order type: ${order.orderType}`, broker: 'schwab' };
      }

      const result = await schwabApi.placeOrder(accountHash, schwabOrder);
      return {
        success: result.success,
        orderId: result.orderId,
        requiresOAuth: result.requiresOAuth,
        broker: 'schwab',
      };
    } catch (e: any) {
      return {
        success: false,
        message: e.message || 'Failed to place Schwab order',
        broker: 'schwab',
      };
    }
  }

  private async placeAlpacaOrder(order: UnifiedOrderRequest): Promise<UnifiedOrderResult> {
    try {
      const result = await alpacaApi.placeOrder({
        symbol: order.symbol,
        qty: order.quantity,
        side: order.side,
        type: order.orderType === 'stop_limit' ? 'stop_limit' : order.orderType,
        time_in_force: order.duration === 'gtc' ? 'gtc' : 'day',
        limit_price: order.limitPrice?.toString(),
        stop_price: order.stopPrice?.toString(),
      });

      return {
        success: true,
        orderId: result.id,
        status: result.status,
        broker: 'alpaca',
      };
    } catch (e: any) {
      return {
        success: false,
        message: e.message || 'Failed to place Alpaca order',
        broker: 'alpaca',
      };
    }
  }

  /**
   * Get broker display name
   */
  getBrokerDisplayName(broker: BrokerType): string {
    const names: Record<BrokerType, string> = {
      schwab: 'Charles Schwab',
      alpaca: 'Alpaca',
      td_ameritrade: 'TD Ameritrade',
      etrade: 'E*TRADE',
      interactive_brokers: 'Interactive Brokers',
    };
    return names[broker] || broker;
  }

  /**
   * Check if broker supports real-time streaming
   */
  supportsStreaming(broker: BrokerType): boolean {
    return ['schwab', 'alpaca'].includes(broker);
  }

  /**
   * Check if broker supports options trading
   */
  supportsOptions(broker: BrokerType): boolean {
    return ['schwab'].includes(broker);
  }
}

// Export singleton instance
export const brokerRouter = new BrokerRouter();
