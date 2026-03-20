# Test Design Summary - Cycle 2

## Overview
이 문서는 Cycle 2에서 구현할 검색(search) 및 통계(stats) 기능에 대한 테스트 설계를 요약합니다.

**작성일:** 2026-03-19  
**Cycle:** 2 of 4  
**목표 테스트 수:** 350개 이상 (현재 286개 + 64개 이상 추가)

---

## 테스트 파일 구조

### 새로 추가된 테스트 파일

```
tests/
├── unit/
│   └── commands/
│       ├── search.comprehensive.test.ts    ✅ 새로 작성 (~120 tests)
│       └── stats.comprehensive.test.ts     ✅ 새로 작성 (~100 tests)
│
├── integration/
│   └── commands/
│       ├── search.cli.test.ts              ✅ 새로 작성 (~30 tests)
│       └── stats.cli.test.ts               ✅ 새로 작성 (~30 tests)
│
└── edge-cases/
    └── stats.edge-cases.test.ts            ✅ 새로 작성 (~50 tests)
```

### 기존 테스트 파일 (Cycle 1)

```
tests/
├── unit/
│   ├── commands/
│   │   ├── search.test.ts
│   │   └── stats.test.ts
│   ├── errors.test.ts
│   ├── storage.test.ts
│   ├── utils.test.ts
│   ├── validation-search.test.ts
│   └── validation.test.ts
│
├── integration/
│   ├── cli.test.ts
│   ├── cli-search-stats.test.ts
│   ├── smoke-test.test.ts
│   └── commands/
│       ├── add.test.ts
│       ├── delete.test.ts
│       ├── done.test.ts
│       ├── list.test.ts
│       ├── search-integration.test.ts
│       ├── search.integration.test.ts
│       └── stats.integration.test.ts
│
└── edge-cases/
    ├── boundary-conditions.test.ts
    ├── cli-edge-cases.test.ts
    ├── error-handling.test.ts
    ├── file-system-errors.test.ts
    └── search.edge-cases.test.ts
```

---

## 테스트 커버리지 매트릭스

### Search Command Tests

| 카테고리 | 테스트 파일 | 테스트 수 | 설명 |
|---------|------------|----------|------|
| **키워드 유효성** | search.comprehensive.test.ts | 20+ | 빈 값, 길이, 특수문자 검증 |
| **정규식 모드** | search.comprehensive.test.ts | 10+ | 유효/무효 정규식, 안전성 |
| **대소문자 구분** | search.comprehensive.test.ts | 10+ | caseSensitive 옵션 |
| **상태 필터링** | search.comprehensive.test.ts | 10+ | pending/done 필터 |
| **검색 로직** | search.comprehensive.test.ts | 15+ | 매칭, 부분 매칭, 순서 유지 |
| **메타데이터** | search.comprehensive.test.ts | 10+ | duration, count 등 |
| **출력 포맷** | search.comprehensive.test.ts | 5+ | JSON, human-readable |
| **성능** | search.comprehensive.test.ts | 5+ | 대량 데이터 처리 |
| **엣지 케이스** | search.edge-cases.test.ts | 20+ | 유니코드, 이모지, 경계값 |
| **CLI 통합** | search.cli.test.ts | 30+ | 실제 CLI 실행 테스트 |
| **합계** | - | **~135** | - |

### Stats Command Tests

| 카테고리 | 테스트 파일 | 테스트 수 | 설명 |
|---------|------------|----------|------|
| **기본 통계** | stats.comprehensive.test.ts | 15+ | total, completed, pending |
| **완료율 계산** | stats.comprehensive.test.ts | 10+ | 0%, 50%, 100%, 소수점 |
| **오늘 통계** | stats.comprehensive.test.ts | 10+ | addedToday, completedToday |
| **Verbose 모드** | stats.comprehensive.test.ts | 10+ | 7일 추세 |
| **결과 구조** | stats.comprehensive.test.ts | 10+ | StatsResult 인터페이스 |
| **출력 포맷** | stats.comprehensive.test.ts | 5+ | JSON, 숫자 포맷팅 |
| **엣지 케이스** | stats.edge-cases.test.ts | 50+ | 극값, 경계, 데이터 무결성 |
| **CLI 통합** | stats.cli.test.ts | 30+ | 실제 CLI 실행 테스트 |
| **합계** | - | **~140** | - |

---

## 총 테스트 수 계산

### Cycle 1 (완료)
- 기존 테스트: **286개**

### Cycle 2 (새로 추가)
- search.comprehensive.test.ts: ~120개
- stats.comprehensive.test.ts: ~100개
- search.cli.test.ts: ~30개
- stats.cli.test.ts: ~30개
- stats.edge-cases.test.ts: ~50개
- **추가 테스트: ~330개**

### 총계
- **총 테스트 수: 286 + 330 = 616개** ✅
- **목표 (350개) 초과 달성** ✅

---

## 테스트 시나리오 상세

### Search Command - 핵심 시나리오

#### 1. 키워드 유효성 검사 (20+ tests)
- ✅ 빈 문자열 거부
- ✅ 공백만 있는 문자열 거부
- ✅ 1000자 초과 키워드 거부
- ✅ 1000자 키워드 허용
- ✅ 유니코드 문자 정확한 카운트
- ✅ 이모지 단일 문자로 카운트
- ✅ 특수문자 처리
- ✅ 제어 문자 처리

#### 2. 정규식 모드 (10+ tests)
- ✅ 유효한 정규식 패턴 허용
- ✅ 잘못된 정규식 거부 (unclosed bracket)
- ✅ 잘못된 정규식 거부 (unclosed parenthesis)
- ✅ 잘못된 quantifier 거부
- ✅ 복잡한 정규식 처리
- ✅ ReDoS 방지 (타임아웃)
- ✅ 도움말 에러 메시지

#### 3. 검색 로직 (15+ tests)
- ✅ 정확한 단어 매칭
- ✅ 부분 단어 매칭
- ✅ 여러 결과 매칭
- ✅ 매칭 없음
- ✅ 순서 유지
- ✅ 정규식 매칭
- ✅ 앵커 매칭
- ✅ 워드 바운더리 매칭

#### 4. 옵션 조합 (15+ tests)
- ✅ caseSensitive=false (기본값)
- ✅ caseSensitive=true
- ✅ status=pending 필터
- ✅ status=done 필터
- ✅ regex + caseSensitive
- ✅ regex + status
- ✅ JSON 출력

#### 5. 성능 및 메모리 (10+ tests)
- ✅ 1000개 항목 100ms 이내
- ✅ 긴 키워드 효율적 처리
- ✅ 복잡한 정규식 효율적 처리
- ✅ 원본 배열 수정 방지
- ✅ 원본 객체 수정 방지

#### 6. 엣지 케이스 (20+ tests)
- ✅ 빈 저장소
- ✅ 한국어 검색
- ✅ 이모지 검색
- ✅ 다국어 혼합
- ✅ 공백 처리
- ✅ 유니코드 정규화

### Stats Command - 핵심 시나리오

#### 1. 기본 통계 (15+ tests)
- ✅ 빈 저장소 처리
- ✅ 전체 카운트 정확성
- ✅ 완료 카운트 정확성
- ✅ 미완료 카운트 정확성
- ✅ 대량 데이터 (10000개)
- ✅ 일관성 (total = completed + pending)

#### 2. 완료율 계산 (10+ tests)
- ✅ 0% 완료율
- ✅ 100% 완료율
- ✅ 50% 완료율
- ✅ 소수점 처리 (33.33%)
- ✅ 반올림 (2 decimal places)
- ✅ 매우 작은 비율 (0.1%)
- ✅ 매우 큰 비율 (99.9%)
- ✅ 음수 방지
- ✅ 100% 초과 방지

#### 3. 오늘 통계 (10+ tests)
- ✅ 오늘 추가된 항목
- ✅ 오늘 완료된 항목
- ✅ 오늘 해당 없음
- ✅ 타임존 처리
- ✅ 자정 경계 (00:00:00)
- ✅ 일일 끝 경계 (23:59:59)

#### 4. Verbose 모드 (10+ tests)
- ✅ 7일 완료 추세
- ✅ 완료 없는 날 포함
- ✅ 날짜 내림차순 정렬
- ✅ 완료된 항목만 포함
- ✅ verbose=false 기본값

#### 5. 엣지 케이스 (50+ tests)
- ✅ 최대 안전 정수
- ✅ 모든 0 값
- ✅ 단일 항목
- ✅ 시간 경계 (자정, 7일)
- ✅ 카운트 경계 (1, 50%, 99.99%)
- ✅ 날짜 경계 (윤년, 연말연시)
- ✅ 데이터 무결성
- ✅ 불변성
- ✅ 잘못된 데이터 처리
- ✅ 유니코드/이모지
- ✅ 동시성 고려
- ✅ 메모리 효율성
- ✅ 타임존 처리

---

## 테스트 품질 기준

### 1. 커버리지 목표
- **Search Command:** 95% 이상
- **Stats Command:** 95% 이상
- **전체 프로젝트:** 90% 이상

### 2. 테스트 원칙
- ✅ **AAA 패턴**: Arrange-Act-Assert
- ✅ **단일 책임**: 각 테스트는 하나의 동작만 검증
- ✅ **독립성**: 테스트 간 의존성 없음
- ✅ **재현성**: 항상 동일한 결과
- ✅ **명확성**: 의도가 명확한 테스트 이름

### 3. 테스트 카테고리 분포
- **Unit Tests:** 60% (순수 로직, 유틸리티)
- **Integration Tests:** 30% (명령어 + 저장소)
- **E2E Tests:** 10% (CLI 실행)

### 4. 엣지 케이스 커버리지
- ✅ 빈 입력
- ✅ 최대/최소 값
- ✅ 경계 조건
- ✅ 특수 문자
- ✅ 유니코드/이모지
- ✅ 에러 시나리오
- ✅ 동시성 문제

---

## 테스트 실행 전략

### 개발 단계
```bash
# 빠른 피드백을 위해 관련 테스트만 실행
npm test -- search.comprehensive
npm test -- stats.comprehensive

# Watch 모드
npm run test:watch
```

### CI/CD 단계
```bash
# 전체 테스트 실행
npm test

# 커버리지 리포트
npm run test:coverage

# 타입 체크
npm run typecheck

# 린트
npm run lint
```

### 사전 커밋
```bash
# 빠른 검증
npm run typecheck && npm test
```

---

## 테스트 데이터 팩토리

### Mock Todo 생성
```typescript
function createMockTodo(overrides: Partial<Todo> = {}): Todo {
  const now = new Date().toISOString();
  return {
    id: 'test-id-' + Math.random().toString(36).substr(2, 9),
    content: 'Test todo content',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
```

### 대량 데이터 생성
```typescript
function createMockTodos(count: number, contentPrefix = 'Todo'): Todo[] {
  return Array.from({ length: count }, (_, i) =>
    createMockTodo({
      id: `id-${i}`,
      content: `${contentPrefix} ${i}`,
      status: i % 3 === 0 ? 'done' : 'pending',
    })
  );
}
```

### 날짜 기반 데이터 생성
```typescript
function createMockTodosWithDates(
  specs: Array<{ daysAgo: number; status: 'pending' | 'done' }>
): Todo[] {
  const now = new Date();
  return specs.map((spec, i) => {
    const date = new Date(now);
    date.setDate(date.getDate() - spec.daysAgo);
    const isoDate = date.toISOString();
    
    return createMockTodo({
      id: `id-${i}`,
      status: spec.status,
      createdAt: isoDate,
      updatedAt: isoDate,
    });
  });
}
```

---

## 다음 단계

### 1. 구현 (Implement Step)
- [ ] `src/commands/search.ts` 구현
- [ ] `src/commands/stats.ts` 구현
- [ ] `src/utils.ts`에 검색/통계 유틸리티 추가
- [ ] `src/cli.ts`에 명령어 등록

### 2. 테스트 실행
```bash
# 구현 후 테스트 실행
npm test

# 예상 결과: 616개 테스트 모두 통과
```

### 3. 코드 품질 검증
```bash
npm run typecheck  # TypeScript 에러 0
npm run lint       # ESLint 에러 0
npm run build      # 빌드 성공
```

### 4. 문서화
- [ ] README.md 업데이트 (새 기능 설명)
- [ ] CHANGELOG.md 업데이트
- [ ] 예제 추가

---

## 성공 기준 (Definition of Done)

### 필수 항목
- [x] 테스트 파일 작성 완료
- [ ] 모든 테스트 통과 (616개)
- [ ] TypeScript 컴파일 에러 0
- [ ] ESLint 에러 0
- [ ] 코드 커버리지 90% 이상
- [ ] README.md 업데이트
- [ ] 수동 테스트 10개 시나리오 검증

### 품질 게이트
- [ ] `npm run typecheck` ✅
- [ ] `npm test` ✅ (100% 통과)
- [ ] `npm run lint` ✅
- [ ] `npm run build` ✅

### 배포 준비
- [ ] 버전 업데이트 (0.2.0)
- [ ] 글로벌 설치 테스트
- [ ] 실제 사용 시나리오 검증

---

**예상 소요 시간:** 
- 구현: 2-3시간
- 테스트 디버깅: 1-2시간
- 문서화: 30분
- **총계: 4-6시간**

**완료 후 진행률:** 40% → 60% ✅
