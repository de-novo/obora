import { load } from 'js-yaml';

export type DiffChangeType = 'added' | 'removed' | 'modified';

export interface DiffChange {
  path: string;
  type: DiffChangeType;
  oldValue?: unknown;
  newValue?: unknown;
}

export interface DiffResult {
  changes: DiffChange[];
  summary: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalize = (value: unknown): unknown => {
  if (value === undefined) {
    return null;
  }

  return value;
};

const parseYaml = (content: string): unknown => {
  if (!content.trim()) {
    return {};
  }

  return load(content);
};

const joinPath = (base: string, key: string): string => (base.length > 0 ? `${base}.${key}` : key);

const diffValue = (oldValue: unknown, newValue: unknown, path: string, changes: DiffChange[]): void => {
  if (isRecord(oldValue) && isRecord(newValue)) {
    const keys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);

    [...keys].sort().forEach((key) => {
      const hasOld = Object.prototype.hasOwnProperty.call(oldValue, key);
      const hasNew = Object.prototype.hasOwnProperty.call(newValue, key);
      const nextPath = joinPath(path, key);

      if (!hasOld && hasNew) {
        changes.push({
          path: nextPath,
          type: 'added',
          newValue: normalize((newValue as Record<string, unknown>)[key]),
        });
        return;
      }

      if (hasOld && !hasNew) {
        changes.push({
          path: nextPath,
          type: 'removed',
          oldValue: normalize((oldValue as Record<string, unknown>)[key]),
        });
        return;
      }

      diffValue(
        (oldValue as Record<string, unknown>)[key],
        (newValue as Record<string, unknown>)[key],
        nextPath,
        changes,
      );
    });

    return;
  }

  if (Array.isArray(oldValue) && Array.isArray(newValue)) {
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes.push({
        path,
        type: 'modified',
        oldValue: normalize(oldValue),
        newValue: normalize(newValue),
      });
    }
    return;
  }

  if (oldValue !== newValue) {
    changes.push({
      path,
      type: oldValue === undefined ? 'added' : newValue === undefined ? 'removed' : 'modified',
      oldValue: normalize(oldValue),
      newValue: normalize(newValue),
    });
  }
};

const summarize = (changes: DiffChange[]): string => {
  if (changes.length === 0) {
    return 'No changes detected';
  }

  const added = changes.filter((change) => change.type === 'added').length;
  const removed = changes.filter((change) => change.type === 'removed').length;
  const modified = changes.filter((change) => change.type === 'modified').length;

  return `Changes: ${changes.length} total (added: ${added}, removed: ${removed}, modified: ${modified})`;
};

export const diffYaml = (oldContent: string, newContent: string): DiffResult => {
  const oldParsed = parseYaml(oldContent);
  const newParsed = parseYaml(newContent);

  const changes: DiffChange[] = [];

  if (isRecord(oldParsed) && isRecord(newParsed)) {
    diffValue(oldParsed, newParsed, '', changes);
  } else {
    diffValue(oldParsed, newParsed, 'root', changes);
  }

  return {
    changes,
    summary: summarize(changes),
  };
};
