# TODO 앱 분석서

## 1. 기능분해 (Functional Decomposition)

### 1.1 컴포넌트 계층 구조

```
TodoApp (루트)
├── TodoList
│   └── TodoItem[] (동적 생성)
├── AddTodo
└── FilterBar
```

### 1.2 컴포넌트별 책임 정의

| 컴포넌트 | 책임 | 상호작용 |
|----------|------|----------|
| **TodoApp** | 애플리케이션 상태 관리, 이벤트 중앙 처리, localStorage 입출력 | 자식 컴포넌트 모두와 통신 |
| **TodoList** | 태스크 배열을 순회하며 TodoItem 렌더링, 필터링 적용 | TodoApp으로부터 데이터 수신, TodoItem 생성 |
| **TodoItem** | 개별 태스크 표시, 완료 토글, 삭제 버튼 이벤트 발생 | TodoList에서 생성, TodoApp으로 이벤트 전달 |
| **AddTodo** | 텍스트 입력 폼, 유효성 검증, 추가 이벤트 발생 | TodoApp으로 새 태스크 데이터 전달 |
| **FilterBar** | 필터 버튼 그룹 (All/Active/Completed), 현재 필터 상태 표시 | TodoApp으로 필터 변경 이벤트 전달 |

### 1.3 기능 흐름 분석

#### 태스크 추가 흐름
```
사용자 입력 → AddTodo 유효성 검증 → TodoApp 상태 업데이트 → localStorage 저장 → TodoList 재렌더링
```

#### 완료 토글 흐름
```
TodoItem 클릭 → TodoApp 상태 변경 → localStorage 업데이트 → 해당 TodoItem 시각적 업데이트
```

#### 필터링 흐름
```
FilterBar 버튼 클릭 → TodoApp 필터 상태 변경 → localStorage 필터 저장 → TodoList 필터링 적용
```

## 2. 의존성 (Dependencies)

### 2.1 컴포넌트 의존성 그래프

```
TodoApp (의존 없음)
    ↓ 생성/관리
TodoList ←─── FilterBar (필터 상태 공유)
    ↓ 생성
TodoItem[]

AddTodo (독립적, TodoApp에만 이벤트 전달)
```

### 2.2 데이터 의존성

| 데이터 소스 | 의존 컴포넌트 | 설명 |
|-------------|---------------|------|
| todos 배열 | TodoList, TodoItem, FilterBar | 필터링 대상 및 렌더링 데이터 |
| filter 상태 | TodoList, FilterBar | 표시할 태스크 결정 |
| localStorage | TodoApp | 전체 데이터 영속성 |

### 2.3 상위 의존성 (순수 JS 환경)

- **브라우저 API**: localStorage, DOM API (querySelector, addEventListener)
- **CSS**: Flexbox/Grid 레이아웃 (모던 브라우저)
- **외부 라이브러리**: 없음 (순수 JS만 사용)

## 3. 리스크 (Risks)

### 3.1 기술적 리스크

| 리스크 | 영향도 | 확률 | 완화 전략 |
|--------|--------|------|----------|
| localStorage 쿼터 초과 | 중 | 낮 | 태스크 개수 제한 또는 경고 메시지 추가 |
| 브라우저 호환성 이슈 (구버전) | 중 | 낮 | 최신 2개 버전만 지원하므로 polyfill 불필요 |
| XSS 공격 가능성 (사용자 입력) | 높 | 낮 | textContent 대신 innerHTML 사용 자제, 이스케이프 처리 |
| 동시성 문제 (다중 탭) | 저 | 중 | localStorage 이벤트 리스너로 동기화 (선택 사항) |

### 3.2 사용자 경험 리스크

| 리스크 | 영향도 | 완화 전략 |
|--------|--------|----------|
| 빈 입력导致的 오동작 | 중 | 입력 유효성 검증 및 placeholder 가이드 |
| 필터 상태 초기화 | 저 | localStorage에 필터 상태 저장 |
| 긴 텍스트 UI 깨짐 | 중 | CSS text-overflow 처리, word-break |

### 3.3 개발 리스크

| 리스크 | 완화 전략 |
|--------|----------|
| 프레임워크 없는 상태 관리 복잡성 | 단방향 데이터 흐름 패턴 적용, 명확한 이벤트 버스 정의 |
| 코드 확장성 부족 | 컴포넌트별 모듈화, 함수 분리 |

## 4. MVP 범위 (MVP Scope)

### 4.1 MVP 포함 항목

| 컴포넌트 | 구현 범위 | 제외 항목 |
|----------|----------|----------|
| **TodoApp** | 상태 관리, localStorage CRUD, 이벤트 버스 | - |
| **TodoList** | 필터링된 태스크 목록 렌더링, 빈 상태 메시지 | 드래그앤드롭 정렬 |
| **TodoItem** | 완료 토글, 삭제 버튼, 취소선 스타일 | 편집 모드 (인라인 수정) |
| **AddTodo** | 텍스트 입력, 엔터키/버튼 제출, 빈 입력 방지 | 멀티라인 입력, 마크다운 지원 |
| **FilterBar** | All/Active/Completed 버튼, 활성 상태 시각화 | 커스텀 필터, 날짜 필터 |

### 4.2 MVP 기능 매핑

| MUST 요구사항 | 매핑 컴포넌트 |
|--------------|---------------|
| Todo CRUD | TodoApp + AddTodo + TodoItem |
| 완료 토글 | TodoItem |
| 삭제 | TodoItem |
| 필터 | FilterBar + TodoList |
| localStorage | TodoApp |

### 4.3 MVP 외 확장 가능성 (Future)

- 다크 모드 (COULD)
- 태스크 개수 카운터 (COULD)
- 태스크 우선순위
- 마감일 설정
- 카테고리/태그

## 5. 기술 선택 근거 (Technology Selection Rationale)

### 5.1 프레임워크 미사용 (Vanilla JS)

| 선택 | 근거 |
|------|------|
| 순수 JavaScript | 요구사항 제약사항 명시, 학습 목적, 경량화 |
| 빌드 도구 미사용 | 단일 HTML 파일 배포 가능성, 개발 환경 단순화 |

### 5.2 상태 관리 패턴

| 패턴 | 근거 |
|------|------|
| 단일 상태 객체 (Single Source of Truth) | TodoApp에서 중앙 집중 관리, 데이터 일관성 보장 |
| 단방향 데이터 흐름 (Unidirectional) | 이벤트 기반 업데이트, 디버깅 용이성 |
| 렌더링 함수 분리 | 각 컴포넌트가 자신만을 담당, 유지보수성 향상 |

### 5.3 저장소 선택

| 선택 | 근거 |
|------|------|
| localStorage | 요구사항 명시, 서버 비용 없음, 브라우저 네이티브 API |
| JSON 직렬화 | 객체 저장/복구 용이, JS 네이티브 지원 |

### 5.4 CSS 전략

| 선택 | 근거 |
|------|------|
| CSS Flexbox | 레이아웃 유연성, 모던 브라우저 지원 |
| CSS 변수 (Custom Properties) | 테마 확장성, 유지보수성 |
| BEM 명명 규칙 (권장) | 클래스 명명 일관성, 스타일 충돌 방지 |

### 5.5 접근성 전략

| 기술 | 근거 |
|------|------|
| ARIA 속성 | 스크린 리더 지원, 의미적 마크업 |
| 키보드 탐색 | Tab 인덱스, 엔터키 지원 |
| 시맨틱 HTML | `<button>`, `<ul>`, `<li>` 등 적절한 태그 사용 |

## 6. 아키텍처 결론

- **단순함**: 최소한의 컴포넌트로 MVP 구현 가능
- **확장성**: 이벤트 기반 아키텍처로 기능 추가 용이
- **유지보수성**: 명확한 책임 분리로 코드 이해도 향상
- **성능**: localStorage 기반 빠른 데이터 접근, 가상 DOM 없이도 충분한 반응속도
