import { supabase } from "@/integrations/supabase/client";
import { schwabApi } from "@/lib/schwabApi";
import { SchwabFeed, type WebSocketLike } from "./schwabFeed";

export * from "./schwabFeed";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, "");
const STREAM_URL = SUPABASE_URL
  ? `${SUPABASE_URL.replace(/^http/, "ws")}/functions/v1/schwab-streaming`
  : "wss://cxsfpxsbejzpukrdrulu.supabase.co/functions/v1/schwab-streaming";

/** The one market-data feed for this browser tab. */
export const schwabFeed = new SchwabFeed({
  streamUrl: STREAM_URL,
  createSocket: (url, protocols) => new WebSocket(url, protocols) as unknown as WebSocketLike,
  getAccessToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
  fetchQuotes: (symbols) => schwabApi.getQuotes(symbols),
  log: (...args) => console.warn(...args),
});
