# Step 12: manifest schema 정합 (Gap 9)

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)
- `PolicyPermission` 필드명을 WDK `Permission`과 일치시킴: `target`, `args`, `valueLimit`
- `manifest-to-policy.ts` 변환 로직에서 필드 매핑 정합
- v0.1.4에서 permissions 딕셔너리로 바뀌면 그에 맞게 조정
- manifest에서 정의한 permission이 guarded-wdk evaluatePolicy에서 정확히 매칭되도록 보장

## 2. 완료 조건
- [ ] `PolicyPermission`의 필드명이 WDK `Permission`/`Rule`과 일치
- [ ] `manifestToPolicy()` 반환값이 guarded-wdk에서 직접 사용 가능
- [ ] manifest-to-policy.test.ts 통과
- [ ] 변환 round-trip 테스트: manifest → policy → evaluatePolicy 통과
- [ ] `npm test` 전체 통과

## 3. 롤백 방법
- git revert
- 영향: manifest 패키지만

---

## Scope

### 수정 대상 파일
```
packages/manifest/src/
├── types.ts                    # PolicyPermission 필드명 변경
└── manifest-to-policy.ts       # 변환 로직 필드 매핑 수정

packages/manifest/tests/
└── manifest-to-policy.test.ts  # 변환 결과 검증 수정
```

### Side Effect 위험
- 기존 manifest 파일의 필드명이 바뀌면 파싱 에러 → manifest 파일도 동시 수정 필요

## FP/FN 검증

### 검증 통과: ✅
- guarded-wdk는 Permission/Rule을 소비만 하므로 manifest 쪽에서 맞추면 됨 (OK)
- daemon은 manifest를 직접 참조하지 않으므로 제외 (OK)

---

> 다음: [Step 13: journal 문서 정합](step-13-journal-docs.md)
