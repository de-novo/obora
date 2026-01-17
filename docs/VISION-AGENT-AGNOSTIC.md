# Vision: Agent-Agnostic obora-kit

> **Goal**: obora-kit이 Vercel Skills처럼 모든 AI 에이전트에서 작동하는 범용 워크플로우 시스템이 되는 것

## 현재 상태 vs 목표

```
현재 (2025-01)                      목표
────────────────────────────────────────────────────────
Claude Code 전용          →        15+ AI 에이전트 지원
수동 복사 배포            →        npx/패키지 매니저 배포
프로젝트 레벨 설정        →        글로벌 + 프로젝트 레벨
워크플로우 중심           →        스킬 + 워크플로우 통합
```

## 목표 지원 에이전트

Vercel Skills가 지원하는 15개 에이전트를 참고:

| 에이전트 | 형태 | 우선순위 |
|---------|------|----------|
| Claude Code | CLI | ✅ 현재 지원 |
| Cursor | IDE | P1 |
| Codex | CLI | P1 |
| Windsurf | IDE | P2 |
| OpenCode | CLI | P2 |
| Gemini CLI | CLI | P2 |
| Cline | IDE Extension | P2 |
| GitHub Copilot | IDE | P3 |
| Zed AI | IDE | P3 |
| Continue | IDE Extension | P3 |
| Amp | ? | P3 |
| Aider | CLI | P3 |
| Tabnine | IDE | P4 |
| Void | ? | P4 |
| PearAI | ? | P4 |

## 아키텍처 비전

### 현재 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                     Claude Code                          │
│                         ↓                                │
│  ┌───────────────────────────────────────────────────┐  │
│  │              obora-kit (.claude/)                 │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ │  │
│  │  │ skills  │ │ agents  │ │ rules   │ │commands │ │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 목표 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│   Claude Code │ Cursor │ Codex │ Windsurf │ ...        │
│                         ↓                                │
│  ┌───────────────────────────────────────────────────┐  │
│  │           obora-kit (Agent-Agnostic)              │  │
│  │                                                   │  │
│  │  ┌─────────────────────────────────────────────┐ │  │
│  │  │              Core Layer                     │ │  │
│  │  │  - Skill definitions (SKILL.md)            │ │  │
│  │  │  - Workflow definitions                    │ │  │
│  │  │  - Rule definitions                        │ │  │
│  │  └─────────────────────────────────────────────┘ │  │
│  │                       ↓                          │  │
│  │  ┌─────────────────────────────────────────────┐ │  │
│  │  │            Adapter Layer                    │ │  │
│  │  │  - Claude adapter (.claude/)               │ │  │
│  │  │  - Cursor adapter (.cursorrules)           │ │  │
│  │  │  - Codex adapter (.codex/)                 │ │  │
│  │  │  - Windsurf adapter (.windsurfrules)       │ │  │
│  │  └─────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## 호환성 레이어 설계

### 1. 통합 스킬 형식

Vercel Skills와 Claude 공식 형식의 상위 집합(superset):

```yaml
---
# 필수 (Vercel + Claude 공통)
name: skill-name
description: When to use this skill

# Vercel 스타일 (배포/공유)
license: MIT
metadata:
  author: obora-labs
  version: "1.0.0"

# Claude 스타일 (도구/권한)
allowed-tools: Read, Write, Glob
user-invocable: true
model: sonnet

# obora 확장 (워크플로우)
workflow:
  type: dynamic          # static | dynamic
  planner: true          # planner 사용 여부
  feedback-loop: true    # 피드백 루프 활성화
---

# Skill Content (Markdown)
```

### 2. 에이전트별 어댑터

각 에이전트의 설정 형식으로 자동 변환:

```
obora-kit/.obora/skills/my-skill/
├── SKILL.md                    # 통합 형식 (원본)
├── .claude/skills/my-skill/    # Claude Code용 (생성)
├── .cursorrules                # Cursor용 (생성)
└── .codex/                     # Codex용 (생성)
```

### 3. 변환 규칙

| obora 필드 | Claude | Cursor | Codex |
|-----------|--------|--------|-------|
| `name` | `name` | 파일명 | `name` |
| `description` | `description` | 주석 | `description` |
| `allowed-tools` | `allowed-tools` | ❌ | ❌ |
| `model` | `model` | ❌ | ❌ |
| `workflow` | 내부 처리 | ❌ | ❌ |

## 패키지 배포 시스템

### 목표: Vercel Skills 스타일 배포

```bash
# 설치
npx obora add skill react-best-practices
npx obora add workflow full-feature

# 에이전트 선택
npx obora add skill react-best-practices --agent claude-code
npx obora add skill react-best-practices --agent cursor
npx obora add skill react-best-practices --all

# 업데이트
npx obora update

# 목록
npx obora list
```

### 레지스트리 구조

```
obora-registry/
├── skills/
│   ├── react-best-practices/
│   │   ├── skill.yaml
│   │   ├── SKILL.md
│   │   └── rules/
│   └── web-design-guidelines/
├── workflows/
│   ├── full-feature/
│   └── quick-fix/
└── agents/
    ├── planner/
    ├── implementer/
    └── reviewer/
```

## 로드맵

### Phase 1: 기반 정비 (현재)

- [x] workflow-core 패키지 분리
- [x] AgentProvider 인터페이스 정의
- [x] Claude 어댑터 구현
- [x] Vercel Skills 형식 호환

### Phase 2: 다중 에이전트 어댑터 (P1)

- [ ] 통합 스킬 형식 정의
- [ ] Cursor 어댑터 (.cursorrules 생성)
- [ ] Codex 어댑터 (.codex/ 생성)
- [ ] 어댑터 변환 CLI 도구

### Phase 3: 패키지 시스템 (P2)

- [ ] obora CLI 패키지
- [ ] `obora add/remove/update` 명령어
- [ ] 로컬 레지스트리 지원
- [ ] 원격 레지스트리 지원

### Phase 4: 생태계 확장 (P3)

- [ ] 공개 레지스트리 (obora.dev)
- [ ] 커뮤니티 기여 시스템
- [ ] 버전 관리/의존성
- [ ] 스킬 검증/품질 관리

## 차별화 요소

Vercel Skills 대비 obora-kit의 차별화:

| 특성 | Vercel Skills | obora-kit |
|------|--------------|-----------|
| 스킬 | ✅ | ✅ |
| 워크플로우 | ❌ | ✅ (동적) |
| 에이전트 오케스트레이션 | ❌ | ✅ (planner) |
| 피드백 루프 | ❌ | ✅ (reviewer) |
| 요구사항 발견 | ❌ | ✅ (interviewer) |
| DB 지속성 | ❌ | ✅ |
| 다중 에이전트 | ✅ 15개 | 목표: 15개 |

**핵심 차별화**:
- Vercel Skills = 지식/가이드 공유
- obora-kit = 지식 + **워크플로우 자동화**

## 호환성 원칙

### 1. 하위 호환성 유지

```yaml
# Vercel 형식 → obora에서 작동
---
name: skill-name
description: When to use
license: MIT
---

# Claude 형식 → obora에서 작동
---
name: skill-name
description: When to use
allowed-tools: Read, Write
---

# obora 확장 형식 → 다른 에이전트에서도 작동 (기능 제한)
---
name: skill-name
description: When to use
workflow:
  type: dynamic
---
```

### 2. 점진적 기능 확장

```
최소 기능셋 (모든 에이전트)
├── name
├── description
└── markdown 본문

Claude 확장 (Claude Code)
├── allowed-tools
├── model
└── user-invocable

obora 확장 (obora CLI + Claude)
├── workflow
├── feedback-loop
└── db-persistence
```

### 3. 기능 감지

```typescript
// 에이전트 기능 감지
const features = detectAgentFeatures(agentType);

if (features.supportsWorkflow) {
  // 워크플로우 실행
} else {
  // 스킬만 적용
}
```

## 마이그레이션 경로

### Vercel Skills → obora

```bash
# Vercel Skills 설치 후 obora 확장 추가
npx add-skill vercel-labs/agent-skills
npx obora extend react-best-practices --workflow
```

### obora → 다른 에이전트

```bash
# obora 스킬을 다른 에이전트 형식으로 내보내기
npx obora export my-skill --format cursor
npx obora export my-skill --format codex
```

## 참고 자료

- [Vercel Skills](https://skills.dev/)
- [Claude Code Skills](https://code.claude.com/docs/en/skills.md)
- [obora workflow-core](../packages/workflow-core/README.md)
- [Agent Subscription Research](./AGENT-SUBSCRIPTION-RESEARCH.md)

## 결론

obora-kit의 최종 목표는:

1. **범용성**: Vercel Skills처럼 모든 AI 에이전트에서 작동
2. **차별화**: 워크플로우 자동화 기능 유지
3. **생태계**: 공유/재사용 가능한 패키지 시스템
4. **호환성**: 기존 형식과 완전한 하위 호환

이를 통해 "npm for AI skills"를 넘어 "npm for AI workflows"가 되는 것이 비전입니다.
