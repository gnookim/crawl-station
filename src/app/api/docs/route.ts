import { NextRequest, NextResponse } from "next/server";

const INTEGRATION_MD = `# CrawlStation 연동 가이드

> 이 파일을 AI 채팅(ChatGPT, Claude 등)에 첨부하거나 프로젝트에 포함시키면,
> AI가 CrawlStation 연동 코드를 자동 생성할 수 있습니다.

## CrawlStation이란?

CrawlStation은 **분산 크롤링 관제 시스템**입니다.
여러 대의 PC(워커)에 크롤링 작업을 자동 분배하고, 결과를 중앙에서 수집합니다.

- **Base URL**: \`https://crawl-station.vercel.app\`
- **인증**: API 키 필수 (CrawlStation → 연결된 앱 → 앱 등록에서 발급)
- **워커**: Mac/Windows PC에 설치하여 백그라운드 실행

## 인증 (API 키)

모든 쓰기 API(POST)에는 API 키가 필요합니다.

1. CrawlStation 웹 → "연결된 앱" → "앱 등록" 클릭
2. 발급된 API 키를 복사
3. 요청 시 \`X-API-Key\` 헤더에 포함

\`\`\`
X-API-Key: cs_abc123...
\`\`\`

인증 필요: \`POST /api/crawl\`, \`POST /api/dispatch\`
인증 불필요: \`GET /api/crawl\` (결과 조회), \`GET /api/workers\`, \`POST /api/diagnose\` (인스톨러 AI 진단)

## 연동 흐름

\`\`\`
1. POST /api/crawl → 크롤링 요청 등록 (키워드 + 타입 + API 키)
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

const API_KEY = "cs_발급받은키";

// 크롤링 요청
const res = await fetch(\`\${STATION}/api/crawl\`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-API-Key": API_KEY },
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

API_KEY = "cs_발급받은키"

# 요청
res = requests.post(f"{STATION}/api/crawl",
    headers={"X-API-Key": API_KEY},
    json={"keywords": ["당뇨에 좋은 음식"], "type": "blog_crawl"}
)
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

### 연결된 앱 관리 + API 키 인증
- /apps 페이지: 앱 등록, API 키 발급/재발급/폐기
- POST /api/crawl, POST /api/dispatch에 X-API-Key 인증 필수
- GET 요청(결과 조회, 워커 상태)은 인증 불필요
- 앱별 요청 수, 마지막 사용 시간 추적
- 연동 가이드에 API 키 인증 방법 추가

### 워커 v0.3.0 — 자연스러운 크롤링 + 프록시
- 세션 워밍업 (네이버 메인/뉴스/쇼핑 등 사전 방문)
- 타이핑 속도 변화 (단어 경계에서 느려짐) + 오타 개선
- 랜덤 결과 클릭 후 돌아오기 (자연스러운 행동)
- 읽는 척 멈추기 (스크롤 중 1~3초 pause)
- canvas/WebGL fingerprint 노이즈
- hardwareConcurrency, deviceMemory 랜덤화
- 모바일 UA + 뷰포트 가끔 섞기
- 프록시 지원 (worker_config.proxy_url, 인증 프록시 포함)
- UA 목록 확장 (Chrome 125, Safari 17.5, Edge, 모바일)
- desk-web: CrawlStation API 키 인증 연동

### 워커 설정 페이지
- /config 페이지: 글로벌 + 워커별 설정 관리
- 프록시 URL 설정 (글로벌/워커별)
- 네트워크 타입 선택 (WiFi, 테더링 SKT/KT/LGU+, 프록시)
- 크롤링 속도 설정 (딜레이, 배치 크기, 휴식 시간)
- 사람 흉내 설정 (타이핑 속도, 오타 확률, 되돌아보기)

### Windows 인스톨러
- GitHub Actions 워크플로우로 PyInstaller .exe 빌드
- 설치 시 시작프로그램 자동 등록 (레지스트리)
- 바탕화면에 시작/중지/삭제 바로가기 생성
- 다운로드 API에 ?type=win 추가

### AI 자가 진단 인스톨러 (v0.4.0)
- Windows 인스톨러에 AI 자가 진단 시스템 탑재
- 설치 중 오류 발생 시 Station의 Claude AI가 자동 진단
- 환경 스냅샷 수집 (OS, Python, 디스크, 네트워크, PATH 등)
- AI가 수정 명령을 반환하면 자동 실행 후 재시도 (단계별 최대 3회)
- POST /api/diagnose 엔드포인트 추가
- 위험 명령 블록리스트 + 서버사이드 검증으로 안전성 확보
- 9단계 설치 과정을 각각 독립 함수로 분리, 실패 추적 강화
- Inno Setup 창 안에서 설치 로그 실시간 표시 (별도 CMD 창 제거)

### 설치 모니터링 (v0.4.1)
- /installs 페이지: 설치 진행 상황 실시간 모니터링
- POST /api/install-status: 인스톨러가 각 단계마다 진행 상태 보고
- 활성 설치 세션 표시 (호스트명, OS, 진행률, AI 진단 횟수)
- 단계별 진행 바 + 실패 단계 + 최근 로그 + AI 진단 내용 표시
- 자동 갱신 (2~10초 간격 선택 가능)

## 2026-04-02

### Windows 워커 정식 가동 (v0.5.9 ~ v0.5.15)

#### handlers 모듈 누락 해결
- GUI 시작/재시작 시 누락 파일(handlers 등) 자동 감지 + 다운로드
- Station API → GitHub raw fallback 이중 다운로드 경로
- embedded Python의 python312._pth에 상위 디렉토리(..) 추가
  - embedded Python은 PYTHONPATH를 무시하므로 _pth로 import 경로 설정

#### 인코딩 에러 해결
- Windows 한국어 환경(cp949)에서 이모지 출력 시 UnicodeEncodeError 수정
- PYTHONIOENCODING=utf-8 환경변수 설정

#### 워커 프로세스 안정화
- GUI에서 시작 시 PIPE 테스트 → 로그파일 출력으로 재시작 방식 적용
  - 기존: PIPE close → BrokenPipeError로 워커 크래시
- 설치 완료 후 워커 실행 시 CMD 창 안 뜨게 수정 (CREATE_NO_WINDOW)

#### GUI 앱 자동 시작
- GUI 열면 워커가 중지 상태일 때 자동 시작
- Windows 부팅 시 레지스트리: worker.py 직접 실행 → GUI 앱 실행으로 변경
- 버튼 클릭감 개선 (raised + 호버 효과)

#### 바탕화면 정리
- .bat 바로가기 3개(시작/중지/삭제) 제거, CrawlStation Worker 아이콘 1개만 유지
- 재설치 시 기존 .bat 파일 자동 정리
- 언인스톨 시 바탕화면 아이콘 자동 삭제

#### 다운로드 API 캐시 제거
- GitHub Release 캐시 revalidate:300 → no-store로 변경
- 새 버전 배포 후 즉시 최신 버전 다운로드 반영

#### 워커 관리 페이지 개선
- 상태 범례 추가 (대기/작업 중/차단/오프라인 설명)
- 상태 배지에 마우스 호버 시 설명 툴팁 표시
- 버전 = 워커 코드 버전 (인스톨러 버전과 별개) 설명 추가

### 분배 정책 Phase 1

#### 새 크롤링 타입
- deep_analysis (심화 분석): 키워드 상위 컨텐츠 세부 분석 → AI 컨텐츠 생성용
- area_analysis (영역 분석): 통합검색 영역(파워링크/지식인/블로그/카페 등) 순위 파악
- daily_rank (일일 순위): 등록된 URL의 매일 검색 순위 체크 (대규모 반복 작업)

#### 타입별 자동 우선순위
- deep_analysis → priority 10 (즉시 처리)
- blog_crawl, blog_serp, kin_analysis, area_analysis → priority 5
- rank_check, daily_rank → priority 1 (백그라운드)
- POST /api/crawl에서 priority 미지정 시 타입별 기본값 자동 적용

#### 워커 일일 할당량
- worker_config에 daily_quota(기본 500), daily_used 컬럼 추가
- KST 자정 자동 리셋 (Supabase RPC 함수)
- 워커가 할당량 소진 시 작업 픽업 중단, 60초마다 재확인
- dispatch API에서 할당량 소진 워커 제외 후 분배
- /config 페이지에 워커별 할당량 설정 + 사용량 프로그래스 바 UI
- atomic increment로 race condition 방지

#### 분배 정책 설계 문서
- docs/DISTRIBUTION.md 추가 (작업 유형, 분배 정책, 봇 탐지 회피 5계층, Phase 1~4 로드맵)
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
