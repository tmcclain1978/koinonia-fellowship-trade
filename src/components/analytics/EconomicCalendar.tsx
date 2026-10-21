import { useState, useMemo, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Calendar, Clock, TrendingUp, TrendingDown, Minus, 
  Globe, Filter, RefreshCw, Flag, AlertTriangle
} from "lucide-react";

interface EconomicEvent {
  id: string;
  date: Date;
  time: string;
  country: string;
  countryCode: string;
  event: string;
  importance: 'high' | 'medium' | 'low';
  previous: string;
  forecast: string;
  actual?: string;
  impact?: 'bullish' | 'bearish' | 'neutral';
}

const etTime = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });

/** Real events from the fetch-economic-calendar function (Financial Modeling Prep). */
function useEconomicEvents() {
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: e } = await supabase.functions.invoke('fetch-economic-calendar', { body: {} });
    if (e || data?.error) {
      setError(e?.message ?? data.error);
      setEvents([]);
    } else {
      setError(null);
      setEvents(((data?.events ?? []) as Array<{ id: string; at: string; country: string; event: string; importance: EconomicEvent['importance']; previous: string; forecast: string; actual?: string }>).map((x) => ({
        id: x.id,
        date: new Date(x.at),
        time: `${etTime.format(new Date(x.at))} ET`,
        country: x.country,
        countryCode: x.country,
        event: x.event,
        importance: x.importance,
        previous: x.previous || '—',
        forecast: x.forecast || '—',
        actual: x.actual,
      })));
    }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { events, loading, error, reload: load };
}

const countryFlags: Record<string, string> = {
  'US': '🇺🇸',
  'EU': '🇪🇺',
  'UK': '🇬🇧',
  'GB': '🇬🇧',
  'JP': '🇯🇵',
  'CN': '🇨🇳',
  'CA': '🇨🇦',
  'AU': '🇦🇺',
  'CH': '🇨🇭',
};

export function EconomicCalendar() {
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  
  const { events, loading, error, reload } = useEconomicEvents();
  
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      if (filter !== 'all' && event.importance !== filter) return false;
      if (countryFilter !== 'all' && event.country !== countryFilter) return false;
      return true;
    });
  }, [events, filter, countryFilter]);
  
  // Group events by date
  const groupedEvents = useMemo(() => {
    const groups: Record<string, EconomicEvent[]> = {};
    
    filteredEvents.forEach(event => {
      const dateKey = event.date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'short', 
        day: 'numeric' 
      });
      
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(event);
    });
    
    return groups;
  }, [filteredEvents]);
  
  const uniqueCountries = useMemo(() => {
    return [...new Set(events.map(e => e.country))];
  }, [events]);
  
  const getImportanceColor = (importance: string) => {
    switch (importance) {
      case 'high': return 'bg-red-500 text-white';
      case 'medium': return 'bg-yellow-500 text-black';
      case 'low': return 'bg-gray-500 text-white';
      default: return 'bg-gray-500';
    }
  };
  
  const getImpactIcon = (impact?: string) => {
    switch (impact) {
      case 'bullish': return <TrendingUp className="w-4 h-4 text-green-400" />;
      case 'bearish': return <TrendingDown className="w-4 h-4 text-red-400" />;
      default: return <Minus className="w-4 h-4 text-muted-foreground" />;
    }
  };

  // High impact events this week
  const highImpactThisWeek = events.filter(e => {
    const today = new Date();
    const weekFromNow = new Date();
    weekFromNow.setDate(today.getDate() + 7);
    return e.importance === 'high' && e.date >= today && e.date <= weekFromNow;
  });

  return (
    <div className="space-y-6">
      {/* Data status */}
      {error ? (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 flex items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">Economic calendar unavailable: {error}</p>
          <Button size="sm" variant="outline" onClick={() => void reload()}><RefreshCw className="w-3 h-3 mr-1" />Retry</Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {loading ? 'Loading economic events…' : `${events.length} events from Financial Modeling Prep. Times in New York time.`}
        </p>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={filter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('all')}
              >
                All Events
              </Button>
              <Button
                variant={filter === 'high' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('high')}
                className={filter === 'high' ? 'bg-red-500 hover:bg-red-600' : ''}
              >
                <AlertTriangle className="w-3 h-3 mr-1" />
                High Impact
              </Button>
              <Button
                variant={filter === 'medium' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('medium')}
              >
                Medium
              </Button>
              <Button
                variant={filter === 'low' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('low')}
              >
                Low
              </Button>
            </div>
            
            <div className="flex gap-2">
              {uniqueCountries.map(country => (
                <Button
                  key={country}
                  variant={countryFilter === country ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCountryFilter(countryFilter === country ? 'all' : country)}
                >
                  {countryFlags[country] || '🌍'} {country}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* High Impact Alert */}
      {highImpactThisWeek.length > 0 && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              High Impact Events This Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {highImpactThisWeek.map(event => (
                <Badge 
                  key={event.id} 
                  variant="outline" 
                  className="border-red-500/50 py-1.5 px-3"
                >
                  <span className="mr-2">{countryFlags[event.country]}</span>
                  <span className="font-medium">{event.event}</span>
                  <span className="ml-2 text-muted-foreground">
                    {event.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Events List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Economic Calendar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {Object.entries(groupedEvents).map(([dateKey, dayEvents]) => (
              <div key={dateKey}>
                <h3 className="font-semibold text-lg mb-3 flex items-center gap-2 sticky top-0 bg-background py-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  {dateKey}
                </h3>
                
                <div className="space-y-2">
                  {dayEvents.map(event => (
                    <div 
                      key={event.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        event.importance === 'high' 
                          ? 'border-red-500/30 bg-red-500/5' 
                          : 'border-border bg-card/50'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-2xl">
                          {countryFlags[event.country] || '🌍'}
                        </div>
                        
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{event.event}</span>
                            <Badge 
                              className={`text-xs ${getImportanceColor(event.importance)}`}
                            >
                              {event.importance}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {event.time}
                            </span>
                            <span>{event.country}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-6 text-sm">
                        <div className="text-center">
                          <div className="text-muted-foreground text-xs">Previous</div>
                          <div className="font-medium">{event.previous}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-muted-foreground text-xs">Forecast</div>
                          <div className="font-medium text-primary">{event.forecast}</div>
                        </div>
                        <div className="text-center min-w-[60px]">
                          <div className="text-muted-foreground text-xs">Actual</div>
                          <div className="font-medium flex items-center justify-center gap-1">
                            {event.actual || '--'}
                            {event.impact && getImpactIcon(event.impact)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          
          {filteredEvents.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No events match your filters</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardContent className="pt-6">
          <h4 className="font-semibold mb-3">Impact Legend</h4>
          <div className="flex flex-wrap gap-6 text-sm">
            <div className="flex items-center gap-2">
              <Badge className="bg-red-500">High</Badge>
              <span className="text-muted-foreground">Major market-moving events</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-yellow-500 text-black">Medium</Badge>
              <span className="text-muted-foreground">Moderate market impact</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-gray-500">Low</Badge>
              <span className="text-muted-foreground">Minor market impact</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-400" />
              <span className="text-muted-foreground">Bullish for USD</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-400" />
              <span className="text-muted-foreground">Bearish for USD</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
