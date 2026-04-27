# TASK-028: @obora-kit/actor 패키지 설정

## 개요
- **상태**: ✅ 완료
- 우선순위: P1
- 예상 소요: 2시간
- 담당: 개발자
- Phase: Week 3-4

## 목표
Actor 시스템을 독립 패키지로 구성하여 모노레포 내에서 관리할 수 있도록 설정합니다.

## 작업 내용

### 1. 디렉토리 구조 생성

```
packages/actor/
├── src/
│   ├── types/
│   │   ├── __tests__/
│   │   │   └── actor.test.ts
│   │   ├── actor.ts
│   │   ├── blackboard.ts
│   │   └── index.ts
│   ├── base/
│   │   ├── __tests__/
│   │   │   └── BaseActor.test.ts
│   │   └── BaseActor.ts
│   ├── runtime/
│   │   ├── __tests__/
│   │   │   ├── ActorRuntime.test.ts
│   │   │   ├── DefaultActorFactory.test.ts
│   │   │   └── ActorRunner.test.ts
│   │   ├── ActorRuntime.ts
│   │   ├── DefaultActorFactory.ts
│   │   ├── ActorRunner.ts
│   │   ├── types.ts
│   │   └── index.ts
│   ├── pool/
│   │   ├── __tests__/
│   │   │   ├── ActorPool.test.ts
│   │   │   └── PoolManager.test.ts
│   │   ├── ActorPool.ts
│   │   ├── PoolManager.ts
│   │   └── index.ts
│   ├── supervision/
│   │   ├── __tests__/
│   │   │   ├── Supervisor.test.ts
│   │   │   └── SupervisorTree.test.ts
│   │   ├── Supervisor.ts
│   │   ├── SupervisorTree.ts
│   │   ├── types.ts
│   │   └── index.ts
│   └── index.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

### 2. package.json 설정

**파일:** `packages/actor/package.json`

```json
{
  "name": "@obora-kit/actor",
  "version": "0.0.1",
  "description": "Actor system for obora-kit - manage concurrent actors with supervision",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./types": {
      "import": "./dist/types/index.js",
      "types": "./dist/types/index.d.ts"
    },
    "./runtime": {
      "import": "./dist/runtime/index.js",
      "types": "./dist/runtime/index.d.ts"
    },
    "./pool": {
      "import": "./dist/pool/index.js",
      "types": "./dist/pool/index.d.ts"
    },
    "./supervision": {
      "import": "./dist/supervision/index.js",
      "types": "./dist/supervision/index.d.ts"
    }
  },
  "files": [
    "dist",
    "README.md"
  ],
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src --ext .ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@obora-kit/blackboard": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@vitest/coverage-v8": "^1.2.0",
    "typescript": "^5.3.3",
    "vitest": "^1.2.0"
  },
  "peerDependencies": {
    "@obora-kit/blackboard": ">=0.0.1"
  },
  "keywords": [
    "actor",
    "actor-model",
    "supervision",
    "concurrent",
    "obora-kit"
  ],
  "author": "obora-kit team",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/de-novo/obora.git",
    "directory": "packages/actor"
  },
  "bugs": {
    "url": "https://github.com/de-novo/obora/issues"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### 3. tsconfig.json 설정

**파일:** `packages/actor/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "incremental": true,
    "tsBuildInfoFile": "./dist/.tsbuildinfo"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/__tests__/**"],
  "references": [
    {
      "path": "../blackboard"
    }
  ]
}
```

### 4. vitest.config.ts 설정

**파일:** `packages/actor/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/__tests__/**',
        'src/**/index.ts',
        'src/**/types.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
```

### 5. src/index.ts (메인 내보내기)

**파일:** `packages/actor/src/index.ts`

```typescript
/**
 * @obora-kit/actor
 *
 * Actor 시스템 패키지 - Actor 모델 기반의 동시성 처리
 *
 * @example
 * ```typescript
 * import {
 *   ActorRuntime,
 *   ActorPool,
 *   Supervisor,
 *   ActorRole,
 *   ActorStatus,
 * } from '@obora-kit/actor';
 *
 * // 런타임 생성
 * const runtime = new ActorRuntime(blackboard, factory);
 * await runtime.start();
 *
 * // Actor 생성
 * const actor = await runtime.spawn({
 *   role: ActorRole.ANALYST,
 *   type: 'data-analyst',
 * });
 *
 * // 풀 관리
 * const pool = new ActorPool({
 *   name: 'analysts',
 *   role: ActorRole.ANALYST,
 *   type: 'data-analyst',
 *   initialSize: 3,
 * }, blackboard, factory);
 *
 * // Supervision
 * const supervisor = new Supervisor(runtime, {
 *   strategy: RestartStrategy.ONE_FOR_ONE,
 *   maxRestarts: 3,
 * });
 * ```
 *
 * @packageDocumentation
 */

// Types
export * from './types';

// Base
export { BaseActor } from './base/BaseActor';

// Runtime
export {
  ActorRuntime,
  ActorFactory,
  ActorConfig,
  RuntimeConfig,
  DefaultActorFactory,
  ActorRunner,
  RunnerOptions,
} from './runtime';

// Pool
export {
  ActorPool,
  PoolConfig,
  PoolMetrics,
  Task,
  TaskResult,
  PoolManager,
} from './pool';

// Supervision
export {
  Supervisor,
  SupervisorConfig,
  SupervisorTree,
  RestartStrategy,
  RestartDirective,
  BackoffPolicy,
  BackoffConfig,
  RestartHistory,
  DeadLetter,
} from './supervision';
```

### 6. README.md

**파일:** `packages/actor/README.md`

```markdown
# @obora-kit/actor

Actor 시스템 패키지 - Blackboard 패턴과 함께 사용하는 Actor 모델 기반의 동시성 처리 시스템입니다.

## 설치

```bash
pnpm add @obora-kit/actor
```

## 주요 기능

- **Actor 런타임**: Actor의 생명주기 관리 (spawn, stop, restart)
- **Actor Pool**: 동적 확장/축소, 작업 분배, 로드 밸런싱
- **Supervision**: 재시작 전략, 백오프 정책, Dead Letter Queue

## 사용법

### 기본 Actor 생성

```typescript
import { ActorRuntime, DefaultActorFactory, ActorRole } from '@obora-kit/actor';
import { Blackboard } from '@obora-kit/blackboard';

// Blackboard 인스턴스 (별도 생성)
const blackboard = new Blackboard();

// Factory 설정
const factory = new DefaultActorFactory();
factory.register('analyst', AnalystActor);

// Runtime 생성 및 시작
const runtime = new ActorRuntime(blackboard, factory);
await runtime.start();

// Actor 생성
const actor = await runtime.spawn({
  role: ActorRole.ANALYST,
  type: 'analyst',
});

// Actor 사용
const observation = await actor.observe();
const action = await actor.think(observation);
const result = await actor.act(action);
await actor.report(result);

// 정리
await runtime.stop();
```

### Actor Pool 사용

```typescript
import { ActorPool, PoolManager, ActorRole } from '@obora-kit/actor';

// Pool 설정
const poolConfig = {
  name: 'analysts',
  role: ActorRole.ANALYST,
  type: 'analyst',
  initialSize: 3,
  minSize: 1,
  maxSize: 10,
  dispatchStrategy: 'round-robin',
};

// Pool 생성
const pool = new ActorPool(poolConfig, blackboard, factory);
await pool.start();

// 작업 제출
const taskId = await pool.submit({ data: 'analyze this' });

// 또는 결과 대기
const result = await pool.submitAndWait({ data: 'analyze this' });

// 스케일링
await pool.scaleUp(2);  // 2개 추가
await pool.scaleDown(1); // 1개 제거

// 메트릭 조회
const metrics = pool.getMetrics();
console.log(`Active: ${metrics.activeActors}, Queue: ${metrics.queuedTasks}`);
```

### Supervision 설정

```typescript
import {
  Supervisor,
  SupervisorTree,
  RestartStrategy,
  BackoffPolicy,
} from '@obora-kit/actor';

// Supervisor 생성
const supervisor = new Supervisor(runtime, {
  strategy: RestartStrategy.ONE_FOR_ONE,
  backoff: {
    policy: BackoffPolicy.EXPONENTIAL,
    initialDelay: 1000,
    maxDelay: 30000,
    multiplier: 2,
  },
  maxRestarts: 3,
  restartWindow: 60000,
});

// Supervisor 시작 및 Actor 감시
supervisor.start();
supervisor.watch('actor-1');
supervisor.watch('actor-2');

// 이벤트 핸들링
supervisor.on('actor:failed', (actorId, error) => {
  console.log(`Actor ${actorId} failed:`, error);
});

supervisor.on('actor:restarted', (actorId, attempt) => {
  console.log(`Actor ${actorId} restarted (attempt ${attempt})`);
});

// 계층적 Supervision
const tree = new SupervisorTree(runtime);
const rootId = tree.createRoot();
const childId = tree.createChild(rootId, {
  strategy: RestartStrategy.ALL_FOR_ONE,
});
```

## Actor 역할

| 역할 | 설명 |
|------|------|
| `ANALYST` | 데이터 분석, 추론, 평가 |
| `EXECUTOR` | API 호출, 파일 처리, 작업 수행 |
| `VERIFIER` | 결과 검증, 품질 체크, 오류 탐지 |
| `DIRECTOR` | 회의 진행, 투표 관리, 의사결정 조율 |

## 재시작 전략

| 전략 | 설명 |
|------|------|
| `ONE_FOR_ONE` | 실패한 Actor만 재시작 |
| `ALL_FOR_ONE` | 하나가 실패하면 모든 Actor 재시작 |
| `REST_FOR_ONE` | 실패한 Actor와 이후 생성된 Actor들 재시작 |

## 백오프 정책

| 정책 | 설명 |
|------|------|
| `FIXED` | 고정 대기 시간 |
| `LINEAR` | 선형 증가 (initialDelay * attempt) |
| `EXPONENTIAL` | 지수 증가 (initialDelay * 2^attempt) |
| `EXPONENTIAL_JITTER` | 지수 증가 + 랜덤 지터 |

## API 문서

자세한 API 문서는 [docs/api/actor.md](../../docs/api/actor.md)를 참조하세요.

## 라이선스

MIT
```

### 7. 루트 설정 업데이트

#### pnpm-workspace.yaml 확인

**파일:** `pnpm-workspace.yaml`

```yaml
packages:
  - 'packages/*'
```

#### tsconfig.base.json 확인

**파일:** `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": false,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true
  }
}
```

#### 루트 package.json 스크립트 추가

**파일:** `package.json` (루트)

```json
{
  "scripts": {
    "build": "pnpm -r build",
    "build:actor": "pnpm --filter @obora-kit/actor build",
    "test": "pnpm -r test",
    "test:actor": "pnpm --filter @obora-kit/actor test",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck"
  }
}
```

### 8. TypeScript 프로젝트 참조 설정

**파일:** `tsconfig.json` (루트)

```json
{
  "files": [],
  "references": [
    { "path": "packages/blackboard" },
    { "path": "packages/actor" }
  ]
}
```

## 완료 조건
- [ ] packages/actor/ 디렉토리 생성
- [ ] package.json 작성 완료
- [ ] tsconfig.json 작성 완료
- [ ] vitest.config.ts 작성 완료
- [ ] src/index.ts (메인 내보내기) 작성 완료
- [ ] README.md 작성 완료
- [ ] exports 설정 (types, runtime, pool, supervision)
- [ ] @obora-kit/blackboard 의존성 설정
- [ ] pnpm install 성공
- [ ] pnpm build:actor 성공
- [ ] pnpm test:actor 성공

## 의존성
- 없음 (TASK-024~027과 병렬 진행 가능)

## 참고 자료
- `/packages/core/package.json` - 기존 패키지 구조 참조
- `/packages/blackboard/package.json` - Blackboard 패키지 참조

## 수락 기준
1. `pnpm install`이 에러 없이 완료된다
2. `pnpm build:actor`가 성공적으로 빌드된다
3. `pnpm test:actor`가 성공적으로 실행된다
4. 모든 exports가 올바르게 동작한다
5. TypeScript 타입이 올바르게 내보내진다
6. README.md에 사용법이 명확히 문서화되어 있다

## 검증 명령어

```bash
# 패키지 설치
pnpm install

# 빌드
pnpm build:actor

# 테스트
pnpm test:actor

# 타입 체크
pnpm --filter @obora-kit/actor typecheck

# exports 확인
node -e "import('@obora-kit/actor').then(m => console.log(Object.keys(m)))"
node -e "import('@obora-kit/actor/runtime').then(m => console.log(Object.keys(m)))"
node -e "import('@obora-kit/actor/pool').then(m => console.log(Object.keys(m)))"
node -e "import('@obora-kit/actor/supervision').then(m => console.log(Object.keys(m)))"
```

## 재동기화 근거 (2026-02-13)
- 코드 변경: `packages/actor/package.json`, `src/index.ts` 등 패키지 구성 반영
- 테스트: `pnpm --filter @obora-kit/actor test` 통과 (256/256, 2026-02-13)
- 2모델 리뷰: 완료 커밋 메시지(score 9.5/10) 기준 게이트 충족
- 커밋: `ed205d0`
