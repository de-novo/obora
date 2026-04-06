export function formatDiagnostic(args: {
  code: string;
  summary: string;
  reason: string;
  fix: string;
  context?: Record<string, string | number | boolean | undefined | null>;
}): string {
  const lines = [
    `[${args.code}] ${args.summary}`,
    `Reason: ${args.reason}`,
    `Fix: ${args.fix}`,
  ];

  if (args.context) {
    const entries = Object.entries(args.context)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => `${key}=${String(value)}`);
    if (entries.length > 0) {
      lines.push(`Context: ${entries.join(", ")}`);
    }
  }

  return lines.join("\n");
}
