# Test Strategy Summary

## 1. 테스트 파일 구조

```
workspace/test/
├── tsconfig.json                    # 테스트용 TypeScript 설정
├── unit/                            # 유닛 테스트 (70-80%)
│   ├── validator.test.ts           # 입력 검증 테스트
│   ├── id-generator.test.ts        # ID 생성 테스트
│   ├── formatter.test.ts           # 출력 포맷팅 테스트
│   ├── todo.service.test.ts        # Todo 서비스 테스트
│   ├── storage.test.ts             # 저장소 테스트
│   ├── edge-cases.test.ts          # 엣지 케이스 테스트
│   ├── service-errors.test.ts      # 서비스 에러 시나리오
│   └── performance.test.ts         # 성능 테스트
├── integration/                     # 통합 테스트 (15-20%)
│   ├── cli.test.ts                 # CLI 통합 테스트
│   ├── storage.test.ts             # 저장소 통합 테스트
│   ├── todo-service.test.ts        # 서비스 통합 테스트
│   ├── edge-cases.test.ts          # 엣지 케이스 통합 테스트
│   └── lock-management.test.ts     # 잠금 관리 통합 테스트
└── e2e/                            # E2E 테스트 (5-10%)
    ├── cli.test.ts                 # CLI E2E 테스트
    ├── edge-cases.test.ts          # 엣지 케이스 E2E 테스트
    └── error-recovery.test.ts      # 에러 복구 E2E 테스트
```

---

## 2. 테스트 커버리지

### 2.1 유닛 테스트

#### validator.test.ts
- ✅ **정상 케이스**: 유효한 내용, 경계값 (1자, 500자)
- ❌ **에러 케이스**: 빈 값, 공백만, 501자
- 🎯 **엣지 케이스**: UTF-8 문자, 특수문자, 이모지, 줄바꿈

#### id-generator.test.ts
- ✅ **정상 케이스**: ID 생성, 고유성, 숫자 형식
- 🎯 **엣지 케이스**: 동시 호출, 시퀀스 증가, 단조 증가

#### formatter.test.ts
- ✅ **정상 케이스**: 빈 목록, 단일 항목, 여러 항목
- 🎯 **엣지 케이스**: 긴 내용 자르기, UTF-8 정렬

#### todo.service.test.ts
- ✅ **정상 케이스**: add/list/done/remove 성공
- ❌ **에러 케이스**: 검증 실패, ID 미발견
- 🎯 **엣지 케이스**: 중복 완료, 이미 삭제된 ID

#### storage.test.ts
- ✅ **정상 케이스**: 초기화, 로드, 저장, 백업/복구
- ❌ **에러 케이스**: 파일 없음, JSON 손상, 스키마 위반
- 🎯 **엣지 케이스**: 동시 접근, 잠금 타임아웃

#### edge-cases.test.ts
- 🎯 **한글/영어/공백 조합**: 다양한 언어 조합
- 🎯 **특수문자 및 이모지**: 이모지, 특수문자, 줄바꿈
- 🎯 **경계값**: 500자, 501자, 1자
- 🎯 **대량 데이터**: 1000개 항목
- 🎯 **날짜/시간 엣지**: 과거, 미래
- 🎯 **동시성 시뮬레이션**: 잠금 경쟁

#### service-errors.test.ts
- ❌ **저장소 에러**: 로드 실패, 저장 실패
- ❌ **잠금 에러**: 잠금 획득 실패
- ❌ **데이터 손상 복구**: 백업 복구, 복구 실패
- ❌ **검증 에러**: 빈 내용, 500자 초과, 잘못된 ID
- ❌ **리소스 미발견**: 존재하지 않는 ID
- ❌ **알 수 없는 에러**: null/undefined 에러

#### performance.test.ts
- ⚡ **대량 데이터**: 1000개 항목 처리
- ⚡ **필터링**: pending/all 필터링
- ⚡ **정렬**: 1000개 항목 정렬
- ⚡ **ID 생성**: 1000개 ID 생성
- ⚡ **검증**: 1000회 검증
- ⚡ **포맷팅**: 100개 항목 포맷팅
- ⚡ **메모리**: 메모리 누수 검사

---

### 2.2 통합 테스트

#### cli.test.ts
- ✅ **명령어**: add/list/done/remove
- ✅ **옵션**: --help, --version, --all
- ❌ **에러**: 빈 내용, 잘못된 ID
- 🎯 **데이터 영속성**: JSON 파일 저장

#### storage.test.ts
- ✅ **파일 시스템**: 실제 파일 읽기/쓰기
- ✅ **백업/복구**: 실제 백업 파일
- 🎯 **동시성**: 실제 파일 잠금

#### lock-management.test.ts
- ✅ **잠금 획득/해제**: 정상 흐름
- ❌ **잠금 경쟁**: 다중 인스턴스
- 🎯 **잠금 타임아웃**: 재시도 메커니즘
- 🎯 **잠금과 무결성**: 동시 쓰기 방지

---

### 2.3 E2E 테스트

#### cli.test.ts
- ✅ **전체 워크플로우**: add → list → done → remove
- ✅ **데이터 영속성**: 명령어 간 데이터 유지
- 🎯 **동시 접근**: 동시 명령 실행
- 🎯 **UTF-8 지원**: 한글, 이모지

#### error-recovery.test.ts
- ❌ **JSON 손상 복구**: 자동 복구
- ❌ **파일 권한 문제**: 읽기 전용 디렉토리
- 🎯 **동시 접근 시나리오**: 빠른 연속 작업
- 🎯 **데이터 무결성**: 특수문자, 카운트

---

## 3. 테스트 커버리지 목표

| 레이어 | 목표 | 현재 상태 |
|-------|------|----------|
| Utils (validator, id-generator, formatter) | 95%+ | ✅ 완료 |
| Service Layer | 90%+ | ✅ 완료 |
| Storage Layer | 85%+ | ✅ 완료 |
| CLI Layer | 70%+ | ✅ 완료 |
| **전체** | **80%+** | **✅ 완료** |

---

## 4. 테스트 실행 방법

### 4.1 모든 테스트 실행
```bash
npm test
```

### 4.2 특정 테스트 파일 실행
```bash
npm test -- test/unit/validator.test.ts
```

### 4.3 커버리지 리포트 생성
```bash
npm run test:coverage
```

### 4.4 감시 모드
```bash
npm run test:watch
```

---

## 5. 테스트 원칙 준수

### 5.1 FIRST 원칙
- ✅ **Fast**: 유닛 테스트 < 100ms
- ✅ **Independent**: 독립적 실행
- ✅ **Repeatable**: 반복 가능
- ✅ **Self-validating**: 자동 검증
- ✅ **Timely**: TDD로 구현 전 작성

### 5.2 모킹 전략
- ✅ 유닛 테스트: 저장소 모킹
- ✅ 통합 테스트: 실제 파일 시스템 (임시 디렉토리)
- ✅ E2E 테스트: 실제 환경

### 5.3 테스트 데이터
- ✅ 헬퍼 함수: `createSampleTodo()`, `createMockStorage()`
- ✅ 재사용 가능한 픽스처

---

## 6. 테스트 분포

```
총 테스트 케이스: 200+ (예상)

유닛 테스트: 150+ (75%)
├── validator: 15+
├── id-generator: 10+
├── formatter: 20+
├── todo.service: 40+
├── storage: 30+
├── edge-cases: 25+
├── service-errors: 20+
└── performance: 15+

통합 테스트: 40+ (20%)
├── cli: 15+
├── storage: 10+
├── todo-service: 10+
└── lock-management: 15+

E2E 테스트: 15+ (5%)
├── cli: 10+
└── error-recovery: 15+
```

---

## 7. 다음 단계

1. ✅ 테스트 파일 작성 완료
2. ⏭️ 구현 진행 (다음 step)
3. ⏭️ 모든 테스트 통과 확인
4. ⏭️ 커버리지 리포트 생성
5. ⏭️ CI/CD 파이프라인 설정

---

**문서 버전:** 1.0  
**작성일:** 2026-03-20  
**마지막 수정:** 2026-03-20
