# Agent vs Skill vs Command 분류 기준

이 문서는 obora-kit에서 Agent, Skill, Command를 어떤 기준으로 나누는지 분석합니다.

## 현재 상태 분석

### 현재 수량

| 유형 | 개수 | 위치 |
|------|------|------|
| Agent | 30개 | `.claude/agents/**/*.md` |
| Skill | 5개 | `.claude/skills/*/SKILL.md` |
| Command | 5개 | `.claude/commands/*.md` |

### 현재 Frontmatter 비교

```yaml
# Agent
---
name: planner
description: 워크플로우 설계
tools: Read, Glob, Grep
model: opus
skills: agent-discovery    # 스킬 주입 가능
---

# Skill
---
name: claude-management
description: Claude Code 설정 관리
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, WebFetch
user-invocable: true
---

# Command
---
description: 새 기능 구현 (동적 워크플로우)
allowed-tools: Task, Read, Bash, Glob, Grep, AskUserQuestion
---
```

### 현재 문제점

| 문제 | 설명 |
|------|------|
| 역할 중복 | Command와 `user-invocable: true` Skill의 차이 불명확 |
| 필드 불일치 | Command에 `name` 없음, Agent에 `allowed-tools` 대신 `tools` |
| 오케스트레이션 혼재 | Command가 에이전트 호출, Skill도 도구 사용 가능 |
| 개념 혼란 | 언제 무엇을 써야 하는지 명확하지 않음 |

---

## 분류 기준 제안

### 핵심 구분 원칙

```
┌──────────────────────────────────────────────────────────────────┐
│                        사용자 요청                                │
└───────────────────────────┬──────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│   Command     │   │    Skill      │   │    Agent      │
│   (진입점)    │   │   (지식)      │   │   (실행자)    │
│               │   │               │   │               │
│ /implement    │   │ react-best-   │   │ implementer   │
│ /commit       │   │ practices     │   │ reviewer      │
│ /review       │   │               │   │ planner       │
└───────────────┘   └───────────────┘   └───────────────┘
        │                   │                   ▲
        │                   │                   │
        └───────────────────┴───────────────────┘
                    호출/참조
```

### 1. Command (명령어)

**정의**: 사용자가 직접 호출하는 진입점. 워크플로우를 오케스트레이션.

```yaml
특성:
  호출_방식: "/command-name" (슬래시 명령어)
  실행_주체: Main Claude
  역할: 워크플로우 오케스트레이션
  에이전트_호출: ✅ 가능 (Task 도구)
  도구_직접_사용: ⚠️ 제한적 (조정/분석용)
  사용자_상호작용: ✅ 가능 (AskUserQuestion)
```

**예시**:
- `/implement` - 기능 구현 워크플로우
- `/commit` - 커밋 워크플로우
- `/review` - 리뷰 워크플로우

**특징**:
- 복잡한 multi-phase 워크플로우 정의
- planner 호출 → 동적 에이전트 선택
- 결과 종합 및 보고

### 2. Skill (스킬)

**정의**: 지식/가이드라인/패턴을 제공. 에이전트나 Main Claude가 참조.

```yaml
특성:
  호출_방식: 자동 (description 매칭) 또는 "/skill-name"
  실행_주체: Main Claude 또는 Agent (주입 시)
  역할: 지식 전달, 패턴 가이드
  에이전트_호출: ❌ 불가
  도구_직접_사용: ✅ 가능 (보조적)
  사용자_상호작용: ⚠️ 제한적
```

**예시**:
- `react-best-practices` - React 최적화 규칙 45개
- `web-design-guidelines` - UI 디자인 가이드
- `claude-management` - Claude 설정 가이드

**특징**:
- 선언적 지식 (how-to, best practices)
- 도구 사용은 지식 조회 목적 (WebFetch로 최신 문서)
- 다른 에이전트에서 재사용 가능 (`skills: skill-name`)

### 3. Agent (에이전트)

**정의**: 특정 작업을 수행하는 독립적 실행자. Task 도구로 호출.

```yaml
특성:
  호출_방식: Task(subagent_type="agent-name")
  실행_주체: 격리된 서브에이전트 컨텍스트
  역할: 단일 책임 작업 수행
  에이전트_호출: ❌ 불가 (독립성 원칙)
  도구_직접_사용: ✅ 가능 (작업 수행용)
  사용자_상호작용: ⚠️ 제한적 (필요시만)
```

**예시**:
- `planner` - 워크플로우 설계
- `implementer` - 코드 구현
- `reviewer` - 코드 리뷰
- `commit-helper` - 커밋 실행

**특징**:
- 단일 책임 원칙 (SRP)
- 에이전트 독립성 (다른 에이전트 존재 모름)
- 도구 제한 가능 (`tools`, `disallowedTools`)

---

## 결정 흐름도

```
새로운 기능 추가 시:

┌─────────────────────────────────────────────────────────────────┐
│ Q1: 사용자가 직접 "/xxx"로 호출하나요?                           │
└─────────────────────────────────────────────────────────────────┘
                │
        ┌───────┴───────┐
        │ Yes           │ No
        ▼               ▼
┌───────────────┐   ┌─────────────────────────────────────────────┐
│   Command     │   │ Q2: 여러 에이전트를 조합하는 워크플로우인가요? │
│   후보        │   └─────────────────────────────────────────────┘
└───────────────┘                   │
                            ┌───────┴───────┐
                            │ Yes           │ No
                            ▼               ▼
                    ┌───────────────┐   ┌─────────────────────────┐
                    │ 이미 Command  │   │ Q3: 실행 결과물(코드,   │
                    │ 가 있으면     │   │     파일 등)을 생성하나? │
                    │ 그것 확장     │   └─────────────────────────┘
                    └───────────────┘               │
                                            ┌───────┴───────┐
                                            │ Yes           │ No
                                            ▼               ▼
                                    ┌───────────────┐   ┌───────────────┐
                                    │    Agent      │   │    Skill      │
                                    │   (실행자)    │   │   (지식)      │
                                    └───────────────┘   └───────────────┘
```

### 질문별 설명

| 질문 | Yes → | No → |
|------|-------|------|
| Q1: 사용자가 `/xxx`로 호출? | Command | Q2로 |
| Q2: 여러 에이전트 조합? | 기존 Command 확장 | Q3로 |
| Q3: 실행 결과물 생성? | Agent | Skill |

---

## 경계 사례 분석

### Case 1: `/commit` vs `commit-helper`

```yaml
현재:
  - /commit (Command): planner 호출 → 워크플로우 설계 → commit-helper 호출
  - commit-helper (Agent): 실제 커밋 실행

분석:
  - Command = 오케스트레이션 (언제, 어떤 순서로)
  - Agent = 실행 (무엇을)
  - 올바른 분리 ✅
```

### Case 2: `claude-management` (Skill)

```yaml
현재:
  - user-invocable: true (슬래시 명령어처럼 호출 가능)
  - WebFetch로 문서 조회 후 설정 작성

분석:
  - 지식 제공 (최신 문서 fetch) → Skill ✅
  - 파일 생성/수정 → Agent 역할?
  - 경계 사례: 지식 + 실행 혼합

권장:
  - 지식 부분 → Skill 유지
  - 실행 부분 → 별도 Agent로 분리 (예: config-writer)
```

### Case 3: `agent-discovery` (Skill)

```yaml
현재:
  - Glob/Read로 에이전트 파일 조회
  - 메타데이터 수집

분석:
  - 에이전트 정보 "조회" = 지식 성격 → Skill ✅
  - 실행 결과물 없음 (정보만 반환)
  - 올바른 분류 ✅
```

### Case 4: `interviewer` (Agent)

```yaml
현재:
  - AskUserQuestion으로 대화형 인터뷰
  - 요구사항 명세서 생성

분석:
  - 실행 결과물 (명세서) 생성 → Agent ✅
  - 대화형이지만 특정 작업 수행
  - 올바른 분류 ✅
```

---

## 권장 분류 체계

### 명확한 역할 정의

| 유형 | 역할 | 에이전트 호출 | 결과물 생성 | 호출 방식 |
|------|------|--------------|------------|-----------|
| **Command** | 오케스트레이션 | ✅ | ❌ (조정만) | `/xxx` |
| **Skill** | 지식 제공 | ❌ | ❌ | 자동/`/xxx` |
| **Agent** | 작업 실행 | ❌ | ✅ | Task() |

### Frontmatter 통일

```yaml
# Command (권장)
---
name: implement              # 추가 (일관성)
description: 새 기능 구현
allowed-tools: Task, Read, Bash, Glob, Grep, AskUserQuestion
---

# Skill (현행 유지)
---
name: react-best-practices
description: React 최적화 가이드
allowed-tools: Read, WebFetch    # 조회용만
user-invocable: true             # 슬래시 호출 가능
---

# Agent (현행 유지)
---
name: implementer
description: 새 기능 구현
tools: Read, Write, Edit, Bash, Grep, Glob
model: sonnet
---
```

---

## 마이그레이션 제안

### 현재 문제 해결

| 항목 | 현재 | 권장 |
|------|------|------|
| Command에 name 없음 | `description`만 | `name` 추가 |
| Skill의 실행 역할 | claude-management가 파일 생성 | Agent로 분리 |
| user-invocable Skill | Command와 혼동 | 명확한 구분 문서화 |

### user-invocable Skill vs Command 차이

```yaml
user-invocable_Skill:
  - 지식 제공 + 간단한 조회
  - 다른 에이전트 호출 없음
  - 예: /react-best-practices → 규칙 목록 출력

Command:
  - 워크플로우 오케스트레이션
  - 다른 에이전트 호출 가능
  - 예: /implement → planner → implementer → reviewer
```

---

## 요약

### 분류 기준 (최종)

```
┌─────────────────────────────────────────────────────────────────┐
│                        분류 기준 요약                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Command (명령어)                                               │
│  ─────────────────                                              │
│  • 사용자 직접 호출 (/xxx)                                       │
│  • 워크플로우 오케스트레이션                                      │
│  • 에이전트 조합/순서 결정                                       │
│  • 결과 종합 및 보고                                             │
│                                                                 │
│  Skill (스킬)                                                   │
│  ─────────────                                                  │
│  • 지식/패턴/가이드라인 제공                                      │
│  • 에이전트에 주입 가능 (skills 필드)                            │
│  • 조회/참조 목적 도구만 사용                                     │
│  • 실행 결과물 없음 (정보만 반환)                                 │
│                                                                 │
│  Agent (에이전트)                                               │
│  ─────────────────                                              │
│  • Task()로 호출                                                │
│  • 단일 책임 작업 수행                                           │
│  • 실행 결과물 생성 (코드, 파일, 커밋 등)                         │
│  • 독립성 유지 (다른 에이전트 호출 금지)                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 한 줄 요약

- **Command** = "언제, 어떤 순서로" (오케스트레이터)
- **Skill** = "무엇을 알아야 하는가" (지식)
- **Agent** = "무엇을 할 것인가" (실행자)
