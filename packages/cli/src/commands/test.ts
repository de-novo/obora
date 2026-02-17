import { stat } from "node:fs/promises";

import { Command } from "commander";

import { fixtureToTestCase, loadFixture, loadFixtures, runWorkflowTest } from "@obora/sdk";

import { CLIError } from "../utils/cli-error.js";
import { ExitCode } from "../utils/exit-codes.js";
import { handleCommandAction } from "../utils/error-handler.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts } from "../utils/global-opts.js";

function isYamlFile(path: string): boolean {
  return path.endsWith(".yaml") || path.endsWith(".yml");
}

function matchesFilter(name: string, filter?: string): boolean {
  if (!filter) {
    return true;
  }

  return name.toLowerCase().includes(filter.toLowerCase());
}

export function createTestCommand(): Command {
  return new Command("test")
    .description("Run workflow tests")
    .argument("[target]", "Workflow or test suite path")
    .option("--fixture <path>", "YAML fixture file")
    .option("--filter <pattern>", "Filter test cases by name")
    .action(async function (this: Command, target, options) {
      await handleCommandAction(async () => {
        const globalOpts = getGlobalOpts(this);
        const fixturePath = options.fixture ?? target ?? "./tests";

        const fixtureStat = await stat(fixturePath).catch(() => null);

        let fixtures;
        if (!fixtureStat) {
          if (fixturePath === "./tests") {
            throw new CLIError("No test target provided and ./tests was not found.", ExitCode.VALIDATION_ERROR);
          }

          throw new CLIError(`Test target not found: ${fixturePath}`, ExitCode.VALIDATION_ERROR);
        }

        if (fixtureStat.isDirectory()) {
          fixtures = await loadFixtures(fixturePath);
        } else if (fixtureStat.isFile() && isYamlFile(fixturePath)) {
          fixtures = [await loadFixture(fixturePath)];
        } else {
          throw new CLIError(
            `Unsupported test target: ${fixturePath}. Use a .yaml/.yml fixture or a directory.`,
            ExitCode.VALIDATION_ERROR,
          );
        }

        const selected = fixtures.filter((fixture) => matchesFilter(fixture.name, options.filter));

        if (selected.length === 0) {
          if (globalOpts.json) {
            formatter.json({
              target: fixturePath,
              filter: options.filter ?? null,
              total: 0,
              passed: 0,
              failed: 0,
              results: [],
            });
          } else if (!globalOpts.quiet) {
            formatter.warn("No test fixtures matched the provided target/filter.");
          }
          return;
        }

        const results = await Promise.all(
          selected.map(async (fixture) => runWorkflowTest(fixtureToTestCase(fixture))),
        );

        const failed = results.filter((result) => !result.passed);

        if (globalOpts.json) {
          formatter.json({
            target: fixturePath,
            filter: options.filter ?? null,
            total: results.length,
            passed: results.length - failed.length,
            failed: failed.length,
            results,
          });
        } else if (!globalOpts.quiet) {
          for (const result of results) {
            if (result.passed) {
              formatter.success(`${result.name} (${result.duration}ms)`);
              continue;
            }

            formatter.error(`${result.name} (${result.duration}ms)`);
            for (const failure of result.failures) {
              formatter.error(`  - ${failure.message}`);
            }
          }

          formatter.info(
            `Test summary: ${results.length - failed.length}/${results.length} passed, ${failed.length} failed`,
          );
        }

        if (failed.length > 0) {
          throw new CLIError("Some tests failed.", ExitCode.EXECUTION_FAILED);
        }
      });
    });
}
