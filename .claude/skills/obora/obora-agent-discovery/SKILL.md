---
name: obora-agent-discovery
description: 사용 가능한 에이전트 목록 조회. name과 description만 추출하여 planner에게 전달. 세부 내용은 실행 시 로드.
allowed-tools: Bash
user-invocable: false
---

# Agent Discovery

사용 가능한 모든 에이전트의 메타데이터(name, description)를 조회합니다.

## 핵심 원칙

**컨텍스트 절약**: 스크립트로 name, description만 추출. 세부 내용은 실행 시점에 로드.

## 사용법

```bash
.claude/skills/obora/obora-agent-discovery/scripts/discover-agents.sh [project_root]
```

## 출력 예시

```yaml
agents:
  - name: "obora-planner"
    description: "워크플로우 설계. 작업 분석, 에이전트 선택, 실행 순서 결정."
    path: "obora/core/obora-planner.md"
  - name: "obora-implementer"
    description: "코드 구현. 새 기능, 수정, 리팩토링."
    path: "obora/code/obora-implementer.md"
  - name: "my-custom-agent"
    description: "사용자 정의 에이전트."
    path: "my-custom-agent.md"
```

## 워크플로우에서 사용

```bash
# 1. 스크립트 실행하여 에이전트 목록 조회
agents=$(.claude/skills/obora/obora-agent-discovery/scripts/discover-agents.sh)

# 2. planner에게 전달
Task(subagent_type="obora-planner", prompt="
사용 가능한 에이전트:
$agents

작업 요청: [요청 내용]
")
```

## 에이전트 구조

```
.claude/agents/
├── obora/                 # obora 기본 에이전트
│   ├── core/              # 워크플로우 제어
│   ├── code/              # 코드 작업
│   ├── test/              # 테스트
│   ├── integration/       # 외부 연동
│   ├── infra/             # 인프라
│   └── docs/              # 문서화
├── my-agent.md            # 사용자 에이전트 (루트)
└── my-folder/             # 사용자 에이전트 (폴더)
```

## 스크립트 위치

```
.claude/skills/obora/obora-agent-discovery/
├── SKILL.md
└── scripts/
    └── discover-agents.sh
```

## 주의사항

- 에이전트 목록은 동적으로 변경될 수 있음
- 항상 스크립트로 최신 목록 조회
- 하드코딩된 에이전트 목록 사용 금지
- **세부 내용 Read 금지** → 컨텍스트 낭비
