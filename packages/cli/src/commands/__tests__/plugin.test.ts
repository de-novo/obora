/* eslint-disable import/order */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pluginState, execFileMock } = vi.hoisted(() => ({
  pluginState: {
    scan: vi.fn(),
    loadAndRegister: vi.fn(),
  },
  execFileMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

vi.mock("@obora/sdk", () => ({
  PluginLoader: class PluginLoader {
    scan = pluginState.scan;
  },
  PluginManager: class PluginManager {
    loadAndRegister = pluginState.loadAndRegister;
  },
  OboraError: class OboraError extends Error {
    code: string;

    constructor(message: string, code = "TEST_ERROR") {
      super(message);
      this.code = code;
    }
  },
  OboraErrorCode: {
    POLICY_GATE_TIMEOUT: "POLICY_GATE_TIMEOUT",
    CELL_ABORTED: "CELL_ABORTED",
  },
}));

import { Command } from "commander";

import { ExitCode } from "../../utils/exit-codes.js";
import { createPluginCommand } from "../plugin.js";

describe("plugin command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pluginState.scan.mockResolvedValue([]);
    pluginState.loadAndRegister.mockResolvedValue({ module: {} });
    execFileMock.mockImplementation((_file, _args, _opts, callback) => {
      callback?.(null, "", "");
      return {} as never;
    });
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code ?? "undefined"}`);
    }) as never);
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("supports local --json for plugin list", async () => {
    pluginState.scan.mockResolvedValue([
      {
        packageName: "@example/obora-plugin-foo",
        packagePath: "/tmp/node_modules/@example/obora-plugin-foo",
        version: "1.2.3",
        metadata: {
          name: "foo",
          type: "adapter",
        },
      },
    ]);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createPluginCommand();

    await cmd.parseAsync(["list", "--json"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual({
      command: "plugin list",
      plugins: [
        {
          name: "foo",
          type: "adapter",
          version: "1.2.3",
          path: "/tmp/node_modules/@example/obora-plugin-foo",
        },
      ],
    });
  });

  it("inherits root --json for plugin inspect", async () => {
    pluginState.scan.mockResolvedValue([
      {
        packageName: "@example/obora-plugin-foo",
        packagePath: "/tmp/node_modules/@example/obora-plugin-foo",
        version: "1.2.3",
        metadata: {
          name: "foo",
          type: "adapter",
        },
      },
    ]);
    pluginState.loadAndRegister.mockResolvedValue({
      module: {
        activate() {
          return true;
        },
      },
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = new Command("obora").option("--json");
    root.addCommand(createPluginCommand());

    await root.parseAsync(["--json", "plugin", "inspect", "foo"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual({
      command: "plugin inspect",
      name: "foo",
      plugin: {
        packageName: "@example/obora-plugin-foo",
        version: "1.2.3",
        path: "/tmp/node_modules/@example/obora-plugin-foo",
        metadata: {
          name: "foo",
          type: "adapter",
        },
        exports: ["activate"],
      },
    });
  });

  it("supports local --json for plugin install", async () => {
    pluginState.scan.mockResolvedValue([
      {
        packageName: "@example/obora-plugin-foo",
        packagePath: "/tmp/node_modules/@example/obora-plugin-foo",
        version: "1.2.3",
        metadata: {
          name: "foo",
          type: "adapter",
        },
      },
    ]);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createPluginCommand();

    await cmd.parseAsync(["install", "@example/obora-plugin-foo", "--json"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual(
      expect.objectContaining({
        command: "plugin install",
        name: "@example/obora-plugin-foo",
        installed: true,
      })
    );
    expect(execFileMock).toHaveBeenCalled();
  });

  it("inherits root --json for plugin install", async () => {
    pluginState.scan.mockResolvedValue([
      {
        packageName: "@example/obora-plugin-foo",
        packagePath: "/tmp/node_modules/@example/obora-plugin-foo",
        version: "1.2.3",
        metadata: {
          name: "foo",
          type: "adapter",
        },
      },
    ]);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = new Command("obora").option("--json");
    root.addCommand(createPluginCommand());

    await root.parseAsync(["--json", "plugin", "install", "@example/obora-plugin-foo"], {
      from: "user",
    });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual(
      expect.objectContaining({
        command: "plugin install",
        name: "@example/obora-plugin-foo",
        installed: true,
      })
    );
    expect(execFileMock).toHaveBeenCalled();
  });

  it("supports local --json for plugin remove", async () => {
    pluginState.scan.mockResolvedValue([]);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createPluginCommand();

    await cmd.parseAsync(["remove", "@example/obora-plugin-foo", "--json"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual({
      command: "plugin remove",
      name: "@example/obora-plugin-foo",
      removed: true,
    });
    expect(execFileMock).toHaveBeenCalled();
  });

  it("inherits root --json for plugin remove", async () => {
    pluginState.scan.mockResolvedValue([]);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = new Command("obora").option("--json");
    root.addCommand(createPluginCommand());

    await root.parseAsync(["--json", "plugin", "remove", "@example/obora-plugin-foo"], {
      from: "user",
    });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual({
      command: "plugin remove",
      name: "@example/obora-plugin-foo",
      removed: true,
    });
    expect(execFileMock).toHaveBeenCalled();
  });

  it("uses validation exit code for missing plugins", async () => {
    pluginState.scan.mockResolvedValue([]);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createPluginCommand();

    await cmd.parseAsync(["inspect", "missing-plugin"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(error).toHaveBeenCalled();
    expect(log.mock.calls.map((args) => args.join(" ")).join("\n")).not.toContain(
      "obora run <workflow.yaml> --dry-run"
    );
  });

  it("uses execution-failed exit code for plugin inspect load errors", async () => {
    pluginState.scan.mockResolvedValue([
      {
        packageName: "@example/obora-plugin-foo",
        packagePath: "/tmp/node_modules/@example/obora-plugin-foo",
        version: "1.2.3",
        metadata: {
          name: "foo",
          type: "adapter",
        },
      },
    ]);
    pluginState.loadAndRegister.mockRejectedValue(new Error("loader crashed"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createPluginCommand();

    await cmd.parseAsync(["inspect", "foo"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.EXECUTION_FAILED);
    expect(error).toHaveBeenCalled();
  });
});
