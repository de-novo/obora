import { stat } from "node:fs/promises";

import { fixtureToTestCase, loadFixture, loadFixtures, runWorkflowTest } from "@obora/sdk";
import { Command } from "commander";

import { CLIError } from "../utils/cli-error.js";
import { handleCommandAction } from "../utils/error-handler.js";
import { ExitCode } from "../utils/exit-codes.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts, type GlobalOptions } from "../utils/global-opts.js";

function isYamlFile(path: string): boolean {
  return path.endsWith(".yaml") || path.endsWith(".yml");
}

function matchesFilter(name: string, filter?: string): boolean {
  if (!filter) {
    return true;
  }

  return name.toLowerCase().includes(filter.toLowerCase());
}

interface TestCommandOptions {
  fixture?: string;
  filter?: string;
  json?: boolean;
}

function shouldOutputJson(localJson: boolean | undefined, globalOpts: GlobalOptions): boolean {
  return Boolean(localJson || globalOpts.json);
}

export function createTestCommand(): Command {
  return new Command("test")
    .description("Run workflow tests")
    .argument("[target]", "Workflow or test suite path")
    .option("--fixture <path>", "YAML fixture file")
    .option("--filter <pattern>", "Filter test cases by name")
    .option("--json", "Output as JSON")
    .action(async function (
      this: Command,
      target: string | undefined,
      options: TestCommandOptions
    ) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          const fixturePath = options.fixture ?? target ?? "./tests";
          const jsonOutput = shouldOutputJson(options.json, globalOpts);

          const fixtureStat = await stat(fixturePath).catch(() => null);

          const fixtures = await (async () => {
            if (!fixtureStat) {
              if (fixturePath === "./tests") {
                throw new CLIError(
                  "No test target provided and ./tests was not found. Use `obora test <path>` or `--fixture <path>`.",
                  ExitCode.VALIDATION_ERROR
                );
              }

              throw new CLIError(
                `Test target not found: ${fixturePath}. Check the path and try again.`,
                ExitCode.VALIDATION_ERROR
              );
            }

            if (fixtureStat.isDirectory()) {
              return loadFixtures(fixturePath);
            }
            if (fixtureStat.isFile() && isYamlFile(fixturePath)) {
              return [await loadFixture(fixturePath)];
            }
            throw new CLIError(
              `Unsupported test target: ${fixturePath}. Use a .yaml/.yml fixture or a directory.`,
              ExitCode.VALIDATION_ERROR
            );
          })();

          const selected = fixtures.filter((fixture) =>
            matchesFilter(fixture.name, options.filter)
          );

          if (selected.length === 0) {
            if (jsonOutput) {
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

          const results = await selected.reduce<Promise<Awaited<ReturnType<typeof runWorkflowTest>>[]>>(
            async (previousResults, fixture) => {
              const accumulated = await previousResults;
            if (globalOpts.verbose && !globalOpts.quiet && !jsonOutput) {
              formatter.step(`Running test fixture: ${fixture.name}`);
            }

            const result = await runWorkflowTest(fixtureToTestCase(fixture));

            if (globalOpts.verbose && !globalOpts.quiet && !jsonOutput) {
              formatter.step(`Finished: ${fixture.name} (${result.duration}ms)`);
            }
              return [...accumulated, result];
            },
            Promise.resolve([])
          );

          const failed = results.filter((result) => !result.passed);

          if (jsonOutput) {
            formatter.json({
              target: fixturePath,
              filter: options.filter ?? null,
              total: results.length,
              passed: results.length - failed.length,
              failed: failed.length,
              results,
            });
          } else if (!globalOpts.quiet) {
            results.forEach((result) => {
              if (result.passed) {
                formatter.success(`${result.name} (${result.duration}ms)`);
                return;
              }

              formatter.error(`${result.name} (${result.duration}ms)`);
              result.failures.forEach((failure) => formatter.error(`  - ${failure.message}`));
            });

            formatter.info(
              `Test summary: ${results.length - failed.length}/${results.length} passed, ${failed.length} failed`
            );
          }

          if (failed.length > 0) {
            throw new CLIError(
              "Some tests failed. Review failure messages above and rerun with --verbose for details.",
              ExitCode.EXECUTION_FAILED
            );
          }
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });
}
