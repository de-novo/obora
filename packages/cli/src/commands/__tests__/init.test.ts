/* eslint-disable import/order */
/**
 * init command tests
 *
 * Rewritten to match current implementation:
 * - Uses node:fs/promises (access, copyFile, cp, mkdir, readFile, writeFile)
 * - Template-based project scaffolding (--template option)
 * - No longer uses @obora/database, fs-extra, or @obora/runtime
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock node:fs/promises (used in init.ts)
vi.mock("node:fs/promises", () => ({
  access: vi.fn(),
  copyFile: vi.fn(),
  cp: vi.fn(),
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

// Mock formatter
vi.mock("../../utils/formatter.js", () => ({
  formatter: {
    success: vi.fn(),
    json: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    step: vi.fn(),
  },
}));

// Mock error-handler to pass through the action fn directly
vi.mock("../../utils/error-handler.js", () => ({
  handleCommandAction: vi.fn(async (fn: () => Promise<void>) => {
    await fn();
  }),
}));

// Mock global-opts
vi.mock("../../utils/global-opts.js", () => ({
  getGlobalOpts: vi.fn(() => ({})),
}));

import { access, copyFile, cp, mkdir, readFile, writeFile } from "node:fs/promises";

import { formatter } from "../../utils/formatter.js";
import { createInitCommand, runInit } from "../init.js";

describe("init command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(cp).mockResolvedValue(undefined);
    vi.mocked(copyFile).mockResolvedValue(undefined);
    // Default: target files do not exist → access rejects → copyFile is attempted
    vi.mocked(access).mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    // Default: no config file → readFile rejects → config normalization skipped
    vi.mocked(readFile).mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    vi.mocked(writeFile).mockResolvedValue(undefined);
  });

  // ─── command creation ──────────────────────────────────────────────────────

  describe("command creation", () => {
    it("should create init command with correct name", () => {
      const cmd = createInitCommand();
      expect(cmd.name()).toBe("init");
    });

    it("should have a description mentioning initialization", () => {
      const cmd = createInitCommand();
      expect(cmd.description().toLowerCase()).toMatch(/init/);
    });

    it("should accept optional project-name argument", () => {
      const cmd = createInitCommand();
      expect(cmd.registeredArguments.length).toBeGreaterThanOrEqual(1);
      expect(cmd.registeredArguments[0].name()).toBe("project-name");
    });

    it("should have --template option", () => {
      const cmd = createInitCommand();
      const opt = cmd.options.find((o) => o.long === "--template");
      expect(opt).toBeDefined();
    });

    it("should have --yes / -y option", () => {
      const cmd = createInitCommand();
      const opt = cmd.options.find((o) => o.long === "--yes");
      expect(opt).toBeDefined();
    });

    it("should have --quickstart option", () => {
      const cmd = createInitCommand();
      const opt = cmd.options.find((o) => o.long === "--quickstart");
      expect(opt).toBeDefined();
    });
  });

  // ─── project initialization ────────────────────────────────────────────────

  describe("project initialization", () => {
    it("should call mkdir for the target directory", async () => {
      await runInit("my-project", {});

      expect(mkdir).toHaveBeenCalledWith(
        expect.stringContaining("my-project"),
        expect.objectContaining({ recursive: true })
      );
    });

    it("should copy the template into the target directory", async () => {
      await runInit("my-project", {});

      expect(cp).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("my-project"),
        expect.objectContaining({ recursive: true })
      );
    });

    it("should create workflows, policies, and tests sub-directories", async () => {
      await runInit("my-project", {});

      const mkdirPaths = vi.mocked(mkdir).mock.calls.map((c) => String(c[0]));
      expect(mkdirPaths.some((p) => p.includes("workflows"))).toBe(true);
      expect(mkdirPaths.some((p) => p.includes("policies"))).toBe(true);
      expect(mkdirPaths.some((p) => p.includes("tests"))).toBe(true);
    });

    it("should use the 'default' template when no --template is given", async () => {
      await runInit("my-project", {});

      expect(cp).toHaveBeenCalledWith(
        expect.stringContaining("default"),
        expect.any(String),
        expect.any(Object)
      );
    });

    it("should use a custom template when --template is specified", async () => {
      await runInit("my-project", { template: "advanced" });

      expect(cp).toHaveBeenCalledWith(
        expect.stringContaining("advanced"),
        expect.any(String),
        expect.any(Object)
      );
    });

    it("should use quickstart template when --quickstart is specified", async () => {
      await runInit("my-project", { quickstart: true });

      expect(cp).toHaveBeenCalledWith(
        expect.stringContaining("quickstart"),
        expect.any(String),
        expect.any(Object)
      );
    });

    it("should show a success message by default", async () => {
      await runInit("my-project", {});

      expect(formatter.success).toHaveBeenCalledWith(expect.stringContaining("initialized"));
    });


    it("should print provider-aware next-step guidance for quickstart projects", async () => {
      vi.mocked(readFile).mockImplementation(async (pathLike) => {
        const path = String(pathLike);
        if (path.includes('.obora/config.yaml')) {
          return `defaults:
  provider: anthropic
`;
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      await runInit("my-project", { quickstart: true });

      expect(formatter.info).toHaveBeenCalledWith("Next steps:");
      expect(formatter.step).toHaveBeenCalledWith("cd my-project");
      expect(formatter.step).toHaveBeenCalledWith("This template defaults to anthropic");
      expect(formatter.step).toHaveBeenCalledWith("export ANTHROPIC_API_KEY=***");
      expect(formatter.step).toHaveBeenCalledWith("obora doctor");
      expect(formatter.step).toHaveBeenCalledWith("obora run judge.yaml --dry-run");
      expect(formatter.step).toHaveBeenCalledWith("obora run judge.yaml");
    });

    it("should output JSON when --json flag is set", async () => {
      await runInit("my-project", { json: true });

      expect(formatter.json).toHaveBeenCalledWith(expect.objectContaining({ initialized: true }));
      expect(formatter.success).not.toHaveBeenCalled();
    });

    it("should not show success message in --quiet mode", async () => {
      await runInit("my-project", { quiet: true });

      expect(formatter.success).not.toHaveBeenCalled();
    });

    it("should default to current directory when no project name is given", async () => {
      await runInit({});

      // mkdir should be called with the resolved cwd-based path
      expect(mkdir).toHaveBeenCalledWith(
        expect.stringContaining(process.cwd()),
        expect.objectContaining({ recursive: true })
      );
    });

    it("should include the target path in JSON output", async () => {
      await runInit("my-project", { json: true });

      expect(formatter.json).toHaveBeenCalledWith(
        expect.objectContaining({ path: expect.stringContaining("my-project") })
      );
    });

    it("should report quickstart template in JSON output", async () => {
      await runInit("my-project", { json: true, quickstart: true });

      expect(formatter.json).toHaveBeenCalledWith(
        expect.objectContaining({ template: "quickstart" })
      );
    });
  });

  // ─── workflow / policy YAML copy ──────────────────────────────────────────

  describe("workflow YAML copy (best-effort)", () => {
    it("should copy workflow.yaml → workflows/example.yaml when the target does not exist", async () => {
      vi.mocked(access).mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

      await runInit("my-project", {});

      const copies = vi.mocked(copyFile).mock.calls;
      const workflowCopy = copies.find(
        (c) => String(c[1]).includes("workflows") && String(c[1]).includes("example.yaml")
      );
      expect(workflowCopy).toBeDefined();
    });

    it("should NOT overwrite workflows/example.yaml when it already exists", async () => {
      vi.mocked(access).mockResolvedValue(undefined); // file exists

      await runInit("my-project", {});

      const copies = vi.mocked(copyFile).mock.calls;
      const workflowCopy = copies.find(
        (c) => String(c[1]).includes("workflows") && String(c[1]).includes("example.yaml")
      );
      expect(workflowCopy).toBeUndefined();
    });
  });

  // ─── config normalization ──────────────────────────────────────────────────

  describe("obora.config.yaml normalization", () => {
    it("should normalize 'workflows: .' → 'workflows: ./workflows' in config", async () => {
      const rawConfig = "workflows: .\npolicies: .\n";
      vi.mocked(readFile).mockResolvedValue(rawConfig as unknown as string);

      await runInit("my-project", {});

      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining("obora.config.yaml"),
        expect.stringContaining("./workflows"),
        "utf-8"
      );
    });

    it("should normalize 'policies: .' → 'policies: ./policies' in config", async () => {
      const rawConfig = "workflows: .\npolicies: .\n";
      vi.mocked(readFile).mockResolvedValue(rawConfig as unknown as string);

      await runInit("my-project", {});

      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining("obora.config.yaml"),
        expect.stringContaining("./policies"),
        "utf-8"
      );
    });

    it("should NOT write config when no normalization is needed", async () => {
      const rawConfig = "workflows: ./workflows\npolicies: ./policies\n";
      vi.mocked(readFile).mockResolvedValue(rawConfig as unknown as string);

      await runInit("my-project", {});

      const configWrites = vi
        .mocked(writeFile)
        .mock.calls.filter((c) => String(c[0]).includes("obora.config.yaml"));
      expect(configWrites).toHaveLength(0);
    });

    it("should silently skip config normalization when config file does not exist", async () => {
      vi.mocked(readFile).mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

      await expect(runInit("my-project", {})).resolves.toBeUndefined();
    });
  });

  // ─── commander integration ─────────────────────────────────────────────────

  describe("commander integration", () => {
    it("should run init when parsed with a project name", async () => {
      const cmd = createInitCommand();
      cmd.exitOverride();

      await cmd.parseAsync(["test-project"], { from: "user" });

      expect(mkdir).toHaveBeenCalled();
      expect(cp).toHaveBeenCalled();
    });

    it("should use the specified --template", async () => {
      const cmd = createInitCommand();
      cmd.exitOverride();

      await cmd.parseAsync(["--template", "custom", "test-project"], { from: "user" });

      expect(cp).toHaveBeenCalledWith(
        expect.stringContaining("custom"),
        expect.any(String),
        expect.any(Object)
      );
    });

    it("should run without a project name (defaults to '.')", async () => {
      const cmd = createInitCommand();
      cmd.exitOverride();

      await cmd.parseAsync([], { from: "user" });

      expect(mkdir).toHaveBeenCalled();
    });
  });
});
