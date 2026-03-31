import { NextRequest, NextResponse } from "next/server";

const INTEGRATION_MD = `# CrawlStation 연동 가이드

> 이 파일을 AI 채팅(ChatGPT, Claude 등)에 첨부하거나 프로젝트에 포함시키면,
> AI가 CrawlStation 연동 코드를 자동 생성할 수 있습니다.

## CrawlStation이란?

CrawlStation은 **분산 크롤링 관제 시스템**입니다.
여러 대의 PC(워커)에 크롤링 작업을 자동 분배하고, 결과를 중앙에서 수집합니다.

- **Base URL**: \`https://crawl-station.vercel.app\`
- **인증**: 불필요 (API 키 없이 연동 가능)
- **워커**: Mac/Windows PC에 설치하여 백그라운드 실행

## 연동 흐름

\`\`\`
1. POST /api/crawl → 크롤링 요청 등록 (키워드 + 타입)
2. 워커가 자동으로 작업 수행 (5초마다 큐 확인)
3. GET /api/crawl?request_id=xxx → 결과 조회
\`\`\`

## 크롤링 타입

| type | 설명 |
|------|------|
| \`blog_crawl\` | 네이버 블로그 검색 결과 본문/제목/URL 추출 |
| \`blog_serp\` | 네이버 블로그 SERP 순위 + 메타 정보 |
| \`kin_analysis\` | 네이버 지식iN 크롤링 + 질문/답변 분석 |
| \`rank_check\` | 특정 키워드에서 특정 블로그 순위 확인 |

## API 레퍼런스

### POST /api/crawl — 크롤링 요청

\`\`\`json
// Request
{
  "keywords": ["당뇨에 좋은 음식", "탈모 샴푸"],
  "type": "blog_crawl",
  "options": {},
  "priority": 0
}

// Response
{
  "message": "2개 크롤링 요청 등록 완료",
  "requests": [
    { "id": "uuid-1", "keyword": "당뇨에 좋은 음식", "status": "pending" },
    { "id": "uuid-2", "keyword": "탈모 샴푸", "status": "pending" }
  ]
}
\`\`\`

### GET /api/crawl?request_id=uuid — 결과 조회

\`\`\`json
// Response (완료 시)
{
  "request": { "id": "uuid", "keyword": "당뇨에 좋은 음식", "status": "completed" },
  "results": [
    { "rank": 1, "data": { "title": "...", "url": "...", "body": "..." } },
    { "rank": 2, "data": { "title": "...", "url": "...", "body": "..." } }
  ]
}
\`\`\`

상태 흐름: \`pending\` → \`assigned\` → \`running\` → \`completed\` | \`failed\`

### GET /api/crawl?keyword=당뇨&type=blog_crawl — 키워드로 검색

### GET /api/workers — 워커 상태

\`\`\`json
{ "total": 3, "active": 2, "workers": [...] }
\`\`\`

### POST /api/dispatch — 작업 분배

\`\`\`json
// Request
{ "keywords": ["키워드1", ...], "type": "blog_serp", "strategy": "round_robin" }

// Response
{ "distribution": { "worker-001": 5, "worker-002": 5 } }
\`\`\`

## Next.js 연동 예제

\`\`\`typescript
const STATION = "https://crawl-station.vercel.app";

// 크롤링 요청
const res = await fetch(\`\${STATION}/api/crawl\`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ keywords: ["당뇨에 좋은 음식"], type: "blog_crawl" })
});
const { requests } = await res.json();

// 결과 대기 (폴링)
async function waitForResult(requestId: string, timeout = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const r = await fetch(\`\${STATION}/api/crawl?request_id=\${requestId}\`).then(r => r.json());
    if (r.request.status === "completed" || r.request.status === "failed") return r;
    await new Promise(r => setTimeout(r, 3000));
  }
  return null;
}

const result = await waitForResult(requests[0].id);
\`\`\`

## Python 연동 예제

\`\`\`python
import requests, time

STATION = "https://crawl-station.vercel.app"

# 요청
res = requests.post(f"{STATION}/api/crawl", json={
    "keywords": ["당뇨에 좋은 음식"], "type": "blog_crawl"
})
req_id = res.json()["requests"][0]["id"]

# 대기
while True:
    r = requests.get(f"{STATION}/api/crawl?request_id={req_id}").json()
    if r["request"]["status"] in ("completed", "failed"): break
    time.sleep(3)

# 결과
for item in r["results"]:
    print(item["data"]["title"])
\`\`\`
`;

const CHANGELOG_MD = `# CrawlStation 업데이트 기록

## 2026-03-31

### 시스템 구축
- CrawlStation 웹 앱 (Next.js + Vercel) 초기 구축
- Supabase 백엔드 (workers, crawl_requests, crawl_results, worker_releases 테이블)
- 대시보드, 워커 관리, 작업 큐, 릴리즈 관리 페이지

### 워커 설치 시스템
- Python 인스톨러 (Windows/Linux)
- Mac .command 스크립트 (원클릭 설치)
- Python 자동 설치 (Homebrew + python.org 공식 패키지 fallback)
- LaunchAgent 자동 등록 (Mac 부팅 시 자동 시작)

### Mac .pkg 인스톨러 전환
- GitHub Actions 워크플로우로 macOS runner에서 pkgbuild 실행
- 다운로드 API: GitHub Release 최신 .pkg로 리다이렉트
- 설치 화면 한국어 커스터마이징 (productbuild + Distribution XML)

### SwiftUI 네이티브 Mac 앱
- /Applications/CrawlStation Worker.app 설치
- 앱 실행 시 네이티브 상태 창 (워커 상태, Station 연결, 버전, 로그)
- 시작/중지/재시작/삭제(언인스톨) 제어
- Universal Binary (Apple Silicon + Intel)
- 5초 간격 자동 새로고침
- 파란색 CW 앱 아이콘 자동 생성

### 워커 오프라인 감지
- last_seen 기준 15초 이내 응답 없으면 오프라인 표시
- 기존 DB status("idle") 대신 is_active 기반 실시간 판별

### 워커 관리 페이지 개선
- 자동 갱신 주기 선택 (3초/5초/10초/30초/끄기)
- 마지막 업데이트 시간 표시
- 수동 새로고침 버튼 (스피너 애니메이션)
- "마지막 응답" 컬럼 (방금 전/N초 전/N분 전 등 상대 시간)
- 개별 워커 업데이트/재시작/정지 버튼

### 언인스톨 연동
- DELETE /api/workers?id=xxx API 추가
- Mac 앱 삭제 시 Station API 호출하여 워커 레코드 자동 삭제
- "오프라인 정리" 버튼으로 오프라인 워커 일괄 삭제

### 기타 수정
- Python 설치 후 IDLE, Python Launcher 자동 삭제
- .env 크레덴셜 주입 수정 (들여쓰기 문제 해결)
- GitHub Secrets 등록 (SUPABASE_URL, SUPABASE_KEY, STATION_URL)
- 레포 public 전환 (GitHub Release 접근용)
- worker_releases is_latest 플래그 정상화

## 2026-04-01

### 페이지 분리 및 연동 가이드 확장
- 설치 페이지에서 연동 가이드를 별도 페이지(/guide)로 분리
- CrawlStation 동작 원리, 크롤링 타입, API 레퍼런스 상세 설명
- AI 채팅/외부 개발용 MD 파일 다운로드 기능
- 업데이트 기록 페이지(/changelog) 추가
`;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  if (type === "integration") {
    return new NextResponse(INTEGRATION_MD, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="CrawlStation-Integration-Guide.md"',
      },
    });
  }

  if (type === "changelog") {
    return new NextResponse(CHANGELOG_MD, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="CrawlStation-Changelog.md"',
      },
    });
  }

  return NextResponse.json({ error: "type 파라미터 필요 (integration | changelog)" }, { status: 400 });
}
