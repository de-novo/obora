import { describe, expect, it } from "vitest";

import { configureKnowledgeProvider } from "../../knowledge/queryKnowledge.js";
import { OboraRuntime } from "../../runtime.js";

describe("knowledge context auto-attach", () => {
  it("attaches knowledge context and emits audit event", async () => {
    configureKnowledgeProvider(async () => [
      {
        id: "k1",
        title: "Kakao OAuth audience check",
        body: "Verify audience claim",
        tags: ["Auth.oauth.kakao"],
        source: "review-bot",
        confidence: 0.91,
        createdAt: "2026-02-20T00:00:00.000Z",
      },
    ]);

    const runtime = new OboraRuntime();
    runtime.define("demo-knowledge", { name: "demo-knowledge", steps: [] });

    let attachedCount = 0;
    runtime.on("knowledge_context_attached", (event) => {
      const payload = event.data as { count?: number };
      attachedCount = payload.count ?? 0;
    });

    const handle = await runtime.run("demo-knowledge", {
      input: { feature: "kakao-login" },
      knowledgeContext: { enabled: true, minConfidence: 0.8, textQuery: "kakao" },
    });

    const result = await handle.wait();
    expect(attachedCount).toBe(1);
    expect(String(result.outputs.__knowledge_context ?? "")).toContain("Relevant Prior Knowledge");
  });

  it("can disable knowledge auto-attach per run", async () => {
    configureKnowledgeProvider(async () => [
      {
        id: "k1",
        title: "Any",
        body: "Any",
        tags: ["Auth.oauth.kakao"],
        source: "review-bot",
        confidence: 0.91,
        createdAt: "2026-02-20T00:00:00.000Z",
      },
    ]);

    const runtime = new OboraRuntime();
    runtime.define("demo-no-knowledge", { name: "demo-no-knowledge", steps: [] });

    const handle = await runtime.run("demo-no-knowledge", {
      knowledgeContext: { enabled: false },
    });
    const result = await handle.wait();

    expect(result.outputs.__knowledge_context).toBeUndefined();
  });

  it("applies maxTokens cap and emits warning", async () => {
    configureKnowledgeProvider(async () => [
      {
        id: "k1",
        title: `Very long knowledge ${"x".repeat(3000)}`, 
        body: "x".repeat(5000),
        tags: ["Auth.oauth.kakao"],
        source: "review-bot",
        confidence: 0.95,
        createdAt: "2026-02-20T00:00:00.000Z",
      },
    ]);

    const runtime = new OboraRuntime();
    runtime.define("demo-truncate", { name: "demo-truncate", steps: [] });

    let warned = false;
    runtime.on("warning", (event) => {
      const data = event.data as { code?: string };
      if (data.code === "SDK_KNOWLEDGE_CONTEXT_TRUNCATED") warned = true;
    });

    const handle = await runtime.run("demo-truncate", {
      knowledgeContext: { enabled: true, maxTokens: 120, tags: ["Auth.oauth.kakao"] },
    });
    const result = await handle.wait();

    expect(String(result.outputs.__knowledge_context ?? "")).toContain("[truncated]");
    expect(warned).toBe(true);
  });
});
