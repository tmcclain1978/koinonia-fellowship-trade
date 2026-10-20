import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Pencil, 
  Minus, 
  TrendingUp, 
  Square, 
  Circle,
  MoveHorizontal,
  MoveVertical,
  ArrowRight,
  Triangle,
  Type,
  Trash2,
  MousePointer,
  GitBranch,
  Waves,
  Target,
  Hash,
  Ruler,
} from "lucide-react";
import type { Chart } from "klinecharts";
import { Separator } from "@/components/ui/separator";
import { startDrawing, clearDrawings } from "./state/chartDrawings";

interface DrawingToolbarProps {
  chart: Chart | null;
  /** Drawings are saved per symbol. */
  symbol: string;
}

interface DrawingTool {
  id: string;
  label: string;
  icon: React.ElementType;
  category: string;
}

export const DRAWING_TOOLS: DrawingTool[] = [
  // Lines
  { id: "segment", label: "Line Segment", icon: Minus, category: "Lines" },
  { id: "rayLine", label: "Ray", icon: ArrowRight, category: "Lines" },
  { id: "straightLine", label: "Extended Line", icon: MoveHorizontal, category: "Lines" },
  { id: "horizontalRayLine", label: "Horizontal Ray", icon: MoveHorizontal, category: "Lines" },
  { id: "horizontalStraightLine", label: "Horizontal Line", icon: Minus, category: "Lines" },
  { id: "verticalRayLine", label: "Vertical Ray", icon: MoveVertical, category: "Lines" },
  { id: "verticalStraightLine", label: "Vertical Line", icon: MoveVertical, category: "Lines" },
  { id: "priceChannelLine", label: "Price Channel", icon: GitBranch, category: "Lines" },
  { id: "parallelStraightLine", label: "Parallel Channel", icon: Hash, category: "Lines" },
  
  // Trend
  { id: "priceLine", label: "Price Line", icon: TrendingUp, category: "Trend" },
  { id: "segment", label: "Trend Line", icon: TrendingUp, category: "Trend" },
  { id: "regression", label: "Regression Trend", icon: TrendingUp, category: "Trend" },
  
  // Fibonacci
  { id: "fibonacciLine", label: "Fib Retracement", icon: Waves, category: "Fibonacci" },
  { id: "fibonacciExtension", label: "Fib Extension (3-point)", icon: Waves, category: "Fibonacci" },
  
  // Shapes
  { id: "rect", label: "Rectangle", icon: Square, category: "Shapes" },
  { id: "parallelogram", label: "Parallelogram", icon: Square, category: "Shapes" },
  { id: "circle", label: "Circle", icon: Circle, category: "Shapes" },
  { id: "triangle", label: "Triangle", icon: Triangle, category: "Shapes" },
  
  // Patterns
  { id: "abcd", label: "ABCD Pattern", icon: GitBranch, category: "Patterns" },
  { id: "xabcd", label: "XABCD Pattern", icon: GitBranch, category: "Patterns" },
  { id: "threeWaves", label: "Three Waves", icon: Waves, category: "Patterns" },
  { id: "fiveWaves", label: "Five Waves", icon: Waves, category: "Patterns" },
  { id: "eightWaves", label: "Eight Waves", icon: Waves, category: "Patterns" },
  { id: "headAndShoulders", label: "Head & Shoulders", icon: GitBranch, category: "Patterns" },
  
  // Annotations
  { id: "simpleAnnotation", label: "Text Note", icon: Type, category: "Annotations" },
  { id: "simpleTag", label: "Price Tag", icon: Target, category: "Annotations" },
  
  // Measurement
  { id: "measure", label: "Measure", icon: Ruler, category: "Measurement" },
  { id: "measureRange", label: "Date Range", icon: Ruler, category: "Measurement" },
  { id: "measurePrice", label: "Price Range", icon: Ruler, category: "Measurement" },
];

const CATEGORIES = ["Lines", "Trend", "Fibonacci", "Shapes", "Patterns", "Annotations", "Measurement"];

export const DrawingToolbar = ({ chart, symbol }: DrawingToolbarProps) => {
  const [open, setOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState("Lines");

  const handleToolSelect = (toolId: string) => {
    if (!chart) return;

    setActiveTool(toolId);
    startDrawing(chart, toolId, symbol);
  };

  const handleClearDrawings = () => {
    if (!chart) return;
    // Only the user's drawings: entry/stop lines, session dividers etc. stay.
    clearDrawings(chart, symbol);
    setActiveTool(null);
  };

  const handleSelectMode = () => {
    setActiveTool(null);
    // Exit drawing mode
  };

  const toolsByCategory = DRAWING_TOOLS.reduce((acc, tool) => {
    if (!acc[tool.category]) {
      acc[tool.category] = [];
    }
    acc[tool.category].push(tool);
    return acc;
  }, {} as Record<string, DrawingTool[]>);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant={activeTool ? "default" : "outline"} 
          size="sm"
          className={activeTool ? "bg-primary" : ""}
        >
          <Pencil className="w-4 h-4 mr-2" />
          Drawing
          {activeTool && (
            <span className="ml-1 text-xs opacity-70">
              ({DRAWING_TOOLS.find(t => t.id === activeTool)?.label})
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="start">
        <div className="p-3 border-b flex items-center justify-between">
          <h4 className="font-semibold text-sm">Drawing Tools</h4>
          <div className="flex gap-1">
            <Button
              variant={!activeTool ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={handleSelectMode}
            >
              <MousePointer className="w-3 h-3 mr-1" />
              Select
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={handleClearDrawings}
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Clear
            </Button>
          </div>
        </div>
        
        <Tabs value={activeCategory} onValueChange={setActiveCategory} className="w-full">
          <div className="border-b px-2 overflow-x-auto">
            <TabsList className="inline-flex h-9 bg-transparent w-auto">
              {CATEGORIES.map(category => (
                <TabsTrigger 
                  key={category} 
                  value={category}
                  className="text-xs px-2 data-[state=active]:bg-primary/10"
                >
                  {category}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          
          <div className="p-3">
            <div className="grid grid-cols-3 gap-2">
              {toolsByCategory[activeCategory]?.map(tool => {
                const Icon = tool.icon;
                const isActive = activeTool === tool.id;
                return (
                  <Button
                    key={tool.id}
                    variant={isActive ? "default" : "outline"}
                    size="sm"
                    className={`flex-col h-auto py-3 px-2 ${isActive ? "ring-2 ring-primary" : ""}`}
                    onClick={() => handleToolSelect(tool.id)}
                  >
                    <Icon className="w-5 h-5 mb-1" />
                    <span className="text-[10px] leading-tight text-center">
                      {tool.label}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>
        </Tabs>
        
        <div className="p-3 border-t bg-muted/30">
          <p className="text-xs text-muted-foreground">
            Click to select a drawing tool, then click and drag on the chart to draw.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
};
