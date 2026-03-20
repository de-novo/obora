import { describe, it, expect } from 'vitest';
import { 
  formatTodo,
  formatTodoList,
  formatDate,
  formatStatus
} from '../../../src/utils/formatter';
import { createMockTodo, createMockTodos } from '../../helpers/fixtures';

describe('포맷팅 유틸리티', () => {
  describe('formatStatus', () => {
    it('완료된 항목은 [✓]를 반환해야 한다', () => {
      expect(formatStatus(true)).toBe('[✓]');
    });

    it('미완료 항목은 [ ]를 반환해야 한다', () => {
      expect(formatStatus(false)).toBe('[ ]');
    });
  });

  describe('formatDate', () => {
    it('날짜를 YYYY-MM-DD HH:mm 형식으로 포맷팅해야 한다', () => {
      const date = new Date('2024-01-15T14:30:00Z');
      const formatted = formatDate(date);
      expect(formatted).toMatch(/2024-01-15/);
    });

    it('null인 경우 빈 문자열을 반환해야 한다', () => {
      expect(formatDate(null)).toBe('-');
    });
  });

  describe('formatTodo', () => {
    it('단일 Todo를 포맷팅해야 한다', () => {
      const todo = createMockTodo();
      const formatted = formatTodo(todo);
      
      expect(formatted).toContain(todo.id);
      expect(formatted).toContain(todo.text);
      expect(formatted).toContain('[ ]'); // 미완료
    });

    it('완료된 Todo를 포맷팅해야 한다', () => {
      const todo = createMockTodo({
        completed: true,
        completedAt: new Date('2024-01-02T00:00:00Z')
      });
      const formatted = formatTodo(todo);
      
      expect(formatted).toContain('[✓]');
    });
  });

  describe('formatTodoList', () => {
    it('빈 목록에 대한 메시지를 반환해야 한다', () => {
      const formatted = formatTodoList([]);
      expect(formatted).toContain('할 일이 없습니다');
    });

    it('여러 Todo를 테이블 형식으로 포맷팅해야 한다', () => {
      const todos = createMockTodos(3);
      const formatted = formatTodoList(todos);
      
      expect(formatted).toContain('ID');
      expect(formatted).toContain('상태');
      expect(formatted).toContain('내용');
      expect(formatted).toContain('생성일');
    });

    it('완료된 항목과 미완료 항목을 구분해야 한다', () => {
      const todos = [
        createMockTodo({ id: '1', text: '미완료', completed: false }),
        createMockTodo({ id: '2', text: '완료', completed: true, completedAt: new Date() }),
      ];
      const formatted = formatTodoList(todos);
      
      expect(formatted).toContain('[ ]');
      expect(formatted).toContain('[✓]');
    });
  });
});
