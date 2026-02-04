import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QuizQuestion {
  question: string;
  options: string[];
  correct_answer: number;
  explanation: string;
}

interface Lesson {
  title: string;
  description: string;
  duration: string;
  content_markdown: string;
  quiz_questions: QuizQuestion[];
}

interface Module {
  title: string;
  description: string;
  lessons: Lesson[];
}

interface Course {
  title: string;
  description: string;
  difficulty_level: string;
  estimated_duration: string;
  order_index: number;
  modules: Module[];
}

// ============================================================================
// BEGINNER OPTIONS TRADING ACADEMY - 13 Modules, 65 Lessons
// ============================================================================

const beginnerCourse: Course = {
  title: "Beginner Options Trading Academy",
  description: "Master the foundations of options trading from scratch. Learn how options work, understand basic strategies, develop essential risk management skills, and build a solid trading foundation before risking real capital.",
  difficulty_level: "beginner",
  estimated_duration: "15+ hours",
  order_index: 0,
  modules: [
    // Module 1: Introduction to Financial Markets & Trading
    {
      title: "Introduction to Financial Markets & Trading",
      description: "Understand the landscape of financial markets and where options trading fits into the bigger picture.",
      lessons: [
        {
          title: "What Are Financial Markets?",
          description: "Discover how financial markets work and their role in the global economy.",
          duration: "20 min",
          content_markdown: `# What Are Financial Markets?

## Learning Objectives
- Understand what financial markets are and why they exist
- Know the main types of financial markets
- Recognize where options trading fits in the broader market
- Understand how retail traders participate

## What Is a Financial Market?

A financial market is simply a place where buyers and sellers come together to trade financial assets. Think of it like a farmer's market, but instead of vegetables, people buy and sell things like:

- **Stocks**: Ownership pieces of companies
- **Bonds**: Loans to governments or companies
- **Options**: Contracts that give you rights to buy/sell stocks
- **Currencies**: Money from different countries

## Types of Financial Markets

### Stock Market
Where company shares are bought and sold. When you buy Apple stock, you own a small piece of Apple Inc.

### Bond Market
Where governments and corporations borrow money from investors by issuing bonds.

### Options Market
Where options contracts are traded. Options give you the RIGHT (but not obligation) to buy or sell stocks at specific prices.

### Futures Market
Where contracts for future delivery of commodities or financial instruments are traded.

## Why Do Financial Markets Exist?

Financial markets serve important purposes:

1. **Raise Capital**: Companies sell stocks to get money to grow
2. **Transfer Risk**: Investors can protect themselves with options
3. **Price Discovery**: Markets help determine fair prices
4. **Liquidity**: Make it easy to buy and sell quickly

## How Retail Traders Participate

As an individual (retail) trader, you access financial markets through:

1. **Brokerage Accounts**: Companies like TD Ameritrade, Fidelity, or Schwab
2. **Electronic Platforms**: Mobile apps and desktop software
3. **Order Routing**: Your orders go to exchanges electronically

## Key Takeaways
1. Financial markets connect buyers and sellers of financial assets
2. Options are contracts traded in the options market
3. The stock market is where we find stocks to trade options on
4. Retail traders access markets through brokerage accounts

## Quick Reference
- **Stock**: Ownership share in a company
- **Bond**: A loan you make to a company or government
- **Option**: A contract giving rights to buy/sell at a specific price
- **Brokerage**: Company that connects you to financial markets`,
          quiz_questions: [
            {
              question: "What is the primary purpose of financial markets?",
              options: [
                "To make rich people richer",
                "To connect buyers and sellers of financial assets",
                "To manipulate stock prices",
                "To provide jobs for traders"
              ],
              correct_answer: 1,
              explanation: "Financial markets exist primarily to connect buyers and sellers, enabling the exchange of financial assets efficiently."
            },
            {
              question: "What does an option contract give you?",
              options: [
                "Ownership of a company",
                "A guaranteed profit",
                "The right (but not obligation) to buy or sell at a specific price",
                "A loan from a bank"
              ],
              correct_answer: 2,
              explanation: "Options give you the RIGHT but not the obligation to buy or sell an underlying asset at a predetermined price."
            },
            {
              question: "How do retail traders typically access financial markets?",
              options: [
                "By walking onto the stock exchange floor",
                "Through brokerage accounts and electronic platforms",
                "By calling companies directly",
                "Through social media"
              ],
              correct_answer: 1,
              explanation: "Individual traders access markets through brokerage accounts that provide electronic trading platforms."
            }
          ]
        },
        {
          title: "Stocks vs Options: Key Differences",
          description: "Learn the fundamental differences between owning stocks and trading options.",
          duration: "25 min",
          content_markdown: `# Stocks vs Options: Key Differences

## Learning Objectives
- Understand what makes stocks and options fundamentally different
- Know the advantages and disadvantages of each
- Recognize why options exist alongside stocks
- Decide when each might be appropriate

## Stock Ownership: The Basics

When you buy a stock, you become a **part owner** of the company:

- **100 shares of Apple** = You own a tiny piece of Apple Inc.
- **No expiration**: You can hold forever
- **Full investment**: Pay full price upfront ($15,000 for 100 shares at $150)
- **Unlimited upside/downside**: Stock can go to $0 or $1,000+

## Options: Contracts, Not Ownership

When you buy an option, you're buying a **contract** with specific terms:

- **Right, not obligation**: You CAN act, but don't HAVE to
- **Expiration date**: Contracts expire (days to years)
- **Strike price**: The price you can buy/sell at
- **Premium**: What you pay for the contract (much less than stock price)

## Side-by-Side Comparison

| Feature | Stocks | Options |
|---------|--------|---------|
| What you own | Company shares | Contract rights |
| Expiration | None | Yes (days to years) |
| Upfront cost | Full share price | Premium (fraction) |
| Can go to zero? | Yes | Yes |
| Leverage | 1:1 | Built-in |

## Example: $150 Stock

**Buying 100 shares of stock:**
- Cost: $15,000
- If stock goes to $160: Profit = $1,000 (6.7% return)
- If stock goes to $140: Loss = $1,000 (6.7% loss)

**Buying 1 call option ($3 premium):**
- Cost: $300 (for 100 share contract)
- If stock goes to $160: Profit = $700 (233% return!)
- If stock goes to $140: Loss = $300 (100% of premium)

## Why Options Exist

Options serve important purposes:

1. **Hedging**: Protect stock positions from losses
2. **Leverage**: Control more shares with less capital
3. **Income**: Generate cash from existing positions
4. **Speculation**: Bet on direction with limited risk

## Key Takeaways
1. Stocks represent ownership; options represent contractual rights
2. Options have expiration dates; stocks don't
3. Options cost less upfront but can expire worthless
4. Both have their place in a trading toolkit

## Quick Reference
- **Stock owner**: Partial company owner
- **Option buyer**: Holds a time-limited contract
- **Leverage**: Controlling more with less capital
- **Premium**: The cost of buying an option`,
          quiz_questions: [
            {
              question: "What is the main difference between stocks and options?",
              options: [
                "Stocks are more expensive",
                "Stocks represent ownership; options represent contractual rights",
                "Options are safer than stocks",
                "Stocks expire after one year"
              ],
              correct_answer: 1,
              explanation: "Stocks give you actual ownership in a company, while options give you contractual rights to buy or sell at specific terms."
            },
            {
              question: "If you pay $300 for an option and it expires worthless, how much do you lose?",
              options: [
                "Nothing - options are protected",
                "$150",
                "$300 - the full premium",
                "Unlimited losses"
              ],
              correct_answer: 2,
              explanation: "When buying options, the maximum loss is the premium paid. If it expires worthless, you lose the entire premium."
            },
            {
              question: "Why might someone choose options over stocks?",
              options: [
                "Options never lose money",
                "To control more shares with less capital (leverage)",
                "Stocks are illegal in some states",
                "Options pay higher dividends"
              ],
              correct_answer: 1,
              explanation: "Options provide leverage, allowing traders to control more shares with less capital than buying stock outright."
            }
          ]
        },
        {
          title: "Trading vs Investing: Which Is Right For You?",
          description: "Understand the difference between trading and long-term investing approaches.",
          duration: "20 min",
          content_markdown: `# Trading vs Investing: Which Is Right For You?

## Learning Objectives
- Distinguish between trading and investing mindsets
- Understand time horizons and their implications
- Know what type of commitment each requires
- Evaluate which approach fits your personality

## The Core Difference

### Investing
- **Time horizon**: Years to decades
- **Goal**: Build wealth slowly through compound growth
- **Activity level**: Buy and hold, minimal action
- **Example**: "I'll buy and hold for 20 years"

### Trading
- **Time horizon**: Minutes to months
- **Goal**: Profit from shorter-term price movements
- **Activity level**: Active monitoring and decisions
- **Example**: "I'll capture this 2-week price swing"

## Trading Styles by Time Horizon

| Style | Holding Period | Time Required |
|-------|---------------|---------------|
| Day Trading | Minutes to hours | Full-time focus |
| Swing Trading | Days to weeks | Part-time OK |
| Position Trading | Weeks to months | Casual monitoring |
| Investing | Years+ | Occasional review |

## Options and Time Horizons

Options are naturally suited to **shorter time horizons** because:

1. **Expiration dates** force decisions
2. **Time decay** works against option holders
3. **Premium capture** works best in defined windows

Most options traders are **swing traders** or **position traders**, holding positions for days to weeks.

## What Each Requires

### To Trade Successfully:
- Daily or weekly attention
- Quick decision-making ability
- Comfort with frequent gains/losses
- Technical analysis skills
- Defined entry/exit rules

### To Invest Successfully:
- Patience over years
- Ability to ignore short-term noise
- Focus on fundamentals
- Emotional discipline during downturns
- Long-term perspective

## Honest Self-Assessment

Ask yourself:
- How much time can I dedicate weekly?
- Am I comfortable with frequent decisions?
- Can I handle seeing red in my account?
- Do I have a stable income for living expenses?

## Key Takeaways
1. Trading focuses on shorter-term profits; investing on long-term growth
2. Options naturally fit trading time horizons due to expiration
3. Trading requires more active involvement than investing
4. Neither is "better" - choose what fits your life

## Quick Reference
- **Investor**: Long-term wealth builder
- **Trader**: Active profit seeker
- **Time decay**: Options lose value as expiration approaches
- **Swing trading**: Holding for days to weeks`,
          quiz_questions: [
            {
              question: "Why are options naturally suited to trading rather than long-term investing?",
              options: [
                "Options are cheaper",
                "Options have expiration dates and time decay",
                "Investing is illegal with options",
                "Options pay monthly dividends"
              ],
              correct_answer: 1,
              explanation: "Options have expiration dates and experience time decay, making them naturally suited to shorter-term trading approaches."
            },
            {
              question: "What is a swing trader's typical holding period?",
              options: [
                "Minutes to hours",
                "Days to weeks",
                "Years to decades",
                "Exactly one month"
              ],
              correct_answer: 1,
              explanation: "Swing traders typically hold positions for days to weeks, trying to capture short-term price movements."
            },
            {
              question: "Which approach requires more daily attention?",
              options: [
                "Long-term investing",
                "Buy and hold",
                "Trading",
                "They require equal attention"
              ],
              correct_answer: 2,
              explanation: "Trading requires more active involvement with daily or weekly attention to positions and market conditions."
            }
          ]
        },
        {
          title: "Understanding Market Hours and Sessions",
          description: "Learn when markets are open and the best times to trade.",
          duration: "15 min",
          content_markdown: `# Understanding Market Hours and Sessions

## Learning Objectives
- Know regular stock and options market hours
- Understand pre-market and after-hours trading
- Recognize key times during the trading day
- Plan your trading around market sessions

## Regular Trading Hours (Eastern Time)

### Stock Market
- **Pre-market**: 4:00 AM - 9:30 AM
- **Regular hours**: 9:30 AM - 4:00 PM
- **After-hours**: 4:00 PM - 8:00 PM

### Options Market
- **Regular hours**: 9:30 AM - 4:00 PM
- Most options do NOT trade pre/after hours
- Some index options trade slightly extended

## Key Times During the Day

### The Open (9:30 - 10:00 AM)
- High volatility
- Wide spreads
- Often unpredictable
- **Beginners**: Consider waiting 15-30 minutes

### Mid-Day (11:00 AM - 2:00 PM)
- Lower volume
- Tighter spreads
- Calmer price action
- Good for deliberate entries

### The Close (3:00 - 4:00 PM)
- Volume picks up
- Traders close positions
- Can see larger moves
- Important for expiring options

## Market Holidays

US markets are closed on:
- New Year's Day
- Martin Luther King Jr. Day
- Presidents' Day
- Good Friday
- Memorial Day
- Juneteenth
- Independence Day
- Labor Day
- Thanksgiving
- Christmas

Check the calendar before planning trades!

## Time Zones Matter

If you're not on Eastern Time, adjust accordingly:
- Pacific: Market opens 6:30 AM
- Mountain: Market opens 7:30 AM
- Central: Market opens 8:30 AM

## Key Takeaways
1. Regular options trading is 9:30 AM - 4:00 PM Eastern
2. The first 30 minutes are volatile - use caution
3. Mid-day is often calmer for placing trades
4. Markets are closed on major holidays

## Quick Reference
- **Market open**: 9:30 AM ET
- **Market close**: 4:00 PM ET
- **Best for beginners**: 10:00 AM - 3:00 PM
- **Options settlement**: 4:00 PM (most)`,
          quiz_questions: [
            {
              question: "What time do regular options market hours begin (Eastern Time)?",
              options: [
                "4:00 AM",
                "8:00 AM",
                "9:30 AM",
                "10:00 AM"
              ],
              correct_answer: 2,
              explanation: "Regular options trading hours begin at 9:30 AM Eastern Time when the stock market opens."
            },
            {
              question: "Why should beginners be cautious during the first 30 minutes of trading?",
              options: [
                "Brokers charge higher fees",
                "High volatility and wide spreads",
                "Markets are still warming up",
                "Technical analysis doesn't work"
              ],
              correct_answer: 1,
              explanation: "The first 30 minutes often see high volatility and wider bid-ask spreads, making it riskier for beginners."
            },
            {
              question: "What happens to most options after regular market hours?",
              options: [
                "They trade 24/7",
                "They continue trading until 8 PM",
                "They do NOT trade (most options)",
                "They trade at half price"
              ],
              correct_answer: 2,
              explanation: "Most options do not trade during pre-market or after-hours sessions - only during regular market hours."
            }
          ]
        },
        {
          title: "The Role of Retail Traders in Modern Markets",
          description: "Understand your place as a retail trader and how markets have evolved.",
          duration: "20 min",
          content_markdown: `# The Role of Retail Traders in Modern Markets

## Learning Objectives
- Understand who retail traders are
- Know how technology has democratized trading
- Recognize your advantages and disadvantages
- Set realistic expectations for your journey

## Who Are Retail Traders?

Retail traders are **individual investors** trading their own money:

- Not professionals at banks or hedge funds
- Using personal brokerage accounts
- Trading part-time or full-time
- Range from beginners to experienced veterans

## The Trading Landscape

### Major Player Types

| Player | Typical Size | Resources |
|--------|-------------|-----------|
| Institutional | $10M+ per trade | Massive |
| Retail | $100-$100K trades | Limited |
| Market Makers | Variable | Technology |
| High-Frequency | Millions per second | Extreme |

## How Technology Changed Everything

### Before (1990s and earlier)
- Call your broker to place trades
- High commissions ($50+ per trade)
- Limited information access
- Slow execution

### Today
- Click or tap to trade instantly
- Zero or low commissions
- Massive free information
- Near-instant execution

## Retail Trader Advantages

1. **Flexibility**: No boss, trade your own strategy
2. **Small size**: Can enter/exit without moving prices
3. **Time**: No quarterly performance pressure
4. **Focus**: Can specialize in a few opportunities

## Retail Trader Disadvantages

1. **Resources**: Less research, data, technology
2. **Capital**: Smaller account = less diversification
3. **Experience**: Learning curve takes time
4. **Psychology**: Trading your own money is emotional

## Realistic Expectations

**Year 1**: Focus on education and paper trading
**Year 2**: Small real trades, refining your approach
**Year 3+**: Consistent application of proven methods

Most successful retail traders took **2-3 years** to become consistently profitable.

## Key Takeaways
1. Retail traders are individuals trading personal accounts
2. Technology has leveled the playing field significantly
3. You have unique advantages (flexibility, no pressure)
4. Success takes time - measure in years, not months

## Quick Reference
- **Retail trader**: Individual with personal account
- **Institutional trader**: Professional at a firm
- **Commission-free trading**: Modern broker feature
- **Learning curve**: Typically 2-3 years to proficiency`,
          quiz_questions: [
            {
              question: "What is a retail trader?",
              options: [
                "Someone who works at a retail store",
                "An individual trading their personal account",
                "A professional at a hedge fund",
                "Someone who only trades retail stocks"
              ],
              correct_answer: 1,
              explanation: "Retail traders are individual investors trading their own money through personal brokerage accounts."
            },
            {
              question: "What is an advantage retail traders have over institutions?",
              options: [
                "More money to trade",
                "Better research resources",
                "Flexibility and no performance pressure",
                "Faster computer systems"
              ],
              correct_answer: 2,
              explanation: "Retail traders have flexibility to trade their own strategy without quarterly performance pressure from bosses or investors."
            },
            {
              question: "How long does it typically take to become a consistently profitable trader?",
              options: [
                "A few weeks",
                "About 3 months",
                "2-3 years",
                "10+ years"
              ],
              correct_answer: 2,
              explanation: "Most successful retail traders report that it took 2-3 years of practice and learning to become consistently profitable."
            }
          ]
        }
      ]
    },
    // Module 2: Options Basics
    {
      title: "Options Basics: What Options Are and How They Work",
      description: "Master the fundamental mechanics of options contracts, including calls, puts, strikes, and expiration.",
      lessons: [
        {
          title: "Call Options Explained",
          description: "Learn what call options are and how they work.",
          duration: "25 min",
          content_markdown: `# Call Options Explained

## Learning Objectives
- Understand what a call option is
- Know the key components of a call option
- Recognize when calls are profitable
- Calculate basic call option outcomes

## What Is a Call Option?

A call option gives you the **RIGHT to BUY** 100 shares of a stock at a specific price (strike price) before a certain date (expiration).

Think of it like a **reservation to buy**:
- You're locking in a purchase price
- You pay a small fee (premium) for this right
- You're not obligated to buy - it's optional!

## Key Components

### 1. Underlying Stock
The stock the option is based on (e.g., AAPL, TSLA, SPY)

### 2. Strike Price
The price at which you CAN buy the stock
- Example: AAPL $150 call = right to buy at $150

### 3. Expiration Date
When the option expires (becomes worthless if not used)
- Weekly, monthly, or LEAPS (1-2+ years)

### 4. Premium
What you pay for the option contract
- $3.00 premium × 100 shares = $300 total cost

## Example: Buying a Call

**Scenario**: AAPL is trading at $150

You buy: AAPL $155 Call expiring in 30 days for $2.00

- **Cost**: $2.00 × 100 = $200
- **Break-even**: $155 + $2 = $157
- **Max loss**: $200 (premium paid)
- **Max profit**: Unlimited (stock can go to any price!)

**If AAPL goes to $165 at expiration**:
- Your call is worth: $165 - $155 = $10.00
- Value: $10 × 100 = $1,000
- Profit: $1,000 - $200 = $800 (400% return!)

**If AAPL stays at $150 at expiration**:
- Your call is worth: $0 (below strike)
- You lose: $200 (100% of premium)

## When to Buy Calls

Consider buying calls when:
- You're **bullish** (expect stock to go UP)
- You want leverage with limited risk
- You want to control shares with less capital

## Key Takeaways
1. Calls give the right to BUY at the strike price
2. You pay a premium for this right
3. Max loss is limited to premium paid
4. Profit potential is unlimited

## Quick Reference
- **Call buyer**: Wants stock to go UP
- **Strike price**: Your purchase price guarantee
- **Premium**: Cost of the option
- **Break-even**: Strike + Premium paid`,
          quiz_questions: [
            {
              question: "What does a call option give you the right to do?",
              options: [
                "The right to SELL shares at the strike price",
                "The right to BUY shares at the strike price",
                "The obligation to buy shares",
                "Free shares of stock"
              ],
              correct_answer: 1,
              explanation: "A call option gives you the RIGHT (not obligation) to BUY shares at the specified strike price."
            },
            {
              question: "If you buy a call for $3.00 premium, what is your maximum loss?",
              options: [
                "Unlimited",
                "$300 (premium × 100 shares)",
                "$3.00",
                "There is no maximum loss"
              ],
              correct_answer: 1,
              explanation: "When buying options, your maximum loss is the premium paid. $3.00 × 100 shares = $300 maximum loss."
            },
            {
              question: "What market outlook should you have when buying calls?",
              options: [
                "Bearish (expecting price to fall)",
                "Neutral (expecting price to stay same)",
                "Bullish (expecting price to rise)",
                "Uncertain"
              ],
              correct_answer: 2,
              explanation: "Calls profit when the underlying stock price rises, so you should be bullish when buying calls."
            }
          ]
        },
        {
          title: "Put Options Explained",
          description: "Learn what put options are and how they provide downside exposure.",
          duration: "25 min",
          content_markdown: `# Put Options Explained

## Learning Objectives
- Understand what a put option is
- Know when puts are profitable
- Compare puts to calls
- Calculate basic put option outcomes

## What Is a Put Option?

A put option gives you the **RIGHT to SELL** 100 shares of a stock at a specific price (strike price) before a certain date (expiration).

Think of it like **price insurance**:
- You're locking in a minimum sale price
- You pay a premium for this protection
- You're not obligated to sell - it's optional!

## Key Components (Same as Calls)

1. **Underlying Stock**: What the put is based on
2. **Strike Price**: Price you CAN sell at
3. **Expiration Date**: When it expires
4. **Premium**: What you pay for the contract

## The Opposite of Calls

| Call | Put |
|------|-----|
| Right to BUY | Right to SELL |
| Bullish | Bearish |
| Profits when stock rises | Profits when stock falls |
| Break-even: Strike + Premium | Break-even: Strike - Premium |

## Example: Buying a Put

**Scenario**: AAPL is trading at $150

You buy: AAPL $145 Put expiring in 30 days for $2.00

- **Cost**: $2.00 × 100 = $200
- **Break-even**: $145 - $2 = $143
- **Max loss**: $200 (premium paid)
- **Max profit**: $14,300 (if stock goes to $0)

**If AAPL drops to $130 at expiration**:
- Your put is worth: $145 - $130 = $15.00
- Value: $15 × 100 = $1,500
- Profit: $1,500 - $200 = $1,300 (650% return!)

**If AAPL stays at $150 at expiration**:
- Your put is worth: $0 (stock above strike)
- You lose: $200 (100% of premium)

## When to Buy Puts

Consider buying puts when:
- You're **bearish** (expect stock to go DOWN)
- You want to hedge existing stock positions
- You want downside exposure with limited risk

## Puts as Insurance

Own 100 shares of AAPL at $150? 
Worried about a crash?

Buy a $145 put = you can always sell at $145 no matter how far the stock drops!

This is called a **protective put**.

## Key Takeaways
1. Puts give the right to SELL at the strike price
2. Puts profit when the stock price falls
3. Max loss is limited to premium paid
4. Puts can be used as insurance for stock holdings

## Quick Reference
- **Put buyer**: Wants stock to go DOWN
- **Protective put**: Insurance for stock you own
- **Break-even**: Strike - Premium paid
- **Maximum profit**: Strike - Premium (if stock goes to $0)`,
          quiz_questions: [
            {
              question: "What does a put option give you the right to do?",
              options: [
                "The right to BUY shares at the strike price",
                "The right to SELL shares at the strike price",
                "The right to hold shares forever",
                "Free stock shares"
              ],
              correct_answer: 1,
              explanation: "A put option gives you the RIGHT (not obligation) to SELL shares at the specified strike price."
            },
            {
              question: "If you own stock and are worried about a price drop, what option strategy provides protection?",
              options: [
                "Buy a call",
                "Sell a put",
                "Buy a put (protective put)",
                "Do nothing"
              ],
              correct_answer: 2,
              explanation: "A protective put allows you to sell your shares at the strike price regardless of how far the stock drops."
            },
            {
              question: "What is the break-even for a $50 strike put bought for $2?",
              options: [
                "$52",
                "$50",
                "$48",
                "$46"
              ],
              correct_answer: 2,
              explanation: "Put break-even = Strike - Premium. $50 - $2 = $48. The stock must fall below $48 to profit."
            }
          ]
        },
        {
          title: "Strike Prices and Moneyness",
          description: "Understand how to choose strike prices and what ITM, ATM, and OTM mean.",
          duration: "25 min",
          content_markdown: `# Strike Prices and Moneyness

## Learning Objectives
- Understand what strike prices represent
- Know the difference between ITM, ATM, and OTM
- Recognize how moneyness affects option prices
- Choose appropriate strikes for your strategy

## What Is Moneyness?

"Moneyness" describes the relationship between the strike price and the current stock price.

There are three categories:
1. **In-The-Money (ITM)**: Has immediate value
2. **At-The-Money (ATM)**: Strike ≈ current price
3. **Out-Of-The-Money (OTM)**: No immediate value

## For CALL Options

**Example**: Stock trading at $100

| Strike | Moneyness | Intrinsic Value |
|--------|-----------|-----------------|
| $90 | ITM | $10 |
| $100 | ATM | $0 |
| $110 | OTM | $0 |

**Calls are ITM when**: Strike < Stock Price
**Calls are OTM when**: Strike > Stock Price

## For PUT Options

**Example**: Stock trading at $100

| Strike | Moneyness | Intrinsic Value |
|--------|-----------|-----------------|
| $110 | ITM | $10 |
| $100 | ATM | $0 |
| $90 | OTM | $0 |

**Puts are ITM when**: Strike > Stock Price
**Puts are OTM when**: Strike < Stock Price

## Why Moneyness Matters

### ITM Options
- **More expensive** (have intrinsic value)
- **Higher probability** of profit
- **Move more** like the stock (higher delta)
- Good for: Conservative trades, stock replacement

### ATM Options
- **Moderate cost**
- **50% probability** of expiring ITM
- **Most time value** (theta)
- Good for: Directional trades with moderate outlook

### OTM Options
- **Cheapest** (all time value, no intrinsic)
- **Lower probability** of profit
- **Highest leverage** if right
- Good for: Speculative trades, defined-risk bets

## Choosing Strikes: A Framework

**Conservative**: ITM strikes (higher cost, higher probability)
**Moderate**: ATM or slightly OTM (balanced approach)
**Aggressive**: Deep OTM (low cost, low probability)

## Key Takeaways
1. Moneyness describes strike vs. stock price relationship
2. ITM options have intrinsic value; OTM do not
3. The relationship is OPPOSITE for calls vs puts
4. Strike choice affects cost, probability, and risk

## Quick Reference
- **ITM Call**: Strike below current price
- **ITM Put**: Strike above current price
- **ATM**: Strike approximately equals price
- **OTM**: No intrinsic value currently`,
          quiz_questions: [
            {
              question: "If a stock is at $75 and you have a $70 call, what is the moneyness?",
              options: [
                "Out-of-the-money",
                "At-the-money",
                "In-the-money",
                "No-money"
              ],
              correct_answer: 2,
              explanation: "A call is in-the-money when the strike is below the stock price. $70 strike < $75 stock = ITM."
            },
            {
              question: "Which option type is typically the cheapest to buy?",
              options: [
                "ITM (in-the-money)",
                "ATM (at-the-money)",
                "OTM (out-of-the-money)",
                "They all cost the same"
              ],
              correct_answer: 2,
              explanation: "OTM options are cheapest because they have no intrinsic value - only time value."
            },
            {
              question: "If a stock is at $50, which put strike is in-the-money?",
              options: [
                "$45 put",
                "$50 put",
                "$55 put",
                "None of them"
              ],
              correct_answer: 2,
              explanation: "Puts are ITM when the strike is ABOVE the stock price. $55 > $50, so the $55 put is ITM."
            }
          ]
        },
        {
          title: "Expiration Dates and Time",
          description: "Learn about option expiration cycles and how time affects options.",
          duration: "20 min",
          content_markdown: `# Expiration Dates and Time

## Learning Objectives
- Understand option expiration cycles
- Know the difference between weekly, monthly, and LEAPS
- Recognize how time to expiration affects options
- Choose appropriate expirations for your trades

## What Is Expiration?

Every option has an **expiration date** - the last day it can be exercised.

After expiration:
- ITM options are exercised or assigned
- OTM options become worthless
- All extrinsic (time) value disappears

## Types of Expirations

### Weekly Options
- Expire every Friday
- Short-term trades (1-7 days)
- High time decay, cheaper
- Higher risk of total loss

### Monthly Options
- Expire third Friday of each month
- Standard expiration cycle
- Most liquid (highest volume)
- Common choice for swing trades

### LEAPS (Long-Term Options)
- Expire 1-2+ years out
- Lowest time decay rate
- Most expensive
- Used for longer-term positions

## Days to Expiration (DTE)

DTE = Days remaining until expiration

| DTE | Description | Time Decay |
|-----|-------------|------------|
| 45+ | Long-term | Slow |
| 21-45 | Medium-term | Moderate |
| 7-21 | Short-term | Fast |
| 0-7 | Expiration week | Very fast |

## Time Decay Acceleration

**Important concept**: Time decay is NOT linear!

- Far from expiration: Slow, steady decay
- Close to expiration: Rapid, accelerating decay

The last 30 days see the most time value loss.

## Choosing Expiration: Guidelines

**For directional trades**:
- Give yourself time to be right
- 30-45 DTE is a good starting point
- Avoid expiration week (unless you know what you're doing)

**For income strategies** (selling options):
- 30-45 DTE captures sweet spot of decay
- Close before expiration week volatility

## Key Takeaways
1. Every option has a defined expiration date
2. Time decay accelerates as expiration approaches
3. Weekly, monthly, and LEAPS serve different purposes
4. Give yourself adequate time when buying options

## Quick Reference
- **DTE**: Days to expiration
- **Weekly**: 0-7 days typically
- **Monthly**: Standard 3rd Friday cycle
- **LEAPS**: 1+ year expirations
- **Time decay acceleration**: Last 30 days = fastest decay`,
          quiz_questions: [
            {
              question: "When do most monthly options expire?",
              options: [
                "First Friday of the month",
                "Last day of the month",
                "Third Friday of the month",
                "Monday after the third Friday"
              ],
              correct_answer: 2,
              explanation: "Standard monthly options expire on the third Friday of each month."
            },
            {
              question: "When is time decay fastest on options?",
              options: [
                "In the first week after purchase",
                "When there are 45+ days remaining",
                "In the final 30 days, especially the last week",
                "Time decay is constant throughout"
              ],
              correct_answer: 2,
              explanation: "Time decay accelerates as expiration approaches, with the fastest decay occurring in the final 30 days."
            },
            {
              question: "What does LEAPS stand for?",
              options: [
                "Limited Entry And Protection System",
                "Long-term Equity Anticipation Securities",
                "Low-risk Entry And Profit Strategy",
                "Leveraged Enhanced Appreciation Products"
              ],
              correct_answer: 1,
              explanation: "LEAPS stands for Long-term Equity Anticipation Securities - options with expirations of 1-2+ years."
            }
          ]
        },
        {
          title: "Contract Sizing and Multipliers",
          description: "Understand how option contracts are sized and what the multiplier means.",
          duration: "15 min",
          content_markdown: `# Contract Sizing and Multipliers

## Learning Objectives
- Understand that 1 option = 100 shares
- Calculate total cost and value of positions
- Avoid common sizing mistakes
- Know when multipliers differ

## The 100-Share Standard

**One options contract controls 100 shares of stock.**

This is why options provide leverage:
- Stock at $50 = $5,000 for 100 shares
- Option at $2 = $200 for control of 100 shares

## The Math: Premium × 100

When you see an option quote:
- Quote: $3.50
- Actual cost: $3.50 × 100 = **$350**

**Always multiply by 100** to know your real cost!

## Examples

### Buying 1 Contract
- Premium: $2.00
- Cost: $2.00 × 100 = $200

### Buying 5 Contracts
- Premium: $2.00
- Cost: $2.00 × 100 × 5 = $1,000

### Selling 3 Contracts
- Premium received: $1.50
- Cash received: $1.50 × 100 × 3 = $450

## Calculating P&L

**At expiration**, if your option is worth $5.00:
- Value: $5.00 × 100 = $500 per contract

**Profit** = (Exit value - Entry cost) × Number of contracts

## Common Mistakes to Avoid

### Mistake 1: Forgetting the multiplier
"I'll risk $200" → Buying 2 contracts at $1.00 = $200 ✓
"I'll buy 2 contracts at $200" = $40,000! ✗

### Mistake 2: Over-sizing
Buying 10 contracts on a small account concentrates too much risk.

### Mistake 3: Ignoring total exposure
10 contracts of a $100 stock = exposure to 1,000 shares = $100,000!

## When Multipliers Differ

Most stock options: 100 shares
**Exceptions** (mini options, adjusted options after splits):
- Some may be 10 or other amounts
- Always verify before trading unusual options

## Key Takeaways
1. Standard option = 100 shares
2. Always multiply premium by 100 for real cost
3. Multiple contracts = premium × 100 × contracts
4. Be aware of your total exposure

## Quick Reference
- **1 contract** = 100 shares controlled
- **Cost calculation**: Premium × 100 × contracts
- **Notional exposure**: Strike × 100 × contracts
- **Mini options**: 10 shares (less common)`,
          quiz_questions: [
            {
              question: "How many shares does one standard options contract control?",
              options: [
                "10 shares",
                "50 shares",
                "100 shares",
                "1,000 shares"
              ],
              correct_answer: 2,
              explanation: "One standard options contract controls 100 shares of the underlying stock."
            },
            {
              question: "If an option is quoted at $4.25, how much does 1 contract cost?",
              options: [
                "$4.25",
                "$42.50",
                "$425",
                "$4,250"
              ],
              correct_answer: 2,
              explanation: "Option cost = Premium × 100. $4.25 × 100 = $425 per contract."
            },
            {
              question: "If you buy 3 contracts at $2.00 premium, what is your total cost?",
              options: [
                "$6.00",
                "$60",
                "$200",
                "$600"
              ],
              correct_answer: 3,
              explanation: "Total cost = Premium × 100 × Contracts. $2.00 × 100 × 3 = $600."
            }
          ]
        }
      ]
    },
    // Module 3: How Options Make and Lose Money
    {
      title: "How Options Make and Lose Money",
      description: "Understand the components of option pricing and how profits and losses are generated.",
      lessons: [
        {
          title: "Intrinsic Value Explained",
          description: "Learn what intrinsic value is and how to calculate it.",
          duration: "20 min",
          content_markdown: `# Intrinsic Value Explained

## Learning Objectives
- Define intrinsic value for options
- Calculate intrinsic value for calls and puts
- Understand when options have intrinsic value
- Recognize its role in option pricing

## What Is Intrinsic Value?

Intrinsic value is the **real, immediate value** of an option if you exercised it right now.

It's the difference between:
- Current stock price
- Strike price

**Only ITM options have intrinsic value.**

## Calculating Intrinsic Value

### For CALLS
**Intrinsic Value = Stock Price - Strike Price** (if positive)

Example: Stock at $55, Strike at $50
- Call intrinsic value = $55 - $50 = **$5.00**

### For PUTS
**Intrinsic Value = Strike Price - Stock Price** (if positive)

Example: Stock at $45, Strike at $50
- Put intrinsic value = $50 - $45 = **$5.00**

## Intrinsic Value Cannot Be Negative

If the calculation gives a negative number, intrinsic value = $0

Example: Stock at $48, $50 Call Strike
- Calculation: $48 - $50 = -$2
- Intrinsic value = **$0** (not -$2)

## Quick Reference Table

| Stock Price | $50 Call Intrinsic | $50 Put Intrinsic |
|-------------|-------------------|-------------------|
| $55 | $5 | $0 |
| $50 | $0 | $0 |
| $45 | $0 | $5 |

## Why Intrinsic Value Matters

1. **Minimum option value**: An option must be worth at least its intrinsic value
2. **Immediate profit potential**: ITM options have "built-in" value
3. **Exercise decisions**: At expiration, only intrinsic value remains

## Intrinsic vs Time Value

Total Option Value = Intrinsic Value + Time Value

An option priced at $6.00 with $4 intrinsic value:
- Intrinsic: $4.00
- Time value: $6.00 - $4.00 = $2.00

## Key Takeaways
1. Intrinsic value = immediate exercise value
2. Only ITM options have intrinsic value
3. Call: Stock - Strike (if positive)
4. Put: Strike - Stock (if positive)

## Quick Reference
- **Intrinsic value**: Real, tangible value
- **ITM only**: OTM options have $0 intrinsic
- **At expiration**: Only intrinsic value remains
- **Minimum floor**: Options ≥ intrinsic value`,
          quiz_questions: [
            {
              question: "If a stock is at $62 and you have a $55 call, what is the intrinsic value?",
              options: [
                "$0",
                "$5",
                "$7",
                "$62"
              ],
              correct_answer: 2,
              explanation: "Call intrinsic value = Stock Price - Strike. $62 - $55 = $7."
            },
            {
              question: "Can intrinsic value ever be negative?",
              options: [
                "Yes, for puts only",
                "Yes, for deep OTM options",
                "No, minimum is $0",
                "Yes, at expiration"
              ],
              correct_answer: 2,
              explanation: "Intrinsic value cannot be negative. If the calculation is negative, intrinsic value = $0."
            },
            {
              question: "Which type of option has intrinsic value?",
              options: [
                "ATM (at-the-money)",
                "OTM (out-of-the-money)",
                "ITM (in-the-money)",
                "All options have intrinsic value"
              ],
              correct_answer: 2,
              explanation: "Only in-the-money (ITM) options have intrinsic value. ATM and OTM options have $0 intrinsic."
            }
          ]
        },
        {
          title: "Extrinsic (Time) Value Explained",
          description: "Understand what extrinsic value is and how it decays over time.",
          duration: "20 min",
          content_markdown: `# Extrinsic (Time) Value Explained

## Learning Objectives
- Understand what extrinsic value represents
- Know what factors affect time value
- Recognize how time value decays
- Calculate time value from option prices

## What Is Extrinsic Value?

Extrinsic value (also called time value) represents the **potential** for an option to gain value before expiration.

**Extrinsic Value = Option Price - Intrinsic Value**

## What Creates Extrinsic Value?

1. **Time remaining**: More time = more opportunity = more value
2. **Volatility**: More uncertainty = higher premiums
3. **Interest rates**: Minor factor for most retail trades

## Calculating Time Value

**Formula**: Time Value = Option Price - Intrinsic Value

### Example 1: ITM Call
- Stock: $55
- Strike: $50
- Option price: $7.00
- Intrinsic value: $55 - $50 = $5.00
- **Time value: $7.00 - $5.00 = $2.00**

### Example 2: OTM Call
- Stock: $55
- Strike: $60
- Option price: $1.50
- Intrinsic value: $0 (OTM)
- **Time value: $1.50 - $0 = $1.50**

*OTM options are 100% time value!*

## Time Value by Moneyness

| Moneyness | Time Value |
|-----------|------------|
| Deep ITM | Low |
| ITM | Moderate |
| ATM | Highest |
| OTM | Moderate |
| Deep OTM | Low |

**ATM options have the most time value** because there's the most uncertainty about where the stock will end up.

## Time Value Decay (Theta)

Time value **decreases** as expiration approaches.

This decay:
- Is not linear (accelerates near expiration)
- Hurts option buyers
- Benefits option sellers
- Stops at expiration (time value = $0)

## Implications for Trading

**Buying options**: Time is working against you
**Selling options**: Time is working for you

This is why many traders prefer to sell options or choose longer expirations when buying.

## Key Takeaways
1. Extrinsic value = potential for future gain
2. ATM options have the most time value
3. Time value decays to zero at expiration
4. Time decay accelerates as expiration nears

## Quick Reference
- **Time value**: Premium beyond intrinsic
- **OTM options**: 100% time value
- **ATM options**: Highest time value
- **Theta decay**: Loss of time value over time`,
          quiz_questions: [
            {
              question: "An option costs $8, and its intrinsic value is $5. What is the time value?",
              options: [
                "$5",
                "$3",
                "$8",
                "$13"
              ],
              correct_answer: 1,
              explanation: "Time Value = Option Price - Intrinsic Value. $8 - $5 = $3."
            },
            {
              question: "Which type of option has the highest time value?",
              options: [
                "Deep ITM",
                "ATM (at-the-money)",
                "Deep OTM",
                "All options have equal time value"
              ],
              correct_answer: 1,
              explanation: "ATM options have the highest time value because there's the most uncertainty about whether they'll finish ITM or OTM."
            },
            {
              question: "If you buy options, how does time decay affect you?",
              options: [
                "It helps you by increasing option value",
                "It hurts you by decreasing option value",
                "It has no effect",
                "It only matters at expiration"
              ],
              correct_answer: 1,
              explanation: "Time decay (theta) works against option buyers by eroding the time value of their positions daily."
            }
          ]
        },
        {
          title: "Understanding Payoff Diagrams",
          description: "Learn to read and interpret option payoff diagrams.",
          duration: "25 min",
          content_markdown: `# Understanding Payoff Diagrams

## Learning Objectives
- Read and interpret payoff diagrams
- Identify break-even points
- Understand max profit and max loss visually
- Create mental models for option positions

## What Is a Payoff Diagram?

A payoff diagram shows your **profit or loss** at various stock prices at expiration.

- **X-axis**: Stock price at expiration
- **Y-axis**: Profit (+) or Loss (-)
- **Break-even**: Where line crosses $0

## Long Call Payoff

**Example**: Buy $50 Call for $3.00

The shape:
- Flat loss line below strike ($50)
- Upward sloping line above strike
- Break-even at $53 (strike + premium)

| Stock Price | P&L |
|-------------|-----|
| $45 | -$300 |
| $50 | -$300 |
| $53 | $0 |
| $60 | +$700 |

**Max Loss**: $300 (premium paid)
**Max Profit**: Unlimited

## Long Put Payoff

**Example**: Buy $50 Put for $2.00

The shape:
- Downward sloping line below strike
- Flat loss line above strike ($50)
- Break-even at $48 (strike - premium)

| Stock Price | P&L |
|-------------|-----|
| $40 | +$800 |
| $48 | $0 |
| $50 | -$200 |
| $55 | -$200 |

**Max Loss**: $200 (premium paid)
**Max Profit**: $4,800 (if stock goes to $0)

## Key Visual Patterns

### Buying Options (Long)
- Limited downside (flat line)
- Unlimited or large upside (sloped line)
- Premium paid = max loss

### Selling Options (Short)
- Limited upside (flat premium received)
- Unlimited or large downside (sloped line)
- Premium received = max profit

## Reading Break-Even

**Long Call Break-Even** = Strike + Premium Paid
**Long Put Break-Even** = Strike - Premium Paid

The stock must move PAST break-even for you to profit.

## Using Payoffs for Decision Making

Before entering a trade, mentally visualize:
1. What's my max loss?
2. What's my break-even?
3. What price do I need for my target profit?
4. Is the risk/reward acceptable?

## Key Takeaways
1. Payoff diagrams show profit/loss at various prices
2. Long options have limited loss, extended profit potential
3. Break-even is where your P&L equals zero
4. Use diagrams to evaluate risk/reward before trading

## Quick Reference
- **Long call**: Slopes up above strike, flat below
- **Long put**: Slopes down below strike, flat above
- **Break-even call**: Strike + Premium
- **Break-even put**: Strike - Premium`,
          quiz_questions: [
            {
              question: "On a long call payoff diagram, what does the flat line below the strike represent?",
              options: [
                "Unlimited profit",
                "Maximum loss (premium paid)",
                "Break-even point",
                "Stock price increase"
              ],
              correct_answer: 1,
              explanation: "The flat line below the strike represents the maximum loss, which is the premium paid for the call."
            },
            {
              question: "You buy a $60 call for $4. What is your break-even price?",
              options: [
                "$56",
                "$60",
                "$64",
                "$66"
              ],
              correct_answer: 2,
              explanation: "Long call break-even = Strike + Premium. $60 + $4 = $64."
            },
            {
              question: "On a payoff diagram, where does profit begin?",
              options: [
                "At the strike price",
                "At the break-even point",
                "At the premium price",
                "At expiration"
              ],
              correct_answer: 1,
              explanation: "Profit begins once the stock price moves past the break-even point."
            }
          ]
        },
        {
          title: "Maximum Profit and Maximum Loss",
          description: "Calculate the maximum profit and loss for basic option positions.",
          duration: "20 min",
          content_markdown: `# Maximum Profit and Maximum Loss

## Learning Objectives
- Calculate max profit for long options
- Calculate max loss for long options
- Understand risk/reward before entering trades
- Apply these concepts to trading decisions

## Long Call: Max Profit & Loss

### Max Loss
**Premium Paid × 100**

You can only lose what you paid for the option.

Example: Bought call for $3.50
- Max Loss = $3.50 × 100 = **$350**

### Max Profit
**Unlimited** (theoretically)

As the stock rises, your call gains value indefinitely.

Practical calculation at a target:
- Target stock price - Strike - Premium = Profit per share
- × 100 = Total profit

## Long Put: Max Profit & Loss

### Max Loss
**Premium Paid × 100**

Same as calls - limited to what you paid.

Example: Bought put for $2.00
- Max Loss = $2.00 × 100 = **$200**

### Max Profit
**(Strike Price - Premium) × 100**

A stock can only go to $0, so profit is capped.

Example: $50 strike put bought for $2
- Max Profit = ($50 - $2) × 100 = **$4,800**

## Risk/Reward Calculations

Before any trade, calculate:

1. **Risk** = Premium paid
2. **Target reward** = Expected profit at target price
3. **Risk/Reward Ratio** = Reward ÷ Risk

### Example: Long Call Trade

Buy $100 Call for $5, expecting stock to reach $115

- Risk: $5 × 100 = $500
- Reward at $115: ($115 - $100 - $5) × 100 = $1,000
- Risk/Reward: $1,000 ÷ $500 = 2:1

**Aim for at least 2:1 risk/reward on directional trades!**

## When to Walk Away

Poor risk/reward examples:
- Risking $500 to make $200 (0.4:1)
- Needing a 30% move for break-even
- Premium costs more than expected profit

Always calculate before you click buy!

## Quick Calculation Cheat Sheet

| Position | Max Loss | Max Profit |
|----------|----------|------------|
| Long Call | Premium | Unlimited |
| Long Put | Premium | (Strike - Premium) × 100 |
| Short Call | Unlimited | Premium |
| Short Put | (Strike - Premium) × 100 | Premium |

## Key Takeaways
1. Long options: Max loss = premium paid
2. Long calls: Unlimited profit potential
3. Long puts: Max profit if stock goes to $0
4. Always calculate risk/reward before trading

## Quick Reference
- **Risk/Reward**: Target profit ÷ Risk (premium)
- **Good ratio**: 2:1 or better
- **Break-even**: Must be achievable
- **Walk away**: If math doesn't work`,
          quiz_questions: [
            {
              question: "What is the maximum loss when buying a call option?",
              options: [
                "Unlimited",
                "The strike price",
                "The premium paid",
                "The stock price"
              ],
              correct_answer: 2,
              explanation: "When buying options, your maximum loss is always limited to the premium you paid."
            },
            {
              question: "You buy a $40 put for $1.50. What is your maximum possible profit?",
              options: [
                "$150",
                "$3,850",
                "$4,000",
                "Unlimited"
              ],
              correct_answer: 1,
              explanation: "Max put profit = (Strike - Premium) × 100. ($40 - $1.50) × 100 = $3,850."
            },
            {
              question: "What is a good minimum risk/reward ratio for directional trades?",
              options: [
                "0.5:1",
                "1:1",
                "2:1 or better",
                "10:1"
              ],
              correct_answer: 2,
              explanation: "Aim for at least 2:1 risk/reward, meaning you target making at least $2 for every $1 risked."
            }
          ]
        },
        {
          title: "Time Decay and Its Impact",
          description: "Understand how time decay (theta) affects your options daily.",
          duration: "25 min",
          content_markdown: `# Time Decay and Its Impact

## Learning Objectives
- Understand what theta (time decay) is
- Know how time decay accelerates
- Recognize its impact on your positions
- Learn strategies to manage time decay

## What Is Theta?

Theta measures how much an option loses in value each day due to the passage of time, all else being equal.

**Theta is expressed as a negative number** for option buyers because it represents value LOST.

Example: Theta of -0.05
- Option loses approximately $5 per day (per contract)

## The Theta Decay Curve

Time decay is **NOT linear** - it accelerates as expiration approaches.

| Days to Expiration | Decay Rate |
|-------------------|------------|
| 90 days | Slow |
| 60 days | Moderate |
| 45 days | Noticeable |
| 30 days | Fast |
| 14 days | Very fast |
| 7 days | Extreme |

The last 30 days see the most dramatic time value loss!

## Example: $5 Option Over Time

Starting value: $5.00 (100% time value, OTM option)

| Days Remaining | Value | Daily Loss |
|---------------|-------|------------|
| 60 | $5.00 | $0.02 |
| 45 | $4.10 | $0.03 |
| 30 | $3.00 | $0.05 |
| 14 | $1.50 | $0.10 |
| 7 | $0.70 | $0.10 |
| 1 | $0.05 | $0.05 |

## Impact on Different Strategies

### Long Options (Buying)
- Theta works AGAINST you
- You lose money just by waiting
- Need stock to move to overcome decay

### Short Options (Selling)
- Theta works FOR you
- You profit just by time passing
- Time is your friend

## Managing Time Decay When Buying

1. **Choose longer expirations**: 45+ DTE reduces daily decay
2. **Have a quick thesis**: Don't hold if not working
3. **Set time stops**: Exit at X days if not profitable
4. **Avoid expiration week**: Decay is brutal

## The 21-Day Rule

Many traders avoid holding long options inside 21 DTE:
- Time decay accelerates dramatically
- Stock needs bigger moves to profit
- Risk of total loss increases

Consider closing or rolling at 21 DTE if not already profitable.

## Key Takeaways
1. Theta = daily time value loss
2. Decay accelerates near expiration
3. Buyers fight theta; sellers profit from it
4. Choose expirations wisely when buying

## Quick Reference
- **Theta**: Time decay per day
- **Negative theta**: Value lost (buyers)
- **Positive theta**: Value gained (sellers)
- **Sweet spot for buying**: 45+ DTE
- **Danger zone**: Inside 21 DTE`,
          quiz_questions: [
            {
              question: "What does theta measure?",
              options: [
                "How much an option gains per day",
                "How much an option loses in value each day due to time",
                "The speed of stock price movement",
                "Volatility changes"
              ],
              correct_answer: 1,
              explanation: "Theta measures the daily time decay - how much value an option loses each day as expiration approaches."
            },
            {
              question: "When is time decay fastest?",
              options: [
                "90 days before expiration",
                "60 days before expiration",
                "In the final 30 days, especially the last week",
                "Time decay is constant"
              ],
              correct_answer: 2,
              explanation: "Time decay accelerates dramatically in the final 30 days, with the most rapid decay in the last week."
            },
            {
              question: "How does theta affect option sellers?",
              options: [
                "They lose money from theta",
                "Theta has no effect on sellers",
                "They profit from theta (time decay works for them)",
                "Theta only affects sellers at expiration"
              ],
              correct_answer: 2,
              explanation: "Option sellers benefit from theta because they keep premium as time value decays."
            }
          ]
        }
      ]
    },
    // Module 4: Brokerage Accounts & Platform Basics
    {
      title: "Brokerage Accounts & Platform Basics",
      description: "Learn how to set up your trading account and navigate options trading platforms.",
      lessons: [
        {
          title: "Types of Brokerage Accounts",
          description: "Understand the different account types and which is right for you.",
          duration: "20 min",
          content_markdown: `# Types of Brokerage Accounts

## Learning Objectives
- Know the main types of brokerage accounts
- Understand cash vs margin accounts
- Recognize IRA account considerations
- Choose the right account for your needs

## Cash vs Margin Accounts

### Cash Account
- Trade only with deposited cash
- No borrowing from broker
- Simpler, more limited
- Good for beginners

**Limitations**:
- Must wait for trades to settle (T+1 for stocks)
- Cannot short sell
- No margin strategies

### Margin Account
- Can borrow from broker
- More strategies available
- Required for advanced options
- Pattern Day Trader rules apply

**Benefits**:
- Immediate settlement for options
- Short selling allowed
- Spread strategies enabled
- More flexibility

## Options Approval Levels

Brokers require approval to trade options:

| Level | Strategies Allowed |
|-------|-------------------|
| 1 | Covered calls, protective puts |
| 2 | Buying calls and puts |
| 3 | Spreads (debit and credit) |
| 4 | Naked puts |
| 5 | Naked calls (highest risk) |

**Start at Level 2** to buy calls and puts safely.

## IRA Accounts

### Traditional IRA
- Tax-deferred growth
- Pre-tax contributions
- Taxes on withdrawal

### Roth IRA
- Tax-free growth
- After-tax contributions
- No taxes on qualified withdrawals

**Options in IRAs**:
- Usually limited to levels 1-2
- No margin (IRA rules)
- Great for covered calls

## Choosing Your Account

### Beginner Recommendation
1. Open a **cash account** first
2. Apply for **Level 2 options**
3. Trade small while learning
4. Upgrade to margin when ready

### Key Questions to Ask
- What are your commission fees?
- What options levels do you offer?
- What is the minimum to open?
- Is there a paper trading platform?

## Key Takeaways
1. Cash accounts are simpler; margin allows more strategies
2. Options require approval levels
3. Start with Level 2 approval for basic trades
4. Consider paper trading before real money

## Quick Reference
- **Cash account**: Trade with deposited cash only
- **Margin account**: Can borrow, more strategies
- **Options level 2**: Buy calls and puts
- **Options level 3**: Spreads`,
          quiz_questions: [
            {
              question: "What type of account is required to trade option spreads?",
              options: [
                "Cash account",
                "Margin account with spread approval",
                "IRA account",
                "Any account can trade spreads"
              ],
              correct_answer: 1,
              explanation: "Spread strategies typically require a margin account with Level 3 options approval."
            },
            {
              question: "Which options approval level allows buying calls and puts?",
              options: [
                "Level 1",
                "Level 2",
                "Level 4",
                "Level 5"
              ],
              correct_answer: 1,
              explanation: "Level 2 options approval allows you to buy calls and puts, which is the appropriate starting level for most beginners."
            },
            {
              question: "Why might a beginner start with a cash account?",
              options: [
                "Higher returns",
                "More strategies available",
                "Simpler, forces discipline, no margin risk",
                "Required by law"
              ],
              correct_answer: 2,
              explanation: "Cash accounts are simpler, prevent over-leveraging, and force discipline - good training for beginners."
            }
          ]
        },
        {
          title: "Order Types: Market, Limit, and More",
          description: "Master the different order types for options trading.",
          duration: "25 min",
          content_markdown: `# Order Types: Market, Limit, and More

## Learning Objectives
- Understand market vs limit orders
- Know when to use each order type
- Learn about stop orders
- Avoid common order mistakes

## Market Orders

**What it does**: Buys/sells immediately at the current best price

**Pros**:
- Guaranteed execution
- Fast fills

**Cons**:
- No price control
- May get poor fills on wide spreads
- AVOID for options!

**For options**: Generally NOT recommended due to wide bid-ask spreads.

## Limit Orders

**What it does**: Sets the maximum (buy) or minimum (sell) price you'll accept

**Pros**:
- Price control
- Better fills on average
- Essential for options

**Cons**:
- May not get filled
- Takes longer

**For options**: ALWAYS use limit orders!

## Example: Limit vs Market

Option bid-ask: $2.00 × $2.20

**Market buy**: You pay $2.20 (ask)
**Limit buy at $2.10**: May get filled at $2.10 (or not filled)

The $0.10 savings × 100 = $10 per contract!

## Where to Set Limit Prices

### Buying Options
- Start at mid-point between bid and ask
- Wait a few seconds
- Adjust up if needed

### Selling Options
- Start at mid-point or higher
- Be patient
- Adjust down if needed

## Stop Orders

**Stop-Loss**: Triggers a sell when price falls to stop level
**Stop-Limit**: Triggers a limit order when stop is reached

**Warning**: Stop orders on options can be problematic:
- Wide spreads cause early triggers
- Fast markets may skip your price
- Use with caution

## GTC vs Day Orders

**Day Order**: Expires at end of trading day
**GTC (Good Till Canceled)**: Stays open until filled or canceled

For options, Day orders are often preferred to avoid unwanted fills.

## Key Takeaways
1. ALWAYS use limit orders for options
2. Start at mid-point, adjust as needed
3. Be patient for better fills
4. Avoid market orders - the slippage adds up

## Quick Reference
- **Market order**: Immediate execution, no price control
- **Limit order**: Price control, may not fill
- **Mid-point**: (Bid + Ask) ÷ 2
- **GTC**: Good till canceled`,
          quiz_questions: [
            {
              question: "What type of order should you ALWAYS use for options?",
              options: [
                "Market orders",
                "Limit orders",
                "Stop orders",
                "It doesn't matter"
              ],
              correct_answer: 1,
              explanation: "Always use limit orders for options to control price and avoid poor fills on wide bid-ask spreads."
            },
            {
              question: "The bid-ask on an option is $3.50 × $3.80. Where is the mid-point?",
              options: [
                "$3.50",
                "$3.65",
                "$3.80",
                "$7.30"
              ],
              correct_answer: 1,
              explanation: "Mid-point = (Bid + Ask) ÷ 2 = ($3.50 + $3.80) ÷ 2 = $3.65."
            },
            {
              question: "Why are market orders problematic for options?",
              options: [
                "They're illegal",
                "Wide bid-ask spreads cause poor fills",
                "They take too long",
                "They require higher approval levels"
              ],
              correct_answer: 1,
              explanation: "Market orders on options often result in poor fills because of wide bid-ask spreads."
            }
          ]
        },
        {
          title: "Reading an Options Chain",
          description: "Learn to navigate and understand options chains.",
          duration: "25 min",
          content_markdown: `# Reading an Options Chain

## Learning Objectives
- Navigate an options chain layout
- Identify key columns and their meaning
- Find the information you need quickly
- Use chains to select trades

## What Is an Options Chain?

An options chain displays all available options for a stock:
- Multiple expiration dates
- Various strike prices
- Calls on one side, Puts on the other

## Typical Chain Layout

**Left side**: CALLS
**Center**: Strike prices
**Right side**: PUTS

| Calls Side | Strikes | Puts Side |
|------------|---------|-----------|
| $3.20 × $3.40 | $95 | $0.50 × $0.60 |
| $2.40 × $2.60 | $100 | $1.20 × $1.40 |
| $1.60 × $1.80 | $105 | $2.30 × $2.50 |

## Key Columns Explained

### Bid / Ask
- **Bid**: Price buyers will pay (you get if selling)
- **Ask**: Price sellers want (you pay if buying)

### Last
Last traded price (may be stale)

### Volume
Number of contracts traded today

### Open Interest (OI)
Total contracts currently open

### Implied Volatility (IV)
Market's expectation of future volatility

### Delta (Greeks columns)
How much option moves per $1 stock move

## Finding Liquid Options

Look for:
- **Tight bid-ask spread**: <$0.20 ideal for trading
- **High volume**: 100+ contracts/day
- **High open interest**: 500+ contracts

Low liquidity = wider spreads = worse fills

## ITM vs OTM on the Chain

Usually highlighted differently:
- **ITM options**: Often shaded or highlighted
- **ATM strike**: Closest to current price
- **OTM options**: Unshaded

## Filtering the Chain

Most platforms let you filter by:
- Expiration date
- Strike range
- Delta range
- Minimum volume

Use filters to focus on tradeable options!

## Key Takeaways
1. Calls on left, strikes in middle, puts on right
2. Bid = sell price, Ask = buy price
3. Check volume and OI for liquidity
4. Tight spreads mean better trading conditions

## Quick Reference
- **Bid**: What you get when selling
- **Ask**: What you pay when buying
- **Volume**: Today's trading activity
- **Open Interest**: Total open contracts
- **Spread**: Ask - Bid (tighter = better)`,
          quiz_questions: [
            {
              question: "On an options chain, where are calls typically displayed?",
              options: [
                "On the right side",
                "On the left side",
                "At the bottom",
                "Calls and puts are mixed together"
              ],
              correct_answer: 1,
              explanation: "Standard options chains display calls on the left, strikes in the middle, and puts on the right."
            },
            {
              question: "What does high open interest indicate?",
              options: [
                "High price",
                "Low liquidity",
                "Many existing contracts (good liquidity)",
                "The option is expiring soon"
              ],
              correct_answer: 2,
              explanation: "High open interest indicates many traders have positions in that option, suggesting better liquidity."
            },
            {
              question: "Which metric tells you how many contracts traded today?",
              options: [
                "Open Interest",
                "Volume",
                "Delta",
                "Bid-Ask spread"
              ],
              correct_answer: 1,
              explanation: "Volume shows the number of contracts traded today, while open interest shows total existing positions."
            }
          ]
        },
        {
          title: "Placing Your First Options Trade",
          description: "Step-by-step guide to placing an options order.",
          duration: "20 min",
          content_markdown: `# Placing Your First Options Trade

## Learning Objectives
- Follow a step-by-step process to place trades
- Verify order details before submission
- Understand confirmation screens
- Avoid common first-trade mistakes

## Before You Click "Buy"

### Pre-Trade Checklist

✅ I know my thesis (why I'm making this trade)
✅ I've checked the bid-ask spread
✅ I'm using a limit order
✅ I've verified the strike and expiration
✅ I know my max loss
✅ My position size is appropriate

## Step-by-Step Order Entry

### Step 1: Select the Option
- Navigate to options chain
- Find your target expiration
- Click on the option you want

### Step 2: Set Order Type
- Select "Buy to Open" for new long position
- Choose "Limit" order
- Enter your limit price (start at mid-point)

### Step 3: Set Quantity
- Enter number of contracts
- Verify total cost (premium × 100 × contracts)

### Step 4: Verify Details
Review EVERYTHING:
- Symbol correct?
- Strike price correct?
- Expiration date correct?
- Buy vs Sell correct?
- Quantity correct?
- Limit price correct?

### Step 5: Submit
- Click submit/send
- Wait for confirmation

## Order Status

After submission, orders can be:
- **Filled**: Executed at your price or better
- **Working**: Waiting for fill
- **Partial Fill**: Some contracts filled
- **Rejected**: Problem with order

## Common First-Trade Mistakes

### Mistake 1: Wrong Direction
Clicking "Sell" when you meant "Buy" (or vice versa)
**Solution**: Triple-check buy/sell before submitting

### Mistake 2: Wrong Month
Selecting April instead of May expiration
**Solution**: Verify expiration date carefully

### Mistake 3: Market Order
Using market order and getting terrible fill
**Solution**: ALWAYS use limit orders

### Mistake 4: Too Many Contracts
"I'll buy 10 contracts" - $3,000 risk on first trade
**Solution**: Start with 1-2 contracts

## After the Fill

1. Verify the fill price in your account
2. Note the position in your watchlist
3. Set any mental or broker alerts
4. Record the trade in your journal

## Key Takeaways
1. Use a pre-trade checklist every time
2. Triple-check all order details
3. Start with limit orders at mid-point
4. Begin with small position sizes

## Quick Reference
- **Buy to Open**: Opening a new long position
- **Limit order**: Sets maximum price you'll pay
- **Mid-point**: (Bid + Ask) ÷ 2
- **First trade**: Use 1-2 contracts maximum`,
          quiz_questions: [
            {
              question: "What order type should you select when opening a new long option position?",
              options: [
                "Sell to Open",
                "Buy to Open",
                "Buy to Close",
                "Sell to Close"
              ],
              correct_answer: 1,
              explanation: "Buy to Open is used to establish a new long option position (buying calls or puts)."
            },
            {
              question: "What should you do before clicking submit on an options order?",
              options: [
                "Nothing, just submit quickly",
                "Verify all details: symbol, strike, expiration, quantity, price",
                "Only check the price",
                "Call your broker"
              ],
              correct_answer: 1,
              explanation: "Always verify all order details before submission to avoid costly mistakes."
            },
            {
              question: "How many contracts should a beginner start with on their first real trade?",
              options: [
                "10-20 contracts",
                "5-10 contracts",
                "1-2 contracts",
                "As many as you can afford"
              ],
              correct_answer: 2,
              explanation: "Beginners should start with 1-2 contracts to limit risk while learning."
            }
          ]
        },
        {
          title: "Common Platform Mistakes to Avoid",
          description: "Learn the most common technical mistakes beginners make.",
          duration: "20 min",
          content_markdown: `# Common Platform Mistakes to Avoid

## Learning Objectives
- Identify common technical trading errors
- Learn prevention strategies
- Know how to fix mistakes if they happen
- Develop good platform habits

## Mistake #1: Selecting Wrong Expiration

**The Problem**: You wanted May options but clicked April

**Prevention**:
- Always verify the expiration date
- Read it out loud before submitting
- Use calendar view when available

**If It Happens**:
- Close immediately if position doesn't fit your plan
- Accept the loss vs hoping it works out

## Mistake #2: Buy vs Sell Confusion

**The Problem**: Accidentally sold when you meant to buy

**Prevention**:
- Look for color coding (green = buy, red = sell)
- Say "I am BUYING a call" out loud
- Check order confirmation shows correct direction

**If It Happens**:
- Close the position immediately
- Learn from the expensive lesson

## Mistake #3: Wrong Strike Price

**The Problem**: Clicked $105 strike instead of $100

**Prevention**:
- Use the chain's search/filter function
- Write down your target strike before looking
- Verify in order confirmation

## Mistake #4: Quantity Errors

**The Problem**: Entered 10 contracts instead of 1

**Prevention**:
- Calculate total cost BEFORE submitting
- Default quantity to 1, change only when certain
- Use contract size alerts if available

## Mistake #5: GTC Orders Forgotten

**The Problem**: GTC order from last week fills unexpectedly

**Prevention**:
- Use Day orders for most options trades
- Review all open orders daily
- Cancel old GTC orders promptly

## Mistake #6: Trading Illiquid Options

**The Problem**: Wide spreads eat your profit

**Prevention**:
- Check volume and open interest first
- Avoid spreads wider than $0.20-0.30
- Stick to liquid underlyings (SPY, AAPL, etc.)

## Mistake #7: Not Verifying Settlement

**The Problem**: Options assigned unexpectedly

**Prevention**:
- Know your broker's settlement rules
- Close ITM options before expiration
- Set calendar reminders for expirations

## Building Good Habits

1. **Slow down**: Speed ≠ success
2. **Use checklists**: Even pros use them
3. **Paper trade first**: Practice button clicking
4. **Review orders**: Before AND after execution

## Key Takeaways
1. Most platform mistakes are preventable
2. Verification takes seconds, mistakes cost dollars
3. When in doubt, step back and verify
4. Build systematic habits to prevent errors

## Quick Reference
- **Double-check**: Strike, expiration, quantity, direction
- **Slow down**: Speed causes mistakes
- **Day orders**: Preferred over GTC for options
- **Liquid options**: Volume 100+, OI 500+`,
          quiz_questions: [
            {
              question: "What type of order is generally preferred for options to avoid forgotten fills?",
              options: [
                "GTC (Good Till Canceled)",
                "Day order",
                "IOC (Immediate or Cancel)",
                "FOK (Fill or Kill)"
              ],
              correct_answer: 1,
              explanation: "Day orders expire at market close, preventing forgotten orders from filling unexpectedly."
            },
            {
              question: "What should you check before trading an option to ensure good fills?",
              options: [
                "Only the price",
                "Volume and open interest",
                "The company's earnings date",
                "Your account balance"
              ],
              correct_answer: 1,
              explanation: "Checking volume and open interest helps ensure the option is liquid with tighter spreads."
            },
            {
              question: "If you accidentally sell when you meant to buy, what should you do?",
              options: [
                "Wait and hope it works out",
                "Close the position immediately",
                "Add more to average down",
                "Contact the exchange"
              ],
              correct_answer: 1,
              explanation: "Close the position immediately rather than hoping it works out. Accept the mistake and learn from it."
            }
          ]
        }
      ]
    },
    // Module 5: Risk Management for Beginners
    {
      title: "Risk Management for Beginners",
      description: "Learn essential risk management principles to protect your capital from day one.",
      lessons: [
        {
          title: "Why Risk Management Comes First",
          description: "Understand why protecting capital is more important than making profits.",
          duration: "20 min",
          content_markdown: `# Why Risk Management Comes First

## Learning Objectives
- Understand why risk management is priority #1
- Know the math of losses and recovery
- Recognize that survival = success
- Commit to risk-first thinking

## The Uncomfortable Truth

Most new traders focus on:
❌ "How much can I make?"

Successful traders focus on:
✅ "How much can I lose?"

**The difference is everything.**

## The Math of Losses

Losses require LARGER gains to recover:

| Loss | Required Gain to Recover |
|------|-------------------------|
| -10% | +11% |
| -25% | +33% |
| -50% | +100% |
| -75% | +300% |
| -90% | +900% |

**A 50% loss requires a 100% gain just to break even!**

## Survival Is Success

Your #1 job as a new trader:
**Don't blow up your account.**

If you protect your capital, you can:
- Keep learning
- Find better opportunities
- Stay in the game

Dead accounts don't recover.

## Risk vs Reward Thinking

**Amateur thinking**: "This could 10x my money!"
**Professional thinking**: "What's the worst case?"

Always ask:
1. What's my maximum possible loss?
2. Can I afford that loss?
3. Is the potential reward worth the risk?

## Position Sizing: Your Safety Net

**Never risk more than 1-5% of your account on a single trade.**

$10,000 account:
- 1% risk = $100 maximum loss
- 2% risk = $200 maximum loss
- 5% risk = $500 maximum loss

This means even a string of losses won't destroy you.

## The Emotional Cost of Losses

Big losses don't just hurt financially:
- They cause emotional damage
- They lead to revenge trading
- They cloud judgment
- They create fear and hesitation

Small, managed losses are psychologically easier.

## Key Takeaways
1. Risk management comes BEFORE profit seeking
2. Losses require larger gains to recover
3. Survival is the primary goal
4. Size positions to survive losing streaks

## Quick Reference
- **First priority**: Don't blow up
- **Position size**: 1-5% risk per trade
- **50% loss**: Needs 100% gain to recover
- **Professional focus**: "What can I lose?"`,
          quiz_questions: [
            {
              question: "If you lose 50% of your account, what gain is needed to recover?",
              options: [
                "50%",
                "75%",
                "100%",
                "200%"
              ],
              correct_answer: 2,
              explanation: "A 50% loss requires a 100% gain to return to your original amount. The math of losses is asymmetric."
            },
            {
              question: "What percentage of your account should you risk on a single trade?",
              options: [
                "10-20%",
                "25-50%",
                "1-5%",
                "100%"
              ],
              correct_answer: 2,
              explanation: "Risking 1-5% per trade ensures that even a string of losses won't devastate your account."
            },
            {
              question: "What is the #1 priority for a new trader?",
              options: [
                "Making as much money as possible",
                "Finding hot stock tips",
                "Protecting capital and not blowing up",
                "Trading as frequently as possible"
              ],
              correct_answer: 2,
              explanation: "Protecting capital is priority #1. If you survive, you can keep learning and trading."
            }
          ]
        },
        {
          title: "Position Sizing Fundamentals",
          description: "Learn how to size positions appropriately for your account.",
          duration: "25 min",
          content_markdown: `# Position Sizing Fundamentals

## Learning Objectives
- Calculate appropriate position sizes
- Apply the 1-5% rule consistently
- Adjust sizing based on conviction
- Avoid common sizing mistakes

## The Core Principle

**Risk a fixed percentage of your account per trade, not a fixed dollar amount.**

As your account grows, position sizes grow.
As your account shrinks, position sizes shrink.

This is called **fractional position sizing**.

## The 1-5% Rule

### 1% Risk (Conservative)
- Learning phase
- Uncertain setups
- Volatile underlyings

### 2-3% Risk (Moderate)
- Experienced traders
- High-conviction setups
- Normal conditions

### 5% Risk (Aggressive)
- Very high conviction only
- Clear technical setup
- Rare occasions

## Calculating Position Size

### Formula
**Position Size = (Account × Risk %) ÷ Trade Risk**

Where Trade Risk = Premium per contract × 100

### Example
- Account: $10,000
- Risk: 2%
- Option premium: $2.00

Calculation:
- Dollar risk allowed: $10,000 × 2% = $200
- Cost per contract: $2.00 × 100 = $200
- Position size: $200 ÷ $200 = **1 contract**

## Another Example

- Account: $25,000
- Risk: 3%
- Option premium: $1.50

Calculation:
- Dollar risk allowed: $25,000 × 3% = $750
- Cost per contract: $1.50 × 100 = $150
- Position size: $750 ÷ $150 = **5 contracts**

## Common Sizing Mistakes

### Mistake 1: Fixed Dollar Sizing
"I always trade $500"
**Problem**: $500 is 50% of $1,000 but 5% of $10,000

### Mistake 2: Going All-In
"This one is a sure thing!"
**Reality**: No trade is a sure thing

### Mistake 3: Scaling UP After Losses
"I need to make it back"
**Result**: Bigger losses, faster account destruction

### Mistake 4: Too Many Positions
5 trades × 5% each = 25% at risk!
**Solution**: Track total portfolio risk

## Position Sizing Worksheet

Before every trade:
1. What is my account value? $_____
2. What % am I risking? ____%
3. Dollar risk allowed: $____
4. Premium per contract: $____
5. Max contracts: ____

## Key Takeaways
1. Risk a percentage, not a fixed amount
2. 1-5% rule protects against ruin
3. Calculate position size BEFORE entering
4. Track total portfolio exposure

## Quick Reference
- **1% risk**: Very conservative
- **2-3% risk**: Standard approach
- **5% risk**: Maximum, high conviction only
- **Formula**: (Account × Risk%) ÷ Trade Cost`,
          quiz_questions: [
            {
              question: "With a $20,000 account and 2% risk, how much can you risk on one trade?",
              options: [
                "$100",
                "$200",
                "$400",
                "$2,000"
              ],
              correct_answer: 2,
              explanation: "$20,000 × 2% = $400 maximum risk per trade."
            },
            {
              question: "If your maximum risk is $300 and option premium is $1.50, how many contracts can you buy?",
              options: [
                "1 contract",
                "2 contracts",
                "3 contracts",
                "200 contracts"
              ],
              correct_answer: 1,
              explanation: "$300 ÷ ($1.50 × 100) = $300 ÷ $150 = 2 contracts maximum."
            },
            {
              question: "What is fractional position sizing?",
              options: [
                "Trading fractional shares",
                "Risking a fixed dollar amount",
                "Risking a percentage of your account (adjusts with account size)",
                "Only buying half positions"
              ],
              correct_answer: 2,
              explanation: "Fractional position sizing means risking a percentage of your account, so position sizes automatically adjust as your account grows or shrinks."
            }
          ]
        },
        {
          title: "Avoiding Naked Options (For Now)",
          description: "Understand why beginners should avoid selling uncovered options.",
          duration: "20 min",
          content_markdown: `# Avoiding Naked Options (For Now)

## Learning Objectives
- Understand what naked options are
- Know why they're dangerous for beginners
- Recognize the unlimited risk profile
- Choose safer alternatives

## What Are Naked Options?

**Naked options** = selling options without owning the underlying stock or having offsetting positions.

- **Naked call**: Selling a call without owning shares
- **Naked put**: Selling a put without cash to buy shares

## Why "Naked"?

You're "exposed" - there's nothing covering your position.

Like going outside in a snowstorm without a coat!

## The Danger: Unlimited Risk

### Naked Calls (DO NOT TRADE)
- You must deliver shares if assigned
- Stock can rise infinitely
- Losses can exceed your entire account
- People have lost everything in a day

**Real example**: Stock gaps from $50 to $150 on buyout news
- You sold $55 calls
- Loss: ($150 - $55) × 100 = $9,500 per contract!

### Naked Puts (Very Risky)
- You must buy shares if assigned
- Stock can drop to zero
- Risk = Strike × 100 - Premium

**Example**: $50 strike put, stock goes to $5
- Loss: ($50 - $5) × 100 = $4,500 per contract

## Why Beginners Should Avoid

1. **Margin requirements**: Large capital needed
2. **Unlimited exposure**: Can lose more than you have
3. **Assignment risk**: Can happen at any time for American options
4. **Skill required**: Need to manage actively

## Safer Alternatives

### Instead of Naked Calls:
- **Covered calls**: Own the stock first
- **Call credit spreads**: Buy a higher strike call for protection

### Instead of Naked Puts:
- **Cash-secured puts**: Have cash to buy if assigned
- **Put credit spreads**: Buy a lower strike put for protection

## The Bottom Line

**There is NO reason for a beginner to sell naked options.**

The risk/reward is not in your favor:
- Limited profit (premium received)
- Unlimited or massive loss potential

Wait until you're experienced AND have proper capital AND understand the risks.

## Key Takeaways
1. Naked options have unlimited or extreme risk
2. Beginners should NOT sell naked options
3. Covered calls and spreads are safer alternatives
4. Even experienced traders blow up with naked options

## Quick Reference
- **Naked**: No protection, unlimited risk
- **Covered**: Stock or offsetting position protects
- **Beginner rule**: Buy options or use defined-risk strategies
- **Learn first**: Gain experience before selling naked`,
          quiz_questions: [
            {
              question: "What is a naked call?",
              options: [
                "Buying a call option",
                "Selling a call without owning the underlying stock",
                "A call with a low premium",
                "A call that expires today"
              ],
              correct_answer: 1,
              explanation: "A naked call is when you sell a call option without owning the underlying shares to deliver if assigned."
            },
            {
              question: "What is the risk of a naked call?",
              options: [
                "Limited to premium received",
                "Limited to strike price",
                "Theoretically unlimited",
                "No risk at all"
              ],
              correct_answer: 2,
              explanation: "Naked calls have theoretically unlimited risk because the stock can rise indefinitely."
            },
            {
              question: "What is a safer alternative to selling a naked put?",
              options: [
                "Selling more naked puts",
                "Buying the stock",
                "Cash-secured put or put credit spread",
                "Doing nothing"
              ],
              correct_answer: 2,
              explanation: "Cash-secured puts (having cash to buy) or put credit spreads (with protective long put) limit risk."
            }
          ]
        },
        {
          title: "Financial Risk vs Emotional Risk",
          description: "Understand both types of trading risk and how to manage them.",
          duration: "20 min",
          content_markdown: `# Financial Risk vs Emotional Risk

## Learning Objectives
- Distinguish between financial and emotional risk
- Understand how they interact
- Learn to manage both simultaneously
- Build sustainable trading habits

## Two Types of Risk

### Financial Risk
The actual money you might lose:
- Premium paid for options
- Potential assignment costs
- Portfolio drawdown

### Emotional Risk
The psychological impact of trading:
- Stress and anxiety
- Fear of missing out (FOMO)
- Revenge trading urges
- Sleep quality, mood, relationships

## How They Interact

**Large financial risk → High emotional stress**

Even if you CAN afford to lose $5,000:
- Will you sleep well?
- Will you panic-sell at the wrong time?
- Will you make good decisions?

**The right position size feels boring.**

## Finding Your Emotional Risk Tolerance

Ask yourself:
- Can I check my phone every 5 minutes without anxiety?
- Am I thinking about this trade all night?
- Am I refreshing my account constantly?
- Is trading affecting my relationships?

If any answer is "yes," you're taking too much risk.

## Signs You're Over-Risked

**Financial warning signs**:
- One trade can hurt your month
- You're using money you need
- Account swings keep you up at night

**Emotional warning signs**:
- Constant price checking
- Mood depends on P&L
- Snapping at family
- Dreaming about trades

## The "Sleep Test"

A position is the right size if you can:
- Go to bed without checking
- Wake up without immediately looking
- Focus on work/life normally
- Lose the entire position and shrug

If you can't do these, reduce size.

## Protecting Emotional Capital

Your emotional capital is limited:
- Bad days happen
- Losing streaks are inevitable
- Stress accumulates

**Small losses preserve emotional capital for when it matters.**

## Building Sustainable Habits

1. **Size conservatively**: Leave room for error
2. **Take breaks**: Step away after losses
3. **Set boundaries**: No trading after arguments/bad days
4. **Track your state**: Note emotions in journal

## Key Takeaways
1. Financial risk is what you lose; emotional risk is how you feel
2. The right position size should feel almost boring
3. Use the "sleep test" to check if you're over-risked
4. Protect emotional capital alongside financial capital

## Quick Reference
- **Financial risk**: Money at stake
- **Emotional risk**: Stress, anxiety, mood impact
- **Sleep test**: Can you sleep without worry?
- **Right size**: Feels boring, sustainable`,
          quiz_questions: [
            {
              question: "What is 'emotional risk' in trading?",
              options: [
                "The money you might lose",
                "The psychological impact of trading on stress, mood, and decisions",
                "The risk of getting emotional about stocks",
                "A type of option strategy"
              ],
              correct_answer: 1,
              explanation: "Emotional risk refers to the psychological impact of trading - stress, anxiety, and effects on your mental state and decisions."
            },
            {
              question: "According to the 'sleep test,' what indicates proper position sizing?",
              options: [
                "You dream about your profits",
                "You can't sleep because you're excited",
                "You can sleep without checking your positions",
                "You need sleeping pills"
              ],
              correct_answer: 2,
              explanation: "If you can sleep peacefully without worrying about or checking your positions, your size is appropriate."
            },
            {
              question: "What is a sign that you're taking on too much emotional risk?",
              options: [
                "You're making consistent profits",
                "Your mood depends on your P&L and you check constantly",
                "You're bored with your trades",
                "You forget you have positions"
              ],
              correct_answer: 1,
              explanation: "When your mood swings with P&L and you're constantly checking positions, you've taken on too much emotional risk."
            }
          ]
        },
        {
          title: "Creating a Risk Checklist",
          description: "Build your personal risk management checklist.",
          duration: "15 min",
          content_markdown: `# Creating a Risk Checklist

## Learning Objectives
- Build a personal pre-trade risk checklist
- Ensure consistent risk management
- Prevent impulsive decisions
- Document your risk rules

## Why Use a Checklist?

Professional traders use checklists because:
- Excitement clouds judgment
- Memory fails under pressure
- Consistency prevents mistakes
- Discipline becomes automatic

**Pilots use checklists. So should you.**

## The Pre-Trade Risk Checklist

### ✅ Position Size Check
□ What's my account value today?
□ What percentage am I risking? (1-5%)
□ What's my maximum dollar risk?
□ Does this position fit within limits?

### ✅ Maximum Loss Check
□ What's the premium cost?
□ Can I afford to lose 100% of this?
□ Will this loss affect my life?
□ Have I passed the "sleep test"?

### ✅ Portfolio Check
□ How many other positions do I have?
□ What's my total portfolio risk?
□ Am I correlated to one sector?
□ Is this my only/largest position?

### ✅ Emotional Check
□ Am I calm and thinking clearly?
□ Is this revenge trading?
□ Am I chasing FOMO?
□ Would I be embarrassed to tell someone?

### ✅ Exit Plan Check
□ What's my profit target?
□ What's my stop-loss level?
□ When will I exit regardless (time stop)?
□ Have I written this down?

## Sample Filled Checklist

**Trade**: AAPL $175 Call, May expiration, $3.50 premium

| Check | Answer |
|-------|--------|
| Account | $12,000 |
| Risk % | 3% = $360 max |
| Position cost | $350 (1 contract) ✓ |
| Can afford 100% loss? | Yes ✓ |
| Total positions | 2 others, $400 at risk ✓ |
| Emotional state | Calm, planned yesterday ✓ |
| Profit target | 50% ($175) |
| Stop loss | 50% ($175) |
| Time stop | Exit at 14 DTE |

**Decision**: ✅ APPROVED

## Creating Your Personal Checklist

1. Start with the template above
2. Add your own rules over time
3. Print it and keep visible
4. Use it EVERY trade

## Key Takeaways
1. Checklists prevent impulsive decisions
2. Cover position size, max loss, portfolio, emotions, exits
3. Fill it out for every trade
4. Build the habit even when excited

## Quick Reference
- **Position size**: % of account at risk
- **Maximum loss**: Can you afford 100% loss?
- **Portfolio risk**: Total exposure across trades
- **Emotional check**: Are you thinking clearly?
- **Exit plan**: Know when you'll get out`,
          quiz_questions: [
            {
              question: "Why should traders use a pre-trade checklist?",
              options: [
                "Brokers require it",
                "To prevent impulsive decisions and ensure consistency",
                "To slow down trading for more commissions",
                "It's optional and unnecessary"
              ],
              correct_answer: 1,
              explanation: "Checklists prevent impulsive decisions, ensure consistency, and help maintain discipline under pressure."
            },
            {
              question: "What should an emotional check in your checklist include?",
              options: [
                "Am I excited enough about this trade?",
                "Am I calm, not revenge trading, not chasing FOMO?",
                "Am I following social media tips?",
                "Am I using enough leverage?"
              ],
              correct_answer: 1,
              explanation: "The emotional check ensures you're trading from a calm, rational state - not revenge trading or chasing FOMO."
            },
            {
              question: "When should you use your trading checklist?",
              options: [
                "Only for large trades",
                "Only when you're unsure",
                "For EVERY trade",
                "Only on Mondays"
              ],
              correct_answer: 2,
              explanation: "Use the checklist for every trade to build consistent habits and prevent mistakes."
            }
          ]
        }
      ]
    },
    // Modules 6-13 continue with similar detailed structure...
    // Due to length, I'll include abbreviated versions for remaining modules
    
    // Module 6: Introduction to Technical Analysis
    {
      title: "Introduction to Technical Analysis",
      description: "Learn the fundamentals of reading charts and identifying key patterns.",
      lessons: [
        {
          title: "Candlestick Basics",
          description: "Understand how to read candlestick charts.",
          duration: "25 min",
          content_markdown: `# Candlestick Basics

## Learning Objectives
- Read and interpret candlestick charts
- Identify the parts of a candlestick
- Understand what colors represent
- Recognize basic candlestick patterns

## What Are Candlesticks?

Candlesticks show price action over a time period:
- **Open**: Where price started
- **Close**: Where price ended
- **High**: Highest price reached
- **Low**: Lowest price reached

## Candlestick Anatomy

Each candle has:
- **Body**: The rectangle (open to close)
- **Wicks/Shadows**: Lines above/below body (highs/lows)

## Color Meaning

**Green/White candle**: Close > Open (price went UP)
**Red/Black candle**: Close < Open (price went DOWN)

## Reading the Story

Large body = Strong conviction
Small body = Indecision
Long wicks = Rejection of prices
No wicks = Strong directional move

## Key Takeaways
1. Candlesticks show open, high, low, close
2. Colors indicate direction (green = up, red = down)
3. Body size shows conviction
4. Wicks show price rejection`,
          quiz_questions: [
            {
              question: "What does a green candlestick indicate?",
              options: [
                "Price went down",
                "Price went up (close > open)",
                "No price change",
                "High volume"
              ],
              correct_answer: 1,
              explanation: "A green candlestick means the closing price was higher than the opening price."
            },
            {
              question: "What do long wicks on a candlestick indicate?",
              options: [
                "Strong trend continuation",
                "Price rejection at those levels",
                "Low volume",
                "Options expiration"
              ],
              correct_answer: 1,
              explanation: "Long wicks indicate that prices were rejected at those levels and pushed back."
            }
          ]
        },
        {
          title: "Support and Resistance Levels",
          description: "Learn to identify key price levels where stocks tend to react.",
          duration: "25 min",
          content_markdown: `# Support and Resistance Levels

## Learning Objectives
- Define support and resistance
- Identify these levels on charts
- Understand why they matter for options
- Use them in trade planning

## What Is Support?

**Support** = A price level where buying pressure tends to stop declines

Think of it as a floor - price bounces up from support.

## What Is Resistance?

**Resistance** = A price level where selling pressure tends to stop advances

Think of it as a ceiling - price bounces down from resistance.

## Why They Form

- Previous highs/lows become psychological levels
- Many traders remember these prices
- Orders cluster around round numbers
- Institutions use these levels

## Using for Options

**Near support**: Consider calls (expecting bounce)
**Near resistance**: Consider puts (expecting rejection)
**Breakout**: Direction trades after level breaks

## Key Takeaways
1. Support = floor (price bounces up)
2. Resistance = ceiling (price bounces down)
3. The more touches, the stronger the level
4. Broken support becomes resistance and vice versa`,
          quiz_questions: [
            {
              question: "What is a support level?",
              options: [
                "A price where selling pressure stops advances",
                "A price where buying pressure tends to stop declines",
                "The highest price ever reached",
                "A moving average"
              ],
              correct_answer: 1,
              explanation: "Support is a price level where buying pressure tends to overcome selling, stopping price declines."
            },
            {
              question: "What often happens when a resistance level is broken?",
              options: [
                "It disappears forever",
                "It often becomes support",
                "Price immediately crashes",
                "Trading halts"
              ],
              correct_answer: 1,
              explanation: "When resistance is broken, it often becomes the new support level."
            }
          ]
        },
        {
          title: "Trends vs Ranges",
          description: "Learn to identify whether a stock is trending or ranging.",
          duration: "20 min",
          content_markdown: `# Trends vs Ranges

## Learning Objectives
- Distinguish between trending and ranging markets
- Identify trend direction
- Recognize range-bound conditions
- Adapt strategies accordingly

## Trending Markets

**Uptrend**: Higher highs and higher lows
**Downtrend**: Lower highs and lower lows

In trends, momentum strategies work well.

## Range-Bound Markets

Price oscillates between support and resistance without making new highs or lows.

In ranges, mean-reversion strategies work well.

## Why It Matters for Options

**Trending**: Directional plays (calls in uptrend, puts in downtrend)
**Ranging**: Income strategies (sell premium at extremes)

## Identifying the Environment

1. Zoom out to see the bigger picture
2. Draw key support/resistance
3. Look for pattern of highs and lows
4. Use moving averages as guides

## Key Takeaways
1. Uptrends have higher highs and higher lows
2. Downtrends have lower highs and lower lows
3. Ranges oscillate between support and resistance
4. Match your strategy to the market environment`,
          quiz_questions: [
            {
              question: "What defines an uptrend?",
              options: [
                "Lower highs and lower lows",
                "Higher highs and higher lows",
                "Sideways movement",
                "High volume"
              ],
              correct_answer: 1,
              explanation: "An uptrend is characterized by a pattern of higher highs and higher lows."
            },
            {
              question: "What type of market is best for directional call options?",
              options: [
                "Downtrending market",
                "Range-bound market",
                "Uptrending market",
                "Volatile market"
              ],
              correct_answer: 2,
              explanation: "Uptrending markets are ideal for call options since you expect the stock to continue rising."
            }
          ]
        },
        {
          title: "Introduction to Moving Averages",
          description: "Learn how moving averages help identify trends.",
          duration: "20 min",
          content_markdown: `# Introduction to Moving Averages

## Learning Objectives
- Understand what moving averages are
- Know common MA periods
- Use MAs for trend identification
- Recognize MA crossovers

## What Is a Moving Average?

A moving average (MA) smooths price data by creating an average price over a set period.

**Example**: 20-day MA = average of last 20 closing prices

## Common Moving Averages

- **10-day MA**: Short-term trend
- **20-day MA**: Short-term trend
- **50-day MA**: Intermediate trend
- **200-day MA**: Long-term trend

## Using MAs for Direction

**Price above MA**: Generally bullish
**Price below MA**: Generally bearish

**Rising MA**: Uptrend
**Falling MA**: Downtrend

## MA Crossovers

**Golden Cross**: Short MA crosses above long MA (bullish)
**Death Cross**: Short MA crosses below long MA (bearish)

## Key Takeaways
1. Moving averages smooth price action
2. Price above MA = bullish, below = bearish
3. 50 and 200 MA are widely watched
4. Crossovers signal potential trend changes`,
          quiz_questions: [
            {
              question: "What does it typically mean when price is above the 50-day moving average?",
              options: [
                "Bearish signal",
                "Generally bullish (price above average)",
                "The stock is overvalued",
                "Time to sell"
              ],
              correct_answer: 1,
              explanation: "When price is above a major moving average, it's generally considered bullish."
            },
            {
              question: "What is a 'Golden Cross'?",
              options: [
                "When the stock hits all-time high",
                "When a short-term MA crosses above a long-term MA",
                "When a stock pays a dividend",
                "When volume spikes"
              ],
              correct_answer: 1,
              explanation: "A Golden Cross occurs when a shorter moving average crosses above a longer one, signaling potential bullish momentum."
            }
          ]
        },
        {
          title: "Timeframes for Options Trading",
          description: "Learn which chart timeframes to use for options analysis.",
          duration: "15 min",
          content_markdown: `# Timeframes for Options Trading

## Learning Objectives
- Understand different chart timeframes
- Match timeframes to trade duration
- Use multiple timeframes effectively
- Avoid common timeframe mistakes

## Chart Timeframes

**Intraday**: 1-min, 5-min, 15-min, 1-hour
**Daily**: Each candle = 1 day
**Weekly**: Each candle = 1 week
**Monthly**: Each candle = 1 month

## Matching Timeframe to Trade

| Trade Duration | Analysis Timeframe |
|----------------|-------------------|
| Day trade | 5-15 minute |
| Swing trade (days) | Daily + 4-hour |
| Position trade (weeks) | Daily + Weekly |
| LEAPS (months+) | Weekly + Monthly |

## Multi-Timeframe Analysis

**Higher timeframe**: Trend direction
**Lower timeframe**: Entry timing

Example: Weekly shows uptrend → Use daily for entry point

## Key Takeaways
1. Match chart timeframe to trade duration
2. Higher timeframes show the bigger picture
3. Lower timeframes help time entries
4. Don't day trade using weekly charts`,
          quiz_questions: [
            {
              question: "For a swing trade lasting a few days, which timeframe should be your primary analysis?",
              options: [
                "1-minute chart",
                "Daily and 4-hour chart",
                "Monthly chart",
                "Yearly chart"
              ],
              correct_answer: 1,
              explanation: "Swing trades (holding days to weeks) are best analyzed on daily and 4-hour charts."
            },
            {
              question: "What is the purpose of using multiple timeframes?",
              options: [
                "To confuse yourself",
                "Higher for trend direction, lower for entry timing",
                "To trade more frequently",
                "Only professional traders need this"
              ],
              correct_answer: 1,
              explanation: "Higher timeframes show overall trend direction, while lower timeframes help with precise entry timing."
            }
          ]
        }
      ]
    },
    // Module 7: Basic Options Strategies
    {
      title: "Basic Options Strategies (Beginner-Safe)",
      description: "Learn safe, defined-risk options strategies appropriate for beginners.",
      lessons: [
        {
          title: "Long Calls: When and How",
          description: "Master the most basic bullish options strategy.",
          duration: "25 min",
          content_markdown: `# Long Calls: When and How

## Learning Objectives
- Know when to use long calls
- Select appropriate strikes and expirations
- Calculate break-even and profit potential
- Manage long call positions

## When to Buy Calls

✅ You're bullish on the stock
✅ You expect a move within your timeframe
✅ You want leverage with limited risk
✅ The stock is trending up or breaking out

## Selecting Your Strike

**ITM (In-The-Money)**: Higher cost, higher probability, less leverage
**ATM (At-The-Money)**: Balanced approach
**OTM (Out-of-The-Money)**: Lower cost, lower probability, more leverage

**Beginner recommendation**: ATM or slightly OTM

## Selecting Your Expiration

**Rule of thumb**: Give yourself 2x the time you expect to need

Expecting a move in 2 weeks? Buy 30-45 DTE minimum.

## Managing the Position

**Profit target**: 50-100% gain is reasonable
**Stop loss**: 50% of premium or technical level
**Time stop**: Exit at 14-21 DTE if not profitable

## Key Takeaways
1. Buy calls when bullish with defined risk
2. ATM or slight OTM for beginners
3. Give yourself adequate time (45+ DTE)
4. Have profit and stop-loss targets`,
          quiz_questions: [
            {
              question: "When should you consider buying a call option?",
              options: [
                "When you're bearish on the stock",
                "When you're bullish and want leveraged exposure",
                "When you expect no movement",
                "When the stock is at all-time lows"
              ],
              correct_answer: 1,
              explanation: "Buy calls when you're bullish and want leveraged exposure with limited risk."
            },
            {
              question: "If you expect a move in 2 weeks, what expiration should you consider?",
              options: [
                "Same week",
                "2 weeks out",
                "30-45 days out (2x expected time)",
                "1 year out"
              ],
              correct_answer: 2,
              explanation: "Give yourself at least 2x the expected move time to account for timing uncertainty and time decay."
            }
          ]
        },
        {
          title: "Long Puts: When and How",
          description: "Learn the basic bearish options strategy.",
          duration: "25 min",
          content_markdown: `# Long Puts: When and How

## Learning Objectives
- Know when to use long puts
- Select appropriate strikes and expirations
- Calculate break-even and profit potential
- Manage long put positions

## When to Buy Puts

✅ You're bearish on the stock
✅ You expect a decline within your timeframe
✅ You want downside exposure with limited risk
✅ The stock is trending down or breaking support

## Protective Puts

Own stock and worried about a drop?
Buy puts as insurance to limit your downside.

**Example**: Own 100 shares at $50, buy $45 put
Your maximum loss is now limited to $5/share + put cost.

## Managing the Position

**Profit target**: 50-100% gain is reasonable
**Stop loss**: 50% of premium or technical level
**Time stop**: Exit at 14-21 DTE if not profitable

## Key Takeaways
1. Buy puts when bearish or for protection
2. Same strike/expiration rules as calls
3. Protective puts limit stock losses
4. Have defined exit criteria`,
          quiz_questions: [
            {
              question: "What is a protective put?",
              options: [
                "A put bought to speculate on price declines",
                "A put bought to protect existing stock holdings from decline",
                "A put sold for income",
                "A put that never expires"
              ],
              correct_answer: 1,
              explanation: "A protective put is purchased to protect existing stock holdings from downside risk."
            },
            {
              question: "What is your market outlook when buying puts?",
              options: [
                "Bullish",
                "Neutral",
                "Bearish (expecting price to fall)",
                "Very bullish"
              ],
              correct_answer: 2,
              explanation: "Puts profit when the underlying stock price declines, so you should be bearish."
            }
          ]
        },
        {
          title: "Covered Calls Conceptual Overview",
          description: "Understand the covered call strategy at a conceptual level.",
          duration: "25 min",
          content_markdown: `# Covered Calls Conceptual Overview

## Learning Objectives
- Understand the covered call concept
- Know when covered calls make sense
- Recognize the trade-offs
- Prepare for future implementation

## What Is a Covered Call?

**Own 100 shares + Sell 1 call option**

You collect premium in exchange for capping your upside.

Think of it as "renting out" your shares.

## Why Use Covered Calls?

1. Generate income on stocks you own
2. Reduce cost basis
3. Provide small downside buffer
4. Works well in sideways markets

## The Trade-Off

**You receive**: Premium (income)
**You give up**: Upside above strike price

If stock rallies strongly, you miss profits above your strike.

## Example Scenario

Own 100 shares of XYZ at $50
Sell $55 call for $1.50

**Possible outcomes**:
- Stock stays below $55: Keep shares + $150 premium
- Stock goes above $55: Sell shares at $55 + keep premium

## When to Consider

✅ You own shares you'd be okay selling at a profit
✅ You expect sideways to slightly up movement
✅ You want income while holding

❌ Avoid if expecting big upside moves

## Key Takeaways
1. Covered calls = own shares + sell call
2. You collect premium but cap upside
3. Works best in neutral to slightly bullish markets
4. Requires owning 100 shares`,
          quiz_questions: [
            {
              question: "What do you need to sell a covered call?",
              options: [
                "Nothing - anyone can sell covered calls",
                "Own 100 shares of the underlying stock",
                "A margin account only",
                "Level 5 options approval"
              ],
              correct_answer: 1,
              explanation: "A covered call requires owning 100 shares of the underlying stock to 'cover' the sold call."
            },
            {
              question: "What is the trade-off when selling a covered call?",
              options: [
                "You might lose money on the stock",
                "You receive premium but cap your upside potential",
                "You have to pay margin interest",
                "You must hold for one year"
              ],
              correct_answer: 1,
              explanation: "The trade-off is receiving premium income in exchange for capping your profit potential above the strike."
            }
          ]
        },
        {
          title: "Cash-Secured Puts Conceptual Overview",
          description: "Understand the cash-secured put strategy at a conceptual level.",
          duration: "25 min",
          content_markdown: `# Cash-Secured Puts Conceptual Overview

## Learning Objectives
- Understand the cash-secured put concept
- Know when cash-secured puts make sense
- Recognize the trade-offs
- Prepare for future implementation

## What Is a Cash-Secured Put?

**Sell a put + Hold cash to buy shares if assigned**

You collect premium and agree to buy shares at strike price.

Think of it as "getting paid to wait for a lower entry."

## Why Use Cash-Secured Puts?

1. Get paid while waiting to buy a stock
2. Potential to buy at a discount
3. Works well in neutral to bullish markets
4. Generates income on cash

## The Trade-Off

**You receive**: Premium (income)
**You accept**: Obligation to buy at strike if assigned

If stock drops significantly, you buy above market price.

## Example Scenario

XYZ trading at $50
Sell $45 put for $1.50

**Possible outcomes**:
- Stock stays above $45: Keep $150 premium, no shares
- Stock drops below $45: Buy shares at $45 - $1.50 = $43.50 effective price

## Requirements

- Cash account: Need full cash to buy 100 shares
- Margin account: Less cash required, but still reserved

## When to Consider

✅ You want to own the stock at a lower price
✅ You're okay buying at the strike price
✅ You expect sideways to up movement

❌ Avoid if you don't want to own the stock

## Key Takeaways
1. Cash-secured put = sell put + hold cash
2. You collect premium while agreeing to buy
3. Effectively buy at discount if assigned
4. Only on stocks you want to own`,
          quiz_questions: [
            {
              question: "What must you be willing to do when selling a cash-secured put?",
              options: [
                "Buy more puts",
                "Buy the stock at the strike price if assigned",
                "Sell the stock immediately",
                "Pay additional premium"
              ],
              correct_answer: 1,
              explanation: "When selling a put, you agree to buy the stock at the strike price if assigned."
            },
            {
              question: "Why is it called 'cash-secured'?",
              options: [
                "Because you need cash to pay commissions",
                "Because you hold cash to buy shares if assigned",
                "Because cash settles faster",
                "Because it's a cash account only strategy"
              ],
              correct_answer: 1,
              explanation: "It's 'cash-secured' because you maintain enough cash to purchase the shares if the put is assigned."
            }
          ]
        },
        {
          title: "When NOT to Trade Options",
          description: "Recognize situations where it's better not to trade.",
          duration: "20 min",
          content_markdown: `# When NOT to Trade Options

## Learning Objectives
- Recognize unfavorable trading conditions
- Know when to stay on the sidelines
- Protect capital during uncertainty
- Develop patience as a skill

## Market Conditions to Avoid

### 1. Extreme Uncertainty
- Major news pending (Fed, earnings, elections)
- Geopolitical crises
- Market-wide panic

Options are expensive; outcomes are binary.

### 2. Low Volatility Drift
- Stock going nowhere
- Options decaying without moves
- Premium overpriced for the movement

### 3. Illiquid Options
- Wide bid-ask spreads (>$0.30)
- Low volume and open interest
- Poor fills guaranteed

## Personal Conditions to Avoid

### 1. Emotional States
- Angry or frustrated
- Just had a big loss
- Distracted or stressed
- Overconfident after winning streak

### 2. Practical Limitations
- Can't monitor position
- Need the money soon
- Haven't done research

## Signs You Should Wait

❌ "I need to trade something today"
❌ "I'm bored, let me find a play"
❌ "Everyone else is making money"
❌ "This will make up for yesterday"

✅ "I don't see a good setup today"
✅ "I'll wait for conditions to improve"

## Key Takeaways
1. Sometimes the best trade is no trade
2. Avoid trading during extreme uncertainty
3. Don't trade from emotional states
4. Patience protects capital`,
          quiz_questions: [
            {
              question: "When should you avoid trading options?",
              options: [
                "When you have a good setup",
                "When emotional, uncertain, or market conditions are unfavorable",
                "When the market is open",
                "When you have money in your account"
              ],
              correct_answer: 1,
              explanation: "Avoid trading when emotional, during high uncertainty, or when market conditions don't favor your strategy."
            },
            {
              question: "What is a sign you should wait rather than trade?",
              options: [
                "You have a clear thesis and setup",
                "You're thinking 'I need to trade something today'",
                "The market is open",
                "You've done your research"
              ],
              correct_answer: 1,
              explanation: "Feeling like you NEED to trade is a red flag. Good traders wait for quality setups."
            }
          ]
        }
      ]
    },
    // Modules 8-13 with abbreviated lessons due to length
    {
      title: "Introduction to Volatility",
      description: "Understand volatility and its crucial impact on options pricing.",
      lessons: [
        { title: "What Is Volatility?", description: "Understand the concept of volatility and why it matters.", duration: "25 min", content_markdown: "# What Is Volatility?\n\nVolatility measures how much a stock's price moves over time. Higher volatility = larger price swings.\n\n## Key Takeaways\n1. Volatility is about magnitude of price movement\n2. Higher volatility = more expensive options\n3. Volatility impacts all options prices", quiz_questions: [{ question: "What does high volatility indicate?", options: ["Small price movements", "Large price swings", "No movement", "Guaranteed profits"], correct_answer: 1, explanation: "High volatility means the stock has larger price swings." }] },
        { title: "Implied vs Historical Volatility", description: "Learn the difference between IV and HV.", duration: "25 min", content_markdown: "# Implied vs Historical Volatility\n\n**Historical Volatility (HV)**: How much stock actually moved in the past\n**Implied Volatility (IV)**: How much market expects future movement (priced into options)\n\n## Key Takeaways\n1. HV looks backward, IV looks forward\n2. IV is derived from option prices\n3. Compare IV to HV for opportunities", quiz_questions: [{ question: "What is implied volatility?", options: ["Past price movement", "Expected future movement priced into options", "The strike price", "Volume"], correct_answer: 1, explanation: "IV represents the market's expectation of future volatility as priced into options." }] },
        { title: "Why Volatility Matters for Options", description: "See how volatility directly affects option prices.", duration: "20 min", content_markdown: "# Why Volatility Matters\n\nHigher IV = More expensive options\nLower IV = Cheaper options\n\n## Key Takeaways\n1. IV directly affects premium\n2. High IV = expensive to buy, good to sell\n3. Low IV = cheap to buy, bad to sell", quiz_questions: [{ question: "How does high IV affect option premiums?", options: ["Makes them cheaper", "Makes them more expensive", "No effect", "Depends on strike"], correct_answer: 1, explanation: "Higher implied volatility increases option premiums because there's more expected movement." }] },
        { title: "High vs Low Volatility Environments", description: "Recognize different volatility environments.", duration: "20 min", content_markdown: "# Volatility Environments\n\n**High IV Environment**: VIX elevated, market uncertainty, expensive options\n**Low IV Environment**: VIX low, calm market, cheap options\n\n## Strategy Implications\n- High IV: Consider selling premium\n- Low IV: Consider buying premium", quiz_questions: [{ question: "In a high IV environment, what strategy might be favored?", options: ["Buying options", "Selling options (collect high premium)", "No trading", "Only buying stocks"], correct_answer: 1, explanation: "High IV means expensive options, making selling premium potentially favorable." }] },
        { title: "The VIX: Fear Index Basics", description: "Learn about the VIX and what it tells us.", duration: "20 min", content_markdown: "# The VIX: Fear Index\n\nThe VIX measures expected S&P 500 volatility over 30 days.\n\n**VIX levels**:\n- Below 15: Low fear, complacent\n- 15-25: Normal\n- Above 25: Elevated fear\n- Above 40: Extreme fear\n\n## Key Takeaways\n1. VIX rises when market drops\n2. VIX helps gauge market sentiment\n3. Use VIX for strategy selection", quiz_questions: [{ question: "What does a VIX reading above 30 typically indicate?", options: ["Low volatility", "Normal market conditions", "Elevated fear and uncertainty", "Bull market"], correct_answer: 2, explanation: "A VIX above 30 indicates elevated fear and high expected volatility." }] }
      ]
    },
    {
      title: "Trade Planning & Entry Discipline",
      description: "Learn to plan trades systematically and execute with discipline.",
      lessons: [
        { title: "Creating a Trade Checklist", description: "Build your systematic pre-trade process.", duration: "20 min", content_markdown: "# Trade Checklist\n\nBefore every trade, answer:\n1. What's my thesis?\n2. What's my target?\n3. What's my stop-loss?\n4. Is position size appropriate?\n5. Am I in the right mental state?\n\n## Key Takeaways\n1. Never trade without a plan\n2. Write down your thesis\n3. Know exits before entry", quiz_questions: [{ question: "What should you know before entering any trade?", options: ["Only the potential profit", "Entry, target, stop-loss, and thesis", "The stock's founding date", "Today's weather"], correct_answer: 1, explanation: "You should know your entry, targets, stops, and thesis before every trade." }] },
        { title: "Defining Entry Rules", description: "Establish clear criteria for when to enter trades.", duration: "20 min", content_markdown: "# Entry Rules\n\nGood entry rules are:\n- Specific and measurable\n- Based on price action or indicators\n- Repeatable across trades\n\n## Example Entry Rule\n\"Buy call when stock breaks above 50-day MA on above-average volume\"\n\n## Key Takeaways\n1. Define rules before looking at charts\n2. Rules remove emotion from entries\n3. Document and review your rules", quiz_questions: [{ question: "Why are specific entry rules important?", options: ["To impress others", "To remove emotion and ensure consistency", "To trade faster", "They're not important"], correct_answer: 1, explanation: "Specific entry rules remove emotional decision-making and ensure consistent execution." }] },
        { title: "Avoiding FOMO Trades", description: "Learn to resist fear of missing out.", duration: "20 min", content_markdown: "# Avoiding FOMO\n\nFOMO = Fear Of Missing Out\n\n## Signs of FOMO\n- Entering because \"it's going up!\"\n- No clear thesis beyond price movement\n- Chasing after big moves\n- Not following your rules\n\n## Prevention\n1. Stick to your checklist\n2. If you missed it, let it go\n3. Better opportunities always come\n\n## Key Takeaways\n1. FOMO leads to poor entries\n2. Missed trades are part of trading\n3. Discipline beats emotion", quiz_questions: [{ question: "What is FOMO in trading?", options: ["A trading strategy", "Fear of missing out - chasing moves", "A technical indicator", "A type of option"], correct_answer: 1, explanation: "FOMO is the fear of missing out, which leads to impulsive, unplanned trades." }] },
        { title: "Planning Exits Before Entry", description: "Why exit planning matters and how to do it.", duration: "20 min", content_markdown: "# Exit Planning\n\nDefine THREE exits before entering:\n1. **Profit target**: Where you'll take gains\n2. **Stop loss**: Where you'll cut losses\n3. **Time stop**: When you'll exit regardless\n\n## Why Before Entry?\n- You're objective before committed\n- Removes hope and fear later\n- Creates accountability\n\n## Key Takeaways\n1. Plan exits before entering\n2. Have profit, stop, and time exits\n3. Follow your plan once set", quiz_questions: [{ question: "What is a 'time stop'?", options: ["A stop based on price", "Exiting at a predetermined time/date regardless of price", "Stopping trading for the day", "A fast stop order"], correct_answer: 1, explanation: "A time stop means exiting a position after a set amount of time, regardless of price." }] },
        { title: "Building a Trading Routine", description: "Establish daily and weekly trading habits.", duration: "20 min", content_markdown: "# Trading Routine\n\n## Pre-Market\n- Review watchlist\n- Check overnight news\n- Review open positions\n- Set alerts for levels\n\n## During Market\n- Execute planned trades only\n- Monitor positions\n- Update journal\n\n## Post-Market\n- Review day's trades\n- Update journal\n- Plan for tomorrow\n\n## Key Takeaways\n1. Consistency comes from routine\n2. Preparation prevents mistakes\n3. Review creates improvement", quiz_questions: [{ question: "What should you do before the market opens?", options: ["Nothing, just trade when it opens", "Review watchlist, news, and open positions", "Sleep in", "Only check after big moves"], correct_answer: 1, explanation: "Pre-market preparation includes reviewing your watchlist, overnight news, and existing positions." }] }
      ]
    },
    {
      title: "Managing Trades & Simple Exits",
      description: "Learn how to manage open positions and execute exits effectively.",
      lessons: [
        { title: "Setting Profit Targets", description: "Define where and when to take profits.", duration: "20 min", content_markdown: "# Profit Targets\n\nCommon approaches:\n- Percentage gain (50%, 100%)\n- Technical level (resistance)\n- Risk multiple (2x, 3x risk)\n\n## Key Takeaways\n1. Define targets before entry\n2. Consider scaling out\n3. Don't get greedy", quiz_questions: [{ question: "What is a common profit target for options?", options: ["5%", "50-100% gain", "500%", "10x"], correct_answer: 1, explanation: "50-100% gains are common, reasonable profit targets for options trades." }] },
        { title: "Using Stop Losses", description: "Protect positions with defined stop losses.", duration: "20 min", content_markdown: "# Stop Losses\n\n**Types of stops**:\n- Percentage stop (50% of premium)\n- Technical stop (below support)\n- Time stop (exit at X DTE)\n\n## Key Takeaways\n1. Always have a stop\n2. Honor your stops\n3. Stops limit damage", quiz_questions: [{ question: "What is the purpose of a stop loss?", options: ["To maximize profits", "To limit losses to a predetermined amount", "To buy more at lower prices", "To earn interest"], correct_answer: 1, explanation: "Stop losses limit your losses to a predetermined amount." }] },
        { title: "Time-Based Exits", description: "Exit based on time remaining rather than price.", duration: "20 min", content_markdown: "# Time-Based Exits\n\n**Why time stops?**\n- Time decay accelerates\n- Your thesis has a time horizon\n- Avoid expiration week decay\n\n**Common rules**:\n- Exit at 21 DTE if not profitable\n- Exit at 14 DTE if not working\n- Never hold through expiration week (for beginners)\n\n## Key Takeaways\n1. Time decay accelerates near expiration\n2. Set time stops before entry\n3. Exit early if thesis isn't working", quiz_questions: [{ question: "Why exit at 21 DTE if not profitable?", options: ["Broker requirement", "Time decay accelerates significantly after this point", "Options become illegal", "It's a random number"], correct_answer: 1, explanation: "Time decay accelerates in the final 21 days, so exiting preserves remaining value." }] },
        { title: "Cutting Losses Effectively", description: "Learn to take losses before they grow.", duration: "20 min", content_markdown: "# Cutting Losses\n\n**Key principles**:\n1. Small losses are part of trading\n2. Big losses are account killers\n3. Honor your stop once hit\n4. Don't average down on losing options\n\n## Emotional Hurdles\n- Admitting you're wrong is hard\n- Hope is not a strategy\n- The market doesn't know your entry\n\n## Key Takeaways\n1. Cut losses quickly\n2. Don't hope for recovery\n3. Small losses keep you in the game", quiz_questions: [{ question: "What should you do when a trade hits your stop loss?", options: ["Hold and hope", "Add to the position", "Exit as planned", "Move the stop lower"], correct_answer: 2, explanation: "When your stop is hit, exit as planned. Don't hope or move stops." }] },
        { title: "Knowing When to Hold", description: "Recognize when patience is the right choice.", duration: "20 min", content_markdown: "# When to Hold\n\n**Hold when**:\n- Thesis is still valid\n- Position is within normal range\n- You're not panic selling\n- Stop and target haven't been hit\n\n**Exit when**:\n- Thesis is invalidated\n- Stop or target is hit\n- Time stop triggered\n- You're emotionally compromised\n\n## Key Takeaways\n1. Holding requires thesis being intact\n2. Don't panic sell on noise\n3. Know the difference between pullback and failure", quiz_questions: [{ question: "When should you continue holding a position?", options: ["Always", "Never", "When your original thesis remains valid", "Only when losing money"], correct_answer: 2, explanation: "Hold when your original thesis is still valid and no exit criteria have been triggered." }] }
      ]
    },
    {
      title: "Common Beginner Mistakes & How to Avoid Them",
      description: "Learn from others' mistakes before making them yourself.",
      lessons: [
        { title: "Overtrading: The Silent Account Killer", description: "Understand why trading too much destroys accounts.", duration: "20 min", content_markdown: "# Overtrading\n\n**Signs of overtrading**:\n- Trading every day\n- Multiple trades per day\n- No clear thesis\n- Boredom trading\n\n**Consequences**:\n- Commissions add up\n- More exposure to losses\n- Emotional exhaustion\n- Poor quality trades\n\n## Key Takeaways\n1. Quality over quantity\n2. Most days have no good setups\n3. Track trade frequency in your journal", quiz_questions: [{ question: "What is a sign of overtrading?", options: ["Trading once a week", "Having a clear plan", "Trading every day without clear setups", "Taking small positions"], correct_answer: 2, explanation: "Trading daily without clear setups is a sign of overtrading." }] },
        { title: "Oversizing: Betting Too Big", description: "Why position sizing mistakes are catastrophic.", duration: "20 min", content_markdown: "# Oversizing\n\n**The danger**:\n- One trade can ruin your account\n- Emotions cloud judgment\n- No room for error\n\n**The fix**:\n- 1-5% risk per trade\n- Calculate BEFORE entering\n- Size for worst case\n\n## Key Takeaways\n1. Big positions = big problems\n2. Calculate risk before trading\n3. If in doubt, size down", quiz_questions: [{ question: "What is the primary danger of oversizing positions?", options: ["Missing out on profits", "One trade can devastate your account", "Brokers charge more", "Nothing"], correct_answer: 1, explanation: "Oversizing means one bad trade can cause catastrophic account damage." }] },
        { title: "Holding to Expiration", description: "Why beginners should rarely hold through expiration.", duration: "20 min", content_markdown: "# Holding to Expiration\n\n**Problems**:\n- Time decay is extreme\n- Assignment risk\n- All-or-nothing outcome\n- Gamma risk (wild swings)\n\n**Better approach**:\n- Exit by 14-21 DTE\n- Take profits early\n- Roll if needed\n\n## Key Takeaways\n1. Expiration week is high-risk\n2. Exit before the final week\n3. Don't gamble on last-day moves", quiz_questions: [{ question: "Why should beginners avoid holding options to expiration?", options: ["It's illegal", "Extreme time decay and assignment risk", "Brokers won't allow it", "They gain more value"], correct_answer: 1, explanation: "Holding to expiration exposes you to extreme time decay and assignment risk." }] },
        { title: "Chasing Losses (Revenge Trading)", description: "Break the cycle of trying to make back losses.", duration: "20 min", content_markdown: "# Revenge Trading\n\n**The pattern**:\n1. Take a loss\n2. Feel frustrated\n3. Enter another trade to \"make it back\"\n4. Take another loss (often bigger)\n5. Repeat\n\n**Breaking the cycle**:\n- Walk away after losses\n- Follow your rules, not emotions\n- Accept that losses are normal\n\n## Key Takeaways\n1. Revenge trading compounds losses\n2. Take breaks after losses\n3. Tomorrow is another day", quiz_questions: [{ question: "What is revenge trading?", options: ["A profitable strategy", "Trading to recover losses after an emotional reaction", "A type of put option", "Trading on revenge stocks"], correct_answer: 1, explanation: "Revenge trading is impulsively trading to recover losses, usually leading to more losses." }] },
        { title: "Ignoring Time Decay", description: "Understanding theta's impact on your positions.", duration: "20 min", content_markdown: "# Ignoring Time Decay\n\n**The mistake**:\nBuying options and waiting indefinitely for the stock to move.\n\n**The reality**:\n- Options lose value daily\n- Stock can stay flat while you lose\n- Time works against buyers\n\n**The fix**:\n- Buy adequate time\n- Have time stops\n- Monitor theta daily\n\n## Key Takeaways\n1. Time decay is constant and accelerating\n2. You're racing the clock\n3. Account for theta in every trade", quiz_questions: [{ question: "What happens to option value as time passes (all else equal)?", options: ["It increases", "It decreases due to time decay", "It stays the same", "It depends on the moon phase"], correct_answer: 1, explanation: "Option value decreases over time due to theta decay, all else being equal." }] }
      ]
    },
    {
      title: "Trading Psychology for Beginners",
      description: "Develop the mental skills essential for trading success.",
      lessons: [
        { title: "Fear vs Greed", description: "Understand the two dominant trading emotions.", duration: "20 min", content_markdown: "# Fear vs Greed\n\n**Fear causes**:\n- Exiting winners too early\n- Not entering good setups\n- Panic selling\n\n**Greed causes**:\n- Holding losers too long\n- Oversizing positions\n- Chasing moves\n\n## Key Takeaways\n1. Both extremes hurt performance\n2. Rules protect against both\n3. Self-awareness is key", quiz_questions: [{ question: "What does fear typically cause traders to do?", options: ["Hold losers too long", "Exit winners too early", "Over-trade", "Buy more"], correct_answer: 1, explanation: "Fear often causes traders to exit winning positions too early." }] },
        { title: "Developing Patience", description: "Learn why waiting is often the best action.", duration: "20 min", content_markdown: "# Patience in Trading\n\n**Patience means**:\n- Waiting for quality setups\n- Letting trades develop\n- Not forcing action\n\n**Building patience**:\n- Have a watchlist ready\n- Journal why you waited\n- Celebrate good waiting\n\n## Key Takeaways\n1. Good traders wait for setups\n2. Patience is a competitive advantage\n3. Track and reward your patience", quiz_questions: [{ question: "What is a benefit of patience in trading?", options: ["More trades", "Waiting for high-quality setups", "Faster execution", "Higher commissions"], correct_answer: 1, explanation: "Patience allows you to wait for and trade only high-quality setups." }] },
        { title: "Emotional Detachment", description: "Separate your identity from your trades.", duration: "20 min", content_markdown: "# Emotional Detachment\n\n**The problem**:\n- \"I was right\" (ego)\n- \"I was wrong\" (shame)\n- P&L = Self-worth\n\n**The solution**:\n- Trades are decisions, not you\n- Focus on process, not outcome\n- Losses happen to all traders\n\n## Key Takeaways\n1. You are not your trades\n2. Process matters more than outcome\n3. Detach ego from results", quiz_questions: [{ question: "What is emotional detachment in trading?", options: ["Not caring about money", "Separating your identity from trade outcomes", "Trading without emotion", "Quitting trading"], correct_answer: 1, explanation: "Emotional detachment means not tying your self-worth to trade outcomes." }] },
        { title: "Building Trading Confidence", description: "Develop confidence through competence.", duration: "20 min", content_markdown: "# Building Confidence\n\n**True confidence comes from**:\n- Consistent process\n- Surviving losses\n- Learning from mistakes\n- Small wins accumulating\n\n**False confidence**:\n- One big win\n- Hot streak\n- Ignoring risk\n\n## Key Takeaways\n1. Confidence is built through experience\n2. Small consistent wins build real confidence\n3. Overconfidence is dangerous", quiz_questions: [{ question: "How is true trading confidence built?", options: ["One big winning trade", "Consistent process and learning from experience", "Ignoring losses", "Following social media"], correct_answer: 1, explanation: "True confidence comes from consistent process, surviving losses, and learning from mistakes." }] },
        { title: "Creating a Positive Trading Mindset", description: "Develop mental habits for long-term success.", duration: "20 min", content_markdown: "# Positive Trading Mindset\n\n**Key mental habits**:\n1. Focus on what you can control\n2. View losses as tuition\n3. Celebrate process, not just profits\n4. Practice gratitude for opportunities\n\n**Daily practices**:\n- Morning intention setting\n- Evening review\n- Physical exercise\n- Proper sleep\n\n## Key Takeaways\n1. Mindset affects performance\n2. Control what you can\n3. Physical health supports mental clarity", quiz_questions: [{ question: "What should traders focus on that they can control?", options: ["Stock prices", "Market direction", "Their process and risk management", "Other traders' actions"], correct_answer: 2, explanation: "Focus on what you control: your process, risk management, and execution." }] }
      ]
    },
    {
      title: "Practice, Paper Trading & Skill Development",
      description: "Learn how to practice effectively before risking real money.",
      lessons: [
        { title: "The Importance of Paper Trading", description: "Why simulation is essential before live trading.", duration: "20 min", content_markdown: "# Paper Trading\n\n**Benefits**:\n- Practice without risk\n- Learn platform mechanics\n- Test strategies\n- Build confidence\n\n**Limitations**:\n- No real emotions\n- Fills may differ from live\n- Easy to ignore results\n\n## Key Takeaways\n1. Paper trade before risking money\n2. Treat it seriously like real money\n3. Track results rigorously", quiz_questions: [{ question: "Why is paper trading important for beginners?", options: ["It makes real money", "It allows practice without financial risk", "Brokers require it", "It's not important"], correct_answer: 1, explanation: "Paper trading lets you practice strategies and learn platforms without risking real money." }] },
        { title: "How to Paper Trade Effectively", description: "Get the most value from simulation trading.", duration: "20 min", content_markdown: "# Effective Paper Trading\n\n**Best practices**:\n1. Use realistic position sizes\n2. Follow all your rules\n3. Track every trade\n4. Review weekly\n5. Take it seriously\n\n**Common mistakes**:\n- Trading unrealistic sizes\n- Not following rules because \"it's not real\"\n- Not tracking results\n\n## Key Takeaways\n1. Trade paper like it's real money\n2. Track everything\n3. Review and improve", quiz_questions: [{ question: "How should you treat paper trading?", options: ["Casually, since it's not real", "As seriously as real trading, following all rules", "Only trade the biggest positions", "Don't bother tracking results"], correct_answer: 1, explanation: "Treat paper trading as seriously as real trading to build proper habits." }] },
        { title: "Tracking Your Performance", description: "Measure and analyze your trading results.", duration: "20 min", content_markdown: "# Performance Tracking\n\n**Key metrics**:\n- Win rate\n- Average win vs average loss\n- Expectancy\n- Maximum drawdown\n- Profit factor\n\n**Tools**:\n- Spreadsheet\n- Trading journal\n- Broker statements\n\n## Key Takeaways\n1. Track every trade\n2. Review metrics weekly/monthly\n3. Identify patterns in your data", quiz_questions: [{ question: "What is an important metric to track in trading?", options: ["How you feel", "Win rate and average win vs loss", "Number of charts open", "Time spent trading"], correct_answer: 1, explanation: "Win rate and comparing average wins to losses helps evaluate strategy effectiveness." }] },
        { title: "When to Transition to Live Trading", description: "Know when you're ready for real money.", duration: "20 min", content_markdown: "# Going Live\n\n**Readiness checklist**:\n□ Profitable in paper trading for 2-3 months\n□ Consistent process and rules\n□ Comfortable with the platform\n□ Have a proper account size\n□ Emotionally prepared for real losses\n\n**Transition approach**:\n- Start with smallest possible size\n- Trade 1-2 contracts maximum\n- Gradually increase as you succeed\n\n## Key Takeaways\n1. Don't rush to live trading\n2. 2-3 months paper profitability first\n3. Start very small with real money", quiz_questions: [{ question: "When should you transition to live trading?", options: ["Immediately", "After profitable paper trading for 2-3 months", "When you're bored with paper trading", "After one winning paper trade"], correct_answer: 1, explanation: "Transition after 2-3 months of consistent paper trading profitability." }] },
        { title: "Continuous Skill Development", description: "Commit to lifelong learning and improvement.", duration: "20 min", content_markdown: "# Continuous Learning\n\n**How to keep improving**:\n1. Review your trades weekly\n2. Read books and courses\n3. Join trading communities\n4. Track what's working/not working\n5. Adjust strategies based on data\n\n**Growth mindset**:\n- Every trade teaches something\n- Losses are learning opportunities\n- Markets evolve; you must too\n\n## Key Takeaways\n1. Trading is a lifelong learning journey\n2. Review and adapt continuously\n3. Stay humble and curious", quiz_questions: [{ question: "What attitude supports long-term trading success?", options: ["Knowing everything already", "Continuous learning and adaptation", "Never changing your approach", "Avoiding all losses"], correct_answer: 1, explanation: "Continuous learning and willingness to adapt are essential for long-term success." }] }
      ]
    }
  ]
};

// ============================================================================
// INTERMEDIATE OPTIONS TRADING ACADEMY - 13 Modules, 68 Lessons
// ============================================================================

const intermediateCourse: Course = {
  title: "Intermediate Options Trading Academy",
  description: "Elevate your trading with intermediate strategies, volatility-based selection, Greeks mastery, and systematic trade management. Bridge the gap between basic knowledge and advanced trading.",
  difficulty_level: "intermediate",
  estimated_duration: "20+ hours",
  order_index: 5,
  modules: [
    {
      title: "Market Structure & Trend Identification",
      description: "Learn to read market structure and identify trend phases for better trade timing.",
      lessons: [
        { title: "Understanding Market Phases", description: "Identify accumulation, markup, distribution, and markdown phases.", duration: "25 min", content_markdown: "# Market Phases\n\n## The Four Phases\n1. **Accumulation**: Smart money buying, range-bound\n2. **Markup**: Uptrend, higher highs\n3. **Distribution**: Smart money selling, range-bound\n4. **Markdown**: Downtrend, lower lows\n\n## Key Takeaways\n1. Markets cycle through phases\n2. Identify the phase before choosing strategy\n3. Don't fight the phase", quiz_questions: [{ question: "What phase follows distribution?", options: ["Accumulation", "Markup", "Markdown", "More distribution"], correct_answer: 2, explanation: "Markdown (downtrend) typically follows distribution as sellers overwhelm buyers." }] },
        { title: "Timeframe Alignment", description: "Align multiple timeframes for higher probability trades.", duration: "25 min", content_markdown: "# Timeframe Alignment\n\n**Principle**: Higher timeframe trend is dominant\n\n**Process**:\n1. Weekly: Overall trend direction\n2. Daily: Swing trend\n3. 4-hour/1-hour: Entry timing\n\n## Key Takeaways\n1. Trade with the higher timeframe trend\n2. Use lower timeframes for entries\n3. All timeframes aligned = highest probability", quiz_questions: [{ question: "Why check higher timeframes first?", options: ["They're more colorful", "Higher timeframe trend is dominant", "Lower timeframes are inaccurate", "Brokers require it"], correct_answer: 1, explanation: "Higher timeframe trends are more significant and override lower timeframe signals." }] },
        { title: "Trend Strength Assessment", description: "Measure how strong a trend really is.", duration: "25 min", content_markdown: "# Trend Strength\n\n**Indicators of strong trend**:\n- Clean higher highs/lows (or vice versa)\n- Price above key MAs\n- Pullbacks are shallow\n- Volume confirms moves\n\n**Weak trend signs**:\n- Overlapping candles\n- Deep pullbacks\n- Whipsaws\n\n## Key Takeaways\n1. Strong trends = directional plays\n2. Weak trends = caution or premium selling\n3. Measure before committing", quiz_questions: [{ question: "What indicates a strong uptrend?", options: ["Deep pullbacks", "Clean higher highs and higher lows", "Overlapping candles", "Price below MAs"], correct_answer: 1, explanation: "Strong uptrends show clean higher highs and higher lows without overlap." }] },
        { title: "Avoiding Choppy Markets", description: "Recognize and avoid unfavorable trading conditions.", duration: "20 min", content_markdown: "# Choppy Markets\n\n**Signs of chop**:\n- No clear trend\n- Whipsaws on breakouts\n- Range-bound with random moves\n- Failed setups frequently\n\n**What to do**:\n- Reduce position sizes\n- Avoid directional bets\n- Consider range strategies\n- Wait for clarity\n\n## Key Takeaways\n1. Chop kills directional traders\n2. Recognition is the first step\n3. Sometimes cash is best", quiz_questions: [{ question: "What is the best action in a choppy market?", options: ["Trade more to catch moves", "Reduce size or wait for clarity", "Use maximum leverage", "Ignore and trade anyway"], correct_answer: 1, explanation: "In choppy markets, reduce size or wait for clearer conditions." }] },
        { title: "Using Market Breadth", description: "Gauge overall market health beyond the indices.", duration: "25 min", content_markdown: "# Market Breadth\n\n**Key breadth indicators**:\n- Advance/Decline line\n- New highs vs new lows\n- Percent of stocks above 200 MA\n- Sector participation\n\n**What they tell you**:\n- Is the rally/decline broad or narrow?\n- Is the trend healthy?\n- Are there divergences?\n\n## Key Takeaways\n1. Breadth confirms index moves\n2. Narrow rallies are fragile\n3. Divergences warn of reversals", quiz_questions: [{ question: "What does poor market breadth in a rally indicate?", options: ["Strong trend", "Only a few stocks are driving gains (fragile)", "Time to buy aggressively", "Higher volatility"], correct_answer: 1, explanation: "Poor breadth means few stocks are driving the rally, which is unsustainable." }] }
      ]
    },
    {
      title: "Intermediate Options Pricing & The Greeks",
      description: "Deepen your understanding of how options are priced and how Greeks affect your positions.",
      lessons: [
        { title: "Delta in Practice", description: "Use delta for position sizing and probability assessment.", duration: "25 min", content_markdown: "# Delta in Practice\n\n**Delta tells you**:\n1. Directional exposure (shares equivalent)\n2. Approximate probability of ITM\n3. How much option moves per $1 stock move\n\n**Practical use**:\n- 0.50 delta ≈ ATM, 50% chance ITM\n- 0.30 delta ≈ OTM, 30% chance ITM\n- Dollar delta = Delta × 100 × Contracts\n\n## Key Takeaways\n1. Delta = directional risk measurement\n2. Use delta for position sizing\n3. Track dollar delta for portfolio", quiz_questions: [{ question: "What does a 0.30 delta approximately indicate?", options: ["30% probability of finishing ITM", "70% probability of finishing ITM", "30% gain expected", "Delta of the stock"], correct_answer: 0, explanation: "A 0.30 delta approximately indicates a 30% chance of finishing in-the-money." }] },
        { title: "Theta Decay Management", description: "Understand theta curves and optimize time decay.", duration: "25 min", content_markdown: "# Theta Management\n\n**Theta curve characteristics**:\n- Slow decay 60+ DTE\n- Moderate 30-60 DTE\n- Fast 14-30 DTE\n- Extreme 0-14 DTE\n\n**For buyers**: Exit before acceleration\n**For sellers**: Capture the sweet spot (45-21 DTE)\n\n## Key Takeaways\n1. Theta accelerates near expiration\n2. Buyers: don't overstay\n3. Sellers: 45-21 DTE is optimal", quiz_questions: [{ question: "When is theta decay fastest?", options: ["90+ DTE", "60 DTE", "Final 14 days", "Theta is constant"], correct_answer: 2, explanation: "Theta decay is fastest in the final 14 days before expiration." }] },
        { title: "Vega and Volatility Sensitivity", description: "Understand how IV changes affect your options.", duration: "25 min", content_markdown: "# Vega\n\n**Vega measures**: How much option price changes per 1% IV change\n\n**Example**: Vega = 0.15\nIf IV increases 1%, option gains $0.15\n\n**Implications**:\n- High vega = sensitive to IV\n- Long options benefit from IV increase\n- Short options benefit from IV decrease\n\n## Key Takeaways\n1. Vega = IV sensitivity\n2. Buy options when IV is low\n3. Sell options when IV is high", quiz_questions: [{ question: "If you're long options, what happens when IV increases?", options: ["Position loses value", "Position gains value", "No change", "Position expires"], correct_answer: 1, explanation: "Long options have positive vega, so they gain value when IV increases." }] },
        { title: "Gamma: The Acceleration Factor", description: "Understand how delta changes affect positions.", duration: "25 min", content_markdown: "# Gamma\n\n**Gamma measures**: How fast delta changes\n\n**Highest gamma**: ATM options near expiration\n\n**Why it matters**:\n- High gamma = explosive gains or losses\n- Gamma risk increases near expiration\n- ATM options most affected\n\n## Key Takeaways\n1. Gamma = rate of delta change\n2. ATM + near expiration = highest gamma\n3. Can work for or against you", quiz_questions: [{ question: "When is gamma highest?", options: ["Deep ITM, far expiration", "ATM, near expiration", "Deep OTM, far expiration", "Gamma is constant"], correct_answer: 1, explanation: "Gamma is highest for at-the-money options near expiration." }] },
        { title: "Greeks in Multi-Leg Trades", description: "Combine Greeks for spread positions.", duration: "25 min", content_markdown: "# Greeks in Spreads\n\n**In spreads, Greeks are combined**:\n- Buy call: +delta, +gamma, -theta, +vega\n- Sell call: -delta, -gamma, +theta, -vega\n- Vertical spread: reduced but not zero Greeks\n\n**Example**: Bull call spread\nBuy $100 call, Sell $105 call\nNet delta = long delta (but reduced)\nNet theta = reduced decay\n\n## Key Takeaways\n1. Spreads combine Greeks of each leg\n2. Selling reduces but doesn't eliminate Greeks\n3. Understand your net exposure", quiz_questions: [{ question: "How does adding a short leg affect theta?", options: ["Increases theta decay", "Reduces or reverses theta exposure", "No effect", "Doubles theta"], correct_answer: 1, explanation: "Selling an option adds positive theta, reducing or reversing the position's theta exposure." }] },
        { title: "Portfolio Greeks Management", description: "Track and manage Greeks across all positions.", duration: "30 min", content_markdown: "# Portfolio Greeks\n\n**Why manage portfolio Greeks?**\n- Understand total directional exposure\n- Know overall theta impact daily\n- Gauge IV sensitivity of portfolio\n\n**Practical approach**:\n1. Sum delta across positions (dollar delta)\n2. Sum theta for daily P&L estimate\n3. Check vega for IV event risk\n\n## Key Takeaways\n1. Greeks aggregate across positions\n2. Monitor daily to avoid surprises\n3. Hedge if exposure gets too large", quiz_questions: [{ question: "Why sum up portfolio delta?", options: ["For tax purposes", "To understand total directional exposure", "Brokers require it", "Delta must equal zero"], correct_answer: 1, explanation: "Portfolio delta shows your total directional exposure across all positions." }] }
      ]
    },
    {
      title: "Volatility for Strategy Selection",
      description: "Use volatility to choose the right strategy for current market conditions.",
      lessons: [
        { title: "Understanding IV Rank and IV Percentile", description: "Interpret volatility context indicators.", duration: "25 min", content_markdown: "# IV Rank vs IV Percentile\n\n**IV Rank**: Where current IV stands relative to 52-week range\n- Formula: (Current IV - 52-week low) / (52-week high - 52-week low)\n\n**IV Percentile**: Percentage of days IV was lower\n\n**Usage**:\n- Above 50: High IV environment\n- Below 50: Low IV environment\n\n## Key Takeaways\n1. IV Rank/Percentile provide context\n2. Above 50 = relatively high IV\n3. Use for strategy selection", quiz_questions: [{ question: "What does an IV Rank of 80 indicate?", options: ["Current IV is 80", "IV is in the top 20% of its 52-week range", "80 days until expiration", "80% chance of profit"], correct_answer: 1, explanation: "An IV Rank of 80 means current IV is near the top of its 52-week range." }] },
        { title: "High IV Strategy Selection", description: "Choose strategies when volatility is elevated.", duration: "25 min", content_markdown: "# High IV Strategies\n\n**When IV Rank > 50:**\nPremium is expensive → consider selling\n\n**Favored strategies**:\n- Short puts (cash-secured)\n- Credit spreads\n- Iron condors\n- Short strangles (advanced)\n\n**Why**:\n- Collect more premium\n- IV likely to decrease (crush)\n- Time decay on your side\n\n## Key Takeaways\n1. High IV = expensive options\n2. Favor premium selling strategies\n3. IV crush benefits sellers", quiz_questions: [{ question: "Why sell options in high IV environments?", options: ["Options are cheap", "You collect more premium and IV is likely to decrease", "It's required by brokers", "High IV means low risk"], correct_answer: 1, explanation: "High IV means expensive premiums, and IV mean-reverts, benefiting sellers." }] },
        { title: "Low IV Strategy Selection", description: "Choose strategies when volatility is compressed.", duration: "25 min", content_markdown: "# Low IV Strategies\n\n**When IV Rank < 30:**\nPremium is cheap → consider buying\n\n**Favored strategies**:\n- Long calls/puts\n- Debit spreads\n- Long straddles (for IV expansion)\n- Calendar spreads\n\n**Why**:\n- Options are cheap\n- IV may expand\n- Limited risk\n\n## Key Takeaways\n1. Low IV = cheap options\n2. Favor buying strategies\n3. IV expansion benefits buyers", quiz_questions: [{ question: "Why buy options in low IV environments?", options: ["Premium is expensive", "Premium is cheap and IV may expand", "Low IV is guaranteed profit", "Selling is not allowed"], correct_answer: 1, explanation: "Low IV means cheap premiums, and potential IV expansion benefits buyers." }] },
        { title: "IV Expansion and Contraction Events", description: "Recognize events that cause volatility changes.", duration: "25 min", content_markdown: "# IV Events\n\n**IV Expansion triggers**:\n- Upcoming earnings\n- Economic data releases\n- FDA decisions\n- Elections\n- Market uncertainty\n\n**IV Contraction triggers**:\n- After earnings (IV crush)\n- Post-event resolution\n- Market calm\n\n## Key Takeaways\n1. Events drive IV changes\n2. Position BEFORE for IV expansion\n3. Exit or adjust AFTER for crush", quiz_questions: [{ question: "What typically happens to IV after an earnings announcement?", options: ["It expands", "It contracts (IV crush)", "It stays the same", "It doubles"], correct_answer: 1, explanation: "IV typically contracts after earnings as uncertainty is resolved - known as IV crush." }] },
        { title: "Avoiding Premium Traps", description: "Recognize when high/low IV is misleading.", duration: "25 min", content_markdown: "# Premium Traps\n\n**High IV Trap**:\nIV is high because of an event → it might stay high or go higher\nExample: Pre-earnings IV is high for good reason\n\n**Low IV Trap**:\nIV is low but could stay low\nExample: Low volatility regime for months\n\n**Prevention**:\n- Check why IV is high/low\n- Consider the event calendar\n- Don't blindly follow IV rank\n\n## Key Takeaways\n1. Context matters more than number\n2. Check upcoming events\n3. IV can stay extreme longer than expected", quiz_questions: [{ question: "What is a high IV trap?", options: ["IV that is falsely high", "Selling premium before an event that could push IV higher", "A trap set by brokers", "IV that never changes"], correct_answer: 1, explanation: "A high IV trap is selling premium when IV might go even higher due to upcoming events." }] }
      ]
    },
    // Modules 4-13 abbreviated for length
    {
      title: "Intermediate Technical Analysis",
      description: "Advance your chart reading skills with institutional techniques.",
      lessons: [
        { title: "Support and Resistance Refinement", description: "Identify stronger levels and zones.", duration: "25 min", content_markdown: "# Refined S/R\n\nKey principles:\n- Zones, not lines\n- Multiple touches = stronger\n- Recent levels > old levels\n- High volume confirms\n\n## Key Takeaways\n1. Use zones, not exact prices\n2. Count touches for strength\n3. Combine with volume", quiz_questions: [{ question: "What makes a support level stronger?", options: ["One touch", "Multiple touches over time", "Recent price action only", "Low volume"], correct_answer: 1, explanation: "Multiple touches over time confirm the level's significance." }] },
        { title: "Trend Channels and Wedges", description: "Use channels for trend trading.", duration: "25 min", content_markdown: "# Channels\n\nAscending channel: Higher highs and higher lows within parallel lines\nDescending channel: Lower highs and lower lows\nWedge: Converging lines indicating potential reversal\n\n## Key Takeaways\n1. Channels define the trend\n2. Trade bounces from channel edges\n3. Breakouts signal trend changes", quiz_questions: [{ question: "What does a channel breakout suggest?", options: ["Trend continuation", "Potential trend change or acceleration", "Nothing", "Time to panic"], correct_answer: 1, explanation: "Channel breakouts suggest potential trend changes or accelerations." }] },
        { title: "Moving Averages as Dynamic Support/Resistance", description: "Use MAs for trend following.", duration: "25 min", content_markdown: "# Dynamic S/R\n\nIn uptrends: 20, 50 MA act as support\nIn downtrends: 20, 50 MA act as resistance\n\n## Key Takeaways\n1. MAs move with price\n2. Use for entry timing\n3. MA breaks signal trend changes", quiz_questions: [{ question: "In an uptrend, what role does the 50-day MA typically play?", options: ["Resistance", "Dynamic support", "No role", "Profit target"], correct_answer: 1, explanation: "In uptrends, price often bounces off the 50-day MA as dynamic support." }] },
        { title: "Volume Confirmation", description: "Use volume to confirm price moves.", duration: "25 min", content_markdown: "# Volume Analysis\n\nKey principles:\n- Breakouts should have high volume\n- Trend moves should show increasing volume\n- Reversals often show volume spikes\n\n## Key Takeaways\n1. Volume confirms conviction\n2. Low volume moves are suspect\n3. Watch for volume divergences", quiz_questions: [{ question: "What should accompany a valid breakout?", options: ["Low volume", "High volume confirmation", "No volume", "Volume doesn't matter"], correct_answer: 1, explanation: "Valid breakouts should be accompanied by above-average volume." }] },
        { title: "Combining Multiple Confluences", description: "Stack factors for higher probability.", duration: "25 min", content_markdown: "# Confluence\n\nHigh probability setups have multiple factors:\n- S/R level + MA + Trendline\n- Volume confirmation\n- Timeframe alignment\n\nMore confluence = higher probability\n\n## Key Takeaways\n1. Stack multiple factors\n2. Confluence = higher probability\n3. Avoid single-factor trades", quiz_questions: [{ question: "What is confluence in trading?", options: ["A type of indicator", "Multiple technical factors aligning at the same level", "A trading platform", "Volume analysis"], correct_answer: 1, explanation: "Confluence occurs when multiple technical factors align, increasing probability." }] }
      ]
    },
    {
      title: "Defined-Risk Options Strategies",
      description: "Master spread strategies with defined maximum loss.",
      lessons: [
        { title: "Debit Spreads Explained", description: "Learn vertical debit spreads for directional bets.", duration: "30 min", content_markdown: "# Debit Spreads\n\nBull call spread: Buy lower strike call, Sell higher strike call\nBear put spread: Buy higher strike put, Sell lower strike put\n\nMax loss = Premium paid\nMax profit = Width - Premium\n\n## Key Takeaways\n1. Defined risk and reward\n2. Lower cost than outright purchase\n3. Capped upside", quiz_questions: [{ question: "What is the maximum loss on a debit spread?", options: ["Unlimited", "Width of strikes", "Premium paid", "Strike price"], correct_answer: 2, explanation: "Maximum loss on a debit spread is the premium paid." }] },
        { title: "Credit Spreads Explained", description: "Learn vertical credit spreads for premium collection.", duration: "30 min", content_markdown: "# Credit Spreads\n\nBull put spread: Sell higher strike put, Buy lower strike put\nBear call spread: Sell lower strike call, Buy higher strike call\n\nMax profit = Premium received\nMax loss = Width - Premium\n\n## Key Takeaways\n1. Collect premium upfront\n2. Defined maximum loss\n3. Profit from time and direction", quiz_questions: [{ question: "What is the maximum profit on a credit spread?", options: ["Unlimited", "Width of strikes", "Premium received", "Strike price"], correct_answer: 2, explanation: "Maximum profit on a credit spread is the premium received." }] },
        { title: "Choosing Debit vs Credit Spreads", description: "When to use each strategy type.", duration: "25 min", content_markdown: "# Debit vs Credit\n\n**Use Debit Spreads when:**\n- IV is low (cheap options)\n- Expecting directional move\n- Want defined risk buying\n\n**Use Credit Spreads when:**\n- IV is high (expensive options)\n- Expecting range or mild direction\n- Want positive theta\n\n## Key Takeaways\n1. IV guides the choice\n2. Low IV = debit spreads\n3. High IV = credit spreads", quiz_questions: [{ question: "In a high IV environment, which spread type is generally favored?", options: ["Debit spreads", "Credit spreads", "No spreads", "Iron butterflies only"], correct_answer: 1, explanation: "High IV favors credit spreads because you collect more premium." }] },
        { title: "Risk/Reward Evaluation for Spreads", description: "Evaluate whether spreads make mathematical sense.", duration: "25 min", content_markdown: "# Spread R/R\n\n**For credit spreads:**\nRisk = Width - Premium\nReward = Premium\nR/R = Premium / (Width - Premium)\n\n**For debit spreads:**\nRisk = Premium paid\nReward = Width - Premium\n\n## Key Takeaways\n1. Calculate R/R before entering\n2. Credit spreads often 1:2 or 1:3 risk/reward\n3. Compensate with higher win rate", quiz_questions: [{ question: "On a $5 wide credit spread with $1.50 credit, what's the max loss?", options: ["$1.50", "$3.50", "$5.00", "$6.50"], correct_answer: 1, explanation: "Max loss = Width - Credit = $5 - $1.50 = $3.50." }] },
        { title: "Spreads vs Single Options", description: "When to use spreads instead of buying/selling outright.", duration: "25 min", content_markdown: "# Spreads vs Singles\n\n**Singles**:\n- Unlimited profit potential (long)\n- Higher risk (short naked)\n- Full directional exposure\n\n**Spreads**:\n- Limited profit\n- Limited loss\n- Reduced cost/margin\n\n## Key Takeaways\n1. Spreads trade profit potential for defined risk\n2. Spreads are more capital efficient\n3. Singles for conviction; spreads for prudence", quiz_questions: [{ question: "Why use a spread instead of a single option?", options: ["Higher profit potential", "Defined risk and lower capital requirement", "No reason", "Faster fills"], correct_answer: 1, explanation: "Spreads offer defined risk and require less capital than naked positions." }] },
        { title: "Spread Entry and Exit Mechanics", description: "How to enter and exit spread positions.", duration: "25 min", content_markdown: "# Spread Mechanics\n\n**Entering**:\n- Trade as a spread (not individual legs)\n- Use limit orders\n- Check fill quality\n\n**Exiting**:\n- Close both legs together\n- Don't leg out unless experienced\n- Watch for pin risk near expiration\n\n## Key Takeaways\n1. Trade spreads as a package\n2. Use limit orders at mid-price\n3. Close before expiration to avoid assignment", quiz_questions: [{ question: "How should you enter a spread position?", options: ["Buy each leg separately", "Trade as a spread order", "Use market orders", "Only during after hours"], correct_answer: 1, explanation: "Enter spreads as a single spread order to ensure proper execution." }] }
      ]
    },
    {
      title: "Income Strategies (Intermediate)",
      description: "Generate consistent income through covered calls and cash-secured puts.",
      lessons: [
        { title: "Covered Call Execution", description: "Implement covered calls step by step.", duration: "25 min", content_markdown: "# Covered Call Execution\n\n1. Own 100+ shares\n2. Select strike (typically OTM)\n3. Select expiration (30-45 DTE)\n4. Sell the call\n5. Manage through expiration\n\n## Key Takeaways\n1. Need 100 shares per contract\n2. Strike selection defines upside cap\n3. 30-45 DTE for optimal theta", quiz_questions: [{ question: "What do you need to sell a covered call?", options: ["Nothing", "Own 100 shares of the stock", "Only a margin account", "Level 5 approval"], correct_answer: 1, explanation: "You must own 100 shares per covered call contract sold." }] },
        { title: "Cash-Secured Put Execution", description: "Implement cash-secured puts step by step.", duration: "25 min", content_markdown: "# CSP Execution\n\n1. Reserve cash for potential purchase\n2. Select strike (typically below current)\n3. Select expiration (30-45 DTE)\n4. Sell the put\n5. Manage through expiration or assignment\n\n## Key Takeaways\n1. Have cash ready for assignment\n2. Only on stocks you want to own\n3. 30-45 DTE optimal", quiz_questions: [{ question: "What must you be prepared for when selling cash-secured puts?", options: ["Nothing", "Buying the stock at the strike price", "Unlimited losses", "Margin calls"], correct_answer: 1, explanation: "You must be prepared to buy 100 shares at the strike price if assigned." }] },
        { title: "Rolling for Income", description: "Extend positions by rolling to new expirations.", duration: "25 min", content_markdown: "# Rolling\n\n**Rolling = Close current + Open new**\n\nWhy roll:\n- Extend winning position\n- Defend against assignment\n- Collect additional premium\n\n## Key Takeaways\n1. Rolling extends the trade\n2. Roll before expiration\n3. Collect net credit when possible", quiz_questions: [{ question: "What is 'rolling' an options position?", options: ["Exercising the option", "Closing current and opening new position", "Abandoning the trade", "Doubling down"], correct_answer: 1, explanation: "Rolling means closing the current position and opening a new one at a different strike/expiration." }] },
        { title: "Assignment Awareness and Management", description: "Understand and handle assignment scenarios.", duration: "25 min", content_markdown: "# Assignment\n\n**When it happens**:\n- ITM options near expiration\n- Early assignment possible (especially with dividends)\n\n**Management**:\n- Monitor ITM positions\n- Close before expiration if concerned\n- Have capital for potential purchase (puts)\n\n## Key Takeaways\n1. ITM options can be assigned\n2. Close before expiration to avoid\n3. Be prepared for assignment", quiz_questions: [{ question: "When is early assignment most likely?", options: ["ATM options", "Deep ITM options, especially near ex-dividend", "OTM options", "LEAPS"], correct_answer: 1, explanation: "Early assignment is most likely on deep ITM options, especially near ex-dividend dates." }] },
        { title: "Income Strategy Selection Guide", description: "Choose the right income strategy for conditions.", duration: "25 min", content_markdown: "# Strategy Selection\n\n**Covered Calls**: Own stock, neutral to slightly bullish\n**CSPs**: Want to buy stock at lower price, bullish\n**Credit Spreads**: No stock, directional view, defined risk\n\n## Key Takeaways\n1. Match strategy to outlook\n2. Consider capital requirements\n3. Adjust based on IV", quiz_questions: [{ question: "When should you use covered calls?", options: ["When you don't own stock", "When you own stock and are neutral to slightly bullish", "When very bearish", "Never"], correct_answer: 1, explanation: "Covered calls work best when you own stock and expect neutral to slightly bullish movement." }] }
      ]
    },
    {
      title: "Trade Planning & Strategy Selection",
      description: "Develop a systematic approach to selecting and planning trades.",
      lessons: [
        { title: "Pre-Trade Checklist", description: "Create a systematic trade evaluation process.", duration: "20 min", content_markdown: "# Pre-Trade Checklist\n\n□ Trend assessment (direction)\n□ IV assessment (high/low)\n□ Thesis (why this trade)\n□ Risk/reward calculation\n□ Position size check\n□ Exit plan defined\n\n## Key Takeaways\n1. Check every box before entering\n2. Consistency creates edge\n3. Skip steps, take losses", quiz_questions: [{ question: "What should be checked before every trade?", options: ["Only the price", "Trend, IV, thesis, R/R, size, and exit plan", "Your horoscope", "Other traders' opinions"], correct_answer: 1, explanation: "A complete pre-trade check covers trend, IV, thesis, R/R, sizing, and exit plan." }] },
        { title: "Trend Assessment Before Entry", description: "Confirm trend direction before trading.", duration: "20 min", content_markdown: "# Trend Assessment\n\n1. What's the weekly trend?\n2. What's the daily trend?\n3. Are they aligned?\n4. Where are we in the trend?\n\nTrade WITH the higher timeframe trend.\n\n## Key Takeaways\n1. Higher timeframe dominates\n2. Alignment = higher probability\n3. Know where you are in the cycle", quiz_questions: [{ question: "Why assess trend before entering?", options: ["To look professional", "To align with the dominant direction", "Brokers require it", "It's optional"], correct_answer: 1, explanation: "Assessing trend ensures you're trading with the dominant direction." }] },
        { title: "Volatility Check for Strategy", description: "Match strategy to volatility conditions.", duration: "20 min", content_markdown: "# Volatility Check\n\n1. What's the current IV Rank?\n2. Any upcoming events?\n3. Has IV been expanding or contracting?\n\n**High IV**: Selling strategies\n**Low IV**: Buying strategies\n\n## Key Takeaways\n1. IV guides strategy choice\n2. Check before every trade\n3. Events affect IV", quiz_questions: [{ question: "What strategy should you favor in high IV?", options: ["Buying options", "Selling strategies", "No trading", "Buying stock"], correct_answer: 1, explanation: "High IV favors selling strategies to collect premium." }] },
        { title: "Risk Budget and Position Sizing", description: "Allocate risk systematically across trades.", duration: "20 min", content_markdown: "# Risk Budget\n\n**Portfolio risk budget**:\n- Max total risk at any time: 10-20%\n- Max single position: 2-5%\n- Reserve for opportunities\n\n**Sizing each trade**:\nPosition size = Risk budget / Trade risk\n\n## Key Takeaways\n1. Set total portfolio risk limit\n2. Size individual trades accordingly\n3. Leave room for new opportunities", quiz_questions: [{ question: "What is a risk budget?", options: ["Money for risky trades", "Total risk you're willing to take across positions", "A broker fee", "Emergency fund"], correct_answer: 1, explanation: "A risk budget is the total risk allocated across all positions." }] },
        { title: "Creating a Trade Journal Template", description: "Document trades for analysis and improvement.", duration: "20 min", content_markdown: "# Trade Journal\n\n**Record for each trade**:\n- Date, symbol, strategy\n- Entry rationale (thesis)\n- Entry and exit prices\n- P&L\n- What went right/wrong\n- Lessons learned\n\n## Key Takeaways\n1. Track every trade\n2. Review weekly/monthly\n3. Learn from patterns", quiz_questions: [{ question: "Why keep a trade journal?", options: ["Legal requirement", "To learn from patterns and improve", "For social media", "To impress friends"], correct_answer: 1, explanation: "Trade journals help identify patterns in your trading for continuous improvement." }] }
      ]
    },
    {
      title: "Trade Management & Adjustments",
      description: "Learn to manage open positions and make defensive adjustments.",
      lessons: [
        { title: "Setting Profit Targets for Spreads", description: "Define when to take profits on spreads.", duration: "20 min", content_markdown: "# Spread Profit Targets\n\n**Credit spreads**: Close at 50% max profit\n**Debit spreads**: Close at 50-75% of max profit\n\nWhy not 100%?\n- Gamma risk increases\n- Diminishing returns\n- Frees up capital\n\n## Key Takeaways\n1. 50% is standard target for credits\n2. Don't hold for every last dollar\n3. Closing early improves win rate", quiz_questions: [{ question: "What is a common profit target for credit spreads?", options: ["100%", "75%", "50% of max profit", "25%"], correct_answer: 2, explanation: "50% of maximum profit is a common target for credit spreads." }] },
        { title: "Stop-Loss Placement", description: "Protect positions with defined stops.", duration: "20 min", content_markdown: "# Stop-Loss Placement\n\n**For spreads**:\n- 2x premium received (credit)\n- 50% of premium paid (debit)\n\n**Alternative**: Technical stops based on chart\n\n## Key Takeaways\n1. Define stops before entry\n2. Honor your stops\n3. Protect capital", quiz_questions: [{ question: "A common stop-loss for credit spreads is:", options: ["10% of premium", "50% of premium", "2x premium received", "Never use stops"], correct_answer: 2, explanation: "2x the premium received is a common stop for credit spreads." }] },
        { title: "Rolling Trades for Defense", description: "Roll positions to improve their outlook.", duration: "25 min", content_markdown: "# Defensive Rolling\n\n**Roll out**: Same strike, later expiration\n**Roll up/down**: Different strike, same/later expiration\n**Roll out and up/down**: Both changes\n\nGoal: Collect credit while improving position\n\n## Key Takeaways\n1. Roll for net credit when possible\n2. Don't throw good money after bad\n3. Know when to just close", quiz_questions: [{ question: "What does 'roll out' mean?", options: ["Close position", "Move to later expiration, same strike", "Change strike only", "Add more contracts"], correct_answer: 1, explanation: "Rolling out means moving to a later expiration while keeping the same strike." }] },
        { title: "Adding Wings and Converting Positions", description: "Advanced adjustments for challenged positions.", duration: "25 min", content_markdown: "# Position Adjustments\n\n**Add a wing**: Turn naked position into spread\n**Convert**: Change from bullish to neutral\n\nExample: Short put challenged → add long put below (creates spread)\n\n## Key Takeaways\n1. Adding legs limits risk\n2. Conversions change directional exposure\n3. Always calculate new R/R", quiz_questions: [{ question: "Why add a protective long option to a short position?", options: ["Increase profit", "Limit maximum loss", "Increase margin", "Required by broker"], correct_answer: 1, explanation: "Adding a long option creates a spread with defined maximum loss." }] },
        { title: "Managing Winners vs Losers", description: "Different approaches for winning and losing trades.", duration: "25 min", content_markdown: "# Winner vs Loser Management\n\n**Winners**:\n- Take profits at target\n- Consider trailing stop\n- Don't let winners become losers\n\n**Losers**:\n- Cut at stop level\n- Don't hope for recovery\n- Evaluate adjustment vs closing\n\n## Key Takeaways\n1. Different rules for different situations\n2. Let process guide, not emotion\n3. Review each scenario objectively", quiz_questions: [{ question: "What should you avoid with winning trades?", options: ["Taking profits", "Letting them become losers", "Monitoring them", "Celebrating"], correct_answer: 1, explanation: "Protect your winners - don't let profitable trades turn into losses." }] },
        { title: "When to Walk Away", description: "Recognize when closing is the best choice.", duration: "20 min", content_markdown: "# Walking Away\n\n**Close and move on when**:\n- Thesis is invalidated\n- Risk has increased beyond comfort\n- Better opportunities exist\n- Rolling doesn't improve odds\n\nDon't marry positions.\n\n## Key Takeaways\n1. Sometimes closing is best\n2. Opportunity cost matters\n3. There's always another trade", quiz_questions: [{ question: "When should you consider walking away from a trade?", options: ["Never", "When thesis is invalidated", "Only when profitable", "After one day"], correct_answer: 1, explanation: "Close when your original thesis is no longer valid." }] }
      ]
    },
    {
      title: "Earnings & Event Awareness",
      description: "Navigate volatility around corporate and economic events.",
      lessons: [
        { title: "Understanding Earnings Volatility", description: "How earnings announcements affect options.", duration: "25 min", content_markdown: "# Earnings Volatility\n\n**Pre-earnings**: IV rises (anticipation)\n**Post-earnings**: IV crushes (uncertainty resolved)\n\nThis is the most predictable volatility pattern.\n\n## Key Takeaways\n1. IV rises before earnings\n2. IV crushes after earnings\n3. Plan around this pattern", quiz_questions: [{ question: "What happens to IV after earnings are announced?", options: ["It rises", "It crushes/drops", "No change", "Depends on results"], correct_answer: 1, explanation: "IV typically crushes after earnings as uncertainty is resolved." }] },
        { title: "IV Crush Explained", description: "Understand and trade around IV crush.", duration: "25 min", content_markdown: "# IV Crush\n\n**What is it?**: Sharp IV drop after events\n\n**Impact**:\n- Long options lose value (even if right on direction)\n- Short options gain value\n\n## Key Takeaways\n1. IV crush can erase directional gains\n2. Factor into earnings trades\n3. Sellers benefit from crush", quiz_questions: [{ question: "How does IV crush affect long options?", options: ["They gain value", "They lose value even if directionally correct", "No effect", "They expire"], correct_answer: 1, explanation: "IV crush reduces option value, potentially erasing directional gains for long options." }] },
        { title: "When to Avoid Earnings Trades", description: "Recognize when staying out is best.", duration: "20 min", content_markdown: "# Avoiding Earnings\n\n**Stay out when**:\n- No clear edge\n- IV is already extreme\n- You don't understand the company\n- Position size would be too large\n\n## Key Takeaways\n1. Earnings are coin flips\n2. No trade is sometimes best\n3. Certainty about uncertainty isn't edge", quiz_questions: [{ question: "When should you avoid earnings trades?", options: ["Always", "When you have no edge or clear thesis", "Never, always trade earnings", "Only on Fridays"], correct_answer: 1, explanation: "Avoid earnings trades when you don't have a clear edge or thesis." }] },
        { title: "Simple Earnings Strategies", description: "Basic approaches for earnings events.", duration: "25 min", content_markdown: "# Earnings Strategies\n\n**Selling premium before earnings**:\nCollect high IV premium, risk move exceeding expected\n\n**Buying after earnings**:\nCatch low IV for directional trades\n\n**Avoid**: Buying premium right before (IV crush risk)\n\n## Key Takeaways\n1. Sell before (collect premium)\n2. Buy after (cheap options)\n3. Don't buy right before", quiz_questions: [{ question: "When is a good time to buy options around earnings?", options: ["Right before earnings", "After earnings when IV is crushed", "During earnings call", "Never buy around earnings"], correct_answer: 1, explanation: "After earnings, IV is low making options cheaper for directional trades." }] },
        { title: "Other Market Events", description: "Trade around economic data and Fed meetings.", duration: "25 min", content_markdown: "# Market Events\n\n**Key events**:\n- Fed meetings (FOMC)\n- Jobs reports\n- CPI/Inflation data\n- GDP releases\n\nThese create similar IV patterns to earnings.\n\n## Key Takeaways\n1. Economic events affect IV\n2. Check the calendar weekly\n3. Adjust exposure accordingly", quiz_questions: [{ question: "What happens to IV before major economic releases?", options: ["It stays flat", "It tends to rise", "It drops", "It doubles"], correct_answer: 1, explanation: "IV tends to rise before major economic events as uncertainty increases." }] }
      ]
    },
    {
      title: "Position Sizing & Risk Control",
      description: "Master advanced position sizing and portfolio-level risk management.",
      lessons: [
        { title: "Risk Per Trade Guidelines", description: "Define and apply consistent risk limits.", duration: "25 min", content_markdown: "# Risk Per Trade\n\n**Guidelines**:\n- 1-2% for new strategies\n- 2-3% for proven strategies\n- Never exceed 5% on single trade\n\nCalculation:\nMax loss = Account × Risk %\nContracts = Max loss / Trade risk\n\n## Key Takeaways\n1. Consistent percentage risk\n2. Adjust size to maintain risk\n3. Never over-concentrate", quiz_questions: [{ question: "What is a prudent maximum risk per trade?", options: ["10%", "20%", "1-5% depending on conviction", "50%"], correct_answer: 2, explanation: "1-5% per trade protects against devastating single-trade losses." }] },
        { title: "Managing Multiple Positions", description: "Track and limit overall portfolio exposure.", duration: "25 min", content_markdown: "# Portfolio Risk\n\n**Track**:\n- Total positions at risk\n- Correlation between positions\n- Maximum drawdown if all go wrong\n\n**Limits**:\n- Total exposure < 20% in options\n- Correlated positions limited\n\n## Key Takeaways\n1. Sum up total risk\n2. Watch correlations\n3. Stress-test worst case", quiz_questions: [{ question: "Why limit correlated positions?", options: ["Saves commissions", "They can all move against you simultaneously", "Broker requirement", "Personal preference only"], correct_answer: 1, explanation: "Correlated positions can all lose together, multiplying your losses." }] },
        { title: "Correlation Risk", description: "Understand how positions relate to each other.", duration: "25 min", content_markdown: "# Correlation\n\n**High correlation examples**:\n- Tech stocks (AAPL, MSFT, GOOGL)\n- Banks (JPM, BAC, WFC)\n- Market-wide positions (SPY, QQQ)\n\n**Managing correlation**:\n- Diversify across sectors\n- Mix bullish and bearish\n- Consider hedges\n\n## Key Takeaways\n1. Correlated positions = concentrated risk\n2. Diversify sectors\n3. Balance directional exposure", quiz_questions: [{ question: "What is correlation risk?", options: ["Risk of correlating data", "Risk that positions move together, amplifying gains or losses", "Risk of incorrect calculations", "No such thing"], correct_answer: 1, explanation: "Correlation risk means positions move together, which can amplify losses." }] },
        { title: "Avoiding Portfolio Overload", description: "Know when you have too many positions.", duration: "20 min", content_markdown: "# Portfolio Overload\n\n**Signs of overload**:\n- Can't track all positions\n- Feeling overwhelmed\n- Making emotional decisions\n- Risk exceeds comfort\n\n**Solutions**:\n- Close marginal positions\n- Simplify strategy mix\n- Focus on best setups\n\n## Key Takeaways\n1. Quality over quantity\n2. Manage what you can monitor\n3. Reduce when overwhelmed", quiz_questions: [{ question: "What should you do when feeling overwhelmed by positions?", options: ["Add more positions", "Close marginal positions and simplify", "Ignore the feeling", "Take on more risk"], correct_answer: 1, explanation: "When overwhelmed, reduce complexity by closing marginal positions." }] },
        { title: "Building and Protecting a Track Record", description: "Develop sustainable trading performance.", duration: "25 min", content_markdown: "# Track Record\n\n**Building**:\n- Consistent small wins\n- Avoiding big losses\n- Tracking everything\n\n**Protecting**:\n- Don't overtrade after wins\n- Don't revenge trade after losses\n- Stick to proven approach\n\n## Key Takeaways\n1. Consistency beats home runs\n2. Protect gains from slippage\n3. Process creates track record", quiz_questions: [{ question: "What's most important for building a track record?", options: ["One big winning trade", "Consistent small wins and avoiding big losses", "Trading frequently", "Taking maximum risk"], correct_answer: 1, explanation: "Consistent small wins while avoiding big losses builds a sustainable track record." }] }
      ]
    },
    {
      title: "Screeners & Opportunity Identification",
      description: "Find quality setups systematically using screeners and filters.",
      lessons: [
        { title: "Stock Screener Basics", description: "Use fundamental and technical screeners.", duration: "25 min", content_markdown: "# Stock Screeners\n\n**Common filters**:\n- Price (min/max)\n- Market cap\n- Sector\n- Performance (% change)\n- Volume (liquidity)\n\n## Key Takeaways\n1. Screeners filter the universe\n2. Start broad, then narrow\n3. Save successful screens", quiz_questions: [{ question: "What is the purpose of stock screeners?", options: ["To guarantee profits", "To filter the universe for candidates", "To execute trades", "To track P&L"], correct_answer: 1, explanation: "Screeners filter thousands of stocks to find candidates matching your criteria." }] },
        { title: "Options Liquidity Filters", description: "Identify options with good trading conditions.", duration: "25 min", content_markdown: "# Options Liquidity\n\n**Filter for**:\n- Tight bid-ask (< $0.20)\n- Volume > 100/day\n- Open interest > 500\n- Underlying volume > 1M\n\n## Key Takeaways\n1. Liquidity = better fills\n2. Avoid illiquid options\n3. Stick to popular underlyings", quiz_questions: [{ question: "What indicates a liquid option market?", options: ["Wide bid-ask spreads", "Tight bid-ask, high volume and open interest", "Low volume", "Low price"], correct_answer: 1, explanation: "Tight spreads and high volume/OI indicate liquid options." }] },
        { title: "Finding Quality Setups", description: "Combine screener output with chart analysis.", duration: "25 min", content_markdown: "# Quality Setups\n\n**Process**:\n1. Screen for candidates\n2. Check charts for pattern\n3. Verify IV conditions\n4. Confirm thesis\n5. Size and enter\n\n## Key Takeaways\n1. Screener is first filter\n2. Chart confirms quality\n3. IV determines strategy", quiz_questions: [{ question: "After screening stocks, what's the next step?", options: ["Immediately trade", "Check charts for quality patterns", "Tell everyone", "Wait a month"], correct_answer: 1, explanation: "After screening, analyze charts to confirm setup quality." }] },
        { title: "Building a Watchlist", description: "Create and maintain a curated opportunity list.", duration: "20 min", content_markdown: "# Watchlist\n\n**Building**:\n- 10-20 quality names\n- Across sectors\n- Known patterns\n- Liquid options\n\n**Maintaining**:\n- Review weekly\n- Remove duds\n- Add new candidates\n\n## Key Takeaways\n1. Focused watchlist beats scanning everything\n2. Know your names well\n3. Regular maintenance required", quiz_questions: [{ question: "What is the benefit of a focused watchlist?", options: ["More trades", "Better knowledge of your names", "Less work overall", "Higher commissions"], correct_answer: 1, explanation: "A focused watchlist allows deep knowledge of specific stocks and their patterns." }] },
        { title: "Systematic Opportunity Discovery", description: "Create a repeatable process for finding trades.", duration: "25 min", content_markdown: "# Systematic Discovery\n\n**Weekly routine**:\n1. Run screeners on weekend\n2. Analyze top candidates\n3. Build weekly watchlist\n4. Set alerts for entries\n5. Execute when triggered\n\n## Key Takeaways\n1. Same process every week\n2. Preparation creates edge\n3. Systematic beats random", quiz_questions: [{ question: "Why use a systematic discovery process?", options: ["Broker requirement", "Consistency and repeatability create edge", "Just for fun", "To impress others"], correct_answer: 1, explanation: "Systematic processes are repeatable and help develop consistent edge." }] }
      ]
    },
    {
      title: "Trading Psychology for Developing Traders",
      description: "Advanced psychological skills for consistent trading.",
      lessons: [
        { title: "Managing Emotions Under Pressure", description: "Stay calm during volatile markets.", duration: "25 min", content_markdown: "# Emotional Management\n\n**Techniques**:\n- Deep breathing before trades\n- Step away when stressed\n- Follow the plan, not feelings\n- Accept what you can't control\n\n## Key Takeaways\n1. Emotions are normal\n2. Control response, not emotion\n3. Have calming routines", quiz_questions: [{ question: "How should you handle stress during trading?", options: ["Trade faster", "Take a break and use calming techniques", "Increase position size", "Ignore it and keep trading"], correct_answer: 1, explanation: "Take breaks and use calming techniques when stressed." }] },
        { title: "Avoiding Revenge Trading", description: "Break the cycle of chasing losses.", duration: "25 min", content_markdown: "# Revenge Trading\n\n**Prevention**:\n- Daily loss limits\n- Trade number limits\n- Mandatory breaks after losses\n- Written rules enforced\n\n## Key Takeaways\n1. Revenge trading compounds losses\n2. Set and enforce limits\n3. Walking away is winning", quiz_questions: [{ question: "What helps prevent revenge trading?", options: ["Trading more", "Setting daily loss limits and taking breaks", "Ignoring losses", "Doubling down"], correct_answer: 1, explanation: "Daily loss limits and mandatory breaks prevent revenge trading." }] },
        { title: "Developing Trading Patience", description: "Wait for quality setups without anxiety.", duration: "25 min", content_markdown: "# Patience\n\n**Building patience**:\n- Define what you're waiting for\n- Track missed bad trades\n- Reward waiting\n- Trust your edge\n\n## Key Takeaways\n1. Good trades are worth waiting for\n2. Track avoided losses\n3. Patience is a skill", quiz_questions: [{ question: "How can you build trading patience?", options: ["Trade every signal", "Define criteria and reward waiting", "Never take breaks", "Follow all tips"], correct_answer: 1, explanation: "Define clear criteria and celebrate when patience saves you from bad trades." }] },
        { title: "Confidence Through Process", description: "Build confidence from your trading system.", duration: "25 min", content_markdown: "# Process Confidence\n\n**Sources of confidence**:\n- Tested methodology\n- Documented track record\n- Risk management in place\n- Continuous learning\n\n## Key Takeaways\n1. Confidence comes from competence\n2. Trust your tested process\n3. Review builds belief", quiz_questions: [{ question: "Where does true trading confidence come from?", options: ["Lucky trades", "A tested methodology and track record", "Social media", "Large position sizes"], correct_answer: 1, explanation: "True confidence comes from a tested methodology with documented results." }] },
        { title: "Maintaining Work-Life Balance", description: "Trade sustainably without burnout.", duration: "20 min", content_markdown: "# Balance\n\n**Keys to balance**:\n- Set trading hours\n- Take days off\n- Exercise and sleep\n- Non-trading hobbies\n- Time with family/friends\n\n## Key Takeaways\n1. Trading is a marathon\n2. Burnout destroys performance\n3. Life balance = better decisions", quiz_questions: [{ question: "Why is work-life balance important for traders?", options: ["It's not important", "Burnout destroys trading performance", "To trade more", "Brokers require it"], correct_answer: 1, explanation: "Balance prevents burnout and maintains the mental clarity needed for good decisions." }] }
      ]
    },
    {
      title: "Journaling, Review & Performance Improvement",
      description: "Create feedback loops for continuous improvement.",
      lessons: [
        { title: "Trade Journaling Fundamentals", description: "Build a comprehensive trading journal.", duration: "25 min", content_markdown: "# Trade Journal\n\n**Essential fields**:\n- Date, symbol, strategy\n- Entry/exit rationale\n- Prices and P&L\n- What worked/didn't\n- Emotional state\n- Lessons learned\n\n## Key Takeaways\n1. Journal every trade\n2. Include emotions\n3. Focus on lessons", quiz_questions: [{ question: "What should a trade journal include?", options: ["Just P&L", "Full trade details including rationale and emotions", "Only winning trades", "Stock prices only"], correct_answer: 1, explanation: "Complete journals include all details including emotional state and lessons." }] },
        { title: "Weekly Review Process", description: "Conduct effective weekly performance reviews.", duration: "25 min", content_markdown: "# Weekly Review\n\n**Review checklist**:\n- All trades from the week\n- Win rate and P&L\n- Best and worst trade\n- Rule violations\n- Areas for improvement\n\n## Key Takeaways\n1. Review weekly without fail\n2. Identify patterns\n3. Plan improvements", quiz_questions: [{ question: "How often should you conduct trading reviews?", options: ["Yearly", "Weekly at minimum", "Only after losses", "Never"], correct_answer: 1, explanation: "Weekly reviews provide regular feedback for improvement." }] },
        { title: "Identifying Patterns in Your Trading", description: "Spot recurring strengths and weaknesses.", duration: "25 min", content_markdown: "# Pattern Recognition\n\n**Look for**:\n- Best performing strategies\n- Worst performing days/times\n- Emotional triggers\n- Common mistakes\n- Consistent edges\n\n## Key Takeaways\n1. Data reveals patterns\n2. Do more of what works\n3. Eliminate what doesn't", quiz_questions: [{ question: "What should you look for when reviewing trades?", options: ["Only profits", "Recurring patterns of success and failure", "Random data", "Other traders' results"], correct_answer: 1, explanation: "Look for patterns that show consistent strengths and weaknesses." }] },
        { title: "Setting Improvement Goals", description: "Create actionable improvement objectives.", duration: "20 min", content_markdown: "# Improvement Goals\n\n**SMART Goals**:\n- Specific\n- Measurable\n- Achievable\n- Relevant\n- Time-bound\n\n**Example**: \"Reduce position size on first trade of week by 25% for next month\"\n\n## Key Takeaways\n1. Set specific goals\n2. Track progress\n3. Adjust as needed", quiz_questions: [{ question: "What makes a good trading improvement goal?", options: ["Vague intentions", "Specific, measurable, and time-bound", "Impossible targets", "Copy others' goals"], correct_answer: 1, explanation: "Good goals are specific, measurable, and have deadlines." }] },
        { title: "Building a Continuous Improvement System", description: "Create lasting habits for growth.", duration: "25 min", content_markdown: "# Continuous Improvement\n\n**The system**:\n1. Trade with rules\n2. Journal every trade\n3. Review weekly\n4. Identify patterns\n5. Set improvement goals\n6. Implement and measure\n7. Repeat\n\n## Key Takeaways\n1. Improvement is a system\n2. Small changes compound\n3. Never stop learning", quiz_questions: [{ question: "What is the key to continuous improvement?", options: ["Making big changes", "Following a systematic review and adjustment process", "Ignoring mistakes", "Trading more frequently"], correct_answer: 1, explanation: "Systematic review and adjustment creates continuous improvement." }] }
      ]
    }
  ]
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const results: any[] = [];

    // Process both courses
    for (const course of [beginnerCourse, intermediateCourse]) {
      // Check if course already exists
      const { data: existingCourse } = await supabase
        .from('courses')
        .select('id')
        .eq('title', course.title)
        .maybeSingle();

      if (existingCourse) {
        results.push({ course: course.title, status: 'skipped', reason: 'already exists' });
        continue;
      }

      // Create course
      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .insert({
          title: course.title,
          description: course.description,
          difficulty_level: course.difficulty_level,
          estimated_duration: course.estimated_duration,
          order_index: course.order_index,
          status: 'published'
        })
        .select()
        .single();

      if (courseError) {
        results.push({ course: course.title, status: 'error', error: courseError.message });
        continue;
      }

      let moduleCount = 0;
      let lessonCount = 0;

      // Create modules and lessons
      for (let i = 0; i < course.modules.length; i++) {
        const module = course.modules[i];
        
        const { data: moduleData, error: moduleError } = await supabase
          .from('course_modules')
          .insert({
            course_id: courseData.id,
            title: module.title,
            description: module.description,
            order_index: i,
            status: 'published'
          })
          .select()
          .single();

        if (moduleError) {
          console.error(`Error creating module ${module.title}:`, moduleError);
          continue;
        }

        moduleCount++;

        // Create lessons for this module
        for (let j = 0; j < module.lessons.length; j++) {
          const lesson = module.lessons[j];
          
          const { error: lessonError } = await supabase
            .from('course_lessons')
            .insert({
              module_id: moduleData.id,
              title: lesson.title,
              description: lesson.description,
              duration: lesson.duration,
              content_markdown: lesson.content_markdown,
              quiz_questions: lesson.quiz_questions,
              order_index: j,
              status: 'published'
            });

          if (lessonError) {
            console.error(`Error creating lesson ${lesson.title}:`, lessonError);
            continue;
          }

          lessonCount++;
        }
      }

      results.push({
        course: course.title,
        status: 'created',
        courseId: courseData.id,
        modules: moduleCount,
        lessons: lessonCount
      });
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
