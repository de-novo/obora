import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import type { LoadedSkill, OboraSkill } from "./types";
import { codeGenSkill } from "./builtin/code-gen";
import { codeReviewSkill } from "./builtin/code-review";
import { testGenSkill } from "./builtin/test-gen";
import { docsGenSkill } from "./builtin/docs-gen";

const BUILTIN_SKILLS: OboraSkill[] = [codeGenSkill, codeReviewSkill, testGenSkill, docsGenSkill];

export interface SkillRegistryOptions {
  cwd?: string;
  globalSkillsDir?: string;
  localSkillsDir?: string;
}

export class SkillRegistry {
  readonly cwd: string;
  readonly localSkillsDir: string;
  readonly globalSkillsDir: string;

  constructor(options: SkillRegistryOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.localSkillsDir = options.localSkillsDir ?? path.join(this.cwd, ".obora", "skills");
    this.globalSkillsDir = options.globalSkillsDir ?? path.join(os.homedir(), ".obora", "skills");
  }

  listAvailableSync(): LoadedSkill[] {
    const items: LoadedSkill[] = BUILTIN_SKILLS.map((skill) => ({ skill, source: "builtin" }));
    items.push(...this.scanDirectory(this.localSkillsDir, "local"));
    items.push(...this.scanDirectory(this.globalSkillsDir, "global"));
    return items;
  }

  getSkillSync(name: string): LoadedSkill | undefined {
    return this.listAvailableSync().find((entry) => entry.skill.name === name);
  }

  async installFromNpm(name: string, opts?: { cwd?: string }): Promise<void> {
    const targetCwd = opts?.cwd ?? this.cwd;
    const skillDir = path.join(targetCwd, ".obora", "skills");
    const packageJsonPath = path.join(skillDir, "package.json");

    if (!existsSync(skillDir)) {
      mkdirSync(skillDir, { recursive: true });
    }

    if (!existsSync(packageJsonPath)) {
      const initialPkg = {
        name: "obora-local-skills",
        private: true,
        version: "0.0.0",
      };
      writeFileSync(packageJsonPath, `${JSON.stringify(initialPkg, null, 2)}\n`, "utf-8");
    }

    execFileSync("pnpm", ["add", name, "--dir", skillDir], { stdio: "inherit" });
  }

  async removeFromNpm(name: string, opts?: { cwd?: string }): Promise<void> {
    const targetCwd = opts?.cwd ?? this.cwd;
    const skillDir = path.join(targetCwd, ".obora", "skills");
    if (!existsSync(skillDir)) return;
    execFileSync("pnpm", ["remove", name, "--dir", skillDir], { stdio: "inherit" });
  }

  private scanDirectory(dirPath: string, source: "local" | "global"): LoadedSkill[] {
    if (!existsSync(dirPath)) return [];

    const found: LoadedSkill[] = [];
    const entries = readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(dirPath, entry.name);
      const resolved = this.tryResolveSkill(skillPath, source);
      if (resolved) found.push(resolved);
    }

    return found;
  }

  private tryResolveSkill(skillPath: string, source: "local" | "global"): LoadedSkill | undefined {
    const packageJsonPath = path.join(skillPath, "package.json");
    if (!existsSync(packageJsonPath)) return undefined;

    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
        name?: string;
        version?: string;
        description?: string;
      };
      const exportedName = pkg.name ?? path.basename(skillPath);

      return {
        source,
        path: skillPath,
        skill: {
          name: exportedName,
          description: pkg.description ?? `External skill: ${exportedName}`,
          version: pkg.version ?? "0.0.0",
          tools: [],
        },
      };
    } catch {
      return undefined;
    }
  }
}
