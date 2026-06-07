// Pure Black-Scholes option pricing and Greeks. NO external imports (importable
// by the Deno edge function with .ts and by vitest without). Equity options are
// American; BS is the industry-standard display approximation for marks/Greeks.
//
// Conventions (what traders expect to see):
//   delta : per $1 underlying move, per share (call 0..1, put -1..0)
//   gamma : change in delta per $1 underlying move
//   theta : per CALENDAR DAY (usually negative for long options)
//   vega  : per 1 percentage-point change in implied volatility
// Scale by contract multiplier (100) and position quantity for dollar Greeks.

const INV_SQRT_2PI = 0.3989422804014327;

export function normPdf(x: number): number {
  return INV_SQRT_2PI * Math.exp(-0.5 * x * x);
}

/** Standard normal CDF (Zelen & Severo approximation, abs error < 7.5e-8). */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const p = normPdf(x) * poly;
  return x >= 0 ? 1 - p : p;
}

export type OptType = "call" | "put";

export interface Greeks {
  price: number;
  delta: number;
  gamma: number;
  theta: number; // per day
  vega: number; // per 1% IV
}

/**
 * Black-Scholes price + Greeks.
 * @param S spot (underlying price)
 * @param K strike
 * @param T time to expiry in YEARS
 * @param r risk-free rate (decimal, e.g. 0.04)
 * @param sigma implied volatility (decimal, e.g. 0.30)
 */
export function bsGreeks(S: number, K: number, T: number, r: number, sigma: number, type: OptType): Greeks {
  // Expired or no vol/time: intrinsic value, no sensitivities.
  if (!(T > 0) || !(sigma > 0) || !(S > 0)) {
    const intrinsic = type === "call" ? Math.max(0, S - K) : Math.max(0, K - S);
    const delta = type === "call" ? (S > K ? 1 : 0) : (S < K ? -1 : 0);
    return { price: intrinsic, delta, gamma: 0, theta: 0, vega: 0 };
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const pdf = normPdf(d1);
  const disc = Math.exp(-r * T);

  let price: number, delta: number, theta: number;
  if (type === "call") {
    price = S * normCdf(d1) - K * disc * normCdf(d2);
    delta = normCdf(d1);
    theta = (-(S * pdf * sigma) / (2 * sqrtT) - r * K * disc * normCdf(d2)) / 365;
  } else {
    price = K * disc * normCdf(-d2) - S * normCdf(-d1);
    delta = normCdf(d1) - 1;
    theta = (-(S * pdf * sigma) / (2 * sqrtT) + r * K * disc * normCdf(-d2)) / 365;
  }
  const gamma = pdf / (S * sigma * sqrtT);
  const vega = (S * pdf * sqrtT) / 100;

  return { price, delta, gamma, theta, vega };
}

/** Years from now until an ISO expiration date (floored at ~0). */
export function yearsToExpiry(expiration: string, now = new Date()): number {
  const exp = new Date(`${expiration}T16:00:00-05:00`); // ~US market close
  const years = (exp.getTime() - now.getTime()) / (365 * 24 * 60 * 60 * 1000);
  return Math.max(years, 1e-6);
}
