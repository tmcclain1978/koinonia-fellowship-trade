/**
 * Tell a user something happened: an in-app notification (the bell, with a
 * toast if the app is open) and optionally an email through Resend.
 * The same title+message isn't repeated within `dedupeMinutes`.
 */
import { Resend } from "npm:resend@2.0.0";

export interface Notice {
  type: "order_fill" | "risk_warning" | "system" | "info" | "price_alert";
  title: string;
  message: string;
  email?: boolean;
  dedupeMinutes?: number;
  /** What counts as "the same" for dedupe (default: title and message). */
  dedupeBy?: "title" | "title+message";
}

const FROM = "Koinonia Bot <alerts@koinoniatrading.org>";
const emailCache = new Map<string, string | null>();
let resend: Resend | null | undefined;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export async function notifyUser(admin: any, userId: string, n: Notice): Promise<boolean> {
  try {
    if (n.dedupeMinutes) {
      const since = new Date(Date.now() - n.dedupeMinutes * 60_000).toISOString();
      let q = admin.from("user_notifications").select("id").eq("user_id", userId).eq("title", n.title).gte("created_at", since);
      if (n.dedupeBy !== "title") q = q.eq("message", n.message);
      const { data } = await q.limit(1);
      if (data?.length) return false;
    }
    await admin.from("user_notifications").insert({ user_id: userId, type: n.type, title: n.title, message: n.message, read: false });
    if (n.email) {
      if (resend === undefined) {
        const key = Deno.env.get("RESEND_API_KEY");
        resend = key ? new Resend(key) : null;
      }
      if (resend) {
        if (!emailCache.has(userId)) {
          const { data } = await admin.auth.admin.getUserById(userId);
          emailCache.set(userId, data?.user?.email ?? null);
        }
        const to = emailCache.get(userId);
        if (to) {
          await resend.emails.send({
            from: FROM,
            to: [to],
            subject: n.title,
            html: `<div style="font-family:system-ui,sans-serif;max-width:520px"><p style="font-size:16px;margin:0 0 8px"><strong>${esc(n.title)}</strong></p><p style="margin:0 0 16px">${esc(n.message)}</p><p style="color:#64748b;font-size:12px;margin:0">Open the Trading Bot page in Koinonia for details. You can turn these emails off in the bot settings.</p></div>`,
          });
        }
      }
    }
    return true;
  } catch (e) {
    console.error("[notify]", (e as Error).message);
    return false;
  }
}
