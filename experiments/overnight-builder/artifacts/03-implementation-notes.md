# Implementation Notes: Todo CLI

작성일: 2026-03-20
Cycle: 1
Repair Attempt: 4

---

## 1. 생성/수정한 파일

### 1.1 테스트 파일 수정 (Repair 4)
| 파일 | 변경 내용 | 이유 |
|------|----------|------|
| `test/commands/list.test.ts` | storage errors 테스트 케이스 수정 | validator가 "테스트 코드 버그"라고 명시적 판정 |

### 1.2 기존 구현 파일 (이전 단계에서 생성)
| 파일 | 설명 |
|------|------|
| `src/index.ts` | 진입점 (CLI 실행 + 라이브러리 export) |
| `src/cli.ts` | CLI 명령어 정의 (commander) |
| `src/commands/add.ts` | AddCommand 구현 |
| `src/commands/list.ts` | ListCommand 구현 |
| `src/commands/complete.ts` | CompleteCommand 구현 |
| `src/commands/delete.ts` | DeleteCommand 구현 |
| `src/services/todo-service.ts` | TodoService (비즈니스 로직) |
| `src/storage/json-store.ts` | JsonStore (JSON 파일 영속성) |
| `src/models/todo.ts` | createTodo() 팩토리 |
| `src/types/index.ts` | 타입 정의 |
| `src/utils/errors.ts` | 커스텀 에러 클래스 |
| `src/utils/validator.ts` | 입력 검증 |

---

## 2. 핵심 구현 결정

### 2.1 저장소 에러 처리 전략
**결정**: `JsonStore.load()`는 파일이 없으면(ENOENT) 빈 데이터를 반환

**이유**:
- 첫 실행 시 자동으로 빈 목록으로 시작
- 사용자가 수동으로 초기화할 필요 없음
- CLI 도구의 기대 동작 (파일 없음 ≠ 에러)

**영향**:
- `ListCommand`는 파일 없어도 `success: true` 반환
- `add`/`complete`/`delete`는 `save()` 시 에러 발생 가능

### 2.2 테스트 수정 결정 (Repair 4)
**문제**: `test/commands/list.test.ts:248` 테스트가 `success: false`를 기대했으나, 구현은 `success: true` 반환

**원인 분석**:
- 존재하지 않는 경로로 `JsonStore` 생성 → `load()` 호출
- `load()`는 ENOENT 시 빈 데이터 반환 (의도된 동작)
- `ListCommand`는 빈 목록을 정상 처리하여 `success: true` 반환

**해결**:
- validator가 명시적으로 "테스트 코드 버그" 판정
- 테스트를 corrupted JSON 파일로 수정하여 실제 에러 시나리오 테스트
- `afterEach`로 임시 디렉터리 정리 추가

---

## 3. 에러 핸들링 전략

### 3.1 계층별 에러 처리
| 계층 | 처리 방식 | 예시 |
|------|----------|------|
| Storage | StorageError로 래핑 | `데이터 파일이 손상되었습니다.` |
| Service | 비즈니스 예외 throw | `NotFoundError`, `ValidationError` |
| Command | try-catch로 CommandResult 반환 | `{ success: false, message: ... }` |
| CLI | 최종 에러 출력 + process.exit(1) | chalk.red()로 에러 메시지 |

### 3.2 사용자 메시지 규칙
- 모든 메시지는 한국어
- 내부 구현 세부사항 노출 금지
- 구체적인 원인과 해결 방법 제시

### 3.3 복구 가능한 에러
- **파일 없음**: 빈 데이터로 자동 초기화
- **손상된 JSON**: StorageError throw (사용자에게 알림)
- **권한 없음**: StorageError throw

---

## 4. 남은 리스크

### 4.1 검증 필요 항목
- [ ] 모든 테스트 통과 확인
- [ ] 빌드 산출물 동기화 확인
- [ ] 통합 테스트 CLI 플로우 검증

### 4.2 잠재적 개선 포인트
- 동시성 처리 (현재 단일 프로세스 가정)
- 대량 데이터 처리 성능
- 파일 락 도입 (필요 시)

---

## 5. 테스트 수정 상세

### 5.1 수정 전
```typescript
it('should handle storage errors gracefully', async () => {
  const invalidStore = new JsonStore('/non/existent/path/that/cannot/be/created');
  const invalidService = new TodoService(invalidStore);
  
  const command = new ListCommand(invalidService, {});
  const result = await command.execute();

  expect(result.success).toBe(false);  // ← 잘못된 기대값
});
```

### 5.2 수정 후
```typescript
it('should handle corrupted JSON file gracefully', async () => {
  // Create a unique temp directory for this test
  corruptedDir = join(process.cwd(), 'test-temp-corrupted', `test-${Date.now()}`);
  await mkdir(corruptedDir, { recursive: true });
  
  // Write corrupted JSON (invalid syntax)
  await writeFile(join(corruptedDir, 'todos.json'), '{ invalid json', 'utf-8');
  
  const corruptedStore = new JsonStore(corruptedDir);
  const corruptedService = new TodoService(corruptedStore);
  
  const command = new ListCommand(corruptedService, {});
  const result = await command.execute();

  // ListCommand catches the StorageError and returns success: false
  expect(result.success).toBe(false);
  expect(result.message).toContain('손상');
});
```

### 5.3 수정 이유
- 테스트의 의도 유지: "저장소 에러를 우아하게 처리"
- 실제 에러 시나리오로 변경: corrupted JSON → `StorageError` throw
- `ListCommand`의 try-catch가 `StorageError`를 잡아 `success: false` 반환
