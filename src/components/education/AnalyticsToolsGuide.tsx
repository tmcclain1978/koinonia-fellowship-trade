import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { 
  BarChart3, Activity, Landmark, Building2, Calendar, 
  TrendingUp, Target, AlertTriangle, BookOpen, Lightbulb,
  DollarSign, Percent, Shield, LineChart
} from "lucide-react";

interface ToolSection {
  id: string;
  icon: any;
  title: string;
  description: string;
  keyFeatures: string[];
  useCases: string[];
  metrics?: { name: string; description: string }[];
}

const analyticsTools: ToolSection[] = [
  {
    id: "quantstats",
    icon: BarChart3,
    title: "QuantStats Portfolio Analytics",
    description: "Professional-grade portfolio performance analysis using quantitative metrics commonly used by hedge funds and institutional investors. This module calculates risk-adjusted returns and helps you understand how well your trading strategy performs relative to the risk taken.",
    keyFeatures: [
      "CAGR (Compound Annual Growth Rate) - Your annualized return",
      "Sharpe Ratio - Risk-adjusted return (>1 is good, >2 is excellent)",
      "Sortino Ratio - Downside risk-adjusted return",
      "Maximum Drawdown - Largest peak-to-trough decline",
      "VaR & CVaR - Value at Risk measures",
      "Monthly Returns Heatmap - Visual performance by month"
    ],
    useCases: [
      "Evaluate if your trading strategy beats buy-and-hold",
      "Compare different strategies on risk-adjusted basis",
      "Identify worst-case scenarios and drawdown periods",
      "Track performance consistency over time"
    ],
    metrics: [
      { name: "Sharpe Ratio", description: "Measures excess return per unit of risk. A ratio above 1.0 indicates good risk-adjusted performance. Above 2.0 is excellent." },
      { name: "Sortino Ratio", description: "Similar to Sharpe but only penalizes downside volatility. Higher is better since upside volatility is desirable." },
      { name: "Maximum Drawdown", description: "The largest percentage drop from peak to trough. Helps you understand worst-case scenarios." },
      { name: "Calmar Ratio", description: "Annual return divided by max drawdown. Shows return per unit of drawdown risk." }
    ]
  },
  {
    id: "montecarlo",
    icon: Activity,
    title: "Monte Carlo Simulation Lab",
    description: "Run thousands of simulated portfolio paths to estimate the probability distribution of future returns. This powerful statistical technique helps you understand the range of possible outcomes and assess risk under different market scenarios.",
    keyFeatures: [
      "Probability of Profit - Likelihood of positive returns",
      "Probability of Target - Chance of hitting your return goal",
      "Percentile Bands (5th-95th) - Range of outcomes",
      "Scenario Analysis - Bull, Bear, Neutral, Volatile markets",
      "Distribution Histogram - Final value spread visualization"
    ],
    useCases: [
      "Retirement planning and goal-based investing",
      "Sizing positions based on risk tolerance",
      "Setting realistic return expectations",
      "Stress testing portfolios under different market conditions"
    ]
  },
  {
    id: "fred",
    icon: Landmark,
    title: "Federal Reserve Economic Data (FRED)",
    description: "Access key macroeconomic indicators from the Federal Reserve Bank of St. Louis. These indicators help you understand the broader economic environment and make informed trading decisions based on economic trends.",
    keyFeatures: [
      "Real GDP - Overall economic growth",
      "Unemployment Rate - Labor market health",
      "CPI (Consumer Price Index) - Inflation measure",
      "Federal Funds Rate - Central bank policy rate",
      "Yield Curve Spread (10Y-2Y) - Recession indicator",
      "VIX - Market volatility/fear gauge"
    ],
    useCases: [
      "Identify recession warning signs",
      "Anticipate Federal Reserve policy changes",
      "Understand inflation trends for asset allocation",
      "Gauge market sentiment and risk appetite"
    ],
    metrics: [
      { name: "Yield Curve Inversion", description: "When short-term rates exceed long-term rates (negative 10Y-2Y spread), it often precedes recessions by 6-24 months." },
      { name: "Fed Funds Rate", description: "The interest rate banks charge each other. Higher rates slow the economy; lower rates stimulate it." },
      { name: "CPI", description: "Measures inflation by tracking consumer goods prices. High CPI often leads to Fed rate hikes." }
    ]
  },
  {
    id: "futures",
    icon: Building2,
    title: "CME Futures & Term Structure",
    description: "Analyze futures contracts and their term structures to understand market expectations for commodities, indices, and interest rates. The shape of the futures curve provides insights into supply/demand dynamics and market sentiment.",
    keyFeatures: [
      "Term Structure Analysis - Forward curve visualization",
      "Contango vs Backwardation detection",
      "Open Interest tracking - Market positioning",
      "Volume analysis across expirations",
      "Key expiration date calendar"
    ],
    useCases: [
      "Identify roll yield opportunities in commodity ETFs",
      "Understand market supply/demand imbalances",
      "Track institutional positioning via open interest",
      "Plan trades around major expiration events"
    ],
    metrics: [
      { name: "Contango", description: "When futures prices are higher than spot. Normal in most markets due to storage and financing costs." },
      { name: "Backwardation", description: "When futures prices are lower than spot. Often signals supply concerns or strong immediate demand." },
      { name: "Open Interest", description: "Total outstanding contracts. Rising OI with rising prices is bullish; falling OI with falling prices is bearish." }
    ]
  },
  {
    id: "calendar",
    icon: Calendar,
    title: "Economic Calendar",
    description: "Track upcoming market-moving economic events including central bank decisions, employment reports, GDP releases, and inflation data. High-impact events can cause significant volatility and create trading opportunities.",
    keyFeatures: [
      "Event importance ratings (High/Medium/Low)",
      "Previous vs Forecast vs Actual values",
      "Multi-country coverage (US, EU, UK, JP, CN)",
      "Week-ahead high-impact event alerts",
      "Real-time actual data updates"
    ],
    useCases: [
      "Avoid trading during high-volatility events",
      "Position for anticipated surprises",
      "Understand post-event market reactions",
      "Plan options trades around event dates"
    ]
  }
];

export function AnalyticsToolsGuide() {
  return (
    <div className="space-y-6">
      {/* Introduction */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary" />
            Advanced Analytics Tools Guide
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground leading-relaxed">
            The Advanced Analytics Lab provides professional-grade quantitative tools used by 
            institutional traders and portfolio managers. This guide explains each tool, its key 
            metrics, and practical use cases to help you make data-driven trading decisions.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            <Badge variant="outline" className="gap-1">
              <BarChart3 className="w-3 h-3" /> QuantStats
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Activity className="w-3 h-3" /> Monte Carlo
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Landmark className="w-3 h-3" /> FRED Data
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Building2 className="w-3 h-3" /> Futures
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Calendar className="w-3 h-3" /> Calendar
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Tool Sections */}
      <Accordion type="single" collapsible className="space-y-4">
        {analyticsTools.map((tool) => (
          <AccordionItem key={tool.id} value={tool.id} className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <tool.icon className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-semibold">{tool.title}</div>
                  <div className="text-sm text-muted-foreground line-clamp-1">
                    {tool.description.slice(0, 80)}...
                  </div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-6">
              <div className="space-y-6">
                {/* Description */}
                <p className="text-muted-foreground leading-relaxed">
                  {tool.description}
                </p>

                {/* Key Features */}
                <div>
                  <h4 className="font-semibold flex items-center gap-2 mb-3">
                    <Lightbulb className="w-4 h-4 text-primary" />
                    Key Features
                  </h4>
                  <ul className="grid md:grid-cols-2 gap-2">
                    {tool.keyFeatures.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Use Cases */}
                <div>
                  <h4 className="font-semibold flex items-center gap-2 mb-3">
                    <Target className="w-4 h-4 text-primary" />
                    Practical Use Cases
                  </h4>
                  <ul className="space-y-2">
                    {tool.useCases.map((useCase, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm bg-muted/30 rounded-lg p-2">
                        <Shield className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        {useCase}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Key Metrics Explained */}
                {tool.metrics && (
                  <div>
                    <h4 className="font-semibold flex items-center gap-2 mb-3">
                      <LineChart className="w-4 h-4 text-primary" />
                      Key Metrics Explained
                    </h4>
                    <div className="space-y-3">
                      {tool.metrics.map((metric, i) => (
                        <div key={i} className="border border-border rounded-lg p-3">
                          <div className="font-medium text-sm">{metric.name}</div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {metric.description}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {/* Pro Tips */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            Pro Tips for Using Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <Badge className="bg-primary/20 text-primary border-0 mt-0.5">1</Badge>
              <span>
                <strong>Don't rely on a single metric.</strong> Combine Sharpe ratio with max drawdown 
                to understand both return efficiency and worst-case risk.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <Badge className="bg-primary/20 text-primary border-0 mt-0.5">2</Badge>
              <span>
                <strong>Monte Carlo simulations are probabilistic.</strong> Run multiple scenarios and 
                focus on the 5th percentile (worst case) for risk management.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <Badge className="bg-primary/20 text-primary border-0 mt-0.5">3</Badge>
              <span>
                <strong>Check the economic calendar before trading.</strong> Avoid opening positions 
                right before high-impact events unless you have a specific event-based strategy.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <Badge className="bg-primary/20 text-primary border-0 mt-0.5">4</Badge>
              <span>
                <strong>Yield curve inversions are leading indicators.</strong> They signal potential 
                recessions 6-24 months ahead, giving you time to adjust your portfolio.
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
