import { useState } from "react";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "lucide-react";
import { PhroureoHelpModal } from "./PhroureoHelpModal";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PhroureoHelpButtonProps {
  variant?: "icon" | "text" | "inline";
  className?: string;
}

export function PhroureoHelpButton({ variant = "icon", className }: PhroureoHelpButtonProps) {
  const [open, setOpen] = useState(false);

  if (variant === "inline") {
    return (
      <>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setOpen(true)}
                className={cn(
                  "inline-flex items-center justify-center w-5 h-5 rounded-full",
                  "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground",
                  "transition-colors",
                  className
                )}
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Learn about Phroureo Exit Strategies</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <PhroureoHelpModal open={open} onOpenChange={setOpen} />
      </>
    );
  }

  if (variant === "text") {
    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
          className={cn("gap-2", className)}
        >
          <HelpCircle className="h-4 w-4" />
          Exit Strategy Help
        </Button>
        <PhroureoHelpModal open={open} onOpenChange={setOpen} />
      </>
    );
  }

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(true)}
              className={cn("h-8 w-8", className)}
            >
              <HelpCircle className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Learn about Phroureo Exit Strategies</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PhroureoHelpModal open={open} onOpenChange={setOpen} />
    </>
  );
}
