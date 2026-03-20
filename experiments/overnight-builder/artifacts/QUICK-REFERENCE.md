# Quick Reference - Cycle 2 Implementation Guide

## 📋 작업 완료 상태

### ✅ 완료된 작업 (Design & Tests)
1. ✅ 시스템 설계 문서 (`artifacts/02-system-design.md`)
2. ✅ 타입 정의 (`src/types.ts` - SearchOptions, Stats 등)
3. ✅ 에러 코드 확장 (`src/errors.ts` - EMPTY_KEYWORD, INVALID_REGEX 등)
4. ✅ 유틸리티 함수 (`src/utils.ts` - 검색/통계 관련 함수)
5. ✅ 테스트 작성 (총 145개 새로 추가)
   - ✅ Unit tests: 85개
   - ✅ Integration tests: 30개
   - ✅ Edge cases: 30개

### ⏳ 다음 단계 (Implement)
1. ⏳ `src/commands/search.ts` 구현
2. ⏳ `src/commands/stats.ts` 구현
3. ⏳ `src/cli.ts` 업데이트
4. ⏳ 테스트 실행 및 검증

## 🎯 테스트 통계

- **기존 테스트:** 286개
- **새로 추가:** 145개
- **전체 합계:** 431개 ✅
- **목표 (350개):** 123% 달성 🎉

## 📁 핵심 파일

### 구현 필요
```
src/commands/search.ts  (새로 생성)
src/commands/stats.ts   (새로 생성)
src/cli.ts              (수정: search/stats 추가)
```

### 이미 완료
```
src/types.ts            ✅
src/errors.ts           ✅
src/utils.ts            ✅
tests/utils/test-helpers.ts                  ✅
tests/unit/commands/search.test.ts           ✅
tests/unit/commands/stats.test.ts            ✅
tests/unit/validation.test.ts                ✅
tests/integration/commands/search.integration.test.ts  ✅
tests/integration/commands/stats.integration.test.ts   ✅
tests/edge-cases/search.edge-cases.test.ts   ✅
```

## 🚀 구현 가이드

### 1. SearchCommand 구현
```typescript
// src/commands/search.ts
export class SearchCommand {
  constructor(private storage: IStorage) {}
  
  async execute(options: SearchOptions): Promise<CommandResult> {
    // 1. 키워드 검증
    validateSearchKeyword(options.keyword);
    
    // 2. 정규식 검증 (regex 모드인 경우)
    if (options.regex) {
      validateRegex(options.keyword);
    }
    
    // 3. 저장소에서 검색
    const startTime = Date.now();
    const todos = await this.storage.load();
    const results = this.searchTodos(todos, options);
    const duration = Date.now() - startTime;
    
    // 4. 결과 포맷팅
    return this.formatResult(results, options, duration, todos.length);
  }
  
  private searchTodos(todos: Todo[], options: SearchOptions): Todo[] {
    // 상태 필터링 + 키워드 검색 로직
  }
  
  private formatResult(...): CommandResult {
    // JSON 또는 사람이 읽기 쉬운 포맷
  }
}
```

### 2. StatsCommand 구현
```typescript
// src/commands/stats.ts
export class StatsCommand {
  constructor(private storage: IStorage) {}
  
  async execute(options: StatsOptions): Promise<CommandResult> {
    const todos = await this.storage.load();
    const stats = this.calculateStats(todos, options.verbose);
    
    if (options.json) {
      return { success: true, data: { stats, timestamp: getCurrentTimestamp() }, exitCode: 0 };
    }
    
    return { success: true, message: formatStats(stats, options.verbose), data: { stats, timestamp: getCurrentTimestamp() }, exitCode: 0 };
  }
  
  private calculateStats(todos: Todo[], verbose?: boolean): Stats {
    // 통계 계산 로직
  }
}
```

### 3. CLI 업데이트
```typescript
// src/cli.ts - 생성자에 추가
this.searchCommand = new SearchCommand(storage);
this.statsCommand = new StatsCommand(storage);

// src/cli.ts - run() 메서드에 추가
case 'search':
  return await this.handleSearch(commandArgs);
case 'stats':
  return await this.handleStats(commandArgs);

// src/cli.ts - 핸들러 메서드 추가
private async handleSearch(args: string[]): Promise<CommandResult> {
  // 인자 파싱 및 SearchCommand 실행
}

private async handleStats(args: string[]): Promise<CommandResult> {
  // 인자 파싱 및 StatsCommand 실행
}
```

## 🧪 테스트 실행 명령어

```bash
# 모든 테스트 실행
npm test

# 커버리지 리포트
npm run test:coverage

# 타입 체크
npm run typecheck

# 린트 체크
npm run lint

# 빌드
npm run build

# 개발 모드
npm run dev
```

## 📊 성능 목표

| 기능 | 목표 | 테스트 |
|------|------|--------|
| 검색 (1000개) | < 100ms | `should_searchLargeDataset_quickly` |
| 통계 (1000개) | < 100ms | `should_calculateStats_quicklyForLargeDataset` |
| 대용량 (10000개) | 처리 가능 | `should_handleVeryLargeNumbers` |

## ✅ 품질 체크리스트

### 구현 전
- [x] 시스템 설계 문서 작성
- [x] 타입 정의 완료
- [x] 테스트 작성 완료
- [x] TDD 원칙 준수

### 구현 후
- [ ] 모든 테스트 통과 (431/431)
- [ ] 타입 체크 통과 (0 errors)
- [ ] 린트 체크 통과 (0 warnings)
- [ ] 빌드 성공
- [ ] 커버리지 목표 달성
  - [ ] 문장 커버리지 ≥ 90%
  - [ ] 분기 커버리지 ≥ 85%
  - [ ] 함수 커버리지 ≥ 95%

## 🎨 출력 예시

### 검색 결과
```
'buy' 검색 결과: 2개 찾음
──────────────────────────────────────────────────────────────────────
✓ 550e8400  Buy groceries
○ 7c9e6679  Buy milk
```

### 통계 결과
```
╔════════════════════════════════════════╗
║          할 일 통계 (Todo Stats)        ║
╠════════════════════════════════════════╣
║ 전체:        10개                    ║
║ 완료:         6개  ██████░░░░  60%   ║
║ 진행 중:      4개                    ║
╠════════════════════════════════════════╣
║ 오늘 추가:    3개                  ║
║ 오늘 완료:    2개                  ║
╚════════════════════════════════════════╝
```

## 🔗 관련 문서

- `artifacts/01-refined-idea.md` - Cycle 2 요구사항
- `artifacts/02-system-design.md` - 상세 설계 문서
- `artifacts/test-count-summary.md` - 테스트 상세 통계
- `artifacts/03-design-and-tests-summary.md` - 전체 요약

---

**준비 완료! 구현을 시작하세요! 🚀**

**예상 소요 시간:** 2-3시간  
**완료 후 진행률:** 40% → 60%
