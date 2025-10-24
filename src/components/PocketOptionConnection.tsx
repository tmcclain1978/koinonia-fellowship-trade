import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";

interface PocketOptionConnectionProps {
  onConnectionChange: (connected: boolean) => void;
  isConnected: boolean;
}

const PocketOptionConnection = ({ onConnectionChange, isConnected }: PocketOptionConnectionProps) => {
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

      if (data?.pocketoption_ssid) {
        setSsid("••••••••••••");
        onConnectionChange(true);
      }
    } catch (error) {
      console.error("Error loading credentials:", error);
    }
  };

  const testConnection = async () => {
    if (!ssid) {
      toast({
        title: "Missing SSID",
        description: "Please enter your SSID",
        variant: "destructive",
      });
      return;
    }

    setTestingConnection(true);
    try {
      // Test connection via edge function
      const { data, error } = await supabase.functions.invoke("test-pocketoption-connection", {
        body: { ssid },
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Connection successful",
          description: "PocketOption credentials are valid",
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
    if (!ssid) {
      toast({
        title: "Missing SSID",
        description: "Please enter your SSID",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // Only update if not showing masked values
      if (ssid !== "••••••••••••") {
        const { error } = await supabase
          .from("user_api_credentials")
          .upsert({
            user_id: session.user.id,
            pocketoption_ssid: ssid,
          }, {
            onConflict: 'user_id'
          });

        if (error) throw error;

        toast({
          title: "Credentials saved",
          description: "Your PocketOption SSID has been saved securely",
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
            You need your PocketOption SSID to connect. Never share this with anyone.
            See instructions below for how to obtain it.
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
              Format: 42["auth",{"{"}...{"}"}]
            </p>
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
              disabled={loading || testingConnection || !ssid}
              variant="outline"
            >
              {testingConnection && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Test Connection
            </Button>
          </div>
        </div>

        <div className="pt-4 border-t border-border">
          <h3 className="font-semibold mb-2">How to get your SSID:</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>Log in to <a href="https://pocketoption.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">PocketOption.com</a></li>
            <li>Open your browser's Developer Tools (F12)</li>
            <li>Go to the Network tab</li>
            <li>Filter by "WS" (WebSocket)</li>
            <li>Look for a connection to socket.io</li>
            <li>Find a message starting with <code className="bg-muted px-1 rounded">42["auth",</code></li>
            <li>Copy the entire message (it will look like: <code className="bg-muted px-1 rounded">42["auth",{"{"}"session":"..."{"}"}]</code>)</li>
            <li>Paste it here and click "Save Credentials"</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
};

export default PocketOptionConnection;
