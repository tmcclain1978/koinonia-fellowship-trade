import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pencil, Minus, TrendingUp, Square, Circle } from "lucide-react";
import type { Chart } from "klinecharts";

interface DrawingToolbarProps {
  chart: Chart | null;
}

const DRAWING_TOOLS = [
  { id: "segment", label: "Line Segment", icon: Minus },
  { id: "ray", label: "Ray", icon: TrendingUp },
  { id: "trendLine", label: "Trend Line", icon: TrendingUp },
  { id: "horizontalRayLine", label: "Horizontal Line", icon: Minus },
  { id: "verticalRayLine", label: "Vertical Line", icon: Minus },
  { id: "rect", label: "Rectangle", icon: Square },
  { id: "circle", label: "Circle", icon: Circle },
  { id: "fibonacciLine", label: "Fibonacci Retracement", icon: TrendingUp }
];

export const DrawingToolbar = ({ chart }: DrawingToolbarProps) => {
  const [open, setOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);

  const handleToolSelect = (toolId: string) => {
    if (!chart) return;

    setActiveTool(toolId);
    chart.createOverlay(toolId);
    setOpen(false);
  };

  const handleClearDrawings = () => {
    if (!chart) return;
    chart.removeOverlay();
    setActiveTool(null);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="w-4 h-4 mr-2" />
          Drawing Tools
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="start">
        <div className="space-y-4">
          <h4 className="font-semibold text-sm">Drawing Tools</h4>
          
          <div className="grid grid-cols-2 gap-2">
            {DRAWING_TOOLS.map(tool => {
              const Icon = tool.icon;
              return (
                <Button
                  key={tool.id}
                  variant={activeTool === tool.id ? "default" : "outline"}
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => handleToolSelect(tool.id)}
                >
                  <Icon className="w-4 h-4 mr-2" />
                  <span className="text-xs">{tool.label}</span>
                </Button>
              );
            })}
          </div>

          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={handleClearDrawings}
          >
            Clear All Drawings
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
