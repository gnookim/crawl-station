@AGENTS.md

## 필수 규칙 — 커밋 전 체크리스트

**모든 기능 변경/버그 수정 커밋 전에 반드시 아래를 업데이트할 것:**

1. `src/app/api/docs/route.ts` → `CHANGELOG_MD` 상수에 변경 내용 추가
2. `src/app/api/docs/route.ts` → `INTEGRATION_MD` 상수 (API 변경 시)

이 규칙을 지키지 않으면 커밋하지 말 것. 예외 없음.
