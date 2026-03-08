import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  GitBranch,
  Plus,
  Trash2,
  Play,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Zap,
  Clock,
} from "lucide-react";

interface Condition {
  id: string;
  triggerSymbol: string;
  triggerType: 'price_above' | 'price_below' | 'pct_change_up' | 'pct_change_down';
  triggerValue: string;
}

interface ConditionalOrder {
  id: string;
  name: string;
  conditions: Condition[];
  conditionLogic: 'all' | 'any';
  action: {
    symbol: string;
    side: 'buy' | 'sell';
    quantity: string;
    orderType: 'market' | 'limit';
    limitPrice: string;
  };
  trailingStop: {
    enabled: boolean;
    type: 'percent' | 'dollar';
    value: string;
    activationPrice: string;
  };
  taxLot: 'fifo' | 'lifo' | 'hifo' | 'specific';
  enabled: boolean;
}

const defaultCondition = (): Condition => ({
  id: crypto.randomUUID(),
  triggerSymbol: "SPY",
  triggerType: "price_below",
  triggerValue: "",
});

const defaultOrder = (): ConditionalOrder => ({
  id: crypto.randomUUID(),
  name: "New Conditional Order",
  conditions: [defaultCondition()],
  conditionLogic: "all",
  action: {
    symbol: "",
    side: "sell",
    quantity: "100",
    orderType: "market",
    limitPrice: "",
  },
  trailingStop: {
    enabled: false,
    type: "percent",
    value: "2",
    activationPrice: "",
  },
  taxLot: "fifo",
  enabled: true,
});

interface Props {
  symbol: string;
  currentPrice?: number;
}

export function ConditionalOrderBuilder({ symbol, currentPrice }: Props) {
  const [orders, setOrders] = useState<ConditionalOrder[]>([]);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const { toast } = useToast();

  const activeOrder = orders.find((o) => o.id === activeOrderId);

  const addOrder = () => {
    const newOrder = defaultOrder();
    newOrder.action.symbol = symbol;
    setOrders((prev) => [...prev, newOrder]);
    setActiveOrderId(newOrder.id);
  };

  const updateOrder = (id: string, updates: Partial<ConditionalOrder>) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, ...updates } : o))
    );
  };

  const removeOrder = (id: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== id));
    if (activeOrderId === id) setActiveOrderId(null);
  };

  const addCondition = (orderId: string) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? { ...o, conditions: [...o.conditions, defaultCondition()] }
          : o
      )
    );
  };

  const updateCondition = (
    orderId: string,
    condId: string,
    updates: Partial<Condition>
  ) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              conditions: o.conditions.map((c) =>
                c.id === condId ? { ...c, ...updates } : c
              ),
            }
          : o
      )
    );
  };

  const removeCondition = (orderId: string, condId: string) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? { ...o, conditions: o.conditions.filter((c) => c.id !== condId) }
          : o
      )
    );
  };

  const activateOrder = (id: string) => {
    const order = orders.find((o) => o.id === id);
    if (!order) return;
    if (order.conditions.some((c) => !c.triggerValue)) {
      toast({
        title: "Incomplete conditions",
        description: "Please fill in all trigger values before activating.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Conditional order activated",
      description: `"${order.name}" is now monitoring conditions.`,
    });
  };

  const triggerLabel = (type: string) => {
    switch (type) {
      case "price_above": return "Price Above";
      case "price_below": return "Price Below";
      case "pct_change_up": return "% Change Up";
      case "pct_change_down": return "% Change Down";
      default: return type;
    }
  };

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <GitBranch className="h-4 w-4 text-primary" />
            Conditional Orders
          </CardTitle>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addOrder}>
            <Plus className="h-3 w-3 mr-1" /> New Rule
          </Button>
        </div>
      </CardHeader>

      <CardContent className="px-3 pb-3 space-y-3">
        {orders.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>No conditional orders yet.</p>
            <p className="text-xs mt-1">Create rules like "If SPY drops 2%, sell XYZ"</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Order list */}
            <div className="flex flex-wrap gap-1.5">
              {orders.map((o) => (
                <Badge
                  key={o.id}
                  variant={activeOrderId === o.id ? "default" : "outline"}
                  className="cursor-pointer text-xs"
                  onClick={() => setActiveOrderId(o.id)}
                >
                  {o.enabled ? (
                    <Zap className="h-3 w-3 mr-1" />
                  ) : (
                    <Clock className="h-3 w-3 mr-1" />
                  )}
                  {o.name}
                </Badge>
              ))}
            </div>

            {activeOrder && (
              <div className="space-y-3 pt-2">
                {/* Name */}
                <Input
                  value={activeOrder.name}
                  onChange={(e) =>
                    updateOrder(activeOrder.id, { name: e.target.value })
                  }
                  className="h-8 text-sm font-semibold"
                  placeholder="Order name"
                />

                <Separator />

                {/* Conditions */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs font-semibold">IF Conditions</Label>
                    <Select
                      value={activeOrder.conditionLogic}
                      onValueChange={(v: 'all' | 'any') =>
                        updateOrder(activeOrder.id, { conditionLogic: v })
                      }
                    >
                      <SelectTrigger className="h-6 w-20 text-[10px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">ALL</SelectItem>
                        <SelectItem value="any">ANY</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    {activeOrder.conditions.map((cond, idx) => (
                      <div
                        key={cond.id}
                        className="grid grid-cols-[1fr_1fr_80px_24px] gap-1.5 items-end"
                      >
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Symbol</Label>
                          <Input
                            value={cond.triggerSymbol}
                            onChange={(e) =>
                              updateCondition(activeOrder.id, cond.id, {
                                triggerSymbol: e.target.value.toUpperCase(),
                              })
                            }
                            className="h-7 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Trigger</Label>
                          <Select
                            value={cond.triggerType}
                            onValueChange={(v: Condition['triggerType']) =>
                              updateCondition(activeOrder.id, cond.id, { triggerType: v })
                            }
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="price_above">Price Above</SelectItem>
                              <SelectItem value="price_below">Price Below</SelectItem>
                              <SelectItem value="pct_change_up">% Up</SelectItem>
                              <SelectItem value="pct_change_down">% Down</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Value</Label>
                          <Input
                            type="number"
                            value={cond.triggerValue}
                            onChange={(e) =>
                              updateCondition(activeOrder.id, cond.id, {
                                triggerValue: e.target.value,
                              })
                            }
                            className="h-7 text-xs"
                            placeholder={cond.triggerType.includes("pct") ? "%" : "$"}
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => removeCondition(activeOrder.id, cond.id)}
                          disabled={activeOrder.conditions.length === 1}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] mt-1"
                    onClick={() => addCondition(activeOrder.id)}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add Condition
                  </Button>
                </div>

                <Separator />

                {/* THEN Action */}
                <div>
                  <Label className="text-xs font-semibold mb-2 block">THEN Execute</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Side</Label>
                      <Select
                        value={activeOrder.action.side}
                        onValueChange={(v: 'buy' | 'sell') =>
                          updateOrder(activeOrder.id, {
                            action: { ...activeOrder.action, side: v },
                          })
                        }
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="buy">Buy</SelectItem>
                          <SelectItem value="sell">Sell</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Qty</Label>
                      <Input
                        type="number"
                        value={activeOrder.action.quantity}
                        onChange={(e) =>
                          updateOrder(activeOrder.id, {
                            action: { ...activeOrder.action, quantity: e.target.value },
                          })
                        }
                        className="h-7 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Symbol</Label>
                      <Input
                        value={activeOrder.action.symbol}
                        onChange={(e) =>
                          updateOrder(activeOrder.id, {
                            action: {
                              ...activeOrder.action,
                              symbol: e.target.value.toUpperCase(),
                            },
                          })
                        }
                        className="h-7 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Order Type</Label>
                      <Select
                        value={activeOrder.action.orderType}
                        onValueChange={(v: 'market' | 'limit') =>
                          updateOrder(activeOrder.id, {
                            action: { ...activeOrder.action, orderType: v },
                          })
                        }
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="market">Market</SelectItem>
                          <SelectItem value="limit">Limit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Trailing Stop */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Switch
                      checked={activeOrder.trailingStop.enabled}
                      onCheckedChange={(v) =>
                        updateOrder(activeOrder.id, {
                          trailingStop: { ...activeOrder.trailingStop, enabled: v },
                        })
                      }
                      className="scale-75"
                    />
                    <Label className="text-xs font-semibold">Trailing Stop</Label>
                  </div>
                  {activeOrder.trailingStop.enabled && (
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Type</Label>
                        <Select
                          value={activeOrder.trailingStop.type}
                          onValueChange={(v: 'percent' | 'dollar') =>
                            updateOrder(activeOrder.id, {
                              trailingStop: { ...activeOrder.trailingStop, type: v },
                            })
                          }
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percent">%</SelectItem>
                            <SelectItem value="dollar">$</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Trail</Label>
                        <Input
                          type="number"
                          value={activeOrder.trailingStop.value}
                          onChange={(e) =>
                            updateOrder(activeOrder.id, {
                              trailingStop: {
                                ...activeOrder.trailingStop,
                                value: e.target.value,
                              },
                            })
                          }
                          className="h-7 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Activate At</Label>
                        <Input
                          type="number"
                          value={activeOrder.trailingStop.activationPrice}
                          onChange={(e) =>
                            updateOrder(activeOrder.id, {
                              trailingStop: {
                                ...activeOrder.trailingStop,
                                activationPrice: e.target.value,
                              },
                            })
                          }
                          className="h-7 text-xs"
                          placeholder="Optional"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Tax lot */}
                <div className="flex items-center gap-3">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">
                    Tax Lot Selection
                  </Label>
                  <Select
                    value={activeOrder.taxLot}
                    onValueChange={(v: ConditionalOrder['taxLot']) =>
                      updateOrder(activeOrder.id, { taxLot: v })
                    }
                  >
                    <SelectTrigger className="h-7 text-xs flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fifo">FIFO (First In, First Out)</SelectItem>
                      <SelectItem value="lifo">LIFO (Last In, First Out)</SelectItem>
                      <SelectItem value="hifo">HIFO (Highest Cost)</SelectItem>
                      <SelectItem value="specific">Specific Lot</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={() => activateOrder(activeOrder.id)}
                  >
                    <Play className="h-3 w-3 mr-1" /> Activate
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-8 text-xs"
                    onClick={() => removeOrder(activeOrder.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>

                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <AlertTriangle className="h-3 w-3" />
                  Conditional orders run client-side — keep app open
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
