import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Brain, TrendingUp, TrendingDown, Minus, Target, AlertTriangle, BarChart3, Eye, EyeOff } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface SupportResistanceLevel {
  price: number;
  strength: 'strong' | 'moderate' | 'weak';
  touches: number;
  type: 'support' | 'resistance';
  label: string;
}

interface BounceZone {
  high: number;
  low: number;
  type: 'bullish' | 'bearish';
  occurrences: number;
  avgBouncePercent: number;
}

interface PremarketAnalysis {
  gapPercent: number;
  gapDirection: 'up' | 'down' | 'flat';
  premarketHigh: number;
  premarketLow: number;
  premarketVWAP: number;
  volumeVsAvg: number;
  premarketRange: number;
}

interface DailyPrediction {
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  predictedHigh: number;
  predictedLow: number;
  keyLevelToWatch: number;
  reasoning: string;
}

interface ChartAnalysis {
  symbol: string;
  timestamp: string;
  supportLevels: SupportResistanceLevel[];
  resistanceLevels: SupportResistanceLevel[];
  bounceZones: BounceZone[];
  premarketAnalysis: PremarketAnalysis | null;
  dailyPrediction: DailyPrediction;
}

interface AIChartAnalysisProps {
  analysis: ChartAnalysis | null;
  isLoading: boolean;
  onAnalyze: () => void;
  showOverlays: {
    support: boolean;
    resistance: boolean;
    bounceZones: boolean;
    predictions: boolean;
    premarket: boolean;
  };
  onToggleOverlay: (overlay: keyof AIChartAnalysisProps['showOverlays']) => void;
}

export const AIChartAnalysis = ({
  analysis,
  isLoading,
  onAnalyze,
  showOverlays,
  onToggleOverlay,
}: AIChartAnalysisProps) => {
  const [expanded, setExpanded] = useState(true);

  const DirectionIcon = analysis?.dailyPrediction.direction === 'bullish' 
    ? TrendingUp 
    : analysis?.dailyPrediction.direction === 'bearish' 
      ? TrendingDown 
      : Minus;

  const directionColor = analysis?.dailyPrediction.direction === 'bullish'
    ? 'text-green-500'
    : analysis?.dailyPrediction.direction === 'bearish'
      ? 'text-red-500'
      : 'text-yellow-500';

  const confidenceColor = (confidence: number) => {
    if (confidence >= 70) return 'bg-green-500/20 text-green-400 border-green-500/40';
    if (confidence >= 50) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40';
    return 'bg-red-500/20 text-red-400 border-red-500/40';
  };

  return (
    <Card className="bg-card/80 backdrop-blur border-primary/20">
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-card-hover transition-colors">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary" />
              <span className="font-semibold">AI Technical Analysis</span>
              {analysis && (
                <Badge variant="outline" className={`${directionColor} border-current`}>
                  <DirectionIcon className="w-3 h-3 mr-1" />
                  {analysis.dailyPrediction.direction.toUpperCase()}
                </Badge>
              )}
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onAnalyze();
              }}
              disabled={isLoading}
              className="gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Brain className="w-4 h-4" />
                  {analysis ? 'Refresh' : 'Analyze Chart'}
                </>
              )}
            </Button>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          {analysis ? (
            <div className="p-4 pt-0 space-y-4">
              {/* Overlay Controls */}
              <div className="flex flex-wrap gap-4 p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Switch
                    id="show-support"
                    checked={showOverlays.support}
                    onCheckedChange={() => onToggleOverlay('support')}
                  />
                  <Label htmlFor="show-support" className="text-sm flex items-center gap-1">
                    <div className="w-3 h-0.5 bg-blue-500" />
                    Support
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="show-resistance"
                    checked={showOverlays.resistance}
                    onCheckedChange={() => onToggleOverlay('resistance')}
                  />
                  <Label htmlFor="show-resistance" className="text-sm flex items-center gap-1">
                    <div className="w-3 h-0.5 bg-red-500" />
                    Resistance
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="show-bounce"
                    checked={showOverlays.bounceZones}
                    onCheckedChange={() => onToggleOverlay('bounceZones')}
                  />
                  <Label htmlFor="show-bounce" className="text-sm flex items-center gap-1">
                    <div className="w-3 h-3 bg-purple-500/30 border border-purple-500" />
                    Bounce Zones
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="show-prediction"
                    checked={showOverlays.predictions}
                    onCheckedChange={() => onToggleOverlay('predictions')}
                  />
                  <Label htmlFor="show-prediction" className="text-sm flex items-center gap-1">
                    <div className="w-3 h-3 bg-gradient-to-b from-green-500/30 to-red-500/30" />
                    Prediction Zone
                  </Label>
                </div>
                {analysis.premarketAnalysis && (
                  <div className="flex items-center gap-2">
                    <Switch
                      id="show-premarket"
                      checked={showOverlays.premarket}
                      onCheckedChange={() => onToggleOverlay('premarket')}
                    />
                    <Label htmlFor="show-premarket" className="text-sm flex items-center gap-1">
                      <div className="w-3 h-0.5 bg-amber-500" style={{ borderStyle: 'dashed' }} />
                      Premarket
                    </Label>
                  </div>
                )}
              </div>

              {/* Daily Prediction */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Target className="w-4 h-4 text-primary" />
                    Daily Prediction
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-muted/50 rounded">
                      <div className="text-xs text-muted-foreground">Direction</div>
                      <div className={`font-semibold capitalize ${directionColor}`}>
                        {analysis.dailyPrediction.direction}
                      </div>
                    </div>
                    <div className="p-2 bg-muted/50 rounded">
                      <div className="text-xs text-muted-foreground">Confidence</div>
                      <Badge className={confidenceColor(analysis.dailyPrediction.confidence)}>
                        {analysis.dailyPrediction.confidence}%
                      </Badge>
                    </div>
                    <div className="p-2 bg-muted/50 rounded">
                      <div className="text-xs text-muted-foreground">Predicted High</div>
                      <div className="font-mono text-green-500">
                        ${analysis.dailyPrediction.predictedHigh.toFixed(2)}
                      </div>
                    </div>
                    <div className="p-2 bg-muted/50 rounded">
                      <div className="text-xs text-muted-foreground">Predicted Low</div>
                      <div className="font-mono text-red-500">
                        ${analysis.dailyPrediction.predictedLow.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div className="p-2 bg-primary/10 rounded border border-primary/20">
                    <div className="text-xs text-muted-foreground">Key Level to Watch</div>
                    <div className="font-mono font-bold text-primary">
                      ${analysis.dailyPrediction.keyLevelToWatch.toFixed(2)}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground italic">
                    {analysis.dailyPrediction.reasoning}
                  </p>
                </div>

                {/* Premarket Analysis */}
                {analysis.premarketAnalysis && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-amber-500" />
                      Premarket Analysis
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 bg-muted/50 rounded">
                        <div className="text-xs text-muted-foreground">Gap</div>
                        <div className={`font-semibold ${
                          analysis.premarketAnalysis.gapDirection === 'up' ? 'text-green-500' :
                          analysis.premarketAnalysis.gapDirection === 'down' ? 'text-red-500' :
                          'text-muted-foreground'
                        }`}>
                          {analysis.premarketAnalysis.gapDirection === 'up' ? '↑' : 
                           analysis.premarketAnalysis.gapDirection === 'down' ? '↓' : '→'} 
                          {Math.abs(analysis.premarketAnalysis.gapPercent).toFixed(2)}%
                        </div>
                      </div>
                      <div className="p-2 bg-muted/50 rounded">
                        <div className="text-xs text-muted-foreground">PM VWAP</div>
                        <div className="font-mono text-amber-500">
                          ${analysis.premarketAnalysis.premarketVWAP.toFixed(2)}
                        </div>
                      </div>
                      <div className="p-2 bg-muted/50 rounded">
                        <div className="text-xs text-muted-foreground">PM High</div>
                        <div className="font-mono">
                          ${analysis.premarketAnalysis.premarketHigh.toFixed(2)}
                        </div>
                      </div>
                      <div className="p-2 bg-muted/50 rounded">
                        <div className="text-xs text-muted-foreground">PM Low</div>
                        <div className="font-mono">
                          ${analysis.premarketAnalysis.premarketLow.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Support & Resistance Levels */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Support Levels */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-blue-400">Support Levels</h4>
                  <div className="space-y-1">
                    {analysis.supportLevels.slice(0, 4).map((level, i) => (
                      <div 
                        key={i}
                        className="flex items-center justify-between p-2 bg-blue-500/10 rounded border-l-2 border-blue-500"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium">${level.price.toFixed(2)}</span>
                          <Badge variant="outline" className="text-xs">
                            {level.touches} touches
                          </Badge>
                        </div>
                        <Badge 
                          variant="secondary" 
                          className={`text-xs ${
                            level.strength === 'strong' ? 'bg-blue-500/30' :
                            level.strength === 'moderate' ? 'bg-blue-500/20' :
                            'bg-blue-500/10'
                          }`}
                        >
                          {level.label}
                        </Badge>
                      </div>
                    ))}
                    {analysis.supportLevels.length === 0 && (
                      <p className="text-sm text-muted-foreground italic">No support levels detected</p>
                    )}
                  </div>
                </div>

                {/* Resistance Levels */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-red-400">Resistance Levels</h4>
                  <div className="space-y-1">
                    {analysis.resistanceLevels.slice(0, 4).map((level, i) => (
                      <div 
                        key={i}
                        className="flex items-center justify-between p-2 bg-red-500/10 rounded border-l-2 border-red-500"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium">${level.price.toFixed(2)}</span>
                          <Badge variant="outline" className="text-xs">
                            {level.touches} touches
                          </Badge>
                        </div>
                        <Badge 
                          variant="secondary" 
                          className={`text-xs ${
                            level.strength === 'strong' ? 'bg-red-500/30' :
                            level.strength === 'moderate' ? 'bg-red-500/20' :
                            'bg-red-500/10'
                          }`}
                        >
                          {level.label}
                        </Badge>
                      </div>
                    ))}
                    {analysis.resistanceLevels.length === 0 && (
                      <p className="text-sm text-muted-foreground italic">No resistance levels detected</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Bounce Zones */}
              {analysis.bounceZones.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-purple-400">Bounce Zones</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {analysis.bounceZones.map((zone, i) => (
                      <div 
                        key={i}
                        className={`p-2 rounded border-l-2 ${
                          zone.type === 'bullish' 
                            ? 'bg-green-500/10 border-green-500' 
                            : 'bg-red-500/10 border-red-500'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm">
                            ${zone.low.toFixed(2)} - ${zone.high.toFixed(2)}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {zone.occurrences}x {zone.type}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Disclaimer */}
              <div className="flex items-start gap-2 p-2 bg-destructive/10 rounded text-xs text-muted-foreground">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <p>
                  AI analysis is for informational purposes only. Past performance does not guarantee future results. 
                  Always do your own research before making trading decisions.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-muted-foreground">
              <Brain className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="mb-2">No analysis available</p>
              <p className="text-sm">Click "Analyze Chart" to generate AI-powered technical analysis</p>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};
