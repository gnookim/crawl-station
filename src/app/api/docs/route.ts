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

### 네이버

| type | 설명 |
|------|------|
| \`blog_crawl\` | 네이버 블로그 검색 결과 본문/제목/URL 추출 |
| \`blog_serp\` | 네이버 통합검색에서 블로그 SERP 순위 수집 (제목/URL/순위) |
| \`kin_analysis\` | 네이버 지식iN 크롤링 + 질문/답변 분석 |
| \`area_analysis\` | 네이버 통합검색 영역 분석 (파워링크/블로그/지식인/카페/쇼핑 등 순서) |
| \`deep_analysis\` | 키워드 상위 콘텐츠 심화 분석 (통합검색+블로그+지식인+카페 탭) |
| \`daily_rank\` | 등록된 URL의 매일 검색 순위 체크 (대규모 반복 작업) |
| \`rank_check\` | 특정 키워드에서 특정 블로그/URL 순위 확인 |

### 인스타그램

| type | 설명 |
|------|------|
| \`instagram_profile\` | 인스타그램 공개 프로필 정보 수집 (팔로워/팔로잉/게시물/릴스 수, 프로필 이미지, 자기소개) |

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

## 인스타그램 프로필 수집 예제

인스타그램 공개 프로필에서 팔로워, 팔로잉, 게시물 수, 릴스 수를 수집합니다.

### 요청

\`\`\`json
{
  "keywords": ["username1,username2,username3"],
  "type": "instagram_profile",
  "options": {
    "usernames": ["username1", "username2", "username3"],
    "fetchReelsCount": true
  }
}
\`\`\`

### 결과

\`\`\`json
{
  "results": [
    {
      "data": {
        "instagram_pk": 25025320,
        "username": "instagram",
        "full_name": "Instagram",
        "bio": "",
        "profile_url": "https://...",
        "follower_count": 701000000,
        "following_count": 234,
        "post_count": 8390,
        "is_verified": false,
        "is_private": false,
        "reels_count": 0
      }
    }
  ]
}
\`\`\`

### Next.js (Insta Desk 연동)

\`\`\`typescript
// Supabase public 스키마의 crawl_requests에 직접 등록
const { data } = await supabase.from("crawl_requests").insert({
  type: "instagram_profile",
  keyword: usernames.join(","),
  options: { usernames, fetchReelsCount: true, source: "insta-desk" },
  status: "pending",
  priority: 5,
}).select("id").single();

// 결과 폴링
const { data: results } = await supabase
  .from("crawl_results")
  .select("data")
  .eq("request_id", data.id);
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
