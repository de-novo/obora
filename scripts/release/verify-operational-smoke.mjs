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
const cliChatViewDistPath = join(rootDir, 'packages/cli/dist/chat/view.js');
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

const stripAnsi = (value) =>
  value
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/gu, '')
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, '')
    .replace(/\u001b[=>]/gu, '');

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

const verifyCliChatOnceSmoke = async (tmpDir) => {
  const homeDir = join(tmpDir, 'chat-home');
  await mkdir(homeDir, { recursive: true });
  const env = createSmokeEnv(homeDir);
  const projectDir = join(tmpDir, 'chat-project');
  const sessionId = 'smoke-chat-session';
  const chatTask = 'Add a concise usage note after inspecting the project files';

  await runCliJson({
    cwd: tmpDir,
    env,
    label: 'obora quickstart --json for chat smoke',
    args: ['--json', 'quickstart', projectDir],
  });

  const finalState = await runCliJson({
    cwd: projectDir,
    env,
    label: 'obora chat --once --dry-run --json',
    args: ['--json', 'chat', 'judge.yaml', '--dry-run', '--session', sessionId, '--once', chatTask],
  });
  assert(finalState.sessionId === sessionId, 'chat once JSON must preserve the requested session id');
  assert(finalState.status === 'ready', 'chat once dry-run must leave the session ready');
  assert(finalState.workflowLocator?.name === 'quickstart-judge', 'chat once must resolve judge.yaml');
  assert(finalState.lastRunTask === chatTask, 'chat once must treat the input message as the task source');
  assert(
    finalState.lastRunCommand === 'obora run judge.yaml',
    'chat once must record the executable workflow command',
  );
  assert(
    finalState.messages?.some?.(
      (message) => message.role === 'user' && message.content === chatTask,
    ) === true,
    'chat once must persist the user task as a chat message',
  );

  const sessions = await runCliJson({
    cwd: projectDir,
    env,
    label: 'obora chat --list-sessions --json',
    args: ['--json', 'chat', '--list-sessions'],
  });
  assert(Array.isArray(sessions), 'chat session list must return an array');
  assert(
    sessions.some((session) => session.sessionId === sessionId && session.lastRunTask === chatTask),
    'chat session list must include the saved once session and task',
  );

  const persistedState = await runCliJson({
    cwd: projectDir,
    env,
    label: 'obora chat --show-session --json',
    args: ['--json', 'chat', '--show-session', '--session', sessionId],
  });
  assert(persistedState.sessionId === sessionId, 'show-session must load the saved chat session');
  assert(
    persistedState.lastRunWorkflowLocator?.name === 'quickstart-judge',
    'show-session must preserve the retry workflow locator',
  );
  assert(
    persistedState.lastRunTask === chatTask,
    'show-session must preserve the original chat task',
  );

  console.log('[PASS] Built CLI chat once smoke passed.');
};

const verifyCliChatRunHistorySmoke = async (tmpDir) => {
  const homeDir = join(tmpDir, 'chat-run-home');
  await mkdir(homeDir, { recursive: true });
  const env = createSmokeEnv(homeDir);
  const projectDir = join(tmpDir, 'chat-run-project');
  const sessionId = 'smoke-chat-run-session';
  const chatTask = 'Record this live chat run and keep it retryable';
  const workflowPath = join(projectDir, 'workflow.yaml');

  await mkdir(projectDir, { recursive: true });
  await writeFile(
    workflowPath,
    [
      'name: smoke-chat-run-workflow',
      'version: "1.0"',
      'steps: []',
      '',
    ].join('\n'),
    'utf8',
  );

  const finalState = await runCliJson({
    cwd: projectDir,
    env,
    label: 'obora chat live --once --json',
    args: ['--json', 'chat', 'workflow.yaml', '--session', sessionId, '--once', chatTask],
  });
  const executionId = finalState.lastRunSummary?.executionId;
  assert(finalState.dryRun === false, 'live chat smoke must not run in dry-run mode');
  assert(finalState.lastRunSummary?.status === 'completed', 'live chat smoke must complete a run');
  assert(executionId, 'live chat smoke must persist a run execution id');
  assert(
    finalState.lastRunTask === chatTask,
    'live chat smoke must preserve the chat task as retry input',
  );

  const runs = await runCliJson({
    cwd: projectDir,
    env,
    label: 'obora chat --list-runs --json after live run',
    args: ['--json', 'chat', '--list-runs', '--session', sessionId],
  });
  assert(Array.isArray(runs), 'chat run list must return an array');
  assert(
    runs.some(
      (detail) =>
        detail.runSummary?.executionId === executionId &&
        detail.runSummary?.status === 'completed' &&
        detail.runTask === chatTask,
    ),
    'chat run list must include the saved live run and task',
  );

  const detail = await runCliJson({
    cwd: projectDir,
    env,
    label: 'obora chat --show-run --json after live run',
    args: ['--json', 'chat', '--show-run', executionId, '--session', sessionId],
  });
  assert(detail.sessionId === sessionId, 'show-run must load the run from the requested session');
  assert(detail.runSummary?.executionId === executionId, 'show-run must return the requested run');
  assert(detail.runTask === chatTask, 'show-run must preserve the original chat task');
  assert(
    detail.runWorkflowLocator?.name === 'smoke-chat-run-workflow',
    'show-run must preserve the retry workflow locator',
  );

  const retryState = await runCliJson({
    cwd: projectDir,
    env,
    label: 'obora chat /retry --json after live run',
    args: ['--json', 'chat', '--session', sessionId, '--once', `/retry ${executionId}`],
  });
  assert(retryState.lastRunSummary?.status === 'completed', 'chat retry must complete a new run');
  assert(
    retryState.lastRunSummary?.executionId !== executionId,
    'chat retry must create a new execution id',
  );
  assert(retryState.lastRunTask === chatTask, 'chat retry must reuse the original task');
  assert(
    retryState.messages?.some?.(
      (message) => message.role === 'user' && message.content === chatTask,
    ) === true,
    'chat retry must append the retried task as a user message',
  );

  console.log('[PASS] Built CLI chat run history smoke passed.');
};

const verifyCliChatWorkflowSwitchSmoke = async (tmpDir) => {
  const homeDir = join(tmpDir, 'chat-switch-home');
  await mkdir(homeDir, { recursive: true });
  const env = createSmokeEnv(homeDir);
  const projectDir = join(tmpDir, 'chat-switch-project');
  const sessionId = 'smoke-chat-switch-session';
  const alphaTask = 'Run the alpha workflow task';
  const betaTask = 'Run the beta workflow task';

  await mkdir(projectDir, { recursive: true });
  await writeFile(
    join(projectDir, 'alpha.yaml'),
    ['name: alpha-switch-workflow', 'version: "1.0"', 'steps: []', ''].join('\n'),
    'utf8',
  );
  await writeFile(
    join(projectDir, 'beta.yaml'),
    ['name: beta-switch-workflow', 'version: "1.0"', 'steps: []', ''].join('\n'),
    'utf8',
  );

  const alphaState = await runCliJson({
    cwd: projectDir,
    env,
    label: 'obora chat alpha workflow --json',
    args: ['--json', 'chat', 'alpha.yaml', '--session', sessionId, '--once', alphaTask],
  });
  const alphaExecutionId = alphaState.lastRunSummary?.executionId;
  assert(alphaExecutionId, 'workflow switch smoke must create an alpha execution');
  assert(
    alphaState.lastRunWorkflowLocator?.name === 'alpha-switch-workflow',
    'alpha run must record its workflow locator',
  );

  const switchedState = await runCliJson({
    cwd: projectDir,
    env,
    label: 'obora chat /workflow beta.yaml --json',
    args: ['--json', 'chat', '--session', sessionId, '--once', '/workflow beta.yaml'],
  });
  assert(
    switchedState.workflowLocator?.name === 'beta-switch-workflow',
    'workflow switch smoke must select beta workflow',
  );

  const betaState = await runCliJson({
    cwd: projectDir,
    env,
    label: 'obora chat beta workflow --json',
    args: ['--json', 'chat', '--session', sessionId, '--once', betaTask],
  });
  const betaExecutionId = betaState.lastRunSummary?.executionId;
  assert(betaExecutionId, 'workflow switch smoke must create a beta execution');
  assert(betaExecutionId !== alphaExecutionId, 'beta run must create a distinct execution');
  assert(
    betaState.lastRunWorkflowLocator?.name === 'beta-switch-workflow',
    'beta run must record its workflow locator',
  );

  const runs = await runCliJson({
    cwd: projectDir,
    env,
    label: 'obora chat --list-runs --json after workflow switch',
    args: ['--json', 'chat', '--list-runs', '--session', sessionId],
  });
  assert(
    runs.some(
      (detail) =>
        detail.runSummary?.executionId === alphaExecutionId &&
        detail.workflowTarget === 'alpha.yaml' &&
        detail.runTask === alphaTask &&
        detail.runWorkflowLocator?.name === 'alpha-switch-workflow',
    ),
    'run history must keep the alpha task and locator after switching to beta',
  );
  assert(
    runs.some(
      (detail) =>
        detail.runSummary?.executionId === betaExecutionId &&
        detail.workflowTarget === 'beta.yaml' &&
        detail.runTask === betaTask &&
        detail.runWorkflowLocator?.name === 'beta-switch-workflow',
    ),
    'run history must keep the beta task and locator',
  );

  const alphaDetail = await runCliJson({
    cwd: projectDir,
    env,
    label: 'obora chat --show-run alpha after workflow switch',
    args: ['--json', 'chat', '--show-run', alphaExecutionId, '--session', sessionId],
  });
  assert(
    alphaDetail.workflowTarget === 'alpha.yaml',
    'show-run must keep the alpha workflow target after switching to beta',
  );
  assert(alphaDetail.runTask === alphaTask, 'show-run must keep the alpha task');
  assert(
    alphaDetail.runWorkflowLocator?.name === 'alpha-switch-workflow',
    'show-run must keep the alpha workflow locator',
  );

  const alphaDetailsState = await runCliJson({
    cwd: projectDir,
    env,
    label: 'obora chat /details alpha after workflow switch',
    args: ['--json', 'chat', '--session', sessionId, '--once', `/details ${alphaExecutionId}`],
  });
  assert(
    alphaDetailsState.inspectedRunSummary?.executionId === alphaExecutionId,
    'chat /details must inspect the alpha run after switching to beta',
  );
  assert(
    alphaDetailsState.lastRunTask === alphaTask,
    'chat /details must restore alpha retry task after switching to beta',
  );
  assert(
    alphaDetailsState.lastRunWorkflowLocator?.name === 'alpha-switch-workflow',
    'chat /details must restore alpha retry workflow after switching to beta',
  );

  console.log('[PASS] Built CLI chat workflow switch smoke passed.');
};

const verifyCliChatTuiLayoutSmoke = async () => {
  await assertFile(
    cliChatViewDistPath,
    'Built CLI chat view is missing. Run pnpm build before pnpm verify:smoke.',
  );

  const { renderChatView } = await import(pathToFileURL(cliChatViewDistPath).href);
  const runSummary = {
    executionId: 'exec-layout-1',
    workflowName: 'layout-workflow',
    status: 'completed',
    startedAt: '2026-05-26T00:00:00.000Z',
    endedAt: '2026-05-26T00:00:02.000Z',
    durationMs: 2000,
    completedStepCount: 0,
    totalStepCount: 0,
    message: 'Workflow completed: 0/0 steps completed.',
    steps: [],
  };
  const locator = {
    id: 'project:layout-workflow',
    scope: 'project',
    name: 'layout-workflow',
    path: '/repo/.obora/workflows/layout.yaml',
    displayPath: '.obora/workflows/layout.yaml',
    editable: true,
    sourceDir: '/repo/.obora/workflows',
    stepCount: 0,
    projectRoot: '/repo',
  };
  const lines = renderChatView(
    {
      sessionId: 'layout-session',
      status: 'ready',
      cwd: '/repo',
      projectRoot: '/repo',
      dryRun: true,
      messages: [],
      runChoices: [
        {
          runSummary,
          sessionId: 'layout-session',
          messageId: 'assistant:layout',
          source: 'persisted',
          runTask: 'inspect a very long run options display in the terminal history panel',
          runWorkflowLocator: locator,
          runOptions: {
            provider: 'openrouter',
            model: 'openrouter/owl-alpha',
            config: '/repo/.obora/config.yaml',
            agents: '/repo/agents.yaml',
            policy: '/repo/policy.yaml',
            timeout: 2500,
          },
        },
      ],
    },
    { columns: 88 },
  );
  const plain = stripAnsi(lines.join('\n'));
  assert(plain.includes('retry layout-workflow'), 'TUI run history must keep retry value visible');
  assert(plain.includes('options provider openrouter'), 'TUI run history must show compact options');
  assert(plain.includes('model openrouter/owl-alpha'), 'TUI run history must show the run model');
  assert(plain.includes('timeout 2500ms'), 'TUI run history must show timeout metadata');
  assert(plain.includes('files+3'), 'TUI run history must summarize file-backed options compactly');
  assert(
    !plain.includes('config /repo/.obora/config.yaml'),
    'TUI run history must not expand long config paths',
  );

  console.log('[PASS] Built CLI chat TUI layout smoke passed.');
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
      dependencies: {
        logger: false,
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
    await verifyCliChatOnceSmoke(tmpDir);
    await verifyCliChatRunHistorySmoke(tmpDir);
    await verifyCliChatWorkflowSwitchSmoke(tmpDir);
    await verifyCliChatTuiLayoutSmoke();
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
