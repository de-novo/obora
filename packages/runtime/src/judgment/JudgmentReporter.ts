/**
 * JudgmentReporter — JSON & Markdown report generation.
 * TASK-M1-27
 */

import type { RunState, JudgmentStatus } from './types.js';
import type { IssueEntry } from './JudgmentNormalizer.js';

// ---------------------------------------------------------------------------
// Report types
// ---------------------------------------------------------------------------

export interface ModelResult {
  model: string;
  score: number;
  judgmentStatus: JudgmentStatus;
  runState: RunState;
  issues: IssueEntry[];
}

export interface JudgmentReport {
  runId: string;
  workflow: string;
  responses: number;
  avgScore: number;
  p0Count: number;
  p1Count: number;
  runState: RunState;
  finalPass: boolean;
  decisionReason: string;
  results: ModelResult[];
}

// ---------------------------------------------------------------------------
// Required fields (used for validation)
// ---------------------------------------------------------------------------

const REQUIRED_JSON_FIELDS: readonly (keyof JudgmentReport)[] = [
  'runId', 'workflow', 'responses', 'avgScore',
  'p0Count', 'p1Count', 'runState', 'finalPass',
  'decisionReason', 'results',
] as const;

const REQUIRED_MD_SECTIONS = [
  '# Judgment Report',
  'runId', 'workflow', 'runState', 'finalPass', 'decisionReason',
] as const;

const REQUIRED_TABLE_COLUMNS = ['model', 'score', 'judgmentStatus', 'runState', 'issues'] as const;

export { REQUIRED_JSON_FIELDS, REQUIRED_MD_SECTIONS, REQUIRED_TABLE_COLUMNS };

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

export interface ReporterLogger {
  log(entry: { event: string; runId: string; workflow: string; size: number }): void;
}

const noopLogger: ReporterLogger = { log() {} };

// ---------------------------------------------------------------------------
// Reporter
// ---------------------------------------------------------------------------

export class JudgmentReporter {
  private readonly logger: ReporterLogger;

  constructor(logger?: ReporterLogger) {
    this.logger = logger ?? noopLogger;
  }

  /**
   * Build a JudgmentReport from model results and workflow metadata.
   */
  buildReport(params: {
    runId: string;
    workflow: string;
    results: ModelResult[];
    runState: RunState;
    decisionReason: string;
  }): JudgmentReport {
    const { runId, workflow, results, runState, decisionReason } = params;
    const responses = results.length;
    const avgScore = responses > 0
      ? Math.round((results.reduce((s, r) => s + r.score, 0) / responses) * 100) / 100
      : 0;
    const p0Count = results.reduce((c, r) => c + r.issues.filter(i => i.level === 'P0').length, 0);
    const p1Count = results.reduce((c, r) => c + r.issues.filter(i => i.level === 'P1').length, 0);
    const finalPass = runState === 'done' && p0Count === 0 && p1Count === 0;

    return {
      runId,
      workflow,
      responses,
      avgScore,
      p0Count,
      p1Count,
      runState,
      finalPass,
      decisionReason,
      results,
    };
  }

  /**
   * Serialize report to JSON string.
   */
  toJSON(report: JudgmentReport): string {
    const json = JSON.stringify(report, null, 2);
    this.logger.log({
      event: 'report_generated',
      runId: report.runId,
      workflow: report.workflow,
      size: json.length,
    });
    return json;
  }

  /**
   * Serialize report to Markdown string.
   */
  toMarkdown(report: JudgmentReport): string {
    const lines: string[] = [];
    lines.push('# Judgment Report');
    lines.push('');
    lines.push(`- **runId**: ${report.runId}`);
    lines.push(`- **workflow**: ${report.workflow}`);
    lines.push(`- **responses**: ${report.responses}`);
    lines.push(`- **avgScore**: ${report.avgScore}`);
    lines.push(`- **p0Count**: ${report.p0Count}`);
    lines.push(`- **p1Count**: ${report.p1Count}`);
    lines.push(`- **runState**: ${report.runState}`);
    lines.push(`- **finalPass**: ${report.finalPass}`);
    lines.push(`- **decisionReason**: ${report.decisionReason}`);
    lines.push('');
    lines.push('## Results');
    lines.push('');
    lines.push('| model | score | judgmentStatus | runState | issues |');
    lines.push('|-------|-------|----------------|----------|--------|');
    for (const r of report.results) {
      const issuesStr = r.issues.length > 0
        ? r.issues.map(i => `${i.level}: ${i.message}`).join('; ')
        : 'none';
      lines.push(`| ${r.model} | ${r.score} | ${r.judgmentStatus} | ${r.runState} | ${issuesStr} |`);
    }
    lines.push('');

    const md = lines.join('\n');
    this.logger.log({
      event: 'report_generated',
      runId: report.runId,
      workflow: report.workflow,
      size: md.length,
    });
    return md;
  }

  /**
   * Validate that a JSON report object contains all required fields.
   */
  static validateJsonFields(report: Record<string, unknown>): string[] {
    const missing: string[] = [];
    for (const field of REQUIRED_JSON_FIELDS) {
      if (!(field in report) || report[field] === undefined) {
        missing.push(field);
      }
    }
    return missing;
  }

  /**
   * Validate that a Markdown string contains all required sections and table columns.
   */
  static validateMarkdown(md: string): { missingSections: string[]; missingColumns: string[] } {
    const missingSections: string[] = [];
    for (const section of REQUIRED_MD_SECTIONS) {
      if (!md.includes(section)) {
        missingSections.push(section);
      }
    }
    const missingColumns: string[] = [];
    for (const col of REQUIRED_TABLE_COLUMNS) {
      if (!md.includes(col)) {
        missingColumns.push(col);
      }
    }
    return { missingSections, missingColumns };
  }
}
