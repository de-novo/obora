// test/unit/performance.test.ts
// 성능 유닛 테스트

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { JsonStorage } from '../../src/storage';
import type { StorageSchema, Todo } from '../../src/types';

// Mock Storage 생성 헬퍼
function createMockStorage(initialTodos: Todo[] = []): JsonStorage {
  let data: StorageSchema = {
    version: 1,
    todos: initialTodos,
    metadata: {
      lastModified: new Date().toISOString(),
      backupCreated: true
    }
  };
  
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue(data),
    save: vi.fn().mockImplementation(async (newData: StorageSchema) => {
      data = newData;
    }),
    backup: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(null),
    acquireLock: vi.fn().mockResolvedValue(undefined),
    releaseLock: vi.fn().mockResolvedValue(undefined)
  } as unknown as JsonStorage;
}

// 샘플 Todo 생성 헬퍼
function createSampleTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: '1712345678901',
    content: '테스트 할 일',
    status: 'pending',
    createdAt: '2024-01-01T12:00:00.000Z',
    updatedAt: '2024-01-01T12:00:00.000Z',
    ...overrides
  };
}

describe('Performance Tests', () => {
  let TodoService: typeof import('../../src/services/todo.service').TodoService;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T12:00:00.000Z'));
    
    const { resetIdGenerator } = await import('../../src/utils/id-generator');
    resetIdGenerator();
    
    TodoService = (await import('../../src/services/todo.service')).TodoService;
  });

  afterEach(() => {
    vi.useRealTimals();
  });

  describe('대량 데이터 처리', () => {
    it('should handle 1000 todos in list', async () => {
      const todos: Todo[] = [];
      for (let i = 0; i < 1000; i++) {
        todos.push(createSampleTodo({
          id: String(1704110400000 + i),
          content: `할 일 ${i}`
        }));
      }
      
      const storage = createMockStorage(todos);
      const service = new TodoService(storage);
      
      const start = performance.now();
      const result = await service.list({ all: true });
      const duration = performance.now() - start;
      
      expect(result.success).toBe(true);
      expect((result.data as Todo[]).length).toBe(1000);
      expect(duration).toBeLessThan(100); // 100ms 이내
    });

    it('should add todo to large list efficiently', async () => {
      const todos: Todo[] = [];
      for (let i = 0; i < 999; i++) {
        todos.push(createSampleTodo({
          id: String(1704110400000 + i),
          content: `할 일 ${i}`
        }));
      }
      
      const storage = createMockStorage(todos);
      const service = new TodoService(storage);
      
      const start = performance.now();
      const result = await service.add('1000번째 할 일');
      const duration = performance.now() - start;
      
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(100); // 100ms 이내
    });

    it('should complete todo in large list efficiently', async () => {
      const todos: Todo[] = [];
      for (let i = 0; i < 1000; i++) {
        todos.push(createSampleTodo({
          id: String(1704110400000 + i),
          content: `할 일 ${i}`,
          status: 'pending'
        }));
      }
      
      const storage = createMockStorage(todos);
      const service = new TodoService(storage);
      
      const start = performance.now();
      const result = await service.done('1712345678999');
      const duration = performance.now() - start;
      
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(100); // 100ms 이내
    });

    it('should remove todo from large list efficiently', async () => {
      const todos: Todo[] = [];
      for (let i = 0; i < 1000; i++) {
        todos.push(createSampleTodo({
          id: String(1704110400000 + i),
          content: `할 일 ${i}`
        }));
      }
      
      const storage = createMockStorage(todos);
      const service = new TodoService(storage);
      
      const start = performance.now();
      const result = await service.remove('1712345678999');
      const duration = performance.now() - start;
      
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(100); // 100ms 이내
    });
  });

  describe('필터링 성능', () => {
    it('should filter pending todos efficiently', async () => {
      const todos: Todo[] = [];
      for (let i = 0; i < 500; i++) {
        todos.push(createSampleTodo({
          id: String(1704110400000 + i),
          content: `할 일 ${i}`,
          status: i % 2 === 0 ? 'pending' : 'done'
        }));
      }
      
      const storage = createMockStorage(todos);
      const service = new TodoService(storage);
      
      const start = performance.now();
      const result = await service.list({ all: false });
      const duration = performance.now() - start;
      
      expect(result.success).toBe(true);
      expect((result.data as Todo[]).length).toBe(250);
      expect(duration).toBeLessThan(50); // 50ms 이내
    });

    it('should filter all todos efficiently', async () => {
      const todos: Todo[] = [];
      for (let i = 0; i < 1000; i++) {
        todos.push(createSampleTodo({
          id: String(1704110400000 + i),
          content: `할 일 ${i}`,
          status: i % 2 === 0 ? 'pending' : 'done'
        }));
      }
      
      const storage = createMockStorage(todos);
      const service = new TodoService(storage);
      
      const start = performance.now();
      const result = await service.list({ all: true });
      const duration = performance.now() - start;
      
      expect(result.success).toBe(true);
      expect((result.data as Todo[]).length).toBe(1000);
      expect(duration).toBeLessThan(50); // 50ms 이내
    });
  });

  describe('정렬 성능', () => {
    it('should sort 1000 todos efficiently', async () => {
      const todos: Todo[] = [];
      for (let i = 1000; i > 0; i--) {
        todos.push(createSampleTodo({
          id: String(1704110400000 + i),
          content: `할 일 ${i}`,
          createdAt: new Date(2024, 0, 1, 12, 0, i).toISOString()
        }));
      }
      
      const storage = createMockStorage(todos);
      const service = new TodoService(storage);
      
      const start = performance.now();
      const result = await service.list({ all: true });
      const duration = performance.now() - start;
      
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(100); // 100ms 이내
      
      // 정렬 확인 (최신순)
      const listed = result.data as Todo[];
      expect(listed[0]?.createdAt).toBeGreaterThan(listed[999]?.createdAt!);
    });
  });

  describe('ID 생성 성능', () => {
    it('should generate 1000 unique IDs efficiently', async () => {
      const { generateId, resetIdGenerator } = await import('../../src/utils/id-generator');
      resetIdGenerator();
      
      const start = performance.now();
      const ids = new Set<string>();
      
      for (let i = 0; i < 1000; i++) {
        ids.add(generateId());
      }
      
      const duration = performance.now() - start;
      
      expect(ids.size).toBe(1000);
      expect(duration).toBeLessThan(50); // 50ms 이내
    });
  });

  describe('검증 성능', () => {
    it('should validate content efficiently', async () => {
      const { validateContent } = await import('../../src/utils/validator');
      
      const start = performance.now();
      
      for (let i = 0; i < 1000; i++) {
        try {
          validateContent(`테스트 할 일 ${i}`);
        } catch {
          // 무시
        }
      }
      
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(50); // 50ms 이내
    });

    it('should validate ID efficiently', async () => {
      const { validateId } = await import('../../src/utils/validator');
      
      const start = performance.now();
      
      for (let i = 0; i < 1000; i++) {
        try {
          validateId(String(1704110400000 + i));
        } catch {
          // 무시
        }
      }
      
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(50); // 50ms 이내
    });
  });

  describe('포맷팅 성능', () => {
    it('should format 100 todos efficiently', async () => {
      const { formatTodoList } = await import('../../src/utils/formatter');
      
      const todos: Todo[] = [];
      for (let i = 0; i < 100; i++) {
        todos.push(createSampleTodo({
          id: String(1704110400000 + i),
          content: `할 일 ${i}`
        }));
      }
      
      const start = performance.now();
      const result = formatTodoList(todos);
      const duration = performance.now() - start;
      
      expect(result).toContain('할 일');
      expect(duration).toBeLessThan(50); // 50ms 이내
    });

    it('should handle long content efficiently', async () => {
      const { formatTodoList } = await import('../../src/utils/formatter');
      
      const todos: Todo[] = [];
      for (let i = 0; i < 10; i++) {
        todos.push(createSampleTodo({
          id: String(1704110400000 + i),
          content: 'a'.repeat(500)
        }));
      }
      
      const start = performance.now();
      const result = formatTodoList(todos);
      const duration = performance.now() - start;
      
      expect(result).toContain('a');
      expect(duration).toBeLessThan(20); // 20ms 이내
    });
  });

  describe('메모리 사용량', () => {
    it('should not leak memory when adding todos', async () => {
      const storage = createMockStorage();
      const service = new TodoService(storage);
      
      const initialMemory = process.memoryUsage().heapUsed;
      
      for (let i = 0; i < 100; i++) {
        await service.add(`할 일 ${i}`);
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // 메모리 증가가 합리적인 범위 내여야 함 (10MB 이하)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe('동시 작업 성능', () => {
    it('should handle multiple sequential operations efficiently', async () => {
      const storage = createMockStorage();
      const service = new TodoService(storage);
      
      const start = performance.now();
      
      // 10개의 연속 작업
      for (let i = 0; i < 10; i++) {
        await service.add(`할 일 ${i}`);
      }
      
      const duration = performance.now() - start;
      
      // 각 작업이 평균 50ms 이내
      expect(duration).toBeLessThan(500);
    });
  });
});
