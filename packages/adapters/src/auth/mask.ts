export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) {
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function maskProviderAuth(auth: Record<string, unknown> | object): Record<string, unknown> {
  const clone = { ...auth } as Record<string, unknown>;

  ["apiKey", "token", "accessToken", "refreshToken"].forEach((key) => {
    const value = clone[key];
    if (typeof value === "string") {
      clone[key] = maskSecret(value);
    }
  });

  return clone;
}
