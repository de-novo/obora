
# Preset Conflict Detection - User Guide

## 📋 개요

obora-kit v1.1.0부터 **사전 충돌 감지** 기능이 추가되었습니다. 이 기능을 통해 사용자는 프리셋 설치 전에 충돌 가능성을 미리 확인할 수 있습니다.

## 🔍 충돌 감지 기능

### 1. detectConflicts 함수

**위치**: `src/utils/detect-conflicts.ts`

**기능**: 특정 프리셋의 충돌 여부를 사전에 감지

**감지 유형**:
1. **매니페스트 레벨 충돌**: `manifest.conflicts` 필드에 정의된 프리셋과의 충돌
2. **슬롯 레벨 충돌**: exclusive 카테고리에 이미 다른 프리셋이 설치된 경우
3. **순환 의존성**: 의존성 체인에서 순환 발견

**반환값**: `ConflictDetectionResult`
```typescript
{
  hasConflict: boolean;        // 충돌 존재 여부
  reason: string;             // 충돌 원인 설명
  conflictingPresets: string[]; // 충돌하는 프리셋 목록
  conflictSlot?: string;     // 충돌 발생 슬롯
}
```

### 2. detectConflictsForMultiple 함수

**기능**: 여러 프리셋의 충돌을 한 번에 감지

**사용 예시**:
```bash
obora check-conflicts clerk,drizzle,polar
```

### 3. check-conflicts 명령어

**위치**: `commands/check-conflicts.ts`

**기능**: CLI에서 프리셋 충돌만 확인

**사용법**:
```bash
# 단일 프리셋 확인
obora check-conflicts drizzle

# 여러 프리셋 확인 (콤마로 구분)
obora check-conflicts clerk,drizzle,polar
```

---

## 🎯 명령행 옵션

### --dry-run 플래그

**목적**: 실제 변경 없이 충돌만 미리 확인

**사용법**:
```bash
obora add <preset> --dry-run
```

**동작**:
- 충돌이 있으면 에러 메시지 출력 후 종료
- 충돌이 없으면 성공 메시지 출력
- 파일/의존성/설정 변경 없음

**예시**:
```bash
$ obora add clerk --dry-run
🔍 Checking conflicts for 1 preset(s)

✓ clerk: No conflicts detected
```

### --force 플래그

**목적**: 충돌 발생 시에도 강제 설치

**사용법**:
```bash
obora add <preset> --force
```

**동작**:
- 충돌 감지를 건너뜁고 바로 설치 진행
- 충돌 프리셋 자동 제거
- 사용자 확인 없이 진행

**예시**:
```bash
$ obora add drizzle --force
⚠️  drizzle과(와) 충돌하지만 --force 옵션으로 강제 설치합니다...
```

---

## ⚠️  충돌 해결 방법 개선

### 이전 방식
```typescript
const { action } = await prompts({
  type: "select",
  message: "Choose an action:",
  choices: [
    { title: "🔄 Replace", value: "replace" },
    { title: "✋ Keep existing", value: "keep" },
  ],
});
```

### 개선된 방식

충돌 타입에 따라 명시적인 충돌 원인 표시:
- **exclusive 슬롯 충돌**: `exclusive` 카테고리에서 발생
- **매니페스트 충돌**: `manifest.conflicts`에 정의된 프리셋과의 충돌

또한 **danger** 경고를 추가하여 exclusive 카테고리에서의 replace 동작 위험성을 명시합니다.

---

## 📊 충돌 감지 결과 해석

### 충돌이 없는 경우
```
✓ <preset>: No conflicts detected
```

### 충돌이 있는 경우

```
❌ <preset>: <충돌 원인>

   Conflict slot: <슬롯 이름>
   Conflicting presets: <충돌하는 프리셋 목록>
```

### 해결 방법 제안

1. **Replace**: 충돌하는 프리셋 제거 후 설치
2. **Keep existing**: 설치 취소
3. **Force**: --force 플래그로 확인 없이 설치

---

## 🔄 워크플로우

```
1. obora add <preset> 명령 실행
    ↓
2. detectConflicts()로 사전 충돌 감지 (선택적)
    ↓
3. 충돌 발생 시 사용자에게 옵션 제시
    ↓
4. 사용자가 옵션 선택 후 설치 진행 또는 취소
```

---

## 💡 사용 팁

### 사전 확인 추천
- 새로운 프로젝트에 프리셋 추가 전: `obora check-conflicts <preset> --dry-run`
- 여러 프리셋 추가 전: `obora check-conflicts preset1,preset2,preset3`
- 충돌 확인 후: 문제 해결 방법 고려

### 안전한 설치 방법
- --dry-run 플래그로 먼저 충돌 확인
- 충돌 없는지 확인 후 실제 설치 진행
- 중요한 프리셋은 --force 없이 사용 권장

---

## 📚 관련 문서

- [PRESET ARCHITECTURE](../ARCHITECTURE.md) - 프리셋 아키텍처
- [ADD COMMAND](../README.md#add) - obora add 명령어 상세
- [CLI COMMANDS](../README.md#commands) - 전체 CLI 명령어 목록

---

## 🔧 개발 정보

**구현 버전**: v1.1.0  
**구현 날짜**: 2026-01-27  
**관련 패키지**: 
- @obora/cli
- @obora/project-config

---

## 🐛 알려진 이슈

- [ ] detect-conflicts 단위 테스트에서 import 경로 이슈 해결
- [ ] check-conflicts 명령어 도움말 개선

---

## 📝 변경 로그

### v1.1.0 (2026-01-27)
- ✅ detectConflicts 함수 구현
- ✅ detectConflictsForMultiple 함수 구현  
- ✅ check-conflicts 명령어 추가
- ✅ --dry-run 플래그 추가
- ✅ --force 플래그 추가
- ✅ 충돌 해결 프롬프트 개선
- ✅ 사용 가이드 문서화
