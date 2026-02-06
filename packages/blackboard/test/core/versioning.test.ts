import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  VersionConflictError,
  VersionManager,
  DEFAULT_VERSIONING_CONFIG,
} from '../../src/core/versioning';

describe('Versioning', () => {
  describe('VersionConflictError', () => {
    it('should create error with expected and actual versions', () => {
      const error = new VersionConflictError(2, 5, 'state.phase');

      expect(error.message).toContain('expected 2');
      expect(error.message).toContain('got 5');
      expect(error.message).toContain('state.phase');
      expect(error.expectedVersion).toBe(2);
      expect(error.actualVersion).toBe(5);
      expect(error.path).toBe('state.phase');
      expect(error.name).toBe('VersionConflictError');
    });

    it('should be instance of Error', () => {
      const error = new VersionConflictError(1, 2, 'test');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(VersionConflictError);
    });
  });

  describe('DEFAULT_VERSIONING_CONFIG', () => {
    it('should have default values', () => {
      expect(DEFAULT_VERSIONING_CONFIG.maxRetries).toBe(3);
      expect(DEFAULT_VERSIONING_CONFIG.retryDelay).toBe(100);
      expect(DEFAULT_VERSIONING_CONFIG.exponentialBackoff).toBe(true);
    });
  });

  describe('VersionManager', () => {
    let manager: VersionManager;

    beforeEach(() => {
      manager = new VersionManager();
    });

    describe('constructor', () => {
      it('should create with default config', () => {
        const config = manager.getConfig();
        expect(config.maxRetries).toBe(3);
        expect(config.retryDelay).toBe(100);
        expect(config.exponentialBackoff).toBe(true);
      });

      it('should create with custom config', () => {
        const customManager = new VersionManager({
          maxRetries: 5,
          retryDelay: 200,
          exponentialBackoff: false,
        });
        const config = customManager.getConfig();

        expect(config.maxRetries).toBe(5);
        expect(config.retryDelay).toBe(200);
        expect(config.exponentialBackoff).toBe(false);
      });
    });

    describe('validateVersion()', () => {
      it('should not throw for matching versions', () => {
        expect(() =>
          manager.validateVersion(5, 5, 'state.phase')
        ).not.toThrow();
      });

      it('should throw VersionConflictError for mismatched versions', () => {
        expect(() =>
          manager.validateVersion(5, 3, 'state.phase')
        ).toThrow(VersionConflictError);
      });

      it('should include path in error message', () => {
        try {
          manager.validateVersion(2, 1, 'state.context.key');
        } catch (error) {
          expect((error as VersionConflictError).path).toBe('state.context.key');
        }
      });
    });

    describe('incrementVersion()', () => {
      it('should increment version by 1', () => {
        expect(manager.incrementVersion(1)).toBe(2);
        expect(manager.incrementVersion(5)).toBe(6);
        expect(manager.incrementVersion(0)).toBe(1);
      });

      it('should throw for negative versions', () => {
        expect(() => manager.incrementVersion(-1)).toThrow();
      });
    });

    describe('executeWithRetry()', () => {
      // 테스트용 빠른 재시도 설정
      let fastManager: VersionManager;

      beforeEach(() => {
        // 실제 타이머 사용 (sleep이 동작하려면 필요)
        vi.useRealTimers();
        fastManager = new VersionManager({
          maxRetries: 3,
          retryDelay: 10, // 빠른 재시도
          exponentialBackoff: false,
        });
      });

      it('should return result on success', async () => {
        const operation = vi.fn().mockReturnValue('success');
        const result = await fastManager.executeWithRetry(operation);

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(1);
      });

      it('should return async result on success', async () => {
        const operation = vi.fn().mockResolvedValue('async success');
        const result = await fastManager.executeWithRetry(operation);

        expect(result).toBe('async success');
        expect(operation).toHaveBeenCalledTimes(1);
      });

      it('should retry on VersionConflictError', async () => {
        let callCount = 0;
        const operation = vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(new VersionConflictError(1, 2, 'test'));
          }
          return Promise.resolve('success after retry');
        });

        const result = await fastManager.executeWithRetry(operation);

        expect(result).toBe('success after retry');
        expect(operation).toHaveBeenCalledTimes(2);
      }, 5000);

      it('should throw after max retries', async () => {
        const operation = vi.fn().mockImplementation(() => {
          return Promise.reject(new VersionConflictError(1, 2, 'test'));
        });

        await expect(fastManager.executeWithRetry(operation)).rejects.toThrow(
          VersionConflictError
        );
        expect(operation).toHaveBeenCalledTimes(3); // maxRetries
      }, 5000);

      it('should immediately throw non-VersionConflictError', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('Other error'));

        await expect(fastManager.executeWithRetry(operation)).rejects.toThrow(
          'Other error'
        );
        expect(operation).toHaveBeenCalledTimes(1);
      });
    });

    describe('calculateDelay()', () => {
      it('should calculate exponential backoff delay', () => {
        const delay0 = manager.calculateDelay(0);
        const delay1 = manager.calculateDelay(1);
        const delay2 = manager.calculateDelay(2);

        // With exponential backoff: delay * 2^attempt + jitter
        // delay0: 100 * 2^0 = 100 + jitter
        // delay1: 100 * 2^1 = 200 + jitter
        // delay2: 100 * 2^2 = 400 + jitter

        expect(delay0).toBeGreaterThanOrEqual(100);
        expect(delay0).toBeLessThan(150);

        expect(delay1).toBeGreaterThanOrEqual(200);
        expect(delay1).toBeLessThan(250);

        expect(delay2).toBeGreaterThanOrEqual(400);
        expect(delay2).toBeLessThan(450);
      });

      it('should return fixed delay without exponential backoff', () => {
        const linearManager = new VersionManager({
          maxRetries: 3,
          retryDelay: 100,
          exponentialBackoff: false,
        });

        expect(linearManager.calculateDelay(0)).toBe(100);
        expect(linearManager.calculateDelay(1)).toBe(100);
        expect(linearManager.calculateDelay(2)).toBe(100);
      });
    });

    describe('updateConfig()', () => {
      it('should update config partially', () => {
        manager.updateConfig({ maxRetries: 10 });

        const config = manager.getConfig();
        expect(config.maxRetries).toBe(10);
        expect(config.retryDelay).toBe(100); // Unchanged
        expect(config.exponentialBackoff).toBe(true); // Unchanged
      });

      it('should update multiple fields', () => {
        manager.updateConfig({
          maxRetries: 5,
          retryDelay: 50,
        });

        const config = manager.getConfig();
        expect(config.maxRetries).toBe(5);
        expect(config.retryDelay).toBe(50);
      });
    });

    describe('getConfig()', () => {
      it('should return readonly copy of config', () => {
        const config = manager.getConfig();

        expect(config.maxRetries).toBe(3);
        expect(config.retryDelay).toBe(100);
        expect(config.exponentialBackoff).toBe(true);

        // Modifying returned object shouldn't affect internal config
        (config as any).maxRetries = 999;
        expect(manager.getConfig().maxRetries).toBe(3);
      });
    });
  });
});
