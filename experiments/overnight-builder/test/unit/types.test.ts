import { describe, it, expect } from 'vitest';
import { isTodo, isTodoStorage } from '../../src/types';
import { createMockTodo, createMockStorage } from '../helpers/fixtures';

describe('Type Guards', () => {
  describe('isTodo', () => {
    it('유효한 Todo 객체를 식별해야 한다', () => {
      const todo = createMockTodo();
      expect(isTodo(todo)).toBe(true);
    });

    it('잘못된 객체를 거부해야 한다', () => {
      expect(isTodo(null)).toBe(false);
      expect(isTodo(undefined)).toBe(false);
      expect(isTodo({})).toBe(false);
      expect(isTodo({ id: 'test' })).toBe(false);
    });

    it('잘못된 타입의 필드를 가진 객체를 거부해야 한다', () => {
      const invalidTodo = {
        id: 'test',
        text: 'test',
        completed: 'yes', // should be boolean
        createdAt: new Date(),
        completedAt: null,
      };
      expect(isTodo(invalidTodo)).toBe(false);
    });
  });

  describe('isTodoStorage', () => {
    it('유효한 TodoStorage 객체를 식별해야 한다', () => {
      const storage = createMockStorage();
      expect(isTodoStorage(storage)).toBe(true);
    });

    it('잘못된 객체를 거부해야 한다', () => {
      expect(isTodoStorage(null)).toBe(false);
      expect(isTodoStorage({})).toBe(false);
      expect(isTodoStorage({ version: '1.0.0' })).toBe(false);
    });
  });
});
