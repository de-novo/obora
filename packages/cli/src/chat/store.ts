import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { WorkflowRunSummary } from "@obora/sdk";

import type { ChatMessage, ChatSessionState } from "./types.js";

export interface ChatSessionSummary {
  readonly sessionId: string;
  readonly status: ChatSessionState["status"];
  readonly cwd: string;
  readonly workflowTarget?: string;
  readonly messageCount: number;
  readonly updatedAt: string;
}

export interface ChatRunDetail {
  readonly sessionId: string;
  readonly messageId: string;
  readonly messageCreatedAt: string;
  readonly workflowTarget?: string;
  readonly runSummary: WorkflowRunSummary;
}

interface ChatSessionRecord {
  readonly schemaVersion: 1;
  readonly updatedAt: string;
  readonly state: ChatSessionState;
}

const chatSessionStoreDir = (cwd: string): string => join(cwd, ".obora", "chat", "sessions");

const chatSessionFilePath = (storeDir: string, sessionId: string): string =>
  join(storeDir, `${encodeURIComponent(sessionId)}.json`);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === "string";

const isChatMessage = (value: unknown): value is ChatMessage => {
  if (!isRecord(value)) return false;
  return isString(value.id) && isString(value.role) && isString(value.content);
};

const isMissingFileError = (error: unknown): boolean =>
  isRecord(error) && error.code === "ENOENT";

const parseChatSessionState = (value: unknown): ChatSessionState | undefined => {
  if (!isRecord(value)) return undefined;
  if (!isString(value.sessionId) || !isString(value.status) || !isString(value.cwd)) {
    return undefined;
  }
  if (!Array.isArray(value.messages) || !value.messages.every(isChatMessage)) {
    return undefined;
  }
  return value as unknown as ChatSessionState;
};

const parseChatSessionRecord = (value: unknown): ChatSessionRecord | undefined => {
  if (!isRecord(value)) return undefined;
  const state = parseChatSessionState(value.state);
  if (value.schemaVersion !== 1 || !isString(value.updatedAt) || !state) {
    return undefined;
  }
  return {
    schemaVersion: 1,
    updatedAt: value.updatedAt,
    state,
  };
};

const loadChatSessionRecord = async (
  storeDir: string,
  sessionId: string
): Promise<ChatSessionRecord | undefined> =>
  readFile(chatSessionFilePath(storeDir, sessionId), "utf-8")
    .then((raw) => parseChatSessionRecord(JSON.parse(raw) as unknown))
    .catch((error: unknown) => {
      if (isMissingFileError(error)) return undefined;
      throw error;
    });

const listChatSessionRecords = async (storeDir: string): Promise<ReadonlyArray<ChatSessionRecord>> =>
  readdir(storeDir)
    .then((files) =>
      Promise.all(
        files
          .filter((file) => file.endsWith(".json"))
          .map((file) =>
            readFile(join(storeDir, file), "utf-8").then((raw) =>
              parseChatSessionRecord(JSON.parse(raw) as unknown)
            )
          )
      )
    )
    .then((records) =>
      records.filter((record): record is ChatSessionRecord => Boolean(record))
    )
    .catch((error: unknown) => {
      if (isMissingFileError(error)) return [];
      throw error;
    });

export const getChatSessionStoreDir = (cwd: string): string => chatSessionStoreDir(cwd);

export const loadChatSessionState = async ({
  cwd,
  sessionId,
  storeDir = chatSessionStoreDir(cwd),
}: {
  readonly cwd: string;
  readonly sessionId: string;
  readonly storeDir?: string;
}): Promise<ChatSessionState | undefined> =>
  loadChatSessionRecord(storeDir, sessionId).then((record) => record?.state);

export const saveChatSessionState = async ({
  cwd,
  state,
  storeDir = chatSessionStoreDir(cwd),
}: {
  readonly cwd: string;
  readonly state: ChatSessionState;
  readonly storeDir?: string;
}): Promise<void> => {
  const record: ChatSessionRecord = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    state,
  };
  await mkdir(storeDir, { recursive: true });
  await writeFile(
    chatSessionFilePath(storeDir, state.sessionId),
    `${JSON.stringify(record, null, 2)}\n`,
    "utf-8"
  );
};

const toChatSessionSummary = (record: ChatSessionRecord): ChatSessionSummary => ({
  sessionId: record.state.sessionId,
  status: record.state.status,
  cwd: record.state.cwd,
  ...(record.state.workflowTarget ? { workflowTarget: record.state.workflowTarget } : {}),
  messageCount: record.state.messages.length,
  updatedAt: record.updatedAt,
});

export const listChatSessionSummaries = async ({
  cwd,
  storeDir = chatSessionStoreDir(cwd),
}: {
  readonly cwd: string;
  readonly storeDir?: string;
}): Promise<ReadonlyArray<ChatSessionSummary>> =>
  listChatSessionRecords(storeDir)
    .then((summaries) =>
      summaries
        .map(toChatSessionSummary)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    );

const chatRunDetailFromState =
  (executionId: string) =>
  (state: ChatSessionState): ChatRunDetail | undefined =>
    state.messages
      .flatMap((message) =>
        message.runSummary?.executionId === executionId
          ? [
              {
                sessionId: state.sessionId,
                messageId: message.id,
                messageCreatedAt: message.createdAt,
                ...(state.workflowTarget ? { workflowTarget: state.workflowTarget } : {}),
                runSummary: message.runSummary,
              },
            ]
          : []
      )
      .at(0);

const findFirstChatRunDetail = (
  states: ReadonlyArray<ChatSessionState>,
  executionId: string
): ChatRunDetail | undefined =>
  states
    .map(chatRunDetailFromState(executionId))
    .filter((detail): detail is ChatRunDetail => Boolean(detail))
    .at(0);

export const findChatRunDetail = async ({
  cwd,
  executionId,
  sessionId,
  storeDir = chatSessionStoreDir(cwd),
}: {
  readonly cwd: string;
  readonly executionId: string;
  readonly sessionId?: string;
  readonly storeDir?: string;
}): Promise<ChatRunDetail | undefined> =>
  sessionId
    ? loadChatSessionState({ cwd, sessionId, storeDir }).then((state) =>
        state ? chatRunDetailFromState(executionId)(state) : undefined
      )
    : listChatSessionRecords(storeDir).then((records) =>
        findFirstChatRunDetail(
          records.map((record) => record.state),
          executionId
        )
      );
