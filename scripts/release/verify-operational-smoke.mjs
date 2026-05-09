#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const rootDir = fileURLToPath(new URL('../../', import.meta.url));
const cliPath = join(rootDir, 'packages/cli/bin/obora.js');
const cliDistPath = join(rootDir, 'packages/cli/dist/index.js');
const dashboardDistPath = join(rootDir, 'packages/dashboard/dist/index.js');

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`[FAIL] ${message}`);
  }
};

const assertFile = async (file, message) => {
  try {
    await access(file, constants.F_OK);
  } catch {
    throw new Error(`[FAIL] ${message}`);
  }
};

const parseJsonOutput = (label, stdout) => {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(
      `[FAIL] ${label} did not produce valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }\n${stdout}`,
    );
  }
};

const createSmokeEnv = (homeDir) => {
  const env = { ...process.env, HOME: homeDir, CI: '1' };
  [
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'ZAI_API_KEY',
    'OBORA_LLM_PROVIDER',
    'OBORA_LLM_MODEL',
    'OBORA_LLM_API_KEY',
    'OBORA_HISTORY_DB_PATH',
    'OBORA_RESUME_COMMAND',
    'OBORA_DLQ_PATH',
  ].forEach((key) => {
    delete env[key];
  });
  return env;
};

const runCliJson = async ({ cwd, env, args, label }) => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [cliPath, ...args], {
    cwd,
    env,
    maxBuffer: 1024 * 1024,
  });
  assert(stderr.trim().length === 0, `${label} wrote to stderr: ${stderr.trim()}`);
  return parseJsonOutput(label, stdout);
};

const verifyCliOnboardingSmoke = async (tmpDir) => {
  await assertFile(cliDistPath, 'Built CLI is missing. Run pnpm build before pnpm verify:smoke.');

  const homeDir = join(tmpDir, 'home');
  await mkdir(homeDir, { recursive: true });
  const env = createSmokeEnv(homeDir);
  const projectDir = join(tmpDir, 'operator-project');

  const quickstart = await runCliJson({
    cwd: tmpDir,
    env,
    label: 'obora quickstart --json',
    args: ['--json', 'quickstart', projectDir],
  });
  assert(quickstart.initialized === true, 'quickstart JSON must report initialized=true');
  assert(quickstart.template === 'quickstart', 'quickstart JSON must report template=quickstart');

  const doctor = await runCliJson({
    cwd: projectDir,
    env,
    label: 'obora doctor --json',
    args: ['--json', 'doctor'],
  });
  assert(doctor.status?.status === 'needs_config', 'doctor JSON must report the no-auth onboarding state');
  assert(doctor.auth?.configuredProvider === 'openai', 'doctor JSON must preserve the quickstart provider');

  const validation = await runCliJson({
    cwd: projectDir,
    env,
    label: 'obora validate --json',
    args: ['--json', 'validate', 'judge.yaml'],
  });
  assert(validation.summary?.failed === 0, 'validate JSON must report zero failed files');
  assert(validation.summary?.passed === 1, 'validate JSON must report one passed file');

  const expanded = await runCliJson({
    cwd: projectDir,
    env,
    label: 'obora expand --json',
    args: ['--json', 'expand', 'judge.yaml'],
  });
  assert(expanded.workflow === 'quickstart-judge', 'expand JSON must identify the quickstart workflow');
  assert(
    Array.isArray(expanded.expandedWorkflow?.steps) && expanded.expandedWorkflow.steps.length > 0,
    'expand JSON must include expanded workflow steps',
  );

  const judge = await runCliJson({
    cwd: projectDir,
    env,
    label: 'obora judge --dry-run --json',
    args: ['--json', 'judge', '--dry-run'],
  });
  assert(judge.workflow === 'quickstart-judge', 'judge dry-run JSON must identify the quickstart workflow');
  assert(judge.validated === true, 'judge dry-run JSON must report validated=true');
  assert(judge.overview?.nextStep === 'obora judge', 'judge dry-run JSON must include the live execution next step');

  console.log('[PASS] Built CLI onboarding smoke passed.');
};

const withIsolatedDashboardEnv = async (fn) => {
  const keys = ['OBORA_HISTORY_DB_PATH', 'OBORA_RESUME_COMMAND', 'OBORA_DLQ_PATH'];
  const original = new Map(keys.map((key) => [key, process.env[key]]));
  keys.forEach((key) => {
    delete process.env[key];
  });

  try {
    return await fn();
  } finally {
    original.forEach((value, key) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }
};

const verifyDashboardBootstrapSmoke = async (tmpDir) => {
  await assertFile(
    dashboardDistPath,
    'Built dashboard package is missing. Run pnpm build before pnpm verify:smoke.',
  );

  const staticDir = join(tmpDir, 'dashboard-static');
  await mkdir(staticDir, { recursive: true });
  await writeFile(join(staticDir, 'index.html'), '<!doctype html><title>Obora smoke</title>', 'utf8');

  await withIsolatedDashboardEnv(async () => {
    const dashboard = await import(pathToFileURL(dashboardDistPath).href);
    const handle = await dashboard.bootstrapDashboardServer({
      config: {
        host: '127.0.0.1',
        port: 0,
        staticDir,
      },
      requireStaticAssets: true,
    });

    try {
      assert(handle.port > 0, 'dashboard bootstrap must bind an ephemeral port');
      assert(handle.url === `http://127.0.0.1:${handle.port}`, 'dashboard bootstrap must return the resolved URL');
      assert(handle.staticAssets?.available === true, 'dashboard bootstrap must confirm static assets');

      const health = await handle.app.inject({ method: 'GET', url: '/api/health' });
      assert(health.statusCode === 200, 'dashboard health route must respond after bootstrap');

      await handle.close();
      await handle.close();
    } finally {
      await handle.close().catch(() => undefined);
    }
  });

  console.log('[PASS] Dashboard bootstrap smoke passed.');
};

const main = async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), 'obora-operational-smoke-'));
  try {
    await verifyCliOnboardingSmoke(tmpDir);
    await verifyDashboardBootstrapSmoke(tmpDir);
    console.log('[PASS] Operational smoke completed successfully.');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
