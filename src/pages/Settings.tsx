import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";

export default function Settings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schwabClientId, setSchwabClientId] = useState("");
  const [schwabClientSecret, setSchwabClientSecret] = useState("");
  const [schwabRefreshToken, setSchwabRefreshToken] = useState("");

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    await loadCredentials();
  };

  const loadCredentials = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("user_api_credentials")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSchwabClientId(data.schwab_client_id || "");
        setSchwabClientSecret(data.schwab_client_secret || "");
        setSchwabRefreshToken(data.schwab_refresh_token || "");
      }
    } catch (error) {
      console.error("Error loading credentials:", error);
      toast({
        title: "Error",
        description: "Failed to load your API credentials",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("user_api_credentials")
        .upsert({
          user_id: user.id,
          schwab_client_id: schwabClientId,
          schwab_client_secret: schwabClientSecret,
          schwab_refresh_token: schwabRefreshToken,
        }, {
          onConflict: "user_id"
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Your API credentials have been saved",
      });
    } catch (error) {
      console.error("Error saving credentials:", error);
      toast({
        title: "Error",
        description: "Failed to save your API credentials",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <Button variant="ghost" onClick={() => navigate("/dashboard")}>
            ← Back to Dashboard
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>API Settings</CardTitle>
            <CardDescription>
              Configure your Schwab API credentials to fetch live options data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="clientId">Schwab Client ID</Label>
              <Input
                id="clientId"
                type="text"
                value={schwabClientId}
                onChange={(e) => setSchwabClientId(e.target.value)}
                placeholder="Enter your Schwab Client ID"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="clientSecret">Schwab Client Secret</Label>
              <Input
                id="clientSecret"
                type="password"
                value={schwabClientSecret}
                onChange={(e) => setSchwabClientSecret(e.target.value)}
                placeholder="Enter your Schwab Client Secret"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="refreshToken">Schwab Refresh Token</Label>
              <Input
                id="refreshToken"
                type="password"
                value={schwabRefreshToken}
                onChange={(e) => setSchwabRefreshToken(e.target.value)}
                placeholder="Enter your Schwab Refresh Token"
              />
              <p className="text-sm text-muted-foreground">
                You can obtain your refresh token from the Schwab OAuth flow
              </p>
            </div>

            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Credentials
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
