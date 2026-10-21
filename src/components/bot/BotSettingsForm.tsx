import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_SYMBOLS } from "../../../supabase/functions/_shared/bot/engine";
import type { BotSettingsRow } from "./useBot";

type NumKey = "risk_per_trade_pct" | "max_position_size" | "max_open_positions" | "max_daily_trades" | "max_daily_loss" | "reward_risk" | "paper_capital" | "slippage_bps";

const FIELDS: Array<{ key: NumKey; label: string; hint: string; min: number; max: number; step: number; paperOnly?: boolean }> = [
  { key: "risk_per_trade_pct", label: "Risk per trade (% of account)", hint: "How much you lose if the stop is hit. 0.5% of $25,000 = $125.", min: 0.1, max: 5, step: 0.1 },
  { key: "max_position_size", label: "Max position ($)", hint: "Never put more than this into one stock.", min: 100, max: 1_000_000, step: 100 },
  { key: "max_open_positions", label: "Max open trades", hint: "At the same time.", min: 1, max: 20, step: 1 },
  { key: "max_daily_trades", label: "Max trades per day", hint: "New buys per day.", min: 1, max: 50, step: 1 },
  { key: "max_daily_loss", label: "Daily loss limit ($)", hint: "No new trades once today's loss reaches this.", min: 10, max: 100_000, step: 10 },
  { key: "reward_risk", label: "Profit target (× risk)", hint: "2 = aim to make twice what you risk.", min: 0.5, max: 10, step: 0.5 },
  { key: "paper_capital", label: "Paper account size ($)", hint: "Starting money for paper trading.", min: 1000, max: 10_000_000, step: 1000, paperOnly: true },
  { key: "slippage_bps", label: "Paper slippage (basis points)", hint: "Paper fills are made this much worse (2 = 0.02%), to stay realistic.", min: 0, max: 100, step: 1, paperOnly: true },
];

export function BotSettingsForm({ settings, onSave }: { settings: BotSettingsRow; onSave: (p: Partial<BotSettingsRow>) => Promise<boolean> }) {
  const [vals, setVals] = useState<Record<NumKey, string>>(() => Object.fromEntries(FIELDS.map((f) => [f.key, String(settings[f.key] ?? "")])) as Record<NumKey, string>);
  const [symbols, setSymbols] = useState((settings.allowed_symbols ?? []).join(", "));
  const [ai, setAi] = useState(settings.ai_confirm !== false);
  const [be, setBe] = useState(settings.breakeven_at_1r !== false);
  const [pdt, setPdt] = useState(settings.pdt_guard !== false);
  const [mail, setMail] = useState(settings.notify_email !== false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    setVals(Object.fromEntries(FIELDS.map((f) => [f.key, String(settings[f.key] ?? "")])) as Record<NumKey, string>);
    setSymbols((settings.allowed_symbols ?? []).join(", "));
    setAi(settings.ai_confirm !== false);
    setBe(settings.breakeven_at_1r !== false);
    setPdt(settings.pdt_guard !== false);
    setMail(settings.notify_email !== false);
    // Only when the row itself changes (e.g. after a save), not on every status refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.updated_at]);

  const submit = async () => {
    const errs: string[] = [];
    const patch: Partial<BotSettingsRow> = {};
    for (const f of FIELDS) {
      const v = Number(vals[f.key]);
      if (!Number.isFinite(v) || v < f.min || v > f.max) errs.push(`${f.label}: between ${f.min} and ${f.max}`);
      else (patch as Record<string, number>)[f.key] = f.step >= 1 ? Math.round(v) : v;
    }
    const list = symbols.split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    const badSym = list.filter((s) => !/^[A-Z.]{1,6}$/.test(s));
    if (badSym.length) errs.push(`Not valid symbols: ${badSym.join(", ")}`);
    if (list.length > 30) errs.push("At most 30 symbols");
    setErrors(errs);
    if (errs.length) return;
    setSaving(true);
    await onSave({ ...patch, allowed_symbols: list.length ? Array.from(new Set(list)) : null, ai_confirm: ai, breakeven_at_1r: be, pdt_guard: pdt, notify_email: mail });
    setSaving(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Settings2 className="w-5 h-5" /> Settings</CardTitle>
        <CardDescription>The same settings apply to paper and live. Changes take effect on the next minute.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="bot-symbols" className="text-xs">Stocks to watch (blank = {DEFAULT_SYMBOLS.length} large, liquid names)</Label>
          <Input id="bot-symbols" value={symbols} onChange={(e) => setSymbols(e.target.value)} placeholder={DEFAULT_SYMBOLS.join(", ")} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label htmlFor={`bot-${f.key}`} className="text-xs">{f.label}</Label>
              <Input id={`bot-${f.key}`} inputMode="decimal" value={vals[f.key]} onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))} />
              <p className="text-[11px] text-muted-foreground">{f.hint}</p>
            </div>
          ))}
        </div>
        <div className="space-y-3 rounded border p-3">
          <Toggle id="bot-ai" label="AI double-check" hint="The AI looks at each setup and can say skip. It can never pick stocks, prices or share counts. If the AI is down, the trade is skipped." checked={ai} onChange={setAi} />
          <Toggle id="bot-be" label="Move stop to break-even at +1R" hint="Once a trade is up as much as it risked, the stop moves to the entry price." checked={be} onChange={setBe} />
          <Toggle id="bot-mail" label="Email me" hint="Every buy and sell, and problems with live trading. You always get them in the bell too." checked={mail} onChange={setMail} />
          <Toggle id="bot-pdt" label="Pattern-day-trader guard" hint="Under $25,000, stop after 3 day trades in 5 days (the 4th would flag the account)." checked={pdt} onChange={setPdt} />
        </div>
        {errors.length > 0 && <ul className="text-xs text-red-500 list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        <Button onClick={() => void submit()} disabled={saving} data-testid="bot-save">Save settings</Button>
      </CardContent>
    </Card>
  );
}

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <Label htmlFor={id} className="text-sm leading-snug">
        {label}
        <span className="block text-[11px] text-muted-foreground font-normal">{hint}</span>
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
