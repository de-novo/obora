# Pi + GLM-5 `~/` 경로 안정성 검증 (2026-02-13)

## 테스트 조건
- CLI: `pi` (v0.52.10)
- Provider/Model: `--provider zai --model glm-5`
- 실행 위치: `~/workspace/github/obora-kit`
- 환경변수: `ZAI_API_KEY` 설정
- 실행 모드: PTY=true, 각 케이스 timeout=300s
- 출력 요구: 정확히 4라인

## 결과 비교표
| 케이스 | 경로 표기 | 종료 코드 | 소요 시간 | 4라인 준수 | 출력 완결성 | 비고 |
|---|---|---:|---:|---|---|---|
| TASK-036 (기준 성공 케이스) | `~/workspace/...` | 0 | 15s | 예 (4/4) | 정상 | 즉시 종료 |
| TASK-042c | `~/workspace/...` | 0 | 18s | 예 (4/4) | 정상 | hang 미재현 |
| TASK-042c (대조군) | `/Users/denovo/workspace/...` | 0 | 20s | 예 (4/4) | 정상 | hang 미재현 |

## 판정
- **`~/` 경로 사용 자체는 이번 재실행에서 문제 원인으로 보이지 않음**.
- 동일 TASK-042c가 `~/`/절대경로 모두 정상 종료(0) + 출력 완결(4라인)됨.
- 따라서 이전 042c hang은 **경로/권한 이슈보다는 입력 내용 복잡도·모델 응답 상태·일시적 런타임 조건** 가능성이 상대적으로 큼.

## hang 재현 조건 정리(현재 관측)
- 본 매트릭스(4라인 강제, 단일 문서 참조, timeout 300)에서는 hang 재현 실패.
- 재현을 위해서는 아래 축을 늘린 추가 실험 필요:
  1. 프롬프트 길이/요구사항 복잡도 증가 (다중 파일, 다단계 지시)
  2. 출력 제약 완화(장문 허용) vs 강제 포맷 비교
  3. 동일 프롬프트 반복 N회(예: 10회)로 간헐 hang 확률 측정
  4. 네트워크/백엔드 응답 지연 구간(시간대) 분리 측정

## 산출물 경로
- prompts/: `.automation/pi-tilde-path-test-20260213/prompts/`
- logs/: `.automation/pi-tilde-path-test-20260213/logs/`
- meta/: `.automation/pi-tilde-path-test-20260213/meta/`
