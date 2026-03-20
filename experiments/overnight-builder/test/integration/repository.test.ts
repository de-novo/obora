import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TodoRepository } from '../../src/repositories/TodoRepository';
import { FileStorage } from '../../src/storage/FileStorage';
import { createTempStorage, cleanupTempStorage } from '../helpers/storage';
import { createMockTodo } from '../helpers/fixtures';
import { TodoNotFoundError, InvalidTodoError } from '../../src/errors';

describe('TodoRepository', () => {
  let tempDir: string;
  let repository: TodoRepository;

  beforeEach(async () => {
    tempDir = await createTempStorage();
    const storage = new FileStorage(tempDir);
    repository = new TodoRepository(storage);
    await repository.initialize();
  });

  afterEach(async () => {
    await cleanupTempStorage(tempDir);
  });

  describe('getAll', () => {
    it('빈 목록을 반환해야 한다', async () => {
      const todos = await repository.getAll();
      expect(todos).toEqual([]);
    });

    it('모든 할 일을 반환해야 한다', async () => {
      await repository.create('할 일 1');
      await repository.create('할 일 2');
      await repository.create('할 일 3');
      
      const todos = await repository.getAll();
      expect(todos.length).toBe(3);
    });
  });

  describe('getById', () => {
    it('ID로 할 일을 찾아야 한다', async () => {
      const created = await repository.create('테스트 할 일');
      
      const found = await repository.getById(created.id);
      
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.text).toBe('테스트 할 일');
    });

    it('존재하지 않는 ID는 null을 반환해야 한다', async () => {
      const found = await repository.getById('non-existent-id');
      expect(found).toBeNull();
    });
  });

  describe('create', () => {
    it('새 할 일을 생성해야 한다', async () => {
      const todo = await repository.create('새 할 일');
      
      expect(todo.id).toBeDefined();
      expect(todo.text).toBe('새 할 일');
      expect(todo.completed).toBe(false);
      expect(todo.completedAt).toBeNull();
      expect(todo.createdAt).toBeInstanceOf(Date);
    });

    it('생성된 할 일이 목록에 포함되어야 한다', async () => {
      const created = await repository.create('새 할 일');
      
      const todos = await repository.getAll();
      expect(todos.find(t => t.id === created.id)).toBeDefined();
    });

    it('빈 텍스트로 생성 시 InvalidTodoError를 발생해야 한다', async () => {
      await expect(repository.create('')).rejects.toThrow(InvalidTodoError);
    });

    it('공백만 있는 텍스트로 생성 시 InvalidTodoError를 발생해야 한다', async () => {
      await expect(repository.create('   ')).rejects.toThrow(InvalidTodoError);
    });
  });

  describe('update', () => {
    it('할 일을 수정해야 한다', async () => {
      const created = await repository.create('원본 텍스트');
      
      const updated = await repository.update(created.id, {
        text: '수정된 텍스트',
      });
      
      expect(updated.text).toBe('수정된 텍스트');
    });

    it('완료 상태를 변경해야 한다', async () => {
      const created = await repository.create('테스트');
      
      const updated = await repository.update(created.id, {
        completed: true,
        completedAt: new Date(),
      });
      
      expect(updated.completed).toBe(true);
      expect(updated.completedAt).not.toBeNull();
    });

    it('존재하지 않는 ID는 TodoNotFoundError를 발생해야 한다', async () => {
      await expect(
        repository.update('non-existent', { text: 'test' })
      ).rejects.toThrow(TodoNotFoundError);
    });
  });

  describe('delete', () => {
    it('할 일을 삭제해야 한다', async () => {
      const created = await repository.create('삭제될 할 일');
      
      const result = await repository.delete(created.id);
      expect(result).toBe(true);
      
      const found = await repository.getById(created.id);
      expect(found).toBeNull();
    });

    it('삭제 후 목록에서 제거되어야 한다', async () => {
      const created = await repository.create('삭제될 할 일');
      await repository.delete(created.id);
      
      const todos = await repository.getAll();
      expect(todos.find(t => t.id === created.id)).toBeUndefined();
    });

    it('존재하지 않는 ID 삭제 시 TodoNotFoundError를 발생해야 한다', async () => {
      await expect(repository.delete('non-existent')).rejects.toThrow(TodoNotFoundError);
    });
  });

  describe('동시성', () => {
    it('여러 생성 요청이 순차적으로 처리되어야 한다', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        repository.create(`할 일 ${i}`)
      );
      
      const todos = await Promise.all(promises);
      
      expect(todos.length).toBe(10);
      const allTodos = await repository.getAll();
      expect(allTodos.length).toBe(10);
    });
  });
});
