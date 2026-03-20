# WDK 외부 타입 직접 참조 - v0.2.4

## 문제 정의

### 현상
- `guarded-wdk-factory.ts`가 `@tetherto/wdk` 및 `@tetherto/wdk-wallet`의 타입을 직접 import하지 않고, 자체 인터페이스(`WalletConfig`, `WalletManager`, `ProtocolEntry`)를 재정의하여 사용
- 자체 타입과 WDK 실제 타입 간 TS2345 불일치가 잠재되어 있으나, `as any` 캐스트로 은폐된 상태
- `as any`로 인해 WDK 메서드 호출의 타입 안전성이 완전히 상실됨

### 원인
- 최초 커밋(`a941de4`, 2026-03-18)부터 WDK의 실제 타입을 import하지 않고 자체 인터페이스를 정의
- `WalletManager` 인터페이스: WDK의 추상 클래스가 요구하는 static 메서드(`getRandomSeedPhrase`, `isValidSeedPhrase`) 누락
- `ProtocolEntry.Protocol`: WDK가 기대하는 `typeof SwapProtocol | typeof BridgeProtocol | ...` 대신 `new (...args: unknown[]) => unknown` 사용
- `createGuardedMiddleware` 반환 타입과 WDK의 `MiddlewareFunction` 시그니처 간 불일치 가능성

### 영향
- `as any` 캐스트로 WDK 메서드 호출의 모든 타입 안전성 상실
- WDK 라이브러리 업데이트 시 타입 불일치를 컴파일 타임에 감지 불가
- 자체 정의 타입과 WDK 실제 타입의 드리프트 위험

### 목표
- WDK 로컬 타입 재정의를 제거하고 unsafe cast 없이 타입체크 가능하게 한다
- `as any` 캐스트 제거
- `npx tsc --noEmit` 통과 (cast 없이)

### 비목표 (Out of Scope)
- WDK 라이브러리 자체 수정
- GuardedAccount 인터페이스의 기능 변경
- manifest, daemon, app 패키지 변경
- guarded-wdk의 정책 평가 로직 변경

## 제약사항
- 변경 범위: `guarded-wdk-factory.ts` + no-cast를 위해 필요시 `guarded-middleware.ts` 타입 선언까지 (최소 범위)
- WDK가 export하는 타입만 사용 (internal 타입 접근 금지)
- 기존 테스트 전수 통과 필수
