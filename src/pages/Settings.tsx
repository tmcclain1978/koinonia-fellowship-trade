import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save } from "lucide-react";
import AutoTradingSettings from "@/components/AutoTradingSettings";
import Navigation from "@/components/Navigation";

const Settings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [credentials, setCredentials] = useState({
    schwab_client_id: "",
    schwab_client_secret: "",
    trading_mode: "paper",
  });

  useEffect(() => {
    checkAuth();
    fetchCredentials();
  }, []);

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
        setCredentials({
          schwab_client_id: data.credentials.schwab_client_id || "",
          schwab_client_secret: data.credentials.schwab_client_secret || "",
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
            schwab_client_id: credentials.schwab_client_id,
            schwab_client_secret: credentials.schwab_client_secret,
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
                    : "⚠️ Live trading mode: Real orders will be placed with your Schwab account"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>API Settings</CardTitle>
              <CardDescription>
                Configure your Schwab API credentials to fetch options data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="client-id">Schwab Client ID</Label>
              <Input
                id="client-id"
                type="text"
                value={credentials.schwab_client_id}
                onChange={(e) =>
                  setCredentials({ ...credentials, schwab_client_id: e.target.value })
                }
                placeholder="Enter your Schwab Client ID"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="client-secret">Schwab Client Secret</Label>
              <Input
                id="client-secret"
                type="password"
                value={credentials.schwab_client_secret}
                onChange={(e) =>
                  setCredentials({ ...credentials, schwab_client_secret: e.target.value })
                }
                placeholder="Enter your Schwab Client Secret"
              />
            </div>

            <Button
              onClick={handleSave}
              disabled={loading}
              className="w-full"
            >
              <Save className="mr-2 h-4 w-4" />
              Save Credentials
            </Button>

            <div className="text-sm text-muted-foreground mt-4">
              <p className="font-semibold mb-2">How to get your Schwab API credentials:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Log in to your Schwab Developer Portal</li>
                <li>Create or select your application</li>
                <li>Copy your Client ID and Client Secret</li>
                <li>Paste them here and save</li>
              </ol>
            </div>
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