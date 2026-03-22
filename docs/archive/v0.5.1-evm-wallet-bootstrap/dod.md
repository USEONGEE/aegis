# v0.5.1 완료 조건 (Definition of Done)

## 기능 요건

1. daemon 부팅 시 seed가 있으면 EVM wallet manager가 WDK에 자동 등록된다
2. accountIndex=0 wallet이 store에 자동 저장된다 (이미 있으면 skip)
3. 정책 평가 미들웨어가 EVM chain에 대해 자동 등록된다
4. `facade.getAccount('1', 0)`이 에러 없이 계정 객체를 반환한다

## 하위 호환

5. seed가 없으면 기존과 동일하게 facade=null 반환
6. 이미 accountIndex=0 wallet이 store에 있으면 중복 생성하지 않음
7. 기존 테스트 모두 통과

## 테스트

8. `npx jest packages/guarded-wdk packages/daemon --passWithNoTests` — 기존 테스트 중 새 실패 0건
