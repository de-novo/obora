# 04 — Custom Plugin Pattern (Advanced Example)

이 예제는 custom pattern/plugin을 runtime에 등록한 뒤 workflow에서 사용하는 advanced / integration-oriented example입니다.

현재 분류상 이 예제는 first-success 예제가 아니라 advanced example입니다.

이유:

- 기본 CLI만으로 바로 끝나는 흐름이 아님
- `my-plugin.ts`를 runtime integration 맥락에서 등록해야 함
- plugin registration / inspection / fallback behavior까지 함께 이해해야 함

관련 분류 문서:

- `../README.md`

---

## What this example demonstrates

- custom pattern (`custom-summary`) 사용
- workflow에서 plugin-backed step 실행
- plugin execution failure 시 fallback step으로 우회
- runtime integration이 필요한 확장 경로

파일 구성:

- `workflow.yaml` — custom pattern을 사용하는 workflow
- `my-plugin.ts` — minimal custom plugin implementation

---

## Prerequisites

- Obora CLI installed
- provider auth configured
- `obora doctor`가 runnable 상태를 보여줌
- agent mappings configured: `collector`, `processor`, `writer`
- runtime integration에서 `my-plugin.ts` 또는 빌드된 plugin module을 실제로 등록할 수 있어야 함

처음 성공 경로가 아직이면 아래가 먼저입니다.

- `../hello-obora.yaml`
- `../01-simple-pipeline`
- `../07-contract-first-evaluation`

plugin authoring/registration 자체를 보려면 아래 튜토리얼을 함께 보는 편이 좋습니다.

- `../../docs/tutorials/custom-plugin.md`

---

## Run

이 예제는 “plugin이 이미 runtime에 등록되어 있다”는 전제에서 봐야 합니다.

```bash
obora run examples/04-plugin-custom/workflow.yaml
```

실행 전 preview:

```bash
obora run examples/04-plugin-custom/workflow.yaml --dry-run
```

가능하면 plugin metadata도 먼저 확인합니다.

```bash
obora plugin list
obora plugin inspect <your-plugin-name>
```

주의:

- 단순히 workflow 파일만 실행한다고 custom pattern이 자동 등록되지는 않습니다.
- registration이 빠져 있으면 이 예제의 핵심은 재현되지 않습니다.

---

## Expected result

- `summarize-with-plugin` step가 `pattern: custom-summary`로 실행됩니다.
- plugin output이 정상적으로 들어오면 `finalize` 단계로 이어집니다.
- custom pattern 실행이 실패하면 fallback step이 대신 실행됩니다.
- 현재 operator surface로 실행 상태를 확인할 수 있습니다.

예:

```bash
obora status
obora runs list
obora inspect <runId>
obora audit query <runId>
```

---

## When to use this example

이 예제는 아래 상황에 적합합니다.

- Obora 확장 포인트를 보고 싶을 때
- custom pattern/plugin을 workflow에 연결하는 방식을 보고 싶을 때
- fallback behavior까지 포함한 integration example이 필요할 때

아래 상황에는 비추천입니다.

- 처음 설치 후 첫 실행만 확인하려는 경우
- plugin registration/runtime bootstrap 개념 없이 가장 작은 canonical flow만 보고 싶은 경우

그 경우 먼저 `examples/README.md`의 onboarding 또는 supported runtime pattern 예제를 보세요.
