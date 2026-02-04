/**
 * status command tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node:fs module
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
}));

// Mock @obora/core
vi.mock('@obora/core', () => ({
  log: vi.fn(),
}));

// Mock path-utils
vi.mock('../../utils/path-utils.js', () => ({
  validatePathComponent: vi.fn(),
}));

// Mock status utils
vi.mock('../../utils/status.js', () => ({
  readStatus: vi.fn(),
}));

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { log } from '@obora/core';
import { validatePathComponent } from '../../utils/path-utils.js';
import { readStatus } from '../../utils/status.js';
import { createStatusCommand, runStatus } from '../status.js';

describe('status command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  const mockStatus = {
    feature: {
      name: 'test-feature',
      created_at: '2026-02-04T00:00:00Z',
      workflow: 'simple',
    },
    status: 'pending',
    progress: {
      current_stage: 'planning',
      completed_stages: [],
    },
    metadata: {
      last_updated: '2026-02-04T00:00:00Z',
      notes: '',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(validatePathComponent).mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('command creation', () => {
    it('should create status command with correct options', () => {
      const cmd = createStatusCommand();
      expect(cmd.name()).toBe('status');
      expect(cmd.description()).toBe('Show workflow status');
    });

    it('should have --format option with default "default"', () => {
      const cmd = createStatusCommand();
      const formatOption = cmd.options.find((opt) => opt.long === '--format');
      expect(formatOption).toBeDefined();
      expect(formatOption?.defaultValue).toBe('default');
    });

    it('should have --feature option', () => {
      const cmd = createStatusCommand();
      const featureOption = cmd.options.find((opt) => opt.long === '--feature');
      expect(featureOption).toBeDefined();
    });

    it('should have --verbose option', () => {
      const cmd = createStatusCommand();
      const verboseOption = cmd.options.find((opt) => opt.long === '--verbose');
      expect(verboseOption).toBeDefined();
    });
  });

  describe('status display - default format', () => {
    it('should display status for a specific feature', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readStatus).mockReturnValue(mockStatus);

      const cmd = createStatusCommand();
      cmd.exitOverride();
      await cmd.parseAsync(['--feature', 'test-feature'], { from: 'user' });

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Feature: test-feature'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Status:'));
    });

    it('should show current stage', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readStatus).mockReturnValue({
        ...mockStatus,
        status: 'running',
        progress: {
          current_stage: 'implementation',
          completed_stages: ['planning', 'design'],
        },
      });

      const cmd = createStatusCommand();
      cmd.exitOverride();
      await cmd.parseAsync(['--feature', 'test-feature'], { from: 'user' });

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Current Stage: implementation'));
    });
  });

  describe('--format json', () => {
    it('should output JSON format', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readStatus).mockReturnValue({
        ...mockStatus,
        status: 'completed',
      });

      const cmd = createStatusCommand();
      cmd.exitOverride();
      await cmd.parseAsync(['--feature', 'test-feature', '--format', 'json'], {
        from: 'user',
      });

      const logCalls = consoleLogSpy.mock.calls.flat();
      const jsonOutput = logCalls.join(' ');
      expect(jsonOutput).toContain('"status"');
      expect(jsonOutput).toContain('"feature"');
    });
  });

  describe('--format minimal', () => {
    it('should display minimal format', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readStatus).mockReturnValue({
        ...mockStatus,
        status: 'planned',
      });

      const cmd = createStatusCommand();
      cmd.exitOverride();
      await cmd.parseAsync(['--feature', 'test-feature', '--format', 'minimal'], {
        from: 'user',
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('📋 planned'));
    });
  });

  describe('--verbose option', () => {
    it('should show step details with --verbose', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readStatus).mockReturnValue({
        ...mockStatus,
        status: 'running',
      });

      const cmd = createStatusCommand();
      cmd.exitOverride();
      await cmd.parseAsync(['--feature', 'test-feature', '--verbose'], { from: 'user' });

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Steps:'));
    });
  });

  describe('all features status', () => {
    it('should display all features when no feature specified', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([
        { name: 'feature1', isDirectory: () => true },
        { name: 'feature2', isDirectory: () => true },
      ] as any);
      vi.mocked(readStatus)
        .mockReturnValueOnce({
          ...mockStatus,
          feature: { ...mockStatus.feature, name: 'feature1' },
        })
        .mockReturnValueOnce({
          ...mockStatus,
          feature: { ...mockStatus.feature, name: 'feature2' },
          status: 'running',
        });

      const cmd = createStatusCommand();
      cmd.exitOverride();
      await cmd.parseAsync([], { from: 'user' });

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Features:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('feature1'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('feature2'));
    });

    it('should show "No features found" when features directory is empty', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([]);

      const cmd = createStatusCommand();
      cmd.exitOverride();
      await cmd.parseAsync([], { from: 'user' });

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No features found'));
    });
  });

  describe('error handling', () => {
    it('should throw error when .obora does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const cmd = createStatusCommand();
      cmd.exitOverride();
      await expect(
        cmd.parseAsync(['--feature', 'test-feature'], { from: 'user' })
      ).rejects.toThrow();
    });

    it('should throw error when feature not found', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readStatus).mockReturnValue(null);

      const cmd = createStatusCommand();
      cmd.exitOverride();
      await expect(
        cmd.parseAsync(['--feature', 'nonexistent-feature'], { from: 'user' })
      ).rejects.toThrow();
    });

    it('should throw error when features directory does not exist', async () => {
      vi.mocked(existsSync)
        .mockImplementation((path) => {
          const strPath = String(path);
          return strPath.includes('.obora') && !strPath.includes('features');
        });

      const cmd = createStatusCommand();
      cmd.exitOverride();
      await expect(cmd.parseAsync([], { from: 'user' })).rejects.toThrow();
    });
  });

  describe('path validation', () => {
    it('should call validatePathComponent for feature name', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readStatus).mockReturnValue(mockStatus);

      const cmd = createStatusCommand();
      cmd.exitOverride();
      await cmd.parseAsync(['--feature', 'test-feature'], { from: 'user' });

      expect(validatePathComponent).toHaveBeenCalledWith('test-feature');
    });
  });

  describe('status formatting', () => {
    it('should format pending status correctly', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readStatus).mockReturnValue({
        ...mockStatus,
        status: 'pending',
      });

      const cmd = createStatusCommand();
      cmd.exitOverride();
      await cmd.parseAsync(['--feature', 'test-feature'], { from: 'user' });

      const logCalls = consoleLogSpy.mock.calls.flat();
      expect(logCalls.join(' ')).toContain('⏳');
    });

    it('should format running status correctly', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readStatus).mockReturnValue({
        ...mockStatus,
        status: 'running',
      });

      const cmd = createStatusCommand();
      cmd.exitOverride();
      await cmd.parseAsync(['--feature', 'test-feature'], { from: 'user' });

      const logCalls = consoleLogSpy.mock.calls.flat();
      expect(logCalls.join(' ')).toContain('🔄');
    });

    it('should format completed status correctly', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readStatus).mockReturnValue({
        ...mockStatus,
        status: 'completed',
      });

      const cmd = createStatusCommand();
      cmd.exitOverride();
      await cmd.parseAsync(['--feature', 'test-feature'], { from: 'user' });

      const logCalls = consoleLogSpy.mock.calls.flat();
      expect(logCalls.join(' ')).toContain('✅');
    });
  });
});
