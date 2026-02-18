/**
 * validate command tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node:fs module
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
}));

// Mock @obora/runtime
vi.mock('@obora/runtime', () => ({
  parseAndValidate: vi.fn(),
}));

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { parseAndValidate } from '@obora/runtime';
import { validateCommand } from '../validate.js';

describe('validate command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('command creation', () => {
    it('should create validate command with correct options', () => {
      const cmd = validateCommand();
      expect(cmd.name()).toBe('validate');
      expect(cmd.description()).toBe('Validate workflow YAML files');
    });

    it('should have --all option', () => {
      const cmd = validateCommand();
      const allOption = cmd.options.find((opt) => opt.long === '--all');
      expect(allOption).toBeDefined();
    });

    it('should have --file option', () => {
      const cmd = validateCommand();
      const fileOption = cmd.options.find((opt) => opt.long === '--file');
      expect(fileOption).toBeDefined();
    });

    it('should have --strict option', () => {
      const cmd = validateCommand();
      const strictOption = cmd.options.find((opt) => opt.long === '--strict');
      expect(strictOption).toBeDefined();
    });

    it('should have --format option with default "default"', () => {
      const cmd = validateCommand();
      const formatOption = cmd.options.find((opt) => opt.long === '--format');
      expect(formatOption).toBeDefined();
      expect(formatOption?.defaultValue).toBe('default');
    });

    it('should have --verbose option', () => {
      const cmd = validateCommand();
      const verboseOption = cmd.options.find((opt) => opt.long === '--verbose');
      expect(verboseOption).toBeDefined();
    });
  });

  describe('file validation', () => {
    it('should validate a specific file successfully', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('name: test\nsteps: []');
      vi.mocked(parseAndValidate).mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [],
      });

      const cmd = validateCommand();
      cmd.exitOverride();
      await cmd.parseAsync(['--file', 'workflow.yaml'], { from: 'user' });

      expect(parseAndValidate).toHaveBeenCalledWith('name: test\nsteps: []');
    });

    it('should throw error for non-existent file', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const cmd = validateCommand();
      cmd.exitOverride();
      
      await expect(
        cmd.parseAsync(['--file', 'nonexistent.yaml'], { from: 'user' })
      ).rejects.toThrow();
    });

    it('should show validation errors', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('name: test\nsteps: []');
      vi.mocked(parseAndValidate).mockReturnValue({
        isValid: false,
        errors: [
          {
            code: 'MISSING_FIELD',
            message: 'Missing required field: version',
            path: '/workflow',
            suggestion: 'Add version field',
          },
        ],
        warnings: [],
      });

      const cmd = validateCommand();
      cmd.exitOverride();
      
      await expect(
        cmd.parseAsync(['--file', 'workflow.yaml'], { from: 'user' })
      ).rejects.toThrow();
    });

    it('should show validation warnings', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('name: test\nsteps: []');
      vi.mocked(parseAndValidate).mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [
          {
            code: 'DEPRECATED_FIELD',
            message: 'Field "old_field" is deprecated',
            path: '/workflow',
            suggestion: 'Use "new_field" instead',
          },
        ],
      });

      const cmd = validateCommand();
      cmd.exitOverride();
      await cmd.parseAsync(['--file', 'workflow.yaml'], { from: 'user' });

      // Check warning was printed
      const calls = consoleLogSpy.mock.calls.flat().join(' ');
      expect(calls).toContain('warning');
    });
  });

  describe('--format json', () => {
    it('should output JSON format when specified', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('name: test\nsteps: []');
      vi.mocked(parseAndValidate).mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [],
      });

      const cmd = validateCommand();
      cmd.exitOverride();
      await cmd.parseAsync(['--file', 'workflow.yaml', '--format', 'json'], { from: 'user' });

      const logCalls = consoleLogSpy.mock.calls.flat();
      const jsonOutput = logCalls.join(' ');
      expect(jsonOutput).toContain('"valid"');
      expect(jsonOutput).toContain('true');
    });

    it('should include errors in JSON output', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('name: test\nsteps: []');
      vi.mocked(parseAndValidate).mockReturnValue({
        isValid: false,
        errors: [
          {
            code: 'ERR001',
            message: 'Invalid field',
            path: '',
          },
        ],
        warnings: [],
      });

      const cmd = validateCommand();
      cmd.exitOverride();
      
      // JSON format should be printed before throwing
      try {
        await cmd.parseAsync(['--file', 'workflow.yaml', '--format', 'json'], { from: 'user' });
      } catch (e) {
        // Expected to throw
      }

      const logCalls = consoleLogSpy.mock.calls.flat();
      const jsonOutput = logCalls.join(' ');
      expect(jsonOutput).toContain('"valid"');
      expect(jsonOutput).toContain('false');
      expect(jsonOutput).toContain('"errors"');
    });
  });

  describe('--strict mode', () => {
    it('should treat warnings as errors in strict mode', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('name: test\nsteps: []');
      vi.mocked(parseAndValidate).mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [
          {
            code: 'WARN001',
            message: 'Test warning',
            path: '',
          },
        ],
      });

      const cmd = validateCommand();
      cmd.exitOverride();
      
      await expect(
        cmd.parseAsync(['--file', 'workflow.yaml', '--strict'], { from: 'user' })
      ).rejects.toThrow();
    });

    it('should pass with no warnings in strict mode', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('name: test\nsteps: []');
      vi.mocked(parseAndValidate).mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [],
      });

      const cmd = validateCommand();
      cmd.exitOverride();
      
      await expect(
        cmd.parseAsync(['--file', 'workflow.yaml', '--strict'], { from: 'user' })
      ).resolves.not.toThrow();
    });
  });

  describe('--all option', () => {
    it('should validate all workflow files in directories', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([
        { name: 'simple.yaml', isDirectory: () => false },
        { name: 'standard.yaml', isDirectory: () => false },
      ] as any);
      vi.mocked(readFileSync).mockReturnValue('name: test\nsteps: []');
      vi.mocked(parseAndValidate).mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [],
      });

      const cmd = validateCommand();
      cmd.exitOverride();
      await cmd.parseAsync(['--all'], { from: 'user' });

      expect(parseAndValidate).toHaveBeenCalled();
    });

    it('should show warning when no workflow files found', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readdirSync).mockReturnValue([]);

      const cmd = validateCommand();
      cmd.exitOverride();
      await cmd.parseAsync(['--all'], { from: 'user' });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('No workflow files found')
      );
    });
  });

  describe('--verbose option', () => {
    it('should show detailed output with --verbose', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('name: test\nsteps: []');
      vi.mocked(parseAndValidate).mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [
          {
            code: 'WARN001',
            message: 'Test warning',
            path: '',
          },
        ],
      });

      const cmd = validateCommand();
      cmd.exitOverride();
      await cmd.parseAsync(['--file', 'workflow.yaml', '--verbose'], { from: 'user' });

      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('path validation', () => {
    it('should reject path traversal attempts', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const cmd = validateCommand();
      cmd.exitOverride();
      
      await expect(
        cmd.parseAsync(['--file', '../../../etc/passwd'], { from: 'user' })
      ).rejects.toThrow();
    });
  });

  describe('summary output', () => {
    it('should print summary with passed and failed counts', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('name: test\nsteps: []');
      vi.mocked(parseAndValidate).mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [],
      });

      const cmd = validateCommand();
      cmd.exitOverride();
      await cmd.parseAsync(['--file', 'workflow.yaml'], { from: 'user' });

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Results:'));
    });

    it('should show warning count in summary', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('name: test\nsteps: []');
      vi.mocked(parseAndValidate).mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [
          {
            code: 'WARN001',
            message: 'Warning',
            path: '',
          },
        ],
      });

      const cmd = validateCommand();
      cmd.exitOverride();
      await cmd.parseAsync(['--file', 'workflow.yaml'], { from: 'user' });

      const calls = consoleLogSpy.mock.calls.flat().join(' ');
      expect(calls).toContain('warning');
    });
  });
});
