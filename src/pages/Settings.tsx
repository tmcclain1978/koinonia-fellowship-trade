import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, CheckCircle2, AlertCircle, Link as LinkIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import AutoTradingSettings from "@/components/AutoTradingSettings";
import Navigation from "@/components/Navigation";

const Settings = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [hasRefreshToken, setHasRefreshToken] = useState(false);
  const [brokerType, setBrokerType] = useState("schwab");
  const [credentials, setCredentials] = useState({
    schwab_client_id: "",
    schwab_client_secret: "",
    td_client_id: "",
    td_client_secret: "",
    etrade_consumer_key: "",
    etrade_consumer_secret: "",
    alpaca_api_key: "",
    alpaca_secret_key: "",
    alpaca_paper_mode: true,
    trading_mode: "paper",
  });

  useEffect(() => {
    checkAuth();
    fetchCredentials();
  }, []);

  useEffect(() => {
    // Check for OAuth callback status
    const oauthStatus = searchParams.get('oauth');
    if (oauthStatus === 'success') {
      toast({
        title: "OAuth Success",
        description: "Schwab account connected successfully!",
      });
      // Clear the query params and refresh credentials
      setSearchParams({});
      fetchCredentials();
    } else if (oauthStatus === 'error') {
      const message = searchParams.get('message') || 'OAuth failed';
      toast({
        title: "OAuth Error",
        description: message,
        variant: "destructive",
      });
      setSearchParams({});
    }
  }, [searchParams]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
  };

  const fetchCredentials = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      // Use the encryption edge function to load credentials
      const { data, error } = await supabase.functions.invoke("encrypt-credentials", {
        body: { operation: "load" },
      });

      if (error) {
        console.error("Error loading credentials:", error);
        toast({
          title: "Error",
          description: "Failed to load credentials",
          variant: "destructive",
        });
        return;
      }

      if (data?.credentials) {
        setBrokerType(data.credentials.broker_type || "schwab");
        setHasRefreshToken(!!data.credentials.schwab_refresh_token);
        setCredentials({
          schwab_client_id: data.credentials.schwab_client_id || "",
          schwab_client_secret: data.credentials.schwab_client_secret || "",
          td_client_id: data.credentials.td_client_id || "",
          td_client_secret: data.credentials.td_client_secret || "",
          etrade_consumer_key: data.credentials.etrade_consumer_key || "",
          etrade_consumer_secret: data.credentials.etrade_consumer_secret || "",
          alpaca_api_key: data.credentials.alpaca_api_key || "",
          alpaca_secret_key: data.credentials.alpaca_secret_key || "",
          alpaca_paper_mode: data.credentials.alpaca_paper_mode ?? true,
          trading_mode: data.credentials.trading_mode || "paper",
        });
      }
    } catch (error) {
      console.error("Error fetching credentials:", error);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      // Use the encryption edge function to save credentials
      const { data, error } = await supabase.functions.invoke("encrypt-credentials", {
        body: {
          operation: "save",
          credentials: {
            broker_type: brokerType,
            schwab_client_id: credentials.schwab_client_id,
            schwab_client_secret: credentials.schwab_client_secret,
            td_client_id: credentials.td_client_id,
            td_client_secret: credentials.td_client_secret,
            etrade_consumer_key: credentials.etrade_consumer_key,
            etrade_consumer_secret: credentials.etrade_consumer_secret,
            alpaca_api_key: credentials.alpaca_api_key,
            alpaca_secret_key: credentials.alpaca_secret_key,
            alpaca_paper_mode: credentials.alpaca_paper_mode,
            trading_mode: credentials.trading_mode,
          },
        },
      });

      if (error) {
        toast({
          title: "Error",
          description: "Failed to save credentials",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: "Credentials encrypted and saved successfully",
        });
      }
    } catch (error) {
      console.error("Error saving credentials:", error);
      toast({
        title: "Error",
        description: "Failed to save credentials",
        variant: "destructive",
      });
    }
    
    setLoading(false);
  };

  const handleSchwabOAuth = async () => {
    if (!credentials.schwab_client_id || !credentials.schwab_client_secret) {
      toast({
        title: "Missing Credentials",
        description: "Please save your Schwab Client ID and Secret first",
        variant: "destructive",
      });
      return;
    }

    setOauthLoading(true);
    try {
      console.log('Starting Schwab OAuth flow...');
      const { data, error } = await supabase.functions.invoke('schwab-oauth-init');

      console.log('OAuth init response:', { data, error });

      if (error) {
        console.error('OAuth init error:', error);
        throw error;
      }

      if (data?.authUrl) {
        console.log('Redirecting to:', data.authUrl);
        // Redirect to Schwab OAuth page
        window.location.href = data.authUrl;
      } else {
        throw new Error('No authorization URL received');
      }
    } catch (error: any) {
      console.error('OAuth init caught error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to start OAuth flow",
        variant: "destructive",
      });
      setOauthLoading(false);
    }
  };

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-background pt-16">
        <div className="container mx-auto p-6 max-w-2xl">
        <Button
          variant="ghost"
          onClick={() => navigate("/dashboard")}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Brokerage Selection</CardTitle>
              <CardDescription>
                Choose your preferred brokerage for trading
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="broker-type">Select Broker</Label>
                <select
                  id="broker-type"
                  value={brokerType}
                  onChange={(e) => setBrokerType(e.target.value)}
                  className="w-full px-4 py-2 bg-input border border-border rounded-lg text-foreground"
                >
                  <option value="schwab">Charles Schwab</option>
                  <option value="td_ameritrade">TD Ameritrade</option>
                  <option value="etrade">E*TRADE</option>
                  <option value="interactive_brokers">Interactive Brokers</option>
                  <option value="alpaca">Alpaca</option>
                </select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Trading Mode</CardTitle>
              <CardDescription>
                Choose between paper trading (simulated) or live trading (real money)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="trading-mode">Trading Mode</Label>
                <select
                  id="trading-mode"
                  value={credentials.trading_mode}
                  onChange={(e) =>
                    setCredentials({ ...credentials, trading_mode: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-input border border-border rounded-lg text-foreground"
                >
                  <option value="paper">Paper Trading (Simulated)</option>
                  <option value="live">Live Trading (Real Money)</option>
                </select>
                <p className="text-sm text-muted-foreground">
                  {credentials.trading_mode === "paper" 
                    ? "Paper trading mode: All orders are simulated with virtual money"
                    : "⚠️ Live trading mode: Real orders will be placed with your broker account"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{brokerType === "schwab" ? "Schwab" : brokerType === "td_ameritrade" ? "TD Ameritrade" : brokerType === "etrade" ? "E*TRADE" : brokerType === "alpaca" ? "Alpaca" : "Interactive Brokers"} API Settings</CardTitle>
              <CardDescription>
                Configure your broker API credentials
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {brokerType === "schwab" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="schwab-client-id">Schwab Client ID</Label>
                    <Input
                      id="schwab-client-id"
                      type="text"
                      value={credentials.schwab_client_id}
                      onChange={(e) =>
                        setCredentials({ ...credentials, schwab_client_id: e.target.value })
                      }
                      placeholder="Enter your Schwab Client ID"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="schwab-client-secret">Schwab Client Secret</Label>
                    <Input
                      id="schwab-client-secret"
                      type="password"
                      value={credentials.schwab_client_secret}
                      onChange={(e) =>
                        setCredentials({ ...credentials, schwab_client_secret: e.target.value })
                      }
                      placeholder="Enter your Schwab Client Secret"
                    />
                  </div>

                  <Alert>
                    <AlertDescription className="flex items-start gap-2">
                      {hasRefreshToken ? (
                        <>
                          <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium">OAuth Connected</p>
                            <p className="text-sm text-muted-foreground">Your Schwab account is authorized and ready for trading.</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium">OAuth Setup Required</p>
                            <div className="text-sm text-muted-foreground space-y-2 mb-3">
                              <p><strong>Before connecting</strong>, register this callback URL in your Schwab Developer Portal:</p>
                              <code className="block bg-muted p-2 rounded text-xs break-all">
                                https://cxsfpxsbejzpukrdrulu.supabase.co/functions/v1/schwab-oauth-callback
                              </code>
                              <p className="mt-2">Then click the button below to authorize trading with your Schwab account.</p>
                            </div>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={handleSchwabOAuth}
                              disabled={oauthLoading}
                            >
                              <LinkIcon className="mr-2 h-4 w-4" />
                              {oauthLoading ? "Connecting..." : "Connect Schwab Account"}
                            </Button>
                          </div>
                        </>
                      )}
                    </AlertDescription>
                  </Alert>
                </>
              )}

              {brokerType === "td_ameritrade" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="td-client-id">TD Ameritrade Client ID</Label>
                    <Input
                      id="td-client-id"
                      type="text"
                      value={credentials.td_client_id}
                      onChange={(e) =>
                        setCredentials({ ...credentials, td_client_id: e.target.value })
                      }
                      placeholder="Enter your TD Ameritrade Client ID"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="td-client-secret">TD Ameritrade Client Secret</Label>
                    <Input
                      id="td-client-secret"
                      type="password"
                      value={credentials.td_client_secret}
                      onChange={(e) =>
                        setCredentials({ ...credentials, td_client_secret: e.target.value })
                      }
                      placeholder="Enter your TD Ameritrade Client Secret"
                    />
                  </div>
                </>
              )}

              {brokerType === "etrade" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="etrade-key">E*TRADE Consumer Key</Label>
                    <Input
                      id="etrade-key"
                      type="text"
                      value={credentials.etrade_consumer_key}
                      onChange={(e) =>
                        setCredentials({ ...credentials, etrade_consumer_key: e.target.value })
                      }
                      placeholder="Enter your E*TRADE Consumer Key"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="etrade-secret">E*TRADE Consumer Secret</Label>
                    <Input
                      id="etrade-secret"
                      type="password"
                      value={credentials.etrade_consumer_secret}
                      onChange={(e) =>
                        setCredentials({ ...credentials, etrade_consumer_secret: e.target.value })
                      }
                      placeholder="Enter your E*TRADE Consumer Secret"
                    />
                  </div>
                </>
              )}

              {brokerType === "alpaca" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="alpaca-key">Alpaca API Key</Label>
                    <Input
                      id="alpaca-key"
                      type="text"
                      value={credentials.alpaca_api_key}
                      onChange={(e) =>
                        setCredentials({ ...credentials, alpaca_api_key: e.target.value })
                      }
                      placeholder="Enter your Alpaca API Key"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="alpaca-secret">Alpaca Secret Key</Label>
                    <Input
                      id="alpaca-secret"
                      type="password"
                      value={credentials.alpaca_secret_key}
                      onChange={(e) =>
                        setCredentials({ ...credentials, alpaca_secret_key: e.target.value })
                      }
                      placeholder="Enter your Alpaca Secret Key"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="alpaca-paper"
                      checked={credentials.alpaca_paper_mode}
                      onChange={(e) =>
                        setCredentials({ ...credentials, alpaca_paper_mode: e.target.checked })
                      }
                      className="w-4 h-4"
                    />
                    <Label htmlFor="alpaca-paper">Use Paper Trading Mode</Label>
                  </div>
                </>
              )}

              {brokerType === "interactive_brokers" && (
                <div className="text-sm text-muted-foreground p-4 bg-muted rounded-lg">
                  <p>Interactive Brokers integration coming soon. Please use another broker in the meantime.</p>
                </div>
              )}

              <Button
                onClick={handleSave}
                disabled={loading}
                className="w-full"
              >
                <Save className="mr-2 h-4 w-4" />
                Save Credentials
              </Button>
            </CardContent>
          </Card>

        <AutoTradingSettings />
        </div>
      </div>
      </div>
    </>
  );
};

export default Settings;