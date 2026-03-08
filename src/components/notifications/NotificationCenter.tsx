import { useState, useEffect, useCallback } from "react";
import { Bell, X, Check, AlertTriangle, TrendingUp, DollarSign, Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";

export interface AppNotification {
  id: string;
  type: "price_alert" | "order_fill" | "risk_warning" | "system" | "info";
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

const iconMap = {
  price_alert: TrendingUp,
  order_fill: DollarSign,
  risk_warning: AlertTriangle,
  system: Shield,
  info: Bell,
};

const colorMap = {
  price_alert: "text-primary",
  order_fill: "text-green-500",
  risk_warning: "text-destructive",
  system: "text-yellow-500",
  info: "text-muted-foreground",
};

// In-memory listeners for instant UI updates
let listeners: (() => void)[] = [];
let memoryNotifs: AppNotification[] = [];

export const pushNotification = async (notif: Omit<AppNotification, "id" | "timestamp" | "read">) => {
  const newNotif: AppNotification = {
    ...notif,
    id: crypto.randomUUID(),
    timestamp: new Date(),
    read: false,
  };
  memoryNotifs = [newNotif, ...memoryNotifs].slice(0, 50);
  listeners.forEach((l) => l());

  // Persist to database (best-effort)
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("user_notifications").insert({
        id: newNotif.id,
        user_id: user.id,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        read: false,
      });
    }
  } catch (e) {
    console.warn("Failed to persist notification:", e);
  }
};

const useNotifications = () => {
  const [, forceUpdate] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // Load from DB on mount
  useEffect(() => {
    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoaded(true); return; }

        const { data } = await supabase
          .from("user_notifications")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50);

        if (data && data.length > 0) {
          const dbNotifs: AppNotification[] = data.map((n: any) => ({
            id: n.id,
            type: n.type as AppNotification["type"],
            title: n.title,
            message: n.message,
            timestamp: new Date(n.created_at),
            read: n.read,
          }));
          // Merge: DB notifications + any in-memory ones not yet in DB
          const dbIds = new Set(dbNotifs.map((n) => n.id));
          const memOnly = memoryNotifs.filter((n) => !dbIds.has(n.id));
          memoryNotifs = [...memOnly, ...dbNotifs].slice(0, 50);
          listeners.forEach((l) => l());
        }
      } catch (e) {
        console.warn("Failed to load notifications:", e);
      }
      setLoaded(true);
    };
    load();
  }, []);

  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    listeners.push(listener);
    return () => { listeners = listeners.filter((l) => l !== listener); };
  }, []);

  return { notifications: memoryNotifs, loaded };
};

export const NotificationCenter = () => {
  const { notifications: allNotifications, loaded } = useNotifications();
  const [open, setOpen] = useState(false);
  const unreadCount = allNotifications.filter((n) => !n.read).length;

  const markAllRead = useCallback(async () => {
    memoryNotifs = memoryNotifs.map((n) => ({ ...n, read: true }));
    listeners.forEach((l) => l());
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("user_notifications")
          .update({ read: true })
          .eq("user_id", user.id)
          .eq("read", false);
      }
    } catch (e) { console.warn("Failed to mark all read:", e); }
  }, []);

  const markRead = useCallback(async (id: string) => {
    memoryNotifs = memoryNotifs.map((n) => n.id === id ? { ...n, read: true } : n);
    listeners.forEach((l) => l());
    try {
      await supabase.from("user_notifications").update({ read: true }).eq("id", id);
    } catch (e) { console.warn("Failed to mark read:", e); }
  }, []);

  const clearAll = useCallback(async () => {
    memoryNotifs = [];
    listeners.forEach((l) => l());
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("user_notifications").delete().eq("user_id", user.id);
      }
    } catch (e) { console.warn("Failed to clear notifications:", e); }
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative px-2">
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h4 className="font-semibold text-sm">Notifications</h4>
          <div className="flex gap-1">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={markAllRead}>
                <Check className="w-3 h-3 mr-1" /> Read all
              </Button>
            )}
            {allNotifications.length > 0 && (
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={clearAll}>
                <X className="w-3 h-3 mr-1" /> Clear
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="max-h-80">
          {!loaded ? (
            <div className="p-6 text-center">
              <Loader2 className="w-4 h-4 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : allNotifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            allNotifications.map((notif) => {
              const Icon = iconMap[notif.type];
              return (
                <button
                  key={notif.id}
                  onClick={() => markRead(notif.id)}
                  className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/50 transition-colors ${
                    !notif.read ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="flex gap-3">
                    <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${colorMap[notif.type]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{notif.title}</p>
                        {!notif.read && <div className="w-1.5 h-1.5 bg-primary rounded-full shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{notif.message}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1">
                        {notif.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
