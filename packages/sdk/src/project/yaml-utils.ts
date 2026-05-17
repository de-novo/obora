import { readFile, writeFile, access } from "node:fs/promises";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function readYamlFile<T>(path: string): Promise<T | undefined> {
  if (!(await fileExists(path))) {
    return undefined;
  }

  const content = await readFile(path, "utf-8");
  return parseYaml(content) as T;
}

export async function writeYamlFile(path: string, data: unknown): Promise<void> {
  const yaml = stringifyYaml(data, {
    indent: 2,
    lineWidth: 0,
    sortMapEntries: false,
  });
  await writeFile(path, yaml, "utf-8");
}

export function getValueByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, obj);
}

export function setValueByPath(obj: unknown, path: string, value: unknown): void {
  const keys = path.split(".");

  const setNested = (current: unknown, index: number): void => {
    if (current === null || current === undefined || typeof current !== "object") {
      return;
    }

    const key = keys[index];
    if (key === undefined) {
      return;
    }

    if (index === keys.length - 1) {
      (current as Record<string, unknown>)[key] = value;
      return;
    }

    const next = (current as Record<string, unknown>)[key];
    if (next === undefined) {
      (current as Record<string, unknown>)[key] = {};
    }

    setNested((current as Record<string, unknown>)[key], index + 1);
  };

  setNested(obj, 0);
}
