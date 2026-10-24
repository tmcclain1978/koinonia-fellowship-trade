import Navigation from "@/components/Navigation";
import OptionsSignals from "@/components/options/OptionsSignals";
import { Target } from "lucide-react";

const OptionsSignalsPage = () => (
  <div className="min-h-screen bg-background">
    <Navigation />
    <main className="container mx-auto px-4 pt-24 pb-12">
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-accent shadow-glow">
            <Target className="h-5 w-5 text-accent-foreground" />
          </div>
          <h1 className="font-display text-3xl font-bold text-foreground">Options Signals</h1>
        </div>
        <p className="text-muted-foreground">Same-day and swing predictions for TSLA, SPY, AAPL, NVDA and QQQ options</p>
      </div>
      <OptionsSignals />
    </main>
  </div>
);

export default OptionsSignalsPage;
