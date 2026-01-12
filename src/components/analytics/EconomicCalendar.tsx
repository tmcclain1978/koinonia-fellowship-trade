import { useState, useMemo } from "react";
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

// Generate mock economic calendar data
const generateMockEvents = (): EconomicEvent[] => {
  const events: EconomicEvent[] = [];
  const now = new Date();
  
  const eventTemplates = [
    { country: 'US', event: 'Non-Farm Payrolls', importance: 'high' as const, prev: '216K', forecast: '180K' },
    { country: 'US', event: 'CPI m/m', importance: 'high' as const, prev: '0.3%', forecast: '0.2%' },
    { country: 'US', event: 'FOMC Rate Decision', importance: 'high' as const, prev: '5.50%', forecast: '5.50%' },
    { country: 'US', event: 'GDP q/q', importance: 'high' as const, prev: '3.3%', forecast: '2.5%' },
    { country: 'US', event: 'Retail Sales m/m', importance: 'medium' as const, prev: '0.6%', forecast: '0.4%' },
    { country: 'US', event: 'Initial Jobless Claims', importance: 'medium' as const, prev: '187K', forecast: '195K' },
    { country: 'US', event: 'ISM Manufacturing PMI', importance: 'medium' as const, prev: '49.1', forecast: '49.5' },
    { country: 'US', event: 'Consumer Confidence', importance: 'medium' as const, prev: '114.8', forecast: '112.0' },
    { country: 'EU', event: 'ECB Rate Decision', importance: 'high' as const, prev: '4.50%', forecast: '4.50%' },
    { country: 'EU', event: 'CPI y/y', importance: 'high' as const, prev: '2.8%', forecast: '2.6%' },
    { country: 'UK', event: 'BoE Rate Decision', importance: 'high' as const, prev: '5.25%', forecast: '5.25%' },
    { country: 'JP', event: 'BoJ Rate Decision', importance: 'high' as const, prev: '-0.10%', forecast: '-0.10%' },
    { country: 'CN', event: 'GDP y/y', importance: 'high' as const, prev: '5.2%', forecast: '4.8%' },
    { country: 'US', event: 'Core PPI m/m', importance: 'low' as const, prev: '0.0%', forecast: '0.2%' },
    { country: 'US', event: 'Empire State Manufacturing', importance: 'low' as const, prev: '-14.5', forecast: '-5.0' },
  ];
  
  // Generate events for next 14 days
  for (let day = 0; day < 14; day++) {
    const date = new Date(now);
    date.setDate(date.getDate() + day);
    
    // Skip weekends
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    
    // Add 1-3 events per day
    const numEvents = Math.floor(Math.random() * 3) + 1;
    for (let e = 0; e < numEvents; e++) {
      const template = eventTemplates[Math.floor(Math.random() * eventTemplates.length)];
      const hours = 8 + Math.floor(Math.random() * 8);
      const minutes = Math.random() > 0.5 ? 30 : 0;
      
      events.push({
        id: `${day}-${e}`,
        date: new Date(date),
        time: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ET`,
        country: template.country,
        countryCode: template.country,
        event: template.event,
        importance: template.importance,
        previous: template.prev,
        forecast: template.forecast,
        actual: day < 0 ? template.forecast : undefined,
        impact: day < 0 ? (Math.random() > 0.5 ? 'bullish' : 'bearish') : undefined,
      });
    }
  }
  
  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
};

const countryFlags: Record<string, string> = {
  'US': '🇺🇸',
  'EU': '🇪🇺',
  'UK': '🇬🇧',
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
  
  const events = useMemo(() => generateMockEvents(), []);
  
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
