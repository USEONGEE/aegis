# Step 08: stored policy restore (Gap 17)

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅
- **선행 조건**: Step 02

---

## 1. 구현 내용 (design.md 기반)
- 새 store API 추가: `listPolicyChains(seedId: string): Promise<string[]>` (policy가 저장된 chain 목록)
- `wdk-host.ts`: boot 시 store에서 등록된 chain 목록 조회
- 각 chain에 대해 `store.loadPolicy()` → `createGuardedWDK` config에 반영
- daemon 재시작 시 기존 policy가 자동 복원됨

## 2. 완료 조건
- [ ] `listPolicyChains` 메서드가 ApprovalStore 인터페이스에 존재
- [ ] JsonApprovalStore, SqliteApprovalStore 모두 구현
- [ ] wdk-host boot 시 `listPolicyChains` → `loadPolicy` 호출 코드 존재
- [ ] policy restore 테스트: store에 policy 저장 → boot → policy 로드 확인
- [ ] `npm test` 전체 통과

## 3. 롤백 방법
- git revert
- 영향: guarded-wdk (store API) + daemon (wdk-host)

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── approval-store.ts           # listPolicyChains 인터페이스 추가
├── json-approval-store.ts      # listPolicyChains 구현
└── sqlite-approval-store.ts    # listPolicyChains 구현

packages/daemon/src/
└── wdk-host.ts                 # boot 시 policy restore 로직 추가
```

### Side Effect 위험
- boot 시간이 약간 증가 (store 조회 추가)

## FP/FN 검증

### 검증 통과: ✅
- manifest는 policy 생성 시점에만 관여하므로 제외 (OK)
- app은 policy restore에 관여하지 않으므로 제외 (OK)

---

> 다음: [Step 09: device list + balance + position](step-09-data-via-chat.md)
