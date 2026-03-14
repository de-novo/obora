# Artifact Cleanup Plan

## 목적
제품 코드 main 반영 이후 남아 있는 실험 자산을 정리한다.

## 분류
### 보존
- `output/archive/` : 연구/설계/구현 handoff 문서
- `sandbox/math-proof-loop/` : one-file / proof-loop 후속 검증 자산
- `sandbox/glm47-research-loop/notes/next-additions.md` : 후속 실험 backlog

### 승격 검토
- `sandbox/glm47-research-loop/` : curated example로 재구성할 가치가 있음
- `sandbox/math-proof-loop/input/one-file-research-demo.yaml` : docs/example로 승격 가능성 있음

### 삭제 후보
- `.tmp-research-loop-backups/`
- `.tmp-run-onefile-research.mjs`
- `.tmp-run-onefile-research.ts`
- `.artifacts/`
- `hello/`
- `output/final/`, `output/iterations/` 중 archive로 이미 승격된 중복 산출물

## 권장 순서
1. 임시 파일 삭제
2. archive 문서 보존
3. sandbox는 notes/input 중심으로 보존, 과도한 출력은 정리
4. 필요 시 curated example만 제품 트리로 재도입

## 현재 상태 (2026-03-15)
- top-level `output/`은 archive 중심 구조로 정리됨
- `output/final/`, `output/iterations/`는 `sandbox/math-proof-loop/output/`로 재배치됨
- `output/one-file-research-demo/`는 `output/archive/one-file-research-demo/`로 편입됨
- `sandbox/glm47-research-loop/output/`은 최소 실행 흔적만 남기고 축소됨 (`00-loop-state.md` + 핵심 실패 로그)
- 중복된 pseudo-result(`results/*.json`)는 제거했고, compact 실패 로그는 archive로 이동됨
