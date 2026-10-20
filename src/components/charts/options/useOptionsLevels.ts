/**
 * Fetches the option chain for the charted symbol, computes the levels, and
 * draws them. Only real Schwab data is drawn: if the chain comes back as
 * simulated (no Schwab connection), nothing is drawn and the user is told.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Chart, OverlayCreate } from "klinecharts";
import { supabase } from "@/integrations/supabase/client";
import type { OptionsLevelPrefs } from "../state/chartPrefs";
import { toEtDateString } from "../historyPaging";
import {
  parseChain, expirations as listExpirations, expectedMove, gammaLevels, maxPain, unusualActivity, putCallRatios,
  type OptionContract, type ExpectedMove, type GammaLevels, type UnusualContract,
} from "./optionsLevels";
import { OPTIONS_LEVELS, OPTIONS_GROUP, registerOptionsLevelsOverlay, type OptionsLevelsData } from "./optionsLevelsOverlay";

registerOptionsLevelsOverlay();

const REFRESH_MS = 5 * 60_000;
const WINDOW_DAYS = 45;
const STRIKE_COUNT = 40;
const OVERLAY_ID = "options_levels";

export interface OptionsSummary {
  spot: number;
  expirations: string[];
  expiration: string | null;
  em: ExpectedMove | null;
  gamma: GammaLevels | null;
  maxPain: number | null;
  unusual: UnusualContract[];
  pcr: { volume: number | null; openInterest: number | null };
}

export interface OptionsStatus {
  loading: boolean;
  error: string | null;
  asOf: number | null;
  delayed: boolean;
}

const fmtMoney = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1e9 ? `${(a / 1e9).toFixed(1)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(0)}K` : a.toFixed(0);
  return `${v < 0 ? "-" : ""}$${s}`;
};
const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
const fmtVol = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v));

/** Nearest expiration at least a few hours away (avoids a nearly-expired 0DTE). */
export function pickExpiration(chain: OptionContract[], wanted: string): string | null {
  const exps = listExpirations(chain);
  if (wanted && exps.includes(wanted)) return wanted;
  const fourHours = 4 / (365 * 24);
  return exps.find((e) => (chain.find((c) => c.expiration === e)?.t ?? 0) > fourHours) ?? exps[0] ?? null;
}

export function buildOverlayData(s: OptionsSummary, prefs: OptionsLevelPrefs): OptionsLevelsData {
  const data: OptionsLevelsData = { lines: [], tags: [] };
  if (prefs.expectedMove && s.em) {
    data.band = {
      upper: s.em.upper,
      lower: s.em.lower,
      label: `expected move ${shortDate(s.em.expiration)} ±$${s.em.move.toFixed(2)} (1σ)`,
    };
  }
  if (prefs.gamma && s.gamma) {
    if (s.gamma.callWall !== null) data.lines.push({ price: s.gamma.callWall, label: `Call wall ${s.gamma.callWall}`, color: "#16a34a" });
    if (s.gamma.putWall !== null) data.lines.push({ price: s.gamma.putWall, label: `Put wall ${s.gamma.putWall}`, color: "#dc2626" });
    if (s.gamma.flip !== null) data.lines.push({ price: s.gamma.flip, label: `Gamma flip ${s.gamma.flip.toFixed(2)}`, color: "#f59e0b", dashed: true });
  }
  if (prefs.profile && s.gamma) data.profile = s.gamma.byStrike.map((r) => ({ strike: r.strike, value: r.net }));
  if (prefs.maxPain && s.maxPain !== null && s.expiration) {
    data.lines.push({ price: s.maxPain, label: `Max pain ${shortDate(s.expiration)}: ${s.maxPain}`, color: "#64748b", dashed: true });
  }
  if (prefs.unusual) {
    data.tags = s.unusual.map((u) => ({
      price: u.strike,
      label: `${u.strike}${u.type === "call" ? "C" : "P"} ${shortDate(u.expiration)} vol ${fmtVol(u.volume)} (${u.ratio.toFixed(1)}× OI)${u.premium ? ` ${fmtMoney(u.premium)}` : ""}`,
      color: u.type === "call" ? "#0d9488" : "#be123c",
    }));
  }
  return data;
}

interface Options {
  chart: Chart | null;
  chartGen: number;
  symbol: string;
  prefs: OptionsLevelPrefs;
  /** Hidden in replay mode etc. */
  visible: boolean;
}

export function useOptionsLevels({ chart, chartGen, symbol, prefs, visible }: Options) {
  const active = prefs.enabled && visible;
  const [chain, setChain] = useState<{ contracts: OptionContract[]; spot: number } | null>(null);
  const [status, setStatus] = useState<OptionsStatus>({ loading: false, error: null, asOf: null, delayed: false });
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const mySeq = ++seq.current;
    setStatus((s) => ({ ...s, loading: true }));
    try {
      const now = Date.now();
      const { data, error } = await supabase.functions.invoke("fetch-schwab-options", {
        body: { symbol, fromDate: toEtDateString(now), toDate: toEtDateString(now + WINDOW_DAYS * 86_400_000), strikeCount: STRIKE_COUNT },
      });
      if (mySeq !== seq.current) return;
      if (error) throw error;
      if (data?.source !== "schwab") {
        setChain(null);
        setStatus({ loading: false, error: "Options levels need a Schwab connection. Simulated chains are never drawn.", asOf: null, delayed: false });
        return;
      }
      const spot = Number(data.underlyingPrice);
      const contracts = parseChain(data.options ?? [], now);
      if (!(spot > 0) || contracts.length === 0) {
        setChain(null);
        setStatus({ loading: false, error: `No option chain available for ${symbol}.`, asOf: now, delayed: !!data.isDelayed });
        return;
      }
      setChain({ contracts, spot });
      setStatus({ loading: false, error: null, asOf: data.asOf ?? now, delayed: !!data.isDelayed });
    } catch (err) {
      if (mySeq !== seq.current) return;
      setStatus((s) => ({ ...s, loading: false, error: `Couldn't load the option chain: ${(err as Error)?.message ?? err}` }));
    }
  }, [symbol]);

  useEffect(() => {
    setChain(null);
    setStatus({ loading: false, error: null, asOf: null, delayed: false });
    if (!active) return;
    void refresh();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [active, refresh]);

  // Gamma flip re-prices the whole chain at many prices: compute only when the chain changes.
  const gamma = useMemo(() => (chain ? gammaLevels(chain.contracts, chain.spot) : null), [chain]);

  const summary: OptionsSummary | null = useMemo(() => {
    if (!chain) return null;
    const expiration = pickExpiration(chain.contracts, prefs.expiration);
    return {
      spot: chain.spot,
      expirations: listExpirations(chain.contracts),
      expiration,
      em: expiration ? expectedMove(chain.contracts, chain.spot, expiration) : null,
      gamma,
      maxPain: expiration ? maxPain(chain.contracts, expiration) : null,
      unusual: unusualActivity(chain.contracts),
      pcr: putCallRatios(chain.contracts),
    };
  }, [chain, gamma, prefs.expiration]);

  useEffect(() => {
    if (!chart) return;
    chart.removeOverlay({ groupId: OPTIONS_GROUP });
    if (!active || !summary) return;
    const last = chart.getDataList().at(-1);
    chart.createOverlay({
      name: OPTIONS_LEVELS,
      id: OVERLAY_ID,
      groupId: OPTIONS_GROUP,
      lock: true,
      zLevel: -1,
      points: [{ timestamp: last?.timestamp, value: summary.spot }],
      extendData: buildOverlayData(summary, prefs),
      onRightClick: () => true,
    } as OverlayCreate);
  }, [chart, chartGen, active, summary, prefs]);

  return { summary, status, refresh, fmtMoney };
}
