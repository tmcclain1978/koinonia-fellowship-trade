import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Course data
const courseData = {
  title: "Advanced Options Trading Academy",
  description: "Transform from intermediate trader to institutional-style options professional. Master volatility, Greeks, LEAPS, event trading, and systematic risk management. This comprehensive 14-module program covers professional market mechanics, volatility analysis, advanced strategies, and the psychology of successful trading.",
  difficulty_level: "advanced",
  estimated_duration: "40+ hours",
  status: "published",
  order_index: 10
};

// Module definitions
const modules = [
  {
    title: "Module 1: Professional Options Market Mechanics",
    description: "Understand how options markets truly function behind the scenes. Learn about market makers, order flow, liquidity dynamics, and dealer positioning.",
    order_index: 0,
    lessons: [
      {
        title: "Introduction to Market Microstructure",
        description: "Learn how options orders flow through exchanges and the key participants in options markets.",
        duration: "25 min",
        order_index: 0,
        content_markdown: `# Introduction to Market Microstructure

## Learning Objectives
By the end of this lesson, you will:
- Understand how options orders flow through the market
- Know the key participants in options markets
- Recognize the difference between exchange-traded and OTC options
- Understand the role of the Options Clearing Corporation (OCC)

## Key Concepts

### Order Flow in Options Markets
When you place an options order, it travels through several layers before execution:

1. **Your Broker Receives the Order** - Your broker validates the order and routes it
2. **Smart Order Routing** - The order is sent to the exchange with best execution
3. **Exchange Matching** - Market makers compete to fill your order
4. **OCC Guarantees** - The Options Clearing Corporation becomes counterparty

### Major Options Exchanges
- **CBOE** - Chicago Board Options Exchange (largest by volume)
- **NYSE Arca Options** - Electronic exchange
- **NASDAQ Options Market** - Competitive pricing
- **MIAX** - Miami International Securities Exchange
- **BOX Exchange** - Price improvement auctions

### Market Participants

| Participant | Role | Goal |
|------------|------|------|
| Retail Traders | Individual investors | Profit from directional or income strategies |
| Market Makers | Liquidity providers | Earn bid-ask spread while staying delta-neutral |
| Institutional | Hedge funds, pensions | Large-scale hedging and alpha generation |
| Proprietary | Trading firm capital | High-frequency and statistical arbitrage |

### The Options Clearing Corporation (OCC)
The OCC is the **central counterparty** for all U.S. options trades:
- Guarantees contract performance
- Manages exercise and assignment
- Calculates margin requirements
- Eliminates counterparty risk between traders

## Practical Example: Order Lifecycle

Imagine you want to buy 10 contracts of AAPL $150 calls:

**Step 1: Order Submission**
- You enter a limit order at $2.47
- Your broker receives and validates the order

**Step 2: Order Routing**
- Smart router checks all exchanges for best price
- Order sent to exchange showing $2.45 bid / $2.50 ask

**Step 3: Execution**
- Market maker sees your $2.47 limit
- They can fill you at $2.47 and earn the spread vs their hedge

**Step 4: Clearing**
- OCC becomes counterparty to both sides
- Trade is settled T+1

## Why This Matters for Your Trading

Understanding market structure helps you:
- **Time entries** - Trade during high liquidity periods
- **Avoid slippage** - Use limit orders appropriately
- **Read the tape** - Understand why prices move
- **Select liquid options** - Focus on tight bid-ask spreads

## Key Takeaways
1. Options markets have multiple participants with different goals
2. Market makers provide liquidity but profit from the spread
3. The OCC guarantees all trades, eliminating counterparty risk
4. Order routing quality affects your execution price
5. Understanding structure = better execution

## Quick Reference
| Term | Definition |
|------|------------|
| **Bid** | Price buyers are willing to pay |
| **Ask** | Price sellers are asking |
| **Spread** | Difference between bid and ask |
| **OCC** | Options Clearing Corporation |
| **NBBO** | National Best Bid and Offer |
| **Smart Routing** | Technology to find best execution |`,
        quiz_questions: [
          {
            question: "What is the primary function of the Options Clearing Corporation (OCC)?",
            options: ["To set options prices", "To guarantee contract performance and act as counterparty", "To provide trading recommendations", "To regulate market makers"],
            correct_answer: 1,
            explanation: "The OCC guarantees all U.S. options trades by becoming the counterparty to both sides, eliminating counterparty risk."
          },
          {
            question: "Which participant's primary goal is to earn the bid-ask spread while maintaining a delta-neutral position?",
            options: ["Retail traders", "Hedge funds", "Market makers", "Proprietary traders"],
            correct_answer: 2,
            explanation: "Market makers provide liquidity by continuously quoting bid and ask prices, profiting from the spread while hedging their directional exposure."
          },
          {
            question: "What does 'smart order routing' accomplish?",
            options: ["It automatically picks the best strategy", "It finds the exchange with best execution for your order", "It predicts price movements", "It calculates margin requirements"],
            correct_answer: 1,
            explanation: "Smart order routing technology evaluates all available exchanges to find the best execution price for your order."
          }
        ]
      },
      {
        title: "Market Makers & Liquidity Provision",
        description: "Understand how market makers operate, how they profit, and their role in maintaining liquid markets.",
        duration: "30 min",
        order_index: 1,
        content_markdown: `# Market Makers & Liquidity Provision

## Learning Objectives
By the end of this lesson, you will:
- Understand how market makers generate profits
- Know how delta hedging works in practice
- Recognize the relationship between market makers and price discovery
- Understand liquidity provision economics

## The Market Maker Business Model

### How Market Makers Profit
Market makers earn money in three primary ways:

1. **Bid-Ask Spread Capture**
   - Buy at bid ($2.45), sell at ask ($2.50) = $0.05 profit per contract
   - Multiply by thousands of contracts daily

2. **Rebates from Exchanges**
   - Exchanges pay for providing liquidity
   - Typically $0.20-$0.50 per contract

3. **Volatility Edge**
   - Options are priced using implied volatility
   - If realized vol < implied vol, sellers profit

### The Delta Hedging Cycle

When a market maker sells you calls, they become **short delta**. They must hedge:

\`\`\`
You Buy 10 AAPL $150 Calls (Delta = 0.50)
↓
Market Maker Position: Short 10 calls, Short 500 delta
↓
Market Maker Buys 500 shares of AAPL to hedge
↓
Net Position: Delta neutral (or close to it)
\`\`\`

### Why This Creates Stock Price Impact

Large options order flow forces market makers to:
- **Call buying** → MM sells calls → MM buys stock to hedge → Stock price rises
- **Put buying** → MM sells puts → MM sells stock to hedge → Stock price falls

This is why unusual options activity often predicts stock moves!

## Liquidity Hierarchy

Not all options are equally liquid:

| Liquidity Level | Characteristics | Typical Spread |
|----------------|-----------------|----------------|
| **Highly Liquid** | SPY, QQQ, AAPL | $0.01-0.05 |
| **Liquid** | Large caps, popular names | $0.05-0.20 |
| **Moderate** | Mid-caps, farther strikes | $0.20-0.50 |
| **Illiquid** | Small caps, deep OTM/ITM | $0.50+ |

### Factors Affecting Liquidity
1. **Underlying volume** - More stock trading = more options liquidity
2. **Strike proximity** - ATM options most liquid
3. **Time to expiration** - Near-term more liquid
4. **Market conditions** - Volatility can reduce liquidity
5. **Time of day** - Open and close most liquid

## Practical Trading Implications

### When to Trade
- **Best:** 9:45 AM - 11:30 AM ET (spreads tightest)
- **Good:** 1:00 PM - 3:30 PM ET (afternoon session)
- **Avoid:** First 15 minutes, last 30 minutes (wide spreads)

### Order Strategies
1. **Always use limit orders** - Never market orders in options
2. **Start at mid-price** - (Bid + Ask) / 2
3. **Be patient** - Give orders time to fill
4. **Check open interest** - Higher OI = better liquidity

## Key Takeaways
1. Market makers profit from spreads, rebates, and volatility edge
2. Delta hedging creates feedback loops between options and stock prices
3. Liquidity varies dramatically across strikes and expirations
4. Trading during high-liquidity periods improves execution
5. Always use limit orders and target the mid-price

## Quick Reference
| Term | Definition |
|------|------------|
| **Delta Hedging** | Buying/selling stock to offset options delta |
| **Spread Capture** | Profit from bid-ask difference |
| **PFOF** | Payment for Order Flow |
| **Open Interest** | Total outstanding contracts |
| **Mid-Price** | (Bid + Ask) / 2 |`,
        quiz_questions: [
          {
            question: "When you buy call options, how does the market maker typically hedge?",
            options: ["They sell the underlying stock", "They buy the underlying stock", "They buy more calls", "They don't hedge"],
            correct_answer: 1,
            explanation: "When selling calls to you, the market maker becomes short delta. They hedge by buying the underlying stock to become delta neutral."
          },
          {
            question: "Which time of day typically offers the tightest bid-ask spreads?",
            options: ["Market open (9:30 AM)", "Mid-morning (10:00-11:30 AM)", "Last 30 minutes before close", "Overnight trading"],
            correct_answer: 1,
            explanation: "Mid-morning (roughly 9:45-11:30 AM ET) typically offers the best liquidity and tightest spreads after the opening volatility settles."
          },
          {
            question: "What is the recommended order type for options trading?",
            options: ["Market orders for speed", "Limit orders at bid price", "Limit orders at mid-price", "Stop orders"],
            correct_answer: 2,
            explanation: "Limit orders at the mid-price (halfway between bid and ask) are recommended to get fair execution without overpaying."
          }
        ]
      },
      {
        title: "Bid/Ask Dynamics & Spread Behavior",
        description: "Master the mechanics of bid-ask spreads and learn optimal entry and exit timing strategies.",
        duration: "25 min",
        order_index: 2,
        content_markdown: `# Bid/Ask Dynamics & Spread Behavior

## Learning Objectives
By the end of this lesson, you will:
- Understand why spreads widen and narrow
- Calculate true spread costs on trades
- Optimize entry and exit timing
- Recognize spread-related opportunities and dangers

## Understanding the Bid-Ask Spread

### Components of the Spread
The bid-ask spread exists for several reasons:

1. **Market Maker Compensation** - Their payment for providing liquidity
2. **Inventory Risk** - Wider spreads for harder-to-hedge positions
3. **Information Asymmetry** - Protection against informed traders
4. **Volatility Uncertainty** - Wider during high-vol periods

### Spread Cost Calculation

**True Cost of Trading:**
\`\`\`
Entry: Buy at $2.50 (ask)
Exit: Sell at $2.45 (bid)
Spread Cost: $0.05 per share = $5 per contract

For 10 contracts: $50 round-trip spread cost
This is BEFORE the option moves in your favor!
\`\`\`

### Spread as Percentage
More meaningful than absolute spread:

| Option Price | Spread | Spread % |
|-------------|--------|----------|
| $0.50 | $0.05 | 10.0% |
| $2.00 | $0.10 | 5.0% |
| $5.00 | $0.10 | 2.0% |
| $10.00 | $0.15 | 1.5% |

**Rule of Thumb:** Avoid options where spread > 5% of price

## When Spreads Widen

### Market Events
- Earnings announcements (days before)
- FOMC meetings
- Major economic data releases
- Geopolitical events

### Technical Factors
- Low volume periods
- Far out-of-the-money strikes
- Long-dated expirations
- Small underlying stocks

### Warning Signs
- Spread suddenly doubles or triples
- No bids showing (just ask)
- Size disappears from quotes
- Quotes become stale

## Spread Optimization Strategies

### Entry Tactics
1. **Wait for optimal timing** - Trade mid-morning
2. **Start at mid-price** - Never lift the offer immediately
3. **Penny up slowly** - Move $0.01-0.02 at a time
4. **Use price alerts** - Wait for market to come to you

### Exit Tactics
1. **Don't panic sell** - Wide spreads punish urgent exits
2. **Scale out** - Sell in pieces if spread is wide
3. **Consider rolling** - Sometimes better than closing
4. **Time your exit** - Avoid volatile periods

## Practical Example: Spread Analysis

**AAPL $150 Call - 30 DTE**
- Bid: $4.85
- Ask: $4.95
- Mid: $4.90
- Spread: $0.10 (2.0% of price) ✓ Acceptable

**XYZ $25 Call - 30 DTE (Small Cap)**
- Bid: $0.80
- Ask: $1.10
- Mid: $0.95
- Spread: $0.30 (31.6% of price) ✗ Too wide!

## Key Takeaways
1. Spread cost is a hidden tax on every trade
2. Calculate spread as percentage, not absolute value
3. Wide spreads indicate risk or illiquidity
4. Time entries for best execution
5. Avoid options with spreads > 5% of price

## Quick Reference
| Rule | Guideline |
|------|-----------|
| **Max Spread %** | < 5% of option price |
| **Best Time** | 9:45 AM - 11:30 AM ET |
| **Order Type** | Limit at mid-price |
| **Patience** | Give orders 1-5 minutes |`,
        quiz_questions: [
          {
            question: "If an option has a bid of $1.20 and ask of $1.40, what is the spread as a percentage of the mid-price?",
            options: ["10%", "15.4%", "20%", "14.3%"],
            correct_answer: 1,
            explanation: "Mid-price = ($1.20 + $1.40) / 2 = $1.30. Spread = $0.20. Spread % = $0.20 / $1.30 = 15.4%."
          },
          {
            question: "What typically happens to bid-ask spreads during earnings announcements?",
            options: ["They narrow significantly", "They remain the same", "They widen", "They disappear entirely"],
            correct_answer: 2,
            explanation: "Spreads typically widen before and during earnings due to increased uncertainty and market makers requiring more compensation for inventory risk."
          },
          {
            question: "What is the recommended maximum spread as a percentage of option price?",
            options: ["1%", "5%", "10%", "15%"],
            correct_answer: 1,
            explanation: "As a rule of thumb, avoid options where the spread exceeds 5% of the option price, as spread costs can significantly impact profitability."
          }
        ]
      },
      {
        title: "Open Interest vs Volume Analysis",
        description: "Learn to read and interpret open interest and volume to spot institutional positioning and accumulation.",
        duration: "30 min",
        order_index: 3,
        content_markdown: `# Open Interest vs Volume Analysis

## Learning Objectives
By the end of this lesson, you will:
- Distinguish between volume and open interest
- Interpret changes in OI to gauge market sentiment
- Spot accumulation and distribution patterns
- Use OI/Volume ratios in trading decisions

## Volume vs Open Interest: Core Differences

### Volume
- **Definition:** Total contracts traded in a session
- **Resets:** Daily (starts at zero each day)
- **Indicates:** Activity level and liquidity
- **Time frame:** Single day metric

### Open Interest
- **Definition:** Total outstanding (open) contracts
- **Updates:** End of day (T+1)
- **Indicates:** Money committed to positions
- **Time frame:** Cumulative metric

## How Open Interest Changes

| Scenario | Buyer | Seller | OI Change |
|----------|-------|--------|-----------|
| New Position | New buyer | New seller | +1 |
| Close Position | Existing seller closes | Existing buyer closes | -1 |
| Transfer | New buyer | Existing holder sells | No change |

### Example:
\`\`\`
Day 1: Trader A buys 10 calls, Trader B sells 10 calls
       OI = 10 (new positions created)

Day 2: Trader C buys 5 calls, Trader A sells 5 calls
       OI = 10 (transfer - no change)

Day 3: Trader A sells remaining 5, Trader B buys back 5
       OI = 5 (positions closed)
\`\`\`

## Interpreting OI Changes with Price

| Price | OI | Interpretation |
|-------|-----|----------------|
| ↑ Rising | ↑ Rising | Bullish: New longs entering |
| ↑ Rising | ↓ Falling | Neutral: Short covering rally |
| ↓ Falling | ↑ Rising | Bearish: New shorts entering |
| ↓ Falling | ↓ Falling | Neutral: Long liquidation |

## Practical Applications

### Finding Unusual Activity
Look for:
- OI increase > 50% of existing OI
- Volume > 2x average daily volume
- Concentration at specific strikes

### Put/Call Open Interest Ratio
\`\`\`
PCOI = Put OI / Call OI

PCOI > 1.0 = More put exposure (potentially bearish sentiment)
PCOI < 1.0 = More call exposure (potentially bullish sentiment)
\`\`\`

### Max Pain Theory
The strike with highest total open interest (calls + puts) is "max pain" - the price where most options expire worthless.

**Why it matters:** Some believe stocks gravitate toward max pain at expiration.

## Volume/OI Ratio

**Formula:** Volume / Open Interest

| Ratio | Interpretation |
|-------|----------------|
| < 0.5 | Normal activity, positions held |
| 0.5 - 1.0 | Active trading day |
| > 1.0 | Very active, potential new positions |
| > 2.0 | Unusual activity, investigate further |

## Real-World Example

**AAPL $155 Calls - Before Earnings:**
- Previous OI: 15,000
- Today's Volume: 45,000
- New OI (next day): 52,000

**Analysis:**
- OI increased by 37,000 (from 15K to 52K)
- Volume was 45,000, so most were NEW positions
- Large institutions likely positioning for earnings

## Key Takeaways
1. Volume shows activity; OI shows commitment
2. Rising OI with rising price = bullish (new longs)
3. Rising OI with falling price = bearish (new shorts)
4. Unusual Volume/OI ratios warrant investigation
5. Track OI changes at key strikes for insights

## Quick Reference
| Metric | Calculation | Usage |
|--------|-------------|-------|
| **OI Change** | Today OI - Yesterday OI | Position creation/closure |
| **Volume/OI Ratio** | Volume ÷ OI | Activity intensity |
| **Put/Call OI** | Put OI ÷ Call OI | Sentiment gauge |
| **Max Pain** | Strike with highest combined OI | Expiration magnet theory |`,
        quiz_questions: [
          {
            question: "If both price and open interest are rising, what does this typically indicate?",
            options: ["Short covering", "Long liquidation", "New buyers entering (bullish)", "Bearish sentiment"],
            correct_answer: 2,
            explanation: "Rising price with rising OI indicates new long positions are being established, which is a bullish signal."
          },
          {
            question: "What happens to open interest when an existing call buyer sells to an existing call seller who is closing their position?",
            options: ["OI increases by 1", "OI decreases by 1", "OI remains unchanged", "OI increases by 2"],
            correct_answer: 1,
            explanation: "When both parties are closing existing positions, the open interest decreases because outstanding contracts are being eliminated."
          },
          {
            question: "What does a Volume/OI ratio greater than 2.0 suggest?",
            options: ["Normal trading activity", "Low liquidity", "Unusual activity worth investigating", "The option is about to expire"],
            correct_answer: 2,
            explanation: "A Volume/OI ratio above 2.0 indicates unusually high activity relative to existing positions, which often signals significant new positioning or unusual options activity."
          }
        ]
      },
      {
        title: "Dealer Positioning & Gamma Exposure (GEX)",
        description: "Understand how dealer hedging flows impact stock prices through gamma exposure analysis.",
        duration: "35 min",
        order_index: 4,
        content_markdown: `# Dealer Positioning & Gamma Exposure (GEX)

## Learning Objectives
By the end of this lesson, you will:
- Understand the concept of Gamma Exposure (GEX)
- Know how dealer hedging affects stock price movement
- Identify high-gamma strike zones
- Use GEX levels in trading decisions

## What is Gamma Exposure (GEX)?

### Gamma Refresher
**Gamma** = Rate of change of delta per $1 move in underlying

When market makers are short options (the normal case), they have **negative gamma exposure**, meaning:
- Stock rises → Their delta becomes more negative → They must BUY more stock
- Stock falls → Their delta becomes less negative → They must SELL stock

### The Gamma Squeeze Mechanism

\`\`\`
Stock at $100, MMs short calls at $105 strike

Price rises to $102:
→ Delta of $105 calls increases (more ITM probability)
→ MMs who sold calls become more short delta
→ MMs buy stock to hedge
→ Buying pushes price higher
→ Cycle repeats... GAMMA SQUEEZE!
\`\`\`

## GEX Calculation (Simplified)

**Per Strike:**
\`\`\`
GEX = Gamma × Open Interest × 100 × Stock Price × (-1 for puts, +1 for calls)
\`\`\`

**Total GEX:** Sum across all strikes

### Interpreting GEX Levels

| GEX Sign | MM Position | Price Behavior |
|----------|-------------|----------------|
| **Positive (+)** | MMs long gamma | Suppressed volatility, mean reversion |
| **Negative (-)** | MMs short gamma | Amplified moves, trending behavior |

## Gamma Flip Zone

The price level where total GEX transitions from positive to negative (or vice versa).

**Above Gamma Flip:** 
- Positive GEX environment
- MMs sell rallies, buy dips
- Volatility suppressed, range-bound

**Below Gamma Flip:**
- Negative GEX environment
- MMs sell dips, buy rallies (chase price)
- Volatility amplified, trending

## Practical GEX Trading

### Identifying Key Levels
1. **Max Gamma Strike** - Highest concentration of gamma
2. **Gamma Flip Level** - Where behavior regime changes
3. **Zero GEX Zones** - Neutral areas, no MM interference

### Trading Strategies

**In Positive GEX:**
- Sell premium (volatility likely to compress)
- Trade ranges and mean reversion
- Expect choppy, non-trending moves

**In Negative GEX:**
- Buy breakouts (momentum continues)
- Use directional strategies
- Expect extended moves and trends

## Real-World Example: SPY GEX Analysis

**Setup:**
- SPY trading at $440
- Max Call OI at $450 strike
- Gamma Flip at $435

**Scenario 1: SPY above $440 (Positive GEX)**
- MMs are net long gamma
- Rallies fade, dips get bought
- Tight range expected

**Scenario 2: SPY breaks below $435 (Negative GEX)**
- MMs become short gamma
- Each down move triggers more selling
- Extended downtrend likely

## GEX Around Expiration

### OPEX (Options Expiration) Effects
- Gamma concentrates as expiration approaches
- High gamma at ATM strikes near expiry
- "Gamma pin" - Price attracted to max pain/gamma

### The 0DTE Phenomenon
- Zero-day options have MAXIMUM gamma
- Creates extreme intraday volatility
- MMs must hedge aggressively

## Key Takeaways
1. GEX measures the market makers' hedging flow impact
2. Positive GEX = volatility suppression
3. Negative GEX = volatility amplification
4. The gamma flip level marks regime change
5. Understanding GEX helps predict price behavior patterns

## Quick Reference
| Term | Definition |
|------|------------|
| **GEX** | Gamma Exposure - measures MM hedging flow |
| **Gamma Flip** | Price level where GEX changes sign |
| **Positive GEX** | MMs sell rallies, buy dips |
| **Negative GEX** | MMs chase price, amplify moves |
| **Gamma Pin** | Price attracted to high-gamma strikes |
| **0DTE** | Zero-days-to-expiration options |`,
        quiz_questions: [
          {
            question: "When GEX (Gamma Exposure) is positive, how do market makers typically hedge?",
            options: ["Buy rallies and sell dips", "Sell rallies and buy dips", "Always buy stock", "They don't hedge"],
            correct_answer: 1,
            explanation: "In positive GEX environments, market makers sell into rallies and buy dips, which suppresses volatility and creates mean-reverting price action."
          },
          {
            question: "What typically happens when the stock price moves below the 'gamma flip' level?",
            options: ["Volatility decreases", "Price becomes range-bound", "Momentum and volatility increase", "Options expire worthless"],
            correct_answer: 2,
            explanation: "Below the gamma flip, dealers become net short gamma and must chase price moves (selling into drops, buying into rallies), which amplifies volatility and momentum."
          },
          {
            question: "Why do zero-day (0DTE) options create extreme intraday volatility?",
            options: ["They have no time value", "They have maximum gamma", "They are illiquid", "They cannot be hedged"],
            correct_answer: 1,
            explanation: "0DTE options have extremely high gamma (especially near the money), meaning small price moves cause large delta changes, forcing aggressive hedging by market makers."
          }
        ]
      },
      {
        title: "Module 1 Assessment",
        description: "Comprehensive quiz covering professional options market mechanics concepts.",
        duration: "15 min",
        order_index: 5,
        content_markdown: `# Module 1 Assessment: Professional Options Market Mechanics

## Assessment Overview

This assessment covers all topics from Module 1:
- Market microstructure and order flow
- Market makers and liquidity provision
- Bid-ask dynamics and spread behavior
- Open interest vs volume analysis
- Gamma exposure (GEX) and dealer positioning

**Passing Score:** 70% (at least 7 out of 10 correct)

## Instructions

1. Read each question carefully
2. Select the best answer from the options provided
3. Take your time - there's no time limit
4. Review the explanations after completing the quiz

## Key Concepts Review

Before taking the assessment, ensure you understand:

### Market Structure
- The role of the OCC as central counterparty
- How orders flow from broker to exchange to execution
- Different types of market participants

### Market Makers
- How they profit from bid-ask spreads
- Delta hedging mechanics
- Impact on stock prices

### Bid-Ask Spreads
- Calculating spread as percentage
- Optimal trading times
- Why spreads widen

### Open Interest & Volume
- Difference between OI and volume
- Interpreting OI changes with price
- Put/Call OI ratios

### Gamma Exposure
- Positive vs negative GEX environments
- The gamma flip concept
- How dealer hedging affects volatility

## Ready to Begin

When you're ready, start the quiz. Good luck!

---

*This assessment is designed to ensure mastery of fundamental market mechanics before advancing to volatility concepts in Module 2.*`,
        quiz_questions: [
          {
            question: "What is the primary role of the Options Clearing Corporation (OCC)?",
            options: ["To set options prices across all exchanges", "To act as the central counterparty guaranteeing all options trades", "To regulate broker-dealers", "To provide research on options strategies"],
            correct_answer: 1,
            explanation: "The OCC guarantees performance on all options contracts by becoming the counterparty to both buyer and seller."
          },
          {
            question: "When a retail trader buys calls, how do market makers typically hedge their short call position?",
            options: ["By selling the underlying stock", "By buying the underlying stock", "By buying put options", "By doing nothing"],
            correct_answer: 1,
            explanation: "Selling calls creates short delta exposure. Market makers buy stock to offset this delta and remain neutral."
          },
          {
            question: "What does it typically indicate when both price AND open interest are rising?",
            options: ["Bearish - new shorts entering", "Neutral - positions being transferred", "Bullish - new longs entering", "Panic selling occurring"],
            correct_answer: 2,
            explanation: "Rising price with rising OI indicates new buying pressure as new long positions are being established."
          },
          {
            question: "If an option has a bid of $2.40 and ask of $2.60, what is the spread as a percentage of the mid-price?",
            options: ["7.5%", "8.0%", "10%", "4%"],
            correct_answer: 1,
            explanation: "Mid-price = $2.50. Spread = $0.20. Spread % = 0.20/2.50 = 8.0%"
          },
          {
            question: "In a positive GEX environment, what behavior should you expect?",
            options: ["Extended trends and momentum", "Suppressed volatility and mean reversion", "Panic selling", "Wide bid-ask spreads"],
            correct_answer: 1,
            explanation: "Positive GEX means dealers sell rallies and buy dips, suppressing volatility and creating range-bound conditions."
          },
          {
            question: "What is the 'gamma flip' level?",
            options: ["The strike with highest open interest", "The price where total GEX changes from positive to negative", "The maximum pain level", "The point where options expire worthless"],
            correct_answer: 1,
            explanation: "The gamma flip is the price level where aggregate dealer gamma exposure transitions between positive and negative."
          },
          {
            question: "Which time of day typically offers the best options execution (tightest spreads)?",
            options: ["The first 15 minutes of trading", "Mid-morning (9:45 AM - 11:30 AM ET)", "The last 30 minutes before close", "Pre-market hours"],
            correct_answer: 1,
            explanation: "Mid-morning typically offers optimal liquidity after opening volatility settles and before lunch hour lull."
          },
          {
            question: "What does a Volume/OI ratio greater than 2.0 typically indicate?",
            options: ["Low market interest", "Normal trading activity", "Unusual activity worth investigating", "The option is about to be delisted"],
            correct_answer: 2,
            explanation: "Volume significantly exceeding OI suggests unusual new positioning, often indicating institutional activity."
          },
          {
            question: "Why are 0DTE (zero-day-to-expiration) options particularly volatile?",
            options: ["They have no time value left", "They have extremely high gamma", "They cannot be hedged", "They have the widest spreads"],
            correct_answer: 1,
            explanation: "0DTE options have maximum gamma, especially at-the-money, causing aggressive hedging flows with small price moves."
          },
          {
            question: "What is the recommended maximum bid-ask spread as a percentage of option price?",
            options: ["1%", "5%", "10%", "15%"],
            correct_answer: 1,
            explanation: "Keeping spread costs below 5% helps ensure they don't eat too much into potential profits."
          }
        ]
      }
    ]
  },
  {
    title: "Module 2: Volatility Mastery",
    description: "Trade volatility as a core variable, not a byproduct. Master IV, HV, skew analysis, and volatility regimes.",
    order_index: 1,
    lessons: [
      {
        title: "Implied vs Historical Volatility Deep Dive",
        description: "Understand the calculation methods and interpretation differences between IV and HV.",
        duration: "30 min",
        order_index: 0,
        content_markdown: `# Implied vs Historical Volatility Deep Dive

## Learning Objectives
By the end of this lesson, you will:
- Understand how historical volatility is calculated
- Know how implied volatility is derived from option prices
- Recognize the difference between IV and HV and what each tells us
- Use the IV/HV relationship in trading decisions

## Historical Volatility (HV)

### Definition
Historical volatility measures how much the underlying asset's price has moved in the past. It's backward-looking and based on actual price data.

### Calculation Method (Standard Deviation Approach)

1. **Collect daily returns:** (Today's Close - Yesterday's Close) / Yesterday's Close
2. **Calculate standard deviation** of those returns
3. **Annualize:** Multiply by √252 (trading days per year)

**Example:**
\`\`\`
If daily standard deviation = 1.5%
HV = 1.5% × √252 = 1.5% × 15.87 = 23.8% annualized
\`\`\`

### Common HV Periods
| Period | Use Case |
|--------|----------|
| HV10 (10-day) | Short-term/recent volatility |
| HV20 (20-day) | Approximately one month |
| HV30 (30-day) | Standard monthly measure |
| HV60 (60-day) | Intermediate-term trend |
| HV252 (1-year) | Long-term baseline |

## Implied Volatility (IV)

### Definition
Implied volatility is the market's forecast of future volatility, derived from current option prices. It's forward-looking.

### How IV is Calculated
IV is "backed out" from option prices using models like Black-Scholes:

\`\`\`
Given:
- Option price = $3.50
- Stock price = $100
- Strike = $100
- Time to expiration = 30 days
- Interest rate = 5%

Solve for σ (IV) that makes theoretical price = $3.50
Result: IV = 32%
\`\`\`

### What IV Represents
- **Market's expectation** of future volatility
- **Supply and demand** for options
- **Fear and uncertainty** priced into options
- **Premium buyers willing to pay**

## IV vs HV: Key Differences

| Aspect | Historical Volatility | Implied Volatility |
|--------|----------------------|-------------------|
| **Direction** | Backward-looking | Forward-looking |
| **Source** | Actual price data | Option prices |
| **Changes** | Daily (as prices update) | Continuously (as options trade) |
| **Measures** | What happened | What's expected |

## The IV/HV Relationship

### Volatility Risk Premium
On average, IV > HV because:
- Options buyers pay extra for protection
- Sellers demand compensation for risk
- Uncertainty tends to be overpriced

**Typical relationship:** IV averages 10-15% higher than realized HV

### Trading Implications

| IV vs HV | Interpretation | Strategy Bias |
|----------|----------------|---------------|
| IV >> HV | Options expensive | Sell premium |
| IV ≈ HV | Fair value | Neutral |
| IV << HV | Options cheap | Buy premium |

## Practical Example

**AAPL Analysis:**
- Current IV (30-day): 28%
- HV20: 22%
- HV30: 24%

**Interpretation:**
- IV is 4-6 points above HV
- Options priced for more volatility than recently realized
- Slight premium selling opportunity if you expect volatility to calm

## Key Takeaways
1. HV measures past volatility; IV measures expected future volatility
2. IV is derived from option prices and reflects market sentiment
3. IV typically exceeds HV (volatility risk premium)
4. Compare IV to HV to assess if options are cheap or expensive
5. Both metrics are essential for informed options trading

## Quick Reference
| Term | Definition |
|------|------------|
| **HV** | Historical Volatility - past price movement |
| **IV** | Implied Volatility - expected future movement |
| **Volatility Risk Premium** | IV - Realized Vol |
| **√252** | Annualization factor (trading days) |`,
        quiz_questions: [
          {
            question: "What is the key difference between implied volatility and historical volatility?",
            options: ["IV is always higher than HV", "HV is forward-looking while IV is backward-looking", "IV is forward-looking (expected) while HV is backward-looking (realized)", "They measure the same thing using different methods"],
            correct_answer: 2,
            explanation: "Historical volatility looks at past price movements, while implied volatility represents the market's expectation of future volatility derived from option prices."
          },
          {
            question: "If IV is significantly higher than HV, what might this suggest for options traders?",
            options: ["Buy premium - options are cheap", "Sell premium - options are expensive", "Avoid trading entirely", "Only buy calls"],
            correct_answer: 1,
            explanation: "When IV exceeds HV significantly, options may be overpriced, making premium selling strategies more attractive."
          },
          {
            question: "What creates the 'volatility risk premium' in options markets?",
            options: ["Market manipulation", "Option buyers paying extra for protection/insurance", "Broker commissions", "Exchange fees"],
            correct_answer: 1,
            explanation: "The volatility risk premium exists because option buyers are willing to pay extra for protection against adverse moves, and sellers demand compensation for taking on that risk."
          }
        ]
      },
      {
        title: "IV Rank vs IV Percentile",
        description: "Learn which volatility metric to use and when, with practical examples.",
        duration: "25 min",
        order_index: 1,
        content_markdown: `# IV Rank vs IV Percentile

## Learning Objectives
By the end of this lesson, you will:
- Calculate and interpret IV Rank
- Calculate and interpret IV Percentile
- Know when to use each metric
- Apply these metrics to trading decisions

## IV Rank

### Definition
IV Rank tells you where current IV sits within its 52-week range.

### Formula
\`\`\`
IV Rank = (Current IV - 52-Week Low IV) / (52-Week High IV - 52-Week Low IV) × 100
\`\`\`

### Example Calculation
\`\`\`
AAPL Current IV: 28%
52-Week IV High: 45%
52-Week IV Low: 18%

IV Rank = (28 - 18) / (45 - 18) × 100
IV Rank = 10 / 27 × 100 = 37%
\`\`\`

**Interpretation:** Current IV is 37% of the way from the yearly low to the yearly high.

## IV Percentile

### Definition
IV Percentile tells you the percentage of days over the past year when IV was lower than today.

### Formula
\`\`\`
IV Percentile = (Days IV was lower / Total trading days) × 100
\`\`\`

### Example Calculation
\`\`\`
Current IV: 28%
In the past 252 trading days:
- 180 days had IV below 28%
- 72 days had IV at or above 28%

IV Percentile = 180 / 252 × 100 = 71.4%
\`\`\`

**Interpretation:** IV was lower than today's level 71.4% of the time over the past year.

## Key Differences

| Aspect | IV Rank | IV Percentile |
|--------|---------|---------------|
| **Measures** | Position in range | Frequency distribution |
| **Sensitive to** | Extreme highs/lows | Overall distribution |
| **Outlier impact** | High (one spike affects range) | Low (one day = 0.4%) |

### The Outlier Problem

**Scenario:** Stock had one volatility spike to 80% IV, otherwise trades 20-30%.

\`\`\`
Current IV: 25%
IV Range: 18% - 80%

IV Rank = (25 - 18) / (80 - 18) × 100 = 11.3%
But IV is actually near its typical level!

IV Percentile = ~50% (more accurate representation)
\`\`\`

## Which to Use When?

### Use IV Rank When:
- The underlying has stable volatility patterns
- No major outlier events in the past year
- You want a quick high/low context

### Use IV Percentile When:
- The underlying has had volatility spikes
- You want to know how often IV is this high/low
- Making premium selling decisions

## Trading Application

### High IV Rank/Percentile (>50%)
- Options are relatively expensive
- Consider selling premium (credit spreads, iron condors)
- Expect volatility contraction

### Low IV Rank/Percentile (<30%)
- Options are relatively cheap
- Consider buying premium (long calls/puts, straddles)
- Expect volatility expansion

### The Sweet Spot for Selling Premium

| Metric Level | Recommendation |
|--------------|----------------|
| > 70% | Strong sell premium |
| 50-70% | Moderate sell bias |
| 30-50% | Neutral |
| < 30% | Avoid selling, consider buying |

## Practical Example

**Two Stocks, Same IV:**

**Stock A:**
- Current IV: 35%
- IV Rank: 80%
- IV Percentile: 85%
→ Premium selling opportunity

**Stock B:**
- Current IV: 35%
- IV Rank: 25%
- IV Percentile: 30%
→ Premium relatively cheap, not ideal for selling

## Key Takeaways
1. IV Rank shows position within the yearly high-low range
2. IV Percentile shows how often IV was lower historically
3. IV Percentile is more robust to outliers
4. Both above 50% suggests premium selling
5. Both below 30% suggests premium buying

## Quick Reference
| Metric | Best Use Case |
|--------|---------------|
| **IV Rank** | Quick context, stable stocks |
| **IV Percentile** | Volatile stocks, robust analysis |
| **> 50%** | Selling premium favored |
| **< 30%** | Buying premium favored |`,
        quiz_questions: [
          {
            question: "If a stock's current IV is 30%, 52-week high is 60%, and 52-week low is 20%, what is the IV Rank?",
            options: ["25%", "50%", "75%", "30%"],
            correct_answer: 0,
            explanation: "IV Rank = (30 - 20) / (60 - 20) × 100 = 10/40 × 100 = 25%"
          },
          {
            question: "Why might IV Percentile be more useful than IV Rank for a stock that had a single volatility spike?",
            options: ["IV Percentile is always higher", "IV Percentile is less affected by outliers", "IV Percentile is easier to calculate", "There is no difference"],
            correct_answer: 1,
            explanation: "IV Percentile measures frequency (what % of days had lower IV), so one extreme day has minimal impact, unlike IV Rank which is heavily influenced by the range extremes."
          },
          {
            question: "When both IV Rank and IV Percentile are above 70%, what trading strategy is typically favored?",
            options: ["Buy calls", "Buy straddles", "Sell premium (credit strategies)", "Stay in cash"],
            correct_answer: 2,
            explanation: "High IV Rank and Percentile indicate options are relatively expensive, making premium selling strategies like credit spreads more attractive."
          }
        ]
      },
      {
        title: "Volatility Cones & Forecasting",
        description: "Build and read volatility cones to identify trading opportunities across timeframes.",
        duration: "30 min",
        order_index: 2,
        content_markdown: `# Volatility Cones & Forecasting

## Learning Objectives
By the end of this lesson, you will:
- Understand what volatility cones represent
- Know how to build and read a volatility cone
- Use cones to identify rich and cheap options by expiration
- Apply volatility cone analysis to strategy selection

## What is a Volatility Cone?

A volatility cone shows the historical range of realized volatility across different time periods (lookback windows). It creates a visual "cone" shape that helps compare current IV to historical norms.

### Cone Components
- **X-axis:** Time period (10-day, 30-day, 60-day, etc.)
- **Y-axis:** Volatility level
- **Lines/Bands:** Percentile ranges (Max, 75th, Median, 25th, Min)
- **Current Point:** Today's IV plotted against the cone

## Building a Volatility Cone

### Step 1: Calculate HV for Various Periods
For each lookback window (10, 20, 30, 60, 90, 120, 180, 252 days):
- Calculate HV for each day in your history (e.g., last 2 years)
- Record all the HV values

### Step 2: Calculate Percentiles
For each period:
\`\`\`
Maximum HV (100th percentile)
75th percentile HV
50th percentile (Median)
25th percentile HV
Minimum HV (0th percentile)
\`\`\`

### Step 3: Plot the Cone
Connect the percentile points across periods to form the cone shape.

## Reading the Volatility Cone

### IV Above the Cone (Above 75th Percentile)
- Current IV is historically HIGH for this timeframe
- Options may be OVERPRICED
- Consider SELLING premium at this expiration

### IV Within the Cone (25th-75th Percentile)
- IV is within normal historical range
- Options fairly priced
- No strong volatility edge

### IV Below the Cone (Below 25th Percentile)
- Current IV is historically LOW for this timeframe
- Options may be UNDERPRICED
- Consider BUYING premium at this expiration

## Term Structure Analysis

The volatility cone also reveals **term structure** patterns:

### Contango (Normal)
- Short-term IV < Long-term IV
- Market expects volatility to increase
- Common in calm markets

### Backwardation (Inverted)
- Short-term IV > Long-term IV
- Fear/event premium in near-term
- Common during market stress, pre-earnings

## Practical Application

### Example: AAPL Volatility Cone Analysis

| Period | 25th % | Median | 75th % | Current IV |
|--------|--------|--------|--------|------------|
| 30-day | 22% | 26% | 32% | 35% |
| 60-day | 24% | 28% | 33% | 30% |
| 90-day | 25% | 29% | 34% | 28% |

**Analysis:**
- 30-day IV (35%) is ABOVE 75th percentile → Sell premium in near-term
- 60-day IV (30%) is between 50th-75th → Fairly priced
- 90-day IV (28%) is at median → Neutral

**Trade Idea:** Sell 30-day credit spreads where IV is richest

## Strategy Selection by Cone Position

| IV Position in Cone | Strategy Bias |
|--------------------|---------------|
| Above 75th % (all periods) | Aggressive premium selling |
| Above cone (short-term only) | Calendar spreads (sell short, buy long) |
| Within cone | Directional or neutral |
| Below 25th % | Long premium strategies |
| Below cone (long-term only) | Diagonal spreads (buy long-dated) |

## Key Takeaways
1. Volatility cones show historical HV distribution by timeframe
2. IV above the cone = expensive options, selling opportunity
3. IV below the cone = cheap options, buying opportunity
4. Compare across expirations to find the best value
5. Use cones to identify calendar and diagonal opportunities

## Quick Reference
| Term | Definition |
|------|------------|
| **Volatility Cone** | Historical HV range by lookback period |
| **Contango** | Short IV < Long IV (normal) |
| **Backwardation** | Short IV > Long IV (inverted) |
| **Rich** | IV above 75th percentile |
| **Cheap** | IV below 25th percentile |`,
        quiz_questions: [
          {
            question: "If current 30-day IV is plotting above the 75th percentile on the volatility cone, what does this suggest?",
            options: ["Options are cheap - buy premium", "Options are expensive - sell premium", "Options are fairly priced", "The stock will go up"],
            correct_answer: 1,
            explanation: "IV above the 75th percentile indicates options are historically expensive for that timeframe, making premium selling strategies more attractive."
          },
          {
            question: "What does a 'backwardation' term structure indicate?",
            options: ["Markets are calm and normal", "Short-term IV is higher than long-term IV (inverted)", "Long-term IV is higher than short-term IV", "Volatility is decreasing"],
            correct_answer: 1,
            explanation: "Backwardation (inverted term structure) occurs when short-term IV exceeds long-term IV, typically during market stress or ahead of events."
          },
          {
            question: "If 30-day IV is above the cone but 90-day IV is within normal range, what strategy might be appropriate?",
            options: ["Buy 30-day straddles", "Sell calendar spreads (sell far, buy near)", "Buy calendar spreads (sell near, buy far)", "Buy both expirations"],
            correct_answer: 2,
            explanation: "When near-term IV is rich relative to longer-term IV, selling the expensive near-term and buying the fairly-priced long-term creates a calendar spread that profits from the IV differential."
          }
        ]
      },
      {
        title: "Vertical Skew Analysis",
        description: "Analyze strike-by-strike IV differences to find trading opportunities.",
        duration: "30 min",
        order_index: 3,
        content_markdown: `# Vertical Skew Analysis

## Learning Objectives
By the end of this lesson, you will:
- Understand the volatility smile and skew
- Know why OTM puts typically have higher IV than OTM calls
- Analyze skew to identify trading opportunities
- Use skew in strategy selection and risk management

## What is Vertical Skew?

Vertical skew (or volatility skew) describes how IV varies across different strike prices for the same expiration.

### The Volatility Smile & Skew

**Pre-1987:** Black-Scholes assumed constant volatility across strikes (flat line)

**Post-1987 Crash:** Market learned that tail risks are real, creating:

\`\`\`
            IV
            |
            |  *                          * (OTM Calls - sometimes elevated)
            |    *                      *
            |      *                  *
            |        *    *    *    *  <- ATM lowest IV
            |          *    *    *
            |    *                          
     OTM Puts -------- ATM -------- OTM Calls → Strike
\`\`\`

### Equity Skew (Most Common)
OTM Puts have HIGHER IV than OTM Calls because:
- Demand for downside protection (hedging)
- Fear of crashes exceeds hope for rallies
- Insurance premium for tail risk

## Measuring Skew

### Common Skew Metrics

**25-Delta Skew:**
\`\`\`
Skew = IV of 25-delta put - IV of 25-delta call
\`\`\`
Normal range: 5-10% for most equities

**Put-Call Skew at Same Distance:**
\`\`\`
Compare IV of $10 OTM put vs $10 OTM call
\`\`\`

### Example: AAPL 30-Day Options

| Strike | Delta | IV |
|--------|-------|-----|
| $140 Put | -25 | 32% |
| $150 Put | -40 | 28% |
| $155 (ATM) | 50 | 25% |
| $160 Call | 40 | 26% |
| $170 Call | 25 | 24% |

**25-Delta Skew:** 32% - 24% = 8% (OTM puts 8 points richer)

## Skew Trading Opportunities

### Rich Put Skew
When OTM puts are unusually expensive:
- Sell put spreads (credit)
- Ratio put spreads
- Risk reversals (sell puts, buy calls)

### Flat or Inverted Skew
When puts are cheap relative to history:
- Protective puts may be underpriced
- Consider long put hedges
- Avoid selling put spreads

### Call Skew (Less Common)
When OTM calls are elevated:
- Pre-squeeze anticipation
- Takeover speculation
- Consider selling call spreads

## Skew Across Market Conditions

| Market State | Typical Skew | Trading Implication |
|-------------|--------------|---------------------|
| Calm market | Moderate put skew | Normal premium selling |
| Correction | Steep put skew | Puts expensive - sell spreads |
| Strong rally | Flat/call skew | Puts cheap - consider protection |
| Pre-earnings | Elevated both sides | Straddles priced for event |

## Practical Example: Skew Trade

**Setup:**
- XYZ at $100
- 30-day 90 put IV: 35%
- 30-day 100 put IV: 28%
- 30-day 110 call IV: 25%
- Put skew seems steep (7% difference between strikes)

**Trade Idea:**
Sell the 95/90 put spread - capturing the rich put skew premium

**Why it works:**
- 90 put is expensive due to skew
- Selling it captures the fear premium
- 95 put hedge limits risk

## Key Takeaways
1. Skew shows IV variation across strikes
2. OTM equity puts typically trade at premium to calls
3. Steep skew = opportunity to sell puts
4. Flat skew = watch for hedging opportunities
5. Compare current skew to historical norms

## Quick Reference
| Term | Definition |
|------|------------|
| **Vertical Skew** | IV difference across strikes |
| **25-Delta Skew** | IV(25d put) - IV(25d call) |
| **Steep Skew** | Large IV premium in OTM puts |
| **Flat Skew** | Similar IV across strikes |
| **Risk Reversal** | Sell put, buy call (skew play) |`,
        quiz_questions: [
          {
            question: "Why do OTM puts typically have higher IV than OTM calls in equity markets?",
            options: ["Puts are more liquid", "Demand for downside protection and crash insurance", "Calls expire worthless more often", "Market makers prefer selling puts"],
            correct_answer: 1,
            explanation: "The demand for downside hedging and protection against crashes creates persistent demand for OTM puts, driving their IV higher than equivalent OTM calls."
          },
          {
            question: "If the 25-delta put IV is 35% and 25-delta call IV is 27%, what is the 25-delta skew?",
            options: ["62%", "8%", "-8%", "31%"],
            correct_answer: 1,
            explanation: "25-delta skew = Put IV - Call IV = 35% - 27% = 8%"
          },
          {
            question: "When put skew is unusually steep, what strategy might be attractive?",
            options: ["Buy protective puts", "Sell put credit spreads", "Buy call spreads", "Avoid options entirely"],
            correct_answer: 1,
            explanation: "When put skew is steep, OTM puts are expensive, making selling put spreads attractive as you capture the elevated premium."
          }
        ]
      },
      {
        title: "Horizontal/Term Structure Skew",
        description: "Understand expiration-based IV differences and their impact on calendar and diagonal trades.",
        duration: "25 min",
        order_index: 4,
        content_markdown: `# Horizontal/Term Structure Skew

## Learning Objectives
By the end of this lesson, you will:
- Understand term structure and its normal shape
- Identify contango and backwardation patterns
- Use term structure for calendar and diagonal trades
- Recognize event-driven term structure distortions

## What is Term Structure?

Term structure (horizontal skew) describes how IV varies across different expiration dates for the same strike (usually ATM).

### Normal Term Structure (Contango)
\`\`\`
IV
|                               * (180 day)
|                     * (90 day)
|           * (60 day)
|     * (30 day)
| * (7 day)
+------------------------→ Time to Expiration
\`\`\`

Short-term IV < Long-term IV because:
- More uncertainty over longer periods
- Time for more events to occur
- Mean reversion expectations

### Inverted Term Structure (Backwardation)
\`\`\`
IV
| * (7 day)
|     * (30 day)
|           * (60 day)
|                     * (90 day)
|                               * (180 day)
+------------------------→ Time to Expiration
\`\`\`

Short-term IV > Long-term IV when:
- Immediate fear/uncertainty
- Event premium (earnings, FOMC)
- Market stress/crash fears

## Reading Term Structure

### Compare Front-Month to Back-Month

| Front IV | Back IV | Structure | Interpretation |
|----------|---------|-----------|----------------|
| 25% | 30% | Contango | Normal, calm market |
| 35% | 30% | Backwardation | Near-term fear/event |
| 30% | 30% | Flat | Transition point |

## Event-Driven Term Structure

### Earnings Example
\`\`\`
AAPL earnings in 2 weeks:

7-day IV: 22% (before earnings)
14-day IV: 38% (includes earnings) ← Event premium
30-day IV: 28% (after earnings)
\`\`\`

The expiration containing the event shows elevated IV.

### FOMC Example
\`\`\`
FOMC meeting in 3 days:

3-day IV: 18%
7-day IV: 15%
14-day IV: 14%

Post-FOMC term structure normalizes as event passes.
\`\`\`

## Trading Term Structure

### Calendar Spreads
Buy long-dated, sell short-dated SAME strike

**When to use:**
- Contango (pay less for front, more for back - get more time)
- After events pass (short-dated IV crushes)
- When you expect IV to rise in back month

### Reverse Calendars
Sell long-dated, buy short-dated

**When to use:**
- Backwardation (front is expensive)
- Before events (sell the event premium)
- Caution: unlimited risk if uncovered

### Diagonal Spreads
Calendar concept but different strikes

**Example:**
- Sell 30-day 105 call
- Buy 60-day 110 call

Captures both term structure AND directional bias

## Practical Example

**Pre-Earnings Setup (AAPL):**
- Current price: $155
- 14-day IV (includes earnings): 42%
- 45-day IV (after earnings): 28%

**Trade: Sell Calendar Before Earnings**
- Sell 45-day $155 straddle at 28% IV
- Buy 14-day $155 straddle at 42% IV

After earnings, 14-day IV crushes to 22%, 45-day stays at 27%.
The short-dated options lose value faster → profit.

## Key Takeaways
1. Normal term structure is contango (front < back)
2. Backwardation signals fear or event premium
3. Calendars benefit from contango environment
4. Events create localized IV spikes in specific expirations
5. Post-event IV crush can be traded with short calendars

## Quick Reference
| Term | Definition |
|------|------------|
| **Contango** | Front IV < Back IV (normal) |
| **Backwardation** | Front IV > Back IV (inverted) |
| **Event Premium** | Elevated IV in expirations containing events |
| **Calendar Spread** | Long far-dated, short near-dated same strike |
| **IV Crush** | Rapid IV decline after event passes |`,
        quiz_questions: [
          {
            question: "What does 'contango' in options term structure mean?",
            options: ["Short-term IV is higher than long-term IV", "Short-term IV is lower than long-term IV", "All expirations have the same IV", "IV is decreasing over time"],
            correct_answer: 1,
            explanation: "Contango (normal term structure) means short-term IV is lower than long-term IV, reflecting increasing uncertainty over longer time periods."
          },
          {
            question: "What typically causes backwardation in options term structure?",
            options: ["Low trading volume", "Near-term fear, uncertainty, or event premium", "Low interest rates", "High stock prices"],
            correct_answer: 1,
            explanation: "Backwardation occurs when immediate uncertainty (market stress, imminent events) drives short-term IV above long-term IV."
          },
          {
            question: "After earnings pass, what typically happens to the IV of options that expired just after the announcement?",
            options: ["IV increases", "IV stays the same", "IV crushes (drops sharply)", "IV becomes negative"],
            correct_answer: 2,
            explanation: "Post-earnings IV crush is common as the uncertainty around the event is resolved, causing IV to drop rapidly."
          }
        ]
      },
      {
        title: "Premium Buying vs Selling by Regime",
        description: "Learn when to buy versus sell premium based on the volatility environment.",
        duration: "35 min",
        order_index: 5,
        content_markdown: `# Premium Buying vs Selling by Regime

## Learning Objectives
By the end of this lesson, you will:
- Identify different volatility regimes
- Know when premium selling has an edge
- Recognize environments favorable for premium buying
- Build a regime-based strategy framework

## Volatility Regimes

### Low Volatility Regime
- VIX < 15
- IV Rank < 20%
- Calm, grinding market
- Small daily ranges

### Normal Volatility Regime
- VIX 15-20
- IV Rank 20-50%
- Typical market conditions
- Standard strategy selection

### Elevated Volatility Regime
- VIX 20-30
- IV Rank 50-80%
- Increased uncertainty
- Premium selling favored

### High Volatility Regime
- VIX > 30
- IV Rank > 80%
- Fear/panic conditions
- Extreme strategies only

## Premium Selling Edge

### When Selling Works Best
1. **High IV Rank (>50%)** - Volatility likely to mean revert down
2. **Time Decay Working** - Positive theta compounds daily
3. **High Win Rate** - Small, consistent profits
4. **Volatility Risk Premium** - IV typically exceeds realized vol

### Ideal Premium Selling Conditions
| Factor | Favorable Level |
|--------|-----------------|
| IV Rank | > 50% |
| VIX | 20-30 |
| Term Structure | Contango |
| Trend | Range-bound or clear trend |

### Premium Selling Strategies
- Credit spreads (put & call)
- Iron condors
- Iron butterflies
- Short strangles (with management)
- Covered calls
- Cash-secured puts

## Premium Buying Edge

### When Buying Works Best
1. **Low IV Rank (<30%)** - Volatility likely to expand
2. **Pre-Event Positioning** - IV expansion expected
3. **Trend Breakouts** - Directional moves coming
4. **Black Swan Hedging** - Tail risk protection

### Ideal Premium Buying Conditions
| Factor | Favorable Level |
|--------|-----------------|
| IV Rank | < 30% |
| VIX | < 15 |
| Term Structure | Flat or backwardation expected |
| Catalyst | Earnings, FDA, merger |

### Premium Buying Strategies
- Long calls/puts (directional)
- Debit spreads (defined risk directional)
- Straddles/strangles (event plays)
- Ratio backspreads
- Long-dated LEAPS

## Regime Classification Framework

### Step 1: Check VIX Level
\`\`\`
VIX < 15 → Low vol regime → Bias: Buy premium
VIX 15-20 → Normal → No strong bias
VIX 20-30 → Elevated → Bias: Sell premium
VIX > 30 → High vol → Sell premium carefully
\`\`\`

### Step 2: Check Individual Stock IV Rank
\`\`\`
IV Rank < 30% → Premium cheap
IV Rank 30-50% → Fair value
IV Rank > 50% → Premium expensive
\`\`\`

### Step 3: Check Trend
\`\`\`
Strong trend → Directional strategies
Range-bound → Neutral strategies
Breakout setup → Straddles/strangles
\`\`\`

## Practical Decision Matrix

| VIX | IV Rank | Trend | Strategy |
|-----|---------|-------|----------|
| Low | Low | Trending | Long debit spreads |
| Low | Low | Range | Long straddles |
| Normal | Normal | Trending | Vertical spreads either way |
| Elevated | High | Range | Iron condors |
| Elevated | High | Trending | Credit spreads with trend |
| High | Very High | Any | Wide iron condors, patience |

## Tracking Your Edge

### Keep Statistics On:
- Win rate by regime
- Average P/L by IV Rank level
- Best strategies per environment
- Avoid trading when edge is unclear

## Key Takeaways
1. Volatility regime determines strategy bias
2. High IV Rank = sell premium (mean reversion)
3. Low IV Rank = buy premium (expansion potential)
4. VIX provides market-wide context
5. Combine regime analysis with individual stock IV Rank

## Quick Reference
| Regime | VIX | IV Rank | Bias |
|--------|-----|---------|------|
| Low Vol | <15 | <30% | Buy premium |
| Normal | 15-20 | 30-50% | Neutral |
| Elevated | 20-30 | 50-80% | Sell premium |
| High Vol | >30 | >80% | Sell carefully |`,
        quiz_questions: [
          {
            question: "In what volatility environment does premium selling typically have the best edge?",
            options: ["Low VIX, low IV Rank", "High VIX (20-30), high IV Rank (>50%)", "Any environment works the same", "Only during earnings"],
            correct_answer: 1,
            explanation: "Premium selling works best when IV is elevated (high IV Rank) because volatility tends to mean revert, and you collect richer premiums."
          },
          {
            question: "What strategy bias is favored when VIX is below 15 and IV Rank is below 30%?",
            options: ["Sell premium aggressively", "Buy premium - volatility likely to expand", "Iron condors", "Don't trade at all"],
            correct_answer: 1,
            explanation: "Low volatility environments often precede expansion. With cheap premium, buying strategies have favorable risk/reward."
          },
          {
            question: "What is the 'volatility risk premium' that benefits premium sellers?",
            options: ["Broker fee for volatility trades", "The tendency for IV to exceed realized volatility on average", "The cost of hedging gamma", "Exchange fees for options"],
            correct_answer: 1,
            explanation: "The volatility risk premium is the historical tendency for implied volatility to be higher than realized volatility, giving sellers an edge over time."
          }
        ]
      },
      {
        title: "Module 2 Assessment",
        description: "Comprehensive quiz covering volatility mastery concepts.",
        duration: "15 min",
        order_index: 6,
        content_markdown: `# Module 2 Assessment: Volatility Mastery

## Assessment Overview

This assessment covers all topics from Module 2:
- Implied vs Historical Volatility
- IV Rank vs IV Percentile
- Volatility Cones
- Vertical Skew (Strike-based)
- Horizontal Skew (Term Structure)
- Premium Buying vs Selling Regimes

**Passing Score:** 70% (at least 7 out of 10 correct)

## Concepts Review

### Volatility Fundamentals
- HV = Past price movement (realized)
- IV = Market's expectation (forward-looking)
- Volatility risk premium = IV typically > HV

### IV Rank & Percentile
- IV Rank = Position in 52-week range
- IV Percentile = % of days IV was lower
- Both > 50% = premium selling bias

### Volatility Structure
- Vertical skew = IV across strikes (usually puts rich)
- Term structure = IV across expirations
- Contango = normal (front < back)
- Backwardation = inverted (front > back)

### Trading Application
- Sell premium when IV Rank high
- Buy premium when IV Rank low
- Use regime classification for strategy selection

---

*Complete this assessment to unlock Module 3: Advanced Options Greeks*`,
        quiz_questions: [
          {
            question: "What is the key difference between historical and implied volatility?",
            options: ["There is no difference", "HV is forward-looking, IV is backward-looking", "HV measures past movement, IV represents expected future movement", "IV is always lower than HV"],
            correct_answer: 2,
            explanation: "Historical volatility measures actual past price movement, while implied volatility is derived from option prices and represents the market's expectation of future volatility."
          },
          {
            question: "If IV Rank is 15% but IV Percentile is 45%, what might explain this difference?",
            options: ["Calculation error", "A past volatility spike is skewing the IV Rank lower", "IV Percentile is wrong", "They should always be equal"],
            correct_answer: 1,
            explanation: "IV Rank is heavily influenced by extreme highs/lows. A past spike creates a wide range, making current IV appear low in that range even if it's historically normal (as IV Percentile shows)."
          },
          {
            question: "When using a volatility cone, what does it mean if current 30-day IV plots above the 75th percentile line?",
            options: ["Options are cheap", "Options are fairly priced", "30-day options are historically expensive", "The stock will fall"],
            correct_answer: 2,
            explanation: "IV above the 75th percentile of the volatility cone indicates that current IV is higher than 75% of historical readings, suggesting options are expensive."
          },
          {
            question: "Why do OTM puts typically have higher IV than OTM calls in equity markets?",
            options: ["Puts are more liquid", "Demand for downside crash protection", "Puts expire more often", "It's random"],
            correct_answer: 1,
            explanation: "The demand for hedging against market crashes creates persistent demand for OTM puts, driving their IV higher."
          },
          {
            question: "What is 'backwardation' in options term structure?",
            options: ["Long-dated IV > short-dated IV", "Short-dated IV > long-dated IV", "All expirations have same IV", "IV is falling"],
            correct_answer: 1,
            explanation: "Backwardation is an inverted term structure where near-term IV exceeds longer-term IV, often due to imminent events or market stress."
          },
          {
            question: "A stock has IV Rank of 72% and IV Percentile of 68%. What strategy bias is favored?",
            options: ["Buy straddles", "Sell premium (credit strategies)", "No edge either way", "Only trade stock"],
            correct_answer: 1,
            explanation: "Both metrics above 50% indicate options are relatively expensive, favoring premium selling strategies."
          },
          {
            question: "Calendar spreads (long back month, short front month) work best in what term structure environment?",
            options: ["Backwardation", "Contango (normal)", "Flat term structure", "Only pre-earnings"],
            correct_answer: 1,
            explanation: "Calendars benefit from contango because you sell the cheaper front-month and buy the relatively pricier back-month, profiting as they converge."
          },
          {
            question: "What VIX level range typically favors premium selling strategies?",
            options: ["VIX < 12", "VIX 12-15", "VIX 20-30", "VIX > 40"],
            correct_answer: 2,
            explanation: "VIX 20-30 represents elevated but not extreme volatility, offering rich premiums with manageable risk and good mean reversion potential."
          },
          {
            question: "If 25-delta put IV is 40% and 25-delta call IV is 30%, what is the skew?",
            options: ["70%", "10%", "35%", "-10%"],
            correct_answer: 1,
            explanation: "25-delta skew = Put IV - Call IV = 40% - 30% = 10%"
          },
          {
            question: "When is buying premium most likely to have an edge?",
            options: ["High IV Rank, high VIX", "Low IV Rank, low VIX, with expected catalyst", "Always after earnings", "When skew is steep"],
            correct_answer: 1,
            explanation: "Low volatility with cheap options and an expected catalyst (earnings, FDA, etc.) creates conditions for volatility expansion, benefiting premium buyers."
          }
        ]
      }
    ]
  },
  {
    title: "Module 3: Advanced Options Greeks",
    description: "Manage risk and exposure across entire portfolios. Master dynamic Greeks and portfolio neutralization.",
    order_index: 2,
    lessons: [
      {
        title: "Delta Beyond Directional Bias",
        description: "Understand dollar delta, delta as probability, and advanced delta concepts.",
        duration: "25 min",
        order_index: 0,
        content_markdown: `# Delta Beyond Directional Bias

## Learning Objectives
By the end of this lesson, you will:
- Calculate and interpret dollar delta
- Understand delta as a probability approximation
- Use delta for position sizing
- Manage delta across complex positions

## Delta Refresher

### Basic Definition
Delta measures how much an option's price changes for a $1 move in the underlying.

| Option Type | Delta Range |
|------------|-------------|
| Long Call | 0 to +1.0 |
| Long Put | 0 to -1.0 |
| Short Call | 0 to -1.0 |
| Short Put | 0 to +1.0 |

## Dollar Delta (Notional Exposure)

### Definition
Dollar delta represents your actual dollar exposure to the underlying's price movement.

### Formula
\`\`\`
Dollar Delta = Delta × Number of Contracts × 100 × Stock Price
\`\`\`

### Example
\`\`\`
Position: Long 10 AAPL $150 Calls
Delta: 0.55
Stock Price: $155

Dollar Delta = 0.55 × 10 × 100 × $155 = $85,250

This position moves like owning $85,250 worth of AAPL stock.
\`\`\`

## Delta as Probability

### The Approximation
Delta roughly approximates the probability that an option expires in-the-money.

| Delta | Approximate ITM Probability |
|-------|----------------------------|
| 0.80 | ~80% chance of expiring ITM |
| 0.50 | ~50% (ATM options) |
| 0.30 | ~30% chance |
| 0.15 | ~15% chance |

### Important Caveats
- This is an approximation, not exact
- Based on risk-neutral probabilities
- Affected by skew and volatility
- More accurate for near-term options

## Delta in Position Sizing

### Risk-Adjusted Position Sizing
\`\`\`
Max Position Dollar Delta = Account Size × Risk %

Example:
Account: $100,000
Max risk: 5% of account in one position

Max Dollar Delta = $100,000 × 0.05 = $5,000 exposure

If buying 0.50 delta calls at $150:
Max contracts = $5,000 / (0.50 × 100 × $150) = 0.67 ≈ 1 contract
\`\`\`

## Delta Changes: Understanding the Dynamic Nature

### Factors That Change Delta
1. **Stock price movement** - Delta increases as options go ITM
2. **Time passing** - ITM deltas approach 1.0, OTM approach 0
3. **Volatility changes** - Higher IV = deltas closer to 0.50

### Delta at Different Stages

| Days to Expiration | OTM Delta | ATM Delta | ITM Delta |
|-------------------|-----------|-----------|-----------|
| 60 DTE | 0.25 | 0.50 | 0.75 |
| 30 DTE | 0.20 | 0.50 | 0.80 |
| 7 DTE | 0.10 | 0.50 | 0.90 |
| 1 DTE | 0.02 | 0.50 | 0.98 |

## Portfolio Delta Management

### Aggregating Delta
Sum all position deltas to get net portfolio delta:

\`\`\`
Position 1: Long 5 calls, 0.60 delta = +300 delta
Position 2: Short 3 puts, -0.40 delta = +120 delta
Position 3: Short 10 calls, 0.30 delta = -300 delta

Net Portfolio Delta = +300 + 120 - 300 = +120 delta
(Equivalent to being long 120 shares)
\`\`\`

### Delta Neutralization
To hedge +120 delta:
- Short 120 shares of stock, OR
- Buy puts with -120 delta, OR
- Sell calls with +120 delta worth

## Key Takeaways
1. Dollar delta shows actual monetary exposure
2. Delta approximates ITM probability
3. Use delta for position sizing and risk management
4. Delta changes with price, time, and volatility
5. Portfolio delta can be hedged to neutrality

## Quick Reference
| Concept | Formula/Usage |
|---------|---------------|
| **Dollar Delta** | Delta × Contracts × 100 × Price |
| **ITM Probability** | ≈ Delta (rough approximation) |
| **Position Sizing** | Keep dollar delta within risk limits |
| **Delta Neutral** | Net portfolio delta = 0 |`,
        quiz_questions: [
          {
            question: "If you're long 5 contracts of a 0.60 delta call on a $200 stock, what is your dollar delta?",
            options: ["$600", "$6,000", "$60,000", "$300"],
            correct_answer: 2,
            explanation: "Dollar Delta = 0.60 × 5 × 100 × $200 = $60,000"
          },
          {
            question: "An option has a delta of 0.35. Approximately what probability does the market assign to this option expiring in-the-money?",
            options: ["65%", "35%", "50%", "100%"],
            correct_answer: 1,
            explanation: "Delta roughly approximates the probability of expiring ITM. A 0.35 delta suggests approximately a 35% chance."
          },
          {
            question: "As expiration approaches, what happens to the delta of an out-of-the-money call option?",
            options: ["Delta increases toward 1.0", "Delta decreases toward 0", "Delta stays the same", "Delta becomes negative"],
            correct_answer: 1,
            explanation: "OTM options see their delta decrease toward 0 as expiration nears, reflecting the decreasing probability of finishing ITM."
          }
        ]
      },
      {
        title: "Gamma: The Accelerator",
        description: "Master gamma risk, gamma scalping, and managing gamma exposure.",
        duration: "30 min",
        order_index: 1,
        content_markdown: `# Gamma: The Accelerator

## Learning Objectives
By the end of this lesson, you will:
- Understand gamma as the rate of delta change
- Identify gamma risk in short options positions
- Learn gamma scalping techniques
- Manage gamma exposure at portfolio level

## Gamma Fundamentals

### Definition
Gamma measures how much delta changes for a $1 move in the underlying.

\`\`\`
New Delta = Old Delta + (Gamma × Price Change)

Example:
Call delta = 0.50, Gamma = 0.05
Stock moves up $1

New Delta = 0.50 + (0.05 × 1) = 0.55
\`\`\`

### Gamma Characteristics

| Factor | Gamma Effect |
|--------|--------------|
| ATM options | Highest gamma |
| Deep ITM/OTM | Low gamma |
| Near expiration | Gamma increases dramatically |
| Far expiration | Gamma is lower, more stable |

## Long Gamma vs Short Gamma

### Long Gamma (Long Options)
- Delta moves in your favor as price moves
- Profits accelerate on big moves
- Pay theta for this convexity
- **Want:** Big price movements

### Short Gamma (Short Options)
- Delta moves against you as price moves
- Need to hedge (buy high, sell low)
- Collect theta as compensation
- **Want:** Small price movements, range-bound

## Gamma Risk Near Expiration

### The Gamma Spike

| DTE | ATM Gamma (Example) |
|-----|---------------------|
| 60 | 0.02 |
| 30 | 0.03 |
| 14 | 0.05 |
| 7 | 0.08 |
| 1 | 0.25 |
| 0 (expiration) | Approaches ∞ near strike |

### Pin Risk
At expiration, ATM options have extreme gamma:
- Small moves create large delta swings
- Assignment uncertainty if ATM
- **Recommendation:** Close or roll positions 2-3 days before expiration

## Gamma Scalping

### The Concept
Long options positions can be "gamma scalped" by dynamically hedging:

1. Buy straddle (long gamma)
2. When stock moves up → sell shares (reduce long delta)
3. When stock moves down → buy shares (reduce short delta)
4. Each hedge locks in a small profit
5. Repeat as stock oscillates

### Example
\`\`\`
Position: Long ATM straddle, delta neutral initially

Stock rises $2:
- Calls gain delta, puts lose delta
- Net position becomes +20 delta
- Sell 20 shares at higher price

Stock falls $3:
- Position becomes -30 delta  
- Buy 30 shares at lower price

Net effect: Bought low, sold high → locked in profit
\`\`\`

### Break-Even for Gamma Scalping
Must move enough to offset theta decay:
\`\`\`
Required Move = √(2 × Theta / Gamma)
\`\`\`

## Portfolio Gamma Management

### Measuring Portfolio Gamma
Sum individual position gammas (weighted by size):

\`\`\`
Position 1: Long 10 calls, gamma 0.03 = +30 gamma
Position 2: Short 5 straddles, gamma 0.08 = -40 gamma

Net Gamma = +30 - 40 = -10 gamma

(Net short 10 gamma = delta changes by 10 for each $1 move)
\`\`\`

### Gamma Hedging Approaches
1. **Accept the gamma:** Adjust delta hedge as needed
2. **Flatten gamma:** Add opposing options
3. **Time-based:** Close high-gamma positions early

## Key Takeaways
1. Gamma measures how fast delta changes
2. Long gamma = want big moves, pay theta
3. Short gamma = want small moves, collect theta
4. Gamma explodes near expiration, especially ATM
5. Gamma scalping extracts value from volatility

## Quick Reference
| Term | Definition |
|------|------------|
| **Gamma** | Rate of delta change per $1 move |
| **Long Gamma** | Profit from moves, pay theta |
| **Short Gamma** | Collect theta, hurt by moves |
| **Gamma Scalping** | Hedging long gamma to lock in moves |
| **Pin Risk** | Extreme gamma at expiration |`,
        quiz_questions: [
          {
            question: "If a call option has delta = 0.45 and gamma = 0.04, what will the new delta be after a $2 increase in stock price?",
            options: ["0.49", "0.53", "0.41", "0.47"],
            correct_answer: 1,
            explanation: "New Delta = 0.45 + (0.04 × 2) = 0.45 + 0.08 = 0.53"
          },
          {
            question: "When is gamma typically highest for an option?",
            options: ["Deep in-the-money with 60 days to expiration", "At-the-money with very few days to expiration", "Far out-of-the-money with 30 days", "At-the-money with 90 days"],
            correct_answer: 1,
            explanation: "Gamma is highest for ATM options near expiration because delta must move rapidly from ~0.5 to either 0 or 1."
          },
          {
            question: "What does 'gamma scalping' involve?",
            options: ["Selling high-gamma options", "Dynamically hedging a long gamma position to capture moves", "Buying options just before expiration", "Avoiding all gamma exposure"],
            correct_answer: 1,
            explanation: "Gamma scalping involves owning long gamma (like straddles) and adjusting delta by buying/selling shares as the stock moves, locking in small profits."
          }
        ]
      },
      {
        title: "Theta: Time Decay Dynamics",
        description: "Understand non-linear decay curves and optimize theta in your strategies.",
        duration: "25 min",
        order_index: 2,
        content_markdown: `# Theta: Time Decay Dynamics

## Learning Objectives
By the end of this lesson, you will:
- Understand how theta decay works over time
- Know the non-linear decay curve shape
- Optimize strategies for theta capture
- Balance theta with other Greek exposures

## Theta Fundamentals

### Definition
Theta measures how much option value decreases per day from time decay, all else equal.

\`\`\`
If theta = -$0.05:
The option loses $0.05 of value each day (holding everything else constant)
For 1 contract: -$5 per day
For 10 contracts: -$50 per day
\`\`\`

### Theta by Position Type

| Position | Theta Sign | Effect |
|----------|-----------|--------|
| Long Calls | Negative | Hurts you |
| Long Puts | Negative | Hurts you |
| Short Calls | Positive | Helps you |
| Short Puts | Positive | Helps you |

## The Non-Linear Decay Curve

### Decay Accelerates Near Expiration
\`\`\`
Time Value
|
|*
|  *
|    *
|      *
|        *
|          *
|            *
|              **
|                 ***
|                    ******
+------------------------→ Time
90 DTE                    0 DTE
\`\`\`

### Approximate Decay by Period

| Days to Expiration | Decay Rate |
|-------------------|------------|
| 90 to 60 DTE | ~10% of premium |
| 60 to 30 DTE | ~15% of premium |
| 30 to 14 DTE | ~25% of premium |
| 14 to 7 DTE | ~20% of premium |
| 7 to 0 DTE | ~30% of premium (accelerating) |

**Key insight:** Half the time value decays in the final third of the option's life.

## Theta and Moneyness

### ATM vs OTM/ITM Theta

| Moneyness | Theta Characteristic |
|-----------|---------------------|
| ATM | Highest absolute theta |
| OTM | Lower theta (less time value) |
| Deep ITM | Lowest theta (mostly intrinsic) |

### Example (30 DTE, $100 Stock)
| Strike | Delta | Premium | Theta |
|--------|-------|---------|-------|
| $95 Call (ITM) | 0.70 | $6.50 | -$0.03 |
| $100 Call (ATM) | 0.50 | $3.00 | -$0.05 |
| $105 Call (OTM) | 0.30 | $1.20 | -$0.04 |

## Theta Harvesting Strategies

### Optimal Time to Sell Premium
**Sweet spot: 30-45 DTE**
- Meaningful premium to collect
- Not yet in the steepest decay phase
- Time to be right or adjust
- Manage at 50% profit or 21 DTE

### Strategies Ranked by Theta

| Strategy | Theta Profile |
|----------|---------------|
| Short Straddle | Highest positive theta |
| Iron Butterfly | High positive theta |
| Short Strangle | High positive theta |
| Iron Condor | Moderate positive theta |
| Credit Spread | Low positive theta |
| Long Vertical | Slightly negative |
| Long Straddle | High negative theta |

## Weekend and Holiday Theta

### Does Theta Decay Over Weekends?
**It depends on the broker/exchange:**
- Some price theta into Friday close
- Some distribute evenly over weekend
- Holidays similar treatment

**Practical effect:** Don't rely on weekend theta decay as a "free" edge.

## Key Takeaways
1. Theta is the daily cost (long) or income (short) of time
2. Decay accelerates in the final 30 days
3. ATM options have the highest theta
4. Sell premium in the 30-45 DTE window for best theta/risk
5. Manage positions before extreme decay at <7 DTE

## Quick Reference
| Term | Definition |
|------|------------|
| **Theta** | Daily time decay in dollars |
| **Positive Theta** | Position benefits from time passing |
| **Negative Theta** | Position hurt by time passing |
| **Theta Decay Curve** | Non-linear, accelerates near expiry |
| **Sweet Spot** | 30-45 DTE for selling premium |`,
        quiz_questions: [
          {
            question: "When does theta decay accelerate the most?",
            options: ["From 90 to 60 DTE", "From 60 to 30 DTE", "In the final 30 days, especially the last week", "Decay is constant over time"],
            correct_answer: 2,
            explanation: "Theta decay is non-linear and accelerates significantly in the final weeks, with roughly half of time value decaying in the last third of an option's life."
          },
          {
            question: "Which option typically has the highest absolute theta value?",
            options: ["Deep in-the-money options", "At-the-money options", "Far out-of-the-money options", "All options have the same theta"],
            correct_answer: 1,
            explanation: "ATM options have the highest time value, and therefore the highest absolute theta since they have the most extrinsic value to decay."
          },
          {
            question: "What is the recommended 'sweet spot' for selling premium to optimize theta?",
            options: ["0-7 DTE", "7-14 DTE", "30-45 DTE", "90+ DTE"],
            correct_answer: 2,
            explanation: "The 30-45 DTE window offers meaningful premium while avoiding the highest-risk period near expiration and providing time for adjustment."
          }
        ]
      },
      {
        title: "Vega: Volatility Sensitivity",
        description: "Manage vega risk across expirations and implement vega hedging strategies.",
        duration: "30 min",
        order_index: 3,
        content_markdown: `# Vega: Volatility Sensitivity

## Learning Objectives
By the end of this lesson, you will:
- Understand how vega measures IV sensitivity
- Know how vega varies by expiration and strike
- Implement vega hedging techniques
- Balance vega exposure in a portfolio

## Vega Fundamentals

### Definition
Vega measures how much an option's price changes for a 1% change in implied volatility.

\`\`\`
If vega = $0.15:
A 1% increase in IV adds $0.15 to the option price
A 5% increase in IV adds $0.75 to the option price
\`\`\`

### Vega by Position

| Position | Vega Sign | IV Increase Effect |
|----------|-----------|-------------------|
| Long Calls | Positive | Helps |
| Long Puts | Positive | Helps |
| Short Calls | Negative | Hurts |
| Short Puts | Negative | Hurts |

## Vega Across Expirations

### Key Principle
Longer-dated options have **HIGHER** vega than shorter-dated options.

### Example Vega by DTE ($100 ATM Straddle)

| DTE | Vega per 1% IV | Effect of 5% IV Drop |
|-----|----------------|----------------------|
| 7 | $0.05 | -$0.25 |
| 30 | $0.12 | -$0.60 |
| 60 | $0.18 | -$0.90 |
| 90 | $0.22 | -$1.10 |
| 180 | $0.30 | -$1.50 |

**Implication:** Long-dated options are more sensitive to IV changes.

## Vega Across Strikes

### Vega is Highest ATM
Like gamma and theta, vega is concentrated at-the-money:

| Strike ($100 stock) | Vega |
|---------------------|------|
| $90 Put | $0.08 |
| $95 Put | $0.11 |
| $100 Straddle | $0.15 |
| $105 Call | $0.11 |
| $110 Call | $0.07 |

## Vega Risk in Practice

### Long Vega Risk
- IV drops → Option value drops
- Common after earnings or events
- Post-VIX spike normalization

### Short Vega Risk
- IV spikes → Losses on short positions
- Stress events, market crashes
- Unexpected news

### Real Example: Earnings IV Crush
\`\`\`
Pre-earnings:
Long straddle at $5.00, vega = $0.20, IV = 60%

Post-earnings (IV crushes to 35%):
IV drops 25 points
Loss from vega: 25 × $0.20 = $5.00

The entire premium could be wiped out by IV crush!
\`\`\`

## Vega Hedging Strategies

### 1. Time Spread (Calendar)
- Long back-month (high vega)
- Short front-month (lower vega)
- Net long vega, but less than outright long

### 2. Vega-Neutral Positions
Match long and short vega:
\`\`\`
Position 1: Long 10 × 60-day calls, vega = +180
Position 2: Short 15 × 30-day calls, vega = -180
Net vega ≈ 0
\`\`\`

### 3. VIX Hedging
- Long VIX calls to hedge short vega in equity positions
- Imperfect hedge (VIX ≠ individual stock IV)
- Use for portfolio-level protection

## Portfolio Vega Management

### Calculating Portfolio Vega
\`\`\`
Sum all position vegas:

Position 1: Long 5 calls, vega 0.15 = +75 vega
Position 2: Short 10 puts, vega 0.12 = -120 vega
Position 3: Long 3 straddles, vega 0.25 = +75 vega

Net Portfolio Vega = +75 - 120 + 75 = +30 vega

A 1% IV increase adds $30 to portfolio value
A 5% IV increase adds $150
\`\`\`

## Key Takeaways
1. Vega measures sensitivity to implied volatility changes
2. Long-dated options have higher vega than short-dated
3. ATM options have the highest vega at any expiration
4. IV crush can devastate long premium positions
5. Hedge vega with spreads or VIX products

## Quick Reference
| Term | Definition |
|------|------------|
| **Vega** | Price change per 1% IV change |
| **Long Vega** | Profits from IV increase |
| **Short Vega** | Profits from IV decrease |
| **IV Crush** | Rapid IV decline (post-event) |
| **Vega Neutral** | Balanced long/short vega |`,
        quiz_questions: [
          {
            question: "Which options have the highest vega?",
            options: ["Short-dated OTM options", "Long-dated ATM options", "Short-dated ATM options", "Deep ITM options of any duration"],
            correct_answer: 1,
            explanation: "Vega is highest for longer-dated options and ATM strikes. Long-dated ATM options have the most sensitivity to IV changes."
          },
          {
            question: "If an option has a vega of $0.20 and implied volatility drops by 10 percentage points, how much does the option price decrease?",
            options: ["$0.20", "$2.00", "$0.02", "$20.00"],
            correct_answer: 1,
            explanation: "Vega of $0.20 means a $0.20 change per 1% IV change. A 10% drop = 10 × $0.20 = $2.00 decrease."
          },
          {
            question: "What is 'IV crush' and when does it typically occur?",
            options: ["IV increasing before earnings", "Rapid IV decline after events like earnings", "IV staying constant", "IV only affecting calls"],
            correct_answer: 1,
            explanation: "IV crush is the rapid decline in implied volatility after events (like earnings) when uncertainty is resolved, hurting long premium positions."
          }
        ]
      },
      {
        title: "Portfolio-Level Greeks Management",
        description: "Aggregate and manage Greeks across multiple positions and strategies.",
        duration: "35 min",
        order_index: 4,
        content_markdown: `# Portfolio-Level Greeks Management

## Learning Objectives
By the end of this lesson, you will:
- Aggregate Greeks across multiple positions
- Set portfolio Greek limits
- Implement neutralization strategies
- Balance Greeks for desired exposure profile

## Why Portfolio-Level Greeks Matter

### Individual vs Portfolio View
Looking at each position separately misses:
- Offsetting exposures between positions
- Concentration risks
- Net directional bias
- Correlation between underlyings

### Example: Hidden Risk
\`\`\`
Position 1: Long AAPL calls (+300 delta)
Position 2: Long MSFT calls (+250 delta)
Position 3: Long QQQ calls (+400 delta)

Net Portfolio Delta: +950

All positions are tech-heavy and correlated!
Real exposure may be higher than sum suggests.
\`\`\`

## Aggregating Greeks

### Simple Aggregation (Same Underlying)
Just sum the Greeks:

| Position | Delta | Gamma | Theta | Vega |
|----------|-------|-------|-------|------|
| Long 10 calls | +500 | +20 | -30 | +150 |
| Short 5 puts | +200 | +10 | +15 | -60 |
| Short 8 calls | -400 | -25 | +40 | -180 |
| **Net** | **+300** | **+5** | **+25** | **-90** |

### Beta-Weighted Greeks (Multiple Underlyings)
Convert all positions to SPY-equivalent:

\`\`\`
AAPL (beta 1.2): 300 delta → 300 × 1.2 = 360 SPY-equivalent
MSFT (beta 1.1): 250 delta → 250 × 1.1 = 275 SPY-equivalent
XOM (beta 0.8): 200 delta → 200 × 0.8 = 160 SPY-equivalent

Total Beta-Weighted Delta: 795 SPY-equivalent
\`\`\`

## Setting Greek Limits

### Example Portfolio Risk Parameters

| Greek | Limit | Rationale |
|-------|-------|-----------|
| Net Delta | ±500 SPY-equivalent | Limit directional exposure |
| Net Gamma | ±50 | Avoid excessive gamma spikes |
| Net Theta | +$100 to -$50/day | Theta income or controlled cost |
| Net Vega | ±200 | Limit IV exposure |

### Scaling to Account Size
\`\`\`
$100,000 account → May use above limits
$50,000 account → Cut limits in half
$500,000 account → May use 5× limits
\`\`\`

## Neutralization Strategies

### Delta Neutralization

**Methods:**
1. Trade underlying stock/ETF
2. Trade more options
3. Use futures (for index)

**Example:**
\`\`\`
Portfolio delta: +400
To neutralize: Short 400 shares of SPY (or equivalent)
New delta: ~0
\`\`\`

### Gamma Neutralization

**Methods:**
1. Buy options to flatten short gamma
2. Reduce position size in short options
3. Spread trades reduce gamma concentration

**Challenge:** Neutralizing gamma often adds theta cost

### Vega Neutralization

**Methods:**
1. Mix long and short-dated options
2. Calendar spreads reduce net vega
3. VIX products for portfolio-level hedge

## Greek Interactions

### The Greek Trade-offs

| You Want | Cost |
|----------|------|
| Long Gamma (convexity) | Negative Theta (pay daily) |
| Positive Theta (income) | Short Gamma (pain on moves) |
| Long Vega (IV upside) | Usually costs Theta |
| Short Vega (IV premium) | Risk of IV spike |

### Can't Have It All
Every Greek profile involves trade-offs. Choose based on your market view.

## Practical Portfolio Dashboard

### Sample Greek Summary

\`\`\`
═══════════════════════════════════════════
PORTFOLIO GREEKS SUMMARY
═══════════════════════════════════════════
Net Delta:    +285 (SPY-weighted)
Net Gamma:    +12
Net Theta:    +$45/day
Net Vega:     -85

INTERPRETATION:
- Slightly bullish directional bias
- Long gamma (benefits from moves)
- Earning theta (positions working)
- Short vega (risk if IV spikes)

ACTION: Consider hedging vega with VIX calls
═══════════════════════════════════════════
\`\`\`

## Key Takeaways
1. Aggregate Greeks to see true portfolio exposure
2. Beta-weight for cross-underlying comparison
3. Set Greek limits based on account size
4. Greek trade-offs are unavoidable
5. Monitor and rebalance regularly

## Quick Reference
| Concept | Action |
|---------|--------|
| **Too Much Delta** | Hedge with stock or options |
| **Too Short Gamma** | Buy options or reduce shorts |
| **Not Enough Theta** | Sell more premium (carefully) |
| **Too Short Vega** | Add long-dated longs or VIX calls |`,
        quiz_questions: [
          {
            question: "Why should you beta-weight your Greeks when managing a multi-stock portfolio?",
            options: ["It's required by regulations", "To compare exposure on a common basis (like SPY-equivalent)", "Beta-weighting increases returns", "It reduces commissions"],
            correct_answer: 1,
            explanation: "Beta-weighting converts all positions to a common benchmark (like SPY) so you can accurately assess total directional exposure across different stocks."
          },
          {
            question: "If your portfolio is net short gamma, what is a risk you face?",
            options: ["Time decay works against you", "Small moves work in your favor but large moves hurt", "You lose money if IV drops", "Delta hedging is unnecessary"],
            correct_answer: 1,
            explanation: "Short gamma profits from small moves (theta income) but faces accelerating losses on large moves as delta moves against you."
          },
          {
            question: "What is the typical trade-off between theta and gamma?",
            options: ["You can maximize both simultaneously", "Positive theta requires accepting short gamma exposure", "They are unrelated", "Long gamma generates positive theta"],
            correct_answer: 1,
            explanation: "To earn theta (time decay), you must be short options, which means short gamma. Long gamma (convexity) requires paying theta."
          }
        ]
      },
      {
        title: "Greek Interactions & Trade-offs",
        description: "Understand how Greeks affect each other with practical scenarios.",
        duration: "30 min",
        order_index: 5,
        content_markdown: `# Greek Interactions & Trade-offs

## Learning Objectives
By the end of this lesson, you will:
- Understand how Greeks are interconnected
- Predict Greek changes as conditions shift
- Make informed trade-offs in strategy design
- Apply multi-Greek thinking to real trades

## The Greek Web

### All Greeks Are Connected
Changes in one Greek ripple through others:

\`\`\`
                    ┌──────────────┐
                    │   PRICE      │
                    │   MOVEMENT   │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         ┌────────┐  ┌────────┐  ┌────────┐
         │ DELTA  │──│ GAMMA  │──│ VEGA   │
         └────┬───┘  └────┬───┘  └────┬───┘
              │           │           │
              └─────┬─────┘           │
                    ▼                 │
              ┌────────┐              │
              │ THETA  │◄─────────────┘
              └────────┘
\`\`\`

## Key Interactions

### Delta-Gamma Interaction
As price moves, gamma changes delta:
- Price rises → Call delta increases (toward 1.0)
- Price falls → Call delta decreases (toward 0)

**Practical Impact:**
\`\`\`
You're delta-neutral at stock = $100
Stock rises to $105
Your delta is now +150 (due to gamma)
You need to re-hedge!
\`\`\`

### Gamma-Theta Interaction
These are inversely related:

| Gamma | Theta | Profile |
|-------|-------|---------|
| High (long options) | Negative (costs) | Pay for convexity |
| Low (short options) | Positive (income) | Earn for risk |

**The Core Trade-off:**
You cannot have positive theta AND positive gamma. Choose your exposure.

### Vega-Theta Interaction
Both relate to time value differently:

| Position | Vega | Theta | When Each Matters |
|----------|------|-------|-------------------|
| Long call | + | - | Vega dominates early; theta dominates late |
| Short call | - | + | Theta income unless IV spikes (vega risk) |

## Time as a Factor

### Greeks Change Over Time

| Greek | As Expiration Approaches |
|-------|-------------------------|
| Delta | ATM stays ~0.50; OTM→0, ITM→1.0 |
| Gamma | Increases dramatically for ATM |
| Theta | Accelerates (more decay per day) |
| Vega | Decreases (less time for IV to matter) |

### Practical Example: 30 DTE vs 7 DTE ATM Call

| Greek | 30 DTE | 7 DTE | Change |
|-------|--------|-------|--------|
| Delta | 0.52 | 0.51 | Stable |
| Gamma | 0.04 | 0.12 | +200% |
| Theta | -$0.08 | -$0.15 | +87% |
| Vega | $0.12 | $0.05 | -58% |

## Strategy-Specific Greek Profiles

### Iron Condor
\`\`\`
Delta: Near zero (neutral)
Gamma: Negative (don't want moves)
Theta: Positive (earning time decay)
Vega: Negative (want IV to stay or drop)

Trade-off: Collect theta, risk big moves + IV spikes
\`\`\`

### Long Straddle
\`\`\`
Delta: Near zero (neutral)
Gamma: Positive (want moves)
Theta: Negative (paying time decay)
Vega: Positive (want IV to rise)

Trade-off: Pay theta for upside on moves/IV expansion
\`\`\`

### Debit Spread (Bull Call Spread)
\`\`\`
Delta: Positive (directional)
Gamma: Low positive (limited)
Theta: Slightly negative (paying)
Vega: Low positive (limited IV exposure)

Trade-off: Defined risk, capped profit, moderate Greeks
\`\`\`

## Making Trade-Off Decisions

### Decision Framework

1. **What's your market view?**
   - Directional → Focus on delta
   - Neutral → Minimize delta
   - Range → Short gamma + collect theta

2. **What's your volatility view?**
   - IV will rise → Long vega
   - IV will fall → Short vega
   - Unsure → Reduce vega exposure

3. **What can you afford?**
   - Can pay theta → Long gamma OK
   - Need income → Sell premium

4. **What's your time horizon?**
   - Short-term → Gamma/theta matter more
   - Long-term → Vega matters more

## Key Takeaways
1. Greeks are interconnected, not independent
2. Gamma and theta are inversely related
3. Vega matters more for longer-dated options
4. Near expiration, gamma and theta dominate
5. Every strategy involves Greek trade-offs

## Quick Reference
| Trade-off | Choose A | Choose B |
|-----------|----------|----------|
| Gamma vs Theta | Long options (pay theta) | Short options (earn theta) |
| Vega sensitivity | Long-dated (high vega) | Short-dated (low vega) |
| Delta hedging | More frequent (high gamma) | Less frequent (low gamma) |`,
        quiz_questions: [
          {
            question: "Why can't you have positive theta AND positive gamma simultaneously?",
            options: ["Regulations prevent it", "Long options have negative theta; short options have positive theta but negative gamma", "They cancel out mathematically", "You need more capital for both"],
            correct_answer: 1,
            explanation: "To earn theta (positive), you must be short options. But short options mean short gamma. Long gamma (positive) requires owning options, which costs theta (negative)."
          },
          {
            question: "As expiration approaches, what happens to the vega of an ATM option?",
            options: ["Vega increases significantly", "Vega decreases (less time for IV to impact)", "Vega stays constant", "Vega becomes negative"],
            correct_answer: 1,
            explanation: "Vega decreases as expiration nears because there's less time for volatility changes to affect the option's value."
          },
          {
            question: "An iron condor has positive theta. What is the trade-off for this theta income?",
            options: ["You pay higher commissions", "You have negative gamma (risk of large moves) and negative vega (risk of IV spike)", "There is no trade-off", "You can only trade on certain days"],
            correct_answer: 1,
            explanation: "Iron condors earn theta by being short options, which means negative gamma (hurt by moves) and negative vega (hurt by IV increases)."
          }
        ]
      },
      {
        title: "Module 3 Assessment",
        description: "Comprehensive quiz covering advanced options Greeks concepts.",
        duration: "15 min",
        order_index: 6,
        content_markdown: `# Module 3 Assessment: Advanced Options Greeks

## Assessment Overview

This assessment covers all topics from Module 3:
- Delta and dollar delta concepts
- Gamma and gamma scalping
- Theta and decay dynamics
- Vega and IV sensitivity
- Portfolio-level Greeks management
- Greek interactions and trade-offs

**Passing Score:** 70% (at least 7 out of 10 correct)

## Key Concepts Review

### Delta
- Dollar delta = actual monetary exposure
- Delta ≈ probability of expiring ITM
- Changes with price, time, and IV

### Gamma
- Rate of delta change
- Highest ATM near expiration
- Long gamma = want moves, pay theta

### Theta
- Daily time decay cost/income
- Non-linear acceleration near expiry
- Sweet spot: 30-45 DTE for selling

### Vega
- Sensitivity to IV changes
- Higher for longer-dated options
- IV crush risk for long premium

### Portfolio Management
- Aggregate Greeks across positions
- Beta-weight for cross-asset comparison
- Balance trade-offs based on view

---

*Complete this assessment to unlock Module 4: Institutional Technical Analysis*`,
        quiz_questions: [
          {
            question: "What does 'dollar delta' measure?",
            options: ["The cost of delta hedging", "Your actual monetary exposure to price movement", "The delta of dollar-denominated options", "The profit from delta changes"],
            correct_answer: 1,
            explanation: "Dollar delta (Delta × Contracts × 100 × Stock Price) shows how much your position's value changes in dollar terms for a $1 move in the stock."
          },
          {
            question: "If a put has delta of -0.40 and gamma of 0.05, what will the new delta be after the stock drops $3?",
            options: ["-0.55", "-0.25", "-0.40", "-0.45"],
            correct_answer: 0,
            explanation: "For a put (stock drops = delta becomes more negative): New Delta = -0.40 + (-0.05 × 3) = -0.40 - 0.15 = -0.55"
          },
          {
            question: "When is theta decay fastest for an at-the-money option?",
            options: ["60-90 days to expiration", "30-45 days to expiration", "In the final 7 days to expiration", "Theta decay is constant"],
            correct_answer: 2,
            explanation: "Theta accelerates dramatically in the final week before expiration, especially for ATM options."
          },
          {
            question: "Which options have the highest vega?",
            options: ["Short-dated ATM options", "Long-dated ATM options", "Short-dated OTM options", "Deep ITM options of any duration"],
            correct_answer: 1,
            explanation: "Vega is highest for longer-dated options and ATM strikes because they have the most time value sensitive to IV changes."
          },
          {
            question: "What is the primary purpose of beta-weighting your portfolio Greeks?",
            options: ["To reduce commissions", "To compare exposure across different stocks on a common basis", "To increase returns", "To avoid regulations"],
            correct_answer: 1,
            explanation: "Beta-weighting converts all positions to a common benchmark equivalent, allowing accurate comparison of total directional exposure."
          },
          {
            question: "If you want to collect theta income (positive theta), what must you accept?",
            options: ["Positive gamma", "Negative gamma (short options exposure)", "Higher commissions", "Longer holding periods"],
            correct_answer: 1,
            explanation: "Positive theta comes from being short options, which inherently means negative gamma—you're paid to take the risk of adverse moves."
          },
          {
            question: "What happens to vega as an option approaches expiration?",
            options: ["Vega increases", "Vega decreases", "Vega stays the same", "Vega becomes negative"],
            correct_answer: 1,
            explanation: "Vega decreases as expiration approaches because there's less time for IV changes to impact the option's value."
          },
          {
            question: "You're long an ATM straddle. What is your gamma and theta exposure?",
            options: ["Positive gamma, positive theta", "Negative gamma, positive theta", "Positive gamma, negative theta", "Negative gamma, negative theta"],
            correct_answer: 2,
            explanation: "Long straddles are long options (both calls and puts), so you have positive gamma (benefit from moves) but negative theta (pay time decay)."
          },
          {
            question: "What is 'pin risk' related to gamma near expiration?",
            options: ["The risk of your broker closing positions", "Extreme gamma at ATM strikes causing unpredictable assignment", "The risk of losing your PIN number", "High commissions on expiration day"],
            correct_answer: 1,
            explanation: "Pin risk refers to the extreme gamma of ATM options near expiration, where small price moves cause large delta swings and uncertain assignment outcomes."
          },
          {
            question: "An iron condor has what typical Greek profile?",
            options: ["Positive delta, positive gamma", "Negative theta, positive vega", "Positive theta, negative gamma, negative vega", "Neutral on all Greeks"],
            correct_answer: 2,
            explanation: "Iron condors collect premium (positive theta) by being short options (negative gamma and vega). They profit if the stock stays in a range and IV stays low."
          }
        ]
      }
    ]
  },
  {
    title: "Module 4: Institutional Technical Analysis",
    description: "Apply technical analysis the way professionals do with VWAP, liquidity zones, and volume profile.",
    order_index: 3,
    lessons: [
      { title: "Market Structure & Trend Hierarchy", description: "Identify higher timeframe structure and trend classification.", duration: "30 min", order_index: 0, content_markdown: "# Market Structure & Trend Hierarchy\n\n## Learning Objectives\nBy the end of this lesson, you will:\n- Understand multi-timeframe market structure\n- Classify trends using swing highs and lows\n- Recognize trend changes early\n- Apply structure analysis to options timing\n\n## What is Market Structure?\n\nMarket structure refers to the pattern of higher highs, higher lows, lower highs, and lower lows that define trends.\n\n### Uptrend Structure\n```\n         HH (Higher High)\n        / \\\n       /   \\\n      /     \\HL (Higher Low)\n     /       \\\n    /         \\HH\n   /           \\\n  HL            \\HL\n```\n\n### Downtrend Structure\n```\nLH (Lower High)\n  \\\n   \\\n    \\LH\n     \\\n      \\\n       \\LL (Lower Low)\n        \\\n         \\LH\n          \\\n           \\LL\n```\n\n## Trend Classification\n\n| Pattern | Classification | Bias |\n|---------|---------------|------|\n| HH + HL | Uptrend | Bullish |\n| LH + LL | Downtrend | Bearish |\n| Mixed | Range/Chop | Neutral |\n\n## Key Takeaways\n1. Structure defines trend through swing points\n2. Higher timeframes take precedence\n3. Trend changes are confirmed by structure breaks\n4. Use structure for options direction and timing", quiz_questions: [{ question: "What defines an uptrend in market structure?", options: ["Lower highs and lower lows", "Higher highs and higher lows", "Equal highs and lows", "Random price movement"], correct_answer: 1, explanation: "An uptrend is defined by a series of higher highs and higher lows." }] },
      { title: "Multi-Timeframe Alignment", description: "Implement top-down analysis for optimal options timing.", duration: "30 min", order_index: 1, content_markdown: "# Multi-Timeframe Alignment\n\n## Learning Objectives\n- Implement top-down analysis\n- Align multiple timeframes for higher probability trades\n- Time entries using lower timeframes\n\n## The Timeframe Hierarchy\n\n| Timeframe | Purpose | Options Use |\n|-----------|---------|-------------|\n| Monthly | Major trend | LEAPS direction |\n| Weekly | Intermediate trend | 30-60 DTE bias |\n| Daily | Active trend | Entry timing |\n| 4H/1H | Entry signals | Fine-tune entries |\n\n## Alignment Rules\n\n**High Probability Long:**\n- Monthly: Uptrend\n- Weekly: Uptrend or pullback in uptrend\n- Daily: Reversal pattern or continuation\n\n**High Probability Short:**\n- Monthly: Downtrend\n- Weekly: Downtrend or rally in downtrend\n- Daily: Bearish reversal or continuation\n\n## Key Takeaways\n1. Higher timeframes filter trade direction\n2. Lower timeframes time entry\n3. Conflicting signals = reduce size or pass\n4. Alignment improves win rate significantly", quiz_questions: [{ question: "In multi-timeframe analysis, which timeframe determines overall trade direction?", options: ["1-hour chart", "Daily chart", "Higher timeframes (weekly/monthly)", "Lower timeframes are most important"], correct_answer: 2, explanation: "Higher timeframes (weekly/monthly) establish the overall trend direction; lower timeframes are used for timing entries." }] },
      { title: "VWAP: Daily, Weekly & Anchored", description: "Master institutional use of VWAP for entry and exit timing.", duration: "35 min", order_index: 2, content_markdown: "# VWAP: Daily, Weekly & Anchored\n\n## Learning Objectives\n- Calculate and interpret VWAP\n- Use daily and weekly VWAP levels\n- Apply anchored VWAP for swing trading\n\n## What is VWAP?\n\nVolume-Weighted Average Price = Average price weighted by volume throughout a period.\n\n```\nVWAP = Σ (Price × Volume) / Σ Volume\n```\n\n## VWAP Types\n\n| Type | Reset | Use |\n|------|-------|-----|\n| Daily | Each day | Intraday mean |\n| Weekly | Each week | Swing trading |\n| Anchored | Custom point | Event-based |\n\n## Trading Rules\n\n**Long Bias:**\n- Price > VWAP = Buyers in control\n- Pullbacks to VWAP = Entry opportunities\n\n**Short Bias:**\n- Price < VWAP = Sellers in control\n- Rallies to VWAP = Short entries\n\n## Key Takeaways\n1. VWAP is the institutional benchmark\n2. Price vs VWAP shows control\n3. VWAP standard deviations act as support/resistance\n4. Anchor to significant events for swing levels", quiz_questions: [{ question: "What does it typically indicate when price is trading above VWAP?", options: ["Sellers are in control", "Buyers are in control", "The market is closed", "Volatility is low"], correct_answer: 1, explanation: "Price above VWAP indicates buyers are willing to pay above the average weighted price, showing bullish control." }] },
      { title: "Liquidity Zones & Stop Runs", description: "Identify liquidity pools and avoid common stop hunting patterns.", duration: "30 min", order_index: 3, content_markdown: "# Liquidity Zones & Stop Runs\n\n## Learning Objectives\n- Identify where liquidity pools form\n- Recognize stop run patterns\n- Avoid being the liquidity target\n\n## Where Liquidity Accumulates\n\n**Common Liquidity Zones:**\n- Below swing lows (stop losses for longs)\n- Above swing highs (stop losses for shorts)\n- Round numbers ($100, $50, etc.)\n- Previous day/week highs and lows\n\n## Stop Run Mechanics\n\n```\n1. Price approaches liquidity zone\n2. Stops triggered, creating supply/demand\n3. Large players fill orders\n4. Price reverses sharply\n```\n\n## Protecting Yourself\n\n1. **Wide stops** - Beyond obvious levels\n2. **Scaling in** - Don't commit full size at once\n3. **Options advantage** - Defined risk without stop loss\n\n## Key Takeaways\n1. Liquidity clusters at obvious levels\n2. Smart money hunts these levels\n3. Options provide natural protection\n4. Place stops beyond obvious zones", quiz_questions: [{ question: "Where do liquidity pools typically form?", options: ["Random price levels", "Below swing lows and above swing highs", "Only at round numbers", "During after-hours trading"], correct_answer: 1, explanation: "Liquidity accumulates where traders place stop losses—below swing lows for longs and above swing highs for shorts." }] },
      { title: "Volume Profile for Options Traders", description: "Use POC, value areas, and high-volume nodes for options trading.", duration: "30 min", order_index: 4, content_markdown: "# Volume Profile for Options Traders\n\n## Learning Objectives\n- Understand volume profile structure\n- Identify Point of Control (POC)\n- Use value areas for strike selection\n\n## Volume Profile Components\n\n| Component | Definition | Trading Use |\n|-----------|------------|-------------|\n| POC | Price with most volume | Fair value, magnet |\n| Value Area | 70% of volume | High probability zone |\n| HVN | High Volume Node | Support/resistance |\n| LVN | Low Volume Node | Price moves quickly through |\n\n## Strike Selection Using Volume Profile\n\n**For Credit Spreads:**\n- Sell strikes outside value area\n- Use LVN levels as boundaries\n\n**For Directional Trades:**\n- Target POC as profit level\n- Breakout above/below value area for trend trades\n\n## Key Takeaways\n1. POC shows where most trading occurred\n2. Value area bounds 70% of activity\n3. LVN = fast moves, HVN = sticky prices\n4. Use profile for strike and target selection", quiz_questions: [{ question: "What is the Point of Control (POC) in a volume profile?", options: ["The lowest price traded", "The price level with the highest volume", "The opening price", "The closing price"], correct_answer: 1, explanation: "POC is the price level where the most volume was transacted, often acting as a fair value level or magnet for price." }] },
      { title: "Combining TA with Options Strategy Selection", description: "Match options strategies to technical setups for higher probability trades.", duration: "25 min", order_index: 5, content_markdown: "# Combining TA with Options Strategy Selection\n\n## Learning Objectives\n- Match strategy to technical context\n- Time entries using TA signals\n- Improve win rate through alignment\n\n## Strategy-Setup Matrix\n\n| Technical Setup | Recommended Strategy |\n|-----------------|---------------------|\n| Strong uptrend pullback | Debit call spreads, bull puts |\n| Range-bound | Iron condors, strangles |\n| Breakout above resistance | Long calls, call debit spreads |\n| Breakdown below support | Long puts, put debit spreads |\n| Compression/squeeze | Long straddles (pre-move) |\n\n## Entry Timing Signals\n\n1. **Trend trades** - Enter on pullback to moving average\n2. **Range trades** - Enter at range boundaries\n3. **Breakout trades** - Enter on confirmed break with volume\n\n## Key Takeaways\n1. Let technicals guide strategy selection\n2. Trend = directional spreads\n3. Range = neutral premium selling\n4. Breakout = long premium or directional", quiz_questions: [{ question: "What options strategy is most appropriate for a range-bound market?", options: ["Long straddles", "Long calls", "Iron condors or short strangles", "Deep ITM calls"], correct_answer: 2, explanation: "Range-bound markets favor neutral strategies like iron condors that profit from the stock staying within a range." }] },
      { title: "Module 4 Assessment", description: "Comprehensive quiz covering institutional technical analysis.", duration: "15 min", order_index: 6, content_markdown: "# Module 4 Assessment\n\n## Assessment Overview\n\nThis assessment covers:\n- Market structure & trends\n- Multi-timeframe analysis\n- VWAP usage\n- Liquidity zones\n- Volume profile\n- TA-options integration\n\n**Passing Score:** 70%", quiz_questions: [{ question: "What timeframe should determine your overall trade direction?", options: ["1-minute chart", "15-minute chart", "Higher timeframes (weekly/monthly)", "Lower timeframes are most important"], correct_answer: 2, explanation: "Higher timeframes establish the overall trend; lower timeframes time entries." }, { question: "Price trading above daily VWAP suggests:", options: ["Bearish control", "Bullish control", "Market is closed", "No significance"], correct_answer: 1, explanation: "Price above VWAP indicates buyers are paying above average price, showing bullish sentiment." }] }
    ]
  },
  {
    title: "Module 5: Advanced Stock & Options Screeners",
    description: "Create repeatable, high-quality trade pipelines through systematic screening.",
    order_index: 4,
    lessons: [
      { title: "Screening Philosophy & Workflow Design", description: "Build systematic discovery processes for options opportunities.", duration: "25 min", order_index: 0, content_markdown: "# Screening Philosophy & Workflow Design\n\n## Learning Objectives\n- Develop a systematic screening approach\n- Build efficient workflow pipelines\n- Avoid common screening mistakes\n\n## Why Screen?\n\n1. **Consistency** - Same process each day\n2. **Efficiency** - Focus on best opportunities\n3. **Objectivity** - Remove emotional stock picking\n\n## Workflow Design\n\n```\nUniverse → Liquidity Filter → Volatility Filter → Technical Filter → Final Review\n```\n\n## Key Takeaways\n1. Systematic screening beats random selection\n2. Start broad, filter narrow\n3. Document and iterate your process", quiz_questions: [{ question: "What is the main benefit of systematic screening?", options: ["Higher commissions", "Consistent, objective trade selection", "More trades per day", "Avoiding all losses"], correct_answer: 1, explanation: "Systematic screening provides consistent, objective selection vs emotional picking." }] },
      { title: "High-Probability Options Setup Screens", description: "Define criteria for identifying quality options setups.", duration: "30 min", order_index: 1, content_markdown: "# High-Probability Options Setup Screens\n\n## Learning Objectives\n- Define quality setup criteria\n- Build screener for premium selling\n- Build screener for premium buying\n\n## Premium Selling Criteria\n\n| Factor | Ideal Level |\n|--------|-------------|\n| IV Rank | > 50% |\n| Liquidity | Spread < 5% |\n| Trend | Defined range or clear trend |\n| Open Interest | > 1,000 contracts |\n\n## Premium Buying Criteria\n\n| Factor | Ideal Level |\n|--------|-------------|\n| IV Rank | < 30% |\n| Catalyst | Upcoming event |\n| Trend | Clear direction |\n| Support/Resistance | Near level |\n\n## Key Takeaways\n1. Different strategies need different filters\n2. Liquidity is non-negotiable\n3. IV context determines strategy type", quiz_questions: [{ question: "For premium selling, what IV Rank level is typically ideal?", options: ["Below 20%", "Above 50%", "Exactly 50%", "IV Rank doesn't matter"], correct_answer: 1, explanation: "Premium selling works best when IV is elevated (IV Rank > 50%) because options are expensive and likely to mean revert." }] },
      { title: "LEAPS Candidate Screening", description: "Find ideal long-term options investment opportunities.", duration: "30 min", order_index: 2, content_markdown: "# LEAPS Candidate Screening\n\n## Learning Objectives\n- Identify quality LEAPS candidates\n- Balance fundamentals with technicals\n- Screen for capital efficiency\n\n## LEAPS Screening Criteria\n\n| Factor | Requirement |\n|--------|-------------|\n| Company Quality | Strong balance sheet |\n| Trend | Long-term uptrend |\n| Volatility | Reasonable IV (not excessive) |\n| Options Liquidity | Active LEAPS market |\n\n## Key Takeaways\n1. LEAPS require quality underlying companies\n2. Technical trend matters for direction\n3. Avoid overpaying for IV in long-dated options", quiz_questions: [{ question: "Why is company quality important for LEAPS investing?", options: ["LEAPS expire in 2 weeks", "You're exposed for 1-2 years, need stable underlying", "Company quality doesn't matter", "LEAPS are only for day trading"], correct_answer: 1, explanation: "LEAPS hold exposure for 1-2 years, so underlying company stability is crucial." }] },
      { title: "Earnings Volatility Screeners", description: "Identify pre-earnings IV expansion opportunities.", duration: "25 min", order_index: 3, content_markdown: "# Earnings Volatility Screeners\n\n## Learning Objectives\n- Screen for earnings volatility opportunities\n- Identify IV expansion candidates\n- Avoid earnings traps\n\n## Pre-Earnings Screen\n\n| Factor | Criteria |\n|--------|----------|\n| Earnings Date | 1-14 days out |\n| IV Build | IV < historical pre-earnings IV |\n| Historical Move | Expected move vs actual history |\n\n## Key Takeaways\n1. IV typically builds before earnings\n2. Compare current IV to pre-earnings historical IV\n3. Exit before earnings if buying IV expansion", quiz_questions: [{ question: "When screening for pre-earnings IV expansion, what should you look for?", options: ["Earnings already passed", "Current IV lower than typical pre-earnings IV", "Only high IV stocks", "Penny stocks"], correct_answer: 1, explanation: "You want to buy before IV expands, so look for current IV below typical pre-earnings levels." }] },
      { title: "Trend + Volatility Alignment Filters", description: "Combine multiple factors for high-conviction setups.", duration: "30 min", order_index: 4, content_markdown: "# Trend + Volatility Alignment Filters\n\n## Learning Objectives\n- Combine trend and volatility factors\n- Build multi-factor screens\n- Increase trade conviction through alignment\n\n## Alignment Matrix\n\n| Trend | IV Rank | Strategy |\n|-------|---------|----------|\n| Bullish | High | Sell puts, bull put spreads |\n| Bullish | Low | Buy calls, call debit spreads |\n| Bearish | High | Sell calls, bear call spreads |\n| Bearish | Low | Buy puts, put debit spreads |\n| Neutral | High | Iron condors, strangles |\n\n## Key Takeaways\n1. Alignment of factors increases probability\n2. Trend + IV context guides strategy\n3. Conflicting signals = reduce size or pass", quiz_questions: [{ question: "If trend is bullish and IV Rank is high, what strategy is favored?", options: ["Buy calls", "Sell puts or bull put spreads", "Buy straddles", "Short stock"], correct_answer: 1, explanation: "Bullish trend + high IV = sell puts to collect premium while being directionally bullish." }] },
      { title: "Building Custom Screeners", description: "Use platform-specific tools to create your own screens.", duration: "25 min", order_index: 5, content_markdown: "# Building Custom Screeners\n\n## Learning Objectives\n- Use platform screening tools\n- Build reusable screener templates\n- Iterate and improve over time\n\n## Common Platform Features\n\n| Platform | Screening Capability |\n|----------|---------------------|\n| ThinkorSwim | Powerful stock and options scans |\n| Tastyworks | IV Rank built-in |\n| Barchart | Options screener |\n| FinViz | Stock screening + options data |\n\n## Building Process\n\n1. Define your criteria\n2. Build in platform\n3. Backtest results\n4. Refine filters\n5. Save and reuse\n\n## Key Takeaways\n1. Most platforms have screening tools\n2. Save and reuse successful screeners\n3. Iterate based on results", quiz_questions: [{ question: "Why should you save and reuse successful screeners?", options: ["To impress friends", "Consistency and efficiency in daily workflow", "Screeners are expensive", "One screener works forever without changes"], correct_answer: 1, explanation: "Saved screeners provide consistent, efficient daily workflow without rebuilding from scratch." }] },
      { title: "Module 5 Assessment", description: "Comprehensive quiz on advanced screening concepts.", duration: "15 min", order_index: 6, content_markdown: "# Module 5 Assessment\n\n## Assessment Overview\n\nThis assessment covers:\n- Screening philosophy\n- Setup criteria\n- LEAPS and earnings screens\n- Multi-factor alignment\n\n**Passing Score:** 70%", quiz_questions: [{ question: "What IV Rank level favors premium selling?", options: ["Below 25%", "Above 50%", "Exactly 35%", "IV Rank is irrelevant"], correct_answer: 1, explanation: "High IV Rank (above 50%) indicates expensive options, favoring premium selling strategies." }] }
    ]
  }
];

// Continue modules 6-14 with lesson structure
const additionalModules = [
  {
    title: "Module 6: Financial & Fundamental Analysis",
    description: "Use fundamentals selectively and effectively for options trading decisions.",
    order_index: 5,
    lessons: [
      { title: "Earnings Analysis Beyond EPS", description: "Analyze revenue quality, guidance, and whisper numbers for better event trading.", duration: "30 min", order_index: 0, content_markdown: "# Earnings Analysis Beyond EPS\n\n## Learning Objectives\n- Analyze earnings reports comprehensively\n- Understand revenue quality vs EPS focus\n- Interpret guidance and whisper numbers\n\n## Beyond the Headline Number\n\n| Factor | Why It Matters |\n|--------|----------------|\n| Revenue | Top-line growth shows demand |\n| Margins | Profitability sustainability |\n| Guidance | Forward-looking expectations |\n| Whisper | What smart money expects |\n\n## Key Takeaways\n1. EPS beats alone don't determine stock reaction\n2. Guidance often matters more than current results\n3. Whisper numbers reflect true expectations", quiz_questions: [{ question: "Why might a stock drop after 'beating' EPS estimates?", options: ["The market is broken", "Guidance was weak or other metrics disappointed", "EPS doesn't matter", "It will always recover the next day"], correct_answer: 1, explanation: "Stocks often drop on EPS beats if guidance is weak or other metrics (revenue, margins) disappoint." }] },
      { title: "Balance Sheet Strength for Long-Dated Trades", description: "Evaluate debt ratios and cash position for LEAPS suitability.", duration: "30 min", order_index: 1, content_markdown: "# Balance Sheet Strength for Long-Dated Trades\n\n## Learning Objectives\n- Assess balance sheet health\n- Identify LEAPS-suitable companies\n- Avoid bankruptcy risk in long-dated positions\n\n## Key Metrics\n\n| Metric | Healthy Level |\n|--------|---------------|\n| Debt/Equity | < 2.0 |\n| Current Ratio | > 1.5 |\n| Interest Coverage | > 3.0 |\n| Cash on Hand | 6+ months runway |\n\n## Key Takeaways\n1. Strong balance sheets survive volatility\n2. Avoid heavily indebted companies for LEAPS\n3. Cash position matters for 1-2 year holds", quiz_questions: [{ question: "Why is balance sheet analysis important for LEAPS trading?", options: ["LEAPS expire in one week", "LEAPS have 1-2 year exposure, need stable underlying", "Balance sheets don't matter for options", "Only for dividend stocks"], correct_answer: 1, explanation: "LEAPS positions last 1-2 years, so underlying company stability (balance sheet health) is critical." }] },
      { title: "Sector Rotation & Macro Sensitivity", description: "Understand economic cycles and sector-based options plays.", duration: "25 min", order_index: 2, content_markdown: "# Sector Rotation & Macro Sensitivity\n\n## Learning Objectives\n- Understand sector rotation patterns\n- Identify macro-sensitive sectors\n- Position options for economic cycles\n\n## Economic Cycle Sectors\n\n| Cycle Phase | Strong Sectors | Weak Sectors |\n|-------------|---------------|---------------|\n| Expansion | Tech, Consumer Disc | Utilities, Staples |\n| Peak | Energy, Materials | Tech, Growth |\n| Recession | Staples, Healthcare | Consumer Disc |\n| Recovery | Financials, Industrials | Utilities |\n\n## Key Takeaways\n1. Sectors rotate with economic cycles\n2. Interest rates affect sector performance\n3. Align options positions with cycle expectations", quiz_questions: [{ question: "Which sectors typically outperform during recessions?", options: ["Technology and growth stocks", "Consumer staples and healthcare (defensive)", "Energy and materials", "Financials"], correct_answer: 1, explanation: "Defensive sectors like consumer staples and healthcare outperform during recessions due to stable demand." }] },
      { title: "When Fundamentals Matter (and When They Don't)", description: "Know when to weight fundamentals based on your time horizon.", duration: "25 min", order_index: 3, content_markdown: "# When Fundamentals Matter (and When They Don't)\n\n## Learning Objectives\n- Align fundamental analysis with time horizon\n- Know when technicals dominate\n- Balance both approaches\n\n## Time Horizon Matrix\n\n| Time Horizon | Fundamentals | Technicals |\n|--------------|--------------|------------|\n| 0-7 days | Low importance | High importance |\n| 7-30 days | Moderate | Moderate |\n| 30-90 days | High | Moderate |\n| 90+ days (LEAPS) | Critical | Entry timing only |\n\n## Key Takeaways\n1. Short-term = technicals dominate\n2. Long-term = fundamentals matter most\n3. Both have a role in comprehensive analysis", quiz_questions: [{ question: "For a 3-day options trade, which analysis is most important?", options: ["Fundamental analysis", "Technical analysis and short-term price action", "Neither matters", "Only earnings history"], correct_answer: 1, explanation: "Very short-term trades are driven by technicals and price action rather than fundamentals." }] },
      { title: "Integrating Fundamentals with Options Timing", description: "Combine fundamental analysis with options strategy selection.", duration: "25 min", order_index: 4, content_markdown: "# Integrating Fundamentals with Options Timing\n\n## Learning Objectives\n- Combine F/A with options strategy\n- Time entries using both disciplines\n- Avoid fundamental-only mistakes\n\n## Integration Framework\n\n1. **Fundamental Screen** - Quality companies, growth, value\n2. **Technical Timing** - Entry and exit levels\n3. **Volatility Context** - IV rank for strategy selection\n4. **Position Sizing** - Based on conviction\n\n## Key Takeaways\n1. Fundamentals = what to trade\n2. Technicals = when to trade\n3. Volatility = how to trade (strategy)\n4. All three work together", quiz_questions: [{ question: "In the integration framework, what does technical analysis primarily determine?", options: ["What to trade", "When to enter and exit", "Which broker to use", "Account size"], correct_answer: 1, explanation: "Technicals determine timing (when), while fundamentals determine the underlying (what)." }] },
      { title: "Module 6 Assessment", description: "Comprehensive quiz on fundamental analysis for options.", duration: "15 min", order_index: 5, content_markdown: "# Module 6 Assessment\n\n**Passing Score:** 70%\n\nThis assessment covers earnings analysis, balance sheet evaluation, sector rotation, and integrating fundamentals with options trading.", quiz_questions: [{ question: "For LEAPS trades, balance sheet analysis is:", options: ["Irrelevant", "Critical due to 1-2 year exposure", "Only for day traders", "Optional"], correct_answer: 1, explanation: "LEAPS have long exposure periods, making balance sheet stability essential." }] }
    ]
  },
  {
    title: "Module 7: LEAPS & Synthetic Stock Strategies",
    description: "Use options as capital-efficient investment tools with deep ITM LEAPS and PMCC.",
    order_index: 6,
    lessons: [
      { title: "Deep ITM LEAPS vs Stock Ownership", description: "Compare capital efficiency and risk between LEAPS and stock.", duration: "30 min", order_index: 0, content_markdown: "# Deep ITM LEAPS vs Stock Ownership\n\n## Learning Objectives\n- Compare LEAPS to stock ownership\n- Calculate capital efficiency\n- Understand trade-offs\n\n## Capital Efficiency Example\n\n| Investment | Cost | Exposure | Capital Efficiency |\n|------------|------|----------|--------------------|\n| 100 shares @ $150 | $15,000 | $15,000 | 1:1 |\n| 1 LEAPS (80 delta) @ $35 | $3,500 | ~$12,000 | 3.4:1 |\n\n## Key Trade-offs\n\n| Factor | Stock | LEAPS |\n|--------|-------|-------|\n| Capital Required | Full | ~20-30% |\n| Dividends | Yes | No |\n| Time Decay | None | Theta costs |\n| Leverage | 1:1 | 3-5:1 |\n\n## Key Takeaways\n1. LEAPS offer leveraged exposure with less capital\n2. No dividends and time decay are costs\n3. Use high delta (0.70-0.85) to minimize time value", quiz_questions: [{ question: "What is the main advantage of deep ITM LEAPS vs owning stock?", options: ["You receive dividends", "Capital efficiency - control more with less capital", "No risk of loss", "Guaranteed profits"], correct_answer: 1, explanation: "LEAPS allow you to control similar exposure with 20-30% of the capital required for stock." }] },
      { title: "Selecting Optimal LEAPS Strikes & Expiration", description: "Choose delta targets and time value considerations for LEAPS.", duration: "25 min", order_index: 1, content_markdown: "# Selecting Optimal LEAPS Strikes & Expiration\n\n## Learning Objectives\n- Select appropriate delta for LEAPS\n- Balance expiration choice\n- Minimize time value costs\n\n## Delta Selection\n\n| Delta | Behavior | Time Value |\n|-------|----------|------------|\n| 0.60 | Moderate leverage | Higher |\n| 0.70 | Good balance | Moderate |\n| 0.80 | Stock-like | Lower |\n| 0.85+ | Very stock-like | Minimal |\n\n## Expiration Selection\n\n| Expiration | Pros | Cons |\n|------------|------|------|\n| 12 months | Lower cost | More rolls needed |\n| 18 months | Good balance | Moderate cost |\n| 24 months | Minimal rolls | Highest cost |\n\n## Key Takeaways\n1. Target 0.70-0.80 delta for LEAPS investing\n2. 18-24 month expirations reduce roll frequency\n3. Higher delta = lower time value risk", quiz_questions: [{ question: "What delta range is typically recommended for LEAPS used as stock replacement?", options: ["0.20-0.30", "0.50", "0.70-0.80", "0.90-1.00"], correct_answer: 2, explanation: "0.70-0.80 delta offers good stock-like behavior while balancing time value costs." }] },
      { title: "Poor Man's Covered Calls (PMCC)", description: "Set up, manage, and profit from diagonal call strategies.", duration: "35 min", order_index: 2, content_markdown: "# Poor Man's Covered Calls (PMCC)\n\n## Learning Objectives\n- Understand PMCC structure\n- Set up and manage the strategy\n- Define profit targets and adjustments\n\n## PMCC Structure\n\n```\nBuy: Deep ITM LEAPS call (12-24 months, 0.70+ delta)\nSell: Short-term OTM call (30-45 DTE)\n```\n\n## Example\n\n| Leg | Details |\n|-----|--------|\n| Long | Jan 2025 $130 call @ $28 (delta 0.75) |\n| Short | Mar 2024 $155 call @ $3 (delta 0.25) |\n\n## Management Rules\n\n1. Roll short call at 50% profit\n2. If tested, roll up and out\n3. Target monthly income of 2-5% of LEAPS cost\n\n## Key Takeaways\n1. PMCC is a capital-efficient covered call\n2. Income from short calls reduces LEAPS cost\n3. Manage short call actively", quiz_questions: [{ question: "What is the long leg of a Poor Man's Covered Call?", options: ["Short-term OTM call", "Deep ITM LEAPS call", "ATM put", "Short shares of stock"], correct_answer: 1, explanation: "PMCC uses a deep ITM LEAPS call as the 'stock replacement' and sells short-term calls against it." }] },
      { title: "Rolling LEAPS Over Time", description: "When and how to roll LEAPS positions efficiently.", duration: "30 min", order_index: 3, content_markdown: "# Rolling LEAPS Over Time\n\n## Learning Objectives\n- Know when to roll LEAPS\n- Execute efficient rolls\n- Minimize costs and slippage\n\n## When to Roll\n\n| Trigger | Action |\n|---------|--------|\n| 3-6 months to expiration | Consider rolling |\n| Delta drops below 0.60 | Roll or adjust |\n| Significant profit | Consider taking some |\n\n## Rolling Mechanics\n\n1. Sell current LEAPS\n2. Buy new LEAPS (further expiration)\n3. Often same or slightly higher strike\n\n## Cost Analysis\n\n```\nRoll Cost = New LEAPS price - Current LEAPS price + Slippage\n```\n\n## Key Takeaways\n1. Roll before heavy time decay accelerates\n2. 3-6 months remaining is typical roll timing\n3. Track total roll costs in your analysis", quiz_questions: [{ question: "When should you typically consider rolling a LEAPS position?", options: ["Immediately after purchase", "With 3-6 months remaining before expiration", "Only at expiration", "Never roll LEAPS"], correct_answer: 1, explanation: "Rolling with 3-6 months remaining avoids the accelerated time decay phase." }] },
      { title: "Risk Management During Volatility Expansion", description: "Protect LEAPS positions during market stress.", duration: "25 min", order_index: 4, content_markdown: "# Risk Management During Volatility Expansion\n\n## Learning Objectives\n- Protect LEAPS during volatility spikes\n- Adjust positions in market stress\n- Maintain conviction with reduced risk\n\n## LEAPS During Vol Expansion\n\n| Scenario | LEAPS Behavior |\n|----------|----------------|\n| Stock drops, IV spikes | Value may hold due to vega |\n| Stock drops, IV stable | Delta loss dominates |\n| Stock stable, IV spikes | LEAPS gains value |\n\n## Protection Strategies\n\n1. **Protective puts** - Buy short-term puts\n2. **Reduce size** - Partial profit-taking\n3. **VIX calls** - Portfolio-level hedge\n\n## Key Takeaways\n1. LEAPS have positive vega (benefit from IV rise)\n2. But delta losses can exceed vega gains\n3. Consider hedges during elevated risk periods", quiz_questions: [{ question: "How does a LEAPS position's positive vega help during market stress?", options: ["It guarantees profits", "Rising IV can offset some delta losses", "Vega makes LEAPS worthless", "No benefit"], correct_answer: 1, explanation: "Positive vega means the LEAPS gains value from IV increases, partially offsetting price declines." }] },
      { title: "Synthetic Stock Positions", description: "Create stock-like exposure using options combinations.", duration: "25 min", order_index: 5, content_markdown: "# Synthetic Stock Positions\n\n## Learning Objectives\n- Construct synthetic long/short stock\n- Understand use cases\n- Compare to actual stock ownership\n\n## Synthetic Long Stock\n\n```\nBuy ATM Call + Sell ATM Put (same strike, same expiration)\n= Synthetic Long Stock\n```\n\n## Synthetic Short Stock\n\n```\nSell ATM Call + Buy ATM Put (same strike, same expiration)\n= Synthetic Short Stock\n```\n\n## Why Use Synthetics?\n\n| Advantage | Explanation |\n|-----------|-------------|\n| Capital efficiency | Often less margin |\n| Hard-to-borrow | Can short via synthetic |\n| Leverage | Without borrowing stock |\n\n## Key Takeaways\n1. Synthetics replicate stock P/L profile\n2. Useful for capital efficiency and access\n3. No dividends and have expiration", quiz_questions: [{ question: "What options combination creates synthetic long stock?", options: ["Buy call + buy put", "Sell call + sell put", "Buy call + sell put at same strike", "Buy put only"], correct_answer: 2, explanation: "Buying a call and selling a put at the same strike and expiration creates a synthetic long stock position." }] },
      { title: "Module 7 Assessment", description: "Comprehensive quiz on LEAPS and synthetic strategies.", duration: "15 min", order_index: 6, content_markdown: "# Module 7 Assessment\n\n**Passing Score:** 70%\n\nThis assessment covers LEAPS investing, PMCC, rolling strategies, and synthetic positions.", quiz_questions: [{ question: "What delta is typically targeted for LEAPS stock replacement?", options: ["0.20-0.30", "0.50", "0.70-0.80", "1.00"], correct_answer: 2, explanation: "0.70-0.80 delta provides stock-like behavior with reasonable time value costs." }] }
    ]
  },
  {
    title: "Module 8: Advanced Credit Strategies",
    description: "Generate income with controlled downside risk using iron condors, butterflies, and adjustments.",
    order_index: 7,
    lessons: [
      { title: "Credit Spreads with Volatility Filters", description: "Know when to sell premium and how to select strikes based on IV.", duration: "30 min", order_index: 0, content_markdown: "# Credit Spreads with Volatility Filters\n\n## Learning Objectives\n- Filter opportunities by IV conditions\n- Select optimal strikes for credit spreads\n- Size positions appropriately\n\n## IV Filters for Premium Selling\n\n| IV Rank | Recommendation |\n|---------|----------------|\n| > 70% | Aggressive credit spreads |\n| 50-70% | Standard credit spreads |\n| 30-50% | Selective, smaller size |\n| < 30% | Avoid selling premium |\n\n## Strike Selection\n\n| Approach | Short Strike Delta | Win Rate |\n|----------|-------------------|----------|\n| Conservative | 0.15-0.20 | ~80-85% |\n| Standard | 0.25-0.30 | ~70-75% |\n| Aggressive | 0.35-0.40 | ~60-65% |\n\n## Key Takeaways\n1. High IV Rank = better premium selling opportunities\n2. Select strikes based on probability and risk tolerance\n3. Size positions based on max loss", quiz_questions: [{ question: "At what IV Rank level is aggressive credit spread selling typically recommended?", options: ["Below 30%", "30-50%", "Above 70%", "IV Rank doesn't matter"], correct_answer: 2, explanation: "IV Rank above 70% indicates expensive options, making aggressive premium selling attractive." }] },
      { title: "Iron Condors: Structure & Management", description: "Set up, manage, and adjust iron condors for consistent income.", duration: "35 min", order_index: 1, content_markdown: "# Iron Condors: Structure & Management\n\n## Learning Objectives\n- Construct iron condors\n- Define profit targets and adjustment triggers\n- Manage throughout the trade\n\n## Iron Condor Structure\n\n```\nSell OTM Put + Buy further OTM Put\n+\nSell OTM Call + Buy further OTM Call\n```\n\n## Example (Stock @ $100)\n\n| Leg | Strike | Credit/Debit |\n|-----|--------|-------------|\n| Buy Put | $85 | Debit |\n| Sell Put | $90 | Credit |\n| Sell Call | $110 | Credit |\n| Buy Call | $115 | Debit |\n\n## Management Rules\n\n| Profit Target | Action |\n|---------------|--------|\n| 50% of max profit | Close or manage |\n| 75% of max profit | Close for consistency |\n| 21 DTE | Close if profitable |\n\n## Adjustment Triggers\n\n| Trigger | Action |\n|---------|--------|\n| Short strike breached | Roll untested side in |\n| Max loss approach | Cut loss at 200% of credit |\n\n## Key Takeaways\n1. Iron condors profit from range-bound markets\n2. Take profits at 50% of max profit\n3. Have predefined adjustment rules", quiz_questions: [{ question: "What is the typical profit target for managing an iron condor?", options: ["100% of max profit (hold to expiration)", "50% of max profit", "25% of max profit", "No profit target needed"], correct_answer: 1, explanation: "Taking profits at 50% of max profit allows you to redeploy capital and avoid late-trade risk." }] },
      { title: "Iron Butterflies: High-Probability Income", description: "Use iron butterflies for pinning strategies near expiration.", duration: "30 min", order_index: 2, content_markdown: "# Iron Butterflies: High-Probability Income\n\n## Learning Objectives\n- Construct iron butterflies\n- Understand pinning strategies\n- Manage expiration risk\n\n## Iron Butterfly Structure\n\n```\nSell ATM Put + Sell ATM Call (same strike)\n+\nBuy OTM Put + Buy OTM Call (wings)\n```\n\n## When to Use\n\n| Scenario | Iron Butterfly Suitability |\n|----------|----------------------------|\n| High IV | Excellent |\n| Expecting pinning | Excellent |\n| Range-bound with center target | Good |\n| Trending markets | Poor |\n\n## Key Takeaways\n1. Iron butterflies have higher credit but narrower profit zone\n2. Best when expecting price to pin near center strike\n3. More gamma risk than iron condors", quiz_questions: [{ question: "What is the key difference between an iron butterfly and iron condor?", options: ["Iron butterflies use different expirations", "Iron butterflies have ATM short strikes (centered)", "Iron condors have more profit potential", "No difference"], correct_answer: 1, explanation: "Iron butterflies sell both options ATM at the same strike, while iron condors have OTM short strikes." }] },
      { title: "Adjustment Techniques for Credit Strategies", description: "Roll, widen, and convert positions under threat.", duration: "35 min", order_index: 3, content_markdown: "# Adjustment Techniques for Credit Strategies\n\n## Learning Objectives\n- Roll positions when tested\n- Widen spreads to reduce delta\n- Convert to different structures\n\n## Common Adjustments\n\n| Situation | Adjustment |\n|-----------|------------|\n| Short put tested | Roll down and out |\n| Short call tested | Roll up and out |\n| One side profitable | Close winning side, manage loser |\n| Both sides threatened | Consider closing entire position |\n\n## Rolling Mechanics\n\n```\n1. Buy back threatened short strike\n2. Sell new strike further OTM\n3. Often extend to later expiration\n```\n\n## Key Takeaways\n1. Have adjustment rules before entering\n2. Don't let losers run past defined limits\n3. Rolling adds time but reduces delta", quiz_questions: [{ question: "If your short put is being tested (price approaching), what is a common adjustment?", options: ["Do nothing", "Roll down and out (lower strike, later expiration)", "Double the position", "Convert to long stock"], correct_answer: 1, explanation: "Rolling down and out moves the short strike away from price and adds time for mean reversion." }] },
      { title: "When Selling Premium is Unfavorable", description: "Recognize environments where premium selling underperforms.", duration: "25 min", order_index: 4, content_markdown: "# When Selling Premium is Unfavorable\n\n## Learning Objectives\n- Identify unfavorable environments\n- Avoid premium selling traps\n- Know when to step aside\n\n## Unfavorable Conditions\n\n| Condition | Why It's Bad for Selling |\n|-----------|-------------------------|\n| Low IV Rank (< 30%) | Premium too cheap |\n| Strong trends | Directional moves hurt neutral strategies |\n| Pre-major events | IV crush risk already priced |\n| High correlation | All positions move together |\n\n## Warning Signs\n\n1. VIX in low teens\n2. Markets grinding higher/lower relentlessly\n3. Your winning trade rate drops below 60%\n\n## Key Takeaways\n1. Premium selling has cycles\n2. Low IV = poor risk/reward for selling\n3. Trending markets punish neutral strategies", quiz_questions: [{ question: "Why is premium selling unfavorable when IV Rank is below 30%?", options: ["Options are too expensive", "Premium collected is too small relative to risk", "IV Rank below 30% never happens", "It's always favorable"], correct_answer: 1, explanation: "Low IV means cheap options, so the premium collected doesn't adequately compensate for the risk." }] },
      { title: "Module 8 Assessment", description: "Comprehensive quiz on advanced credit strategies.", duration: "15 min", order_index: 5, content_markdown: "# Module 8 Assessment\n\n**Passing Score:** 70%\n\nThis assessment covers credit spreads, iron condors, iron butterflies, and adjustments.", quiz_questions: [{ question: "When is selling premium typically most favorable?", options: ["Low IV, trending market", "High IV, range-bound market", "Before earnings", "During strong downtrends"], correct_answer: 1, explanation: "High IV provides rich premiums, and range-bound markets favor neutral strategies." }] }
    ]
  },
  {
    title: "Module 9: Advanced Debit & Directional Strategies",
    description: "Execute precision directional trades with diagonals, calendars, and ratio spreads.",
    order_index: 8,
    lessons: [
      { title: "Debit Spreads vs Outright Options", description: "Know when to use spreads versus single-leg directional trades.", duration: "30 min", order_index: 0, content_markdown: "# Debit Spreads vs Outright Options\n\n## Learning Objectives\n- Compare debit spreads to long options\n- Know when each is appropriate\n- Calculate risk/reward differences\n\n## Comparison\n\n| Factor | Long Option | Debit Spread |\n|--------|-------------|---------------|\n| Max Profit | Unlimited | Capped |\n| Cost | Higher | Lower |\n| Theta | Negative | Partially offset |\n| Vega | Full exposure | Reduced |\n| Break-even | Higher | Lower |\n\n## When to Use Each\n\n| Scenario | Recommendation |\n|----------|----------------|\n| Expecting large move | Long options |\n| High IV environment | Debit spreads |\n| Moderate move expected | Debit spreads |\n| Event play (earnings) | Depends on IV |\n\n## Key Takeaways\n1. Debit spreads reduce cost and IV risk\n2. Trade-off is capped profit\n3. Use spreads in high IV environments", quiz_questions: [{ question: "In a high IV environment, why might debit spreads be preferred over long options?", options: ["They're always better", "Spreads reduce the impact of IV crush since you're also short an option", "Long options are free", "Spreads have unlimited profit"], correct_answer: 1, explanation: "Debit spreads include a short option that offsets some theta and vega exposure from the long leg." }] },
      { title: "Diagonal Spreads", description: "Combine directional bias with time decay income.", duration: "30 min", order_index: 1, content_markdown: "# Diagonal Spreads\n\n## Learning Objectives\n- Construct diagonal spreads\n- Manage through expiration cycles\n- Understand profit dynamics\n\n## Diagonal Structure\n\n```\nBuy long-dated option (60+ DTE)\nSell short-dated option (30-45 DTE, different strike)\n```\n\n## Example (Bullish)\n\n| Leg | Details |\n|-----|--------|\n| Long | Buy 60-day $100 call |\n| Short | Sell 30-day $105 call |\n\n## Management\n\n1. Roll short call at 50% profit or expiration\n2. Keep long call as core position\n3. Target 2-4 short call sales per long call lifetime\n\n## Key Takeaways\n1. Diagonals combine directional bias with income\n2. Similar to PMCC but different strikes\n3. Manage short leg actively", quiz_questions: [{ question: "What is the key difference between a diagonal spread and a calendar spread?", options: ["Diagonals use different strikes; calendars use the same strike", "Calendars are directional; diagonals are neutral", "They're identical", "Diagonals expire the same day"], correct_answer: 0, explanation: "Diagonal spreads use different strikes for the two legs, while calendars use the same strike." }] },
      { title: "Calendar Spreads", description: "Trade volatility and time decay with horizontal spreads.", duration: "30 min", order_index: 2, content_markdown: "# Calendar Spreads\n\n## Learning Objectives\n- Construct calendar spreads\n- Identify ideal conditions\n- Manage and exit profitably\n\n## Calendar Structure\n\n```\nBuy long-dated option\nSell short-dated option (SAME STRIKE)\n```\n\n## When Calendars Work Best\n\n| Condition | Benefit |\n|-----------|--------|\n| Contango term structure | Buy cheap near, sell expensive far |\n| Price near strike at short expiration | Max profit |\n| Low/stable near-term IV | Short leg decays faster |\n\n## Risk\n\n| Scenario | Result |\n|----------|--------|\n| Large price move | Both legs move similarly, spread loses |\n| IV collapse in back month | Long leg loses more than short gains |\n\n## Key Takeaways\n1. Calendars profit from time passing and pinning\n2. Best in contango and range-bound conditions\n3. Max profit when price at short strike at expiration", quiz_questions: [{ question: "When does a calendar spread achieve maximum profit?", options: ["When price moves far from the strike", "When price is near the short strike at front-month expiration", "When IV spikes massively", "At time of entry"], correct_answer: 1, explanation: "Calendar spreads profit most when price pins at the short strike as the near-term option expires worthless." }] },
      { title: "Ratio Spreads", description: "Trade with leverage and defined risk using ratio structures.", duration: "35 min", order_index: 3, content_markdown: "# Ratio Spreads\n\n## Learning Objectives\n- Construct ratio spreads\n- Understand risk/reward profiles\n- Manage naked short risk\n\n## Ratio Spread Structure\n\n```\nBuy 1 option\nSell 2 (or more) options at further strike\n```\n\n## Example (1x2 Put Ratio)\n\n| Leg | Details |\n|-----|--------|\n| Long | Buy 1 $95 put |\n| Short | Sell 2 $90 puts |\n\n## Risk Profile\n\n| Price at Expiration | Result |\n|---------------------|--------|\n| Above $95 | Lose net debit (or small profit if credit) |\n| $90-$95 | Maximum profit |\n| Below $90 | Increasing loss (naked short) |\n\n## Key Takeaways\n1. Ratio spreads offer leveraged directional bets\n2. Watch for naked short exposure\n3. Often done for credit or small debit", quiz_questions: [{ question: "What is the main risk of a 1x2 ratio spread?", options: ["Maximum loss is the debit paid", "Unlimited risk beyond the short strikes", "No risk at all", "The options expire worthless"], correct_answer: 1, explanation: "Ratio spreads with more short options than long have naked exposure and potential for large losses beyond the short strikes." }] },
      { title: "Trend Acceleration & Momentum Plays", description: "Capture momentum moves with defined-risk strategies.", duration: "25 min", order_index: 4, content_markdown: "# Trend Acceleration & Momentum Plays\n\n## Learning Objectives\n- Identify momentum opportunities\n- Select appropriate options strategies\n- Time entries and exits\n\n## Momentum Indicators\n\n| Signal | Meaning |\n|--------|--------|\n| Breakout with volume | Trend continuation likely |\n| RSI divergence | Possible reversal |\n| Moving average fan | Strong trend |\n\n## Strategy Selection for Momentum\n\n| Momentum Strength | Strategy |\n|-------------------|----------|\n| Strong, early | Long options or debit spreads |\n| Strong, extended | Tighter spreads or take profits |\n| Weakening | Exit or hedge |\n\n## Key Takeaways\n1. Momentum trades favor long premium\n2. Define risk with spreads\n3. Exit when momentum fades", quiz_questions: [{ question: "What options strategy is typically favored for strong momentum plays?", options: ["Iron condors", "Long options or debit spreads", "Selling straddles", "Calendar spreads"], correct_answer: 1, explanation: "Momentum plays benefit from directional movement, favoring long options or debit spreads." }] },
      { title: "Module 9 Assessment", description: "Comprehensive quiz on debit and directional strategies.", duration: "15 min", order_index: 5, content_markdown: "# Module 9 Assessment\n\n**Passing Score:** 70%\n\nThis assessment covers debit spreads, diagonals, calendars, and ratio spreads.", quiz_questions: [{ question: "Why are debit spreads preferred in high IV environments?", options: ["They cost more", "The short leg offsets some IV risk", "They have unlimited profit", "IV doesn't affect spreads"], correct_answer: 1, explanation: "Debit spreads include selling an option, which reduces net vega and theta exposure." }] }
    ]
  },
  {
    title: "Module 10: Earnings & Event-Driven Trading",
    description: "Trade structured volatility around earnings and macro events.",
    order_index: 9,
    lessons: [
      { title: "Understanding Earnings IV Build & Crush", description: "Master the earnings volatility cycle and its impact on options.", duration: "30 min", order_index: 0, content_markdown: "# Understanding Earnings IV Build & Crush\n\n## Learning Objectives\n- Understand the earnings IV cycle\n- Predict IV behavior around events\n- Position accordingly\n\n## The Earnings IV Cycle\n\n```\n      IV\n       |\n       |        *peak*\n       |       /    \\\n       |      /      \\\n       |     /        \\ *crush*\n       |    /          \\\n       |   * build      \\*\n       |  /              \\*___\n       +------------------------→ Time\n      -14d  -7d  Earnings  +1d\n```\n\n## Key Phases\n\n| Phase | Timing | IV Behavior |\n|-------|--------|-------------|\n| Build | 2-3 weeks before | Gradual IV increase |\n| Peak | Day before | Maximum IV |\n| Crush | Day after | Sharp IV drop |\n| Normalization | 1-2 weeks after | IV returns to normal |\n\n## Key Takeaways\n1. IV peaks just before earnings\n2. IV crush is typically 30-50%\n3. Position before the cycle for best edge", quiz_questions: [{ question: "When does implied volatility typically peak around earnings?", options: ["2 weeks before", "Day before or day of earnings", "1 week after", "1 month after"], correct_answer: 1, explanation: "IV peaks just before earnings when uncertainty is highest, then crushes after the announcement." }] },
      { title: "Pre-Earnings Strategies", description: "Profit from IV expansion before earnings announcements.", duration: "30 min", order_index: 1, content_markdown: "# Pre-Earnings Strategies\n\n## Learning Objectives\n- Trade IV expansion\n- Time entries for pre-earnings\n- Manage and exit before announcement\n\n## Pre-Earnings Trade Ideas\n\n| Strategy | Goal | Exit Timing |\n|----------|------|-------------|\n| Long straddle/strangle | Capture IV expansion | Before earnings |\n| Long calendar | Sell near, buy far | Before earnings |\n| Long volatility | Pure IV bet | Before earnings |\n\n## Entry Timing\n\n| Timing | IV Level | Risk |\n|--------|----------|------|\n| 2-3 weeks out | Lower IV | More time for buildup |\n| 1 week out | Moderate IV | Less time, IV may plateau |\n\n## Key Takeaways\n1. Buy volatility before it expands\n2. Exit before earnings to avoid IV crush\n3. Don't hold long premium through earnings", quiz_questions: [{ question: "What is the typical exit timing for a pre-earnings IV expansion trade?", options: ["Hold through earnings", "Exit before the earnings announcement", "Exit 1 month after earnings", "Never exit"], correct_answer: 1, explanation: "Pre-earnings trades should be closed before the announcement to capture IV expansion and avoid IV crush." }] },
      { title: "Post-Earnings Strategies", description: "Trade the IV crush after earnings for consistent income.", duration: "25 min", order_index: 2, content_markdown: "# Post-Earnings Strategies\n\n## Learning Objectives\n- Sell premium after IV crush\n- Position for post-earnings drift\n- Manage gaps\n\n## Post-Earnings Opportunities\n\n| Scenario | Strategy |\n|----------|----------|\n| Stock stable after gap | Sell premium (iron condors) |\n| Clear directional move | Ride with spreads |\n| Fading the gap | Contrarian debit spreads |\n\n## IV After Earnings\n\n| Typical Behavior | Implication |\n|------------------|-------------|\n| IV drops 30-50% | Premium sellers profit |\n| Stock may drift | Directional opportunity |\n| Lower IV = cheaper options | Consider long premium for next move |\n\n## Key Takeaways\n1. Post-earnings IV crush benefits sellers who entered before\n2. Look for drift opportunities\n3. Lower IV may present buying opportunities", quiz_questions: [{ question: "After earnings, what typically happens to implied volatility?", options: ["IV increases dramatically", "IV decreases (crushes) sharply", "IV stays the same", "IV becomes negative"], correct_answer: 1, explanation: "Post-earnings IV crush is common as uncertainty is resolved, often dropping 30-50%." }] },
      { title: "Straddles & Strangles for Events", description: "Position for event volatility with breakeven analysis.", duration: "35 min", order_index: 3, content_markdown: "# Straddles & Strangles for Events\n\n## Learning Objectives\n- Construct event straddles/strangles\n- Calculate breakeven prices\n- Size positions appropriately\n\n## Strategy Comparison\n\n| Strategy | Structure | Cost | Breakeven |\n|----------|-----------|------|----------|\n| Straddle | ATM call + ATM put | Higher | Tighter |\n| Strangle | OTM call + OTM put | Lower | Wider |\n\n## Breakeven Calculation\n\n```\nStraddle Breakeven:\nUpper: Strike + Total Premium\nLower: Strike - Total Premium\n\nExample: $100 straddle costs $5\nUpper BE: $105\nLower BE: $95\nStock must move >5% to profit!\n```\n\n## Position Sizing\n\n1. Define max loss (the premium paid)\n2. Size so max loss = 1-2% of account\n3. Remember: 50%+ of straddles lose money\n\n## Key Takeaways\n1. Straddles need big moves to profit\n2. Calculate breakeven vs expected move\n3. Size based on total premium at risk", quiz_questions: [{ question: "If a straddle costs $8 with a strike of $100, what is the upper breakeven?", options: ["$100", "$108", "$92", "$116"], correct_answer: 1, explanation: "Upper breakeven = Strike + Total Premium = $100 + $8 = $108" }] },
      { title: "Macro Events: CPI, FOMC, FDA", description: "Trade around scheduled economic and regulatory events.", duration: "30 min", order_index: 4, content_markdown: "# Macro Events: CPI, FOMC, FDA\n\n## Learning Objectives\n- Identify tradable macro events\n- Position for scheduled announcements\n- Manage event risk\n\n## Major Event Types\n\n| Event | Frequency | Impact |\n|-------|-----------|--------|\n| FOMC | 8x/year | Broad market |\n| CPI/PPI | Monthly | Inflation-sensitive |\n| Jobs Report | Monthly | Economic outlook |\n| FDA Dates | Variable | Biotech-specific |\n\n## Trading Approaches\n\n| Strategy | Pre-Event | Post-Event |\n|----------|-----------|------------|\n| Long vol | Buy straddles | Close immediately |\n| Short vol | Sell after event | Collect premium |\n| Directional | Position based on expectation | Manage gap |\n\n## Key Takeaways\n1. Macro events create broad market volatility\n2. Event-specific IV patterns apply\n3. Have a plan for both outcomes", quiz_questions: [{ question: "How often does the FOMC make interest rate decisions?", options: ["Monthly", "8 times per year", "Weekly", "Annually"], correct_answer: 1, explanation: "FOMC meets roughly 8 times per year, with each meeting potentially impacting market volatility." }] },
      { title: "Risk Management for Event Trades", description: "Size positions and define stops for event-driven trades.", duration: "25 min", order_index: 5, content_markdown: "# Risk Management for Event Trades\n\n## Learning Objectives\n- Size event trades appropriately\n- Define and enforce stop strategies\n- Avoid catastrophic losses\n\n## Position Sizing for Events\n\n| Risk Level | Position Size |\n|------------|---------------|\n| High conviction | 1-2% of account at risk |\n| Moderate conviction | 0.5-1% at risk |\n| Speculative | 0.25-0.5% at risk |\n\n## Stop Strategies\n\n| Strategy Type | Stop Approach |\n|---------------|---------------|\n| Long options | Stop at 50% loss of premium |\n| Spreads | Stop at 2x credit received |\n| Pre-event | Time stop (exit before event) |\n\n## Key Takeaways\n1. Events are binary - size accordingly\n2. Define stops before entry\n3. Premium paid is your maximum loss (for long options)", quiz_questions: [{ question: "What is a reasonable maximum position size (at risk) for event trades?", options: ["10% of account", "1-2% of account at risk", "50% of account", "No limit needed"], correct_answer: 1, explanation: "Events are high risk; limiting exposure to 1-2% of account protects against catastrophic losses." }] },
      { title: "Module 10 Assessment", description: "Comprehensive quiz on event-driven trading.", duration: "15 min", order_index: 6, content_markdown: "# Module 10 Assessment\n\n**Passing Score:** 70%\n\nThis assessment covers earnings trading, IV crush, straddles/strangles, and macro events.", quiz_questions: [{ question: "When does IV typically peak around earnings?", options: ["1 month before", "Just before the announcement", "1 week after", "It doesn't change"], correct_answer: 1, explanation: "IV peaks just before earnings and crushes after the announcement." }] }
    ]
  },
  {
    title: "Module 11: Risk Management & Position Sizing",
    description: "Protect capital and ensure trading longevity with professional risk management.",
    order_index: 10,
    lessons: [
      { title: "Risk Per Trade vs Portfolio Risk", description: "Budget risk at trade and account level.", duration: "30 min", order_index: 0, content_markdown: "# Risk Per Trade vs Portfolio Risk\n\n## Learning Objectives\n- Define risk per trade limits\n- Calculate portfolio-level risk\n- Balance individual and total exposure\n\n## Risk Hierarchy\n\n| Level | Limit | Rationale |\n|-------|-------|----------|\n| Single trade | 1-2% of account | Survive losing streaks |\n| Correlated trades | 3-5% combined | Sector concentration |\n| Total portfolio | 10-15% at risk | Drawdown protection |\n\n## Calculation\n\n```\nRisk Per Trade = Account Size × Risk %\n\nExample:\n$100,000 account, 1% risk\nMax loss per trade = $1,000\n```\n\n## Key Takeaways\n1. Define risk before entering any trade\n2. Layer risk limits at multiple levels\n3. Never exceed portfolio-level risk caps", quiz_questions: [{ question: "What is a typical maximum risk per single trade?", options: ["10-20% of account", "1-2% of account", "50% of account", "No limit"], correct_answer: 1, explanation: "Limiting risk to 1-2% per trade allows you to survive losing streaks and preserve capital." }] },
      { title: "Correlation & Concentration Risk", description: "Manage sector exposure and correlated positions.", duration: "30 min", order_index: 1, content_markdown: "# Correlation & Concentration Risk\n\n## Learning Objectives\n- Identify correlated positions\n- Diversify effectively\n- Avoid hidden concentration\n\n## Correlation Examples\n\n| Position A | Position B | Correlation |\n|------------|------------|-------------|\n| AAPL calls | MSFT calls | High |\n| SPY puts | VIX calls | Negative |\n| XLF calls | Bank stocks | Very High |\n\n## Diversification Rules\n\n1. **Sector limit** - Max 3-5% in any single sector\n2. **Underlying limit** - Max 2-3 positions per underlying\n3. **Direction limit** - Balance long/short delta\n\n## Key Takeaways\n1. Correlated positions amplify risk\n2. Diversify across sectors and directions\n3. Count correlated trades as single risk units", quiz_questions: [{ question: "Why is correlation risk important in options portfolios?", options: ["Correlated positions don't matter", "Multiple correlated positions can all lose simultaneously", "Correlation always helps", "Only applies to stocks"], correct_answer: 1, explanation: "Correlated positions can move together, meaning multiple trades can lose at once if the sector moves against you." }] },
      { title: "Volatility-Adjusted Position Sizing", description: "Size positions based on IV and expected move.", duration: "35 min", order_index: 2, content_markdown: "# Volatility-Adjusted Position Sizing\n\n## Learning Objectives\n- Adjust size for volatility conditions\n- Use expected move in sizing\n- Scale positions appropriately\n\n## The Concept\n\nHigher volatility = smaller position sizes to maintain consistent risk exposure.\n\n## Calculation\n\n```\nAdjusted Size = Base Size × (Target Vol / Current Vol)\n\nExample:\nBase: 10 contracts when IV = 30%\nCurrent IV: 50%\nAdjusted: 10 × (30/50) = 6 contracts\n```\n\n## Expected Move Sizing\n\n| Expected Move | Strategy Adjustment |\n|---------------|--------------------|\n| Large (>5%) | Wider spreads, smaller size |\n| Normal (2-4%) | Standard sizing |\n| Small (<2%) | Tighter spreads, larger size OK |\n\n## Key Takeaways\n1. High vol = reduce size\n2. Use expected move to set strike width\n3. Maintain consistent dollar risk regardless of vol", quiz_questions: [{ question: "In high volatility environments, how should you adjust position size?", options: ["Increase size for more profit", "Decrease size to maintain consistent risk", "Size doesn't need to change", "Only trade bigger positions"], correct_answer: 1, explanation: "Higher volatility means larger potential moves, so reducing size keeps dollar risk consistent." }] },
      { title: "Risk of Ruin Concepts", description: "Understand Kelly criterion and survival probability.", duration: "25 min", order_index: 3, content_markdown: "# Risk of Ruin Concepts\n\n## Learning Objectives\n- Understand risk of ruin probability\n- Apply Kelly criterion concepts\n- Avoid account-ending mistakes\n\n## Risk of Ruin\n\nThe probability of losing enough to stop trading (e.g., 50% drawdown).\n\n| Win Rate | Risk/Trade | Approx. Ruin Risk |\n|----------|------------|------------------|\n| 60% | 1% | Very low |\n| 60% | 5% | Moderate |\n| 50% | 10% | High |\n| 40% | 10% | Very high |\n\n## Kelly Criterion (Simplified)\n\n```\nKelly % = Win Rate - (1 - Win Rate) / Reward:Risk Ratio\n\nExample:\nWin rate: 55%, R:R = 1.5:1\nKelly = 0.55 - (0.45 / 1.5) = 0.55 - 0.30 = 25%\n\nBet 25% of bankroll per trade (but most use half-Kelly or less)\n```\n\n## Key Takeaways\n1. Even small edges can be lost by over-sizing\n2. Kelly is theoretical maximum - use half or less\n3. Survival is the first goal", quiz_questions: [{ question: "What does 'risk of ruin' measure?", options: ["Daily profit potential", "The probability of losing enough capital to stop trading", "Maximum possible gain", "Average trade size"], correct_answer: 1, explanation: "Risk of ruin is the probability of experiencing a drawdown severe enough to end your trading career." }] },
      { title: "Portfolio Heat & Buying Power Management", description: "Manage margin efficiency and reserve capital.", duration: "25 min", order_index: 4, content_markdown: "# Portfolio Heat & Buying Power Management\n\n## Learning Objectives\n- Monitor portfolio heat\n- Manage buying power efficiently\n- Maintain reserve capital\n\n## Portfolio Heat\n\nTotal capital at risk across all positions.\n\n| Heat Level | Action |\n|------------|--------|\n| <50% of capital | Room to add trades |\n| 50-70% | Selective new trades only |\n| >70% | Reduce risk, no new trades |\n\n## Buying Power Management\n\n```\nAvailable BP = Total BP - Used BP\n\nRule: Keep 30-50% of BP in reserve for adjustments and opportunities\n```\n\n## Key Takeaways\n1. Don't use all your buying power\n2. Reserve capital for adjustments\n3. Monitor total heat, not just individual positions", quiz_questions: [{ question: "What percentage of buying power should typically be kept in reserve?", options: ["0% - use it all", "30-50% for adjustments and opportunities", "95%", "Buying power doesn't matter"], correct_answer: 1, explanation: "Keeping 30-50% in reserve allows for adjustments and taking advantage of new opportunities." }] },
      { title: "Module 11 Assessment", description: "Comprehensive quiz on risk management and position sizing.", duration: "15 min", order_index: 5, content_markdown: "# Module 11 Assessment\n\n**Passing Score:** 70%\n\nThis assessment covers trade sizing, correlation, volatility adjustment, and portfolio management.", quiz_questions: [{ question: "What is a typical maximum risk per trade?", options: ["10%", "1-2%", "50%", "No limit"], correct_answer: 1, explanation: "Limiting risk to 1-2% per trade protects capital during losing streaks." }] }
    ]
  },
  {
    title: "Module 12: Trade Management & Exit Engineering",
    description: "Master exits and defensive adjustments for consistent profitability.",
    order_index: 11,
    lessons: [
      { title: "Scaling Out vs Full Exits", description: "Implement partial profit-taking strategies.", duration: "30 min", order_index: 0, content_markdown: "# Scaling Out vs Full Exits\n\n## Learning Objectives\n- Decide when to scale vs full exit\n- Implement scaling strategies\n- Balance risk and reward\n\n## Scaling Approach\n\n| Profit Level | Action | Rationale |\n|--------------|--------|----------|\n| 25% of target | Hold | Too early to take |\n| 50% of max | Take 1/3 | Lock in some profit |\n| 75% of max | Take 1/3 more | Reduce remaining risk |\n| 90%+ of max | Close all | Minimal remaining upside |\n\n## When to Full Exit\n\n1. Hit your profit target\n2. Thesis is invalidated\n3. Better opportunity elsewhere\n4. Risk/reward no longer favorable\n\n## Key Takeaways\n1. Scaling locks in gains while allowing further upside\n2. Full exits are cleaner but may leave money on table\n3. Have predefined rules for both", quiz_questions: [{ question: "What is a common profit level to take the first partial profit?", options: ["10%", "50% of max profit", "100%", "Never take partial profits"], correct_answer: 1, explanation: "Taking 50% of max profit is a common first scale point, locking in gains while leaving room for more." }] },
      { title: "Time-Based Exits", description: "Use DTE-based exit rules for consistent management.", duration: "25 min", order_index: 1, content_markdown: "# Time-Based Exits\n\n## Learning Objectives\n- Implement DTE-based rules\n- Avoid expiration week risks\n- Balance time and profit\n\n## DTE Exit Rules\n\n| DTE Remaining | Action |\n|---------------|--------|\n| >21 DTE | Continue managing |\n| 14-21 DTE | Close at 50% profit |\n| <14 DTE | Consider closing regardless |\n| <7 DTE | Close to avoid gamma risk |\n\n## Why Time Matters\n\n1. **Gamma risk increases** - Near expiration, small moves have big impact\n2. **Theta accelerates** - Decay is fastest in final week\n3. **Assignment risk** - ITM options may be assigned\n\n## Key Takeaways\n1. Close most trades by 21 DTE\n2. Avoid holding to expiration\n3. Time-based rules reduce stress", quiz_questions: [{ question: "Why should most credit trades be closed by 21 DTE?", options: ["To pay more commissions", "To avoid accelerating gamma risk and expiration uncertainty", "Trades can't be closed earlier", "There's no reason"], correct_answer: 1, explanation: "Closing by 21 DTE avoids the elevated gamma risk and unpredictability of the final weeks." }] },
      { title: "Trailing Stops vs Profit Targets", description: "Know when to use each exit approach.", duration: "30 min", order_index: 2, content_markdown: "# Trailing Stops vs Profit Targets\n\n## Learning Objectives\n- Implement trailing stops for options\n- Set appropriate profit targets\n- Choose the right approach for each trade\n\n## Comparison\n\n| Method | Pros | Cons |\n|--------|------|------|\n| Trailing Stop | Captures extended moves | May give back profit |\n| Profit Target | Locks in gains | May miss larger moves |\n\n## When to Use Each\n\n| Situation | Recommended |\n|-----------|-------------|\n| Strong trend | Trailing stop |\n| Mean-reversion trade | Profit target |\n| High IV environment | Profit target |\n| Low IV breakout | Trailing stop |\n\n## Key Takeaways\n1. Trailing stops let winners run\n2. Profit targets provide certainty\n3. Match method to trade type", quiz_questions: [{ question: "When is a profit target typically preferred over a trailing stop?", options: ["In strong trends", "For mean-reversion and premium selling trades", "Never", "Only for stocks"], correct_answer: 1, explanation: "Mean-reversion trades have defined profit zones, making targets more appropriate than trailing stops." }] },
      { title: "Managing Winners", description: "Strategies for letting profits run while protecting gains.", duration: "30 min", order_index: 3, content_markdown: "# Managing Winners\n\n## Learning Objectives\n- Decide when to hold vs close winners\n- Protect profits with adjustments\n- Avoid 'should have held' regret\n\n## Winner Management Options\n\n| Current Profit | Options |\n|----------------|--------|\n| 50% of max | Scale, hold, or close |\n| 75% of max | Close majority, trail rest |\n| 90%+ | Close - risk/reward poor |\n\n## Adjustment Strategies\n\n1. **Roll up stops** - Move protective levels higher\n2. **Take partials** - Lock in some gains\n3. **Roll to new position** - Reset the trade\n\n## Key Takeaways\n1. Don't let winners become losers\n2. Take profits systematically\n3. Closing at 50% is often optimal for credit trades", quiz_questions: [{ question: "Why is closing credit trades at 50% profit often recommended?", options: ["To maximize fees", "Captures majority of profit while reducing time at risk", "It's required by regulations", "No reason"], correct_answer: 1, explanation: "At 50% profit, you've captured half the premium while eliminating the remaining time and gamma risk." }] },
      { title: "Managing Losers", description: "Cut losses, roll, or adjust losing positions.", duration: "30 min", order_index: 4, content_markdown: "# Managing Losers\n\n## Learning Objectives\n- Know when to cut losses\n- Implement defensive rolls\n- Avoid 'hoping' a loser will recover\n\n## Loser Decision Tree\n\n| Situation | Action |\n|-----------|--------|\n| Thesis still valid, early in trade | Hold, monitor |\n| Thesis invalid | Cut immediately |\n| At predefined stop | Close |\n| Can roll for credit | Consider rolling |\n\n## Rolling Mechanics\n\n1. Buy back losing position\n2. Sell new position further out/different strike\n3. Collect additional credit if possible\n\n## Key Takeaways\n1. Cutting losses is a skill, not a weakness\n2. Have predefined stop levels\n3. Don't roll into bad trades indefinitely", quiz_questions: [{ question: "If your trading thesis is invalidated, what should you typically do?", options: ["Wait and hope", "Cut the loss immediately", "Double the position", "Ignore it"], correct_answer: 1, explanation: "When your thesis is proven wrong, the best action is usually to cut the loss and preserve capital." }] },
      { title: "The Phroureo Exit System", description: "Use automated exit strategies for consistent management.", duration: "25 min", order_index: 5, content_markdown: "# The Phroureo Exit System\n\n## Learning Objectives\n- Understand automated exit strategies\n- Implement break-even and trailing protection\n- Reduce emotional decision-making\n\n## Phroureo Concept\n\nPhroureo (Greek for 'protection') automates profit protection:\n\n1. **Trigger Level** - Profit threshold to activate protection\n2. **Stop Placement** - Where to place protective stop\n3. **Trail Rules** - How stop follows price\n\n## Example Setup\n\n| Parameter | Setting |\n|-----------|---------|\n| Trigger | +$50 profit |\n| Initial Stop | Break-even |\n| Trail | 0.5% below highs |\n\n## Benefits\n\n1. Removes emotion from exits\n2. Consistent application of rules\n3. Protects gains automatically\n\n## Key Takeaways\n1. Automated exits reduce emotional mistakes\n2. Define rules before entering trades\n3. Let the system work without override", quiz_questions: [{ question: "What is the main benefit of automated exit strategies like Phroureo?", options: ["Higher commissions", "Removes emotion and ensures consistent rule application", "Guarantees profits", "No benefit"], correct_answer: 1, explanation: "Automated exits remove emotional decision-making and ensure rules are applied consistently." }] },
      { title: "Module 12 Assessment", description: "Comprehensive quiz on trade management and exits.", duration: "15 min", order_index: 6, content_markdown: "# Module 12 Assessment\n\n**Passing Score:** 70%\n\nThis assessment covers scaling, time-based exits, managing winners and losers.", quiz_questions: [{ question: "What is a common profit target for credit trades?", options: ["10%", "50% of max profit", "100%", "Never close early"], correct_answer: 1, explanation: "50% of max profit is a common target that captures most of the premium while reducing risk." }] }
    ]
  },
  {
    title: "Module 13: Rules-Based Trading Systems",
    description: "Build repeatable, improvable trading systems with playbooks and decision trees.",
    order_index: 12,
    lessons: [
      { title: "Why Systems Beat Discretion", description: "Understand the advantages of systematic trading over discretionary decisions.", duration: "25 min", order_index: 0, content_markdown: "# Why Systems Beat Discretion\n\n## Learning Objectives\n- Compare systematic vs discretionary trading\n- Understand system benefits\n- Begin building your own system\n\n## Systematic vs Discretionary\n\n| Aspect | Systematic | Discretionary |\n|--------|------------|---------------|\n| Consistency | High | Variable |\n| Emotional | Low influence | High influence |\n| Improvable | Clear metrics | Harder to track |\n| Scalable | Easy | Difficult |\n\n## System Benefits\n\n1. **Measurable** - Track what works\n2. **Repeatable** - Same process each time\n3. **Improvable** - Iterate based on data\n4. **Emotionless** - Rules override feelings\n\n## Key Takeaways\n1. Systems provide consistency\n2. Discretion leads to emotional errors\n3. Build and improve your system over time", quiz_questions: [{ question: "What is a key advantage of systematic trading?", options: ["More exciting", "Consistent application of rules regardless of emotions", "Higher risk", "No rules needed"], correct_answer: 1, explanation: "Systematic trading removes emotional decision-making and applies rules consistently." }] },
      { title: "Strategy Playbooks", description: "Document your strategies for consistent execution.", duration: "30 min", order_index: 1, content_markdown: "# Strategy Playbooks\n\n## Learning Objectives\n- Create strategy playbooks\n- Document entry/exit criteria\n- Build a personal trading manual\n\n## Playbook Components\n\n| Section | Contents |\n|---------|----------|\n| Setup | Market conditions, signals |\n| Entry | Specific criteria, timing |\n| Sizing | Position size rules |\n| Management | Adjustment triggers |\n| Exit | Profit targets, stops |\n\n## Example Entry\n\n```\nSTRATEGY: Bull Put Spread\n\nSETUP:\n- Uptrend on daily chart\n- IV Rank > 50%\n- Support level identified\n\nENTRY:\n- Sell 30-delta put\n- Buy 15-delta put\n- 30-45 DTE\n\nSIZE: 1% account risk\n\nEXIT:\n- 50% profit: Close\n- 200% of credit: Stop\n- 21 DTE: Close regardless\n```\n\n## Key Takeaways\n1. Document every strategy you trade\n2. Include all decision points\n3. Review and improve regularly", quiz_questions: [{ question: "What should a strategy playbook include?", options: ["Only entry criteria", "Setup, entry, sizing, management, and exit rules", "Just the ticker symbol", "Nothing specific"], correct_answer: 1, explanation: "A complete playbook covers all aspects: setup conditions, entry, sizing, management, and exit criteria." }] },
      { title: "If/Then Decision Trees", description: "Build decision frameworks for common scenarios.", duration: "30 min", order_index: 2, content_markdown: "# If/Then Decision Trees\n\n## Learning Objectives\n- Build decision trees for trading\n- Handle common scenarios systematically\n- Reduce decision fatigue\n\n## Decision Tree Example\n\n```\nIF position is profitable:\n  IF profit > 50%:\n    → Close or take partial\n  ELSE:\n    → Continue holding\n\nIF position is losing:\n  IF loss > 200% credit:\n    → Close (stop hit)\n  ELSE IF thesis intact:\n    → Hold or roll\n  ELSE:\n    → Close (thesis broken)\n```\n\n## Benefits\n\n1. Pre-made decisions reduce stress\n2. Consistent handling of scenarios\n3. No freezing under pressure\n\n## Key Takeaways\n1. Map out scenarios before they happen\n2. If/then logic simplifies decisions\n3. Decision trees remove emotion", quiz_questions: [{ question: "What is the main benefit of pre-built decision trees?", options: ["More complexity", "Decisions are made before pressure moments, reducing emotional errors", "Higher commissions", "No benefit"], correct_answer: 1, explanation: "Decision trees make choices before stressful situations, preventing emotional mistakes." }] },
      { title: "Market Regime Classification", description: "Identify trending, ranging, and volatile environments.", duration: "35 min", order_index: 3, content_markdown: "# Market Regime Classification\n\n## Learning Objectives\n- Identify market regimes\n- Adjust strategies by regime\n- Recognize regime transitions\n\n## Regime Types\n\n| Regime | Characteristics | Strategy Bias |\n|--------|-----------------|---------------|\n| Trending | Clear direction, HH/HL or LH/LL | Directional spreads |\n| Ranging | No clear direction, bounded | Neutral premium selling |\n| Volatile | Large moves, high VIX | Reduce size, wider spreads |\n| Quiet | Low VIX, grinding | Consider long premium |\n\n## Regime Indicators\n\n1. **VIX level** - High (>25) vs Low (<15)\n2. **Trend structure** - HH/HL vs LH/LL vs mixed\n3. **Average True Range** - Expanding or contracting\n\n## Key Takeaways\n1. Different regimes favor different strategies\n2. Classify before choosing strategy\n3. Adapt when regime changes", quiz_questions: [{ question: "In a high-volatility (VIX > 25) regime, what adjustments are typically recommended?", options: ["Trade more aggressively", "Reduce size and use wider spreads", "Ignore volatility", "Only day trade"], correct_answer: 1, explanation: "High volatility regimes require smaller sizes and wider spreads to account for larger moves." }] },
      { title: "Trade Journaling for Optimization", description: "Track and review trades to improve performance.", duration: "30 min", order_index: 4, content_markdown: "# Trade Journaling for Optimization\n\n## Learning Objectives\n- Build an effective trade journal\n- Track the right metrics\n- Use data to improve\n\n## Essential Journal Fields\n\n| Field | Purpose |\n|-------|--------|\n| Date/Time | When entered |\n| Symbol | What traded |\n| Strategy | How traded |\n| Entry price | Execution quality |\n| Exit price/date | Result |\n| P/L | Outcome |\n| Notes | Lessons learned |\n\n## Analysis Metrics\n\n1. **Win rate** by strategy\n2. **Average winner/loser** size\n3. **Profit factor** (gross wins / gross losses)\n4. **Performance by regime**\n\n## Review Process\n\n1. Weekly: Review all trades\n2. Monthly: Strategy performance analysis\n3. Quarterly: System optimization\n\n## Key Takeaways\n1. Journal every trade\n2. Review regularly\n3. Use data to improve", quiz_questions: [{ question: "What is 'profit factor' in trade analysis?", options: ["Total profits", "Gross profits divided by gross losses", "Number of trades", "Commission costs"], correct_answer: 1, explanation: "Profit factor = Gross Profits / Gross Losses. Above 1.0 means profitable overall." }] },
      { title: "Backtesting Your Systems", description: "Validate strategy effectiveness with historical data.", duration: "25 min", order_index: 5, content_markdown: "# Backtesting Your Systems\n\n## Learning Objectives\n- Understand backtesting basics\n- Avoid common backtesting errors\n- Validate before trading live\n\n## Backtesting Process\n\n1. **Define rules** - Entry, exit, sizing\n2. **Select data** - Representative period\n3. **Run simulation** - Apply rules historically\n4. **Analyze results** - Win rate, drawdowns, etc.\n5. **Refine** - Adjust and re-test\n\n## Common Errors\n\n| Error | Solution |\n|-------|----------|\n| Overfitting | Use out-of-sample data |\n| Ignoring slippage | Add realistic costs |\n| Look-ahead bias | Don't use future data |\n| Survivorship bias | Include delisted stocks |\n\n## Key Takeaways\n1. Backtest before trading real money\n2. Be realistic about costs and slippage\n3. Out-of-sample testing validates robustness", quiz_questions: [{ question: "What is 'overfitting' in backtesting?", options: ["Using too much data", "Creating rules that work perfectly on historical data but fail going forward", "Trading too many symbols", "Having too many winners"], correct_answer: 1, explanation: "Overfitting means the system is tuned so specifically to past data that it doesn't work in real trading." }] },
      { title: "Module 13 Assessment", description: "Comprehensive quiz on rules-based trading systems.", duration: "15 min", order_index: 6, content_markdown: "# Module 13 Assessment\n\n**Passing Score:** 70%\n\nThis assessment covers systematic trading, playbooks, decision trees, and backtesting.", quiz_questions: [{ question: "Why do systems beat discretionary trading?", options: ["They're more exciting", "Consistent rule application removes emotional errors", "They guarantee profits", "No difference"], correct_answer: 1, explanation: "Systematic trading removes emotional decision-making and applies rules consistently." }] }
    ]
  },
  {
    title: "Module 14: Psychology, Discipline & Professional Mindset",
    description: "Develop long-term trader resilience and professional habits.",
    order_index: 13,
    lessons: [
      { title: "Overtrading Avoidance", description: "Recognize and prevent the common trap of trading too much.", duration: "25 min", order_index: 0, content_markdown: "# Overtrading Avoidance\n\n## Learning Objectives\n- Identify overtrading patterns\n- Implement trading limits\n- Quality over quantity\n\n## Signs of Overtrading\n\n| Sign | Description |\n|------|-------------|\n| Too many open positions | Can't manage properly |\n| Trading boredom | Entering without setup |\n| Revenge trading | Chasing losses |\n| FOMO trades | Fear of missing out |\n\n## Prevention Strategies\n\n1. **Daily trade limit** - Max 1-3 new trades per day\n2. **Position cap** - Max 5-10 open positions\n3. **Watchlist requirement** - Only trade planned setups\n4. **Cool-down rule** - Wait 30 min after loss before new trade\n\n## Key Takeaways\n1. Less is more in trading\n2. Quality setups beat quantity\n3. Set and enforce limits", quiz_questions: [{ question: "What is 'revenge trading'?", options: ["Trading your favorite stock", "Trying to immediately recover losses with aggressive trades", "Trading with a plan", "Taking a break after losses"], correct_answer: 1, explanation: "Revenge trading is impulsively trying to recover losses quickly, often leading to more losses." }] },
      { title: "Loss Normalization", description: "Accept losses as part of the trading process.", duration: "25 min", order_index: 1, content_markdown: "# Loss Normalization\n\n## Learning Objectives\n- Accept losses as normal\n- Focus on process, not outcomes\n- Maintain confidence through losing streaks\n\n## Losses Are Normal\n\n| Win Rate | Losing Streaks Expected |\n|----------|------------------------|\n| 50% | 5-6 losses in a row common |\n| 60% | 4-5 losses in a row possible |\n| 70% | 3-4 losses in a row expected |\n\n## Healthy Loss Mindset\n\n1. **Process focus** - Did I follow my rules?\n2. **Statistical thinking** - One trade is noise\n3. **Learning opportunity** - What can I improve?\n4. **Size appropriately** - Losses should be small\n\n## Key Takeaways\n1. Even great traders lose 30-40% of trades\n2. Losing streaks are statistically normal\n3. Focus on process, not individual outcomes", quiz_questions: [{ question: "Even with a 60% win rate, what should you expect?", options: ["Never losing", "4-5 trade losing streaks are possible and normal", "Winning every day", "Only 1 loss per month"], correct_answer: 1, explanation: "Statistically, a 60% win rate means losing streaks of 4-5 trades are completely normal and expected." }] },
      { title: "Discipline Under Drawdowns", description: "Maintain system adherence during difficult periods.", duration: "30 min", order_index: 2, content_markdown: "# Discipline Under Drawdowns\n\n## Learning Objectives\n- Maintain discipline during losses\n- Stick to systems when tempted to deviate\n- Survive to trade another day\n\n## Drawdown Psychology\n\n| Drawdown Level | Typical Reaction | Healthy Response |\n|----------------|------------------|------------------|\n| 5% | Annoyance | Normal, stick to system |\n| 10% | Worry | Reduce size, review rules |\n| 15% | Panic | Significantly reduce, full review |\n| 20%+ | Desperation | Stop trading, seek help |\n\n## Discipline Strategies\n\n1. **Predefined rules** - Know what you'll do at each level\n2. **Accountability** - Trading partner or journal\n3. **Circuit breakers** - Automatic trading stops\n4. **Perspective** - Drawdowns are temporary\n\n## Key Takeaways\n1. Drawdowns test discipline - plan for them\n2. Size reduction preserves capital and psychology\n3. Follow the system, especially when it's hard", quiz_questions: [{ question: "At a 10% account drawdown, what is typically recommended?", options: ["Double position sizes", "Reduce size and review the trading system", "Stop trading forever", "Ignore it"], correct_answer: 1, explanation: "Reducing size preserves capital and allows for system review without additional pressure." }] },
      { title: "Treating Trading as a Business", description: "Develop professional trader habits and routines.", duration: "30 min", order_index: 3, content_markdown: "# Treating Trading as a Business\n\n## Learning Objectives\n- Adopt professional mindset\n- Build trading routines\n- Track business metrics\n\n## Business Framework\n\n| Business Aspect | Trading Equivalent |\n|-----------------|-------------------|\n| Revenue | Gross profits |\n| Expenses | Losses + commissions |\n| R&D | Education + analysis |\n| Operations | Daily routines |\n| Risk Management | Position sizing |\n\n## Professional Habits\n\n1. **Fixed schedule** - Same hours each day\n2. **Pre-market routine** - Prepare before open\n3. **Post-market review** - Journal and analyze\n4. **Weekly planning** - Goals and focus areas\n\n## Key Takeaways\n1. Trading is a business - treat it like one\n2. Professionals have routines\n3. Track metrics like a business owner", quiz_questions: [{ question: "Why should trading be treated as a business?", options: ["To impress friends", "Businesses have structure, metrics, and discipline that lead to success", "Businesses can't fail", "No reason"], correct_answer: 1, explanation: "The business framework provides structure, accountability, and professionalism that improve results." }] },
      { title: "Building a Sustainable Trading Career", description: "Develop a long-term perspective and work-life balance.", duration: "25 min", order_index: 4, content_markdown: "# Building a Sustainable Trading Career\n\n## Learning Objectives\n- Take a long-term view\n- Balance trading with life\n- Avoid burnout\n\n## Sustainability Factors\n\n| Factor | Practice |\n|--------|----------|\n| Physical health | Exercise, sleep, nutrition |\n| Mental health | Breaks, hobbies, relationships |\n| Financial | Don't overtrade, emergency fund |\n| Continuous learning | Stay curious, adapt |\n\n## Work-Life Balance\n\n1. **Set trading hours** - Don't trade 24/7\n2. **Take breaks** - Days off, vacations\n3. **Pursue other interests** - Trading isn't everything\n4. **Relationships** - Maintain social connections\n\n## Key Takeaways\n1. Trading is a marathon, not a sprint\n2. Health enables performance\n3. Balance prevents burnout", quiz_questions: [{ question: "Why is work-life balance important for traders?", options: ["It's not important", "Prevents burnout and maintains long-term performance", "Makes trading harder", "Only for part-time traders"], correct_answer: 1, explanation: "Sustainable trading requires mental and physical health, which comes from balance." }] },
      { title: "Final Course Assessment", description: "Comprehensive final exam covering all 14 modules.", duration: "20 min", order_index: 5, content_markdown: "# Final Course Assessment\n\n## Congratulations!\n\nYou have completed all 14 modules of the Advanced Options Trading Academy.\n\n## Assessment Overview\n\nThis final assessment covers key concepts from all modules:\n- Market mechanics and volatility\n- Greeks and risk management\n- Advanced strategies\n- Trade management\n- Psychology and discipline\n\n**Passing Score:** 70% (at least 14 out of 20 correct)\n\n## Upon Completion\n\n1. Review any weak areas\n2. Apply knowledge systematically\n3. Continue learning and adapting\n4. Trade with discipline and patience\n\n---\n\n*You are now equipped with institutional-level options trading knowledge. Use it wisely.*", quiz_questions: [{ question: "When is premium selling most favorable?", options: ["Low IV Rank", "High IV Rank, range-bound market", "Trending down market", "Before major events"], correct_answer: 1, explanation: "Premium selling is most favorable when IV is elevated (expensive options) and markets are range-bound." }, { question: "What is the typical profit target for credit trades?", options: ["100%", "50% of max profit", "10%", "Hold to expiration"], correct_answer: 1, explanation: "50% of max profit is optimal, capturing most of the premium while reducing time at risk." }] },
      { title: "Certificate & Next Steps", description: "Celebrate completion and plan your continued growth.", duration: "10 min", order_index: 6, content_markdown: "# Certificate & Next Steps\n\n## 🎉 Congratulations, Graduate!\n\nYou have successfully completed the **Advanced Options Trading Academy**.\n\n## What You've Learned\n\n1. **Professional Market Mechanics** - How markets really work\n2. **Volatility Mastery** - Trading IV as a core variable\n3. **Advanced Greeks** - Portfolio-level risk management\n4. **Institutional Analysis** - TA the professional way\n5. **Advanced Strategies** - LEAPS, credit, debit, events\n6. **Risk & Psychology** - Sustainable trading practices\n\n## Your Next Steps\n\n1. **Apply systematically** - Use playbooks and decision trees\n2. **Journal religiously** - Track every trade\n3. **Start small** - Paper trade or small size first\n4. **Review regularly** - Monthly performance analysis\n5. **Keep learning** - Markets always evolve\n\n## Resources for Continued Learning\n\n- Practice with paper trading\n- Join trading communities\n- Read market commentary daily\n- Backtest new strategies before trading\n\n## Remember\n\n> \"The goal of a successful trader is to make the best trades. Money is secondary.\" - Alexander Elder\n\n---\n\n*Trade well, manage risk, and may the Greeks be ever in your favor.*", quiz_questions: [{ question: "What is the first step after completing this course?", options: ["Trade aggressively with full size", "Apply knowledge systematically with small size or paper trading", "Stop learning", "Trade without a plan"], correct_answer: 1, explanation: "Start with small size or paper trading to apply your knowledge systematically before scaling up." }] }
    ]
  }
];

// Combine all modules
const allModules = [...modules, ...additionalModules];

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if course already exists
    const { data: existingCourse } = await supabase
      .from('courses')
      .select('id')
      .eq('title', courseData.title)
      .single();

    if (existingCourse) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Course already exists',
          courseId: existingCourse.id 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create the course
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .insert(courseData)
      .select()
      .single();

    if (courseError) throw courseError;

    let totalModules = 0;
    let totalLessons = 0;

    // Create modules and lessons
    for (const moduleData of allModules) {
      const { lessons, ...moduleInfo } = moduleData;
      
      const { data: module, error: moduleError } = await supabase
        .from('course_modules')
        .insert({
          ...moduleInfo,
          course_id: course.id,
          status: 'published'
        })
        .select()
        .single();

      if (moduleError) throw moduleError;
      totalModules++;

      // Create lessons for this module
      for (const lessonData of lessons) {
        const { error: lessonError } = await supabase
          .from('course_lessons')
          .insert({
            ...lessonData,
            module_id: module.id,
            status: 'published'
          });

        if (lessonError) throw lessonError;
        totalLessons++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Advanced Options Trading Academy created successfully',
        courseId: course.id,
        stats: {
          modules: totalModules,
          lessons: totalLessons
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error creating curriculum:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
