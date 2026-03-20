import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TodoService } from '../../src/services/TodoService';
import { TodoRepository } from '../../src/repositories/TodoRepository';
import { FileStorage } from '../../src/storage/FileStorage';
import { createTempStorage, cleanupTempStorage } from '../helpers/storage';
import { createMockTodo } from '../helpers/fixtures';
import { 
  TodoNotFoundError, 
  ValidationError, 
  AlreadyCompletedError 
} from '../../src/errors';

describe('TodoService', () => {
  let tempDir: string;
  let service: TodoService;

  beforeEach(async () => {
    tempDir = await createTempStorage();
    const storage = new FileStorage(tempDir);
    const repository = new TodoRepository(storage);
    service = new TodoService(repository);
    await service.initialize();
  });

  afterEach(async () => {
    await cleanupTempStorage(tempDir);
  });

  describe('addTodo', () => {
    it('새 할 일을 추가해야 한다', async () => {
      const todo = await service.addTodo('새 할 일');
      
      expect(todo.id).toBeDefined();
      expect(todo.text).toBe('새 할 일');
      expect(todo.completed).toBe(false);
      expect(todo.completedAt).toBeNull();
    });

    it('빈 텍스트는 ValidationError를 발생해야 한다', async () => {
      await expect(service.addTodo('')).rejects.toThrow(ValidationError);
    });

    it('공백만 있는 텍스트는 ValidationError를 발생해야 한다', async () => {
      await expect(service.addTodo('   ')).rejects.toThrow(ValidationError);
    });

    it('앞뒤 공백을 제거해야 한다', async () => {
      const todo = await service.addTodo('  할 일  ');
      expect(todo.text).toBe('할 일');
    });

    it('특수 문자와 이모지를 허용해야 한다', async () => {
      const todo = await service.addTodo('테스트 🎉 특수문자! @#$');
      expect(todo.text).toBe('테스트 🎉 특수문자! @#$');
    });
  });

  describe('listTodos', () => {
    it('빈 목록에 대한 안내 메시지를 포함해야 한다', async () => {
      const result = await service.listTodos('all');
      
      expect(result.todos).toEqual([]);
      expect(result.message).toContain('할 일이 없습니다');
    });

    it('모든 할 일을 반환해야 한다 (filter: all)', async () => {
      await service.addTodo('할 일 1');
      await service.addTodo('할 일 2');
      await service.addTodo('할 일 3');
      
      const result = await service.listTodos('all');
      
      expect(result.todos.length).toBe(3);
    });

    it('완료된 항목만 반환해야 한다 (filter: completed)', async () => {
      const todo1 = await service.addTodo('할 일 1');
      const todo2 = await service.addTodo('할 일 2');
      await service.completeTodo(todo1.id);
      
      const result = await service.listTodos('completed');
      
      expect(result.todos.length).toBe(1);
      expect(result.todos[0]?.id).toBe(todo1.id);
    });

    it('미완료 항목만 반환해야 한다 (filter: pending)', async () => {
      const todo1 = await service.addTodo('할 일 1');
      const todo2 = await service.addTodo('할 일 2');
      await service.completeTodo(todo1.id);
      
      const result = await service.listTodos('pending');
      
      expect(result.todos.length).toBe(1);
      expect(result.todos[0]?.id).toBe(todo2.id);
    });
  });

  describe('completeTodo', () => {
    it('할 일을 완료 처리해야 한다', async () => {
      const todo = await service.addTodo('테스트');
      
      const completed = await service.completeTodo(todo.id);
      
      expect(completed.completed).toBe(true);
      expect(completed.completedAt).not.toBeNull();
      expect(completed.completedAt).toBeInstanceOf(Date);
    });

    it('존재하지 않는 ID는 TodoNotFoundError를 발생해야 한다', async () => {
      await expect(
        service.completeTodo('non-existent-id')
      ).rejects.toThrow(TodoNotFoundError);
    });

    it('이미 완료된 항목은 AlreadyCompletedError를 발생해야 한다', async () => {
      const todo = await service.addTodo('테스트');
      await service.completeTodo(todo.id);
      
      await expect(
        service.completeTodo(todo.id)
      ).rejects.toThrow(AlreadyCompletedError);
    });

    it('완료 시 completedAt이 현재 시간으로 설정되어야 한다', async () => {
      const todo = await service.addTodo('테스트');
      const beforeComplete = new Date();
      
      const completed = await service.completeTodo(todo.id);
      
      const afterComplete = new Date();
      expect(completed.completedAt?.getTime()).toBeGreaterThanOrEqual(beforeComplete.getTime());
      expect(completed.completedAt?.getTime()).toBeLessThanOrEqual(afterComplete.getTime());
    });
  });

  describe('deleteTodo', () => {
    it('할 일을 삭제해야 한다', async () => {
      const todo = await service.addTodo('삭제될 할 일');
      
      await service.deleteTodo(todo.id);
      
      const result = await service.listTodos('all');
      expect(result.todos.find(t => t.id === todo.id)).toBeUndefined();
    });

    it('삭제 후 성공 메시지를 반환해야 한다', async () => {
      const todo = await service.addTodo('삭제될 할 일');
      
      const message = await service.deleteTodo(todo.id);
      
      expect(message).toContain('삭제되었습니다');
    });

    it('존재하지 않는 ID는 TodoNotFoundError를 발생해야 한다', async () => {
      await expect(
        service.deleteTodo('non-existent-id')
      ).rejects.toThrow(TodoNotFoundError);
    });
  });

  describe('통합 시나리오', () => {
    it('전체 라이프사이클: 추가 → 목록 → 완료 → 삭제', async () => {
      // 추가
      const todo = await service.addTodo('통합 테스트');
      expect(todo.id).toBeDefined();
      
      // 목록 조회
      let result = await service.listTodos('all');
      expect(result.todos.length).toBe(1);
      
      // 완료
      const completed = await service.completeTodo(todo.id);
      expect(completed.completed).toBe(true);
      
      // 완료된 항목 필터링
      result = await service.listTodos('completed');
      expect(result.todos.length).toBe(1);
      
      // 삭제
      await service.deleteTodo(todo.id);
      result = await service.listTodos('all');
      expect(result.todos.length).toBe(0);
    });

    it('여러 항목 추가 및 필터링', async () => {
      const todo1 = await service.addTodo('미완료 1');
      const todo2 = await service.addTodo('완료 1');
      const todo3 = await service.addTodo('미완료 2');
      const todo4 = await service.addTodo('완료 2');
      
      await service.completeTodo(todo2.id);
      await service.completeTodo(todo4.id);
      
      const allResult = await service.listTodos('all');
      expect(allResult.todos.length).toBe(4);
      
      const completedResult = await service.listTodos('completed');
      expect(completedResult.todos.length).toBe(2);
      
      const pendingResult = await service.listTodos('pending');
      expect(pendingResult.todos.length).toBe(2);
    });
  });
});
