import { describe, expect, it } from "vitest";

import { createCLI } from "../../cli.js";
import { getGlobalOpts } from "../global-opts.js";

describe("getGlobalOpts", () => {
  it("reads global flags from root command", async () => {
    const cli = createCLI();

    await cli.parseAsync(["--json", "--quiet", "plugin", "list"], { from: "user" });

    const plugin = cli.commands.find((command) => command.name() === "plugin");
    expect(plugin).toBeDefined();

    const globalOpts = getGlobalOpts(plugin!);
    expect(globalOpts.json).toBe(true);
    expect(globalOpts.quiet).toBe(true);
  });
});
