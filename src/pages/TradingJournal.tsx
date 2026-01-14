import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Sparkles, TrendingUp, Lightbulb } from "lucide-react";
import Navigation from "@/components/Navigation";
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

const TradingJournal = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  
  const [newEntry, setNewEntry] = useState({
    entry_type: 'trade',
    symbol: '',
    content: '',
    emotions: [] as string[],
  });

  const emotionOptions = ['Confident', 'Anxious', 'FOMO', 'Disciplined', 'Impulsive', 'Patient', 'Greedy', 'Fearful'];

  useEffect(() => {
    loadEntries();
  }, []);

  const loadEntries = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      const { data, error } = await supabase
        .from('trading_journal')
        .select('*')
        .order('entry_date', { ascending: false });

      if (error) throw error;
      setEntries(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading journal",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('trading_journal')
        .insert({
          user_id: user.id,
          entry_type: newEntry.entry_type,
          symbol: newEntry.symbol || null,
          content: newEntry.content,
          emotions: newEntry.emotions.length > 0 ? newEntry.emotions : null,
        });

      if (error) throw error;

      toast({
        title: "Journal entry saved",
        description: "Your entry has been recorded successfully",
      });

      setNewEntry({
        entry_type: 'trade',
        symbol: '',
        content: '',
        emotions: [],
      });

      loadEntries();
    } catch (error: any) {
      toast({
        title: "Error saving entry",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async (journalId: string) => {
    setAnalyzing(journalId);

    try {
      const { data, error } = await supabase.functions.invoke('analyze-journal', {
        body: { journalId }
      });

      if (error) throw error;

      toast({
        title: "AI Analysis Complete",
        description: "Insights have been generated for your journal entry",
      });

      loadEntries();
    } catch (error: any) {
      toast({
        title: "Analysis failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAnalyzing(null);
    }
  };

  const toggleEmotion = (emotion: string) => {
    setNewEntry(prev => ({
      ...prev,
      emotions: prev.emotions.includes(emotion)
        ? prev.emotions.filter(e => e !== emotion)
        : [...prev.emotions, emotion]
    }));
  };

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-background pt-16">
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center gap-3 mb-6">
            <BookOpen className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold text-foreground">Trading Journal</h1>
              <p className="text-muted-foreground">Track your trades and get AI-powered insights</p>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* New Entry Form */}
            <Card>
              <CardHeader>
                <CardTitle>New Journal Entry</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label>Entry Type</Label>
                    <Select 
                      value={newEntry.entry_type} 
                      onValueChange={(v) => setNewEntry({ ...newEntry, entry_type: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="trade">Trade</SelectItem>
                        <SelectItem value="observation">Observation</SelectItem>
                        <SelectItem value="lesson">Lesson</SelectItem>
                        <SelectItem value="goal">Goal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Symbol (Optional)</Label>
                    <Input
                      placeholder="e.g., AAPL"
                      value={newEntry.symbol}
                      onChange={(e) => setNewEntry({ ...newEntry, symbol: e.target.value.toUpperCase() })}
                    />
                  </div>

                  <div>
                    <Label>Your Notes</Label>
                    <Textarea
                      placeholder="What happened? What did you learn? What could you improve?"
                      value={newEntry.content}
                      onChange={(e) => setNewEntry({ ...newEntry, content: e.target.value })}
                      rows={6}
                      required
                    />
                  </div>

                  <div>
                    <Label>Emotions (Select all that apply)</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {emotionOptions.map(emotion => (
                        <Button
                          key={emotion}
                          type="button"
                          size="sm"
                          variant={newEntry.emotions.includes(emotion) ? "default" : "outline"}
                          onClick={() => toggleEmotion(emotion)}
                        >
                          {emotion}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Saving...' : 'Save Entry'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Recent Entries */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Recent Entries</h2>
              {entries.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center text-muted-foreground">
                    No journal entries yet. Start by creating your first entry!
                  </CardContent>
                </Card>
              ) : (
                entries.map(entry => (
                  <Card key={entry.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">
                            {entry.symbol && <span className="text-primary">{entry.symbol}</span>}
                            <span className="text-muted-foreground ml-2 capitalize">{entry.entry_type}</span>
                          </CardTitle>
                          <p className="text-sm text-muted-foreground">
                            {new Date(entry.entry_date).toLocaleDateString()}
                          </p>
                        </div>
                        {!entry.ai_analysis && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAnalyze(entry.id)}
                            disabled={analyzing === entry.id}
                          >
                            <Sparkles className="w-4 h-4 mr-2" />
                            {analyzing === entry.id ? 'Analyzing...' : 'Analyze'}
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm">{entry.content}</p>
                      
                      {entry.emotions && entry.emotions.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {entry.emotions.map(emotion => (
                            <span key={emotion} className="text-xs px-2 py-1 bg-muted rounded-full">
                              {emotion}
                            </span>
                          ))}
                        </div>
                      )}

                      {entry.ai_analysis && (
                        <div className="mt-4 p-4 bg-accent/10 rounded-lg space-y-4">
                          <div className="flex items-center gap-2 text-accent">
                            <Lightbulb className="w-4 h-4" />
                            <span className="font-semibold text-sm">AI Insights</span>
                          </div>
                          
                          <FormattedAIInsight analysis={entry.ai_analysis} />
                          
                          {entry.ai_suggestions && entry.ai_suggestions.length > 0 && (
                            <div className="mt-4 p-3 bg-primary/5 rounded-lg border border-primary/20">
                              <p className="text-sm font-semibold flex items-center gap-2 text-primary mb-2">
                                <TrendingUp className="w-4 h-4" />
                                Actionable Suggestions
                              </p>
                              <ul className="space-y-2">
                                {entry.ai_suggestions.map((suggestion, idx) => (
                                  <li key={idx} className="text-sm flex items-start gap-2">
                                    <span className="text-primary font-bold">{idx + 1}.</span>
                                    <span>{suggestion}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default TradingJournal;