import { createChatRepository, loadChatMessages } from "@/app/api/chat-repository";
import { requireAuthenticatedUserId } from "@/app/api/matching/auth";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { ChatThread } from "./chat-thread";

export const dynamic = "force-dynamic";

type ChatPageProps = {
  params: Promise<{ conversationId: string }>;
};

export default async function ChatPage({ params }: ChatPageProps) {
  const { conversationId } = await params;
  const userId = await requireAuthenticatedUserId();

  if (!userId) {
    return (
      <ChatState
        title="שיחה"
        message="צריך להתחבר כדי לפתוח את השיחה הזאת."
        actionHref={`/login?next=${encodeURIComponent(`/chat/${conversationId}`)}`}
        actionLabel="התחברות"
      />
    );
  }

  const supabase = createServiceRoleClient();
  const repository = createChatRepository(supabase);
  const conversation = await repository.getConversation(conversationId);

  if (!conversation) {
    return <ChatState title="השיחה לא זמינה" message="השיחה הזאת לא נמצאה." />;
  }

  const match = await repository.getMatch(conversation.matchId);
  if (!match || (match.userA !== userId && match.userB !== userId)) {
    return <ChatState title="השיחה לא זמינה" message="אין לך גישה לשיחה הזאת." />;
  }
  if (repository.hasMatchingEntitlement && !(await repository.hasMatchingEntitlement(userId))) {
    return <ChatState title="השיחה נעולה" message="צריך לפתוח את שלב ההתאמות לפני פתיחת השיחה." />;
  }

  const profiles = await repository.getProfiles([match.userA, match.userB]);
  const currentProfile = profiles.find((profile) => profile.userId === userId) ?? null;
  const otherUserId = match.userA === userId ? match.userB : match.userA;
  const otherProfile = profiles.find((profile) => profile.userId === otherUserId) ?? null;
  const blockedPairs = await repository.getBlockedPairs(match.userA, match.userB);
  const messages = await loadChatMessages(supabase, conversationId);
  const disabledReason = getDisabledReason({
    matchStatus: match.status,
    conversationStatus: conversation.status,
    currentDisabled: Boolean(currentProfile?.disabledAt),
    otherDisabled: Boolean(otherProfile?.disabledAt),
    isBlocked: blockedPairs.length > 0,
  });
  const otherDisplayName = otherProfile?.displayName ?? "התאמה";

  return (
    <main className="page-shell chat-page">
      <div className="chat-shell">
        <header className="chat-header">
          <div>
            <p className="eyebrow">שיחה</p>
            <h1>{otherDisplayName}</h1>
          </div>
          <Link className="secondary-link" href="/matches">
            חזרה להתאמות
          </Link>
        </header>
        <ChatThread
          conversationId={conversationId}
          currentUserId={userId}
          otherDisplayName={otherDisplayName}
          initialMessages={messages}
          canSend={!disabledReason}
          disabledReason={disabledReason}
          isBlocked={blockedPairs.length > 0}
        />
      </div>
    </main>
  );
}

function ChatState({
  title,
  message,
  actionHref = "/matches",
  actionLabel = "חזרה להתאמות",
}: {
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <main className="page-shell chat-page">
      <section className="chat-panel chat-panel--state">
        <h1>{title}</h1>
        <p>{message}</p>
        <Link className="primary-link" href={actionHref}>
          {actionLabel}
        </Link>
      </section>
    </main>
  );
}

function getDisabledReason(input: {
  matchStatus: string;
  conversationStatus: string;
  currentDisabled: boolean;
  otherDisabled: boolean;
  isBlocked: boolean;
}) {
  if (input.matchStatus !== "active") {
    return "ההתאמה הזאת כבר לא פעילה.";
  }

  if (input.conversationStatus !== "active") {
    return "השיחה הזאת לא פעילה.";
  }

  if (input.currentDisabled || input.otherDisabled) {
    return "אי אפשר לשלוח הודעות כשאחד הפרופילים מושבת.";
  }

  if (input.isBlocked) {
    return "אי אפשר לשלוח הודעות בהתאמה הזאת.";
  }

  return null;
}
