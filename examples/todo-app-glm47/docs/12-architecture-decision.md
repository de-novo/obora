# TODO 앱 아키텍처 최종 결정서

**버전**: 1.1 (FINAL)  
**결정일**: 2026-03-03  
**상태**: **APPROVED** ✅  
**작성자**: 시스템 구조 설계자

---

## 1. 결정 요약

본 문서는 TODO 앱 아키텍처 설계서 v1.1에 대한 최종 승인 결정을 기록합니다. 검토 단계에서 식별된 모든 P0/P1/P2 이슈가 해결되었으며, 설계는 구현 단계로 진행할 준비가 완료되었습니다.

| 항목 | 결정 |
|------|------|
| **승인 상태** | ✅ **APPROVED** |
| **승인 버전** | 1.1 |
| **승인 일자** | 2026-03-03 |
| **다음 단계** | UI/UX 전략 설계 (`docs/20-ux-strategy.md`) |

---

## 2. 검토 이력

### 2.1 검토 단계 요약

| 단계 | 결과 | 주요 이슈 |
|------|------|----------|
| 아키텍처 설계 v1.0 | REVISE | P2 이슈 2건 식별 |
| 수정 적용 v1.1 | COMPLETE | 모든 P2 이슈 해결 |
| 아키텍처 검토 v1.1 | **APPROVE** | P3 이슈 1건 (문서 품질) |

### 2.2 검토 통계

| 심각도 | 개수 | 상태 |
|--------|------|------|
| P0 | 0 | - |
| P1 | 0 | - |
| P2 | 0 | ✅ 모두 해결됨 |
| P3 | 1 | 문서 정렬 (기술 구현에 영향 없음) |

---

## 3. 최종 아키텍처 결정

### 3.1 컴포넌트 구조

```
TodoApp (Root)
├── AddTodo
│   └── [Input Form]
├── FilterBar
│   ├── [All Button]
│   ├── [Active Button]
│   └── [Completed Button]
└── TodoList
    └── TodoItem[] (동적 생성)
        ├── [Checkbox/Toggle]
        ├── [Text]
        └── [Delete Button]
```

**결정**: 위 컴포넌트 계층 구조를 확정합니다.

---

### 3.2 데이터 모델

```javascript
{
  todos: [
    {
      id: string,        // 고유 ID (timestamp + random suffix)
      text: string,      // 태스크 내용
      completed: boolean // 완료 상태
    }
  ],
  
  filter: 'all' | 'active' | 'completed'
}
```

**결정**: 위 데이터 모델을 확정합니다.

**핵심 결정 사항**:
- Todo.id 타입: **`string`** (타임스탬프 + 랜덤 접미사)
- ID 생성: `Date.now().toString(36) + Math.random().toString(36).substr(2, 9)`

---

### 3.3 상태 관리 전략

**결정**: Flux-스타일 단방향 데이터 흐름을 확정합니다.

```
사용자 액션 → 액션 핸들러 → 상태 업데이트 → 렌더링 → 저장소 저장
```

**액션 타입**:
| 액션 | 페이로드 |
|------|----------|
| `ADD_TODO` | `{ text: string }` |
| `TOGGLE_TODO` | `{ id: string }` |
| `DELETE_TODO` | `{ id: string }` |
| `SET_FILTER` | `{ filter: string }` |

---

### 3.4 localStorage 전략

**결정**: 다음 저장소 키 구조와 전략을 확정합니다.

| 키 | 타입 | 설명 |
|----|------|------|
| `todo-app-todos` | JSON string | 태스크 배열 |
| `todo-app-filter` | string | 현재 필터 상태 |

**핵심 결정 사항**:
- 저장 디바운스: **100ms**
- 에러 처리: 4가지 에러 유형별 처리 전략 적용
- 다중 탭 동기화: **필수** 구현 (`storage` 이벤트 리스너)

---

### 3.5 이벤트 버스

**결정**: 다음 커스텀 이벤트 구조를 확정합니다.

| 이벤트 이름 | 발생 컴포넌트 | 페이로드 |
|------------|--------------|----------|
| `todo:add` | AddTodo | `{ text: string }` |
| `todo:toggle` | TodoItem (위임) | `{ id: string }` |
| `todo:delete` | TodoItem (위임) | `{ id: string }` |
| `filter:change` | FilterBar | `{ filter: string }` |

---

### 3.6 렌더링 전략

**결정**: 전체 재렌더링 방식을 확정합니다.

**장점**:
- 구현 단순함
- 데이터 일관성 보장

**고려사항**:
- 포커스 상태 복원 로직 포함
- 대규모 데이터에서 성능 모니터링 필요

---

### 3.7 보안 및 접근성

**결정**: 다음 보안 및 접근성 전략을 확정합니다.

| 보안 | 조치 |
|------|------|
| XSS 방어 | `textContent` 사용, `innerHTML` 금지 |
| 입력 검증 | 길이 제한 (1000자), 공백 제거 후 검증 |

| 접근성 | 조치 |
|--------|------|
| ARIA 속성 | `role="checkbox"`, `aria-checked`, `aria-label` |
| 키보드 탐색 | Tab, Enter, Escape 지원 |

---

## 4. 미해결 이슈

### 4.1 P3 이슈 (문서 품질)

| 이슈 | 위치 | 영향 | 조치 |
|------|------|------|------|
| 섹션 12 중복 항목 | 확장성 고려 테이블 | 문서 품질만 영향 | 선택적 (must_fix 아님) |

**설명**: "다크 모드" 항목이 표에서 중복되어 있습니다. 기술적 구현에 영향이 없으므로 향후 문서 정리 시 수정을 권장합니다.

---

## 5. 기술 제약사항 준수 확인

| 제약사항 | 준수 여부 | 검증 |
|----------|----------|------|
| 프레임워크 비사용 | ✅ | 순수 JavaScript, 빌드 도구 미사용 |
| localStorage만 사용 | ✅ | 서버 API 없음, 로컬 저장소 중심 |
| 브라우저 호환성 | ✅ | 최신 브라우저 2개 버전 지원 |
| 접근성 | ✅ | ARIA 속성, 키보드 탐색 명시 |

---

## 6. 구현 시 필수 준수 사항

### 6.1 데이터 타입

| 엔티티 | 필드 | 타입 | 필수 |
|--------|------|------|------|
| Todo | id | `string` | ✅ |
| Todo | text | `string` | ✅ |
| Todo | completed | `boolean` | ✅ |
| State | filter | `'all' | 'active' | 'completed'` | ✅ |

### 6.2 ID 생성

```javascript
// 필수: 이 함수를 사용하여 ID 생성
const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
};
```

### 6.3 다중 탭 동기화

```javascript
// 필수: storage 이벤트 리스너로 탭 간 상태 동기화
window.addEventListener('storage', (e) => {
  if (e.key === 'todo-app-todos') {
    loadFromStorage();
    render();
  }
});
```

### 6.4 이벤트 페이로드

| 이벤트 | 페이로드 구조 |
|--------|--------------|
| `todo:add` | `{ text: string }` |
| `todo:toggle` | `{ id: string }` |
| `todo:delete` | `{ id: string }` |
| `filter:change` | `{ filter: string }` |

---

## 7. 다음 단계 체크리스트

### 7.1 즉시 시작 (필수)

- [ ] **UI/UX 전략 설계** (`docs/20-ux-strategy.md`)
  - [ ] 사용자 시나리오 정의
  - [ ] 디자인 원칙 수립
  - [ ] 비주얼 스타일 가이드 작성

- [ ] **UI 와이어프레임** (`docs/21-ui-wireframe.md`)
  - [ ] 컴포넌트 레이아웃 설계
  - [ ] 반응형 레이아웃 정의

- [ ] **인터랙션 스펙** (`docs/22-interaction-spec.md`)
  - [ ] 사용자 인터랙션 정의
  - [ ] 상태 전환 명시

### 7.2 설계 단계 (다음)

- [ ] **접근성 검토** (`docs/23-accessibility-review.md`)
- [ ] **디자인 게이트** (`docs/24-design-gate.md`)

### 7.3 구현 준비

- [ ] **컴포넌트 설계** (`docs/30-component-design.md`)
- [ ] **구현 가이드** (`docs/40-implementation-guide.md`)

---

## 8. 확장성 고려사항

다음 확장 기능은 아키텍처 v1.1에서 고려되었습니다. 향후 요구사항에 따라 구현 가능합니다.

| 확장 기능 | 현재 설계에서의 고려사항 |
|----------|------------------------|
| 다크 모드 | CSS 변수로 색상 정의, 테마 클래스 전환 |
| 태스크 편집 | TodoItem에 편집 모드 상태 추가 가능 |
| 우선순위 | `todos` 데이터 구조에 `priority` 필드 추가 |
| 카테고리 | 필터 상태를 문자열에서 객체로 확장 가능 |

---

## 9. 승인 서명

| 역할 | 이름 | 승인 |
|------|------|------|
| 시스템 구조 설계자 | 시스템 구조 설계자 | ✅ 제출 |
| 아키텍처 리뷰어 | 아키텍처/코드품질 리뷰어 | ✅ 승인 |
| 프로젝트 관리자 | - | ⏳ 대기 |

---

## 10. 결론

TODO 앱 아키텍처 설계서 v1.1은 **최종 승인(APPROVED)** 되었습니다. 모든 P0/P1/P2 이슈가 해결되었으며, 설계는 기술 제약사항을 준수하고 확장성을 고려하고 있습니다.

**다음 단계**: UI/UX 전략 설계(`docs/20-ux-strategy.md`)로 진행합니다.

---

**문서 상태**: FINAL APPROVED  
**최종 수정일**: 2026-03-03
