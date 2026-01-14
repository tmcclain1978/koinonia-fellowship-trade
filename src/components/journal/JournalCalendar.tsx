import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isWithinInterval, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";

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

interface JournalCalendarProps {
  entries: JournalEntry[];
  onSelectDate: (date: Date, entries: JournalEntry[]) => void;
}

type EntryTypeFilter = 'all' | 'trade' | 'lesson' | 'observation' | 'goal';

const JournalCalendar = ({ entries, onSelectDate }: JournalCalendarProps) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [typeFilter, setTypeFilter] = useState<EntryTypeFilter>('all');
  const [dateRangeStart, setDateRangeStart] = useState<Date | undefined>(undefined);
  const [dateRangeEnd, setDateRangeEnd] = useState<Date | undefined>(undefined);
  const [showFilters, setShowFilters] = useState(false);

  // Filter entries based on type and date range
  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      // Type filter
      if (typeFilter !== 'all' && entry.entry_type !== typeFilter) {
        return false;
      }
      
      // Date range filter
      if (dateRangeStart || dateRangeEnd) {
        const entryDate = parseISO(entry.entry_date);
        if (dateRangeStart && dateRangeEnd) {
          if (!isWithinInterval(entryDate, { start: dateRangeStart, end: dateRangeEnd })) {
            return false;
          }
        } else if (dateRangeStart && entryDate < dateRangeStart) {
          return false;
        } else if (dateRangeEnd && entryDate > dateRangeEnd) {
          return false;
        }
      }
      
      return true;
    });
  }, [entries, typeFilter, dateRangeStart, dateRangeEnd]);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, JournalEntry[]>();
    filteredEntries.forEach(entry => {
      const dateKey = format(new Date(entry.entry_date), 'yyyy-MM-dd');
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(entry);
    });
    return map;
  }, [filteredEntries]);

  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });
    
    const startDay = start.getDay();
    const paddedDays: (Date | null)[] = Array(startDay).fill(null);
    
    return [...paddedDays, ...days];
  }, [currentMonth]);

  const goToPreviousMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const goToNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  const handleDayClick = (day: Date) => {
    const dateKey = format(day, 'yyyy-MM-dd');
    const dayEntries = entriesByDate.get(dateKey) || [];
    if (dayEntries.length > 0) {
      onSelectDate(day, dayEntries);
    }
  };

  const getEntryTypeColor = (entries: JournalEntry[]) => {
    if (entries.some(e => e.entry_type === 'trade')) return 'bg-primary';
    if (entries.some(e => e.entry_type === 'lesson')) return 'bg-success';
    if (entries.some(e => e.entry_type === 'observation')) return 'bg-warning';
    return 'bg-accent';
  };

  const clearFilters = () => {
    setTypeFilter('all');
    setDateRangeStart(undefined);
    setDateRangeEnd(undefined);
  };

  const hasActiveFilters = typeFilter !== 'all' || dateRangeStart || dateRangeEnd;

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      {/* Filter Toggle */}
      <div className="flex items-center justify-between mb-4">
        <Button 
          variant={showFilters ? "default" : "outline"} 
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="gap-2"
        >
          <Filter className="w-4 h-4" />
          Filters
          {hasActiveFilters && (
            <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
              !
            </Badge>
          )}
        </Button>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
            <X className="w-4 h-4 mr-1" />
            Clear filters
          </Button>
        )}
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="mb-4 p-4 bg-muted/30 rounded-lg border border-border space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Entry Type Filter */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Entry Type</label>
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as EntryTypeFilter)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="trade">Trade</SelectItem>
                  <SelectItem value="lesson">Lesson</SelectItem>
                  <SelectItem value="observation">Observation</SelectItem>
                  <SelectItem value="goal">Goal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date Range Start */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">From Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full h-9 justify-start text-left font-normal">
                    {dateRangeStart ? format(dateRangeStart, 'MMM d, yyyy') : 'Select start'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateRangeStart}
                    onSelect={setDateRangeStart}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Date Range End */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">To Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full h-9 justify-start text-left font-normal">
                    {dateRangeEnd ? format(dateRangeEnd, 'MMM d, yyyy') : 'Select end'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateRangeEnd}
                    onSelect={setDateRangeEnd}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Active Filters Summary */}
          {hasActiveFilters && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              {typeFilter !== 'all' && (
                <Badge variant="secondary" className="capitalize">
                  Type: {typeFilter}
                  <button onClick={() => setTypeFilter('all')} className="ml-1 hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {dateRangeStart && (
                <Badge variant="secondary">
                  From: {format(dateRangeStart, 'MMM d')}
                  <button onClick={() => setDateRangeStart(undefined)} className="ml-1 hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {dateRangeEnd && (
                <Badge variant="secondary">
                  To: {format(dateRangeEnd, 'MMM d')}
                  <button onClick={() => setDateRangeEnd(undefined)} className="ml-1 hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
            </div>
          )}
        </div>
      )}

      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="icon" onClick={goToPreviousMonth}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-lg font-semibold text-foreground">
          {format(currentMonth, 'MMMM yyyy')}
        </h2>
        <Button variant="ghost" size="icon" onClick={goToNextMonth}>
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {/* Day Labels */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day, idx) => {
          if (!day) {
            return <div key={`empty-${idx}`} className="aspect-square" />;
          }

          const dateKey = format(day, 'yyyy-MM-dd');
          const dayEntries = entriesByDate.get(dateKey) || [];
          const hasEntries = dayEntries.length > 0;
          const isToday = isSameDay(day, new Date());
          const isCurrentMonth = isSameMonth(day, currentMonth);

          return (
            <button
              key={dateKey}
              onClick={() => handleDayClick(day)}
              disabled={!hasEntries}
              className={`
                aspect-square flex flex-col items-center justify-center rounded-lg text-sm
                transition-all duration-200 relative
                ${isCurrentMonth ? 'text-foreground' : 'text-muted-foreground/50'}
                ${isToday ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
                ${hasEntries 
                  ? 'hover:bg-accent cursor-pointer font-medium' 
                  : 'cursor-default'
                }
              `}
            >
              <span>{format(day, 'd')}</span>
              {hasEntries && (
                <div className="flex gap-0.5 mt-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${getEntryTypeColor(dayEntries)}`} />
                  {dayEntries.length > 1 && (
                    <span className="text-[10px] text-muted-foreground">+{dayEntries.length - 1}</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Results Summary */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground">Entry Types:</p>
          <p className="text-xs text-muted-foreground">
            Showing {filteredEntries.length} of {entries.length} entries
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span>Trade</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-success" />
            <span>Lesson</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-warning" />
            <span>Observation</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-accent" />
            <span>Goal</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JournalCalendar;
