---
name: obora-workflow
description: 동적 워크플로우 핵심 로직. 요청 유형 판단 → 해당 워크플로우 실행.
allowed-tools: Bash, Task, Read, Glob, Grep, AskUserQuestion
user-invocable: true
---

# Obora Workflow

Claude Code 내에서 obora 워크플로우를 실행하는 핵심 skill입니다.

## 관련 명령어

| 명령어 | 설명 | 상세 정의 |
|--------|------|----------|
| `/workflow` | 자동 유형 판단 | `.claude/commands/workflow.md` |
| `/obora:obora-implement` | 기능 구현 | `.claude/commands/obora/obora-implement.md` |
| `/obora:obora-fix` | 버그 수정 | `.claude/commands/obora/obora-fix.md` |
| `/obora:obora-review` | 코드 리뷰 | `.claude/commands/obora/obora-review.md` |
| `/obora:obora-commit` | Git 커밋 | `.claude/commands/obora/obora-commit.md` |
| `/obora:obora-interview` | 요구사항 수집 | `.claude/commands/obora/obora-interview.md` |

## 사용법

```
/workflow <작업 설명>
```

또는 직접:
```
/obora:obora-implement <기능 설명>
/obora:obora-fix <버그 설명>
```

## 워크플로우 흐름

```
┌─────────────────────────────────────────────────────────────────┐
│  Phase 1: 디스커버리                                             │
│  - 에이전트 목록 조회 (discover-agents.sh)                        │
│  - 스킬 목록 조회 (discover-skills.sh)                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 2: 워크플로우 설계 (planner)                              │
│  - 작업 분석                                                     │
│  - 에이전트/스킬 선택                                            │
│  - 실행 순서 결정                                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 3: 워크플로우 실행                                        │
│  - Task tool로 에이전트 순차 실행                                 │
│  - 결과 수집                                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 4: 피드백 루프 (선택적)                                   │
│  - reviewer 에이전트로 검토                                      │
│  - 이슈 발견 시 수정 에이전트 재호출                              │
└─────────────────────────────────────────────────────────────────┘
```

## 실행 지침

### Phase 1: 디스커버리

**병렬로 에이전트/스킬 목록 조회:**

```bash
# 에이전트 목록
.claude/skills/obora/obora-agent-discovery/scripts/discover-agents.sh "$(pwd)"

# 스킬 목록
.claude/skills/obora/obora-skill-discovery/scripts/discover-skills.sh "$(pwd)"
```

### Phase 2: planner 호출

```
Task(subagent_type="planner", prompt="
## 사용 가능한 에이전트
[디스커버리 결과]

## 사용 가능한 스킬
[디스커버리 결과]

## 사용자 요청
[사용자 작업 설명]

워크플로우를 JSON으로 출력하세요:
{
  \"analysis\": \"작업 분석\",
  \"workflow\": [
    {\"agent\": \"에이전트명\", \"task\": \"작업 내용\", \"skills\": [\"스킬명\"]}
  ],
  \"feedback_loop\": {\"enabled\": true, \"max_iterations\": 3}
}
")
```

### Phase 3: 워크플로우 실행

planner가 반환한 workflow 배열을 순회하며 실행:

```python
for step in workflow:
    # 1. 에이전트 정의 로드
    agent_file = find_agent_file(step.agent)
    agent_content = Read(agent_file)

    # 2. 스킬 내용 로드 (있는 경우)
    skill_contents = []
    for skill_name in step.skills:
        skill_file = find_skill_file(skill_name)
        skill_contents.append(Read(skill_file))

    # 3. 에이전트 실행
    result = Task(
        subagent_type=step.agent,
        prompt=f"""
{step.task}

## 참고 스킬
{format_skills(skill_contents)}

## 이전 단계 결과
{format_previous_results(results)}
"""
    )

    results.append(result)
```

### Phase 4: 피드백 루프

```python
if feedback_loop.enabled:
    for i in range(feedback_loop.max_iterations):
        review = Task(subagent_type="reviewer", prompt="이전 작업 결과 검토")

        if no_critical_issues(review):
            break

        # 이슈 수정
        for issue in review.critical_issues:
            Task(subagent_type=issue.agent, prompt=f"수정: {issue.description}")
```

## 모드별 동작

### mode=implement (기본)
```yaml
workflow_hint: 구현 중심
expected_agents: [explorer, implementer, test-writer, reviewer]
feedback_loop: enabled
```

### mode=fix
```yaml
workflow_hint: 버그 수정 중심
expected_agents: [debugger, test-writer, reviewer]
feedback_loop: enabled
```

### mode=review
```yaml
workflow_hint: 리뷰 전용
expected_agents: [reviewer]
feedback_loop: disabled
```

## 에이전트 파일 조회

```bash
# 에이전트명으로 파일 찾기
Glob: .claude/agents/**/${agent_name}.md
Glob: .claude/agents/**/obora-${agent_name}.md
```

## 스킬 파일 조회

```bash
# 스킬명으로 파일 찾기
Glob: .claude/skills/**/${skill_name}/SKILL.md
Glob: .claude/skills/**/obora-${skill_name}/SKILL.md
```

## 결과 출력

워크플로우 완료 후 요약:

```markdown
## 워크플로우 실행 결과

### 실행된 단계
1. ✅ explorer: 코드베이스 분석
2. ✅ implementer: 기능 구현
3. ✅ test-writer: 테스트 작성
4. ✅ reviewer: 코드 리뷰

### 피드백 루프
- 반복: 1/3
- 이슈: 0개

### 변경된 파일
- src/auth/login.ts (수정)
- src/auth/login.test.ts (생성)
```

## 주의사항

- 모든 코드 변경은 에이전트를 통해 수행
- Main Claude가 직접 코드 수정 금지
- 에이전트/스킬 목록은 항상 동적 조회
- 하드코딩된 에이전트/스킬 사용 금지
