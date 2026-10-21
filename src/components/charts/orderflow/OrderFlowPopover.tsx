import { useState } from "react";
import { AlertTriangle, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { setOrderFlowPrefs, type OrderFlowPrefs } from "../state/chartPrefs";
import { orderFlowStatus } from "./status";
import type { OrderFlowRecorder } from "./recorder";
import { orderFlowWanted, useRecorderTick } from "./useOrderFlow";

const VIEWS: Array<[keyof Omit<OrderFlowPrefs, "bigPrint">, string, string]> = [
  ["heatmap", "Liquidity heatmap", "Where buy and sell orders are waiting, over time. Brighter = more shares waiting at that price. Drawn behind the candles."],
  ["bubbles", "Big trades", "A circle for each large trade: green = buyers paid the asking price, red = sellers hit the bid. Bigger circle = more shares."],
  ["footprint", "Footprint", "Inside each bar: shares sold (left) and bought (right) at every price. Zoom in on the chart (scroll or pinch) until the numbers appear. The yellow box is the busiest price."],
  ["delta", "Delta pane", "Bars under the chart: shares bought minus shares sold in each bar. Green = buyers were more aggressive."],
  ["cvd", "Cumulative delta pane", "A line that adds up delta over time. Rising = buyers in control; price rising while this falls is a warning sign."],
  ["dom", "Depth ladder", "The live order book beside the chart, with what has traded at each price."],
];

interface Props {
  prefs: OrderFlowPrefs;
  rec: OrderFlowRecorder | null;
  replay: boolean;
}

export function OrderFlowPopover({ prefs, rec, replay }: Props) {
  useRecorderTick(rec);
  const on = orderFlowWanted(prefs);
  const status = orderFlowStatus(rec);
  const [big, setBig] = useState(prefs.bigPrint ? String(prefs.bigPrint) : "");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={on ? "default" : "outline"} size="sm" className="gap-2" data-testid="orderflow-button">
          <Waves className="w-4 h-4" />
          <span className="text-xs">Order flow</span>
          {on && status.tone === "warn" && <AlertTriangle className="w-3 h-3 text-amber-400" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-4 max-h-[600px] overflow-y-auto" align="start">
        <div className="space-y-4 text-sm">
          <div>
            <div className="font-semibold">Order flow</div>
            <p className="text-xs text-muted-foreground mt-1">
              Built live from your Schwab Level 2 and trade stream. Schwab doesn't provide past order book data, so it starts recording when you turn it on. Works best on 1 to 5 minute charts.
            </p>
          </div>

          {replay && <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-amber-500 text-xs">Order flow is live only, so it's hidden during replay.</div>}

          {on && (
            <div
              className={`flex gap-2 rounded border p-2 text-xs ${status.tone === "warn" ? "border-amber-500/40 bg-amber-500/10 text-amber-500" : status.tone === "ok" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600" : "border-border text-muted-foreground"}`}
              data-testid="of-popover-status"
            >
              {status.tone === "warn" && <AlertTriangle className="h-4 w-4 shrink-0" />}
              <span>{status.text}</span>
            </div>
          )}

          <div className="space-y-3">
            {VIEWS.map(([key, label, hint]) => (
              <div key={key} className="flex items-start justify-between gap-3">
                <Label htmlFor={`of-${key}`} className="text-xs leading-snug">
                  {label}
                  <span className="block text-[11px] text-muted-foreground font-normal">{hint}</span>
                </Label>
                <Switch id={`of-${key}`} checked={prefs[key]} onCheckedChange={(v) => setOrderFlowPrefs({ [key]: v })} data-testid={`of-toggle-${key}`} />
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <Label htmlFor="of-big" className="text-xs">Big trade size (shares)</Label>
            <Input
              id="of-big"
              className="h-8 text-xs"
              inputMode="numeric"
              placeholder="Automatic (largest 2% of trades)"
              value={big}
              onChange={(e) => setBig(e.target.value.replace(/[^\d]/g, ""))}
              onBlur={() => setOrderFlowPrefs({ bigPrint: Number(big) || 0 })}
            />
          </div>

          <p className="text-[11px] text-muted-foreground">
            How buys and sells are told apart: a trade at or above the asking price counts as bought, at or below the bid as sold. Schwab sends trades in small bundles (about every half second), so each bundle is one "trade" here. Right after the stream reconnects, the catch-up volume is counted but not as a buy or sell.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
