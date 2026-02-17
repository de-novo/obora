import { OboraError, OboraErrorCode } from "./runtime.js";

let plainTextAuthRefWarned = false;

export function resolveAuthRef(authRef: string, options?: { verbose?: boolean }): string | undefined {
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
}
