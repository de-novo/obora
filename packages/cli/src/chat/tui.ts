import type { ChatSessionState } from "./types.js";
import { visibleChatMessages } from "./state.js";
import type { DifferentialTuiRenderer } from "../tui/pi-tui-renderer.js";
import { createDifferentialTuiRenderer } from "../tui/pi-tui-renderer.js";

const roleLabel = (role: string): string =>
  role === "user" ? "you" : role === "assistant" ? "obora" : "system";

const formatWorkflow = (state: ChatSessionState): string =>
  state.workflowLocator
    ? `${state.workflowLocator.name} (${state.workflowLocator.scope})`
    : state.workflowTarget
      ? `${state.workflowTarget} (unresolved)`
      : "none";

const formatMessage = (message: { readonly role: string; readonly content: string }): string =>
  `${roleLabel(message.role)}: ${message.content}`;

export class ChatTuiController {
  private state: ChatSessionState;
  private renderer: DifferentialTuiRenderer | null = null;
  private sigintHandler?: () => void;
  private aborted = false;

  constructor(initialState: ChatSessionState) {
    this.state = initialState;
  }

  async start(): Promise<void> {
    this.sigintHandler = () => {
      this.aborted = true;
      this.render({ ...this.state, status: "failed", lastError: "Interrupted by user." });
    };
    process.on("SIGINT", this.sigintHandler);
    this.renderer = await createDifferentialTuiRenderer(this.renderLines(this.state));
    this.render(this.state);
    await this.renderer.flush();
  }

  update(state: ChatSessionState): void {
    this.state = state;
    this.render(state);
  }

  snapshot(): ChatSessionState {
    return this.state;
  }

  isAbortRequested(): boolean {
    return this.aborted;
  }

  async stop(): Promise<void> {
    if (this.sigintHandler) {
      process.off("SIGINT", this.sigintHandler);
      this.sigintHandler = undefined;
    }
    this.render(this.state);
    await this.renderer?.stop();
    this.renderer = null;
  }

  private renderLines(state: ChatSessionState): ReadonlyArray<string> {
    return [
      "obora chat",
      `session: ${state.sessionId} | status: ${state.status} | mode: ${state.dryRun ? "dry-run" : "live"}`,
      `workflow: ${formatWorkflow(state)}`,
      `cwd: ${state.cwd}`,
      state.lastRunCommand ? `last run: ${state.lastRunCommand}` : "",
      state.lastError ? `error: ${state.lastError}` : "",
      `renderer: ${this.renderer?.modeLabel ?? "initializing"}`,
      "--- messages ---",
      ...visibleChatMessages(state).map(formatMessage),
      "--- input ---",
      "type a task, /workflow <name>, /help, or /exit",
    ].filter(Boolean);
  }

  private render(state: ChatSessionState): void {
    if (!process.stdout.isTTY) return;

    this.renderer?.update(this.renderLines(state));
  }
}
