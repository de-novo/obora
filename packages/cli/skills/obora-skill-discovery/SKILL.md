---
name: obora-skill-discovery
description: 사용 가능한 스킬 목록 조회. name과 description만 추출하여 planner에게 전달. 세부 내용은 실행 시 로드.
allowed-tools: Bash
user-invocable: false
---

# Skill Discovery

사용 가능한 모든 스킬의 메타데이터(name, description)를 조회합니다.

## 핵심 원칙

**컨텍스트 절약**: 스크립트로 name, description만 추출. 세부 내용은 실행 시점에 로드.

## 사용법

```bash
.claude/skills/obora/obora-skill-discovery/scripts/discover-skills.sh [project_root]
```

## 출력 예시

```yaml
skills:
  - name: "obora-typescript"
    description: "TypeScript 패턴 및 타입 설계 가이드."
    path: "obora/obora-typescript"
  - name: "obora-security"
    description: "보안 점검 체크리스트."
    path: "obora/obora-security"
  - name: "my-company-style"
    description: "회사 코딩 스타일 가이드."
    path: "my-company-style"
```

## 워크플로우에서 사용

```bash
# 1. 스크립트 실행하여 스킬 목록 조회
skills=$(.claude/skills/obora/obora-skill-discovery/scripts/discover-skills.sh)

# 2. planner에게 에이전트 + 스킬 목록 전달
Task(subagent_type="obora-planner", prompt="
사용 가능한 에이전트:
$agents

사용 가능한 스킬:
$skills

작업 요청: [요청 내용]
")
```

## 스킬 구조

```
.claude/skills/
├── obora/                 # obora 기본 스킬
│   ├── obora-typescript/
│   ├── obora-security/
│   ├── obora-testing/
│   └── ...
├── my-skill/              # 사용자 스킬 (루트)
└── my-folder/             # 사용자 스킬 (폴더)
    └── another-skill/
```

## 주의사항

- 스킬 목록은 동적으로 변경될 수 있음
- 항상 스크립트로 최신 목록 조회
- 하드코딩된 스킬 목록 사용 금지
- **세부 내용 Read 금지** → 컨텍스트 낭비
