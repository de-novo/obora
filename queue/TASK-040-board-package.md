# TASK-040: @obora-kit/board 패키지 설정

## 개요
- **상태**: 📋 대기
- 우선순위: P1
- 예상 소요: 2시간
- 담당: 개발자

## 목표
AI 이사회 시스템을 위한 `@obora-kit/board` 패키지의 기본 구조와 설정을 구성합니다.

## 작업 내용

### 1. 디렉토리 구조 생성

```
packages/board/
├── src/
│   ├── agenda/
│   │   ├── AgendaManager.ts
│   │   └── index.ts
│   ├── voting/
│   │   ├── VotingSession.ts
│   │   ├── VotingManager.ts
│   │   ├── tally/
│   │   │   ├── majority.ts
│   │   │   ├── supermajority.ts
│   │   │   ├── unanimous.ts
│   │   │   ├── weighted.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   ├── consensus/
│   │   ├── ConsensusEngine.ts
│   │   ├── ConditionalConsensusHandler.ts
│   │   ├── EscalationHandler.ts
│   │   ├── algorithms/
│   │   │   ├── majority.ts
│   │   │   ├── unanimous.ts
│   │   │   ├── weighted.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   ├── state-machine/
│   │   ├── BoardStateMachine.ts
│   │   ├── transitions.ts
│   │   ├── state-configs.ts
│   │   ├── guards.ts
│   │   ├── actions.ts
│   │   └── index.ts
│   ├── types/
│   │   ├── agenda.ts
│   │   ├── voting.ts
│   │   ├── consensus.ts
│   │   ├── state-machine.ts
│   │   └── index.ts
│   ├── utils/
│   │   ├── id-generator.ts
│   │   └── index.ts
│   └── index.ts
├── test/
│   ├── agenda/
│   │   └── AgendaManager.test.ts
│   ├── voting/
│   │   ├── VotingSession.test.ts
│   │   ├── VotingManager.test.ts
│   │   └── tally/
│   │       ├── majority.test.ts
│   │       ├── unanimous.test.ts
│   │       └── weighted.test.ts
│   ├── consensus/
│   │   ├── ConsensusEngine.test.ts
│   │   └── algorithms/
│   │       └── *.test.ts
│   ├── state-machine/
│   │   └── BoardStateMachine.test.ts
│   └── helpers/
│       └── test-utils.ts
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
  "name": "@obora-kit/board",
  "version": "0.1.0",
  "description": "AI Board of Directors system for obora-kit",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./agenda": {
      "import": "./dist/agenda/index.js",
      "types": "./dist/agenda/index.d.ts"
    },
    "./voting": {
      "import": "./dist/voting/index.js",
      "types": "./dist/voting/index.d.ts"
    },
    "./consensus": {
      "import": "./dist/consensus/index.js",
      "types": "./dist/consensus/index.d.ts"
    },
    "./state-machine": {
      "import": "./dist/state-machine/index.js",
      "types": "./dist/state-machine/index.d.ts"
    }
  },
  "files": [
    "dist",
    "README.md",
    "CHANGELOG.md"
  ],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix",
    "clean": "rimraf dist coverage",
    "prepublishOnly": "pnpm run build"
  },
  "dependencies": {
    "@obora-kit/core": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@vitest/coverage-v8": "^1.2.0",
    "eslint": "^8.56.0",
    "rimraf": "^5.0.5",
    "tsup": "^8.0.1",
    "typescript": "^5.3.3",
    "vitest": "^1.2.0"
  },
  "peerDependencies": {
    "@obora-kit/core": "workspace:*"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "keywords": [
    "obora",
    "ai",
    "board",
    "voting",
    "consensus",
    "decision-making",
    "multi-agent"
  ],
  "author": "obora-kit contributors",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/obora-ai/obora-kit.git",
    "directory": "packages/board"
  },
  "bugs": {
    "url": "https://github.com/obora-ai/obora-kit/issues"
  },
  "homepage": "https://github.com/obora-ai/obora-kit/tree/main/packages/board#readme"
}
```

### 3. tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "declarationDir": "./dist",
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "bundler",
    "module": "ESNext",
    "target": "ES2022",
    "lib": ["ES2022"],
    "types": ["node"],
    "paths": {
      "@obora-kit/core": ["../core/src"],
      "@obora-kit/core/*": ["../core/src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"],
  "references": [
    { "path": "../core" }
  ]
}
```

### 4. tsconfig.build.json

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "paths": {}
  },
  "exclude": ["node_modules", "dist", "test", "**/*.test.ts", "**/*.spec.ts"]
}
```

### 5. vitest.config.ts

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
        'src/types/**'
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80
      }
    },
    testTimeout: 10000,
    hookTimeout: 10000
  },
  resolve: {
    alias: {
      '@obora-kit/core': resolve(__dirname, '../core/src'),
      '@': resolve(__dirname, './src')
    }
  }
});
```

### 6. tsup.config.ts

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'agenda/index': 'src/agenda/index.ts',
    'voting/index': 'src/voting/index.ts',
    'consensus/index': 'src/consensus/index.ts',
    'state-machine/index': 'src/state-machine/index.ts'
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  external: ['@obora-kit/core'],
  outDir: 'dist'
});
```

### 7. src/index.ts (메인 진입점)

```typescript
/**
 * @obora-kit/board
 *
 * AI 이사회(Board of Directors) 시스템
 *
 * 주요 기능:
 * - 안건(Agenda) 관리
 * - 투표(Voting) 시스템
 * - 합의(Consensus) 알고리즘
 * - 상태 기계(State Machine)
 *
 * @example
 * ```typescript
 * import { Board, AgendaManager, VotingManager, ConsensusEngine } from '@obora-kit/board';
 *
 * const board = new Board({
 *   participants: ['ceo', 'cto', 'cfo'],
 *   eventBus
 * });
 *
 * board.start();
 * board.submitAgenda({
 *   title: '신규 프로젝트 승인',
 *   description: '...',
 *   proposer: 'ceo'
 * });
 * ```
 *
 * @packageDocumentation
 */

// === Types ===
export * from './types/index.js';

// === Agenda ===
export { AgendaManager } from './agenda/index.js';
export type {
  Agenda,
  AgendaCreateOptions,
  AgendaUpdateOptions,
  AgendaFilter,
  AgendaPriority,
  AgendaStatus
} from './types/agenda.js';

// === Voting ===
export { VotingSession, VotingManager } from './voting/index.js';
export type {
  Vote,
  VoteChoice,
  VotingMethod,
  VotingSessionStatus,
  VotingResult,
  VotingSessionResult,
  VoteSummary
} from './types/voting.js';

// === Consensus ===
export { ConsensusEngine } from './consensus/index.js';
export type {
  ConsensusResult,
  ConsensusStatus,
  ConsensusType,
  ConsensusDecision,
  ConditionalClause,
  DissentRecord,
  EscalationRecord,
  EscalationLevel,
  ConsensusRules
} from './types/consensus.js';

// === State Machine ===
export { BoardStateMachine } from './state-machine/index.js';
export type {
  BoardState,
  BoardEvent,
  BoardContext,
  StateTransition,
  StateConfig,
  TransitionRule
} from './types/state-machine.js';

// === Board (통합 클래스) ===
export { Board } from './Board.js';
export type { BoardOptions, BoardSession } from './Board.js';
```

### 8. src/types/index.ts

```typescript
/**
 * 타입 정의 모듈
 */

export * from './agenda.js';
export * from './voting.js';
export * from './consensus.js';
export * from './state-machine.js';
```

### 9. src/Board.ts (통합 클래스)

```typescript
import { EventBus } from '@obora-kit/blackboard';
import { AgendaManager } from './agenda/index.js';
import { VotingManager } from './voting/index.js';
import { ConsensusEngine } from './consensus/index.js';
import { BoardStateMachine } from './state-machine/index.js';
import type {
  BoardState,
  BoardEvent,
  BoardContext,
  Agenda,
  AgendaCreateOptions,
  VotingSession,
  ConsensusResult
} from './types/index.js';

export interface BoardOptions {
  eventBus: EventBus;
  participants: string[];
  quorumPercentage?: number;
  defaultVotingMethod?: VotingMethod;
  stateTimeouts?: StateTimeouts;
}

export interface BoardSession {
  id: string;
  startedAt: Date;
  endedAt?: Date;
  agendas: Agenda[];
  results: ConsensusResult[];
}

/**
 * AI 이사회 통합 클래스
 *
 * AgendaManager, VotingManager, ConsensusEngine, BoardStateMachine을
 * 통합하여 이사회 회의를 관리합니다.
 */
export class Board {
  public readonly agendaManager: AgendaManager;
  public readonly votingManager: VotingManager;
  public readonly consensusEngine: ConsensusEngine;
  public readonly stateMachine: BoardStateMachine;

  private eventBus: EventBus;
  private participants: Set<string>;
  private currentSession?: BoardSession;

  constructor(options: BoardOptions) {
    this.eventBus = options.eventBus;
    this.participants = new Set(options.participants);

    this.agendaManager = new AgendaManager(this.eventBus);
    this.votingManager = new VotingManager(this.eventBus, this.agendaManager);
    this.consensusEngine = new ConsensusEngine({
      eventBus: this.eventBus,
      votingManager: this.votingManager
    });
    this.stateMachine = new BoardStateMachine({
      eventBus: this.eventBus,
      agendaManager: this.agendaManager,
      votingManager: this.votingManager,
      consensusEngine: this.consensusEngine,
      defaultTimeouts: options.stateTimeouts
    });
  }

  // === 세션 관리 ===
  start(): void {
    this.currentSession = {
      id: generateSessionId(),
      startedAt: new Date(),
      agendas: [],
      results: []
    };
    this.stateMachine.startSession([...this.participants]);
  }

  end(): BoardSession {
    if (!this.currentSession) {
      throw new Error('NO_ACTIVE_SESSION');
    }
    this.currentSession.endedAt = new Date();
    this.stateMachine.endSession();
    return this.currentSession;
  }

  // === 안건 관리 ===
  submitAgenda(options: AgendaCreateOptions): Agenda {
    const agenda = this.agendaManager.create(options);
    this.currentSession?.agendas.push(agenda);
    return agenda;
  }

  // === 상태 조회 ===
  get state(): BoardState {
    return this.stateMachine.state;
  }

  get context(): Readonly<BoardContext> {
    return this.stateMachine.context;
  }

  // === 이벤트 전송 ===
  send(event: BoardEvent, payload?: unknown): BoardState {
    return this.stateMachine.send(event, payload);
  }

  // === 참가자 관리 ===
  addParticipant(id: string): void {
    this.participants.add(id);
    this.stateMachine.addParticipant(id);
  }

  removeParticipant(id: string): void {
    this.participants.delete(id);
    this.stateMachine.removeParticipant(id);
  }
}

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
```

### 10. README.md

```markdown
# @obora-kit/board

AI 이사회(Board of Directors) 시스템

## 설치

```bash
pnpm add @obora-kit/board
```

## 주요 기능

- **안건 관리 (AgendaManager)**: 안건 생성, 제출, 철회, 우선순위 관리
- **투표 시스템 (VotingManager)**: 다수결, 만장일치, 가중치 투표
- **합의 알고리즘 (ConsensusEngine)**: 조건부 합의, 에스컬레이션
- **상태 기계 (BoardStateMachine)**: 회의 흐름 관리

## 사용법

### 기본 사용법

```typescript
import { Board } from '@obora-kit/board';
import { EventBus } from '@obora-kit/blackboard';

const eventBus = new EventBus();

const board = new Board({
  eventBus,
  participants: ['ceo', 'cto', 'cfo'],
  quorumPercentage: 0.5
});

// 회의 시작
board.start();

// 안건 제출
const agenda = board.submitAgenda({
  title: '신규 서비스 개발 승인',
  description: '2026년 Q2 출시 예정인 신규 서비스에 대한 승인',
  proposer: 'ceo',
  priority: 'high',
  votingMethod: 'majority'
});

// 상태 전이
board.send('CONFIRM_AGENDA');  // 토론 시작
board.send('CALL_VOTE');       // 투표 시작
board.send('COMPLETE_VOTING'); // 투표 완료
board.send('ANNOUNCE_RESULT'); // 결과 발표

// 회의 종료
const session = board.end();
console.log(session.results);
```

### 개별 컴포넌트 사용

```typescript
import { AgendaManager, VotingManager } from '@obora-kit/board';

// 안건 관리만 사용
const agendaManager = new AgendaManager(eventBus);
const agenda = agendaManager.create({
  title: '안건 제목',
  description: '안건 설명',
  proposer: 'user-1'
});

// 투표 시스템만 사용
const votingManager = new VotingManager(eventBus, agendaManager);
const session = votingManager.createSession({
  agendaId: agenda.id,
  method: 'majority',
  eligibleVoters: ['a', 'b', 'c']
});
```

## API 문서

상세 API 문서는 [여기](../../docs/api/board.md)를 참조하세요.

## 라이선스

MIT
```

### 11. 완료 조건

- [ ] packages/board/ 디렉토리 생성
- [ ] package.json 생성 완료
- [ ] tsconfig.json 생성 완료
- [ ] tsconfig.build.json 생성 완료
- [ ] vitest.config.ts 생성 완료
- [ ] tsup.config.ts 생성 완료
- [ ] src/index.ts 생성 완료
- [ ] src/types/index.ts 생성 완료
- [ ] src/Board.ts 생성 완료
- [ ] README.md 생성 완료
- [ ] pnpm install 성공
- [ ] pnpm build 성공
- [ ] TypeScript 타입 체크 통과

### 12. 의존성

- @obora-kit/core 패키지
- 루트 tsconfig.base.json

### 13. 참고 문서

- [패키지 구조](../../architecture/blackboard-actor-design.md#73-패키지-구조)
- [Phase 4: Board System](../../architecture/blackboard-actor-design.md#64-phase-4-board-system-week-7-8)
