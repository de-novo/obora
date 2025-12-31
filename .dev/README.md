# .dev - 개발용 멀티 AI 도구

> obora 개발에 멀티 AI 협업을 적용하기 위한 임시 도구
> 목표 기능이 정상 작동하면 이 도구는 deprecated

---

## 목적

obora를 개발하면서 obora의 철학(멀티 AI 협업)을 직접 적용

```
obora 개발 → 멀티 AI로 협업 → 합의된 의사결정 기반 코드 작성
```

---

## 지원 AI (헤드리스 모드)

| AI | 명령어 | JSON 출력 | 상태 |
|----|--------|----------|------|
| Claude Code | `claude -p "prompt"` | `--output-format json` | ✅ |
| Codex CLI | `codex exec "prompt"` | `--json` (JSONL) | ✅ |
| Gemini CLI | `gemini "prompt"` | `-o json` | ✅ |

### 헤드리스 명령어

```bash
# Claude Code
claude -p "프롬프트" --output-format json

# Gemini
gemini "프롬프트" -y -o json 2>/dev/null

# Codex
codex exec "프롬프트" --json
```

### 자동 승인 옵션

| AI | 옵션 | 설명 |
|----|------|------|
| Claude | `--dangerously-skip-permissions` | 모든 권한 체크 우회 |
| Claude | `--permission-mode <mode>` | acceptEdits, bypassPermissions, default, plan |
| Gemini | `-y, --yolo` | 모든 액션 자동 승인 |
| Gemini | `--approval-mode <mode>` | default, auto_edit, yolo |
| Codex | `--full-auto` | 자동 실행 (sandbox workspace-write) |
| Codex | `--dangerously-bypass-approvals-and-sandbox` | 모든 확인 건너뛰기 |
| Codex | `-s, --sandbox <mode>` | read-only, workspace-write, danger-full-access |

### JSON 응답 추출

```bash
# Claude - .result 필드
claude -p "질문" --output-format json | jq -r '.result'

# Gemini - .response 필드
gemini "질문" -y -o json 2>/dev/null | jq -r '.response'

# Codex - JSONL에서 agent_message 추출
codex exec "질문" --json | grep agent_message | jq -r '.item.text'
```

### 토큰/비용 정보

| AI | 필드 |
|----|------|
| Claude | `.usage`, `.total_cost_usd` |
| Gemini | `.stats.models[].tokens` |
| Codex | `.usage` (turn.completed 이벤트) |

---

## 기능

### 1. ask - 여러 AI에게 동시 질문

```bash
bun .dev/ask.ts "이 코드 어떻게 개선할까?"
```

```
[Claude Code]
응답 내용...

[Codex]
응답 내용...

[Gemini]
응답 내용...

→ 각 AI 응답 비교
```

### 2. debate - AI 토론

```bash
bun .dev/debate.ts "REST vs GraphQL 어떤 게 적합할까?"
```

```
Round 1:
[Claude Code]: REST가 적합합니다. 이유는...
[Codex]: 동의하지만, GraphQL도 고려하면...

Round 2:
[Claude Code]: Codex 말대로 GraphQL의 장점은...
[Codex]: 결론적으로 이 규모에선 REST가...

→ 합의: REST 선택
```

### 3. review - 멀티 AI 코드 리뷰

```bash
bun .dev/review.ts src/index.ts
```

```
[Claude Code]: 구조적으로...
[Codex]: 성능 관점에서...

→ 통합 리뷰 결과
```

### 4. decide - 의사결정

```bash
bun .dev/decide.ts "Bun vs Node 어떤 걸 쓸까?"
```

```
각 AI 의견 → 토론 → 합의 → 결정 근거 문서화
```

---

## 사용 흐름

```
1. 개발 중 의사결정 필요
   ↓
2. .dev 도구로 멀티 AI 의견 수집
   ↓
3. AI들 토론 (필요시)
   ↓
4. 합의된 결정 기반으로 코드 작성
   ↓
5. 결정 근거 기록 (.dev/decisions/)
```

---

## 파일 구조

```
.dev/
├── README.md          # 이 문서
├── ask.ts             # 동시 질문
├── debate.ts          # AI 토론
├── review.ts          # 코드 리뷰
├── decide.ts          # 의사결정
├── lib/
│   ├── claude.ts      # Claude Code 헤드리스
│   ├── codex.ts       # Codex CLI
│   ├── gemini.ts      # Gemini CLI
│   └── runner.ts      # AI 실행 공통
└── decisions/         # 의사결정 기록
    └── 001-runtime.md # 예: Bun 선택 이유
```

---

## TODO

- [x] Claude Code 헤드리스 테스트
- [x] Codex CLI 헤드리스 테스트
- [x] Gemini CLI 헤드리스 테스트
- [ ] lib/ 래퍼 구현
- [ ] ask.ts 기본 구현
- [ ] debate.ts 기본 구현
