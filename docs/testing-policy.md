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

## CI 설정 원칙
- 기본 로컬/CI 게이트는 clean checkout 기준 아래 순서로 고정합니다.
  1. `pnpm install`
  2. `pnpm typecheck`
  3. `pnpm lint`
  4. `pnpm test`
  5. `pnpm build`
- 로컬에서 destructive clean-checkout 시뮬레이션이 필요하면 `pnpm verify:clean`을 실행합니다.
  이 스크립트는 install/build/Turbo 산출물을 제거한 뒤 lockfile 기준 install과 기본 게이트를 실행합니다.
- `pnpm typecheck`는 Turbo 작업으로 실행되며, CLI가 publishable package declarations를 기준으로 검사할 수 있도록 의존 패키지의 `build`를 먼저 보장합니다.
- PR/push 기본 CI는 `pnpm audit --audit-level moderate -> pnpm typecheck -> pnpm lint -> pnpm test -> pnpm build`를 실행한 뒤 `pnpm verify:release`, `pnpm verify:compat`, `pnpm verify:test-type-debt`를 실행합니다.
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
