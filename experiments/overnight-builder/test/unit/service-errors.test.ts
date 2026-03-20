// test/unit/service-errors.test.ts
// 서비스 레이어 에러 시나리오 유닛 테스트

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

describe('Service Error Scenarios', () => {
  let TodoService: typeof import('../../src/services/todo.service').TodoService;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T12:00:00.000Z'));
    
    const { resetIdGenerator } = await import('../../src/utils/id-generator');
    resetIdGenerator();
    
    TodoService = (await import('../../src/services/todo.service')).TodoService;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('저장소 에러', () => {
    it('should handle storage load failure', async () => {
      const storage = createMockStorage();
      storage.load = vi.fn().mockRejectedValue(new Error('Storage load failed'));
      
      const service = new TodoService(storage);
      
      const result = await service.list({ all: true });
      
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(2);
    });

    it('should handle storage save failure', async () => {
      const storage = createMockStorage();
      storage.save = vi.fn().mockRejectedValue(new Error('Storage save failed'));
      
      const service = new TodoService(storage);
      
      const result = await service.add('새 할 일');
      
      expect(result.success).toBe(false);
    });

    it('should release lock even when save fails', async () => {
      const storage = createMockStorage();
      storage.save = vi.fn().mockRejectedValue(new Error('Save failed'));
      
      const service = new TodoService(storage);
      
      await service.add('새 할 일');
      
      expect(storage.releaseLock).toHaveBeenCalled();
    });
  });

  describe('잠금 에러', () => {
    it('should handle lock acquisition failure', async () => {
      const { LockAcquisitionError } = await import('../../src/errors');
      
      const storage = createMockStorage();
      storage.acquireLock = vi.fn().mockRejectedValue(new LockAcquisitionError());
      
      const service = new TodoService(storage);
      
      const result = await service.add('새 할 일');
      
      expect(result.success).toBe(false);
    });

    it('should not call save when lock acquisition fails', async () => {
      const { LockAcquisitionError } = await import('../../src/errors');
      
      const storage = createMockStorage();
      storage.acquireLock = vi.fn().mockRejectedValue(new LockAcquisitionError());
      
      const service = new TodoService(storage);
      
      await service.add('새 할 일');
      
      expect(storage.save).not.toHaveBeenCalled();
    });
  });

  describe('데이터 손상 복구', () => {
    it('should restore from backup on corruption', async () => {
      const { DataCorruptionError } = await import('../../src/errors');
      
      const backupData: StorageSchema = {
        version: 1,
        todos: [createSampleTodo({ id: '1712345678901', content: '백업 데이터' })],
        metadata: {
          lastModified: new Date().toISOString(),
          backupCreated: true
        }
      };
      
      const storage = createMockStorage();
      storage.load = vi.fn()
        .mockRejectedValueOnce(new DataCorruptionError('Corrupted'))
        .mockResolvedValueOnce(backupData);
      storage.restore = vi.fn().mockResolvedValue(backupData);
      
      const service = new TodoService(storage);
      
      const result = await service.list({ all: true });
      
      expect(result.success).toBe(true);
      expect(storage.restore).toHaveBeenCalled();
    });

    it('should handle backup restore failure', async () => {
      const { DataCorruptionError } = await import('../../src/errors');
      
      const storage = createMockStorage();
      storage.load = vi.fn().mockRejectedValue(new DataCorruptionError('Corrupted'));
      storage.restore = vi.fn().mockResolvedValue(null);
      
      const service = new TodoService(storage);
      
      const result = await service.list({ all: true });
      
      expect(result.success).toBe(false);
    });

    it('should handle both data and backup corruption', async () => {
      const { DataCorruptionError } = await import('../../src/errors');
      
      const storage = createMockStorage();
      storage.load = vi.fn().mockRejectedValue(new DataCorruptionError('Corrupted'));
      storage.restore = vi.fn().mockRejectedValue(new DataCorruptionError('Backup corrupted'));
      
      const service = new TodoService(storage);
      
      const result = await service.list({ all: true });
      
      expect(result.success).toBe(false);
    });
  });

  describe('검증 에러', () => {
    it('should reject empty content', async () => {
      const storage = createMockStorage();
      const service = new TodoService(storage);
      
      const result = await service.add('');
      
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.message).toContain('입력');
    });

    it('should reject whitespace-only content', async () => {
      const storage = createMockStorage();
      const service = new TodoService(storage);
      
      const result = await service.add('   ');
      
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should reject content over 500 characters', async () => {
      const storage = createMockStorage();
      const service = new TodoService(storage);
      
      const result = await service.add('a'.repeat(501));
      
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.message).toContain('500');
    });

    it('should reject empty ID for done', async () => {
      const storage = createMockStorage();
      const service = new TodoService(storage);
      
      const result = await service.done('');
      
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should reject non-numeric ID', async () => {
      const storage = createMockStorage();
      const service = new TodoService(storage);
      
      const result = await service.done('abc');
      
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.message).toContain('숫자');
    });

    it('should reject empty ID for remove', async () => {
      const storage = createMockStorage();
      const service = new TodoService(storage);
      
      const result = await service.remove('');
      
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });
  });

  describe('리소스 미발견', () => {
    it('should return error for non-existent ID in done', async () => {
      const storage = createMockStorage([]);
      const service = new TodoService(storage);
      
      const result = await service.done('9999999999999');
      
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.message).toContain('찾을 수 없');
    });

    it('should return error for non-existent ID in remove', async () => {
      const storage = createMockStorage([]);
      const service = new TodoService(storage);
      
      const result = await service.remove('9999999999999');
      
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.message).toContain('찾을 수 없');
    });
  });

  describe('트랜잭션 롤백', () => {
    it('should not save data when operation fails', async () => {
      const storage = createMockStorage();
      const service = new TodoService(storage);
      
      // 빈 내용으로 추가 시도
      await service.add('');
      
      // save가 호출되지 않아야 함
      expect(storage.save).not.toHaveBeenCalled();
    });

    it('should maintain data consistency on error', async () => {
      const initialTodo = createSampleTodo({ id: '1712345678901' });
      const storage = createMockStorage([initialTodo]);
      storage.save = vi.fn().mockRejectedValue(new Error('Save failed'));
      
      const service = new TodoService(storage);
      
      // 완료 처리 시도
      await service.done('1712345678901');
      
      // 데이터가 변경되지 않아야 함 (save 실패)
      const currentData = await storage.load();
      expect(currentData.todos[0]?.status).toBe('pending');
    });
  });

  describe('동시성 에러', () => {
    it('should handle concurrent lock attempts', async () => {
      const { LockAcquisitionError } = await import('../../src/errors');
      
      const storage = createMockStorage();
      let lockCount = 0;
      
      storage.acquireLock = vi.fn().mockImplementation(async () => {
        lockCount++;
        if (lockCount > 1) {
          throw new LockAcquisitionError();
        }
      });
      
      const service1 = new TodoService(storage);
      const service2 = new TodoService(storage);
      
      // 동시에 두 작업 실행
      const [result1, result2] = await Promise.all([
        service1.add('첫 번째'),
        service2.add('두 번째')
      ]);
      
      // 하나는 성공, 하나는 실패
      const successCount = [result1.success, result2.success].filter(Boolean).length;
      expect(successCount).toBe(1);
    });
  });

  describe('알 수 없는 에러', () => {
    it('should handle unknown errors gracefully', async () => {
      const storage = createMockStorage();
      storage.load = vi.fn().mockRejectedValue('Unknown error');
      
      const service = new TodoService(storage);
      
      const result = await service.list({ all: true });
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('알 수 없는');
    });

    it('should handle null/undefined errors', async () => {
      const storage = createMockStorage();
      storage.load = vi.fn().mockRejectedValue(null);
      
      const service = new TodoService(storage);
      
      const result = await service.list({ all: true });
      
      expect(result.success).toBe(false);
    });
  });

  describe('상태 전이 에러', () => {
    it('should handle already done todo gracefully', async () => {
      const todo = createSampleTodo({ id: '1712345678901', status: 'done' });
      const storage = createMockStorage([todo]);
      const service = new TodoService(storage);
      
      const result = await service.done('1712345678901');
      
      // 성공으로 처리 (멱등성)
      expect(result.success).toBe(true);
      expect(result.message).toContain('이미 완료');
    });

    it('should allow removing done todo', async () => {
      const todo = createSampleTodo({ id: '1712345678901', status: 'done' });
      const storage = createMockStorage([todo]);
      const service = new TodoService(storage);
      
      const result = await service.remove('1712345678901');
      
      expect(result.success).toBe(true);
    });
  });
});
