<review>
  <mode>checklist_verification</mode>
  <task>
    <name>TASK-034-agents-package</name>
    <spec><![CDATA[
# TASK-034: @obora-kit/agents 패키지 설정

## 개요
- **상태**: 📋 대기
- 우선순위: P1
- 예상 소요: 2시간
- 담당: 개발자
- Phase: Week 5-6

## 목표
AI 에이전트 관련 코드를 위한 `@obora-kit/agents` 패키지 설정

## 작업 내용

### 1. 디렉토리 구조 생성

```
packages/agents/
├── src/
│   ├── llm/
│   │   ├── adapter.ts
│   │   ├── pi-mono-adapter.ts
│   │   ├── mock-adapter.ts
│   │   ├── factory.ts
│   │   ├── retry-handler.ts
│   │   └── index.ts
│   │
│   ├── roles/
│   │   ├── base-agent.ts
│   │   ├── analyst-agent.ts
│   │   ├── executor-agent.ts
│   │   ├── verifier-agent.ts
│   │   ├── director-agent.ts
│   │   ├── factory.ts
│   │   └── index.ts
│   │
│   ├── prompts/
│   │   ├── template.ts
│   │   ├── registry.ts
│   │   ├── builder.ts
│   │   ├── role-templates.ts
│   │   ├── templates/
│   │   │   ├── analyst.md
│   │   │   ├── executor.md
│   │   │   ├── verifier.md
│   │   │   └── director.md
│   │   └── index.ts
│   │
│   ├── tools/
│   │   ├── types.ts
│   │   ├── registry.ts
│   │   ├── decorators.ts
│   │   ├── executor.ts
│   │   ├── builtin/
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   ├── types/
│   │   └── index.ts
│   │
│   └── index.ts
│
├── test/
│   ├── llm/
│   │   ├── adapter.test.ts
│   │   └── pi-mono-adapter.test.ts
│   ├── roles/
│   │   ├── analyst-agent.test.ts
│   │   ├── executor-agent.test.ts
│   │   ├── verifier-agent.test.ts
│   │   └── director-agent.test.ts
│   ├── prompts/
│   │   ├── template.test.ts
│   │   └── registry.test.ts
│   └── tools/
│       ├── registry.test.ts
│       └── executor.test.ts
│
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

### 2. package.json

**파일 위치:** `packages/agents/package.json`

```json
{
  "name": "@obora-kit/agents",
  "version": "0.1.0",
  "description": "AI agents for obora-kit - Blackboard + Actor architecture",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./llm": {
      "types": "./dist/llm/index.d.ts",
      "import": "./dist/llm/index.js"
    },
    "./roles": {
      "types": "./dist/roles/index.d.ts",
      "import": "./dist/roles/index.js"
    },
    "./prompts": {
      "types": "./dist/prompts/index.d.ts",
      "import": "./dist/prompts/index.js"
    },
    "./tools": {
      "types": "./dist/tools/index.d.ts",
      "import": "./dist/tools/index.js"
    }
  },
  "files": [
    "dist",
    "README.md"
  ],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist coverage"
  },
  "dependencies": {
    "@obora-kit/blackboard": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.0.0",
    "@vitest/coverage-v8": "^1.0.0",
    "eslint": "^8.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0"
  },
  "peerDependencies": {
    "typescript": ">=5.0.0"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "keywords": [
    "ai",
    "agents",
    "llm",
    "blackboard",
    "actor",
    "pi-mono",
    "obora"
  ],
  "author": "obora-kit team",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/obora-kit/obora-kit.git",
    "directory": "packages/agents"
  },
  "bugs": {
    "url": "https://github.com/obora-kit/obora-kit/issues"
  },
  "homepage": "https://github.com/obora-kit/obora-kit/tree/main/packages/agents#readme"
}
```

### 3. tsconfig.json

**파일 위치:** `packages/agents/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declarationDir": "./dist",
    "declaration": true,
    "declarationMap": true,
    "composite": true,
    "tsBuildInfoFile": "./dist/.tsbuildinfo"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

### 4. tsup.config.ts (빌드 설정)

**파일 위치:** `packages/agents/tsup.config.ts`

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'llm/index': 'src/llm/index.ts',
    'roles/index': 'src/roles/index.ts',
    'prompts/index': 'src/prompts/index.ts',
    'tools/index': 'src/tools/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  minify: false,
  external: ['@obora-kit/blackboard'],
});
```

### 5. vitest.config.ts (테스트 설정)

**파일 위치:** `packages/agents/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/index.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    setupFiles: ['./test/setup.ts'],
  },
});
```

### 6. 테스트 설정 파일

**파일 위치:** `packages/agents/test/setup.ts`

```typescript
import { beforeAll, afterAll, afterEach } from 'vitest';
import { globalToolRegistry } from '../src/tools/registry';
import { globalPromptRegistry } from '../src/prompts/registry';

beforeAll(() => {
  // 테스트 시작 전 설정
});

afterEach(() => {
  // 각 테스트 후 정리
  globalToolRegistry.clear();
  globalPromptRegistry.clear();
});

afterAll(() => {
  // 테스트 종료 후 정리
});
```

### 7. 메인 내보내기

**파일 위치:** `packages/agents/src/index.ts`

```typescript
// LLM Adapters
export * from './llm';

// Agent Roles
export * from './roles';

// Prompt Templates
export * from './prompts';

// Tools
export * from './tools';

// Types
export * from './types';

// Version
export const VERSION = '0.1.0';
```

### 8. 타입 정의

**파일 위치:** `packages/agents/src/types/index.ts`

```typescript
/**
 * 공통 타입 정의
 */

/**
 * 에이전트 ID 타입
 */
export type AgentId = string;

/**
 * 작업 ID 타입
 */
export type TaskId = string;

/**
 * 세션 ID 타입
 */
export type SessionId = string;

/**
 * 타임스탬프 타입
 */
export type Timestamp = Date | string | number;

/**
 * 결과 타입
 */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Async 결과 타입
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

/**
 * 선택적 타입
 */
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * 필수 타입
 */
export type Required<T, K extends keyof T> = Omit<T, K> & {
  [P in K]-?: T[P];
};

/**
 * DeepPartial 타입
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * JSON 호환 타입
 */
export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

/**
 * 이벤트 핸들러 타입
 */
export type EventHandler<T = unknown> = (event: T) => void | Promise<void>;

/**
 * 구독 해제 함수 타입
 */
export type Unsubscribe = () => void;

/**
 * 로그 레벨
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * 로거 인터페이스
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}
```

### 9. README.md

**파일 위치:** `packages/agents/README.md`

```markdown
# @obora-kit/agents

AI agents for obora-kit - Blackboard + Actor architecture

## Installation

```bash
pnpm add @obora-kit/agents
```

## Features

- **LLM Adapters**: Pi Mono adapter with streaming support
- **Agent Roles**: Analyst, Executor, Verifier, Director
- **Prompt Templates**: Variable substitution, conditionals, inheritance
- **Tools**: Function calling, tool registry, built-in tools

## Quick Start

### Create an LLM Adapter

```typescript
import { createLLMAdapter } from '@obora-kit/agents/llm';

const llm = createLLMAdapter('pi-mono', {
  apiKey: process.env.PIMONO_API_KEY,
});

const result = await llm.chatCompletion({
  messages: [
    { role: 'user', content: 'Hello!' },
  ],
});
```

### Create an Agent

```typescript
import { createAgent } from '@obora-kit/agents/roles';

const analyst = createAgent({
  id: 'analyst-1',
  role: 'analyst',
  llm,
});

const result = await analyst.execute(task, context);
```

### Use Prompt Templates

```typescript
import { PromptTemplate } from '@obora-kit/agents/prompts';

const template = new PromptTemplate(`
Hello {{name}},
{{#if task}}Your task: {{task}}{{/if}}
`);

const result = template.render({
  name: 'Alice',
  task: 'Analyze the data',
});
```

### Register Tools

```typescript
import { ToolRegistry, registerBuiltinTools } from '@obora-kit/agents/tools';

const registry = new ToolRegistry();
registerBuiltinTools(registry);

const result = await registry.execute('calculator', {
  expression: '2 + 2',
}, context);
```

## API Documentation

See [API Documentation](./docs/api.md) for detailed information.

## License

MIT
```

### 10. .eslintrc.cjs

**파일 위치:** `packages/agents/.eslintrc.cjs`

```javascript
module.exports = {
  root: true,
  extends: ['../../.eslintrc.cjs'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  rules: {
    // 패키지별 규칙
  },
};
```

## 완료 조건
- [ ] packages/agents/ 디렉토리 생성
- [ ] package.json 작성 완료
- [ ] tsconfig.json 작성 완료
- [ ] tsup.config.ts 작성 완료
- [ ] vitest.config.ts 작성 완료
- [ ] 메인 index.ts 작성 완료
- [ ] 공통 타입 정의 완료
- [ ] README.md 작성 완료
- [ ] pnpm install 성공
- [ ] pnpm build 성공

## 의존성
- 없음 (기반 패키지)

## 검증 명령어

```bash
# 패키지 디렉토리로 이동
cd packages/agents

# 의존성 설치
pnpm install

# 빌드
pnpm build

# 타입 체크
pnpm typecheck

# 린트
pnpm lint

# 테스트 (아직 테스트 코드가 없으면 스킵)
pnpm test
```

## 워크스페이스 설정 확인

루트 `pnpm-workspace.yaml`에 패키지가 포함되어 있는지 확인:

```yaml
packages:
  - 'packages/*'
```

루트 `package.json`의 워크스페이스 의존성:

```json
{
  "devDependencies": {
    "@obora-kit/agents": "workspace:*"
  }
}
```

## 엣지 케이스
1. Node.js 버전 호환성 확인 (>=20.0.0)
2. TypeScript 버전 호환성 확인 (>=5.0.0)
3. ESM vs CommonJS 호환성 확인
4. 의존성 버전 충돌 해결
5. 빌드 출력 경로 확인

## 참고 자료
- [pnpm workspace](https://pnpm.io/workspaces)
- [tsup documentation](https://tsup.egoist.dev/)
- [vitest documentation](https://vitest.dev/)

---

*작성일: 2026-02-04*
*버전: 1.0.0*
]]></spec>
  </task>

  <instructions>
    Verify ONLY the checklist items below. Do NOT find new issues.
    For each item, output PASS or FAIL + evidence (file:line).
    All PASS = 10 points, deduct for each FAIL.

    ## Verification Rules
    - For each item, verify whether "this issue found in the previous review has been **fixed in the current code**".
    - [PASS] = The issue has been fixed, or the problem no longer exists in the current code
    - [FAIL] = The issue still exists and has not been fixed
    - "Pattern exists but is intentional design" → [PASS] (if specified in the spec)
    - When judging whether a fix was applied, check the **actual code**. Do not guess.
  </instructions>

  <checklist>
# 자동 생성 체크리스트
# 생성 시각: 2026-02-12 11:23:04

1. 전역 `vi.useFakeTimers()` 적용으로 54개 테스트 타임아웃 실패
2. TypeScript 타입체크 실패 — `base-agent.test.ts`의 `history: unknown[]` 타입 불일치
3. TypeScript 타입체크 실패 — `template.test.ts`에서 export되지 않은 `AgentRole` import
4. `@types/chai`와 `@vitest/expect` 타입 충돌 — vitest 버전 불일치
5. `createLLMAdapter` factory의 `config` 파라미터가 `unknown` 타입
6. `package.json`의 `files`에 존재하지 않는 `CHANGELOG.md` 포함
7. `vitest.config.ts`의 coverage branches threshold가 스펙(80)과 불일치(75)
8. `.eslintrc.cjs` 파일 누락
  </checklist>

  <source_files>

  </source_files>

  <test_files>

  </test_files>

  <output_format>
# Checklist Verification Results

## Total Score
X/10

## Item-by-Item Verification
For each item, output PASS/FAIL + evidence (file:line)

## Items Requiring Fixes
Provide fix code for FAIL items
  </output_format>
</review>

Follow the XML prompt above to perform checklist verification and output results in markdown format.
