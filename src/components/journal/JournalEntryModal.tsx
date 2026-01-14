import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, TrendingUp, Lightbulb, Calendar, Tag, Heart } from "lucide-react";
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
}

const JournalEntryModal = ({
  isOpen,
  onClose,
  entries,
  selectedDate,
  onAnalyze,
  analyzingId
}: JournalEntryModalProps) => {
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
          {entries.map((entry, idx) => (
            <div 
              key={entry.id}
              className="bg-card border border-border rounded-lg overflow-hidden"
            >
              {/* Entry Header */}
              <div className="p-4 border-b border-border bg-muted/30">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    {entry.symbol && (
                      <span className="font-bold text-primary text-lg">
                        {entry.symbol}
                      </span>
                    )}
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border capitalize ${getEntryTypeStyles(entry.entry_type)}`}>
                      <Tag className="w-3 h-3 inline mr-1" />
                      {entry.entry_type}
                    </span>
                  </div>
                  {!entry.ai_analysis && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onAnalyze(entry.id)}
                      disabled={analyzingId === entry.id}
                      className="shrink-0"
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      {analyzingId === entry.id ? 'Analyzing...' : 'Get AI Insights'}
                    </Button>
                  )}
                </div>
              </div>

              {/* Entry Content */}
              <div className="p-4 space-y-4">
                {/* Notes */}
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-2">Notes</h4>
                  <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                    {entry.content}
                  </p>
                </div>

                {/* Emotions */}
                {entry.emotions && entry.emotions.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                      <Heart className="w-3 h-3" />
                      Emotions
                    </h4>
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
                  </div>
                )}

                {/* AI Analysis */}
                {entry.ai_analysis && (
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
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default JournalEntryModal;
