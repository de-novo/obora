# TODO 앱 아키텍처 수정 로그

**버전**: 1.0  
**작성일**: 2026-03-03  
**수정 대상**: docs/10-architecture.md (버전 1.0 → 1.1)

---

## 수정 개요

| 항목 | 내용 |
|------|------|
| **수정일** | 2026-03-03 |
| **수정자** | architecture-revise 단계 |
| **검토 문서** | docs/11-architecture-review.md |
| **기준 버전** | 1.0 |
| **수정 후 버전** | 1.1 |
| **적용된 수정 수** | 2 |
| **적용 안 된 수정 수** | 0 |

---

## 적용된 수정 사항

### 수정 #1: 다중 탭 동기화 명확화 (P2-1)

**이슈 설명**:
다중 탭 동기화 기능이 "선택적"으로 명시되어 있어 실제 구현 시 포함 여부가 모호할 수 있음

**수정 위치**:
- 섹션 13 "리스크 완화" 테이블

**수정 전**:
```markdown
| 다중 탭 동시성 | `storage` 이벤트 리스너로 상태 동기화 (선택) |
```

**수정 후**:
```markdown
| 다중 탭 동시성 | `storage` 이벤트 리스너로 상태 동기화 (필수) |
```

**영향 범위**:
- 문서 내용만 수정, 데이터 구조 및 코드에 영향 없음
- implementation 단계에서 구현 의무 명확화

---

### 수정 #2: ID 생성 방식 강화 (P2-2)

**이슈 설명**:
`Date.now()`만 사용할 경우 동일 ms 내 여러 태스크 추가 시 ID 충돌 가능성 존재. 충돌 가능성 명시 및 고유 ID 생성 방식 개선 필요

**수정 위치**:
- 섹션 4.1 "상태 객체 구조" - 주석 수정
- 섹션 4.2 "Todo 인터페이스" - id 필드 타입 및 제약사항 수정
- 섹션 4.4 "액션 타입" - TOGGLE_TODO, DELETE_TODO 페이로드 타입 수정
- 섹션 5.3 "액션 핸들러 구조" - generateId 함수 추가
- 섹션 6.2.1 "로드 함수" - 데이터 검증 부분 수정

**수정 내용**:

1. **ID 필드 타입 변경**: `number` → `string`
2. **generateId 함수 추가**:
```javascript
const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
};
```
3. **액션 핸들러에서 사용**:
```javascript
ADD_TODO: (state, payload) => ({
  ...state,
  todos: [...state.todos, {
    id: generateId(),
    text: payload.text,
    completed: false
  }]
})
```
4. **데이터 검증 수정**: `typeof todo.id === 'string'`

**영향 범위**:
- 데이터 모델: Todo.id 타입 `number` → `string`
- 액션 페이로드: `{ id: number }` → `{ id: string }`
- 유효성 검증: `typeof todo.id === 'number'` → `typeof todo.id === 'string'`
- 이벤트 버스: `todo:toggle`, `todo:delete` 페이로드 타입 수정

**이유**:
- 실제 사용 시나리오에서 `Date.now()` 기반 ID 충돌 가능성은 매우 낮으나
- 타임스탬프 + 랜덤 접미사 조합으로 고유성 보장
- 문자열 타입으로 더 큰 ID 공간 제공

---

## 적용되지 않은 수정 사항

없음 (검토 문서의 모든 수정 사항이 적용됨)

---

## 버전 간 변경 요약

| 카테고리 | 변경 사항 |
|----------|----------|
| **데이터 모델** | Todo.id 타입: `number` → `string` |
| **상태 관리** | generateId 함수 추가 |
| **액션 타입** | TOGGLE_TODO, DELETE_TODO 페이로드 타입 수정 |
| **이벤트 버스** | 이벤트 페이로드 타입 수정 |
| **localStorage** | 데이터 검증 로직 수정 |
| **리스크 완화** | 다중 탭 동기화 명확화 |

---

## 검증 필요 사항

다음 implementation 단계에서는 다음 사항을 준수해야 합니다:

1. **ID 생성**: `generateId()` 함수를 사용하여 고유 ID 생성
2. **데이터 타입**: Todo.id는 문자열 타입으로 처리
3. **다중 탭 동기화**: `storage` 이벤트 리스너 필수 구현

---

**수정 완료**
