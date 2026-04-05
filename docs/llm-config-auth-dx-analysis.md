# Obora LLM Config / Auth DX Analysis

## 한줄 결론

현재 Obora의 LLM config/auth resolution은 내부적으로는 비교적 단순하지만,
사용자 관점에서는 **입력 표면이 여러 층으로 분산**되어 있어 처음 붙일 때 혼란을 만든다.

핵심 문제는 "우선순위가 복잡하다"기보다,
**권장 경로가 한 번에 보이지 않는다**는 점이다.

---

## 1. Current Resolution Model

### Runtime LLM resolution order
현재 코드 기준 global LLM resolution order는 다음과 같다.

1. `runtime.llm` explicit config
2. loaded Obora config (`.obora/config.yaml` or explicit config path)
3. env fallback

즉 high-level precedence는:

```text
explicit runtime.llm > config file > env fallback
```

---

## 2. Why users still get confused

실제 사용자는 아래가 한 문제처럼 느껴진다.

- runtime `llm`
- project/global config
- provider `authRef`
- provider `defaultModel`
- env API keys
- workflow-local `agents`
- runtime `agentsPath`

각각은 개별적으로 이해 가능하지만,
처음 붙이는 사람은 아래 질문에 바로 답하기 어렵다.

- 지금 provider는 어디서 정해졌나?
- model은 어디서 왔나?
- auth는 env를 본 건가, authRef를 본 건가?
- workflow agent의 model이 runtime.llm보다 우선인가?
- 어디만 고치면 원하는 동작이 되나?

즉 문제는 선택지가 많아서가 아니라,
**선택지들 사이의 권장 경로와 수정 포인트가 즉시 보이지 않는 것**이다.

---

## 3. Current pain points

### A. Resolution sources are distributed across layers
LLM resolution은 runtime/config/env에서 일어나고,
agent-level resolution은 workflow agents / agentsPath / runtime agents에서도 동시에 영향을 준다.

사용자는 이를 하나의 "LLM 설정 문제"로 보지만,
실제 표면은 여러 파일/레이어에 걸쳐 있다.

### B. authRef is powerful but not onboarding-friendly
현재 `authRef`는 다음 계열을 지원한다.
- `env:...`
- `global:...`
- `obora-auth:...`
- plain text fallback

이건 유연하지만,
처음 사용자에게는 “뭘 쓰는 게 권장인지”를 흐릴 수 있다.

### C. Docs show available methods, but not one strong happy path
현재 문서는 env 설정은 보여주지만,
아래 질문에 대한 강한 가이드는 아직 약하다.

- project config는 언제 쓰는가?
- runtime.llm은 언제 쓰는가?
- authRef는 언제 쓰는가?
- 처음 시작할 때 가장 추천하는 경로는 무엇인가?

### D. Resolution summary is informative, but not prescriptive enough
현재 resolution summary는 현재 상태를 보여주는 데는 좋다.
그러나 onboarding UX 측면에서는 아래가 더 필요하다.

- 왜 이 source가 선택됐는가
- 어떤 source는 무시됐는가
- 사용자가 다음에 어디를 수정하면 되는가

---

## 4. Recommended single happy path

초기 사용자용 권장 경로는 아래로 고정하는 것이 좋다.

### Recommended defaults
1. **API key는 env로 설정**
2. **provider/model은 project `.obora/config.yaml`에 둔다**
3. **runtime `llm` override는 고급/예외 경로로 둔다**
4. **`authRef`는 팀/배포 환경용 고급 기능으로 설명한다**
5. **workflow-local agent provider/model은 특별한 경우에만 쓴다**

즉 첫 사용자에게는 다음 한 줄 규칙을 주면 된다.

> auth는 env, 기본 provider/model은 project config, runtime override는 예외적 상황에서만.

---

## 5. Proposed UX improvements

### P1. Documentation
문서에는 가능한 모든 경로를 같은 무게로 나열하기보다,
아래 순서로 보여주는 것이 좋다.

1. 가장 쉬운 happy path
2. 자주 쓰는 team/project path
3. advanced overrides

#### Suggested quickstart flow
```text
1. export OPENAI_API_KEY=...
2. create .obora/config.yaml
3. set defaults.provider / providers.<name>.defaultModel
4. run obora
```

---

### P2. Resolution Summary improvements
현재 summary에 아래를 추가하는 것이 좋다.

- chosen source reason
- ignored lower-priority sources
- next recommended edit location

Example direction:
```text
Execution Resolution
- provider: openai
- model: gpt-4o-mini
- auth source: env(OPENAI_API_KEY)
- model source: provider(openai).defaultModel
- chosen by precedence: config over env
- next place to edit: .obora/config.yaml
```

---

### P3. Better diagnostics for missing auth/config
에러나 warning도 아래를 알려주는 방향이 좋다.

- 어떤 source를 찾았는지
- 어떤 env key를 기대했는지
- 어떤 파일을 수정하면 되는지

즉 단순 failure보다,
**next action oriented diagnostics**로 바꾸는 것이 중요하다.

---

### P4. Config/Auth quickstart example
contract-first example와 별개로,
아주 짧은 config/auth quickstart를 따로 두는 것도 효과가 크다.

예:
- env API key 설정
- `.obora/config.yaml` 최소 예시
- `obora run ...`

이 문서는 binding/schema보다 먼저 보게 될 가능성이 높다.

---

## 6. What does NOT need immediate redesign

당장 구조를 크게 바꿀 필요는 없다.

### Not urgent now
- authRef 기능 제거
- env fallback 제거
- runtime.llm 제거
- config source 축소

즉 문제의 본질은 기능이 너무 많아서가 아니라,
**권장 사용 경로가 UX로 충분히 드러나지 않는 것**이다.

---

## 7. Recommended next step

가장 효과적인 다음 단계는 아래 3개다.

1. **LLM config/auth quickstart 문서 추가**
2. **resolution summary를 더 설명형으로 개선**
3. **missing auth/config diagnostics 개선**

이 셋이 되면,
구조를 뒤엎지 않고도 onboarding friction을 꽤 크게 줄일 수 있다.

---

## Final statement

> The biggest remaining DX problem is not contract shape anymore. It is helping users understand where provider, model, and auth actually come from — and where to change them first.
