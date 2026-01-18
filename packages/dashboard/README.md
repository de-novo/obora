# obora Dashboard

Claude Code 세션 및 워크플로우 모니터링 대시보드

## 빠른 시작

```bash
# 개발 서버 실행
pnpm dev

# 브라우저에서 접속
open http://localhost:3847
```

## 기능

### 프로젝트 관리

- **프로젝트 자동 생성**: Claude Code 세션 시작 시 CWD 기반 프로젝트 자동 생성
- **프로젝트 선택기**: 헤더에서 프로젝트 선택하여 데이터 필터링
- **전체 보기**: "All Projects" 선택 시 모든 데이터 표시

### 대시보드 홈 (`/`)

- **통계 카드**: 총 프로젝트, 활성 세션, 워크플로우, 토큰 사용량
- **최근 워크플로우**: 최근 실행된 워크플로우 목록
- 프로젝트 필터링 적용

### 세션 모니터링 (`/sessions`)

- **세션 목록**: 모든 Claude Code 세션 표시
- **상태 표시**: active, idle, completed
- **세션 상세**: 세션별 토큰 사용량, 요청/응답 수
- 프로젝트 필터링 적용

### 워크플로우 추적 (`/workflows`)

- **워크플로우 목록**: 실행된 워크플로우 표시
- **상태 표시**: planning, running, completed, failed
- **실시간 갱신**: 진행 중인 워크플로우 2초마다 자동 새로고침
- 프로젝트 필터링 적용

### 워크플로우 상세 (`/workflows/[id]`)

- **워크플로우 정보**: 이름, 유형, 상태, 실행 시간
- **단계별 진행**: 각 단계의 에이전트 및 작업 내용
- **실시간 업데이트**: 진행 중 상태 자동 갱신

## 데이터 소스

모든 데이터는 `~/.obora/dashboard.db` (SQLite)에 저장됩니다.

### 스키마

```
projects       # 프로젝트 정보 (id, name, path)
sessions       # Claude Code 세션
workflows      # 워크플로우 실행 기록
workflow_steps # 워크플로우 단계
```

### 데이터 수집

Claude Code의 hooks를 통해 자동으로 데이터 수집:

- `SessionStart`: 세션 시작 시 기록
- `SessionEnd`: 세션 종료 시 기록
- `UserPromptSubmit`: 프롬프트 제출 시 기록
- `Stop`: 응답 완료 시 기록
- `SubagentStart/Stop`: 에이전트 실행 기록
- `PreToolUse/PostToolUse`: Task 도구 사용 기록

## 기술 스택

- **Framework**: Next.js 15 (App Router)
- **State Management**: TanStack Query v5
- **UI**: Tailwind CSS + shadcn/ui
- **Database**: SQLite + Drizzle ORM

## API 엔드포인트

| Endpoint | 설명 |
|----------|------|
| `GET /api/projects` | 프로젝트 목록 |
| `GET /api/stats` | 대시보드 통계 |
| `GET /api/sessions` | 세션 목록 |
| `GET /api/workflows` | 워크플로우 목록 |
| `GET /api/workflows/[id]` | 워크플로우 상세 |

### 쿼리 파라미터

- `projectId`: 프로젝트별 필터링
- `limit`: 결과 개수 제한

## 개발

```bash
# 의존성 설치
pnpm install

# 개발 서버 실행
pnpm dev

# 빌드
pnpm build

# 프로덕션 실행
pnpm start
```

## 환경 설정

```bash
# 포트 변경 (기본: 3847)
PORT=3847 pnpm dev
```

## 문제 해결

### 데이터가 표시되지 않음

1. Claude Code hooks 설정 확인:
   ```bash
   cat .claude/settings.json
   ```

2. 데이터베이스 파일 확인:
   ```bash
   ls -la ~/.obora/dashboard.db
   ```

3. 로그 스크립트 실행 권한 확인:
   ```bash
   chmod +x .claude/scripts/obora/logging/*.sh
   ```

### 프로젝트가 생성되지 않음

- `obora init` 실행 후 새 Claude Code 세션 시작
- hooks의 git root resolution 확인

## 라이선스

MIT
