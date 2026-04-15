/* eslint-disable import/order */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authState } = vi.hoisted(() => ({
  authState: {
    providers: new Map<string, Record<string, unknown>>(),
    addProvider: vi.fn(),
    getProvider: vi.fn(),
    listProviders: vi.fn(),
    removeProvider: vi.fn(),
    testConnection: vi.fn(),
  },
}));

vi.mock("@obora/adapters", () => ({
  FileAuthManager: class FileAuthManager {
    addProvider = authState.addProvider;
    getProvider = authState.getProvider;
    listProviders = authState.listProviders;
    removeProvider = authState.removeProvider;
    testConnection = authState.testConnection;
  },
  getDefaultAuthFilePath: () => "/tmp/obora/auth.json",
  maskProviderAuth: (auth: Record<string, unknown>) => ({
    ...auth,
    apiKey: auth.apiKey ? "sk-ope...1234" : undefined,
    token: auth.token ? "tok_12...5678" : undefined,
    accessToken: auth.accessToken ? "acc_12...5678" : undefined,
    refreshToken: auth.refreshToken ? "ref_12...5678" : undefined,
  }),
}));

vi.mock("@obora/sdk", () => ({
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
import { createAuthCommand } from "../auth.js";

describe("auth command", () => {
  beforeEach(() => {
    authState.providers.clear();
    authState.addProvider.mockReset();
    authState.getProvider.mockReset();
    authState.listProviders.mockReset();
    authState.removeProvider.mockReset();
    authState.testConnection.mockReset();

    authState.addProvider.mockImplementation(
      async (provider: string, auth: Record<string, unknown>) => {
        authState.providers.set(provider, auth);
      }
    );
    authState.getProvider.mockImplementation(async (provider: string) =>
      authState.providers.get(provider)
    );
    authState.listProviders.mockImplementation(async () =>
      Array.from(authState.providers.values())
    );
    authState.removeProvider.mockImplementation(async (provider: string) => {
      authState.providers.delete(provider);
    });
    authState.testConnection.mockResolvedValue(true);

    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code ?? "undefined"}`);
    }) as never);
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("creates auth command with modern subcommands", () => {
    const cmd = createAuthCommand();

    expect(cmd.name()).toBe("auth");
    expect(cmd.commands.map((command) => command.name())).toEqual(
      expect.arrayContaining(["add", "list", "remove", "test"])
    );
  });

  it("supports local --json for auth add", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createAuthCommand();

    await cmd.parseAsync(["add", "openai", "--apiKey", "sk-openai-1234", "--json"], {
      from: "user",
    });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual(
      expect.objectContaining({
        command: "auth add",
        provider: "openai",
        saved: true,
        storePath: "/tmp/obora/auth.json",
        auth: expect.objectContaining({
          provider: "openai",
          type: "apiKey",
          apiKey: "sk-ope...1234",
        }),
      })
    );
    expect(authState.addProvider).toHaveBeenCalledWith(
      "openai",
      expect.objectContaining({ provider: "openai", type: "apiKey", apiKey: "sk-openai-1234" })
    );
  });

  it("inherits root --json for auth list", async () => {
    authState.providers.set("anthropic", {
      provider: "anthropic",
      type: "token",
      token: "sk-ant-oat-abc123",
      addedAt: "2026-04-15T00:00:00.000Z",
      updatedAt: "2026-04-15T00:00:00.000Z",
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = new Command("obora").option("--json");
    root.addCommand(createAuthCommand());

    await root.parseAsync(["--json", "auth", "list"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual({
      command: "auth list",
      storePath: "/tmp/obora/auth.json",
      providers: [
        {
          provider: "anthropic",
          type: "token",
          token: "tok_12...5678",
          addedAt: "2026-04-15T00:00:00.000Z",
          updatedAt: "2026-04-15T00:00:00.000Z",
        },
      ],
    });
  });

  it("uses validation exit code for invalid auth type without doctor hint leak", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createAuthCommand();

    await cmd.parseAsync(["add", "openai", "--type", "session"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(error).toHaveBeenCalled();
    expect(log.mock.calls.map((args) => args.join(" ")).join("\n")).not.toContain("obora doctor");
  });

  it("uses validation exit code for missing provider auth on remove", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createAuthCommand();

    await cmd.parseAsync(["remove", "missing-provider"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(error).toHaveBeenCalled();
  });

  it("uses execution-failed exit code for auth test failures", async () => {
    authState.providers.set("openai", {
      provider: "openai",
      type: "apiKey",
      apiKey: "sk-openai-1234",
      addedAt: "2026-04-15T00:00:00.000Z",
      updatedAt: "2026-04-15T00:00:00.000Z",
    });
    authState.testConnection.mockResolvedValue(false);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createAuthCommand();

    await cmd.parseAsync(["test", "openai"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.EXECUTION_FAILED);
    expect(error).toHaveBeenCalled();
  });

  it("uses execution-failed exit code for auth store load errors", async () => {
    authState.listProviders.mockRejectedValue(new Error("EACCES: auth store unavailable"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createAuthCommand();

    await cmd.parseAsync(["list"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.EXECUTION_FAILED);
    expect(error).toHaveBeenCalled();
  });
});
