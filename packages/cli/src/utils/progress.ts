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

// ============================================================================
// Nested Progress (Tree-style progress display)
// ============================================================================

export interface NestedStep {
  id: string;
  label: string;
  status: "pending" | "running" | "success" | "warning" | "error" | "skipped";
  detail?: string;
  count?: { current: number; total: number };
}

export interface NestedProgressOptions {
  /** Show elapsed time */
  showTime?: boolean;
  /** Persist completed steps (don't clear) */
  persistSteps?: boolean;
}

/**
 * Tree-style nested progress display
 *
 * @example
 * const progress = new NestedProgress("Installing clerk");
 * progress.start();
 * progress.addStep("deps", "Adding dependencies");
 * progress.updateStep("deps", { status: "running", count: { current: 1, total: 5 } });
 * progress.updateStep("deps", { status: "success" });
 * progress.addStep("transform", "Transforming files");
 * progress.succeed();
 */
export class NestedProgress {
  private spinner: Ora | null = null;
  private title: string;
  private steps: Map<string, NestedStep> = new Map();
  private stepOrder: string[] = [];
  private startTime: number = 0;
  private options: NestedProgressOptions;
  private completedLines: string[] = [];

  constructor(title: string, options: NestedProgressOptions = {}) {
    this.title = title;
    this.options = options;
  }

  /**
   * Start the progress display
   */
  start(): this {
    this.startTime = Date.now();
    this.spinner = createSpinner(this.title);
    return this;
  }

  /**
   * Add a new step
   */
  addStep(id: string, label: string, options?: { count?: { current: number; total: number } }): this {
    this.steps.set(id, {
      id,
      label,
      status: "pending",
      count: options?.count,
    });
    this.stepOrder.push(id);
    this.render();
    return this;
  }

  /**
   * Update an existing step
   */
  updateStep(id: string, update: Partial<Omit<NestedStep, "id">>): this {
    const step = this.steps.get(id);
    if (step) {
      Object.assign(step, update);

      // If step completed and persistSteps, save it
      if (this.options.persistSteps && (update.status === "success" || update.status === "error" || update.status === "warning")) {
        this.completedLines.push(this.formatStepLine(step, this.stepOrder.indexOf(id) === this.stepOrder.length - 1));
      }

      this.render();
    }
    return this;
  }

  /**
   * Mark a step as running
   */
  runStep(id: string, detail?: string): this {
    return this.updateStep(id, { status: "running", detail });
  }

  /**
   * Mark a step as successful
   */
  succeedStep(id: string, detail?: string): this {
    return this.updateStep(id, { status: "success", detail });
  }

  /**
   * Mark a step as failed
   */
  failStep(id: string, detail?: string): this {
    return this.updateStep(id, { status: "error", detail });
  }

  /**
   * Mark a step as skipped
   */
  skipStep(id: string, detail?: string): this {
    return this.updateStep(id, { status: "skipped", detail });
  }

  /**
   * Complete the progress successfully
   */
  succeed(message?: string): void {
    const elapsed = Date.now() - this.startTime;
    const timeStr = this.options.showTime ? ` (${formatTime(elapsed)})` : "";

    if (this.spinner) {
      // Clear spinner and show final output
      this.spinner.stop();

      // Print completed steps if persisted
      if (this.options.persistSteps && this.completedLines.length > 0) {
        for (const line of this.completedLines) {
          console.log(line);
        }
      }

      // Final success message
      const finalMessage = message || `${this.title} complete`;
      console.log(`✓ ${finalMessage}${timeStr}`);
    }
  }

  /**
   * Complete the progress with failure
   */
  fail(message?: string): void {
    if (this.spinner) {
      this.spinner.fail(message || `${this.title} failed`);
    }
  }

  /**
   * Render the current progress state
   */
  private render(): void {
    if (!this.spinner) return;

    const lines: string[] = [this.title];

    for (let i = 0; i < this.stepOrder.length; i++) {
      const id = this.stepOrder[i];
      const step = this.steps.get(id);
      if (!step) continue;

      const isLast = i === this.stepOrder.length - 1;
      lines.push(this.formatStepLine(step, isLast));
    }

    this.spinner.text = lines.join("\n");
  }

  /**
   * Format a single step line
   */
  private formatStepLine(step: NestedStep, isLast: boolean): string {
    const prefix = isLast ? "  └─" : "  ├─";
    const icon = this.getStepIcon(step.status);
    const countStr = step.count ? ` (${step.count.current}/${step.count.total})` : "";
    const detailStr = step.detail ? ` - ${step.detail}` : "";

    return `${prefix} ${icon} ${step.label}${countStr}${detailStr}`;
  }

  /**
   * Get icon for step status
   */
  private getStepIcon(status: NestedStep["status"]): string {
    switch (status) {
      case "success":
        return "✓";
      case "error":
        return "✗";
      case "warning":
        return "⚠";
      case "skipped":
        return "○";
      case "running":
        return "◌";
      case "pending":
      default:
        return "·";
    }
  }
}

// ============================================================================
// Installation Progress (Preset-specific)
// ============================================================================

export interface InstallStep {
  id: string;
  label: string;
  run: () => Promise<void>;
  skip?: () => boolean | Promise<boolean>;
}

/**
 * Run installation steps with nested progress display
 */
export async function runInstallSteps(
  title: string,
  steps: InstallStep[],
  options?: NestedProgressOptions
): Promise<{ succeeded: number; failed: number; skipped: number }> {
  const progress = new NestedProgress(title, { showTime: true, ...options });
  progress.start();

  const results = { succeeded: 0, failed: 0, skipped: 0 };

  // Add all steps first
  for (const step of steps) {
    progress.addStep(step.id, step.label);
  }

  // Run each step
  for (const step of steps) {
    // Check skip condition
    if (step.skip) {
      const shouldSkip = await step.skip();
      if (shouldSkip) {
        progress.skipStep(step.id, "skipped");
        results.skipped++;
        continue;
      }
    }

    progress.runStep(step.id);

    try {
      await step.run();
      progress.succeedStep(step.id);
      results.succeeded++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      progress.failStep(step.id, message);
      results.failed++;
      progress.fail();
      throw error;
    }
  }

  progress.succeed();
  return results;
}
