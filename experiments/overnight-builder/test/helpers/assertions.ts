import { expect } from 'vitest';
import type { Todo } from '../../src/types';

/**
 * Todo 객체 비교 (날짜 처리 포함)
 */
export function assertTodoEqual(actual: Todo, expected: Todo): void {
  expect(actual.id).toBe(expected.id);
  expect(actual.text).toBe(expected.text);
  expect(actual.completed).toBe(expected.completed);
  expect(actual.createdAt.toISOString()).toBe(expected.createdAt.toISOString());
  
  if (expected.completedAt) {
    expect(actual.completedAt).not.toBeNull();
    expect(actual.completedAt?.toISOString()).toBe(expected.completedAt.toISOString());
  } else {
    expect(actual.completedAt).toBeNull();
  }
}

/**
 * Todo 배열 비교
 */
export function assertTodosEqual(actual: Todo[], expected: Todo[]): void {
  expect(actual.length).toBe(expected.length);
  actual.forEach((todo, i) => {
    assertTodoEqual(todo, expected[i]!);
  });
}

/**
 * 에러 메시지 포함 확인
 */
export function assertErrorMessage(error: Error, expectedMessage: string): void {
  expect(error.message).toContain(expectedMessage);
}

/**
 * 에러 코드 확인
 */
export function assertErrorCode(error: Error & { code?: string }, expectedCode: string): void {
  expect(error.code).toBe(expectedCode);
}
