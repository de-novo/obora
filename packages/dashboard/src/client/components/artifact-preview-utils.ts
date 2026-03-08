import type { ArtifactPreviewResponse } from '../api/history-client';

export interface FormattedArtifactPreview {
  mode: 'json' | 'text';
  displayText: string;
  lines: string[];
  lineCount: number;
}

function isJsonArtifact(preview: ArtifactPreviewResponse): boolean {
  return (
    preview.contentType === 'application/json' ||
    preview.artifact.mimeType === 'application/json' ||
    /\.json$/i.test(preview.artifact.name)
  );
}

export function formatArtifactPreview(preview: ArtifactPreviewResponse): FormattedArtifactPreview {
  const rawText = preview.text ?? '';

  if (isJsonArtifact(preview)) {
    try {
      const parsed = JSON.parse(rawText);
      const displayText = JSON.stringify(parsed, null, 2);
      const lines = displayText.split(/\r?\n/);
      return {
        mode: 'json',
        displayText,
        lines,
        lineCount: lines.length,
      };
    } catch {
      // fall through to plain text rendering
    }
  }

  const lines = rawText.split(/\r?\n/);
  return {
    mode: 'text',
    displayText: rawText,
    lines,
    lineCount: lines.length,
  };
}
