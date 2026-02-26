import { describe, it, expect } from 'vitest';
import {
  buildDependencyGraph,
  resolveTopologicalOrder,
  detectCyclesDFS,
  calculateExecutionLevels,
  groupStepsByLevel,
  generateExecutionPlan,
  getNextSteps,
  validateExecutionOrder,
} from '../dependency-resolver.js';
import type { Step, Workflow } from '../../types/workflow.js';

describe('dependency-resolver', () => {
  const simpleWorkflow: Workflow = {
    name: 'simple-workflow',
    mode: 'auto',
    steps: [
      { name: 'plan', agent: 'architect' },
      { name: 'implement', agent: 'coder', depends_on: ['plan'] },
      { name: 'test', agent: 'tester', depends_on: ['implement'] },
    ],
  };

  const parallelWorkflow: Workflow = {
    name: 'parallel-workflow',
    mode: 'auto',
    steps: [
      { name: 'start', agent: 'init' },
      { name: 'frontend', agent: 'developer', depends_on: ['start'] },
      { name: 'backend', agent: 'developer', depends_on: ['start'] },
      { name: 'deploy', agent: 'ops', depends_on: ['frontend', 'backend'] },
    ],
  };

  const cyclicWorkflow: Workflow = {
    name: 'cyclic-workflow',
    mode: 'auto',
    steps: [
      { name: 'step-a', agent: 'agent-a', depends_on: ['step-c'] },
      { name: 'step-b', agent: 'agent-b', depends_on: ['step-a'] },
      { name: 'step-c', agent: 'agent-c', depends_on: ['step-b'] },
    ],
  };

  describe('buildDependencyGraph', () => {
    it('should build graph from steps', () => {
      const graph = buildDependencyGraph(simpleWorkflow.steps);

      expect(graph.nodes.size).toBe(3);
      expect(graph.nodes.has('plan')).toBe(true);
      expect(graph.nodes.has('implement')).toBe(true);
      expect(graph.nodes.has('test')).toBe(true);
    });

    it('should include edges for dependencies', () => {
      const graph = buildDependencyGraph(simpleWorkflow.steps);

      expect(graph.edges.get('implement')).toContain('plan');
      expect(graph.edges.get('test')).toContain('implement');
    });

    it('should handle steps without dependencies', () => {
      const steps: Step[] = [{ name: 'standalone', agent: 'worker' }];
      const graph = buildDependencyGraph(steps);

      expect(graph.nodes.size).toBe(1);
      expect(graph.edges.get('standalone')).toEqual([]);
    });

    it('should handle empty steps array', () => {
      const graph = buildDependencyGraph([]);

      expect(graph.nodes.size).toBe(0);
      expect(graph.edges.size).toBe(0);
      expect(graph.backEdges.size).toBe(0);
    });

    it("collects back-edge annotations separately from DAG edges", () => {
      const steps: Step[] = [
        { name: "implement", agent: "coder" },
        {
          name: "verify",
          agent: "verifier",
          depends_on: ["implement"],
          on_fail: { goto: "implement", max_iterations: 3, escalate_on_exhaust: "fail", cooldown_ms: 0, reset_state: false, max_cost: null, max_cost_escalation: null },
        },
      ];
      const graph = buildDependencyGraph(steps);
      expect(graph.edges.get("verify")).toEqual(["implement"]);
      expect(graph.backEdges.get("verify")).toBe("implement");
    });
  });

  describe('resolveTopologicalOrder', () => {
    it('should return correct order for simple workflow', () => {
      const order = resolveTopologicalOrder(simpleWorkflow.steps);

      expect(order).not.toBeNull();
      expect(order).toEqual(['plan', 'implement', 'test']);
    });

    it('should handle parallel steps', () => {
      const order = resolveTopologicalOrder(parallelWorkflow.steps);

      expect(order).not.toBeNull();
      expect(order![0]).toBe('start');
      expect(order![order!.length - 1]).toBe('deploy');
      // frontend and backend should be between start and deploy
      const frontendIdx = order!.indexOf('frontend');
      const backendIdx = order!.indexOf('backend');
      expect(frontendIdx).toBeGreaterThan(0);
      expect(backendIdx).toBeGreaterThan(0);
      expect(frontendIdx).toBeLessThan(order!.length - 1);
      expect(backendIdx).toBeLessThan(order!.length - 1);
    });

    it('should return null for cyclic workflow', () => {
      const order = resolveTopologicalOrder(cyclicWorkflow.steps);

      expect(order).toBeNull();
    });

    it('should handle empty steps', () => {
      const order = resolveTopologicalOrder([]);

      expect(order).toEqual([]);
    });

    it('should handle single step', () => {
      const steps: Step[] = [{ name: 'solo', agent: 'worker' }];
      const order = resolveTopologicalOrder(steps);

      expect(order).toEqual(['solo']);
    });
  });

  describe('detectCyclesDFS', () => {
    it('should detect cycles in cyclic workflow', () => {
      const result = detectCyclesDFS(cyclicWorkflow.steps);

      expect(result.hasCycle).toBe(true);
      expect(result.cyclePath).toBeDefined();
    });

    it('should not detect cycles in acyclic workflow', () => {
      const result = detectCyclesDFS(simpleWorkflow.steps);

      expect(result.hasCycle).toBe(false);
    });

    it('should handle empty steps', () => {
      const result = detectCyclesDFS([]);

      expect(result.hasCycle).toBe(false);
    });
  });

  describe('calculateExecutionLevels', () => {
    it('should calculate levels for linear workflow', () => {
      const levels = calculateExecutionLevels(simpleWorkflow.steps);

      expect(levels.get('plan')).toBe(0);
      expect(levels.get('implement')).toBe(1);
      expect(levels.get('test')).toBe(2);
    });

    it('should calculate same level for parallel steps', () => {
      const levels = calculateExecutionLevels(parallelWorkflow.steps);

      expect(levels.get('start')).toBe(0);
      expect(levels.get('frontend')).toBe(1);
      expect(levels.get('backend')).toBe(1);
      expect(levels.get('deploy')).toBe(2);
    });

    it('should handle all independent steps', () => {
      const steps: Step[] = [
        { name: 'a', agent: 'worker' },
        { name: 'b', agent: 'worker' },
        { name: 'c', agent: 'worker' },
      ];
      const levels = calculateExecutionLevels(steps);

      expect(levels.get('a')).toBe(0);
      expect(levels.get('b')).toBe(0);
      expect(levels.get('c')).toBe(0);
    });
  });

  describe('groupStepsByLevel', () => {
    it('should group steps by level', () => {
      const groups = groupStepsByLevel(parallelWorkflow.steps);

      expect(groups.length).toBe(3);
      expect(groups[0].level).toBe(0);
      expect(groups[0].steps.length).toBe(1);
      expect(groups[1].level).toBe(1);
      expect(groups[1].steps.length).toBe(2);
      expect(groups[2].level).toBe(2);
      expect(groups[2].steps.length).toBe(1);
    });

    it('should mark parallelizable groups correctly', () => {
      const groups = groupStepsByLevel(parallelWorkflow.steps);

      expect(groups[0].parallelizable).toBe(false); // only 1 step
      expect(groups[1].parallelizable).toBe(true); // 2 steps
      expect(groups[2].parallelizable).toBe(false); // only 1 step
    });

    it('should handle empty steps', () => {
      const groups = groupStepsByLevel([]);

      expect(groups).toEqual([]);
    });

    it('should sort groups by level', () => {
      const groups = groupStepsByLevel(simpleWorkflow.steps);

      for (let i = 1; i < groups.length; i++) {
        expect(groups[i].level).toBeGreaterThan(groups[i - 1].level);
      }
    });
  });

  describe('generateExecutionPlan', () => {
    it('should generate valid plan for simple workflow', () => {
      const plan = generateExecutionPlan(simpleWorkflow);

      expect(plan.isValid).toBe(true);
      expect(plan.executionOrder).toEqual(['plan', 'implement', 'test']);
      expect(plan.stepGroups.length).toBe(3);
      expect(plan.cyclicPath).toBeUndefined();
    });

    it('should generate valid plan for parallel workflow', () => {
      const plan = generateExecutionPlan(parallelWorkflow);

      expect(plan.isValid).toBe(true);
      expect(plan.executionOrder[0]).toBe('start');
      expect(plan.executionOrder[plan.executionOrder.length - 1]).toBe('deploy');
    });

    it('should generate invalid plan for cyclic workflow', () => {
      const plan = generateExecutionPlan(cyclicWorkflow);

      expect(plan.isValid).toBe(false);
      expect(plan.executionOrder).toEqual([]);
      expect(plan.cyclicPath).toBeDefined();
      expect(plan.stepGroups).toEqual([]);
    });

    it('should include step groups in plan', () => {
      const plan = generateExecutionPlan(parallelWorkflow);

      expect(plan.stepGroups.length).toBe(3);
      // Level 1 should have 2 parallel steps
      const level1 = plan.stepGroups.find((g) => g.level === 1);
      expect(level1).toBeDefined();
      expect(level1!.steps.length).toBe(2);
      expect(level1!.parallelizable).toBe(true);
    });

    it("returns warnings when two back-edges point to the same target", () => {
      const workflow: Workflow = {
        name: "back-edge-warn",
        steps: [
          { name: "a", agent: "x" },
          { name: "b", agent: "x", depends_on: ["a"], on_fail: { goto: "a", max_iterations: 2, escalate_on_exhaust: "fail", cooldown_ms: 0, reset_state: false, max_cost: null, max_cost_escalation: null } },
          { name: "c", agent: "x", depends_on: ["a"], on_fail: { goto: "a", max_iterations: 2, escalate_on_exhaust: "fail", cooldown_ms: 0, reset_state: false, max_cost: null, max_cost_escalation: null } },
        ],
      };
      const plan = generateExecutionPlan(workflow);
      expect(plan.isValid).toBe(true);
      expect(plan.backEdges).toHaveLength(2);
      expect(plan.warnings.some((warning) => warning.includes("Multiple back-edges point to 'a'"))).toBe(true);
    });

    it("returns warning when three back-edges point to the same target", () => {
      const workflow: Workflow = {
        name: "back-edge-error",
        steps: [
          { name: "a", agent: "x" },
          { name: "b", agent: "x", depends_on: ["a"], on_fail: { goto: "a", max_iterations: 2, escalate_on_exhaust: "fail", cooldown_ms: 0, reset_state: false, max_cost: null, max_cost_escalation: null } },
          { name: "c", agent: "x", depends_on: ["a"], on_fail: { goto: "a", max_iterations: 2, escalate_on_exhaust: "fail", cooldown_ms: 0, reset_state: false, max_cost: null, max_cost_escalation: null } },
          { name: "d", agent: "x", depends_on: ["a"], on_fail: { goto: "a", max_iterations: 2, escalate_on_exhaust: "fail", cooldown_ms: 0, reset_state: false, max_cost: null, max_cost_escalation: null } },
        ],
      };
      const plan = generateExecutionPlan(workflow);
      expect(plan.isValid).toBe(true);
      expect(plan.warnings.some((warning) => warning.includes("Multiple back-edges point to 'a'"))).toBe(true);
    });
  });

  describe('getNextSteps', () => {
    it('should return first step when nothing is completed', () => {
      const completed = new Set<string>();
      const next = getNextSteps(simpleWorkflow, completed);

      expect(next.length).toBe(1);
      expect(next[0].name).toBe('plan');
    });

    it('should return next step after completion', () => {
      const completed = new Set(['plan']);
      const next = getNextSteps(simpleWorkflow, completed);

      expect(next.length).toBe(1);
      expect(next[0].name).toBe('implement');
    });

    it('should return multiple steps when parallel execution is possible', () => {
      const completed = new Set(['start']);
      const next = getNextSteps(parallelWorkflow, completed);

      expect(next.length).toBe(2);
      expect(next.map((s) => s.name)).toContain('frontend');
      expect(next.map((s) => s.name)).toContain('backend');
    });

    it('should wait for all dependencies', () => {
      const completed = new Set(['start', 'frontend']);
      const next = getNextSteps(parallelWorkflow, completed);

      // backend is available, but deploy needs both frontend and backend
      expect(next.length).toBe(1);
      expect(next[0].name).toBe('backend');
    });

    it('should return empty when all steps are completed', () => {
      const completed = new Set(['plan', 'implement', 'test']);
      const next = getNextSteps(simpleWorkflow, completed);

      expect(next.length).toBe(0);
    });

    it('should handle workflow with no dependencies', () => {
      const workflow: Workflow = {
        name: 'parallel-only',
        mode: 'auto',
        steps: [
          { name: 'a', agent: 'worker' },
          { name: 'b', agent: 'worker' },
          { name: 'c', agent: 'worker' },
        ],
      };

      const completed = new Set<string>();
      const next = getNextSteps(workflow, completed);

      expect(next.length).toBe(3);
    });
  });

  describe('validateExecutionOrder', () => {
    it('should validate correct order', () => {
      const result = validateExecutionOrder(simpleWorkflow, ['plan', 'implement', 'test']);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing steps', () => {
      const result = validateExecutionOrder(simpleWorkflow, ['plan', 'implement']);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('missing'))).toBe(true);
    });

    it('should detect unknown steps', () => {
      const result = validateExecutionOrder(simpleWorkflow, ['plan', 'implement', 'test', 'unknown']);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('unknown'))).toBe(true);
    });

    it('should detect incorrect order', () => {
      const result = validateExecutionOrder(simpleWorkflow, ['implement', 'plan', 'test']);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('before'))).toBe(true);
    });

    it('should validate order with parallel steps', () => {
      // Both frontend and backend can come after start, before deploy
      const validOrder1 = ['start', 'frontend', 'backend', 'deploy'];
      const validOrder2 = ['start', 'backend', 'frontend', 'deploy'];

      expect(validateExecutionOrder(parallelWorkflow, validOrder1).valid).toBe(true);
      expect(validateExecutionOrder(parallelWorkflow, validOrder2).valid).toBe(true);
    });

    it('should reject order where dependency comes after dependent', () => {
      const invalidOrder = ['start', 'deploy', 'frontend', 'backend'];
      const result = validateExecutionOrder(parallelWorkflow, invalidOrder);

      expect(result.valid).toBe(false);
    });
  });
});
