import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, XCircle, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { BotSettingsRow, RobinhoodStatus } from "./useBot";

interface CheckResult {
  ok: boolean;
  problems?: string[];
  warnings?: string[];
  steps?: Array<{ step: string; ok: boolean; detail?: unknown }>;
}

const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "never");

export function RobinhoodLiveCard({ settings, robinhood, onSave, onReload }: {
  settings: BotSettingsRow;
  robinhood: RobinhoodStatus;
  onSave: (p: Partial<BotSettingsRow>) => Promise<boolean>;
  onReload: () => void;
}) {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [account, setAccount] = useState(robinhood.check?.account ?? "");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const live = settings.bot_mode === "live";
  const [modeError, setModeError] = useState<string | null>(null);
  // Switching modes goes through the server (bot-control), which re-checks everything.
  const setMode = async (action: "go_live" | "go_paper") => {
    setModeError(null);
    const { data, error } = await supabase.functions.invoke("bot-control", { body: action === "go_live" ? { action, confirm: "GO LIVE" } : { action } });
    const msg = error?.message ?? data?.error;
    if (msg) { setModeError(msg); return false; }
    await onSave({});
    onReload();
    return true;
  };
  const checkFresh = !!robinhood.check?.ok && !!robinhood.check.checkedAt && Date.now() - Date.parse(robinhood.check.checkedAt) < 7 * 86_400_000;

  const runCheck = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("robinhood-bot-check", { body: { action: "check" } });
      setResult(error ? { ok: false, problems: [error.message] } : data);
      onReload();
    } finally {
      setChecking(false);
    }
  };

  const saveAccount = async () => {
    await supabase.functions.invoke("robinhood-bot-check", { body: { action: "set_account", account: account.trim() || null } });
    onReload();
  };

  return (
    <Card className={live ? "border-red-500/60" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Zap className="w-5 h-5" /> Live trading (Robinhood)</CardTitle>
        <CardDescription>
          Live orders go to your Robinhood Agentic account through Robinhood's Trading MCP. Every order is checked with Robinhood's own order review first,
          and each buy gets a real stop-loss order at Robinhood, so it stays protected even if this app is down.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Status ok={robinhood.connected} label={robinhood.connected ? "Connected" : "Not connected"} />
          <Status ok={robinhood.trading} label={robinhood.trading ? "Trading allowed" : "Read-only"} />
          <Status ok={checkFresh} label={`Check: ${robinhood.check?.ok ? "passed" : robinhood.check?.checkedAt ? "failed" : "not run"} (${when(robinhood.check?.checkedAt)})`} />
        </div>
        {(!robinhood.connected || !robinhood.trading) && (
          <p className="text-xs">
            Connect Robinhood with <strong>trading allowed</strong> in{" "}
            <button className="underline" onClick={() => navigate("/settings")}>Settings</button>.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void runCheck()} disabled={checking || !robinhood.connected} data-testid="rh-check">
            {checking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
            Run Robinhood check (places nothing)
          </Button>
          {live ? (
            <Button variant="secondary" onClick={() => void setMode("go_paper")} data-testid="rh-disarm">Switch back to paper</Button>
          ) : (
            <Button variant="destructive" disabled={!checkFresh} onClick={() => setConfirmOpen(true)} data-testid="rh-arm">Go live…</Button>
          )}
        </div>

        {modeError && <p className="text-xs text-red-500" data-testid="rh-mode-error">{modeError}</p>}

        {result && (
          <div className="space-y-2 rounded border p-3 text-xs">
            <div className={result.ok ? "text-green-500 font-medium" : "text-red-500 font-medium"}>{result.ok ? "All checks passed. Nothing was placed." : "The check found problems:"}</div>
            {result.problems?.map((p) => <div key={p} className="flex gap-2 text-red-500"><XCircle className="w-3 h-3 mt-0.5 shrink-0" />{p}</div>)}
            {result.warnings?.map((p) => <div key={p} className="flex gap-2 text-amber-500"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{p}</div>)}
            {result.steps?.map((s) => <div key={s.step} className="flex gap-2">{s.ok ? <CheckCircle2 className="w-3 h-3 text-green-500 mt-0.5" /> : <XCircle className="w-3 h-3 text-red-500 mt-0.5" />}{s.step}</div>)}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs" htmlFor="rh-account">Agentic account number (only if Robinhood's tools ask for one)</label>
            <Input id="rh-account" className="w-56 h-8" value={account} onChange={(e) => setAccount(e.target.value)} placeholder="optional" />
          </div>
          <Button size="sm" variant="outline" onClick={() => void saveAccount()}>Save</Button>
        </div>

        <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
          <li>Turn <strong>Trade approvals off</strong> in the Agentic account's Agent Settings, or every bot order will wait for you in the app.</li>
          <li>Fund the Agentic account with only what you want the bot to use. Start small.</li>
          <li>Live trading needs real-time prices (your Schwab connection). On delayed data the bot won't open live trades.</li>
          <li>Paper-trade first. Compare a couple of weeks of paper results with the backtest before going live.</li>
        </ul>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive"><Zap className="w-5 h-5" /> Go live with real money</DialogTitle>
            <DialogDescription className="text-left space-y-2 pt-2">
              <span className="block">From the next minute, the bot will place real orders in your Robinhood Agentic account using your settings
                (risk {String(settings.risk_per_trade_pct)}% per trade, up to ${String(settings.max_position_size)} per position, {settings.max_open_positions} at a time, {settings.max_daily_trades} per day, stop after a ${String(settings.max_daily_loss)} loss).</span>
              <span className="block">Orders can't be undone once filled. You're responsible for the trades. You can switch back to paper or press "Close all" at any time.</span>
              <span className="block pt-1">Type <strong className="font-mono bg-muted px-1 rounded">GO LIVE</strong> to confirm:</span>
            </DialogDescription>
          </DialogHeader>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value.toUpperCase())} className="font-mono" placeholder="GO LIVE" />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setConfirmOpen(false); setConfirmText(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={confirmText !== "GO LIVE"}
              onClick={async () => {
                const ok = await setMode("go_live");
                setConfirmOpen(false);
                if (!ok) return;
                setConfirmText("");
              }}
            >
              Go live
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${ok ? "border-green-500/40 text-green-500" : "border-muted-foreground/30 text-muted-foreground"}`}>
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {label}
    </span>
  );
}
