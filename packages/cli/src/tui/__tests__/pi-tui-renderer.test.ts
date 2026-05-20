import { afterEach, describe, expect, it, vi } from "vitest";

import { createDifferentialTuiRenderer, StdoutTerminal } from "../pi-tui-renderer.js";

const originalStdoutIsTTY = process.stdout.isTTY;

const setStdoutTTY = (value: boolean): void => {
  Object.defineProperty(process.stdout, "isTTY", {
    configurable: true,
    value,
  });
};

describe("createDifferentialTuiRenderer", () => {
  afterEach(() => {
    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: originalStdoutIsTTY,
    });
    vi.restoreAllMocks();
  });

  it("uses the plain text fallback outside TTY sessions", async () => {
    setStdoutTTY(false);
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const renderer = await createDifferentialTuiRenderer(["initial"]);
    renderer.update(["line one", "line two"]);
    await renderer.flush();
    await renderer.stop();

    const output = write.mock.calls.map((call) => String(call[0])).join("");
    expect(renderer.active).toBe(false);
    expect(renderer.modeLabel).toBe("plain text fallback");
    expect(output).toContain("line one\nline two");
  });

  it("writes terminal control sequences through the stdout adapter", () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const terminal = new StdoutTerminal();

    terminal.start(
      () => undefined,
      () => undefined
    );
    terminal.moveBy(2);
    terminal.moveBy(-1);
    terminal.moveBy(0);
    terminal.clearLine();
    terminal.clearFromCursor();
    terminal.clearScreen();
    terminal.setTitle("Obora");
    terminal.setProgress(true);
    terminal.stop();

    const output = write.mock.calls.map((call) => String(call[0])).join("");
    expect(terminal.columns).toBeGreaterThan(0);
    expect(terminal.rows).toBeGreaterThan(0);
    expect(terminal.kittyProtocolActive).toBe(false);
    expect(output).toContain("\x1b[?25l");
    expect(output).toContain("\x1b[2B");
    expect(output).toContain("\x1b[1A");
    expect(output).toContain("\x1b[2K");
    expect(output).toContain("\x1b[J");
    expect(output).toContain("\x1b[2J\x1b[H");
    expect(output).toContain("\x1b]0;Obora\x07");
    expect(output).toContain("\x1b[?25h");
  });
});
