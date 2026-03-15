# Sandbox Shared Library

> 상태: **지원 라이브러리 폴더**
>
> 이 폴더는 개별 sandbox가 아니라, 여러 sandbox runner가 공통으로 사용하는 helper 스크립트 보관용 디렉터리입니다.

## 목적
- 장시간 실행 runner 공통 로직 재사용
- watchdog / logging / snapshot helper 제공

## 현재 포함 요소
- `run-obora-with-watchdog.sh`: idle watchdog + large safety ceiling 기반 실행 helper
