#!/bin/bash
#
# PreToolUse Hook: OBORA_SESSION 검증
#
# Claude Code 직접 실행을 차단하고 obora chat 사용을 강제합니다.
# Exit code 2 = 차단 (stderr 메시지 표시)
# Exit code 0 = 허용
#

# OBORA_SESSION 환경 변수 체크
if [ -z "$OBORA_SESSION" ]; then
  # 차단 메시지 출력
  cat >&2 << 'EOF'

╔════════════════════════════════════════════════════════════════╗
║  ⚠️  Direct Claude Code execution is not allowed               ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  This project requires workflow enforcement.                   ║
║  Please use the orchestrator instead:                          ║
║                                                                ║
║    $ obora chat                                                ║
║                                                                ║
║  Or for one-off tasks:                                         ║
║                                                                ║
║    $ obora run "your task description"                         ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝

EOF

  # Exit code 2 = 도구 실행 차단
  exit 2
fi

# OBORA_SESSION이 설정되어 있으면 허용
exit 0
