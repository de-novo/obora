/**
 * @module id-generator
 * @description ID 생성기
 */

import type { AgentId, TaskId, AgendaId, SessionId } from "../types";
import { createAgentId, createTaskId, createAgendaId, createSessionId } from "../types";

/**
 * UUID v4 생성 (crypto.randomUUID 사용 가능한 경우)
 */
function uuidv4(): string {
  // Node.js 환경에서 crypto 사용 시도
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  // Fallback: crypto.getRandomValues() 사용 (보안상 안전)
  const array = new Uint8Array(16);
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(array);
  } else {
    // Node.js 환경: 동기적 randomFillSync 사용
    const nodeCrypto = require("crypto");
    nodeCrypto.randomFillSync(array);
  }

  // UUID v4 형식으로 변환
  array[6] = (array[6] & 0x0f) | 0x40; // Version 4
  array[8] = (array[8] & 0x3f) | 0x80; // Variant 10

  const hex = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * ID 생성기 인터페이스
 */
export interface IdGenerator {
  generateAgentId(): AgentId;
  generateTaskId(): TaskId;
  generateAgendaId(): AgendaId;
  generateSessionId(): SessionId;
  generateGenericId(prefix?: string): string;
}

/**
 * 기본 ID 생성기 (crypto.randomUUID 기반)
 */
export class DefaultIdGenerator implements IdGenerator {
  generateAgentId(): AgentId {
    return createAgentId(`agent-${uuidv4()}`);
  }

  generateTaskId(): TaskId {
    return createTaskId(`task-${uuidv4()}`);
  }

  generateAgendaId(): AgendaId {
    return createAgendaId(`agenda-${uuidv4()}`);
  }

  generateSessionId(): SessionId {
    return createSessionId(`session-${uuidv4()}`);
  }

  generateGenericId(prefix: string = "id"): string {
    return `${prefix}-${uuidv4()}`;
  }
}

/**
 * 테스트용 시퀀셜 ID 생성기
 */
export class SequentialIdGenerator implements IdGenerator {
  private counters: Map<string, number> = new Map();

  private nextCounter(prefix: string): number {
    const current = this.counters.get(prefix) ?? 0;
    this.counters.set(prefix, current + 1);
    return current;
  }

  generateAgentId(): AgentId {
    const num = this.nextCounter("agent");
    return createAgentId(`agent-${String(num).padStart(4, "0")}`);
  }

  generateTaskId(): TaskId {
    const num = this.nextCounter("task");
    return createTaskId(`task-${String(num).padStart(4, "0")}`);
  }

  generateAgendaId(): AgendaId {
    const num = this.nextCounter("agenda");
    return createAgendaId(`agenda-${String(num).padStart(4, "0")}`);
  }

  generateSessionId(): SessionId {
    const num = this.nextCounter("session");
    return createSessionId(`session-${String(num).padStart(4, "0")}`);
  }

  generateGenericId(prefix: string = "id"): string {
    const num = this.nextCounter(prefix);
    return `${prefix}-${String(num).padStart(4, "0")}`;
  }

  /**
   * 카운터 리셋 (테스트용)
   */
  reset(): void {
    this.counters.clear();
  }

  /**
   * 특정 프리픽스의 카운터 리셋
   */
  resetPrefix(prefix: string): void {
    this.counters.delete(prefix);
  }
}

/**
 * 기본 ID 생성기 인스턴스 (싱글톤)
 */
export const defaultIdGenerator = new DefaultIdGenerator();

/**
 * 테스트용 시퀀셜 ID 생성기 인스턴스
 */
export const sequentialIdGenerator = new SequentialIdGenerator();
