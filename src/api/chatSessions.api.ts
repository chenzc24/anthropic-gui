import {
  ChatContent,
  ChatRecordMessage,
  ChatSessionDetail,
  ChatSessionSummary,
  TreeItem,
} from '@/typings/common';

const toEpochMs = (rawValue: number): number => {
  if (!rawValue) return 0;
  return rawValue < 1_000_000_000_000 ? rawValue * 1000 : rawValue;
};

const toPromptType = (role: string): 'Human' | 'Assistant' =>
  role === 'Assistant' ? 'Assistant' : 'Human';

const LEGACY_PERSIST_ROOT_KEY = 'persist:root';
const LEGACY_MIGRATION_FLAG_KEY = 'chat_sessions_migration_v1_done';
const MAX_PERSIST_TEXT_LENGTH = 120_000;
const MAX_PERSIST_DETAIL_COUNT = 300;
const MAX_PERSIST_DETAIL_TEXT_LENGTH = 30_000;
const MAX_PERSIST_ASSET_COUNT = 300;
const MAX_PERSIST_ATTACHMENT_COUNT = 100;

const truncateWithMarker = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value;
  }

  const reserve = 64;
  const keepLength = Math.max(maxLength - reserve, 0);
  const dropped = value.length - keepLength;
  return `${value.slice(
    0,
    keepLength,
  )}\n\n[Truncated ${dropped} chars for persistence]`;
};

const readErrorMessage = async (
  response: Response,
  fallback: string,
): Promise<string> => {
  const text = await response.text();
  return text || `${fallback} (${response.status})`;
};

export const fetchChatSessions = async (
  signal?: AbortSignal,
): Promise<ChatSessionSummary[]> => {
  const response = await fetch('/api/chat/sessions', { signal });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, 'Failed to load sessions'),
    );
  }

  return response.json();
};

export const fetchChatSessionDetail = async (
  sessionId: string,
  signal?: AbortSignal,
): Promise<ChatSessionDetail> => {
  const encodedSessionId = encodeURIComponent(sessionId);
  const response = await fetch(`/api/chat/sessions/${encodedSessionId}`, {
    signal,
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, 'Failed to load session detail'),
    );
  }

  return response.json();
};

export const createChatSession = async (payload: {
  id: string;
  name: string;
  createdAt?: number;
  updatedAt?: number;
}): Promise<ChatSessionDetail> => {
  const response = await fetch('/api/chat/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, 'Failed to create session'),
    );
  }

  return response.json();
};

export const appendChatSessionMessages = async (
  sessionId: string,
  messages: ChatRecordMessage[],
): Promise<ChatSessionDetail> => {
  const encodedSessionId = encodeURIComponent(sessionId);
  const response = await fetch(
    `/api/chat/sessions/${encodedSessionId}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
    },
  );

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, 'Failed to append session messages'),
    );
  }

  const data = await response.json();
  return data.session as ChatSessionDetail;
};

export const renameChatSession = async (
  sessionId: string,
  name: string,
): Promise<ChatSessionDetail> => {
  const encodedSessionId = encodeURIComponent(sessionId);
  const response = await fetch(`/api/chat/sessions/${encodedSessionId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, 'Failed to rename session'),
    );
  }

  return response.json();
};

export const deleteChatSession = async (sessionId: string): Promise<void> => {
  const encodedSessionId = encodeURIComponent(sessionId);
  const response = await fetch(`/api/chat/sessions/${encodedSessionId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, 'Failed to delete session'),
    );
  }
};

export const mapChatContentToRecordMessage = (
  content: ChatContent,
  sequence: number,
): ChatRecordMessage => ({
  id: content.id,
  role: content.type,
  text: truncateWithMarker(
    content.type === 'Assistant'
      ? content.text || content.mainText || ''
      : content.text || '',
    MAX_PERSIST_TEXT_LENGTH,
  ),
  mainText:
    content.type === 'Assistant'
      ? truncateWithMarker(
          content.mainText || content.text || '',
          MAX_PERSIST_TEXT_LENGTH,
        ) || undefined
      : undefined,
  isComplete: content.type === 'Assistant' ? content.isComplete === true : true,
  createdAt: Date.now(),
  sequence,
  details:
    content.type === 'Assistant'
      ? (content.details || [])
          .slice(0, MAX_PERSIST_DETAIL_COUNT)
          .map(item => ({
            ...item,
            content: truncateWithMarker(
              item.content || '',
              MAX_PERSIST_DETAIL_TEXT_LENGTH,
            ),
            files: item.files || [],
          }))
      : [],
  assets:
    content.type === 'Assistant'
      ? (content.assets || []).slice(0, MAX_PERSIST_ASSET_COUNT)
      : [],
  attachments:
    content.type === 'Human'
      ? (content.humanAttachments || []).slice(0, MAX_PERSIST_ATTACHMENT_COUNT)
      : [],
});

export const mapSessionMessagesToChatContent = (
  detail: ChatSessionDetail,
): ChatContent[] => {
  const sortedMessages = [...(detail.messages || [])].sort(
    (left, right) => left.sequence - right.sequence,
  );

  return sortedMessages.map(message => {
    const type = toPromptType(message.role);
    const normalizedText = message.text || '';

    if (type === 'Assistant') {
      const normalizedMainText =
        message.mainText && message.mainText.trim().length > 0
          ? message.mainText
          : normalizedText;

      return {
        id: message.id,
        type,
        text: normalizedText,
        mainText: normalizedMainText,
        messageVersion: 2,
        isComplete: message.isComplete !== false,
        details: message.details || [],
        assets: message.assets || [],
      };
    }

    return {
      id: message.id,
      type,
      text: normalizedText,
      humanAttachments: message.attachments || [],
    };
  });
};

export const mapSessionSummariesToChatTree = (
  sessions: ChatSessionSummary[],
): TreeItem[] =>
  sessions.map(session => ({
    id: session.id,
    name: session.name || 'New Chat',
    type: 'chat',
    children: [],
    createdAt: new Date(
      toEpochMs(session.createdAt || session.updatedAt || Date.now()),
    ),
  }));

export const mapSessionDetailToTreeItem = (
  detail: ChatSessionDetail,
): TreeItem => ({
  id: detail.id,
  name: detail.name || 'New Chat',
  type: 'chat',
  children: [],
  createdAt: new Date(
    toEpochMs(detail.createdAt || detail.updatedAt || Date.now()),
  ),
  content: mapSessionMessagesToChatContent(detail),
});

const toTimestampMs = (rawValue: unknown): number | undefined => {
  if (typeof rawValue === 'number') {
    return rawValue < 1_000_000_000_000 ? rawValue * 1000 : rawValue;
  }

  if (typeof rawValue === 'string') {
    const parsed = Date.parse(rawValue);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  if (rawValue instanceof Date) {
    return rawValue.getTime();
  }

  return undefined;
};

const collectLegacyChats = (items: TreeItem[]): TreeItem[] => {
  const chats: TreeItem[] = [];

  const walk = (nodes: TreeItem[]) => {
    for (const node of nodes) {
      if (node.type === 'chat') {
        chats.push(node);
      }
      if (Array.isArray(node.children) && node.children.length > 0) {
        walk(node.children);
      }
    }
  };

  walk(items);
  return chats;
};

export const readLegacyPersistedChats = (): TreeItem[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  const raw = window.localStorage.getItem(LEGACY_PERSIST_ROOT_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as { chats?: unknown };
    const chatsSlice =
      typeof parsed.chats === 'string'
        ? JSON.parse(parsed.chats)
        : parsed.chats;

    const conversations =
      chatsSlice && typeof chatsSlice === 'object'
        ? (chatsSlice as { conversations?: TreeItem[] }).conversations
        : [];

    return Array.isArray(conversations) ? conversations : [];
  } catch {
    return [];
  }
};

export const importLegacyChatsToBackend = async (): Promise<number> => {
  if (typeof window === 'undefined') {
    return 0;
  }

  if (window.localStorage.getItem(LEGACY_MIGRATION_FLAG_KEY) === '1') {
    return 0;
  }

  const legacyTree = readLegacyPersistedChats();
  const legacyChats = collectLegacyChats(legacyTree);

  if (legacyChats.length === 0) {
    window.localStorage.setItem(LEGACY_MIGRATION_FLAG_KEY, '1');
    return 0;
  }

  let importedCount = 0;
  for (const chat of legacyChats) {
    if (!chat.id) {
      continue;
    }

    try {
      await createChatSession({
        id: chat.id,
        name: chat.name || 'New Chat',
        createdAt: toTimestampMs(chat.createdAt) || Date.now(),
      });

      const contents = Array.isArray(chat.content) ? chat.content : [];
      if (contents.length > 0) {
        const messages = contents.map((content, index) =>
          mapChatContentToRecordMessage(content, index),
        );
        await appendChatSessionMessages(chat.id, messages);
      }

      importedCount += 1;
    } catch {
      // Session may already exist or be invalid; skip and continue migration.
      continue;
    }
  }

  window.localStorage.setItem(LEGACY_MIGRATION_FLAG_KEY, '1');
  return importedCount;
};
