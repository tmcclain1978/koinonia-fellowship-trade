// Simulation Engine for realistic paper trading execution

export interface SimulationConfig {
  slippageModel: 'none' | 'fixed' | 'variable';
  slippageAmount: number; // In dollars or percentage
  fillProbability: number; // 0-1
  partialFillEnabled: boolean;
  latencyMs: number; // Simulated network latency
  commissionPerContract: number;
  marketImpactEnabled: boolean;
}

export interface OrderRequest {
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  quantity: number;
  limitPrice?: number;
  stopPrice?: number;
  duration: 'day' | 'gtc';
  optionType?: 'CALL' | 'PUT';
  strike?: number;
  expiration?: string;
}

export interface OrderFill {
  orderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  filledQuantity: number;
  remainingQuantity: number;
  fillPrice: number;
  slippage: number;
  commission: number;
  status: 'filled' | 'partial' | 'rejected' | 'cancelled';
  timestamp: Date;
  message?: string;
}

export interface MarketQuote {
  bid: number;
  ask: number;
  last: number;
  volume: number;
  spread: number;
}

const DEFAULT_CONFIG: SimulationConfig = {
  slippageModel: 'variable',
  slippageAmount: 0.01, // 1%
  fillProbability: 0.95,
  partialFillEnabled: true,
  latencyMs: 100,
  commissionPerContract: 0.65,
  marketImpactEnabled: true
};

export class SimulationEngine {
  private config: SimulationConfig;
  private pendingOrders: Map<string, OrderRequest> = new Map();

  constructor(config: Partial<SimulationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // Simulate order execution
  async executeOrder(order: OrderRequest, currentQuote: MarketQuote): Promise<OrderFill> {
    // Simulate network latency
    await this.simulateLatency();

    const orderId = `SIM-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Check fill probability
    if (Math.random() > this.config.fillProbability) {
      return {
        orderId,
        symbol: order.symbol,
        side: order.side,
        filledQuantity: 0,
        remainingQuantity: order.quantity,
        fillPrice: 0,
        slippage: 0,
        commission: 0,
        status: 'rejected',
        timestamp: new Date(),
        message: 'Order rejected - no fills available at current price'
      };
    }

    // Calculate execution price based on order type
    let basePrice = this.calculateBasePrice(order, currentQuote);
    
    // Apply slippage
    const slippage = this.calculateSlippage(basePrice, order.quantity, currentQuote);
    const fillPrice = order.side === 'buy' 
      ? basePrice + slippage 
      : basePrice - slippage;

    // Calculate filled quantity (potentially partial)
    let filledQuantity = order.quantity;
    if (this.config.partialFillEnabled && order.type !== 'market') {
      filledQuantity = this.calculatePartialFill(order.quantity);
    }

    // Calculate commission
    const commission = filledQuantity * this.config.commissionPerContract;

    // Validate limit orders
    if (order.type === 'limit' || order.type === 'stop_limit') {
      if (!this.isLimitOrderFillable(order, currentQuote)) {
        return {
          orderId,
          symbol: order.symbol,
          side: order.side,
          filledQuantity: 0,
          remainingQuantity: order.quantity,
          fillPrice: 0,
          slippage: 0,
          commission: 0,
          status: 'rejected',
          timestamp: new Date(),
          message: `Limit price ${order.limitPrice} not reached. Current ${order.side === 'buy' ? 'ask' : 'bid'}: ${order.side === 'buy' ? currentQuote.ask : currentQuote.bid}`
        };
      }
    }

    // Validate stop orders
    if (order.type === 'stop' || order.type === 'stop_limit') {
      if (!this.isStopTriggered(order, currentQuote)) {
        this.pendingOrders.set(orderId, order);
        return {
          orderId,
          symbol: order.symbol,
          side: order.side,
          filledQuantity: 0,
          remainingQuantity: order.quantity,
          fillPrice: 0,
          slippage: 0,
          commission: 0,
          status: 'rejected',
          timestamp: new Date(),
          message: `Stop price ${order.stopPrice} not triggered. Current last: ${currentQuote.last}`
        };
      }
    }

    return {
      orderId,
      symbol: order.symbol,
      side: order.side,
      filledQuantity,
      remainingQuantity: order.quantity - filledQuantity,
      fillPrice: parseFloat(fillPrice.toFixed(2)),
      slippage: parseFloat(slippage.toFixed(4)),
      commission: parseFloat(commission.toFixed(2)),
      status: filledQuantity === order.quantity ? 'filled' : 'partial',
      timestamp: new Date(),
      message: filledQuantity < order.quantity 
        ? `Partially filled ${filledQuantity} of ${order.quantity} contracts`
        : undefined
    };
  }

  // Calculate base execution price
  private calculateBasePrice(order: OrderRequest, quote: MarketQuote): number {
    switch (order.type) {
      case 'market':
        return order.side === 'buy' ? quote.ask : quote.bid;
      case 'limit':
        return order.limitPrice || (order.side === 'buy' ? quote.ask : quote.bid);
      case 'stop':
        return order.stopPrice || quote.last;
      case 'stop_limit':
        return order.limitPrice || order.stopPrice || quote.last;
      default:
        return quote.last;
    }
  }

  // Calculate slippage
  private calculateSlippage(price: number, quantity: number, quote: MarketQuote): number {
    switch (this.config.slippageModel) {
      case 'none':
        return 0;
      case 'fixed':
        return this.config.slippageAmount;
      case 'variable':
        // Variable slippage based on order size and spread
        const spreadImpact = quote.spread * 0.5;
        const sizeImpact = this.config.marketImpactEnabled 
          ? (quantity / 100) * this.config.slippageAmount * price
          : 0;
        const randomness = (Math.random() - 0.5) * 0.01 * price;
        return spreadImpact + sizeImpact + randomness;
      default:
        return 0;
    }
  }

  // Calculate partial fill quantity
  private calculatePartialFill(requestedQuantity: number): number {
    // 70% chance of full fill, otherwise partial
    if (Math.random() > 0.3) {
      return requestedQuantity;
    }
    // Fill between 50-99% of order
    const fillRatio = 0.5 + Math.random() * 0.49;
    return Math.max(1, Math.floor(requestedQuantity * fillRatio));
  }

  // Check if limit order can be filled
  private isLimitOrderFillable(order: OrderRequest, quote: MarketQuote): boolean {
    if (!order.limitPrice) return true;
    
    if (order.side === 'buy') {
      return order.limitPrice >= quote.ask;
    } else {
      return order.limitPrice <= quote.bid;
    }
  }

  // Check if stop is triggered
  private isStopTriggered(order: OrderRequest, quote: MarketQuote): boolean {
    if (!order.stopPrice) return true;
    
    if (order.side === 'buy') {
      return quote.last >= order.stopPrice;
    } else {
      return quote.last <= order.stopPrice;
    }
  }

  // Simulate network latency
  private async simulateLatency(): Promise<void> {
    const jitter = this.config.latencyMs * (0.5 + Math.random());
    await new Promise(resolve => setTimeout(resolve, jitter));
  }

  // Generate realistic quote from base price
  generateQuote(basePrice: number, volatility: number = 0.02): MarketQuote {
    const spread = basePrice * volatility * Math.random();
    const bid = basePrice - spread / 2;
    const ask = basePrice + spread / 2;
    
    return {
      bid: parseFloat(bid.toFixed(2)),
      ask: parseFloat(ask.toFixed(2)),
      last: parseFloat((bid + Math.random() * spread).toFixed(2)),
      volume: Math.floor(Math.random() * 10000) + 1000,
      spread: parseFloat(spread.toFixed(2))
    };
  }

  // Update configuration
  updateConfig(config: Partial<SimulationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // Get current configuration
  getConfig(): SimulationConfig {
    return { ...this.config };
  }

  // Process pending stop orders
  async processPendingOrders(currentQuote: MarketQuote): Promise<OrderFill[]> {
    const fills: OrderFill[] = [];
    
    for (const [orderId, order] of this.pendingOrders) {
      if (this.isStopTriggered(order, currentQuote)) {
        const fill = await this.executeOrder(order, currentQuote);
        fills.push(fill);
        this.pendingOrders.delete(orderId);
      }
    }
    
    return fills;
  }

  // Cancel pending order
  cancelOrder(orderId: string): boolean {
    return this.pendingOrders.delete(orderId);
  }

  // Get pending orders
  getPendingOrders(): OrderRequest[] {
    return Array.from(this.pendingOrders.values());
  }
}

// Singleton instance
let simulationEngine: SimulationEngine | null = null;

export function getSimulationEngine(config?: Partial<SimulationConfig>): SimulationEngine {
  if (!simulationEngine) {
    simulationEngine = new SimulationEngine(config);
  } else if (config) {
    simulationEngine.updateConfig(config);
  }
  return simulationEngine;
}
