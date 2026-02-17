import { describe, expect, it } from 'vitest';

import { diffYaml } from '../policy/yaml-diff.js';

describe('yaml-diff', () => {
  it('detects added keys', () => {
    const result = diffYaml('version: v1', 'version: v1\ntools:\n  - name: shell_exec');

    expect(result.changes).toEqual([
      expect.objectContaining({ path: 'tools', type: 'added' }),
    ]);
  });

  it('detects removed keys', () => {
    const result = diffYaml('version: v1\nresources:\n  cpu: 1', 'version: v1');

    expect(result.changes).toEqual([
      expect.objectContaining({ path: 'resources', type: 'removed' }),
    ]);
  });

  it('detects modified keys', () => {
    const result = diffYaml('version: v1', 'version: v2');

    expect(result.changes).toEqual([
      expect.objectContaining({ path: 'version', type: 'modified', oldValue: 'v1', newValue: 'v2' }),
    ]);
  });

  it('detects nested key changes', () => {
    const oldYaml = `
resources:
  limits:
    memory: 256Mi
`;
    const newYaml = `
resources:
  limits:
    memory: 512Mi
    cpu: "1"
`;

    const result = diffYaml(oldYaml, newYaml);

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'resources.limits.memory', type: 'modified' }),
        expect.objectContaining({ path: 'resources.limits.cpu', type: 'added' }),
      ]),
    );
  });
});
