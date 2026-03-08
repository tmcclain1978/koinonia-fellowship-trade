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

interface AutoTradingSettingsData {
  enabled: boolean;
  max_position_size: number;
  max_daily_trades: number;
  risk_tolerance: "conservative" | "moderate" | "aggressive";
  allowed_symbols: string[];
  max_daily_loss: number;
  max_weekly_loss: number;
  portfolio_stop_loss_percent: number;
  max_session_trades: number;
  min_confidence_threshold: number;
}

const AutoTradingSettings = () => {
  const { subscription } = useSubscription();
  const [settings, setSettings] = useState<AutoTradingSettingsData>({
    enabled: false,
    max_position_size: 100,
    max_daily_trades: 5,
    risk_tolerance: "moderate",
    allowed_symbols: [],
    max_daily_loss: 500,
    max_weekly_loss: 2000,
    portfolio_stop_loss_percent: 5,
    max_session_trades: 10,
    min_confidence_threshold: 50,
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
          enabled: data.enabled ?? false,
          max_position_size: data.max_position_size || 100,
          max_daily_trades: data.max_daily_trades || 5,
          risk_tolerance: (data.risk_tolerance as "conservative" | "moderate" | "aggressive") || "moderate",
          allowed_symbols: data.allowed_symbols || [],
          max_daily_loss: (data as any).max_daily_loss || 500,
          max_weekly_loss: (data as any).max_weekly_loss || 2000,
          portfolio_stop_loss_percent: (data as any).portfolio_stop_loss_percent || 5,
          max_session_trades: (data as any).max_session_trades || 10,
          min_confidence_threshold: (data as any).min_confidence_threshold || 50,
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
          max_daily_loss: settings.max_daily_loss,
          max_weekly_loss: settings.max_weekly_loss,
          portfolio_stop_loss_percent: settings.portfolio_stop_loss_percent,
          max_session_trades: settings.max_session_trades,
          min_confidence_threshold: settings.min_confidence_threshold,
        } as any, {
          onConflict: 'user_id'
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
          <h3 className="text-xl font-semibold text-foreground">Strategy Automation Settings</h3>
        </div>
        <p className="text-muted-foreground mb-4">
          Upgrade to Enterprise to access the automated strategy execution tool.
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
        <h3 className="text-xl font-semibold text-foreground">Strategy Automation Settings</h3>
      </div>

      {/* Enable/Disable */}
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="enabled">Enable Strategy Automation</Label>
          <p className="text-sm text-muted-foreground">
            Authorize the tool to transmit orders based on your configured strategy parameters
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
          Maximum orders the tool can transmit per day based on your strategy
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

      {/* Confidence Threshold */}
      <div>
        <Label htmlFor="confidence_threshold">Minimum Confidence Threshold: {settings.min_confidence_threshold}%</Label>
        <div className="flex items-center gap-4 mt-2">
          <span className="text-xs text-muted-foreground w-8">20%</span>
          <input
            type="range"
            id="confidence_threshold"
            min={20}
            max={95}
            step={5}
            value={settings.min_confidence_threshold}
            onChange={(e) =>
              setSettings({ ...settings, min_confidence_threshold: parseInt(e.target.value) })
            }
            className="flex-1 accent-primary"
          />
          <span className="text-xs text-muted-foreground w-8">95%</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          The bot will only execute trades when its composite analysis confidence meets or exceeds this threshold.
          Lower values = more trades but less selective. Higher values = fewer, higher-conviction trades.
        </p>
      </div>

      {/* Risk Limits Section */}
      <div className="border-t border-border pt-6 mt-6">
        <h4 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Bot className="w-5 h-5 text-destructive" />
          Risk Limits (Circuit Breakers)
        </h4>
        
        <div className="grid md:grid-cols-2 gap-4">
          {/* Max Daily Loss */}
          <div>
            <Label htmlFor="max_daily_loss">Max Daily Loss ($)</Label>
            <Input
              id="max_daily_loss"
              type="number"
              value={settings.max_daily_loss}
              onChange={(e) =>
                setSettings({ ...settings, max_daily_loss: parseFloat(e.target.value) || 0 })
              }
              placeholder="500"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Automation pauses if daily loss exceeds this user-defined limit
            </p>
          </div>

          {/* Max Weekly Loss */}
          <div>
            <Label htmlFor="max_weekly_loss">Max Weekly Loss ($)</Label>
            <Input
              id="max_weekly_loss"
              type="number"
              value={settings.max_weekly_loss}
              onChange={(e) =>
                setSettings({ ...settings, max_weekly_loss: parseFloat(e.target.value) || 0 })
              }
              placeholder="2000"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Automation pauses if weekly loss exceeds this user-defined limit
            </p>
          </div>

          {/* Portfolio Stop Loss */}
          <div>
            <Label htmlFor="portfolio_stop">Portfolio Stop Loss (%)</Label>
            <Input
              id="portfolio_stop"
              type="number"
              value={settings.portfolio_stop_loss_percent}
              onChange={(e) =>
                setSettings({ ...settings, portfolio_stop_loss_percent: parseFloat(e.target.value) || 0 })
              }
              placeholder="5"
            />
            <p className="text-xs text-muted-foreground mt-1">
              All automation stops if portfolio drops by this user-defined %
            </p>
          </div>

          {/* Max Session Trades */}
          <div>
            <Label htmlFor="max_session">Max Session Trades</Label>
            <Input
              id="max_session"
              type="number"
              value={settings.max_session_trades}
              onChange={(e) =>
                setSettings({ ...settings, max_session_trades: parseInt(e.target.value) || 0 })
              }
              placeholder="10"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Max trades per trading session
            </p>
          </div>
        </div>
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
          <strong>Important:</strong> By enabling automation, you authorize this tool to transmit orders to your 
          brokerage based on the strategy parameters you have configured. The platform does not provide investment 
          advice, determine trade suitability, or manage your portfolio. You remain solely responsible for all 
          trading decisions and outcomes. Always monitor your account.
        </p>
      </div>
    </div>
  );
};

export default AutoTradingSettings;