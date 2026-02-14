/**
 * init command tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node:fs module (used for existsSync)
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

// Mock fs-extra module (used for writeFile, remove, ensureDir)
vi.mock('fs-extra', () => ({
  default: {
    remove: vi.fn(),
    ensureDir: vi.fn(),
    writeFile: vi.fn(),
  },
}));

// Mock @obora/database
vi.mock('@obora/database', () => {
  return {
    OboraDatabase: class MockOboraDatabase {
      initialize = vi.fn().mockResolvedValue(undefined);
      close = vi.fn();
    },
  };
});

// Mock @obora/core
vi.mock('@obora/core', () => ({
  log: vi.fn(),
}));

import { existsSync } from 'node:fs';
import fs from 'fs-extra';
import { OboraDatabase } from '@obora/database';
import { createInitCommand, runInit } from '../init.js';

describe('init command', () => {
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
    it('should create init command with correct options', () => {
      const cmd = createInitCommand();
      expect(cmd.name()).toBe('init');
      expect(cmd.description()).toBe('Initialize obora project');
      expect(cmd.options.length).toBeGreaterThanOrEqual(2);
    });

    it('should have --force option', () => {
      const cmd = createInitCommand();
      const forceOption = cmd.options.find((opt) => opt.long === '--force');
      expect(forceOption).toBeDefined();
    });

    it('should have --workflow option', () => {
      const cmd = createInitCommand();
      const workflowOption = cmd.options.find((opt) => opt.long === '--workflow');
      expect(workflowOption).toBeDefined();
      expect(workflowOption?.defaultValue).toBe('simple');
    });

    it('should have --minimal option', () => {
      const cmd = createInitCommand();
      const minimalOption = cmd.options.find((opt) => opt.long === '--minimal');
      expect(minimalOption).toBeDefined();
    });
  });

  describe('project initialization', () => {
    it('should initialize new project successfully', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runInit({});

      expect(consoleLogSpy).toHaveBeenCalledWith('Initializing obora project...');
      expect(fs.ensureDir).toHaveBeenCalledTimes(5); // oboraDir + 4 subdirs
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should create all required directories', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runInit({});

      const ensureDirCalls = vi.mocked(fs.ensureDir).mock.calls;
      const paths = ensureDirCalls.map((call) => call[0]);
      expect(paths.some((p) => String(p).includes('.obora'))).toBe(true);
      expect(paths.some((p) => String(p).includes('workflows'))).toBe(true);
      expect(paths.some((p) => String(p).includes('features'))).toBe(true);
      expect(paths.some((p) => String(p).includes('archive'))).toBe(true);
      expect(paths.some((p) => String(p).includes('agents'))).toBe(true);
    });

    it('should create config.yaml', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runInit({});

      const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
      const configCall = writeFileCalls.find((call) => String(call[0]).includes('config.yaml'));
      expect(configCall).toBeDefined();
      expect(typeof configCall?.[1]).toBe('string');
      expect(String(configCall?.[1])).toContain('project:');
      expect(String(configCall?.[1])).toContain('settings:');
    });

    it('should create workflow file', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runInit({});

      const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
      const workflowCall = writeFileCalls.find((call) => String(call[0]).includes('workflows/simple.yaml'));
      expect(workflowCall).toBeDefined();
      expect(String(workflowCall?.[1])).toContain('name: simple');
      expect(String(workflowCall?.[1])).toContain('steps:');
    });

    it('should initialize DuckDB database', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runInit({});

      // OboraDatabase is instantiated with path containing 'obora.db'
      // The mock class is used internally - we verify by console output
      expect(consoleLogSpy).toHaveBeenCalledWith('  Created: .obora/obora.db');
    });

    it('should create .gitkeep files', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runInit({});

      const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
      const gitkeepCalls = writeFileCalls.filter((call) => String(call[0]).includes('.gitkeep'));
      expect(gitkeepCalls.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('--force option', () => {
    it('should throw error when .obora exists without --force', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      await expect(runInit({})).rejects.toThrow('already exists');
    });

    it('should overwrite existing .obora with --force', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.remove).mockResolvedValue(undefined);
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runInit({ force: true });

      expect(fs.remove).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith('Removing existing .obora/ directory...');
    });
  });

  describe('--workflow option', () => {
    it('should use simple workflow by default', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runInit({});

      const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
      const workflowCall = writeFileCalls.find((call) => String(call[0]).includes('workflows/simple.yaml'));
      expect(workflowCall).toBeDefined();
    });

    it('should create standard workflow with --workflow standard', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runInit({ workflow: 'standard' });

      const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
      const workflowCall = writeFileCalls.find((call) => String(call[0]).includes('workflows/standard.yaml'));
      expect(workflowCall).toBeDefined();
      expect(String(workflowCall?.[1])).toContain('name: standard');
    });

    it('should reject invalid workflow type', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      await expect(runInit({ workflow: 'invalid' })).rejects.toThrow('Invalid workflow type');
    });

    it('should use standard config template with --workflow standard', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runInit({ workflow: 'standard' });

      const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
      const configCall = writeFileCalls.find((call) => String(call[0]).includes('config.yaml'));
      expect(String(configCall?.[1])).toContain('workflow: "standard"');
    });
  });

  describe('--minimal option', () => {
    it('should create minimal config with --minimal', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runInit({ minimal: true });

      const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
      const configCall = writeFileCalls.find((call) => String(call[0]).includes('config.yaml'));
      expect(String(configCall?.[1])).toContain('workflow: "simple"');
      expect(String(configCall?.[1])).toContain('name: "my-project"');
    });

    it('should respect workflow choice even with --minimal', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runInit({ minimal: true, workflow: 'standard' });

      const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
      const configCall = writeFileCalls.find((call) => String(call[0]).includes('config.yaml'));
      expect(String(configCall?.[1])).toContain('workflow: "standard"');

      const workflowCall = writeFileCalls.find((call) => String(call[0]).includes('workflows/standard.yaml'));
      expect(workflowCall).toBeDefined();
    });
  });

  describe('combined options', () => {
    it('should work with --force and --minimal together', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.remove).mockResolvedValue(undefined);
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runInit({ force: true, minimal: true });

      expect(fs.remove).toHaveBeenCalled();
      expect(fs.ensureDir).toHaveBeenCalled();
    });

    it('should work with --force and --workflow standard', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.remove).mockResolvedValue(undefined);
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runInit({ force: true, workflow: 'standard' });

      const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
      const workflowCall = writeFileCalls.find((call) => String(call[0]).includes('workflows/standard.yaml'));
      expect(workflowCall).toBeDefined();
    });
  });

  describe('commander integration', () => {
    it('should parse command options correctly', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const cmd = createInitCommand();
      cmd.exitOverride();
      await cmd.parseAsync(['--workflow', 'simple', '--minimal'], { from: 'user' });

      expect(consoleLogSpy).toHaveBeenCalledWith('Initializing obora project...');
    });
  });
});
