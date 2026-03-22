# Demo Scenario — Aegis Policy Flow

> 정책 없는 상태에서 시작 → 승인 요청 → 정책 생성 → 자율 실행까지의 흐름

---

## 사전 조건

- Daemon 실행 중 (테스트넷 연결)
- Mobile App에서 로그인 완료
- Policy 없는 상태 (초기 상태)
- 테스트넷에 ERC-20 토큰 잔고 있음

---

## 시나리오

### Step 1 — 인사

**User**:
```
Hey! How's it going?
```

AI가 친근하게 응답.

---

### Step 2 — 주소 확인

**User**:
```
What's my wallet address for account 0?
```

AI가 `getAccounts` 도구를 호출하여 account 0의 주소를 반환.

---

### Step 3 — 송금 의사 표현

**User**:
```
I want to send some tokens to a friend. Can you do an ERC-20 transfer for me?
```

AI가 응답 — 어디로, 얼마를 보낼지 물어봄.

---

### Step 4 — 주소와 금액 제공 → 정책에 의해 거부 → 승인 요청

**User**:
```
Send 50 USDC to 0x1234...abcd
```

AI가 `transfer` 도구를 호출 → Policy Engine이 평가 → **매칭되는 정책 없음 → REJECT** → ApprovalRequest가 모바일로 전송됨.

AI 응답 (예상):
```
I tried to send 50 USDC but there's no policy allowing this transfer.
An approval request has been sent to your mobile app.
Please approve it to proceed.
```

---

### Step 5 — 모바일에서 승인 → 실행

Owner가 모바일 앱에서:
1. Approval 탭에서 요청 확인
2. 내용 검토 (받는 주소, 금액, 컨트랙트)
3. Ed25519 서명으로 Approve

→ Daemon이 6단계 검증 통과 → WDK 서명 → 온체인 전송 완료

AI 응답 (예상):
```
Done! 50 USDC has been sent to 0x1234...abcd.
Transaction hash: 0xabcdef...
```

---

### Step 6 — 같은 요청 다시 → 자율 실행 (정책 범위 내)

**User**:
```
Send another 50 USDC to the same address.
```

AI가 `transfer` 도구를 호출 → Policy Engine이 평가 → **정책 범위 내 → ALLOW** → WDK 즉시 서명 → 온체인 전송.

**이번에는 모바일 승인 없이 즉시 실행된다.**

AI 응답 (예상):
```
Sent! 50 USDC transferred to 0x1234...abcd.
Transaction hash: 0x567890...
No approval needed — within your policy limits.
```

---

## 데모 포인트

| Step | 보여주는 것 |
|------|-----------|
| 1-2 | AI가 자연어로 대화하며 도구를 사용 |
| 3-4 | **정책 없으면 AI가 아무것도 자율로 못 함** — REJECT |
| 5 | **인간이 모바일에서 직접 서명**하여 승인 |
| 6 | **정책 범위 내면 승인 없이 즉시 실행** — ALLOW |

핵심 메시지: **"처음엔 아무것도 못 하다가, 인간이 허락한 범위 내에서만 자율적으로 움직인다."**
