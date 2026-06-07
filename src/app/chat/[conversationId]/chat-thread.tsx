"use client";

import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";
import { mergeChatMessages } from "@/domain/chat/messages";
import { useEffect, useMemo, useRef, useState } from "react";
import { Mascot } from "@/components/brand/mascot";

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
};

type ChatThreadProps = {
  conversationId: string;
  currentUserId: string;
  otherDisplayName: string;
  initialMessages: ChatMessage[];
  canSend: boolean;
  disabledReason: string | null;
  isBlocked: boolean;
};

type RealtimeMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type ConnectionState = "subscribed" | "reconnecting" | "degraded";

export function ChatThread({
  conversationId,
  currentUserId,
  otherDisplayName,
  initialMessages,
  canSend,
  disabledReason,
  isBlocked,
}: ChatThreadProps) {
  const [messages, setMessages] = useState(() => mergeChatMessages([], initialMessages));
  const [body, setBody] = useState("");
  const [canSendMessages, setCanSendMessages] = useState(canSend);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(
    isBlocked ? "אי אפשר לשלוח הודעות בהתאמה הזו." : null,
  );
  const [blockState, setBlockState] = useState<"idle" | "sending" | "blocked">(isBlocked ? "blocked" : "idle");
  const [blockError, setBlockError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportState, setReportState] = useState<"idle" | "sending" | "submitted">("idle");
  const [reportError, setReportError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("reconnecting");
  const [pollingEnabled, setPollingEnabled] = useState(process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messageIds = useMemo(() => new Set(messages.map((message) => message.id)), [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1") {
      setConnectionState("degraded");
      return;
    }

    const supabase = createBrowserSupabaseClient();
    const timeoutId = window.setTimeout(() => {
      setConnectionState("degraded");
      setPollingEnabled(true);
    }, 5000);

    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as RealtimeMessageRow;
          appendMessages([mapRealtimeMessage(row)]);
        },
      )
      .subscribe((status) => {
        window.clearTimeout(timeoutId);

        if (status === "SUBSCRIBED") {
          setConnectionState("subscribed");
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnectionState(status === "CLOSED" ? "reconnecting" : "degraded");
          setPollingEnabled(true);
        }
      });

    return () => {
      window.clearTimeout(timeoutId);
      void supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    if (!pollingEnabled) {
      return;
    }

    let cancelled = false;
    const poll = async () => {
      const messages = await fetchMessages();
      if (!cancelled) {
        appendMessages(messages);
      }
    };
    void poll();
    const intervalId = window.setInterval(() => {
      void poll();
    }, process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1" ? 250 : 3000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [conversationId, pollingEnabled]);

  function appendMessages(nextMessages: ChatMessage[]) {
    setMessages((current) => mergeChatMessages(current, nextMessages));
  }

  async function fetchMessages() {
    if (process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1") {
      const response = await fetch(`/api/e2e/conversations/${conversationId}/messages`);
      if (!response.ok) {
        return [];
      }

      const payload = (await response.json()) as { messages?: ChatMessage[] };
      return payload.messages ?? [];
    }

    const response = await fetch(`/api/conversations/${conversationId}`);
    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as { messages?: ChatMessage[] };
    return payload.messages ?? [];
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || isSending || !canSendMessages) {
      return;
    }

    setIsSending(true);
    setSendError(null);

    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      const payload = await response.json();

      if (!response.ok) {
        if (payload.code === "conversation_blocked") {
          setCanSendMessages(false);
          setBlockedMessage(payload.error ?? "אי אפשר לשלוח הודעות בהתאמה הזו.");
          setBlockState("blocked");
        }
        throw new Error(payload.error ?? "לא ניתן לשלוח את ההודעה.");
      }

      appendMessages([payload.message]);
      setBody("");
    } catch (caught) {
      setSendError(caught instanceof Error ? caught.message : "לא ניתן לשלוח את ההודעה.");
    } finally {
      setIsSending(false);
    }
  }

  async function blockParticipant() {
    if (blockState !== "idle") {
      return;
    }

    setBlockState("sending");
    setBlockError(null);

    try {
      const response = await fetch(`/api/conversations/${conversationId}/block`, {
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok && payload.code !== "already_blocked") {
        throw new Error(payload.message ?? "אי אפשר לחסום את המשתמש כרגע.");
      }

      setCanSendMessages(false);
      setBlockedMessage("המשתמש נחסם. אי אפשר לשלוח הודעות בהתאמה הזו.");
      setBlockState("blocked");
    } catch (caught) {
      setBlockState("idle");
      setBlockError(caught instanceof Error ? caught.message : "אי אפשר לחסום את המשתמש כרגע.");
    }
  }

  async function submitReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = reportReason.trim();
    if (!reason || reportState === "sending") {
      return;
    }

    setReportState("sending");
    setReportError(null);

    try {
      const response = await fetch(`/api/conversations/${conversationId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, messageIds: [...messageIds] }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "לא ניתן לשלוח את הדיווח.");
      }

      setReportState("submitted");
      setReportReason("");
    } catch (caught) {
      setReportState("idle");
      setReportError(caught instanceof Error ? caught.message : "לא ניתן לשלוח את הדיווח.");
    }
  }

  return (
    <section className="chat-panel" aria-label={`שיחה עם ${otherDisplayName}`}>
      <p className={`chat-connection chat-connection--${connectionState}`}>{connectionLabel(connectionState)}</p>
      <div className="chat-messages" aria-live="polite">
        {messages.length ? (
          messages.map((message) => (
            <article
              className={message.senderId === currentUserId ? "chat-message chat-message--mine" : "chat-message"}
              key={message.id}
            >
              <p>{message.body}</p>
              <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
            </article>
          ))
        ) : (
          <div className="chat-empty">
            <Mascot pose="wave" size={88} />
            <p className="empty-state">עדיין אין הודעות.</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {canSendMessages ? (
        <form className="chat-composer" onSubmit={sendMessage}>
          <label htmlFor="chat-message">הודעה</label>
          <textarea
            id="chat-message"
            maxLength={4000}
            rows={3}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          {sendError ? <p className="form-error">{sendError}</p> : null}
          <button className="primary-button" type="submit" disabled={isSending || !body.trim()}>
            {isSending ? "שולחים..." : "שליחה"}
          </button>
        </form>
      ) : blockedMessage ? (
        <p className="form-error">{blockedMessage}</p>
      ) : (
        <p className="form-error">{disabledReason ?? "אי אפשר לשלוח הודעות בשיחה הזאת."}</p>
      )}

      <div className="chat-safety-actions" aria-label="פעולות בטיחות">
        {blockError ? <p className="form-error">{blockError}</p> : null}
        {blockState === "blocked" ? <p className="submitted-state">החסימה נשמרה.</p> : null}
        <button className="secondary-button danger-button" type="button" onClick={blockParticipant} disabled={blockState !== "idle"}>
          {blockState === "sending" ? "חוסמים..." : "חסימה"}
        </button>
      </div>

      <form className="report-form" onSubmit={submitReport}>
        <label htmlFor="report-reason">דיווח על {otherDisplayName}</label>
        <textarea
          id="report-reason"
          rows={2}
          value={reportReason}
          onChange={(event) => setReportReason(event.target.value)}
          disabled={reportState === "submitted"}
        />
        {reportError ? <p className="form-error">{reportError}</p> : null}
        {reportState === "submitted" ? <p className="submitted-state">הדיווח נשלח.</p> : null}
        <button className="secondary-button" type="submit" disabled={!reportReason.trim() || reportState !== "idle"}>
          {reportState === "sending" ? "שולחים..." : "דיווח"}
        </button>
      </form>
    </section>
  );
}

function connectionLabel(state: ConnectionState) {
  if (state === "subscribed") {
    return "חי";
  }

  if (state === "reconnecting") {
    return "מתחברים מחדש";
  }

  return "בודקים הודעות חדשות";
}

function mapRealtimeMessage(row: RealtimeMessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
