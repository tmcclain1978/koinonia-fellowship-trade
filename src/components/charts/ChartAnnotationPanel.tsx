import { useState, useCallback, useEffect } from "react";
import { Chart } from "klinecharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { StickyNote, Plus, Trash2, X, Target, Shield, TrendingUp, TrendingDown, Share2, Cloud, CloudOff, RefreshCw } from "lucide-react";
import {
  ChartAnnotation,
  fetchAnnotationsFromDB,
  saveAnnotationToDB,
  deleteAnnotationFromDB,
  deleteAllAnnotationsForSymbolFromDB,
  toggleAnnotationSharing,
  createAnnotationAtPrice,
  applyAnnotationsToChart,
  clearAnnotationOverlays,
  getAnnotationColor,
} from "@/utils/chartAnnotations";
import { supabase } from "@/integrations/supabase/client";
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
  const [isShared, setIsShared] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSynced, setIsSynced] = useState(false);

  // Get current user
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
    };
    getUser();
  }, []);

  // Load annotations when popover opens
  const handleOpenChange = useCallback(async (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      if (currentPrice) {
        setNewNotePrice(currentPrice.toFixed(2));
      }
      await loadAnnotations();
    }
  }, [symbol, currentPrice, userId]);

  // Load annotations from database
  const loadAnnotations = useCallback(async () => {
    setIsLoading(true);
    try {
      if (userId) {
        const dbAnnotations = await fetchAnnotationsFromDB(symbol, userId);
        setAnnotations(dbAnnotations);
        setIsSynced(true);
        
        // Apply to chart
        applyAnnotationsToChart(chart, symbol, dbAnnotations);
      }
    } catch (e) {
      console.error('Failed to load annotations:', e);
      setIsSynced(false);
    } finally {
      setIsLoading(false);
    }
  }, [chart, symbol, userId]);

  // Add new annotation
  const handleAddAnnotation = useCallback(async () => {
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
      newNoteType,
      undefined,
      isShared
    );

    // Save to database if logged in
    if (userId) {
      const success = await saveAnnotationToDB(annotation, userId);
      if (!success) {
        toast.error("Failed to save annotation to cloud");
      } else {
        setIsSynced(true);
      }
    }

    setAnnotations(prev => [...prev, annotation]);
    setNewNoteText("");
    setShowAddForm(false);

    // Refresh overlays on chart
    applyAnnotationsToChart(chart, symbol, [...annotations, annotation]);
    onAnnotationsChange?.();
    toast.success("Annotation added");
  }, [chart, symbol, newNotePrice, newNoteText, newNoteType, isShared, userId, annotations, onAnnotationsChange]);

  // Delete annotation
  const handleDeleteAnnotation = useCallback(async (annotation: ChartAnnotation) => {
    // Only allow deleting own annotations
    if (annotation.userId && annotation.userId !== userId) {
      toast.error("You can only delete your own annotations");
      return;
    }

    if (userId) {
      await deleteAnnotationFromDB(annotation.id);
    }
    
    setAnnotations(prev => prev.filter(a => a.id !== annotation.id));
    
    // Refresh overlays
    const remaining = annotations.filter(a => a.id !== annotation.id);
    clearAnnotationOverlays(chart, annotations);
    applyAnnotationsToChart(chart, symbol, remaining);
    onAnnotationsChange?.();
    toast.success("Annotation deleted");
  }, [chart, symbol, userId, annotations, onAnnotationsChange]);

  // Toggle sharing on annotation
  const handleToggleSharing = useCallback(async (annotation: ChartAnnotation) => {
    if (annotation.userId !== userId) {
      toast.error("You can only share your own annotations");
      return;
    }

    const newSharedState = !annotation.isShared;
    const success = await toggleAnnotationSharing(annotation.id, newSharedState);
    
    if (success) {
      setAnnotations(prev => prev.map(a => 
        a.id === annotation.id ? { ...a, isShared: newSharedState } : a
      ));
      toast.success(newSharedState ? "Annotation shared with others" : "Annotation is now private");
    } else {
      toast.error("Failed to update sharing");
    }
  }, [userId]);

  // Clear all annotations for symbol
  const handleClearAll = useCallback(async () => {
    if (userId) {
      await deleteAllAnnotationsForSymbolFromDB(symbol, userId);
    }
    
    clearAnnotationOverlays(chart, annotations);
    setAnnotations([]);
    onAnnotationsChange?.();
    toast.success("All your annotations cleared");
  }, [chart, symbol, userId, annotations, onAnnotationsChange]);

  // Refresh annotations from cloud
  const handleRefresh = useCallback(async () => {
    await loadAnnotations();
    toast.success("Annotations refreshed from cloud");
  }, [loadAnnotations]);

  const getTypeIcon = (type: ChartAnnotation["type"]) => {
    switch (type) {
      case "support": return <TrendingUp className="w-3 h-3 text-green-500" />;
      case "resistance": return <TrendingDown className="w-3 h-3 text-red-500" />;
      case "target": return <Target className="w-3 h-3 text-purple-500" />;
      case "stop": return <Shield className="w-3 h-3 text-rose-500" />;
      default: return <StickyNote className="w-3 h-3 text-amber-500" />;
    }
  };

  const myAnnotations = annotations.filter(a => a.userId === userId);
  const sharedAnnotations = annotations.filter(a => a.userId !== userId && a.isShared);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <StickyNote className="w-4 h-4" />
          <span className="text-xs">Notes</span>
          {annotations.length > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {annotations.length}
            </Badge>
          )}
          {isSynced && <Cloud className="w-3 h-3 text-green-500" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-3 border-b">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">Chart Annotations</h4>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{symbol}</span>
              {isSynced ? (
                <Cloud className="w-3 h-3 text-green-500" />
              ) : (
                <CloudOff className="w-3 h-3 text-muted-foreground" />
              )}
            </div>
          </div>
        </div>

        <div className="p-3 space-y-3">
          {/* Sync Status */}
          {!userId && (
            <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-600">
              Sign in to sync annotations across devices
            </div>
          )}

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

              {userId && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Share2 className="w-3 h-3 text-muted-foreground" />
                    <Label htmlFor="share-toggle" className="text-xs">Share with others</Label>
                  </div>
                  <Switch
                    id="share-toggle"
                    checked={isShared}
                    onCheckedChange={setIsShared}
                  />
                </div>
              )}

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

          {/* My Annotations */}
          {myAnnotations.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">My Annotations</Label>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={handleRefresh}
                    disabled={isLoading}
                  >
                    <RefreshCw className={`w-3 h-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
                    Sync
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

              <ScrollArea className="h-32">
                <div className="space-y-2">
                  {myAnnotations.map((annotation) => (
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
                          {annotation.isShared && (
                            <Share2 className="w-3 h-3 text-blue-500" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {annotation.text}
                        </p>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {userId && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleToggleSharing(annotation)}
                            title={annotation.isShared ? "Make private" : "Share"}
                          >
                            <Share2 className={`w-3 h-3 ${annotation.isShared ? 'text-blue-500' : 'text-muted-foreground'}`} />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleDeleteAnnotation(annotation)}
                        >
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Shared Annotations */}
          {sharedAnnotations.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1">
                <Share2 className="w-3 h-3" />
                Shared by Others
              </Label>
              <ScrollArea className="h-24">
                <div className="space-y-2">
                  {sharedAnnotations.map((annotation) => (
                    <div
                      key={annotation.id}
                      className="flex items-start gap-2 p-2 bg-blue-500/5 border border-blue-500/20 rounded-lg"
                    >
                      <div
                        className="w-1 h-full min-h-[32px] rounded-full"
                        style={{ backgroundColor: annotation.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {getTypeIcon(annotation.type)}
                          <span className="text-xs font-medium">
                            ${annotation.price.toFixed(2)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {annotation.text}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {annotations.length === 0 && !isLoading && (
            <p className="text-xs text-muted-foreground text-center py-4">
              No annotations for {symbol}. Add one above!
            </p>
          )}

          {isLoading && (
            <div className="text-xs text-muted-foreground text-center py-4">
              Loading annotations...
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
