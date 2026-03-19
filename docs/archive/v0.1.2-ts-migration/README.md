# JS → TypeScript 마이그레이션 - v0.1.2

## 문제 정의

### 현상
5개 패키지 (canonical, guarded-wdk, manifest, daemon, relay)가 전부 JS로 작성됨. app만 TS.

### 원인
guarded-wdk v0.0.1이 JS였고 나머지 패키지도 그 패턴을 따라감.

### 영향
- 타입 안정성 없음
- IDE 자동완성/리팩토링 지원 부족
- 패키지 간 인터페이스 계약이 JSDoc에 의존 (런타임 검증 없음)

### 목표
1. 5개 패키지의 소스 코드를 JS → TS로 전환
2. 테스트 코드도 TS로 전환
3. 242 테스트 전부 통과 유지
4. guarded-wdk는 우리 코드(src/guarded/)만 전환, upstream WDK 코드는 JS 유지

### 비목표
- upstream WDK 코드 (wdk-manager.js 등) 전환
- 새로운 기능 추가
- 아키텍처 변경
