# System Design: todo-cli

## 1. 아키텍처 개요

### 1.1 레이어 구조

```
┌─────────────────────────────────────────────────┐
│                  CLI Layer                       │
│  (cli.ts - Commander 스타일 파싱, 포맷팅)        │
├─────────────────────────────────────────────────┤
│               Service Layer                      │
│  (TodoService - 비즈니스 로직, 검증)             │
├─────────────────────────────────────────────────┤
│               Storage Layer                      │
│  (JsonStorage - 영속성, 잠금, 백업)              │
├─────────────────────────────────────────────────┤
│               Utility Layer                      │
│  (validator, id-generator, formatter)            │
└─────────────────────────────────────────────────┘
```

### 1.2 의존성 방향

- CLI → Service → Storage
- 모든 레이어 → Utility
- 역방향 의존성 없음 (Clean Architecture 원칙)

---

## 2. 핵심 인터페이스

### 2.1 Todo 엔티티

```typescript
interface Todo {
  id: string;           // 타임스탬프 기반 고유 ID (16자리)
  content: string;      // 할 일 내용 (1-500자)
  status: TodoStatus;   // 'pending' | 'done'
  createdAt: string;    // ISO 8601
  updatedAt: string;    // ISO 8601
}
```

### 2.2 저장소 스키마

```typescript
interface StorageSchema {
  version: number;           // 스키마 버전 (현재: 1)
  todos: Todo[];             // 할 일 목록
  metadata: StorageMetadata; // 메타데이터
}
```

### 2.3 서비스 인터페이스

```typescript
interface ITodoService {
  add(content: string): Promise<CommandResult>;
  list(options: ListOptions): Promise<CommandResult>;
  done(id: string): Promise<CommandResult>;
  remove(id: string): Promise<CommandResult>;
}
```

### 2.4 명령어 결과

```typescript
interface CommandResult {
  success: boolean;
  message: string;
  data?: Todo | Todo[];
  exitCode: 0 | 1 | 2 | 3;
}
```

---

## 3. 에러 전략

### 3.1 에러 분류 및 종료 코드

| 코드 | 의미 | 에러 타입 | 예시 |
|-----|------|----------|------|
| 0 | 성공 | - | 정상 완료 |
| 1 | 사용자 입력 오류 | ValidationError, NotFoundError | 빈 내용, 없는 ID |
| 2 | 저장소 오류 | StorageError, LockAcquisitionError | 권한 없음, 잠금 실패 |
| 3 | 데이터 손상 | DataCorruptionError | JSON 파싱 실패 |

### 3.2 에러 계층 구조

```
TodoError (base)
├── ValidationError (code 1)
├── NotFoundError (code 1)
├── StorageError (code 2)
│   └── LockAcquisitionError (code 2)
└── DataCorruptionError (code 3)
```

### 3.3 에러 복구 전략

1. **데이터 손상 감지 시**
   - 백업 파일(todos.json.bak)에서 복구 시도
   - 백업도 손상되면 사용자 알림 후 종료 (code 3)

2. **잠금 획득 실패 시**
   - 최대 10회 재시도 (50ms 간격)
   - 실패 시 사용자 알림 후 종료 (code 2)

3. **파일 권한 오류 시**
   - 명확한 에러 메시지 + 해결 방법 안내
   - 종료 코드 2

---

## 4. 저장소 신뢰성

### 4.1 Atomic Write

1. 기존 데이터를 백업 파일로 복사
2. 새 데이터를 메인 파일에 저장
3. 저장 성공 시 완료

### 4.2 파일 잠금 (Lock)

- 잠금 파일: `todos.json.lock`
- PID 기반 잠금 소유자 식별
- 재시도 메커니즘으로 동시성 제어

### 4.3 백업/복구

```
┌─────────────┐     save()     ┌─────────────┐
│ todos.json  │ ───────────────▶│ todos.json  │
│ (현재)      │                 │ .bak        │
└─────────────┘                 └─────────────┘
       ▲                               │
       │          restore()            │
       └───────────────────────────────┘
```

---

## 5. 테스트 전략

### 5.1 테스트 피라미드

```
        ┌─────────┐
        │   E2E   │  (CLI 통합 테스트)
        ├─────────┤
        │통합 테스트│  (Service + Storage)
        ├─────────┤
        │유닛 테스트│  (개별 함수/클래스)
        └─────────┘
```

### 5.2 테스트 커버리지 목표

- **유닛 테스트**: 핵심 로직 100%
- **통합 테스트**: 주요 시나리오 100%
- **E2E 테스트**: CLI 명령어 100%

### 5.3 테스트 카테고리

#### 5.3.1 정상 케이스 (Happy Path)

- [x] 할 일 추가 성공
- [x] 할 일 목록 조회 (미완료)
- [x] 할 일 목록 조회 (전체)
- [x] 할 일 완료 처리
- [x] 할 일 삭제

#### 5.3.2 에러 케이스

- [x] 빈 내용 추가 시도
- [x] 500자 초과 내용
- [x] 없는 ID로 완료/삭제
- [x] 잘못된 ID 형식
- [x] 권한 없는 디렉토리
- [x] 손상된 JSON 파일

#### 5.3.3 엣지 케이스

- [x] 빈 목록 조회
- [x] 이미 완료된 항목 완료 시도
- [x] 특수 문자 (이모지, 따옴표)
- [x] 한글/중국어/일본어 처리
- [x] 동시 실행 (잠금)
- [x] 동일 밀리초 ID 생성

---

## 6. 파일 구조

```
workspace/
├── src/
│   ├── index.ts              # 진입점
│   ├── cli.ts                # CLI 인터페이스
│   ├── storage.ts            # JSON 저장소
│   ├── types.ts              # 타입 정의
│   ├── errors.ts             # 에러 클래스
│   ├── services/
│   │   └── todo.service.ts   # 비즈니스 로직
│   └── utils/
│       ├── validator.ts      # 입력 검증
│       ├── id-generator.ts   # ID 생성
│       └── formatter.ts      # 출력 포맷팅
├── test/
│   ├── unit/                 # 유닛 테스트
│   │   ├── todo.service.test.ts
│   │   ├── storage.test.ts
│   │   ├── validator.test.ts
│   │   ├── formatter.test.ts
│   │   └── id-generator.test.ts
│   ├── integration/          # 통합 테스트
│   │   └── service-storage.test.ts
│   └── e2e/                  # E2E 테스트
│       └── cli.test.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 7. 기술 스택

### 7.1 핵심 의존성

| 패키지 | 용도 | 버전 |
|-------|------|------|
| TypeScript | 언어 | ^5.3.3 |
| Node.js | 런타임 | ≥20.0.0 |
| vitest | 테스트 | ^1.2.0 |

### 7.2 개발 의존성

| 패키지 | 용도 |
|-------|------|
| @types/node | 타입 정의 |
| eslint | 코드 품질 |
| ts-node | 개발 실행 |

### 7.3 외부 의존성 없음

- Commander, Chalk 등 사용하지 않음
- 순수 TypeScript/Node.js만으로 구현
- 번들 크기 최소화

---

## 8. 성능 고려사항

### 8.1 메모리

- 전체 데이터를 메모리에 로드
- 수천 개의 할 일까지 문제없음
- 대량 데이터는 추후 스트리밍 고려

### 8.2 I/O

- 각 명령어마다 1회 읽기/쓰기
- 잠금으로 동시성 제어
- Atomic write로 데이터 무결성 보장

### 8.3 ID 생성

- 타임스탬프 + 시퀀스로 고유성 보장
- 같은 밀리초에도 시퀀스 증가
- 정렬 가능한 ID 구조

---

## 9. 보안 고려사항

### 9.1 입력 검증

- 내용 길이 제한 (500자)
- ID 형식 검증 (숫자만)
- JSON injection 방지

### 9.2 파일 권한

- 사용자 홈 디렉토리 사용
- 파일 권한은 OS 기본값 따름
- 민감한 데이터 없음

---

## 10. 확장성

### 10.1 향후 기능

- 태그 시스템
- 우선순위
- 마감일
- 검색/필터링
- 다국어 지원

### 10.2 마이그레이션

- 스키마 버전 관리
- 자동 마이그레이션 지원
- 하위 호환성 유지

---

## 11. 모니터링 및 로깅

### 11.1 현재

- 에러 메시지 출력
- 종료 코드로 상태 표현

### 11.2 향후

- 상세 로깅 옵션 (--verbose)
- 사용 통계 (선택적)
- 에러 리포팅 (선택적)

---

## 12. 배포

### 12.1 npm 패키지

```json
{
  "name": "todo-cli",
  "bin": {
    "todo": "./dist/index.js"
  },
  "files": ["dist/**/*"]
}
```

### 12.2 설치

```bash
npm install -g todo-cli
# 또는
npx todo-cli
```

---

## 13. 완료 기준 (Definition of Done)

### 13.1 기능

- [x] add 명령어 구현
- [x] list 명령어 구현
- [x] done 명령어 구현
- [x] remove 명령어 구현
- [x] --help 옵션 구현

### 13.2 품질

- [x] TypeScript strict mode
- [x] 모든 에러 케이스 처리
- [x] 유닛 테스트 작성
- [x] 통합 테스트 작성
- [x] E2E 테스트 작성

### 13.3 문서

- [x] README.md
- [x] 코드 주석 (JSDoc)
- [x] 시스템 설계 문서

---

## 14. 리스크 및 대응

| 리스크 | 가능성 | 영향 | 대응 |
|-------|-------|------|------|
| 동시 실행 충돌 | 중 | 중 | 파일 잠금 + 재시도 |
| 데이터 손상 | 낮음 | 높음 | 백업 + 복구 |
| 권한 문제 | 낮음 | 중 | 명확한 에러 메시지 |
| 큰 데이터셋 | 낮음 | 낮음 | 추후 스트리밍 |

---

## 15. 다음 단계

1. **테스트 실행 및 검증**
   - 모든 테스트 통과 확인
   - 커버리지 측정

2. **빌드 및 실행 테스트**
   - npm run build 성공
   - CLI 명령어 동작 확인

3. **문서화 완료**
   - README.md 업데이트
   - 사용 예시 추가

4. **배포 준비**
   - npm publish 검토
   - 버전 관리
