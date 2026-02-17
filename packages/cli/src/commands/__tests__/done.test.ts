/**
 * done command tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node:fs module
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

// Mock fs-extra
vi.mock('fs-extra', () => ({
  default: {
    ensureDir: vi.fn(),
    writeFile: vi.fn(),
    move: vi.fn(),
  },
}));

// Mock @obora-kit/runtime
vi.mock('@obora-kit/runtime', () => ({
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

import { existsSync, readFileSync } from 'node:fs';
import fs from 'fs-extra';
import { log } from '@obora-kit/runtime';
import { validatePathComponent } from '../../utils/path-utils.js';
import { readStatus } from '../../utils/status.js';
import { createDoneCommand, runDone } from '../done.js';

describe('done command', () => {
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
    vi.mocked(readStatus).mockReturnValue(mockStatus);
    vi.mocked(validatePathComponent).mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('command creation', () => {
    it('should create done command with correct options', () => {
      const cmd = createDoneCommand();
      expect(cmd.name()).toBe('done');
      expect(cmd.description()).toBe('Mark feature as done and archive');
    });

    it('should have --feature option', () => {
      const cmd = createDoneCommand();
      const featureOption = cmd.options.find((opt) => opt.long === '--feature');
      expect(featureOption).toBeDefined();
    });

    it('should have --commit option', () => {
      const cmd = createDoneCommand();
      const commitOption = cmd.options.find((opt) => opt.long === '--commit');
      expect(commitOption).toBeDefined();
    });

    it('should have --message option', () => {
      const cmd = createDoneCommand();
      const messageOption = cmd.options.find((opt) => opt.long === '--message');
      expect(messageOption).toBeDefined();
    });

    it('should have --no-archive option', () => {
      const cmd = createDoneCommand();
      const noArchiveOption = cmd.options.find((opt) => opt.long === '--no-archive');
      expect(noArchiveOption).toBeDefined();
    });

    it('should have --dry-run option', () => {
      const cmd = createDoneCommand();
      const dryRunOption = cmd.options.find((opt) => opt.long === '--dry-run');
      expect(dryRunOption).toBeDefined();
    });
  });

  describe('marking feature as done', () => {
    it('should mark feature as completed successfully', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('status: pending');
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.move).mockResolvedValue(undefined);

      await runDone('test-feature', {});

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('status.yaml'),
        expect.stringContaining('status: completed'),
        'utf-8'
      );
    });

    it('should generate execution.log', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('status: pending');
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.move).mockResolvedValue(undefined);

      await runDone('test-feature', {});

      const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
      const logCall = writeFileCalls.find((call) => String(call[0]).includes('execution.log'));
      expect(logCall).toBeDefined();
      expect(logCall?.[1]).toContain('# Execution Log: test-feature');
    });

    it('should move feature to archive', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('status: pending');
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.move).mockResolvedValue(undefined);

      await runDone('test-feature', {});

      expect(fs.move).toHaveBeenCalledWith(
        expect.stringContaining('features/test-feature'),
        expect.stringContaining('archive/'),
        { overwrite: true }
      );
    });

    it('should handle archive name conflict', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('status: pending');
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.move).mockResolvedValue(undefined);

      await runDone('test-feature', {});

      const moveCall = vi.mocked(fs.move).mock.calls[0];
      expect(moveCall[1]).toContain('archive/');
    });
  });

  describe('--no-archive option', () => {
    it('should skip archiving with --no-archive flag', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('status: pending');
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runDone('test-feature', { noArchive: true });

      expect(fs.move).not.toHaveBeenCalled();
    });
  });

  describe('--dry-run option', () => {
    it('should show what would be done without making changes', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      await runDone('test-feature', { dryRun: true });

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Dry-run mode'));
      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(fs.move).not.toHaveBeenCalled();
    });
  });

  describe('--commit option', () => {
    it('should indicate git commit creation with --commit flag', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('status: pending');
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.move).mockResolvedValue(undefined);

      await runDone('test-feature', { commit: true });

      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('Creating commit')
      );
    });

    it('should use custom commit message with --message flag', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('status: pending');
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.move).mockResolvedValue(undefined);

      await runDone('test-feature', {
        commit: true,
        message: 'Custom completion message',
      });

      expect(log).toHaveBeenCalledWith(expect.stringContaining('Custom completion message'));
    });
  });

  describe('error handling', () => {
    it('should throw error when not in obora project', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      await expect(runDone('test-feature', {})).rejects.toThrow('Not in an obora project');
    });

    it('should throw error when feature not found', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const strPath = String(path);
        return !strPath.includes('features/nonexistent-feature');
      });

      await expect(runDone('nonexistent-feature', {})).rejects.toThrow('not found');
    });

    it('should throw error when feature already completed', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readStatus).mockReturnValue({
        ...mockStatus,
        status: 'completed',
      });

      await expect(runDone('test-feature', {})).rejects.toThrow('already marked as done');
    });

    it('should throw error when feature is still running', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readStatus).mockReturnValue({
        ...mockStatus,
        status: 'running',
      });

      await expect(runDone('test-feature', {})).rejects.toThrow('still running');
    });

    it('should throw error when feature has failed', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readStatus).mockReturnValue({
        ...mockStatus,
        status: 'failed',
      });

      await expect(runDone('test-feature', {})).rejects.toThrow('workflow failed');
    });

    it('should handle path traversal attack', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(validatePathComponent).mockImplementation(() => {
        throw new Error('Invalid path');
      });

      await expect(runDone('../../../etc/passwd', {})).rejects.toThrow('Invalid path');
    });
  });

  describe('success output', () => {
    it('should show success message', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('status: pending');
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.move).mockResolvedValue(undefined);

      await runDone('test-feature', {});

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('marked as done successfully')
      );
    });

    it('should show summary', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('status: pending');
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.move).mockResolvedValue(undefined);

      await runDone('test-feature', {});

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Summary:'));
    });
  });

  describe('path validation', () => {
    it('should call validatePathComponent', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('status: pending');
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.move).mockResolvedValue(undefined);

      await runDone('test-feature', {});

      expect(validatePathComponent).toHaveBeenCalledWith('test-feature');
    });
  });

  describe('commander integration', () => {
    it('should parse command options correctly', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('status: pending');
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.move).mockResolvedValue(undefined);

      const cmd = createDoneCommand();
      cmd.exitOverride();
      await cmd.parseAsync(['--feature', 'test-feature'], { from: 'user' });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Marking feature as done')
      );
    });
  });
});
