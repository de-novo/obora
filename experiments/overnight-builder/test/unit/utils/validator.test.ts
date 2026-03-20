import { describe, it, expect } from 'vitest';
import { 
  validateTodoText, 
  validateTodoId,
  validateTodo 
} from '../../../src/utils/validator';
import { ValidationError } from '../../../src/errors';
import { createMockTodo } from '../../helpers/fixtures';

describe('검증 유틸리티', () => {
  describe('validateTodoText', () => {
    it('유효한 텍스트를 통과시켜야 한다', () => {
      expect(() => validateTodoText('할 일 내용')).not.toThrow();
      expect(() => validateTodoText('테스트')).not.toThrow();
      expect(() => validateTodoText('a')).not.toThrow();
    });

    it('빈 문자열을 거부해야 한다', () => {
      expect(() => validateTodoText('')).toThrow(ValidationError);
      expect(() => validateTodoText('')).toThrow('할 일 내용을 입력해주세요');
    });

    it('공백만 있는 문자열을 거부해야 한다', () => {
      expect(() => validateTodoText('   ')).toThrow(ValidationError);
      expect(() => validateTodoText('\t\n')).toThrow(ValidationError);
    });

    it('앞뒤 공백을 제거해야 한다', () => {
      const result = validateTodoText('  할 일  ');
      expect(result).toBe('할 일');
    });

    it('특수 문자를 허용해야 한다', () => {
      expect(() => validateTodoText('할 일! @#$%^&*()')).not.toThrow();
      expect(() => validateTodoText('이모지 🎉 테스트')).not.toThrow();
      expect(() => validateTodoText('따옴표 "테스트" \'작은따옴표\'')).not.toThrow();
    });

    it('긴 텍스트를 허용해야 한다', () => {
      const longText = 'a'.repeat(1000);
      expect(() => validateTodoText(longText)).not.toThrow();
    });

    it('매우 긴 텍스트는 제한해야 한다', () => {
      const tooLongText = 'a'.repeat(10001);
      expect(() => validateTodoText(tooLongText)).toThrow(ValidationError);
      expect(() => validateTodoText(tooLongText)).toThrow('할 일 내용은 10000자 이하여야 합니다');
    });
  });

  describe('validateTodoId', () => {
    it('유효한 UUID를 통과시켜야 한다', () => {
      const validId = '550e8400-e29b-41d4-a716-446655440000';
      expect(() => validateTodoId(validId)).not.toThrow();
    });

    it('잘못된 ID 형식을 거부해야 한다', () => {
      expect(() => validateTodoId('')).toThrow(ValidationError);
      expect(() => validateTodoId('invalid')).toThrow(ValidationError);
      expect(() => validateTodoId('12345')).toThrow(ValidationError);
    });

    it('ID가 제공되지 않으면 에러를 발생해야 한다', () => {
      expect(() => validateTodoId('')).toThrow('유효한 ID를 입력해주세요');
    });
  });

  describe('validateTodo', () => {
    it('유효한 Todo 객체를 통과시켜야 한다', () => {
      const todo = createMockTodo();
      expect(() => validateTodo(todo)).not.toThrow();
    });

    it('필수 필드가 누락된 경우 에러를 발생해야 한다', () => {
      const invalidTodo = { id: 'test' } as any;
      expect(() => validateTodo(invalidTodo)).toThrow(ValidationError);
    });

    it('잘못된 타입의 필드가 있으면 에러를 발생해야 한다', () => {
      const invalidTodo = createMockTodo({ completed: 'yes' as any });
      expect(() => validateTodo(invalidTodo)).toThrow(ValidationError);
    });
  });
});
