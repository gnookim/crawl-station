"use client";

import { useState } from "react";

type MainTab = "worker" | "integration";

export default function InstallPage() {
  const [mainTab, setMainTab] = useState<MainTab>("worker");

  return (
    <div className="p-6 max-w-4xl">
      {/* 메인 탭 */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <button
          onClick={() => setMainTab("worker")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            mainTab === "worker"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          크롤링 워커 설치
        </button>
        <button
          onClick={() => setMainTab("integration")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            mainTab === "integration"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          외부 앱 연동 가이드
        </button>
      </div>

      {mainTab === "worker" ? <WorkerInstall /> : <IntegrationGuide />}
    </div>
  );
}

/* ================================================================
   워커 설치 탭
   ================================================================ */
function WorkerInstall() {
  return (
    <>
      <h2 className="text-xl font-bold mb-2">크롤링 워커 설치</h2>
      <p className="text-sm text-gray-500 mb-6">
        새 PC에 크롤링 워커를 설치하면 CrawlStation에 자동으로 등록됩니다.
        <br />
        Windows/macOS 모두 동일한 인스톨러로 설치할 수 있습니다.
      </p>

      {/* 연결 정보 */}
      <ConnectInfo />

      {/* 설치 가이드 */}
      <div className="space-y-4 mt-6">
        <Step
          number={1}
          title="사전 요구사항"
          content={
            <>
              <p>Python 3.10 이상</p>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div className="bg-gray-50 rounded p-2 text-xs">
                  <div className="font-semibold mb-1">macOS</div>
                  <Code>brew install python@3.12</Code>
                </div>
                <div className="bg-gray-50 rounded p-2 text-xs">
                  <div className="font-semibold mb-1">Windows</div>
                  <p>
                    python.org에서 설치
                    <br />
                    <span className="text-yellow-600">
                      &quot;Add to PATH&quot; 체크 필수!
                    </span>
                  </p>
                </div>
              </div>
            </>
          }
        />
        <Step
          number={2}
          title="인스톨러 실행 (Windows/macOS 공통)"
          content={
            <>
              <p>
                installer.py 파일을 다운로드 후 실행하면 자동으로 설치됩니다.
              </p>
              <Code>python installer.py</Code>
              <div className="mt-2 text-xs text-gray-400">
                자동으로: pip 패키지 설치 → Chromium 설치 → 워커 파일 복사 → .env
                생성
              </div>
            </>
          }
        />
        <Step
          number={3}
          title=".env 파일에 연결 정보 입력"
          content={
            <>
              <p>설치 디렉토리의 .env 파일을 열어 위의 연결 정보를 입력합니다.</p>
              <Code>{`# macOS: ~/CrawlWorker/.env
# Windows: C:\\CrawlWorker\\.env

SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJ...`}</Code>
            </>
          }
        />
        <Step
          number={4}
          title="실행"
          content={
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-semibold text-gray-500 mb-1">
                    macOS
                  </div>
                  <Code>{`cd ~/CrawlWorker
python3 worker.py`}</Code>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-500 mb-1">
                    Windows
                  </div>
                  <Code>{`cd C:\\CrawlWorker
python worker.py`}</Code>
                </div>
              </div>
              <p className="mt-2 text-green-600 font-medium text-xs">
                CrawlStation 대시보드에 자동 등록됩니다.
              </p>
            </>
          }
        />
      </div>

      {/* 설치 후 확인 */}
      <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-green-800 mb-2">
          설치 후 확인
        </h3>
        <ul className="text-sm text-green-700 space-y-1 list-disc list-inside">
          <li>
            worker.py 실행 후 CrawlStation 대시보드에 워커가 표시되면 성공
          </li>
          <li>상태가 &quot;대기&quot;(초록)으로 표시되어야 합니다</li>
          <li>작업 큐에서 작업을 등록하면 워커가 자동으로 가져갑니다</li>
        </ul>
      </div>
    </>
  );
}

/* ================================================================
   연동 가이드 탭
   ================================================================ */
function IntegrationGuide() {
  const [langTab, setLangTab] = useState<"nextjs" | "python" | "direct">(
    "nextjs"
  );

  return (
    <>
      <h2 className="text-xl font-bold mb-2">외부 앱 연동 가이드</h2>
      <p className="text-sm text-gray-500 mb-6">
        desk-web, kin-web 등 외부 앱에서 CrawlStation에 크롤링을 요청하고
        결과를 받아가는 방법입니다.
      </p>

      {/* 연동 구조 다이어그램 */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h3 className="text-sm font-semibold mb-3">연동 구조</h3>
        <pre className="text-xs font-mono text-gray-600 leading-relaxed">{`┌──────────┐    ┌──────────────┐    ┌──────────────┐
│ desk-web │───▶│ CrawlStation │───▶│ 크롤링 워커   │
│ kin-web  │◀───│   API        │◀───│ (각 PC)      │
│ 기타 앱   │    │              │    │              │
└──────────┘    └──────────────┘    └──────────────┘

연동 방법 2가지:
  A. CrawlStation API 사용 (권장)
  B. Supabase 직접 연결`}</pre>
      </div>

      {/* 연결 정보 */}
      <ConnectInfo />

      {/* 방법 선택 */}
      <div className="flex gap-1 mt-6 mb-4">
        <button
          onClick={() => setLangTab("nextjs")}
          className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
            langTab === "nextjs"
              ? "bg-blue-100 text-blue-700 font-medium"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
        >
          Next.js / TypeScript
        </button>
        <button
          onClick={() => setLangTab("python")}
          className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
            langTab === "python"
              ? "bg-blue-100 text-blue-700 font-medium"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
        >
          Python
        </button>
        <button
          onClick={() => setLangTab("direct")}
          className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
            langTab === "direct"
              ? "bg-blue-100 text-blue-700 font-medium"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
        >
          Supabase 직접 연결
        </button>
      </div>

      {langTab === "nextjs" && <NextJsGuide />}
      {langTab === "python" && <PythonGuide />}
      {langTab === "direct" && <DirectGuide />}

      {/* API 레퍼런스 */}
      <div className="mt-8">
        <h3 className="text-lg font-bold mb-4">API 레퍼런스</h3>
        <ApiReference />
      </div>
    </>
  );
}

/* ── 연결 정보 공통 컴포넌트 ─────────────── */
function ConnectInfo() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-blue-800 mb-2">연결 정보</h3>
      <div className="font-mono text-xs space-y-1.5 text-blue-700">
        <div className="flex items-center gap-2">
          <span className="text-blue-400 w-36 shrink-0">SUPABASE_URL</span>
          <span className="bg-blue-100 px-2 py-0.5 rounded select-all">
            {process.env.NEXT_PUBLIC_SUPABASE_URL || "(설정 필요)"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-blue-400 w-36 shrink-0">SUPABASE_KEY</span>
          <span className="text-blue-500">관리자에게 문의</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-blue-400 w-36 shrink-0">
            CRAWLSTATION_URL
          </span>
          <span className="bg-blue-100 px-2 py-0.5 rounded select-all">
            http://localhost:3000
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Next.js 연동 가이드 ─────────────────── */
function NextJsGuide() {
  return (
    <div className="space-y-4">
      <Step
        number={1}
        title="환경 변수 설정 (.env.local)"
        content={
          <Code>{`# CrawlStation 연동
CRAWL_SUPABASE_URL=https://xxx.supabase.co
CRAWL_SUPABASE_KEY=eyJ...`}</Code>
        }
      />
      <Step
        number={2}
        title="크롤 클라이언트 생성 (src/lib/crawl-client.ts)"
        content={
          <Code>{`import { createClient } from "@supabase/supabase-js";

const crawlDb = createClient(
  process.env.CRAWL_SUPABASE_URL!,
  process.env.CRAWL_SUPABASE_KEY!
);

// 크롤링 요청
export async function requestCrawl(
  keywords: string[],
  type: "blog_crawl" | "blog_serp" | "kin_analysis" | "rank_check",
  options?: Record<string, unknown>
) {
  const rows = keywords.map((keyword) => ({
    keyword,
    type,
    options: options || null,
    status: "pending",
    priority: 0,
  }));

  const { data, error } = await crawlDb
    .from("crawl_requests")
    .insert(rows)
    .select("id, keyword");

  if (error) throw error;
  return data;  // [{ id: "uuid", keyword: "..." }, ...]
}

// 결과 조회 (request_id로)
export async function getCrawlResult(requestId: string) {
  const { data: req } = await crawlDb
    .from("crawl_requests")
    .select("status")
    .eq("id", requestId)
    .single();

  if (req?.status !== "completed") {
    return { status: req?.status, results: null };
  }

  const { data: results } = await crawlDb
    .from("crawl_results")
    .select("*")
    .eq("request_id", requestId)
    .order("rank");

  return { status: "completed", results };
}

// 결과 조회 (키워드로)
export async function getCrawlByKeyword(
  keyword: string,
  type?: string
) {
  let query = crawlDb
    .from("crawl_results")
    .select("*")
    .eq("keyword", keyword)
    .order("created_at", { ascending: false })
    .limit(50);

  if (type) query = query.eq("type", type);

  const { data } = await query;
  return data || [];
}

// 실시간 결과 대기 (polling)
export async function waitForResult(
  requestId: string,
  timeoutMs = 120000,
  intervalMs = 3000
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await getCrawlResult(requestId);
    if (result.status === "completed" || result.status === "failed") {
      return result;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { status: "timeout", results: null };
}`}</Code>
        }
      />
      <Step
        number={3}
        title="API 라우트에서 사용하기"
        content={
          <Code>{`// src/app/api/analyze/route.ts
import { requestCrawl, waitForResult } from "@/lib/crawl-client";

export async function POST(req: Request) {
  const { keyword } = await req.json();

  // 1. 크롤링 요청
  const [request] = await requestCrawl([keyword], "blog_crawl");

  // 2. 결과 대기 (최대 2분)
  const result = await waitForResult(request.id);

  // 3. 결과 활용
  if (result.status === "completed") {
    return Response.json({ data: result.results });
  }

  return Response.json(
    { error: "크롤링 실패 또는 타임아웃" },
    { status: 500 }
  );
}`}</Code>
        }
      />
    </div>
  );
}

/* ── Python 연동 가이드 ──────────────────── */
function PythonGuide() {
  return (
    <div className="space-y-4">
      <Step
        number={1}
        title="패키지 설치"
        content={<Code>pip install supabase</Code>}
      />
      <Step
        number={2}
        title="크롤 클라이언트 (crawl_client.py)"
        content={
          <Code>{`from supabase import create_client
import time

SUPABASE_URL = "https://xxx.supabase.co"
SUPABASE_KEY = "eyJ..."

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

def request_crawl(keywords, crawl_type, options=None):
    """크롤링 요청 등록"""
    rows = [{"keyword": kw, "type": crawl_type, "status": "pending",
             "options": options, "priority": 0} for kw in keywords]
    res = sb.table("crawl_requests").insert(rows).execute()
    return res.data  # [{"id": "uuid", "keyword": "..."}, ...]

def get_result(request_id):
    """결과 조회"""
    req = sb.table("crawl_requests").select("status") \\
        .eq("id", request_id).single().execute()
    if req.data["status"] != "completed":
        return {"status": req.data["status"], "results": None}
    results = sb.table("crawl_results").select("*") \\
        .eq("request_id", request_id).order("rank").execute()
    return {"status": "completed", "results": results.data}

def wait_for_result(request_id, timeout=120):
    """결과 대기 (polling)"""
    start = time.time()
    while time.time() - start < timeout:
        result = get_result(request_id)
        if result["status"] in ("completed", "failed"):
            return result
        time.sleep(3)
    return {"status": "timeout", "results": None}`}</Code>
        }
      />
      <Step
        number={3}
        title="사용 예시"
        content={
          <Code>{`# 블로그 크롤링 요청
requests = request_crawl(["당뇨에 좋은 음식", "탈모 샴푸"], "blog_crawl")

# 결과 대기
for req in requests:
    result = wait_for_result(req["id"])
    if result["status"] == "completed":
        for item in result["results"]:
            print(item["data"]["title"])`}</Code>
        }
      />
    </div>
  );
}

/* ── Supabase 직접 연결 가이드 ───────────── */
function DirectGuide() {
  return (
    <div className="space-y-4">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
        CrawlStation API를 거치지 않고 Supabase에 직접 연결하는 방법입니다.
        <br />
        이미 Supabase를 사용 중인 앱에 적합합니다.
      </div>
      <Step
        number={1}
        title="테이블 구조"
        content={
          <Code>{`-- 요청 테이블 (INSERT로 크롤링 요청)
crawl_requests:
  id          UUID (PK, 자동)
  keyword     TEXT          -- 검색 키워드
  type        TEXT          -- "blog_crawl" | "blog_serp" | "kin_analysis" | "rank_check"
  options     JSONB         -- 핸들러별 추가 옵션
  status      TEXT          -- "pending" → "assigned" → "running" → "completed" | "failed"
  priority    INTEGER       -- 높을수록 먼저 (기본 0)
  error_message TEXT

-- 결과 테이블 (SELECT로 결과 조회)
crawl_results:
  id          UUID (PK, 자동)
  request_id  UUID          -- crawl_requests.id
  type        TEXT
  keyword     TEXT
  rank        INTEGER       -- 순위 (있는 경우)
  data        JSONB         -- 핸들러별 결과 데이터`}</Code>
        }
      />
      <Step
        number={2}
        title="연동 흐름"
        content={
          <Code>{`1. 외부 앱 → crawl_requests에 INSERT (status: "pending")
2. 크롤링 워커가 자동으로 가져감 → status: "running"
3. 완료 시 → crawl_results에 결과 INSERT + status: "completed"
4. 외부 앱 → crawl_results에서 SELECT (request_id로 조회)

※ Realtime 구독으로 즉시 알림 받기:
supabase
  .channel("crawl")
  .on("postgres_changes", {
    event: "UPDATE",
    schema: "public",
    table: "crawl_requests",
    filter: \`id=eq.\${requestId}\`,
  }, (payload) => {
    if (payload.new.status === "completed") {
      // 결과 조회
    }
  })
  .subscribe();`}</Code>
        }
      />
    </div>
  );
}

/* ── API 레퍼런스 ────────────────────────── */
function ApiReference() {
  return (
    <div className="space-y-4">
      <ApiEndpoint
        method="POST"
        path="/api/crawl"
        description="크롤링 요청 등록"
        requestBody={`{
  "keywords": ["당뇨에 좋은 음식", "탈모 샴푸"],
  "type": "blog_crawl",
  "options": {},         // 선택
  "priority": 0          // 선택 (높을수록 먼저)
}`}
        responseBody={`{
  "message": "2개 크롤링 요청 등록 완료",
  "requests": [
    { "id": "uuid-1", "keyword": "당뇨에 좋은 음식", "type": "blog_crawl", "status": "pending" },
    { "id": "uuid-2", "keyword": "탈모 샴푸", "type": "blog_crawl", "status": "pending" }
  ]
}`}
      />
      <ApiEndpoint
        method="GET"
        path="/api/crawl?request_id=uuid"
        description="특정 요청의 상태 + 결과 조회"
        responseBody={`{
  "request": { "id": "uuid", "keyword": "...", "status": "completed", ... },
  "results": [
    { "rank": 1, "data": { "title": "...", "url": "...", "body": "..." } },
    { "rank": 2, "data": { ... } }
  ]
}`}
      />
      <ApiEndpoint
        method="GET"
        path="/api/crawl?keyword=당뇨&type=blog_crawl"
        description="키워드로 결과 검색"
        responseBody={`{
  "keyword": "당뇨",
  "results": [ ... ]
}`}
      />
      <ApiEndpoint
        method="GET"
        path="/api/workers"
        description="워커 상태 조회"
        responseBody={`{
  "total": 3,
  "active": 2,
  "workers": [
    { "id": "worker-001", "name": "서울PC", "status": "idle", "is_active": true },
    ...
  ]
}`}
      />
      <ApiEndpoint
        method="POST"
        path="/api/dispatch"
        description="작업 자동 분배 (활성 워커에게 라운드로빈)"
        requestBody={`{
  "keywords": ["키워드1", "키워드2", ...],
  "type": "blog_serp",
  "strategy": "round_robin"    // "round_robin" | "load_based"
}`}
        responseBody={`{
  "message": "10개 작업을 2대 워커에 분배",
  "strategy": "round_robin",
  "distribution": { "worker-001": 5, "worker-002": 5 }
}`}
      />
    </div>
  );
}

function ApiEndpoint({
  method,
  path,
  description,
  requestBody,
  responseBody,
}: {
  method: string;
  path: string;
  description: string;
  requestBody?: string;
  responseBody: string;
}) {
  const methodColor =
    method === "POST"
      ? "bg-green-100 text-green-700"
      : "bg-blue-100 text-blue-700";

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-3">
        <span
          className={`px-2 py-0.5 rounded text-xs font-bold ${methodColor}`}
        >
          {method}
        </span>
        <code className="text-sm font-mono">{path}</code>
        <span className="text-xs text-gray-400 ml-auto">{description}</span>
      </div>
      <div className="p-4 space-y-3">
        {requestBody && (
          <div>
            <div className="text-xs font-semibold text-gray-400 mb-1">
              Request Body
            </div>
            <Code>{requestBody}</Code>
          </div>
        )}
        <div>
          <div className="text-xs font-semibold text-gray-400 mb-1">
            Response
          </div>
          <Code>{responseBody}</Code>
        </div>
      </div>
    </div>
  );
}

/* ── 공통 컴포넌트 ───────────────────────── */
function Step({
  number,
  title,
  content,
}: {
  number: number;
  title: string;
  content: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-6 h-6 bg-gray-900 text-white rounded-full flex items-center justify-center text-xs font-bold">
          {number}
        </span>
        <h4 className="font-semibold text-sm">{title}</h4>
      </div>
      <div className="text-sm text-gray-600 ml-8">{content}</div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-gray-900 text-green-400 rounded-md p-3 text-xs font-mono mt-1 overflow-x-auto whitespace-pre-wrap">
      {children}
    </pre>
  );
}
