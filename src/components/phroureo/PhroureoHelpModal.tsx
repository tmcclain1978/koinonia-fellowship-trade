import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Shield, 
  Target, 
  TrendingUp, 
  ArrowRight, 
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Zap,
  Lock,
  RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PhroureoHelpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PhroureoHelpModal({ open, onOpenChange }: PhroureoHelpModalProps) {
  const [expandedExample, setExpandedExample] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[700px] max-h-[85vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Shield className="h-6 w-6 text-primary" />
            Phroureo Exit Strategy Guide
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Learn how to protect your profits automatically
          </p>
        </DialogHeader>

        <Tabs defaultValue="intro" className="w-full">
          <TabsList className="w-full justify-start px-6 bg-transparent border-b rounded-none h-auto pb-0">
            <TabsTrigger 
              value="intro" 
              className="rounded-b-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
            >
              <BookOpen className="h-4 w-4 mr-2" />
              Introduction
            </TabsTrigger>
            <TabsTrigger 
              value="howItWorks"
              className="rounded-b-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
            >
              <Zap className="h-4 w-4 mr-2" />
              How It Works
            </TabsTrigger>
            <TabsTrigger 
              value="examples"
              className="rounded-b-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
            >
              <Target className="h-4 w-4 mr-2" />
              Examples
            </TabsTrigger>
            <TabsTrigger 
              value="glossary"
              className="rounded-b-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
            >
              <BookOpen className="h-4 w-4 mr-2" />
              Glossary
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[60vh] px-6 py-4">
            {/* Introduction Tab */}
            <TabsContent value="intro" className="mt-0 space-y-6">
              <div className="space-y-4">
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2 mb-2">
                    <Shield className="h-5 w-5 text-primary" />
                    What is Phroureo?
                  </h3>
                  <p className="text-muted-foreground">
                    <strong>Phroureo</strong> (Greek for "protection") automatically protects your profits 
                    when a trade goes in your favor. It watches your positions and moves your stop-loss 
                    to lock in gains when your profit target is hit.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Card className="border-destructive/30 bg-destructive/5">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        The Problem
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                      You enter a trade, it goes up $50... then drops back to break-even or worse. 
                      You missed your chance to lock in gains!
                    </CardContent>
                  </Card>

                  <Card className="border-green-500/30 bg-green-500/5">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2 text-green-600">
                        <CheckCircle2 className="h-4 w-4" />
                        The Solution
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                      Phroureo watches your trade. When profit hits your target, it automatically 
                      moves your stop-loss to protect those gains.
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Quick Example</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-3 text-sm">
                      <Badge variant="outline">1</Badge>
                      <span>You buy AAPL at $100</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Badge variant="outline">2</Badge>
                      <span>Price rises to $105 (you're up $50 on 10 shares)</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Badge className="bg-primary">3</Badge>
                      <span className="font-medium">Phroureo moves your stop to $100 (break-even)</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">✓</Badge>
                      <span className="text-green-600">Even if price drops, you won't lose money!</span>
                    </div>
                  </CardContent>
                </Card>

                <div className="bg-muted/50 rounded-lg p-4">
                  <h4 className="font-medium mb-2">Key Benefits:</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span><strong>Protect Profits</strong> - Never watch gains disappear again</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span><strong>Remove Emotion</strong> - Automated decisions based on your rules</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span><strong>Trail Profits</strong> - Optional trailing stop captures more upside</span>
                    </li>
                  </ul>
                </div>
              </div>
            </TabsContent>

            {/* How It Works Tab */}
            <TabsContent value="howItWorks" className="mt-0 space-y-6">
              <h3 className="font-semibold text-lg">3-Step Process</h3>
              
              <div className="space-y-4">
                {/* State 1: Armed */}
                <Card className="border-blue-500/30">
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                        <Target className="h-6 w-6 text-blue-500" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold">1. ARMED</h4>
                          <Badge variant="outline" className="bg-blue-500/10 text-blue-600">Waiting</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          Your trade is open and Phroureo is watching for your profit target.
                        </p>
                        <div className="bg-muted/50 rounded p-2 text-xs">
                          <strong>Example:</strong> You bought AAPL $100 Call at $2.00, waiting for +$50 profit
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-center">
                  <ArrowRight className="h-6 w-6 text-muted-foreground rotate-90" />
                </div>

                {/* State 2: Triggered */}
                <Card className="border-yellow-500/30">
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
                        <Lock className="h-6 w-6 text-yellow-600" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold">2. TRIGGERED</h4>
                          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600">Stop Moved</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          Profit hit your target! Stop automatically moved to your configured level.
                        </p>
                        <div className="bg-muted/50 rounded p-2 text-xs">
                          <strong>Example:</strong> +$50 profit reached, stop moved to $2.00 (break-even)
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-center">
                  <ArrowRight className="h-6 w-6 text-muted-foreground rotate-90" />
                </div>

                {/* State 3: Trailing */}
                <Card className="border-green-500/30">
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                        <TrendingUp className="h-6 w-6 text-green-500" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold">3. TRAILING</h4>
                          <Badge variant="outline" className="bg-green-500/10 text-green-600">Following Price</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          If enabled, your stop follows the price upward to capture more gains.
                        </p>
                        <div className="bg-muted/50 rounded p-2 text-xs">
                          <strong>Example:</strong> Price goes to $3.00, stop trails to $2.85 (0.5% below)
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Lock className="h-4 w-4 text-primary" />
                    <h4 className="font-semibold">Never Loosen Rule</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    By default, Phroureo will <strong>never move your stop backward</strong>. 
                    Once your stop is at break-even, it can only go higher (for long positions) 
                    to lock in more profit. This protects you from giving back gains.
                  </p>
                </CardContent>
              </Card>

              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Long vs Short Positions
                </h4>
                <div className="grid gap-4 sm:grid-cols-2 text-sm">
                  <div>
                    <p className="font-medium text-green-600 mb-1">Long Positions:</p>
                    <ul className="text-muted-foreground space-y-1">
                      <li>• Stop moves UP as price rises</li>
                      <li>• Trails below the highest price</li>
                      <li>• Protects gains from pullbacks</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-red-500 mb-1">Short Positions:</p>
                    <ul className="text-muted-foreground space-y-1">
                      <li>• Stop moves DOWN as price falls</li>
                      <li>• Trails above the lowest price</li>
                      <li>• Protects gains from bounces</li>
                    </ul>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Examples Tab */}
            <TabsContent value="examples" className="mt-0 space-y-4">
              <p className="text-sm text-muted-foreground">
                Click on any example to see the detailed walkthrough.
              </p>

              {/* Example 1: Break-Even Lock */}
              <Card 
                className={cn(
                  "cursor-pointer transition-all hover:border-primary/50",
                  expandedExample === "breakeven" && "border-primary"
                )}
                onClick={() => setExpandedExample(expandedExample === "breakeven" ? null : "breakeven")}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Badge className="bg-blue-500">Beginner</Badge>
                      Break-Even Lock
                    </span>
                    <span className="text-xs text-muted-foreground">No Trailing</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-2">
                    Move stop to break-even when you're up $50. Simple protection with no trailing.
                  </p>
                  {expandedExample === "breakeven" && (
                    <div className="mt-4 space-y-3 border-t pt-4">
                      <div className="bg-muted/50 rounded p-3">
                        <p className="font-medium mb-2">Your Trade:</p>
                        <ul className="text-sm space-y-1">
                          <li>• Buy 1 AAPL $150 Call at $2.00 per contract</li>
                          <li>• Total investment: $200</li>
                        </ul>
                      </div>
                      <div className="bg-primary/5 rounded p-3">
                        <p className="font-medium mb-2">Phroureo Settings:</p>
                        <ul className="text-sm space-y-1">
                          <li>• Trigger: +$50 profit</li>
                          <li>• Stop Mode: Break-Even</li>
                          <li>• Trailing: Off</li>
                        </ul>
                      </div>
                      <div className="space-y-2">
                        <p className="font-medium">What Happens:</p>
                        <div className="space-y-1 text-sm">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="w-6">1</Badge>
                            <span>ARMED: You enter the trade, Phroureo is watching</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="w-6">2</Badge>
                            <span>Option rises to $2.50 (+$50 profit)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className="bg-primary w-6">3</Badge>
                            <span>TRIGGERED: Stop moves to $2.00 (entry)</span>
                          </div>
                          <div className="flex items-center gap-2 text-green-600">
                            <Badge className="bg-green-500 w-6">✓</Badge>
                            <span>You can never lose on this trade!</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Example 2: Trail from Break-Even */}
              <Card 
                className={cn(
                  "cursor-pointer transition-all hover:border-primary/50",
                  expandedExample === "trail" && "border-primary"
                )}
                onClick={() => setExpandedExample(expandedExample === "trail" ? null : "trail")}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Badge className="bg-yellow-500">Intermediate</Badge>
                      Trail from Break-Even
                    </span>
                    <span className="text-xs text-muted-foreground">0.5% Trail</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-2">
                    Lock in break-even at +$25, then trail by 0.5% to capture more upside.
                  </p>
                  {expandedExample === "trail" && (
                    <div className="mt-4 space-y-3 border-t pt-4">
                      <div className="bg-muted/50 rounded p-3">
                        <p className="font-medium mb-2">Your Trade:</p>
                        <ul className="text-sm space-y-1">
                          <li>• Buy 2 SPY $450 Calls at $3.00 each</li>
                          <li>• Total investment: $600</li>
                        </ul>
                      </div>
                      <div className="bg-primary/5 rounded p-3">
                        <p className="font-medium mb-2">Phroureo Settings:</p>
                        <ul className="text-sm space-y-1">
                          <li>• Trigger: +$25 profit</li>
                          <li>• Stop Mode: Break-Even</li>
                          <li>• Trailing: 0.5% below highest price</li>
                        </ul>
                      </div>
                      <div className="space-y-2">
                        <p className="font-medium">What Happens:</p>
                        <div className="space-y-1 text-sm">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="w-6">1</Badge>
                            <span>Options rise to $3.125 each (+$25 profit)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className="bg-primary w-6">2</Badge>
                            <span>Stop set to $3.00 (break-even)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="w-6">3</Badge>
                            <span>Price rises to $4.00 → Stop trails to $3.98</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="w-6">4</Badge>
                            <span>Price hits $5.00 → Stop trails to $4.975</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="w-6">5</Badge>
                            <span>Price drops to $4.90 → Stopped out at $4.975</span>
                          </div>
                          <div className="flex items-center gap-2 text-green-600">
                            <Badge className="bg-green-500 w-6">✓</Badge>
                            <span>$600 → $995! ($395 profit vs break-even)</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Example 3: ATR Protection */}
              <Card 
                className={cn(
                  "cursor-pointer transition-all hover:border-primary/50",
                  expandedExample === "atr" && "border-primary"
                )}
                onClick={() => setExpandedExample(expandedExample === "atr" ? null : "atr")}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Badge className="bg-purple-500">Advanced</Badge>
                      ATR-Based Protection
                    </span>
                    <span className="text-xs text-muted-foreground">1.5x ATR</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-2">
                    Uses volatility-based stops that adapt to how much the stock typically moves.
                  </p>
                  {expandedExample === "atr" && (
                    <div className="mt-4 space-y-3 border-t pt-4">
                      <div className="bg-muted/50 rounded p-3">
                        <p className="font-medium mb-2">What is ATR?</p>
                        <p className="text-sm text-muted-foreground">
                          <strong>Average True Range (ATR)</strong> measures how much a stock typically 
                          moves in a day. If AAPL's ATR is $3, it usually moves about $3 per day.
                        </p>
                      </div>
                      <div className="bg-primary/5 rounded p-3">
                        <p className="font-medium mb-2">How It Works:</p>
                        <ul className="text-sm space-y-1">
                          <li>• Stop is set 1.5x ATR below the current price</li>
                          <li>• If ATR = $3, stop is $4.50 below price</li>
                          <li>• Gives room for normal volatility</li>
                          <li>• Adapts to different stocks automatically</li>
                        </ul>
                      </div>
                      <div className="bg-green-500/10 rounded p-3 text-sm">
                        <strong>Best For:</strong> Traders who want stops that respect 
                        each stock's natural movement patterns.
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="bg-primary/5 rounded-lg p-4 mt-4">
                <h4 className="font-medium mb-2">💡 Tip for Beginners</h4>
                <p className="text-sm text-muted-foreground">
                  Start with the <strong>Break-Even Lock</strong> strategy. It's simple and 
                  guarantees you won't lose money once triggered. As you get comfortable, 
                  try adding trailing stops to capture more upside.
                </p>
              </div>
            </TabsContent>

            {/* Glossary Tab */}
            <TabsContent value="glossary" className="mt-0 space-y-4">
              <div className="space-y-3">
                {[
                  {
                    term: "Break-Even",
                    definition: "The price where you don't gain or lose money. For options, this is your entry price (what you paid per contract).",
                    icon: "⚖️"
                  },
                  {
                    term: "Trailing Stop",
                    definition: "A stop-loss that follows the price as it moves in your favor. It 'trails' behind by a set amount ($ or %).",
                    icon: "📈"
                  },
                  {
                    term: "ATR (Average True Range)",
                    definition: "A measure of how much a stock typically moves in a day. Used to set stops that respect normal volatility.",
                    icon: "📊"
                  },
                  {
                    term: "Trigger",
                    definition: "The profit level that activates your protection. When your unrealized P/L hits this amount, Phroureo takes action.",
                    icon: "🎯"
                  },
                  {
                    term: "Never Loosen",
                    definition: "A safety rule that prevents your stop from moving backward. Once locked in, gains can only increase.",
                    icon: "🔒"
                  },
                  {
                    term: "Stop-Loss",
                    definition: "An order to sell your position if it drops to a certain price. Limits your potential loss.",
                    icon: "🛡️"
                  },
                  {
                    term: "Unrealized P/L",
                    definition: "Your profit or loss on an open position. It's 'unrealized' because you haven't closed the trade yet.",
                    icon: "💰"
                  },
                  {
                    term: "Armed",
                    definition: "The state when Phroureo is active and watching your position, waiting for the trigger condition.",
                    icon: "⏳"
                  },
                  {
                    term: "Trail Amount",
                    definition: "How far below (for longs) or above (for shorts) the highest price your stop will trail.",
                    icon: "📏"
                  },
                  {
                    term: "Trail Step",
                    definition: "How often the trailing stop updates. E.g., 'every $0.10 move' means stop updates after each $0.10 price increase.",
                    icon: "👣"
                  }
                ].map((item) => (
                  <Card key={item.term}>
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{item.icon}</span>
                        <div>
                          <h4 className="font-semibold">{item.term}</h4>
                          <p className="text-sm text-muted-foreground">{item.definition}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
