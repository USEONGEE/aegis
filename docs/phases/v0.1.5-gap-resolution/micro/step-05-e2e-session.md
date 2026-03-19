# Step 05: E2E 세션 수립 (Gap 11)

## 메타데이터
- **난이도**: 🔴 어려움
- **롤백 가능**: ✅
- **선행 조건**: Step 03

---

## 1. 구현 내용 (design.md 기반)
- pairing 완료 시 ECDH shared secret 계산
- daemon `control-handler.ts`: pairing 성공 후 `relayClient.setSessionKey(sharedSecret)` 호출
- app `PairingService.ts`: pairing 성공 후 `RelayClient.setSessionKey(sharedSecret)` 호출
- 이후 모든 메시지 자동 암호화 (Relay blind transport 실현)
- ECDH 키 교환은 pairing handshake에 포함

## 2. 완료 조건
- [ ] daemon: pairing 완료 후 `setSessionKey` 호출 코드 존재
- [ ] app: pairing 완료 후 `setSessionKey` 호출 코드 존재
- [ ] E2E 암호화 round-trip 테스트: 메시지 암호화 → 복호화 통과
- [ ] Relay가 평문 접근 불가 검증 (blind transport)
- [ ] `npm test` 전체 통과

## 3. 롤백 방법
- git revert
- 영향: daemon (control-handler) + app (PairingService)

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
└── control-handler.ts          # pairing 완료 시 setSessionKey 호출

packages/app/src/core/crypto/
└── PairingService.ts           # ECDH shared secret 계산 + setSessionKey 호출
```

### 신규 파일
```
packages/daemon/tests/
└── e2e-session.test.ts         # E2E 암호화 round-trip 테스트
```

### Side Effect 위험
- setSessionKey 이후 모든 메시지가 암호화됨 → 기존 평문 테스트 수정 필요

## FP/FN 검증

### 검증 통과: ✅
- relay는 투명 전달이므로 수정 불필요 (OK)
- RelayClient.setSessionKey()는 이미 구현되어 있음 (OK)

---

> 다음: [Step 06: approval ack](step-06-approval-ack.md)
