import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Calendar, Search, X, Tag, Heart, Download, FileText, FileSpreadsheet, Plus } from "lucide-react";
import Navigation from "@/components/Navigation";
import JournalCalendar from "@/components/journal/JournalCalendar";
import JournalEntryModal from "@/components/journal/JournalEntryModal";
import { format } from "date-fns";
import { exportToCSV, exportToPDF } from "@/utils/journalExport";

interface JournalEntry {
  id: string;
  entry_date: string;
  symbol: string | null;
  entry_type: string;
  content: string;
  emotions: string[] | null;
  tags: string[] | null;
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
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedEntries, setSelectedEntries] = useState<JournalEntry[]>([]);
  
  // Tags state
  const [newTagInput, setNewTagInput] = useState("");
  
  const [newEntry, setNewEntry] = useState({
    entry_type: 'trade',
    symbol: '',
    content: '',
    emotions: [] as string[],
    tags: [] as string[],
  });

  const emotionOptions = ['Confident', 'Anxious', 'FOMO', 'Disciplined', 'Impulsive', 'Patient', 'Greedy', 'Fearful'];

  // Get all unique tags from entries for suggestions
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    entries.forEach(entry => {
      entry.tags?.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [entries]);

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    
    const query = searchQuery.toLowerCase().trim();
    
    return entries.filter(entry => {
      // Search in symbol
      if (entry.symbol?.toLowerCase().includes(query)) return true;
      
      // Search in content
      if (entry.content.toLowerCase().includes(query)) return true;
      
      // Search in emotions
      if (entry.emotions?.some(e => e.toLowerCase().includes(query))) return true;
      
      // Search in tags
      if (entry.tags?.some(t => t.toLowerCase().includes(query))) return true;
      
      // Search in entry type
      if (entry.entry_type.toLowerCase().includes(query)) return true;
      
      return false;
    });
  }, [entries, searchQuery]);

  useEffect(() => {
    loadEntries();
  }, []);

  useEffect(() => {
    setShowSearchResults(searchQuery.trim().length > 0);
  }, [searchQuery]);

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
      setEntries((data || []) as JournalEntry[]);
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
          tags: newEntry.tags.length > 0 ? newEntry.tags : null,
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
        tags: [],
      });
      setNewTagInput("");

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

  const addTag = (tag: string) => {
    const trimmedTag = tag.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (trimmedTag && !newEntry.tags.includes(trimmedTag)) {
      setNewEntry(prev => ({
        ...prev,
        tags: [...prev.tags, trimmedTag]
      }));
    }
    setNewTagInput("");
  };

  const removeTag = (tag: string) => {
    setNewEntry(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag)
    }));
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(newTagInput);
    }
  };

  const handleSelectDate = (date: Date, dayEntries: JournalEntry[]) => {
    setSelectedDate(date);
    setSelectedEntries(dayEntries);
    setIsModalOpen(true);
  };

  const handleSearchResultClick = (entry: JournalEntry) => {
    const entryDate = new Date(entry.entry_date);
    const dateKey = format(entryDate, 'yyyy-MM-dd');
    const dayEntries = entries.filter(e => 
      format(new Date(e.entry_date), 'yyyy-MM-dd') === dateKey
    );
    setSelectedDate(entryDate);
    setSelectedEntries(dayEntries);
    setIsModalOpen(true);
    setSearchQuery("");
    setShowSearchResults(false);
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

      const updatedEntries = entries.map(entry => 
        entry.id === id ? { ...entry, ...updates } : entry
      );
      setEntries(updatedEntries);
      
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

      const updatedEntries = entries.filter(entry => entry.id !== id);
      setEntries(updatedEntries);
      
      const updatedSelectedEntries = selectedEntries.filter(entry => entry.id !== id);
      setSelectedEntries(updatedSelectedEntries);
      
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

  const handleExportCSV = () => {
    if (entries.length === 0) {
      toast({
        title: "No entries to export",
        description: "Create some journal entries first",
        variant: "destructive",
      });
      return;
    }
    exportToCSV(entries);
    toast({
      title: "Export complete",
      description: "Your journal has been exported to CSV",
    });
  };

  const handleExportPDF = () => {
    if (entries.length === 0) {
      toast({
        title: "No entries to export",
        description: "Create some journal entries first",
        variant: "destructive",
      });
      return;
    }
    exportToPDF(entries);
  };

  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) => 
      regex.test(part) ? <mark key={i} className="bg-primary/30 text-foreground rounded px-0.5">{part}</mark> : part
    );
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
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold text-foreground">Trading Journal</h1>
                <p className="text-muted-foreground">Track your trades and get AI-powered insights</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Export Button */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Download className="w-4 h-4" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleExportCSV} className="gap-2">
                    <FileSpreadsheet className="w-4 h-4" />
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleExportPDF} className="gap-2">
                    <FileText className="w-4 h-4" />
                    Export as PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Search Bar */}
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search symbol, content, tags..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-10"
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setShowSearchResults(false);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                
                {/* Search Results Dropdown */}
                {showSearchResults && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
                    {searchResults.length === 0 ? (
                      <div className="p-4 text-center text-muted-foreground">
                        No entries found for "{searchQuery}"
                      </div>
                    ) : (
                      <>
                        <div className="p-2 border-b border-border bg-muted/30">
                          <p className="text-xs text-muted-foreground">
                            {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
                          </p>
                        </div>
                        {searchResults.slice(0, 10).map((entry) => (
                          <button
                            key={entry.id}
                            onClick={() => handleSearchResultClick(entry)}
                            className="w-full p-3 text-left hover:bg-accent/50 border-b border-border last:border-b-0 transition-colors"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              {entry.symbol && (
                                <span className="font-bold text-primary text-sm">
                                  {highlightMatch(entry.symbol, searchQuery)}
                                </span>
                              )}
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border capitalize ${getEntryTypeStyles(entry.entry_type)}`}>
                                <Tag className="w-2 h-2 inline mr-0.5" />
                                {entry.entry_type}
                              </span>
                              <span className="text-xs text-muted-foreground ml-auto">
                                {format(new Date(entry.entry_date), 'MMM d, yyyy')}
                              </span>
                            </div>
                            <p className="text-sm text-foreground line-clamp-2">
                              {highlightMatch(entry.content.slice(0, 150), searchQuery)}
                              {entry.content.length > 150 && '...'}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              {entry.tags && entry.tags.length > 0 && (
                                <div className="flex items-center gap-1">
                                  <Tag className="w-3 h-3 text-muted-foreground" />
                                  {entry.tags.slice(0, 3).map(tag => (
                                    <span 
                                      key={tag} 
                                      className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded"
                                    >
                                      #{highlightMatch(tag, searchQuery)}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {entry.emotions && entry.emotions.length > 0 && (
                                <div className="flex items-center gap-1">
                                  <Heart className="w-3 h-3 text-muted-foreground" />
                                  {entry.emotions.slice(0, 2).map(emotion => (
                                    <span 
                                      key={emotion} 
                                      className="text-[10px] px-1.5 py-0.5 bg-accent/30 text-accent-foreground rounded"
                                    >
                                      {highlightMatch(emotion, searchQuery)}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </button>
                        ))}
                        {searchResults.length > 10 && (
                          <div className="p-2 text-center text-xs text-muted-foreground bg-muted/30">
                            Showing first 10 results. Refine your search for more specific results.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
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
                  {allTags.length}
                </p>
                <p className="text-sm text-muted-foreground">Custom Tags</p>
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
                      rows={5}
                      required
                    />
                  </div>

                  {/* Tags Section */}
                  <div>
                    <Label className="flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      Tags
                    </Label>
                    <div className="mt-2 space-y-2">
                      {/* Current Tags */}
                      {newEntry.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {newEntry.tags.map(tag => (
                            <Badge 
                              key={tag} 
                              variant="secondary"
                              className="gap-1 pr-1"
                            >
                              #{tag}
                              <button 
                                type="button"
                                onClick={() => removeTag(tag)}
                                className="ml-1 hover:text-destructive"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                      
                      {/* Tag Input */}
                      <div className="flex gap-2">
                        <Input
                          placeholder="Add a tag..."
                          value={newTagInput}
                          onChange={(e) => setNewTagInput(e.target.value)}
                          onKeyDown={handleTagInputKeyDown}
                          className="flex-1"
                        />
                        <Button 
                          type="button" 
                          size="icon" 
                          variant="outline"
                          onClick={() => addTag(newTagInput)}
                          disabled={!newTagInput.trim()}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                      
                      {/* Suggested Tags */}
                      {allTags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          <span className="text-xs text-muted-foreground mr-1">Suggestions:</span>
                          {allTags.slice(0, 8).filter(t => !newEntry.tags.includes(t)).map(tag => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => addTag(tag)}
                              className="text-xs px-2 py-0.5 bg-muted hover:bg-accent rounded transition-colors"
                            >
                              #{tag}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
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
        allTags={allTags}
      />
    </>
  );
};

export default TradingJournal;
