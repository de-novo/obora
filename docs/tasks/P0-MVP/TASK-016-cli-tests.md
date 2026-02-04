# TASK-016: @obora/cli 유닛 테스트

## 개요
- 우선순위: P0
- 예상 소요: 12시간
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
});
```

### init.ts 테스트 예시
```typescript
describe('init command', () => {
  it('should create .obora directory', async () => {
    const mkdirSpy = vi.fn();
    vi.mocked(fs.ensureDir).mockImplementation(mkdirSpy);

    const cmd = createInitCommand();
    await cmd.parseAsync(['init', '--name', 'test-project'], { from: 'user' });

    expect(mkdirSpy).toHaveBeenCalledWith('.obora');
  });

  it('should overwrite with --force option', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const writeFileSpy = vi.spyOn(fs, 'writeFile').mockResolvedValue();

    const cmd = createInitCommand();
    await cmd.parseAsync(['init', '--name', 'test-project', '--force'], { from: 'user' });

    expect(writeFileSpy).toHaveBeenCalled();
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
