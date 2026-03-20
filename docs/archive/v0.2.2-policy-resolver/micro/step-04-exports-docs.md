# Step 04: Export 정리 + Guide 문서

## 메타데이터
- **소유 DoD**: F3(export), F4(export), N6
- **수정 파일**: `packages/guarded-wdk/src/index.ts`, `packages/guarded-wdk/docs/guide/README.md`
- **의존성**: Step 01

## 구현 내용
1. index.ts: `ChainPolicies`, `ChainPolicyConfig` export 제거
2. guide/README.md: config.policies 사용 예시 제거/수정

## 완료 조건
- [ ] F3(export): index.ts에서 `ChainPolicies` 검색 0건
- [ ] F4(export): index.ts에서 `ChainPolicyConfig` 검색 0건
- [ ] N6: guide 문서에서 config.policies 예시 제거 확인

## FP/FN 검증
- **FP**: 없음.
- **FN**: 없음.
