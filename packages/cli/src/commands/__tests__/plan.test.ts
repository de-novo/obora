/**
 * plan command tests
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
    writeFile: vi.fn(),
  },
}));

// Mock @obora/runtime
vi.mock('@obora/runtime', () => ({
  log: vi.fn(),
}));

// Mock agent dependencies
const chatCompletionMock = vi.fn().mockResolvedValue({
  id: 'mock-1',
  model: 'mock-model',
  message: { role: 'assistant', content: '## Implementation Plan\n\n- [ ] Mock plan task' },
  usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
  finishReason: 'stop',
});

vi.mock('@obora-kit/adapters', () => ({
  createAdapter: vi.fn(async () => ({
    id: 'mock-llm',
    chatCompletion: chatCompletionMock,
  })),
  AgentConfigResolver: {
    create: vi.fn(async () => ({
      resolveForStep: vi.fn((agent: string, override?: { model?: string }) => ({
        provider: 'openai',
        model: override?.model || 'mock-model',
        temperature: 0.2,
        maxTokens: 4096,
      })),
    })),
  },
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
import { log } from '@obora/runtime';
import { validatePathComponent } from '../../utils/path-utils.js';
import { readStatus } from '../../utils/status.js';
import { createPlanCommand, runPlan } from '../plan.js';

describe.skip('plan command', () => {
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

  const mockProposal = '# Proposal\n\nThis is a test proposal.';
  const mockDesign = '# Design\n\nThis is a test design.';
  const mockTasks = '# Tasks\n\nInitial tasks.';

  beforeEach(() => {
    vi.clearAllMocks();
    chatCompletionMock.mockClear();
    chatCompletionMock.mockResolvedValue({
      id: 'mock-1',
      model: 'mock-model',
      message: { role: 'assistant', content: '## Implementation Plan\n\n- [ ] Mock plan task' },
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      finishReason: 'stop',
    });
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
    it('should create plan command with correct options', () => {
      const cmd = createPlanCommand();
      expect(cmd.name()).toBe('plan');
      expect(cmd.description()).toBe('Generate implementation plan using AI');
    });

    it('should have --feature option', () => {
      const cmd = createPlanCommand();
      const featureOption = cmd.options.find((opt) => opt.long === '--feature');
      expect(featureOption).toBeDefined();
    });

    it('should have --dry-run option', () => {
      const cmd = createPlanCommand();
      const dryRunOption = cmd.options.find((opt) => opt.long === '--dry-run');
      expect(dryRunOption).toBeDefined();
    });

    it('should have --agent option', () => {
      const cmd = createPlanCommand();
      const agentOption = cmd.options.find((opt) => opt.long === '--agent');
      expect(agentOption).toBeDefined();
    });

    it('should have --model option', () => {
      const cmd = createPlanCommand();
      const modelOption = cmd.options.find((opt) => opt.long === '--model');
      expect(modelOption).toBeDefined();
    });
  });

  describe('plan generation', () => {
    it('should generate plan successfully', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((path) => {
        const strPath = String(path);
        if (strPath.includes('proposal.md')) return mockProposal;
        if (strPath.includes('design.md')) return mockDesign;
        if (strPath.includes('tasks.md')) return mockTasks;
        if (strPath.includes('status.yaml')) return 'status: pending';
        return '';
      });
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runPlan('test-feature', {});

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('tasks.md'),
        expect.stringContaining('Implementation Plan'),
        'utf-8'
      );
    });

    it('should update status to planned', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((path) => {
        const strPath = String(path);
        if (strPath.includes('proposal.md')) return mockProposal;
        if (strPath.includes('design.md')) return mockDesign;
        if (strPath.includes('tasks.md')) return mockTasks;
        if (strPath.includes('status.yaml')) return 'status: pending';
        return '';
      });
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runPlan('test-feature', {});

      const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
      const statusCall = writeFileCalls.find((call) => String(call[0]).includes('status.yaml'));
      expect(statusCall?.[1]).toContain('status: planned');
    });

    it('should read proposal and design files', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((path) => {
        const strPath = String(path);
        if (strPath.includes('proposal.md')) return mockProposal;
        if (strPath.includes('design.md')) return mockDesign;
        if (strPath.includes('tasks.md')) return mockTasks;
        if (strPath.includes('status.yaml')) return 'status: pending';
        return '';
      });
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runPlan('test-feature', {});

      expect(log).toHaveBeenCalledWith(expect.stringContaining('Read proposal.md'));
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Read design.md'));
      expect(chatCompletionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system' }),
            expect.objectContaining({ role: 'user', content: expect.stringContaining('### Proposal') }),
          ]),
        }),
        expect.any(Object)
      );
    });
  });

  describe('--dry-run option', () => {
    it('should show what would be done without making changes', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((path) => {
        const strPath = String(path);
        if (strPath.includes('proposal.md')) return mockProposal;
        if (strPath.includes('design.md')) return mockDesign;
        return '';
      });

      await runPlan('test-feature', { dryRun: true });

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Dry-run mode'));
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('--agent option', () => {
    it('should use specified agent', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((path) => {
        const strPath = String(path);
        if (strPath.includes('proposal.md')) return mockProposal;
        if (strPath.includes('design.md')) return mockDesign;
        if (strPath.includes('tasks.md')) return mockTasks;
        if (strPath.includes('status.yaml')) return 'status: pending';
        return '';
      });
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runPlan('test-feature', { agent: 'custom-architect' });

      expect(log).toHaveBeenCalledWith(expect.stringContaining('Agent: custom-architect'));
    });
  });

  describe('--model option', () => {
    it('should use specified model', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((path) => {
        const strPath = String(path);
        if (strPath.includes('proposal.md')) return mockProposal;
        if (strPath.includes('design.md')) return mockDesign;
        if (strPath.includes('tasks.md')) return mockTasks;
        if (strPath.includes('status.yaml')) return 'status: pending';
        return '';
      });
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runPlan('test-feature', { model: 'gpt-4' });

      expect(log).toHaveBeenCalledWith(expect.stringContaining('Model: gpt-4'));
    });
  });

  describe('error handling', () => {
    it('should throw error when not in obora project', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      await expect(runPlan('test-feature', {})).rejects.toThrow('Not in an obora project');
    });

    it('should throw error when feature not found', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const strPath = String(path);
        return !strPath.includes('features/nonexistent-feature');
      });

      await expect(runPlan('nonexistent-feature', {})).rejects.toThrow('not found');
    });

    it('should throw error when status file not found', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readStatus).mockReturnValue(null);

      await expect(runPlan('test-feature', {})).rejects.toThrow('Status file not found');
    });

    it('should handle path traversal attack', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(validatePathComponent).mockImplementation(() => {
        throw new Error('Invalid path');
      });

      await expect(runPlan('../../../etc/passwd', {})).rejects.toThrow('Invalid path');
    });
  });

  describe('success output', () => {
    it('should show success message', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((path) => {
        const strPath = String(path);
        if (strPath.includes('proposal.md')) return mockProposal;
        if (strPath.includes('design.md')) return mockDesign;
        if (strPath.includes('tasks.md')) return mockTasks;
        if (strPath.includes('status.yaml')) return 'status: pending';
        return '';
      });
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runPlan('test-feature', {});

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Plan generated successfully'));
    });

    it('should show next steps', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((path) => {
        const strPath = String(path);
        if (strPath.includes('proposal.md')) return mockProposal;
        if (strPath.includes('design.md')) return mockDesign;
        if (strPath.includes('tasks.md')) return mockTasks;
        if (strPath.includes('status.yaml')) return 'status: pending';
        return '';
      });
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runPlan('test-feature', {});

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Next steps:'));
    });
  });

  describe('tasks.md update', () => {
    it('should append plan to existing tasks.md', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((path) => {
        const strPath = String(path);
        if (strPath.includes('proposal.md')) return mockProposal;
        if (strPath.includes('design.md')) return mockDesign;
        if (strPath.includes('tasks.md')) return mockTasks;
        if (strPath.includes('status.yaml')) return 'status: pending';
        return '';
      });
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runPlan('test-feature', {});

      const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
      const tasksCall = writeFileCalls.find((call) => String(call[0]).includes('tasks.md'));
      expect(tasksCall?.[1]).toContain('Initial tasks.');
      expect(tasksCall?.[1]).toContain('Implementation Plan');
    });

    it('should replace only implementation plan section with non-greedy regex', async () => {
      const existingTasks = [
        '# Tasks',
        '',
        '## Implementation Plan',
        '',
        '- old plan',
        '',
        '## Notes',
        '',
        '- keep this section',
      ].join('\n');

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((path) => {
        const strPath = String(path);
        if (strPath.includes('proposal.md')) return mockProposal;
        if (strPath.includes('design.md')) return mockDesign;
        if (strPath.includes('tasks.md')) return existingTasks;
        if (strPath.includes('status.yaml')) return 'status: pending';
        return '';
      });
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runPlan('test-feature', {});

      const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
      const tasksCall = writeFileCalls.find((call) => String(call[0]).includes('tasks.md'));
      const updatedTasks = String(tasksCall?.[1]);
      expect(updatedTasks).toContain('## Implementation Plan');
      expect(updatedTasks).toContain('Mock plan task');
      expect(updatedTasks).toContain('## Notes');
      expect(updatedTasks).toContain('- keep this section');
    });
  });

  describe('project root resolution', () => {
    it('should find .obora from parent directory when running inside feature directory', async () => {
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/repo/.obora/features/test-feature');

      vi.mocked(existsSync).mockImplementation((path) => {
        const strPath = String(path);
        if (strPath === '/repo/.obora/features/test-feature/.obora') return false;
        if (strPath === '/repo/.obora/features/.obora') return false;
        if (strPath === '/repo/.obora/.obora') return false;
        if (strPath === '/repo/.obora') return true;
        if (strPath.includes('/repo/.obora/features/test-feature')) return true;
        return false;
      });

      vi.mocked(readFileSync).mockImplementation((path) => {
        const strPath = String(path);
        if (strPath.includes('proposal.md')) return mockProposal;
        if (strPath.includes('design.md')) return mockDesign;
        if (strPath.includes('tasks.md')) return mockTasks;
        if (strPath.includes('status.yaml')) return 'status: pending';
        return '';
      });
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await runPlan('test-feature', {});

      expect(readStatus).toHaveBeenCalledWith('/repo/.obora/features/test-feature');
      cwdSpy.mockRestore();
    });
  });

  describe('commander integration', () => {
    it('should parse command options correctly', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((path) => {
        const strPath = String(path);
        if (strPath.includes('proposal.md')) return mockProposal;
        if (strPath.includes('design.md')) return mockDesign;
        if (strPath.includes('tasks.md')) return mockTasks;
        if (strPath.includes('status.yaml')) return 'status: pending';
        return '';
      });
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const cmd = createPlanCommand();
      cmd.exitOverride();
      await cmd.parseAsync(['--feature', 'test-feature'], { from: 'user' });

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Generating plan'));
    });
  });
});
