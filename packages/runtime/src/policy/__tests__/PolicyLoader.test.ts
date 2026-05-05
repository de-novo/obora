import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loadPolicyFromYaml, normalizePolicySet } from "../PolicyLoader.js";

describe("PolicyLoader", () => {
  it("normalizes camelCase and snake_case policy fields", () => {
    const policy = normalizePolicySet({
      version: "runtime-hardening",
      tools: [
        {
          name: "shell",
          effect: "gate",
          when: {
            matches: ["rm *"],
            not_matches: ["echo *"],
            condition: "step.name == 'deploy'",
          },
          gate: { type: "external", timeout: "30s" },
        },
        {
          name: "write_file",
          effect: "transform",
          transform: { fn: "sanitize_path" },
        },
      ],
      dynamic_tool_rules: [
        {
          name: "deploy",
          condition: "execution.totalCost > 1",
          effect: "deny",
          priority: 10,
        },
      ],
      sandbox: {
        root: "/tmp/workspace",
        deny_outside_root: true,
        deny_patterns: ["**/.env"],
        max_file_size: "1mb",
      },
      resources: {
        timeout_ms: 1000,
        max_tokens: 2000,
        max_cost_usd: 0.5,
        max_tool_calls: 3,
        max_output_size: "64kb",
        dynamic_quota: {
          limits: [
            {
              field: "tokens",
              condition: "execution.totalTokens > 1000",
              limit: 1000,
              action: "warn",
            },
          ],
        },
      },
      gates: [
        {
          step: "deploy",
          type: "human-approval",
          required: true,
          timeout: "5m",
          fallback: "auto-approve",
        },
      ],
    });

    expect(policy).toMatchObject({
      version: "runtime-hardening",
      tools: [
        {
          name: "shell",
          effect: "gate",
          when: {
            matches: ["rm *"],
            not_matches: ["echo *"],
            condition: "step.name == 'deploy'",
          },
          gate: { type: "external", timeout: "30s" },
        },
        {
          name: "write_file",
          effect: "transform",
          transform: { fn: "sanitize_path" },
        },
      ],
      dynamicToolRules: [
        {
          name: "deploy",
          condition: "execution.totalCost > 1",
          effect: "deny",
          priority: 10,
        },
      ],
      sandbox: {
        root: "/tmp/workspace",
        denyOutsideRoot: true,
        denyPatterns: ["**/.env"],
        maxFileSize: "1mb",
      },
      resources: {
        timeoutMs: 1000,
        maxTokens: 2000,
        maxCostUsd: 0.5,
        maxToolCalls: 3,
        maxOutputSize: "64kb",
        dynamicQuota: {
          limits: [
            {
              field: "tokens",
              condition: "execution.totalTokens > 1000",
              limit: 1000,
              action: "warn",
            },
          ],
        },
      },
      gates: [
        {
          step: "deploy",
          type: "human-approval",
          required: true,
          timeout: "5m",
          fallback: "auto-approve",
        },
      ],
    });
  });

  it("loads and normalizes a YAML policy file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-policy-loader-"));
    const filePath = join(dir, "policy.yaml");

    try {
      await writeFile(
        filePath,
        `
version: file-policy
tools:
  - name: shell
    effect: deny
resources:
  max_tool_calls: 2
`,
        "utf8"
      );

      await expect(loadPolicyFromYaml(filePath)).resolves.toMatchObject({
        version: "file-policy",
        tools: [{ name: "shell", effect: "deny" }],
        resources: { maxToolCalls: 2 },
      });
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });

  it("rejects invalid policy shapes with precise messages", () => {
    const invalidCases: Array<[unknown, string]> = [
      [null, "Invalid policy YAML"],
      [{ tools: {} }, "Invalid tools: expected array"],
      [{ tools: [null] }, "Invalid tools[0]: expected object"],
      [{ tools: [{ name: "", effect: "allow" }] }, "tools[0].name"],
      [{ tools: [{ name: "shell", effect: "audit" }] }, "tools[0].effect"],
      [{ tools: [{ name: "shell", effect: "allow", when: "always" }] }, "tools[0].when"],
      [
        { tools: [{ name: "shell", effect: "allow", when: { condition: 1 } }] },
        "when.condition",
      ],
      [
        { tools: [{ name: "shell", effect: "allow", when: { matches: ["ok", 1] } }] },
        "when.matches",
      ],
      [
        { tools: [{ name: "shell", effect: "transform", transform: { fn: "" } }] },
        "transform.fn",
      ],
      [{ tools: [{ name: "shell", effect: "gate", gate: "human" }] }, "gate: expected object"],
      [
        { tools: [{ name: "shell", effect: "gate", gate: { type: "robot" } }] },
        "gate.type",
      ],
      [
        { tools: [{ name: "shell", effect: "gate", gate: { type: "consensus", timeout: 1 } }] },
        "gate.timeout",
      ],
      [{ sandbox: [] }, "Invalid sandbox: expected object"],
      [{ sandbox: { root: "", denyOutsideRoot: true } }, "sandbox.root"],
      [{ sandbox: { root: "/tmp", denyOutsideRoot: "yes" } }, "denyOutsideRoot"],
      [
        { sandbox: { root: "/tmp", denyOutsideRoot: true, denyPatterns: ["ok", 1] } },
        "denyPatterns",
      ],
      [
        { sandbox: { root: "/tmp", denyOutsideRoot: true, maxFileSize: 1 } },
        "maxFileSize",
      ],
      [{ resources: [] }, "Invalid resources: expected object"],
      [{ resources: { timeoutMs: "1000" } }, "resources.timeoutMs"],
      [{ resources: { maxTokens: "1000" } }, "resources.maxTokens"],
      [{ resources: { maxCostUsd: "1" } }, "resources.maxCostUsd"],
      [{ resources: { maxToolCalls: "1" } }, "resources.maxToolCalls"],
      [{ resources: { maxOutputSize: 1024 } }, "resources.maxOutputSize"],
      [{ resources: { dynamicQuota: [] } }, "resources.dynamicQuota: expected object"],
      [{ resources: { dynamicQuota: { limits: {} } } }, "dynamicQuota.limits"],
      [
        { resources: { dynamicQuota: { limits: [null] } } },
        "dynamicQuota.limits[0]",
      ],
      [
        {
          resources: {
            dynamicQuota: {
              limits: [{ field: "memory", condition: "true", limit: 1, action: "warn" }],
            },
          },
        },
        "dynamicQuota.limits[0].field",
      ],
      [
        {
          resources: {
            dynamicQuota: {
              limits: [{ field: "tokens", condition: "", limit: 1, action: "warn" }],
            },
          },
        },
        "dynamicQuota.limits[0].condition",
      ],
      [
        {
          resources: {
            dynamicQuota: {
              limits: [{ field: "tokens", condition: "true", limit: "1", action: "warn" }],
            },
          },
        },
        "dynamicQuota.limits[0].limit",
      ],
      [
        {
          resources: {
            dynamicQuota: {
              limits: [{ field: "tokens", condition: "true", limit: 1, action: "block" }],
            },
          },
        },
        "dynamicQuota.limits[0].action",
      ],
      [{ dynamicToolRules: {} }, "Invalid dynamicToolRules: expected array"],
      [{ dynamicToolRules: [null] }, "dynamicToolRules[0]: expected object"],
      [
        { dynamicToolRules: [{ name: "", condition: "true", effect: "allow" }] },
        "dynamicToolRules[0].name",
      ],
      [
        { dynamicToolRules: [{ name: "shell", condition: "", effect: "allow" }] },
        "dynamicToolRules[0].condition",
      ],
      [
        { dynamicToolRules: [{ name: "shell", condition: "true", effect: "audit" }] },
        "dynamicToolRules[0].effect",
      ],
      [
        { dynamicToolRules: [{ name: "shell", condition: "true", effect: "allow", priority: "1" }] },
        "dynamicToolRules[0].priority",
      ],
      [
        {
          dynamicToolRules: [
            { name: "shell", condition: "true", effect: "transform", transformFn: "" },
          ],
        },
        "dynamicToolRules[0].transformFn",
      ],
      [
        { dynamicToolRules: [{ name: "shell", condition: "true", effect: "gate", gate: [] }] },
        "dynamicToolRules[0].gate",
      ],
      [
        {
          dynamicToolRules: [
            { name: "shell", condition: "true", effect: "gate", gate: { type: "robot" } },
          ],
        },
        "dynamicToolRules[0].gate.type",
      ],
      [
        {
          dynamicToolRules: [
            { name: "shell", condition: "true", effect: "gate", gate: { type: "external", timeout: 1 } },
          ],
        },
        "dynamicToolRules[0].gate.timeout",
      ],
      [{ gates: {} }, "Invalid gates: expected array"],
      [{ gates: [null] }, "Invalid gates[0]: expected object"],
      [{ gates: [{ step: "", type: "external", required: true }] }, "gates[0].step"],
      [{ gates: [{ step: "deploy", type: "robot", required: true }] }, "gates[0].type"],
      [{ gates: [{ step: "deploy", type: "external", required: "yes" }] }, "gates[0].required"],
      [{ gates: [{ step: "deploy", type: "external", required: true, timeout: 1 }] }, "gates[0].timeout"],
      [
        { gates: [{ step: "deploy", type: "external", required: true, fallback: "continue" }] },
        "gates[0].fallback",
      ],
    ];

    for (const [input, message] of invalidCases) {
      expect(() => normalizePolicySet(input)).toThrow(message);
    }
  });
});
