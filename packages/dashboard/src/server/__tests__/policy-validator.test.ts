import { describe, expect, it } from 'vitest';

import { parsePolicyYaml, validatePolicyYaml } from '../policy/policy-validator.js';

describe('policy validator', () => {
  it('accepts a minimal valid policy document', () => {
    const result = parsePolicyYaml([
      'version: "1"',
      'tools:',
      '  - name: shell',
      '    effect: allow',
      'gates: []',
      'sandbox:',
      '  mode: readonly',
      'resources:',
      '  cpu: low',
      '',
    ].join('\n'));

    expect(result.errors).toEqual([]);
    expect(result.policySet).toEqual(
      expect.objectContaining({
        version: '1',
        tools: [expect.objectContaining({ name: 'shell', effect: 'allow' })],
      }),
    );
    expect(validatePolicyYaml('version: "1"\ntools: []\n')).toEqual({ valid: true, errors: [] });
  });

  it('accepts omitted optional sections and all supported tool effects', () => {
    expect(validatePolicyYaml('version: "1"\n')).toEqual({ valid: true, errors: [] });

    const result = validatePolicyYaml([
      'tools:',
      '  - name: shell',
      '    effect: deny',
      '  - name: rewrite',
      '    effect: transform',
      '  - name: approval',
      '    effect: gate',
      '',
    ].join('\n'));

    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('returns schema errors for invalid top-level and section shapes', () => {
    expect(parsePolicyYaml('- item').errors).toEqual(['Invalid policy YAML: expected object']);

    const result = validatePolicyYaml([
      'version: 1',
      'tools: not-array',
      'gates: not-array',
      'sandbox: []',
      'resources: []',
      '',
    ].join('\n'));

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      'Invalid version: expected string',
      'Invalid tools: expected array',
      'Invalid gates: expected array',
      'Invalid sandbox: expected object',
      'Invalid resources: expected object',
    ]);
  });

  it('returns schema errors for invalid tool entries', () => {
    const result = validatePolicyYaml([
      'tools:',
      '  - invalid',
      '  - name: ""',
      '    effect: allow',
      '  - name: shell',
      '    effect: audit',
      '',
    ].join('\n'));

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      'Invalid tools[0]: expected object',
      'Invalid tools[1].name: expected non-empty string',
      'Invalid tools[2].effect: audit',
    ]);
  });

  it('returns every tool field error for object entries with missing values', () => {
    const result = validatePolicyYaml([
      'tools:',
      '  - {}',
      '  - name: 3',
      '    effect: allow',
      '  - name: shell',
      '',
    ].join('\n'));

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      'Invalid tools[0].name: expected non-empty string',
      'Invalid tools[0].effect: undefined',
      'Invalid tools[1].name: expected non-empty string',
      'Invalid tools[2].effect: undefined',
    ]);
  });

  it('returns parser errors for malformed YAML', () => {
    const result = validatePolicyYaml('tools: [');

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('unexpected end of the stream');
  });
});
