import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { OboraError, OboraErrorCode } from "./runtime-errors.js";

export interface AuthResolver {
  resolveAuthRef(authRef: string, options?: { verbose?: boolean }): string | undefined;
}

type GlobalAuthMap = Record<string, string>;

let globalAuthCache: GlobalAuthMap | null = null;

function loadGlobalAuth(): GlobalAuthMap {
  if (globalAuthCache) return globalAuthCache;

  const path = join(homedir(), ".obora", "global-auth.json");
  if (!existsSync(path)) {
    globalAuthCache = {};
    return globalAuthCache;
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    if (parsed && typeof parsed === "object") {
      globalAuthCache = Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).filter(([, v]) => typeof v === "string") as Array<
          [string, string]
        >,
      );
      return globalAuthCache;
    }
  } catch (err) {
    console.warn("[auth-resolver] Failed to parse global auth file, falling back to empty map:", err);
  }

  globalAuthCache = {};
  return globalAuthCache;
}

export function createAuthResolver(): AuthResolver {
  let plainTextAuthRefWarned = false;

  return {
    resolveAuthRef(authRef: string, options?: { verbose?: boolean }): string | undefined {
      if (!authRef) {
        return undefined;
      }

      if (authRef.startsWith("env:")) {
        const envName = authRef.slice("env:".length).trim();
        if (!envName) {
          return undefined;
        }
        return process.env[envName];
      }

      if (authRef.startsWith("global:")) {
        const provider = authRef.slice("global:".length).trim().toLowerCase();
        if (!provider) return undefined;
        const map = loadGlobalAuth();
        return map[provider];
      }

      if (authRef.startsWith("obora-auth:")) {
        throw new OboraError(
          "obora-auth: protocol is not yet supported. Use env:VAR_NAME instead.",
          OboraErrorCode.SDK_NOT_IMPLEMENTED,
        );
      }

      if (options?.verbose && !plainTextAuthRefWarned) {
        plainTextAuthRefWarned = true;
        console.warn("[obora] Plain text authRef detected in config. This is supported but not recommended.");
      }

      return authRef;
    },
  };
}

const defaultAuthResolver = createAuthResolver();

export function resolveAuthRef(authRef: string, options?: { verbose?: boolean }): string | undefined {
  return defaultAuthResolver.resolveAuthRef(authRef, options);
}
