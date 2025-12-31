# obora 기획서

## 프로젝트 비전

> **AI 에이전트 팀을 구성하여 실제 회의처럼 협업하는 코딩 어시스턴트**

---

## 핵심 컨셉

### 에이전트 기반 접근

```
기존: 단일 AI에게 모든 작업 요청
obora: 역할별 에이전트 팀 구성 → 실제 회의처럼 협업
```

### 예시: 아키텍처 회의

```yaml
team: architecture-meeting
flow: autonomous  # 자율 발언

agents:
  backend:
    model: claude-opus
    role: "백엔드 리드"
    speaks_when: "백엔드, API, DB 관련"

  frontend:
    model: gemini
    role: "프론트엔드 리드"
    speaks_when: "UI, UX, 클라이언트 관련"

  devops:
    model: codex
    role: "DevOps 엔지니어"
    speaks_when: "배포, 인프라 관련"

  pm:
    model: claude-opus
    role: "PM (진행자)"
    speaks_when: "정리, 결론, 주제 전환"
```

### 실행 흐름 (자율 발언)

```
You: API 인증 방식 어떻게 할까?

[backend]: 제가 먼저요. JWT가 적합합니다. 이유는...

[frontend]: 잠깐, 토큰 갱신 UX는요?
사용자가 갑자기 로그아웃되면...

[backend]: 좋은 지적이에요. refresh token으로...

[devops]: 끼어들어도 될까요?
토큰 저장소 Redis 고려해야...

[pm]: 정리할게요.
✓ JWT + refresh token
✓ Redis 토큰 저장소
→ 다음 주제로 넘어갈까요?
```

---

## 핵심 가치

| 기존 방식 | obora |
|----------|-------|
| 하나의 AI가 모든 역할 | 전문 에이전트 팀 협업 |
| 정해진 순서대로 실행 | **자율적 발언권** |
| 범용적 응답 | 역할 특화 응답 |
| 컨텍스트 수동 전달 | 자동 컨텍스트 공유 |

---

## 실행 모드 (flow)

### 1. Sequential (순차)
```
You → Agent1 → Agent2 → Agent3 → 결과
```
- 고정된 순서
- 이전 출력이 다음 입력에 포함
- 용도: 파이프라인 작업 (분석 → 수정 → 테스트)

### 2. Parallel (병렬)
```
You → Agent1 ─┐
    → Agent2 ─┼→ 결과 나열
    → Agent3 ─┘
```
- 동시 실행
- 독립적 관점 수집
- 용도: 다각도 리뷰

### 3. Debate (토론)
```
Round 1: Agent1 → Agent2 → Agent3
Round 2: Agent1 → Agent2 → Agent3
→ Moderator 종합
```
- 라운드별 순환
- 상대 의견에 반응
- 용도: 찬반 토론, 의사결정

### 4. Autonomous (자율) ⭐ 핵심
```
매 턴:
  모든 에이전트 → "발언할까?" 판단
  가장 적합한 에이전트가 발언
  아무도 없으면 → 진행자 정리 또는 종료
```
- **실제 회의처럼** 자율 발언
- 끼어들기 허용
- 진행자가 흐름 조절
- 용도: 자연스러운 협업, 브레인스토밍

---

## 자율 발언 로직

```
┌─────────────────────────────────────────────────┐
│                  매 턴마다                        │
├─────────────────────────────────────────────────┤
│ 1. 모든 에이전트에게 현재 대화 전달               │
│                                                 │
│ 2. 각 에이전트 판단:                             │
│    - SPEAK (긴급도 1-10)  "이 주제 내 영역"      │
│    - PASS               "지금은 패스"           │
│    - INTERRUPT          "급한 말 있음"          │
│                                                 │
│ 3. 발언자 선정:                                  │
│    - INTERRUPT 있으면 우선                       │
│    - 없으면 가장 높은 긴급도                      │
│    - 동점이면 역할 우선순위                       │
│                                                 │
│ 4. 종료 조건:                                    │
│    - N턴 연속 모두 PASS                          │
│    - 진행자가 "종료" 선언                         │
│    - 사용자가 "/end"                             │
└─────────────────────────────────────────────────┘
```

### 에이전트 판단 프롬프트

```
현재 대화:
{conversation_history}

당신은 {role}입니다.
전문 분야: {speaks_when}

이 대화에서 발언하시겠습니까?
- SPEAK: 숫자 (1-10 긴급도) - 발언할 내용이 있음
- PASS - 지금은 발언 안 함
- INTERRUPT - 급하게 끼어들 내용 있음

응답 형식: SPEAK:7 또는 PASS 또는 INTERRUPT
```

---

## 팀 설정 예시

### 1. code-review (순차)
```yaml
flow: sequential
agents:
  - architect: 구조 분석
  - reviewer: 버그/성능 검토
  - fixer: 수정 구현
```

### 2. brainstorm (병렬)
```yaml
flow: parallel
agents:
  - creative: 창의적 아이디어
  - practical: 현실적 방안
  - technical: 기술적 가능성
```

### 3. decision (토론)
```yaml
flow: debate
rounds: 2
agents:
  - optimist: 찬성 관점
  - critic: 반대 관점
  - moderator: 종합 정리
```

### 4. meeting (자율) ⭐
```yaml
flow: autonomous
facilitator: pm
max_silence: 3
interrupt: true
agents:
  - backend: 백엔드 관련 발언
  - frontend: 프론트 관련 발언
  - devops: 인프라 관련 발언
  - pm: 진행 및 정리
```

---

## 사용자 인터페이스

### TUI 명령어

```
/team <name>       팀 활성화
/teams             팀 목록
/agent <name>      특정 에이전트에게 직접 요청
/agents            현재 팀의 에이전트 목록
/flow <mode>       실행 모드 변경
/end               회의 종료 (autonomous)
```

### 화면 구성 (autonomous 모드)

```
┌────────────────────────────────────────────────┐
│ obora   team: meeting   flow: autonomous       │
├────────────────────────────────────────────────┤
│                                                │
│ [You]: API 인증 방식 논의하자                   │
│                                                │
│ [backend] 🎤                                   │
│ JWT 방식을 제안합니다. stateless하고...         │
│                                                │
│ [frontend] 🎤                                  │
│ 잠깐요, 토큰 만료 시 UX가 걱정되는데...         │
│                                                │
│ [backend] 🎤                                   │
│ 맞아요, refresh token으로 해결 가능...          │
│                                                │
│ [devops] ⚡ INTERRUPT                          │
│ 급한 건데, Redis 세션 저장소 필수입니다         │
│                                                │
│ [pm] 📋                                        │
│ 정리: JWT + refresh + Redis                    │
│ 다음 주제로 넘어갈까요?                         │
│                                                │
├────────────────────────────────────────────────┤
│ 🟢 Meeting in progress   /end to finish        │
└────────────────────────────────────────────────┘
```

---

## 아키텍처

```
┌─────────────────────────────────────────────────┐
│                    obora TUI                     │
└─────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│                 Team Manager                     │
│  - 팀 로드/저장                                  │
│  - 에이전트 관리                                 │
└─────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│              Flow Controller                     │
│  - sequential: 순차 실행                         │
│  - parallel: 병렬 실행                           │
│  - debate: 라운드 토론                           │
│  - autonomous: 자율 발언 ⭐                      │
└─────────────────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│   Agent 1   │ │   Agent 2   │ │   Agent 3   │
│  (역할 A)   │ │  (역할 B)   │ │  (역할 C)   │
└─────────────┘ └─────────────┘ └─────────────┘
        │             │             │
        ▼             ▼             ▼
┌─────────────────────────────────────────────────┐
│              Executor Registry                   │
│      claude | gemini | codex | ...              │
└─────────────────────────────────────────────────┘
```

---

## MVP 범위 (v0.1)

### 포함

| 기능 | 상태 |
|------|------|
| TUI 기본 | ✅ |
| Claude OAuth | ✅ |
| 에이전트 정의 | 🔄 |
| 팀 설정 | 🔄 |
| Sequential flow | 🔄 |

### v0.2

| 기능 |
|------|
| Parallel flow |
| Debate flow |

### v0.3

| 기능 |
|------|
| **Autonomous flow** ⭐ |
| 자율 발언 로직 |
| 끼어들기 |

---

## 경쟁 분석

| 도구 | 멀티 에이전트 | 팀 설정 | 자율 발언 | TUI |
|------|--------------|---------|----------|-----|
| Claude Code | ❌ | ❌ | ❌ | ✅ |
| Cursor | ❌ | ❌ | ❌ | ❌ |
| AutoGPT | ✅ | ❌ | ❌ | ❌ |
| CrewAI | ✅ | ✅ | ❌ | ❌ |
| **obora** | ✅ | ✅ | ✅ | ✅ |

---

## 결론

obora는 **AI 에이전트 팀이 실제 회의처럼 협업**하는 코딩 어시스턴트입니다.

```
"혼자서 다 하는 AI"
    → "전문가 팀이 협업하는 AI"
        → "실제 회의처럼 자율적으로 대화하는 AI 팀"
```

핵심 차별점: **Autonomous Flow** - 에이전트가 스스로 발언 타이밍을 결정
