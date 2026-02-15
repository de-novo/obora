import { describe, it, expect } from 'vitest';
import {
  buildGraph,
  detectCycles,
  topologicalSort,
  computeLevels,
  groupByLevel,
} from '../index.js';
import type { Step } from '../../types/workflow.js';

describe('graph/index', () => {
  describe('buildGraph', () => {
    it('should build empty graph from empty steps', () => {
      const steps: Step[] = [];
      const graph = buildGraph(steps);

      expect(graph.nodes.size).toBe(0);
      expect(graph.edges.size).toBe(0);
      expect(graph.reverseEdges.size).toBe(0);
    });

    it('should build single node graph', () => {
      const steps: Step[] = [{ name: 'plan', agent: 'architect' }];
      const graph = buildGraph(steps);

      expect(graph.nodes.size).toBe(1);
      expect(graph.nodes.has('plan')).toBe(true);
      expect(graph.edges.get('plan')!.size).toBe(0);
      expect(graph.reverseEdges.get('plan')!.size).toBe(0);
    });

    it('should build graph with explicit dependencies', () => {
      const steps: Step[] = [
        { name: 'plan', agent: 'architect' },
        { name: 'implement', agent: 'coder', depends_on: ['plan'] },
        { name: 'test', agent: 'tester', depends_on: ['implement'] },
      ];

      const graph = buildGraph(steps);

      expect(graph.nodes.size).toBe(3);
      expect(graph.edges.get('plan')!.has('implement')).toBe(true);
      expect(graph.edges.get('implement')!.has('test')).toBe(true);
      expect(graph.reverseEdges.get('implement')!.has('plan')).toBe(true);
      expect(graph.reverseEdges.get('test')!.has('implement')).toBe(true);
    });

    it('should build graph with implicit dependencies via inputs/outputs', () => {
      const steps: Step[] = [
        { name: 'plan', agent: 'architect', outputs: ['design.md'] },
        { name: 'implement', agent: 'coder', inputs: ['design.md'], outputs: ['code.ts'] },
        { name: 'test', agent: 'tester', inputs: ['code.ts'] },
      ];

      const graph = buildGraph(steps);

      // Implicit dependency: implement depends on plan (via design.md)
      expect(graph.reverseEdges.get('implement')!.has('plan')).toBe(true);
      // Implicit dependency: test depends on implement (via code.ts)
      expect(graph.reverseEdges.get('test')!.has('implement')).toBe(true);
    });

    it('should handle mixed explicit and implicit dependencies', () => {
      const steps: Step[] = [
        { name: 'spec', agent: 'analyst', outputs: ['proposal.md'] },
        { name: 'design', agent: 'architect', inputs: ['proposal.md'], outputs: ['design.md'] },
        { name: 'implement', agent: 'coder', depends_on: ['design'], inputs: ['design.md'], outputs: ['code.ts'] },
      ];

      const graph = buildGraph(steps);

      // spec -> design (implicit via proposal.md)
      expect(graph.reverseEdges.get('design')!.has('spec')).toBe(true);
      // design -> implement (explicit depends_on + implicit via design.md)
      expect(graph.reverseEdges.get('implement')!.has('design')).toBe(true);
    });

    it('should ignore non-existent dependencies', () => {
      const steps: Step[] = [
        { name: 'plan', agent: 'architect' },
        { name: 'implement', agent: 'coder', depends_on: ['non-existent'] },
      ];

      const graph = buildGraph(steps);

      // non-existent dependency should be ignored
      expect(graph.reverseEdges.get('implement')!.has('non-existent')).toBe(false);
    });
  });

  describe('detectCycles', () => {
    it('should detect no cycle in empty graph', () => {
      const steps: Step[] = [];
      const graph = buildGraph(steps);
      const result = detectCycles(graph);

      expect(result.hasCycle).toBe(false);
      expect(result.cyclePath).toBeUndefined();
    });

    it('should detect no cycle in single node', () => {
      const steps: Step[] = [{ name: 'plan', agent: 'architect' }];
      const graph = buildGraph(steps);
      const result = detectCycles(graph);

      expect(result.hasCycle).toBe(false);
    });

    it('should detect no cycle in linear graph', () => {
      const steps: Step[] = [
        { name: 'plan', agent: 'architect' },
        { name: 'implement', agent: 'coder', depends_on: ['plan'] },
        { name: 'test', agent: 'tester', depends_on: ['implement'] },
      ];

      const graph = buildGraph(steps);
      const result = detectCycles(graph);

      expect(result.hasCycle).toBe(false);
    });

    it('should detect cycle in graph', () => {
      const steps: Step[] = [
        { name: 'step-a', agent: 'agent-a', depends_on: ['step-c'] },
        { name: 'step-b', agent: 'agent-b', depends_on: ['step-a'] },
        { name: 'step-c', agent: 'agent-c', depends_on: ['step-b'] },
      ];

      const graph = buildGraph(steps);
      const result = detectCycles(graph);

      expect(result.hasCycle).toBe(true);
      expect(result.cyclePath).toBeDefined();
      expect(result.cyclePath!.length).toBeGreaterThan(2);
    });

    it('should detect cycle with two nodes', () => {
      const steps: Step[] = [
        { name: 'step-a', agent: 'agent-a', depends_on: ['step-b'] },
        { name: 'step-b', agent: 'agent-b', depends_on: ['step-a'] },
      ];

      const graph = buildGraph(steps);
      const result = detectCycles(graph);

      expect(result.hasCycle).toBe(true);
    });

    it('should detect cycle via implicit dependencies', () => {
      const steps: Step[] = [
        { name: 'step-a', agent: 'agent-a', outputs: ['file-a.md'], inputs: ['file-c.md'] },
        { name: 'step-b', agent: 'agent-b', outputs: ['file-b.md'], inputs: ['file-a.md'] },
        { name: 'step-c', agent: 'agent-c', outputs: ['file-c.md'], inputs: ['file-b.md'] },
      ];

      const graph = buildGraph(steps);
      const result = detectCycles(graph);

      expect(result.hasCycle).toBe(true);
    });
  });

  describe('topologicalSort', () => {
    it('should sort empty graph', () => {
      const steps: Step[] = [];
      const graph = buildGraph(steps);
      const result = topologicalSort(graph);

      expect(result.success).toBe(true);
      expect(result.order).toEqual([]);
    });

    it('should sort single node', () => {
      const steps: Step[] = [{ name: 'plan', agent: 'architect' }];
      const graph = buildGraph(steps);
      const result = topologicalSort(graph);

      expect(result.success).toBe(true);
      expect(result.order).toEqual(['plan']);
    });

    it('should sort linear graph', () => {
      const steps: Step[] = [
        { name: 'plan', agent: 'architect' },
        { name: 'implement', agent: 'coder', depends_on: ['plan'] },
        { name: 'test', agent: 'tester', depends_on: ['implement'] },
      ];

      const graph = buildGraph(steps);
      const result = topologicalSort(graph);

      expect(result.success).toBe(true);
      expect(result.order).toEqual(['plan', 'implement', 'test']);
    });

    it('should sort graph with multiple roots', () => {
      const steps: Step[] = [
        { name: 'frontend', agent: 'developer' },
        { name: 'backend', agent: 'developer' },
        { name: 'deploy', agent: 'ops', depends_on: ['frontend', 'backend'] },
      ];

      const graph = buildGraph(steps);
      const result = topologicalSort(graph);

      expect(result.success).toBe(true);
      expect(result.order.length).toBe(3);
      // deploy should come after both frontend and backend
      const deployIndex = result.order.indexOf('deploy');
      const frontendIndex = result.order.indexOf('frontend');
      const backendIndex = result.order.indexOf('backend');
      expect(deployIndex).toBeGreaterThan(frontendIndex);
      expect(deployIndex).toBeGreaterThan(backendIndex);
    });

    it('should fail on cyclic graph', () => {
      const steps: Step[] = [
        { name: 'step-a', agent: 'agent-a', depends_on: ['step-c'] },
        { name: 'step-b', agent: 'agent-b', depends_on: ['step-a'] },
        { name: 'step-c', agent: 'agent-c', depends_on: ['step-b'] },
      ];

      const graph = buildGraph(steps);
      const result = topologicalSort(graph);

      expect(result.success).toBe(false);
      expect(result.cyclePath).toBeDefined();
    });

    it('should handle diamond dependency pattern', () => {
      const steps: Step[] = [
        { name: 'start', agent: 'init' },
        { name: 'left', agent: 'worker', depends_on: ['start'] },
        { name: 'right', agent: 'worker', depends_on: ['start'] },
        { name: 'end', agent: 'final', depends_on: ['left', 'right'] },
      ];

      const graph = buildGraph(steps);
      const result = topologicalSort(graph);

      expect(result.success).toBe(true);
      // start must come first
      expect(result.order[0]).toBe('start');
      // end must come last
      expect(result.order[result.order.length - 1]).toBe('end');
    });
  });

  describe('computeLevels', () => {
    it('should compute levels for empty graph', () => {
      const steps: Step[] = [];
      const graph = buildGraph(steps);
      const levels = computeLevels(graph);

      expect(levels.size).toBe(0);
    });

    it('should compute level 0 for single node', () => {
      const steps: Step[] = [{ name: 'plan', agent: 'architect' }];
      const graph = buildGraph(steps);
      const levels = computeLevels(graph);

      expect(levels.get('plan')).toBe(0);
    });

    it('should compute levels for linear graph', () => {
      const steps: Step[] = [
        { name: 'plan', agent: 'architect' },
        { name: 'implement', agent: 'coder', depends_on: ['plan'] },
        { name: 'test', agent: 'tester', depends_on: ['implement'] },
      ];

      const graph = buildGraph(steps);
      const levels = computeLevels(graph);

      expect(levels.get('plan')).toBe(0);
      expect(levels.get('implement')).toBe(1);
      expect(levels.get('test')).toBe(2);
    });

    it('should compute same level for parallel steps', () => {
      const steps: Step[] = [
        { name: 'start', agent: 'init' },
        { name: 'left', agent: 'worker', depends_on: ['start'] },
        { name: 'right', agent: 'worker', depends_on: ['start'] },
        { name: 'end', agent: 'final', depends_on: ['left', 'right'] },
      ];

      const graph = buildGraph(steps);
      const levels = computeLevels(graph);

      expect(levels.get('start')).toBe(0);
      expect(levels.get('left')).toBe(1);
      expect(levels.get('right')).toBe(1);
      expect(levels.get('end')).toBe(2);
    });

    it('should compute levels based on implicit dependencies', () => {
      const steps: Step[] = [
        { name: 'plan', agent: 'architect', outputs: ['design.md'] },
        { name: 'implement', agent: 'coder', inputs: ['design.md'], outputs: ['code.ts'] },
        { name: 'test', agent: 'tester', inputs: ['code.ts'] },
      ];

      const graph = buildGraph(steps);
      const levels = computeLevels(graph);

      expect(levels.get('plan')).toBe(0);
      expect(levels.get('implement')).toBeGreaterThan(levels.get('plan')!);
      expect(levels.get('test')).toBeGreaterThan(levels.get('implement')!);
    });

    it('should handle all nodes at level 0 when no dependencies', () => {
      const steps: Step[] = [
        { name: 'task-a', agent: 'worker' },
        { name: 'task-b', agent: 'worker' },
        { name: 'task-c', agent: 'worker' },
      ];

      const graph = buildGraph(steps);
      const levels = computeLevels(graph);

      expect(levels.get('task-a')).toBe(0);
      expect(levels.get('task-b')).toBe(0);
      expect(levels.get('task-c')).toBe(0);
    });

    it('should handle deep dependency chain', () => {
      const steps: Step[] = [];
      for (let i = 0; i < 10; i++) {
        steps.push({
          name: `step-${i}`,
          agent: 'worker',
          depends_on: i > 0 ? [`step-${i - 1}`] : [],
        });
      }

      const graph = buildGraph(steps);
      const levels = computeLevels(graph);

      for (let i = 0; i < 10; i++) {
        expect(levels.get(`step-${i}`)).toBe(i);
      }
    });
  });

  describe('groupByLevel', () => {
    it('should group empty steps', () => {
      const steps: Step[] = [];
      const groups = groupByLevel(steps);

      expect(groups.size).toBe(0);
    });

    it('should group single step at level 0', () => {
      const steps: Step[] = [{ name: 'plan', agent: 'architect' }];
      const groups = groupByLevel(steps);

      expect(groups.size).toBe(1);
      expect(groups.get(0)!.length).toBe(1);
      expect(groups.get(0)![0].name).toBe('plan');
    });

    it('should group parallel steps at same level', () => {
      const steps: Step[] = [
        { name: 'start', agent: 'init' },
        { name: 'left', agent: 'worker', depends_on: ['start'] },
        { name: 'right', agent: 'worker', depends_on: ['start'] },
        { name: 'end', agent: 'final', depends_on: ['left', 'right'] },
      ];

      const groups = groupByLevel(steps);

      expect(groups.size).toBe(3);
      expect(groups.get(0)!.length).toBe(1); // start
      expect(groups.get(1)!.length).toBe(2); // left, right
      expect(groups.get(2)!.length).toBe(1); // end
    });

    it('should maintain step order within level', () => {
      const steps: Step[] = [
        { name: 'task-a', agent: 'worker' },
        { name: 'task-b', agent: 'worker' },
        { name: 'task-c', agent: 'worker' },
      ];

      const groups = groupByLevel(steps);

      expect(groups.size).toBe(1);
      const level0 = groups.get(0)!;
      expect(level0.map((s) => s.name)).toContain('task-a');
      expect(level0.map((s) => s.name)).toContain('task-b');
      expect(level0.map((s) => s.name)).toContain('task-c');
    });
  });
});
