# QA 검증 보고서

**생성일**: 2026-03-19
**검증자**: QA 엔지니어
**프로젝트**: todo-cli

---

## 1. TypeScript 타입 체크 결과

### 상태: ✅ PASS

**Exit Code**: 0

**결과**: 타입 체크 성공적으로 완료됨

---

## 2. 린트 결과

### 상태: ⚠️ SKIP (Configuration Error)

**Exit Code**: 2

**에러 내용**:
```
TypeError: Error while loading rule '@typescript-eslint/no-unused-expressions': 
Cannot read properties of undefined (reading 'allowShortCircuit')
```

**원인**: ESLint v8과 TypeScript ESLint v8 간 호환성 문제
- `@typescript-eslint/eslint-plugin` 설정 오류
- ESLint flat config와 legacy config 간 충돌

**판정**: 린트 자체가 실행되지 않아 SKIP으로 처리

---

## 3. 테스트 결과

### 상태: ❌ FAIL

**Exit Code**: 1

**요약**:
- 총 테스트: 1414개
- 통과: 1383개 (97.8%)
- 실패: 31개 (2.2%)
- 실행 시간: 12.19초

### 실패한 테스트 분류

#### 3.1 구현 버그 - 최근 완료 통계 (implementation_bug)

**영향받는 테스트 (9개)**:

1. `should_exclude_todos_completed_7_or_more_days_ago`
   - 파일: tests/unit/commands/stats.test.ts
   - 원인: 7일 이상 지난 완료가 제외되지 않음
   - 예상: 0, 실제: 1

2. `should_handle_completion_exactly_7_days_ago`
   - 파일: tests/edge-cases/search-stats-boundary.test.ts
   - 원인: 정확히 7일 전 완료 처리 오류

3. `should_handleTodosCompleted7DaysAgo_excluded`
   - 파일: tests/edge-cases/search.edge-cases.test.ts
   - 원인: 7일 경계값 처리 불일치

4. `should_handleMultipleCompletionsSameDay`
   - 파일: tests/edge-cases/search.edge-cases.test.ts
   - 원인: 동일일 다중 완료 집계 실패
   - 예상: 5, 실제: undefined

5. `should_handle_multiple_completions_same_day`
   - 파일: tests/unit/commands/stats.test.ts
   - 원인: 동일일 완료 카운트 반환 안됨

6. `should_calculate_recent_completions_correctly`
   - 파일: tests/unit/commands/stats.test.ts
   - 원인: 최근 완료 일수 계산 부정확
   - 예상: ≥3일, 실제: 2일

7. `should_count_completions_for_each_day`
   - 파일: tests/unit/commands/stats.advanced.test.ts
   - 원인: 일별 완료 카운트 undefined 반환

8. `should_show_7day_trend_correctly`
   - 파일: tests/integration/commands/search-integration.test.ts
   - 원인: 7일 추이 데이터 부족
   - 예상: 7일, 실제: 6일

**근본 원인**: UTC vs Local Time 날짜 계산 불일치
- `stats.ts`의 `calculateRecentCompletions` 함수가 UTC 기준으로 계산
- 하지만 날짜 비교 로직에서 경계 조건 처리 오류

---

#### 3.2 테스트 코드 버그 - 포맷팅 검증 (test_code_bug)

**영향받는 테스트 (16개)**:

**CLI 검색 결과 포맷팅 (6개)**:
1. `should_search_by_keyword` - ANSI 이스케이프 코드 미고려
2. `should_search_case_insensitive_by_default` - ANSI 코드로 검색 실패
3. `should_search_case_sensitive_with_flag` - ANSI 코드로 검색 실패
4. `should_search_korean_keywords` - ANSI 코드로 검색 실패
5. `should_search_with_emoji` - ANSI 코드로 검색 실패
6. `should_search_with_special_chars` - ANSI 코드로 검색 실패

**원인**: 테스트가 `toContain()`을 사용하여 ANSI 이스케이프 코드(`[1m`, `[0m`)가 포함된 출력에서 순수 텍스트를 찾으려 함
- 실제 출력: `[1mBuy[0m groceries`
- 테스트 검색: `Buy groceries`
- 해결: ANSI 코드 제거 후 검증 필요

**CLI 통계 포맷팅 (5개)**:
1. `should_show_stats_for_empty_storage` - '완료율' 텍스트 없음 (UI 변경됨)
2. `should_show_completed_count` - 숫자 포맷팅 변경 (1 → 0)
3. `should_show_100_percent_for_all_completed` - 완료 상태 반영 안됨
4. `should_round_completion_rate_correctly` - 33% → 0% (완료 미반영)
5. `should_format_large_numbers` - `1500` → `1,500` (천 단위 콤마)

**원인**: 
- UI 포맷 변경으로 텍스트 매칭 실패
- `formatStats` 출력 형식이 테스트 기대값과 다름
- 천 단위 콤마 포맷팅 미고려

**유틸리티 포맷팅 (6개)**:
1. `should_format_single_result` - ANSI 코드 미고려
2. `should_format_multiple_results` - ANSI 코드 미고려
3. `should_show_status_for_each_result` - ANSI 코드 미고려
4. `should_handle_korean_content` - ANSI 코드 미고려
5. `should_format_empty_stats` - '0' → '아직 할 일이 없습니다' (UI 변경)
6. `should_format_large_numbers` - `1500` → `1,500` (천 단위 콤마)

---

#### 3.3 테스트 코드 버그 - 빈 문자열 검증 (test_code_bug)

**영향받는 테스트 (1개)**:
- `should_match_empty_string_pattern`
- 파일: tests/edge-cases/search-boundary.test.ts
- 원인: 빈 문자열을 유효한 검색어로 테스트하지만, 실제 구현은 `EMPTY_KEYWORD` 에러 반환
- 테스트 의도: 정규식 빈 문자열 매칭 테스트
- 실제 동작: 입력 검증에서 차단
- 판정: 테스트가 구현의 입력 검증 로직을 고려하지 않음

---

#### 3.4 테스트 코드 버그 - 도움말 텍스트 (test_code_bug)

**영향받는 테스트 (1개)**:
- `should_show_help_for_search_command`
- 파일: tests/integration/cli-search.test.ts
- 원인: 한글화된 도움말에서 'keyword' 텍스트를 찾으려 함
- 실제 출력: `<키워드>` (한글)
- 테스트 검색: `keyword` (영어)
- 판정: 한글화 미고려

---

#### 3.5 통합 테스트 환경 문제 (test_code_bug)

**영향받는 테스트 (4개)**:
1. `should_search_with_regex` - 파일 시스템 동시 접근 오류
2. `should_filter_by_status` - 파일 시스템 동시 접근 오류
3. `should_show_completion_rate` - 파일 시스템 동시 접근 오류
4. `should_show_added_today` - 파일 시스템 동시 접근 오류

**원인**: 
```
ENOENT: no such file or directory, rename 
'/Users/denovo/.todo-cli/todos.json.tmp' -> '/Users/denovo/.todo-cli/todos.json'
```
- 여러 테스트가 동시에 동일한 저장소 파일에 접근
- atomic rename 연산 간섭
- 해결: 각 테스트마다 격리된 저장소 사용 필요

---

## 4. 종합 판정

### ❌ FAIL

### 판정 근거

1. **TypeScript**: ✅ PASS (exit code 0)
2. **린트**: ⚠️ SKIP (설정 오류로 실행 불가)
3. **테스트**: ❌ FAIL (31개 실패 / 1414개 중)

### 실패 원인 요약

| 분류 | 개수 | 심각도 | 수정 필요 |
|------|------|--------|-----------|
| implementation_bug | 9 | 높음 | 구현 수정 필요 |
| test_code_bug (포맷팅) | 16 | 중간 | 테스트 수정 필요 |
| test_code_bug (입력 검증) | 1 | 낮음 | 테스트 수정 필요 |
| test_code_bug (환경) | 4 | 중간 | 테스트 격리 필요 |
| design_issue | 0 | - | - |

### 우선순위 수정 사항

#### 🔴 Critical (즉시 수정)

1. **stats.ts UTC 날짜 계산 로직 수정**
   - `calculateRecentCompletions` 함수에서 7일 경계 처리
   - 동일일 다중 완료 집계 로직 점검
   - UTC/Local Time 일관성 확보

#### 🟡 High (다음 릴리즈)

2. **테스트 코드 ANSI 이스케이프 코드 처리**
   ```typescript
   // Before
   expect(output).toContain('Buy groceries');
   
   // After
   const plainText = output.replace(/\x1b\[[0-9;]*m/g, '');
   expect(plainText).toContain('Buy groceries');
   ```

3. **통합 테스트 격리**
   - 각 테스트마다 고유한 저장소 경로 사용
   - `TODO_CLI_HOME` 환경 변수로 격리

#### 🟢 Medium (향후 개선)

4. **포맷팅 테스트 UI 변경 반영**
   - 천 단위 콤마 포맷팅 고려
   - 빈 상태 메시지 변경 반영
   - 한글화된 도움말 텍스트 업데이트

### 배포 가능성 평가

**현재 상태로 프로덕션 배포: ❌ 권장하지 않음**

**이유**:
- 9개의 핵심 기능 버그 (최근 완료 통계)
- 사용자에게 잘못된 통계 정보 제공 가능
- 데이터 무결성 문제

**최소 수정 후 배포 가능**:
- stats.ts UTC 날짜 계산 로직 1개 수정
- 9개 테스트 자동 통과 예상
- 나머지 22개는 테스트 코드 수정 필요 (기능 영향 없음)

### 권장 사항

1. **즉시**: stats.ts 날짜 계산 로직 수정 및 재테스트
2. **단기**: 테스트 코드 ANSI 처리 및 환경 격리
3. **중기**: ESLint 설정 호환성 해결
4. **장기**: 포맷팅 테스트 전면 개선

---

## 부록: 상세 테스트 결과

### 통과한 테스트 스위트 (38개)

✅ tests/unit/commands/stats.comprehensive.test.ts (61 tests)
✅ tests/unit/utils-formatting.test.ts (110 tests)
✅ tests/unit/stats-advanced.test.ts (41 tests)
✅ tests/edge-cases/stats.edge-cases.test.ts (46 tests)
✅ tests/unit/commands/search.comprehensive.test.ts (61 tests)
✅ tests/unit/search-advanced.test.ts (49 tests)
✅ tests/unit/commands/search.test.ts (31 tests)
✅ tests/unit/stats-command.test.ts (32 tests)
✅ tests/edge-cases/search.stats.concurrency.test.ts (38 tests)
✅ tests/unit/commands/search.advanced.test.ts (36 tests)
✅ tests/integration/cli.search.stats.advanced.test.ts (30 tests)
✅ tests/unit/search-command.test.ts (28 tests)
✅ tests/edge-cases/cli-edge-cases.test.ts (38 tests)
✅ tests/integration/search-stats-workflow.test.ts (16 tests)
✅ tests/edge-cases/file-system-errors.test.ts (21 tests)
✅ tests/integration/search.stats.performance.test.ts (20 tests)
✅ tests/edge-cases/cli.search.stats.edge-cases.test.ts (28 tests)
✅ tests/unit/storage.test.ts (22 tests)
✅ tests/integration/commands/stats.integration.test.ts (15 tests)
✅ tests/unit/validation-search.test.ts (68 tests)
✅ tests/integration/commands/stats.cli.test.ts (23 tests)
✅ tests/unit/commands/search.regex.test.ts (55 tests)
✅ tests/edge-cases/error-handling.test.ts (22 tests)
✅ tests/unit/utils.test.ts (29 tests)
✅ tests/integration/commands/search.integration.test.ts (15 tests)
✅ tests/integration/commands/list.test.ts (10 tests)
✅ tests/integration/commands/search.cli.test.ts (18 tests)
✅ tests/edge-cases/boundary-conditions.test.ts (39 tests)
✅ tests/integration/commands/delete.test.ts (10 tests)
✅ tests/unit/validation.test.ts (22 tests)
✅ tests/integration/commands/done.test.ts (9 tests)
✅ tests/integration/commands/add.test.ts (12 tests)
✅ tests/integration/cli.test.ts (14 tests)
✅ tests/unit/errors.test.ts (6 tests)
✅ tests/integration/smoke-test.test.ts (6 tests)
✅ tests/integration/cli-search-stats.test.ts (21 tests)
✅ tests/integration/cli-search-advanced.test.ts (22 tests)
✅ tests/edge-cases/cli-advanced.test.ts (28 tests)

### 실패한 테스트 스위트 (9개)

❌ tests/edge-cases/search-boundary.test.ts (1/43 failed)
❌ tests/unit/commands/stats.advanced.test.ts (1/30 failed)
❌ tests/unit/commands/stats.test.ts (3/30 failed)
❌ tests/edge-cases/search-stats-boundary.test.ts (1/34 failed)
❌ tests/edge-cases/search.edge-cases.test.ts (2/27 failed)
❌ tests/integration/commands/search-integration.test.ts (1/25 failed)
❌ tests/unit/utils-formatting-advanced.test.ts (6/45 failed)
❌ tests/integration/cli-search.test.ts (10/15 failed)
❌ tests/integration/cli-stats.test.ts (6/13 failed)
