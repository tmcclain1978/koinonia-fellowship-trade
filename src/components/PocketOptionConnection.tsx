import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

interface PocketOptionConnectionProps {
  onConnectionChange: (connected: boolean) => void;
  isConnected: boolean;
}

const PocketOptionConnection = ({ onConnectionChange, isConnected }: PocketOptionConnectionProps) => {
  const [apiKey, setApiKey] = useState("");
  const [ssid, setSsid] = useState("");
  const [loading, setLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const { toast } = useToast();

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

      if (data?.pocketoption_api_key && data?.pocketoption_ssid) {
        setApiKey("••••••••••••");
        setSsid("••••••••••••");
        onConnectionChange(true);
      }
    } catch (error) {
      console.error("Error loading credentials:", error);
    }
  };

  const testConnection = async () => {
    if (!apiKey || !ssid) {
      toast({
        title: "Missing credentials",
        description: "Please enter both API Key and SSID",
        variant: "destructive",
      });
      return;
    }

    setTestingConnection(true);
    try {
      // Test connection via edge function
      const { data, error } = await supabase.functions.invoke("test-pocketoption-connection", {
        body: { apiKey, ssid },
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Connection successful",
          description: "PocketOption API is connected",
        });
        onConnectionChange(true);
      } else {
        throw new Error(data.message || "Connection failed");
      }
    } catch (error: any) {
      toast({
        title: "Connection failed",
        description: error.message,
        variant: "destructive",
      });
      onConnectionChange(false);
    } finally {
      setTestingConnection(false);
    }
  };

  const saveCredentials = async () => {
    if (!apiKey || !ssid) {
      toast({
        title: "Missing credentials",
        description: "Please enter both API Key and SSID",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // Only update if not showing masked values
      if (apiKey !== "••••••••••••") {
        const { error } = await supabase
          .from("user_api_credentials")
          .upsert({
            user_id: session.user.id,
            pocketoption_api_key: apiKey,
            pocketoption_ssid: ssid,
          }, {
            onConflict: 'user_id'
          });

        if (error) throw error;

        toast({
          title: "Credentials saved",
          description: "Your PocketOption credentials have been saved securely",
        });

        // Test connection after saving
        await testConnection();
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>PocketOption Connection</CardTitle>
        <CardDescription>
          Connect your PocketOption account to enable automated trading
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You can find your API credentials in your PocketOption account settings.
            Never share these credentials with anyone.
          </AlertDescription>
        </Alert>

        {isConnected && (
          <Alert className="border-primary/50 bg-primary/10">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <AlertDescription className="text-primary">
              Connected to PocketOption
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your PocketOption API Key"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ssid">SSID (Session ID)</Label>
            <Input
              id="ssid"
              type="password"
              value={ssid}
              onChange={(e) => setSsid(e.target.value)}
              placeholder="Enter your PocketOption SSID"
            />
          </div>

          <div className="flex gap-3">
            <Button
              onClick={saveCredentials}
              disabled={loading || testingConnection}
              className="flex-1"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Credentials
            </Button>
            <Button
              onClick={testConnection}
              disabled={loading || testingConnection || !apiKey || !ssid}
              variant="outline"
            >
              {testingConnection && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Test Connection
            </Button>
          </div>
        </div>

        <div className="pt-4 border-t border-border">
          <h3 className="font-semibold mb-2">How to get your credentials:</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>Log in to your PocketOption account</li>
            <li>Navigate to Settings → API Settings</li>
            <li>Generate a new API Key if you don't have one</li>
            <li>Copy your API Key and SSID</li>
            <li>Paste them here and click "Save Credentials"</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
};

export default PocketOptionConnection;
