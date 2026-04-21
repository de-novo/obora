# Getting Started with Obora

> Obora는 AI가 실패해도 시스템이 흔들리지 않게 만드는 AI Control Runtime입니다.

이 문서는 두 가지를 제공합니다.

- 가장 짧은 first-success 경로
- 그 다음에 이어서 볼 문서와 예시

---

## Fastest Path

처음이면 아래 순서로 진행하시면 됩니다.

```bash
npm install -g @obora/cli
obora init my-project --quickstart
cd my-project
obora doctor
obora validate judge.yaml
obora judge --dry-run
obora judge
```

이 경로에서 바로 확인하게 되는 것:

- quickstart project 생성
- provider / model / auth readiness
- input / output binding preview
- judge result artifact 생성

### Prerequisites

- Node.js 20+
- shell에 provider API key 하나

예:

```bash
export OPENAI_API_KEY=***
```

Anthropic 또는 ZAI를 쓰려면 해당 provider key를 export하면 됩니다.

---

## What each command is for

### 1) `obora init --quickstart`

```bash
obora init my-project --quickstart
cd my-project
```

생성되는 핵심 파일:

- `judge.yaml`
- `artifacts/submission.json`
- `artifacts/submission.schema.json`
- `artifacts/result.schema.json`
- `.obora/config.yaml`
- `README.md`

`judge.yaml`을 직접 수정했다면 실행 전에 아래를 먼저 권장합니다.

```bash
obora validate judge.yaml
obora expand --json -- judge.yaml
```

### 2) `obora doctor`

```bash
obora doctor
obora doctor --json
obora --json doctor
```

확인 포인트:

- 어떤 provider/model이 실제로 선택됐는지
- auth가 env/config/auth store 중 어디서 왔는지
- stub/fallback 상태인지
- 다음에 무엇을 실행해야 하는지 (`judge.yaml`이 있으면 judge 경로, 없으면 generic run 경로)
- config에 named agent override가 있으면 `obora agents list/show`까지 같이 안내되는지
- drifted agent가 있으면 `obora agents show <name>`가 임의의 첫 agent가 아니라 drifted agent를 우선 가리키는지
- 특정 agent가 current default path와 다르게 덮여 있으면 drift warning이 뜨는지
- drift warning이 provider/model뿐 아니라 explicit `temperature` override도 같이 잡는지
- drifted override를 바로 지우지 않고 `obora agents reset <name> --dry-run` preview를 먼저 안내하는지
- drifted agent가 여러 개면 provider/model drift를 temperature drift보다 먼저 보여주면서 최대 2개까지 reset preview를 제안하는지

agent-level resolution을 더 자세히 보고 싶다면 아래를 이어서 확인할 수 있습니다.

```bash
obora agents list
obora agents show reviewer
```

특정 agent만 project/global config layer에서 안전하게 바꾸고 싶다면 preview-first로 아래 순서를 권장합니다.

```bash
obora agents set reviewer --model gpt-5.4 --dry-run
obora agents set reviewer --model gpt-5.4
obora agents reset reviewer --dry-run
```

이 surface는 `.obora/config.yaml`의 project/global agent override만 다루고, `agentsPath`, workflow-local `agents`, runtime registration은 바꾸지 않습니다.

### 3) `obora validate judge.yaml`

```bash
obora validate judge.yaml
```

확인 포인트:

- one-file workflow top-level / nested key 유효성
- required field 누락 여부
- 실행 전에 먼저 잡을 수 있는 judge workflow shape 오류

필요하면 바로 이어서 아래도 확인합니다.

```bash
obora expand --json -- judge.yaml
```

### 4) `obora judge --dry-run`

```bash
obora judge --dry-run
```

실행 전 아래를 미리 보여줍니다.

- provider / model / auth resolution
- `artifacts/submission.json` binding preview
- `artifacts/result.json` output preview

### 5) `obora judge`

```bash
obora judge
```

성공하면 결과는 여기로 기록됩니다.

```bash
cat artifacts/result.json
```

---

## If setup is blocked

우선 아래 문서 순서로 보시면 됩니다.

1. [Quick Troubleshooting](./tutorials/03-quick-troubleshooting.md)
2. [LLM Config / Auth Quickstart](./tutorials/06-llm-config-auth-quickstart.md)
3. [CLI Reference](./cli.md)

추가로 유용한 명령:

```bash
obora models
obora models gpt-5.4
obora models openai
obora auth add openai --apiKey "$OPENAI_API_KEY"
obora auth list
obora auth test openai
```

---

## Recommended tutorial order

빠른 성공 이후에는 아래 순서가 가장 자연스럽습니다.

1. [3-Minute Quickstart](./tutorials/01-3-minute-quickstart.md)
2. [Judge Quickstart](./tutorials/02-judge-quickstart.md)
3. [Quick Troubleshooting](./tutorials/03-quick-troubleshooting.md)
4. [LLM Config / Auth Quickstart](./tutorials/06-llm-config-auth-quickstart.md)
5. [Contract-First Quickstart](./tutorials/04-contract-first-quickstart.md)
6. [Contract-First Authoring Guide](./tutorials/05-contract-first-authoring-guide.md)
7. [One-File Workflows](./tutorials/one-file-workflows.md)

튜토리얼 인덱스 전체 보기:

- [Tutorials README](./tutorials/README.md)

---

## Recommended default setup

처음에는 아래 원칙을 기본값으로 두는 편이 가장 덜 헷갈립니다.

- secret → env
- default provider/model → project `.obora/config.yaml`
- temporary override → runtime `llm`

---

## After the first success

### Contract-first example

바로 실행 가능한 canonical example:

- [`examples/07-contract-first-evaluation`](../examples/07-contract-first-evaluation)

이 흐름에서 핵심은 아래입니다.

- `input.bindings` 로 입력 artifact 선언
- `{{binding}}` 으로 prompt에 주입
- `output.path` / `output.schema` 로 출력 contract 선언
- startup preview 로 실행 전 contract 확인

### Validation-repair loop example

Obora의 핵심 execution pattern을 더 보려면:

- [`examples/06-validation-repair-loop`](../examples/06-validation-repair-loop)
- [Validation-Repair Loop tutorial](./tutorials/validation-repair-loop.md)

### Examples index by use case

examples를 onboarding / supported runtime pattern / advanced example 기준으로 보려면:

- [`examples/README.md`](../examples/README.md)

### CLI reference

자세한 명령 계약은 여기에서 확인합니다.

- [CLI Reference](./cli.md)

---

## Local repo development

CLI를 설치해서 쓰는 대신 이 저장소를 직접 빌드하며 확인하려면:

```bash
git clone https://github.com/de-novo/obora.git
cd obora
pnpm install
pnpm build
node packages/cli/bin/obora.js --help
```

---

## Need Help?

- repo issues: https://github.com/de-novo/obora/issues
- docs entry: [README.md](../README.md)
- tutorials index: [docs/tutorials/README.md](./tutorials/README.md)
