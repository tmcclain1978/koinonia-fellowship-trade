import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, AlertCircle, Wifi, WifiOff } from "lucide-react";
import { usePocketOptionWebSocket, ConnectionStatus } from "@/hooks/usePocketOptionWebSocket";

interface PocketOptionConnectionProps {
  onConnectionChange: (connected: boolean) => void;
  isConnected: boolean;
}

interface PoCheckResult {
  ok: boolean;
  summary: string;
  loggedIn?: boolean;
  isDemo?: 0 | 1 | null;
  balance?: number | null;
  ticks?: number;
  candles?: number;
  steps: Array<Record<string, unknown>>;
}

/** One line per step of the test, in plain words. */
function stepText(m: Record<string, unknown>): string {
  switch (m.type) {
    case "connection_attempt": return `Trying server ${m.attemptNumber} of ${m.totalEndpoints}: ${m.endpoint}`;
    case "connection": return m.status === "connected" ? `Reached ${m.endpoint}, logging in…` : String(m.message ?? "Disconnected");
    case "po_authenticated": return `Logged in (${m.isDemo ? "demo" : "REAL money"} account)`;
    case "po_balance": return `Balance: $${Number(m.balance).toFixed(2)}`;
    case "error": {
      const f = Array.isArray(m.failures) ? (m.failures as Array<{ host: string; why: string }>).map((x) => `${x.host}: ${x.why}`) : [];
      return `Stopped: ${m.message}${f.length > 3 ? ` All servers: ${f.join("; ")}` : ""}`;
    }
    default: return String(m.type);
  }
}

const PocketOptionConnection = ({ onConnectionChange, isConnected }: PocketOptionConnectionProps) => {
  const [ssid, setSsid] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<PoCheckResult | null>(null);

  /** Ask the server to log in to PocketOption and report every step. */
  const runCheck = async () => {
    setChecking(true);
    setCheck(null);
    try {
      const { data, error } = await supabase.functions.invoke("pocketoption-websocket", { body: { asset: "EURUSD_otc" } });
      if (error) throw error;
      setCheck(data as PoCheckResult);
    } catch (e) {
      setCheck({ ok: false, summary: `The test couldn't run: ${(e as Error).message}`, steps: [] });
    } finally {
      setChecking(false);
    }
  };
  const { toast } = useToast();
  
  const { 
    connectionStatus, 
    connect: wsConnect, 
    disconnect: wsDisconnect,
    isConnected: wsIsConnected 
  } = usePocketOptionWebSocket();

  // Sync connection state with parent
  useEffect(() => {
    onConnectionChange(wsIsConnected);
  }, [wsIsConnected, onConnectionChange]);

  useEffect(() => {
    loadCredentials();
  }, []);

  const loadCredentials = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from("user_api_credentials")
        .select("*")
        .eq("user_id", session.user.id)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      if (data?.pocketoption_ssid) {
        setSsid("••••••••••••");
        onConnectionChange(true);
      }
    } catch (error) {
      console.error("Error loading credentials:", error);
    }
  };

  const testConnection = async () => {
    if (!ssid || ssid === "••••••••••••") {
      // Use saved credentials - just connect via WebSocket
      wsConnect();
      return;
    }
    // A new SSID was typed: save it first (saving connects automatically).
    await saveCredentials();
  };

  const saveCredentials = async () => {
    const trimmedSsid = ssid.trim();
    
    if (!trimmedSsid) {
      toast({
        title: "Missing SSID",
        description: "Please enter your SSID",
        variant: "destructive",
      });
      return;
    }

    // Skip validation for masked values
    if (trimmedSsid !== "••••••••••••") {
      // Validate format before saving
      if (!trimmedSsid.startsWith('42["auth",') && !trimmedSsid.startsWith('42["user_init",')) {
        toast({
          title: "Invalid SSID format",
          description: "SSID must start with 42[\"auth\", or 42[\"user_init\",",
          variant: "destructive",
        });
        return;
      }

      // Try to parse the JSON structure
      try {
        const jsonPart = trimmedSsid.substring(2); // Remove '42' prefix
        JSON.parse(jsonPart);
      } catch {
        toast({
          title: "Invalid SSID format",
          description: "SSID contains invalid JSON structure",
          variant: "destructive",
        });
        return;
      }
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // Only update if not showing masked values
      if (trimmedSsid !== "••••••••••••") {
        const { error } = await supabase
          .from("user_api_credentials")
          .upsert({
            user_id: session.user.id,
            pocketoption_ssid: trimmedSsid,
          }, {
            onConflict: 'user_id'
          });

        if (error) throw error;

        toast({
          title: "Credentials saved",
          description: "Your PocketOption SSID has been saved. Connecting…",
        });

        // Saved: hide the value and connect with the saved SSID.
        setSsid("••••••••••••");
        wsConnect();
      } else {
        toast({
          title: "No changes",
          description: "Credentials already saved",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error saving credentials",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getConnectionBadge = () => {
    switch (connectionStatus.state) {
      case 'connecting':
        return (
          <Badge variant="outline" className="gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Connecting{connectionStatus.attempt ? ` (${connectionStatus.attempt}/${connectionStatus.totalAttempts})` : '...'}
          </Badge>
        );
      case 'connected':
        return (
          <Badge variant="outline" className="gap-1 border-yellow-500 text-yellow-600">
            <Wifi className="h-3 w-3" />
            Connected - Authenticating...
          </Badge>
        );
      case 'authenticated':
        return (
          <Badge variant="default" className="gap-1 bg-green-600">
            <Wifi className="h-3 w-3" />
            Authenticated
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive" className="gap-1">
            <WifiOff className="h-3 w-3" />
            Error
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="gap-1">
            <WifiOff className="h-3 w-3" />
            Disconnected
          </Badge>
        );
    }
  };

  const isTestingOrConnecting = connectionStatus.state === 'connecting' || connectionStatus.state === 'connected';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>PocketOption Connection</CardTitle>
            <CardDescription>
              Connect your PocketOption account to enable automated trading
            </CardDescription>
          </div>
          {getConnectionBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You need your PocketOption SSID to connect. Never share this with anyone.
            See instructions below for how to obtain it.
          </AlertDescription>
        </Alert>

        {connectionStatus.state === 'authenticated' && (
          <Alert className="border-green-500/50 bg-green-500/10">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700 dark:text-green-400">
              Connected and authenticated with PocketOption
              {connectionStatus.endpoint && ` via ${connectionStatus.endpoint}`}
            </AlertDescription>
          </Alert>
        )}

        {connectionStatus.state === 'error' && connectionStatus.errorMessage && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {connectionStatus.errorMessage}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ssid">SSID (Session ID)</Label>
            <Input
              id="ssid"
              type="password"
              value={ssid}
              onChange={(e) => setSsid(e.target.value)}
              placeholder="Paste your PocketOption SSID here"
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Format: 42["user_init",{"{"}...{"}"}] or 42["auth",{"{"}...{"}"}]
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={saveCredentials}
              disabled={loading || isTestingOrConnecting}
              className="flex-1"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Credentials
            </Button>
            {connectionStatus.state === 'authenticated' ? (
              <Button
                onClick={wsDisconnect}
                variant="outline"
              >
                Disconnect
              </Button>
            ) : (
              <Button
                onClick={testConnection}
                disabled={loading || isTestingOrConnecting || (!ssid && ssid !== "••••••••••••")}
                variant="outline"
              >
                {isTestingOrConnecting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isTestingOrConnecting ? 'Connecting...' : 'Connect'}
              </Button>
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-border space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Test connection</h3>
              <p className="text-xs text-muted-foreground">Logs in to PocketOption from the app's server and checks that prices and candles come in. Shows each step so you can see where it stops.</p>
            </div>
            <Button variant="outline" onClick={runCheck} disabled={checking}>
              {checking && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {checking ? "Testing… (up to 1 min)" : "Run test"}
            </Button>
          </div>
          {check && (
            <Alert variant={check.ok ? "default" : "destructive"}>
              {check.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              <AlertDescription>
                <p className="font-medium">{check.summary}</p>
                {check.steps.length > 0 && (
                  <ol className="mt-2 list-decimal list-inside space-y-1 text-xs">
                    {check.steps.map((m, i) => <li key={i}>{stepText(m)}</li>)}
                  </ol>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="pt-4 border-t border-border">
          <h3 className="font-semibold mb-2">How to get your SSID:</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>Log in to <a href="https://pocketoption.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">PocketOption.com</a></li>
            <li>Open your browser's Developer Tools (F12)</li>
            <li>Go to the Network tab</li>
            <li>Filter by "WS" (WebSocket)</li>
            <li>Look for a connection to socket.io</li>
            <li>Find a message starting with <code className="bg-muted px-1 rounded">42["user_init",</code> or <code className="bg-muted px-1 rounded">42["auth",</code></li>
            <li>Copy the entire message (example: <code className="bg-muted px-1 rounded">42["user_init",{"{"}"id":123,"secret":"..."{"}"}]</code>)</li>
            <li>Paste it here and click "Save Credentials"</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
};

export default PocketOptionConnection;
