import { useCallback, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PoClient, type PoState, type WsLike } from "@/lib/pocketoption/poClient";

export interface Trade {
  asset: string;
  action: "call" | "put";
  amount: number;
  duration: number;
  /** Ignored: the account type always comes from your saved SSID. */
  isDemo?: number;
}

export interface ConnectionStatus {
  state: PoState;
  endpoint?: string;
  attempt?: number;
  totalAttempts?: number;
  errorMessage?: string;
}

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, "") ?? "";
const BRIDGE_URL = `${SUPABASE_URL.replace(/^http/, "ws")}/functions/v1/pocketoption-websocket`;

/** The one PocketOption connection, shared by every screen. */
export const poClient = new PoClient({
  url: BRIDGE_URL,
  getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
  createSocket: (url, protocols) => new WebSocket(url, protocols) as unknown as WsLike,
  notify: (kind, title, description) => (kind === "success" ? toast.success(title, { description }) : kind === "error" ? toast.error(title, { description }) : toast(title, { description })),
});

export const usePocketOptionWebSocket = () => {
  const s = useSyncExternalStore(poClient.subscribe, poClient.getSnapshot);
  const connect = useCallback(() => void poClient.connect(), []);
  const disconnect = useCallback(() => poClient.disconnect(), []);
  const executeTrade = useCallback((t: Trade) => poClient.trade({ asset: t.asset, action: t.action, amount: t.amount, duration: t.duration }), []);
  const subscribeToCandles = useCallback((asset: string, period = 60) => poClient.watch(asset, period), []);
  const changeBalanceMode = useCallback((_mode: "demo" | "real") => {
    toast.info("Switching accounts", { description: "Demo or real is set by the SSID you saved. Save the SSID from the other account in the Connection tab, then reconnect." });
  }, []);

  return {
    /** Connected to PocketOption (may still be logging in). */
    isConnected: s.state === "connected" || s.state === "authenticated",
    /** Logged in: prices flow and trades can be placed. */
    isReady: s.state === "authenticated",
    connectionStatus: { state: s.state, endpoint: s.endpoint, attempt: s.attempt, totalAttempts: s.totalAttempts, errorMessage: s.errorMessage } as ConnectionStatus,
    isDemo: s.isDemo,
    balance: s.balance,
    prices: s.prices,
    history: s.history,
    deals: s.deals,
    lastTickAt: s.lastTickAt,
    connect,
    disconnect,
    executeTrade,
    changeBalanceMode,
    subscribeToCandles,
  };
};
