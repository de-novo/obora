# Post-Merge Artifact Triage

## 목적
main 반영 이후 남아 있는 연구/실험 자산을 **보존 / 삭제 / 승격** 관점으로 분류한다.

## 분류 기준
### 보존
- 연구 재현성에 의미가 있는 산출물
- 후속 실험 설계에 직접 도움이 되는 sandbox
- archive 문서로 참조 가치가 있는 결과물

### 삭제
- 임시 백업
- 캐시/중간 산출물
- 재생성 가능하고 장기 가치가 낮은 결과물

### 승격
- 제품 예제로 다듬을 가치가 있는 sandbox 자산
- docs/examples로 옮기면 사용자 가치가 생기는 자산

## 1차 권장 분류
### 보존
- `output/archive/` : 연구 및 구현 기록 문서 세트
- `sandbox/glm47-research-loop/notes/next-additions.md` : 후속 실험 backlog
- `sandbox/math-proof-loop/` : one-file/proof-loop 후속 검증용 실험 공간

### 삭제 후보
- `.tmp-research-loop-backups/` : 임시 백업
- `.artifacts/` : 재생성 가능 중간 산출물
- `hello/` : 의미 없는 잔여 테스트 디렉토리라면 삭제 후보
- `output/final`, `output/iterations` : archive에 핵심이 승격된 뒤 중복 산출물은 정리 가능

### 승격 후보
- `sandbox/glm47-research-loop/` 전체 중 curated subset
- `sandbox/math-proof-loop/`의 one-file proof-loop 실험에서 가치 있는 부분

## 다음 액션
1. 실험 산출물 스캔
2. 삭제 후보 확정
3. 보존/승격 대상만 남기고 정리
4. one-file 기반 연구 플로우 재실행
