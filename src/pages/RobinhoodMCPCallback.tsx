import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function RobinhoodMCPCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const callbackUrl = useMemo(() => {
    const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    if (!base) return null;
    return `${base}/functions/v1/robinhood-mcp-callback${window.location.search}`;
  }, []);

  useEffect(() => {
    if (!callbackUrl) {
      setError("Backend callback URL is not configured.");
      return;
    }
    window.location.replace(callbackUrl);
  }, [callbackUrl]);

  return (
    <main className="min-h-screen flex items-center justify-center px-4 text-foreground">
      <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-6 shadow-lg">
        {error ? (
          <>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button onClick={() => navigate("/settings")} className="w-full">
              Back to Settings
            </Button>
          </>
        ) : (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            Finishing Robinhood connection…
          </div>
        )}
      </div>
    </main>
  );
}