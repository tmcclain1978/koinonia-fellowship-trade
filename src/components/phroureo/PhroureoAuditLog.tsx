import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  History, 
  ChevronDown, 
  ChevronUp,
  AlertCircle,
  TrendingUp,
  Shield,
  Pause,
  Play,
  Edit
} from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { PhroureoStrategyEvent, EventType } from "./phroureoTypes";

interface PhroureoAuditLogProps {
  strategyId: string;
  maxHeight?: number;
  initialExpanded?: boolean;
}

const EVENT_ICONS: Record<EventType, React.ReactNode> = {
  STATE_CHANGE: <Shield className="w-3 h-3" />,
  STOP_UPDATE: <TrendingUp className="w-3 h-3" />,
  TRIGGER_HIT: <AlertCircle className="w-3 h-3" />,
  TRAIL_STEP: <TrendingUp className="w-3 h-3" />,
  ERROR: <AlertCircle className="w-3 h-3 text-destructive" />,
  MANUAL_EDIT: <Edit className="w-3 h-3" />,
  CREATED: <Shield className="w-3 h-3" />,
  PAUSED: <Pause className="w-3 h-3" />,
  RESUMED: <Play className="w-3 h-3" />,
};

const EVENT_COLORS: Record<EventType, string> = {
  STATE_CHANGE: 'bg-blue-500/10 text-blue-600',
  STOP_UPDATE: 'bg-green-500/10 text-green-600',
  TRIGGER_HIT: 'bg-yellow-500/10 text-yellow-600',
  TRAIL_STEP: 'bg-emerald-500/10 text-emerald-600',
  ERROR: 'bg-red-500/10 text-red-600',
  MANUAL_EDIT: 'bg-purple-500/10 text-purple-600',
  CREATED: 'bg-blue-500/10 text-blue-600',
  PAUSED: 'bg-orange-500/10 text-orange-600',
  RESUMED: 'bg-green-500/10 text-green-600',
};

export function PhroureoAuditLog({ 
  strategyId, 
  maxHeight = 300,
  initialExpanded = false 
}: PhroureoAuditLogProps) {
  const [events, setEvents] = useState<PhroureoStrategyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(initialExpanded);

  useEffect(() => {
    fetchEvents();
    
    // Subscribe to realtime updates
    const channel = supabase
      .channel(`phroureo-events-${strategyId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'phroureo_strategy_events',
          filter: `strategy_id=eq.${strategyId}`,
        },
        (payload) => {
          setEvents(prev => [payload.new as PhroureoStrategyEvent, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [strategyId]);

  const fetchEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('phroureo_strategy_events')
        .select('*')
        .eq('strategy_id', strategyId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setEvents((data || []) as PhroureoStrategyEvent[]);
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatEventMessage = (event: PhroureoStrategyEvent): string => {
    if (event.reason) return event.reason;

    switch (event.event_type) {
      case 'CREATED':
        return 'Strategy created and armed';
      case 'STATE_CHANGE':
        return `State changed from ${event.previous_state} to ${event.new_state}`;
      case 'STOP_UPDATE':
        return `Stop updated from $${event.previous_stop?.toFixed(2) ?? '–'} to $${event.new_stop?.toFixed(2) ?? '–'}`;
      case 'TRIGGER_HIT':
        return `Profit trigger hit at $${event.trigger_price?.toFixed(2) ?? '–'}`;
      case 'TRAIL_STEP':
        return `Trail step: stop moved to $${event.new_stop?.toFixed(2) ?? '–'}`;
      case 'PAUSED':
        return 'Strategy paused';
      case 'RESUMED':
        return 'Strategy resumed';
      case 'MANUAL_EDIT':
        return 'Strategy manually edited';
      case 'ERROR':
        return `Error: ${event.reason || 'Unknown error'}`;
      default:
        return event.event_type;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-4">
          <div className="text-center text-muted-foreground text-sm">
            Loading events...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="py-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="w-4 h-4" />
            Audit Log
            <Badge variant="secondary" className="ml-2">
              {events.length}
            </Badge>
          </CardTitle>
          <Button variant="ghost" size="sm">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </CardHeader>
      
      {expanded && (
        <CardContent className="pt-0">
          {events.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-4">
              No events recorded yet
            </p>
          ) : (
            <ScrollArea style={{ maxHeight }}>
              <div className="space-y-2">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 text-sm border-l-2 border-border pl-3 py-2"
                  >
                    <div className={`p-1.5 rounded ${EVENT_COLORS[event.event_type]}`}>
                      {EVENT_ICONS[event.event_type]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {formatEventMessage(event)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(event.created_at), 'MMM d, yyyy h:mm:ss a')}
                      </p>
                    </div>
                    {event.trigger_price && (
                      <Badge variant="outline" className="shrink-0 text-xs">
                        @${event.trigger_price.toFixed(2)}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      )}
    </Card>
  );
}
