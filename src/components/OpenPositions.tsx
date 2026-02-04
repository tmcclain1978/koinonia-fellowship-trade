import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { TrendingUp, TrendingDown, X, Minus, Plus, Edit, Shield } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { EditableExitStrategy, ExitStrategy } from "@/components/options/EditableExitStrategy";
import { PhroureoStrategyBuilder, PhroureoPositionCard, PhroureoExitStrategy, PhroureoStrategyInput, STATE_BADGES } from "@/components/phroureo";
import { usePhroureoStrategy } from "@/hooks/usePhroureoStrategy";

interface Position {
  symbol: string;
  details: string;
  side: string;
  strike?: number;
  expiration?: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPL: number;
  totalCost: number;
}

interface OpenPositionsProps {
  positions: Position[];
  onPositionClick?: (position: Position) => void;
  onPositionClosed?: () => void;
  onExitStrategyChange?: (position: Position, strategy: ExitStrategy) => void;
}

export const OpenPositions = ({ positions, onPositionClick, onPositionClosed, onExitStrategyChange }: OpenPositionsProps) => {
  const { toast } = useToast();
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [closeQuantity, setCloseQuantity] = useState(1);
  const [closing, setClosing] = useState(false);
  
  // Exit strategy editing (legacy)
  const [exitStrategyDialogOpen, setExitStrategyDialogOpen] = useState(false);
  const [exitStrategyPosition, setExitStrategyPosition] = useState<Position | null>(null);
  
  // Phroureo exit strategy
  const [phroureoDialogOpen, setPhroureoDialogOpen] = useState(false);
  const [phroureoPosition, setPhroureoPosition] = useState<Position | null>(null);
  const [phroureoViewDialogOpen, setPhroureoViewDialogOpen] = useState(false);
  const [selectedPhroureoStrategy, setSelectedPhroureoStrategy] = useState<PhroureoExitStrategy | null>(null);
  
  // Fetch all strategies for current user
  const { strategies: allStrategies, createStrategy, refresh: refreshStrategies } = usePhroureoStrategy();
  
  // Map strategies by symbol for quick lookup
  const strategyBySymbol: Record<string, PhroureoExitStrategy> = {};
  allStrategies.forEach(s => {
    strategyBySymbol[s.symbol] = s;
  });
  
  const handleOpenPhroureoDialog = (e: React.MouseEvent, position: Position) => {
    e.stopPropagation();
    setPhroureoPosition(position);
    setPhroureoDialogOpen(true);
  };
  
  const handleViewPhroureoStrategy = (e: React.MouseEvent, strategy: PhroureoExitStrategy) => {
    e.stopPropagation();
    setSelectedPhroureoStrategy(strategy);
    setPhroureoViewDialogOpen(true);
  };
  
  const handleSavePhroureoStrategy = async (config: PhroureoStrategyInput) => {
    if (!phroureoPosition) return;
    
    await createStrategy(config, undefined, 'paper');
    setPhroureoDialogOpen(false);
    setPhroureoPosition(null);
    refreshStrategies();
    
    toast({
      title: "Phroureo Strategy Created",
      description: `Exit strategy for ${config.symbol} is now active`,
    });
  };
  
  const handleOpenExitStrategyDialog = (e: React.MouseEvent, position: Position) => {
    e.stopPropagation();
    setExitStrategyPosition(position);
    setExitStrategyDialogOpen(true);
  };
  
  const handleSaveExitStrategy = (strategy: ExitStrategy) => {
    if (exitStrategyPosition) {
      onExitStrategyChange?.(exitStrategyPosition, strategy);
      // Save to localStorage as fallback
      const key = `exit_strategy_${exitStrategyPosition.symbol}_${exitStrategyPosition.strike || 'stock'}`;
      localStorage.setItem(key, JSON.stringify(strategy));
    }
  };

  const handleOpenCloseDialog = (e: React.MouseEvent, position: Position) => {
    e.stopPropagation();
    setSelectedPosition(position);
    setCloseQuantity(1);
    setCloseDialogOpen(true);
  };

  const handleClosePosition = async (closeAll: boolean = false) => {
    if (!selectedPosition) return;
    
    const quantityToClose = closeAll ? selectedPosition.quantity : closeQuantity;
    
    setClosing(true);
    try {
      // Execute the sell trade for partial or full close
      const { data, error } = await supabase.functions.invoke('execute-paper-trade', {
        body: {
          symbol: selectedPosition.symbol,
          action: 'sell',
          quantity: quantityToClose.toString(),
          price: selectedPosition.currentPrice.toFixed(2),
          strike: selectedPosition.strike?.toString() || '',
          side: selectedPosition.side,
          expiration: selectedPosition.expiration || '',
        }
      });

      if (error) throw error;

      const remaining = selectedPosition.quantity - quantityToClose;
      const realizedPL = (selectedPosition.currentPrice - selectedPosition.entryPrice) * quantityToClose * 100;
      
      toast({
        title: closeAll ? "Position Closed" : "Scaled Out Successfully",
        description: closeAll 
          ? `Closed all ${quantityToClose} contracts of ${selectedPosition.symbol} | P/L: $${realizedPL.toFixed(2)}`
          : `Closed ${quantityToClose} of ${selectedPosition.quantity} contracts | ${remaining} remaining | P/L: $${realizedPL.toFixed(2)}`,
      });

      setCloseDialogOpen(false);
      setSelectedPosition(null);
      onPositionClosed?.();
    } catch (error: any) {
      toast({
        title: "Error closing position",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setClosing(false);
    }
  };

  if (positions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Open Positions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">No open positions</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Open Positions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {positions.map((position, index) => {
              const pl = position.unrealizedPL;
              const plPercentage = ((pl / position.totalCost) * 100).toFixed(2);
              const phroureoStrategy = strategyBySymbol[position.symbol];
              
              return (
                <div
                  key={`${position.symbol}-${index}`}
                  onClick={() => onPositionClick?.(position)}
                  className="border border-border rounded-lg p-4 hover:bg-accent/50 cursor-pointer transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-lg">{position.symbol}</h4>
                        <Badge variant={position.side === 'CALL' ? 'default' : 'destructive'}>
                          {position.side}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {position.quantity} contract{position.quantity > 1 ? 's' : ''}
                        </Badge>
                        {/* Phroureo Status Badge */}
                        {phroureoStrategy && (
                          <Badge 
                            variant={STATE_BADGES[phroureoStrategy.state]?.variant || 'secondary'}
                            className="text-xs cursor-pointer"
                            onClick={(e) => handleViewPhroureoStrategy(e, phroureoStrategy)}
                          >
                            <Shield className="w-3 h-3 mr-1" />
                            {STATE_BADGES[phroureoStrategy.state]?.label || phroureoStrategy.state}
                          </Badge>
                        )}
                      </div>
                      {position.strike && (
                        <p className="text-sm text-muted-foreground">
                          ${position.strike} Strike • {position.expiration}
                        </p>
                      )}
                      {/* Show current stop if Phroureo is active */}
                      {phroureoStrategy?.current_stop_price && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Stop: ${phroureoStrategy.current_stop_price.toFixed(2)}
                          {phroureoStrategy.reference_price && (
                            <span className="ml-2">
                              | Ref: ${phroureoStrategy.reference_price.toFixed(2)}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="text-right">
                        <div className={`flex items-center gap-1 text-lg font-bold ${pl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {pl >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                          ${Math.abs(pl).toFixed(2)}
                        </div>
                        <p className={`text-sm ${pl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {pl >= 0 ? '+' : ''}{plPercentage}%
                        </p>
                      </div>
                      {/* Phroureo Protection Button */}
                      {!phroureoStrategy ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => handleOpenPhroureoDialog(e, position)}
                          className="shrink-0"
                          title="Add Phroureo Protection"
                        >
                          <Shield className="w-4 h-4 mr-1" />
                          Protect
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleViewPhroureoStrategy(e, phroureoStrategy)}
                          className="shrink-0"
                          title="View Phroureo Strategy"
                        >
                          <Shield className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleOpenExitStrategyDialog(e, position)}
                        className="shrink-0"
                        title="Edit Exit Strategy"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => handleOpenCloseDialog(e, position)}
                        className="shrink-0"
                      >
                        <Minus className="w-4 h-4 mr-1" />
                        Close
                      </Button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Quantity</p>
                      <p className="font-medium">{position.quantity}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Entry Premium</p>
                      <p className="font-medium">${position.entryPrice.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Current Premium</p>
                      <p className="font-medium">${position.currentPrice.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Total Cost</p>
                      <p className="font-medium">${position.totalCost.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Scale Out / Close Position Dialog */}
      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Close Position - Scale Out</DialogTitle>
            <DialogDescription>
              Choose how many contracts to close. You can scale out partially or close the entire position.
            </DialogDescription>
          </DialogHeader>

          {selectedPosition && (
            <div className="space-y-6 py-4">
              {/* Position Summary */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-lg">{selectedPosition.symbol}</span>
                  <Badge variant={selectedPosition.side === 'CALL' ? 'default' : 'destructive'}>
                    {selectedPosition.side}
                  </Badge>
                </div>
                {selectedPosition.strike && (
                  <p className="text-sm text-muted-foreground">
                    ${selectedPosition.strike} Strike • {selectedPosition.expiration}
                  </p>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total Contracts:</span>
                  <span className="font-medium">{selectedPosition.quantity}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Current Price:</span>
                  <span className="font-medium">${selectedPosition.currentPrice.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Unrealized P/L:</span>
                  <span className={`font-medium ${selectedPosition.unrealizedPL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    ${selectedPosition.unrealizedPL.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Quantity Selector */}
              <div className="space-y-4">
                <Label>Contracts to Close</Label>
                
                {/* Numerical Input with +/- buttons */}
                <div className="flex items-center justify-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCloseQuantity(Math.max(1, closeQuantity - 1))}
                    disabled={closeQuantity <= 1}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  
                  <Input
                    type="number"
                    min={1}
                    max={selectedPosition.quantity}
                    value={closeQuantity}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 1;
                      setCloseQuantity(Math.min(Math.max(val, 1), selectedPosition.quantity));
                    }}
                    className="w-24 text-center text-lg font-bold"
                  />
                  
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCloseQuantity(Math.min(selectedPosition.quantity, closeQuantity + 1))}
                    disabled={closeQuantity >= selectedPosition.quantity}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                <p className="text-center text-sm text-muted-foreground">
                  {closeQuantity} of {selectedPosition.quantity} contracts
                </p>

                {/* Slider */}
                <Slider
                  value={[closeQuantity]}
                  onValueChange={([value]) => setCloseQuantity(value)}
                  min={1}
                  max={selectedPosition.quantity}
                  step={1}
                  className="w-full"
                />

                {/* Quick percentage buttons */}
                <div className="flex justify-center gap-2">
                  {[25, 50, 75, 100].map((pct) => {
                    const qty = Math.max(1, Math.round(selectedPosition.quantity * (pct / 100)));
                    return (
                      <Button
                        key={pct}
                        variant={closeQuantity === qty ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCloseQuantity(qty)}
                      >
                        {pct}%
                      </Button>
                    );
                  })}
                </div>

                {/* Estimated P/L for this close */}
                <div className="bg-accent/50 rounded-lg p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>Realized P/L (this close):</span>
                    <span className={`font-bold ${
                      (selectedPosition.currentPrice - selectedPosition.entryPrice) >= 0 
                        ? 'text-green-500' 
                        : 'text-red-500'
                    }`}>
                      ${((selectedPosition.currentPrice - selectedPosition.entryPrice) * closeQuantity * 100).toFixed(2)}
                    </span>
                  </div>
                  {closeQuantity < selectedPosition.quantity && (
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span className="text-muted-foreground">Remaining contracts:</span>
                      <span>{selectedPosition.quantity - closeQuantity}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setCloseDialogOpen(false)}
              disabled={closing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleClosePosition(true)}
              disabled={closing}
            >
              <X className="w-4 h-4 mr-1" />
              Close All
            </Button>
            <Button
              onClick={() => handleClosePosition(false)}
              disabled={closing || closeQuantity === selectedPosition?.quantity}
            >
              <Minus className="w-4 h-4 mr-1" />
              {closing ? 'Closing...' : `Close ${closeQuantity}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exit Strategy Dialog */}
      {exitStrategyPosition && (
        <EditableExitStrategy
          position={exitStrategyPosition}
          open={exitStrategyDialogOpen}
          onOpenChange={setExitStrategyDialogOpen}
          onSave={handleSaveExitStrategy}
        />
      )}

      {/* Phroureo Strategy Builder Dialog */}
      <Dialog open={phroureoDialogOpen} onOpenChange={setPhroureoDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Phroureo Protection - {phroureoPosition?.symbol}
            </DialogTitle>
            <DialogDescription>
              Configure an automated exit strategy with profit triggers, stop-loss management, and trailing stops.
            </DialogDescription>
          </DialogHeader>
          {phroureoPosition && (
            <PhroureoStrategyBuilder
              symbol={phroureoPosition.symbol}
              side={phroureoPosition.side === 'CALL' ? 'long' : 'short'}
              entryPrice={phroureoPosition.entryPrice}
              quantity={phroureoPosition.quantity}
              currentPrice={phroureoPosition.currentPrice}
              onSave={handleSavePhroureoStrategy}
              onCancel={() => setPhroureoDialogOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Phroureo Strategy View Dialog */}
      <Dialog open={phroureoViewDialogOpen} onOpenChange={setPhroureoViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Phroureo Strategy Details
            </DialogTitle>
          </DialogHeader>
          {selectedPhroureoStrategy && (
            <PhroureoPositionCard
              strategy={selectedPhroureoStrategy}
              currentPrice={positions.find(p => p.symbol === selectedPhroureoStrategy.symbol)?.currentPrice}
              onUpdate={() => {
                refreshStrategies();
                setPhroureoViewDialogOpen(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
