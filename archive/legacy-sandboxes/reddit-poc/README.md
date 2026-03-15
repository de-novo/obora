# Reddit PoC Sandbox

> 상태: **legacy / 참고용 sandbox**
>
> 이 폴더는 현재 canonical sandbox 기준이 아닙니다. 짧은 native workflow로 seed 데이터를 읽고 점수/랭킹을 계산하는 Reddit-like ranking PoC 목적의 sandbox입니다.

## 목적
- 가장 작은 native workflow 형태 실험
- seed 기반 집계/정렬 파이프라인 검증
- artifact JSON 출력 검증

## 주요 입력
- `seeds/posts.json`
- `seeds/votes.json`

## 주요 설정
- `.obora/config.yaml`
- `.obora/agents.yaml`
- `.obora/workflows/reddit-basic.yaml`

## 비고
이 sandbox는 짧은 workflow 예제로는 유용했지만, 앞으로의 sandbox 설계 기준(canonical structure)을 직접 대표하진 않습니다.
