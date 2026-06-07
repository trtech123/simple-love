import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);

const authMocks = vi.hoisted(() => ({
  push: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: authMocks.push }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: authMocks.signInWithPassword,
      signInWithOAuth: authMocks.signInWithOAuth,
    },
  }),
}));

describe("LoginForm", () => {
  beforeEach(() => {
    vi.resetModules();
    authMocks.push.mockReset();
    authMocks.signInWithPassword.mockReset();
    authMocks.signInWithOAuth.mockReset();
    window.history.replaceState({}, "", "/login?next=/matches");
  });

  afterEach(() => {
    cleanup();
  });

  it("signs in with email and password then redirects to next", async () => {
    authMocks.signInWithPassword.mockResolvedValue({ error: null });
    const { LoginForm } = await import("../../src/app/login/login-form");

    render(<LoginForm nextPath="/profile/matching" />);
    fireEvent.change(screen.getByLabelText("אימייל"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("סיסמה"), { target: { value: "password123" } });
    fireEvent.submit(screen.getByRole("button", { name: "כניסה עם אימייל" }).closest("form")!);

    await waitFor(() => expect(authMocks.push).toHaveBeenCalledWith("/profile/matching"));
    expect(authMocks.signInWithPassword).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "password123",
    });
  });

  it("shows an inline localized error for invalid credentials", async () => {
    authMocks.signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    const { LoginForm } = await import("../../src/app/login/login-form");

    render(<LoginForm nextPath="/matches" />);
    fireEvent.change(screen.getByLabelText("אימייל"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("סיסמה"), { target: { value: "wrong-password" } });
    fireEvent.submit(screen.getByRole("button", { name: "כניסה עם אימייל" }).closest("form")!);

    expect((await screen.findByRole("alert")).textContent).toContain("האימייל או הסיסמה לא נכונים");
    expect(authMocks.push).not.toHaveBeenCalled();
  });

  it("starts Google OAuth with the login callback and safe next path", async () => {
    authMocks.signInWithOAuth.mockResolvedValue({ error: null });
    const { LoginForm } = await import("../../src/app/login/login-form");

    render(<LoginForm nextPath="/chat/conversation-1" />);
    fireEvent.click(screen.getByRole("button", { name: "התחברות עם Google" }));

    await waitFor(() => expect(authMocks.signInWithOAuth).toHaveBeenCalled());
    expect(authMocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=%2Fchat%2Fconversation-1`,
      },
    });
  });
});
