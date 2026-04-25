import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Auth from "./Auth";

// --- Mocks for Supabase + toast so the component can mount in jsdom -------
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    functions: { invoke: vi.fn() },
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Auth />
    </MemoryRouter>,
  );

describe("Invite link routing on /auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefills the email field from the ?invite= query parameter", async () => {
    renderAt("/auth?invite=invitee%40example.com");
    const emailInput = (await screen.findByLabelText(/email/i)) as HTMLInputElement;
    expect(emailInput.value).toBe("invitee@example.com");
  });

  it("preserves emails containing + and . characters", async () => {
    renderAt("/auth?invite=first.last%2Btag%40example.com");
    const emailInput = (await screen.findByLabelText(/email/i)) as HTMLInputElement;
    expect(emailInput.value).toBe("first.last+tag@example.com");
  });

  it("leaves the email field empty when no invite param is present", async () => {
    renderAt("/auth");
    const emailInput = (await screen.findByLabelText(/email/i)) as HTMLInputElement;
    expect(emailInput.value).toBe("");
  });

  it("routes invitees to /auth — the same page that hosts the signup form", async () => {
    // Simulates the URL produced by the invite email: invitees land on /auth
    // and the signup form is the default view (isLogin=false).
    renderAt("/auth?invite=invitee%40example.com");
    expect(
      await screen.findByRole("button", { name: /create account|sign up/i }),
    ).toBeInTheDocument();
  });
});
