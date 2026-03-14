import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { fixtureToTestCase, loadFixture } from "../testing/fixture-loader.js";
import { runWorkflowTest } from "../testing/test-runner.js";

const TEST_DIR = fileURLToPath(new URL(".", import.meta.url));
const FIXTURE_DIR = join(TEST_DIR, "fixtures");

const fixtureFiles = (await readdir(FIXTURE_DIR))
  .filter((name) => /\.ya?ml$/i.test(name) && !name.startsWith("one-file-") && name != "validation-repair-loop.yaml")
  .sort();
const fixtures = await Promise.all(fixtureFiles.map((name) => loadFixture(join(FIXTURE_DIR, name))));

describe("regression test suite", () => {
  for (const fixture of fixtures) {
    it(fixture.name, async () => {
      const result = await runWorkflowTest(fixtureToTestCase(fixture));

      expect(result.passed, JSON.stringify(result.failures, null, 2)).toBe(true);
    });
  }
});
