import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  Heart, 
  Tag, 
  Calendar,
  BookOpen,
  Target,
  Lightbulb,
  Activity
} from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, subWeeks, subMonths } from "date-fns";

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

interface JournalSummaryProps {
  entries: JournalEntry[];
}

type PeriodType = 'this-week' | 'last-week' | 'this-month' | 'last-month';

const JournalSummary = ({ entries }: JournalSummaryProps) => {
  const [period, setPeriod] = useState<PeriodType>('this-week');

  const periodData = useMemo(() => {
    const now = new Date();
    let start: Date;
    let end: Date;
    let label: string;

    switch (period) {
      case 'this-week':
        start = startOfWeek(now, { weekStartsOn: 1 });
        end = endOfWeek(now, { weekStartsOn: 1 });
        label = `This Week (${format(start, 'MMM d')} - ${format(end, 'MMM d')})`;
        break;
      case 'last-week':
        start = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
        end = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
        label = `Last Week (${format(start, 'MMM d')} - ${format(end, 'MMM d')})`;
        break;
      case 'this-month':
        start = startOfMonth(now);
        end = endOfMonth(now);
        label = `This Month (${format(now, 'MMMM yyyy')})`;
        break;
      case 'last-month':
        start = startOfMonth(subMonths(now, 1));
        end = endOfMonth(subMonths(now, 1));
        label = `Last Month (${format(subMonths(now, 1), 'MMMM yyyy')})`;
        break;
    }

    return { start, end, label };
  }, [period]);

  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      const entryDate = new Date(entry.entry_date);
      return isWithinInterval(entryDate, { start: periodData.start, end: periodData.end });
    });
  }, [entries, periodData]);

  const stats = useMemo(() => {
    const entryTypes = { trade: 0, lesson: 0, observation: 0, goal: 0 };
    const emotionCounts: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};
    const symbolCounts: Record<string, number> = {};
    let analyzedCount = 0;

    filteredEntries.forEach(entry => {
      // Count entry types
      if (entry.entry_type in entryTypes) {
        entryTypes[entry.entry_type as keyof typeof entryTypes]++;
      }

      // Count emotions
      entry.emotions?.forEach(emotion => {
        emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
      });

      // Count tags
      entry.tags?.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });

      // Count symbols
      if (entry.symbol) {
        symbolCounts[entry.symbol] = (symbolCounts[entry.symbol] || 0) + 1;
      }

      // Count analyzed entries
      if (entry.ai_analysis) {
        analyzedCount++;
      }
    });

    // Sort and get top items
    const topEmotions = Object.entries(emotionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const topSymbols = Object.entries(symbolCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      total: filteredEntries.length,
      entryTypes,
      topEmotions,
      topTags,
      topSymbols,
      analyzedCount,
      uniqueSymbols: Object.keys(symbolCounts).length,
      uniqueTags: Object.keys(tagCounts).length
    };
  }, [filteredEntries]);

  const insights = useMemo(() => {
    const insights: string[] = [];

    if (stats.total === 0) {
      return ['No entries recorded for this period. Start journaling to see insights!'];
    }

    // Entry frequency insight
    if (period.includes('week')) {
      const avgPerDay = stats.total / 7;
      if (avgPerDay >= 1) {
        insights.push(`Great consistency! You're averaging ${avgPerDay.toFixed(1)} entries per day.`);
      } else if (stats.total > 0) {
        insights.push(`You made ${stats.total} journal entries this period. Try to journal daily for better insights.`);
      }
    }

    // Emotion pattern insights
    if (stats.topEmotions.length > 0) {
      const dominantEmotion = stats.topEmotions[0];
      const positiveEmotions = ['Confident', 'Disciplined', 'Patient'];
      const negativeEmotions = ['Anxious', 'FOMO', 'Impulsive', 'Greedy', 'Fearful'];
      
      if (positiveEmotions.includes(dominantEmotion[0])) {
        insights.push(`Your dominant emotion was "${dominantEmotion[0]}" - a positive trading mindset!`);
      } else if (negativeEmotions.includes(dominantEmotion[0])) {
        insights.push(`"${dominantEmotion[0]}" was your most common emotion. Consider reviewing trades made in this state.`);
      }
    }

    // Tag usage insight
    if (stats.topTags.length > 0) {
      insights.push(`Most used tag: #${stats.topTags[0][0]} (${stats.topTags[0][1]} times)`);
    }

    // Symbol focus insight
    if (stats.topSymbols.length > 0) {
      insights.push(`Most traded symbol: ${stats.topSymbols[0][0]} with ${stats.topSymbols[0][1]} entries`);
    }

    // AI analysis insight
    const analysisRate = stats.total > 0 ? (stats.analyzedCount / stats.total) * 100 : 0;
    if (analysisRate < 50 && stats.total > 2) {
      insights.push(`Only ${analysisRate.toFixed(0)}% of entries have AI analysis. Get more insights by analyzing your entries!`);
    }

    // Entry type balance
    if (stats.entryTypes.lesson > 0) {
      insights.push(`You documented ${stats.entryTypes.lesson} lesson(s) - great for continuous improvement!`);
    }

    return insights.length > 0 ? insights : ['Keep journaling to unlock personalized insights!'];
  }, [stats, period]);

  if (entries.length === 0) {
    return null;
  }

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Journal Summary
          </CardTitle>
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this-week">This Week</SelectItem>
              <SelectItem value="last-week">Last Week</SelectItem>
              <SelectItem value="this-month">This Month</SelectItem>
              <SelectItem value="last-month">Last Month</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground">{periodData.label}</p>
      </CardHeader>
      <CardContent>
        {stats.total === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No journal entries for this period.</p>
            <p className="text-sm mt-1">Try selecting a different time range.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <p className="text-2xl font-bold text-primary">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total Entries</p>
              </div>
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <p className="text-2xl font-bold text-success">{stats.uniqueSymbols}</p>
                <p className="text-xs text-muted-foreground">Symbols Tracked</p>
              </div>
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <p className="text-2xl font-bold text-warning">{stats.uniqueTags}</p>
                <p className="text-xs text-muted-foreground">Tags Used</p>
              </div>
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <p className="text-2xl font-bold text-accent">{stats.analyzedCount}</p>
                <p className="text-xs text-muted-foreground">AI Analyzed</p>
              </div>
            </div>

            {/* Entry Types Breakdown */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                Entry Types
              </h4>
              <div className="space-y-2">
                {Object.entries(stats.entryTypes).map(([type, count]) => {
                  const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;
                  return (
                    <div key={type} className="flex items-center gap-3">
                      <span className="text-sm capitalize w-24">{type}</span>
                      <Progress value={percentage} className="flex-1 h-2" />
                      <span className="text-sm text-muted-foreground w-12 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Top Emotions */}
              {stats.topEmotions.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Heart className="w-4 h-4" />
                    Top Emotions
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {stats.topEmotions.map(([emotion, count]) => (
                      <Badge key={emotion} variant="secondary" className="gap-1">
                        {emotion}
                        <span className="text-muted-foreground">({count})</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Tags */}
              {stats.topTags.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    Top Tags
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {stats.topTags.map(([tag, count]) => (
                      <Badge key={tag} variant="outline" className="gap-1">
                        #{tag}
                        <span className="text-muted-foreground">({count})</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Most Traded Symbols */}
            {stats.topSymbols.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Most Tracked Symbols
                </h4>
                <div className="flex flex-wrap gap-2">
                  {stats.topSymbols.map(([symbol, count]) => (
                    <Badge key={symbol} className="gap-1 bg-primary/10 text-primary border-primary/20">
                      {symbol}
                      <span className="opacity-70">({count})</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* AI Insights */}
            <div className="pt-4 border-t border-border">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-warning" />
                Period Insights
              </h4>
              <div className="space-y-2">
                {insights.map((insight, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm">
                    <Activity className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <span>{insight}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default JournalSummary;
