import { AlertTriangle, Ban } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { type ChartOrder, type PriceChangeCheck, decimalsFor, orderLabel } from "./chartOrders";

export type PendingTradeAction =
  | { type: "move"; order: ChartOrder; check: PriceChangeCheck }
  | { type: "cancel"; order: ChartOrder };

interface Props {
  action: PendingTradeAction | null;
  busy: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

const fmt = (p: number | null) => (p === null ? "—" : `$${p.toFixed(decimalsFor(p))}`);

/** Every order change from the chart goes through this dialog. */
export function TradeConfirmDialog({ action, busy, onConfirm, onDismiss }: Props) {
  const order = action?.order;
  const live = order?.source === "schwab";
  const blockers = action?.type === "move" ? action.check.blockers : [];
  const warnings = action?.type === "move" ? action.check.warnings : [];

  return (
    <AlertDialog open={!!action} onOpenChange={(open) => !open && !busy && onDismiss()}>
      <AlertDialogContent>
        {order && action && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                {action.type === "move" ? "Change order price?" : "Cancel order?"}
                <Badge variant={live ? "destructive" : "secondary"}>{live ? `LIVE ${order.accountLabel ?? ""}` : "PAPER"}</Badge>
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm">
                  <div className="font-mono text-foreground">{orderLabel(order)}</div>
                  {action.type === "move" && (
                    <div className="grid grid-cols-2 gap-2 font-mono">
                      <div>
                        <div className="text-xs text-muted-foreground">Now</div>
                        <div className="text-foreground">{fmt(order.linePrice)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">New</div>
                        <div className="text-foreground font-bold">{fmt(action.check.price)}</div>
                      </div>
                      {order.kind === "STOP_LIMIT" && order.limitPrice !== null && order.stopPrice !== null && (
                        <div className="col-span-2 text-xs">
                          Limit moves with it: {fmt(order.limitPrice)} → {fmt(order.limitPrice + (action.check.price - order.stopPrice))}
                        </div>
                      )}
                    </div>
                  )}
                  {live && (
                    <p>
                      {action.type === "move"
                        ? "Schwab replaces the order: the current one is cancelled and a new one is created at the new price."
                        : "This sends a cancel request to Schwab."}{" "}
                      The order is re-checked right before sending; if it filled or changed, nothing is sent.
                    </p>
                  )}
                  {warnings.map((w) => (
                    <div key={w} className="flex gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-amber-500">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                  {blockers.map((b) => (
                    <div key={b} className="flex gap-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-destructive">
                      <Ban className="h-4 w-4 shrink-0" />
                      <span>{b}</span>
                    </div>
                  ))}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Keep as is</AlertDialogCancel>
              <AlertDialogAction
                disabled={busy || blockers.length > 0}
                className={live ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  onConfirm();
                }}
              >
                {busy ? "Sending…" : action.type === "move" ? `Move to ${fmt(action.check.price)}` : "Cancel order"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
