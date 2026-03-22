# Demo Scenario — Aegis Policy Flow

> 정책 승인 → 범위 내 자율 실행 → 범위 밖 거부까지의 흐름

---

## 사전 조건

- Daemon 실행 중 (테스트넷 연결)
- Mobile App에서 로그인 완료
- USDT 잔고 있음
- 0x11f1... 주소에 대한 USDT transfer 정책이 승인 전 상태

---

## 시나리오

### Step 1 — 빌린 돈 갚기 (정책 승인 필요)

**User**:
```
Hey, send 0.02 USDT to 0x11f13aDDA33AC58E45cbfC35bE2E65BdA004dF92. I borrowed from my friend.
```

→ AI가 transfer 시도 → Policy Engine: 매칭 정책 없음 → **REJECT**
→ ApprovalRequest가 모바일로 전송
→ Owner가 모바일에서 확인 + Ed25519 서명 → **Approve**
→ 정책 생성 + 트랜잭션 실행 ✅

---

### Step 2 — 이자 추가 송금 (자율 실행)

**User**:
```
Actually send 0.01 USDT more to the same address as interest.
```

→ AI가 transfer 시도 → Policy Engine: 정책 범위 내 → **ALLOW**
→ WDK 즉시 서명 → 온체인 전송 ✅
→ **모바일 승인 없이 즉시 실행됨**

---

### Step 3 — 왜 승인 없이 됐는지 물어보기

**User**:
```
I didn't approve that one. How did it go through without my approval? Can you explain me that process?
```

→ AI가 설명: Step 1에서 승인한 정책이 이 주소 + 금액 범위를 이미 허용하고 있었기 때문에 자동 실행되었다고 답변.

**핵심 포인트**: 사용자가 정책 메커니즘을 자연스럽게 이해하게 되는 순간.

---

### Step 4 — 다른 주소로 송금 (거부)

**User**:
```
Now send 0.02 USDT to 0x3E189BB1492A4F39C2f7c4d5e9533577f06c6C0a
```

→ AI가 transfer 시도 → Policy Engine: 이 주소는 정책에 없음 → **REJECT**
→ ApprovalRequest가 모바일로 전송
→ **정책 범위 밖이면 여전히 승인이 필요함을 증명**

---

## 데모 포인트

| Step | 보여주는 것 |
|------|-----------|
| 1 | 정책 없으면 AI가 자율로 못 함 → 인간 승인 필요 |
| 2 | 정책 범위 내면 승인 없이 즉시 실행 |
| 3 | 사용자가 "왜?"를 물으면서 정책 메커니즘을 자연스럽게 이해 |
| 4 | 정책 밖 주소면 다시 거부 → 정책이 주소 단위로 작동함을 증명 |

핵심 메시지: **"같은 AI, 같은 기능인데 — 정책이 있으면 자율, 없으면 승인. 서명 레이어에서 강제된다."**
