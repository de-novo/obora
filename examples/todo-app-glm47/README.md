# todo-app-glm47 (step-by-step)

GLM-4.7 단일 모델로 각 작업을 **개별 워크플로우**로 실행합니다.

## 워크플로우 목록
- `workflows/01-planning.yaml`
- `workflows/02-architecture.yaml`
- `workflows/03-design-review.yaml`
- `workflows/04-ui-design.yaml`
- `workflows/05-implementation.yaml`
- `workflows/06-code-review.yaml`
- `workflows/07-final-summary.yaml`

## 실행 예시
```bash
cd /Users/denovo/workspace/github/obora-kit/examples/todo-app-glm47
obora run workflows/01-planning.yaml
obora run workflows/02-architecture.yaml
obora run workflows/03-design-review.yaml
```

> 각 단계 출력을 다음 단계 입력(`input.*`)으로 넘겨서 순차 진행하세요.


## Planning 단계 세분화
- `workflows/planning/01-requirements-collection.yaml`
- `workflows/planning/02-requirements-analysis.yaml`
- `workflows/planning/03-solution-discussion.yaml`
- `workflows/planning/04-planning-review.yaml`
- `workflows/planning/05-planning-validation.yaml`

또는 한 번에 planning 파이프라인 실행:
- `workflows/01-planning-pipeline.yaml`


## 고복잡 워크플로우 세트
- `workflows/complex/02-architecture-complex.yaml`
- `workflows/complex/03-design-complex.yaml`
- `workflows/complex/03b-uiux-pencilskill-design-system.yaml`
- `workflows/complex/04-development-complex.yaml`
- `workflows/complex/05-validation-complex.yaml`
- `workflows/00-master-complex.yaml`

실행 예시:
```bash
obora run workflows/complex/02-architecture-complex.yaml
obora run workflows/complex/03-design-complex.yaml
obora run workflows/complex/04-development-complex.yaml
obora run workflows/complex/05-validation-complex.yaml
```


UI/UX 디자인 시스템 전용 실행:
```bash
obora run workflows/complex/03b-uiux-pencilskill-design-system.yaml
```


## 판단 엔진 + 피드백 루프 설계 포인트
- `workflows/complex/04-development-complex.yaml`에 아래를 반영했습니다.
  - `quality-judgment` (리뷰 기반 정량/정성 판단)
  - `judgment-consensus-gate` (score/issue 기준 승인 게이트)
  - `remediation-plan` → `remediation-implementation` (수정 루프)
  - `regression-review` (회귀 검증)
  - `release-readiness-gate` (최종 승인)
- recovery/retry/escalation 규칙으로 실패 시 자동 재시도/에스컬레이션됩니다.


## 파일명 자동화 (개발 단계 오버헤드 제거)
프롬프트마다 파일명을 쓰지 않도록 고정 매핑을 사용합니다.

- run 결과(JSON): `output/todo-app-01-planning-pipeline-<runId>.json`
- materialize 스크립트: `materialize-planning-output.py`
- 고정 출력 경로:
  - `docs/01-requirements.md`
  - `docs/02-analysis.md`
  - `docs/03-discussion.md`
  - `docs/04-review.md`
  - `docs/05-validation.md`

실행:
```bash
obora run workflows/01-planning-pipeline.yaml --config obora.config.yaml --agents agents.yaml --output-dir ./output --json
python3 materialize-planning-output.py
```
