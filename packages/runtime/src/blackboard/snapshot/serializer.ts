/**
 * @module snapshot/serializer
 * @description 직렬화/역직렬화 (브라우저/Node.js 호환)
 */

import type {
  BlackboardState,
  AgentId,
  TaskId,
  SessionId,
  Fact,
  Inference,
  Pattern,
  Agenda,
  Opinion,
  Resolution,
  AgentStatus,
  Task,
  BoardPhase,
  VotingSession,
} from "../types";
import type { SerializedState } from "./types";
import { sortedKeyReplacer } from "./utils";

/**
 * 직렬화 옵션
 */
export interface SerializeOptions {
  /** 날짜 형식 (기본: 'iso') */
  dateFormat?: "iso" | "timestamp";
  /** 정렬된 키 (재현 가능한 출력용) */
  sortKeys?: boolean;
  /** 들여쓰기 (기본: 0 = 압축) */
  indent?: number;
}

/**
 * 섹션 데이터 유효성 검증 결과
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Fact 구조 검증
 */
function validateFactArray(value: unknown): ValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(value)) {
    return { valid: false, errors: ["facts must be an array"] };
  }

  value.forEach((item, i) => {
    if (!item || typeof item !== "object") {
      errors.push(`facts[${i}]: must be an object`);
      return;
    }

    const fact = item as Record<string, unknown>;

    if (typeof fact.id !== "string") {
      errors.push(`facts[${i}].id: must be a string`);
    }

    if (typeof fact.content !== "string") {
      errors.push(`facts[${i}].content: must be a string`);
    }

    if (typeof fact.confidence !== "number" || fact.confidence < 0 || fact.confidence > 1) {
      errors.push(`facts[${i}].confidence: must be a number between 0 and 1`);
    }

    // createdAt은 문자열(ISO) 또는 Date 객체 허용
    if (typeof fact.createdAt !== "string" && !(fact.createdAt instanceof Date)) {
      errors.push(`facts[${i}].createdAt: must be a string or Date`);
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Inference 구조 검증
 */
function validateInferenceArray(value: unknown): ValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(value)) {
    return { valid: false, errors: ["inferences must be an array"] };
  }

  value.forEach((item, i) => {
    if (!item || typeof item !== "object") {
      errors.push(`inferences[${i}]: must be an object`);
      return;
    }

    const inference = item as Record<string, unknown>;

    if (typeof inference.id !== "string") {
      errors.push(`inferences[${i}].id: must be a string`);
    }

    if (typeof inference.conclusion !== "string") {
      errors.push(`inferences[${i}].conclusion: must be a string`);
    }

    if (
      typeof inference.confidence !== "number" ||
      inference.confidence < 0 ||
      inference.confidence > 1
    ) {
      errors.push(`inferences[${i}].confidence: must be a number between 0 and 1`);
    }

    // createdAt은 선택적 (문자열 또는 Date 객체)
    if (
      inference.createdAt !== undefined &&
      typeof inference.createdAt !== "string" &&
      !(inference.createdAt instanceof Date)
    ) {
      errors.push(`inferences[${i}].createdAt: must be a string, Date, or undefined`);
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Pattern 구조 검증
 */
function validatePatternArray(value: unknown): ValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(value)) {
    return { valid: false, errors: ["patterns must be an array"] };
  }

  value.forEach((item, i) => {
    if (!item || typeof item !== "object") {
      errors.push(`patterns[${i}]: must be an object`);
      return;
    }

    const pattern = item as Record<string, unknown>;

    if (typeof pattern.id !== "string") {
      errors.push(`patterns[${i}].id: must be a string`);
    }

    if (typeof pattern.name !== "string") {
      errors.push(`patterns[${i}].name: must be a string`);
    }

    // createdAt은 선택적 (문자열 또는 Date 객체)
    if (
      pattern.createdAt !== undefined &&
      typeof pattern.createdAt !== "string" &&
      !(pattern.createdAt instanceof Date)
    ) {
      errors.push(`patterns[${i}].createdAt: must be a string, Date, or undefined`);
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Resolution 구조 검증
 */
function validateResolutionArray(value: unknown): ValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(value)) {
    return { valid: false, errors: ["history must be an array"] };
  }

  value.forEach((item, i) => {
    if (!item || typeof item !== "object") {
      errors.push(`history[${i}]: must be an object`);
      return;
    }

    const resolution = item as Record<string, unknown>;

    if (typeof resolution.agendaId !== "string") {
      errors.push(`history[${i}].agendaId: must be a string`);
    }

    if (typeof resolution.decision !== "string") {
      errors.push(`history[${i}].decision: must be a string`);
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Agenda 구조 검증
 */
function validateAgenda(value: unknown, fieldName: string): ValidationResult {
  const errors: string[] = [];

  if (value === null) {
    return { valid: true, errors };
  }

  if (!value || typeof value !== "object") {
    return { valid: false, errors: [`${fieldName}: must be an object or null`] };
  }

  const agenda = value as Record<string, unknown>;

  if (typeof agenda.id !== "string") {
    errors.push(`${fieldName}.id: must be a string`);
  }

  if (typeof agenda.title !== "string") {
    errors.push(`${fieldName}.title: must be a string`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 상태 직렬화기
 * @description Map, Date 등을 JSON 호환 형식으로 변환
 */
export class StateSerializer {
  constructor(private options: SerializeOptions = {}) {}

  /**
   * BlackboardState → SerializedState
   * @param state - 원본 상태
   * @returns 직렬화된 상태
   */
  serialize(state: BlackboardState): SerializedState {
    return {
      meta: {
        version: state.meta.version,
        lastUpdated: this.serializeDate(state.meta.lastUpdated),
        sessionId: state.meta.sessionId,
        createdAt: this.serializeDate(state.meta.createdAt),
      },
      state: {
        phase: state.state.phase,
        context: state.state.context,
        agents: this.serializeMap(state.state.agents),
        tasks: this.serializeMap(state.state.tasks),
      },
      knowledge: {
        facts: state.knowledge.facts,
        inferences: state.knowledge.inferences,
        patterns: state.knowledge.patterns,
      },
      decisions: {
        current: state.decisions.current,
        pending: state.decisions.pending,
        opinions: this.serializeMap(state.decisions.opinions),
        history: state.decisions.history,
        voting: state.decisions.voting,
      },
    };
  }

  /**
   * 임의의 객체를 JSON 문자열로 직렬화
   * @param obj - 직렬화할 객체
   * @returns JSON 문자열
   * @description Date, Map, Set 등을 포함한 일반 객체 직렬화
   */
  serializeJSON(obj: unknown): string {
    const indent = this.options.indent ?? 0;
    const replacer = this.options.sortKeys
      ? (sortedKeyReplacer as (key: string, value: unknown) => unknown)
      : undefined;

    // JSON.stringify 직렬화
    return JSON.stringify(obj, replacer, indent);
  }

  /**
   * JSON 문자열을 객체로 역직렬화
   * @param json - JSON 문자열
   * @returns 역직렬화된 객체
   * @throws {Error} JSON 파싱 실패 시
   * @description JSON.parse를 사용한 기본 역직렬화
   */
  deserializeJSON<T = unknown>(json: string): T {
    try {
      return JSON.parse(json) as T;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON: ${error.message}`, { cause: error });
      }
      throw error;
    }
  }

  /**
   * SerializedState → BlackboardState
   * @param serialized - 직렬화된 상태
   * @returns 복원된 상태
   */
  deserialize(serialized: SerializedState): BlackboardState {
    // 구조 검증 (P1: 입력 검증 강화)
    if (!serialized || typeof serialized !== "object") {
      throw new Error("Invalid serialized state: must be an object");
    }

    // 필수 필드 검증
    const requiredSections = ["meta", "state", "knowledge", "decisions"] as const;
    requiredSections.forEach((section) => {
      if (!serialized[section]) {
        throw new Error(`Invalid serialized state: missing section '${section}'`);
      }
    });

    // P1: 런타임 타입 검증 - facts
    const factsValidation = validateFactArray(serialized.knowledge.facts);
    if (!factsValidation.valid) {
      throw new Error(`Invalid facts data: ${factsValidation.errors.join(", ")}`);
    }

    // P1: 런타임 타입 검증 - inferences
    const inferencesValidation = validateInferenceArray(serialized.knowledge.inferences);
    if (!inferencesValidation.valid) {
      throw new Error(`Invalid inferences data: ${inferencesValidation.errors.join(", ")}`);
    }

    // P1: 런타임 타입 검증 - patterns
    const patternsValidation = validatePatternArray(serialized.knowledge.patterns);
    if (!patternsValidation.valid) {
      throw new Error(`Invalid patterns data: ${patternsValidation.errors.join(", ")}`);
    }

    // P1: 런타임 타입 검증 - current
    const currentValidation = validateAgenda(serialized.decisions.current, "decisions.current");
    if (!currentValidation.valid) {
      throw new Error(`Invalid current agenda: ${currentValidation.errors.join(", ")}`);
    }

    // P1: 런타임 타입 검증 - pending
    if (!Array.isArray(serialized.decisions.pending)) {
      throw new Error("Invalid pending agendas: must be an array");
    }
    serialized.decisions.pending.forEach((agenda, i) => {
      const pendingValidation = validateAgenda(
        agenda,
        `decisions.pending[${i}]`
      );
      if (!pendingValidation.valid) {
        throw new Error(
          `Invalid pending agenda at index ${i}: ${pendingValidation.errors.join(", ")}`
        );
      }
    });

    // P1: 런타임 타입 검증 - history
    const historyValidation = validateResolutionArray(serialized.decisions.history);
    if (!historyValidation.valid) {
      throw new Error(`Invalid history data: ${historyValidation.errors.join(", ")}`);
    }

    // 런타임 검증 완료 후 타입 어서션 사용 (TypeScript는 런타임 검증을 이해하지 못함)
    return {
      meta: {
        version: serialized.meta.version,
        lastUpdated: this.deserializeDate(serialized.meta.lastUpdated),
        sessionId: this.restoreIds<SessionId>(serialized.meta.sessionId),
        createdAt: this.deserializeDate(serialized.meta.createdAt),
      },
      state: {
        phase: serialized.state.phase as BoardPhase,
        context: serialized.state.context,
        agents: this.deserializeMap(serialized.state.agents as Array<[AgentId, AgentStatus]>),
        tasks: this.deserializeMap(serialized.state.tasks as Array<[TaskId, Task]>),
      },
      knowledge: {
        facts: serialized.knowledge.facts as Fact[],
        inferences: serialized.knowledge.inferences as Inference[],
        patterns: serialized.knowledge.patterns as Pattern[],
      },
      decisions: {
        current: serialized.decisions.current as Agenda | null,
        pending: serialized.decisions.pending as Agenda[],
        opinions: this.deserializeMap(serialized.decisions.opinions as Array<[string, Opinion]>),
        history: serialized.decisions.history as Resolution[],
        voting: (serialized.decisions.voting ?? {}) as Record<string, VotingSession>,
      },
    };
  }

  /**
   * JSON 문자열로 변환
   * @param state - 원본 상태
   * @returns JSON 문자열
   */
  toJSON(state: BlackboardState): string {
    const serialized = this.serialize(state);
    const indent = this.options.indent ?? 0;

    // P1: sortKeys 옵션 구현
    // Note: JSON.stringify는 null을 허용하지 않으므로 조건부 처리
    if (this.options.sortKeys) {
      return JSON.stringify(
        serialized,
        sortedKeyReplacer as (key: string, value: unknown) => unknown,
        indent
      );
    }
    return JSON.stringify(serialized, null, indent);
  }

  /**
   * JSON 문자열에서 복원
   * @param json - JSON 문자열
   * @returns 복원된 상태
   * @throws {Error} JSON 파싱 실패 시 명확한 에러 메시지 (P1: JSON.parse 에러 처리)
   */
  fromJSON(json: string): BlackboardState {
    try {
      const parsed = JSON.parse(json) as SerializedState | null | undefined;
      // P1: null/undefined 검증 추가 (parsed.meta 접근 전)
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Invalid serialized state: parsed data is null or undefined");
      }
      return this.deserialize(parsed);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in serialized state: ${error.message}`, { cause: error });
      }
      throw error;
    }
  }

  // === 내부 헬퍼 ===

  /**
   * Map → Array 변환
   */
  private serializeMap<K extends string, V>(map: Map<K, V>): Array<[K, V]> {
    return Array.from(map.entries());
  }

  /**
   * Array → Map 변환
   */
  private deserializeMap<K extends string, V>(entries: Array<[K, V]>): Map<K, V> {
    // P1: 입력 검증 강화
    if (!Array.isArray(entries)) {
      throw new Error(`Invalid map data: expected array, got ${typeof entries}`);
    }
    // 브랜드 타입으로 인한 타입 어서션 필요 (런타임 문자열 → 브랜드 타입)
    return new Map(entries) as Map<K, V>;
  }

  /**
   * Date → string 변환
   */
  private serializeDate(date: Date): string {
    if (this.options.dateFormat === "timestamp") {
      return date.getTime().toString();
    }
    return date.toISOString();
  }

  /**
   * string → Date 변환
   */
  private deserializeDate(str: string): Date {
    // P1: 입력 검증 강화
    if (typeof str !== "string") {
      throw new Error(`Invalid date value: expected string, got ${typeof str}`);
    }

    // P1: 빈 문자열 입력 검증 추가
    if (!str || str.trim() === "") {
      throw new Error("Invalid date value: string must not be empty or whitespace-only");
    }

    const asNum = Number(str);
    if (!isNaN(asNum) && asNum > 1000000000) {
      return new Date(asNum);
    }
    const date = new Date(str);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date value: "${str}"`);
    }
    return date;
  }

  /**
   * Branded ID 복원
   * @param obj - 원본 ID 값 (일반적으로 문자열)
   * @returns 브랜드 타입으로 캐스팅된 ID
   * @description 문자열 타입 안전성 검증 후 반환
   */
  private restoreIds<T extends string>(obj: unknown): T {
    if (typeof obj !== "string") {
      throw new TypeError(`Expected string ID, got ${typeof obj}`);
    }
    return obj as T;
  }
}

/**
 * Node.js crypto 모듈 fallback (WebCrypto 없는 환경)
 */
async function calculateChecksumNodeJS(data: string): Promise<string> {
  // P0: Node.js require → ESM import 변경
  if (typeof process === "object") {
    try {
      // Dynamic import for Node.js crypto module (ESM compatible)
      const { createHash } = await import("crypto");
      return createHash("sha256").update(data).digest("hex");
    } catch {
      // Import 실패 시 fallback
    }
  }
  throw new Error(
    "No crypto implementation available. Please use a browser environment or Node.js with crypto support."
  );
}

/**
 * Web Crypto API를 사용한 체크섬 계산 (비동기)
 * @param data - 대상 데이터
 * @returns SHA-256 해시
 */
export async function calculateChecksum(data: unknown): Promise<string> {
  const str =
    typeof data === "string"
      ? data
      : JSON.stringify(data, sortedKeyReplacer as (key: string, value: unknown) => unknown);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);

  // P1: crypto.subtle fallback - Web Crypto API 우선, Node.js fallback
  if (typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined") {
    // Web Crypto API 사용 (브라우저/Node.js 호환)
    try {
      const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);

      // ArrayBuffer → hex string 변환
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

      return hashHex;
    } catch {
      // Web Crypto 실패 시 Node.js fallback 시도
      return calculateChecksumNodeJS(str);
    }
  } else {
    // Web Crypto 없는 환경에서 Node.js fallback
    return calculateChecksumNodeJS(str);
  }
}

/**
 * Web Crypto API를 사용한 체크섬 검증 (비동기)
 * @param data - 대상 데이터
 * @param expectedChecksum - 예상 체크섬
 * @returns 일치 여부
 */
export async function verifyChecksum(data: unknown, expectedChecksum: string): Promise<boolean> {
  const actualChecksum = await calculateChecksum(data);
  return actualChecksum === expectedChecksum;
}

/**
 * 동기 체크섬 계산 (Node.js 전용)
 * @param data - 대상 데이터
 * @returns SHA-256 해시
 * @description 테스트 환경 등에서 동기 체크섬이 필요한 경우 사용
 */
export function calculateChecksumSync(data: unknown): string {
  const str =
    typeof data === "string"
      ? data
      : JSON.stringify(data, sortedKeyReplacer as (key: string, value: unknown) => unknown);

  // Node.js 환경에서 동기 해싱
  if (typeof process === "object") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createHash } = require("crypto");
      return createHash("sha256").update(str).digest("hex");
    } catch {
      throw new Error(
        "Failed to calculate checksum synchronously. Ensure Node.js crypto module is available."
      );
    }
  }

  throw new Error("Synchronous checksum calculation is only supported in Node.js environments.");
}

/**
 * 동기 체크섬 검증 (Node.js 전용)
 * @param data - 대상 데이터
 * @param expectedChecksum - 예상 체크섬
 * @returns 일치 여부
 * @description 테스트 환경 등에서 동기 체크섬이 필요한 경우 사용
 */
export function verifyChecksumSync(data: unknown, expectedChecksum: string): boolean {
  const actualChecksum = calculateChecksumSync(data);
  return actualChecksum === expectedChecksum;
}
