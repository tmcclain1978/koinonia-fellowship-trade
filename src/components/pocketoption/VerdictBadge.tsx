import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type Verdict, VERDICT_TEXT } from "../../../supabase/functions/_shared/patterns/stats";

const CLS: Record<Verdict, string> = {
  edge: "bg-green-600 hover:bg-green-600 text-white",
  maybe: "bg-amber-500 hover:bg-amber-500 text-black",
  fading: "bg-orange-600 hover:bg-orange-600 text-white",
  none: "bg-muted text-muted-foreground hover:bg-muted",
  too_few: "bg-transparent text-muted-foreground border border-dashed hover:bg-transparent",
};

/** "Has an edge" / "Maybe" / ... with a plain explanation on hover. */
const VerdictBadge = ({ verdict }: { verdict: Verdict }) => (
  <TooltipProvider delayDuration={150}>
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Badge className={CLS[verdict]}>{VERDICT_TEXT[verdict].label}</Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{VERDICT_TEXT[verdict].plain}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

export default VerdictBadge;
