export type TuiAction = "retry" | "skip" | "abort";

export interface RunTuiSnapshot {
  featureName: string;
  workflowName: string;
  stepName?: string;
  stepIndex: number;
  totalSteps: number;
  agentName?: string;
  modelName?: string;
  thinkingLevel?: string;
  streamedMarkdown: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  status: "idle" | "running" | "completed" | "failed" | "aborted";
  elapsedMs: number;
  lastError?: string;
}

export type RunTuiEvent =
  | { type: "workflow-start"; featureName: string; workflowName: string; totalSteps: number }
  | {
      type: "step-start";
      stepName: string;
      stepIndex: number;
      totalSteps: number;
      agentName: string;
      modelName?: string;
      thinkingLevel?: string;
    }
  | { type: "stream"; chunk: string }
  | { type: "usage"; promptTokens?: number; completionTokens?: number; totalTokens?: number }
  | { type: "step-complete"; stepName: string }
  | { type: "step-failed"; stepName: string; error: string }
  | { type: "workflow-complete"; failedSteps: number }
  | { type: "workflow-abort"; reason: string };

interface PiTuiModule {
  TUI?: unknown;
  Text?: unknown;
  Loader?: unknown;
}

function toPercent(current: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((current / total) * 100)));
}

export class RunTuiController {
  private readonly startedAt = Date.now();
  private readonly state: RunTuiSnapshot;
  private piTui: PiTuiModule | null = null;
  private sigintHandler?: () => void;
  private aborted = false;

  constructor(featureName: string, workflowName: string, totalSteps: number) {
    this.state = {
      featureName,
      workflowName,
      stepIndex: 0,
      totalSteps,
      streamedMarkdown: "",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      status: "idle",
      elapsedMs: 0,
    };
  }

  async start(): Promise<void> {
    try {
      this.piTui = (await import("@mariozechner/pi-tui")) as PiTuiModule;
    } catch {
      this.piTui = null;
    }

    this.sigintHandler = () => {
      this.aborted = true;
      this.state.status = "aborted";
      this.render();
    };
    process.on("SIGINT", this.sigintHandler);

    this.state.status = "running";
    this.render();
  }

  isAbortRequested(): boolean {
    return this.aborted;
  }

  renderEvent(event: RunTuiEvent): void {
    this.state.elapsedMs = Date.now() - this.startedAt;

    if (event.type === "workflow-start") {
      this.state.featureName = event.featureName;
      this.state.workflowName = event.workflowName;
      this.state.totalSteps = event.totalSteps;
      this.state.status = "running";
    } else if (event.type === "step-start") {
      this.state.stepName = event.stepName;
      this.state.stepIndex = event.stepIndex + 1;
      this.state.totalSteps = event.totalSteps;
      this.state.agentName = event.agentName;
      this.state.modelName = event.modelName;
      this.state.thinkingLevel = event.thinkingLevel;
      this.state.streamedMarkdown = "";
      this.state.lastError = undefined;
    } else if (event.type === "stream") {
      this.state.streamedMarkdown += event.chunk;
    } else if (event.type === "usage") {
      this.state.promptTokens += event.promptTokens ?? 0;
      this.state.completionTokens += event.completionTokens ?? 0;
      this.state.totalTokens += event.totalTokens ?? 0;
    } else if (event.type === "step-failed") {
      this.state.status = "failed";
      this.state.lastError = event.error;
    } else if (event.type === "step-complete") {
      this.state.status = "running";
    } else if (event.type === "workflow-complete") {
      this.state.status = event.failedSteps === 0 ? "completed" : "failed";
    } else if (event.type === "workflow-abort") {
      this.state.status = "aborted";
      this.state.lastError = event.reason;
    }

    this.render();
  }

  snapshot(): RunTuiSnapshot {
    return { ...this.state };
  }

  async stop(): Promise<void> {
    this.state.elapsedMs = Date.now() - this.startedAt;
    this.render();
    if (this.sigintHandler) {
      process.off("SIGINT", this.sigintHandler);
      this.sigintHandler = undefined;
    }
  }

  private render(): void {
    if (!process.stdout.isTTY) return;

    const elapsedSec = (this.state.elapsedMs / 1000).toFixed(1);
    const percent = toPercent(this.state.stepIndex, this.state.totalSteps);
    const lines = [
      `obora run dashboard`,
      `feature: ${this.state.featureName} | workflow: ${this.state.workflowName}`,
      `status: ${this.state.status} | step: ${this.state.stepIndex}/${this.state.totalSteps} (${percent}%)`,
      `agent: ${this.state.agentName ?? "-"} | model: ${this.state.modelName ?? "-"} | thinking: ${this.state.thinkingLevel ?? "-"}`,
      `tokens: prompt=${this.state.promptTokens} completion=${this.state.completionTokens} total=${this.state.totalTokens} | elapsed=${elapsedSec}s`,
      `--- streaming markdown ---`,
      this.state.streamedMarkdown || "(waiting for stream)",
      this.state.lastError ? `error: ${this.state.lastError}` : "",
      this.piTui ? "pi-tui: active" : "pi-tui: fallback text mode",
      `ctrl+c: abort`,
    ].filter(Boolean);

    process.stdout.write("\x1Bc");
    process.stdout.write(lines.join("\n") + "\n");
  }
}
