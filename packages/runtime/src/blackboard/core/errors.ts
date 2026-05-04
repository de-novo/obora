/**
 * @module errors
 * @description Blackboard 에러 정의
 */

export enum BlackboardErrorCode {
  UNKNOWN_ERROR = 1000,
  INVALID_INPUT = 1001,
  NOT_IMPLEMENTED = 1002,
  PATH_NOT_FOUND = 1003,
  INVALID_PATH = 1004,

  SLOT_NOT_FOUND = 2000,
  SLOT_ALREADY_EXISTS = 2001,
  SLOT_TYPE_MISMATCH = 2002,
  SLOT_VERSION_CONFLICT = 2003,

  ENTRY_NOT_FOUND = 2100,
  ENTRY_ALREADY_EXISTS = 2101,
  ENTRY_LOCKED = 2102,

  AGENT_NOT_FOUND = 3000,
  AGENT_ALREADY_REGISTERED = 3001,
  AGENT_NOT_AVAILABLE = 3002,
  TASK_NOT_FOUND = 3003,
  TASK_ALREADY_ASSIGNED = 3004,
  TASK_IN_PROGRESS = 3005,

  FACT_NOT_FOUND = 4000,
  INFERENCE_NOT_FOUND = 4001,
  PATTERN_NOT_FOUND = 4002,
  INVALID_PREMISES = 4003,

  AGENDA_NOT_FOUND = 5000,
  AGENDA_ALREADY_IN_PROGRESS = 5001,
  AGENDA_ALREADY_RESOLVED = 5002,
  VOTING_NOT_STARTED = 5003,
  VOTING_ALREADY_ENDED = 5004,
  QUORUM_NOT_REACHED = 5005,
  ALREADY_VOTED = 5006,
  CONSENSUS_NOT_REACHED = 5007,
  DUPLICATE_OPINION = 5008,
  OPINION_NOT_FOUND = 5009,

  SNAPSHOT_NOT_FOUND = 6000,
  SNAPSHOT_CORRUPTED = 6001,
  SNAPSHOT_VERSION_MISMATCH = 6002,

  EVENT_HANDLER_ERROR = 7000,
  SUBSCRIPTION_NOT_FOUND = 7001,
}

export class PathNotFoundError extends Error {
  public readonly code = BlackboardErrorCode.PATH_NOT_FOUND;

  constructor(public readonly path: string) {
    super(`Path not found: ${path}`);
    this.name = "PathNotFoundError";
  }
}

export class BlackboardError extends Error {
  constructor(
    public readonly code: BlackboardErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "BlackboardError";
  }
}
