# Main Merge Scope

## 목적
현재 작업은 PR 없이 main에 직접 반영하는 것을 전제로 한다.
이 문서는 **무엇을 main에 포함하고, 무엇을 제외해야 하는지**를 정리한다.

## main에 포함할 것

### 제품 코드
- `packages/sdk/src/validation-repair.ts`
- `packages/sdk/src/execution/workflow-runner.ts`
- `packages/sdk/src/runtime.ts`
- `packages/sdk/src/step-executor.ts`
- `packages/sdk/src/workflow.ts`
- `packages/sdk/src/one-file-modes.ts`
- `packages/cli/src/commands/run.ts`
- `packages/cli/src/commands/runs.ts`
- `packages/runtime/src/storage/types.ts`

### 테스트
- `packages/sdk/src/__tests__/runtime-facade.test.ts`
- `packages/sdk/src/__tests__/step-executor.test.ts`
- `packages/sdk/src/__tests__/validation-repair-fixture.test.ts`
- `packages/sdk/src/__tests__/one-file-validation-repair.test.ts`
- `packages/sdk/src/__tests__/one-file-research-loop.test.ts`
- `packages/sdk/src/__tests__/one-file-proof-loop.test.ts`
- `packages/sdk/src/__tests__/one-file-schema-validation.test.ts`
- `packages/sdk/src/__tests__/builder-api.test.ts`
- `packages/sdk/src/__tests__/fixtures/validation-repair-loop.yaml`
- `packages/sdk/src/__tests__/fixtures/one-file-validation-repair.yaml`
- `packages/sdk/src/__tests__/fixtures/one-file-research-loop.yaml`
- `packages/sdk/src/__tests__/fixtures/one-file-proof-loop.yaml`
- `packages/runtime/src/storage/__tests__/storage-adapter.test.ts`

### 문서 / 예제
- `packages/sdk/README.md`
- `packages/sdk/examples/validation-repair-loop.yaml`
- `docs/tutorials/README.md`
- `docs/tutorials/one-file-workflows.md`
- `docs/tutorials/validation-repair-loop.md`
- `docs/tutorials/validation-repair-loop-migration.md`
- `docs/tutorials/validation-repair-loop-troubleshooting.md`

## main에서 제외할 것

### 연구 산출물
- `output/`
- `hello/`
- `.artifacts/`
- `.tmp-research-loop-backups/`

### sandbox 실험물
- `sandbox/glm47-research-loop/` 전체는 기본적으로 제외
  - 단, 추후 curated example로 승격할 때 일부만 재도입 가능

## merge 전 체크리스트
- [ ] repair-loop 관련 타겟 테스트 재통과
- [ ] README/tutorial 링크 확인
- [ ] aborted persistence 동작 확인
- [ ] stop category metadata 동작 확인
- [ ] 예제 YAML과 fixture YAML 역할 구분 확인

## 메모
이번 main 반영의 초점은 연구 산출물 보존이 아니라,
**validation-repair loop 기능을 제품 코드/테스트/문서에 반영하는 것**이다.
