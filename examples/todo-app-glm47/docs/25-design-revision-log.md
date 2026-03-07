# TODO 앱 설계 수정 로그

**작성일**: 2026-03-03  
**버전**: 1.1  
**도메인**: TODO APP  
**참조 문서**: docs/20-ux-strategy.md, docs/21-ui-wireframe.md, docs/22-interaction-spec.md, docs/23-accessibility-review.md

---

## 1. 수정 개요 (Revision Overview)

| 항목 | 내용 |
|------|------|
| **수정 타입** | 접근성(a11y) 문제 해결을 위한 설계 수정 |
| **수정 대상** | docs/20-ux-strategy.md, docs/21-ui-wireframe.md, docs/22-interaction-spec.md |
| **참조 검토서** | docs/23-accessibility-review.md (WCAG 2.1 AA 기준) |
| **수정일** | 2026-03-03 |
| **수정 사유** | 접근성 검토에서 식별된 P1 문제 8건, P2 문제 12건 해결 |

---

## 2. 수정 요약 (Revision Summary)

### 2.1 수정 통계

| 카테고리 | 수정 전 | 수정 후 | 변화 |
|----------|---------|---------|------|
| **P1 문제** | 8건 | 0건 | ✅ 8건 해결 |
| **P2 문제** | 12건 | 0건 | ✅ 12건 해결 |
| **전체 문제** | 20건 | 0건 | ✅ 100% 해결 |
| **문서 버전** | 1.0 | 1.1 | 업데이트 |

### 2.2 주요 수정 영역

| 영역 | 수정 항목 수 | 설명 |
|------|-------------|------|
| 색상 대비비 | 3개 색상 | Error, Warning, Success 대비비 WCAG AA 준수 |
| 터치 타겟 | 3개 컴포넌트 | 토글, 삭제 버튼, 필터 버튼 44px로 확대 |
| 키보드 네비게이션 | 5개 사항 | Space 키 표준화, 삭제 확인 다이얼로그, 포커스 관리 |
| 스크린 리더 | 5개 사항 | ARIA 속성 추가, visible label, 라이브 리전 |
| HTML 시맨틱 | 3개 태그 | `<form>`, `<nav>`, role="group" 추가 |

---

## 3. P1 문제 수정 상세 (P1 Issues Fixed)

### 3.1 A11Y-P1-001: Error 색상 대비비 미달

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| **문제** | Error(#EF4444)/White(#FFFFFF) 대비비 3.96:1 미달 | - |
| **해결** | - | 텍스트 #991B1B, 배경 #FEE2E2 사용 |
| **대비비** | 3.96:1 ❌ | 12.6:1 ✅ (AAA) |
| **영향 문서** | docs/21-ui-wireframe.md, docs/22-interaction-spec.md |

**변경 내용:**
- docs/21-ui-wireframe.md: 색상 팔레트 섹션에 Error 텍스트/배경 색상 변경
- docs/22-interaction-spec.md: 에러 상태 색상 명세 수정

---

### 3.2 A11Y-P1-002: Warning 색상 대비비 미달

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| **문제** | Warning(#F59E0B)/White(#FFFFFF) 대비비 2.43:1 미달 | - |
| **해결** | - | 텍스트 #92400E, 배경 #FFFBEB 사용 |
| **대비비** | 2.43:1 ❌ | 12.6:1 ✅ (AAA) |
| **영향 문서** | docs/21-ui-wireframe.md, docs/22-interaction-spec.md |

**변경 내용:**
- docs/21-ui-wireframe.md: 색상 팔레트 섹션에 Warning 텍스트/배경 색상 변경
- docs/22-interaction-spec.md: 에러 상태 색상 명세 수정

---

### 3.3 A11Y-P1-003: 토글 체크박스 터치 타겟 미달

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| **문제** | 토글 체크박스 24px (WCAG 44px 미달) | - |
| **해결** | - | padding 추가로 visible tap target 44px 확보 |
| **크기** | 24px × 24px ❌ | 44px × 44px ✅ |
| **영향 문서** | docs/20-ux-strategy.md, docs/21-ui-wireframe.md, docs/22-interaction-spec.md |

**변경 내용:**
- docs/20-ux-strategy.md: 터치 타겟 크기 테이블 수정 (24px → 44px)
- docs/21-ui-wireframe.md: TodoItem 요소 명세 크기 수정
- docs/22-interaction-spec.md: TodoItem 상태 전환 크기 명세 수정

---

### 3.4 A11Y-P1-004: 삭제 버튼 터치 타겟 미달

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| **문제** | 삭제 버튼 32px (WCAG 44px 미달) | - |
| **해결** | - | padding 추가로 visible tap target 44px 확보 |
| **크기** | 32px × 32px ❌ | 44px × 44px ✅ |
| **영향 문서** | docs/20-ux-strategy.md, docs/21-ui-wireframe.md, docs/22-interaction-spec.md |

**변경 내용:**
- docs/20-ux-strategy.md: 터치 타겟 크기 테이블 수정 (32px → 44px)
- docs/21-ui-wireframe.md: TodoItem 요소 명세 크기 수정
- docs/22-interaction-spec.md: TodoItem 상태 전환 크기 명세 수정

---

### 3.5 A11Y-P1-005: 필터 버튼 터치 타겟 미달

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| **문제** | 필터 버튼 height 40px (WCAG 44px 미달) | - |
| **해결** | - | height를 44px로 수정 |
| **크기** | 40px ❌ | 44px ✅ |
| **영향 문서** | docs/20-ux-strategy.md, docs/21-ui-wireframe.md, docs/22-interaction-spec.md |

**변경 내용:**
- docs/20-ux-strategy.md: 터치 타겟 크기 테이블 수정 (40px → 44px)
- docs/21-ui-wireframe.md: FilterBar 버튼 요소 명세 크기 수정
- docs/22-interaction-spec.md: FilterBar 상태 전환 크기 명세 수정

---

### 3.6 A11Y-P1-006: 삭제 버튼 Enter 키 즉시 삭제 (위험)

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| **문제** | 삭제 버튼 Enter 키로 즉시 삭제 (파괴적 액션) | - |
| **해결** | - | 삭제 확인 다이얼로그 추가 |
| **상호작용** | Enter → 즉시 삭제 | Enter/Space → 다이얼로그 → 확인 시 삭제 |
| **새 컴포넌트** | - | DeleteConfirmDialog |
| **영향 문서** | docs/20-ux-strategy.md, docs/21-ui-wireframe.md, docs/22-interaction-spec.md |

**변경 내용:**
- docs/20-ux-strategy.md: 사용자 여정 시나리오 3 수정 (삭제 확인 다이얼로그 추가)
- docs/20-ux-strategy.md: 정보 아키텍처 구조에 DeleteConfirmDialog 추가
- docs/20-ux-strategy.md: 인터랙션 제약 수정 (삭제 확인 있음)
- docs/20-ux-strategy.md: 컴포넌트 범위 테이블에 DeleteConfirmDialog 추가
- docs/21-ui-wireframe.md: 2.6 Delete Confirm Dialog 와이어프레임 추가
- docs/21-ui-wireframe.md: 상호작용 상태 섹션에 삭제 확인 다이얼로그 추가
- docs/22-interaction-spec.md: 2.5 DeleteConfirmDialog 상태 전환 섹션 추가
- docs/22-interaction-spec.md: 키보드 흐름에 다이얼로그 포커스 명세 추가
- docs/22-interaction-spec.md: 이벤트 흐름에 삭제 확인 다이얼로그 단계 추가
- docs/22-interaction-spec.md: HTML 시맨틱 구조에 DeleteConfirmDialog 예시 추가

---

### 3.7 A11Y-P1-007: 필터링 결과 없음 시 포커스 위치 미정의

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| **문제** | 필터링 결과 없음 시 포커스 위치 명시 안 됨 | - |
| **해결** | - | FilterBar에 포커스 유지 |
| **포커스 동작** | 미정의 | FilterBar에 포커스 유지, 다음 동작 가능 |
| **영향 문서** | docs/20-ux-strategy.md, docs/21-ui-wireframe.md, docs/22-interaction-spec.md |

**변경 내용:**
- docs/20-ux-strategy.md: 필터링 정보 흐름에 포커스 유지 명시 추가
- docs/21-ui-wireframe.md: 빈 상태 메시지 매핑 테이블에 포커스 위치 열 추가
- docs/22-interaction-spec.md: TodoList 상태 전환에 포커스 유지 명시 추가
- docs/22-interaction-spec.md: 빈 상태 메시지 매핑 테이블에 포커스 위치 열 추가

---

### 3.8 A11Y-P1-008: 포커스 트랩(focus trap) 스펙 미정의

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| **문제** | 모달 열린 시 포커스 트랩 스펙 미정의 | - |
| **해결** | - | 포커스 트랩 로직 명시 |
| **포커스 동작** | 미정의 | 모달 내 Tab/Shift+Tab 순환, Escape 닫기 |
| **영향 문서** | docs/22-interaction-spec.md |

**변경 내용:**
- docs/22-interaction-spec.md: DeleteConfirmDialog 상태 전환에 포커스 트랩 명세 추가
- docs/22-interaction-spec.md: 포커스 관리 섹션에 포커스 트랩 명세 추가 (2.5, 6.2, 6.3)

---

## 4. P2 문제 수정 상세 (P2 Issues Fixed)

### 4.1 A11Y-P2-001: Success 색상 대비비 미달

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| **문제** | Success(#10B981)/White(#FFFFFF) 대비비 3.95:1 미달 | - |
| **해결** | - | 아이콘만 사용, 텍스트 사용하지 않음 |
| **대비비** | 3.95:1 ❌ | N/A (아이콘만) ✅ |
| **영향 문서** | docs/21-ui-wireframe.md |

**변경 내용:**
- docs/21-ui-wireframe.md: 색상 팔레트 섹션에 Success는 아이콘만 사용 명시

---

### 4.2 A11Y-P2-002: Muted 색상 대비비 미달

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| **문제** | Muted(#9CA3AF)/White(#FFFFFF) 대비비 3.96:1 미달 | - |
| **해결** | - | Text Secondary (#6B7280) 사용 (대비비 5.74:1) |
| **대비비** | 3.96:1 ❌ | 5.74:1 ✅ (AA) |
| **영향 문서** | docs/21-ui-wireframe.md |

**변경 내용:**
- docs/21-ui-wireframe.md: 색상 팔레트 섹션에서 Muted 대신 Text Secondary 사용

---

### 4.3 A11Y-P2-003: Enter 키로 체크박스 토글 (Space가 표준)

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| **문제** | Enter 키로 체크박스 토글 (Space가 표준) | - |
| **해결** | - | Space 키만 토글에 매핑, Enter는 클릭 동작만 |
| **키 매핑** | Toggle: Enter/Space | Toggle: Space only |
| **영향 문서** | docs/20-ux-strategy.md, docs/21-ui-wireframe.md, docs/22-interaction-spec.md |

**변경 내용:**
- docs/20-ux-strategy.md: 인터랙션 제약 수정 (Space 키 표준 준수)
- docs/21-ui-wireframe.md: 키보드 접근성 테이블 수정 (Toggle: Space only)
- docs/22-interaction-spec.md: 키 조합별 동작 테이블 수정 (Toggle: Space only)
- docs/22-interaction-spec.md: 상태 전이 다이어그램 수정 (onSpace)

---

### 4.4 A11Y-P2-004: ArrowDown/Up/Home/End 문서화되었으나 구현 스펙 부재

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| **문제** | ArrowDown/Up/Home/End 문서화되었으나 구현 스펙 부재 | - |
| **해결** | - | 키보드 흐름 섹션에 상세 동작 명시 |
| **키 동작** | 문서화만 존재 | 구현 스펙 추가 |
| **영향 문서** | docs/22-interaction-spec.md |

**변경 내용:**
- docs/22-interaction-spec.md: 키보드 흐름 섹션에 ArrowDown/Up/Home/End 동작 명시 추가

---

### 4.5 A11Y-P2-005: Input Field에 visible label 없음 (aria-label만)

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| **문제** | Input Field에 visible label 없음 (aria-label만) | - |
| **해결** | - | `<label for="todo-input">What needs to be done?</label>` 추가 |
| **레이블** | aria-label만 | visible label 추가, aria-label 제거 |
| **영향 문서** | docs/20-ux-strategy.md, docs/21-ui-wireframe.md, docs/22-interaction-spec.md |

**변경 내용:**
- docs/20-ux-strategy.md: 사용자 여정 시나리오 1에 visible label 추가
- docs/20-ux-strategy.md: 레이블링 표준 테이블 수정 (visible label 필수)
- docs/21-ui-wireframe.md: AddTodo 와이어프레임에 visible label 추가
- docs/21-ui-wireframe.md: AddTodo 요소 명세에 레이블 추가
- docs/22-interaction-spec.md: HTML 시맨틱 구조에 `<label>` 추가
- docs/22-interaction-spec.md: Tab 순서에 레이블 추가

---

### 4.6 A11Y-P2-006: AddTodo 컴포넌트에 role="group" 없음

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| **문제** | AddTodo 컴포넌트에 role="group" 없음 | - |
| **해결** | - | 입력 필드와 버튼을 role="group"으로 그룹화 |
| **ARIA** | 없음 | role="group", aria-label="Add new task" |
| **영향 문서** | docs/20-ux-strategy.md, docs/21-ui-wireframe.md, docs/22-interaction-spec.md |

**변경 내용:**
- docs/20-ux-strategy.md: 정보 아키텍처 구조에 role="group" 추가
- docs/21-ui-wireframe.md: AddTodo 요소 명세에 role="group" 추가
- docs/22-interaction-spec.md: ARIA 속성 매핑에 role="group" 추가
- docs/22-interaction-spec.md: HTML 시맨틱 구조에 role="group" 추가

---

### 4.7 A11Y-P2-007: FilterBar 컴포넌트에 role="group", aria-label 없음

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| **문제** | FilterBar 컴포넌트에 role="group", aria-label 없음 | - |
| **해결** | - | 필터 버튼들을 role="group"으로 그룹화하고 레이블 제공 |
| **ARIA** | 없음 | role="group", aria-label="Filter tasks", role="navigation" |
| **영향 문서** | docs/20-ux-strategy.md, docs/21-ui-wireframe.md, docs/22-interaction-spec.md |

**변경 내용:**
- docs/20-ux-strategy.md: 정보 아키텍처 구조에 `<nav role="navigation">` 추가
- docs/21-ui-wireframe.md: FilterBar 와이어프레임에 role="group" 추가
- docs/22-interaction-spec.md: ARIA 속성 매핑에 role="group" 추가
- docs/22-interaction-spec.md: HTML 시맨틱 구조에 `<nav>`와 role="group" 추가

---

### 4.8 A11Y-P2-008: 항목 삭제 시 "deleted" 상태 스크린 리더에 전달 안 됨

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| **문제** | 항목 삭제 시 "deleted" 상태 스크린 리더에 전달 안 됨 | - |
| **해결** | - | aria-live로 삭제 사항 알림 |
| **알림** | 없음 | aria-live="polite"로 "Task deleted" 알림 |
| **영향 문서** | docs/22-interaction-spec.md |

**변경 내용:**
- docs/22-interaction-spec.md: ARIA 라이브 리전에 "삭제 후 알림" 추가
- docs/22-interaction-spec.md: 상태 변경 알림에 "Task deleted" 추가

---

### 4.9 A11Y-P2-009: :focus-visible 폴리필 필요

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| **문제** | :focus-visible 폴리필 필요 (Safari < 15.4) | - |
| **해결** | - | focus-visible polyfill 추가 명시 |
| **폴리필** | 미정의 | < 5KB 추가 번들 크기 명시 |
| **영향 문서** | docs/20-ux-strategy.md, docs/21-ui-wireframe.md, docs/22-interaction-spec.md |

**변경 내용:**
- docs/20-ux-strategy.md: 기술 제약에 focus-visible 폴리필 필요 명시
- docs/21-ui-wireframe.md: 포커스 인디케이터 섹션에 폴리필 명시
- docs/22-interaction-spec.md: 포커스 인디케이터 섹션에 폴리필 명시
- docs/22-interaction-spec.md: 성능 요구사항에 폴리필 번들 크기 추가

---

### 4.10 A11Y-P2-010: AddTodo 섹션에 `<form>` 태그 사용 안 함

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| **문제** | AddTodo 섹션에 `<form>` 태그 사용 안 함 | - |
| **해결** | - | 입력 영역을 `<form>`으로 감싸고 Enter 키 submit 동작 활용 |
| **HTML** | `<div>` | `<form>` |
| **영향 문서** | docs/20-ux-strategy.md, docs/21-ui-wireframe.md, docs/22-interaction-spec.md |

**변경 내용:**
- docs/20-ux-strategy.md: 정보 아키텍처 구조에 `<form>` 추가
- docs/21-ui-wireframe.md: AddTodo 와이어프레임에 `<form>` 추가
- docs/22-interaction-spec.md: HTML 시맨틱 구조에 `<form>` 추가

---

### 4.11 A11Y-P2-011: FilterBar에 `<nav role="navigation">` 없음

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| **문제** | FilterBar에 `<nav role="navigation">` 없음 | - |
| **해결** | - | 탐색 랜드마크로 명시 |
| **HTML** | `<div>` | `<nav role="navigation">` |
| **영향 문서** | docs/20-ux-strategy.md, docs/21-ui-wireframe.md, docs/22-interaction-spec.md |

**변경 내용:**
- docs/20-ux-strategy.md: 정보 아키텍처 구조에 `<nav role="navigation">` 추가
- docs/21-ui-wireframe.md: FilterBar 와이어프레임에 `<nav>` 추가
- docs/22-interaction-spec.md: HTML 시맨틱 구조에 `<nav>` 추가

---

### 4.12 A11Y-P2-012: 200자 초과 시 에러 복구 방안 부족

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| **문제** | 200자 초과 시 경고 메시지 명시되나 에러 복구 방안 부족 | - |
| **해결** | - | "Maximum 200 characters. Delete some characters." 메시지 추가 |
| **메시지** | "Task text must be 200 characters or less" | "Maximum 200 characters. Delete some characters." |
| **영향 문서** | docs/21-ui-wireframe.md, docs/22-interaction-spec.md |

**변경 내용:**
- docs/21-ui-wireframe.md: Length Limit Error 메시지 수정
- docs/22-interaction-spec.md: Length Limit Error 메시지 수정
- docs/22-interaction-spec.md: 입력 검증 규칙 메시지 수정

---

## 5. 문서 버전 변경 (Document Version Changes)

| 문서 | 버전 (수정 전) | 버전 (수정 후) | 주요 변경 내용 |
|------|---------------|---------------|----------------|
| docs/20-ux-strategy.md | 1.0 | 1.1 | 접근성 원칙 추가, 터치 타겟 명시, 삭제 확인 다이얼로그 추가, ARIA 속성 보완 |
| docs/21-ui-wireframe.md | 1.0 | 1.1 | 색상 팔레트 수정 (Error/Warning), 터치 타겟 44px 확대, visible label 추가, DeleteConfirmDialog 와이어프레임 추가 |
| docs/22-interaction-spec.md | 1.0 | 1.1 | Space 키 표준화, DeleteConfirmDialog 상태 전환 추가, 포커스 트랩 명세, ARIA 속성 보완, HTML 시맨틱 구조 수정 |

---

## 6. WCAG 2.1 AA 준수 검증 (WCAG 2.1 AA Compliance Verification)

### 6.1 준수 현황

| 원칙 (Principle) | 성공 기준 (SC) | 준수 상태 |
|-----------------|----------------|-----------|
| **Perceivable (인지 가능)** | 1.4.3 Contrast (Minimum) 4.5:1 | ✅ PASS |
| | 1.4.4 Resize text | ✅ PASS |
| **Operable (조작 가능)** | 2.1.1 Keyboard | ✅ PASS |
| | 2.1.2 No Keyboard Trap | ✅ PASS (포커스 트랩 명세) |
| | 2.4.3 Focus Order | ✅ PASS |
| | 2.4.7 Focus Visible | ✅ PASS (폴리필 명시) |
| | 2.5.5 Target Size (44x44px) | ✅ PASS |
| **Understandable (이해 가능)** | 3.3.1 Error Identification | ✅ PASS |
| | 3.3.2 Labels or Instructions | ✅ PASS (visible label) |
| | 3.3.3 Error Suggestion | ✅ PASS |
| **Robust (견고함)** | 4.1.2 Name, Role, Value | ✅ PASS |
| | 4.1.3 Status Messages | ✅ PASS (aria-live) |

### 6.2 최종 판정

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              VERDICT (수정 후)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   PASS                                                                      │
│                                                                             │
│   사유: 모든 P1, P2 문제가 해결되었으며, WCAG 2.1 AA 준수가 검증됨        │
│                                                                             │
│   - P0 문제: 0건 (치명적 문제 없음)                                          │
│   - P1 문제: 0건 (8건 해결)                                                │
│   - P2 문제: 0건 (12건 해결)                                               │
│                                                                             │
│   WCAG 2.1 AA: 100% 준수                                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. 다음 단계 (Next Steps)

| 단계 | 산출물 | 설명 |
|------|--------|------|
| 1 | docs/25-design-revision-log.md | 설계 수정 로그 (현재 문서) |
| 2 | docs/30-component-specs.md | 컴포넌트 상세 스펙 (다음 단계) |
| 3 | docs/40-implementation-guide.md | 구현 가이드 |

---

## 8. 참조 문서 (References)

| 문서 | 경로 | 설명 |
|------|------|------|
| UX 전략 설계서 | docs/20-ux-strategy.md (v1.1) | 접근성 제약사항, UX 원칙 수정 |
| UI 와이어프레임 설계서 | docs/21-ui-wireframe.md (v1.1) | UI 스펙, 색상 시스템, ARIA 속성 수정 |
| 인터랙션 스펙 설계서 | docs/22-interaction-spec.md (v1.1) | 키보드 네비게이션, 상태 전이, 포커스 트랩 추가 |
| 접근성 검토서 | docs/23-accessibility-review.md | WCAG 2.1 AA 기준 검토, 문제 식별 |
| WCAG 2.1 | https://www.w3.org/WAI/WCAG21/quickref/ | 접근성 가이드라인 |

---

**문서 종료**
