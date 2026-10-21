import { useMemo } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bookImbalance } from "@/lib/marketData/book";
import { fmtVol } from "./layers";
import type { OrderFlowRecorder } from "./recorder";
import { orderFlowStatus } from "./status";
import { useRecorderTick } from "./useOrderFlow";

interface Props {
  rec: OrderFlowRecorder | null;
  height: number;
  onClose: () => void;
}

const ROWS_PER_SIDE = 14;

/** Depth ladder: resting orders at each price, plus what traded there this session. */
export function DomLadder({ rec, height, onClose }: Props) {
  useRecorderTick(rec);
  const book = rec?.latestBook ?? null;
  const status = orderFlowStatus(rec);

  const rows = useMemo(() => {
    if (!book) return [];
    const asks = book.asks.slice(0, ROWS_PER_SIDE).reverse().map((l) => ({ price: l.price, bid: 0, ask: l.size }));
    const bids = book.bids.slice(0, ROWS_PER_SIDE).map((l) => ({ price: l.price, bid: l.size, ask: 0 }));
    return [...asks, ...bids];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- book object changes on every update
  }, [book, rec?.version]);

  const maxSize = Math.max(1, ...rows.map((r) => Math.max(r.bid, r.ask)));
  const traded = rows.map((r) => rec?.prints.volumeAt(r.price) ?? { buy: 0, sell: 0 });
  const maxTraded = Math.max(1, ...traded.map((t) => Math.max(t.buy, t.sell)));
  const imb = bookImbalance(book);
  const bestBid = book?.bids[0]?.price;
  const bestAsk = book?.asks[0]?.price;
  const last = rec?.lastPrice ?? null;
  const totals = rec?.prints.totals ?? { buy: 0, sell: 0, unknown: 0 };
  const buyPct = totals.buy + totals.sell > 0 ? Math.round((totals.buy / (totals.buy + totals.sell)) * 100) : null;

  return (
    <div className="flex flex-col border-t md:border-t-0 md:border-l bg-background text-xs w-full md:w-72 shrink-0" style={{ height }} data-testid="dom-ladder">
      <div className="flex items-center justify-between px-2 py-1.5 border-b">
        <span className="font-semibold">Depth{rec ? ` · ${rec.symbol}` : ""}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose} aria-label="Hide depth ladder">
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      {book && imb !== null && (
        <div className="px-2 py-1.5 border-b space-y-1" title="Size waiting to buy vs. to sell, nearest 5 prices on each side">
          <div className="flex justify-between text-[11px]">
            <span className="text-emerald-500">Waiting to buy {Math.round(((imb + 1) / 2) * 100)}%</span>
            <span className="text-red-500">{Math.round(((1 - imb) / 2) * 100)}% to sell</span>
          </div>
          <div className="h-1.5 rounded bg-red-500/60 overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${((imb + 1) / 2) * 100}%` }} />
          </div>
          {bestBid !== undefined && bestAsk !== undefined && (
            <div className="text-[11px] text-muted-foreground">Spread {(bestAsk - bestBid).toFixed(bestAsk < 1 ? 4 : 2)}</div>
          )}
        </div>
      )}

      {rows.length > 0 ? (
        <div className="flex-1 overflow-y-auto font-mono" data-testid="dom-rows">
          <div className="grid grid-cols-[1fr_1fr_auto_1fr_1fr] gap-x-1 px-2 py-1 text-[10px] text-muted-foreground sticky top-0 bg-background border-b">
            <span title="Sold here this session">Sold</span>
            <span className="text-right">Bid</span>
            <span className="text-center">Price</span>
            <span>Ask</span>
            <span className="text-right" title="Bought here this session">Bought</span>
          </div>
          {rows.map((r, i) => {
            const t = traded[i];
            const isLast = last !== null && Math.abs(r.price - last) < 1e-6;
            return (
              <div
                key={`${r.price}-${i}`}
                className={`grid grid-cols-[1fr_1fr_auto_1fr_1fr] gap-x-1 px-2 leading-5 ${i === ROWS_PER_SIDE - 1 && r.ask ? "border-b border-dashed" : ""}`}
              >
                <Cell value={t.sell} max={maxTraded} color="rgba(239,83,80,0.25)" align="left" />
                <Cell value={r.bid} max={maxSize} color="rgba(38,166,154,0.35)" align="right" bold />
                <span className={`text-center px-1 ${isLast ? "bg-amber-400/30 rounded" : ""}`}>{r.price.toFixed(r.price < 1 ? 4 : 2)}</span>
                <Cell value={r.ask} max={maxSize} color="rgba(239,83,80,0.35)" align="left" bold />
                <Cell value={t.buy} max={maxTraded} color="rgba(38,166,154,0.25)" align="right" />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 p-3 text-muted-foreground">No Level 2 book yet.</div>
      )}

      <div className="border-t px-2 py-1.5 space-y-1">
        {buyPct !== null && (
          <div className="text-[11px]">
            Since recording: <span className="text-emerald-500">{fmtVol(totals.buy)} bought</span> ·{" "}
            <span className="text-red-500">{fmtVol(totals.sell)} sold</span> ({buyPct}% buys)
          </div>
        )}
        <div className={`text-[11px] leading-snug ${status.tone === "warn" ? "text-amber-500" : status.tone === "ok" ? "text-emerald-500" : "text-muted-foreground"}`} data-testid="of-status">
          {status.text}
        </div>
      </div>
    </div>
  );
}

function Cell({ value, max, color, align, bold }: { value: number; max: number; color: string; align: "left" | "right"; bold?: boolean }) {
  if (!value) return <span />;
  const w = `${Math.max(4, (value / max) * 100)}%`;
  return (
    <span className="relative block">
      <span className="absolute inset-y-0.5 rounded-sm" style={{ width: w, background: color, [align === "right" ? "right" : "left"]: 0 }} />
      <span className={`relative block ${align === "right" ? "text-right" : "text-left"} ${bold ? "font-semibold" : ""}`}>{fmtVol(value)}</span>
    </span>
  );
}
