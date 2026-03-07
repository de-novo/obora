# TODO 앱 디자인 시스템

**버전**: 1.0  
**작성일**: 2026-03-04  
**수정일**: 2026-03-04  
**작성자**: UI/UX 설계자

---

## 1. 개요

본 문서는 TODO 앱의 디자인 시스템을 정의합니다. UI/UX 스펙(`docs/20-uiux-spec.md`)의 디자인 토큰 매핑을 확장하여, 색상, 타이포그래피, 간격, 둥근 모서리, 그림자, 애니메이션 등의 디자인 요소를 체계적으로 정의합니다.

### 1.1 디자인 시스템 구성

| 카테고리 | 설명 |
|----------|------|
| Color (색상) | 색상 팔레트 및 의미 |
| Typography (타이포그래피) | 폰트, 크기, 행 높이, 자간 |
| Spacing (간격) | 여백 시스템 (4px base) |
| Radius (둥근 모서리) | 코너 레디우스 |
| Shadow (그림자) | 깊이와 계층 |
| Animation (애니메이션) | 트랜지션과 이징 |
| Icon (아이콘) | 아이콘 시스템 |
| Component Variants (컴포넌트 변형) | 주요 컴포넌트 스타일 |

---

## 2. Color (색상)

### 2.1 색상 철학

- **명확성**: 상태를 직관적으로 구분
- **접근성**: WCAG AA 대비비 준수
- **일관성**: 의미 있는 색상 재사용

### 2.2 프라이머리 색상

| 토큰명 | CSS 변수 | 값 | 사용처 |
|--------|----------|-----|--------|
| Primary | `--color-primary` | #4F46E5 | 버튼, 활성 상태, 포커스 |
| Primary Hover | `--color-primary-hover` | #4338CA | 버튼 hover, active |
| Primary Active | `--color-primary-active` | #3730A3 | 버튼 눌림 상태 |

### 2.3 뉴트럴 색상

| 토큰명 | CSS 변수 | 값 | 사용처 |
|--------|----------|-----|--------|
| Gray 50 | `--color-gray-50` | #F9FAFB | 대체 배경 |
| Gray 100 | `--color-gray-100` | #F3F4F6 | 입력 필드 배경 |
| Gray 200 | `--color-gray-200` | #E5E7EB | 테두리, 구분선 |
| Gray 300 | `--color-gray-300` | #D1D5DB | 비활성 상태 테두리 |
| Gray 400 | `--color-gray-400` | #9CA3AF | 플레이스홀더, 완료 텍스트 |
| Gray 500 | `--color-gray-500` | #6B7280 | 보조 텍스트 |
| Gray 600 | `--color-gray-600` | #4B5563 | 중간 강조 텍스트 |
| Gray 700 | `--color-gray-700` | #374151 | 강조 텍스트 |
| Gray 800 | `--color-gray-800` | #1F2937 | 강한 텍스트 |
| Gray 900 | `--color-gray-900` | #111827 | 기본 텍스트 |

### 2.4 시맨틱 색상

| 토큰명 | CSS 변수 | 값 | 사용처 |
|--------|----------|-----|--------|
| Error | `--color-error` | #DC2626 | 오류 텍스트, 아이콘 |
| Error Background | `--color-error-bg` | #FEF2F2 | 오류 배경 |
| Error Border | `--color-error-border` | #FECACA | 오류 테두리 |
| Success | `--color-success` | #059669 | 성공 상태 (예비) |
| Success Background | `--color-success-bg` | #ECFDF5 | 성공 배경 (예비) |
| Warning | `--color-warning` | #D97706 | 경고 상태 (예비) |
| Warning Background | `--color-warning-bg` | #FFFBEB | 경고 배경 (예비) |

### 2.5 상태 색상 매핑

| 상태 | 색상 | 적용 |
|------|------|------|
| Default | 그레이 톤 | 비활성 상태 |
| Active | Primary | 활성 필터, 포커스 |
| Completed | Gray 400 | 완료된 태스크 텍스트 |
| Error | Error | 오류 메시지 |

### 2.6 다크 모드 색상 (예비)

| 토큰명 | CSS 변수 | 값 |
|--------|----------|-----|
| Background Dark | `--color-bg-dark` | #111827 |
| Surface Dark | `--color-surface-dark` | #1F2937 |
| Text Dark | `--color-text-dark` | #F9FAFB |

---

## 3. Typography (타이포그래피)

### 3.1 폰트 스택

| 토큰명 | CSS 변수 | 값 |
|--------|----------|-----|
| Font Family Base | `--font-family-base` | -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif |
| Font Family Mono | `--font-family-mono` | "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace |

### 3.2 폰트 크기

| 토큰명 | CSS 변수 | 값 | rem 값 | 사용처 |
|--------|----------|-----|--------|--------|
| Text Xs | `--font-size-xs` | 12px | 0.75rem | 라벨, 캡션 |
| Text Sm | `--font-size-sm` | 14px | 0.875rem | 보조 텍스트 |
| Text Base | `--font-size-base` | 16px | 1rem | 기본 텍스트 |
| Text Lg | `--font-size-lg` | 18px | 1.125rem | 중간 강조 |
| Text Xl | `--font-size-xl` | 20px | 1.25rem | 강조 |
| Text 2xl | `--font-size-2xl` | 24px | 1.5rem | 제목 (예비) |

### 3.3 폰트 웨이트

| 토큰명 | CSS 변수 | 값 | 사용처 |
|--------|----------|-----|--------|
| Weight Normal | `--font-weight-normal` | 400 | 기본 텍스트 |
| Weight Medium | `--font-weight-medium` | 500 | 버튼, 강조 |
| Weight Semibold | `--font-weight-semibold` | 600 | 강한 강조 |
| Weight Bold | `--font-weight-bold` | 700 | 제목 (예비) |

### 3.4 행 높이 (Line Height)

| 토큰명 | CSS 변수 | 값 | 사용처 |
|--------|----------|-----|--------|
| Leading Tight | `--line-height-tight` | 1.25 | 제목 |
| Leading Normal | `--line-height-normal` | 1.5 | 기본 텍스트 |
| Leading Relaxed | `--line-height-relaxed` | 1.75 | 긴 텍스트 (예비) |

### 3.5 자간 (Letter Spacing)

| 토큰명 | CSS 변수 | 값 | 사용처 |
|--------|----------|-----|--------|
| Tracking Tight | `--letter-spacing-tight` | -0.025em | 대문자 텍스트 |
| Tracking Normal | `--letter-spacing-normal` | 0 | 기본 |
| Tracking Wide | `--letter-spacing-wide` | 0.025em | 라벨 (예비) |

### 3.6 타이포그래피 조합

| 이름 | 크기 | 웨이트 | 행 높이 | 자간 | 사용처 |
|------|------|--------|----------|------|--------|
| Body Large | 18px | 400 | 1.5 | normal | 태스크 텍스트 |
| Body Base | 16px | 400 | 1.5 | normal | 기본 텍스트 |
| Body Small | 14px | 400 | 1.5 | normal | 보조 텍스트, 플레이스홀더 |
| Label | 14px | 500 | 1.25 | normal | 버튼, 필터 |
| Caption | 12px | 400 | 1.5 | normal | 에러 메시지 |

---

## 4. Spacing (간격)

### 4.1 간격 시스템

4px 기반의 8단계 간격 시스템

| 토큰명 | CSS 변수 | 값 | 사용처 |
|--------|----------|-----|--------|
| Space 0 | `--spacing-0` | 0 | 간격 없음 |
| Space 1 | `--spacing-1` | 4px | 최소 간격, 아이콘 내부 |
| Space 2 | `--spacing-2` | 8px | 아이콘 패딩, 작은 요소 간격 |
| Space 3 | `--spacing-3` | 12px | 중간 간격 |
| Space 4 | `--spacing-4` | 16px | 기본 간격, 요소 패딩 |
| Space 5 | `--spacing-5` | 20px | 중간 섹션 간격 |
| Space 6 | `--spacing-6` | 24px | 섹션 간격 |
| Space 8 | `--spacing-8` | 32px | 큰 섹션 간격 |
| Space 10 | `--spacing-10` | 40px | 컨테이너 패딩 |
| Space 12 | `--spacing-12` | 48px | 큰 컨테이너 패딩 (예비) |
| Space 16 | `--spacing-16` | 64px | 페이지 패딩 (예비) |

### 4.2 별칭 매핑

| 별칭 | CSS 변수 | 값 |
|------|----------|-----|
| `--spacing-xs` | `--spacing-1` | 4px |
| `--spacing-sm` | `--spacing-2` | 8px |
| `--spacing-md` | `--spacing-4` | 16px |
| `--spacing-lg` | `--spacing-6` | 24px |
| `--spacing-xl` | `--spacing-8` | 32px |

### 4.3 컴포넌트별 간격 적용

| 컴포넌트 | 패딩 | 마진 | 간격 |
|----------|------|------|------|
| AddTodo | 12px 16px | 0 0 24px | - |
| Input Field | 12px 16px | - | 8px (버튼과) |
| FilterBar | 8px 16px | 0 0 24px | 8px (버튼 간) |
| TodoList | 0 | 0 | 0 |
| TodoItem | 12px 16px | 0 | 4px (하단) |
| Error Banner | 12px 16px | 0 0 16px | - |
| Empty State | 32px 16px | 0 | - |

---

## 5. Radius (둥근 모서리)

| 토큰명 | CSS 변수 | 값 | 사용처 |
|--------|----------|-----|--------|
| Radius None | `--radius-none` | 0 | 직사각형 (예비) |
| Radius Sm | `--radius-sm` | 4px | 작은 모서리, 체크박스 |
| Radius Md | `--radius-md` | 8px | 기본 모서리, 버튼 |
| Radius Lg | `--radius-lg` | 12px | 큰 모서리, 카드 (예비) |
| Radius Xl | `--radius-xl` | 16px | 더 큰 모서리 (예비) |
| Radius 2xl | `--radius-2xl` | 24px | 컨테이너 (예비) |
| Radius Full | `--radius-full` | 9999px | 원형 버튼, 아바타 (예비) |

### 5.1 컴포넌트별 레디우스 적용

| 컴포넌트 | 레디우스 |
|----------|----------|
| Input Field | 8px (`--radius-md`) |
| Add Button | 8px (`--radius-md`) |
| Filter Button | 8px (`--radius-md`) |
| Delete Button | 8px (`--radius-md`) |
| Checkbox | 4px (`--radius-sm`) |
| Error Banner | 8px (`--radius-md`) |
| TodoItem | 8px (`--radius-md`) |

---

## 6. Shadow (그림자)

### 6.1 그림자 시스템

| 토큰명 | CSS 변수 | 값 | 사용처 |
|--------|----------|-----|--------|
| Shadow Sm | `--shadow-sm` | 0 1px 2px 0 rgba(0, 0, 0, 0.05) | 작은 높이 |
| Shadow Md | `--shadow-md` | 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06) | 기본 그림자 |
| Shadow Lg | `--shadow-lg` | 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05) | 큰 높이 (예비) |
| Shadow Xl | `--shadow-xl` | 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04) | 더 큰 높이 (예비) |
| Shadow Focus | `--shadow-focus` | 0 0 0 3px rgba(79, 70, 229, 0.3) | 포커스 링 |

### 6.2 컴포넌트별 그림자 적용

| 컴포넌트 | 기본 상태 | Hover 상태 | Focus 상태 |
|----------|----------|-----------|-----------|
| Input Field | none | `--shadow-sm` | `--shadow-focus` |
| Button | none | `--shadow-sm` | `--shadow-focus` |
| TodoItem | none | `--shadow-sm` | `--shadow-focus` |
| Error Banner | `--shadow-sm` | - | - |

---

## 7. Border (테두리)

### 7.1 테두리 두께

| 토큰명 | CSS 변수 | 값 | 사용처 |
|--------|----------|-----|--------|
| Border Width 0 | `--border-width-0` | 0 | 테두리 없음 |
| Border Width 1 | `--border-width-1` | 1px | 기본 테두리 |
| Border Width 2 | `--border-width-2` | 2px | 강조 테두리 (예비) |

### 7.2 테두리 스타일

| 토큰명 | CSS 변수 | 값 | 사용처 |
|--------|----------|-----|--------|
| Border Style | `--border-style` | solid | 기본 스타일 |
| Border Style Dashed | `--border-style-dashed` | dashed | 점선 (예비) |

### 7.3 컴포넌트별 테두리 적용

| 컴포넌트 | 두께 | 색상 | 스타일 |
|----------|------|------|------|
| Input Field | 1px | Gray 300 | solid |
| Input Field (Error) | 1px | Error | solid |
| Filter Button | 1px | Gray 200 | solid |
| Filter Button (Active) | 1px | Primary | solid |
| TodoItem | 0 | - | - |
| Error Banner | 1px | Error Border | solid |

---

## 8. Z-Index (계층)

| 토큰명 | CSS 변수 | 값 | 사용처 |
|--------|----------|-----|--------|
| Z Base | `--z-base` | 0 | 기본 요소 |
| Z Dropdown | `--z-dropdown` | 10 | 드롭다운 (예비) |
| Z Sticky | `--z-sticky` | 20 | 스티키 요소 (예비) |
| Z Fixed | `--z-fixed` | 30 | 고정 요소 (예비) |
| Z Modal | `--z-modal` | 40 | 모달 (예비) |
| Z Toast | `--z-toast` | 50 | 토스트 (예비) |

---

## 9. Animation (애니메이션)

### 9.1 트랜지션

| 토큰명 | CSS 변수 | 값 | 사용처 |
|--------|----------|-----|--------|
| Duration Fastest | `--duration-fastest` | 50ms | 즉시 반응 (예비) |
| Duration Fast | `--duration-fast` | 150ms | 버튼 hover |
| Duration Base | `--duration-base` | 250ms | 기본 트랜지션 |
| Duration Slow | `--duration-slow` | 350ms | 느린 트랜지션 (예비) |

### 9.2 이징 함수 (Easing)

| 토큰명 | CSS 변수 | 값 | 사용처 |
|--------|----------|-----|--------|
| Ease Linear | `--ease-linear` | linear | 일정한 속도 |
| Ease In | `--ease-in` | cubic-bezier(0.4, 0, 1, 1) | 들어가는 애니메이션 |
| Ease Out | `--ease-out` | cubic-bezier(0, 0, 0.2, 1) | 나가는 애니메이션 (추천) |
| Ease In Out | `--ease-in-out` | cubic-bezier(0.4, 0, 0.2, 1) | 양방향 애니메이션 |

### 9.3 키프레임 애니메이션

| 이름 | CSS 변수 | 설명 |
|------|----------|------|
| Fade In | `--animation-fade-in` | opacity: 0 → 1 |
| Fade Out | `--animation-fade-out` | opacity: 1 → 0 |
| Slide In Up | `--animation-slide-in-up` | transform: translateY(20px) → 0 |
| Slide Out Right | `--animation-slide-out-right` | transform: translateX(0) → 100% |
| Scale In | `--animation-scale-in` | transform: scale(0.95) → 1 |

### 9.4 리듀스 모션

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 10. Icon (아이콘)

### 10.1 아이콘 시스템

- **형식**: SVG (inline)
- **크기**: 16px, 20px, 24px
- **색상**: 현재 텍스트 색상 상속 (`currentColor`)
- **스트로크**: 2px stroke

### 10.2 아이콘 목록

| 이름 | SVG | 사용처 |
|------|-----|--------|
| Check (체크) | ✓ | 완료된 태스크, 체크박스 |
| Plus (플러스) | + | 추가 버튼 |
| X (닫기) | ✕ | 삭제 버튼 |
| Alert (경고) | ⚠ | 에러 상태 |
| Info (정보) | ℹ | 정보 (예비) |
| Empty (빈 상태) | 📋 | 빈 상태 아이콘 (예비) |

### 10.3 아이콘 크기 토큰

| 토큰명 | CSS 변수 | 값 | 사용처 |
|--------|----------|-----|--------|
| Icon Xs | `--icon-xs` | 12px | 작은 아이콘 (예비) |
| Icon Sm | `--icon-sm` | 16px | 작은 아이콘 |
| Icon Md | `--icon-md` | 20px | 기본 아이콘 |
| Icon Lg | `--icon-lg` | 24px | 큰 아이콘 |
| Icon Xl | `--icon-xl` | 32px | 더 큰 아이콘 (예비) |

---

## 11. Component Variants (컴포넌트 변형)

### 11.1 Button (버튼)

| 변형 | 크기 | 배경색 | 텍스트색 | 레디우스 | 패딩 |
|------|------|--------|----------|----------|------|
| Primary | Md | Primary | White | 8px | 10px 20px |
| Primary Sm | Sm | Primary | White | 8px | 8px 16px |
| Primary Lg | Lg | Primary | White | 8px | 12px 24px |
| Ghost | Md | Transparent | Gray 700 | 8px | 10px 20px |
| Ghost (Hover) | Md | Gray 100 | Gray 700 | 8px | 10px 20px |
| Destructive | Md | Error | White | 8px | 10px 20px |
| Destructive Sm | Sm | Error | White | 8px | 8px 16px |

**버튼 상태:**
- Default: 기본 스타일
- Hover: `--shadow-sm`, 색상 변화
- Focus: `--shadow-focus`
- Active: Primary Active 색상
- Disabled: `opacity: 0.5`, `pointer-events: none`

### 11.2 Input (입력 필드)

| 변형 | 배경색 | 테두리색 | 플레이스홀더색 | 레디우스 | 패딩 |
|------|--------|----------|---------------|----------|------|
| Default | White | Gray 300 | Gray 400 | 8px | 12px 16px |
| Focus | White | Primary | - | 8px | 12px 16px |
| Error | Error Background | Error | - | 8px | 12px 16px |
| Disabled | Gray 100 | Gray 200 | Gray 400 | 8px | 12px 16px |

### 11.3 Filter Button (필터 버튼)

| 상태 | 배경색 | 테두리색 | 텍스트색 | 레디우스 | 패딩 |
|------|--------|----------|----------|----------|------|
| Default | White | Gray 200 | Gray 700 | 8px | 8px 16px |
| Active | Primary | Primary | White | 8px | 8px 16px |
| Hover | Gray 50 | Gray 300 | Gray 700 | 8px | 8px 16px |
| Focus | White | Primary | Gray 700 | 8px | 8px 16px |

### 11.4 Checkbox (체크박스)

| 상태 | 크기 | 배경색 | 테두리색 | 체크색 | 레디우스 |
|------|------|--------|----------|--------|----------|
| Default | 20px | White | Gray 400 | - | 4px |
| Checked | 20px | Primary | Primary | White | 4px |
| Hover | 20px | White | Gray 500 | - | 4px |
| Focus | 20px | White | Primary | - | 4px |

### 11.5 Delete Button (삭제 버튼)

| 상태 | 배경색 | 텍스트색 | 아이콘색 | 레디우스 | 패딩 |
|------|--------|----------|----------|----------|------|
| Default | Transparent | Error | Error | 8px | 8px |
| Hover | Error Background | Error | Error | 8px | 8px |
| Focus | Error Background | Error | Error | 8px | 8px |

### 11.6 TodoItem (태스크 항목)

| 상태 | 배경색 | 테두리 | 레디우스 | 패딩 |
|------|--------|--------|----------|------|
| Default | White | none | 8px | 12px 16px |
| Hover | Gray 50 | none | 8px | 12px 16px |
| Completed | White | none | 8px | 12px 16px |
| Focus | White | 1px Primary | 8px | 12px 16px |

### 11.7 Error Banner (에러 배너)

| 속성 | 값 |
|------|-----|
| 배경색 | Error Background |
| 테두리 | 1px Error Border |
| 텍스트색 | Error |
| 레디우스 | 8px |
| 패딩 | 12px 16px |
| 아이콘 | Alert (16px) |

### 11.8 Empty State (빈 상태)

| 속성 | 값 |
|------|-----|
| 배경색 | Transparent |
| 텍스트색 | Gray 500 |
| 레디우스 | - |
| 패딩 | 32px 16px |
| 아이콘 | Empty (48px, Gray 300) |
| 텍스트 | 18px, Medium |

---

## 12. Focus Styles (포커스 스타일)

### 12.1 포커스 가시성

```css
:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* 포커스 링 대안 */
.focus-ring {
  box-shadow: var(--shadow-focus);
}
```

### 12.2 포커스 순서

1. Input Field (새 태스크 입력)
2. Add Button
3. Filter Buttons (All → Active → Completed)
4. TodoItem Checkbox (순서대로)
5. TodoItem Delete Button (순서대로)

---

## 13. Responsive Breakpoints (반응형 브레이크포인트)

### 13.1 브레이크포인트 정의

| 이름 | 최소 너비 | 최대 너비 | 타겟 디바이스 |
|------|----------|----------|--------------|
| Mobile | 320px | 374px | 소형 모바일 |
| Mobile Lg | 375px | 767px | 대형 모바일 |
| Tablet | 768px | 1023px | 태블릿 |
| Desktop | 1024px | - | 데스크톱 |

### 13.2 컨테이너 최대 너비

| 이름 | CSS 변수 | 값 |
|------|----------|-----|
| Container Sm | `--container-sm` | 640px |
| Container Md | `--container-md` | 768px |
| Container Lg | `--container-lg` | 1024px |
| Container Xl | `--container-xl` | 1280px (예비) |

---

## 14. CSS Variables (CSS 변수 요약)

### 14.1 완전한 CSS 변수 세트

```css
:root {
  /* Colors */
  --color-primary: #4F46E5;
  --color-primary-hover: #4338CA;
  --color-primary-active: #3730A3;
  
  --color-gray-50: #F9FAFB;
  --color-gray-100: #F3F4F6;
  --color-gray-200: #E5E7EB;
  --color-gray-300: #D1D5DB;
  --color-gray-400: #9CA3AF;
  --color-gray-500: #6B7280;
  --color-gray-600: #4B5563;
  --color-gray-700: #374151;
  --color-gray-800: #1F2937;
  --color-gray-900: #111827;
  
  --color-error: #DC2626;
  --color-error-bg: #FEF2F2;
  --color-error-border: #FECACA;
  
  --color-bg: #FFFFFF;
  --color-bg-alt: #F9FAFB;
  --color-text: #111827;
  --color-text-muted: #9CA3AF;
  
  /* Typography */
  --font-family-base: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-family-mono: "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  
  --font-size-xs: 12px;
  --font-size-sm: 14px;
  --font-size-base: 16px;
  --font-size-lg: 18px;
  --font-size-xl: 20px;
  --font-size-2xl: 24px;
  
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
  
  --line-height-tight: 1.25;
  --line-height-normal: 1.5;
  --line-height-relaxed: 1.75;
  
  --letter-spacing-tight: -0.025em;
  --letter-spacing-normal: 0;
  --letter-spacing-wide: 0.025em;
  
  /* Spacing */
  --spacing-0: 0;
  --spacing-1: 4px;
  --spacing-2: 8px;
  --spacing-3: 12px;
  --spacing-4: 16px;
  --spacing-5: 20px;
  --spacing-6: 24px;
  --spacing-8: 32px;
  --spacing-10: 40px;
  --spacing-12: 48px;
  --spacing-16: 64px;
  
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  
  /* Radius */
  --radius-none: 0;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-2xl: 24px;
  --radius-full: 9999px;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  --shadow-focus: 0 0 0 3px rgba(79, 70, 229, 0.3);
  
  /* Borders */
  --border-width-0: 0;
  --border-width-1: 1px;
  --border-width-2: 2px;
  --border-style: solid;
  
  /* Z-Index */
  --z-base: 0;
  --z-dropdown: 10;
  --z-sticky: 20;
  --z-fixed: 30;
  --z-modal: 40;
  --z-toast: 50;
  
  /* Animation */
  --duration-fastest: 50ms;
  --duration-fast: 150ms;
  --duration-base: 250ms;
  --duration-slow: 350ms;
  
  --ease-linear: linear;
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  
  /* Icons */
  --icon-xs: 12px;
  --icon-sm: 16px;
  --icon-md: 20px;
  --icon-lg: 24px;
  --icon-xl: 32px;
  
  /* Containers */
  --container-sm: 640px;
  --container-md: 768px;
  --container-lg: 1024px;
  --container-xl: 1280px;
}
```

---

## 15. 다크 모드 (예비)

### 15.1 다크 모드 CSS 변수

```css
:root[data-theme="dark"] {
  --color-bg: #111827;
  --color-bg-alt: #1F2937;
  --color-text: #F9FAFB;
  --color-text-muted: #9CA3AF;
  --color-gray-50: #1F2937;
  --color-gray-100: #374151;
  --color-gray-200: #4B5563;
  --color-gray-300: #6B7280;
  --color-gray-400: #9CA3AF;
  --color-gray-500: #D1D5DB;
  --color-gray-600: #E5E7EB;
  --color-gray-700: #F3F4F6;
  --color-gray-800: #F9FAFB;
  --color-gray-900: #FFFFFF;
}
```

---

## 16. 적용 가이드

### 16.1 새 컴포넌트 디자인 시

1. 색상: 시맨틱 색상 토큰 사용 (`--color-primary`, `--color-error`)
2. 간격: 4px 기반 간격 시스템 사용 (`--spacing-4`)
3. 레디우스: 정의된 레디우스 토큰 사용 (`--radius-md`)
4. 타이포그래피: 정의된 타이포그래피 조합 사용
5. 포커스: `--shadow-focus` 또는 `:focus-visible` 사용
6. 애니메이션: `--duration-base`, `--ease-out` 사용

### 16.2 디자인 토큰 사용 원칙

| 원칙 | 설명 |
|------|------|
| 하드코딩 금지 | 모든 값은 CSS 변수로 정의 |
| 의미적 사용 | 색상/간격은 목적에 맞는 토큰 사용 |
| 일관성 | 같은 용도의 요소는 동일한 토큰 사용 |
| 확장성 | 새로운 값은 기존 패턴 따르기 |

---

## 17. 관련 문서

- **UI/UX 스펙**: `docs/20-uiux-spec.md`
- **디자인 토큰 JSON**: `docs/21-design-tokens.json`
- **컴포넌트 스펙**: `docs/22-component-specs.md` (다음 단계)

---

**문서 상태**: COMPLETE  
**다음 검토**: 컴포넌트 스펙 (`docs/22-component-specs.md`)
