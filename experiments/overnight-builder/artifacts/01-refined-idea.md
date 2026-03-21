# Refined Idea: TaskMaster CLI

## 1. 프로젝트 개요

**TaskMaster** - 로컬에서 동작하는 CLI 기반 할 일 관리 도구

### 비전
- 단순하지만 프로덕션 품질의 할 일 관리 도구
- "진짜 배포할 수 있는 수준"의 완성도 목표
- AI가 자율적으로 기획→개발→테스트→문서화까지 수행하는지 검증

### 기술 스택 (constraints.md 준수)
- 언어: TypeScript (strict mode)
- 런타임: Node.js 20+
- 패키지 매니저: npm
- 테스트: vitest
- 저장: 로컬 JSON 파일 (~/.taskmaster/tasks.json)
- 외부 의존성: 없음 (순수 로컬)

---

## 2. 이번 Cycle에서 추가/개선할 기능

> **Cycle 1 - 핵심 CRUD 완성 + 기본 UX**

### 2.1 할 일 추가 기능 (`taskmaster add`)
- **사용자 입력**: `<제목>` (필수), `[--priority low|medium|high]` (선택, 기본값: medium)
- **동작**:
  - 고유 ID 생성 (timestamp 기반)
  - 생성일시 자동 기록
  - 우선순위 기본값 적용
  - JSON 파일에 저장
- **출력**: "✅ Task added: [ID] <제목>"

### 2.2 할 일 목록 보기 (`taskmaster list` 또는 `taskmaster ls`)
- **사용자 입력**: `[--all]` (선택, 완료된 항목도 표시)
- **동작**:
  - 미완료 항목 기본 표시
  - `--all` 시 완료 항목도 함께 표시
  - 우선순위별 정렬 (high → medium → low)
  - 생성일시 오름차순 정렬 (2차 정렬)
- **출력 형식**:
  ```
  📋 Tasks (3 pending, 1 completed)
  
  [A] abc123 Fix login bug                    (high)   2026-03-21 09:30
  [ ] def456 Write documentation              (medium) 2026-03-21 10:15
  [ ] ghi789 Review pull request              (low)    2026-03-21 11:00
  
  💡 Use --all to show completed tasks
  ```
  - `[A]` = 완료됨, `[ ]` = 미완료
  - ID는 앞 6자리만 표시

---

## 3. 프로덕션 품질 기준

### 3.1 에러 핸들링
- **파일 시스템 에러**:
  - 파일이 손상된 경우: "❌ Error: Task file corrupted. Run 'taskmaster repair' to fix."
  - 권한 문제: "❌ Error: Cannot write to ~/.taskmaster/tasks.json. Check permissions."
  - 디스크 가득 참: 명확한 에러 메시지
- **입력 검증**:
  - 빈 제목: "❌ Error: Task title cannot be empty"
  - 잘못된 priority 값: "❌ Error: Priority must be low, medium, or high"
- **Graceful degradation**:
  - 파일이 없으면 자동 생성 (첫 실행 시)
  - 디렉터리가 없으면 자동 생성

### 3.2 엣지 케이스
- **빈 목록**: "✨ No tasks yet. Add one with 'taskmaster add <title>'"
- **매우 긴 제목**: 80자 이상 시 말줄임표(...) 처리
- **특수문자 포함 제목**: 안전하게 저장 (JSON escape)
- **동시 실행**: 파일 잠금은 구현하지 않으나, 충돌 시 에러 메시지 명확히
- **잘못된 JSON 복구**: `taskmaster repair` 명령으로 백업에서 복구 또는 초기화

### 3.3 UX (사용자 경험)
- **색상 코드**:
  - 성공: 초록색 (✅)
  - 에러: 빨간색 (❌)
  - 정보: 파란색 (💡)
  - 우선순위: high=빨강, medium=노랑, low=회색
- **도움말**:
  - `taskmaster --help`: 전체 명령 목록
  - `taskmaster add --help`: add 명령 상세 도움말
- **피드백**: 모든 작업에 즉각적인 시각적 피드백
- **탭 완성**: (이번 cycle에는 미포함, 향후 추가 가능)

### 3.4 코드 품질
- TypeScript strict mode 활성화
- 모든 함수에 JSDoc 주석
- 테스트 커버리지 ≥ 80% (핵심 로직 100%)
- Lint 통과 (ESLint)

---

## 4. 완료 기준 (Definition of Done)

### 기능 완료
- [ ] `taskmaster add <title>` 동작
- [ ] `taskmaster list` / `taskmaster ls` 동작
- [ ] `taskmaster --help` 동작
- [ ] `taskmaster add --help` 동작
- [ ] JSON 파일 저장/로드 동작

### 품질 완료
- [ ] 모든 테스트 통과 (`npm test`)
- [ ] 테스트 커버리지 ≥ 80%
- [ ] TypeScript 컴파일 에러 0개
- [ ] ESLint 에러/경고 0개
- [ ] 빈 목록, 긴 제목, 특수문자 엣지 케이스 테스트 포함
- [ ] 파일 시스템 에러 핸들링 테스트 포함

### 문서화 완료
- [ ] README.md 작성 (설치 방법, 사용법, 예시)
- [ ] 코드 내 JSDoc 주석 완료

### 배포 준비
- [ ] `npm install -g .` 로 전역 설치 가능
- [ ] `taskmaster` 명령어로 실행 가능

---

## 5. 전체 프로젝트 진행률 추정

### 전체 로드맵
| Phase | 기능 | 상태 |
|-------|------|------|
| **Cycle 1** | add, list | 🔄 현재 |
| Cycle 2 | complete, delete | ⏳ 예정 |
| Cycle 3 | edit, filter, search | ⏳ 예정 |
| Cycle 4 | 통계, export/import | ⏳ 예정 |
| Cycle 5 | polish, 최종 QA, README 완성 | ⏳ 예정 |

### 현재 진행률
- **전체 기능 기준**: 20% (2/10개 기능)
- **프로덕션 품질 기준**: 10% (기본 CRUD 후 품질 향상 예정)
- **이번 cycle 완료 후 예상**: 40% (기본 CRUD 완료)

### 리스크
1. **JSON 손상**: 사용자가 수동으로 파일 수정 시 문제 발생 가능 → repair 명령으로 완화
2. **동시성 문제**: 다중 터미널에서 동시 실행 시 데이터 손실 가능 → 향후 파일 잠금 고려
3. **플랫폼 호환성**: Windows 경로 문제 → path 모듈로 크로스 플랫폼 지원

---

## 부록: 다음 Cycle 계획 (참고용)

### Cycle 2 예정 기능
1. `taskmaster complete <id>` - 할 일 완료 처리
2. `taskmaster delete <id>` - 할 일 삭제

### 이후 Cycle 예정 기능
- edit (제목, 우선순위 수정)
- filter (상태, 우선순위, 날짜별 필터)
- search (제목 검색)
- stats (완료율 등 통계)
- export/import (JSON 백업/복원)
