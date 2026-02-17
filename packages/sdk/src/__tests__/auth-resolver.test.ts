import { describe, expect, it, vi } from "vitest";

import { OboraErrorCode } from "../runtime.js";

describe("auth-resolver", () => {
  it("resolves env:VAR_NAME", async () => {
    const { resolveAuthRef } = await import("../auth-resolver.js");
    process.env.TEST_AUTH_RESOLVER_KEY = "secret";
    expect(resolveAuthRef("env:TEST_AUTH_RESOLVER_KEY")).toBe("secret");
    delete process.env.TEST_AUTH_RESOLVER_KEY;
  });

  it("throws explicit error for obora-auth:PROFILE", async () => {
    const { resolveAuthRef } = await import("../auth-resolver.js");
    expect(() => resolveAuthRef("obora-auth:default")).toThrowError(
      expect.objectContaining({
        message: "obora-auth: protocol is not yet supported. Use env:VAR_NAME instead.",
        code: OboraErrorCode.SDK_NOT_IMPLEMENTED,
      }),
    );
  });

  it("returns plain string and warns only once in verbose mode", async () => {
    vi.resetModules();
    const { resolveAuthRef } = await import("../auth-resolver.js");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(resolveAuthRef("plain-key", { verbose: true })).toBe("plain-key");
    expect(resolveAuthRef("plain-key", { verbose: true })).toBe("plain-key");

    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("suppresses plain text warning when verbose is false", async () => {
    vi.resetModules();
    const { resolveAuthRef } = await import("../auth-resolver.js");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(resolveAuthRef("plain-key")).toBe("plain-key");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
