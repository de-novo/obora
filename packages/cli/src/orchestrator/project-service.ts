/**
 * Project Service
 *
 * 프로젝트 식별, 설정 관리, DB 연동을 담당
 * SaaS 확장을 고려한 설계
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import {
  getDb,
  eq,
  or,
  projects,
  syncEvents,
  type DrizzleDb,
} from "@obora/database";
import { initializeDb } from "./db-init.js";
import type {
  ProjectConfig,
  ProjectIdentifier,
  ResolvedProject,
} from "./types.js";

// ============================================================================
// Constants
// ============================================================================

const OBORA_DIR = ".obora";
const PROJECT_CONFIG_FILE = "project.yaml";
const MAX_PARENT_SEARCH_DEPTH = 10;

// ============================================================================
// ID Generation
// ============================================================================

function generateProjectId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `proj_${timestamp}${random}`;
}

function generateEventId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `evt_${timestamp}${random}`;
}

// ============================================================================
// YAML Parser (Simple)
// ============================================================================

function parseYaml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = content.split("\n");
  const stack: { indent: number; obj: Record<string, unknown> }[] = [
    { indent: -1, obj: result },
  ];

  for (const line of lines) {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const indent = line.search(/\S/);
    const trimmed = line.trim();

    // Find the colon
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    const value = trimmed.slice(colonIndex + 1).trim();

    // Pop stack to find parent
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].obj;

    if (value === "" || value === "|" || value === ">") {
      // Nested object
      const newObj: Record<string, unknown> = {};
      parent[key] = newObj;
      stack.push({ indent, obj: newObj });
    } else {
      // Parse value
      let parsedValue: unknown = value;

      // Remove quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        parsedValue = value.slice(1, -1);
      } else if (value === "true") {
        parsedValue = true;
      } else if (value === "false") {
        parsedValue = false;
      } else if (value === "null") {
        parsedValue = null;
      } else if (/^-?\d+$/.test(value)) {
        parsedValue = parseInt(value, 10);
      } else if (/^-?\d*\.\d+$/.test(value)) {
        parsedValue = parseFloat(value);
      }

      parent[key] = parsedValue;
    }
  }

  return result;
}

function stringifyYaml(obj: Record<string, unknown>, indent = 0): string {
  const lines: string[] = [];
  const prefix = "  ".repeat(indent);

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      continue;
    } else if (typeof value === "object" && !Array.isArray(value)) {
      lines.push(`${prefix}${key}:`);
      lines.push(stringifyYaml(value as Record<string, unknown>, indent + 1));
    } else if (typeof value === "string") {
      // Quote strings with special characters
      if (value.includes(":") || value.includes("#") || value.includes("\n")) {
        lines.push(`${prefix}${key}: "${value.replace(/"/g, '\\"')}"`);
      } else {
        lines.push(`${prefix}${key}: ${value}`);
      }
    } else if (typeof value === "boolean") {
      lines.push(`${prefix}${key}: ${value}`);
    } else if (typeof value === "number") {
      lines.push(`${prefix}${key}: ${value}`);
    }
  }

  return lines.join("\n");
}

// ============================================================================
// Project Service
// ============================================================================

export class ProjectService {
  private db: DrizzleDb | null = null;
  private initialized = false;

  /**
   * 서비스 초기화 (DB 연결)
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    await initializeDb();
    this.db = getDb();

    if (!this.db) {
      console.warn("[ProjectService] Database not available");
      return false;
    }

    this.initialized = true;
    return true;
  }

  // ==========================================================================
  // Project Resolution
  // ==========================================================================

  /**
   * 프로젝트 해석 (cwd → ResolvedProject)
   *
   * 우선순위:
   * 1. .obora/project.yaml의 id (configId)
   * 2. Git remote origin URL
   * 3. 로컬 경로 (fallback)
   */
  async resolveProject(cwd: string): Promise<ResolvedProject> {
    if (!this.initialized) {
      await this.initialize();
    }

    const identifier = this.collectIdentifier(cwd);

    // 1. configId로 해석 시도
    if (identifier.configId) {
      const project = await this.resolveByConfigId(identifier);
      if (project) return project;
    }

    // 2. Git remote로 해석 시도
    if (identifier.gitRemote) {
      const project = await this.resolveByGitRemote(identifier);
      if (project) return project;
    }

    // 3. 경로로 해석 (fallback)
    return this.resolveByPath(identifier);
  }

  /**
   * 프로젝트 식별자 수집
   */
  private collectIdentifier(cwd: string): ProjectIdentifier {
    const projectRoot = this.findProjectRoot(cwd);
    const configPath = join(projectRoot, OBORA_DIR, PROJECT_CONFIG_FILE);
    const identifier: ProjectIdentifier = {
      localPath: projectRoot,
    };

    // .obora/project.yaml에서 configId 추출
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, "utf-8");
        const config = parseYaml(content) as ProjectConfig;
        if (config.id) {
          identifier.configId = config.id;
        }
      } catch {
        // 파싱 실패 시 무시
      }
    }

    // Git remote 추출
    const gitRemote = this.getGitRemoteUrl(projectRoot);
    if (gitRemote) {
      identifier.gitRemote = gitRemote;
    }

    return identifier;
  }

  /**
   * configId로 프로젝트 해석
   */
  private async resolveByConfigId(
    identifier: ProjectIdentifier
  ): Promise<ResolvedProject | null> {
    if (!this.db || !identifier.configId) return null;

    // DB에서 configId로 조회
    const existing = this.db
      .select()
      .from(projects)
      .where(eq(projects.configId, identifier.configId))
      .get();

    if (existing) {
      // 경로가 변경되었으면 업데이트
      if (existing.path !== identifier.localPath) {
        this.db
          .update(projects)
          .set({
            path: identifier.localPath,
            gitRemote: identifier.gitRemote,
            updatedAt: new Date(),
          })
          .where(eq(projects.id, existing.id))
          .run();
      }

      return {
        id: existing.id,
        name: existing.name,
        path: identifier.localPath,
        identifiedBy: "config",
        hasConfig: true,
        syncEnabled: existing.syncEnabled ?? false,
      };
    }

    // DB에 없으면 설정 파일에서 생성
    const config = this.loadConfig(identifier.localPath);
    if (!config) return null;

    const id = generateProjectId();
    this.db
      .insert(projects)
      .values({
        id,
        name: config.name,
        path: identifier.localPath,
        description: config.description,
        configId: config.id,
        gitRemote: identifier.gitRemote,
        syncEnabled: config.sync?.enabled ?? false,
        organizationId: config.sync?.organizationId,
      })
      .run();

    // 이벤트 기록
    this.recordEvent(id, "project.created", "project", id, {
      identifiedBy: "config",
      configId: config.id,
    });

    return {
      id,
      name: config.name,
      path: identifier.localPath,
      identifiedBy: "config",
      hasConfig: true,
      syncEnabled: config.sync?.enabled ?? false,
    };
  }

  /**
   * Git remote로 프로젝트 해석
   */
  private async resolveByGitRemote(
    identifier: ProjectIdentifier
  ): Promise<ResolvedProject | null> {
    if (!this.db || !identifier.gitRemote) return null;

    // DB에서 gitRemote로 조회
    const existing = this.db
      .select()
      .from(projects)
      .where(eq(projects.gitRemote, identifier.gitRemote))
      .get();

    if (existing) {
      // 경로가 변경되었으면 업데이트
      if (existing.path !== identifier.localPath) {
        this.db
          .update(projects)
          .set({
            path: identifier.localPath,
            updatedAt: new Date(),
          })
          .where(eq(projects.id, existing.id))
          .run();
      }

      return {
        id: existing.id,
        name: existing.name,
        path: identifier.localPath,
        identifiedBy: "git",
        hasConfig: !!existing.configId,
        syncEnabled: existing.syncEnabled ?? false,
      };
    }

    // 새 프로젝트 생성
    const id = generateProjectId();
    const name = this.extractProjectName(identifier.localPath, identifier.gitRemote);

    this.db
      .insert(projects)
      .values({
        id,
        name,
        path: identifier.localPath,
        gitRemote: identifier.gitRemote,
      })
      .run();

    // 이벤트 기록
    this.recordEvent(id, "project.created", "project", id, {
      identifiedBy: "git",
      gitRemote: identifier.gitRemote,
    });

    return {
      id,
      name,
      path: identifier.localPath,
      identifiedBy: "git",
      hasConfig: false,
      syncEnabled: false,
    };
  }

  /**
   * 경로로 프로젝트 해석 (fallback)
   */
  private async resolveByPath(
    identifier: ProjectIdentifier
  ): Promise<ResolvedProject> {
    if (!this.db) {
      // DB 없이 동작 (fallback)
      return {
        id: this.hashPath(identifier.localPath),
        name: identifier.localPath.split("/").pop() || "Unknown",
        path: identifier.localPath,
        identifiedBy: "path",
        hasConfig: false,
        syncEnabled: false,
      };
    }

    // DB에서 경로로 조회
    const existing = this.db
      .select()
      .from(projects)
      .where(eq(projects.path, identifier.localPath))
      .get();

    if (existing) {
      return {
        id: existing.id,
        name: existing.name,
        path: identifier.localPath,
        identifiedBy: "path",
        hasConfig: !!existing.configId,
        syncEnabled: existing.syncEnabled ?? false,
      };
    }

    // 새 프로젝트 생성
    const id = generateProjectId();
    const name = identifier.localPath.split("/").pop() || "Unknown";

    this.db
      .insert(projects)
      .values({
        id,
        name,
        path: identifier.localPath,
        gitRemote: identifier.gitRemote,
      })
      .run();

    // 이벤트 기록 (경로 기반은 동기화 안 함 - 경고 의미)
    this.recordEvent(id, "project.created", "project", id, {
      identifiedBy: "path",
      warning: "Project identified by path only. Consider running 'obora init' for better tracking.",
    });

    return {
      id,
      name,
      path: identifier.localPath,
      identifiedBy: "path",
      hasConfig: false,
      syncEnabled: false,
    };
  }

  // ==========================================================================
  // Project Initialization
  // ==========================================================================

  /**
   * 프로젝트 초기화 (.obora/project.yaml 생성)
   */
  async initializeProject(
    cwd: string,
    options?: {
      name?: string;
      description?: string;
      syncEnabled?: boolean;
      organizationId?: string;
    }
  ): Promise<ResolvedProject> {
    if (!this.initialized) {
      await this.initialize();
    }

    const projectRoot = this.findProjectRoot(cwd);
    const oboraDir = join(projectRoot, OBORA_DIR);
    const configPath = join(oboraDir, PROJECT_CONFIG_FILE);

    // 이미 존재하면 로드하여 반환
    if (existsSync(configPath)) {
      return this.resolveProject(cwd);
    }

    // .obora 디렉토리 생성
    if (!existsSync(oboraDir)) {
      mkdirSync(oboraDir, { recursive: true });
    }

    // 설정 파일 생성
    const projectId = generateProjectId();
    const name = options?.name || projectRoot.split("/").pop() || "Unknown";

    const config: ProjectConfig = {
      id: projectId,
      name,
      description: options?.description,
      createdAt: new Date().toISOString(),
      workflow: {
        defaultType: "custom",
        feedbackLoop: {
          enabled: true,
          maxIterations: 3,
        },
      },
      sync: {
        enabled: options?.syncEnabled ?? false,
        organizationId: options?.organizationId,
        autoSync: false,
      },
    };

    // YAML로 저장
    const yamlContent = this.generateConfigYaml(config);
    writeFileSync(configPath, yamlContent, "utf-8");

    // .gitignore 생성 (민감 정보 제외)
    const gitignorePath = join(oboraDir, ".gitignore");
    if (!existsSync(gitignorePath)) {
      writeFileSync(
        gitignorePath,
        "# Local files (not synced)\n*.local\n*.local.yaml\n",
        "utf-8"
      );
    }

    // DB에 등록하고 반환
    return this.resolveProject(cwd);
  }

  /**
   * 설정 파일 YAML 생성
   */
  private generateConfigYaml(config: ProjectConfig): string {
    const lines = [
      "# Obora Project Configuration",
      "# This file is auto-generated. Commit to Git for team sharing.",
      "",
      `id: ${config.id}`,
      `name: ${config.name}`,
    ];

    if (config.description) {
      lines.push(`description: ${config.description}`);
    }

    lines.push(`createdAt: ${config.createdAt}`);
    lines.push("");
    lines.push("# Workflow settings");
    lines.push("workflow:");
    lines.push(`  defaultType: ${config.workflow?.defaultType || "custom"}`);
    lines.push("  feedbackLoop:");
    lines.push(`    enabled: ${config.workflow?.feedbackLoop?.enabled ?? true}`);
    lines.push(`    maxIterations: ${config.workflow?.feedbackLoop?.maxIterations ?? 3}`);

    lines.push("");
    lines.push("# Cloud sync settings (SaaS)");
    lines.push("sync:");
    lines.push(`  enabled: ${config.sync?.enabled ?? false}`);
    if (config.sync?.organizationId) {
      lines.push(`  organizationId: ${config.sync.organizationId}`);
    }
    lines.push(`  autoSync: ${config.sync?.autoSync ?? false}`);

    return lines.join("\n") + "\n";
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * 프로젝트 루트 찾기
   *
   * 우선순위:
   * 1. .obora/project.yaml 파일이 있는 디렉토리 (프로젝트 설정 파일)
   * 2. .claude/agents/obora 디렉토리가 있는 디렉토리
   * 3. .git 디렉토리가 있는 디렉토리
   *
   * 참고: ~/.obora는 글로벌 DB 디렉토리이므로 프로젝트 루트로 인식하지 않음
   */
  findProjectRoot(startDir: string): string {
    const homeDir = homedir();
    let currentDir = resolve(startDir);
    let depth = 0;
    let gitRoot: string | null = null;

    while (depth < MAX_PARENT_SEARCH_DEPTH) {
      // 홈 디렉토리는 프로젝트 루트가 될 수 없음 (~/.obora는 글로벌 DB)
      if (currentDir === homeDir) {
        break;
      }

      // .obora/project.yaml 파일이 있으면 프로젝트 루트 (최우선)
      const oboraConfigPath = join(currentDir, OBORA_DIR, PROJECT_CONFIG_FILE);
      if (existsSync(oboraConfigPath)) {
        return currentDir;
      }

      // .claude/agents/obora 디렉토리가 있으면 프로젝트 루트
      const agentsDir = join(currentDir, ".claude", "agents", "obora");
      if (existsSync(agentsDir)) {
        return currentDir;
      }

      // .git이 있으면 기록 (fallback으로 사용)
      const gitDir = join(currentDir, ".git");
      if (existsSync(gitDir) && gitRoot === null) {
        gitRoot = currentDir;
      }

      // 상위 디렉토리로 이동
      const parentDir = dirname(currentDir);
      if (parentDir === currentDir) {
        break;
      }

      currentDir = parentDir;
      depth++;
    }

    return gitRoot ?? startDir;
  }

  /**
   * Git remote URL 가져오기
   */
  private getGitRemoteUrl(projectRoot: string): string | null {
    try {
      const result = execSync("git config --get remote.origin.url", {
        cwd: projectRoot,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();

      return result || null;
    } catch {
      return null;
    }
  }

  /**
   * 프로젝트 이름 추출
   */
  private extractProjectName(localPath: string, gitRemote?: string): string {
    // Git remote에서 이름 추출 시도
    if (gitRemote) {
      // https://github.com/user/repo.git → repo
      // git@github.com:user/repo.git → repo
      const match = gitRemote.match(/\/([^/]+?)(?:\.git)?$/);
      if (match) {
        return match[1];
      }
    }

    // 경로에서 이름 추출
    return localPath.split("/").pop() || "Unknown";
  }

  /**
   * 경로 해시 생성
   */
  private hashPath(path: string): string {
    return createHash("sha256").update(path).digest("hex").slice(0, 16);
  }

  /**
   * 설정 파일 로드
   */
  loadConfig(projectRoot: string): ProjectConfig | null {
    const configPath = join(projectRoot, OBORA_DIR, PROJECT_CONFIG_FILE);

    if (!existsSync(configPath)) {
      return null;
    }

    try {
      const content = readFileSync(configPath, "utf-8");
      return parseYaml(content) as ProjectConfig;
    } catch {
      return null;
    }
  }

  /**
   * 이벤트 기록 (Event Sourcing)
   */
  private recordEvent(
    projectId: string,
    eventType: string,
    entityType: string,
    entityId: string,
    payload?: Record<string, unknown>
  ): void {
    if (!this.db) return;

    try {
      this.db
        .insert(syncEvents)
        .values({
          id: generateEventId(),
          projectId,
          eventType: eventType as "project.created",
          entityType: entityType as "project",
          entityId,
          payload,
          syncStatus: "pending",
        })
        .run();
    } catch {
      // 이벤트 기록 실패는 무시 (주요 동작에 영향 없음)
    }
  }

  // ==========================================================================
  // Project Queries
  // ==========================================================================

  /**
   * 프로젝트 ID로 조회
   */
  getProjectById(id: string): ResolvedProject | null {
    if (!this.db) return null;

    const project = this.db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .get();

    if (!project) return null;

    return {
      id: project.id,
      name: project.name,
      path: project.path,
      identifiedBy: project.configId ? "config" : project.gitRemote ? "git" : "path",
      hasConfig: !!project.configId,
      syncEnabled: project.syncEnabled ?? false,
    };
  }

  /**
   * 모든 프로젝트 조회
   */
  getAllProjects(): ResolvedProject[] {
    if (!this.db) return [];

    const allProjects = this.db.select().from(projects).all();

    return allProjects.map((project) => ({
      id: project.id,
      name: project.name,
      path: project.path,
      identifiedBy: project.configId
        ? ("config" as const)
        : project.gitRemote
          ? ("git" as const)
          : ("path" as const),
      hasConfig: !!project.configId,
      syncEnabled: project.syncEnabled ?? false,
    }));
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let serviceInstance: ProjectService | null = null;

/**
 * 글로벌 ProjectService 인스턴스 획득
 */
export function getProjectService(): ProjectService {
  if (!serviceInstance) {
    serviceInstance = new ProjectService();
  }
  return serviceInstance;
}

/**
 * 서비스 인스턴스 리셋 (테스트용)
 */
export function resetProjectService(): void {
  serviceInstance = null;
}
