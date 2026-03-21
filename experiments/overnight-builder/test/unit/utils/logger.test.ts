import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, formatPriority, formatTaskId } from '../../../src/utils/logger';

describe('Logger Utils', () => {
  let consoleSpy: any;

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {})
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('logger.success', () => {
    it('should log success message with green color', () => {
      logger.success('Task added successfully');
      expect(consoleSpy.log).toHaveBeenCalled();
      const output = consoleSpy.log.mock.calls[0][0];
      expect(output).toContain('Task added successfully');
    });

    it('should include checkmark emoji', () => {
      logger.success('Operation completed');
      const output = consoleSpy.log.mock.calls[0][0];
      expect(output).toContain('✅');
    });
  });

  describe('logger.error', () => {
    it('should log error message with red color', () => {
      logger.error('Task not found');
      expect(consoleSpy.error).toHaveBeenCalled();
      const output = consoleSpy.error.mock.calls[0][0];
      expect(output).toContain('Task not found');
    });

    it('should include X emoji', () => {
      logger.error('Operation failed');
      const output = consoleSpy.error.mock.calls[0][0];
      expect(output).toContain('❌');
    });
  });

  describe('logger.info', () => {
    it('should log info message with blue color', () => {
      logger.info('Use --all to show completed tasks');
      expect(consoleSpy.log).toHaveBeenCalled();
      const output = consoleSpy.log.mock.calls[0][0];
      expect(output).toContain('Use --all to show completed tasks');
    });

    it('should include lightbulb emoji', () => {
      logger.info('Tip: Use priority flag');
      const output = consoleSpy.log.mock.calls[0][0];
      expect(output).toContain('💡');
    });
  });

  describe('formatPriority', () => {
    it('should format high priority with red color', () => {
      const formatted = formatPriority('high');
      expect(formatted).toContain('high');
    });

    it('should format medium priority with yellow color', () => {
      const formatted = formatPriority('medium');
      expect(formatted).toContain('medium');
    });

    it('should format low priority with gray color', () => {
      const formatted = formatPriority('low');
      expect(formatted).toContain('low');
    });
  });

  describe('formatTaskId', () => {
    it('should truncate long ID to 6 characters', () => {
      const longId = '1710998400000';
      const formatted = formatTaskId(longId);
      expect(formatted).toBe('171099');
    });

    it('should not pad short IDs', () => {
      const shortId = 'abc';
      const formatted = formatTaskId(shortId);
      expect(formatted).toBe('abc');
    });

    it('should handle exactly 6-character ID', () => {
      const exactId = '123456';
      const formatted = formatTaskId(exactId);
      expect(formatted).toBe('123456');
    });

    it('should handle empty string', () => {
      const formatted = formatTaskId('');
      expect(formatted).toBe('');
    });
  });
});
