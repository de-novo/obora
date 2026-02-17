import { describe, it, expect, vi } from 'vitest';
import {
  validateWorkflow,
  parseAndValidate,
  validateSchema,
  validateCircularDependencies,
  validateSelfReferences,
  validateMissingReferences,
  validateInputs,
} from '../workflow-validator.js';
import type { Workflow } from '../../types/workflow.js';

describe('workflow-validator', () => {
  const validWorkflow: Workflow = {
    name: 'test-workflow',
    version: '1.0',
    description: 'Test workflow for validation',
    mode: 'auto',
    config: {
      retry: 3,
      retry_delay: '5s',
      continue_on_error: false,
      max_parallel: 2,
    },
    steps: [
      {
        name: 'plan',
        agent: 'architect',
        description: 'Plan the implementation',
        timeout: '30m',
        outputs: ['design.md'],
      },
      {
        name: 'implement',
        agent: 'coder',
        depends_on: ['plan'],
        inputs: ['design.md'],
        outputs: ['code.ts'],
        timeout: '1h',
      },
      {
        name: 'test',
        agent: 'tester',
        depends_on: ['implement'],
        inputs: ['code.ts'],
        timeout: '15m',
      },
    ],
  };

  describe('validateWorkflow', () => {
    it('should accept valid workflow', () => {
      const result = validateWorkflow(validWorkflow);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      // Missing steps field
      const missingSteps = {
        name: 'test-workflow',
        mode: 'auto',
      } as unknown as Workflow;
      const result = validateWorkflow(missingSteps);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_SCHEMA')).toBe(true);
    });

    it('should detect duplicate step names via parseAndValidate', () => {
      // Duplicate check happens in parser, not in validateWorkflow directly
      const yaml = `
name: test-workflow
mode: auto
steps:
  - name: plan
    agent: architect
  - name: plan
    agent: coder
`;
      const result = parseAndValidate(yaml);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'E2006')).toBe(true);
    });

    it('should detect circular dependencies', () => {
      const cyclicWorkflow: Workflow = {
        name: 'cyclic-workflow',
        mode: 'auto',
        steps: [
          { name: 'step-a', agent: 'agent-a', depends_on: ['step-c'] },
          { name: 'step-b', agent: 'agent-b', depends_on: ['step-a'] },
          { name: 'step-c', agent: 'agent-c', depends_on: ['step-b'] },
        ],
      };

      const result = validateWorkflow(cyclicWorkflow);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'CIRCULAR_DEPENDENCY',
        })
      );
    });

    it('should detect self-references', () => {
      const selfRefWorkflow: Workflow = {
        name: 'self-ref-workflow',
        mode: 'auto',
        steps: [
          { name: 'step-a', agent: 'agent-a', depends_on: ['step-a'] },
        ],
      };

      const result = validateWorkflow(selfRefWorkflow);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'SELF_REFERENCE',
        })
      );
    });

    it('should detect missing references', () => {
      const workflowWithMissingRef: Workflow = {
        name: 'test-workflow',
        mode: 'auto',
        steps: [
          { name: 'plan', agent: 'architect' },
          { name: 'implement', agent: 'coder', depends_on: ['non-existent-step'] },
        ],
      };

      const result = validateWorkflow(workflowWithMissingRef);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_REFERENCE',
        })
      );
    });

    it('should detect unresolved inputs as warnings', () => {
      const workflowWithUnresolvedInput: Workflow = {
        name: 'test-workflow',
        mode: 'auto',
        steps: [
          { name: 'plan', agent: 'architect', outputs: ['design.md'] },
          { name: 'implement', agent: 'coder', inputs: ['missing.md'] },
        ],
      };

      const result = validateWorkflow(workflowWithUnresolvedInput);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'UNRESOLVED_INPUT',
        })
      );
    });

    it('should ignore spec files in unresolved inputs', () => {
      const workflowWithSpecFiles: Workflow = {
        name: 'test-workflow',
        mode: 'auto',
        steps: [
          { name: 'plan', agent: 'architect', inputs: ['proposal.md', 'design.md'] },
          { name: 'implement', agent: 'coder', outputs: ['code.ts'] },
        ],
      };

      const result = validateWorkflow(workflowWithSpecFiles);
      expect(result.warnings.every((w) => w.code !== 'UNRESOLVED_INPUT')).toBe(true);
    });

    it('should handle empty steps array', () => {
      const emptyStepsWorkflow: Workflow = {
        name: 'test-workflow',
        mode: 'auto',
        steps: [],
      };

      const result = validateWorkflow(emptyStepsWorkflow);
      expect(result.isValid).toBe(true);
    });
  });

  describe('mode enum validation', () => {
    it.each(['auto', 'supervised', 'gated', 'manual'])(
      'should accept valid mode: %s',
      (mode) => {
        const workflow = { ...validWorkflow, mode: mode as 'auto' | 'supervised' | 'gated' | 'manual' };
        const result = validateWorkflow(workflow);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }
    );

    it('should reject invalid mode', () => {
      const workflow = { ...validWorkflow, mode: 'invalid' as any };
      const result = validateWorkflow(workflow);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_SCHEMA')).toBe(true);
    });
  });

  describe('agent name validation', () => {
    it('should accept empty agent name (current schema allows it)', () => {
      // Note: Current schema allows empty strings - this documents the behavior
      // If stricter validation is needed, update schema with minLength
      const workflow: Workflow = {
        name: 'test-workflow',
        mode: 'auto',
        steps: [
          {
            name: 'plan',
            agent: '', // Empty string - currently allowed by schema
          },
        ],
      };

      const result = validateWorkflow(workflow);
      // Schema validation passes (no errors from schema)
      // But validateInputs may add warnings
      expect(result.errors.every((e) => e.code !== 'INVALID_SCHEMA')).toBe(true);
    });

    it('should accept whitespace-only agent name (current schema allows it)', () => {
      // Note: Current schema allows whitespace-only strings
      const workflow: Workflow = {
        name: 'test-workflow',
        mode: 'auto',
        steps: [
          {
            name: 'plan',
            agent: '   ', // Whitespace only - currently allowed by schema
          },
        ],
      };

      const result = validateWorkflow(workflow);
      // Schema validation passes (no errors from schema)
      expect(result.errors.every((e) => e.code !== 'INVALID_SCHEMA')).toBe(true);
    });

    it('should validate agent name with proper value', () => {
      const workflow: Workflow = {
        name: 'test-workflow',
        mode: 'auto',
        steps: [
          {
            name: 'plan',
            agent: 'architect', // Proper value
          },
        ],
      };

      const result = validateWorkflow(workflow);
      expect(result.isValid).toBe(true);
    });
  });

  describe('parseAndValidate', () => {
    it('should parse and validate valid YAML', () => {
      const yaml = `
name: test-workflow
mode: auto
steps:
  - name: plan
    agent: architect
`;
      const result = parseAndValidate(yaml);
      expect(result.isValid).toBe(true);
    });

    it('should reject malformed YAML', () => {
      const malformedYaml = `
name: test-workflow
mode: auto
steps:
  - name: plan
    agent: architect
    description: "unclosed quote
`;
      const result = parseAndValidate(malformedYaml);
      expect(result.isValid).toBe(false);
    });

    it('should reject YAML with invalid indentation', () => {
      const invalidIndentYaml = `
name: test-workflow
mode: auto
steps:
 - name: plan
  agent: architect
`;
      const result = parseAndValidate(invalidIndentYaml);
      expect(result.isValid).toBe(false);
    });

    it('should reject YAML with unclosed quotes', () => {
      const unclosedQuoteYaml = `
name: test-workflow
mode: auto
steps:
  - name: plan
    agent: "architect
`;
      const result = parseAndValidate(unclosedQuoteYaml);
      expect(result.isValid).toBe(false);
    });
  });

  describe('validateSchema', () => {
    it('should validate valid workflow schema', () => {
      const errors = validateSchema(validWorkflow);
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid mode', () => {
      const invalidWorkflow: Workflow = {
        name: 'test-workflow',
        mode: 'invalid' as any,
        steps: [{ name: 'plan', agent: 'architect' }],
      };

      const errors = validateSchema(invalidWorkflow);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].code).toBe('INVALID_SCHEMA');
    });

    it('should reject invalid timeout format', () => {
      const invalidTimeoutWorkflow: Workflow = {
        name: 'test-workflow',
        mode: 'auto',
        steps: [
          {
            name: 'plan',
            agent: 'architect',
            timeout: '0s', // invalid: starts with 0
          },
        ],
      };

      const errors = validateSchema(invalidTimeoutWorkflow);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('pattern'))).toBe(true);
    });

    it('should reject timeout with letters only', () => {
      const invalidTimeoutWorkflow: Workflow = {
        name: 'test-workflow',
        mode: 'auto',
        steps: [
          {
            name: 'plan',
            agent: 'architect',
            timeout: 'abc', // invalid: no numbers
          },
        ],
      };

      const errors = validateSchema(invalidTimeoutWorkflow);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject timeout with decimal numbers', () => {
      const invalidTimeoutWorkflow: Workflow = {
        name: 'test-workflow',
        mode: 'auto',
        steps: [
          {
            name: 'plan',
            agent: 'architect',
            timeout: '5.5s', // invalid: decimal
          },
        ],
      };

      const errors = validateSchema(invalidTimeoutWorkflow);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept empty agent name (schema allows empty strings)', () => {
      // Note: The current schema allows empty strings for agent
      // If stricter validation is needed, minLength should be added to schema
      const emptyAgentWorkflow: Workflow = {
        name: 'test-workflow',
        mode: 'auto',
        steps: [
          {
            name: 'plan',
            agent: '', // Schema allows empty string
          },
        ],
      };

      const errors = validateSchema(emptyAgentWorkflow);
      // Schema allows empty strings, no errors expected
      expect(errors.length).toBe(0);
    });

    it('should reject missing agent field', () => {
      const missingAgentWorkflow = {
        name: 'test-workflow',
        mode: 'auto',
        steps: [
          {
            name: 'plan',
            // agent is missing - this should fail schema validation
          },
        ],
      };

      const errors = validateSchema(missingAgentWorkflow);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].code).toBe('INVALID_SCHEMA');
    });

    it('should validate config retry_delay pattern', () => {
      const workflow = {
        name: 'test-workflow',
        mode: 'auto' as const,
        config: {
          retry_delay: '0s', // invalid pattern
        },
        steps: [{ name: 'plan', agent: 'architect' }],
      };

      const errors = validateSchema(workflow);
      expect(errors.some((e) => e.message.includes('pattern'))).toBe(true);
    });

    it('should validate max_parallel minimum value', () => {
      const workflow = {
        name: 'test-workflow',
        mode: 'auto' as const,
        config: {
          max_parallel: 0, // minimum is 1
        },
        steps: [{ name: 'plan', agent: 'architect' }],
      };

      const errors = validateSchema(workflow);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].code).toBe('INVALID_SCHEMA');
    });
  });

  describe('validateCircularDependencies', () => {
    it('should detect circular dependencies', () => {
      const steps = [
        { name: 'step-a', agent: 'agent-a', depends_on: ['step-c'] },
        { name: 'step-b', agent: 'agent-b', depends_on: ['step-a'] },
        { name: 'step-c', agent: 'agent-c', depends_on: ['step-b'] },
      ];

      const errors = validateCircularDependencies(steps);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('CIRCULAR_DEPENDENCY');
    });

    it('should not detect cycles in acyclic graph', () => {
      const steps = [
        { name: 'plan', agent: 'architect' },
        { name: 'implement', agent: 'coder', depends_on: ['plan'] },
        { name: 'test', agent: 'tester', depends_on: ['implement'] },
      ];

      const errors = validateCircularDependencies(steps);
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateSelfReferences', () => {
    it('should detect self-references', () => {
      const steps = [
        { name: 'step-a', agent: 'agent-a', depends_on: ['step-a'] },
      ];

      const errors = validateSelfReferences(steps);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('SELF_REFERENCE');
    });

    it('should not detect self-references when none exist', () => {
      const steps = [
        { name: 'plan', agent: 'architect' },
        { name: 'implement', agent: 'coder', depends_on: ['plan'] },
      ];

      const errors = validateSelfReferences(steps);
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateMissingReferences', () => {
    it('should detect missing references', () => {
      const steps = [
        { name: 'plan', agent: 'architect' },
        { name: 'implement', agent: 'coder', depends_on: ['non-existent'] },
      ];

      const errors = validateMissingReferences(steps);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('MISSING_REFERENCE');
    });

    it('should not report errors when all references exist', () => {
      const steps = [
        { name: 'plan', agent: 'architect' },
        { name: 'implement', agent: 'coder', depends_on: ['plan'] },
      ];

      const errors = validateMissingReferences(steps);
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateInputs', () => {
    it('should detect unresolved inputs', () => {
      const steps = [
        { name: 'plan', agent: 'architect', outputs: ['design.md'] },
        { name: 'implement', agent: 'coder', inputs: ['missing.md'] },
      ];

      const result = validateInputs(steps);
      const unresolved = result.filter((r) => r.code === 'UNRESOLVED_INPUT');
      expect(unresolved).toHaveLength(1);
    });

    it('should ignore spec files', () => {
      const steps = [
        { name: 'plan', agent: 'architect', inputs: ['proposal.md', 'design.md', 'tasks.md', 'status.yaml'] },
      ];

      const result = validateInputs(steps);
      const unresolved = result.filter((r) => r.code === 'UNRESOLVED_INPUT');
      expect(unresolved).toHaveLength(0);
    });

    it('should not report warnings when all inputs are resolved', () => {
      const steps = [
        { name: 'plan', agent: 'architect', outputs: ['design.md'] },
        { name: 'implement', agent: 'coder', inputs: ['design.md'] },
      ];

      const result = validateInputs(steps);
      const unresolved = result.filter((r) => r.code === 'UNRESOLVED_INPUT');
      expect(unresolved).toHaveLength(0);
    });
  });
});
