# TASK-016: @obora/cli 유닛 테스트

## 개요
- 우선순위: P0
- 예상 소요: 14시간
- 담당: 개발자

## 목표
@obora/cli 패키지의 모든 커맨드에 대한 유닛 테스트 작성

## 작업 내용

### 1. 테스트 환경 설정
- vitest.config.ts 생성 (packages/cli/)
- 테스트 헬퍼 함수 작성 (mock fs, mock console)

### 2. Commander 테스트 패턴

**Commander 기본 구조:**
```typescript
export function createRunCommand(): Command {
  const cmd = new Command("run")
    .description("Execute workflow")
    .option("-f, --feature <name>", "Feature name")
    .option("-m, --mode <type>", "Execution mode", "auto")
    .option("--dry-run", "Show execution plan without running")
    .option("--from-step <name>", "Start from a specific step")
    .option("-v, --verbose", "Verbose output")
    .option("--continue-on-error", "Continue execution even if a step fails")
    .action(async (options: RunOptions) => {
      await runRun(featureName, options);
    });
  return cmd;
}
```

**Commander 테스트 방법:**
```typescript
// Commander action 테스트 패턴
describe('run command', () => {
  it('should handle --dry-run option', async () => {
    const mockRun = vi.spyOn(runModule, 'runRun').mockResolvedValue();
    await createRunCommand().parseAsync(['run', '--dry-run'], { from: 'user' });
    expect(mockRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ dryRun: true })
    );
  });
});
```

### 3. CLIError 테스트 방법

**CLIError 구조:**
```typescript
export class CLIError extends Error {
  constructor(message: string, public exitCode: number = 1) {
    super(message);
    this.name = 'CLIError';
  }
}
```

**CLIError 테스트:**
```typescript
describe('CLIError handling', () => {
  it('should throw CLIError with exit code 1', () => {
    expect(() => {
      throw new CLIError('Feature not found', 1);
    }).toThrow(CLIError);
  });

  it('should catch CLIError in command action', async () => {
    const mockConsole = vi.spyOn(console, 'error').mockImplementation(() => {});
    const command = createValidateCommand();

    await expect(
      command.parseAsync(['validate', '--file', 'nonexistent.yaml'])
    ).rejects.toThrow(CLIError);

    mockConsole.mockRestore();
  });
});
```

### 4. validate.ts 테스트

**실제 옵션:**
```typescript
interface ValidateOptions {
  all: boolean;
  file?: string;
  strict: boolean;
  format?: "default" | "json";
  verbose?: boolean;
}
```

**테스트 케이스:**
- 유효한 워크플로우 통과
- 잘못된 워크플로우 에러
- 파일 없음 에러
- --format json 출력
- --strict 모드에서 경고를 에러로 처리
- --all 옵션으로 모든 워크플로우 파일 검증
- --verbose 상세 출력

### 5. status.ts 테스트

**실제 옵션:**
```typescript
interface StatusOptions {
  format?: "default" | "json" | "minimal";
  feature?: string;
  verbose?: boolean;
}
```

**테스트 케이스:**
- 상태 조회 성공
- .obora 폴더 없음 에러 (exit code 3)
- --verbose 상세 출력 (스텝 상세)
- --format json 출력
- --format minimal 출력
- 특정 피처 상태 조회
- 전체 피처 목록 조회

### 6. run.ts 테스트

**실제 옵션:**
```typescript
interface RunOptions {
  dryRun?: boolean;
  fromStep?: string;
  verbose?: boolean;
  continueOnError?: boolean;
  feature?: string;
  mode?: "auto" | "supervised" | "gated";
}
```

**테스트 케이스:**
- 워크플로우 실행 (에이전트 실행 mock)
- --dry-run 옵션 (실행 계획만 표시)
- --from-step 옵션 (특정 스텝부터 시작)
- --verbose 옵션 (상세 로그)
- --continue-on-error 옵션 (실패 후 계속)
- --feature 옵션 (특정 피처 지정)
- 피처 디렉토리에서 자동 피처 감지
- 순환 의존성 에러 처리
- status.yaml 업데이트 검증
- .obora/outputs/ 디렉토리 생성

### 7. init.ts, new.ts, done.ts 테스트

**테스트 케이스:**
- init.ts:
  - 새 프로젝트 초기화 성공
  - 이미 존재하는 프로젝트 에러
  - --force 옵션으로 덮어쓰기
  - 잘못된 프로젝트 이름 거부

- new.ts:
  - 새 피처 생성 성공
  - 중복 피처 이름 에러
  - 의존성 검증

- done.ts:
  - 피처 완료 처리
  - 존재하지 않는 피처 에러
  - 의존성 미완료 경고

### 8. plan.ts 테스트
- 실행 계획 생성
- AI 플래그 처리 (mock)

## Mock 전략

### fs-extra Mock 패턴

```typescript
import { vi } from 'vitest';
import * as fs from 'fs-extra';

// 전체 모듈 mock
vi.mock('fs-extra', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    ensureDir: vi.fn(),
    mkdir: vi.fn(),
    readdirSync: vi.fn(),
  },
}));

// 또는 개별 함수 mock
const existsSyncSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
const readFileSyncSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue('yaml content');

// mock 값 설정
readFileSyncSpy.mockReturnValueOnce('specific content');

// 모든 콜 확인
expect(existsSyncSpy).toHaveBeenCalledTimes(1);
expect(existsSyncSpy).toHaveBeenCalledWith('.obora');
```

### Console 로그 캡처

```typescript
describe('command output', () => {
  it('should print formatted output', () => {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });

    // 커맨드 실행
    validateCommand.action({ format: 'default' });

    // 로그 확인
    expect(logs).toContain('✓ Valid');
    expect(logs).toContain('✗ Error');

    logSpy.mockRestore();
  });

  it('should capture console.error', () => {
    const errors: string[] = [];
    const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args.join(' '));
    });

    // 에러 발생 상황 테스트
    expect(errors).toContain('Error: Feature not found');

    errorSpy.mockRestore();
  });
});
```

### YAML 파싱 Mock

```typescript
vi.mock('yaml', () => ({
  parse: vi.fn(),
  stringify: vi.fn(),
}));

import { parse, stringify } from 'yaml';

parse.mockReturnValueOnce({
  name: 'test-workflow',
  steps: [{ name: 'plan', agent: 'architect' }],
});

stringify.mockReturnValueOnce('yaml: output');
```

### Core 모듈 Mock

```typescript
// @obora/core 모듈 mock
vi.mock('@obora/core', () => ({
  log: vi.fn(),
  parseWorkflow: vi.fn(),
  validateWorkflow: vi.fn(),
  topologicalSort: vi.fn(),
  buildGraph: vi.fn(),
  groupByLevel: vi.fn(),
  OboraError: class extends Error {},
}));

import { log, parseWorkflow } from '@obora/core';

log.mockClear();
parseWorkflow.mockReturnValueOnce({ name: 'test', steps: [] });

expect(log).toHaveBeenCalledWith('Expected log message');
```

### Path 검증 Mock

```typescript
vi.mock('../utils/path-utils', () => ({
  validatePathComponent: vi.fn(),
  validatePath: vi.fn(),
}));

import { validatePathComponent } from '../utils/path-utils';

// 정상 경로
validatePathComponent.mockReturnValueOnce(undefined);

// 경로 조작 공격 차단
validatePathComponent.mockImplementationOnce(() => {
  throw new Error('Invalid path component');
});
```

### 에이전트 실행 Mock 전략

**목표:** 실제 에이전트 실행을 mocking하여 빠르고 안정적인 테스트 수행

#### Mock 레벨 구조

```typescript
// 1단계: 완전 Mock (빠르지만 신뢰도 낮음)
vi.mock('@obora/core', () => ({
  executeAgent: vi.fn().mockResolvedValue({
    status: 'success',
    output: 'Mocked output',
  }),
}));

// 2단계: 상태 Mock (실제 로직 검증)
vi.mock('../agents/runner', () => ({
  executeAgent: vi.fn()
    .mockImplementation(async (agent: string, input: string) => {
      if (agent === 'architect') {
        return { status: 'success', output: 'Design created' };
      }
      if (agent === 'coder') {
        return { status: 'success', output: 'Code written' };
      }
      if (agent === 'tester') {
        return { status: 'success', output: 'Tests passed' };
      }
      throw new Error(`Unknown agent: ${agent}`);
    }),
}));

// 3단계: 타임아웃/에러 시뮬레이션
vi.mock('../agents/runner', () => ({
  executeAgent: vi.fn()
    .mockImplementation(async (agent: string, input: string) => {
      if (input.includes('timeout')) {
        await new Promise(resolve => setTimeout(resolve, 100));
        throw new Error('Agent execution timeout');
      }
      if (input.includes('error')) {
        throw new Error('Agent execution failed');
      }
      return { status: 'success', output: 'Success' };
    }),
}));

// 4단계: 퍼지 테스트 (무작위 응답)
vi.mock('../agents/runner', () => ({
  executeAgent: vi.fn()
    .mockImplementation(async () => {
      const responses = [
        { status: 'success', output: 'Result 1' },
        { status: 'success', output: 'Result 2' },
        { status: 'error', output: 'Agent error' },
        { status: 'timeout', output: 'Timeout' },
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    }),
}));
```

#### 통합 테스트용 Mock 팩토리

```typescript
// test/mocks/agent-runner.ts
export function createMockAgentRunner(config: {
  responses?: Map<string, { status: string; output: string }>;
  delay?: number;
  failOn?: string[];
}) {
  const { responses = new Map(), delay = 0, failOn = [] } = config;

  return {
    executeAgent: vi.fn()
      .mockImplementation(async (agent: string, input: string) => {
        await new Promise(resolve => setTimeout(resolve, delay));

        if (failOn.some(pattern => input.includes(pattern))) {
          throw new Error(`Agent execution failed: ${input}`);
        }

        if (responses.has(agent)) {
          return responses.get(agent)!;
        }

        return {
          status: 'success',
          output: `Mocked ${agent} output for: ${input}`,
        };
      }),
  };
}

// 사용 예시
const mockRunner = createMockAgentRunner({
  responses: new Map([
    ['architect', { status: 'success', output: 'Design: component.ts' }],
    ['coder', { status: 'success', output: 'Code: component.ts implemented' }],
  ]),
  delay: 10, // 10ms 지연 (비동기 테스트)
  failOn: ['invalid', 'timeout'],
});

vi.mock('../agents/runner', () => mockRunner);
```

#### 상태 기반 Mock (Stateful Mock)

```typescript
// 에이전트 상태 추적
class MockAgentRunner {
  private executionCount = new Map<string, number>();
  private history: Array<{ agent: string; input: string; result: any }> = [];

  async executeAgent(agent: string, input: string): Promise<any> {
    const count = (this.executionCount.get(agent) || 0) + 1;
    this.executionCount.set(agent, count);

    const result = this.execute(agent, input, count);
    this.history.push({ agent, input, result });
    return result;
  }

  private execute(agent: string, input: string, count: number) {
    // 3회 재시차 후 성공
    if (count < 3) {
      throw new Error(`${agent}: Temporary failure (attempt ${count})`);
    }

    // 입력에 따른 다른 응답
    if (input.includes('proposal')) {
      return { status: 'success', output: 'Proposal generated' };
    }
    if (input.includes('design')) {
      return { status: 'success', output: 'Design created' };
    }

    return { status: 'success', output: 'Default output' };
  }

  getExecutionCount(agent: string): number {
    return this.executionCount.get(agent) || 0;
  }

  getHistory() {
    return [...this.history];
  }

  reset() {
    this.executionCount.clear();
    this.history = [];
  }
}

// 테스트에서 사용
const mockRunner = new MockAgentRunner();
vi.mock('../agents/runner', () => ({ executeAgent: mockRunner.executeAgent.bind(mockRunner) }));

// 테스트 후 검증
expect(mockRunner.getExecutionCount('architect')).toBe(1);
expect(mockRunner.getHistory()).toHaveLength(3);
```

#### Mock Spy/호출 검증

```typescript
describe('agent execution', () => {
  let mockExecuteAgent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockExecuteAgent = vi.fn().mockResolvedValue({
      status: 'success',
      output: 'Mock output',
    });

    vi.doMock('@obora/core', () => ({
      executeAgent: mockExecuteAgent,
    }));
  });

  it('should call agent with correct parameters', async () => {
    await runWorkflow('test-feature', {});

    expect(mockExecuteAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'architect',
        input: expect.stringContaining('proposal'),
      })
    );
  });

  it('should retry on failure', async () => {
    mockExecuteAgent
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockResolvedValueOnce({ status: 'success', output: 'Success' });

    await runWorkflow('test-feature', { retry: 3 });

    expect(mockExecuteAgent).toHaveBeenCalledTimes(3);
  });

  it('should respect timeout', async () => {
    mockExecuteAgent.mockImplementation(() =>
      new Promise(resolve => setTimeout(resolve, 5000))
    );

    await expect(
      runWorkflow('test-feature', { timeout: 1000 })
    ).rejects.toThrow('Agent timeout');
  });
});
```

### --continue-on-error 테스트 예시

```typescript
describe('run command --continue-on-error', () => {
  it('should continue execution when step fails with --continue-on-error', async () => {
    const mockExecuteAgent = vi.fn()
      .mockResolvedValueOnce({ status: 'success', output: 'Plan created' })
      .mockRejectedValueOnce(new Error('Agent failed'))
      .mockResolvedValueOnce({ status: 'success', output: 'Tests passed' });

    vi.mock('../agents/runner', () => ({ executeAgent: mockExecuteAgent }));

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(parseWorkflow).mockReturnValue({
      name: 'test-workflow',
      steps: [
        { name: 'plan', agent: 'architect' },
        { name: 'implement', agent: 'coder', depends_on: ['plan'] },
        { name: 'test', agent: 'tester', depends_on: ['implement'] },
      ],
    });

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const cmd = createRunCommand();
    await cmd.parseAsync(['run', '--feature', 'test-feature', '--continue-on-error'], {
      from: 'user',
    });

    // All 3 steps should be attempted
    expect(mockExecuteAgent).toHaveBeenCalledTimes(3);

    // Error should be logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Agent failed')
    );

    consoleErrorSpy.mockRestore();
  });

  it('should mark failed steps and continue', async () => {
    const mockExecuteAgent = vi.fn()
      .mockResolvedValueOnce({ status: 'success', output: 'Plan created' })
      .mockRejectedValueOnce(new Error('Implementation failed'))
      .mockResolvedValueOnce({ status: 'success', output: 'Tests passed' });

    vi.mock('../agents/runner', () => ({ executeAgent: mockExecuteAgent }));

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(parseWorkflow).mockReturnValue({
      name: 'test-workflow',
      steps: [
        { name: 'plan', agent: 'architect' },
        { name: 'implement', agent: 'coder', depends_on: ['plan'] },
        { name: 'test', agent: 'tester', depends_on: ['implement'] },
      ],
    });

    const cmd = createRunCommand();
    await cmd.parseAsync(['run', '--feature', 'test-feature', '--continue-on-error'], {
      from: 'user',
    });

    // Verify agents called in order
    expect(mockExecuteAgent).toHaveBeenNthCalledWith(1, 'architect', expect.any(Object));
    expect(mockExecuteAgent).toHaveBeenNthCalledWith(2, 'coder', expect.any(Object));
    expect(mockExecuteAgent).toHaveBeenNthCalledWith(3, 'tester', expect.any(Object));
  });

  it('should report final status with failures', async () => {
    const mockExecuteAgent = vi.fn()
      .mockResolvedValueOnce({ status: 'success', output: 'Plan created' })
      .mockRejectedValueOnce(new Error('Implementation failed'));

    vi.mock('../agents/runner', () => ({ executeAgent: mockExecuteAgent }));

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(parseWorkflow).mockReturnValue({
      name: 'test-workflow',
      steps: [
        { name: 'plan', agent: 'architect' },
        { name: 'implement', agent: 'coder', depends_on: ['plan'] },
      ],
    });

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const cmd = createRunCommand();
    await cmd.parseAsync(['run', '--feature', 'test-feature', '--continue-on-error'], {
      from: 'user',
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('completed with errors')
    );

    consoleLogSpy.mockRestore();
  });

  it('should stop execution when --continue-on-error is not set', async () => {
    const mockExecuteAgent = vi.fn()
      .mockResolvedValueOnce({ status: 'success', output: 'Plan created' })
      .mockRejectedValueOnce(new Error('Implementation failed'))
      .mockResolvedValueOnce({ status: 'success', output: 'Tests passed' });

    vi.mock('../agents/runner', () => ({ executeAgent: mockExecuteAgent }));

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(parseWorkflow).mockReturnValue({
      name: 'test-workflow',
      steps: [
        { name: 'plan', agent: 'architect' },
        { name: 'implement', agent: 'coder', depends_on: ['plan'] },
        { name: 'test', agent: 'tester', depends_on: ['implement'] },
      ],
    });

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const cmd = createRunCommand();
    await expect(
      cmd.parseAsync(['run', '--feature', 'test-feature'], { from: 'user' })
    ).rejects.toThrow('Implementation failed');

    // Only 2 steps should be called (stopped at failure)
    expect(mockExecuteAgent).toHaveBeenCalledTimes(2);

    consoleErrorSpy.mockRestore();
  });

  it('should handle multiple failures with --continue-on-error', async () => {
    const mockExecuteAgent = vi.fn()
      .mockResolvedValueOnce({ status: 'success', output: 'Plan created' })
      .mockRejectedValueOnce(new Error('Implement failed'))
      .mockRejectedValueOnce(new Error('Test failed'));

    vi.mock('../agents/runner', () => ({ executeAgent: mockExecuteAgent }));

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(parseWorkflow).mockReturnValue({
      name: 'test-workflow',
      steps: [
        { name: 'plan', agent: 'architect' },
        { name: 'implement', agent: 'coder', depends_on: ['plan'] },
        { name: 'test', agent: 'tester', depends_on: ['implement'] },
      ],
    });

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const cmd = createRunCommand();
    await cmd.parseAsync(['run', '--feature', 'test-feature', '--continue-on-error'], {
      from: 'user',
    });

    // All steps attempted
    expect(mockExecuteAgent).toHaveBeenCalledTimes(3);

    // Both errors logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Implement failed')
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Test failed')
    );

    consoleErrorSpy.mockRestore();
  });

  it('should update status.yaml with partial completion', async () => {
    const mockExecuteAgent = vi.fn()
      .mockResolvedValueOnce({ status: 'success', output: 'Plan created' })
      .mockRejectedValueOnce(new Error('Implement failed'))
      .mockResolvedValueOnce({ status: 'success', output: 'Tests passed' });

    vi.mock('../agents/runner', () => ({ executeAgent: mockExecuteAgent }));

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(parseWorkflow).mockReturnValue({
      name: 'test-workflow',
      steps: [
        { name: 'plan', agent: 'architect' },
        { name: 'implement', agent: 'coder', depends_on: ['plan'] },
        { name: 'test', agent: 'tester', depends_on: ['implement'] },
      ],
    });

    const writeFileSpy = vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const cmd = createRunCommand();
    await cmd.parseAsync(['run', '--feature', 'test-feature', '--continue-on-error'], {
      from: 'user',
    });

    // status.yaml should be updated with failure info
    expect(writeFileSpy).toHaveBeenCalledWith(
      expect.stringContaining('status.yaml'),
      expect.stringContaining('status: "failed"'),
      'utf-8'
    );
  });
});
```

## 완료 조건
- [ ] 테스트 커버리지 70% 이상
- [ ] 모든 커맨드 테스트 작성
- [ ] CLIError 패턴 테스트
- [ ] Commander 옵션 테스트

## 의존성
- TASK-015 (core-tests)
- TASK-003 ~ TASK-014 (모든 CLI 구현)

## 테스트 데이터 예시

### 유효한 status.yaml
```yaml
status: planned
feature:
  name: example-feature
  description: Example feature
  workflow: simple
progress:
  current_stage: planning
  total_stages: 5
  completed_stages: 1
metadata:
  created_at: "2026-02-04T00:00:00Z"
  last_updated: "2026-02-04T01:00:00Z"
  notes: Initial planning
```

### 워크플로우 YAML 예시
```yaml
name: simple
version: "1.0"
mode: auto
steps:
  - name: plan
    agent: architect
    outputs:
      - design.md

  - name: implement
    agent: coder
    depends_on:
      - plan
    inputs:
      - design.md
    outputs:
      - code.ts
```

### 테스트 파일 구조
```
packages/cli/
├── src/
│   ├── commands/
│   │   ├── run.ts
│   │   ├── validate.ts
│   │   ├── status.ts
│   │   ├── init.ts
│   │   ├── new.ts
│   │   ├── done.ts
│   │   └── plan.ts
│   ├── errors.ts
│   └── utils/
│       └── path-utils.ts
└── test/
    ├── commands/
    │   ├── run.test.ts
    │   ├── validate.test.ts
    │   ├── status.test.ts
    │   ├── init.test.ts
    │   ├── new.test.ts
    │   ├── done.test.ts
    │   └── plan.test.ts
    └── fixtures/
        ├── valid-workflow.yaml
        ├── invalid-workflow.yaml
        └── status.yaml
```

## 테스트 케이스 예시

### validate.ts 테스트
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateCommand } from '../commands/validate';
import * as fs from 'fs-extra';
import { parseAndValidate } from '@obora/core';

vi.mock('fs-extra');
vi.mock('@obora/core');

describe('validate command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should validate a specific file', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('name: test\nsteps: []');
    vi.mocked(parseAndValidate).mockReturnValue({
      isValid: true,
      errors: [],
      warnings: [],
    });

    const cmd = validateCommand();
    await cmd.parseAsync(['validate', '--file', 'workflow.yaml'], { from: 'user' });

    expect(parseAndValidate).toHaveBeenCalledWith('name: test\nsteps: []');
  });

  it('should throw CLIError for non-existent file', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const cmd = validateCommand();
    await expect(
      cmd.parseAsync(['validate', '--file', 'nonexistent.yaml'], { from: 'user' })
    ).rejects.toThrow('File not found');
  });

  it('should output JSON format', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('name: test\nsteps: []');
    vi.mocked(parseAndValidate).mockReturnValue({
      isValid: true,
      errors: [],
      warnings: [],
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cmd = validateCommand();
    await cmd.parseAsync(['validate', '--file', 'workflow.yaml', '--format', 'json'], {
      from: 'user',
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"valid":true')
    );
    consoleSpy.mockRestore();
  });

  it('should treat warnings as errors in strict mode', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('name: test\nsteps: []');
    vi.mocked(parseAndValidate).mockReturnValue({
      isValid: true,
      errors: [],
      warnings: [
        { code: 'WARN001', message: 'Test warning', path: '' },
      ],
    });

    const cmd = validateCommand();
    await expect(
      cmd.parseAsync(['validate', '--file', 'workflow.yaml', '--strict'], {
        from: 'user',
      })
    ).rejects.toThrow('Validation failed with warnings in strict mode');
  });
});
```

### status.ts 테스트
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStatusCommand } from '../commands/status';
import * as fs from 'fs-extra';
import { readStatus } from '../utils/status';

vi.mock('fs-extra');
vi.mock('../utils/status');

describe('status command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display status for a feature', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(readStatus).mockReturnValue({
      status: 'running',
      feature: { name: 'test-feature', workflow: 'simple' },
      progress: { current_stage: 'implementation', total_stages: 5, completed_stages: 2 },
      metadata: { created_at: '', last_updated: '', notes: '' },
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cmd = createStatusCommand();
    await cmd.parseAsync(['status', '--feature', 'test-feature'], { from: 'user' });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Feature: test-feature'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Status: 🔄 running'));
    consoleSpy.mockRestore();
  });

  it('should output JSON format', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(readStatus).mockReturnValue({
      status: 'completed',
      feature: { name: 'test-feature', workflow: 'simple' },
      progress: { current_stage: 'done', total_stages: 5, completed_stages: 5 },
      metadata: { created_at: '', last_updated: '', notes: '' },
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cmd = createStatusCommand();
    await cmd.parseAsync(
      ['status', '--feature', 'test-feature', '--format', 'json'],
      { from: 'user' }
    );

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"status":"completed"'));
    consoleSpy.mockRestore();
  });

  it('should throw CLIError for .obora not found', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const cmd = createStatusCommand();
    await expect(
      cmd.parseAsync(['status', '--feature', 'test-feature'], { from: 'user' })
    ).rejects.toThrow('Not in an obora project');
  });

  it('should display minimal format', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(readStatus).mockReturnValue({
      status: 'planned',
      feature: { name: 'test-feature', workflow: 'simple' },
      progress: { current_stage: 'planning', total_stages: 5, completed_stages: 0 },
      metadata: { created_at: '', last_updated: '', notes: '' },
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cmd = createStatusCommand();
    await cmd.parseAsync(
      ['status', '--feature', 'test-feature', '--format', 'minimal'],
      { from: 'user' }
    );

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('📋 planned'));
    consoleSpy.mockRestore();
  });
});
```

### run.ts 테스트
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRunCommand, runRun } from '../commands/run';
import * as fs from 'fs-extra';
import { parseWorkflow, buildGraph, topologicalSort, groupByLevel } from '@obora/core';

vi.mock('fs-extra');
vi.mock('@obora/core');

describe('run command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle --dry-run option', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(parseWorkflow).mockReturnValue({
      name: 'test-workflow',
      steps: [{ name: 'plan', agent: 'architect' }],
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cmd = createRunCommand();
    await cmd.parseAsync(['run', '--feature', 'test-feature', '--dry-run'], {
      from: 'user',
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Dry-run mode'));
    consoleSpy.mockRestore();
  });

  it('should detect feature from current directory', async () => {
    const originalCwd = process.cwd;
    vi.spyOn(process, 'cwd').mockReturnValue('/project/.obora/features/test-feature');

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(parseWorkflow).mockReturnValue({
      name: 'test-workflow',
      steps: [{ name: 'plan', agent: 'architect' }],
    });
    vi.mocked(buildGraph).mockReturnValue({ nodes: new Set(), edges: new Map(), reverseEdges: new Map() });
    vi.mocked(topologicalSort).mockReturnValue({ success: true, order: ['plan'] });
    vi.mocked(groupByLevel).mockReturnValue(new Map());

    const runSpy = vi.spyOn({ runRun }, 'runRun').mockResolvedValue();

    const cmd = createRunCommand();
    await cmd.parseAsync(['run'], { from: 'user' });

    expect(runSpy).toHaveBeenCalledWith('test-feature', expect.any(Object));

    process.cwd = originalCwd;
  });

  it('should throw CLIError for feature not found', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path: string) => {
      return path.includes('.obora') && !path.includes('features/test-feature');
    });

    const cmd = createRunCommand();
    await expect(
      cmd.parseAsync(['run', '--feature', 'test-feature'], { from: 'user' })
    ).rejects.toThrow("Feature 'test-feature' not found");
  });

  it('should start from specific step with --from-step', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(parseWorkflow).mockReturnValue({
      name: 'test-workflow',
      steps: [
        { name: 'plan', agent: 'architect' },
        { name: 'implement', agent: 'coder', depends_on: ['plan'] },
        { name: 'test', agent: 'tester', depends_on: ['implement'] },
      ],
    });
    vi.mocked(buildGraph).mockReturnValue({ nodes: new Set(), edges: new Map(), reverseEdges: new Map() });
    vi.mocked(topologicalSort).mockReturnValue({ success: true, order: ['plan', 'implement', 'test'] });
    vi.mocked(groupByLevel).mockReturnValue(new Map());

    const runSpy = vi.spyOn({ runRun }, 'runRun').mockResolvedValue();

    const cmd = createRunCommand();
    await cmd.parseAsync(['run', '--feature', 'test-feature', '--from-step', 'implement'], {
      from: 'user',
    });

    expect(runSpy).toHaveBeenCalledWith(
      'test-feature',
      expect.objectContaining({ fromStep: 'implement' })
    );
  });

  it('should throw error when .obora does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const cmd = createRunCommand();

    await expect(
      cmd.parseAsync(['run', '--feature', 'test-feature'], { from: 'user' })
    ).rejects.toThrow("Not in an obora project");
  });
});

### new.ts 테스트 예시
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createNewCommand } from '../commands/new';
import * as fs from 'fs-extra';

vi.mock('fs-extra');

describe('new command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create new feature directory', async () => {
    vi.mocked(fs.existsSync)
      .mockImplementation((path) => {
        // .obora exists, but feature does not
        return String(path).includes('.obora') && !String(path).includes('test-feature');
      });

    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    const writeFileSpy = vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const cmd = createNewCommand();
    await cmd.parseAsync(['new', 'test-feature'], { from: 'user' });

    expect(writeFileSpy).toHaveBeenCalledWith(
      '.obora/features/test-feature/proposal.md',
      expect.stringContaining('# test-feature'),
      'utf-8'
    );
  });

  it('should create all required files', async () => {
    vi.mocked(fs.existsSync)
      .mockImplementation((path) => {
        return String(path).includes('.obora') && !String(path).includes('test-feature');
      });

    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    const writeFileSpy = vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const cmd = createNewCommand();
    await cmd.parseAsync(['new', 'test-feature'], { from: 'user' });

    expect(writeFileSpy).toHaveBeenCalledWith(
      expect.stringContaining('proposal.md'),
      expect.any(String),
      'utf-8'
    );
    expect(writeFileSpy).toHaveBeenCalledWith(
      expect.stringContaining('design.md'),
      expect.any(String),
      'utf-8'
    );
    expect(writeFileSpy).toHaveBeenCalledWith(
      expect.stringContaining('tasks.md'),
      expect.any(String),
      'utf-8'
    );
    expect(writeFileSpy).toHaveBeenCalledWith(
      expect.stringContaining('status.yaml'),
      expect.any(String),
      'utf-8'
    );
  });

  it('should create context directory with README', async () => {
    vi.mocked(fs.existsSync)
      .mockImplementation((path) => {
        return String(path).includes('.obora') && !String(path).includes('test-feature');
      });

    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const cmd = createNewCommand();
    await cmd.parseAsync(['new', 'test-feature'], { from: 'user' });

    expect(fs.ensureDir).toHaveBeenCalledWith('.obora/features/test-feature/context');
  });

  it('should reject feature name with uppercase letters', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const cmd = createNewCommand();

    await expect(
      cmd.parseAsync(['new', 'TestFeature'], { from: 'user' })
    ).rejects.toThrow("Feature name must contain only lowercase letters");
  });

  it('should reject feature name with path traversal', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const cmd = createNewCommand();

    await expect(
      cmd.parseAsync(['new', '../../../etc/passwd'], { from: 'user' })
    ).rejects.toThrow("Invalid feature name");
  });

  it('should reject empty feature name', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const cmd = createNewCommand();

    await expect(
      cmd.parseAsync(['new', ''], { from: 'user' })
    ).rejects.toThrow("Feature name cannot be empty");
  });

  it('should reject feature name with consecutive hyphens', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const cmd = createNewCommand();

    await expect(
      cmd.parseAsync(['new', 'test--feature'], { from: 'user' })
    ).rejects.toThrow("Feature name cannot contain consecutive hyphens");
  });

  it('should reject feature name starting with hyphen', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const cmd = createNewCommand();

    await expect(
      cmd.parseAsync(['new', '-test'], { from: 'user' })
    ).rejects.toThrow("Feature name cannot start or end with a hyphen");
  });

  it('should reject feature name ending with hyphen', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const cmd = createNewCommand();

    await expect(
      cmd.parseAsync(['new', 'test-'], { from: 'user' })
    ).rejects.toThrow("Feature name cannot start or end with a hyphen");
  });

  it('should reject reserved word as feature name', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const cmd = createNewCommand();

    await expect(
      cmd.parseAsync(['new', 'init'], { from: 'user' })
    ).rejects.toThrow("is a reserved word");
  });

  it('should reject feature name exceeding 64 characters', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const longName = 'a'.repeat(65);

    const cmd = createNewCommand();

    await expect(
      cmd.parseAsync(['new', longName], { from: 'user' })
    ).rejects.toThrow("Feature name cannot exceed 64 characters");
  });

  it('should reject duplicate feature name', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const cmd = createNewCommand();

    await expect(
      cmd.parseAsync(['new', 'test-feature'], { from: 'user' })
    ).rejects.toThrow("Feature 'test-feature' already exists");
  });

  it('should warn about archived feature with same name', async () => {
    vi.mocked(fs.existsSync)
      .mockImplementation((path) => {
        // .obora/archive/test-feature exists
        return String(path).includes('archive/test-feature') || String(path).includes('.obora');
      });

    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const cmd = createNewCommand();
    await cmd.parseAsync(['new', 'test-feature'], { from: 'user' });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("An archived feature with name 'test-feature' exists")
    );

    consoleWarnSpy.mockRestore();
  });

  it('should throw error when not in obora project', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const cmd = createNewCommand();

    await expect(
      cmd.parseAsync(['new', 'test-feature'], { from: 'user' })
    ).rejects.toThrow("Not in an obora project");
  });

  it('should create feature with standard workflow', async () => {
    vi.mocked(fs.existsSync)
      .mockImplementation((path) => {
        return String(path).includes('.obora') && !String(path).includes('test-feature');
      });

    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    const writeFileSpy = vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const cmd = createNewCommand();
    await cmd.parseAsync(['new', 'test-feature', '--workflow', 'standard'], { from: 'user' });

    expect(writeFileSpy).toHaveBeenCalledWith(
      '.obora/features/test-feature/status.yaml',
      expect.stringContaining('workflow: "standard"'),
      'utf-8'
    );
  });

  it('should reject invalid workflow type', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const cmd = createNewCommand();

    await expect(
      cmd.parseAsync(['new', 'test-feature', '--workflow', 'invalid'], { from: 'user' })
    ).rejects.toThrow("Invalid workflow type 'invalid'");
  });

  it('should handle --from-existing flag', async () => {
    vi.mocked(fs.existsSync)
      .mockImplementation((path) => {
        return String(path).includes('.obora') && !String(path).includes('test-feature');
      });

    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const cmd = createNewCommand();
    await cmd.parseAsync(['new', 'test-feature', '--from-existing'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('--from-existing mode enabled')
    );

    consoleLogSpy.mockRestore();
  });
});

### done.ts 테스트 예시
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDoneCommand } from '../commands/done';
import * as fs from 'fs-extra';

vi.mock('fs-extra');

describe('done command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(`
feature:
  name: "test-feature"
  created_at: "2026-02-04T00:00:00Z"
  workflow: "simple"

status: pending

progress:
  current_stage: planning
  completed_stages: []

metadata:
  last_updated: "2026-02-04T00:00:00Z"
  notes: ""
`);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should mark feature as done successfully', async () => {
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.move).mockResolvedValue(undefined);

    const cmd = createDoneCommand();
    await cmd.parseAsync(['done', '--feature', 'test-feature'], { from: 'user' });

    expect(fs.writeFile).toHaveBeenCalledWith(
      '.obora/features/test-feature/status.yaml',
      expect.stringContaining('status: completed'),
      'utf-8'
    );
  });

  it('should generate execution.log', async () => {
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.move).mockResolvedValue(undefined);

    const writeFileSpy = vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const cmd = createDoneCommand();
    await cmd.parseAsync(['done', '--feature', 'test-feature'], { from: 'user' });

    expect(writeFileSpy).toHaveBeenCalledWith(
      '.obora/features/test-feature/execution.log',
      expect.stringContaining('# Execution Log: test-feature'),
      'utf-8'
    );
  });

  it('should move feature to archive', async () => {
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    const moveSpy = vi.mocked(fs.move).mockResolvedValue(undefined);

    const cmd = createDoneCommand();
    await cmd.parseAsync(['done', '--feature', 'test-feature'], { from: 'user' });

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const archiveName = `${year}-${month}-test-feature`;

    expect(moveSpy).toHaveBeenCalledWith(
      '.obora/features/test-feature',
      `.obora/archive/${archiveName}`,
      { overwrite: true }
    );
  });

  it('should skip archiving with --no-archive flag', async () => {
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    const moveSpy = vi.mocked(fs.move).mockResolvedValue(undefined);

    const cmd = createDoneCommand();
    await cmd.parseAsync(['done', '--feature', 'test-feature', '--no-archive'], { from: 'user' });

    expect(moveSpy).not.toHaveBeenCalled();
  });

  it('should handle dry-run mode', async () => {
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    const writeFileSpy = vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const cmd = createDoneCommand();
    await cmd.parseAsync(['done', '--feature', 'test-feature', '--dry-run'], { from: 'user' });

    // Should not write files in dry-run mode
    expect(writeFileSpy).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Dry-run mode')
    );

    consoleLogSpy.mockRestore();
  });

  it('should detect feature name from current directory', async () => {
    const originalCwd = process.cwd;
    vi.spyOn(process, 'cwd').mockReturnValue('/project/.obora/features/test-feature');

    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.move).mockResolvedValue(undefined);

    const writeFileSpy = vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const cmd = createDoneCommand();
    await cmd.parseAsync(['done'], { from: 'user' });

    expect(writeFileSpy).toHaveBeenCalledWith(
      expect.stringContaining('status.yaml'),
      expect.any(String),
      'utf-8'
    );

    process.cwd = originalCwd;
  });

  it('should throw error when feature not found', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      return !String(path).includes('nonexistent-feature');
    });

    const cmd = createDoneCommand();

    await expect(
      cmd.parseAsync(['done', '--feature', 'nonexistent-feature'], { from: 'user' })
    ).rejects.toThrow("Feature 'nonexistent-feature' not found");
  });

  it('should throw error when not in obora project', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const cmd = createDoneCommand();

    await expect(
      cmd.parseAsync(['done', '--feature', 'test-feature'], { from: 'user' })
    ).rejects.toThrow("Not in an obora project");
  });

  it('should throw error when feature is already completed', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(`
feature:
  name: "test-feature"
  created_at: "2026-02-04T00:00:00Z"
  workflow: "simple"

status: completed

progress:
  current_stage: done
  completed_stages: []

metadata:
  last_updated: "2026-02-04T00:00:00Z"
  notes: ""
`);

    const cmd = createDoneCommand();

    await expect(
      cmd.parseAsync(['done', '--feature', 'test-feature'], { from: 'user' })
    ).rejects.toThrow("Feature is already marked as done");
  });

  it('should throw error when feature is still running', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(`
feature:
  name: "test-feature"
  created_at: "2026-02-04T00:00:00Z"
  workflow: "simple"

status: running

progress:
  current_stage: implementation
  completed_stages: []

metadata:
  last_updated: "2026-02-04T00:00:00Z"
  notes: ""
`);

    const cmd = createDoneCommand();

    await expect(
      cmd.parseAsync(['done', '--feature', 'test-feature'], { from: 'user' })
    ).rejects.toThrow("Feature is still running");
  });

  it('should throw error when feature has failed', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(`
feature:
  name: "test-feature"
  created_at: "2026-02-04T00:00:00Z"
  workflow: "simple"

status: failed

progress:
  current_stage: implementation
  completed_stages: []

metadata:
  last_updated: "2026-02-04T00:00:00Z"
  notes: ""
`);

    const cmd = createDoneCommand();

    await expect(
      cmd.parseAsync(['done', '--feature', 'test-feature'], { from: 'user' })
    ).rejects.toThrow("Feature workflow failed");
  });

  it('should handle path traversal attack', async () => {
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.move).mockResolvedValue(undefined);

    const cmd = createDoneCommand();

    await expect(
      cmd.parseAsync(['done', '--feature', '../../../etc/passwd'], { from: 'user' })
    ).rejects.toThrow("Invalid path");
  });

  it('should handle archived name conflict', async () => {
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      if (String(path).includes('archive/2026-02-test-feature')) {
        return true;
      }
      return true; // .obora and feature exist
    });

    const moveSpy = vi.mocked(fs.move).mockResolvedValue(undefined);

    const cmd = createDoneCommand();
    await cmd.parseAsync(['done', '--feature', 'test-feature'], { from: 'user' });

    // Should add timestamp suffix when archive already exists
    expect(moveSpy).toHaveBeenCalledWith(
      '.obora/features/test-feature',
      expect.stringMatching(/\.obora\/archive\/2026-02-test-feature-\d+/),
      { overwrite: true }
    );
  });

  it('should create git commit with --commit flag', async () => {
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.move).mockResolvedValue(undefined);

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const cmd = createDoneCommand();
    await cmd.parseAsync(['done', '--feature', 'test-feature', '--commit'], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Creating git commit')
    );

    consoleLogSpy.mockRestore();
  });

  it('should use custom commit message with --message flag', async () => {
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.move).mockResolvedValue(undefined);

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const cmd = createDoneCommand();
    await cmd.parseAsync([
      'done',
      '--feature', 'test-feature',
      '--commit',
      '--message', 'Custom completion message'
    ], { from: 'user' });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Custom completion message')
    );

    consoleLogSpy.mockRestore();
  });

  it('should require feature name when not in feature directory', async () => {
    const originalCwd = process.cwd;
    vi.spyOn(process, 'cwd').mockReturnValue('/project');

    const cmd = createDoneCommand();

    await expect(
      cmd.parseAsync(['done'], { from: 'user' })
    ).rejects.toThrow("Feature name required");

    process.cwd = originalCwd;
  });
});

### plan.ts 테스트 예시
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPlanCommand } from '../commands/plan';
import * as fs from 'fs-extra';

vi.mock('fs-extra');

describe('plan command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync)
      .mockImplementation((path) => {
        if (String(path).includes('status.yaml')) {
          return `
feature:
  name: "test-feature"
  created_at: "2026-02-04T00:00:00Z"
  workflow: "simple"

status: pending

progress:
  current_stage: planning
  completed_stages: []

metadata:
  last_updated: "2026-02-04T00:00:00Z"
  notes: ""
`;
        }
        if (String(path).includes('proposal.md')) {
          return '# Proposal\n\nThis is a test proposal.';
        }
        if (String(path).includes('design.md')) {
          return '# Design\n\nThis is a test design.';
        }
        if (String(path).includes('tasks.md')) {
          return '# Tasks\n\nInitial tasks.';
        }
        return '';
      });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should generate plan successfully', async () => {
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    const writeFileSpy = vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const cmd = createPlanCommand();
    await cmd.parseAsync(['plan', '--feature', 'test-feature'], { from: 'user' });

    expect(writeFileSpy).toHaveBeenCalledWith(
      '.obora/features/test-feature/tasks.md',
      expect.stringContaining('## Implementation Plan'),
      'utf-8'
    );
  });

  it('should update status to planned', async () => {
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    const writeFileSpy = vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const cmd = createPlanCommand();
    await cmd.parseAsync(['plan', '--feature', 'test-feature'], { from: 'user' });

    expect(writeFileSpy).toHaveBeenCalledWith(
      '.obora/features/test-feature/status.yaml',
      expect.stringContaining('status: planned'),
      'utf-8'
    );
  });

  it('should read proposal and design files', async () => {
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const readFileSyncSpy = vi.mocked(fs.readFileSync);

    const cmd = createPlanCommand();
    await cmd.parseAsync(['plan', '--feature', 'test-feature'], { from: 'user' });

    expect(readFileSyncSpy).toHaveBeenCalledWith(
      '.obora/features/test-feature/proposal.md',
      'utf-8'
    );
    expect(readFileSyncSpy).toHaveBeenCalledWith(
      '.obora/features/test-feature/design.md',
      'utf-8'
    );
  });

  it('should append plan to tasks.md when no existing plan section', async () => {
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.readFileSync)
      .mockImplementation((path) => {
        if (String(path).includes('tasks.md')) {
          return '# Tasks\n\nInitial tasks without plan.';
        }
        return fs.readFileSync(path);
      });

    const writeFileSpy = vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const cmd = createPlanCommand();
    await cmd.parseAsync(['plan', '--feature', 'test-feature'], { from: 'user' });

    expect(writeFileSpy).toHaveBeenCalledWith(
      '.obora/features/test-feature/tasks.md',
      expect.stringContaining('---\n\n# Implementation Plan'),
      'utf-8'
    );
  });

  it('should replace existing plan section in tasks.md', async () => {
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.readFileSync)
      .mockImplementation((path) => {
        if (String(path).includes('tasks.md')) {
          return '# Tasks\n\n## Implementation Plan\n\nOld plan content.\n\n## Other Tasks';
        }
        return fs.readFileSync(path);
      });

    const writeFileSpy = vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const cmd = createPlanCommand();
    await cmd.parseAsync(['plan', '--feature', 'test-feature'], { from: 'user' });

    // Should replace the old plan section
    const call = writeFileSpy.mock.calls.find(
      (call) => call[0] === '.obora/features/test-feature/tasks.md'
    );
    expect(call?.[1]).toContain('## Implementation Plan');
    expect(call?.[1]).not.toContain('Old plan content');
  });

  it('should handle dry-run mode', async () => {
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    const writeFileSpy = vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const cmd = createPlanCommand();
    await cmd.parseAsync(['plan', '--feature', 'test-feature', '--dry-run'], { from: 'user' });

    // Should not write files in dry-run mode
    expect(writeFileSpy).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Dry-run mode')
    );

    consoleLogSpy.mockRestore();
  });

  it('should detect feature name from current directory', async () => {
    const originalCwd = process.cwd;
    vi.spyOn(process, 'cwd').mockReturnValue('/project/.obora/features/test-feature');

    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const writeFileSpy = vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const cmd = createPlanCommand();
    await cmd.parseAsync(['plan'], { from: 'user' });

    expect(writeFileSpy).toHaveBeenCalledWith(
      expect.stringContaining('tasks.md'),
      expect.any(String),
      'utf-8'
    );

    process.cwd = originalCwd;
  });

  it('should throw error when feature not found', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      return !String(path).includes('nonexistent-feature');
    });

    const cmd = createPlanCommand();

    await expect(
      cmd.parseAsync(['plan', '--feature', 'nonexistent-feature'], { from: 'user' })
    ).rejects.toThrow("Feature 'nonexistent-feature' not found");
  });

  it('should throw error when not in obora project', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const cmd = createPlanCommand();

    await expect(
      cmd.parseAsync(['plan', '--feature', 'test-feature'], { from: 'user' })
    ).rejects.toThrow("Not in an obora project");
  });

  it('should handle missing proposal.md gracefully', async () => {
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.readFileSync)
      .mockImplementation((path) => {
        if (String(path).includes('proposal.md')) {
          return '# No proposal\n';
        }
        return fs.readFileSync(path);
      });
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const cmd = createPlanCommand();
    await cmd.parseAsync(['plan', '--feature', 'test-feature'], { from: 'user' });

    // Should not throw when proposal is missing/empty
    expect(fs.writeFile).toHaveBeenCalled();
  });

  it('should handle missing design.md gracefully', async () => {
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.readFileSync)
      .mockImplementation((path) => {
        if (String(path).includes('design.md')) {
          return '# No design\n';
        }
        return fs.readFileSync(path);
      });
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const cmd = createPlanCommand();
    await cmd.parseAsync(['plan', '--feature', 'test-feature'], { from: 'user' });

    // Should not throw when design is missing/empty
    expect(fs.writeFile).toHaveBeenCalled();
  });

  it('should update last_updated timestamp in metadata', async () => {
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const writeFileSpy = vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const cmd = createPlanCommand();
    await cmd.parseAsync(['plan', '--feature', 'test-feature'], { from: 'user' });

    const call = writeFileSpy.mock.calls.find(
      (call) => call[0] === '.obora/features/test-feature/status.yaml'
    );
    expect(call?.[1]).toMatch(/last_updated:\s*"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
```
```
```
```

### init.ts 테스트 예시
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createInitCommand } from '../commands/init';
import * as fs from 'fs-extra';
import { OboraDatabase } from '@obora/database';

vi.mock('fs-extra');
vi.mock('@obora/database');

describe('init command', () => {
  let dbMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);

    // DuckDB mock
    dbMock = {
      initialize: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(OboraDatabase).mockImplementation(() => dbMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create .obora directory structure', async () => {
    const ensureDirSpy = vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    const writeFileSpy = vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const cmd = createInitCommand();
    await cmd.parseAsync(['init'], { from: 'user' });

    // Verify directories created
    expect(ensureDirSpy).toHaveBeenCalledWith('.obora');
    expect(ensureDirSpy).toHaveBeenCalledWith('.obora/workflows');
    expect(ensureDirSpy).toHaveBeenCalledWith('.obora/features');
    expect(ensureDirSpy).toHaveBeenCalledWith('.obora/archive');
    expect(ensureDirSpy).toHaveBeenCalledWith('.obora/agents');
  });

  it('should create config.yaml with default settings', async () => {
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    const writeFileSpy = vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const cmd = createInitCommand();
    await cmd.parseAsync(['init'], { from: 'user' });

    expect(writeFileSpy).toHaveBeenCalledWith(
      '.obora/config.yaml',
      expect.stringContaining('project:'),
      'utf-8'
    );
  });

  it('should create simple workflow by default', async () => {
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    const writeFileSpy = vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const cmd = createInitCommand();
    await cmd.parseAsync(['init'], { from: 'user' });

    expect(writeFileSpy).toHaveBeenCalledWith(
      '.obora/workflows/simple.yaml',
      expect.stringContaining('name: simple'),
      'utf-8'
    );
  });

  it('should create standard workflow with --workflow standard', async () => {
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    const writeFileSpy = vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const cmd = createInitCommand();
    await cmd.parseAsync(['init', '--workflow', 'standard'], { from: 'user' });

    expect(writeFileSpy).toHaveBeenCalledWith(
      '.obora/workflows/standard.yaml',
      expect.stringContaining('name: standard'),
      'utf-8'
    );
  });

  it('should reject invalid workflow type', async () => {
    const cmd = createInitCommand();

    await expect(
      cmd.parseAsync(['init', '--workflow', 'invalid'], { from: 'user' })
    ).rejects.toThrow("Invalid workflow type 'invalid'");
  });

  it('should overwrite with --force option when .obora exists', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.remove).mockResolvedValue(undefined);
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const cmd = createInitCommand();
    await cmd.parseAsync(['init', '--force'], { from: 'user' });

    expect(fs.remove).toHaveBeenCalledWith('.obora');
  });

  it('should throw error when .obora exists without --force', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const cmd = createInitCommand();

    await expect(
      cmd.parseAsync(['init'], { from: 'user' })
    ).rejects.toThrow(".obora/ already exists. Use --force to overwrite.");
  });

  it('should initialize DuckDB database', async () => {
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const cmd = createInitCommand();
    await cmd.parseAsync(['init'], { from: 'user' });

    expect(dbMock.initialize).toHaveBeenCalled();
    expect(dbMock.close).toHaveBeenCalled();
  });

  it('should create .gitkeep files for empty directories', async () => {
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    const writeFileSpy = vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const cmd = createInitCommand();
    await cmd.parseAsync(['init'], { from: 'user' });

    expect(writeFileSpy).toHaveBeenCalledWith(
      '.obora/features/.gitkeep',
      '',
      'utf-8'
    );
    expect(writeFileSpy).toHaveBeenCalledWith(
      '.obora/archive/.gitkeep',
      '',
      'utf-8'
    );
    expect(writeFileSpy).toHaveBeenCalledWith(
      '.obora/agents/.gitkeep',
      '',
      'utf-8'
    );
  });

  it('should use minimal config with --minimal flag', async () => {
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    const writeFileSpy = vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const cmd = createInitCommand();
    await cmd.parseAsync(['init', '--minimal'], { from: 'user' });

    expect(writeFileSpy).toHaveBeenCalledWith(
      '.obora/config.yaml',
      expect.stringContaining('workflow: "simple"'),
      'utf-8'
    );
  });
});
```

## 엣지 케이스 목록

### validate.ts
1. 빈 YAML 파일
2. 유효하지 않은 YAML 문법
3. 파일 경로에 특수문자 포함
4. --all 옵션 시 워크플로우 파일이 없는 경우
5. --format 옵션에 잘못된 값 입력
6. 스텝이 0개인 워크플로우
7. 여러 파일에서 동시에 에러 발생

### status.ts
1. 피처 디렉토리가 존재하지만 status.yaml이 없는 경우
2. status.yaml이 잘못된 YAML인 경우
3. --verbose 옵션으로 스텝 상세 조회
4. status.yaml에 누락된 필드가 있는 경우
5. 여러 피처가 있는 경우 전체 목록 조회

### run.ts
1. 워크플로우 파일이 존재하지 않는 경우
2. 워크플로우 파일이 잘못된 경우
3. --from-step에 존재하지 않는 스텝 이름
4. status.yaml에 workflow 필드가 없는 경우
5. .obora/outputs 디렉토리 생성 실패
6. 에이전트 실행 타임아웃 시뮬레이션

### init.ts, new.ts, done.ts
1. 프로젝트 이름에 경로 조작 시도 ("../../../etc/passwd")
2. 피처 이름에 특수문자 포함
3. 이미 존재하는 피처 생성 시도
4. 디스크 공간 부족 (mock으로 시뮬레이션)
5. 권한 문제 (mock으로 시뮬레이션)

## 참고 자료
- [Vitest 공식 문서](https://vitest.dev/)
- [Vitest Mocking 가이드](https://vitest.dev/guide/mocking.html)
- [Commander.js 공식 문서](https://commander.istartv.io/)
- SPEC-003-cli-interface.md
