# Step 03: pairing 보안 (Gap 3+16)

## 메타데이터
- **난이도**: 🔴 어려움
- **롤백 가능**: ✅
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)
- daemon `control-handler.ts`: pairingToken 검증 + SAS 확인 후에만 trusted에 등록
- app `PairingService.ts`: pairing 전에 먼저 Relay에 register/login → JWT 획득 → WS 연결
- relay `auth.ts`: pairing 전용 임시 토큰 발급 API 추가 (optional)
- SAS(Short Authentication String) 표시 + 사용자 확인 흐름 구현
- trusted device 등록 시점을 SAS 확인 이후로 이동

## 2. 완료 조건
- [ ] daemon: pairingToken이 없거나 잘못된 경우 pairing 거부 테스트 통과
- [ ] daemon: SAS 확인 없이 trusted 등록 시도 시 거부 테스트 통과
- [ ] app: JWT 획득 후 WS 연결하는 흐름 존재
- [ ] pairing 흐름 통합 테스트 통과
- [ ] `npm test` 전체 통과

## 3. 롤백 방법
- git revert
- 영향: daemon (control-handler) + app (PairingService) + relay (auth)

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
└── control-handler.ts          # pairingToken 검증, SAS 확인 후 trusted 등록

packages/app/src/core/crypto/
└── PairingService.ts           # register/login → JWT → WS 연결 순서

packages/relay/src/routes/
└── auth.ts                     # pairing 임시 토큰 발급 (optional)
```

### 신규 파일
```
packages/daemon/tests/
└── pairing-security.test.ts    # pairingToken + SAS 검증 테스트
```

### Side Effect 위험
- 기존 pairing 흐름이 깨짐 (보안 강화이므로 의도적)

## FP/FN 검증

### 검증 통과: ✅
- relay는 투명 전달이므로 auth.ts 외 수정 불필요 (OK)
- guarded-wdk는 pairing에 관여하지 않으므로 제외 (OK)

---

> 다음: [Step 04: app executor type 분기](step-04-executor-type-branch.md)
