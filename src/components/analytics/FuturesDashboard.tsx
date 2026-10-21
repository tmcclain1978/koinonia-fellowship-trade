import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Bar, ComposedChart, Line } from "recharts";
import { TrendingUp, Activity, Calendar, Fuel, CircleDollarSign, Gem, Building2, RefreshCw, AlertTriangle } from "lucide-react";
import { schwabApi } from "@/lib/schwabApi";
import { FUTURES_ROOTS, buildCurve, curveShape, upcomingContracts, type CurvePoint } from "@/lib/futures/futuresCurve";

const ICONS: Record<string, typeof Activity> = { ES: TrendingUp, NQ: Activity, YM: Building2, CL: Fuel, GC: Gem, ZB: CircleDollarSign };
const CONTRACTS_PER_ROOT = 6;

/** One Schwab quote request for every contract month of every market on the page. */
async function loadCurves(): Promise<Record<string, CurvePoint[]>> {
  const now = new Date();
  const months = Object.fromEntries(FUTURES_ROOTS.map((r) => [r.root, upcomingContracts(r, now, CONTRACTS_PER_ROOT)]));
  const symbols = Object.values(months).flat().map((c) => c.symbol);
  const quotes = await schwabApi.getQuotes(symbols);
  return Object.fromEntries(FUTURES_ROOTS.map((r) => [r.root, buildCurve(months[r.root], quotes)]));
}

const fmt = (v: number | undefined, digits = 2) => (v === undefined ? "—" : v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }));
const fmtInt = (v: number | undefined) => (v === undefined ? "—" : Math.round(v).toLocaleString());
const day = (ms?: number) => (ms ? new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—");

export function FuturesDashboard() {
  const [selected, setSelected] = useState("ES");
  const { data, isLoading, isFetching, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["futures-curves"],
    queryFn: loadCurves,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const root = FUTURES_ROOTS.find((r) => r.root === selected)!;
  const curve = data?.[selected] ?? [];
  const shape = curveShape(curve);
  const front = curve[0];
  const anyData = data && Object.values(data).some((c) => c.length > 0);
  const Icon = ICONS[selected] ?? Activity;

  const expirations = useMemo(() => {
    if (!data) return [];
    const now = Date.now();
    return FUTURES_ROOTS.flatMap((r) => (data[r.root] ?? []).filter((p) => p.expiration && p.expiration > now).map((p) => ({ ...p, root: r })))
      .sort((a, b) => a.expiration! - b.expiration!)
      .slice(0, 10);
  }, [data]);

  return (
    <div className="space-y-6" data-testid="futures-dashboard">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div className="flex flex-wrap gap-2">
              {FUTURES_ROOTS.map((r) => {
                const I = ICONS[r.root] ?? Activity;
                return (
                  <Button key={r.root} variant={selected === r.root ? "default" : "outline"} size="sm" onClick={() => setSelected(r.root)}>
                    <I className="w-4 h-4 mr-1" />
                    {r.root}
                  </Button>
                );
              })}
            </div>
            <div className="flex items-center gap-3">
              {dataUpdatedAt > 0 && <span className="text-xs text-muted-foreground">Schwab quotes · {new Date(dataUpdatedAt).toLocaleTimeString()}</span>}
              <Button onClick={() => void refetch()} variant="outline" disabled={isFetching}>
                <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && <p className="text-sm text-muted-foreground">Loading futures prices from Schwab…</p>}

      {!isLoading && (error || !anyData) && (
        <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm" data-testid="futures-unavailable">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
          <div className="space-y-2">
            <p>
              Futures prices come straight from your Schwab account, and none came back
              {error ? ` (${(error as Error).message})` : ""}. Make sure Schwab is connected and your account is approved for futures quotes.
            </p>
            <Button asChild size="sm" variant="outline"><Link to="/settings">Go to Settings</Link></Button>
          </div>
        </div>
      )}

      {anyData && curve.length === 0 && (
        <p className="text-sm text-muted-foreground">Schwab didn't return any {root.name} contracts right now.</p>
      )}

      {anyData && front && (
        <>
          <div className="grid md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Icon className="w-4 h-4" />
                  <span className="text-sm">{root.name} · {front.label}</span>
                </div>
                <div className="text-3xl font-bold" data-testid="front-price">{fmt(front.price, root.digits)}</div>
                {front.netPercentChange !== undefined && (
                  <span className={`text-sm ${front.netPercentChange >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {front.netPercentChange >= 0 ? "+" : ""}{front.netPercentChange.toFixed(2)}% today
                  </span>
                )}
                <Badge variant="outline" className="mt-1 ml-2">{root.category}</Badge>
              </CardContent>
            </Card>

            <Card className={shape?.shape === "backwardation" ? "border-red-500/30" : "border-green-500/30"}>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground mb-1">Curve shape</div>
                {shape ? (
                  <>
                    <div className={`text-2xl font-bold ${shape.shape === "backwardation" ? "text-red-400" : "text-green-400"}`} data-testid="curve-shape">
                      {shape.shape === "contango" ? "Contango" : shape.shape === "backwardation" ? "Backwardation" : "Flat"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {shape.shape === "contango" ? "Later months cost more than now." : shape.shape === "backwardation" ? "Later months cost less than now (often a tight supply sign)." : "Later months cost about the same."}{" "}
                      Last vs. first: {shape.spreadPct >= 0 ? "+" : ""}{shape.spreadPct.toFixed(2)}%
                      {shape.rollYieldPct !== null && <> · roll ≈ {shape.rollYieldPct >= 0 ? "+" : ""}{shape.rollYieldPct.toFixed(1)}%/yr</>}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">Needs at least two contract months.</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground mb-1">Open interest (contracts shown)</div>
                <div className="text-2xl font-bold">{curve.some((p) => p.openInterest !== undefined) ? fmtInt(curve.reduce((s, p) => s + (p.openInterest ?? 0), 0)) : "—"}</div>
                <div className="text-xs text-muted-foreground mt-1">Contracts still open (not closed out)</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground mb-1">Front month volume</div>
                <div className="text-2xl font-bold">{fmtInt(front.volume)}</div>
                <div className="text-xs text-muted-foreground mt-1">Contracts traded this session</div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="term-structure" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="term-structure">Term structure</TabsTrigger>
              <TabsTrigger value="expirations">Expirations</TabsTrigger>
            </TabsList>

            <TabsContent value="term-structure">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    {root.name}: price by contract month
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={360}>
                    <ComposedChart data={curve}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" />
                      <YAxis yAxisId="price" stroke="hsl(var(--muted-foreground))" domain={["auto", "auto"]} tickFormatter={(v) => fmt(v, root.digits)} />
                      <YAxis yAxisId="oi" orientation="right" stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => fmtInt(v)} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                        formatter={(v: number, name: string) => [name === "price" ? fmt(v, root.digits) : fmtInt(v), name === "price" ? "Price" : "Open interest"]}
                      />
                      <Bar yAxisId="oi" dataKey="openInterest" fill="hsl(var(--primary) / 0.25)" />
                      <Line yAxisId="price" type="monotone" dataKey="price" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <div className="mt-4 border rounded-md overflow-hidden text-sm" data-testid="curve-table">
                    <div className="grid grid-cols-5 gap-2 px-3 py-1.5 bg-muted/50 text-xs font-medium text-muted-foreground">
                      <span>Contract</span><span className="text-right">Price</span><span className="text-right">Open interest</span><span className="text-right">Volume</span><span className="text-right">Expires</span>
                    </div>
                    {curve.map((p) => (
                      <div key={p.symbol} className="grid grid-cols-5 gap-2 px-3 py-1.5 font-mono text-xs border-t">
                        <span>{p.symbol}</span>
                        <span className="text-right">{fmt(p.price, root.digits)}</span>
                        <span className="text-right">{fmtInt(p.openInterest)}</span>
                        <span className="text-right">{fmtInt(p.volume)}</span>
                        <span className="text-right">{day(p.expiration)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="expirations">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Next expirations (all markets)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {expirations.length === 0 && <p className="text-sm text-muted-foreground">Schwab didn't report expiration dates.</p>}
                  {expirations.map((e) => {
                    const days = Math.ceil((e.expiration! - Date.now()) / 86_400_000);
                    return (
                      <div key={e.symbol} className="flex items-center justify-between p-3 rounded-lg border">
                        <div>
                          <div className="font-medium">{e.root.name} · {e.label}</div>
                          <div className="text-xs text-muted-foreground">{e.symbol} · {day(e.expiration)}</div>
                        </div>
                        <Badge variant={days <= 7 ? "destructive" : "outline"}>{days} day{days === 1 ? "" : "s"}</Badge>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
