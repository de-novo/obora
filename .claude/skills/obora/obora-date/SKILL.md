---
name: obora-date
description: Get current date and time. Use when you need today's date, current time, timestamps, or date calculations.
allowed-tools: Bash
user-invocable: true
---

# Get Current Date/Time

현재 날짜와 시간을 조회합니다.

## 사용 시점

- "오늘 날짜가 뭐야?"
- "현재 시간 알려줘"
- "타임스탬프 필요해"
- 문서에 날짜 기입 시
- 파일명에 날짜 포함 시

## 명령어

요청에 맞는 형식으로 조회:

```bash
# 기본 날짜 (YYYY-MM-DD)
date +%Y-%m-%d

# ISO 8601 (UTC)
date -u +%Y-%m-%dT%H:%M:%SZ

# 로컬 날짜시간
date "+%Y-%m-%d %H:%M:%S"

# 연도만
date +%Y

# 월만
date +%m

# 일만
date +%d

# 요일
date +%A

# Unix 타임스탬프
date +%s

# 상대 날짜 (macOS)
date -v+7d +%Y-%m-%d  # 7일 후
date -v-1m +%Y-%m-%d  # 1달 전

# 상대 날짜 (Linux)
date -d "+7 days" +%Y-%m-%d
date -d "1 month ago" +%Y-%m-%d
```

## 워크플로우

1. 필요한 날짜 형식 파악
2. 적절한 `date` 명령어 실행
3. 결과를 사용자에게 전달 또는 문서에 적용
