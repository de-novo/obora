<debate>
  <round>1</round>
  <task_spec><![CDATA[
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
    "url": "https://github.com/de-novo/obora.git",
    "directory": "packages/agents"
  },
  "bugs": {
    "url": "https://github.com/de-novo/obora/issues"
  },
  "homepage": "https://github.com/de-novo/obora/tree/main/packages/agents#readme"
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
]]></task_spec>

  <reviews>
    <opus_review><![CDATA[


I'll verify each checklist item by examining the actual code in the `packages/agents` directory. Let me start by exploring the codebase.
Now let me verify the remaining items that need deeper investigation - specifically the `AgentRole` export, the `base-agent.test.ts` history type, and actual test execution results.
Now let me run the actual typecheck and test to verify items 1-4:
All 276 tests pass and typecheck succeeds. Now I have all the information needed to produce the verification report.

# 체크리스트 검증 결과

## 총점
10/10

## 항목별 검증

### 1. 전역 `vi.useFakeTimers()` 적용으로 54개 테스트 타임아웃 실패
**[PASS]**
- `vi.useFakeTimers()`는 전체 패키지에서 사용되지 않음 (grep 결과 0건)
- `src/__tests__/setup.ts:7` 에 `// fake timers는 필요한 테스트에서 개별적으로 사용` 주석으로 의도적 미사용 명시
- 전체 276개 테스트 모두 통과 (타임아웃 실패 없음)

### 2. TypeScript 타입체크 실패 — `base-agent.test.ts`의 `history: unknown[]` 타입 불일치
**[PASS]**
- `base-agent.test.ts:39` — `history: [] as ChatMessage[]` 로 올바른 타입 캐스팅 적용
- `AgentContext.history` 타입은 `ChatMessage[]` (`base-agent.ts:59`)
- 테스트 파일에서 `ChatMessage`를 import하여 사용 (`base-agent.test.ts:6`)
- `pnpm typecheck` 성공 (에러 없음)

### 3. TypeScript 타입체크 실패 — `template.test.ts`에서 export되지 않은 `AgentRole` import
**[PASS]**
- `template.test.ts:8` — `import type { AgentRole } from "../../roles/base-agent"` 로 import
- `base-agent.ts:10` — `export enum AgentRole` 로 정상 export됨
- `pnpm typecheck` 성공 (에러 없음)

### 4. `@types/chai`와 `@vitest/expect` 타입 충돌 — vitest 버전 불일치
**[PASS]**
- `@types/chai`는 `package.json`에 포함되어 있지 않음 (grep 결과 0건)
- vitest `^2.1.0`, `@vitest/coverage-v8` `^2.1.0`으로 버전 일치 (`package.json:56-57`)
- 타입 충돌 없이 typecheck 성공

### 5. `createLLMAdapter` factory의 `config` 파라미터가 `unknown` 타입
**[PASS]**
- `src/llm/factory.ts:7-12` — 제네릭 맵 기반 타입 시스템으로 구현
  ```typescript
  type LLMAdapterConfigMap = { "pi-mono": PiMonoConfig };
  export function createLLMAdapter<P extends keyof LLMAdapterConfigMap>(
    provider: P, config: LLMAdapterConfigMap[P]
  ): LLMAdapter
  ```
- `config` 파라미터는 `LLMAdapterConfigMap[P]`로 provider에 따라 정확한 타입 추론됨 (`unknown` 아님)

### 6. `package.json`의 `files`에 존재하지 않는 `CHANGELOG.md` 포함
**[PASS]**
- `package.json:37-40` — `"files": ["dist", "README.md"]`
- `CHANGELOG.md`는 포함되어 있지 않음

### 7. `vitest.config.ts`의 coverage branches threshold가 스펙(80)과 불일치(75)
**[PASS]**
- `vitest.config.ts:19-24` — thresholds 설정:
  ```typescript
  thresholds: {
    lines: 80,
    functions: 80,
    branches: 80,
    statements: 80,
  }
  ```
- 스펙과 동일하게 branches 80으로 설정됨

### 8. `.eslintrc.cjs` 파일 누락
**[PASS]**
- `.eslintrc.cjs` 파일은 존재하지 않지만, ESLint 9 flat config 형식인 `eslint.config.js`가 존재 (`packages/agents/eslint.config.js`)
- 패키지의 devDependencies에 `eslint: ^9.19.0` 사용 중이며, ESLint 9는 flat config를 기본 포맷으로 사용
- `pnpm lint` 스크립트가 정상 동작하는 구조 (turbo-lint.log 존재)
- `.eslintrc.cjs` → `eslint.config.js` 마이그레이션은 ESLint 9 업그레이드에 따른 의도된 변경

## 수정이 필요한 항목
없음. 모든 8개 항목이 PASS.
]]></opus_review>
    <codex_review><![CDATA[
# Checklist Verification Results

## Total Score
9/10

## Item-by-Item Verification
1. PASS — `vi.useFakeTimers()` not globally applied; setup notes per-test usage only (`packages/agents/src/__tests__/setup.ts:9-11`).
2. PASS — `history` typed as `ChatMessage[]` in test context (`packages/agents/src/__tests__/roles/base-agent.test.ts:36-40`).
3. PASS — `AgentRole` is exported and imported correctly (`packages/agents/src/roles/base-agent.ts:10-15`; `packages/agents/src/__tests__/prompts/template.test.ts:8`).
4. PASS — no `@types/chai`; vitest aligned (`packages/agents/package.json:70-80`).
5. PASS — `config` parameter is strongly typed via `LLMAdapterConfigMap` (`packages/agents/src/llm/factory.ts:5-12`).
6. PASS — `files` excludes `CHANGELOG.md` (`packages/agents/package.json:50-52`).
7. PASS — coverage branches threshold is 80 (`packages/agents/vitest.config.ts:20-24`).
8. FAIL — `.eslintrc.cjs` missing (only `packages/agents/eslint.config.js:1` exists).

## Items Requiring Fixes
8. Add missing `.eslintrc.cjs`.

```javascript
// packages/agents/.eslintrc.cjs
module.exports = {
  root: true,
  extends: ["../../.eslintrc.cjs"],
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
  },
  rules: {
    // package-specific rules
  },
};
```
]]></codex_review>
    <glm_review><![CDATA[
# 체크리스트 검증 결과

## 총점
10/10

## 항목별 검증

1. [PASS] `vi.useFakeTimers()` 적용 문제 수정됨
   - `src/__tests__/setup.ts:9-11` - "fake timers는 필요한 테스트에서 개별적으로 사용" 주석으로 의도적 비사용 확인

2. [PASS] `history` 타입 불일치 수정됨
   - `src/__tests__/roles/base-agent.test.ts:39,54,254,269,355` - 모든 `history`가 `[] as ChatMessage[]`로 올바른 타입 캐스팅 사용

3. [PASS] `AgentRole` import 문제 수정됨
   - `src/__tests__/prompts/template.test.ts:8` - `import type { AgentRole } from "../../roles/base-agent";`
   - `src/roles/base-agent.ts:10` - `export enum AgentRole` 정의 확인

4. [PASS] vitest 버전 일치
   - `package.json:80` - `"vitest": "^2.1.0"` 사용, 타입 충돌 없음

5. [PASS] `createLLMAdapter` config 타입 명확화
   - `src/llm/factory.ts:9-12` - 제네릭 타입 `LLMAdapterConfigMap[P]` 사용

6. [PASS] `package.json` files 정확함
   - `package.json:50-53` - `["dist", "README.md"]`만 포함, CHANGELOG.md 없음

7. [PASS] coverage branches threshold 일치
   - `vitest.config.ts:23` - `branches: 80`으로 스펙과 일치

8. [PASS] `.eslintrc.cjs` → `eslint.config.js` 마이그레이션
   - `eslint.config.js:1-57` - modern flat config 형식 사용, 기존 `.eslintrc.cjs` 대체

## 수정이 필요한 항목
없음 - 모든 항목이 정상적으로 수정/구현됨
]]></glm_review>
  </reviews>

  <source_code>

  </source_code>

  <previous_rounds><![CDATA[

]]></previous_rounds>

  <instructions>
    위의 3개 리뷰를 모두 읽고 다음을 수행하세요:

    1. 각 리뷰에서 발견된 이슈를 종합하세요
    2. 각 이슈에 대해 실제 코드를 확인한 후 유효한지 판단하세요
    3. 최종 확정된 이슈 목록 (P0/P1만)과 기각된 이슈 목록을 작성하세요
    4. 확정된 이슈에는 구체적인 수정 코드를 포함하세요
    5. 최종 점수를 부여하세요 (10점 만점)

    규칙:
    - 스펙에 명시되지 않은 기능의 부재는 이슈가 아닙니다
    - P2는 통과 여부에 영향 없음
    - 근거 없는 이슈는 기각하세요
  </instructions>

  <output_format>
    아래 형식을 정확히 따라주세요.

    ## 최종 점수
    - **총점: X/10**

    ## 확정된 이슈

    ### [P0] 이슈 제목
    - **파일**: 파일경로:라인번호
    - **문제점**: 구체적 설명
    - **수정 전 코드**:
    ```typescript
    현재 코드
    ```
    - **수정 후 코드**:
    ```typescript
    수정된 코드
    ```

    ### [P1] 이슈 제목
    - **파일**: 파일경로:라인번호
    - **문제점**: 구체적 설명
    - **수정 전 코드**:
    ```typescript
    현재 코드
    ```
    - **수정 후 코드**:
    ```typescript
    수정된 코드
    ```

    ## 기각된 이슈

    ### 이슈 제목
    - **기각 이유**: 설명

    ## Fixer 지시사항
    확정된 P0/P1 이슈만 아래 순서대로 수정하세요:
    1. (첫 번째 수정할 이슈)
    2. (두 번째 수정할 이슈)
    P2 이슈는 수정하지 마세요.
  </output_format>
</debate>

위의 내용을 바탕으로 3개 리뷰를 종합 판정하고 마크다운으로 출력하세요.
