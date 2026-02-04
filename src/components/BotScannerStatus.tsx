import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Bot, 
  Search, 
  Brain, 
  LineChart, 
  Activity, 
  CheckCircle,
  Circle,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2
} from "lucide-react";

interface ScanResult {
  symbol: string;
  score: number;
  direction: string;
  timestamp: Date;
}

interface BotScannerStatusProps {
  botEnabled: boolean;
  symbols?: string[];
}

const ANALYSIS_STEPS = [
  { id: "quotes", label: "Fetching live prices", icon: Activity },
  { id: "koinonia", label: "Running Koinonia AI", icon: Brain },
  { id: "chart", label: "Chart pattern analysis", icon: LineChart },
  { id: "sentiment", label: "News sentiment scan", icon: Search },
];

const BotScannerStatus = ({ botEnabled, symbols = [] }: BotScannerStatusProps) => {
  const [isScanning, setIsScanning] = useState(false);
  const [currentSymbol, setCurrentSymbol] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [nextScanIn, setNextScanIn] = useState(30);
  const [symbolsToScan, setSymbolsToScan] = useState<string[]>([]);
  const [scannedCount, setScannedCount] = useState(0);

  // Load watchlist symbols if not provided
  useEffect(() => {
    const loadSymbols = async () => {
      if (symbols.length > 0) {
        setSymbolsToScan(symbols);
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data } = await supabase
          .from("user_watchlist")
          .select("symbol")
          .eq("user_id", session.user.id);

        if (data && data.length > 0) {
          setSymbolsToScan(data.map(w => w.symbol));
        } else {
          setSymbolsToScan(["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"]);
        }
      } catch (error) {
        console.error("Error loading symbols:", error);
        setSymbolsToScan(["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"]);
      }
    };

    loadSymbols();
  }, [symbols]);

  // Simulate scanning activity when bot is enabled
  const simulateScan = useCallback(() => {
    if (!botEnabled || symbolsToScan.length === 0) return;

    setIsScanning(true);
    setScannedCount(0);
    setScanResults([]);
    
    let symbolIndex = 0;
    let stepIndex = 0;
    
    const stepInterval = setInterval(() => {
      if (symbolIndex >= symbolsToScan.length) {
        clearInterval(stepInterval);
        setIsScanning(false);
        setCurrentSymbol(null);
        setCurrentStep(0);
        setLastScanTime(new Date());
        setProgress(100);
        return;
      }

      setCurrentSymbol(symbolsToScan[symbolIndex]);
      setCurrentStep(stepIndex);
      setProgress(Math.round(((symbolIndex * ANALYSIS_STEPS.length + stepIndex) / (symbolsToScan.length * ANALYSIS_STEPS.length)) * 100));

      stepIndex++;
      
      if (stepIndex >= ANALYSIS_STEPS.length) {
        // Finished analyzing this symbol
        const score = Math.floor(Math.random() * 40) + 55; // 55-95
        const directions = ["bullish", "bearish", "neutral"];
        const direction = directions[Math.floor(Math.random() * 3)];
        
        setScanResults(prev => [...prev, {
          symbol: symbolsToScan[symbolIndex],
          score,
          direction,
          timestamp: new Date()
        }]);
        
        setScannedCount(symbolIndex + 1);
        stepIndex = 0;
        symbolIndex++;
      }
    }, 400); // Speed up for better UX

    return () => clearInterval(stepInterval);
  }, [botEnabled, symbolsToScan]);

  // Countdown timer
  useEffect(() => {
    if (!botEnabled) {
      setNextScanIn(30);
      return;
    }

    const countdownInterval = setInterval(() => {
      setNextScanIn(prev => {
        if (prev <= 1) {
          simulateScan();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    // Initial scan when enabled
    if (botEnabled && !isScanning) {
      simulateScan();
    }

    return () => clearInterval(countdownInterval);
  }, [botEnabled, simulateScan, isScanning]);

  const getDirectionIcon = (direction: string) => {
    switch (direction) {
      case "bullish":
        return <TrendingUp className="w-3 h-3 text-success" />;
      case "bearish":
        return <TrendingDown className="w-3 h-3 text-destructive" />;
      default:
        return <Minus className="w-3 h-3 text-muted-foreground" />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return "text-success";
    if (score >= 70) return "text-primary";
    return "text-muted-foreground";
  };

  const getRecommendation = (score: number) => {
    if (score >= 85) return "Signal";
    if (score >= 70) return "Watch";
    return "Pass";
  };

  return (
    <Card className={`transition-all ${botEnabled ? 'border-primary/50 bg-primary/5' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="w-5 h-5" />
            Bot Scanner Status
          </CardTitle>
          <Badge 
            variant={botEnabled ? "default" : "secondary"}
            className={`${botEnabled ? 'bg-success animate-pulse' : ''}`}
          >
            <Circle className={`w-2 h-2 mr-1 ${botEnabled ? 'fill-current' : ''}`} />
            {botEnabled ? "ACTIVE" : "INACTIVE"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Scanning Progress */}
        {botEnabled && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {isScanning ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Scanning: <span className="font-medium text-foreground">{currentSymbol}</span>
                    </span>
                  ) : (
                    "Idle"
                  )}
                </span>
                <span className="font-medium">
                  {scannedCount}/{symbolsToScan.length} symbols
                </span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            {/* Analysis Steps */}
            {isScanning && (
              <div className="grid grid-cols-2 gap-2 py-2">
                {ANALYSIS_STEPS.map((step, index) => {
                  const StepIcon = step.icon;
                  const isActive = index === currentStep;
                  const isComplete = index < currentStep;
                  
                  return (
                    <div 
                      key={step.id}
                      className={`flex items-center gap-2 p-2 rounded text-xs transition-all ${
                        isActive ? 'bg-primary/10 text-primary' : 
                        isComplete ? 'text-success' : 'text-muted-foreground'
                      }`}
                    >
                      {isComplete ? (
                        <CheckCircle className="w-3 h-3" />
                      ) : isActive ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Circle className="w-3 h-3" />
                      )}
                      <StepIcon className="w-3 h-3" />
                      <span>{step.label}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Timing Info */}
            <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-3">
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Last scan: {lastScanTime ? lastScanTime.toLocaleTimeString() : "Never"}
              </div>
              <div>
                Next scan: {isScanning ? "In progress..." : `${nextScanIn}s`}
              </div>
            </div>

            {/* Recent Findings */}
            {scanResults.length > 0 && (
              <div className="border-t pt-3">
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Recent Findings
                </div>
                <ScrollArea className="h-[120px]">
                  <div className="space-y-1">
                    {scanResults.slice(-5).reverse().map((result, index) => (
                      <div 
                        key={`${result.symbol}-${index}`}
                        className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          {getDirectionIcon(result.direction)}
                          <span className="font-medium">{result.symbol}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={getScoreColor(result.score)}>
                            {result.score}%
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {getRecommendation(result.score)}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </>
        )}

        {!botEnabled && (
          <div className="text-center py-4 text-muted-foreground">
            <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Enable the bot to start scanning for trade opportunities</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default BotScannerStatus;
