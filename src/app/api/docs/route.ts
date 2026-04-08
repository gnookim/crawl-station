import { NextRequest, NextResponse } from "next/server";

const INTEGRATION_MD = `# CrawlStation 연동 가이드

> 이 파일을 AI 채팅(ChatGPT, Claude 등)에 첨부하거나 프로젝트에 포함시키면,
> AI가 CrawlStation 연동 코드를 자동 생성할 수 있습니다.

## CrawlStation이란?

CrawlStation은 **분산 크롤링 관제 시스템**입니다.
여러 대의 PC(워커)에 크롤링 작업을 자동 분배하고, 결과를 중앙에서 수집합니다.

---

## 1. 설정 (Configuration)

### 환경변수

\`\`\`env
# .env.local (Next.js) 또는 .env (Python/Node)
CRAWL_STATION_URL=https://crawl-station.vercel.app
CRAWL_STATION_API_KEY=cs_발급받은키
\`\`\`

API 키 발급: CrawlStation 웹 → **연결된 앱** → **앱 등록** → 키 복사

### TypeScript 설정 객체

\`\`\`typescript
// lib/crawl-station.ts
export const crawlStationConfig = {
  baseUrl: process.env.CRAWL_STATION_URL ?? "https://crawl-station.vercel.app",
  apiKey: process.env.CRAWL_STATION_API_KEY ?? "",
  pollInterval: 3000,   // 결과 폴링 주기 (ms)
  timeout: 120_000,     // 최대 대기 시간 (ms)
} as const;
\`\`\`

### Python 설정 객체

\`\`\`python
# config.py
import os

CRAWL_STATION = {
    "url": os.getenv("CRAWL_STATION_URL", "https://crawl-station.vercel.app"),
    "api_key": os.getenv("CRAWL_STATION_API_KEY", ""),
    "poll_interval": 3,   # 초
    "timeout": 120,       # 초
}
\`\`\`

---

## 2. 인증

모든 쓰기 요청(POST)에는 \`X-API-Key\` 헤더가 필요합니다.

\`\`\`
X-API-Key: cs_abc123...
\`\`\`

| 엔드포인트 | 인증 필요 |
|-----------|---------|
| \`POST /api/crawl\` | ✅ |
| \`POST /api/dispatch\` | ✅ |
| \`GET /api/crawl\` (결과 조회) | ❌ |
| \`GET /api/workers\` | ❌ |

---

## 3. 크롤링 타입

### 네이버

| type | 설명 |
|------|------|
| \`blog_crawl\` | 블로그 검색 결과 — 본문/제목/URL 추출 |
| \`blog_serp\` | 통합검색 블로그 SERP 순위 수집 |
| \`kin_analysis\` | 지식iN 질문/답변 분석 |
| \`area_analysis\` | 통합검색 영역 분석 (파워링크/블로그/지식인/카페/쇼핑 등 순서) |
| \`deep_analysis\` | 상위 콘텐츠 심화 분석 (통합검색+블로그+지식인+카페 탭) |
| \`daily_rank\` | URL 매일 검색 순위 체크 |
| \`rank_check\` | 특정 URL 순위 확인 |

### 인스타그램

| type | 설명 |
|------|------|
| \`instagram_profile\` | 공개 프로필 수집 (팔로워/팔로잉/게시물/릴스 수, 자기소개) |

---

## 4. API 레퍼런스

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
{
  "request": { "id": "uuid", "keyword": "당뇨에 좋은 음식", "status": "completed" },
  "results": [
    { "rank": 1, "data": { "title": "...", "url": "...", "body": "..." } }
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
{ "keywords": ["키워드1"], "type": "blog_serp", "strategy": "round_robin" }
\`\`\`

---

## 5. TypeScript 클라이언트

\`\`\`typescript
// lib/crawl-station.ts
export type CrawlType =
  | "blog_crawl" | "blog_serp" | "kin_analysis"
  | "area_analysis" | "deep_analysis" | "daily_rank" | "rank_check"
  | "instagram_profile";

export interface CrawlResult {
  rank: number;
  data: Record<string, unknown>;
}

const _cfg = {
  baseUrl: process.env.CRAWL_STATION_URL ?? "https://crawl-station.vercel.app",
  apiKey: process.env.CRAWL_STATION_API_KEY ?? "",
  pollInterval: 3000,
  timeout: 120_000,
};

/** 크롤링 요청 등록 */
export async function requestCrawl(
  keywords: string[],
  type: CrawlType,
  options: Record<string, unknown> = {}
) {
  const res = await fetch(\`\${_cfg.baseUrl}/api/crawl\`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": _cfg.apiKey },
    body: JSON.stringify({ keywords, type, options }),
  });
  if (!res.ok) throw new Error(\`CrawlStation 요청 실패: \${res.status}\`);
  return (await res.json()).requests as { id: string; keyword: string; status: string }[];
}

/** 결과 대기 (폴링) */
export async function waitForCrawl(requestId: string) {
  const deadline = Date.now() + _cfg.timeout;
  while (Date.now() < deadline) {
    const r = await fetch(\`\${_cfg.baseUrl}/api/crawl?request_id=\${requestId}\`).then(r => r.json());
    if (r.request?.status === "completed" || r.request?.status === "failed") return r as { request: unknown; results: CrawlResult[] };
    await new Promise(r => setTimeout(r, _cfg.pollInterval));
  }
  return null;
}

/** 단건 요청 + 대기 */
export async function crawl(keyword: string, type: CrawlType, options?: Record<string, unknown>): Promise<CrawlResult[]> {
  const [req] = await requestCrawl([keyword], type, options);
  const result = await waitForCrawl(req.id);
  return result?.results ?? [];
}
\`\`\`

**사용 예**

\`\`\`typescript
import { crawl, requestCrawl } from "@/lib/crawl-station";

// 단건 — 결과까지 대기
const results = await crawl("당뇨에 좋은 음식", "blog_crawl");

// 다건 — 비동기 등록 후 나중에 폴링
const requests = await requestCrawl(["키워드1", "키워드2"], "blog_serp");
\`\`\`

---

## 6. Python 클라이언트

\`\`\`python
# crawl_station.py
import os, time
import requests as http

_BASE = os.getenv("CRAWL_STATION_URL", "https://crawl-station.vercel.app")
_KEY  = os.getenv("CRAWL_STATION_API_KEY", "")
_HDR  = {"X-API-Key": _KEY, "Content-Type": "application/json"}

def request_crawl(keywords: list, crawl_type: str, options: dict = {}) -> list:
    res = http.post(f"{_BASE}/api/crawl",
        headers=_HDR, json={"keywords": keywords, "type": crawl_type, "options": options})
    res.raise_for_status()
    return res.json()["requests"]

def wait_for_crawl(request_id: str, timeout: int = 120) -> dict | None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = http.get(f"{_BASE}/api/crawl?request_id={request_id}").json()
        if r["request"]["status"] in ("completed", "failed"):
            return r
        time.sleep(3)
    return None

def crawl(keyword: str, crawl_type: str, **options) -> list:
    reqs = request_crawl([keyword], crawl_type, options)
    result = wait_for_crawl(reqs[0]["id"])
    return result["results"] if result else []
\`\`\`

**사용 예**

\`\`\`python
from crawl_station import crawl, request_crawl

results = crawl("당뇨에 좋은 음식", "blog_crawl")
for r in results:
    print(r["data"]["title"])
\`\`\`

---

## 7. 인스타그램 프로필 수집

\`\`\`typescript
// usernames 배열을 쉼표 구분 keyword로 전달
const results = await crawl(
  usernames.join(","),
  "instagram_profile",
  { usernames, fetchReelsCount: true, source: "my-app" }
);
// results[i].data = { username, full_name, bio, profile_url,
//   follower_count, following_count, post_count, reels_count,
//   is_verified, is_private }
\`\`\`

### Supabase 직접 등록 (Insta Desk 방식)

\`\`\`typescript
const { data } = await supabase.from("crawl_requests").insert({
  type: "instagram_profile",
  keyword: usernames.join(","),
  options: { usernames, fetchReelsCount: true, source: "insta-desk" },
  status: "pending",
  priority: 5,
}).select("id").single();

const { data: results } = await supabase
  .from("crawl_results").select("data").eq("request_id", data.id);
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
- last_seen 기준 30초 이내 응답 없으면 오프라인 표시
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

### 새 핸들러 + 서브태스크 분할 (워커 v0.5.0)

#### 새 크롤링 핸들러 3종
- AreaAnalysisHandler: 통합검색 영역(파워링크/블로그/지식인/카페/쇼핑 등) 순위 분석
- DeepAnalysisHandler: 키워드 상위 컨텐츠 심화 분석 (통합검색+블로그+지식인+카페 탭)
- DailyRankHandler: 등록된 URL의 검색 결과 순위 체크 (최대 3페이지, 탭별)

#### Phase 2: 서브태스크 분할
- deep_analysis 요청 → 4개 서브태스크(통합/블로그/지식인/카페)로 자동 분할
- 서브태스크가 여러 워커에 분산되어 병렬 처리
- 모든 서브태스크 완료 시 부모 요청 자동 완료
- crawl_requests에 parent_id, scope 컬럼 추가

#### 업데이트 기록 페이지
- 최신순 정렬 기본 적용 + 정렬 토글 버튼

### Phase 3: 일일 순위 스케줄 매니저

#### 스케줄 시스템
- /schedule 페이지: 스케줄 생성/관리/URL 등록
- 스케줄별 설정: 이름, 워커 수, 실행 시간대(KST)
- URL 벌크 등록 (탭 구분: 키워드/URL/메모)
- 오늘 디스패치 상태 실시간 확인

#### Vercel Cron 자동 디스패치
- 매시간 /api/cron/daily-rank 실행
- 스케줄의 slot_hours에 해당하는 시간에만 작업 생성
- URL을 슬롯 수로 균등 분할 (예: 1만개 / 4슬롯 = 2,500개씩)
- 워커 라운드 로빈 배정 + quota increment
- 중복 디스패치 방지 (dispatch_log 유니크 제약)

#### DB 테이블
- daily_rank_schedules: 스케줄 설정
- daily_rank_urls: 순위 체크 대상 URL 목록
- daily_rank_dispatch_log: 디스패치 이력 (중복 방지)

#### 워커 업데이트 안정화
- 파일 쓰기 순서 수정: 일반 파일 → __init__.py → worker.py
- os.execv → sys.exit(42)로 재시작 방식 변경 (LaunchAgent 호환)
- 재시작 전 import 검증 추가 (실패 시 재시작 취소)

### Phase 4: 고급 봇 탐지 회피 (워커 v0.6.0)

#### Decoy 검색
- 25개 일반 키워드 풀 (날씨, 맛집, 영화, 주식 등)
- 작업 사이 15% 확률로 목적 없는 검색 실행
- 검색 → 스크롤 → 30% 확률로 결과 클릭 → 자연스러운 패턴

#### 새벽 자동 휴식
- KST 3~5시 작업 자동 중단 (config.rest_hours로 커스텀 가능)
- 사람이 안 쓰는 시간대에 크롤링하면 의심받으므로 자동 휴식

#### 봇 탐지 회피 5계층 완성
- Layer 1: 네트워크 (IP 로테이션, 프록시, 테더링)
- Layer 2: 브라우저 핑거프린트 (UA, canvas, WebGL)
- Layer 3: 행동 패턴 (타이핑, 스크롤, 오타, 클릭)
- Layer 4: 분배 (할당량, 서브태스크, 시간대 분산)
- Layer 5: 패턴 위장 (decoy 검색, 새벽 휴식)

### AI 기반 크롤링 회피 고도화 (워커 v0.7.0)

#### 메타데이터 수집
- 워커가 매 크롤링마다 기록: 응답시간, 결과 수, 차단 여부, 캡챠, 에러 유형
- crawl_metadata 테이블에 저장 → AI 분석 기반 데이터

#### AI 분석 엔진 (/api/ai/analyze)
- 최근 1시간 메타데이터 집계 → 워커별 차단율/에러율 계산
- 정상이면 AI 호출 생략 (비용 절약)
- 차단 발생 시 Claude AI에게 전략 조정 요청
- AI가 딜레이/배치/decoy 비율 자동 조정
- 차단율에 따라 모델 에스컬레이션: Haiku → Sonnet → Opus

#### 시스템 설정
- AI 모델 선택 (Haiku/Sonnet/Opus) + 자동 조정 on/off
- 인스톨러용/워커용 Claude API 키 분리 관리
- 워커별 ai_auto_adjust 개별 설정 가능
- 최근 AI 분석 로그 뷰어
- "지금 분석 실행" 수동 트리거 버튼

## 2026-04-04

### 워커 v0.9.2 — 안정성 대폭 개선

#### 할당량 이중 카운팅 버그 수정
- dispatch API에서 작업 배정 시 increment_daily_used 호출 제거
- 워커가 작업 완료 시에만 할당량 차감 (이전에는 배정+완료 2회 차감)
- 실제 처리량의 2배로 할당량이 소진되던 문제 해결

#### Heartbeat 백그라운드 태스크 분리
- heartbeat를 별도 asyncio 백그라운드 태스크로 분리 (10초 간격)
- 배치 휴식(180초), 키워드 딜레이(15~30초), 새벽 휴식 중에도 heartbeat 유지
- 오프라인 판정 임계값 15초 → 30초로 조정 (workers API, dispatch API, UI 모두)
- 워커가 정상 동작 중인데 오프라인으로 깜빡이던 문제 해결

#### 타임존 버그 수정
- 새벽 휴식 시간 판정: \`(hour + 9) % 24\` → \`zoneinfo.ZoneInfo("Asia/Seoul")\` 사용
- \`astimezone()\`이 로컬 시간을 반환하는데 +9를 중복 적용하던 문제 수정
- KST 자정 리셋 로직도 동일하게 수정

### 워커 v0.9.3 — 네이버 DOM 변경 대응

#### blog_serp 셀렉터 수정
- 네이버가 블로그 링크를 텍스트 없는 \`<a>\` 태그로 중복 감싸는 구조로 변경
- URL별 가장 긴 텍스트를 가진 링크를 선택하는 Map 방식으로 수정
- 기존: 텍스트 없는 링크가 먼저 등록되어 모든 결과 필터링됨 → 0개 반환

### 워커 v0.9.4 — 핫 리로드 도입

#### 핸들러 핫 리로드
- 업데이트 시 재시작 없이 \`importlib.reload()\`로 핸들러 즉시 반영
- VERSION 전역변수도 런타임에 갱신
- \`_pending_restart\` + \`restart_worker()\` 로직 완전 제거
- 핸들러 변경은 즉시 반영, worker.py 구조 변경만 재시작 필요

## 2026-04-05

### 워커 v0.9.5 — 인스톨러 전면 수정

#### STATION_URL 수정
- GitHub Secrets의 STATION_URL이 잘못된 도메인으로 설정되어 있던 문제 수정
- 모든 인스톨러(Mac/Windows)가 HTML을 worker.py로 저장하던 근본 원인 해결

#### Mac .pkg postinstall 재작성
- Python 탐색 로직 강화 (python3.12 우선, 버전 검증)
- 파일 다운로드 3회 재시도 + 크기 검증 (빈 파일 방지)
- pip 패키지 설치 3단계 fallback
- 전체 과정 install.log에 기록
- 워커 시작 검증 (프로세스 확인 + 에러 로그 출력)

#### Windows 인스톨러 개선
- step 11 Station 크롤링 테스트 제거 (설치 시간 초과 방지)
- GUI에 PYTHONUNBUFFERED + -u 플래그 추가 (로그 실시간 표시)

#### 릴리즈 등록 간극 방지
- 새 릴리즈를 먼저 insert한 후 기존 is_latest를 false로 변경
- download API에 fallback: is_latest 없으면 최신 created_at 사용

### 워커 v0.9.6 — 에러 가시성 개선

#### 에러 로깅 강화
- Supabase 쿼리 실패 시 에러 메시지 출력 (기존: silent 무시)
- heartbeat, config, quota 실패 모두 로깅
- zoneinfo fallback 추가 (Windows 호환)
- 반복 import 제거 (루프 안 → 모듈 상단)

### 워커 v0.9.7 — 봇 탐지 회피 고도화

#### 워커별 decoy 관심사 프로필
- 5개 프로필 (생활/IT/건강/재테크/취미) × 10개 키워드
- 워커 ID 기반 자동 배정 — 같은 워커는 일관된 관심사로 검색
- worker_config에서 decoy_profile 수동 지정 가능
- 네이버 입장에서 각 워커가 고유한 사용자 패턴을 보이게 됨

### Station 개선 (2026-04-02 ~ 04-04)

#### 오프라인 판정 통일
- 임계값 15초 → 30초로 변경 (heartbeat 10초 기준)
- WORKER_ONLINE_THRESHOLD_MS 상수로 6곳 통일 관리

#### 워커 관리 페이지 개선
- 전체 테스트 버튼 — 활성 워커 동시 테스트 + 결과 한눈에 표시
- 자동 갱신 기본값 10초, 3초 옵션 제거
- 대시보드와 워커 관리 상태 판정 통일 (is_active 기반)

#### 헬스체크 Cron
- /api/cron/health-check — 매일 KST 9시 자동 실행
- 핸들러별 테스트 (blog_serp, kin_analysis, area_analysis)
- 실패 시 station_settings에 알림 기록

#### SSO 로그인 시스템
- LifeNBio SSO 연동 (로그인/회원가입/로그아웃)
- AuthGuard — 미로그인 시 /login 리다이렉트
- (protected) route group으로 모든 페이지 보호
- 내 계정 페이지 (프로필 수정, 계정 정보)
- 회원 관리 페이지 (admin 전용 — 승인/거부, 활성화/비활성화)
- 사이드바에 사용자 프로필 + 로그아웃

#### 설치 페이지 버전 표시
- GitHub Release 대신 Supabase worker_releases에서 최신 버전 조회

### 워커 v0.9.8 — 인스타그램 프로필 크롤링

#### instagram_profile 핸들러 추가
- 인스타그램 공개 프로필에서 피드 수, 팔로워, 팔로잉, 릴스 수 수집
- og:description 메타태그 기반 파싱 (한국어/영어 자동 대응)
- M/K/B 단위 자동 변환 (701M → 701,000,000)
- 릴스 탭 접근으로 릴스 개수 추정
- lnb-insta(Insta Desk) 연동 — crawl_requests로 작업 요청, crawl_results로 결과 반환
- 기존 네이버 크롤링 워커에 추가 설치 없이 통합 운영

## 2026-04-08

### Station — 작업 큐 인스타그램 표시 개선
- 인스타 계정 목록(쉼표 구분) → "@user1, @user2 +N개" 형식으로 표시
- 생성 시간: 초 제거 → "4. 8. 오후 2:43" 형식으로 단축

### Station — 작업 큐 테이블 레이아웃 수정
- 출처 배지 2줄 → 1줄 수정: flex-col 제거, whitespace-nowrap 적용, 목적(자동/수동 테스트)은 툴팁으로 이동
- 키워드 셀: 완료 ▶ 버튼과 키워드가 별도 줄로 분리되던 문제 수정 (flex 정렬로 한 줄 처리)
- 출처 컬럼 너비 88px → 112px 확장
- 대시보드 워커 상태 셀 flex-nowrap 추가

### Station — Vercel Hobby cron 제한 수정
- health-check cron 표현식 "0 * * * *" (매시간) → "0 9 * * *" (매일 09시)
- Vercel Hobby 계정은 일 1회 이하 cron만 허용 — 이 제한으로 3일간 빌드 실패, 테이블 레이아웃 수정이 미배포 상태였음

## 2026-04-06

### 워커 v0.9.12 — 차단 감지 + 보고 시스템 (1단계)

#### 차단 Level 분류
- Level 1 (소프트): 타임아웃/빈 결과 반복 → 30분 cooldown 자동 대기
- Level 2 (하드): 캡챠/로그인 요구/blocked 감지 → 60분 차단 + 알림
- Level 3 (영구): 추후 계정 차단 감지 시 사용

#### 워커 차단 보고
- 차단 감지 시 workers 테이블에 block_status/block_platform/block_level/blocked_until 업데이트
- 플랫폼별 분리 (naver / instagram)
- 정상 결과 수신 시 자동 차단 해제

#### Station UI
- 워커 관리: 차단 배지 표시 (N 차단 L2 등)
- Level별 색상: L1 노란색, L2 주황색, L3 빨간색
- 테스트 버튼 N/I 분리 — 워커별 독립 테스트 결과 표시
- 전체 N테스트 / 전체 I테스트 버튼 분리
- 결과 ▼▲ 토글로 워커별 네이버+인스타 결과 동시 확인

### 워커 v0.9.11 — 인스타그램 릴스 수 API 인터셉트

#### 릴스 수 수집 방식 전면 개선
- 프로필 페이지 로드 시 Instagram 내부 API(web_profile_info) 응답 가로채기
- edge_felix_video_timeline.count 또는 clips_count 필드에서 정확한 릴스 수 추출
- API 응답으로 팔로워/게시물/이름/bio도 더 정확하게 수집
- API 실패 시 릴스 탭 DOM 스크롤 카운트로 fallback

### 워커 v0.9.10 — 인스타그램 게시물/릴스 수집 개선

#### 게시물 수 (post_count) 3단계 파싱
- 1단계: og:description 메타태그 (영어/한국어 패턴)
- 2단계: DOM header > ul > li 직접 파싱 (span.title 포함 정확한 숫자)
- 3단계: header 전체 텍스트에서 regex 추출
- 기존: 메타태그만 사용 → 로그인 요구 시 0 반환 문제 개선

#### 릴스 수 (reels_count) 스크롤 카운트
- 기존: 페이지 로드 시 보이는 것만 카운트 (~12개)
- 개선: 최대 10회 스크롤하며 a[href*="/reel/"] 누적 카운트
- 연속 2회 변화 없으면 중단 (끝 도달 판정)

### 워커 테스트 — 네이버/인스타그램 구분 테스트

#### 테스트 카테고리 선택
- 워커 관리 페이지 상단에 네이버/인스타 토글 추가
- 네이버: blog_serp "맛집 추천" 테스트
- 인스타그램: instagram_profile "nike" 프로필 수집 테스트
- 개별 워커 테스트 + 전체 테스트 모두 선택한 카테고리로 실행
- 테스트 결과에 카테고리 배지 표시

### 워커 v0.9.9 — 타입 분류 (블로그/인스타 전용 워커)

#### allowed_types 설정
- worker_config에 allowed_types(JSON 배열) 추가 — 워커가 처리할 크롤링 타입 지정
- 빈 배열 = 전체 처리 (기존 동작 유지), ["instagram_profile"] = 인스타 전용
- 설정 저장 후 최대 30초 내 워커에 자동 반영 (config 폴링 주기)
- heartbeat에 allowed_types 포함 — Station에서 워커별 타입 실시간 확인

#### Station 연동
- 워커 설정 페이지에 "워커 타입 분류" 섹션 추가
- 워커별 전체/네이버/인스타그램 버튼으로 카테고리 선택
- 대시보드 + 워커 관리 페이지에 타입 배지 표시 (네이버/인스타/혼합)
- 워커 관리 페이지: 업데이트 버튼 항상 표시 (최신 버전도 강제 재설치 가능)

### 헬스체크 스케줄 설정

#### 실행 시각 설정 UI
- 설정 페이지에 "헬스체크 스케줄" 섹션 추가
- KST 0~23시 중 실행할 시각 다중 선택 (기본: 9시)
- 선택한 시각은 station_settings의 health_check_hours 키에 JSON 배열로 저장
- "지금 실행" 버튼으로 즉시 수동 실행 가능
- 마지막 헬스체크 결과 + 다음 실행 예정 시각 표시

#### Cron 주기 변경
- vercel.json 헬스체크 cron: 일별(\`0 0 * * *\`) → 매시간(\`0 * * * *\`)
- 매시간 실행하되, health_check_hours에 포함된 시각에만 실제 테스트 수행
- 미설정 시 KST 9시에만 실행 (기존 동작 유지)

### Station UI — 네이버/인스타 카테고리 탭

#### 대시보드 카테고리 탭
- 전체/네이버/인스타그램 탭으로 통계 카드 필터링
- 카테고리별 대기 작업, 실행 중, 완료, 실패 수 분리 표시

#### 작업 큐 카테고리 탭
- 전체/네이버/인스타그램 탭으로 작업 목록 필터링
- 기존 상태 필터(전체/대기/실행/완료/실패)와 조합 가능

#### 타입 시스템 확장
- instagram_profile 타입 추가 (CrawlType, 라벨, 우선순위)
- CRAWL_CATEGORIES 상수로 카테고리 관리 — 새 플랫폼 추가 시 한 곳만 수정

### crawler-app — Oclick 재고 동기화

#### 로그인 셀렉터 확정 (DOM 직접 확인)
- 필드명 확정: \`#in_usercu\`(고객사코드), \`#in_userid\`(사용자ID), \`#in_passwd\`(비밀번호)
- 로그인 버튼: \`button.bt_m_button01\`
- 로그인 후 admin.oclick.co.kr 리디렉션 확인 및 실패 감지 추가

#### options 파라미터 변경
- \`company_name\` → \`user_id\` (실제 필드가 사용자 ID임을 반영)
- 하위 호환: \`opts.user_id || opts.company_name\`으로 기존 요청도 처리

#### Station 타입 등록
- CRAWL_TYPE_LABELS에 \`oclick_sync: "Oclick 재고 동기화"\` 추가
- PRIORITY_BY_TYPE에 \`oclick_sync: 1\` 추가

### Station UI — 테이블 레이아웃 수정

#### 작업 큐
- 타입 컬럼 \`whitespace-nowrap\` 추가 — 긴 텍스트("인스타그램프로필")가 세로로 깨지던 문제 수정
- 키워드 셀 \`max-w-xs truncate\` 적용 — 긴 쉼표 구분 목록이 행 높이를 과도하게 늘리던 문제 수정
- 헤더 컬럼 전체 \`whitespace-nowrap\` 처리

#### 워커 관리
- 현재 작업 컬럼 \`max-w-[200px] truncate\` 적용 — 긴 인스타 username 목록 잘라서 표시
- 상태 배지 컨테이너 \`flex-nowrap\` 으로 변경 — 배지 줄바꿈으로 행 높이가 늘어나던 문제 수정
- 마지막 응답 셀 \`whitespace-nowrap\` 추가

## 2026-04-08

### Instagram 계정 풀 관리 시스템

#### Station — instagram_accounts 테이블 + API
- \`instagram_accounts\` 테이블 추가 (id, username, password, status, session_state, blocked_until, assigned_worker_id 등)
- GET/POST/PATCH/DELETE: 계정 CRUD
- \`?action=pick\`: 워커에서 사용 가능한 계정 1개 발급 (LRU 방식, 전용 워커 우선)
- \`?action=session\`: 로그인 후 storageState 저장
- \`?action=block\`: 차단 보고 → status=cooling, blocked_until 설정, session 초기화

#### Station — Instagram 계정 관리 UI (/instagram-accounts)
- 계정 목록 (상태, 마지막 사용, 로그인/차단 횟수)
- 계정 추가 (username, password, 전용 워커 ID, 메모)
- 활성/비활성 토글, 차단 수동 해제, 편집, 삭제
- 요약 카드: 활성/쿨다운/차단 계정 수
- 사이드바에 "Instagram 계정" 메뉴 추가

#### 워커 — instagram.py 계정 세션 로직
- 크롤링 시작 시 Station \`/api/instagram-accounts?action=pick\`으로 계정 발급
- 저장된 storageState 복원 후 로그인 상태 확인
- 미로그인 시 자동 재로그인 시도 (로그인 폼 자동 입력)
- 크롤링 완료 후 최신 storageState를 Station에 저장
- 차단 감지 시 Station에 block 보고 → 해당 계정 쿨다운 처리
- 계정 없거나 발급 실패 시 익명 모드로 자동 fallback (기존 동작 유지)
- instagram_profile 작업 시 options에 worker_id 자동 주입

### 릴리즈 시스템 — handlers/instagram.py 추가
- GitHub 가져오기 + 릴리즈 파일 목록에 \`handlers/instagram.py\` 포함

## 2026-04-08 (추가)

### crawl_results 테이블 참조 전면 제거
- crawl\_requests.result JSON 필드로 통합 (별도 crawl\_results 테이블 불필요)
- 영향: /api/crawl GET, /api/test/worker, queue 페이지 결과 조회, health-check 결과 확인
- 외부 연동(lnb-insta 등)도 result 필드 직접 파싱으로 안내

### Cron 시간 수정
- health-check: `0 9 * * *` UTC(KST 18시) → `0 0 * * *` UTC(KST 9시) 수정
- health-check route: crawl\_results 대신 crawl\_requests.result JSON 파싱으로 변경

### DB — daily_rank_* 테이블 스키마 수정 (20260408_daily_rank_fix.sql)
- daily\_rank\_schedules: keyword/type/options → name/worker\_count/slots\_per\_day/slot\_hours/updated\_at 로 재생성
- daily\_rank\_urls: schedule\_id FK + keyword/url/memo 구조
- daily\_rank\_dispatch\_log: schedule\_id FK + dispatch\_date/slot\_hour UNIQUE 제약
- 기존 마이그레이션의 잘못된 스키마를 API 실제 사용 구조에 맞게 수정

### 순위 대시보드 수정
- crawl\_results 테이블 → crawl\_requests (type=daily\_rank, status=completed) 기반으로 변경
- result JSON 파싱하여 키워드별/URL별/날짜별 순위 매트릭스 표시
- 검색 탭(통합검색/블로그탭 등) 토글 추가
- URL 클릭 시 원본 페이지 열기

### API — /api/crawl/complete (신규)
- crawler-app이 크롤링 완료 후 Station에 결과 보고하는 엔드포인트
- crawl\_requests status/result/completed\_at 업데이트
- callback\_url 있으면 Station이 직접 발송 (외부 시스템 연동)
- increment\_worker\_processed RPC 추가

### Queue UI 개선
- 테이블 레이아웃/여백/컬럼 너비 최적화
- 워커/에러 컬럼 truncate + title 속성으로 전체 텍스트 툴팁
- instagram\_profile 키워드 셀 첫 계정 + 나머지 카운트 표시
- 출처 배지 목적 표시 (`·자동`, `·수동`) 추가

### 회원 관리 — pending users app\_slug 필터
- `pending-users?app_slug=crawl-station` 파라미터 추가 (타 앱 가입자 섞임 방지)

### 크롤 타입 — oclick\_sync 추가
- `/api/crawl` POST 유효 타입에 oclick\_sync 추가 (핸들러 구현 예정)

### 워커 v0.9.16 — instagram 계정 관리 Supabase 직접 호출
- CRAWL\_STATION\_URL 환경변수 불필요 — 워커가 기보유한 SUPABASE\_URL/KEY로 instagram\_accounts 직접 조회
- \_pick\_account / \_report\_block / \_save\_session 모두 Supabase REST API로 전환

### 워커 v0.9.15 — instagram 핸들러 등록 + decoy 프로필 + SERP 개선
- handlers/\_\_init\_\_.py: InstagramProfileHandler 등록 누락 수정
- handlers/base.py: 워커 ID 해시 기반 5종 관심사 decoy 프로필 자동 배정
- handlers/serp.py: URL 정규화 + urlMap 기반 중복 제거 (가장 긴 텍스트 우선)

### 워커 v0.9.14 — 인스타 로그인 게이트 감지
- 프로필 접근 시 accounts/login 리다이렉트 또는 로그인 폼 DOM 감지
- 로그인 게이트 → None 반환 (0 반환 대신 명확한 실패 처리)
- 익명 상태에서 게이트 감지 시 나머지 계정도 중단 + 로그 안내

### DB — 통합 누락 마이그레이션 (20260408_full_catchup.sql)
- workers: allowed\_types, block\_status/platform/level, blocked\_until, block\_count\_today, command, verified\_at 등 누락 컬럼 일괄 추가
- station\_settings, crawl\_blocks, crawl\_metadata, ai\_analysis\_log, install\_sessions 테이블 생성
- instagram\_accounts 테이블 최종 스키마 통합
- RPC 함수: increment\_daily\_used, reset\_daily\_quota\_if\_needed, increment\_instagram\_login/block

### 워커 — 차단 자동 대응 Stage 3 (작업 재배분)

#### crawl_request pending 복원
- 캡챠/로그인 요구 차단 감지 시 진행 중이던 작업을 pending으로 되돌림
- assigned_worker=null 해제 → 다른 온라인 워커가 자동으로 이어받아 처리
- timeout 에러는 네트워크 문제로 간주 → 실패 처리 (재배분 안 함)

#### 쿨다운 중 폴링 중단
- blocked_until 시각 전이면 새 작업을 가져오지 않고 대기
- 30초 간격으로 남은 시간 체크, 1분마다 로그 출력
- 쿨다운 만료 시 자동 차단 해제 + 작업 재개

#### 재배분 범위
- Level 2 (하드 차단): 캡챠, 로그인 요구 → 재배분 O
- Level 1 (소프트 차단): 빈 결과 반복 → 완료 처리 (재배분 X)
- timeout: 실패 처리 (재배분 X)
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
