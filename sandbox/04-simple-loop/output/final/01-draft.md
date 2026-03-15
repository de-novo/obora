# Draft

## Summary

Obora의 네 번째 canonical sandbox는 draft → validation → repair → validation의 루프를 시연하기 위해 설계되었습니다. 첫 번째 draft는 의도적으로 불완전하게 작성되며, validator가 이를 명확히 실패로 보고하도록 구성됩니다. 그 후 repair step이 draft를 수정하여 최종적으로 PASS validation을 달성합니다.

## Key Points

1. **의도적 불완전성**: 첫 draft는 validator가 실패를 감지할 수 있도록 일부러 불완전하게 작성됩니다.
2. **명확한 실패 보고**: validator는 누락된 섹션이나 내용을 명확히 지적해야 합니다.
3. **자동 복구**: repair step은 validator의 피드백을 바탕으로 draft를 수정합니다.
4. **최종 승인**: 수정된 draft는 PASS validation을 받아야 합니다.
