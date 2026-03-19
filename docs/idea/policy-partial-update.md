# Policy Partial Update

## 현상
현재 `updatePolicies`는 PUT(전체 교체)만 지원. 주소 하나 추가하려 해도 전체 정책을 다시 owner가 서명해야 함.

## 문제 시점
정책이 수십 개 Rule로 커지면 UX 열화. "주소 하나 추가"인데 전체 서명 요구.

## 가능한 방향
- `patchRule(chainId, target, selector, ruleIndex, patch)` — Rule 단위 수정
- `addRule(chainId, target, selector, rule)` — Rule 추가
- `removeRule(chainId, target, selector, ruleIndex)` — Rule 삭제
- diff 기반 서명: 변경된 부분만 서명하고 기존 서명과 합성

## 지금 안 하는 이유
- 정책은 자주 안 바뀜
- 전체 서명이 보안적으로 더 안전 (partial patch면 모르는 Rule이 끼어있을 수 있음)
- granular API 설계가 복잡 (ArgCondition 레벨까지 들어가야 함)

## 기록일
2026-03-19
