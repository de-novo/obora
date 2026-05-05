import { describe, expect, it } from "vitest";

import { parseWorkflow, resolveDependencies } from "../workflow-parser";

describe("workflow-parser coverage paths", () => {
  it("parses optional workflow and step sections without expanding the public API", () => {
    const warnings: string[] = [];
    const workflow = parseWorkflow(
      `
name: runtime-quality
version: "1.0"
description: Runtime quality workflow
mode: gated
config:
  retry: 2
  retry_delay: 5s
  continue_on_error: false
  max_parallel: 2
policy: policies/runtime.yaml
audit:
  store: sqlite
  path: .obora/audit.db
  retention: 30d
steps:
  - name: collect
    agent: researcher
    outputs: [data/raw.json]
    extra_step_field: warns
  - name: validate
    agent: validator
    provider: openai
    model: gpt-5.4
    description: Validate runtime state
    depends_on: [collect]
    inputs: [data/raw.json, proposal.md]
    outputs: [reports/validation.json]
    timeout: 5m
    skills: [typescript]
    tools: [read]
    bindings:
      - source: reports.validation
        target: state.validation
        transform: normalize
        condition: always
    consensus:
      type: weighted
      voters:
        - id: lead
          weight: 2
      min: 1
      of: 1
      threshold: 0.75
      timeout: 1m
      best_effort: [observer]
    gate: consensus
    gate_config:
      timeout: 2m
      fallback: escalate
      escalation_to: runtime-owner
    pattern: review
    participants:
      reviewer: lead
    policy:
      sandbox: readonly
      tools_override:
        - name: shell
          effect: deny
        - name: ignored
          effect: unsupported
    on_fail:
      goto: collect
      max_iterations: 2
      escalate_on_exhaust: dlq
      cooldown_ms: 100
      reset_state: true
      max_cost: 10
      max_cost_escalation: human
    config:
      local: true
`,
      { onWarning: (warning) => warnings.push(warning) },
    );

    expect(workflow).toMatchObject({
      name: "runtime-quality",
      version: "1.0",
      mode: "gated",
      policy: "policies/runtime.yaml",
      config: {
        retry: 2,
        retry_delay: "5s",
        continue_on_error: false,
        max_parallel: 2,
      },
      audit: {
        store: "sqlite",
        path: ".obora/audit.db",
        retention: "30d",
      },
    });
    expect(workflow.steps[1]).toMatchObject({
      name: "validate",
      provider: "openai",
      model: "gpt-5.4",
      bindings: [
        {
          source: "reports.validation",
          target: "state.validation",
          transform: "normalize",
          condition: "always",
        },
      ],
      consensus: {
        type: "weighted",
        min: 1,
        of: 1,
        threshold: 0.75,
        timeout: "1m",
        best_effort: ["observer"],
      },
      gate: "consensus",
      gate_config: {
        timeout: "2m",
        fallback: "escalate",
        escalation_to: "runtime-owner",
      },
      policy: {
        sandbox: "readonly",
        tools_override: [{ name: "shell", effect: "deny" }],
      },
      on_fail: {
        goto: "collect",
        max_iterations: 2,
        escalate_on_exhaust: "dlq",
        cooldown_ms: 100,
        reset_state: true,
        max_cost: 10,
        max_cost_escalation: "human",
      },
      config: { local: true },
    });
    expect(warnings).toEqual(["E2004: Unknown field(s) in step 'collect': extra_step_field"]);
    expect(resolveDependencies(workflow)).toEqual(
      new Map([
        ["collect", []],
        ["validate", ["collect"]],
      ]),
    );
  });

  it("reports unresolved inputs as warnings in non-strict mode and errors in strict mode", () => {
    const warnings: string[] = [];

    parseWorkflow(
      `
name: missing-input
steps:
  - name: consume
    agent: validator
    inputs: [reports/missing.json, status.yaml]
`,
      { onWarning: (warning) => warnings.push(warning) },
    );

    expect(warnings).toEqual([
      "E3004: Step 'consume' requires input 'reports/missing.json' but no step produces it",
    ]);
    expect(() =>
      parseWorkflow(
        `
name: missing-input
steps:
  - name: consume
    agent: validator
    inputs: [reports/missing.json]
`,
        { strict: true },
      ),
    ).toThrow("requires input 'reports/missing.json'");
  });

  it("rejects malformed scalar, object, and enum fields", () => {
    const invalidCases = [
      ["name: bad\nsteps: nope", "'steps' must be an array"],
      ["name: bad\nmode: invalid\nsteps: []", "'mode' must be one of"],
      ["name: bad\nconfig: []\nsteps: []", "'config' must be an object"],
      ["name: bad\nconfig:\n  retry_delay: 0s\nsteps: []", "invalid duration format"],
      ["name: bad\naudit:\n  store: file\nsteps: []", "'audit.store' must be one of"],
      ["name: bad\nrecovery: []\nsteps: []", "'recovery' must be an object"],
      ["name: bad\nrecovery:\n  collect:\n    on_fail: restart\nsteps: []", "'recovery.collect.on_fail' is invalid"],
      ["name: bad\nsteps:\n  - 1", "Step at index 0 must be an object"],
      ["name: bad\nsteps:\n  - agent: a", "missing required field 'name'"],
      ["name: bad\nsteps:\n  - name: s", "missing required field 'agent'"],
      ["name: bad\nsteps:\n  - name: s\n    agent: a\n    timeout: always", "invalid duration format"],
      ["name: bad\nsteps:\n  - name: s\n    agent: a\n    depends_on: nope", "'depends_on' must be an array"],
      ["name: bad\nsteps:\n  - name: s\n    agent: a\n    inputs: [1]", "'inputs' must be an array of strings"],
      ["name: bad\nsteps:\n  - name: s\n    agent: a\n    outputs: [1]", "'outputs' must be an array of strings"],
      ["name: bad\nsteps:\n  - name: s\n    agent: a\n    description: 1", "'description' must be a string"],
      ["name: bad\nsteps:\n  - name: s\n    agent: a\n    skills: skill", "'skills' must be an array"],
      ["name: bad\nsteps:\n  - name: s\n    agent: a\n    tools: [1]", "'tools' must be an array of strings"],
      ["name: bad\nsteps:\n  - name: s\n    agent: a\n    gate: robot", "'gate' must be one of"],
      ["name: bad\nsteps:\n  - name: s\n    agent: a\n    pattern: 1", "'pattern' must be a string"],
      ["name: bad\nsteps:\n  - name: s\n    agent: a\n    participants: []", "'participants' must be an object"],
      ["name: bad\nsteps:\n  - name: s\n    agent: a\n    bindings: {}", "'bindings' must be an array"],
      ["name: bad\nsteps:\n  - name: s\n    agent: a\n    bindings: [1]", "'bindings[0]' must be an object"],
      [
        "name: bad\nsteps:\n  - name: s\n    agent: a\n    bindings:\n      - source: x",
        "binding requires string 'source' and 'target'",
      ],
      ["name: bad\nsteps:\n  - name: s\n    agent: a\n    consensus: nope", "'consensus' must be an object"],
      [
        "name: bad\nsteps:\n  - name: s\n    agent: a\n    consensus:\n      type: quorum",
        "'consensus.type' is invalid",
      ],
      ["name: bad\nsteps:\n  - name: s\n    agent: a\n    gate_config: yes", "'gate_config' must be an object"],
      ["name: bad\nsteps:\n  - name: s\n    agent: a\n    policy: locked", "'policy' must be an object"],
      ["name: bad\nsteps:\n  - name: s\n    agent: a\n    on_fail: []", "'on_fail' must be an object"],
      ["name: bad\nsteps:\n  - name: s\n    agent: a\n    on_fail:\n      goto: ''", "'on_fail.goto' must be a non-empty string"],
      [
        "name: bad\nsteps:\n  - name: s\n    agent: a\n    on_fail:\n      goto: s\n      max_iterations: 0",
        "max_iterations must be",
      ],
      [
        "name: bad\nsteps:\n  - name: s\n    agent: a\n    on_fail:\n      goto: s\n      max_iterations: 1\n      cooldown_ms: 300001",
        "cooldown_ms must be 0~300000ms",
      ],
      [
        "name: bad\nsteps:\n  - name: s\n    agent: a\n    on_fail:\n      goto: s\n      max_iterations: 1\n      max_cost: -1",
        "max_cost must be positive",
      ],
      [
        "name: bad\nsteps:\n  - name: s\n    agent: a\n    on_fail:\n      goto: s\n      max_iterations: 1\n      max_cost_escalation: page",
        "unknown escalation: page",
      ],
    ] as const;

    for (const [yaml, message] of invalidCases) {
      expect(() => parseWorkflow(yaml)).toThrow(message);
    }
  });

  it("rejects duplicate, self, missing, circular, and invalid back-edge dependencies", () => {
    const invalidCases = [
      [
        `
name: duplicate
steps:
  - name: a
    agent: x
  - name: a
    agent: y
`,
        "Duplicate step name: 'a'",
      ],
      [
        `
name: self
steps:
  - name: a
    agent: x
    depends_on: [a]
`,
        "depends on itself",
      ],
      [
        `
name: missing
steps:
  - name: a
    agent: x
    depends_on: [b]
`,
        "depends on non-existent step 'b'",
      ],
      [
        `
name: circular
steps:
  - name: a
    agent: x
    depends_on: [b]
  - name: b
    agent: y
    depends_on: [a]
`,
        "Circular dependency detected",
      ],
      [
        `
name: self-loop
steps:
  - name: a
    agent: x
    on_fail:
      goto: a
      max_iterations: 1
`,
        "self-loop is not allowed",
      ],
      [
        `
name: missing-back-edge
steps:
  - name: a
    agent: x
    on_fail:
      goto: b
      max_iterations: 1
`,
        "references non-existent step 'b'",
      ],
      [
        `
name: forward-back-edge
steps:
  - name: a
    agent: x
    on_fail:
      goto: b
      max_iterations: 1
  - name: b
    agent: y
`,
        "back-edge target 'b' must precede source 'a'",
      ],
      [
        `
name: too-many-back-edges
steps:
  - name: start
    agent: x
  - name: a
    agent: x
    depends_on: [start]
    on_fail:
      goto: start
      max_iterations: 1
  - name: b
    agent: x
    depends_on: [start]
    on_fail:
      goto: start
      max_iterations: 1
  - name: c
    agent: x
    depends_on: [start]
    on_fail:
      goto: start
      max_iterations: 1
`,
        "Too many back-edges point to 'start'",
      ],
      [
        `
name: mutual-exclusion
recovery:
  a:
    on_fail: retry
steps:
  - name: start
    agent: x
  - name: a
    agent: x
    depends_on: [start]
    on_fail:
      goto: start
      max_iterations: 1
`,
        "'on_fail.goto' and 'recovery.on_fail' are mutually exclusive",
      ],
    ] as const;

    for (const [yaml, message] of invalidCases) {
      expect(() => parseWorkflow(yaml)).toThrow(message);
    }
  });

  it("honors strict mode for unknown fields and YAML syntax errors", () => {
    expect(() => parseWorkflow("name: strict\nunknown: true\nsteps: []", { strict: true })).toThrow(
      "Unknown field(s) in workflow: unknown",
    );
    expect(() => parseWorkflow("not: [closed")).toThrow("Flow sequence in block collection");
    expect(() => parseWorkflow("plain string")).toThrow("Workflow must be a YAML object");
  });
});
