import { describe, expect, it } from "vitest";

import { normalizeTag, suggestTags, validateAndSuggestTag } from "../../knowledge/schema-ai.js";

describe("schema-ai", () => {
  const examples = ["Auth.oauth.kakao", "Billing.invoice.retry", "Review.security.xss"];
  const pattern = /^[A-Z][A-Za-z0-9]+\.[a-z][a-z0-9-]+\.[a-z][a-z0-9-]+$/;

  it("normalizes case", () => {
    expect(normalizeTag("auth.OAUTH.KAKAO")).toBe("Auth.oauth.kakao");
  });

  it("suggests nearest tags", () => {
    const s = suggestTags("Authentication.oauth.kakao", examples);
    expect(s[0]).toBe("Auth.oauth.kakao");
  });

  it("validates and passes valid tags", () => {
    const r = validateAndSuggestTag("Auth.oauth.kakao", pattern, examples);
    expect(r.valid).toBe(true);
  });

  it("rejects depth-short tags with reason", () => {
    const r = validateAndSuggestTag("Auth.oauth", pattern, examples);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("부족");
  });

  it("rejects depth-long tags with reason", () => {
    const r = validateAndSuggestTag("Auth.oauth.kakao.extra", pattern, examples);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("초과");
  });
});
