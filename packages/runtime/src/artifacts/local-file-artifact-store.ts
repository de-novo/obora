import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative, resolve } from "node:path";

import type { ArtifactRecord, ArtifactStore } from "./types.js";

interface LocalFileArtifactStoreOptions {
  basePath?: string;
}

const META_SUFFIX = ".meta.json";

export class LocalFileArtifactStore implements ArtifactStore {
  private readonly basePath: string;

  constructor(options: LocalFileArtifactStoreOptions = {}) {
    this.basePath = options.basePath ?? "./data/artifacts";
  }

  async save(runId: string, stepName: string, name: string, data: Buffer, mime: string): Promise<ArtifactRecord> {
    const id = randomUUID();
    const safeRunId = this.sanitizeSegment(runId, "runId");
    const safeStepName = this.sanitizeSegment(stepName, "stepName");
    const safeName = this.sanitizeSegment(name, "name", { allowDots: true });

    const dir = this.resolveInsideBase(safeRunId, safeStepName);
    const storedName = `${id}__${safeName}`;
    const filePath = this.resolveInsideBase(safeRunId, safeStepName, storedName);
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, data);

    const record: ArtifactRecord = {
      id,
      runId,
      stepName,
      name,
      mime,
      size: data.byteLength,
      path: filePath,
      createdAt: new Date().toISOString(),
    };

    const metaPath = this.metaPath(filePath);
    const tempMetaPath = `${metaPath}.tmp`;
    await writeFile(tempMetaPath, JSON.stringify(record, null, 2), "utf-8");
    await rename(tempMetaPath, metaPath);
    return record;
  }

  async get(artifactId: string): Promise<{ record: ArtifactRecord; data: Buffer }> {
    const metas = await this.scanMetaFiles();
    const meta = metas.find((m) => m.id === artifactId);
    if (!meta) {
      throw new Error(`Artifact not found: ${artifactId}`);
    }
    const data = await readFile(meta.path);
    return { record: meta, data };
  }

  async list(runId: string, stepName?: string): Promise<ArtifactRecord[]> {
    const metas = await this.scanMetaFiles();
    return metas
      .filter((m) => m.runId === runId && (stepName ? m.stepName === stepName : true))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async delete(artifactId: string): Promise<void> {
    const metas = await this.scanMetaFiles();
    const meta = metas.find((m) => m.id === artifactId);
    if (!meta) {
      return;
    }

    await rm(meta.path, { force: true });
    await rm(this.metaPath(meta.path), { force: true });

    // best-effort empty directory cleanup
    const stepDir = dirname(meta.path);
    const runDir = dirname(stepDir);
    await this.cleanupIfEmpty(stepDir);
    await this.cleanupIfEmpty(runDir);
  }

  private async scanMetaFiles(): Promise<ArtifactRecord[]> {
    const records: ArtifactRecord[] = [];
    await this.walk(this.basePath, async (path) => {
      if (!path.endsWith(META_SUFFIX)) return;
      const raw = await readFile(path, "utf-8");
      try {
        const parsed = JSON.parse(raw) as ArtifactRecord;
        records.push(parsed);
      } catch {
        // ignore corrupted meta files; valid records remain accessible
      }
    });
    return records;
  }

  private async walk(path: string, onFile: (path: string) => Promise<void>): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(path);
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = join(path, entry);
      const st = await stat(full);
      if (st.isDirectory()) {
        await this.walk(full, onFile);
      } else if (st.isFile()) {
        await onFile(full);
      }
    }
  }

  private metaPath(filePath: string): string {
    return `${filePath}${META_SUFFIX}`;
  }

  private sanitizeSegment(value: string, field: string, options: { allowDots?: boolean } = {}): string {
    const normalized = normalize(value).replace(/\\/g, "/").trim();
    if (!normalized || normalized === "." || normalized === "..") {
      throw new Error(`Invalid artifact ${field}`);
    }

    const parts = normalized.split("/").filter(Boolean);
    if (parts.length !== 1) {
      throw new Error(`Invalid artifact ${field}: path separators are not allowed`);
    }

    const [segment] = parts;
    if (segment === undefined) {
      throw new Error(`Invalid artifact ${field}: empty path segment`);
    }
    if (!options.allowDots && segment.includes(".")) {
      throw new Error(`Invalid artifact ${field}: dots are not allowed`);
    }
    if (segment.includes("..")) {
      throw new Error(`Invalid artifact ${field}`);
    }

    return segment;
  }

  private resolveInsideBase(...segments: string[]): string {
    const base = resolve(this.basePath);
    const target = resolve(base, ...segments);
    const rel = relative(base, target);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      throw new Error("Artifact path escapes basePath");
    }
    return target;
  }

  private async cleanupIfEmpty(path: string): Promise<void> {
    try {
      const entries = await readdir(path);
      if (entries.length === 0) {
        try {
          await rm(path, { recursive: true, force: true });
        } catch {
          // best-effort in concurrent delete scenarios
        }
      }
    } catch {
      // ignore
    }
  }
}
