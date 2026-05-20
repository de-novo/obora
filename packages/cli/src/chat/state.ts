import type { ChatMessage, ChatMessageRole, ChatSessionState, ChatSessionStatus } from "./types.js";

const createMessageId = (role: ChatMessageRole, content: string, createdAt: string): string =>
  `${role}:${createdAt}:${content.length}`;

export const createChatMessage = (
  role: ChatMessageRole,
  content: string,
  now: () => Date = () => new Date()
): ChatMessage => {
  const createdAt = now().toISOString();
  return {
    id: createMessageId(role, content, createdAt),
    role,
    content,
    createdAt,
  };
};

export const appendChatMessage = (
  state: ChatSessionState,
  message: ChatMessage
): ChatSessionState => ({
  ...state,
  messages: [...state.messages, message],
});

export const setChatStatus = (
  state: ChatSessionState,
  status: ChatSessionStatus,
  lastError?: string
): ChatSessionState => ({
  ...state,
  status,
  ...(lastError ? { lastError } : { lastError: undefined }),
});

export const visibleChatMessages = (
  state: ChatSessionState,
  maxMessages = 8
): ReadonlyArray<ChatMessage> =>
  state.messages.slice(Math.max(0, state.messages.length - maxMessages));

export const createInitialChatState = ({
  sessionId,
  cwd,
  dryRun,
  providerName,
  modelName,
  workflowTarget,
}: {
  readonly sessionId: string;
  readonly cwd: string;
  readonly dryRun: boolean;
  readonly providerName?: string;
  readonly modelName?: string;
  readonly workflowTarget?: string;
}): ChatSessionState => ({
  sessionId,
  cwd,
  dryRun,
  ...(providerName ? { providerName } : {}),
  ...(modelName ? { modelName } : {}),
  status: "idle",
  ...(workflowTarget ? { workflowTarget } : {}),
  messages: [
    createChatMessage(
      "system",
      "Obora chat TUI started. Type a message to run the selected workflow, /workflow <name> to switch, /help for commands, or /exit to quit."
    ),
  ],
});
