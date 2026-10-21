/**
 * Main-thread side of the sandbox: sends a script and bars to the worker and
 * waits for the plots. A script that runs longer than the time limit is
 * stopped by terminating the worker (a new one is started for the next run).
 */
import type { ExecResult, ScriptBars } from "./customExec";

export const TIME_LIMIT_MS = 2000;

export interface RunOk extends ExecResult {
  ms: number;
}

type Pending = { resolve: (r: RunOk) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> | null };
interface Job { code: string; bars: ScriptBars; inputs: Record<string, number>; resolve: (r: RunOk) => void; reject: (e: Error) => void }

export class ScriptRunner {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();
  /** One script at a time, so the time limit measures that script alone. */
  private queue: Job[] = [];
  private busy = false;

  constructor(private readonly makeWorker: () => Worker = () => new Worker(new URL("./customWorker.ts", import.meta.url), { type: "module" })) {}

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = this.makeWorker();
    w.onmessage = (ev: MessageEvent) => {
      const d = ev.data as { id: number; ok: boolean; error?: string } & RunOk;
      const p = this.pending.get(d?.id);
      if (!p) return;
      if (p.timer) clearTimeout(p.timer);
      this.pending.delete(d.id);
      if (d.ok && Array.isArray(d.plots)) p.resolve({ plots: d.plots, inputs: d.inputs ?? [], ms: d.ms ?? 0 });
      else p.reject(new Error(d.error || "The script failed."));
      this.busy = false;
      this.next();
    };
    w.onerror = (ev) => {
      ev.preventDefault?.();
      this.reset(new Error(ev.message || "The script crashed."));
    };
    this.worker = w;
    return w;
  }

  /** Stop the worker and fail everything in flight. */
  private reset(err: Error) {
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) {
      if (p.timer) clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
    this.busy = false;
    // Queued scripts haven't run yet: give them a fresh worker.
    queueMicrotask(() => this.next());
  }

  private next() {
    if (this.busy) return;
    const job = this.queue.shift();
    if (!job) return;
    this.busy = true;
    const w = this.ensure();
    const id = ++this.seq;
    const timer = setTimeout(() => this.reset(new Error(`The script took longer than ${TIME_LIMIT_MS / 1000} seconds and was stopped (check for endless loops).`)), TIME_LIMIT_MS);
    this.pending.set(id, { resolve: job.resolve, reject: job.reject, timer });
    w.postMessage({ id, code: job.code, bars: job.bars, inputs: job.inputs });
  }

  run(code: string, bars: ScriptBars, inputs: Record<string, number> = {}): Promise<RunOk> {
    return new Promise<RunOk>((resolve, reject) => {
      this.queue.push({ code, bars, inputs, resolve, reject });
      this.next();
    });
  }

  dispose() {
    const q = this.queue.splice(0);
    q.forEach((j) => j.reject(new Error("stopped")));
    this.reset(new Error("stopped"));
  }
}

let shared: ScriptRunner | null = null;
/** One sandbox for all charts on the page. */
export const sharedRunner = () => (shared ??= new ScriptRunner());
