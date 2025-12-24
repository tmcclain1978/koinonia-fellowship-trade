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
}

const ALERT_TYPES = [
  { id: "price_above", label: "Price Above", icon: ArrowUpCircle, description: "Alert when price rises above target" },
  { id: "price_below", label: "Price Below", icon: ArrowDownCircle, description: "Alert when price drops below target" },
  { id: "percent_change", label: "% Change", icon: Activity, description: "Alert on percentage change" },
  { id: "volume_spike", label: "Volume Spike", icon: BarChart3, description: "Alert on unusual volume" },
  { id: "rsi_overbought", label: "RSI Overbought", icon: TrendingUp, description: "RSI crosses above 70" },
  { id: "rsi_oversold", label: "RSI Oversold", icon: TrendingDown, description: "RSI drops below 30" },
  { id: "macd_cross", label: "MACD Cross", icon: Activity, description: "MACD line crosses signal" },
  { id: "sma_cross", label: "SMA Cross", icon: TrendingUp, description: "Price crosses moving average" },
];

export const PriceAlertSystem = () => {
  const [user, setUser] = useState<User | null>(null);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newAlert, setNewAlert] = useState({
    symbol: "",
    alert_type: "price_above",
    target_value: "",
    notes: ""
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
              setAlerts(prev => prev.map(a => a.id === payload.new.id ? payload.new as PriceAlert : a));
              // Show notification for triggered alerts
              const newAlert = payload.new as PriceAlert;
              if (newAlert.is_triggered && !payload.old.is_triggered) {
                toast.success(`🔔 Alert Triggered: ${newAlert.symbol}`, {
                  description: `${getAlertTypeLabel(newAlert.alert_type)} at ${newAlert.target_value}`
                });
              }
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
      setAlerts(data || []);
    } catch (error) {
      console.error("Error fetching alerts:", error);
      toast.error("Failed to load alerts");
    } finally {
      setLoading(false);
    }
  };

  const createAlert = async () => {
    if (!user) return;
    if (!newAlert.symbol || !newAlert.target_value) {
      toast.error("Please fill in all required fields");
      return;
    }

    setCreating(true);
    try {
      const { error } = await supabase.from("price_alerts").insert({
        user_id: user.id,
        symbol: newAlert.symbol.toUpperCase(),
        alert_type: newAlert.alert_type,
        target_value: parseFloat(newAlert.target_value),
        notes: newAlert.notes || null
      });

      if (error) throw error;

      toast.success("Alert created successfully");
      setNewAlert({ symbol: "", alert_type: "price_above", target_value: "", notes: "" });
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

  const getAlertTypeLabel = (type: string) => {
    return ALERT_TYPES.find(t => t.id === type)?.label || type;
  };

  const getAlertIcon = (type: string) => {
    const alertType = ALERT_TYPES.find(t => t.id === type);
    return alertType?.icon || Activity;
  };

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
                  onValueChange={(value) => setNewAlert(prev => ({ ...prev, alert_type: value }))}
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

              <div className="space-y-2">
                <Label>
                  {newAlert.alert_type === "percent_change" ? "Percentage (%)" : 
                   newAlert.alert_type === "volume_spike" ? "Volume Multiplier (e.g., 2 for 2x)" :
                   "Target Price ($)"}
                </Label>
                <Input
                  type="number"
                  placeholder={newAlert.alert_type === "percent_change" ? "5" : 
                               newAlert.alert_type === "volume_spike" ? "2" : "150.00"}
                  value={newAlert.target_value}
                  onChange={(e) => setNewAlert(prev => ({ ...prev, target_value: e.target.value }))}
                />
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
                                Target: ${alert.target_value.toLocaleString()}
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
                                Target: ${alert.target_value} • Triggered: {new Date(alert.triggered_at!).toLocaleString()}
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteAlert(alert.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
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
                                Target: ${alert.target_value}
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
