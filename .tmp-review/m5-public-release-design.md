---
status: draft
owner: denovo
project: obora-kit
created: "2026-02-17"
updated: "2026-02-17"
links:
  - "[[projects/obora-kit/INDEX]]"
  - "[[projects/obora-kit/ROADMAP]]"
  - "[[projects/obora-kit/m4-dashboard-observability-design]]"
---

# M5 Public Release Design

## 1. 개요

M5의 목표는 **오픈소스 릴리즈 품질 확보**입니다.

Obora를 공개 프로젝트로 전환하려면, 문서만으로 자급자족이 가능하고, 첫 사용자가 빠르게 가치를 경험할 수 있어야 합니다. M5는 문서화, 예제, 패키지 발행, OSS 인프라를 체계적으로 준비하여 신규 사용자의 진입 장벽을 낮춥니다.

### M5 성공 기준
- 신규 사용자가 **30분 내 첫 워크플로우 실행** 가능 (M5-16 검증 프로토콜 기준 PASS)
- 문서만으로 정책/복구/합의 구성 가능 (**문서 자급자족**)
- README를 읽은 신규 사용자가 **Obora를 1문장으로 설명 가능**
- 랜딩 페이지 hero section만으로 **문제-해결 구조를 30초 내 식별 가능**
- **npm 3패키지 발행** 완료 (`@obora/runtime`, `@obora/sdk`, `@obora/cli`)

---

## 2. 태스크 분해 (16개, 6 트랙)

### Track A — Documentation (M5-01~05)
- **M5-01** Root README + Getting Started — 프로젝트 진입점, 빠른 시작 가이드
- **M5-02** API Reference (SDK) — `@obora/sdk` TypeDoc 생성
- **M5-03** API Reference (Runtime) — `@obora/runtime` TypeDoc 생성
- **M5-04** CLI Reference — 명령어별 사용법 문서
- **M5-05** Tutorials (3편) — 주요 시나리오별 단계별 가이드

### Track B — Examples (M5-06~07)
- **M5-06** Example workflows (5+) — 실제 동작하는 워크플로우 예제
- **M5-07** Example project template — `obora init` 스캐폴딩 템플릿

### Track C — Package Publishing (M5-08~11)
- **M5-08** Package metadata 정리 — package.json, 라이선스, 의존성 정리 + CLI bin/entrypoint 계약
- **M5-09** Build pipeline 안정화 — CI 빌드/테스트/번들 검증
- **M5-10** npm publish dry-run — 발행 전 검증
- **M5-11** npm publish 실제 — 3패키지 npm 레지스트리 발행

### Track D — OSS Infrastructure (M5-12~14)
- **M5-12** LICENSE + CODE_OF_CONDUCT — 라이선스 및 행동 강령
- **M5-13** CONTRIBUTING + 템플릿 — 기여 가이드, 이슈/PR 템플릿
- **M5-14** CI/CD (GitHub Actions) — 자동화 파이프라인

### Track E — Landing (M5-15)
- **M5-15** Landing page / positioning doc — 프로젝트 포지셔닝 및 랜딩 페이지

### Track F — Integration (M5-16)
- **M5-16** 30분 온보딩 E2E 검증 — 신규 사용자 관점 전체 흐름 검증

---

## 3. 각 태스크별 상세 명세

### M5-01 — Root README + Getting Started
- **목표**: 프로젝트의 첫인상과 빠른 시작 경로를 제공한다.
- **입력/출력**:
  - 입력: 현재 README, 기존 문서
  - 출력: 루트 README.md, docs/getting-started.md
- **의존**: 없음
- **성공 기준**: README를 읽은 신규 사용자가 Obora를 무엇인지 1문장으로 설명 가능, 10분 내 첫 실행 가능
- **비목표**: 전체 API 설명, 고급 설정

### M5-02 — API Reference (SDK)
- **목표**: `@obora/sdk`의 공개 API를 문서화한다.
- **입력/출력**:
  - 입력: SDK 소스 코드 (`packages/sdk`)
  - 출력: TypeDoc 생성 HTML/MD, docs/api/sdk/
- **의존**: 없음
- **성공 기준**: 모든 export된 타입/함수에 대한 문서 존재
- **비목표**: 내부 구현 문서화

### M5-03 — API Reference (Runtime)
- **목표**: `@obora/runtime`의 공개 API를 문서화한다.
- **입력/출력**:
  - 입력: Runtime 소스 코드 (`packages/runtime`)
  - 출력: TypeDoc 생성 HTML/MD, docs/api/runtime/
- **의존**: 없음
- **성공 기준**: 모든 export된 타입/함수에 대한 문서 존재
- **비목표**: 내부 구현 문서화

### M5-04 — CLI Reference
- **목표**: CLI 명령어의 사용법을 체계적으로 문서화한다.
- **입력/출력**:
  - 입력: CLI 소스 코드 (`packages/cli`)
  - 출력: docs/cli/README.md, 명령어별 상세 페이지
- **의존**: 없음
- **성공 기준**: 모든 명령어/옵션에 대한 설명 및 예제 존재
- **비목표**: CLI 내부 구조 설명

### M5-05 — Tutorials (3편)
- **목표**: 주요 사용 시나리오를 단계별로 안내한다.
- **입력/출력**:
  - 입력: 시나리오 정의 (기본 워크플로우, 정책 설정, 멀티에이전트)
  - 출력: docs/tutorials/ 하위 3개 문서
- **의존**: M5-01, M5-06
- **성공 기준**: 각 튜토리얼을 따라하면 실제 실행 결과 확인 가능
- **비목표**: 모든 기능의 튜토리얼화

### M5-06 — Example workflows (5+)
- **목표**: 복사-붙여넣기로 실행 가능한 워크플로우 예제 제공
- **입력/출력**:
  - 입력: 시나리오 패턴 (단일 에이전트, 멀티에이전트, 정책, 복구 등)
  - 출력: examples/ 디렉토리 하위 5개 이상 워크플로우
- **의존**: 없음
- **성공 기준**: 모든 예제가 `pnpm run` 으로 실행 가능
- **비목표**: 프로덕션급 복잡도

### M5-07 — Example project template
- **목표**: `obora init` 명령으로 생성되는 프로젝트 스캐폴딩 제공
- **입력/출력**:
  - 입력: 표준 프로젝트 구조 정의
  - 출력: templates/ 디렉토리, CLI init 연동
- **의존**: M5-06
- **성공 기준**: `obora init my-project` 실행 후 즉시 워크플로우 실행 가능
- **비목표**: 다양한 템플릿 변형

### M5-08 — Package metadata 정리
- **목표**: npm 발행을 위한 패키지 메타데이터 정리
- **입력/출력**:
  - 입력: 각 패키지의 package.json
  - 출력: 정리된 package.json (name, version, license, keywords, repository, exports/bin 등)
- **의존**: 없음
- **성공 기준**: npm 발행 기준 충족, 패키지 정보 일관성, `@obora/cli`의 `bin` 필드가 외부 실행 엔트리포인트 계약을 명시
- **비목표**: 버전 전략 자동화

### M5-09 — Build pipeline 안정화
- **목표**: 모든 패키지의 빌드/테스트가 CI에서 안정적으로 동작
- **입력/출력**:
  - 입력: Turborepo 빌드 설정
  - 출력: CI 통과하는 빌드/테스트 파이프라인
- **의존**: M5-08
- **성공 기준**: `pnpm build && pnpm test` 가 로컬/CI 동일 결과
- **비목표**: 퍼포먼스 최적화

### M5-10 — npm publish dry-run
- **목표**: 실제 발행 전 dry-run으로 문제 사전 검증
- **입력/출력**:
  - 입력: 빌드 산출물
  - 출력: `npm publish --dry-run` 성공 로그
- **의존**: M5-09
- **성공 기준**: 3패키지 모두 dry-run 통과
- **비목표**: 자동 버전 범핑

### M5-11 — npm publish 실제
- **목표**: npm 레지스트리에 3패키지 발행
- **입력/출력**:
  - 입력: dry-run 통과된 패키지 + 릴리즈 게이트 충족 상태 + 사용자 명시적 승인
  - 출력: npmjs.com에 `@obora/runtime`, `@obora/sdk`, `@obora/cli` 존재
- **의존**: M5-10, M5-12, M5-16
- **성공 기준**: `npm install @obora/sdk` 정상 동작, 승인 없이는 publish 실행 금지
- **실패 복구 계약**:
  - npm 정책상 허용 조건을 만족할 때만 unpublish를 수행한다.
  - unpublish가 불가하면 deprecate + 수정 버전 재발행으로 복구한다.
  - 실패 후 재발행은 동일 버전 재사용 금지, 반드시 version bump 후 진행한다.
- **비목표**: 자동 릴리즈 파이프라인

### M5-12 — LICENSE + CODE_OF_CONDUCT
- **목표**: OSS 필수 법적/윤리적 문서 준비
- **입력/출력**:
  - 입력: 라이선스 선택 (MIT)
  - 출력: LICENSE, CODE_OF_CONDUCT.md
- **의존**: 없음
- **성공 기준**: GitHub OSS 표준 체크 통과
- **비목표**: 복잡한 라이선스 조합

### M5-13 — CONTRIBUTING + 템플릿
- **목표**: 외부 기여자를 위한 가이드 및 템플릿 제공
- **입력/출력**:
  - 입력: 기여 정책 정의
  - 출력: CONTRIBUTING.md, .github/ISSUE_TEMPLATE/, .github/PULL_REQUEST_TEMPLATE.md
- **의존**: 없음
- **성공 기준**: 신규 기여자가 첫 PR을 올리는 데 필요한 모든 정보 포함
- **비목표**: CLA 자동화

### M5-14 — CI/CD (GitHub Actions)
- **목표**: PR/Push 기반 자동화 파이프라인 구축
- **입력/출력**:
  - 입력: 빌드/테스트/린트 명령
  - 출력: .github/workflows/ (ci.yml, release.yml)
- **의존**: M5-09
- **성공 기준**: PR에서 빌드/테스트 자동 실행, 태그 push 시 릴리즈 트리거
- **비목표**: 복잡한 매트릭스 테스트

### M5-15 — Landing page / positioning doc
- **목표**: 프로젝트 가치 제안을 명확히 전달
- **입력/출력**:
  - 입력: VISION, PRINCIPLES
  - 출력: 랜딩 페이지 (docs/index.md 또는 별도 사이트) 또는 positioning doc
- **의존**: M5-01
- **성공 기준**: 랜딩 페이지 hero section에서 문제-해결 구조를 30초 내 식별 가능
- **비목표**: 마케팅 사이트 전체 구축

### M5-16 — 30분 온보딩 E2E 검증
- **목표**: 신규 사용자 관점에서 전체 온보딩 흐름 검증
- **입력/출력**:
  - 입력: M5 산출물 전체
  - 출력: E2E 검증 결과 (통과/실패 + 개선점 + 단계별 소요 시간)
- **의존**: M5-01, M5-05, M5-06, M5-07
- **검증 프로토콜(계약 수준)**:
  - 검증 환경: 깨끗한 환경(새 디렉토리 또는 동등한 격리 환경)에서 시작
  - 단계: README 확인 → 설치/초기화 → 예제 실행 → 정책/복구/합의 설정 확인
  - 측정: 각 단계 시작/종료 시각 기록, 총 소요 시간 집계
  - 판정: 30분 이내 첫 워크플로우 실행 + 필수 단계 완료 시 PASS, 아니면 FAIL
- **성공 기준**: 외부 검증자가 문서만으로 30분 내 첫 워크플로우 실행 성공
- **비목표**: 사용자 리서치

---

## 4. 기술 선택

| 항목 | 선택 | 이유 |
|------|------|------|
| API 문서 생성 | TypeDoc | TypeScript 네이티브, 자동 타입 추출 |
| 문서 사이트 | Markdown + VitePress/Docusaurus (선택) | 간단한 시작, 확장 가능 |
| CI/CD | GitHub Actions | GitHub 네이티브, 무료 tier |
| 라이선스 | MIT | 최대 채택성, 단순성 |
| 패키지 레지스트리 | npm (public) | 표준 JavaScript 생태계 |

---

## 5. 의존 관계

```
Track A (Documentation)
  M5-01 ───┐
           ├──> M5-05 (Tutorials)
  M5-06 ───┘
  M5-02, M5-03, M5-04 (독립)

Track B (Examples)
  M5-06 ──> M5-07 (Template)

Track C (Package Publishing)
  M5-08 ──> M5-09 ──> M5-10 ──> M5-11
                              ↗    ↖
  M5-12 ─────────────────────┘    M5-16 (검증 PASS + 승인 게이트)

Track D (OSS Infrastructure)
  M5-12, M5-13 (독립)
  M5-09 ──> M5-14 (CI/CD)

Track E (Landing)
  M5-01 ──> M5-15

Track F (Integration)
  M5-01, M5-05, M5-06, M5-07 ──> M5-16
```

### 병렬 실행 가능 그룹

| 그룹 | 태스크 | 선행 조건 |
|------|--------|----------|
| 1 (독립) | M5-01, M5-02, M5-03, M5-04, M5-06, M5-08, M5-12, M5-13 | 없음 |
| 2 | M5-05, M5-07, M5-09, M5-15 | 그룹 1 일부 |
| 3 | M5-10, M5-14 | 그룹 2 일부 |
| 4 (통합) | M5-16 | 그룹 2 대부분 완료 |
| 5 | M5-11 | M5-10, M5-12, M5-16 + 승인 게이트 |

---

## 6. 방향 수호 체크리스트

- [x] **AI 통제 강화?** → 문서/예제를 통해 통제 런타임 사용법 전달
- [x] **선언적/플러그인?** → 예제 워크플로우는 선언적 YAML 기반
- [x] **Orchestrator 결정성?** → 문서화 작업, 실행 로직 불변
- [x] **코드 생성기 특화 아닌가?** → 범용 AI Control Runtime 포지셔닝
- [x] **피봇 전 관성?** → 완전 신규 공개 준비 작업

---

## 7. 릴리즈 게이트

M5 완료 선언 조건:

1. **기능 게이트**: 30분 온보딩 E2E PASS
2. **품질 게이트**: 3패키지 npm 발행 완료, 문서 링크 정상
3. **통제 게이트**: 정책/복구/합의 설정 문서화 완료 + publish 승인/복구 계약 충족
4. **문서 게이트**: README, Getting Started, API Ref, Tutorials 완비
5. **방향 게이트**: Direction Guard Rails 체크리스트 전항목 YES

## 8. 릴리즈 게이트-태스크 매핑

| 릴리즈 게이트 | 충족 태스크 | 충족 기준 |
|---|---|---|
| 기능 게이트 | M5-16 | 검증 프로토콜 기준 30분 온보딩 PASS |
| 품질 게이트 | M5-08, M5-09, M5-10, M5-11 | 패키지 메타데이터/빌드/드라이런/실발행 완료 |
| 통제 게이트 | M5-05, M5-11, M5-16 | 정책/복구/합의 문서화 + publish 승인/복구 계약 + 검증 단계 확인 |
| 문서 게이트 | M5-01, M5-02, M5-03, M5-04, M5-05, M5-15 | 진입/레퍼런스/튜토리얼/포지셔닝 문서 완비 |
| 방향 게이트 | M5-15 + 본 문서 6장 | 포지셔닝과 체크리스트가 PRINCIPLES와 합치 |
