---
globs:
  - "**/*.{ts,tsx,js,jsx,mts,cts}"
  - "**/*.{py,rb,java,kt,go,rs,cs}"
  - "**/*.{c,cpp,h,hpp}"
---

# SOLID Principles

코드 작성 시 SOLID 원칙을 준수합니다.

## S - Single Responsibility Principle (단일 책임 원칙)

하나의 클래스/함수는 하나의 책임만 가집니다.

**적용:**
- 함수는 한 가지 일만 수행
- 클래스는 변경되어야 할 이유가 하나만 존재
- 파일당 하나의 주요 export

**위반 신호:**
- 함수명에 "and", "or" 포함
- 함수가 여러 추상화 수준 혼합
- 클래스가 관련 없는 메서드 보유

## O - Open/Closed Principle (개방/폐쇄 원칙)

확장에는 열려있고, 수정에는 닫혀있어야 합니다.

**적용:**
- 새 기능은 기존 코드 수정 없이 추가
- 인터페이스/추상 클래스 활용
- 전략 패턴, 데코레이터 패턴 고려

## L - Liskov Substitution Principle (리스코프 치환 원칙)

자식 클래스는 부모 클래스를 대체할 수 있어야 합니다.

**적용:**
- 상속보다 구성(composition) 선호
- 자식이 부모의 계약을 깨지 않음
- 예외 발생 조건이 더 엄격해지지 않음

## I - Interface Segregation Principle (인터페이스 분리 원칙)

클라이언트가 사용하지 않는 메서드에 의존하지 않습니다.

**적용:**
- 작고 집중된 인터페이스
- 범용 인터페이스보다 특화된 인터페이스
- 불필요한 의존성 제거

## D - Dependency Inversion Principle (의존성 역전 원칙)

고수준 모듈이 저수준 모듈에 의존하지 않습니다.

**적용:**
- 구체 클래스가 아닌 추상화에 의존
- 의존성 주입 사용
- 인터페이스를 통한 결합
