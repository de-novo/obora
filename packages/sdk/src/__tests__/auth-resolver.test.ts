import { describe, expect, it, vi } from "vitest";

import { OboraErrorCode } from "../runtime.js";

describe("auth-resolver", () => {
  it("resolves env:VAR_NAME", async () => {
    const { createAuthResolver } = await import("../auth-resolver.js");
    const resolver = createAuthResolver();
    process.env.TEST_AUTH_RESOLVER_KEY = "secret";
    expect(resolver.resolveAuthRef("env:TEST_AUTH_RESOLVER_KEY")).toBe("secret");
    delete process.env.TEST_AUTH_RESOLVER_KEY;
  });

  it("throws explicit error for obora-auth:PROFILE", async () => {
    const { createAuthResolver } = await import("../auth-resolver.js");
    const resolver = createAuthResolver();
    expect(() => resolver.resolveAuthRef("obora-auth:default")).toThrowError(
      expect.objectContaining({
        message: "obora-auth: protocol is not yet supported. Use env:VAR_NAME instead.",
        code: OboraErrorCode.SDK_NOT_IMPLEMENTED,
      }),
    );
  });

  it("returns plain string and warns only once per resolver in verbose mode", async () => {
    const { createAuthResolver } = await import("../auth-resolver.js");
    const resolver = createAuthResolver();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(resolver.resolveAuthRef("plain-key", { verbose: true })).toBe("plain-key");
    expect(resolver.resolveAuthRef("plain-key", { verbose: true })).toBe("plain-key");

    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("isolates warning state across resolver instances", async () => {
    const { createAuthResolver } = await import("../auth-resolver.js");
    const resolverA = createAuthResolver();
    const resolverB = createAuthResolver();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(resolverA.resolveAuthRef("plain-key", { verbose: true })).toBe("plain-key");
    expect(resolverA.resolveAuthRef("plain-key", { verbose: true })).toBe("plain-key");
    expect(resolverB.resolveAuthRef("plain-key", { verbose: true })).toBe("plain-key");

    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("suppresses plain text warning when verbose is false", async () => {
    const { createAuthResolver } = await import("../auth-resolver.js");
    const resolver = createAuthResolver();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(resolver.resolveAuthRef("plain-key")).toBe("plain-key");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
