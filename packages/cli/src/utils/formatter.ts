export const formatter = {
  success(message: string): void {
    console.log(`✅ ${message}`);
  },

  info(message: string): void {
    console.log(`ℹ️  ${message}`);
  },

  warn(message: string): void {
    console.error(`⚠️  ${message}`);
  },

  error(message: string): void {
    console.error(`❌ ${message}`);
  },

  step(name: string): void {
    console.log(`  → ${name}`);
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
