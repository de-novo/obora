/**
 * Agent Loader
 *
 * .claude/agents/obora/*.md 파일에서 에이전트 정의를 동적으로 로드
 * obora 전용 에이전트는 .claude/agents/obora/ 에 위치
 * claude 직접 사용 시에도 발견 가능 (agents 하위이므로)
 */

import { readFileSync, readdirSync, statSync, existsSync, realpathSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";
import type { AgentDefinition } from "./types.js";

const MAX_RECURSION_DEPTH = 10;
const MAX_PARENT_SEARCH_DEPTH = 10;

/**
 * 프로젝트 루트 자동 감지
 * .claude/agents/obora 디렉토리가 있는 상위 디렉토리를 찾음
 */
export function findProjectRoot(startDir: string): string {
  let currentDir = resolve(startDir);
  let depth = 0;
  let gitRoot: string | null = null;

  while (depth < MAX_PARENT_SEARCH_DEPTH) {
    // .claude/agents/obora 디렉토리가 있으면 프로젝트 루트 (최우선)
    const oboraAgentsDir = join(currentDir, ".claude", "agents", "obora");
    if (existsSync(oboraAgentsDir) && statSync(oboraAgentsDir).isDirectory()) {
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
      // 루트에 도달
      break;
    }

    currentDir = parentDir;
    depth++;
  }

  // .claude/agents/obora를 찾지 못했으면 git root 사용, 그것도 없으면 시작 디렉토리
  return gitRoot ?? startDir;
}

interface AgentFrontmatter {
  name: string;
  description: string;
  tools: string;
  model?: string;
}

/**
 * YAML frontmatter 파싱
 */
function parseFrontmatter(content: string): {
  frontmatter: AgentFrontmatter | null;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!match) {
    return { frontmatter: null, body: content };
  }

  const [, yamlContent = "", body = ""] = match;
  const frontmatter: Record<string, string> = {};

  for (const line of yamlContent.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      frontmatter[key] = value;
    }
  }

  if (!frontmatter.name || !frontmatter.description || !frontmatter.tools) {
    return { frontmatter: null, body: content };
  }

  return {
    frontmatter: frontmatter as unknown as AgentFrontmatter,
    body: body.trim(),
  };
}

/**
 * 경로가 기준 디렉토리 내에 있는지 확인 (Path Traversal 방지)
 */
function isPathWithinBase(filePath: string, baseDir: string): boolean {
  try {
    const realFilePath = realpathSync(filePath);
    const realBaseDir = realpathSync(baseDir);
    const relativePath = relative(realBaseDir, realFilePath);
    return !relativePath.startsWith("..") && !relativePath.startsWith("/");
  } catch {
    return false;
  }
}

/**
 * 단일 에이전트 파일 로드
 */
function loadAgentFile(filePath: string, baseDir: string): AgentDefinition | null {
  try {
    // Path traversal 방지: 파일이 agents 디렉토리 내에 있는지 확인
    if (!isPathWithinBase(filePath, baseDir)) {
      return null;
    }

    const content = readFileSync(filePath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(content);

    if (!frontmatter) {
      return null;
    }

    // tools 파싱 (쉼표 또는 공백으로 구분)
    const tools = frontmatter.tools
      .split(/[,\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    return {
      name: frontmatter.name,
      description: frontmatter.description,
      allowedTools: tools,
      systemPrompt: body,
    };
  } catch {
    return null;
  }
}

/**
 * 디렉토리에서 재귀적으로 .md 파일 찾기 (깊이 제한 있음)
 */
function findMarkdownFiles(dir: string, depth: number = 0): string[] {
  const files: string[] = [];

  // 무한 재귀 방지
  if (depth > MAX_RECURSION_DEPTH) {
    return files;
  }

  if (!existsSync(dir)) {
    return files;
  }

  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...findMarkdownFiles(fullPath, depth + 1));
    } else if (entry.endsWith(".md") && !entry.startsWith("_")) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * .claude/agents/obora/ 디렉토리에서 모든 에이전트 로드
 * cwd에서 프로젝트 루트를 자동 감지하여 에이전트를 로드함
 * obora 전용 에이전트만 로드 (사용자의 커스텀 에이전트는 무시)
 */
export function loadAgents(cwd: string): Map<string, AgentDefinition> {
  const projectRoot = findProjectRoot(cwd);
  const agentsDir = resolve(projectRoot, ".claude", "agents", "obora");
  const agents = new Map<string, AgentDefinition>();

  const files = findMarkdownFiles(agentsDir);

  for (const file of files) {
    const agent = loadAgentFile(file, agentsDir);
    if (agent) {
      agents.set(agent.name, agent);
    }
  }

  return agents;
}

/**
 * 에이전트 목록을 planner용 문자열로 변환
 */
export function formatAgentsForPlanner(
  agents: Map<string, AgentDefinition>
): string {
  const lines: string[] = [];

  for (const agent of agents.values()) {
    // planner는 제외 (자기 자신)
    if (agent.name === "planner") continue;

    const tools = agent.allowedTools.join(", ");
    lines.push(`- ${agent.name}: ${agent.description} (tools: ${tools})`);
  }

  return lines.join("\n");
}

/**
 * 에이전트 이름으로 조회
 */
export function getAgentByName(
  agents: Map<string, AgentDefinition>,
  name: string
): AgentDefinition | undefined {
  return agents.get(name);
}
