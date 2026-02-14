# TASK-022: @obora-kit/blackboard 패키지 설정

## 개요
- **상태**: ✅ 완료
- **우선순위**: P1
- **예상 소요**: 2시간
- **담당**: 개발자
- **의존성**: 없음 (다른 태스크와 병렬 가능)

## 목표
`@obora-kit/blackboard` 패키지 디렉토리 구조 및 빌드 설정 완료. 모노레포 환경에서의 패키지 설정.

---

## 작업 내용

### 1. 디렉토리 구조 생성

```
packages/blackboard/
├── src/
│   ├── index.ts            # 메인 export
│   ├── types/
│   │   ├── index.ts
│   │   └── ... (TASK-018)
│   ├── core/
│   │   ├── index.ts
│   │   └── ... (TASK-019)
│   ├── events/
│   │   ├── index.ts
│   │   └── ... (TASK-020)
│   └── snapshot/
│       ├── index.ts
│       └── ... (TASK-021)
├── test/
│   ├── types/
│   ├── core/
│   ├── events/
│   └── snapshot/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.ts
├── README.md
└── CHANGELOG.md
```

### 2. package.json

```json
{
  "name": "@obora-kit/blackboard",
  "version": "0.1.0",
  "description": "Blackboard pattern implementation for AI agent coordination",
  "keywords": [
    "blackboard",
    "ai-agents",
    "state-management",
    "event-bus",
    "obora-kit"
  ],
  "author": "obora-kit contributors",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/obora-kit/obora-kit.git",
    "directory": "packages/blackboard"
  },
  "homepage": "https://github.com/obora-kit/obora-kit/tree/main/packages/blackboard",
  "bugs": {
    "url": "https://github.com/obora-kit/obora-kit/issues"
  },
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    },
    "./types": {
      "import": {
        "types": "./dist/types/index.d.ts",
        "default": "./dist/types/index.js"
      },
      "require": {
        "types": "./dist/types/index.d.cts",
        "default": "./dist/types/index.cjs"
      }
    },
    "./core": {
      "import": {
        "types": "./dist/core/index.d.ts",
        "default": "./dist/core/index.js"
      },
      "require": {
        "types": "./dist/core/index.d.cts",
        "default": "./dist/core/index.cjs"
      }
    },
    "./events": {
      "import": {
        "types": "./dist/events/index.d.ts",
        "default": "./dist/events/index.js"
      },
      "require": {
        "types": "./dist/events/index.d.cts",
        "default": "./dist/events/index.cjs"
      }
    },
    "./snapshot": {
      "import": {
        "types": "./dist/snapshot/index.d.ts",
        "default": "./dist/snapshot/index.js"
      },
      "require": {
        "types": "./dist/snapshot/index.d.cts",
        "default": "./dist/snapshot/index.cjs"
      }
    }
  },
  "files": [
    "dist",
    "README.md",
    "CHANGELOG.md"
  ],
  "scripts": {
    "build": "tsup",
    "build:types": "tsc --emitDeclarationOnly",
    "dev": "tsup --watch",
    "clean": "rimraf dist",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "pnpm run build"
  },
  "dependencies": {},
  "devDependencies": {
    "@types/node": "^20.10.0",
    "tsup": "^8.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0",
    "@vitest/coverage-v8": "^1.0.0",
    "rimraf": "^5.0.0"
  },
  "peerDependencies": {
    "typescript": ">=5.0.0"
  },
  "peerDependenciesMeta": {
    "typescript": {
      "optional": true
    }
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

### 3. tsconfig.json (개발용)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "declarationDir": "./dist",
    
    /* Module */
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2022",
    
    /* Type Checking */
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    
    /* Emit */
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    
    /* Paths */
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

### 4. tsconfig.build.json (빌드용)

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "declaration": true,
    "declarationMap": false,
    "sourceMap": false
  },
  "exclude": ["node_modules", "dist", "test", "**/*.test.ts", "**/*.spec.ts"]
}
```

### 5. tsup.config.ts (번들러 설정)

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'types/index': 'src/types/index.ts',
    'core/index': 'src/core/index.ts',
    'events/index': 'src/events/index.ts',
    'snapshot/index': 'src/snapshot/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  target: 'node18',
  outDir: 'dist',
  external: [],
  esbuildOptions(options) {
    options.banner = {
      js: '/* @obora-kit/blackboard - MIT License */',
    };
  },
});
```

### 6. vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/index.ts',
        'src/**/*.test.ts',
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
```

### 7. 메인 export 파일 (`src/index.ts`)

```typescript
/**
 * @obora-kit/blackboard
 * 
 * Blackboard pattern implementation for AI agent coordination.
 * 
 * @packageDocumentation
 */

// === Types ===
export type {
  // Base types
  AgentId,
  TaskId,
  AgendaId,
  SessionId,
  Timestamped,
  Versioned,
  Identifiable,
  
  // Agent types
  AgentRole,
  AgentStatus,
  AgentStatusEnum,
  
  // Task types
  Task,
  TaskStatus,
  TaskPriority,
  TaskError,
  
  // Decision types
  Agenda,
  AgendaStatus,
  Opinion,
  Stance,
  Resolution,
  DecisionType,
  VoteSummary,
  VotingMethod,
  
  // Knowledge types
  Fact,
  Inference,
  Pattern,
  
  // Message types
  Message,
  MessageType,
  
  // Blackboard types
  BlackboardState,
  BlackboardMeta,
  StateSection,
  KnowledgeSection,
  DecisionsSection,
  BoardPhase,
} from './types';

// === Core ===
export {
  Blackboard,
  EventAwareBlackboard,
  VersionConflictError,
  PathNotFoundError,
} from './core';

export type {
  BlackboardOptions,
  QueryOptions,
  WriteResult,
} from './core';

// === Events ===
export {
  EventBus,
  EventFactory,
} from './events';

export type {
  BlackboardEvent,
  EventType,
  EventHandler,
  Unsubscribe,
  EventFilter,
  EventBusOptions,
  EventBusStats,
} from './events';

// === Snapshot ===
export {
  SnapshotManager,
  StateSerializer,
  SnapshotRestoreError,
  SNAPSHOT_FORMAT_VERSION,
} from './snapshot';

export type {
  Snapshot,
  SnapshotMeta,
  CreateSnapshotOptions,
  RestoreSnapshotOptions,
  SnapshotValidationResult,
} from './snapshot';

// === Utilities ===
export {
  createAgentId,
  createTaskId,
  createAgendaId,
  createSessionId,
  DefaultIdGenerator,
  SequentialIdGenerator,
} from './core/id-generator';

export {
  deepClone,
  deepFreeze,
} from './core/immutable';
```

### 8. README.md

```markdown
# @obora-kit/blackboard

> Blackboard pattern implementation for AI agent coordination

## Installation

```bash
pnpm add @obora-kit/blackboard
```

## Quick Start

```typescript
import { 
  Blackboard, 
  createSessionId, 
  createAgentId 
} from '@obora-kit/blackboard';

// Create a new blackboard
const board = new Blackboard({
  sessionId: createSessionId('session-001'),
});

// Register an agent
board.state.registerAgent({
  id: createAgentId('analyst-1'),
  role: 'analyst',
  status: AgentStatusEnum.ACTIVE,
  // ...
});

// Submit an agenda
const agenda = board.decisions.submitAgenda({
  title: 'New Service Launch',
  description: 'Review Q2 service launch plan',
  // ...
});

// Subscribe to events
board.events.subscribe('decision.consensus.reached', (event) => {
  console.log('Decision made:', event.payload.resolution);
});
```

## Features

- **State Management**: Centralized state with version control (optimistic locking)
- **Event Bus**: Pub/Sub with wildcards, filtering, and history
- **Snapshots**: Create, validate, and restore state snapshots
- **Type Safety**: Full TypeScript support with branded types

## Modules

### Types
```typescript
import type { AgentId, BlackboardState } from '@obora-kit/blackboard/types';
```

### Core
```typescript
import { Blackboard, VersionConflictError } from '@obora-kit/blackboard/core';
```

### Events
```typescript
import { EventBus, EventFactory } from '@obora-kit/blackboard/events';
```

### Snapshot
```typescript
import { SnapshotManager } from '@obora-kit/blackboard/snapshot';
```

## Documentation

See [full documentation](../../docs/architecture/blackboard-actor-design.md).

## License

MIT
```

### 9. CHANGELOG.md

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial implementation of Blackboard core
- Event Bus with wildcard subscriptions
- Snapshot/restore functionality
- TypeScript type definitions with JSDoc

## [0.1.0] - 2026-02-XX

### Added
- First release
- Blackboard state management
- Event bus (Pub/Sub)
- Snapshot manager
- Full TypeScript support
```

### 10. 루트 tsconfig.base.json 업데이트

프로젝트 루트의 `tsconfig.base.json`에 blackboard 패키지 경로 추가:

```json
{
  "compilerOptions": {
    // ... existing options ...
    "paths": {
      "@obora-kit/blackboard": ["packages/blackboard/src"],
      "@obora-kit/blackboard/*": ["packages/blackboard/src/*"]
    }
  }
}
```

### 11. 루트 package.json workspace 설정

```json
{
  "workspaces": [
    "packages/*"
  ]
}
```

---

## 완료 조건

- [x] `packages/blackboard/` 디렉토리 생성
- [x] `package.json` 작성 완료
- [x] `tsconfig.json`, `tsconfig.build.json` 작성 완료
- [x] `tsup.config.ts` 작성 완료
- [x] `vitest.config.ts` 작성 완료
- [x] `src/index.ts` 작성 완료
- [x] `README.md` 작성 완료
- [x] `pnpm install` 성공
- [x] `pnpm run build` 성공
- [x] `pnpm run typecheck` 성공

---

## 참고 문서

- [Blackboard + Actor 설계 문서](../../architecture/blackboard-actor-design.md)
- [tsup 문서](https://tsup.egoist.dev/)
- [vitest 문서](https://vitest.dev/)

---

## 재동기화 판정 (2026-02-13)
- 최종 판정: **✅ 완료**
- 근거 코드:
  - `packages/blackboard/package.json`
  - `packages/blackboard/tsconfig.json`
  - `packages/blackboard/tsconfig.build.json`
  - `packages/blackboard/tsup.config.ts`
  - `packages/blackboard/vitest.config.ts`
  - `packages/blackboard/src/index.ts`
  - `packages/blackboard/README.md`
  - `packages/blackboard/CHANGELOG.md`
- 검증 결과: 패키지 구조/빌드/타입체크 설정이 완료되었고 빌드 및 타입체크가 통과합니다.
- 검증 명령:
  - `pnpm --filter @obora-kit/blackboard test` ✅ (14 files, 470 tests passed)
  - `pnpm --filter @obora-kit/blackboard typecheck` ✅
  - `pnpm --filter @obora-kit/blackboard build` ✅

