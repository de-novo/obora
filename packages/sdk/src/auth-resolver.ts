export function resolveAuthRef(authRef: string): string | undefined {
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
    console.warn(
      `[obora] authRef '${authRef}' uses obora-auth profile resolution, which is not implemented yet. Falling back to undefined.`,
    );
    return undefined;
  }

  console.warn("[obora] Plain text authRef detected in config. This is supported but not recommended.");
  return authRef;
}
