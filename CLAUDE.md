@AGENTS.md

## 역할
크롤 관제 센터. 각 PC의 naver-crawler 워커에 작업을 배분하고 결과를 집계한다.
크롤 작업 스케줄링, 워커 상태 모니터링, 결과 조회 UI를 제공.

## 스택
- Next.js (App Router, TypeScript)
- Supabase (작업 큐 + 결과 저장)
- Vercel 배포: https://crawl-station.vercel.app
- Mac/Windows 데스크탑 앱 포함 (mac-app/, win-installer/)

## 주요 경로
```
src/app/              페이지 + API 라우트
src/app/api/docs/     CHANGELOG_MD, INTEGRATION_MD (커밋 전 필수 업데이트)
mac-app/              Electron Mac 앱
win-installer/        Windows 설치 패키지
supabase/             마이그레이션 파일
docs/                 연동 가이드
```

## 환경변수 (키 이름만)
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
SUPABASE_SERVICE_ROLE_KEY

## 오케스트레이터 연동
- 크롤 작업 배분: `crawl_requests` 테이블 (기존 유지)
- 이벤트 기록: `orch_events` INSERT (orchEvent 헬퍼: `src/lib/orch.ts`)
- 헬스 상태: `orch_services.health_status` 업데이트
- 이슈 신고: `/feedback` 페이지 → `orch_issues` INSERT
- 개발 이력: git hook → `orch_dev_log` 자동 기록

## 공용 설치 현황
- [x] CLAUDE.md
- [x] git post-commit hook (`.git/hooks/post-commit`)
- [x] `.orch-app-name` = `crawl-station`
- [x] `src/lib/orch.ts` (orchEvent/orchHealth/orchIssue 헬퍼)
- [ ] 피드백 시스템 (`/feedback` 페이지)
- [ ] orchEvent 실제 호출 (API route에 추가 필요)
- [ ] SSO 연동 (현재 자체 인증)

## 필수 규칙 — 커밋 전 체크리스트
모든 기능 변경/버그 수정 커밋 전에 반드시:
1. `src/app/api/docs/route.ts` → `CHANGELOG_MD` 상수 업데이트
2. `src/app/api/docs/route.ts` → `INTEGRATION_MD` 상수 (API 변경 시)
3. Mac + Windows 동기화 (GUI/UX 변경 시 양쪽 모두)
