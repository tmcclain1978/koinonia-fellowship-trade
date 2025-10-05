import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Bot, Save } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";

interface AutoTradingSettings {
  enabled: boolean;
  max_position_size: number;
  max_daily_trades: number;
  risk_tolerance: "conservative" | "moderate" | "aggressive";
  allowed_symbols: string[];
}

const AutoTradingSettings = () => {
  const { subscription } = useSubscription();
  const [settings, setSettings] = useState<AutoTradingSettings>({
    enabled: false,
    max_position_size: 100,
    max_daily_trades: 5,
    risk_tolerance: "moderate",
    allowed_symbols: [],
  });
  const [symbolInput, setSymbolInput] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from("auto_trading_settings")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (data) {
        setSettings({
          enabled: data.enabled,
          max_position_size: data.max_position_size || 100,
          max_daily_trades: data.max_daily_trades || 5,
          risk_tolerance: (data.risk_tolerance as "conservative" | "moderate" | "aggressive") || "moderate",
          allowed_symbols: data.allowed_symbols || [],
        });
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    }
  };

  const saveSettings = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase
        .from("auto_trading_settings")
        .upsert({
          user_id: session.user.id,
          enabled: settings.enabled,
          max_position_size: settings.max_position_size,
          max_daily_trades: settings.max_daily_trades,
          risk_tolerance: settings.risk_tolerance,
          allowed_symbols: settings.allowed_symbols,
        });

      if (error) throw error;

      toast({
        title: "Settings Saved",
        description: "Your auto-trading settings have been updated.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const addSymbol = () => {
    if (symbolInput && !settings.allowed_symbols.includes(symbolInput.toUpperCase())) {
      setSettings({
        ...settings,
        allowed_symbols: [...settings.allowed_symbols, symbolInput.toUpperCase()],
      });
      setSymbolInput("");
    }
  };

  const removeSymbol = (symbol: string) => {
    setSettings({
      ...settings,
      allowed_symbols: settings.allowed_symbols.filter((s) => s !== symbol),
    });
  };

  if (subscription?.tier !== "enterprise") {
    return (
      <div className="bg-card rounded-xl p-8 border border-border">
        <div className="flex items-center gap-3 mb-4">
          <Bot className="w-6 h-6 text-muted-foreground" />
          <h3 className="text-xl font-semibold text-foreground">AI Auto-Trading Bot</h3>
        </div>
        <p className="text-muted-foreground mb-4">
          Upgrade to Enterprise to unlock the AI Auto-Trading Bot feature.
        </p>
        <Button onClick={() => window.location.href = "/pricing"}>
          Upgrade to Enterprise
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl p-8 border border-border space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <Bot className="w-6 h-6 text-primary" />
        <h3 className="text-xl font-semibold text-foreground">AI Auto-Trading Bot</h3>
      </div>

      {/* Enable/Disable */}
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="enabled">Enable Auto-Trading</Label>
          <p className="text-sm text-muted-foreground">
            Allow the AI bot to execute trades automatically
          </p>
        </div>
        <Switch
          id="enabled"
          checked={settings.enabled}
          onCheckedChange={(checked) => setSettings({ ...settings, enabled: checked })}
        />
      </div>

      {/* Max Position Size */}
      <div>
        <Label htmlFor="max_position">Max Position Size</Label>
        <Input
          id="max_position"
          type="number"
          value={settings.max_position_size}
          onChange={(e) =>
            setSettings({ ...settings, max_position_size: parseInt(e.target.value) || 0 })
          }
          placeholder="100"
        />
        <p className="text-sm text-muted-foreground mt-1">
          Maximum number of contracts per trade
        </p>
      </div>

      {/* Max Daily Trades */}
      <div>
        <Label htmlFor="max_daily">Max Daily Trades</Label>
        <Input
          id="max_daily"
          type="number"
          value={settings.max_daily_trades}
          onChange={(e) =>
            setSettings({ ...settings, max_daily_trades: parseInt(e.target.value) || 0 })
          }
          placeholder="5"
        />
        <p className="text-sm text-muted-foreground mt-1">
          Maximum trades the bot can execute per day
        </p>
      </div>

      {/* Risk Tolerance */}
      <div>
        <Label htmlFor="risk">Risk Tolerance</Label>
        <Select
          value={settings.risk_tolerance}
          onValueChange={(value: any) => setSettings({ ...settings, risk_tolerance: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="conservative">Conservative</SelectItem>
            <SelectItem value="moderate">Moderate</SelectItem>
            <SelectItem value="aggressive">Aggressive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Allowed Symbols */}
      <div>
        <Label>Allowed Symbols</Label>
        <div className="flex gap-2 mt-2">
          <Input
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
            onKeyPress={(e) => e.key === "Enter" && addSymbol()}
            placeholder="AAPL, TSLA, etc."
          />
          <Button onClick={addSymbol}>Add</Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {settings.allowed_symbols.map((symbol) => (
            <div
              key={symbol}
              className="bg-primary/10 text-primary px-3 py-1 rounded-md flex items-center gap-2"
            >
              {symbol}
              <button
                onClick={() => removeSymbol(symbol)}
                className="text-primary hover:text-primary/80"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Leave empty to allow all symbols
        </p>
      </div>

      <Button onClick={saveSettings} disabled={loading} className="w-full">
        <Save className="w-4 h-4 mr-2" />
        Save Settings
      </Button>

      <div className="p-4 bg-warning/10 rounded-lg border border-warning/20">
        <p className="text-sm text-warning">
          <strong>Important:</strong> Auto-trading involves significant risk. The bot will execute
          trades based on AI recommendations. Always monitor your account and ensure you have proper
          risk management in place.
        </p>
      </div>
    </div>
  );
};

export default AutoTradingSettings;