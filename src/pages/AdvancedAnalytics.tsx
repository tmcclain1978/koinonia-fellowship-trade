import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart3, Activity, Building2, Calendar, FlaskConical,
  TrendingUp, Landmark, Globe
} from "lucide-react";
import Navigation from "@/components/Navigation";
import { QuantStatsModule } from "@/components/analytics/QuantStatsModule";
import { MonteCarloLab } from "@/components/analytics/MonteCarloLab";
import { FREDDashboard } from "@/components/analytics/FREDDashboard";
import { FuturesDashboard } from "@/components/analytics/FuturesDashboard";
import { EconomicCalendar } from "@/components/analytics/EconomicCalendar";

const AdvancedAnalytics = () => {
  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-background pt-16">
        <div className="container mx-auto px-6 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2 flex items-center gap-3">
              <FlaskConical className="w-8 h-8 text-primary" />
              Advanced Analytics Lab
            </h1>
            <p className="text-muted-foreground max-w-2xl">
              Professional-grade quantitative analysis tools including portfolio analytics, 
              Monte Carlo simulations, Federal Reserve economic data, CME futures analysis, 
              and real-time economic calendar tracking.
            </p>
          </div>

          <Tabs defaultValue="quantstats" className="w-full">
            <TabsList className="grid w-full grid-cols-5 mb-6">
              <TabsTrigger value="quantstats" className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                <span className="hidden sm:inline">QuantStats</span>
              </TabsTrigger>
              <TabsTrigger value="montecarlo" className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                <span className="hidden sm:inline">Monte Carlo</span>
              </TabsTrigger>
              <TabsTrigger value="fred" className="flex items-center gap-2">
                <Landmark className="w-4 h-4" />
                <span className="hidden sm:inline">FRED Data</span>
              </TabsTrigger>
              <TabsTrigger value="futures" className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                <span className="hidden sm:inline">Futures</span>
              </TabsTrigger>
              <TabsTrigger value="calendar" className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span className="hidden sm:inline">Calendar</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="quantstats">
              <div className="mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  QuantStats Portfolio Analytics
                </h2>
                <p className="text-sm text-muted-foreground">
                  Professional portfolio performance metrics including CAGR, Sharpe ratio, 
                  drawdowns, rolling returns, and monthly returns heatmap.
                </p>
              </div>
              <QuantStatsModule />
            </TabsContent>

            <TabsContent value="montecarlo">
              <div className="mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary" />
                  Monte Carlo Simulation Lab
                </h2>
                <p className="text-sm text-muted-foreground">
                  Run thousands of portfolio simulations to estimate probability distributions 
                  of future returns and assess risk scenarios.
                </p>
              </div>
              <MonteCarloLab />
            </TabsContent>

            <TabsContent value="fred">
              <div className="mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Landmark className="w-5 h-5 text-primary" />
                  Federal Reserve Economic Data (FRED)
                </h2>
                <p className="text-sm text-muted-foreground">
                  Access key macroeconomic indicators from the Federal Reserve Bank of St. Louis 
                  including GDP, unemployment, inflation, and yield curve data.
                </p>
              </div>
              <FREDDashboard />
            </TabsContent>

            <TabsContent value="futures">
              <div className="mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-primary" />
                  CME Futures & Term Structure
                </h2>
                <p className="text-sm text-muted-foreground">
                  Analyze futures term structures, open interest, and key expiration dates 
                  for major index, energy, and metals contracts.
                </p>
              </div>
              <FuturesDashboard />
            </TabsContent>

            <TabsContent value="calendar">
              <div className="mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary" />
                  Economic Calendar
                </h2>
                <p className="text-sm text-muted-foreground">
                  Track upcoming market-moving economic events including central bank decisions, 
                  employment reports, GDP releases, and inflation data.
                </p>
              </div>
              <EconomicCalendar />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
};

export default AdvancedAnalytics;
