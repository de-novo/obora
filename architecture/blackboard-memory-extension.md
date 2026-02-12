# Blackboard 메모리 확장 (아이디어)

> **상태**: 💡 아이디어 (스펙화 미진행)
> **제안일**: 2026-02-12
> **제안자**: 준혁님

## 개요

현재 Blackboard는 세션 내 단기 메모리 역할만 수행한다. 이를 확장하여 에이전트 간 장기 메모리 시스템으로 활용할 수 있다.

## 현재 구조

```
state     → 현재 실행 상태 (단기 기억)
knowledge → 사실/추론/패턴 (작업 기억)
decisions → 의사결정 이력 (결정 기억)
```

## 핵심 아이디어

**각 Blackboard를 연결하여 메모리 계층 구현**

```
[Agent A 세션]          [Agent B 세션]
  Blackboard ──┐     ┌── Blackboard
               ▼     ▼
         [Shared Memory Layer]
          ┌─────────────────┐
          │ knowledge (영구) │ ← 패턴, 학습된 사실
          │ decisions (영구) │ ← 과거 결정 이력
          │ context (영구)   │ ← 프로젝트 컨텍스트
          └─────────────────┘
               ▲     ▲
  Blackboard ──┘     └── Blackboard
[Agent C 세션]          [Agent D 세션]
```

## 구현 방향 (3가지)

| 방식 | 설명 | 장점 |
|------|------|------|
| **1. 계층형** | Local BB → Shared BB → Global BB | 스코프 분리 깔끔 |
| **2. 이벤트 동기화** | BB간 이벤트로 knowledge 전파 | 느슨한 결합 |
| **3. Persistent BB** | BB를 DB에 저장/복원 | 세션 간 연속성 |

## 이미 있는 기반

- `Blackboard.toJSON()/fromJSON()` → 직렬화 가능
- 이벤트 시스템 (`emit/on`) → BB간 동기화 가능
- 섹션 분리 (`state/knowledge/decisions`) → 공유 대상 선택 가능

## 기대 효과

- `knowledge` 영구화 → 에이전트가 학습한 패턴/사실 축적
- `decisions.history` 공유 → 과거 결정 참고
- 텍스트 기반 메모리(MEMORY.md 등)보다 검색·필터링·버전 관리 강력

## 적용 시점

- v4 자율 에이전트 팀 단계에서 스펙화 예정
- 현재는 아이디어 기록만 (구현 X)

## 관련 문서

- [[../spec/debate-protocol-v2.md]]
- [[poc-validation.md]]
