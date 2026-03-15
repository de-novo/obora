# Sandbox Reboot Plan

> Last updated: 2026-03-15

## 방향

기존 sandbox는 모두 레거시로 분리했다.
이제부터 sandbox는 `sandbox/canonical-simple`를 출발점으로 **처음부터 다시 설계**한다.

## 현재 활성 sandbox
- `sandbox/canonical-simple`

## 원칙
1. 기존 레거시 sandbox를 설계 기준으로 삼지 않는다.
2. 가장 작은 native workflow부터 만든다.
3. 입력 1개, 출력 1개, 성공 기준 1개를 먼저 정의한다.
4. runner, workflow, output 구조는 최소 형태로 시작한다.
5. 검증 가능한 작은 성공을 먼저 만든 뒤 확장한다.

## 다음 작은 단계
1. `sandbox/canonical-simple` 최소 디렉터리 구조 생성
2. 가장 짧은 native workflow 1개 정의
3. README에 실행 명령과 성공 기준 추가
