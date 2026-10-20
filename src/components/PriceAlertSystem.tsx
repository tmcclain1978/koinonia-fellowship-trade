import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  Bell, 
  BellRing, 
  Plus, 
  Trash2, 
  TrendingUp, 
  TrendingDown,
  Activity,
  BarChart3,
  ArrowUpCircle,
  ArrowDownCircle,
  Loader2,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import type { Json } from "@/integrations/supabase/types";
import { describeAlert, toChartAlert } from "@/components/charts/alerts/chartAlerts";

interface PriceAlert {
  id: string;
  symbol: string;
  alert_type: string;
  target_value: number;
  current_value: number | null;
  is_triggered: boolean;
  is_active: boolean;
  triggered_at: string | null;
  notes: string | null;
  created_at: string;
  condition?: { timeframe?: "5" | "15" | "60" | "D"; direction?: "any" | "up" | "down" } | null;
  frequency?: string;
  cooldown_minutes?: number;
  notify_email?: boolean;
  trigger_message?: string | null;
  trigger_count?: number;
}

const INDICATOR_TYPES = ["rsi_overbought", "rsi_oversold", "macd_cross", "sma_cross"];
const DIRECTION_TYPES = ["macd_cross", "sma_cross"];

const valueLabel = (type: string) =>
  type === "percent_change" ? "Percentage (%)" :
  type === "volume_spike" ? "Volume multiple (e.g. 2 for 2× normal)" :
  type === "rsi_overbought" || type === "rsi_oversold" ? "RSI level" :
  type === "sma_cross" ? "Moving average period (bars)" :
  type === "macd_cross" ? "" : "Target price ($)";

const defaultValue = (type: string) =>
  type === "rsi_overbought" ? "70" : type === "rsi_oversold" ? "30" : type === "sma_cross" ? "50" : type === "macd_cross" ? "0" : "";

const describe = (a: PriceAlert) => describeAlert(toChartAlert(a as unknown as Record<string, unknown>));

const ALERT_TYPES = [
  { id: "price_above", label: "Price Above", icon: ArrowUpCircle, description: "Alert when price rises above target" },
  { id: "price_below", label: "Price Below", icon: ArrowDownCircle, description: "Alert when price drops below target" },
  { id: "percent_change", label: "% Change", icon: Activity, description: "Alert on percentage change" },
  { id: "volume_spike", label: "Volume Spike", icon: BarChart3, description: "Alert on unusual volume" },
  { id: "rsi_overbought", label: "RSI Overbought", icon: TrendingUp, description: "RSI crosses above 70" },
  { id: "rsi_oversold", label: "RSI Oversold", icon: TrendingDown, description: "RSI drops below 30" },
  { id: "macd_cross", label: "MACD Cross", icon: Activity, description: "MACD line crosses signal" },
  { id: "sma_cross", label: "SMA Cross", icon: TrendingUp, description: "Close crosses a moving average" },
];
// Created from the chart (Alerts button); listed here, not offered in the form.
const LIST_ONLY_TYPES = [{ id: "line_cross", label: "Line Cross", icon: Activity, description: "Price crosses a line drawn on the chart" }];

export const PriceAlertSystem = () => {
  const [user, setUser] = useState<User | null>(null);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newAlert, setNewAlert] = useState({
    symbol: "",
    alert_type: "price_above",
    target_value: "",
    notes: "",
    timeframe: "15" as "5" | "15" | "60" | "D",
    direction: "any" as "any" | "up" | "down",
    repeat: false,
    cooldown: "60",
    email: true,
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, []);
  useEffect(() => {
    if (user) {
      fetchAlerts();
      // Set up realtime subscription
      const channel = supabase
        .channel('price-alerts-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'price_alerts', filter: `user_id=eq.${user.id}` },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              setAlerts(prev => [payload.new as PriceAlert, ...prev]);
            } else if (payload.eventType === 'UPDATE') {
              // The "alert triggered" toast comes from the notification center.
              setAlerts(prev => prev.map(a => a.id === payload.new.id ? payload.new as PriceAlert : a));
            } else if (payload.eventType === 'DELETE') {
              setAlerts(prev => prev.filter(a => a.id !== payload.old.id));
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  const fetchAlerts = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("price_alerts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAlerts((data || []) as unknown as PriceAlert[]);
    } catch (error) {
      console.error("Error fetching alerts:", error);
      toast.error("Failed to load alerts");
    } finally {
      setLoading(false);
    }
  };

  const createAlert = async () => {
    if (!user) return;
    if (!newAlert.symbol || (!newAlert.target_value && newAlert.alert_type !== "macd_cross")) {
      toast.error("Please fill in all required fields");
      return;
    }

    setCreating(true);
    try {
      const { error } = await supabase.from("price_alerts").insert({
        user_id: user.id,
        symbol: newAlert.symbol.toUpperCase(),
        alert_type: newAlert.alert_type,
        target_value: parseFloat(newAlert.target_value) || 0,
        notes: newAlert.notes || null,
        condition: (INDICATOR_TYPES.includes(newAlert.alert_type)
          ? { timeframe: newAlert.timeframe, direction: DIRECTION_TYPES.includes(newAlert.alert_type) ? newAlert.direction : "any" }
          : null) as Json,
        frequency: newAlert.repeat ? "repeat" : "once",
        cooldown_minutes: Math.min(10080, Math.max(1, parseInt(newAlert.cooldown) || 60)),
        notify_email: newAlert.email,
      });

      if (error) throw error;

      toast.success("Alert created successfully");
      setNewAlert(prev => ({ ...prev, symbol: "", target_value: "", notes: "" }));
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Error creating alert:", error);
      toast.error("Failed to create alert");
    } finally {
      setCreating(false);
    }
  };

  const toggleAlert = async (alertId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from("price_alerts")
        .update({ is_active: isActive })
        .eq("id", alertId);

      if (error) throw error;
      toast.success(isActive ? "Alert activated" : "Alert paused");
    } catch (error) {
      console.error("Error toggling alert:", error);
      toast.error("Failed to update alert");
    }
  };

  const deleteAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from("price_alerts")
        .delete()
        .eq("id", alertId);

      if (error) throw error;
      toast.success("Alert deleted");
    } catch (error) {
      console.error("Error deleting alert:", error);
      toast.error("Failed to delete alert");
    }
  };

  const rearmAlert = async (alertId: string) => {
    const { error } = await supabase
      .from("price_alerts")
      .update({ is_triggered: false, triggered_at: null, trigger_message: null, last_checked_at: new Date().toISOString(), last_price: null })
      .eq("id", alertId);
    if (error) toast.error("Failed to re-arm alert");
    else toast.success("Alert re-armed");
  };

  const getAlertTypeLabel = (type: string) => {
    return [...ALERT_TYPES, ...LIST_ONLY_TYPES].find(t => t.id === type)?.label || type;
  };

  const getAlertIcon = (type: string) => {
    const alertType = [...ALERT_TYPES, ...LIST_ONLY_TYPES].find(t => t.id === type);
    return alertType?.icon || Activity;
  };

  // Repeating alerts stay active after firing.
  const activeAlerts = alerts.filter(a => a.is_active && !a.is_triggered);
  const triggeredAlerts = alerts.filter(a => a.is_triggered);
  const pausedAlerts = alerts.filter(a => !a.is_active && !a.is_triggered);

  if (!user) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Please sign in to manage price alerts
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Price Alerts
        </CardTitle>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-1" />
              New Alert
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Price Alert</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Symbol</Label>
                <Input
                  placeholder="e.g., AAPL, TSLA"
                  value={newAlert.symbol}
                  onChange={(e) => setNewAlert(prev => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Alert Type</Label>
                <Select 
                  value={newAlert.alert_type}
                  onValueChange={(value) => setNewAlert(prev => ({ ...prev, alert_type: value, target_value: defaultValue(value) || prev.target_value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALERT_TYPES.map(type => (
                      <SelectItem key={type.id} value={type.id}>
                        <div className="flex items-center gap-2">
                          <type.icon className="w-4 h-4" />
                          <span>{type.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {ALERT_TYPES.find(t => t.id === newAlert.alert_type)?.description}
                </p>
              </div>

              {valueLabel(newAlert.alert_type) && (
                <div className="space-y-2">
                  <Label>{valueLabel(newAlert.alert_type)}</Label>
                  <Input
                    type="number"
                    placeholder={newAlert.alert_type === "percent_change" ? "5" :
                                 newAlert.alert_type === "volume_spike" ? "2" : "150.00"}
                    value={newAlert.target_value}
                    onChange={(e) => setNewAlert(prev => ({ ...prev, target_value: e.target.value }))}
                  />
                </div>
              )}

              {INDICATOR_TYPES.includes(newAlert.alert_type) && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Timeframe</Label>
                    <Select value={newAlert.timeframe} onValueChange={(v) => setNewAlert(prev => ({ ...prev, timeframe: v as typeof prev.timeframe }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5 min</SelectItem>
                        <SelectItem value="15">15 min</SelectItem>
                        <SelectItem value="60">1 hour</SelectItem>
                        <SelectItem value="D">Daily</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {DIRECTION_TYPES.includes(newAlert.alert_type) && (
                    <div className="space-y-2">
                      <Label>Direction</Label>
                      <Select value={newAlert.direction} onValueChange={(v) => setNewAlert(prev => ({ ...prev, direction: v as typeof prev.direction }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Either way</SelectItem>
                          <SelectItem value="up">Crossing up</SelectItem>
                          <SelectItem value="down">Crossing down</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <p className="col-span-2 text-xs text-muted-foreground">Checked on completed bars only.</p>
                </div>
              )}

              <div className="space-y-3 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="pas-repeat">Repeat (re-arms after a pause)</Label>
                  <Switch id="pas-repeat" checked={newAlert.repeat} onCheckedChange={(v) => setNewAlert(prev => ({ ...prev, repeat: v }))} />
                </div>
                {newAlert.repeat && (
                  <div className="flex items-center gap-2 text-sm">
                    <span>Pause</span>
                    <Input type="number" className="w-24 h-8" value={newAlert.cooldown} onChange={(e) => setNewAlert(prev => ({ ...prev, cooldown: e.target.value }))} />
                    <span>minutes</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <Label htmlFor="pas-email">Email me too</Label>
                  <Switch id="pas-email" checked={newAlert.email} onCheckedChange={(v) => setNewAlert(prev => ({ ...prev, email: v }))} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Input
                  placeholder="Add a note..."
                  value={newAlert.notes}
                  onChange={(e) => setNewAlert(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>

              <Button onClick={createAlert} disabled={creating} className="w-full">
                {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Bell className="w-4 h-4 mr-2" />}
                Create Alert
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <Tabs defaultValue="active" className="w-full">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="active" className="relative">
                Active
                {activeAlerts.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {activeAlerts.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="triggered" className="relative">
                Triggered
                {triggeredAlerts.length > 0 && (
                  <Badge variant="default" className="ml-1 h-5 px-1.5 text-xs bg-green-500">
                    {triggeredAlerts.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="paused">Paused</TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="mt-4">
              <ScrollArea className="h-[300px]">
                {activeAlerts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <BellRing className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No active alerts</p>
                    <p className="text-xs">Create one to get started</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeAlerts.map(alert => {
                      const Icon = getAlertIcon(alert.alert_type);
                      return (
                        <div key={alert.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-full bg-primary/10">
                              <Icon className="w-4 h-4 text-primary" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{alert.symbol}</span>
                                <Badge variant="outline" className="text-xs">
                                  {getAlertTypeLabel(alert.alert_type)}
                                </Badge>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {describe(alert)}
                                {alert.frequency === "repeat" && <span className="ml-2">• repeats{alert.trigger_count ? `, fired ${alert.trigger_count}×` : ""}</span>}
                                {alert.notes && <span className="ml-2">• {alert.notes}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={alert.is_active}
                              onCheckedChange={(checked) => toggleAlert(alert.id, checked)}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteAlert(alert.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="triggered" className="mt-4">
              <ScrollArea className="h-[300px]">
                {triggeredAlerts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No triggered alerts</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {triggeredAlerts.map(alert => {
                      const Icon = getAlertIcon(alert.alert_type);
                      return (
                        <div key={alert.id} className="flex items-center justify-between p-3 rounded-lg border bg-green-500/5 border-green-500/20">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-full bg-green-500/10">
                              <Icon className="w-4 h-4 text-green-500" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{alert.symbol}</span>
                                <Badge className="text-xs bg-green-500">Triggered</Badge>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {describe(alert)} • Triggered: {alert.triggered_at ? new Date(alert.triggered_at).toLocaleString() : "—"}
                              </div>
                              {alert.trigger_message && <div className="text-xs text-muted-foreground">{alert.trigger_message}</div>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => rearmAlert(alert.id)}>Re-arm</Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteAlert(alert.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="paused" className="mt-4">
              <ScrollArea className="h-[300px]">
                {pausedAlerts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <XCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No paused alerts</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pausedAlerts.map(alert => {
                      const Icon = getAlertIcon(alert.alert_type);
                      return (
                        <div key={alert.id} className="flex items-center justify-between p-3 rounded-lg border opacity-60">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-full bg-muted">
                              <Icon className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{alert.symbol}</span>
                                <Badge variant="secondary" className="text-xs">Paused</Badge>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {describe(alert)}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={alert.is_active}
                              onCheckedChange={(checked) => toggleAlert(alert.id, checked)}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteAlert(alert.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
};
