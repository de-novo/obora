/**
 * new command tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node:fs module
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

// Mock fs-extra
vi.mock('fs-extra', () => ({
  default: {
    ensureDir: vi.fn(),
    writeFile: vi.fn(),
  },
}));

import { existsSync } from 'node:fs';
import fs from 'fs-extra';
import { createNewCommand, runNew, validateFeatureName } from '../new.js';

describe('new command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('command creation', () => {
    it('should create new command with correct options', () => {
      const cmd = createNewCommand();
      expect(cmd.name()).toBe('new');
      expect(cmd.description()).toBe('Create new feature');
    });

    it('should accept feature name as argument', () => {
      const cmd = createNewCommand();
      expect(cmd.registeredArguments.length).toBeGreaterThan(0);
    });

    it('should have --workflow option with default "simple"', () => {
      const cmd = createNewCommand();
      const workflowOption = cmd.options.find((opt) => opt.long === '--workflow');
      expect(workflowOption).toBeDefined();
      expect(workflowOption?.defaultValue).toBe('simple');
    });

    it('should have --from-existing option', () => {
      const cmd = createNewCommand();
      const fromExistingOption = cmd.options.find((opt) => opt.long === '--from-existing');
      expect(fromExistingOption).toBeDefined();
    });

    it('should have --template option', () => {
      const cmd = createNewCommand();
      const templateOption = cmd.options.find((opt) => opt.long === '--template');
      expect(templateOption).toBeDefined();
    });
  });

  describe('feature creation', () => {
    it('should create new feature directory', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const strPath = String(path);
        // .obora exists, but feature does not
        return strPath.includes('.obora') && !strPath.includes('test-feature');
      });
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runNew('test-feature', {});

      expect(fs.ensureDir).toHaveBeenCalled();
    });

    it('should create all required files', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const strPath = String(path);
        return strPath.includes('.obora') && !strPath.includes('test-feature');
      });
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runNew('test-feature', {});

      const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
      const filePaths = writeFileCalls.map((call) => String(call[0]));

      expect(filePaths.some((p) => p.includes('proposal.md'))).toBe(true);
      expect(filePaths.some((p) => p.includes('design.md'))).toBe(true);
      expect(filePaths.some((p) => p.includes('tasks.md'))).toBe(true);
      expect(filePaths.some((p) => p.includes('status.yaml'))).toBe(true);
    });

    it('should create context directory', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const strPath = String(path);
        return strPath.includes('.obora') && !strPath.includes('test-feature');
      });
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runNew('test-feature', {});

      const ensureDirCalls = vi.mocked(fs.ensureDir).mock.calls;
      const paths = ensureDirCalls.map((call) => String(call[0]));
      expect(paths.some((p) => p.includes('context'))).toBe(true);
    });

    it('should create context README', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const strPath = String(path);
        return strPath.includes('.obora') && !strPath.includes('test-feature');
      });
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runNew('test-feature', {});

      const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
      const readmeCall = writeFileCalls.find((call) => String(call[0]).includes('context/README.md'));
      expect(readmeCall).toBeDefined();
    });

    it('should write correct content to proposal.md', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const strPath = String(path);
        return strPath.includes('.obora') && !strPath.includes('test-feature');
      });
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runNew('test-feature', {});

      const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
      const proposalCall = writeFileCalls.find((call) => String(call[0]).includes('proposal.md'));
      expect(proposalCall?.[1]).toContain('# test-feature');
      expect(proposalCall?.[1]).toContain('목표');
      expect(proposalCall?.[1]).toContain('요구사항');
    });

    it('should set correct workflow in status.yaml', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const strPath = String(path);
        return strPath.includes('.obora') && !strPath.includes('test-feature');
      });
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runNew('test-feature', { workflow: 'standard' });

      const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
      const statusCall = writeFileCalls.find((call) => String(call[0]).includes('status.yaml'));
      expect(statusCall?.[1]).toContain('workflow: "standard"');
    });
  });

  describe('feature name validation', () => {
    it('should validate kebab-case feature name', () => {
      const result = validateFeatureName('test-feature');
      expect(result.valid).toBe(true);
    });

    it('should reject uppercase letters', () => {
      const result = validateFeatureName('TestFeature');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('lowercase');
    });

    it('should reject path traversal', () => {
      const result = validateFeatureName('../../../etc/passwd');
      expect(result.valid).toBe(false);
    });

    it('should reject empty feature name', () => {
      const result = validateFeatureName('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should reject consecutive hyphens', () => {
      const result = validateFeatureName('test--feature');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('consecutive hyphens');
    });

    it('should reject name starting with hyphen', () => {
      const result = validateFeatureName('-test');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('start');
    });

    it('should reject name ending with hyphen', () => {
      const result = validateFeatureName('test-');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('end');
    });

    it('should reject reserved words', () => {
      const result = validateFeatureName('init');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('reserved word');
    });

    it('should reject name exceeding 64 characters', () => {
      const longName = 'a'.repeat(65);
      const result = validateFeatureName(longName);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('64 characters');
    });

    it('should accept valid feature name with numbers', () => {
      const result = validateFeatureName('feature-123');
      expect(result.valid).toBe(true);
    });

    it('should accept single word feature name', () => {
      const result = validateFeatureName('feature');
      expect(result.valid).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should throw error when not in obora project', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      await expect(runNew('test-feature', {})).rejects.toThrow('Not in an obora project');
    });

    it('should throw error for duplicate feature name', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      await expect(runNew('test-feature', {})).rejects.toThrow('already exists');
    });

    it('should throw error for invalid feature name', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const strPath = String(path);
        return strPath.includes('.obora') && !strPath.includes('TestFeature');
      });

      await expect(runNew('TestFeature', {})).rejects.toThrow();
    });

    it('should warn about archived feature with same name', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const strPath = String(path);
        if (strPath.includes('archive/test-feature')) {
          return true;
        }
        return strPath.includes('.obora') && !strPath.includes('features/test-feature');
      });
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runNew('test-feature', {});

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('An archived feature with name')
      );
    });
  });

  describe('--from-existing option', () => {
    it('should enable from-existing mode', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const strPath = String(path);
        return strPath.includes('.obora') && !strPath.includes('test-feature');
      });
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runNew('test-feature', { fromExisting: true });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('--from-existing mode enabled')
      );
    });
  });

  describe('--workflow option', () => {
    it('should create feature with standard workflow', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const strPath = String(path);
        return strPath.includes('.obora') && !strPath.includes('test-feature');
      });
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runNew('test-feature', { workflow: 'standard' });

      const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
      const statusCall = writeFileCalls.find((call) => String(call[0]).includes('status.yaml'));
      expect(statusCall?.[1]).toContain('workflow: "standard"');
    });

    it('should reject invalid workflow type', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const strPath = String(path);
        return strPath.includes('.obora') && !strPath.includes('test-feature');
      });

      await expect(runNew('test-feature', { workflow: 'invalid' })).rejects.toThrow(
        'Invalid workflow type'
      );
    });
  });

  describe('commander integration', () => {
    it('should parse feature name from command line', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const strPath = String(path);
        return strPath.includes('.obora') && !strPath.includes('test-feature');
      });
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const cmd = createNewCommand();
      cmd.exitOverride();
      await cmd.parseAsync(['test-feature'], { from: 'user' });

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Creating feature'));
    });

    it('should parse workflow option', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const strPath = String(path);
        return strPath.includes('.obora') && !strPath.includes('test-feature');
      });
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const cmd = createNewCommand();
      cmd.exitOverride();
      await cmd.parseAsync(['test-feature', '--workflow', 'standard'], { from: 'user' });

      const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
      const statusCall = writeFileCalls.find((call) => String(call[0]).includes('status.yaml'));
      expect(statusCall?.[1]).toContain('workflow: "standard"');
    });
  });
});
