import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCLI } from "../../cli.js";
import { formatter } from "../formatter.js";
import { getGlobalOpts } from "../global-opts.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getGlobalOpts", () => {
  it("reads global flags from root command", async () => {
    const cli = createCLI();

    await cli.parseAsync(["--json", "--quiet", "--verbose", "--no-color", "plugin", "list"], {
      from: "user",
    });

    const plugin = cli.commands.find((command) => command.name() === "plugin");
    expect(plugin).toBeDefined();

    const globalOpts = getGlobalOpts(plugin!);
    expect(globalOpts.json).toBe(true);
    expect(globalOpts.quiet).toBe(true);
    expect(globalOpts.verbose).toBe(true);
    expect(globalOpts.noColor).toBe(true);
  });

  it("handles commands without parents and honors NO_COLOR", () => {
    vi.stubEnv("NO_COLOR", "1");
    const setColorEnabled = vi.spyOn(formatter, "setColorEnabled");
    const cmd = new Command("standalone");
    cmd.option("--json");
    cmd.parse(["node", "standalone", "--json"]);

    const opts = getGlobalOpts(cmd);

    expect(opts.json).toBe(true);
    expect(opts.noColor).toBe(true);
    expect(setColorEnabled).toHaveBeenCalledWith(false);
  });
});
