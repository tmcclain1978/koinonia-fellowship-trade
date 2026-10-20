/**
 * Optional cloud copy of chart settings and drawings, in the
 * `user_chart_state` table (one JSON value per user + key).
 *
 * If the table doesn't exist yet (migration not applied) or the user is signed
 * out, every call quietly does nothing and the chart keeps working from local
 * storage.
 */
import { supabase } from "@/integrations/supabase/client";

const TABLE = "user_chart_state";
const SAVE_DEBOUNCE_MS = 1500;

let disabled = false;
const pendingSaves = new Map<string, { value: unknown; updatedAt: number; timer: ReturnType<typeof setTimeout> }>();

const isMissingTable = (err: { code?: string; message?: string } | null | undefined) =>
  !!err && (err.code === "42P01" || err.code === "PGRST205" || err.code === "PGRST204" || /user_chart_state/i.test(err.message ?? ""));

async function userId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

// The table isn't in the generated Supabase types until the migration is applied.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from(TABLE);

export interface CloudValue<T> {
  value: T;
  updatedAt: number;
}

export async function cloudLoad<T>(key: string): Promise<CloudValue<T> | null> {
  if (disabled) return null;
  const uid = await userId();
  if (!uid) return null;
  try {
    const { data, error } = await table().select("value, updated_at").eq("user_id", uid).eq("key", key).maybeSingle();
    if (error) {
      if (isMissingTable(error)) disabled = true;
      return null;
    }
    if (!data) return null;
    return { value: data.value as T, updatedAt: Date.parse(data.updated_at) || 0 };
  } catch {
    return null;
  }
}

/** Save after a short pause; repeated saves of the same key collapse into one. */
export function cloudSave(key: string, value: unknown, updatedAt: number): void {
  if (disabled) return;
  const existing = pendingSaves.get(key);
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => void flush(key), SAVE_DEBOUNCE_MS);
  pendingSaves.set(key, { value, updatedAt, timer });
}

async function flush(key: string) {
  const entry = pendingSaves.get(key);
  pendingSaves.delete(key);
  if (!entry || disabled) return;
  const uid = await userId();
  if (!uid) return;
  try {
    const { error } = await table().upsert(
      { user_id: uid, key, value: entry.value, updated_at: new Date(entry.updatedAt).toISOString() },
      { onConflict: "user_id,key" },
    );
    if (error && isMissingTable(error)) disabled = true;
  } catch {
    /* offline: the local copy is still saved */
  }
}

export async function cloudDelete(key: string): Promise<void> {
  if (disabled) return;
  const pending = pendingSaves.get(key);
  if (pending) {
    clearTimeout(pending.timer);
    pendingSaves.delete(key);
  }
  const uid = await userId();
  if (!uid) return;
  try {
    const { error } = await table().delete().eq("user_id", uid).eq("key", key);
    if (error && isMissingTable(error)) disabled = true;
  } catch {
    /* ignore */
  }
}
