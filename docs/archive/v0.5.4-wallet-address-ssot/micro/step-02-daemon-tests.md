# Step 02: daemon 참조 수정 + 테스트 업데이트

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 01

---

## 1. 구현 내용
- `daemon/admin-server.ts`의 wallet_list 응답에서 `address` 필드 제거
- guarded-wdk 테스트 파일들에서 `createWallet()` 호출의 세 번째 인자(address) 제거
- 테스트에서 `wallet.address` assertion 제거
- mock createWallet 반환값에서 address 필드 제거

## 2. 완료 조건
- [ ] `admin-server.ts` wallet 매핑에 address 없음
- [ ] `sqlite-wdk-store.test.ts`의 모든 createWallet 호출이 2개 인자
- [ ] `json-wdk-store.test.ts`의 모든 createWallet 호출이 2개 인자
- [ ] `approval-broker.test.ts` mock에서 address 없음
- [ ] `integration.test.ts` mock에서 address 없음
- [ ] `factory.test.ts` mock에서 address 없음
- [ ] `npm test` 전체 통과
- [ ] `npx tsc --noEmit` 통과 (daemon)

## 3. 롤백 방법
- git revert

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
└── admin-server.ts            # wallet_list 응답

packages/guarded-wdk/tests/
├── sqlite-wdk-store.test.ts   # ~15개 createWallet 호출
├── json-wdk-store.test.ts     # ~10개 createWallet 호출
├── approval-broker.test.ts    # 1개 mock
├── integration.test.ts        # 1개 mock
└── factory.test.ts            # 1개 mock
```
