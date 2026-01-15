import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Save, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface QuickJournalButtonProps {
  symbol?: string;
  defaultEntryType?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

const EMOTIONS = [
  "Confident", "Anxious", "Patient", "Impulsive", 
  "Focused", "Distracted", "Calm", "Frustrated"
];

const ENTRY_TYPES = [
  { value: "trade_idea", label: "Trade Idea" },
  { value: "pre_market", label: "Pre-Market" },
  { value: "during_trade", label: "During Trade" },
  { value: "post_trade", label: "Post-Trade" },
  { value: "lesson_learned", label: "Lesson Learned" },
  { value: "market_observation", label: "Market Observation" },
];

export const QuickJournalButton = ({ 
  symbol = "", 
  defaultEntryType = "during_trade",
  variant = "outline",
  size = "sm",
  className = ""
}: QuickJournalButtonProps) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [content, setContent] = useState("");
  const [entrySymbol, setEntrySymbol] = useState(symbol);
  const [entryType, setEntryType] = useState(defaultEntryType);
  const [selectedEmotions, setSelectedEmotions] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const toggleEmotion = (emotion: string) => {
    setSelectedEmotions(prev => 
      prev.includes(emotion) 
        ? prev.filter(e => e !== emotion)
        : [...prev, emotion]
    );
  };

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const handleSave = async () => {
    if (!content.trim()) {
      toast.error("Please enter some content");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please sign in to save journal entries");
        return;
      }

      const { error } = await supabase.from("trading_journal").insert({
        user_id: user.id,
        content: content.trim(),
        symbol: entrySymbol || null,
        entry_type: entryType,
        emotions: selectedEmotions.length > 0 ? selectedEmotions : null,
        tags: tags.length > 0 ? tags : null,
        entry_date: new Date().toISOString().split('T')[0],
      });

      if (error) throw error;

      toast.success("Journal entry saved!");
      setOpen(false);
      resetForm();
    } catch (error: any) {
      console.error("Error saving journal entry:", error);
      toast.error("Failed to save journal entry");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setContent("");
    setEntrySymbol(symbol);
    setEntryType(defaultEntryType);
    setSelectedEmotions([]);
    setTags([]);
    setTagInput("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          <BookOpen className="w-4 h-4 mr-2" />
          Quick Note
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            Quick Journal Entry
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Symbol & Entry Type Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-sm">Symbol</Label>
              <Input 
                value={entrySymbol}
                onChange={(e) => setEntrySymbol(e.target.value.toUpperCase())}
                placeholder="AAPL"
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Entry Type</Label>
              <Select value={entryType} onValueChange={setEntryType}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTRY_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-2">
            <Label className="text-sm">Notes</Label>
            <Textarea 
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's happening? Record your thoughts, observations, or trade rationale..."
              className="min-h-[120px] resize-none"
            />
          </div>

          {/* Emotions */}
          <div className="space-y-2">
            <Label className="text-sm">How are you feeling?</Label>
            <div className="flex flex-wrap gap-2">
              {EMOTIONS.map(emotion => (
                <Badge
                  key={emotion}
                  variant={selectedEmotions.includes(emotion) ? "default" : "outline"}
                  className="cursor-pointer hover:bg-primary/20 transition-colors"
                  onClick={() => toggleEmotion(emotion)}
                >
                  {emotion}
                </Badge>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label className="text-sm">Tags</Label>
            <div className="flex gap-2">
              <Input 
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                placeholder="Add tag..."
                className="h-9"
              />
              <Button variant="outline" size="sm" onClick={addTag} disabled={!tagInput.trim()}>
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <X 
                      className="w-3 h-3 cursor-pointer hover:text-destructive" 
                      onClick={() => removeTag(tag)}
                    />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !content.trim()}>
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Entry
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
