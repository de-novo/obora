/**
 * Agent Loader Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadAgents,
  formatAgentsForPlanner,
  getAgentByName,
  findProjectRoot,
} from "../agent-loader.js";

describe("agent-loader", () => {
  let testDir: string;
  let agentsDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-agents-${Date.now()}`);
    agentsDir = join(testDir, ".claude", "agents", "obora");
    mkdirSync(agentsDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("loadAgents", () => {
    it("should load valid agent files", () => {
      const agentContent = `---
name: test-agent
description: Test agent for testing
tools: Read, Write, Glob
model: sonnet
---

# Test Agent

This is a test agent.`;

      writeFileSync(join(agentsDir, "test-agent.md"), agentContent);

      const agents = loadAgents(testDir);

      expect(agents.size).toBe(1);
      expect(agents.has("test-agent")).toBe(true);

      const agent = agents.get("test-agent");
      expect(agent).toBeDefined();
      expect(agent?.name).toBe("test-agent");
      expect(agent?.description).toBe("Test agent for testing");
      expect(agent?.allowedTools).toEqual(["Read", "Write", "Glob"]);
      expect(agent?.systemPrompt).toBe("# Test Agent\n\nThis is a test agent.");
    });

    it("should load multiple agents from nested directories", () => {
      const agent1 = `---
name: agent1
description: First agent
tools: Read
---

Agent 1 content`;

      const agent2 = `---
name: agent2
description: Second agent
tools: Write, Edit
---

Agent 2 content`;

      const subDir = join(agentsDir, "category");
      mkdirSync(subDir, { recursive: true });

      writeFileSync(join(agentsDir, "agent1.md"), agent1);
      writeFileSync(join(subDir, "agent2.md"), agent2);

      const agents = loadAgents(testDir);

      expect(agents.size).toBe(2);
      expect(agents.has("agent1")).toBe(true);
      expect(agents.has("agent2")).toBe(true);
    });

    it("should ignore files without frontmatter", () => {
      const invalidContent = `# No Frontmatter

This file has no frontmatter.`;

      writeFileSync(join(agentsDir, "invalid.md"), invalidContent);

      const agents = loadAgents(testDir);

      expect(agents.size).toBe(0);
    });

    it("should ignore files starting with underscore", () => {
      const validAgent = `---
name: valid
description: Valid agent
tools: Read
---

Valid content`;

      const underscoreAgent = `---
name: ignored
description: Should be ignored
tools: Read
---

Ignored content`;

      writeFileSync(join(agentsDir, "valid.md"), validAgent);
      writeFileSync(join(agentsDir, "_ignored.md"), underscoreAgent);

      const agents = loadAgents(testDir);

      expect(agents.size).toBe(1);
      expect(agents.has("valid")).toBe(true);
      expect(agents.has("ignored")).toBe(false);
    });

    it("should parse tools with comma and space separators", () => {
      const agentContent = `---
name: test-tools
description: Test tools parsing
tools: Read, Write  Glob,Edit Grep
---

Content`;

      writeFileSync(join(agentsDir, "test-tools.md"), agentContent);

      const agents = loadAgents(testDir);
      const agent = agents.get("test-tools");

      expect(agent?.allowedTools).toEqual(["Read", "Write", "Glob", "Edit", "Grep"]);
    });

    it("should return empty map when directory does not exist", () => {
      const nonExistentDir = join(tmpdir(), "non-existent-dir");
      const agents = loadAgents(nonExistentDir);

      expect(agents.size).toBe(0);
    });

    it("should handle missing required frontmatter fields", () => {
      const missingName = `---
description: No name
tools: Read
---

Content`;

      const missingDescription = `---
name: test
tools: Read
---

Content`;

      const missingTools = `---
name: test
description: No tools
---

Content`;

      writeFileSync(join(agentsDir, "missing-name.md"), missingName);
      writeFileSync(join(agentsDir, "missing-desc.md"), missingDescription);
      writeFileSync(join(agentsDir, "missing-tools.md"), missingTools);

      const agents = loadAgents(testDir);

      expect(agents.size).toBe(0);
    });

    it("should prevent path traversal attacks", () => {
      const maliciousAgent = `---
name: malicious
description: Malicious agent
tools: Read
---

Content`;

      const outsideDir = join(tmpdir(), "outside");
      mkdirSync(outsideDir, { recursive: true });
      writeFileSync(join(outsideDir, "malicious.md"), maliciousAgent);

      const agents = loadAgents(testDir);

      expect(agents.has("malicious")).toBe(false);

      rmSync(outsideDir, { recursive: true, force: true });
    });

    it("should respect max recursion depth", () => {
      let currentDir = agentsDir;

      for (let i = 0; i < 15; i++) {
        currentDir = join(currentDir, `level${i}`);
        mkdirSync(currentDir, { recursive: true });
      }

      const deepAgent = `---
name: deep-agent
description: Deep nested agent
tools: Read
---

Content`;

      writeFileSync(join(currentDir, "deep.md"), deepAgent);

      const agents = loadAgents(testDir);

      expect(agents.has("deep-agent")).toBe(false);
    });
  });

  describe("formatAgentsForPlanner", () => {
    it("should format agents as planner-friendly string", () => {
      const agents = new Map();
      agents.set("agent1", {
        name: "agent1",
        description: "First agent",
        allowedTools: ["Read", "Write"],
        systemPrompt: "Content",
      });
      agents.set("agent2", {
        name: "agent2",
        description: "Second agent",
        allowedTools: ["Glob", "Grep"],
        systemPrompt: "Content",
      });

      const formatted = formatAgentsForPlanner(agents);

      expect(formatted).toContain("- agent1: First agent (tools: Read, Write)");
      expect(formatted).toContain("- agent2: Second agent (tools: Glob, Grep)");
    });

    it("should exclude planner agent from output", () => {
      const agents = new Map();
      agents.set("planner", {
        name: "planner",
        description: "Planner agent",
        allowedTools: ["Read", "Glob"],
        systemPrompt: "Content",
      });
      agents.set("other", {
        name: "other",
        description: "Other agent",
        allowedTools: ["Write"],
        systemPrompt: "Content",
      });

      const formatted = formatAgentsForPlanner(agents);

      expect(formatted).not.toContain("planner");
      expect(formatted).toContain("other");
    });

    it("should return empty string for empty map", () => {
      const agents = new Map();
      const formatted = formatAgentsForPlanner(agents);

      expect(formatted).toBe("");
    });

    it("should return empty string when only planner exists", () => {
      const agents = new Map();
      agents.set("planner", {
        name: "planner",
        description: "Planner only",
        allowedTools: ["Read"],
        systemPrompt: "Content",
      });

      const formatted = formatAgentsForPlanner(agents);

      expect(formatted).toBe("");
    });
  });

  describe("getAgentByName", () => {
    it("should return agent when it exists", () => {
      const agents = new Map();
      const testAgent = {
        name: "test",
        description: "Test agent",
        allowedTools: ["Read"],
        systemPrompt: "Content",
      };
      agents.set("test", testAgent);

      const result = getAgentByName(agents, "test");

      expect(result).toBe(testAgent);
    });

    it("should return undefined when agent does not exist", () => {
      const agents = new Map();

      const result = getAgentByName(agents, "non-existent");

      expect(result).toBeUndefined();
    });

    it("should return undefined for empty map", () => {
      const agents = new Map();

      const result = getAgentByName(agents, "any");

      expect(result).toBeUndefined();
    });
  });

  describe("findProjectRoot", () => {
    it("should find project root with .claude/agents/obora directory", () => {
      const root = findProjectRoot(testDir);

      expect(root).toBe(testDir);
    });

    it("should search upward from nested directory", () => {
      const nestedDir = join(testDir, "nested", "deep", "path");
      mkdirSync(nestedDir, { recursive: true });

      const root = findProjectRoot(nestedDir);

      expect(root).toBe(testDir);
    });

    it("should fallback to git root when .claude/agents/obora not found", () => {
      const gitDir = join(tmpdir(), `test-git-${Date.now()}`);
      const gitDotDir = join(gitDir, ".git");
      mkdirSync(gitDotDir, { recursive: true });

      const root = findProjectRoot(gitDir);

      expect(root).toBe(gitDir);

      rmSync(gitDir, { recursive: true, force: true });
    });

    it("should return start directory when no markers found", () => {
      const isolatedDir = join(tmpdir(), `test-isolated-${Date.now()}`);
      mkdirSync(isolatedDir, { recursive: true });

      const root = findProjectRoot(isolatedDir);

      expect(root).toBe(isolatedDir);

      rmSync(isolatedDir, { recursive: true, force: true });
    });

    it("should prefer .claude/agents/obora over git root", () => {
      const gitRoot = join(tmpdir(), `test-git-pref-${Date.now()}`);
      const claudeRoot = join(gitRoot, "subproject");
      const gitDotDir = join(gitRoot, ".git");
      const claudeAgentsDir = join(claudeRoot, ".claude", "agents", "obora");

      mkdirSync(gitDotDir, { recursive: true });
      mkdirSync(claudeAgentsDir, { recursive: true });

      const root = findProjectRoot(claudeRoot);

      expect(root).toBe(claudeRoot);

      rmSync(gitRoot, { recursive: true, force: true });
    });
  });
});
