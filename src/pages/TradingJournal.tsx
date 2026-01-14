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
import { BookOpen, Calendar } from "lucide-react";
import Navigation from "@/components/Navigation";
import JournalCalendar from "@/components/journal/JournalCalendar";
import JournalEntryModal from "@/components/journal/JournalEntryModal";

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
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedEntries, setSelectedEntries] = useState<JournalEntry[]>([]);
  
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
      
      // Update modal entries if open
      if (isModalOpen && selectedEntries.length > 0) {
        const updatedEntries = selectedEntries.map(entry => 
          entry.id === journalId 
            ? { ...entry, ai_analysis: data.analysis, ai_suggestions: data.suggestions }
            : entry
        );
        setSelectedEntries(updatedEntries);
      }
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

  const handleSelectDate = (date: Date, dayEntries: JournalEntry[]) => {
    setSelectedDate(date);
    setSelectedEntries(dayEntries);
    setIsModalOpen(true);
  };

  const handleEditEntry = async (id: string, updates: Partial<JournalEntry>) => {
    try {
      const { error } = await supabase
        .from('trading_journal')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Entry updated",
        description: "Your journal entry has been updated successfully",
      });

      // Update local state
      const updatedEntries = entries.map(entry => 
        entry.id === id ? { ...entry, ...updates } : entry
      );
      setEntries(updatedEntries);
      
      // Update modal entries
      const updatedSelectedEntries = selectedEntries.map(entry => 
        entry.id === id ? { ...entry, ...updates } : entry
      );
      setSelectedEntries(updatedSelectedEntries);
    } catch (error: any) {
      toast({
        title: "Error updating entry",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleDeleteEntry = async (id: string) => {
    try {
      const { error } = await supabase
        .from('trading_journal')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Entry deleted",
        description: "Your journal entry has been deleted",
      });

      // Update local state
      const updatedEntries = entries.filter(entry => entry.id !== id);
      setEntries(updatedEntries);
      
      // Update modal entries
      const updatedSelectedEntries = selectedEntries.filter(entry => entry.id !== id);
      setSelectedEntries(updatedSelectedEntries);
      
      // Close modal if no entries left for that date
      if (updatedSelectedEntries.length === 0) {
        setIsModalOpen(false);
      }
    } catch (error: any) {
      toast({
        title: "Error deleting entry",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const totalEntries = entries.length;
  const entriesThisMonth = entries.filter(e => {
    const entryDate = new Date(e.entry_date);
    const now = new Date();
    return entryDate.getMonth() === now.getMonth() && entryDate.getFullYear() === now.getFullYear();
  }).length;

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

          {/* Stats Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-primary">{totalEntries}</p>
                <p className="text-sm text-muted-foreground">Total Entries</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-success">{entriesThisMonth}</p>
                <p className="text-sm text-muted-foreground">This Month</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-warning">
                  {entries.filter(e => e.entry_type === 'trade').length}
                </p>
                <p className="text-sm text-muted-foreground">Trade Entries</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-accent">
                  {entries.filter(e => e.ai_analysis).length}
                </p>
                <p className="text-sm text-muted-foreground">AI Analyzed</p>
              </CardContent>
            </Card>
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

            {/* Calendar View */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-semibold">Journal Calendar</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Click on any highlighted date to view your journal entries for that day.
              </p>
              <JournalCalendar 
                entries={entries} 
                onSelectDate={handleSelectDate}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Journal Entry Modal */}
      <JournalEntryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        entries={selectedEntries}
        selectedDate={selectedDate}
        onAnalyze={handleAnalyze}
        analyzingId={analyzing}
        onEdit={handleEditEntry}
        onDelete={handleDeleteEntry}
      />
    </>
  );
};

export default TradingJournal;
