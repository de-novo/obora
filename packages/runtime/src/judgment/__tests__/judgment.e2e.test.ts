import { describe, it, expect } from 'vitest';
import { JudgmentEngine } from '../JudgmentEngine.js';
import { JudgmentNormalizer } from '../JudgmentNormalizer.js';
import { JudgmentReporter, type ModelResult } from '../JudgmentReporter.js';
import type { EngineOptions, StepInput } from '../types.js';

function opts(o: Partial<EngineOptions> = {}): EngineOptions {
  return { timeoutMs: 5000, batchDeadlineMs: 0, maxRetries: 0, backoffMs: 0, ...o };
}

function step(id = 'step-1'): StepInput {
  return { stepId: id };
}

describe('Judgment E2E', () => {
  const normalizer = new JudgmentNormalizer();
  const reporter = new JudgmentReporter();

  // Helper: run engine + normalize + build report
  async function runWorkflow(params: {
    workflow: string;
    models: { model: string; rawOutput: unknown }[];
    engineOpts?: Partial<EngineOptions>;
  }) {
    const results: ModelResult[] = [];
    for (const m of params.models) {
      const engine = new JudgmentEngine(opts(params.engineOpts), async () => {
        const norm = normalizer.normalize({ rawModelOutput: m.rawOutput, attempt: 1, ingestSeq: 1 });
        return norm.judgmentStatus;
      });
      const engineResult = await engine.run(step(m.model));
      const norm = normalizer.normalize({ rawModelOutput: m.rawOutput, attempt: 1, ingestSeq: 1 });
      results.push({
        model: m.model,
        score: norm.score,
        judgmentStatus: norm.judgmentStatus,
        runState: engineResult.runState,
        issues: norm.issues,
      });
    }
    return results;
  }

  describe('review workflow', () => {
    it('PASS: avg>=90, P0/P1=0, responses>=4', async () => {
      const models = [
        { model: 'gpt-4', rawOutput: { judgmentStatus: 'pass', score: 95, issues: [] } },
        { model: 'claude-3', rawOutput: { judgmentStatus: 'pass', score: 92, issues: [] } },
        { model: 'gemini-pro', rawOutput: { judgmentStatus: 'pass', score: 91, issues: [] } },
        { model: 'llama-3', rawOutput: { judgmentStatus: 'pass', score: 90, issues: [] } },
      ];
      const results = await runWorkflow({ workflow: 'review', models });
      const report = reporter.buildReport({
        runId: 'e2e-review-pass',
        workflow: 'review',
        results,
        runState: 'done',
        decisionReason: 'avg>=90, P0/P1=0, responses>=4',
      });

      expect(report.avgScore).toBeGreaterThanOrEqual(90);
      expect(report.p0Count).toBe(0);
      expect(report.p1Count).toBe(0);
      expect(report.responses).toBeGreaterThanOrEqual(4);
      expect(report.finalPass).toBe(true);

      // Validate output formats
      const json = reporter.toJSON(report);
      const parsed = JSON.parse(json);
      expect(JudgmentReporter.validateJsonFields(parsed)).toEqual([]);

      const md = reporter.toMarkdown(report);
      const { missingSections, missingColumns } = JudgmentReporter.validateMarkdown(md);
      expect(missingSections).toEqual([]);
      expect(missingColumns).toEqual([]);
    });

    it('FAIL: P1 issues present', async () => {
      const models = [
        { model: 'gpt-4', rawOutput: { judgmentStatus: 'pass', score: 95, issues: [] } },
        { model: 'claude-3', rawOutput: { judgmentStatus: 'fail', score: 70, issues: [{ level: 'P1', message: 'style violation' }] } },
        { model: 'gemini-pro', rawOutput: { judgmentStatus: 'pass', score: 91, issues: [] } },
        { model: 'llama-3', rawOutput: { judgmentStatus: 'pass', score: 90, issues: [] } },
      ];
      const results = await runWorkflow({ workflow: 'review', models });
      const report = reporter.buildReport({
        runId: 'e2e-review-fail',
        workflow: 'review',
        results,
        runState: 'done',
        decisionReason: 'P1 detected',
      });

      expect(report.p1Count).toBeGreaterThan(0);
      expect(report.finalPass).toBe(false);
    });
  });

  describe('qa workflow', () => {
    it('PASS: critical_test_fail=0, coverage>=80', async () => {
      const models = [
        { model: 'gpt-4', rawOutput: { judgmentStatus: 'pass', score: 88, issues: [] } },
        { model: 'claude-3', rawOutput: { judgmentStatus: 'pass', score: 85, issues: [] } },
      ];
      const results = await runWorkflow({ workflow: 'qa', models });
      const report = reporter.buildReport({
        runId: 'e2e-qa-pass',
        workflow: 'qa',
        results,
        runState: 'done',
        decisionReason: 'critical_test_fail=0, coverage>=80',
      });

      expect(report.p0Count).toBe(0);
      expect(report.finalPass).toBe(true);
    });
  });

  describe('release workflow', () => {
    it('PASS: security_blocker=0, approval>=2', async () => {
      const models = [
        { model: 'gpt-4', rawOutput: { judgmentStatus: 'pass', score: 95, issues: [] } },
        { model: 'claude-3', rawOutput: { judgmentStatus: 'pass', score: 93, issues: [] } },
        { model: 'gemini-pro', rawOutput: { judgmentStatus: 'pass', score: 90, issues: [] } },
      ];
      const results = await runWorkflow({ workflow: 'release', models });
      const report = reporter.buildReport({
        runId: 'e2e-release-pass',
        workflow: 'release',
        results,
        runState: 'done',
        decisionReason: 'security_blocker=0, approval>=2',
      });

      expect(report.p0Count).toBe(0);
      expect(report.responses).toBeGreaterThanOrEqual(2);
      expect(report.finalPass).toBe(true);
    });
  });
});
