# Workflow Title Auto-Update Skill

워크플로우 제목을 자동으로 의미있게 업데이트합니다.

## 언제 사용하나요?

- **모든 작업 완료 후** 워크플로우 제목을 업데이트
- 사용자 프롬프트와 관계없이 실제 수행한 작업 기반으로 제목 생성

## 사용 방법

### 1. 워크플로우 컨텍스트 확인

```bash
cat ~/.obora/workflow-context.json
```

### 2. 제목 업데이트

```bash
.claude/scripts/workflow/update-workflow.sh <workflow_id> title "<제목>"
```

## 제목 생성 규칙

```yaml
형식:
  - 2-5단어로 요약
  - 동사 + 목적어 형태
  - 한글 권장

예시:
  - "로그인 기능 구현"
  - "대시보드 버그 수정"
  - "API 엔드포인트 리팩토링"
  - "테스트 커버리지 개선"

피해야_할_것:
  - 사용자 원문 그대로 사용
  - 너무 긴 제목 (10자 초과)
  - 모호한 표현 ("작업", "수정", "변경")
```

## 자동 트리거 조건

Main Claude가 **모든 작업 완료 후** 자동 실행:

1. `~/.obora/workflow-context.json` 존재 확인
2. 실제 수행한 작업 내용 기반으로 제목 생성
3. `update-workflow.sh` 실행하여 제목 업데이트

## 스크립트 위치

```
.claude/scripts/workflow/update-workflow.sh
```
