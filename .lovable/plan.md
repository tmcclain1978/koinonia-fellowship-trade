
# Advanced Options Trading Curriculum Implementation

## Overview

This plan implements a comprehensive **Advanced Options Trading Academy** curriculum based on the Promise Consulting Group PDF document. The curriculum consists of 14 professional-grade modules designed for advanced retail traders, active investors, and semi-professional traders.

## Curriculum Structure (from PDF)

The PDF outlines 14 modules that will be created as a single "Advanced" level course with 14 modules, each containing multiple lessons:

| Module | Title | Focus |
|--------|-------|-------|
| 1 | Professional Options Market Mechanics | Market makers, liquidity, bid/ask, GEX |
| 2 | Volatility Mastery | IV, HV, skew, term structure, volatility cones |
| 3 | Advanced Options Greeks | Dynamic & portfolio-level Greeks management |
| 4 | Institutional Technical Analysis | VWAP, liquidity zones, multi-timeframe alignment |
| 5 | Advanced Stock & Options Screeners | Systematic opportunity discovery |
| 6 | Financial & Fundamental Analysis | Earnings analysis, sector rotation, macro |
| 7 | LEAPS & Synthetic Stock Strategies | Deep ITM LEAPS, PMCC, rolling strategies |
| 8 | Advanced Credit Strategies | Iron condors, iron flies, adjustments |
| 9 | Advanced Debit & Directional Strategies | Diagonals, calendars, ratio spreads |
| 10 | Earnings & Event-Driven Trading | IV crush, straddles, macro events |
| 11 | Risk Management & Position Sizing | Volatility-adjusted sizing, risk of ruin |
| 12 | Trade Management & Exit Engineering | Scaling, trailing stops, managing winners/losers |
| 13 | Rules-Based Trading Systems | Strategy playbooks, decision trees, journaling |
| 14 | Psychology, Discipline & Professional Mindset | Overtrading avoidance, discipline under drawdowns |

## Database Implementation

### Course Record

Create one main course:

```
Course: "Advanced Options Trading Academy"
- difficulty_level: "advanced"
- estimated_duration: "40+ hours"
- description: "Transform from intermediate trader to institutional-style options professional. Master volatility, Greeks, LEAPS, event trading, and systematic risk management."
- status: "published"
- order_index: 10 (after existing courses)
```

### Module Records (14 total)

Each module from the PDF becomes a `course_modules` record with:
- Descriptive title
- Learning objective as description
- Sequential order_index (0-13)
- Status: "published"

### Lesson Records (Detailed breakdown per module)

Each module will contain 4-8 lessons covering the key topics. Total: ~70-80 lessons.

## Detailed Module & Lesson Structure

### Module 1: Professional Options Market Mechanics
**Objective**: Understand how options markets truly function behind the scenes.

| Lesson | Title | Duration | Content Focus |
|--------|-------|----------|---------------|
| 1.1 | Introduction to Market Microstructure | 25 min | How options exchanges work, order flow |
| 1.2 | Market Makers & Liquidity Provision | 30 min | Role of MMs, how they profit, delta hedging |
| 1.3 | Bid/Ask Dynamics & Spread Behavior | 25 min | Why spreads widen/narrow, optimal entry timing |
| 1.4 | Open Interest vs Volume Analysis | 30 min | Reading OI changes, spotting accumulation |
| 1.5 | Dealer Positioning & Gamma Exposure (GEX) | 35 min | Understanding GEX levels, dealer hedging impact |
| 1.6 | Module 1 Assessment | 15 min | Quiz covering market mechanics concepts |

### Module 2: Volatility Mastery
**Objective**: Trade volatility as a core variable, not a byproduct.

| Lesson | Title | Duration | Content Focus |
|--------|-------|----------|---------------|
| 2.1 | Implied vs Historical Volatility Deep Dive | 30 min | Calculation methods, interpretation differences |
| 2.2 | IV Rank vs IV Percentile | 25 min | Which to use and when, practical examples |
| 2.3 | Volatility Cones & Forecasting | 30 min | Building and reading volatility cones |
| 2.4 | Vertical Skew Analysis | 30 min | Strike-by-strike IV differences, trading opportunities |
| 2.5 | Horizontal/Term Structure Skew | 25 min | Expiration-based IV differences, calendar trades |
| 2.6 | Premium Buying vs Selling by Regime | 35 min | When to buy vs sell premium based on environment |
| 2.7 | Module 2 Assessment | 15 min | Quiz on volatility concepts |

### Module 3: Advanced Options Greeks
**Objective**: Manage risk and exposure across entire portfolios.

| Lesson | Title | Duration | Content Focus |
|--------|-------|----------|---------------|
| 3.1 | Delta Beyond Directional Bias | 25 min | Dollar delta, delta as probability proxy |
| 3.2 | Gamma: The Accelerator | 30 min | Gamma risk, gamma scalping, gamma exposure |
| 3.3 | Theta: Time Decay Dynamics | 25 min | Non-linear decay curves, theta optimization |
| 3.4 | Vega: Volatility Sensitivity | 30 min | Vega risk across expirations, vega hedging |
| 3.5 | Portfolio-Level Greeks Management | 35 min | Aggregating Greeks, portfolio neutralization |
| 3.6 | Greek Interactions & Trade-offs | 30 min | How Greeks affect each other, practical scenarios |
| 3.7 | Module 3 Assessment | 15 min | Greeks calculation and interpretation quiz |

### Module 4: Institutional Technical Analysis
**Objective**: Apply technical analysis the way professionals do.

| Lesson | Title | Duration | Content Focus |
|--------|-------|----------|---------------|
| 4.1 | Market Structure & Trend Hierarchy | 30 min | Higher timeframe structure, trend identification |
| 4.2 | Multi-Timeframe Alignment | 30 min | Top-down analysis for options timing |
| 4.3 | VWAP: Daily, Weekly & Anchored | 35 min | Institutional use of VWAP, trading around VWAP |
| 4.4 | Liquidity Zones & Stop Runs | 30 min | Identifying liquidity, avoiding stop hunts |
| 4.5 | Volume Profile for Options Traders | 30 min | POC, value areas, high-volume nodes |
| 4.6 | Combining TA with Options Strategy Selection | 25 min | Matching strategy to technical setup |
| 4.7 | Module 4 Assessment | 15 min | Technical analysis application quiz |

### Module 5: Advanced Stock & Options Screeners
**Objective**: Create repeatable, high-quality trade pipelines.

| Lesson | Title | Duration | Content Focus |
|--------|-------|----------|---------------|
| 5.1 | Screening Philosophy & Workflow Design | 25 min | Building systematic discovery processes |
| 5.2 | High-Probability Options Setup Screens | 30 min | Criteria for quality setups |
| 5.3 | LEAPS Candidate Screening | 30 min | Finding ideal LEAPS opportunities |
| 5.4 | Earnings Volatility Screeners | 25 min | Pre-earnings IV expansion candidates |
| 5.5 | Trend + Volatility Alignment Filters | 30 min | Multi-factor screening |
| 5.6 | Building Custom Screeners | 25 min | Using platform-specific tools |
| 5.7 | Module 5 Assessment | 15 min | Screener design quiz |

### Module 6: Financial & Fundamental Analysis
**Objective**: Use fundamentals selectively and effectively.

| Lesson | Title | Duration | Content Focus |
|--------|-------|----------|---------------|
| 6.1 | Earnings Analysis Beyond EPS | 30 min | Revenue quality, guidance, whisper numbers |
| 6.2 | Balance Sheet Strength for Long-Dated Trades | 30 min | Debt ratios, cash position, LEAPS suitability |
| 6.3 | Sector Rotation & Macro Sensitivity | 25 min | Economic cycles, sector options plays |
| 6.4 | When Fundamentals Matter (and When They Don't) | 25 min | Time horizon considerations |
| 6.5 | Integrating Fundamentals with Options Timing | 25 min | Combining F/A with options strategy |
| 6.6 | Module 6 Assessment | 15 min | Fundamental analysis quiz |

### Module 7: LEAPS & Synthetic Stock Strategies
**Objective**: Use options as capital-efficient investment tools.

| Lesson | Title | Duration | Content Focus |
|--------|-------|----------|---------------|
| 7.1 | Deep ITM LEAPS vs Stock Ownership | 30 min | Capital efficiency, risk comparison |
| 7.2 | Selecting Optimal LEAPS Strikes & Expiration | 25 min | Delta targets, time value considerations |
| 7.3 | Poor Man's Covered Calls (PMCC) | 35 min | Setup, management, profit targets |
| 7.4 | Rolling LEAPS Over Time | 30 min | When and how to roll, cost analysis |
| 7.5 | Risk Management During Volatility Expansion | 25 min | Protecting LEAPS positions |
| 7.6 | Synthetic Stock Positions | 25 min | Creating stock-like exposure with options |
| 7.7 | Module 7 Assessment | 15 min | LEAPS strategy quiz |

### Module 8: Advanced Credit Strategies
**Objective**: Generate income with controlled downside risk.

| Lesson | Title | Duration | Content Focus |
|--------|-------|----------|---------------|
| 8.1 | Credit Spreads with Volatility Filters | 30 min | When to sell premium, strike selection |
| 8.2 | Iron Condors: Structure & Management | 35 min | Setup, adjustment triggers, profit targets |
| 8.3 | Iron Butterflies: High-Probability Income | 30 min | Pinning strategies, expiration management |
| 8.4 | Adjustment Techniques for Credit Strategies | 35 min | Rolling, widening, converting positions |
| 8.5 | When Selling Premium is Unfavorable | 25 min | Low IV environments, trend markets |
| 8.6 | Module 8 Assessment | 15 min | Credit strategy quiz |

### Module 9: Advanced Debit & Directional Strategies
**Objective**: Execute precision directional trades.

| Lesson | Title | Duration | Content Focus |
|--------|-------|----------|---------------|
| 9.1 | Debit Spreads vs Outright Options | 30 min | When to use spreads, cost/benefit analysis |
| 9.2 | Diagonal Spreads | 30 min | Structure, management, profit dynamics |
| 9.3 | Calendar Spreads | 30 min | Volatility plays, time decay capture |
| 9.4 | Ratio Spreads | 35 min | Risk/reward profiles, management |
| 9.5 | Trend Acceleration & Momentum Plays | 25 min | Capturing momentum with defined risk |
| 9.6 | Module 9 Assessment | 15 min | Directional strategy quiz |

### Module 10: Earnings & Event-Driven Trading
**Objective**: Trade structured volatility around events.

| Lesson | Title | Duration | Content Focus |
|--------|-------|----------|---------------|
| 10.1 | Understanding Earnings IV Build & Crush | 30 min | The earnings volatility cycle |
| 10.2 | Pre-Earnings Strategies | 30 min | Buying before IV expansion |
| 10.3 | Post-Earnings Strategies | 25 min | Selling after IV crush |
| 10.4 | Straddles & Strangles for Events | 35 min | Breakeven analysis, position sizing |
| 10.5 | Macro Events: CPI, FOMC, FDA | 30 min | Trading around scheduled events |
| 10.6 | Risk Management for Event Trades | 25 min | Position sizing, stop strategies |
| 10.7 | Module 10 Assessment | 15 min | Event trading quiz |

### Module 11: Risk Management & Position Sizing
**Objective**: Protect capital and ensure longevity.

| Lesson | Title | Duration | Content Focus |
|--------|-------|----------|---------------|
| 11.1 | Risk Per Trade vs Portfolio Risk | 30 min | Account-level risk budgeting |
| 11.2 | Correlation & Concentration Risk | 30 min | Sector exposure, correlated positions |
| 11.3 | Volatility-Adjusted Position Sizing | 35 min | Sizing based on IV and expected move |
| 11.4 | Risk of Ruin Concepts | 25 min | Kelly criterion, survival probability |
| 11.5 | Portfolio Heat & Buying Power Management | 25 min | Margin efficiency, reserve capital |
| 11.6 | Module 11 Assessment | 15 min | Risk management quiz |

### Module 12: Trade Management & Exit Engineering
**Objective**: Master exits and defensive adjustments.

| Lesson | Title | Duration | Content Focus |
|--------|-------|----------|---------------|
| 12.1 | Scaling Out vs Full Exits | 30 min | Partial profit-taking strategies |
| 12.2 | Time-Based Exits | 25 min | DTE-based exit rules |
| 12.3 | Trailing Stops vs Profit Targets | 30 min | When to use each approach |
| 12.4 | Managing Winners | 30 min | Letting profits run, adjustment strategies |
| 12.5 | Managing Losers | 30 min | Cut losses, roll, or adjust |
| 12.6 | The Phroureo Exit System | 25 min | Using automated exit strategies |
| 12.7 | Module 12 Assessment | 15 min | Exit engineering quiz |

### Module 13: Rules-Based Trading Systems
**Objective**: Build repeatable, improvable systems.

| Lesson | Title | Duration | Content Focus |
|--------|-------|----------|---------------|
| 13.1 | Why Systems Beat Discretion | 25 min | Consistency, measurability, improvement |
| 13.2 | Strategy Playbooks | 30 min | Documenting your strategies |
| 13.3 | If/Then Decision Trees | 30 min | Building decision frameworks |
| 13.4 | Market Regime Classification | 35 min | Trending, ranging, volatile environments |
| 13.5 | Trade Journaling for Optimization | 30 min | What to track, review process |
| 13.6 | Backtesting Your Systems | 25 min | Validating strategy effectiveness |
| 13.7 | Module 13 Assessment | 15 min | Systems trading quiz |

### Module 14: Psychology, Discipline & Professional Mindset
**Objective**: Develop long-term trader resilience.

| Lesson | Title | Duration | Content Focus |
|--------|-------|----------|---------------|
| 14.1 | Overtrading Avoidance | 25 min | Recognizing and preventing overtrading |
| 14.2 | Loss Normalization | 25 min | Accepting losses as part of the process |
| 14.3 | Discipline Under Drawdowns | 30 min | Maintaining system adherence |
| 14.4 | Treating Trading as a Business | 30 min | Professional trader habits |
| 14.5 | Building a Sustainable Trading Career | 25 min | Long-term perspective, work-life balance |
| 14.6 | Final Course Assessment | 20 min | Comprehensive course quiz |
| 14.7 | Certificate & Next Steps | 10 min | Completion celebration, continuing education |

## Implementation Approach

### Phase 1: Create Edge Function for Bulk Curriculum Creation

Create a new edge function `create-advanced-curriculum` that will:
1. Insert the main course record
2. Insert all 14 module records
3. Insert all ~90 lesson records with proper content

This approach is more efficient than manual UI entry for 90+ lessons.

### Phase 2: Lesson Content Templates

Each lesson will include:
- **Title**: Clear, descriptive title
- **Description**: 2-3 sentence summary
- **Duration**: Estimated viewing time
- **Content Markdown**: Detailed lesson content with:
  - Learning objectives
  - Key concepts explained
  - Practical examples
  - Trading scenarios
  - Key takeaways
  - Quick reference summary
- **Quiz Questions**: 3-5 multiple choice questions per lesson

### Phase 3: Module Assessments

Each module ends with an assessment lesson containing:
- 10-15 quiz questions covering module content
- Passing score required: 70%
- Tracks completion in user_course_progress

## Files to Create

| File | Purpose |
|------|---------|
| `supabase/functions/create-advanced-curriculum/index.ts` | Edge function to bulk-insert curriculum |

## Files to Modify

| File | Changes |
|------|---------|
| None required for initial implementation | Edge function handles all DB inserts |

## Database Changes

**No schema changes required** - the existing `courses`, `course_modules`, and `course_lessons` tables support all required fields.

**Data Inserts** (via edge function):
- 1 course record
- 14 module records  
- ~90 lesson records

## Execution Plan

1. Create edge function with complete curriculum data
2. Deploy edge function
3. Execute edge function to populate database
4. Verify content appears in Academy under "Advanced" filter
5. Review and adjust lesson content as needed via Admin panel

## Sample Lesson Content (Lesson 1.1)

```markdown
# Introduction to Market Microstructure

## Learning Objectives
By the end of this lesson, you will:
- Understand how options orders flow through the market
- Know the key participants in options markets
- Recognize the difference between exchange-traded and OTC options
- Understand the role of the Options Clearing Corporation (OCC)

## Key Concepts

### Order Flow in Options Markets
When you place an options order, it travels through several layers before execution:
1. Your broker receives the order
2. Order is routed to an options exchange (CBOE, NYSE Arca, etc.)
3. Market makers compete to fill your order
4. The OCC guarantees the trade

### Market Participants
- **Retail Traders**: Individual investors like you
- **Market Makers**: Provide liquidity, profit from bid-ask spread
- **Institutional Traders**: Hedge funds, pension funds, insurance companies
- **Proprietary Traders**: Trade firm capital

### Why This Matters for Your Trading
Understanding market structure helps you:
- Time entries for better fills
- Avoid low-liquidity options
- Understand why prices move the way they do
- Recognize when large players are active

## Practical Example
Imagine you want to buy 10 contracts of AAPL $150 calls. The current market shows:
- Bid: $2.45 (10 contracts)
- Ask: $2.50 (25 contracts)

If you place a market order, you'll pay $2.50. But if you place a limit order at $2.47, a market maker might fill you in between to earn the spread.

## Key Takeaways
1. Options markets have multiple participants with different goals
2. Market makers provide liquidity but profit from the spread
3. Order routing and execution quality matter
4. Understanding structure = better execution

## Quick Reference
- **Bid**: Price buyers are willing to pay
- **Ask**: Price sellers are asking
- **Spread**: Difference between bid and ask
- **OCC**: Options Clearing Corporation (guarantees all trades)
```

## Quiz Sample (Module 1)

```json
[
  {
    "question": "What is the primary role of market makers in options markets?",
    "options": [
      "To profit from directional moves",
      "To provide liquidity and earn the bid-ask spread",
      "To manipulate prices",
      "To execute only large institutional orders"
    ],
    "correct_answer": 1,
    "explanation": "Market makers provide liquidity by continuously quoting bid and ask prices, profiting from the spread between them while remaining delta-neutral."
  },
  {
    "question": "When open interest increases while price decreases, what does this typically indicate?",
    "options": [
      "Buyers are accumulating positions",
      "Sellers are closing positions",
      "New short positions are being opened",
      "The market is highly liquid"
    ],
    "correct_answer": 2,
    "explanation": "Rising open interest with falling prices suggests new short positions are being established, as both a new buyer and seller are needed to increase OI."
  }
]
```

## Program Completion Outcomes

Upon completing this curriculum, students will be able to:
- Design and execute advanced options strategies
- Use volatility, Greeks, and structure intentionally
- Integrate technical and financial analysis
- Invest using LEAPS and synthetic positions
- Manage risk professionally across portfolios
- Build systematic, rules-based trading approaches

## Estimated Timeline

- Edge function creation: 1 message
- Lesson content population: Automatically via edge function
- Total lessons: ~90 lessons
- Total content: 40+ hours of material

This curriculum transforms the Academy's "Advanced" section into a comprehensive, professional-grade options trading program.
