# Step 15: chmod 600 (Gap 21)

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)
- DB 파일 생성 후 `chmodSync(dbPath, 0o600)` 호출
- admin socket 생성 후 `chmodSync(socketPath, 0o600)` 호출
- `import { chmodSync } from 'node:fs'` 추가
- OS 수준 파일 격리로 보안 강화

## 2. 완료 조건
- [ ] `json-approval-store.ts`에 `chmodSync(dbPath, 0o600)` 존재
- [ ] `sqlite-approval-store.ts`에 `chmodSync(dbPath, 0o600)` 존재
- [ ] `admin-server.ts`에 `chmodSync(socketPath, 0o600)` 존재
- [ ] 파일 생성 후 permission 검증 테스트 통과 (stat → mode 확인)
- [ ] `npm test` 전체 통과

## 3. 롤백 방법
- git revert
- 영향: guarded-wdk (store 파일) + daemon (admin-server)

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── json-approval-store.ts      # DB 파일 생성 후 chmod 600
└── sqlite-approval-store.ts    # DB 파일 생성 후 chmod 600

packages/daemon/src/
└── admin-server.ts             # admin socket 생성 후 chmod 600
```

### Side Effect 위험
- Windows에서 chmodSync가 no-op → 크로스 플랫폼 이슈 없음 (Node.js 서버 전용)

## FP/FN 검증

### 검증 통과: ✅
- app은 RN이므로 OS 파일 permission 관련 없음 (OK)

---

> 다음: [Step 16: 나머지 tool 케이스 문서화](step-16-tool-docs.md)
