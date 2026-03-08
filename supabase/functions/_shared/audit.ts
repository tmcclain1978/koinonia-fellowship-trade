// Shared audit logging utility
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface AuditEntry {
  userId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Log an action to the audit_log table.
 * Fire-and-forget — errors are logged but don't throw.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { error } = await supabase.from("audit_log").insert({
      user_id: entry.userId,
      action: entry.action,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId || null,
      details: entry.details || {},
      ip_address: entry.ipAddress || null,
      user_agent: entry.userAgent || null,
    });

    if (error) {
      console.error("[audit] Failed to write audit log:", error.message);
    }
  } catch (e) {
    console.error("[audit] Exception writing audit log:", e);
  }
}
