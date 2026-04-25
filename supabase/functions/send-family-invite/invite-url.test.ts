import {
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildInviteSignupUrl, DEFAULT_APP_URL } from "../_shared/invite-url.ts";

Deno.test("invite URL routes to koinoniatrading.org/auth by default", () => {
  const url = buildInviteSignupUrl("user@example.com");
  assertStringIncludes(url, "https://koinoniatrading.org/auth");
});

Deno.test("invite URL preserves the recipient email in ?invite= param", () => {
  const url = buildInviteSignupUrl("user@example.com");
  const parsed = new URL(url);
  assertEquals(parsed.origin, "https://koinoniatrading.org");
  assertEquals(parsed.pathname, "/auth");
  assertEquals(parsed.searchParams.get("invite"), "user@example.com");
});

Deno.test("invite URL URL-encodes special characters in the email", () => {
  const email = "first.last+tag@example.com";
  const url = buildInviteSignupUrl(email);
  // Raw query string must be percent-encoded
  assertStringIncludes(url, "invite=first.last%2Btag%40example.com");
  // Decoded value must round-trip back to the original
  assertEquals(new URL(url).searchParams.get("invite"), email);
});

Deno.test("invite URL falls back to production domain when APP_URL is empty", () => {
  for (const empty of [undefined, null, ""]) {
    const url = buildInviteSignupUrl("user@example.com", empty as any);
    assertStringIncludes(url, `${DEFAULT_APP_URL}/auth`);
    assertEquals(new URL(url).host, "koinoniatrading.org");
  }
});

Deno.test("invite URL strips a trailing slash from APP_URL", () => {
  const url = buildInviteSignupUrl(
    "user@example.com",
    "https://koinoniatrading.org/",
  );
  // No double slash before /auth
  assertEquals(url, "https://koinoniatrading.org/auth?invite=user%40example.com");
});

Deno.test("invite URL throws when memberEmail is missing", () => {
  assertThrows(() => buildInviteSignupUrl(""), Error, "memberEmail is required");
});
