import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Auth from "./Auth";

// --- Hoisted mocks (shared across tests) -----------------------------------
const { getSessionMock, onAuthStateChangeMock, signUpMock, signInMock,
        invokeMock, navigateMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  onAuthStateChangeMock: vi.fn(),
  signUpMock: vi.fn(),
  signInMock: vi.fn(),
  invokeMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: onAuthStateChangeMock,
      signUp: signUpMock,
      signInWithPassword: signInMock,
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
    functions: { invoke: invokeMock },
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return { ...actual, useNavigate: () => navigateMock };
});

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Auth />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  // Default: logged-out, no-op auth-state subscription
  getSessionMock.mockResolvedValue({ data: { session: null } });
  onAuthStateChangeMock.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
  signUpMock.mockResolvedValue({ error: null });
  signInMock.mockResolvedValue({ error: null });
  invokeMock.mockResolvedValue({ data: { url: "https://stripe.example/verify" }, error: null });
});

// --- Logged-out invitee flow ----------------------------------------------
describe("Invite link — logged-out invitee on /auth?invite=...", () => {
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

  it("defaults to the Create Account (signup) view, not Sign In", async () => {
    renderAt("/auth?invite=invitee%40example.com");
    expect(
      await screen.findByRole("button", { name: /create account/i }),
    ).toBeInTheDocument();
    // Signup-only fields should be visible
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/date of birth/i)).toBeInTheDocument();
  });

  it("does NOT redirect to /dashboard when the invitee is logged out", async () => {
    renderAt("/auth?invite=invitee%40example.com");
    await screen.findByLabelText(/email/i);
    // Give the getSession promise a tick to resolve
    await waitFor(() => expect(getSessionMock).toHaveBeenCalled());
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

// --- Logged-in invitee redirect -------------------------------------------
describe("Invite link — logged-in invitee on /auth?invite=...", () => {
  it("redirects an already-logged-in user to /dashboard", async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          user: { id: "user-1", email: "invitee@example.com" },
          access_token: "token",
        },
      },
    });

    renderAt("/auth?invite=invitee%40example.com");

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("redirects to /dashboard when SIGNED_IN fires after the page mounts", async () => {
    let capturedHandler:
      | ((event: string, session: unknown) => void)
      | undefined;
    onAuthStateChangeMock.mockImplementation((cb: any) => {
      capturedHandler = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    renderAt("/auth?invite=invitee%40example.com");
    await screen.findByLabelText(/email/i);

    // Simulate the user signing in (e.g., after submitting the form)
    capturedHandler?.("SIGNED_IN", {
      user: { id: "user-2", email: "invitee@example.com" },
    });

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/dashboard");
    });
  });
});
