import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { WorkflowRunSummary } from "@obora/sdk";

import type { ChatMessage, ChatSessionState } from "./types.js";

export interface ChatSessionSummary {
  readonly sessionId: string;
  readonly status: ChatSessionState["status"];
  readonly cwd: string;
  readonly projectRoot?: string;
  readonly tags: ReadonlyArray<string>;
  readonly workflowTarget?: string;
  readonly messageCount: number;
  readonly updatedAt: string;
}

export type ChatSessionGroupBy = "project" | "tag" | "day";

export interface ChatSessionSummaryGroup {
  readonly group: string;
  readonly sessions: ReadonlyArray<ChatSessionSummary>;
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

const deleteChatSessionRecord = async (storeDir: string, sessionId: string): Promise<boolean> =>
  unlink(chatSessionFilePath(storeDir, sessionId))
    .then(() => true)
    .catch((error: unknown) => {
      if (isMissingFileError(error)) return false;
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

export const deleteChatSessionState = async ({
  cwd,
  sessionId,
  storeDir = chatSessionStoreDir(cwd),
}: {
  readonly cwd: string;
  readonly sessionId: string;
  readonly storeDir?: string;
}): Promise<boolean> => deleteChatSessionRecord(storeDir, sessionId);

export const renameChatSessionState = async ({
  cwd,
  fromSessionId,
  toSessionId,
  storeDir = chatSessionStoreDir(cwd),
}: {
  readonly cwd: string;
  readonly fromSessionId: string;
  readonly toSessionId: string;
  readonly storeDir?: string;
}): Promise<ChatSessionState | undefined> =>
  loadChatSessionState({ cwd, sessionId: fromSessionId, storeDir }).then((state) =>
    state
      ? saveChatSessionState({
          cwd,
          storeDir,
          state: {
            ...state,
            sessionId: toSessionId,
          },
        })
          .then(() => deleteChatSessionState({ cwd, sessionId: fromSessionId, storeDir }))
          .then(() => ({
            ...state,
            sessionId: toSessionId,
          }))
      : undefined
  );

const toChatSessionSummary = (record: ChatSessionRecord): ChatSessionSummary => ({
  sessionId: record.state.sessionId,
  status: record.state.status,
  cwd: record.state.cwd,
  ...(record.state.projectRoot ? { projectRoot: record.state.projectRoot } : {}),
  tags: record.state.tags ?? [],
  ...(record.state.workflowTarget ? { workflowTarget: record.state.workflowTarget } : {}),
  messageCount: record.state.messages.length,
  updatedAt: record.updatedAt,
});

const filterSummaryByTag =
  (tag: string | undefined) =>
  (summary: ChatSessionSummary): boolean =>
    tag ? summary.tags.includes(tag) : true;

const filterSummaryByProject =
  (projectRoot: string | undefined) =>
  (summary: ChatSessionSummary): boolean =>
    projectRoot ? (summary.projectRoot ?? summary.cwd) === projectRoot : true;

export const listChatSessionSummaries = async ({
  cwd,
  tag,
  projectRoot,
  storeDir = chatSessionStoreDir(cwd),
}: {
  readonly cwd: string;
  readonly tag?: string;
  readonly projectRoot?: string;
  readonly storeDir?: string;
}): Promise<ReadonlyArray<ChatSessionSummary>> =>
  listChatSessionRecords(storeDir)
    .then((summaries) =>
      summaries
        .map(toChatSessionSummary)
        .filter(filterSummaryByTag(tag))
        .filter(filterSummaryByProject(projectRoot))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    );

const sessionGroupKeys = (
  summary: ChatSessionSummary,
  groupBy: ChatSessionGroupBy,
  focusedTag?: string
): ReadonlyArray<string> =>
  groupBy === "project"
    ? [summary.projectRoot ?? summary.cwd]
    : groupBy === "day"
      ? [summary.updatedAt.slice(0, 10)]
      : focusedTag
        ? [focusedTag]
      : summary.tags.length > 0
        ? summary.tags
        : ["untagged"];

const appendGroupedSession = (
  groups: Readonly<Record<string, ReadonlyArray<ChatSessionSummary>>>,
  key: string,
  summary: ChatSessionSummary
): Readonly<Record<string, ReadonlyArray<ChatSessionSummary>>> => ({
  ...groups,
  [key]: [...(groups[key] ?? []), summary],
});

export const groupChatSessionSummaries = (
  summaries: ReadonlyArray<ChatSessionSummary>,
  groupBy: ChatSessionGroupBy,
  focusedTag?: string
): ReadonlyArray<ChatSessionSummaryGroup> =>
  Object.entries(
    summaries.reduce<Readonly<Record<string, ReadonlyArray<ChatSessionSummary>>>>(
      (groups, summary) =>
        sessionGroupKeys(summary, groupBy, focusedTag).reduce(
          (nextGroups, key) => appendGroupedSession(nextGroups, key, summary),
          groups
        ),
      {}
    )
  )
    .map(([group, sessions]) => ({ group, sessions }))
    .sort((left, right) => left.group.localeCompare(right.group));

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
