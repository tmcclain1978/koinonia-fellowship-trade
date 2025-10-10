import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown } from "lucide-react";

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
}

export const OpenPositions = ({ positions, onPositionClick }: OpenPositionsProps) => {
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
    <Card>
      <CardHeader>
        <CardTitle>Open Positions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {positions.map((position, index) => {
            const pl = position.unrealizedPL;
            const plPercentage = ((pl / position.totalCost) * 100).toFixed(2);
            
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
                    </div>
                    {position.strike && (
                      <p className="text-sm text-muted-foreground">
                        ${position.strike} Strike • {position.expiration}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <div className={`flex items-center gap-1 text-lg font-bold ${pl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {pl >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      ${Math.abs(pl).toFixed(2)}
                    </div>
                    <p className={`text-sm ${pl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {pl >= 0 ? '+' : ''}{plPercentage}%
                    </p>
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
  );
};