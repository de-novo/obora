# Testing Policy

## 목적
Obora 전 패키지의 테스트 기준을 통일해 변경 안정성과 릴리즈 신뢰도를 유지합니다。

## 테스트 프레임워크
- 기본 프레임워크: **Vitest**
- 단위/통합 테스트는 각 패키지의 `src/**/*.test.ts` 또는 `test/` 경로에서 관리합니다.
- 공통 실행은 루트 워크스페이스 스크립트를 통해 수행합니다.

## 커버리지 기준
- 기본 목표(권장):
  - Line: **80% 이상**
  - Branch: **70% 이상**
  - Function: **80% 이상**
  - Statement: **80% 이상**
- 신규 패키지/핵심 모듈(`cli`, `core`, `database`)은 목표 미달 시 PR에서 사유를 명시해야 합니다.
- `pnpm verify:coverage`는 `scripts/coverage/thresholds.json`의 패키지별 baseline floor를 강제합니다.
- baseline은 퇴행 방지 기준이며 전체 레포 일괄 90% 목표가 아닙니다. 기준값을 올릴 때는 테스트 보강과 threshold 상향을 같은 변경 슬라이스에 포함합니다.
- dashboard baseline은 현재 Node-testable surface, TSX component tests, `App.tsx`, page TSX jsdom tests 기준입니다. 브라우저 entrypoint인 `main.tsx`만 coverage 대상에서 제외합니다.

## 현재 Coverage Baseline
`scripts/coverage/thresholds.json`이 현재 강제하는 package floor는 다음과 같습니다.
이 표는 `pnpm verify:coverage` 기준과 함께 갱신해야 합니다.

| Package | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| `@obora/sdk` | 95 | 91 | 99 | 95 |
| `@obora/runtime` | 93 | 90 | 90 | 93 |
| `@obora/adapters` | 96 | 92 | 98 | 96 |
| `@obora/cli` | 96 | 91 | 97 | 96 |
| `@obora/dashboard` | 94 | 91 | 93 | 94 |

최근 검증된 `pnpm verify:coverage` 측정값은 다음과 같습니다.

| Package | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| `@obora/sdk` | 96.05% | 91.16% | 99.35% | 96.05% |
| `@obora/runtime` | 93.12% | 90.03% | 90.23% | 93.12% |
| `@obora/adapters` | 96.70% | 92.56% | 98.40% | 96.70% |
| `@obora/cli` | 96.36% | 91.06% | 97.72% | 96.36% |
| `@obora/dashboard` | 94.74% | 91.14% | 93.31% | 94.74% |

SDK branch floor는 step-execution engine parallel/error path, TKG review queue
fallback, execution lock, repair-loop summary, health-check error,
judge/consensus strategy normalization 테스트 보강 후 91로 상향했습니다.
runtime function floor는 builtin plugin, workflow diagnosis helper,
ExecutionCell no-op message bus/actor blackboard adapter, runtime blackboard
event/snapshot, blackboard branded id helper 테스트 보강 후 90으로
상향했고, runtime statements/lines floor는 93, runtime branch floor는 resume, gate
timeout, artifact capture, blackboard default state, step skill loading, policy
expression parsing/evaluation, audit re-execution planning, snapshot restore
error, voting session, plugin registry lifecycle, custom pattern branch, builtin
pattern default, audit replay/re-execution fallback, BaseAgent guard,
snapshot runtime validation, actor runtime/pool edge case, event bus
async/unsubscribe, recovery supervisor branch 테스트 보강 후 90으로
상향했습니다. adapters statements/functions/lines floor는 agent resolution,
tool registry batch/schema/clear, builtin skill execution conformance 테스트 보강 후
96/98/96으로 상향했고, adapters branch floor는 agent config mutation
parsing/default cwd/reset cleanup/write failure, auth store default, decorator
parameter schema fallback 테스트 보강 후 92로 유지합니다.
CLI branch floor는 doctor shared provider/model guidance, formatter color
initialization, global option fallback 테스트 보강 후 91로 상향했습니다.
dashboard statements/functions/lines floor는 DLQ route list/summary/read/resolve,
metrics route default/injected response, console notification message extraction
테스트와 dashboard bootstrap start/stop/failure taxonomy 테스트 보강 후
94/93/94로 상향했습니다.
dashboard branch floor는 AuditFilter blank submit, BlackboardSnapshot nested
arrays, PlaybackTimeline single-event positioning, notification engine missing
channel/throw path, policy client validate rethrow, history helper/view-model
fallback 테스트 보강 후 91로 상향했습니다.

## CI 설정 원칙
- 기본 로컬/CI 게이트는 clean checkout 기준 아래 순서로 고정합니다.
  1. `pnpm install`
  2. `pnpm typecheck`
  3. `pnpm lint`
  4. `pnpm test`
  5. `pnpm verify:coverage`
  6. `pnpm build`
  7. `pnpm verify:smoke`
- 로컬에서 destructive clean-checkout 시뮬레이션이 필요하면 `pnpm verify:clean`을 실행합니다.
  이 스크립트는 install/build/Turbo 산출물을 제거한 뒤 lockfile 기준 install과 기본 게이트를 실행합니다.
- `pnpm typecheck`는 Turbo 작업으로 실행되며, CLI가 publishable package declarations를 기준으로 검사할 수 있도록 의존 패키지의 `build`를 먼저 보장합니다.
- PR/push 기본 CI는 `pnpm audit --audit-level moderate -> pnpm typecheck -> pnpm lint -> pnpm test -> pnpm verify:coverage -> pnpm build -> pnpm verify:smoke`를 실행한 뒤 `pnpm verify:release`, `pnpm verify:compat`, `pnpm verify:test-type-debt`를 실행합니다.
- `pnpm verify:smoke`는 build 산출물을 대상으로 한 빠른 운영 smoke입니다. 현재는 no-credential CLI onboarding dry-run과 dashboard package bootstrap health check를 검증하며 live-LLM 호출은 포함하지 않습니다.
- 릴리즈 후보 검증은 `docs/release-readiness.md`와 동일한 release/compat/type-debt gate를 통과해야 합니다.
- flaky 테스트는 머지 전 원인 분석 후 수정하거나 격리합니다.
- 테스트 실패 허용 머지는 금지합니다.

## E2E 테스트 위치
- CLI E2E 테스트는 `packages/cli` 하위(`test:e2e` 스크립트)에서 관리합니다.
- E2E는 실제 사용자 플로우(생성/초기화/동기화)를 기준으로 작성합니다.
- `pnpm test:e2e`는 기본 push/PR CI에 포함하지 않는 수동 live-LLM 검증입니다.
- `ZAI_API_KEY` 등 필요한 provider credential이 있고 외부 API 비용/지연을 허용할 때만 실행합니다.

## 운영 원칙
- 버그 수정 PR에는 회귀 테스트를 함께 추가합니다.
- 테스트 코드도 제품 코드와 동일한 코드리뷰 기준을 적용합니다.
- 문서가 coverage나 release 상태를 설명할 때는 `pnpm verify:coverage` 또는
  release gate 출력으로 확인한 수치만 기록합니다.
