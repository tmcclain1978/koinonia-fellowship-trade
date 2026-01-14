import { useState, useCallback } from "react";
import { Chart } from "klinecharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StickyNote, Plus, Trash2, X, Target, Shield, TrendingUp, TrendingDown } from "lucide-react";
import {
  ChartAnnotation,
  getAnnotationsForSymbol,
  createAnnotationAtPrice,
  deleteAnnotation,
  deleteAllAnnotationsForSymbol,
  applyAnnotationsToChart,
  clearAnnotationOverlays,
  getAnnotationColor,
} from "@/utils/chartAnnotations";
import { toast } from "sonner";

interface ChartAnnotationPanelProps {
  chart: Chart | null;
  symbol: string;
  currentPrice?: number;
  onAnnotationsChange?: () => void;
}

export function ChartAnnotationPanel({
  chart,
  symbol,
  currentPrice,
  onAnnotationsChange,
}: ChartAnnotationPanelProps) {
  const [open, setOpen] = useState(false);
  const [annotations, setAnnotations] = useState<ChartAnnotation[]>([]);
  const [newNoteText, setNewNoteText] = useState("");
  const [newNotePrice, setNewNotePrice] = useState("");
  const [newNoteType, setNewNoteType] = useState<ChartAnnotation["type"]>("note");
  const [showAddForm, setShowAddForm] = useState(false);

  // Load annotations when popover opens
  const handleOpenChange = useCallback((isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      const loadedAnnotations = getAnnotationsForSymbol(symbol);
      setAnnotations(loadedAnnotations);
      // Set default price to current price if available
      if (currentPrice) {
        setNewNotePrice(currentPrice.toFixed(2));
      }
    }
  }, [symbol, currentPrice]);

  // Add new annotation
  const handleAddAnnotation = useCallback(() => {
    const price = parseFloat(newNotePrice);
    if (isNaN(price) || price <= 0) {
      toast.error("Please enter a valid price");
      return;
    }
    if (!newNoteText.trim()) {
      toast.error("Please enter a note");
      return;
    }

    const annotation = createAnnotationAtPrice(
      symbol,
      price,
      newNoteText.trim(),
      newNoteType
    );

    setAnnotations(prev => [...prev, annotation]);
    setNewNoteText("");
    setShowAddForm(false);

    // Refresh overlays on chart
    applyAnnotationsToChart(chart, symbol);
    onAnnotationsChange?.();
    toast.success("Annotation added");
  }, [chart, symbol, newNotePrice, newNoteText, newNoteType, onAnnotationsChange]);

  // Delete annotation
  const handleDeleteAnnotation = useCallback((annotationId: string) => {
    deleteAnnotation(annotationId);
    setAnnotations(prev => prev.filter(a => a.id !== annotationId));
    
    // Refresh overlays
    clearAnnotationOverlays(chart);
    applyAnnotationsToChart(chart, symbol);
    onAnnotationsChange?.();
    toast.success("Annotation deleted");
  }, [chart, symbol, onAnnotationsChange]);

  // Clear all annotations for symbol
  const handleClearAll = useCallback(() => {
    deleteAllAnnotationsForSymbol(symbol);
    setAnnotations([]);
    clearAnnotationOverlays(chart);
    onAnnotationsChange?.();
    toast.success("All annotations cleared");
  }, [chart, symbol, onAnnotationsChange]);

  // Toggle annotations visibility
  const handleToggleVisibility = useCallback(() => {
    if (annotations.length === 0) {
      toast.info("No annotations to display");
      return;
    }
    
    applyAnnotationsToChart(chart, symbol);
    toast.success("Annotations refreshed on chart");
  }, [chart, symbol, annotations.length]);

  const getTypeIcon = (type: ChartAnnotation["type"]) => {
    switch (type) {
      case "support": return <TrendingUp className="w-3 h-3 text-green-500" />;
      case "resistance": return <TrendingDown className="w-3 h-3 text-red-500" />;
      case "target": return <Target className="w-3 h-3 text-purple-500" />;
      case "stop": return <Shield className="w-3 h-3 text-rose-500" />;
      default: return <StickyNote className="w-3 h-3 text-amber-500" />;
    }
  };

  const annotationCount = getAnnotationsForSymbol(symbol).length;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <StickyNote className="w-4 h-4" />
          <span className="text-xs">Notes</span>
          {annotationCount > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {annotationCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-3 border-b">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">Chart Annotations</h4>
            <span className="text-xs text-muted-foreground">{symbol}</span>
          </div>
        </div>

        <div className="p-3 space-y-3">
          {/* Add New Annotation */}
          {!showAddForm ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => setShowAddForm(true)}
            >
              <Plus className="w-4 h-4" />
              Add Annotation
            </Button>
          ) : (
            <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">New Annotation</Label>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setShowAddForm(false)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Price</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Price"
                    value={newNotePrice}
                    onChange={(e) => setNewNotePrice(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Select value={newNoteType} onValueChange={(v) => setNewNoteType(v as ChartAnnotation["type"])}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="note">Note</SelectItem>
                      <SelectItem value="support">Support</SelectItem>
                      <SelectItem value="resistance">Resistance</SelectItem>
                      <SelectItem value="target">Target</SelectItem>
                      <SelectItem value="stop">Stop</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Note</Label>
                <Input
                  placeholder="Enter your note..."
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddAnnotation()}
                  className="h-8 text-sm"
                />
              </div>

              <Button
                size="sm"
                className="w-full"
                onClick={handleAddAnnotation}
                disabled={!newNoteText.trim() || !newNotePrice}
              >
                Add to Chart
              </Button>
            </div>
          )}

          {/* Existing Annotations */}
          {annotations.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Saved Annotations</Label>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={handleToggleVisibility}
                  >
                    Refresh
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={handleClearAll}
                  >
                    Clear All
                  </Button>
                </div>
              </div>

              <ScrollArea className="h-48">
                <div className="space-y-2">
                  {annotations.map((annotation) => (
                    <div
                      key={annotation.id}
                      className="flex items-start gap-2 p-2 bg-muted/50 rounded-lg group"
                    >
                      <div
                        className="w-1 h-full min-h-[40px] rounded-full"
                        style={{ backgroundColor: annotation.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {getTypeIcon(annotation.type)}
                          <span className="text-xs font-medium">
                            ${annotation.price.toFixed(2)}
                          </span>
                          <Badge variant="outline" className="text-[10px] h-4 px-1">
                            {annotation.type}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {annotation.text}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDeleteAnnotation(annotation.id)}
                      >
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">
              No annotations for {symbol}. Add one above!
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
