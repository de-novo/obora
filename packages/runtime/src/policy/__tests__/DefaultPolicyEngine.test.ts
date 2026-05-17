import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { DefaultPolicyEngine, validatePolicyConditionsEffect } from "../DefaultPolicyEngine.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));

describe("DefaultPolicyEngine", () => {
  const fixturePath = path.resolve(testDir, "fixtures/test-policy.yaml");

  it("loads YAML policy successfully", async () => {
    const engine = new DefaultPolicyEngine();
    const loadedVersion = await engine.load(fixturePath);

    expect(engine.version()).toBe("1.0");
    expect(loadedVersion.source).toBe(fixturePath);
    expect(loadedVersion.hash).toHaveLength(64);
    expect(engine.currentVersion()).toEqual(loadedVersion);
    expect(engine.history()).toHaveLength(1);
  });

  it("exposes policy load, snapshot, and enforcement as Effect boundaries", async () => {
    const engine = new DefaultPolicyEngine();
    const loadedVersion = await Effect.runPromise(engine.loadEffect(fixturePath));

    const directDecision = Effect.runSync(
      engine.enforceEffect(
        {
          type: "tool_call",
          name: "shell_exec",
          params: { command: "sudo rm -rf /" },
        },
        {},
      ),
    );
    const snapshot = Effect.runSync(engine.snapshotEffect());
    const snapshotDecision = snapshot.enforce(
      {
        type: "resource_use",
        name: "budget",
      },
      {
        currentTokens: 100001,
      },
    );

    expect(loadedVersion.source).toBe(fixturePath);
    expect(directDecision).toMatchObject({ type: "deny", rule: "tools.shell_exec" });
    expect(snapshotDecision).toEqual({
      type: "deny",
      reason: "Token limit exceeded",
      rule: "resources.maxTokens",
    });
  });

  it("enforces tool/sandbox/resource/gate rules in order", async () => {
    const engine = new DefaultPolicyEngine();
    await engine.load(fixturePath);

    const toolDenied = engine.enforce(
      {
        type: "tool_call",
        name: "shell_exec",
        params: { command: "sudo rm -rf /" },
      },
      {},
    );

    const sandboxDenied = engine.enforce(
      {
        type: "file_access",
        name: "file_read",
        params: { path: "../secrets.txt" },
      },
      {},
    );

    const resourceDenied = engine.enforce(
      {
        type: "resource_use",
        name: "budget",
      },
      {
        currentTokens: 100001,
      },
    );

    const gateDecision = engine.enforce(
      {
        type: "step_start",
        name: "deploy",
      },
      {},
    );

    expect(toolDenied.type).toBe("deny");
    expect(sandboxDenied).toMatchObject({ type: "deny", rule: "sandbox.denyOutsideRoot" });
    expect(resourceDenied).toEqual({
      type: "deny",
      reason: "Token limit exceeded",
      rule: "resources.maxTokens",
    });
    expect(gateDecision).toEqual({
      type: "gate",
      gateType: "human-approval",
      config: {
        step: "deploy",
        timeout: "24h",
        fallback: "escalate",
      },
    });
  });

  it("supports transform and gate tool effects", () => {
    const engine = new DefaultPolicyEngine();
    engine.loadInline({
      tools: [
        { name: "file_write", effect: "transform", transform: { fn: "sanitizeWrite" } },
        { name: "release", effect: "gate", gate: { type: "consensus", timeout: "30m" } },
      ],
    });

    const transformed = engine.enforce({ type: "tool_call", name: "file_write", params: { content: "x" } }, {});
    const gated = engine.enforce({ type: "tool_call", name: "release", params: {} }, {});

    expect(transformed).toEqual({
      type: "transform",
      original: { content: "x" },
      transformed: {
        params: { content: "x" },
        transform: "sanitizeWrite",
      },
      rule: "tools.file_write",
      transformFn: "sanitizeWrite",
    });
    expect(gated).toEqual({
      type: "gate",
      gateType: "consensus",
      config: {
        tool: "release",
        timeout: "30m",
        rule: "tools.release",
      },
    });
  });

  it("exposes inline policy validation as an Effect boundary", () => {
    const invalidPolicyEffect = validatePolicyConditionsEffect({
      tools: [
        {
          name: "conditional",
          effect: "allow",
          when: { condition: "context.missing(" },
        },
      ],
    });

    expect(() => Effect.runSync(invalidPolicyEffect)).toThrow(
      "[POLICY_2007] Invalid tool condition at tools.conditional:",
    );
  });

  it("keeps snapshot isolation between running and newly created cells", () => {
    const engine = new DefaultPolicyEngine();
    engine.loadInline({
      version: "v1",
      tools: [{ name: "shell_exec", effect: "deny", when: { matches: ["rm -rf"] } }],
    });

    const runningCellSnapshot = engine.snapshot();

    engine.loadInline({
      version: "v2",
      tools: [{ name: "shell_exec", effect: "allow" }],
    });

    const newCellSnapshot = engine.snapshot();

    const runningDecision = runningCellSnapshot.enforce(
      { type: "tool_call", name: "shell_exec", params: { command: "rm -rf /tmp/a" } },
      {},
    );
    const newDecision = newCellSnapshot.enforce(
      { type: "tool_call", name: "shell_exec", params: { command: "rm -rf /tmp/a" } },
      {},
    );

    expect(runningCellSnapshot.version.version).toBe("v1");
    expect(newCellSnapshot.version.version).toBe("v2");
    expect(runningDecision.type).toBe("deny");
    expect(newDecision.type).toBe("allow");
  });

  it("rolls back to previous version when reload fails", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "policy-reload-"));
    const filePath = path.join(dir, "policy.yaml");

    await fs.writeFile(
      filePath,
      [
        "version: stable",
        "tools:",
        "  - name: shell_exec",
        "    effect: deny",
        "    when:",
        "      matches:",
        "        - rm -rf",
        "",
      ].join("\n"),
      "utf8",
    );

    const engine = new DefaultPolicyEngine();
    const stable = await engine.load(filePath);

    await fs.writeFile(filePath, "version: broken\ntools: [", "utf8");

    await expect(engine.reload()).rejects.toThrow();

    expect(engine.currentVersion()).toEqual(stable);
    expect(engine.version()).toBe("stable");
    expect(engine.history()).toHaveLength(1);
  });

  it("emits lifecycle events for reload success/failure", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "policy-events-"));
    const filePath = path.join(dir, "policy.yaml");
    const events: string[] = [];

    await fs.writeFile(filePath, "version: v1\n", "utf8");

    const engine = new DefaultPolicyEngine(undefined, {
      onLifecycleEvent: (event) => {
        events.push(event.type);
      },
    });

    await engine.load(filePath);

    await fs.writeFile(filePath, "version: v2\n", "utf8");
    await engine.reload();

    await fs.writeFile(filePath, "version: broken\ntools: [", "utf8");
    await expect(engine.reload()).rejects.toThrow();

    expect(events).toEqual(["load", "reload_success", "reload_failure"]);
  });

  it("throws on invalid YAML", async () => {
    const engine = new DefaultPolicyEngine();
    const invalidPath = path.resolve(testDir, "fixtures/invalid-policy.yaml");

    await expect(engine.load(invalidPath)).rejects.toThrow();
  });

  it("allows everything for empty policy", () => {
    const engine = new DefaultPolicyEngine();
    engine.loadInline({});

    const decision = engine.enforce(
      {
        type: "tool_call",
        name: "any_tool",
      },
      {},
    );

    expect(decision).toEqual({ type: "allow" });
  });
});
