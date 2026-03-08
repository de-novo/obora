import { describe, expect, it } from 'vitest';

import { formatArtifactPreview } from '../components/artifact-preview-utils';

describe('artifact-preview-utils', () => {
  it('pretty-prints json previews', () => {
    const formatted = formatArtifactPreview({
      artifact: {
        id: 'a1',
        runId: 'run-1',
        stepName: 'validate',
        name: 'result.json',
        mimeType: 'application/json',
        sizeBytes: 20,
        storageRef: 'artifacts/result.json',
        createdAt: '2026-03-08T00:00:00.000Z',
      },
      supported: true,
      contentType: 'application/json',
      text: '{"ok":true,"count":2}',
      truncated: false,
    });

    expect(formatted.mode).toBe('json');
    expect(formatted.displayText).toContain('\n  "ok": true,');
    expect(formatted.lineCount).toBeGreaterThan(1);
  });

  it('falls back to text rendering when json parsing fails', () => {
    const formatted = formatArtifactPreview({
      artifact: {
        id: 'a2',
        runId: 'run-1',
        stepName: 'validate',
        name: 'broken.json',
        mimeType: 'application/json',
        sizeBytes: 20,
        storageRef: 'artifacts/broken.json',
        createdAt: '2026-03-08T00:00:00.000Z',
      },
      supported: true,
      contentType: 'application/json',
      text: '{not-valid-json}',
      truncated: false,
    });

    expect(formatted.mode).toBe('text');
    expect(formatted.displayText).toBe('{not-valid-json}');
  });
});
