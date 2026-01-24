/**
 * Progress Indicator Utilities
 *
 * Provides consistent progress feedback using ora spinners
 * with support for:
 * - Single spinners
 * - Multi-step tasks
 * - Nested operations
 */

import ora, { type Ora, type Options as OraOptions } from "ora";
import consola from "consola";

// ============================================================================
// Types
// ============================================================================

export interface TaskStep {
  /** Step name for display */
  name: string;
  /** Task function to execute */
  task: () => Promise<void>;
  /** Optional: skip condition */
  skip?: () => boolean | Promise<boolean>;
}

export interface TaskOptions {
  /** Show time taken for each step */
  showTime?: boolean;
  /** Continue on error */
  continueOnError?: boolean;
  /** Verbose output */
  verbose?: boolean;
}

export interface SpinnerState {
  spinner: Ora;
  startTime: number;
}

// ============================================================================
// Spinner Utilities
// ============================================================================

/**
 * Create and start a spinner
 */
export function createSpinner(text: string, options?: OraOptions): Ora {
  return ora({
    text,
    color: "cyan",
    ...options,
  }).start();
}

/**
 * Run a task with a spinner
 */
export async function withSpinner<T>(
  text: string,
  task: () => Promise<T>,
  options?: {
    successText?: string;
    failText?: string;
    showTime?: boolean;
  }
): Promise<T> {
  const spinner = createSpinner(text);
  const startTime = Date.now();

  try {
    const result = await task();
    const elapsed = Date.now() - startTime;
    const timeStr = options?.showTime ? ` (${formatTime(elapsed)})` : "";
    spinner.succeed((options?.successText || text) + timeStr);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    spinner.fail(options?.failText || `${text}: ${message}`);
    throw error;
  }
}

/**
 * Run multiple tasks sequentially with progress
 */
export async function runTasks(
  tasks: TaskStep[],
  options: TaskOptions = {}
): Promise<{ succeeded: number; failed: number; skipped: number }> {
  const results = { succeeded: 0, failed: 0, skipped: 0 };
  const total = tasks.length;

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const prefix = `[${i + 1}/${total}]`;

    // Check skip condition
    if (task.skip) {
      const shouldSkip = await task.skip();
      if (shouldSkip) {
        if (options.verbose) {
          consola.info(`${prefix} Skipped: ${task.name}`);
        }
        results.skipped++;
        continue;
      }
    }

    const spinner = createSpinner(`${prefix} ${task.name}`);
    const startTime = Date.now();

    try {
      await task.task();
      const elapsed = Date.now() - startTime;
      const timeStr = options.showTime ? ` (${formatTime(elapsed)})` : "";
      spinner.succeed(`${prefix} ${task.name}${timeStr}`);
      results.succeeded++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      spinner.fail(`${prefix} ${task.name}: ${message}`);
      results.failed++;

      if (!options.continueOnError) {
        throw error;
      }
    }
  }

  return results;
}

// ============================================================================
// Progress Group (for nested operations)
// ============================================================================

export class ProgressGroup {
  private spinner: Ora | null = null;
  private currentStep = 0;
  private totalSteps: number;
  private groupName: string;
  private startTime: number;

  constructor(groupName: string, totalSteps: number) {
    this.groupName = groupName;
    this.totalSteps = totalSteps;
    this.startTime = Date.now();
  }

  /**
   * Start the progress group
   */
  start(): this {
    this.spinner = createSpinner(this.formatText("Starting..."));
    return this;
  }

  /**
   * Update progress with a new step
   */
  step(text: string): this {
    this.currentStep++;
    if (this.spinner) {
      this.spinner.text = this.formatText(text);
    }
    return this;
  }

  /**
   * Mark a sub-step as complete
   */
  substep(text: string): this {
    if (this.spinner) {
      this.spinner.text = this.formatText(text);
    }
    return this;
  }

  /**
   * Complete the progress group successfully
   */
  succeed(text?: string): void {
    const elapsed = Date.now() - this.startTime;
    const message = text || `${this.groupName} complete`;
    if (this.spinner) {
      this.spinner.succeed(`${message} (${formatTime(elapsed)})`);
    }
  }

  /**
   * Mark the progress group as failed
   */
  fail(text?: string): void {
    const message = text || `${this.groupName} failed`;
    if (this.spinner) {
      this.spinner.fail(message);
    }
  }

  /**
   * Show a warning but continue
   */
  warn(text: string): void {
    if (this.spinner) {
      this.spinner.warn(text);
      // Restart spinner for next operation
      this.spinner = createSpinner(this.formatText("Continuing..."));
    }
  }

  private formatText(text: string): string {
    const progress = `[${this.currentStep}/${this.totalSteps}]`;
    return `${this.groupName} ${progress} ${text}`;
  }
}

// ============================================================================
// Pre-flight Check Display
// ============================================================================

export interface PreflightCheck {
  name: string;
  check: () => Promise<boolean> | boolean;
  required?: boolean;
}

export interface PreflightResult {
  name: string;
  passed: boolean;
  required: boolean;
}

/**
 * Run and display pre-flight checks
 */
export async function runPreflightChecks(
  checks: PreflightCheck[]
): Promise<{ passed: boolean; results: PreflightResult[] }> {
  consola.info("Pre-flight checks:");

  const results: PreflightResult[] = [];
  let allPassed = true;

  for (const check of checks) {
    const passed = await check.check();
    const required = check.required !== false;

    results.push({ name: check.name, passed, required });

    if (passed) {
      consola.log(`  ✓ ${check.name}`);
    } else if (required) {
      consola.log(`  ✗ ${check.name}`);
      allPassed = false;
    } else {
      consola.log(`  ⚠ ${check.name} (optional)`);
    }
  }

  consola.log(""); // Empty line after checks
  return { passed: allPassed, results };
}

// ============================================================================
// Summary Display
// ============================================================================

export interface SummaryItem {
  label: string;
  value: string | number;
  type?: "success" | "warning" | "error" | "info";
}

/**
 * Display a summary box
 */
export function showSummary(title: string, items: SummaryItem[]): void {
  const lines: string[] = [title, ""];

  for (const item of items) {
    const icon = getStatusIcon(item.type);
    lines.push(`${icon} ${item.label}: ${item.value}`);
  }

  consola.box(lines.join("\n"));
}

/**
 * Display operation results
 */
export function showResults(results: {
  succeeded: number;
  failed: number;
  skipped?: number;
}): void {
  const items: SummaryItem[] = [];

  if (results.succeeded > 0) {
    items.push({ label: "Succeeded", value: results.succeeded, type: "success" });
  }
  if (results.failed > 0) {
    items.push({ label: "Failed", value: results.failed, type: "error" });
  }
  if (results.skipped && results.skipped > 0) {
    items.push({ label: "Skipped", value: results.skipped, type: "warning" });
  }

  const total = results.succeeded + results.failed + (results.skipped || 0);
  const status = results.failed > 0 ? "error" : "success";

  if (items.length > 0) {
    consola.log("");
    for (const item of items) {
      const icon = getStatusIcon(item.type);
      consola.log(`${icon} ${item.label}: ${item.value}`);
    }
  }

  if (results.failed > 0) {
    consola.error(`\n${results.failed} operation(s) failed`);
  }
}

// ============================================================================
// Helpers
// ============================================================================

function formatTime(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}

function getStatusIcon(type?: "success" | "warning" | "error" | "info"): string {
  switch (type) {
    case "success":
      return "✓";
    case "warning":
      return "⚠";
    case "error":
      return "✗";
    case "info":
    default:
      return "•";
  }
}
