import type { Terminal } from "@earendil-works/pi-tui";

export interface DifferentialTuiRenderer {
  readonly modeLabel: string;
  readonly active: boolean;
  update(lines: ReadonlyArray<string>): void;
  flush(): Promise<void>;
  stop(): Promise<void>;
}

interface PiTuiModule {
  readonly TUI: new (
    terminal: Terminal,
    showHardwareCursor?: boolean
  ) => {
    addChild(component: { render(width: number): string[]; invalidate(): void }): void;
    requestRender(force?: boolean): void;
    start(): void;
    stop(): void;
  };
  readonly Text: new (
    text?: string,
    paddingX?: number,
    paddingY?: number,
    customBgFn?: (text: string) => string
  ) => {
    setText(text: string): void;
    render(width: number): string[];
    invalidate(): void;
  };
}

export class StdoutTerminal implements Terminal {
  private resizeHandler?: () => void;

  get columns(): number {
    return process.stdout.columns && process.stdout.columns > 0 ? process.stdout.columns : 100;
  }

  get rows(): number {
    return process.stdout.rows && process.stdout.rows > 0 ? process.stdout.rows : 30;
  }

  get kittyProtocolActive(): boolean {
    return false;
  }

  start(_onInput: (data: string) => void, onResize: () => void): void {
    this.resizeHandler = onResize;
    process.stdout.on("resize", onResize);
    this.hideCursor();
  }

  stop(): void {
    if (this.resizeHandler) {
      process.stdout.off("resize", this.resizeHandler);
      this.resizeHandler = undefined;
    }
    this.showCursor();
  }

  drainInput(): Promise<void> {
    return Promise.resolve();
  }

  write(data: string): void {
    process.stdout.write(data);
  }

  moveBy(lines: number): void {
    if (lines === 0) return;
    process.stdout.write(lines > 0 ? `\x1b[${lines}B` : `\x1b[${Math.abs(lines)}A`);
  }

  hideCursor(): void {
    process.stdout.write("\x1b[?25l");
  }

  showCursor(): void {
    process.stdout.write("\x1b[?25h");
  }

  clearLine(): void {
    process.stdout.write("\x1b[2K");
  }

  clearFromCursor(): void {
    process.stdout.write("\x1b[J");
  }

  clearScreen(): void {
    process.stdout.write("\x1b[2J\x1b[H");
  }

  setTitle(title: string): void {
    process.stdout.write(`\x1b]0;${title}\x07`);
  }

  setProgress(_active: boolean): void {
    return undefined;
  }
}

class PiTuiRenderer implements DifferentialTuiRenderer {
  readonly modeLabel = "@earendil-works/pi-tui differential rendering";
  readonly active = true;
  private readonly text: InstanceType<PiTuiModule["Text"]>;
  private readonly tui: InstanceType<PiTuiModule["TUI"]>;

  constructor(module: PiTuiModule, lines: ReadonlyArray<string>) {
    const terminal = new StdoutTerminal();
    this.text = new module.Text(lines.join("\n"), 0, 0);
    this.tui = new module.TUI(terminal, false);
    this.tui.addChild(this.text);
    this.tui.start();
    this.tui.requestRender(true);
  }

  update(lines: ReadonlyArray<string>): void {
    this.text.setText(lines.join("\n"));
    this.tui.requestRender();
  }

  flush(): Promise<void> {
    this.tui.requestRender(true);
    return new Promise((resolve) => process.nextTick(resolve));
  }

  async stop(): Promise<void> {
    await this.flush();
    this.tui.stop();
  }
}

export class PlainTextTuiRenderer implements DifferentialTuiRenderer {
  readonly modeLabel = "plain text fallback";
  readonly active = false;

  update(lines: ReadonlyArray<string>): void {
    process.stdout.write("\x1Bc");
    process.stdout.write(lines.join("\n") + "\n");
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }

  stop(): Promise<void> {
    return Promise.resolve();
  }
}

export const createDifferentialTuiRenderer = async (
  lines: ReadonlyArray<string>
): Promise<DifferentialTuiRenderer> => {
  if (!process.stdout.isTTY) {
    return new PlainTextTuiRenderer();
  }

  return import("@earendil-works/pi-tui")
    .then((module) => new PiTuiRenderer(module as PiTuiModule, lines))
    .catch(() => new PlainTextTuiRenderer());
};
