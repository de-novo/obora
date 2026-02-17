import { describe, expect, it, vi } from "vitest";

import { createCLI } from "../../cli.js";

describe("M3 CLI command IA", () => {
  it("creates CLI without errors", () => {
    const cli = createCLI();
    expect(cli).toBeDefined();
  });

  it("registers top-level commands", () => {
    const cli = createCLI();
    const names = cli.commands.map((command) => command.name());

    expect(names).toEqual(expect.arrayContaining(["run", "test", "plugin", "audit", "policy", "init"]));
  });

  it("parses run command arguments", async () => {
    const cli = createCLI();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    await cli.parseAsync(["run", "my-workflow.yaml", "--dry-run", "--timeout", "5000"], {
      from: "user",
    });

    const run = cli.commands.find((command) => command.name() === "run");
    expect(run).toBeDefined();
    expect(run?.processedArgs).toEqual(["my-workflow.yaml"]);
    expect(run?.opts()).toMatchObject({ dryRun: true, timeout: 5000 });

    exitSpy.mockRestore();
  });

  it("has plugin subcommands", () => {
    const cli = createCLI();
    const plugin = cli.commands.find((command) => command.name() === "plugin");
    const names = plugin?.commands.map((command) => command.name()) ?? [];

    expect(names).toEqual(expect.arrayContaining(["list", "install", "remove", "inspect"]));
  });

  it("has audit subcommands", () => {
    const cli = createCLI();
    const audit = cli.commands.find((command) => command.name() === "audit");
    const names = audit?.commands.map((command) => command.name()) ?? [];

    expect(names).toEqual(expect.arrayContaining(["query", "tail", "replay"]));
  });
});
