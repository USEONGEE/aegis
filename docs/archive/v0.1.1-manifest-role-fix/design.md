# 설계 - v0.1.1

## 변경 규모
**규모**: 작은 변경
**근거**: 문서 수정만. 코드 변경 없음.

---

## 문제 요약
v0.1.0 PRD/design.md가 manifest의 소비자를 RN App으로 잘못 기술. 실제 소비자는 DeFi CLI.

> 상세: [README.md](README.md) 참조

## 접근법
PRD.md와 design.md에서 manifest 관련 서술을 DeFi CLI 중심으로 정정. 의존 방향 그래프 수정.

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: 문서만 수정 | 코드 영향 0, 빠름 | - | ✅ |
| B: manifest 패키지를 app에서 완전 삭제 | 깔끔 | 이미 의존 안 함, 불필요 | ❌ |

## 기술 결정

| 결정 | 선택 | 근거 |
|------|------|------|
| 수정 대상 | PRD.md, v0.1.0 design.md | 잘못된 서술이 있는 문서만 |
| manifest 소비자 | DeFi CLI (`--policy` 플래그) | CLI가 policy JSON 제공 |
| RN App 역할 | policy JSON 표시 + 승인/거부만 | manifest 규격 모름 |

## 수정할 의존 방향

```
기존 (잘못됨):
  app ──► manifest

수정:
  DeFi CLI ──► manifest (--policy로 policy JSON 생성)
  app (manifest 의존 없음, policy JSON만 표시)
```

## 테스트 전략
코드 변경 없으므로 기존 242 테스트가 그대로 통과해야 함.

## 리스크/오픈 이슈
N/A: 문서 수정만이므로 리스크 없음.
