# Obora Kit Dashboard Client

Vite + Preact 기반 대시보드 프론트엔드

## 기술 스택

- Preact (React alternative)
- Vite (빌드 도구)
- TailwindCSS (스타일링)
- TypeScript
- preact-router (라우팅)

## 설치

```bash
npm install
```

## 개발 서버

```bash
npm run dev
```

http://localhost:3000 에서 확인 가능

## 빌드

```bash
npm run build
```

빌드 결과는 `dist/` 디렉토리에 생성됩니다.

## 프리뷰

```bash
npm run preview
```

## 프로젝트 구조

```
src/
├── App.tsx              # 메인 앱 컴포넌트 (라우팅)
├── main.tsx             # 엔트리 포인트
├── index.css            # 글로벌 스타일 (TailwindCSS)
└── hooks/
    └── useSSE.ts        # Server-Sent Events 훅
```

## 주요 기능

### SSE 연결

`useSSE` 훅을 통해 서버와 실시간 통신:

```typescript
const { status, data, error } = useSSE('/sse')

// status: 'connected' | 'connecting' | 'disconnected'
// data: SSEData | null
// error: Error | null
```

- 자동 재연결 (3초 딜레이)
- 연결 상태 추적
- 에러 핸들링

### 라우팅

- `/` - Dashboard (현재 활동)
- `/sessions` - 세션 목록
- `/sessions/:id` - 세션 상세
- `/workflows/:id` - 워크플로우 상세

## 서버 프록시

개발 서버는 다음 경로를 `localhost:3001`로 프록시:

- `/api/*` - API 엔드포인트
- `/sse` - Server-Sent Events

## 타입 체크

```bash
npm run type-check
```
