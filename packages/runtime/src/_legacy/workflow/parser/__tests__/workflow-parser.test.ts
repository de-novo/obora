import { describe, it, expect, vi } from 'vitest';
import { parseWorkflow, resolveDependencies } from '../workflow-parser.js';
import type { Workflow } from '../../types/workflow.js';

describe('workflow-parser', () => {
  const validYaml = `
name: test-workflow
version: "1.0"
description: Test workflow for validation
mode: auto
config:
  retry: 3
  retry_delay: 5s
  continue_on_error: false
  max_parallel: 2
steps:
  - name: plan
    agent: architect
    description: Plan the implementation
    timeout: 30m
    outputs:
      - design.md

  - name: implement
    agent: coder
    depends_on:
      - plan
    inputs:
      - design.md
    outputs:
      - code.ts
    timeout: 1h

  - name: test
    agent: tester
    depends_on:
      - implement
    inputs:
      - code.ts
    timeout: 15m
`;

  describe('parseWorkflow', () => {
    it('should parse valid YAML', () => {
      const workflow = parseWorkflow(validYaml);

      expect(workflow.name).toBe('test-workflow');
      expect(workflow.version).toBe('1.0');
      expect(workflow.description).toBe('Test workflow for validation');
      expect(workflow.mode).toBe('auto');
      expect(workflow.steps.length).toBe(3);
    });

    it('should parse workflow config', () => {
      const workflow = parseWorkflow(validYaml);

      expect(workflow.config).toBeDefined();
      expect(workflow.config!.retry).toBe(3);
      expect(workflow.config!.retry_delay).toBe('5s');
      expect(workflow.config!.continue_on_error).toBe(false);
      expect(workflow.config!.max_parallel).toBe(2);
    });

    it('should parse steps correctly', () => {
      const workflow = parseWorkflow(validYaml);

      const plan = workflow.steps.find((s) => s.name === 'plan');
      expect(plan).toBeDefined();
      expect(plan!.agent).toBe('architect');
      expect(plan!.timeout).toBe('30m');
      expect(plan!.outputs).toEqual(['design.md']);

      const implement = workflow.steps.find((s) => s.name === 'implement');
      expect(implement).toBeDefined();
      expect(implement!.depends_on).toEqual(['plan']);
      expect(implement!.inputs).toEqual(['design.md']);
    });

    it('should throw on missing required field: name', () => {
      const yaml = `
steps:
  - name: plan
    agent: architect
`;
      expect(() => parseWorkflow(yaml)).toThrow(/name/);
    });

    it('should throw on missing required field: steps', () => {
      const yaml = `
name: test-workflow
`;
      expect(() => parseWorkflow(yaml)).toThrow(/steps/);
    });

    it('should throw on invalid YAML syntax', () => {
      const yaml = `
name: test-workflow
steps:
  - name: plan
    agent: architect
    description: "unclosed quote
`;
      expect(() => parseWorkflow(yaml)).toThrow();
    });

    it('should throw on invalid mode value', () => {
      const yaml = `
name: test-workflow
mode: invalid
steps:
  - name: plan
    agent: architect
`;
      expect(() => parseWorkflow(yaml)).toThrow(/mode/);
    });

    it('should throw on invalid duration format', () => {
      const yaml = `
name: test-workflow
steps:
  - name: plan
    agent: architect
    timeout: 0s
`;
      expect(() => parseWorkflow(yaml)).toThrow(/duration/);
    });

    it('should throw on duration without unit', () => {
      const yaml = `
name: test-workflow
steps:
  - name: plan
    agent: architect
    timeout: "30"
`;
      expect(() => parseWorkflow(yaml)).toThrow(/duration/);
    });

    it('should throw on duplicate step names', () => {
      const yaml = `
name: test-workflow
steps:
  - name: plan
    agent: architect
  - name: plan
    agent: coder
`;
      expect(() => parseWorkflow(yaml)).toThrow(/Duplicate/);
    });

    it('should throw on self-dependency', () => {
      const yaml = `
name: test-workflow
steps:
  - name: plan
    agent: architect
    depends_on:
      - plan
`;
      expect(() => parseWorkflow(yaml)).toThrow(/itself/);
    });

    it('should throw on missing dependency', () => {
      const yaml = `
name: test-workflow
steps:
  - name: plan
    agent: architect
  - name: implement
    agent: coder
    depends_on:
      - non-existent
`;
      expect(() => parseWorkflow(yaml)).toThrow(/non-existent/);
    });

    it('should throw on circular dependency', () => {
      const yaml = `
name: test-workflow
steps:
  - name: step-a
    agent: agent-a
    depends_on:
      - step-c
  - name: step-b
    agent: agent-b
    depends_on:
      - step-a
  - name: step-c
    agent: agent-c
    depends_on:
      - step-b
`;
      expect(() => parseWorkflow(yaml)).toThrow(/Circular/);
    });

    it('should accept minimal valid workflow', () => {
      const yaml = `
name: minimal
steps:
  - name: plan
    agent: architect
`;
      const workflow = parseWorkflow(yaml);
      expect(workflow.name).toBe('minimal');
      expect(workflow.steps.length).toBe(1);
    });

    it('should handle YAML comments', () => {
      const yaml = `
# This is a comment
name: test-workflow
steps:
  # Step comment
  - name: plan
    agent: architect # inline comment
`;
      const workflow = parseWorkflow(yaml);
      expect(workflow.name).toBe('test-workflow');
    });

    it('should handle empty depends_on array', () => {
      const yaml = `
name: test-workflow
steps:
  - name: plan
    agent: architect
    depends_on: []
`;
      const workflow = parseWorkflow(yaml);
      expect(workflow.steps[0].depends_on).toEqual([]);
    });

    it('should handle config.retry_delay with various units', () => {
      const units = ['5s', '1m', '2h', '1d'];
      for (const delay of units) {
        const yaml = `
name: test-workflow
config:
  retry_delay: ${delay}
steps:
  - name: plan
    agent: architect
`;
        const workflow = parseWorkflow(yaml);
        expect(workflow.config!.retry_delay).toBe(delay);
      }
    });

    it('should parse SCHEMAS.md fields on step/workflow', () => {
      const yaml = `
name: schema-aligned
steps:
  - name: review
    agent: reviewer
    gate: consensus
    gate_config:
      timeout: 10m
      fallback: escalate
      escalation_to: human
    consensus:
      type: majority
      min: 2
      voters:
        - id: opus
        - id: codex
    bindings:
      - source: output.summary
        target: knowledge.summary
recovery:
  review:
    on_fail: retry
    max_retries: 2
    backoff: exponential
    backoff_base: 5s
`;

      const workflow = parseWorkflow(yaml);
      expect(workflow.steps[0].gate).toBe('consensus');
      expect(workflow.steps[0].gate_config?.fallback).toBe('escalate');
      expect(workflow.steps[0].consensus?.min).toBe(2);
      expect(workflow.steps[0].bindings?.[0]?.target).toBe('knowledge.summary');
      expect(workflow.recovery?.review?.on_fail).toBe('retry');
      expect(workflow.recovery?.review?.backoff_base).toBe('5s');
    });

    it("parses step.on_fail and normalizes defaults", () => {
      const yaml = `
name: back-edge-parse
steps:
  - name: implement
    agent: coder
  - name: verify
    agent: verifier
    depends_on: [implement]
    on_fail:
      goto: implement
      max_iterations: 3
`;
      const workflow = parseWorkflow(yaml);
      expect(workflow.steps[1].on_fail).toEqual({
        goto: "implement",
        max_iterations: 3,
        escalate_on_exhaust: "fail",
        cooldown_ms: 0,
        reset_state: false,
        max_cost: null,
        max_cost_escalation: null,
      });
    });

    it("rejects on_fail + recovery.on_fail coexistence", () => {
      const yaml = `
name: back-edge-mutual-exclusion
steps:
  - name: implement
    agent: coder
  - name: verify
    agent: verifier
    depends_on: [implement]
    on_fail:
      goto: implement
      max_iterations: 2
recovery:
  verify:
    on_fail: retry
`;
      expect(() => parseWorkflow(yaml)).toThrow(/mutually exclusive/);
    });

    it("rejects on_fail self-loop", () => {
      const yaml = `
name: back-edge-self-loop
steps:
  - name: verify
    agent: verifier
    on_fail:
      goto: verify
      max_iterations: 2
`;
      expect(() => parseWorkflow(yaml)).toThrow(/self-loop/);
    });

    it("rejects on_fail target that is not a dependency ancestor", () => {
      const yaml = `
name: back-edge-invalid-target
steps:
  - name: bootstrap
    agent: init
  - name: setup
    agent: setup
    depends_on: [bootstrap]
  - name: implement
    agent: coder
    depends_on: [bootstrap]
  - name: verify
    agent: verifier
    depends_on: [implement]
    on_fail:
      goto: setup
      max_iterations: 2
`;
      expect(() => parseWorkflow(yaml)).toThrow(/must precede source/);
    });

    it.each([
      {
        title: "max_iterations < 1",
        yaml: `
name: invalid-mi
steps:
  - name: implement
    agent: coder
  - name: verify
    agent: verifier
    depends_on: [implement]
    on_fail:
      goto: implement
      max_iterations: 0
`,
        error: /max_iterations must be/,
      },
      {
        title: "cooldown_ms < 0",
        yaml: `
name: invalid-cooldown-low
steps:
  - name: implement
    agent: coder
  - name: verify
    agent: verifier
    depends_on: [implement]
    on_fail:
      goto: implement
      max_iterations: 2
      cooldown_ms: -1
`,
        error: /cooldown_ms must be 0~300000ms/,
      },
      {
        title: "cooldown_ms > 300000",
        yaml: `
name: invalid-cooldown-high
steps:
  - name: implement
    agent: coder
  - name: verify
    agent: verifier
    depends_on: [implement]
    on_fail:
      goto: implement
      max_iterations: 2
      cooldown_ms: 999999
`,
        error: /cooldown_ms must be 0~300000ms/,
      },
      {
        title: "max_cost <= 0",
        yaml: `
name: invalid-max-cost
steps:
  - name: implement
    agent: coder
  - name: verify
    agent: verifier
    depends_on: [implement]
    on_fail:
      goto: implement
      max_iterations: 2
      max_cost: -5
`,
        error: /max_cost must be positive/,
      },
    ])("validates on_fail input: $title", ({ yaml, error }) => {
      expect(() => parseWorkflow(yaml)).toThrow(error);
    });

    it("inherits max_cost_escalation from escalate_on_exhaust when omitted", () => {
      const yaml = `
name: omitted-max-cost-escalation
steps:
  - name: implement
    agent: coder
  - name: verify
    agent: verifier
    depends_on: [implement]
    on_fail:
      goto: implement
      max_iterations: 2
      escalate_on_exhaust: human
`;
      const workflow = parseWorkflow(yaml);
      expect(workflow.steps[1].on_fail?.max_cost_escalation).toBe("human");
      expect(workflow.steps[1].on_fail?.escalate_on_exhaust).toBe("human");
    });

    it("rejects when three back-edges point to the same target", () => {
      const yaml = `
name: too-many-back-edges
steps:
  - name: implement
    agent: coder
  - name: verify-a
    agent: verifier
    depends_on: [implement]
    on_fail:
      goto: implement
      max_iterations: 2
  - name: verify-b
    agent: verifier
    depends_on: [implement]
    on_fail:
      goto: implement
      max_iterations: 2
  - name: verify-c
    agent: verifier
    depends_on: [implement]
    on_fail:
      goto: implement
      max_iterations: 2
`;
      expect(() => parseWorkflow(yaml)).toThrow(/Too many back-edges point/);
    });
  });

  describe('parseWorkflow - strict mode', () => {
    it('should throw on unknown fields in strict mode', () => {
      const yaml = `
name: test-workflow
unknown_field: value
steps:
  - name: plan
    agent: architect
`;
      expect(() => parseWorkflow(yaml, { strict: true })).toThrow(/Unknown/);
    });

    it('should not throw on unknown fields without strict mode', () => {
      const yaml = `
name: test-workflow
unknown_field: value
steps:
  - name: plan
    agent: architect
`;
      const workflow = parseWorkflow(yaml, { strict: false });
      expect(workflow.name).toBe('test-workflow');
    });

    it('should throw on unknown step fields in strict mode', () => {
      const yaml = `
name: test-workflow
steps:
  - name: plan
    agent: architect
    unknown_step_field: value
`;
      expect(() => parseWorkflow(yaml, { strict: true })).toThrow(/Unknown/);
    });


    it('accepts workflow policy/audit fields in strict mode', () => {
      const yaml = `
name: strict-with-policy-audit
policy: ./policy/prod.yaml
audit:
  store: duckdb
  path: ./audit.db
steps:
  - name: plan
    agent: architect
`;

      const workflow = parseWorkflow(yaml, { strict: true });
      expect(workflow.policy).toBe('./policy/prod.yaml');
      expect(workflow.audit?.store).toBe('duckdb');
      expect(workflow.audit?.path).toBe('./audit.db');
    });

    it('should throw on unknown config fields in strict mode', () => {
      const yaml = `
name: test-workflow
config:
  unknown_config_field: value
steps:
  - name: plan
    agent: architect
`;
      expect(() => parseWorkflow(yaml, { strict: true })).toThrow(/Unknown/);
    });
  });

  describe('parseWorkflow - onWarning callback', () => {
    it('should call onWarning for unknown fields', () => {
      const warnings: string[] = [];
      const yaml = `
name: test-workflow
unknown_field: value
steps:
  - name: plan
    agent: architect
`;
      parseWorkflow(yaml, {
        onWarning: (w) => warnings.push(w),
      });

      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some((w) => w.includes('unknown_field'))).toBe(true);
    });

    it('should call onWarning for unresolved inputs', () => {
      const warnings: string[] = [];
      const yaml = `
name: test-workflow
steps:
  - name: plan
    agent: architect
  - name: implement
    agent: coder
    inputs:
      - missing.md
`;
      parseWorkflow(yaml, {
        onWarning: (w) => warnings.push(w),
      });

      expect(warnings.some((w) => w.includes('missing.md'))).toBe(true);
    });

    it('should not warn for spec files in inputs', () => {
      const warnings: string[] = [];
      const yaml = `
name: test-workflow
steps:
  - name: plan
    agent: architect
    inputs:
      - proposal.md
      - design.md
`;
      parseWorkflow(yaml, {
        onWarning: (w) => warnings.push(w),
      });

      // Should not warn about proposal.md or design.md
      const unresolvedWarnings = warnings.filter((w) => w.includes('proposal.md') || w.includes('design.md'));
      expect(unresolvedWarnings.length).toBe(0);
    });
  });

  describe('parseWorkflow - edge cases', () => {
    it('should handle step without optional fields', () => {
      const yaml = `
name: test-workflow
steps:
  - name: plan
    agent: architect
`;
      const workflow = parseWorkflow(yaml);
      const step = workflow.steps[0];

      expect(step.description).toBeUndefined();
      expect(step.depends_on).toBeUndefined();
      expect(step.inputs).toBeUndefined();
      expect(step.outputs).toBeUndefined();
      expect(step.timeout).toBeUndefined();
    });

    it('should handle workflow without optional fields', () => {
      const yaml = `
name: test-workflow
steps:
  - name: plan
    agent: architect
`;
      const workflow = parseWorkflow(yaml);

      expect(workflow.version).toBeUndefined();
      expect(workflow.description).toBeUndefined();
      expect(workflow.mode).toBeUndefined();
      expect(workflow.config).toBeUndefined();
    });

    it('should handle empty inputs/outputs arrays', () => {
      const yaml = `
name: test-workflow
steps:
  - name: plan
    agent: architect
    inputs: []
    outputs: []
`;
      const workflow = parseWorkflow(yaml);
      expect(workflow.steps[0].inputs).toEqual([]);
      expect(workflow.steps[0].outputs).toEqual([]);
    });

    it('should reject non-object workflow', () => {
      const yaml = `"just a string"`;
      expect(() => parseWorkflow(yaml)).toThrow();
    });

    it('should reject steps that is not an array', () => {
      const yaml = `
name: test-workflow
steps: not-an-array
`;
      expect(() => parseWorkflow(yaml)).toThrow(/array/);
    });

    it('should reject step that is not an object', () => {
      const yaml = `
name: test-workflow
steps:
  - "just a string"
`;
      expect(() => parseWorkflow(yaml)).toThrow(/object/);
    });

    it('should reject non-string name', () => {
      const yaml = `
name: 123
steps:
  - name: plan
    agent: architect
`;
      expect(() => parseWorkflow(yaml)).toThrow(/string/);
    });

    it('should reject non-string step name', () => {
      const yaml = `
name: test-workflow
steps:
  - name: 123
    agent: architect
`;
      expect(() => parseWorkflow(yaml)).toThrow(/string/);
    });

    it('should reject non-string agent', () => {
      const yaml = `
name: test-workflow
steps:
  - name: plan
    agent: 123
`;
      expect(() => parseWorkflow(yaml)).toThrow(/string/);
    });

    it('should reject non-array depends_on', () => {
      const yaml = `
name: test-workflow
steps:
  - name: plan
    agent: architect
    depends_on: "not-an-array"
`;
      expect(() => parseWorkflow(yaml)).toThrow(/array/);
    });

    it('should reject depends_on with non-string elements', () => {
      const yaml = `
name: test-workflow
steps:
  - name: plan
    agent: architect
    depends_on:
      - 123
`;
      expect(() => parseWorkflow(yaml)).toThrow(/string/);
    });
  });

  describe('resolveDependencies', () => {
    it('should resolve explicit dependencies', () => {
      const workflow: Workflow = {
        name: 'test',
        steps: [
          { name: 'plan', agent: 'architect' },
          { name: 'implement', agent: 'coder', depends_on: ['plan'] },
          { name: 'test', agent: 'tester', depends_on: ['implement'] },
        ],
      };

      const deps = resolveDependencies(workflow);

      expect(deps.get('plan')).toEqual([]);
      expect(deps.get('implement')).toContain('plan');
      expect(deps.get('test')).toContain('implement');
    });

    it('should resolve implicit dependencies from inputs/outputs', () => {
      const workflow: Workflow = {
        name: 'test',
        steps: [
          { name: 'plan', agent: 'architect', outputs: ['design.md'] },
          { name: 'implement', agent: 'coder', inputs: ['design.md'] },
        ],
      };

      const deps = resolveDependencies(workflow);

      expect(deps.get('implement')).toContain('plan');
    });

    it('should combine explicit and implicit dependencies', () => {
      const workflow: Workflow = {
        name: 'test',
        steps: [
          { name: 'spec', agent: 'analyst', outputs: ['proposal.md'] },
          { name: 'plan', agent: 'architect', depends_on: ['spec'], outputs: ['design.md'] },
          { name: 'implement', agent: 'coder', inputs: ['design.md'] },
        ],
      };

      const deps = resolveDependencies(workflow);

      expect(deps.get('spec')).toEqual([]);
      expect(deps.get('plan')).toContain('spec');
      expect(deps.get('implement')).toContain('plan');
    });

    it('should not add self-dependency via implicit dependency', () => {
      const workflow: Workflow = {
        name: 'test',
        steps: [
          { name: 'plan', agent: 'architect', inputs: ['design.md'], outputs: ['design.md'] },
        ],
      };

      const deps = resolveDependencies(workflow);

      expect(deps.get('plan')).not.toContain('plan');
    });

    it('should handle steps without inputs/outputs', () => {
      const workflow: Workflow = {
        name: 'test',
        steps: [
          { name: 'a', agent: 'worker' },
          { name: 'b', agent: 'worker' },
        ],
      };

      const deps = resolveDependencies(workflow);

      expect(deps.get('a')).toEqual([]);
      expect(deps.get('b')).toEqual([]);
    });

    it('should deduplicate dependencies', () => {
      const workflow: Workflow = {
        name: 'test',
        steps: [
          { name: 'plan', agent: 'architect', outputs: ['design.md'] },
          { name: 'implement', agent: 'coder', depends_on: ['plan'], inputs: ['design.md'] },
        ],
      };

      const deps = resolveDependencies(workflow);
      const planDeps = deps.get('implement');

      // Should only have one reference to 'plan'
      expect(planDeps!.filter((d) => d === 'plan').length).toBe(1);
    });
  });
});
