import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);

describe("AiCoachPanel", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("loads the initial thread, fills a quick prompt, and submits a message", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { messages: [{ id: "message-1", role: "assistant", content: "Welcome back" }] },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { messages: [{ id: "message-2", role: "assistant", content: "Try asking one focused question." }] },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const { AiCoachPanel } = await import("../../src/app/app/ai-coach-panel");
    render(<AiCoachPanel />);

    expect(await screen.findByText("Welcome back")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Start conversation prompt" }));
    const input = screen.getByLabelText("Message to AI coach");
    const submittedMessage = (input as HTMLTextAreaElement).value;

    expect(submittedMessage.length).toBeGreaterThan(0);

    fireEvent.submit(screen.getByRole("button", { name: "Send message" }).closest("form")!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/ai-coach/messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ message: submittedMessage }),
      }),
    );
  });
});
