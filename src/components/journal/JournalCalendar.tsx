import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from "date-fns";

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

const JournalCalendar = ({ entries, onSelectDate }: JournalCalendarProps) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const entriesByDate = useMemo(() => {
    const map = new Map<string, JournalEntry[]>();
    entries.forEach(entry => {
      const dateKey = format(new Date(entry.entry_date), 'yyyy-MM-dd');
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(entry);
    });
    return map;
  }, [entries]);

  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });
    
    // Pad the beginning with empty days
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

  return (
    <div className="bg-card rounded-lg border border-border p-4">
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

      {/* Legend */}
      <div className="mt-4 pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground mb-2">Entry Types:</p>
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
