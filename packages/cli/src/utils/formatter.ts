const ANSI = {
  reset: "\u001b[0m",
  green: "\u001b[32m",
  red: "\u001b[31m",
  yellow: "\u001b[33m",
  blue: "\u001b[34m",
  dim: "\u001b[2m",
} as const;

function shouldUseColorByDefault(): boolean {
  return process.env.NO_COLOR === undefined;
}

let colorEnabled = shouldUseColorByDefault();

function colorize(color: keyof typeof ANSI, message: string): string {
  if (!colorEnabled) {
    return message;
  }

  return `${ANSI[color]}${message}${ANSI.reset}`;
}

export const formatter = {
  setColorEnabled(enabled: boolean): void {
    colorEnabled = enabled;
  },

  success(message: string): void {
    console.log(colorize("green", `✅ ${message}`));
  },

  info(message: string): void {
    console.log(colorize("blue", `ℹ ${message}`));
  },

  warn(message: string): void {
    console.error(colorize("yellow", `⚠️ ${message}`));
  },

  error(message: string): void {
    console.error(colorize("red", `❌ ${message}`));
  },

  step(name: string): void {
    console.log(colorize("dim", `  → ${name}`));
  },

  json(data: unknown): void {
    console.log(JSON.stringify(data, null, 2));
  },

  table(rows: Array<Record<string, unknown>>): void {
    if (rows.length === 0) {
      return;
    }

    console.table(rows);
  },
};
