import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { FileAuthManager, getAuthToken } from "../../auth/manager";
import { maskProviderAuth, maskSecret } from "../../auth/mask";
import { AuthStoreRepository } from "../../auth/store";
import type { ProviderAuth } from "../../auth/types";

function authBase(provider: string) {
  return {
    provider,
    addedAt: "2026-05-05T00:00:00.000Z",
    updatedAt: "2026-05-05T00:00:00.000Z",
  };
}

function createTempAuthFile(): { dir: string; file: string; manager: FileAuthManager } {
  const dir = mkdtempSync(join(tmpdir(), "obora-adapters-auth-"));
  const file = join(dir, "auth.json");
  return {
    dir,
    file,
    manager: new FileAuthManager(new AuthStoreRepository(file)),
  };
}

describe("auth adapter conformance", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.unstubAllGlobals();
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it("persists, lists, removes, and protects provider credentials", async () => {
    const { dir, file, manager } = createTempAuthFile();
    tempDirs.push(dir);

    const openaiAuth: ProviderAuth = {
      ...authBase("openai"),
      type: "apiKey",
      apiKey: "sk-test",
    };
    const tokenAuth: ProviderAuth = {
      ...authBase("anthropic"),
      type: "token",
      token: "oauth-token",
    };
    const oauthAuth: ProviderAuth = {
      ...authBase("google"),
      type: "oauth",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: "2026-05-05T01:00:00.000Z",
    };

    await manager.addProvider("openai", openaiAuth);
    await manager.addProvider("anthropic", tokenAuth);
    await manager.addProvider("google", oauthAuth);

    expect(await manager.getProvider("openai")).toEqual(openaiAuth);
    expect((await manager.listProviders()).map((auth) => auth.provider).sort()).toEqual([
      "anthropic",
      "google",
      "openai",
    ]);
    expect(getAuthToken(openaiAuth)).toBe("sk-test");
    expect(getAuthToken(tokenAuth)).toBe("oauth-token");
    expect(getAuthToken(oauthAuth)).toBe("access-token");
    expect(statSync(file).mode & 0o777).toBe(0o600);

    await manager.removeProvider("openai");
    expect(await manager.getProvider("openai")).toBeUndefined();
  });

  it("rejects malformed auth records before they hit the store", async () => {
    const { dir, manager } = createTempAuthFile();
    tempDirs.push(dir);

    await expect(
      manager.addProvider("openai", {
        ...authBase("anthropic"),
        type: "apiKey",
        apiKey: "sk-test",
      })
    ).rejects.toThrow("Provider mismatch");

    await expect(
      manager.addProvider("openai", {
        ...authBase("openai"),
        type: "apiKey",
        apiKey: "",
      })
    ).rejects.toThrow("apiKey auth requires apiKey");

    await expect(
      manager.addProvider("openai", {
        ...authBase("openai"),
        type: "token",
        token: "",
      })
    ).rejects.toThrow("token auth requires token");

    await expect(
      manager.addProvider("openai", {
        ...authBase("openai"),
        type: "oauth",
        accessToken: "",
      })
    ).rejects.toThrow("oauth auth requires accessToken");
  });

  it("maps provider auth into the expected connection test headers", async () => {
    const { dir, manager } = createTempAuthFile();
    tempDirs.push(dir);

    const fetchMock = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal("fetch", fetchMock);

    await manager.addProvider("openai", {
      ...authBase("openai"),
      type: "apiKey",
      apiKey: "openai-key",
      baseUrl: "https://openai.test/v1",
    });
    expect(await manager.testConnection("openai")).toBe(true);
    expect(fetchMock.mock.calls[0]).toEqual([
      "https://openai.test/v1/models",
      { headers: { Authorization: "Bearer openai-key" } },
    ]);

    fetchMock.mockClear();
    await manager.addProvider("anthropic", {
      ...authBase("anthropic"),
      type: "apiKey",
      apiKey: "anthropic-key",
      baseUrl: "https://anthropic.test/v1",
    });
    expect(await manager.testConnection("anthropic")).toBe(true);
    expect(fetchMock.mock.calls[0]).toEqual([
      "https://anthropic.test/v1/models",
      {
        headers: {
          "x-api-key": "anthropic-key",
          "anthropic-version": "2023-06-01",
        },
      },
    ]);

    fetchMock.mockClear();
    await manager.addProvider("anthropic", {
      ...authBase("anthropic"),
      type: "token",
      token: "anthropic-token",
      baseUrl: "https://anthropic.test/v1",
    });
    expect(await manager.testConnection("anthropic")).toBe(true);
    expect(fetchMock.mock.calls[0]).toEqual([
      "https://anthropic.test/v1/models",
      {
        headers: {
          Authorization: "Bearer anthropic-token",
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "oauth-2025-04-20",
        },
      },
    ]);
  });

  it("returns false for missing auth and rejects unsupported connection probes", async () => {
    const { dir, manager } = createTempAuthFile();
    tempDirs.push(dir);

    expect(await manager.testConnection("openai")).toBe(false);

    await manager.addProvider("zai", {
      ...authBase("zai"),
      type: "apiKey",
      apiKey: "zai-key",
    });

    await expect(manager.testConnection("zai")).rejects.toThrow(
      "Unsupported provider for testConnection: zai"
    );
  });

  it("masks known credential fields without mutating the input object", () => {
    const authRecord = {
      apiKey: "1234567890abcdef",
      token: "tokensecret",
      accessToken: "access",
      refreshToken: "refresh",
      note: "keep",
    };

    const masked = maskProviderAuth(authRecord);

    expect(maskSecret("")).toBe("");
    expect(maskSecret("access")).toBe("ac***ss");
    expect(maskSecret("1234567890abcdef")).toBe("123456...cdef");
    expect(masked).toEqual({
      apiKey: "123456...cdef",
      token: "tokens...cret",
      accessToken: "ac***ss",
      refreshToken: "re***sh",
      note: "keep",
    });
    expect(authRecord.apiKey).toBe("1234567890abcdef");
  });
});
