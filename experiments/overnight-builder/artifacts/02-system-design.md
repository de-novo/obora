# System Design: todocli

## 1. 아키텍처 개요

### 1.1 시스템 구조

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI Layer                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    cli.ts                             │   │
│  │  - Command definitions (Commander.js)                │   │
│  │  - Output formatting (chalk, cli-table3)             │   │
│  │  - Error handling & exit codes                       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     Service Layer                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                todo.service.ts                        │   │
│  │  - Business logic (add, list, done, undo, etc.)      │   │
│  │  - Validation orchestration                          │   │
│  │  - Data transformation                               │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     Storage Layer                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                  storage.ts                           │   │
│  │  - File I/O (atomic writes)                          │   │
│  │  - File locking (concurrent access)                  │   │
│  │  - Schema validation                                 │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  File System (JSON)                          │
│  ~/.todocli/todos.json (data)                               │
│  ~/.todocli/todos.json.lock (lock file)                     │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 레이어 책임

| Layer | 책임 | 의존성 |
|-------|------|--------|
| CLI | 사용자 입력 파싱, 출력 포맷팅, 에러 메시지 표시 | Service |
| Service | 비즈니스 로직, 데이터 검증, 상태 관리 | Storage, Models |
| Storage | 영속성, 동시성 제어, 스키마 검증 | File System |

### 1.3 의존성 흐름

- **단방향 의존성**: CLI → Service → Storage
- **의존성 주입**: Service는 IStorage 인터페이스에 의존 (테스트 용이성)
- **느슨한 결합**: 각 레이어는 인터페이스를 통해 통신

---

## 2. 데이터 모델

### 2.1 Todo 엔티티

```typescript
interface Todo {
  id: string;           // UUID v4 (36 chars)
  title: string;        // 1-200 characters
  completed: boolean;   // 완료 상태
  createdAt: string;    // ISO 8601 timestamp
  completedAt?: string; // ISO 8601 timestamp (optional)
}
```

### 2.2 저장소 스키마

```typescript
interface TodoList {
  version: string;      // "1.0.0" (마이그레이션 지원)
  todos: Todo[];
}
```

### 2.3 ID 전략

- **생성**: UUID v4 (crypto 기반)
- **표시**: 앞 8자리 단축 ID (사용자 친화적)
- **검색**: 단축 ID prefix 매칭 (충돌 시 에러)

---

## 3. 인터페이스 정의

### 3.1 IStorage 인터페이스

```typescript
interface IStorage {
  load(): Promise<TodoList>;
  save(data: TodoList): Promise<void>;
  exists(): Promise<boolean>;
  initialize(): Promise<void>;
}
```

### 3.2 ITodoService 인터페이스

```typescript
interface ITodoService {
  add(title: string): Promise<Todo>;
  list(options: ListOptions): Promise<Todo[]>;
  done(id: string): Promise<Todo>;
  undo(id: string): Promise<Todo>;
  remove(id: string): Promise<void>;
  clear(): Promise<number>;
}

interface ListOptions {
  all: boolean;
}
```

### 3.3 CLI 출력 인터페이스

```typescript
interface OutputWriter {
  log(message: string): void;
  error(message: string): void;
}
```

---

## 4. 에러 전략

### 4.1 에러 계층 구조

```
TodoCLIError (base)
├── ValidationError (입력 검증 실패)
├── TodoNotFoundError (ID로 찾을 수 없음)
├── FileNotFoundError (파일 없음)
├── PermissionError (권한 없음)
├── CorruptedDataError (데이터 손상)
└── LockTimeoutError (파일 잠금 타임아웃)
```

### 4.2 에러 코드 및 종료 코드

| Error Class | Code | Exit Code | 사용자 메시지 |
|-------------|------|-----------|--------------|
| ValidationError | EVALIDATION | 1 | 입력값이 올바르지 않습니다 |
| TodoNotFoundError | ENOTFOUND | 2 | 할 일을 찾을 수 없습니다 |
| PermissionError | EPERM | 3 | 권한이 없습니다 |
| CorruptedDataError | ECORRUPTED | 3 | 데이터 파일이 손상되었습니다 |
| LockTimeoutError | ELOCKTIMEOUT | 3 | 파일 잠금 시간 초과 |
| UnknownError | - | 99 | 알 수 없는 오류 |

### 4.3 에러 처리 원칙

1. **모든 에러는 TodoCLIError를 상속** (일관된 처리)
2. **사용자 친화적 메시지** (기술적 세부사항 숨김)
3. **적절한 종료 코드** (셸 스크립트 연동)
4. **원자적 연산** (실패 시 상태 변경 없음)

---

## 5. 동시성 제어 전략

### 5.1 파일 잠금 메커니즘

```
┌─────────────┐
│  Process A  │─────┐
└─────────────┘     │
                    ▼
            ┌──────────────┐
            │ Lock File    │ (todos.json.lock)
            │ - PID 저장   │
            │ - 5초 타임아웃│
            └──────────────┘
                    ▲
┌─────────────┐     │
│  Process B  │─────┘ (대기 또는 타임아웃)
└─────────────┘
```

### 5.2 잠금 알고리즘

```
1. lock 파일 생성 시도 (O_EXCL)
2. 성공 → 작업 수행
3. 실패 → lock 파일 mtime 확인
   a. 5초 이상 오래됨 → stale lock 제거 후 재시도
   b. 5초 미만 → 100ms 대기 후 재시도
4. 5초 타임아웃 → LockTimeoutError
```

### 5.3 원자적 쓰기

```
1. 데이터를 .tmp 파일에 작성
2. fs.rename()으로 원자적 이동
3. 실패 시 .tmp 파일 정리
```

---

## 6. 검증 전략

### 6.1 입력 검증

| 필드 | 규칙 | 에러 |
|------|------|------|
| title | 1-200자, 공백 불가, 제어문자 제거 | ValidationError |
| id | UUID v4 형식 또는 8자 단축 ID | ValidationError |

### 6.2 데이터 검증 (로드 시)

```typescript
// 스키마 검증
- version: "1.0.0"
- todos: Array
- 각 todo: id, title, completed, createdAt 필수
- completedAt: completed=true일 때만 존재 가능
```

### 6.3 sanitizeTitle()

```typescript
1. trim() - 앞뒤 공백 제거
2. 제어 문자 제거 (\n, \t, \r 등)
3. 길이 검증 (1-200자)
```

---

## 7. 파일 시스템 레이아웃

```
~/.todocli/
├── todos.json       # 데이터 파일 (mode: 0600)
└── todos.json.lock  # 잠금 파일 (임시)
```

### 7.1 데이터 파일 형식

```json
{
  "version": "1.0.0",
  "todos": [
    {
      "id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      "title": "할 일 예시",
      "completed": false,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

## 8. 기술 스택 상세

### 8.1 Dependencies

| Package | Version | 용도 |
|---------|---------|------|
| commander | ^11.1.0 | CLI 프레임워크 |
| chalk | ^5.3.0 | 터미널 색상 |
| cli-table3 | ^0.6.3 | 테이블 출력 |
| uuid | ^9.0.1 | UUID 생성 |
| zod | ^3.22.4 | 스키마 검증 (선택적 사용) |

### 8.2 Dev Dependencies

| Package | Version | 용도 |
|---------|---------|------|
| typescript | ^5.3.3 | 타입 시스템 |
| vitest | ^1.2.0 | 테스트 프레임워크 |
| eslint | ^8.56.0 | 린팅 |
| @vitest/coverage-v8 | ^1.2.0 | 커버리지 |

### 8.3 TypeScript 설정

- **Target**: ES2022
- **Module**: ESNext
- **Strict mode**: 활성화
- **추가 검사**: noUnusedLocals, noUnusedParameters, noImplicitReturns

---

## 9. 테스트 전략

### 9.1 테스트 피라미드

```
         ┌───────────┐
         │  E2E Test │ (10%)
         │  CLI 전체  │
         └───────────┘
      ┌───────────────────┐
      │ Integration Test  │ (20%)
      │ Service + Storage │
      └───────────────────┘
   ┌───────────────────────────┐
   │      Unit Test            │ (70%)
   │  Service, Utils, Models   │
   └───────────────────────────┘
```

### 9.2 테스트 분류

#### Unit Tests (tests/unit/)
- **todo.service.test.ts**: 서비스 로직 (Mock Storage 사용)
- **models.test.ts**: 데이터 모델 검증
- **utils.test.ts**: 유틸리티 함수
- **validator.test.ts**: 입력 검증
- **uuid.test.ts**: UUID 생성/단축
- **errors.test.ts**: 에러 클래스

#### Integration Tests (tests/integration/)
- **storage.test.ts**: FileStorage 실제 파일 I/O
- **service-storage.test.ts**: Service + Storage 통합
- **concurrency.test.ts**: 동시성 시나리오

#### E2E Tests (tests/e2e/)
- **cli.test.ts**: CLI 명령어 전체 흐름
- **edge-cases.test.ts**: 엣지 케이스
- **large-dataset.test.ts**: 대량 데이터 성능
- **output-format.test.ts**: 출력 형식 검증

### 9.3 테스트 커버리지 목표

| 레이어 | 목표 커버리지 |
|--------|--------------|
| Service | 100% |
| Storage | 95% |
| CLI | 90% |
| Utils | 100% |
| **전체** | **≥80%** |

### 9.4 테스트 시나리오

#### 정상 시나리오 (Happy Path)
- [x] 할 일 추가/조회/수정/삭제
- [x] 완료/취소 처리
- [x] 완료된 항목 일괄 삭제
- [x] 빈 목록 처리

#### 에러 시나리오
- [x] 빈 제목
- [x] 제목 길이 초과
- [x] 존재하지 않는 ID
- [x] 잘못된 UUID 형식
- [x] 손상된 데이터 파일
- [ ] 권한 없음 (skip - 시스템 의존)

#### 엣지 케이스
- [x] 특수 문자, 이모지, 한글
- [x] 중복 제목 허용
- [x] 동시성 (파일 잠금)
- [x] 대량 데이터 (1000개)
- [x] 멱등성 (done, undo, clear)

---

## 10. 성능 고려사항

### 10.1 데이터 크기 제한

- **현재**: 제한 없음 (메모리에 전체 로드)
- **권장**: 10,000개 이하
- **향후**: 스트리밍 읽기 또는 페이지네이션 고려

### 10.2 파일 I/O 최적화

- **원자적 쓰기**: temp 파일 → rename
- **잠금 타임아웃**: 5초 (설정 가능)
- **잠금 재시도**: 100ms 간격

### 10.3 메모리 사용

- **전체 로드**: 현재 방식 (단순함)
- **복사 방지**: 읽기 전용 연산은 참조 반환

---

## 11. 보안 고려사항

### 11.1 파일 권한

- **데이터 파일**: 0600 (소유자만 읽기/쓰기)
- **잠금 파일**: 0600
- **임시 파일**: 0600

### 11.2 입력 살균

- **제어 문자 제거**: \n, \t, \r 등
- **XSS 방지**: 출력 시 이스케이프 (chalk가 처리)
- **경로 순회 방지**: 데이터 디렉터리 고정

### 11.3 민감 정보

- **저장하지 않음**: 할 일 제목만 저장
- **암호화 없음**: 로컬 파일 (사용자 책임)

---

## 12. 확장성 고려사항

### 12.1 향후 기능 (Cycle 2+)

- **태그 시스템**: Todo에 tags: string[] 추가
- **우선순위**: Todo에 priority: 'low' | 'medium' | 'high' 추가
- **검색**: 제목으로 검색 기능
- **마감일**: Todo에 dueDate?: string 추가

### 12.2 데이터 마이그레이션

```typescript
// version 필드로 마이그레이션 지원
const MIGRATIONS = {
  '1.0.0': (data: any) => data, // 현재 버전
  // '2.0.0': (data) => migrateToV2(data),
};
```

### 12.3 플러그인 시스템 (장기)

- **저장소 백엔드**: IStorage 인터페이스로 교체 가능
- **출력 포맷**: OutputWriter 인터페이스로 확장

---

## 13. 모니터링 및 로깅

### 13.1 현재 상태

- **로깅**: 없음 (사용자 출력만)
- **에러 추적**: 콘솔 출력

### 13.2 향후 개선 (선택)

- **디버그 모드**: `--verbose` 플래그
- **로그 파일**: `~/.todocli/debug.log`
- **크래시 리포트**: 에러 발생 시 상세 정보

---

## 14. 배포 및 설치

### 14.1 package.json 구성

```json
{
  "name": "todocli",
  "version": "0.1.0",
  "bin": {
    "todocli": "./dist/index.js"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

### 14.2 설치 방법

```bash
# 로컬 개발
npm install
npm run build
npm link

# npm 배포 (향후)
npm install -g todocli
```

### 14.3 실행 요구사항

- **Node.js**: 18.0.0 이상
- **OS**: macOS, Linux, Windows
- **권한**: 홈 디렉터리 쓰기 권한

---

## 15. 문서화 계획

### 15.1 README.md 구성

1. **개요**: 프로젝트 소개
2. **설치**: npm install 방법
3. **사용법**: 모든 명령어 예시
4. **데이터 파일**: 위치 및 형식
5. **문제 해결**: 일반적인 문제 해결
6. **기여**: 개발 환경 설정

### 15.2 코드 문서화

- **JSDoc**: public 인터페이스
- **인라인 주석**: 복잡한 로직
- **타입 정의**: 모든 public 타입

---

## 16. 체크리스트

### 16.1 Cycle 1 완료 기준

- [x] 시스템 설계 문서 작성
- [x] 핵심 인터페이스 정의
- [x] 에러 전략 수립
- [x] 테스트 전략 수립
- [x] Unit 테스트 작성
- [x] Integration 테스트 작성
- [x] E2E 테스트 작성
- [ ] 테스트 커버리지 ≥ 80% 달성
- [ ] README.md 작성

### 16.2 다음 단계

1. **구현**: 설계에 맞춰 코드 작성
2. **테스트 실행**: 모든 테스트 통과 확인
3. **커버리지 측정**: 80% 이상 달성
4. **린트 실행**: 에러 0개
5. **문서화**: README 완성

---

**작성일**: 2026-03-20
**버전**: 1.0.0
**작성자**: Senior Architect & TDD Expert
