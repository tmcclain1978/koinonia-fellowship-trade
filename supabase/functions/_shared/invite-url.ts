/**
 * Build the signup URL embedded in invitation emails.
 *
 * Always routes invitees to the production domain `/auth` page and
 * preserves the recipient's email via the `?invite=` query parameter so
 * the signup form can prefill it.
 */
export const DEFAULT_APP_URL = "https://koinoniatrading.org";

export function buildInviteSignupUrl(
  memberEmail: string,
  appUrl: string | undefined | null = DEFAULT_APP_URL,
): string {
  if (!memberEmail || typeof memberEmail !== "string") {
    throw new Error("memberEmail is required to build invite URL");
  }
  const base = (appUrl && appUrl.trim().length > 0 ? appUrl : DEFAULT_APP_URL)
    .replace(/\/$/, "");
  return `${base}/auth?invite=${encodeURIComponent(memberEmail)}`;
}
