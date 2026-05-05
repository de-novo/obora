import { afterEach, describe, expect, it, vi } from "vitest";

import { formatter } from "../formatter.js";

afterEach(() => {
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
});
