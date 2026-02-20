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
});
