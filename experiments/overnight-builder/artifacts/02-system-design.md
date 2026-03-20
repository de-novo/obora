# System Design: Todo CLI

작성일: 2026-03-20
Cycle: 1

---

## 1. 아키텍처 개요

### 1.1 계층 구조

```
┌─────────────────────────────────────────┐
│              CLI Layer                   │
│  (commander.js, chalk, index.ts)        │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│           Command Layer                  │
│  (AddCommand, ListCommand, etc.)        │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│           Service Layer                  │
│  (TodoService - business logic)         │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│          Storage Layer                   │
│  (JsonStore - persistence)              │
└─────────────────────────────────────────┘
```

### 1.2 의존성 흐름
- CLI → Commands → Service → Storage
- 모든 의존성은 단방향 (하향식)
- 상위 계층은 하위 계층의 인터페이스에만 의존

---

## 2. 디렉터리 구조

```
workspace/
├── package.json              # 프로젝트 설정 및 스크립트
├── tsconfig.json             # TypeScript 설정 (strict mode)
├── vitest.config.ts          # 테스트 설정
├── .eslintrc.json            # 린트 설정
├── src/
│   ├── index.ts              # 진입점 (CLI 부트스트랩)
│   ├── cli.ts                # CLI 명령어 정의 (commander)
│   ├── commands/             # 명령어 구현
│   │   ├── add.ts            # AddCommand
│   │   ├── list.ts           # ListCommand
│   │   ├── complete.ts       # CompleteCommand
│   │   └── delete.ts         # DeleteCommand
│   ├── services/             # 비즈니스 로직
│   │   └── todo-service.ts   # TodoService
│   ├── storage/              # 영속성 계층
│   │   └── json-store.ts     # JsonStore
│   ├── models/               # 도메인 모델 팩토리
│   │   └── todo.ts           # createTodo()
│   ├── types/                # 타입 정의
│   │   └── index.ts          # Todo, TodoData 인터페이스
│   └── utils/                # 유틸리티
│       ├── errors.ts         # 커스텀 에러 클래스
│       └── validator.ts      # 입력 검증
├── test/
│   ├── setup.ts              # 테스트 환경 설정
│   ├── commands/             # 명령어 테스트
│   ├── services/             # 서비스 테스트
│   ├── storage/              # 스토리지 테스트
│   ├── models/               # 모델 테스트
│   └── integration/          # 통합 테스트
└── dist/                     # 컴파일된 JS (gitignore)
```

---

## 3. 핵심 인터페이스

### 3.1 Todo (도메인 모델)

```typescript
interface Todo {
  id: string;              // UUID v4
  content: string;         // 1-1000자
  completed: boolean;      // 완료 여부
  createdAt: Date;         // 생성 시각
  updatedAt: Date;         // 수정 시각
}
```

### 3.2 TodoData (저장소 포맷)

```typescript
interface TodoData {
  version: string;         // 데이터 포맷 버전 ("1.0.0")
  todos: Todo[];           // 할 일 목록
}
```

### 3.3 IStorage (저장소 인터페이스)

```typescript
interface IStorage {
  load(): Promise<TodoData>;
  save(data: TodoData): Promise<void>;
  exists(): Promise<boolean>;
  initialize(): Promise<void>;
}
```

### 3.4 ITodoService (서비스 인터페이스)

```typescript
interface ITodoService {
  add(content: string): Promise<Todo>;
  list(options?: { all?: boolean }): Promise<Todo[]>;
  complete(id: string): Promise<Todo>;
  delete(id: string): Promise<void>;
}
```

### 3.5 CommandResult (명령어 실행 결과)

```typescript
interface CommandResult {
  success: boolean;
  message?: string;
  data?: unknown;
}
```

---

## 4. 에러 전략

### 4.1 에러 계층 구조

```
TodoCliError (base)
├── ValidationError     # 입력 검증 실패 (code: VALIDATION_ERROR)
├── StorageError        # 저장소 오류 (code: STORAGE_ERROR)
└── NotFoundError       # 리소스 없음 (code: NOT_FOUND)
```

### 4.2 에러 처리 규칙

| 계층 | 에러 처리 방식 |
|------|----------------|
| CLI | try-catch, process.exit(1) |
| Command | try-catch, CommandResult 반환 |
| Service | 에러 throw (비즈니스 예외) |
| Storage | StorageError로 래핑하여 throw |

### 4.3 사용자 메시지 규칙
- 모든 에러 메시지는 한국어
- 구체적인 원인과 해결 방법 제시
- 내부 구현 세부사항 노출 금지

---

## 5. 데이터 저장 전략

### 5.1 저장 위치
- 기본: `~/.todo-cli/todos.json`
- 환경변수: `TODO_CLI_DATA_DIR` (테스트용)

### 5.2 파일 포맷
```json
{
  "version": "1.0.0",
  "todos": [
    {
      "id": "uuid-v4",
      "content": "할 일 내용",
      "completed": false,
      "createdAt": "2026-03-20T10:00:00.000Z",
      "updatedAt": "2026-03-20T10:00:00.000Z"
    }
  ]
}
```

### 5.3 동시성 처리
- 현재: 파일 단위 읽기/쓰기 (단일 프로세스 가정)
- 향후: 파일 락 도입 가능 (필요 시)

---

## 6. 테스트 전략

### 6.1 테스트 피라미드

```
         ┌─────┐
         │ E2E │     (통합 테스트: CLI 전체 플로우)
         └─────┘
       ┌───────────┐
       │ Integration│  (서비스 + 저장소)
       └───────────┘
    ┌─────────────────┐
    │    Unit Tests   │   (순수 함수, 모델)
    └─────────────────┘
```

### 6.2 테스트 분류

| 카테고리 | 대상 | 파일 위치 |
|----------|------|-----------|
| 단위 | 모델, 유틸리티 | test/models/, test/utils/ |
| 단위 | 서비스 (격리) | test/services/ |
| 통합 | 저장소 | test/storage/ |
| 통합 | 명령어 | test/commands/ |
| E2E | CLI 전체 | test/integration/ |

### 6.3 테스트 커버리지 목표
- 전체: 80% 이상
- 핵심 비즈니스 로직: 90% 이상
- 명령어: 85% 이상

### 6.4 테스트 격리 전략
- 각 테스트마다 임시 디렉터리 생성 (mkdtemp)
- beforeEach에서 환경변수 설정
- afterEach에서 정리

---

## 7. 테스트 시나리오

### 7.1 정상 시나리오 (Happy Path)
- [x] 할 일 추가 및 조회
- [x] 할 일 완료 처리
- [x] 할 일 삭제
- [x] 전체 목록 조회 (--all)
- [x] 미완료 목록 조회 (기본)

### 7.2 에러 시나리오
- [x] 빈 내용 추가 시도
- [x] 1000자 초과 내용 추가
- [x] 존재하지 않는 ID 완료/삭제
- [x] 손상된 JSON 파일 읽기
- [x] 권한 없는 경로 저장

### 7.3 엣지 케이스
- [x] 공백만 있는 내용
- [x] 특수문자/이모지 포함 내용
- [x] 정확히 1000자 내용
- [x] 빈 목록 상태
- [x] 이미 완료된 항목 재완료
- [x] 유니코드 콘텐츠 처리

### 7.4 통합 시나리오
- [ ] CLI 명령어 전체 플로우
- [ ] 연속 작업 (추가→완료→삭제)
- [ ] 버전/도움말 출력

---

## 8. 기술 스택 상세

### 8.1 런타임 & 언어
- Node.js 18+ (ES2022, crypto.randomUUID 네이티브 지원)
- TypeScript 5.3+ (strict mode)

### 8.2 주요 의존성
| 패키지 | 용도 | 버전 |
|--------|------|------|
| commander | CLI 프레임워크 | ^12.0.0 |
| chalk | 터미널 색상 | ^5.3.0 |
| uuid | ID 생성 (예비) | ^9.0.0 |

### 8.3 개발 의존성
| 패키지 | 용도 | 버전 |
|--------|------|------|
| vitest | 테스트 프레임워크 | ^1.2.0 |
| @vitest/coverage-v8 | 커버리지 | ^1.2.0 |
| typescript | 컴파일러 | ^5.3.3 |
| eslint | 린터 | ^8.56.0 |

---

## 9. 빌드 & 실행

### 9.1 npm scripts
```json
{
  "build": "tsc",
  "typecheck": "tsc --noEmit",
  "lint": "eslint src test --ext .ts",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

### 9.2 CLI 명령어
```bash
todo add "내용"        # 할 일 추가
todo list             # 미완료 목록
todo list --all       # 전체 목록
todo complete <id>    # 완료 처리
todo delete <id>      # 삭제
todo --help           # 도움말
todo --version        # 버전 정보
```

---

## 10. 향후 확장 포인트

### 10.1 Cycle 2 예정
- 검색 기능 (`todo search <키워드>`)
- 태그 시스템
- 우선순위 지정

### 10.2 아키텍처 개선
- 저장소 인터페이스 추상화 (다른 백엔드 지원)
- 이벤트 시스템 (변경 알림)
- 플러그인 시스템

---

## 11. 결정 사항 기록

### 11.1 UUID vs 순차 ID
- **결정**: UUID v4 사용
- **이유**: 분산 환경 호환, 충돌 방지, 보안

### 11.2 JSON vs 데이터베이스
- **결정**: JSON 파일
- **이유**: 단순함, 무설치, 포터블

### 11.3 commander vs yargs
- **결정**: commander
- **이유**: 간결한 API, TypeScript 지원

### 11.4 vitest vs jest
- **결정**: vitest
- **이유**: 빠른 실행, ESM 네이티브, 간단한 설정
