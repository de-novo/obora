# Todo App — Compact End-to-End Example

이 예제는 Obora로 투두앱을 기획부터 구현까지 한 번에 이어 보는 compact end-to-end workflow입니다.

현재 분류상 이 예제는 first-success 예제가 아니라 advanced example입니다.

이유:

- 여러 역할(agent)과 여러 단계가 한 번에 이어짐
- planning / architecture / design / implementation / review 흐름을 모두 포함함
- 처음 사용자보다 “큰 워크플로우 흐름이 어떻게 이어지는지”를 보고 싶은 경우에 더 적합함

관련 분류 문서:

- `../README.md`

---

## What this example demonstrates

1. 📋 기획 (Product Manager)
2. 🏗️ 설계 (Architect)
3. 🤝 설계 합의 (3 Reviewers, majority vote)
4. 🎨 UI 디자인 (Designer)
5. 💻 구현 (Developer)
6. 👀 코드 리뷰 (2 Reviewers, peer review)
7. 📝 최종 요약 (Product Manager)

즉 이 예제는 아래를 함께 보여줍니다.

- multi-step end-to-end workflow
- consensus / review 성격의 중간 게이트
- planning에서 implementation까지 이어지는 larger workflow example

---

## Prerequisites

- Obora CLI installed
- provider auth configured
- `obora doctor` passes or at least shows a runnable setup
- agent mappings configured for this workflow

처음 성공 경로가 아직이면 아래를 먼저 권장합니다.

```bash
obora quickstart my-project
cd my-project
obora doctor
obora validate judge.yaml
obora expand --json -- judge.yaml   # optional, after editing judge.yaml
obora --json expand judge.yaml
obora judge --dry-run
obora judge
```

그리고 더 작은 예제로는 아래가 먼저입니다.

- `../hello-obora.yaml`
- `../01-simple-pipeline`
- `../07-contract-first-evaluation`

---

## Run

```bash
cd examples/todo-app
obora run workflow.yaml --dry-run
obora run workflow.yaml
```

preview-first로 보는 이유:

```bash
cd examples/todo-app
obora run workflow.yaml --dry-run
```

---

## Expected result

- planning → architecture → consensus → design → implementation → review → summary 순으로 진행됩니다.
- larger workflow execution example로서 여러 문서/산출물이 단계적으로 생성됩니다.
- 현재 operator surface를 통해 실행 상태를 확인할 수 있습니다.

예:

```bash
obora status
obora runs list
obora inspect <runId>
obora audit replay <runId>
```

---

## When to use this example

이 예제는 아래 상황에 적합합니다.

- 작은 demo보다 더 큰 workflow를 보고 싶을 때
- planning→implementation 흐름이 한 workflow에서 어떻게 이어지는지 보고 싶을 때
- consensus / peer review가 larger workflow 안에서 어떻게 섞이는지 보고 싶을 때

아래 상황에는 비추천입니다.

- 처음 Obora를 설치하고 첫 성공만 확인하려는 경우
- 현재 환경 auth/config가 아직 안정적이지 않은 경우

그 경우 먼저 `examples/README.md`의 onboarding / first-success bucket을 보세요.
