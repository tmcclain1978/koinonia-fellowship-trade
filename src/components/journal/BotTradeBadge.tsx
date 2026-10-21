import { Bot } from "lucide-react";
import { botLabel, type MaybeBotEntry } from "@/lib/journal/botEntries";

/** "Bot · Paper" / "Bot · LIVE" label for entries the trading bot wrote. */
export function BotTradeBadge({ entry, className = "" }: { entry: MaybeBotEntry; className?: string }) {
  const l = botLabel(entry);
  if (!l) return null;
  return (
    <span
      data-testid="bot-badge"
      title="Recorded automatically by the trading bot"
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${l.live ? "bg-red-500/10 text-red-500 border-red-500/30" : "bg-sky-500/10 text-sky-500 border-sky-500/30"} ${className}`}
    >
      <Bot className="w-3 h-3" />
      {l.text}
    </span>
  );
}
