import { afterEach, describe, expect, it, vi } from "vitest";

import { formatter } from "../formatter.js";

const originalEnv = { ...process.env };
const originalStdoutIsTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
const originalStderrIsTTY = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");

function restoreIsTTYDescriptor(
  stream: NodeJS.WriteStream,
  descriptor: PropertyDescriptor | undefined
): void {
  const mutableStream = stream as NodeJS.WriteStream & { isTTY?: boolean };
  if (descriptor) {
    Object.defineProperty(mutableStream, "isTTY", descriptor);
    return;
  }
  delete mutableStream.isTTY;
}

afterEach(() => {
  process.env = { ...originalEnv };
  restoreIsTTYDescriptor(process.stdout, originalStdoutIsTTY);
  restoreIsTTYDescriptor(process.stderr, originalStderrIsTTY);
  formatter.setColorEnabled(false);
  vi.restoreAllMocks();
});

describe("formatter", () => {
  it("colorizes command messages when color output is enabled", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    formatter.setColorEnabled(true);
    formatter.success("done");
    formatter.info("heads up");
    formatter.warn("check this");
    formatter.error("failed");
    formatter.step("build");

    expect(log.mock.calls[0]?.[0]).toContain("\u001b[32m");
    expect(log.mock.calls[1]?.[0]).toContain("\u001b[34m");
    expect(log.mock.calls[2]?.[0]).toContain("\u001b[2m");
    expect(error.mock.calls[0]?.[0]).toContain("\u001b[33m");
    expect(error.mock.calls[1]?.[0]).toContain("\u001b[31m");
  });

  it("prints JSON and non-empty tables while ignoring empty table rows", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const table = vi.spyOn(console, "table").mockImplementation(() => undefined);

    formatter.json({ ok: true });
    formatter.table([]);
    formatter.table([{ name: "release", status: "ok" }]);

    expect(log).toHaveBeenCalledWith('{\n  "ok": true\n}');
    expect(table).toHaveBeenCalledTimes(1);
    expect(table).toHaveBeenCalledWith([{ name: "release", status: "ok" }]);
  });

  it("initializes color output as disabled when NO_COLOR is set", async () => {
    vi.resetModules();
    process.env = { ...originalEnv, NO_COLOR: "1" };
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { formatter: freshFormatter } = await import("../formatter.js");

    freshFormatter.success("done");

    expect(log).toHaveBeenCalledWith("✅ done");
  });

  it("initializes color output as disabled in test environments", async () => {
    vi.resetModules();
    const { NO_COLOR: _noColor, VITEST: _vitest, ...envWithoutTestFlags } = originalEnv;
    process.env = { ...envWithoutTestFlags, NODE_ENV: "test" };
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { formatter: freshFormatter } = await import("../formatter.js");

    freshFormatter.info("heads up");

    expect(log).toHaveBeenCalledWith("ℹ heads up");
  });

  it("initializes color output from TTY state outside test environments", async () => {
    vi.resetModules();
    const { NO_COLOR: _noColor, VITEST: _vitest, NODE_ENV: _nodeEnv, ...envWithoutTestFlags } = originalEnv;
    process.env = envWithoutTestFlags;
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    Object.defineProperty(process.stderr, "isTTY", { configurable: true, value: true });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { formatter: freshFormatter } = await import("../formatter.js");

    freshFormatter.step("build");

    expect(log.mock.calls[0]?.[0]).toContain("\u001b[2m");
  });
});
