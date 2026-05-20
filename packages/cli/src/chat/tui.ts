import type { ChatSessionState } from "./types.js";
import { renderChatView } from "./view.js";
import type { DifferentialTuiRenderer } from "../tui/pi-tui-renderer.js";
import { createDifferentialTuiRenderer } from "../tui/pi-tui-renderer.js";

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
    return renderChatView(state, {
      columns: process.stdout.columns,
      rendererLabel: this.renderer?.modeLabel,
    });
  }

  private render(state: ChatSessionState): void {
    if (!process.stdout.isTTY) return;

    this.renderer?.update(this.renderLines(state));
  }
}
