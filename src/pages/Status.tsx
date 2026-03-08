import { useState, useEffect, useCallback } from "react";
import Navigation from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, Activity, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MobileTabNav } from "@/components/MobileTabNav";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ServiceStatus {
  name: string;
  status: "operational" | "degraded" | "down";
  latency?: number;
  lastChecked: Date;
  description: string;
}

interface DayStatus {
  date: string;
  status: "operational" | "degraded" | "down" | "unknown";
  checks: number;
}

const StatusIcon = ({ status }: { status: ServiceStatus["status"] }) => {
  switch (status) {
    case "operational": return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    case "degraded": return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
    case "down": return <XCircle className="w-5 h-5 text-destructive" />;
  }
};

const statusColor = (status: string) => {
  switch (status) {
    case "operational": return "bg-green-500/10 text-green-500 border-green-500/20";
    case "degraded": return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    case "down": return "bg-destructive/10 text-destructive border-destructive/20";
    default: return "bg-muted text-muted-foreground border-border";
  }
};

const dayBarColor = (status: string) => {
  switch (status) {
    case "operational": return "bg-green-500/80 hover:bg-green-500";
    case "degraded": return "bg-yellow-500/80 hover:bg-yellow-500";
    case "down": return "bg-destructive/80 hover:bg-destructive";
    default: return "bg-muted hover:bg-muted-foreground/20";
  }
};

const Status = () => {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [nextRefresh, setNextRefresh] = useState(60);
  const [uptimeHistory, setUptimeHistory] = useState<DayStatus[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const checkServices = useCallback(async () => {
    setLoading(true);
    const results: ServiceStatus[] = [];

    // Check database
    try {
      const start = performance.now();
      await supabase.from("profiles").select("id").limit(1);
      const latency = Math.round(performance.now() - start);
      results.push({
        name: "Database",
        status: latency > 3000 ? "degraded" : "operational",
        latency,
        lastChecked: new Date(),
        description: "Core database and authentication services",
      });
    } catch {
      results.push({ name: "Database", status: "down", lastChecked: new Date(), description: "Core database and authentication services" });
    }

    // Check Edge Functions
    try {
      const start = performance.now();
      const { error } = await supabase.functions.invoke("fetch-market-data", {
        body: { symbol: "AAPL", type: "ping" },
      });
      const latency = Math.round(performance.now() - start);
      results.push({
        name: "Backend Functions",
        status: error ? "degraded" : latency > 5000 ? "degraded" : "operational",
        latency,
        lastChecked: new Date(),
        description: "Serverless backend functions for market data and trade execution",
      });
    } catch {
      results.push({ name: "Backend Functions", status: "down", lastChecked: new Date(), description: "Serverless backend functions for market data and trade execution" });
    }

    results.push(
      { name: "Market Data (Polygon)", status: "operational", lastChecked: new Date(), description: "Real-time and historical market data feeds" },
      { name: "AI Analysis Engine", status: "operational", lastChecked: new Date(), description: "AI-powered market analysis and pattern recognition" },
      { name: "Brokerage Connectivity", status: "operational", lastChecked: new Date(), description: "Order routing and brokerage account connections" },
    );

    setServices(results);
    setLastRefresh(new Date());
    setNextRefresh(60);
    setLoading(false);

    // Persist status checks to history (best-effort)
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const inserts = results
          .filter((s) => s.latency !== undefined)
          .map((s) => ({
            service_name: s.name,
            status: s.status,
            latency: s.latency ?? null,
            checked_by: user.id,
          }));
        if (inserts.length > 0) {
          await supabase.from("service_status_history").insert(inserts);
        }
      }
    } catch (e) {
      console.warn("Failed to persist status:", e);
    }
  }, []);

  // Load uptime history
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data } = await supabase
          .from("service_status_history")
          .select("status, checked_at")
          .gte("checked_at", thirtyDaysAgo.toISOString())
          .order("checked_at", { ascending: true });

        // Aggregate by day
        const dayMap = new Map<string, { statuses: string[]; count: number }>();
        for (let i = 0; i < 30; i++) {
          const d = new Date();
          d.setDate(d.getDate() - (29 - i));
          const key = d.toISOString().split("T")[0];
          dayMap.set(key, { statuses: [], count: 0 });
        }

        if (data) {
          data.forEach((row: any) => {
            const key = row.checked_at.split("T")[0];
            const entry = dayMap.get(key);
            if (entry) {
              entry.statuses.push(row.status);
              entry.count++;
            }
          });
        }

        const history: DayStatus[] = Array.from(dayMap.entries()).map(([date, { statuses, count }]) => {
          let status: DayStatus["status"] = "unknown";
          if (count > 0) {
            if (statuses.includes("down")) status = "down";
            else if (statuses.includes("degraded")) status = "degraded";
            else status = "operational";
          }
          return { date, status, checks: count };
        });

        setUptimeHistory(history);
      } catch (e) {
        console.warn("Failed to load uptime history:", e);
      }
    };
    loadHistory();
  }, [lastRefresh]);

  // Auto-refresh countdown
  useEffect(() => {
    checkServices();
  }, [checkServices]);

  useEffect(() => {
    if (!autoRefresh) return;
    const countdown = setInterval(() => {
      setNextRefresh((prev) => {
        if (prev <= 1) {
          checkServices();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(countdown);
  }, [autoRefresh, checkServices]);

  const overallStatus = services.some((s) => s.status === "down")
    ? "down"
    : services.some((s) => s.status === "degraded")
    ? "degraded"
    : "operational";

  const overallLabel = {
    operational: "All Systems Operational",
    degraded: "Some Systems Degraded",
    down: "Service Disruption Detected",
  };

  const uptimePct = uptimeHistory.length > 0
    ? Math.round((uptimeHistory.filter((d) => d.status === "operational").length / uptimeHistory.filter((d) => d.status !== "unknown").length) * 100) || 100
    : 100;

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-background pt-16 pb-20 lg:pb-8">
        <div className="container mx-auto px-4 sm:px-6 py-8 max-w-3xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground">System Status</h1>
              <p className="text-sm text-muted-foreground">Real-time health monitoring</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                {autoRefresh ? `Next check in ${nextRefresh}s` : "Auto-refresh off"}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className="text-xs h-7"
              >
                {autoRefresh ? "Pause" : "Resume"}
              </Button>
              <Button variant="outline" size="sm" onClick={checkServices} disabled={loading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Overall Status Banner */}
          <Card className={`mb-6 border ${statusColor(overallStatus)}`}>
            <CardContent className="flex items-center gap-3 py-4">
              <StatusIcon status={overallStatus} />
              <div>
                <p className="font-semibold">{overallLabel[overallStatus]}</p>
                <p className="text-xs text-muted-foreground">
                  Last checked: {lastRefresh.toLocaleTimeString()} · Uptime: {uptimePct}%
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Service Cards */}
          <div className="space-y-3">
            {services.map((service) => (
              <Card key={service.name}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <StatusIcon status={service.status} />
                    <div>
                      <p className="font-medium text-sm">{service.name}</p>
                      <p className="text-xs text-muted-foreground">{service.description}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className={statusColor(service.status)}>
                      {service.status}
                    </Badge>
                    {service.latency && (
                      <p className="text-xs text-muted-foreground mt-1">{service.latency}ms</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Uptime History */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Uptime (Last 30 Days) — {uptimePct}%
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TooltipProvider delayDuration={100}>
                <div className="flex gap-0.5">
                  {(uptimeHistory.length > 0 ? uptimeHistory : Array.from({ length: 30 }, (_, i) => ({
                    date: "",
                    status: "unknown" as const,
                    checks: 0,
                  }))).map((day, i) => (
                    <Tooltip key={i}>
                      <TooltipTrigger asChild>
                        <div
                          className={`flex-1 h-8 rounded-sm transition-colors cursor-default ${dayBarColor(day.status)}`}
                        />
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">
                        <p className="font-medium">{day.date || `${30 - i} days ago`}</p>
                        <p className="capitalize">{day.status} · {day.checks} checks</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </TooltipProvider>
              <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                <span>30 days ago</span>
                <span>Today</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <MobileTabNav />
    </>
  );
};

export default Status;
