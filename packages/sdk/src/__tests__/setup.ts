import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll } from "vitest";

const traceOutputDir = mkdtempSync(join(tmpdir(), "obora-sdk-test-traces-"));
const previousTraceOutputDir = process.env.OBORA_TRACE_OUTPUT_DIR;

beforeAll(() => {
  process.env.OBORA_TRACE_OUTPUT_DIR = traceOutputDir;
});

afterAll(() => {
  if (previousTraceOutputDir === undefined) {
    delete process.env.OBORA_TRACE_OUTPUT_DIR;
  } else {
    process.env.OBORA_TRACE_OUTPUT_DIR = previousTraceOutputDir;
  }
  rmSync(traceOutputDir, { recursive: true, force: true });
});
