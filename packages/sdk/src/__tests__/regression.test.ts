import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { fixtureToTestCase, loadFixtures } from "../testing/fixture-loader.js";
import { runWorkflowTest } from "../testing/test-runner.js";

const TEST_DIR = fileURLToPath(new URL(".", import.meta.url));
const FIXTURE_DIR = join(TEST_DIR, "fixtures");

const fixtures = await loadFixtures(FIXTURE_DIR);

describe("regression test suite", () => {
  for (const fixture of fixtures) {
    it(fixture.name, async () => {
      const result = await runWorkflowTest(fixtureToTestCase(fixture));

      expect(result.passed, JSON.stringify(result.failures, null, 2)).toBe(true);
    });
  }
});
