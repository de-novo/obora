import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  JudgmentReporter,
  REQUIRED_JSON_FIELDS,
  REQUIRED_TABLE_COLUMNS,
  type ModelResult,
} from '../JudgmentReporter.js';

const fixturesDir = resolve(import.meta.dirname, '..', '__fixtures__', 'reports');

function makeResults(overrides: Partial<ModelResult>[] = []): ModelResult[] {
  const base: ModelResult = {
    model: 'gpt-4',
    score: 95,
    judgmentStatus: 'pass',
    runState: 'done',
    issues: [],
  };
  if (overrides.length === 0) return [base];
  return overrides.map((o) => ({ ...base, ...o }));
}

describe('JudgmentReporter', () => {
  const reporter = new JudgmentReporter();

  describe('buildReport', () => {
    it('computes avgScore, p0Count, p1Count, finalPass correctly', () => {
      const report = reporter.buildReport({
        runId: 'r1',
        workflow: 'review',
        results: makeResults([
          { score: 90, issues: [] },
          { score: 80, issues: [{ level: 'P0', message: 'critical' }] },
        ]),
        runState: 'done',
        decisionReason: 'test',
      });
      expect(report.responses).toBe(2);
      expect(report.avgScore).toBe(85);
      expect(report.p0Count).toBe(1);
      expect(report.p1Count).toBe(0);
      expect(report.finalPass).toBe(false); // p0 > 0
    });

    it('finalPass is true when done + no P0/P1', () => {
      const report = reporter.buildReport({
        runId: 'r2',
        workflow: 'qa',
        results: makeResults([{ score: 95 }]),
        runState: 'done',
        decisionReason: 'ok',
      });
      expect(report.finalPass).toBe(true);
    });

    it('finalPass is false when runState is not done', () => {
      const report = reporter.buildReport({
        runId: 'r3',
        workflow: 'qa',
        results: makeResults([{ score: 95 }]),
        runState: 'failed',
        decisionReason: 'failed',
      });
      expect(report.finalPass).toBe(false);
    });
  });

  describe('JSON schema validation', () => {
    it('valid report has no missing fields', () => {
      const report = reporter.buildReport({
        runId: 'r1',
        workflow: 'review',
        results: makeResults(),
        runState: 'done',
        decisionReason: 'ok',
      });
      const missing = JudgmentReporter.validateJsonFields(report as unknown as Record<string, unknown>);
      expect(missing).toEqual([]);
    });

    it('detects missing required fields', () => {
      const partial = { runId: 'r1', workflow: 'review' };
      const missing = JudgmentReporter.validateJsonFields(partial);
      expect(missing.length).toBeGreaterThan(0);
      for (const field of REQUIRED_JSON_FIELDS) {
        if (!(field in partial)) {
          expect(missing).toContain(field);
        }
      }
    });
  });

  describe('Markdown validation', () => {
    it('valid markdown has no missing sections or columns', () => {
      const report = reporter.buildReport({
        runId: 'r1',
        workflow: 'review',
        results: makeResults(),
        runState: 'done',
        decisionReason: 'ok',
      });
      const md = reporter.toMarkdown(report);
      const { missingSections, missingColumns } = JudgmentReporter.validateMarkdown(md);
      expect(missingSections).toEqual([]);
      expect(missingColumns).toEqual([]);
    });

    it('detects missing sections in incomplete markdown', () => {
      const { missingSections } = JudgmentReporter.validateMarkdown('# Something else\nno fields');
      expect(missingSections.length).toBeGreaterThan(0);
      expect(missingSections).toContain('# Judgment Report');
    });

    it('detects missing table columns', () => {
      const { missingColumns } = JudgmentReporter.validateMarkdown('# Judgment Report\n- **runId**: r1');
      expect(missingColumns.length).toBeGreaterThan(0);
    });
  });

  describe('golden snapshot tests', () => {
    const workflows = ['review', 'qa', 'release'] as const;
    const inputs: Record<string, Parameters<typeof reporter.buildReport>[0]> = {
      review: {
        runId: 'run-review-001',
        workflow: 'review',
        results: [
          { model: 'gpt-4', score: 95, judgmentStatus: 'pass', runState: 'done', issues: [] },
          { model: 'claude-3', score: 92, judgmentStatus: 'pass', runState: 'done', issues: [] },
          { model: 'gemini-pro', score: 91, judgmentStatus: 'pass', runState: 'done', issues: [] },
          { model: 'llama-3', score: 90, judgmentStatus: 'pass', runState: 'done', issues: [] },
        ],
        runState: 'done',
        decisionReason: 'avg>=90, P0/P1=0, responses>=4',
      },
      qa: {
        runId: 'run-qa-001',
        workflow: 'qa',
        results: [
          { model: 'gpt-4', score: 88, judgmentStatus: 'pass', runState: 'done', issues: [] },
          { model: 'claude-3', score: 85, judgmentStatus: 'pass', runState: 'done', issues: [] },
        ],
        runState: 'done',
        decisionReason: 'critical_test_fail=0, coverage>=80',
      },
      release: {
        runId: 'run-release-001',
        workflow: 'release',
        results: [
          { model: 'gpt-4', score: 95, judgmentStatus: 'pass', runState: 'done', issues: [] },
          { model: 'claude-3', score: 93, judgmentStatus: 'pass', runState: 'done', issues: [] },
          { model: 'gemini-pro', score: 90, judgmentStatus: 'pass', runState: 'done', issues: [] },
        ],
        runState: 'done',
        decisionReason: 'security_blocker=0, approval>=2',
      },
    };

    for (const wf of workflows) {
      it(`${wf} JSON golden snapshot matches`, () => {
        const report = reporter.buildReport(inputs[wf]!);
        const json = reporter.toJSON(report);
        const golden = readFileSync(resolve(fixturesDir, `${wf}.golden.json`), 'utf-8');
        expect(json + '\n').toBe(golden);
      });

      it(`${wf} Markdown golden snapshot matches`, () => {
        const report = reporter.buildReport(inputs[wf]!);
        const md = reporter.toMarkdown(report);
        const golden = readFileSync(resolve(fixturesDir, `${wf}.golden.md`), 'utf-8');
        expect(md).toBe(golden);
      });
    }
  });
});
