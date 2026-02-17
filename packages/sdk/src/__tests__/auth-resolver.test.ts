import { describe, expect, it, vi } from "vitest";

import { resolveAuthRef } from "../auth-resolver.js";

describe("auth-resolver", () => {
  it("resolves env:VAR_NAME", () => {
    process.env.TEST_AUTH_RESOLVER_KEY = "secret";
    expect(resolveAuthRef("env:TEST_AUTH_RESOLVER_KEY")).toBe("secret");
    delete process.env.TEST_AUTH_RESOLVER_KEY;
  });

  it("returns undefined for obora-auth:PROFILE and warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(resolveAuthRef("obora-auth:default")).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns plain string and warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(resolveAuthRef("plain-key")).toBe("plain-key");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
