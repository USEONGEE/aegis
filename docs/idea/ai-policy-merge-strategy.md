# AI Policy Merge 전략 + ABI 검증 레이어 분리

## 1. AI의 Policy Merge 의사결정

### 시나리오
A/B 페어에서 mint: erc20 approve 2번 + mint 1번 = 3 tx.
B의 approval이 만료됨 + mint param 변경 필요.

### AI가 판단해야 하는 것
- 기존 정책을 읽고 "어디가 실패했는지" 파악
- partial update가 가능한지 판단 (실패한 부분만 수정)
- 불가능하면 전체를 새로 만들어서 PUT

### 책임 소재
- guarded-wdk: PUT API만 제공 (merge 로직 없음)
- daemon(AI): 기존 정책 로드 → 실패 원인 분석 → merge/rebuild 결정
- manifest/CLI: 어떤 tx가 필요한지 스펙 제공

### 필요한 정보
REQUIRE_APPROVAL 에러 반환 시 기존 approval 상태도 함께 제공해야 AI가 판단 가능:
- 어떤 tx들이 필요한지
- 각 tx의 현재 approval 상태 (유효/만료/없음)
- 실패한 구체적 이유

## 2. ABI 정합성 검증

### 문제
AI가 ABI 필드를 잘못 보낼 수 있음 (key 이름 오타, 타입 불일치).
예: 필드가 a,b,c,d인데 a,b,e로 보냄.

### WDK의 영역이 아닌 이유
WDK = 서명 엔진. "이 tx가 정책에 맞는가"만 검증.
tx 내용의 ABI 정합성은 검증하지 않음.

### 검증 책임
```
ABI 정합성 → CLI 도구 / manifest 레이어
  - manifest에 정의된 ABI와 대조
  - 필드 누락, 타입 불일치, 이름 오류 거부

정책 검증 → guarded-wdk
  - target, selector, args 조건 매칭만

AI 의사결정 → daemon
  - 실패 시 재시도 전략
```

## 기록일
2026-03-19
