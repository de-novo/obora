/**
 * @module blackboard
 * @description 메인 Blackboard 클래스
 */

import type {
  BlackboardState,
  BlackboardMeta,
  KnowledgeSection,
  BoardPhase,
  DecisionsSection,
  SessionId,
  StateSection,
  VotingSession,
  Opinion,
  Task,
  AgentStatus,
} from "../types";
import { createAgentId, createSessionId, createTaskId } from "../types/base";

import { VersionManager, VersionConflictError } from "./versioning";
import { getByPath, setByPath, deleteByPath, isValidPath } from "./path-utils";
import { deepClone, mapToObject, objectToMap } from "./immutable";

import { StateSectionAccessor } from "./accessors/state-accessor";
import { KnowledgeSectionAccessor } from "./accessors/knowledge-accessor";
import { DecisionsSectionAccessor } from "./accessors/decisions-accessor";

export { BlackboardError, BlackboardErrorCode, PathNotFoundError } from "./errors";
import { BlackboardError, BlackboardErrorCode, PathNotFoundError } from "./errors";

// Snapshot imports
import { SnapshotManager } from "../snapshot";
import type {
  Snapshot,
  CreateSnapshotOptions,
  RestoreSnapshotOptions,
  SnapshotValidationResult,
} from "../snapshot";

// Re-export types for convenience
export { BoardPhase };

/**
 * 간단한 EventEmitter 구현
 */
type EventListener = (...args: unknown[]) => void;

class SimpleEventEmitter {
  private _listeners: Map<string, EventListener[]> = new Map();

  on(event: string, listener: EventListener): this {
    const listeners = this._listeners.get(event) ?? [];
    listeners.push(listener);
    this._listeners.set(event, listeners);
    return this;
  }

  off(event: string, listener: EventListener): this {
    const listeners = this._listeners.get(event) ?? [];
    const index = listeners.indexOf(listener);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
    return this;
  }

  once(event: string, listener: EventListener): this {
    const onceWrapper = (...args: unknown[]) => {
      this.off(event, onceWrapper);
      listener(...args);
    };
    return this.on(event, onceWrapper);
  }

  emit(event: string, ...args: unknown[]): boolean {
    const listeners = this._listeners.get(event) ?? [];
    for (const listener of listeners) {
      listener(...args);
    }

    // 와일드카드 지원 (예: 'state.*' -> 'state.updated' 매칭)
    for (const [pattern, wildcardListeners] of this._listeners.entries()) {
      if (pattern.endsWith("*") && event.startsWith(pattern.slice(0, -1))) {
        for (const listener of wildcardListeners) {
          listener(...args);
        }
      }
    }

    return listeners.length > 0;
  }

  removeAllListeners(event?: string): this {
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
    return this;
  }

  listenerCount(event: string): number {
    return this._listeners.get(event)?.length ?? 0;
  }
}

/**
 * Blackboard 설정 옵션
 */
export interface BlackboardOptions {
  /** 세션 ID (자동 생성되지 않으면 필수) */
  sessionId?: SessionId;
  /** 초기 상태 (스냅샷 복원 시 사용) */
  initialState?: Partial<BlackboardState>;
  /** 버전 충돌 시 재시도 횟수 */
  maxRetries?: number;
  /** 재시도 간격 (ms) */
  retryDelay?: number;
  /** 이벤트 리스너 */
  onEvent?: (event: { type: string; timestamp: Date }) => void;
}

/**
 * 쿼리 옵션
 */
export interface QueryOptions {
  /** 깊은 복사 반환 여부 (기본: true) */
  deep?: boolean;
  /** 필터 조건 */
  filter?: Record<string, unknown>;
  /** 정렬 기준 */
  sort?: { field: string; order: "asc" | "desc" };
  /** 결과 제한 */
  limit?: number;
  /** 오프셋 */
  offset?: number;
}

/**
 * 쓰기 결과
 */
export interface WriteResult {
  /** 성공 여부 */
  success: boolean;
  /** 새 버전 */
  version: number;
  /** 변경된 경로 */
  path: string;
  /** 이전 값 */
  previousValue: unknown;
  /** 에러 (실패 시) */
  error?: Error;
}

/**
 * 트랜잭션 연산
 */
export interface Operation {
  /** 연산 타입 */
  type: "read" | "write" | "delete";
  /** 섹션 */
  section: string;
  /** 키/경로 */
  key: string;
  /** 값 (write 연산 시) */
  value?: unknown;
}

/**
 * Blackboard 메인 클래스
 * @description 시스템의 단일 진실 소스(SSOT)를 관리하는 핵심 클래스
 *
 * @example
 * ```typescript
 * const board = new Blackboard({ sessionId: createSessionId('session-001') });
 *
 * // 읽기
 * const phase = board.read('state.phase');
 *
 * // 쓰기 (버전 관리 포함)
 * const result = board.write('state.phase', 'discussion');
 *
 * // 섹션 접근
 * const stateSection = board.state;
 * const knowledgeSection = board.knowledge;
 * const decisionsSection = board.decisions;
 * ```
 */
export class Blackboard extends SimpleEventEmitter {
  private _state: BlackboardState;
  private readonly versionManager: VersionManager;
  private readonly options: Required<Omit<BlackboardOptions, "onEvent">> &
    Pick<BlackboardOptions, "onEvent">;
  private _snapshotManager: SnapshotManager;

  // 섹션 접근자
  private _stateAccessor?: StateSectionAccessor;
  private _knowledgeAccessor?: KnowledgeSectionAccessor;
  private _decisionsAccessor?: DecisionsSectionAccessor;

  constructor(options: BlackboardOptions = {}) {
    super();
    this.options = this.normalizeOptions(options);
    this._state = this.createInitialState();
    this.versionManager = new VersionManager({
      maxRetries: this.options.maxRetries,
      retryDelay: this.options.retryDelay,
      exponentialBackoff: true,
    });
    this._snapshotManager = new SnapshotManager();

    // 접근자 초기화
    this._stateAccessor = new StateSectionAccessor(this);
    this._knowledgeAccessor = new KnowledgeSectionAccessor(this);
    this._decisionsAccessor = new DecisionsSectionAccessor(this);

    // state.initialized 이벤트 발생 (onEvent 옵션이 있는 경우)
    if (options.onEvent) {
      options.onEvent({ type: "state.initialized", timestamp: new Date() });
    }
  }

  /**
   * 옵션 정규화
   */
  private normalizeOptions(
    options: BlackboardOptions
  ): Required<Omit<BlackboardOptions, "onEvent">> & Pick<BlackboardOptions, "onEvent"> {
    return {
      sessionId: options.sessionId ?? createSessionId(`session-${Date.now()}`),
      initialState: options.initialState ?? {},
      maxRetries: options.maxRetries ?? 3,
      retryDelay: options.retryDelay ?? 100,
      onEvent: options.onEvent,
    };
  }

  /**
   * 초기 상태 생성
   */
  private createInitialState(): BlackboardState {
    const now = new Date();
    const sessionId = this.options.sessionId;

    // 초기 상태 복원
    if (this.options.initialState.meta) {
      return {
        meta: {
          version: this.options.initialState.meta?.version ?? 1,
          lastUpdated: this.options.initialState.meta?.lastUpdated ?? now,
          sessionId: this.options.initialState.meta?.sessionId ?? sessionId,
          createdAt: this.options.initialState.meta?.createdAt ?? now,
        },
        state: this.options.initialState.state ?? {
          phase: "idle",
          context: {},
          agents: new Map(),
          tasks: new Map(),
        },
        knowledge: this.options.initialState.knowledge ?? {
          facts: [],
          inferences: [],
          patterns: [],
        },
        decisions: this.options.initialState.decisions ?? {
          current: null,
          pending: [],
          opinions: new Map(),
          history: [],
          voting: {},
        },
      };
    }

    // 새 상태 생성
    return {
      meta: {
        version: 1,
        lastUpdated: now,
        sessionId,
        createdAt: now,
      },
      state: {
        phase: "idle",
        context: {},
        agents: new Map(),
        tasks: new Map(),
      },
      knowledge: {
        facts: [],
        inferences: [],
        patterns: [],
      },
      decisions: {
        current: null,
        pending: [],
        opinions: new Map(),
        history: [],
        voting: {},
      },
    };
  }

  // === Getters for sections ===

  /** 메타데이터 섹션 (읽기 전용) */
  get meta(): Readonly<BlackboardMeta> {
    return {
      version: this._state.meta.version,
      lastUpdated: new Date(this._state.meta.lastUpdated.getTime()),
      sessionId: this._state.meta.sessionId,
      createdAt: new Date(this._state.meta.createdAt.getTime()),
    };
  }

  /** 상태 섹션 접근자 */
  get state(): StateSectionAccessor {
    if (!this._stateAccessor) {
      this._stateAccessor = new StateSectionAccessor(this);
    }
    return this._stateAccessor;
  }

  /** 지식 섹션 접근자 */
  get knowledge(): KnowledgeSectionAccessor {
    if (!this._knowledgeAccessor) {
      this._knowledgeAccessor = new KnowledgeSectionAccessor(this);
    }
    return this._knowledgeAccessor;
  }

  /** 의사결정 섹션 접근자 */
  get decisions(): DecisionsSectionAccessor {
    if (!this._decisionsAccessor) {
      this._decisionsAccessor = new DecisionsSectionAccessor(this);
    }
    return this._decisionsAccessor;
  }

  /** 현재 버전 */
  get version(): number {
    return this._state.meta.version;
  }

  /** 세션 ID */
  get sessionId(): SessionId {
    return this._state.meta.sessionId;
  }

  /** 스냅샷 관리자 (public) */
  get snapshotManager(): SnapshotManager {
    return this._snapshotManager;
  }

  // === Core API ===

  /**
   * 현재 전체 상태 조회
   * @returns 현재 Blackboard 상태 (스냅샷용)
   */
  getState(): BlackboardState {
    return {
      meta: {
        version: this._state.meta.version,
        lastUpdated: new Date(this._state.meta.lastUpdated.getTime()),
        sessionId: this._state.meta.sessionId,
        createdAt: new Date(this._state.meta.createdAt.getTime()),
      },
      state: {
        phase: this._state.state.phase,
        context: deepClone(this._state.state.context),
        agents: new Map(this._state.state.agents.entries()),
        tasks: new Map(this._state.state.tasks.entries()),
      },
      knowledge: {
        facts: this._state.knowledge.facts.map((f) => deepClone(f)),
        inferences: this._state.knowledge.inferences.map((i) => deepClone(i)),
        patterns: this._state.knowledge.patterns.map((p) => deepClone(p)),
      },
      decisions: {
        current: this._state.decisions.current ? deepClone(this._state.decisions.current) : null,
        pending: this._state.decisions.pending.map((d) => deepClone(d)),
        opinions: new Map(this._state.decisions.opinions.entries()),
        history: this._state.decisions.history.map((h) => deepClone(h)),
        voting: deepClone(this._state.decisions.voting),
      },
    };
  }

  /**
   * 경로 기반 읽기
   * @param path - 점(.)으로 구분된 경로 (예: 'state.phase', 'decisions.current')
   * @param options - 쿼리 옵션
   * @returns 해당 경로의 값
   */
  read<T = unknown>(path: string, options?: QueryOptions & { strict?: boolean }): T {
    const shouldDeepClone = options?.deep !== false;
    const strict = options?.strict !== false;
    const value = getByPath(this._state, path);

    if (value === undefined && strict) {
      throw new PathNotFoundError(path);
    }

    return (shouldDeepClone ? deepClone(value) : value) as T;
  }

  /**
   * 경로 기반 쓰기 (동기)
   * @param path - 점(.)으로 구분된 경로
   * @param value - 새 값
   * @param options - 쓰기 옵션 (expectedVersion 포함)
   * @returns 쓰기 결과
   */
  write(path: string, value: unknown, options?: { expectedVersion?: number }): WriteResult {
    // 경로 검증
    if (!isValidPath(path)) {
      throw new BlackboardError(BlackboardErrorCode.INVALID_PATH, `Invalid path: ${path}`);
    }

    // 버전 검증
    if (options?.expectedVersion !== undefined) {
      this.versionManager.validateVersion(this.version, options.expectedVersion, path);
    }

    const previousValue = getByPath(this._state, path);

    const newState = setByPath(this._state, path, value);
    this._state = newState;

    // 메타데이터 업데이트
    const newVersion = this.versionManager.incrementVersion(this.version);
    this._state.meta.version = newVersion;
    this._state.meta.lastUpdated = new Date();

    // state.updated 이벤트 발생
    this.emit("state.updated", { type: "state.updated", path, value, timestamp: new Date() });

    return {
      success: true,
      version: newVersion,
      path,
      previousValue,
    };
  }

  /**
   * 경로 기반 삭제
   * @param path - 삭제할 경로
   * @param options - 삭제 옵션
   * @returns 삭제 결과
   */
  delete(path: string, options?: { expectedVersion?: number; strict?: boolean }): WriteResult {
    // 경로 검증
    if (!isValidPath(path)) {
      return {
        success: false,
        version: this.version,
        path,
        previousValue: undefined,
        error: new BlackboardError(BlackboardErrorCode.INVALID_PATH, `Invalid path: ${path}`),
      };
    }

    // 경로가 존재하는지 확인
    const previousValue = getByPath(this._state, path);
    if (previousValue === undefined) {
      if (options?.strict !== false) {
        throw new PathNotFoundError(path);
      }
      return {
        success: false,
        version: this.version,
        path,
        previousValue: undefined,
      };
    }

    // 버전 검증
    if (options?.expectedVersion !== undefined) {
      try {
        this.versionManager.validateVersion(this.version, options.expectedVersion, path);
      } catch (error) {
        return {
          success: false,
          version: this.version,
          path,
          previousValue,
          error: error as Error,
        };
      }
    }

    try {
      const newState = deleteByPath(this._state, path);
      this._state = newState;

      // 메타데이터 업데이트
      const newVersion = this.versionManager.incrementVersion(this.version);
      this._state.meta.version = newVersion;
      this._state.meta.lastUpdated = new Date();

      return {
        success: true,
        version: newVersion,
        path,
        previousValue,
      };
    } catch (error) {
      return {
        success: false,
        version: this.version,
        path,
        previousValue,
        error: error as Error,
      };
    }
  }

  /**
   * 경로 존재 여부 확인
   * @param path - 확인할 경로
   */
  exists(path: string): boolean {
    return getByPath(this._state, path) !== undefined;
  }

  /**
   * 트랜잭션 실행
   * @description 여러 쓰기를 원자적으로 실행
   * @param operations - 실행할 연산 목록
   * @returns 전체 트랜잭션 결과
   */
  transaction(
    operations: Array<{
      type: "write" | "delete";
      path: string;
      value?: unknown;
      expectedVersion?: number;
    }>
  ): WriteResult[] {
    const originalVersion = this._state.meta.version;
    const results: WriteResult[] = [];
    const backup = {
      meta: {
        version: this._state.meta.version,
        lastUpdated: new Date(this._state.meta.lastUpdated.getTime()),
        sessionId: this._state.meta.sessionId,
        createdAt: new Date(this._state.meta.createdAt.getTime()),
      },
      state: {
        phase: this._state.state.phase,
        context: deepClone(this._state.state.context),
        agents: new Map(this._state.state.agents.entries()),
        tasks: new Map(this._state.state.tasks.entries()),
      },
      knowledge: {
        facts: this._state.knowledge.facts.map((f) => deepClone(f)),
        inferences: this._state.knowledge.inferences.map((i) => deepClone(i)),
        patterns: this._state.knowledge.patterns.map((p) => deepClone(p)),
      },
      decisions: {
        current: this._state.decisions.current ? deepClone(this._state.decisions.current) : null,
        pending: this._state.decisions.pending.map((d) => deepClone(d)),
        opinions: new Map(this._state.decisions.opinions.entries()),
        history: this._state.decisions.history.map((h) => deepClone(h)),
        voting: deepClone(this._state.decisions.voting),
      },
    };

    try {
      // 버전 검증 (모든 연산 전에 수행)
      for (const op of operations) {
        if (op.expectedVersion !== undefined) {
          this.versionManager.validateVersion(originalVersion, op.expectedVersion, op.path);
        }
      }

      // 모든 연산 실행 (버전 증가 없이)
      for (const op of operations) {
        // 내�的方法를 사용하여 버전 증가 없이 쓰기/삭제 수행
        if (op.type === "write") {
          const previousValue = getByPath(this._state, op.path);
          this._state = setByPath(this._state, op.path, op.value);
          results.push({
            success: true,
            version: originalVersion, // 아직 버전 증가 안 함
            path: op.path,
            previousValue,
          });
        } else {
          const previousValue = getByPath(this._state, op.path);
          this._state = deleteByPath(this._state, op.path);
          results.push({
            success: true,
            version: originalVersion, // 아직 버전 증가 안 함
            path: op.path,
            previousValue,
          });
        }
      }

      // 모든 성공 시 한 번만 버전 증가
      this._state.meta.version = originalVersion + 1;
      this._state.meta.lastUpdated = new Date();

      // 결과에 최종 버전 업데이트
      return results.map((r) => ({ ...r, version: this._state.meta.version }));
    } catch (error) {
      // 롤백: 상태 복원 및 버전 복원
      this._state = backup;
      this._state.meta.version = originalVersion;

      return operations.map(() => ({
        success: false,
        version: originalVersion,
        path: "",
        previousValue: undefined,
        error: error as Error,
      }));
    }
  }

  // === Snapshot Methods ===

  /**
   * 현재 상태 스냅샷 생성 (비동기)
   * @param options - 스냅샷 옵션
   * @returns 스냅샷
   */
  async createSnapshot(options?: CreateSnapshotOptions): Promise<Snapshot> {
    const state = this.getState();
    return this._snapshotManager.createSnapshot(state, options);
  }

  /**
   * 스냅샷에서 상태 복원
   * @param snapshot - 복원할 스냅샷
   * @param options - 복원 옵션
   */
  restoreSnapshot(snapshot: Snapshot, options?: RestoreSnapshotOptions): void {
    const restoredState = this._snapshotManager.restore(snapshot, options);
    this.replaceState(restoredState);
  }

  /**
   * 스냅샷 검증 (비동기)
   * @param snapshot - 검증할 스냅샷
   */
  async validateSnapshot(snapshot: Snapshot): Promise<SnapshotValidationResult> {
    return this._snapshotManager.validate(snapshot);
  }

  /**
   * 전체 상태 교체 (내부용)
   * @param newState - 새 상태
   */
  private replaceState(newState: BlackboardState): void {
    this._state = deepClone(newState);

    // 접근자 재초기화
    this._stateAccessor = new StateSectionAccessor(this);
    this._knowledgeAccessor = new KnowledgeSectionAccessor(this);
    this._decisionsAccessor = new DecisionsSectionAccessor(this);
  }

  /**
   * 스냅샷 생성 (JSON 직렬화용) - 하위 호환성 유지
   */
  toJSON(): unknown {
    return {
      meta: this._state.meta,
      state: {
        phase: this._state.state.phase,
        context: this._state.state.context,
        agents: mapToObject(this._state.state.agents),
        tasks: mapToObject(this._state.state.tasks),
      },
      knowledge: this._state.knowledge,
      decisions: {
        current: this._state.decisions.current,
        pending: this._state.decisions.pending,
        opinions: mapToObject(this._state.decisions.opinions),
        history: this._state.decisions.history,
        voting: this._state.decisions.voting,
      },
    };
  }

  /**
   * 스냅샷에서 복원 - 하위 호환성 유지
   */
  static fromJSON(json: {
    meta?: unknown;
    state?: unknown;
    knowledge?: unknown;
    decisions?: unknown;
  }): Blackboard {
    type SerializableStateSection = Partial<Omit<StateSection, "agents" | "tasks">> & {
      agents?: Record<string, AgentStatus>;
      tasks?: Record<string, Task>;
    };

    type SerializableDecisionsSection = Partial<Omit<DecisionsSection, "opinions" | "voting">> & {
      opinions?: Record<string, Opinion>;
      voting?: Record<string, VotingSession>;
    };

    const stateJson = (json.state ?? undefined) as SerializableStateSection | undefined;
    const decisionsJson = (json.decisions ?? undefined) as SerializableDecisionsSection | undefined;

    const state: Partial<BlackboardState> = {
      meta: json.meta as BlackboardMeta,
      state: stateJson
        ? {
            ...stateJson,
            phase: stateJson.phase ?? "idle",
            context: stateJson.context ?? {},
            agents: new Map(Object.entries(stateJson.agents ?? {}).map(([key, value]) => [createAgentId(key), value])),
            tasks: new Map(Object.entries(stateJson.tasks ?? {}).map(([key, value]) => [createTaskId(key), value])),
          }
        : undefined,
      knowledge: json.knowledge as KnowledgeSection,
      decisions: decisionsJson
        ? {
            ...decisionsJson,
            current: decisionsJson.current ?? null,
            pending: decisionsJson.pending ?? [],
            history: decisionsJson.history ?? [],
            opinions: objectToMap(decisionsJson.opinions ?? {}),
            voting: decisionsJson.voting ?? {},
          }
        : undefined,
    };

    return new Blackboard({ initialState: state });
  }
}

// Re-export error classes
export { VersionConflictError };
