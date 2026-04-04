# SSO 연동 — Crawl Station

> 이 파일은 LifeNBio SSO 통합 인증 연동을 위한 Claude Code 지시사항이다.

## 프로젝트 정보
- 서비스명: Crawl Station
- 앱 식별자(slug): `crawl-station`
- SSO 서버: https://lifenbio-sso.fly.dev
- API 문서: https://lifenbio-sso.fly.dev/docs
- 유저 포탈: https://lifenbio-sso.fly.dev/portal
- 관리자 포탈: https://lifenbio-sso.fly.dev/admin-portal

## 핵심 원칙
- 인증은 직접 구현하지 않는다. 모든 인증은 SSO 서버를 통해서만 처리.
- 토큰 기반 인증. JWT Access Token(15분) + Refresh Token(30일).
- 회원가입은 승인제. 가입 후 관리자 승인이 필요하다.
