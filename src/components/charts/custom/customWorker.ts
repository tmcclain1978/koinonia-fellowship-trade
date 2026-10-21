/// <reference lib="webworker" />
/**
 * Sandbox for custom indicator scripts. Runs off the main thread (a slow or
 * looping script can't freeze the chart; the page kills it after 2 seconds)
 * and with the network and storage APIs removed, so a script can only do math
 * on the bars it's given.
 */
import { executeScript, type ScriptBars } from "./customExec";

const scope = self as unknown as Record<string, unknown> & DedicatedWorkerGlobalScope;
const send = scope.postMessage.bind(scope);

const BLOCKED = [
  "fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "indexedDB", "caches",
  "BroadcastChannel", "Worker", "SharedWorker", "Request", "Response", "Headers", "navigator",
  "Notification", "WebTransport", "RTCPeerConnection", "FileReader", "postMessage", "close",
];
for (const k of BLOCKED) {
  try {
    Object.defineProperty(scope, k, { value: undefined, writable: false, configurable: false });
  } catch {
    try { scope[k] = undefined; } catch { /* best effort */ }
  }
}

interface RunRequest {
  id: number;
  code: string;
  bars: ScriptBars;
  inputs: Record<string, number>;
}

scope.onmessage = (ev: MessageEvent<RunRequest>) => {
  const { id, code, bars, inputs } = ev.data ?? ({} as RunRequest);
  const started = performance.now();
  try {
    const res = executeScript(code, bars, inputs);
    send({ id, ok: true, ...res, ms: Math.round(performance.now() - started) });
  } catch (e) {
    send({ id, ok: false, error: (e as Error)?.message ?? String(e) });
  }
};
