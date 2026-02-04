
# Phroureo Exit Strategy Help Guide - Popup Implementation

## Overview

This plan creates a beginner-friendly help popup that explains the Phroureo exit strategy system with clear examples, visual diagrams, and step-by-step guidance. The popup will be accessible from both the Trading and PaperTrading pages via a help button.

## Component Architecture

```text
+---------------------------+
|   PhroureoHelpButton      |  <-- Help icon button (BookOpen or HelpCircle)
+---------------------------+
            |
            v
+---------------------------+
|   PhroureoHelpModal       |  <-- Dialog with tabbed content
+---------------------------+
    |           |           |
    v           v           v
+-------+  +--------+  +---------+
| Intro |  |Examples|  |Glossary |
+-------+  +--------+  +---------+
```

## New Files

### 1. `src/components/phroureo/PhroureoHelpModal.tsx`

A comprehensive help dialog with three sections:

**Section 1: Introduction (What is Phroureo?)**
- Plain-language explanation of the exit strategy concept
- "Imagine you're in a profitable trade..." scenario
- Key benefits: Protect profits, reduce emotion, automate exits

**Section 2: How It Works (Step-by-Step)**
- Visual state machine diagram (Armed -> Triggered -> Trailing)
- Real example with actual numbers
- Long vs Short position differences

**Section 3: Strategy Examples**
- Clickable preset cards that show exactly what each preset does
- Before/after scenarios with price movements
- "Try This" suggestions for beginners

**Section 4: Glossary**
- Definitions of all key terms (Break-even, Trailing Stop, ATR, etc.)
- Tooltips for complex concepts

## Content Structure

### Introduction Tab

```text
What is Phroureo?

Phroureo (Greek for "protection") automatically protects your profits 
when a trade goes in your favor.

THE PROBLEM:
You enter a trade, it goes up $50... then drops back to break-even.
You missed your chance to lock in gains!

THE SOLUTION:
Phroureo watches your trade. When profit hits your target, it 
automatically moves your stop-loss to protect those gains.

EXAMPLE:
- You buy AAPL at $100
- Price rises to $105 (you're up $50 on 10 contracts)
- Phroureo moves your stop to $100 (break-even)
- Even if price drops, you won't lose money!
```

### How It Works Tab

```text
3-Step Process:

1. ARMED (Waiting)
   Your trade is open, Phroureo is watching
   Example: You bought AAPL $100 Call, waiting for profit

2. TRIGGERED (Stop Moved)
   Profit hit your target, stop automatically moved
   Example: +$50 profit reached, stop moved to break-even

3. TRAILING (Following Price)
   If enabled, stop follows price upward
   Example: Price goes to $108, stop trails to $107.50
```

### Examples Tab (Interactive Cards)

| Example | Trigger | Stop Action | Trail |
|---------|---------|-------------|-------|
| Break-Even Lock | +$50 profit | Move to entry price | None |
| Trail from Break-Even | +$25 profit | Break-even, then trail 0.5% | Yes |
| Aggressive Trail | +$30 profit | Entry + $0.10, trail $0.15 | Yes |
| ATR Protection | +$40 profit | 1.5x ATR below price | Yes |

Each card expands to show a detailed walkthrough with price points.

### Glossary Tab

| Term | Definition |
|------|------------|
| Break-Even | The price where you don't gain or lose money (your entry price) |
| Trailing Stop | A stop that follows the price as it moves in your favor |
| ATR | Average True Range - measures how much price typically moves |
| Trigger | The profit level that activates your protection |
| Never Loosen | Stop can only move in your favor, never against you |

## UI Design

### Help Button Placement

**Trading.tsx:**
- Add a "?" help button next to the Phroureo section in the Risk tab
- Also accessible from the "Protect" button dropdown in OpenPositions

**PaperTrading.tsx:**
- Same placement as Trading page for consistency

### Modal Design

- Uses existing Dialog component from `@/components/ui/dialog`
- Tabs for navigation between sections
- Scroll area for longer content
- Close button (X) in top-right corner
- Max width: 700px for readability
- Mobile-responsive with stacked layout

### Visual Elements

- Color-coded steps (green for profit, blue for armed, etc.)
- Simple icons for each concept (Shield for protection, Target for trigger)
- Progress indicators showing state transitions
- Highlight boxes for important tips

## Integration Points

### Trading.tsx (Lines ~440-444 - Risk Tab area)

Add help button to the Risk tab section:
```tsx
<TabsTrigger value="risk" className="flex items-center gap-2">
  <Shield className="w-4 h-4" />
  <span className="hidden sm:inline">Risk</span>
</TabsTrigger>
```

Add the modal trigger:
```tsx
<PhroureoHelpButton />
```

### PaperTrading.tsx (Lines ~440-444 - Risk Tab area)

Same integration as Trading page.

### OpenPositions.tsx

Add a small help icon next to the "Protect" button that opens the modal.

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/phroureo/PhroureoHelpModal.tsx` | Main help dialog with all content |
| `src/components/phroureo/PhroureoHelpButton.tsx` | Reusable trigger button component |

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Trading.tsx` | Import and add PhroureoHelpButton to Risk tab |
| `src/pages/PaperTrading.tsx` | Import and add PhroureoHelpButton to Risk tab |
| `src/components/phroureo/index.ts` | Export new components |

## Content Examples (Detailed)

### Example 1: Break-Even Lock (Beginner-Friendly)

```text
SCENARIO: You're new to trading and want simple protection

YOUR TRADE:
- Buy 1 AAPL $150 Call at $2.00 per contract
- Total investment: $200 (1 contract x 100 shares x $2.00)

PHROUREO SETTINGS:
- Trigger: +$50 profit
- Stop Mode: Break-Even
- Trailing: Off

WHAT HAPPENS:
1. ARMED: You enter the trade, Phroureo is watching
2. Price moves up, your option is now worth $2.50 (+$50 profit)
3. TRIGGERED: Phroureo moves your stop to $2.00 (your entry)
4. Now if price drops, you exit at $2.00 - no loss!
5. If price keeps rising, you can manually take profit or let it run

RESULT: You can never lose on this trade once triggered!
```

### Example 2: Trail from Break-Even (Intermediate)

```text
SCENARIO: You want protection PLUS the ability to capture more gains

YOUR TRADE:
- Buy 2 SPY $450 Calls at $3.00 each
- Total investment: $600

PHROUREO SETTINGS:
- Trigger: +$25 profit
- Stop Mode: Break-Even
- Trailing: 0.5% below highest price

WHAT HAPPENS:
1. ARMED: Trade open, watching for +$25
2. Options rise to $3.125 each (+$25 profit) - TRIGGERED
3. Stop set to $3.00 (break-even)
4. Price keeps rising to $4.00 - stop trails to $3.98 (0.5% below)
5. Price hits $5.00 - stop trails to $4.975
6. Price drops to $4.90 - you're stopped out at $4.975

RESULT: You turned $600 into $995! (vs. break-even if no trailing)
```

### Example 3: Visual State Diagram

```text
    +------------------+
    |     ARMED        |
    | Watching profit  |
    +--------+---------+
             |
             | Profit reaches $50
             v
    +------------------+
    |   STOP SET       |
    | Stop at entry    |
    +--------+---------+
             |
             | If trailing enabled
             v
    +------------------+
    |   TRAILING       |
    | Stop follows     |
    | price up/down    |
    +--------+---------+
             |
             | Position closes
             v
    +------------------+
    |   COMPLETED      |
    | Trade finished   |
    +------------------+
```

## Database Changes

None required - this is a frontend-only feature.

## Testing Considerations

- Verify modal opens correctly on both Trading and PaperTrading pages
- Test mobile responsiveness (content should stack vertically)
- Ensure close button works and clicking outside closes modal
- Verify all tabs switch correctly
- Test accessibility (keyboard navigation, screen reader support)

## Implementation Summary

1. Create `PhroureoHelpModal.tsx` with comprehensive educational content
2. Create `PhroureoHelpButton.tsx` as a reusable trigger component
3. Add the help button to Trading.tsx in the Risk tab section
4. Add the help button to PaperTrading.tsx in the same location
5. Export new components from the phroureo index file

The help modal will provide new traders with clear, actionable guidance on how to use the Phroureo exit strategy system effectively, with real examples they can immediately apply to their trading.
