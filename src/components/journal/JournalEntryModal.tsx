import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Sparkles, TrendingUp, Lightbulb, Calendar, Tag, Heart, Edit2, Trash2, X, Save, MoreVertical } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import FormattedAIInsight from "@/components/FormattedAIInsight";

interface JournalEntry {
  id: string;
  entry_date: string;
  symbol: string | null;
  entry_type: string;
  content: string;
  emotions: string[] | null;
  ai_analysis: string | null;
  ai_suggestions: string[] | null;
  analyzed_at: string | null;
}

interface JournalEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: JournalEntry[];
  selectedDate: Date | null;
  onAnalyze: (id: string) => void;
  analyzingId: string | null;
  onEdit: (id: string, updates: Partial<JournalEntry>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const emotionOptions = ['Confident', 'Anxious', 'FOMO', 'Disciplined', 'Impulsive', 'Patient', 'Greedy', 'Fearful'];

const JournalEntryModal = ({
  isOpen,
  onClose,
  entries,
  selectedDate,
  onAnalyze,
  analyzingId,
  onEdit,
  onDelete
}: JournalEntryModalProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    symbol: string;
    entry_type: string;
    content: string;
    emotions: string[];
  }>({ symbol: '', entry_type: '', content: '', emotions: [] });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const startEditing = (entry: JournalEntry) => {
    setEditingId(entry.id);
    setEditForm({
      symbol: entry.symbol || '',
      entry_type: entry.entry_type,
      content: entry.content,
      emotions: entry.emotions || []
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm({ symbol: '', entry_type: '', content: '', emotions: [] });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      await onEdit(editingId, {
        symbol: editForm.symbol || null,
        entry_type: editForm.entry_type,
        content: editForm.content,
        emotions: editForm.emotions.length > 0 ? editForm.emotions : null
      });
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  };

  const toggleEmotion = (emotion: string) => {
    setEditForm(prev => ({
      ...prev,
      emotions: prev.emotions.includes(emotion)
        ? prev.emotions.filter(e => e !== emotion)
        : [...prev.emotions, emotion]
    }));
  };

  const getEntryTypeStyles = (type: string) => {
    switch (type) {
      case 'trade':
        return 'bg-primary/10 text-primary border-primary/20';
      case 'lesson':
        return 'bg-success/10 text-success border-success/20';
      case 'observation':
        return 'bg-warning/10 text-warning border-warning/20';
      case 'goal':
        return 'bg-accent/20 text-accent-foreground border-accent/30';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            {selectedDate && (
              <span>Journal Entries - {format(selectedDate, 'MMMM d, yyyy')}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {entries.map((entry) => (
            <div 
              key={entry.id}
              className="bg-card border border-border rounded-lg overflow-hidden"
            >
              {/* Entry Header */}
              <div className="p-4 border-b border-border bg-muted/30">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    {editingId === entry.id ? (
                      <Input
                        placeholder="Symbol (optional)"
                        value={editForm.symbol}
                        onChange={(e) => setEditForm({ ...editForm, symbol: e.target.value.toUpperCase() })}
                        className="w-24 h-8"
                      />
                    ) : (
                      entry.symbol && (
                        <span className="font-bold text-primary text-lg">
                          {entry.symbol}
                        </span>
                      )
                    )}
                    {editingId === entry.id ? (
                      <Select 
                        value={editForm.entry_type} 
                        onValueChange={(v) => setEditForm({ ...editForm, entry_type: v })}
                      >
                        <SelectTrigger className="w-32 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="trade">Trade</SelectItem>
                          <SelectItem value="observation">Observation</SelectItem>
                          <SelectItem value="lesson">Lesson</SelectItem>
                          <SelectItem value="goal">Goal</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border capitalize ${getEntryTypeStyles(entry.entry_type)}`}>
                        <Tag className="w-3 h-3 inline mr-1" />
                        {entry.entry_type}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {editingId === entry.id ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={cancelEditing} disabled={saving}>
                          <X className="w-4 h-4" />
                        </Button>
                        <Button size="sm" onClick={saveEdit} disabled={saving}>
                          <Save className="w-4 h-4 mr-1" />
                          {saving ? 'Saving...' : 'Save'}
                        </Button>
                      </>
                    ) : (
                      <>
                        {!entry.ai_analysis && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onAnalyze(entry.id)}
                            disabled={analyzingId === entry.id}
                          >
                            <Sparkles className="w-4 h-4 mr-2" />
                            {analyzingId === entry.id ? 'Analyzing...' : 'Get AI Insights'}
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => startEditing(entry)}>
                              <Edit2 className="w-4 h-4 mr-2" />
                              Edit Entry
                            </DropdownMenuItem>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <DropdownMenuItem 
                                  onSelect={(e) => e.preventDefault()}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Delete Entry
                                </DropdownMenuItem>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Journal Entry?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This action cannot be undone. This will permanently delete this journal entry
                                    {entry.symbol && ` for ${entry.symbol}`}.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction 
                                    onClick={() => handleDelete(entry.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    {deletingId === entry.id ? 'Deleting...' : 'Delete'}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Entry Content */}
              <div className="p-4 space-y-4">
                {/* Notes */}
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-2">Notes</h4>
                  {editingId === entry.id ? (
                    <Textarea
                      value={editForm.content}
                      onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                      rows={4}
                      className="w-full"
                    />
                  ) : (
                    <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                      {entry.content}
                    </p>
                  )}
                </div>

                {/* Emotions */}
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                    <Heart className="w-3 h-3" />
                    Emotions
                  </h4>
                  {editingId === entry.id ? (
                    <div className="flex flex-wrap gap-2">
                      {emotionOptions.map(emotion => (
                        <Button
                          key={emotion}
                          type="button"
                          size="sm"
                          variant={editForm.emotions.includes(emotion) ? "default" : "outline"}
                          onClick={() => toggleEmotion(emotion)}
                        >
                          {emotion}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    entry.emotions && entry.emotions.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {entry.emotions.map(emotion => (
                          <span 
                            key={emotion} 
                            className="text-xs px-3 py-1.5 bg-accent/50 text-accent-foreground rounded-full font-medium"
                          >
                            {emotion}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No emotions recorded</p>
                    )
                  )}
                </div>

                {/* AI Analysis */}
                {entry.ai_analysis && editingId !== entry.id && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="flex items-center gap-2 text-primary mb-4">
                      <Lightbulb className="w-5 h-5" />
                      <span className="font-semibold">AI Trading Insights</span>
                    </div>
                    
                    <FormattedAIInsight analysis={entry.ai_analysis} />
                    
                    {entry.ai_suggestions && entry.ai_suggestions.length > 0 && (
                      <div className="mt-4 p-4 bg-primary/5 rounded-lg border border-primary/20">
                        <p className="font-semibold flex items-center gap-2 text-primary mb-3">
                          <TrendingUp className="w-4 h-4" />
                          Actionable Recommendations
                        </p>
                        <div className="space-y-2">
                          {entry.ai_suggestions.map((suggestion, sugIdx) => (
                            <div 
                              key={sugIdx} 
                              className="flex items-start gap-3 p-2 bg-background rounded"
                            >
                              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
                                {sugIdx + 1}
                              </span>
                              <span className="text-sm text-foreground">{suggestion}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {entries.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No entries for this date.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default JournalEntryModal;
