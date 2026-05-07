import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import * as adapters from "../index";
import * as agents from "../agents";
import * as auth from "../auth";
import * as config from "../config";
import * as llm from "../llm";
import * as skills from "../skills";
import * as testing from "../testing";
import * as tools from "../tools";

const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8")
) as { version: string };

describe("public adapter export surfaces", () => {
  it("keeps root exports wired to their package surfaces", () => {
    expect(adapters.VERSION).toBe(packageJson.version);
    expect(adapters.MockLLMAdapter).toBe(llm.MockLLMAdapter);
    expect(adapters.PiAIAdapter).toBe(llm.PiAIAdapter);
    expect(adapters.ToolRegistry).toBe(tools.ToolRegistry);
    expect(adapters.ToolExecutor).toBe(tools.ToolExecutor);
    expect(adapters.FileAuthManager).toBe(auth.FileAuthManager);
    expect(adapters.AuthStoreRepository).toBe(auth.AuthStoreRepository);
    expect(adapters.loadConfigFile).toBe(config.loadConfigFile);
    expect(adapters.AgentConfigResolver).toBe(agents.AgentConfigResolver);
    expect(adapters.SkillRegistry).toBe(skills.SkillRegistry);
    expect(adapters.SkillLoader).toBe(skills.SkillLoader);
  });

  it("keeps subpath testing and tool aliases available", () => {
    expect(testing.MockLLMAdapter).toBe(llm.MockLLMAdapter);
    expect(tools.toolRegistry).toBeInstanceOf(tools.ToolRegistry);
    expect(typeof llm.listPiAIProviders).toBe("function");
    expect(typeof agents.buildAgentResolutionSnapshot).toBe("function");
    expect(typeof skills.parseSkillMd).toBe("function");
  });
});
