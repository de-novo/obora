import { defineCommand } from "citty";
import { consola } from "consola";
import { resolve, join, dirname } from "pathe";
import { existsSync, promises as fs } from "node:fs";
import prompts from "prompts";
import {
  PRESETS,
  type Category,
} from "../utils/constants";
import {
  hasOboraConfig,
  createInitialConfig,
  writeOboraConfig,
  addHistoryEntry,
} from "../utils/project-config";

// ============================================================================
// Claude SDK Setup Templates
// ============================================================================

const CLAUDE_SETTINGS_TEMPLATE = {
  $schema: "https://claude.ai/settings-schema.json",
  permissions: {
    allow: ["Read", "Glob", "Grep", "Bash", "Write", "Edit"],
    deny: [],
  },
  hooks: {
    preToolExecution: [],
    postToolExecution: [],
  },
};

// ============================================================================
// Obora Workflow Rules
// ============================================================================

const OBORA_WORKFLOW_RULE = `# Obora Workflow Rules

obora CLI를 통해 실행되는 에이전트에 적용되는 규칙입니다.

## 출력 형식

### JSON 응답 필수

구조화된 응답이 필요한 에이전트는 반드시 JSON 형식으로 응답합니다.

\`\`\`json
{
  "analysis": "분석 내용",
  "result": "결과"
}
\`\`\`

### 코드 블록

코드 블록은 반드시 triple backticks를 사용합니다.

## 워크플로우 원칙

- 각 에이전트는 독립적으로 동작
- 이전 에이전트의 결과는 컨텍스트로 전달됨
- 실패 시 명확한 에러 메시지 반환

## 금지 사항

- 하드코딩된 파일 경로 사용 금지
- 사용자 확인 없이 destructive 작업 금지
- 민감 정보 로깅 금지
`;

// ============================================================================
// Obora Agent Templates (카테고리별 구조)
// ============================================================================

const OBORA_AGENTS: Record<string, string> = {
  "workflow/planner.md": `---
name: planner
description: 워크플로우 계획. 작업 분석 후 최적의 에이전트 실행 순서 설계.
tools: Read, Glob, Grep
---

# Planner

사용자 요청을 분석하고 최적의 워크플로우를 설계합니다.

## 출력 형식

반드시 다음 JSON 형식으로 응답:

\`\`\`json
{
  "analysis": "작업 분석 내용",
  "workflow": [
    {
      "agent": "에이전트명",
      "task": "구체적 작업 설명",
      "reason": "선택 이유"
    }
  ],
  "feedbackLoop": {
    "enabled": true,
    "maxIterations": 3
  }
}
\`\`\`

## 워크플로우 설계 원칙

1. 작업 복잡도 분석
2. 적절한 에이전트 선택
3. 실행 순서 최적화
4. 피드백 루프 필요성 판단 (코드 변경 시만)
`,

  "analysis/explorer.md": `---
name: explorer
description: 코드베이스 탐색. 파일 구조, 코드 패턴, 의존성 분석.
tools: Read, Glob, Grep, Bash
---

# Explorer

코드베이스를 탐색하고 구조를 분석합니다.

## 역할

- 파일 구조 파악
- 코드 패턴 분석
- 의존성 관계 확인
- 관련 코드 위치 탐색

## 출력 형식

\`\`\`json
{
  "analysis": "탐색 결과 요약",
  "findings": [
    {
      "path": "파일 경로",
      "description": "발견 내용"
    }
  ]
}
\`\`\`

## 하지 않는 것

- 코드 직접 수정 (책임 범위 외)
`,

  "code/implementer.md": `---
name: implementer
description: 새 기능 구현. 코드 작성, 파일 생성, 기존 패턴 준수.
tools: Read, Glob, Grep, Write, Edit, Bash
---

# Implementer

새로운 기능을 구현하고 코드를 작성합니다.

## 역할

- 새 파일/함수/컴포넌트 생성
- 기존 코드 수정 및 확장
- 기존 패턴과 컨벤션 준수
- 타입 안전성 유지

## 구현 원칙

1. 기존 코드 패턴 분석 후 일관성 유지
2. 타입 정의 우선 작성
3. 점진적 구현 (작은 단위로)
4. 에러 핸들링 포함

## 출력 형식

\`\`\`json
{
  "summary": "구현 내용 요약",
  "changes": [
    {
      "file": "파일 경로",
      "action": "create|modify",
      "description": "변경 내용"
    }
  ]
}
\`\`\`

## 하지 않는 것

- 테스트 작성 (책임 범위 외)
- 코드 리뷰 (책임 범위 외)
`,

  "code/debugger.md": `---
name: debugger
description: 버그 분석 및 수정. 에러 추적, 원인 파악, 수정 코드 작성.
tools: Read, Glob, Grep, Write, Edit, Bash
---

# Debugger

버그를 분석하고 수정합니다.

## 역할

- 에러 메시지 분석
- 스택 트레이스 추적
- 근본 원인 파악
- 수정 코드 작성

## 디버깅 절차

1. 에러 재현 조건 파악
2. 관련 코드 탐색
3. 원인 분석 및 가설 수립
4. 수정 코드 작성
5. 부작용 검토

## 출력 형식

\`\`\`json
{
  "analysis": "버그 분석 내용",
  "rootCause": "근본 원인",
  "fix": {
    "file": "수정 파일",
    "description": "수정 내용"
  }
}
\`\`\`

## 하지 않는 것

- 새 기능 추가 (책임 범위 외)
- 리팩토링 (책임 범위 외)
`,

  "analysis/reviewer.md": `---
name: reviewer
description: 코드 리뷰. 품질, 보안, 성능 검토.
tools: Read, Glob, Grep
---

# Reviewer

코드 품질을 검토하고 개선점을 제안합니다.

## 검토 항목

- 코드 품질 및 가독성
- 잠재적 버그
- 보안 취약점
- 성능 이슈
- 베스트 프랙티스 준수

## 출력 형식

\`\`\`json
{
  "summary": "리뷰 요약",
  "issues": [
    {
      "severity": "critical|high|medium|low",
      "file": "파일 경로",
      "line": 123,
      "description": "이슈 설명",
      "suggestion": "개선 제안"
    }
  ]
}
\`\`\`

## 하지 않는 것

- 코드 직접 수정 (책임 범위 외)
- 테스트 실행 (책임 범위 외)
`,

  "code/refactorer.md": `---
name: refactorer
description: 코드 리팩토링. 구조 개선, 중복 제거, 가독성 향상.
tools: Read, Glob, Grep, Write, Edit
---

# Refactorer

코드 구조를 개선하고 리팩토링합니다.

## 역할

- 코드 구조 개선
- 중복 코드 제거
- 가독성 향상
- 디자인 패턴 적용

## 리팩토링 원칙

1. 기능 변경 없이 구조만 개선
2. 작은 단위로 점진적 변경
3. 각 변경 후 동작 확인 가능하도록
4. 기존 테스트 통과 유지

## 출력 형식

\`\`\`json
{
  "summary": "리팩토링 요약",
  "changes": [
    {
      "type": "extract|inline|rename|move",
      "description": "변경 내용",
      "files": ["영향 파일들"]
    }
  ]
}
\`\`\`

## 하지 않는 것

- 새 기능 추가 (책임 범위 외)
- 버그 수정 (책임 범위 외)
`,

  "test/tester.md": `---
name: tester
description: 테스트 작성 및 실행. 단위 테스트, 통합 테스트.
tools: Read, Glob, Grep, Write, Edit, Bash
---

# Tester

테스트 코드를 작성하고 실행합니다.

## 역할

- 단위 테스트 작성
- 통합 테스트 작성
- 테스트 실행 및 결과 분석
- 커버리지 확인

## 테스트 원칙

1. AAA 패턴 (Arrange-Act-Assert)
2. 하나의 테스트는 하나의 동작만 검증
3. 명확한 테스트 이름
4. 엣지 케이스 포함

## 출력 형식

\`\`\`json
{
  "summary": "테스트 결과 요약",
  "tests": {
    "passed": 10,
    "failed": 0,
    "skipped": 0
  },
  "coverage": "80%"
}
\`\`\`

## 하지 않는 것

- 프로덕션 코드 수정 (책임 범위 외)
`,

  "git/committer.md": `---
name: committer
description: Git 커밋. 변경사항 분석, 커밋 메시지 작성, 커밋 실행.
tools: Read, Glob, Grep, Bash
---

# Committer

Git 커밋을 생성합니다.

## 역할

- 변경 사항 분석
- Conventional Commits 형식 메시지 작성
- 커밋 실행

## 커밋 메시지 형식

\`\`\`
<type>(<scope>): <description>

[optional body]

[optional footer]
\`\`\`

### Type

- feat: 새 기능
- fix: 버그 수정
- docs: 문서 변경
- style: 포맷팅
- refactor: 리팩토링
- test: 테스트
- chore: 빌드/설정

## 절차

1. git status로 변경 확인
2. git diff로 변경 내용 분석
3. 적절한 커밋 메시지 작성
4. git add 및 git commit 실행

## 출력 형식

\`\`\`json
{
  "commitHash": "abc1234",
  "message": "feat(auth): add login validation",
  "filesChanged": 3
}
\`\`\`

## 하지 않는 것

- 코드 수정 (책임 범위 외)
- git push (명시적 요청 시에만)
`,
};

/**
 * Setup .claude directory for SDK-based workflow
 *
 * 구조:
 * .claude/
 * ├── settings.json
 * ├── rules/
 * │   └── obora-workflow.md
 * └── agents/
 *     └── obora/              # obora 전용 에이전트
 *         ├── planner.md
 *         └── ...
 */
async function setupClaudeDirectory(
  projectPath: string,
  options: { includeAgents: boolean }
): Promise<void> {
  const claudeDir = join(projectPath, ".claude");
  const rulesDir = join(claudeDir, "rules");
  const oboraAgentsDir = join(claudeDir, "agents", "obora");

  // Create directories
  await fs.mkdir(rulesDir, { recursive: true });

  // Create settings.json if not exists
  const settingsPath = join(claudeDir, "settings.json");
  if (!existsSync(settingsPath)) {
    await fs.writeFile(
      settingsPath,
      JSON.stringify(CLAUDE_SETTINGS_TEMPLATE, null, 2),
      "utf-8"
    );
    consola.success("Created .claude/settings.json");
  } else {
    consola.info(".claude/settings.json already exists, skipping");
  }

  // Create obora workflow rule (in main rules directory)
  const workflowRulePath = join(rulesDir, "obora-workflow.md");
  if (!existsSync(workflowRulePath)) {
    await fs.writeFile(workflowRulePath, OBORA_WORKFLOW_RULE, "utf-8");
    consola.success("Created .claude/rules/obora-workflow.md");
  } else {
    consola.info(".claude/rules/obora-workflow.md already exists, skipping");
  }

  // Create obora agents (카테고리별 하위 디렉토리)
  if (options.includeAgents) {
    for (const [relativePath, content] of Object.entries(OBORA_AGENTS)) {
      const agentPath = join(oboraAgentsDir, relativePath);
      const agentDir = dirname(agentPath);

      // 하위 디렉토리 생성
      await fs.mkdir(agentDir, { recursive: true });

      if (!existsSync(agentPath)) {
        await fs.writeFile(agentPath, content, "utf-8");
        consola.success(`Created .claude/agents/obora/${relativePath}`);
      } else {
        consola.info(`.claude/agents/obora/${relativePath} already exists, skipping`);
      }
    }
  }
}

// Mapping of package names to presets
const PACKAGE_TO_PRESET: Record<string, { preset: string; category: Category }> = {
  // Linting
  "@biomejs/biome": { preset: "biome", category: "linting" },
  biome: { preset: "biome", category: "linting" },
  eslint: { preset: "eslint-prettier", category: "linting" },
  prettier: { preset: "eslint-prettier", category: "linting" },

  // Database
  "drizzle-orm": { preset: "drizzle", category: "database" },
  "@prisma/client": { preset: "prisma", category: "database" },
  prisma: { preset: "prisma", category: "database" },

  // Auth
  "@clerk/nextjs": { preset: "clerk-nextjs", category: "auth" },
  "@clerk/backend": { preset: "clerk", category: "auth" },
  "better-auth": { preset: "better-auth", category: "auth" },

  // Payment
  "@polar-sh/sdk": { preset: "polar", category: "payment" },
  "@paddle/paddle-node-sdk": { preset: "paddle", category: "payment" },

  // Analytics
  "@umami/node": { preset: "umami", category: "analytics" },
  "posthog-node": { preset: "posthog", category: "analytics" },
  "posthog-js": { preset: "posthog", category: "analytics" },

  // Email
  resend: { preset: "resend", category: "email" },

  // Storage
  uploadthing: { preset: "uploadthing", category: "storage" },
  "@aws-sdk/client-s3": { preset: "cloudflare-r2", category: "storage" },

  // AI
  ai: { preset: "vercel-ai", category: "ai" },
  "@ai-sdk/openai": { preset: "vercel-ai", category: "ai" },

  // Validation
  zod: { preset: "zod", category: "validation" },
  "@effect/schema": { preset: "effect-schema", category: "validation" },
};

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | { packages: string[] };
  packageManager?: string;
}

/**
 * Detect package manager from lockfile or packageManager field
 */
function detectPackageManager(
  projectPath: string,
  packageJson: PackageJson
): "pnpm" | "npm" | "yarn" | "bun" {
  // Check packageManager field first
  if (packageJson.packageManager) {
    if (packageJson.packageManager.startsWith("pnpm")) return "pnpm";
    if (packageJson.packageManager.startsWith("yarn")) return "yarn";
    if (packageJson.packageManager.startsWith("bun")) return "bun";
  }

  // Check lockfiles
  if (existsSync(join(projectPath, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(projectPath, "yarn.lock"))) return "yarn";
  if (existsSync(join(projectPath, "bun.lockb"))) return "bun";
  if (existsSync(join(projectPath, "package-lock.json"))) return "npm";

  return "pnpm"; // Default
}

/**
 * Detect base type (monorepo or single)
 */
function detectBase(
  projectPath: string,
  packageJson: PackageJson
): "monorepo" | "single" {
  // Check for workspaces
  if (packageJson.workspaces) return "monorepo";

  // Check for pnpm-workspace.yaml
  if (existsSync(join(projectPath, "pnpm-workspace.yaml"))) return "monorepo";

  // Check for turbo.json
  if (existsSync(join(projectPath, "turbo.json"))) return "monorepo";

  return "single";
}

/**
 * Detect installed presets from package.json dependencies
 */
function detectPresets(packageJson: PackageJson): Record<string, { preset: string; version: string }> {
  const allDeps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  const detected: Record<string, { preset: string; version: string }> = {};

  for (const [pkg, mapping] of Object.entries(PACKAGE_TO_PRESET)) {
    if (allDeps[pkg]) {
      // Only add if not already detected for this category
      if (!detected[mapping.category]) {
        const presetInfo = PRESETS[mapping.preset];
        detected[mapping.category] = {
          preset: mapping.preset,
          version: presetInfo?.version || "unknown",
        };
      }
    }
  }

  return detected;
}

/**
 * Detect app modules from project structure
 */
async function detectApps(
  projectPath: string,
  base: "monorepo" | "single"
): Promise<Record<string, { module: string; version: string }>> {
  const apps: Record<string, { module: string; version: string }> = {};

  if (base === "monorepo") {
    // Check for apps directory
    const appsDir = join(projectPath, "apps");
    if (existsSync(appsDir)) {
      const entries = await fs.readdir(appsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const appPackageJson = join(appsDir, entry.name, "package.json");
        if (existsSync(appPackageJson)) {
          const content = await fs.readFile(appPackageJson, "utf-8");
          const pkg = JSON.parse(content) as PackageJson;
          const deps = { ...pkg.dependencies, ...pkg.devDependencies };

          // Detect app type
          if (deps["next"]) {
            apps[entry.name] = { module: "nextjs-web", version: "1.0.0" };
          } else if (deps["@nestjs/core"]) {
            apps[entry.name] = { module: "nestjs-api", version: "1.0.0" };
          }
        }
      }
    }

    // Check for packages directory
    const packagesDir = join(projectPath, "packages");
    if (existsSync(packagesDir)) {
      const entries = await fs.readdir(packagesDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const pkgPackageJson = join(packagesDir, entry.name, "package.json");
        if (existsSync(pkgPackageJson)) {
          const content = await fs.readFile(pkgPackageJson, "utf-8");
          const pkg = JSON.parse(content) as PackageJson;
          const deps = { ...pkg.dependencies, ...pkg.devDependencies };

          if (deps["drizzle-orm"] || deps["@prisma/client"]) {
            apps[entry.name] = { module: "shared-database", version: "1.0.0" };
          } else if (deps["react"]) {
            apps[entry.name] = { module: "shared-ui", version: "1.0.0" };
          }
        }
      }
    }
  } else {
    // Single app - detect from root package.json
    const packageJsonPath = join(projectPath, "package.json");
    if (existsSync(packageJsonPath)) {
      const content = await fs.readFile(packageJsonPath, "utf-8");
      const pkg = JSON.parse(content) as PackageJson;
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const name = pkg.name || "app";

      if (deps["next"]) {
        apps[name] = { module: "nextjs-web", version: "1.0.0" };
      } else if (deps["@nestjs/core"]) {
        apps[name] = { module: "nestjs-api", version: "1.0.0" };
      }
    }
  }

  return apps;
}

export const initCommand = defineCommand({
  meta: {
    name: "init",
    description: "Initialize obora-kit in an existing project",
  },
  args: {
    dir: {
      type: "string",
      alias: "d",
      description: "Project directory (default: current directory)",
    },
    force: {
      type: "boolean",
      alias: "f",
      description: "Overwrite existing .obora config",
      default: false,
    },
    yes: {
      type: "boolean",
      alias: "y",
      description: "Skip confirmation prompts",
      default: false,
    },
  },
  async run({ args }) {
    const projectPath = resolve(args.dir || process.cwd());

    consola.info(`Initializing obora-kit in: ${projectPath}`);

    // Check for existing config
    if (hasOboraConfig(projectPath) && !args.force) {
      consola.error("This project already has an obora config.");
      consola.info("Use --force to overwrite.");
      process.exit(1);
    }

    // Check for package.json
    const packageJsonPath = join(projectPath, "package.json");
    if (!existsSync(packageJsonPath)) {
      consola.error("No package.json found. Is this a JavaScript/TypeScript project?");
      process.exit(1);
    }

    // Read package.json
    const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(packageJsonContent) as PackageJson;

    // Detect configuration
    const detectedPm = detectPackageManager(projectPath, packageJson);
    const detectedBase = detectBase(projectPath, packageJson);
    const detectedPresets = detectPresets(packageJson);
    const detectedApps = await detectApps(projectPath, detectedBase);

    // Display detected configuration
    consola.info("\nDetected configuration:");
    consola.info(`  Base: ${detectedBase}`);
    consola.info(`  Package Manager: ${detectedPm}`);
    consola.info(`  Apps: ${Object.entries(detectedApps).map(([n, a]) => `${n} (${a.module})`).join(", ") || "none"}`);
    consola.info(`  Presets: ${Object.entries(detectedPresets).map(([c, p]) => `${c}:${p.preset}`).join(", ") || "none"}`);

    // Confirm with user
    if (!args.yes) {
      const { confirmed } = await prompts({
        type: "confirm",
        name: "confirmed",
        message: "Create .obora/config.json with detected configuration?",
        initial: true,
      });

      if (!confirmed) {
        consola.info("Cancelled");
        return;
      }
    }

    // Create config
    const slotsConfig: Record<string, { preset: string; version: string } | null> = {};
    for (const [category, presetInfo] of Object.entries(detectedPresets)) {
      slotsConfig[category] = presetInfo;
    }

    const config = createInitialConfig(
      projectPath,
      detectedBase,
      detectedPm,
      detectedApps,
      slotsConfig
    );

    await writeOboraConfig(projectPath, config);
    await addHistoryEntry(projectPath, { action: "create" });

    consola.success("Created .obora/config.json");

    // Claude SDK setup
    console.log();
    consola.info("Setting up Claude SDK configuration...");

    let includeAgents = true; // Default to true
    if (!args.yes) {
      const { createAgents } = await prompts({
        type: "confirm",
        name: "createAgents",
        message: "Create default agents (planner, explorer, reviewer)?",
        initial: true,
      });
      includeAgents = createAgents ?? true;
    }

    await setupClaudeDirectory(projectPath, { includeAgents });

    console.log();
    consola.success("Initialization complete!");
    consola.info("\nYou can now use:");
    consola.info("  obora status   - View current configuration");
    consola.info("  obora add      - Add new presets");
    consola.info("  obora remove   - Remove presets");
    consola.info("  obora run      - Execute tasks with workflow");
    consola.info("  obora chat     - Interactive chat mode");
  },
});
