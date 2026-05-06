import { describe, expect, it } from 'vitest';

import type { ArtifactRecord } from '../../shared/history-types';
import { formatArtifactPreview } from '../components/artifact-preview-utils';

const baseArtifact = (overrides: Partial<ArtifactRecord> = {}): ArtifactRecord => ({
  id: 'a1',
  runId: 'run-1',
  stepName: 'validate',
  name: 'result.txt',
  mimeType: 'text/plain',
  sizeBytes: 20,
  storageRef: 'artifacts/result.txt',
  createdAt: '2026-03-08T00:00:00.000Z',
  ...overrides,
});

describe('artifact-preview-utils', () => {
  it('pretty-prints json previews', () => {
    const formatted = formatArtifactPreview({
      artifact: baseArtifact({ name: 'result.json', mimeType: 'application/json', storageRef: 'artifacts/result.json' }),
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
      artifact: baseArtifact({ id: 'a2', name: 'broken.json', mimeType: 'application/json', storageRef: 'artifacts/broken.json' }),
      supported: true,
      contentType: 'application/json',
      text: '{not-valid-json}',
      truncated: false,
    });

    expect(formatted.mode).toBe('text');
    expect(formatted.displayText).toBe('{not-valid-json}');
  });

  it('detects json previews from mime type or file extension', () => {
    const byMime = formatArtifactPreview({
      artifact: baseArtifact({ id: 'a3', mimeType: 'application/json' }),
      supported: true,
      contentType: 'text/plain',
      text: '{"source":"mime"}',
      truncated: false,
    });
    const byName = formatArtifactPreview({
      artifact: baseArtifact({ id: 'a4', name: 'output.JSON', mimeType: 'text/plain' }),
      supported: true,
      contentType: 'text/plain',
      text: '{"source":"name"}',
      truncated: false,
    });

    expect(byMime.mode).toBe('json');
    expect(byMime.displayText).toContain('"source": "mime"');
    expect(byName.mode).toBe('json');
    expect(byName.displayText).toContain('"source": "name"');
  });

  it('renders missing text as an empty plain-text preview', () => {
    const formatted = formatArtifactPreview({
      artifact: baseArtifact(),
      supported: true,
      contentType: 'text/plain',
      truncated: false,
    });

    expect(formatted).toEqual({
      mode: 'text',
      displayText: '',
      lines: [''],
      lineCount: 1,
    });
  });
});
