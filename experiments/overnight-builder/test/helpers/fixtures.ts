import type { Todo, TodoStorage } from '../../src/types';

/**
 * Mock Todo 객체 생성
 */
export function createMockTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 'test-id-123',
    text: '테스트 할 일',
    completed: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    completedAt: null,
    ...overrides,
  };
}

/**
 * Mock Storage 객체 생성
 */
export function createMockStorage(todos: Todo[] = []): TodoStorage {
  return {
    version: '1.0.0',
    todos,
  };
}

/**
 * 여러 개의 Mock Todo 생성
 */
export function createMockTodos(count: number): Todo[] {
  return Array.from({ length: count }, (_, i) => 
    createMockTodo({
      id: `test-id-${i}`,
      text: `할 일 ${i + 1}`,
      completed: i % 2 === 0,
      completedAt: i % 2 === 0 ? new Date(`2024-01-0${i + 1}T00:00:00Z`) : null,
    })
  );
}
