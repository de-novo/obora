---
paths:
  - "**/*.{ts,tsx,js,jsx,mts,cts}"
  - "**/*.{py,rb,java,kt,go,rs,cs}"
  - "**/*.{html,css,scss}"
---

# No Deprecated

Deprecated된 문법, API, 라이브러리는 절대 사용하지 않습니다.

## 핵심 원칙

**항상 최신 권장 방식 사용**: Deprecated는 향후 제거 예정이므로 처음부터 사용하지 않습니다.

## 확인 방법

### 1. 공식 문서 확인

코드 작성 전 해당 API/문법의 최신 문서 확인:

```
WebFetch: [라이브러리/언어 공식 문서]
Prompt: Check if [API/syntax] is deprecated and find recommended alternative
```

### 2. IDE/린터 경고 확인

- `@deprecated` JSDoc 태그
- TypeScript deprecated 경고
- ESLint deprecated 규칙

### 3. CHANGELOG 확인

라이브러리 업데이트 시 deprecated 항목 확인

## 금지 예시

### JavaScript/TypeScript

```typescript
// Bad - deprecated
arguments.callee
with (obj) { }
document.write()
new Buffer()
__proto__

// Good - modern alternatives
// arguments.callee → named function
// with → destructuring
// document.write → DOM manipulation
// new Buffer() → Buffer.from()
// __proto__ → Object.getPrototypeOf()
```

### React

```typescript
// Bad - deprecated
componentWillMount()
componentWillReceiveProps()
componentWillUpdate()
ReactDOM.render()
defaultProps (in function components with TS)

// Good - modern alternatives
// componentWillMount → useEffect
// componentWillReceiveProps → useEffect with deps
// componentWillUpdate → useEffect
// ReactDOM.render → createRoot
// defaultProps → default parameters
```

### Node.js

```typescript
// Bad - deprecated
url.parse()
querystring.parse()
fs.exists()
path.extname(filename).substr(1)

// Good - modern alternatives
// url.parse → new URL()
// querystring → URLSearchParams
// fs.exists → fs.access or fs.stat
// .substr() → .slice()
```

### HTML/CSS

```html
<!-- Bad - deprecated -->
<center>, <font>, <marquee>
<table border="1">
<body bgcolor="">

<!-- Good - use CSS -->
```

## 워크플로우

```
1. 코드 작성 전 → 문서에서 최신 방식 확인
2. 코드 작성 중 → IDE 경고 무시하지 않음
3. 코드 리뷰 시 → deprecated 사용 여부 확인
4. 의존성 업데이트 시 → breaking changes 확인
```

## 기존 deprecated 코드 발견 시

1. 즉시 수정 (영향 범위가 작은 경우)
2. 이슈/TODO 등록 (영향 범위가 큰 경우)
3. 새 코드에서는 절대 사용 금지

## 이유

- **향후 제거**: Deprecated는 언제든 삭제될 수 있음
- **보안 취약점**: 오래된 API는 보안 문제 가능성
- **성능 저하**: 최신 대안이 대체로 더 효율적
- **유지보수 부담**: 나중에 마이그레이션 비용 발생
