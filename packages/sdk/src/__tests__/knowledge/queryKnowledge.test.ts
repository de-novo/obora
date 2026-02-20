import { describe, expect, it, beforeEach } from "vitest";

import {
  configureKnowledgeProvider,
  configureKnowledgeProviderFromBlackboard,
  mapBlackboardToKnowledgeResults,
  queryKnowledge,
  type KnowledgeResult,
} from "../../knowledge/queryKnowledge.js";

const sample: KnowledgeResult[] = [
  {
    id: "k1",
    title: "Kakao OAuth audience check",
    body: "Verify audience claim when validating token.",
    tags: ["Auth.oauth.kakao", "Review.security.jwt"],
    source: "review-bot",
    projectId: "p1",
    confidence: 0.91,
    createdAt: "2026-02-20T00:00:00.000Z",
  },
  {
    id: "k2",
    title: "XSS sanitize rule",
    body: "dangerouslySetInnerHTML must be sanitized",
    tags: ["Review.security.xss"],
    source: "security-bot",
    projectId: "p1",
    confidence: 0.88,
    createdAt: "2026-02-19T00:00:00.000Z",
  },
  {
    id: "k3",
    title: "Billing retry policy",
    body: "invoice retry backoff policy",
    tags: ["Billing.invoice.retry"],
    source: "billing-bot",
    projectId: "p2",
    confidence: 0.95,
    createdAt: "2026-02-18T00:00:00.000Z",
  },
];

describe("queryKnowledge", () => {
  beforeEach(() => {
    configureKnowledgeProvider(async () => sample);
  });

  it("filters by tags", async () => {
    const results = await queryKnowledge({ tags: ["Auth.oauth.kakao"] });
    expect(results.map((r) => r.id)).toEqual(["k1"]);
  });

  it("filters by text query", async () => {
    const results = await queryKnowledge({ textQuery: "sanitize" });
    expect(results.map((r) => r.id)).toEqual(["k2"]);
  });

  it("filters by minConfidence", async () => {
    const results = await queryKnowledge({ minConfidence: 0.9 });
    expect(results.map((r) => r.id)).toEqual(["k1", "k3"]);
  });

  it("filters by projectId", async () => {
    const results = await queryKnowledge({ projectId: "p2" });
    expect(results.map((r) => r.id)).toEqual(["k3"]);
  });

  it("returns empty array on no match", async () => {
    const results = await queryKnowledge({ tags: ["Unknown.tag.item"] });
    expect(results).toEqual([]);
  });

  it("applies limit and sorting(latest first, then confidence)", async () => {
    const results = await queryKnowledge({ limit: 2 });
    expect(results).toHaveLength(2);
    expect(results[0]?.id).toBe("k1");
    expect(results[1]?.id).toBe("k2");
  });

  it("maps blackboard snapshot to queryable entries", () => {
    const mapped = mapBlackboardToKnowledgeResults({
      knowledge: {
        facts: [
          {
            id: "f1",
            content: "oauth callback mismatch",
            tags: ["Auth.oauth.kakao"],
            source: "runtime",
            confidence: 0.9,
            category: "Auth",
            createdAt: "2026-02-20T00:00:00.000Z",
          },
        ],
      },
    });

    expect(mapped).toHaveLength(1);
    expect(mapped[0]?.id).toBe("f1");
    expect(mapped[0]?.title).toContain("fact");
  });

  it("can query from blackboard provider bridge", async () => {
    configureKnowledgeProviderFromBlackboard({
      knowledge: {
        facts: [
          {
            id: "f1",
            content: "oauth callback mismatch",
            tags: ["Auth.oauth.kakao"],
            source: "runtime",
            confidence: 0.9,
            category: "Auth",
            createdAt: "2026-02-20T00:00:00.000Z",
          },
        ],
        inferences: [
          {
            id: "i1",
            conclusion: "token replay risk",
            tags: ["Auth.security.replay"],
            source: "runtime",
            confidence: 0.88,
            createdAt: "2026-02-20T00:10:00.000Z",
          },
        ],
      },
    });

    const results = await queryKnowledge({ tags: ["Auth.security.replay"] });
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("i1");
  });
});
