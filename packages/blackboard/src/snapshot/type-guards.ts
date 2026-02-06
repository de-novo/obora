/**
 * @module snapshot/type-guards
 * @description 타입 가드 함수들 (중복 제거)
 */

import type { SerializedState } from './types';

/**
 * 타입 가드: SerializedState 여부 확인
 * @description P1: 검증 범위 확대 - state/knowledge/decisions 필드 검증 추가
 * @param value - 확인할 값
 * @returns SerializedState 타입 여부
 */
export function isSerializedState(value: unknown): value is SerializedState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Partial<SerializedState>;

  // meta 필드 필수 확인
  if (!obj.meta || typeof obj.meta !== 'object') {
    return false;
  }

  // meta의 필수 필드 확인
  const meta = obj.meta;
  if (!meta.sessionId || typeof meta.sessionId !== 'string') {
    return false;
  }
  if (typeof meta.version !== 'number') {
    return false;
  }

  // P1: state 섹션 필드 검증
  if (!obj.state || typeof obj.state !== 'object') {
    return false;
  }
  const state = obj.state;
  if (typeof state.phase !== 'string') {
    return false;
  }
  if (!state.context || typeof state.context !== 'object') {
    return false;
  }
  if (!Array.isArray(state.agents)) {
    return false;
  }
  if (!Array.isArray(state.tasks)) {
    return false;
  }

  // P1: knowledge 섹션 필드 검증
  if (!obj.knowledge || typeof obj.knowledge !== 'object') {
    return false;
  }
  const knowledge = obj.knowledge;
  if (!Array.isArray(knowledge.facts)) {
    return false;
  }
  if (!Array.isArray(knowledge.inferences)) {
    return false;
  }
  if (!Array.isArray(knowledge.patterns)) {
    return false;
  }

  // P1: decisions 섹션 필드 검증
  if (!obj.decisions || typeof obj.decisions !== 'object') {
    return false;
  }
  const decisions = obj.decisions;
  if (!Array.isArray(decisions.pending)) {
    return false;
  }
  if (!Array.isArray(decisions.opinions)) {
    return false;
  }
  if (!Array.isArray(decisions.history)) {
    return false;
  }

  return true;
}
