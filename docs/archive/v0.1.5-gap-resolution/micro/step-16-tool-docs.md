# Step 16: 나머지 tool 케이스 문서화 (Gap 8)

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)
- `docs/report/system-interaction-cases.md`에 6개 미문서화 tool 케이스 추가:
  - `transfer` — 토큰 전송
  - `getBalance` — 잔고 조회
  - `policyList` — 등록된 policy 목록
  - `policyPending` — 대기 중인 policy 요청
  - `listCrons` — cron job 목록
  - `removeCron` — cron job 삭제
- 코드 변경 없음

## 2. 완료 조건
- [ ] `system-interaction-cases.md`에 `transfer` 케이스 존재
- [ ] `system-interaction-cases.md`에 `getBalance` 케이스 존재
- [ ] `system-interaction-cases.md`에 `policyList` 케이스 존재
- [ ] `system-interaction-cases.md`에 `policyPending` 케이스 존재
- [ ] `system-interaction-cases.md`에 `listCrons` 케이스 존재
- [ ] `system-interaction-cases.md`에 `removeCron` 케이스 존재

## 3. 롤백 방법
- git revert
- 영향: 문서만

---

## Scope

### 수정 대상 파일
```
docs/report/
└── system-interaction-cases.md  # 6개 tool 케이스 추가
```

### Side Effect 위험
- 없음 (문서만 수정)

## FP/FN 검증

### 검증 통과: ✅
- 코드 변경 없으므로 테스트 영향 없음 (OK)

---

> 다음: [Step 17: ApprovalRejected 이벤트](step-17-approval-rejected-event.md)
