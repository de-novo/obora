import { describe, it, expect } from 'vitest';
import { validateTitle, validatePriority, Priority } from '../../../src/utils/validator';

describe('Validator Utils', () => {
  describe('validateTitle', () => {
    it('should accept valid title', () => {
      expect(() => validateTitle('Fix login bug')).not.toThrow();
      expect(() => validateTitle('Write documentation')).not.toThrow();
      expect(() => validateTitle('Review pull request')).not.toThrow();
    });

    it('should accept title with special characters', () => {
      expect(() => validateTitle('Fix bug #123')).not.toThrow();
      expect(() => validateTitle('Update README.md')).not.toThrow();
      expect(() => validateTitle('Deploy to prod (v1.2.3)')).not.toThrow();
    });

    it('should accept title with unicode characters', () => {
      expect(() => validateTitle('Fix 한국어 문제')).not.toThrow();
      expect(() => validateTitle('Add emoji 🎉')).not.toThrow();
      expect(() => validateTitle('Update 中文文档')).not.toThrow();
    });

    it('should throw error for empty title', () => {
      expect(() => validateTitle('')).toThrow('Task title cannot be empty');
      expect(() => validateTitle('')).toThrow('VAL_EMPTY_TITLE');
    });

    it('should throw error for whitespace-only title', () => {
      expect(() => validateTitle('   ')).toThrow('Task title cannot be empty');
      expect(() => validateTitle('\t\n')).toThrow('Task title cannot be empty');
    });

    it('should trim whitespace from title', () => {
      const result = validateTitle('  Test task  ');
      expect(result).toBe('Test task');
    });

    it('should accept title with 80 characters', () => {
      const longTitle = 'A'.repeat(80);
      expect(() => validateTitle(longTitle)).not.toThrow();
    });

    it('should accept title longer than 80 characters', () => {
      const veryLongTitle = 'A'.repeat(200);
      expect(() => validateTitle(veryLongTitle)).not.toThrow();
    });
  });

  describe('validatePriority', () => {
    it('should accept valid priority values', () => {
      expect(validatePriority('low')).toBe('low');
      expect(validatePriority('medium')).toBe('medium');
      expect(validatePriority('high')).toBe('high');
    });

    it('should be case-sensitive', () => {
      expect(() => validatePriority('Low')).toThrow('Priority must be low, medium, or high');
      expect(() => validatePriority('HIGH')).toThrow('Priority must be low, medium, or high');
      expect(() => validatePriority('Medium')).toThrow('Priority must be low, medium, or high');
    });

    it('should throw error for invalid priority', () => {
      expect(() => validatePriority('urgent')).toThrow('Priority must be low, medium, or high');
      expect(() => validatePriority('normal')).toThrow('Priority must be low, medium, or high');
      expect(() => validatePriority('1')).toThrow('Priority must be low, medium, or high');
    });

    it('should throw error for empty priority', () => {
      expect(() => validatePriority('')).toThrow('Priority must be low, medium, or high');
    });

    it('should return default priority when undefined', () => {
      const result = validatePriority(undefined);
      expect(result).toBe('medium');
    });

    it('should have correct error code', () => {
      try {
        validatePriority('invalid');
      } catch (error: any) {
        expect(error.code).toBe('VAL_INVALID_PRIORITY');
      }
    });
  });
});
