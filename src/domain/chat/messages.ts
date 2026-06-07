export type ChatMessageLike = {
  id: string;
  createdAt: string;
};

export function mergeChatMessages<T extends ChatMessageLike>(current: T[], incoming: T[]) {
  const byId = new Map<string, T>();

  for (const message of current) {
    byId.set(message.id, message);
  }

  for (const message of incoming) {
    if (!byId.has(message.id)) {
      byId.set(message.id, message);
    }
  }

  return [...byId.values()].sort((left, right) => {
    const timeDelta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    return timeDelta || left.id.localeCompare(right.id);
  });
}
