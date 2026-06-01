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

const runCliText = async ({ cwd, env, args, label }) => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [cliPath, ...args], {
    cwd,
    env,
    maxBuffer: 1024 * 1024,
  });
  assert(stderr.trim().length === 0, `${label} wrote to stderr: ${stderr.trim()}`);
  return stripAnsi(stdout);
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
    args: [
      '--json',
      'chat',
      'judge.yaml',
      '--dry-run',
      '--session',
      sessionId,
      '--tags',
      'smoke,release',
      '--once',
      chatTask,
    ],
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
  const savedSession = sessions.find((session) => session.sessionId === sessionId);
  const savedSessionDay = savedSession?.updatedAt?.slice?.(0, 10);
  assert(savedSessionDay, 'chat session list must include an updated day for grouping');

  const sessionsText = await runCliText({
    cwd: projectDir,
    env,
    label: 'obora chat --list-sessions text',
    args: ['chat', '--list-sessions'],
  });
  assert(
    sessionsText.includes('sessionId') &&
      sessionsText.includes('workflow') &&
      sessionsText.includes('retry') &&
      sessionsText.includes('lastTask'),
    'chat session list text must expose session, workflow, retry, and last task columns',
  );
  assert(
    sessionsText.includes(sessionId),
    'chat session list text must include the saved session id',
  );
  assert(
    sessionsText.includes('quickstart-judge'),
    'chat session list text must include the retry workflow name',
  );
  assert(
    sessionsText.includes(chatTask),
    'chat session list text must include the saved chat task',
  );

  const groupedSessionsText = await runCliText({
    cwd: projectDir,
    env,
    label: 'obora chat --list-sessions grouped text',
    args: ['chat', '--list-sessions', '--group-sessions', 'tag', '--filter-tag', 'smoke'],
  });
  assert(
    groupedSessionsText.includes('group') &&
      groupedSessionsText.includes('smoke') &&
      groupedSessionsText.includes(sessionId),
    'chat grouped session list text must include the tag group and saved session id',
  );
  assert(
    groupedSessionsText.includes('quickstart-judge') && groupedSessionsText.includes(chatTask),
    'chat grouped session list text must preserve retry workflow and task metadata',
  );

  const dayGroupedSessionsText = await runCliText({
    cwd: projectDir,
    env,
    label: 'obora chat --list-sessions day grouped text',
    args: ['chat', '--list-sessions', '--group-sessions', 'day'],
  });
  assert(
    dayGroupedSessionsText.includes('group') &&
      dayGroupedSessionsText.includes(savedSessionDay) &&
      dayGroupedSessionsText.includes(sessionId),
    'chat day-grouped session list text must include the updated day group and saved session id',
  );
  assert(
    dayGroupedSessionsText.includes('quickstart-judge') && dayGroupedSessionsText.includes(chatTask),
    'chat day-grouped session list text must preserve workflow and task metadata',
  );

  const projectGroupedSessionsText = await runCliText({
    cwd: projectDir,
    env,
    label: 'obora chat --list-sessions project grouped text',
    args: ['chat', '--list-sessions', '--group-sessions', 'project'],
  });
  assert(
    projectGroupedSessionsText.includes('group') &&
      projectGroupedSessionsText.includes(projectDir) &&
      projectGroupedSessionsText.includes(sessionId),
    'chat project-grouped session list text must include the project group and saved session id',
  );
  assert(
    projectGroupedSessionsText.includes('quickstart-judge') &&
      projectGroupedSessionsText.includes(chatTask),
    'chat project-grouped session list text must preserve workflow and task metadata',
  );

  const currentProjectSessionsText = await runCliText({
    cwd: projectDir,
    env,
    label: 'obora chat --list-sessions current project text',
    args: ['chat', '--list-sessions', '--filter-project', 'current'],
  });
  assert(
    currentProjectSessionsText.includes(sessionId) &&
      currentProjectSessionsText.includes(projectDir),
    'chat project-filtered session list text must include the current project session',
  );
  assert(
    currentProjectSessionsText.includes('quickstart-judge') &&
      currentProjectSessionsText.includes(chatTask),
    'chat project-filtered session list text must preserve workflow and task metadata',
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

  const persistedText = await runCliText({
    cwd: projectDir,
    env,
    label: 'obora chat --show-session text',
    args: ['chat', '--show-session', '--session', sessionId],
  });
  assert(
    persistedText.includes(`Session ${sessionId}`),
    'show-session text must identify the selected session',
  );
  assert(
    persistedText.includes(`Retry: quickstart-judge -> ${chatTask}`),
    'show-session text must expose the retry workflow and task',
  );
  assert(
    persistedText.includes('Retry command: obora run judge.yaml'),
    'show-session text must expose the retry command',
  );
  assert(
    persistedText.includes(`- user`) && persistedText.includes(chatTask),
    'show-session text must include recent chat messages',
  );
  assert(
    !persistedText.includes('"sessionId"'),
    'show-session text must not fall back to raw JSON without --json',
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
    args: [
      '--json',
      'chat',
      'workflow.yaml',
      '--session',
      sessionId,
      '--tags',
      'smoke-run,release',
      '--once',
      chatTask,
    ],
  });
  const executionId = finalState.lastRunSummary?.executionId;
  assert(finalState.dryRun === false, 'live chat smoke must not run in dry-run mode');
  assert(finalState.lastRunSummary?.status === 'completed', 'live chat smoke must complete a run');
  assert(executionId, 'live chat smoke must persist a run execution id');
  assert(
    finalState.lastRunTask === chatTask,
    'live chat smoke must preserve the chat task as retry input',
  );
  const runProjectRoot = finalState.projectRoot ?? projectDir;

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

  const filteredRuns = await runCliJson({
    cwd: projectDir,
    env,
    label: 'obora chat --list-runs filtered --json after live run',
    args: [
      '--json',
      'chat',
      '--list-runs',
      '--filter-project',
      'current',
      '--filter-tag',
      'smoke-run',
      '--filter-run-status',
      'completed',
    ],
  });
  assert(
    filteredRuns.some(
      (detail) =>
        detail.runSummary?.executionId === executionId &&
        detail.projectRoot === runProjectRoot &&
        detail.runTask === chatTask,
    ),
    'filtered chat run list must include the saved run with project, tag, and status filters',
  );

  const filteredRunsText = await runCliText({
    cwd: projectDir,
    env,
    label: 'obora chat --list-runs filtered text after live run',
    args: [
      'chat',
      '--list-runs',
      '--filter-project',
      'current',
      '--filter-tag',
      'smoke-run',
      '--filter-run-status',
      'completed',
    ],
  });
  assert(
    filteredRunsText.includes(executionId) &&
      filteredRunsText.includes(runProjectRoot) &&
      filteredRunsText.includes('smoke-chat-run-workflow') &&
      filteredRunsText.includes(chatTask),
    'filtered chat run list text must include execution, project, workflow, and task metadata',
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

  const auditSessionId = 'smoke-chat-audit-session';
  const auditExecutionId = 'smoke-chat-audit-exec';
  const auditSessionDir = join(projectDir, '.obora', 'chat', 'sessions');
  const auditWorkflowLocator = {
    id: 'external:audit-workflow',
    scope: 'external',
    name: 'smoke-chat-audit-workflow',
    path: workflowPath,
    displayPath: 'workflow.yaml',
    editable: false,
    sourceDir: workflowPath,
    stepCount: 1,
  };
  const auditRunSummary = {
    executionId: auditExecutionId,
    workflowName: 'smoke-chat-audit-workflow',
    status: 'completed',
    startedAt: '2026-05-24T00:00:00.000Z',
    endedAt: '2026-05-24T00:00:01.000Z',
    durationMs: 1000,
    completedStepCount: 1,
    totalStepCount: 1,
    message: 'Workflow completed: 1/1 steps completed.',
    steps: [
      {
        name: 'collect-context',
        status: 'completed',
        agent: 'collector',
        model: 'openrouter/owl-alpha',
        task: 'Collect repository context',
        outputPreview: 'Collected repository context.',
        outputFormat: 'text',
        methodology: 'Inspect persisted chat run detail',
        rationale: 'The context is required for audit.',
        toolsUsed: ['file_read'],
        artifacts: ['audit-notes.md'],
        decisions: ['Use saved run metadata'],
        dependencies: ['bootstrap'],
        issues: ['none'],
      },
    ],
  };
  await mkdir(auditSessionDir, { recursive: true });
  await writeFile(
    join(auditSessionDir, `${encodeURIComponent(auditSessionId)}.json`),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        updatedAt: '2026-05-24T00:00:02.000Z',
        state: {
          sessionId: auditSessionId,
          status: 'ready',
          cwd: projectDir,
          projectRoot: runProjectRoot,
          tags: ['smoke-run'],
          dryRun: false,
          workflowTarget: 'workflow.yaml',
          messages: [
            {
              id: 'system:audit',
              role: 'system',
              content: 'Audit smoke session.',
              createdAt: '2026-05-24T00:00:00.000Z',
            },
            {
              id: 'assistant:audit-run',
              role: 'assistant',
              content: 'Workflow completed: 1/1 steps completed.',
              createdAt: '2026-05-24T00:00:02.000Z',
              workflowTarget: 'workflow.yaml',
              runTask: 'Audit saved run detail',
              runWorkflowLocator: auditWorkflowLocator,
              runOptions: {
                provider: 'openrouter',
                model: 'openrouter/owl-alpha',
                timeout: 2500,
              },
              runSummary: auditRunSummary,
            },
          ],
          lastRunCommand: 'obora run workflow.yaml',
          lastRunTask: 'Audit saved run detail',
          lastRunProjectRoot: runProjectRoot,
          lastRunWorkflowLocator: auditWorkflowLocator,
          lastRunOptions: {
            provider: 'openrouter',
            model: 'openrouter/owl-alpha',
            timeout: 2500,
          },
          lastRunSummary: auditRunSummary,
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  const auditDetailText = await runCliText({
    cwd: projectDir,
    env,
    label: 'obora chat --show-run audit text',
    args: ['chat', '--show-run', auditExecutionId, '--session', auditSessionId],
  });
  assert(
    auditDetailText.includes(`Run ${auditExecutionId}`) &&
      auditDetailText.includes('Step details:') &&
      auditDetailText.includes('collect-context [completed] agent=collector model=openrouter/owl-alpha'),
    'show-run text must include saved step title, agent, and model metadata',
  );
  assert(
    auditDetailText.includes('tools: file_read') &&
      auditDetailText.includes('artifacts: audit-notes.md') &&
      auditDetailText.includes('decisions: Use saved run metadata') &&
      auditDetailText.includes('dependencies: bootstrap') &&
      auditDetailText.includes('issues: none'),
    'show-run text must include saved tools, artifacts, decisions, dependencies, and issues',
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

const verifyCliChatSessionRetryFlowSmoke = async (tmpDir) => {
  const homeDir = join(tmpDir, 'chat-session-retry-home');
  await mkdir(homeDir, { recursive: true });
  const env = createSmokeEnv(homeDir);
  const projectDir = join(tmpDir, 'chat-session-retry-project');
  const sourceSessionId = 'smoke-chat-source-session';
  const browserSessionId = 'smoke-chat-browser-session';
  const sessionTag = 'smoke-retry';
  const chatTask = 'Keep this selected session retryable';

  await mkdir(projectDir, { recursive: true });
  await writeFile(
    join(projectDir, 'workflow.yaml'),
    ['name: session-retry-workflow', 'version: "1.0"', 'steps: []', ''].join('\n'),
    'utf8',
  );

  const sourceState = await runCliJson({
    cwd: projectDir,
    env,
    label: 'obora chat source session --json',
    args: [
      '--json',
      'chat',
      'workflow.yaml',
      '--session',
      sourceSessionId,
      '--tags',
      sessionTag,
      '--once',
      chatTask,
    ],
  });
  const sourceExecutionId = sourceState.lastRunSummary?.executionId;
  assert(sourceExecutionId, 'session retry smoke must create a source execution');
  assert(
    sourceState.lastRunWorkflowLocator?.name === 'session-retry-workflow',
    'source session must preserve the retry workflow locator',
  );

  const listedState = await runCliJson({
    cwd: projectDir,
    env,
    label: 'obora chat /sessions tag --json',
    args: ['--json', 'chat', '--session', browserSessionId, '--once', `/sessions ${sessionTag}`],
  });
  assert(
    listedState.sessionChoices?.some?.(
      (summary) =>
        summary.sessionId === sourceSessionId &&
        summary.lastRunTask === chatTask &&
        summary.lastRunWorkflowName === 'session-retry-workflow',
    ) === true,
    'session picker must expose retryable source session metadata',
  );
  assert(
    listedState.selectedSessionChoiceIndex === 0,
    'session picker must select the first listed session by default',
  );
  assert(
    listedState.messages?.at?.(-1)?.content?.includes(
      `retry session-retry-workflow -> ${chatTask}`,
    ) === true,
    'session list message must include workflow and task retry metadata',
  );

  const selectedState = await runCliJson({
    cwd: projectDir,
    env,
    label: 'obora chat /session open --json',
    args: ['--json', 'chat', '--session', browserSessionId, '--once', '/session open'],
  });
  assert(
    selectedState.sessionId === sourceSessionId,
    'session picker numeric choice must switch to the retryable source session',
  );
  assert(selectedState.lastRunTask === chatTask, 'selected session must restore the retry task');
  assert(
    selectedState.lastRunWorkflowLocator?.name === 'session-retry-workflow',
    'selected session must restore the retry workflow locator',
  );

  const retryStatusState = await runCliJson({
    cwd: projectDir,
    env,
    label: 'obora chat /retry status after session selection --json',
    args: ['--json', 'chat', '--session', sourceSessionId, '--once', '/retry status'],
  });
  assert(
    retryStatusState.messages?.at?.(-1)?.content?.includes(
      `Task: ${chatTask}`,
    ) === true,
    'retry status must describe the selected session task',
  );
  assert(
    retryStatusState.messages?.at?.(-1)?.content?.includes(
      'Workflow: session-retry-workflow',
    ) === true,
    'retry status must describe the selected session workflow',
  );

  const retriedState = await runCliJson({
    cwd: projectDir,
    env,
    label: 'obora chat /retry after session selection --json',
    args: ['--json', 'chat', '--session', sourceSessionId, '--once', '/retry'],
  });
  assert(
    retriedState.lastRunSummary?.executionId &&
      retriedState.lastRunSummary.executionId !== sourceExecutionId,
    'selected session retry must create a new execution id',
  );
  assert(retriedState.lastRunTask === chatTask, 'selected session retry must reuse the task');
  assert(
    retriedState.lastRunWorkflowLocator?.name === 'session-retry-workflow',
    'selected session retry must reuse the workflow locator',
  );

  console.log('[PASS] Built CLI chat session retry flow smoke passed.');
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
      workflowChoices: [locator],
      selectedWorkflowChoiceIndex: 0,
      selectedSessionChoiceIndex: 0,
      sessionChoices: [
        {
          sessionId: 'layout-source-session',
          status: 'ready',
          cwd: '/repo',
          projectRoot: '/repo',
          tags: ['layout'],
          workflowTarget: 'layout-workflow',
          lastRunTask: 'inspect layout session retry affordances',
          lastRunWorkflowName: 'layout-workflow',
          messageCount: 3,
          updatedAt: '2026-05-26T00:00:00.000Z',
        },
      ],
      selectedRunChoiceIndex: 0,
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
  assert(plain.includes('workflow open'), 'TUI workflow picker must show selected open command');
  assert(plain.includes('› ○ #1 layout-workflow'), 'TUI workflow picker must show selected row cursor');
  assert(plain.includes('› ○ #1 exec-layout-1'), 'TUI run picker must show selected row cursor');
  assert(plain.includes('layout-source-session'), 'TUI session picker must show saved sessions');
  assert(plain.includes('retryable'), 'TUI session picker must mark retryable sessions');
  assert(plain.includes('› ○ #1'), 'TUI session picker must show the selected row cursor');
  assert(plain.includes('open /session 1'), 'TUI session picker must show the open command');
  assert(
    plain.includes('last task inspect layout session retry affordances'),
    'TUI session picker must show the saved retry task',
  );
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
    await verifyCliChatSessionRetryFlowSmoke(tmpDir);
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
