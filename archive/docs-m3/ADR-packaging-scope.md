# ADR: Packaging Scope Unification Direction (`@obora-kit/*`)

- Status: Proposed
- Date: 2026-02-14
- Decision Makers: Platform
- Related Task: TASK-045

## Context

현재 모노레포 내 패키지 스코프가 혼재되어 있습니다.

- `@obora/*`: `core`, `cli`, `database`, `preset-engine`, `project-templates`
- `@obora-kit/*`: `actor`, `agents`, `blackboard`, `board`

패키지 식별 규칙이 이원화되어 있어 다음 문제가 있습니다.

1. 신규 패키지 네이밍 기준 혼선
2. 배포/문서/온보딩 시 인지 부하 증가
3. 장기적으로 import 경로와 변경 이력 추적 난이도 상승

## Decision

패키지 스코프의 목표 단일 기준을 `@obora-kit/*`로 정합니다.

- 본 ADR은 **방향성 문서**이며, 실제 패키지 rename/release는 별도 태스크에서 수행합니다.
- 당장 코드 전면 rename은 진행하지 않습니다.

## Transition Plan (Phased)

### Phase 0 (현재 태스크 범위)
- 방향성 및 영향도 문서화
- 루트 의존성 정리/패키징 안정화 선행

### Phase 1 (별도 태스크)
- `@obora/*` 패키지별 rename 계획 수립
- 각 패키지의 `name`, 내부 import, 문서, 스크립트 영향 목록화

### Phase 2 (별도 태스크)
- 실제 rename + 내부 참조 일괄 전환
- 빌드/테스트/배포 파이프라인 검증

### Phase 3 (별도 태스크)
- 호환 레이어(필요 시) 제거
- 레거시 스코프 사용 금지 룰 정착

## Breaking Change Impact Analysis

스코프 변경은 패키지 소비자 관점에서 breaking change입니다.

1. **Import 경로 변경**
   - 예: `@obora/core` → `@obora-kit/core`
2. **package.json 의존성 명 변경**
   - 외부/내부 소비자 모두 의존성 키 업데이트 필요
3. **문서/예제/스크립트 수정 필요**
   - README, 템플릿, 코드 생성기, CI 스크립트 등
4. **캐시/락파일 갱신 필요**
   - lockfile, 빌드 캐시, 패키지 매니저 해석 결과 변경

## Mitigations

- 릴리즈 노트에 스코프 마이그레이션 가이드 제공
- 가능하면 한 번에 전체 전환(부분 전환 장기화 방지)
- 전환 PR에 자동 치환 스크립트 및 검증 체크리스트 포함

## Consequences

### Positive
- 네이밍 규칙 단순화
- 온보딩/문서/배포 기준 일원화
- 장기 유지보수성 향상

### Negative / Cost
- 소비자 코드 변경 비용
- 마이그레이션 기간 동안 임시 혼재 가능성

## Out of Scope

- 실제 패키지 rename 실행
- 호환 alias 패키지 제공 여부 확정
- 버전 전략(major bump 시점) 확정
