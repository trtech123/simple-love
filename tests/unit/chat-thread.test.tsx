import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "../../src/app/chat/[conversationId]/chat-thread";

vi.stubGlobal("React", React);

type RealtimeStatus = "SUBSCRIBED" | "TIMED_OUT" | "CHANNEL_ERROR" | "CLOSED";
type RealtimePayload = {
  new: {
    id: string;
    conversation_id: string;
    sender_id: string;
    body: string;
    created_at: string;
  };
};

const supabaseMock = vi.hoisted(() => ({
  subscribeCallback: null as ((status: RealtimeStatus) => void) | null,
  insertCallback: null as ((payload: RealtimePayload) => void) | null,
  removeChannel: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: () => ({
      on: (_event: string, _filter: unknown, callback: (payload: RealtimePayload) => void) => {
        supabaseMock.insertCallback = callback;
        return {
          subscribe: (callback: (status: RealtimeStatus) => void) => {
            supabaseMock.subscribeCallback = callback;
            return { topic: "conversation:conversation-1" };
          },
        };
      },
    }),
    removeChannel: supabaseMock.removeChannel,
  }),
}));

describe("ChatThread", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useRealTimers();
    delete process.env.NEXT_PUBLIC_E2E_TEST_MODE;
    supabaseMock.subscribeCallback = null;
    supabaseMock.insertCallback = null;
    supabaseMock.removeChannel.mockReset();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("starts in a reconnecting state", async () => {
    const { ChatThread } = await import("../../src/app/chat/[conversationId]/chat-thread");

    render(<ChatThread {...defaultProps()} />);

    expect(screen.getByText("מתחברים מחדש")).toBeTruthy();
  });

  it("shows live after the realtime subscription is established", async () => {
    const { ChatThread } = await import("../../src/app/chat/[conversationId]/chat-thread");
    render(<ChatThread {...defaultProps()} />);

    act(() => supabaseMock.subscribeCallback?.("SUBSCRIBED"));

    expect(screen.getByText("חי")).toBeTruthy();
  });

  it.each(["TIMED_OUT", "CHANNEL_ERROR"] as const)(
    "falls back to polling when realtime reports %s",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            messages: [
              message({
                id: "message-2",
                senderId: "user-b",
                body: "Polled inbound message",
                createdAt: "2026-06-02T10:02:00.000Z",
              }),
            ],
          }),
        }),
      );
      const { ChatThread } = await import("../../src/app/chat/[conversationId]/chat-thread");
      render(<ChatThread {...defaultProps()} />);

      await act(async () => {
        supabaseMock.subscribeCallback?.(status);
      });

      expect(screen.getByText("בודקים הודעות חדשות")).toBeTruthy();
      await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/conversations/conversation-1"));
      expect(await screen.findByText("Polled inbound message")).toBeTruthy();
    },
  );

  it("deduplicates realtime messages by id", async () => {
    const { ChatThread } = await import("../../src/app/chat/[conversationId]/chat-thread");
    render(
      <ChatThread
        {...defaultProps({
          initialMessages: [
            message({
              id: "message-1",
              senderId: "user-b",
              body: "Original body",
              createdAt: "2026-06-02T10:01:00.000Z",
            }),
          ],
        })}
      />,
    );

    act(() =>
      supabaseMock.insertCallback?.({
        new: {
          id: "message-1",
          conversation_id: "conversation-1",
          sender_id: "user-b",
          body: "Duplicate replacement body",
          created_at: "2026-06-02T10:01:00.000Z",
        },
      }),
    );

    expect(screen.getByText("Original body")).toBeTruthy();
    expect(screen.queryByText("Duplicate replacement body")).toBeNull();
  });
});

function defaultProps(overrides: { initialMessages?: ChatMessage[] } = {}) {
  return {
    conversationId: "conversation-1",
    currentUserId: "user-a",
    otherDisplayName: "User B",
    initialMessages: overrides.initialMessages ?? [],
    canSend: true,
    disabledReason: null,
    isBlocked: false,
  };
}

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "message-1",
    conversationId: "conversation-1",
    senderId: "user-a",
    body: "Hello",
    createdAt: "2026-06-02T10:00:00.000Z",
    ...overrides,
  };
}
