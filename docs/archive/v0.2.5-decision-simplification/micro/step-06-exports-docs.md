# Step 06: Export 정리 + Guide 문서

## 메타데이터
- **소유 DoD**: N6
- **수정 파일**: `packages/guarded-wdk/src/index.ts`, `packages/guarded-wdk/docs/guide/README.md`
- **의존성**: Step 01

## 구현 내용
1. index.ts: `RejectionEntry`, `PolicyVersionEntry` export 추가, Decision export 유지 (값만 변경)
2. guide/README.md: Decision 설명 변경 (AUTO→ALLOW, REQUIRE_APPROVAL 제거), 정책 변경 흐름 업데이트

## 완료 조건
- [ ] N6

## FP/FN
- **FP**: 없음
- **FN**: 없음
