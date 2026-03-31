"use client";

import { useState } from "react";
import Link from "next/link";

export default function GuidePage() {
  const [langTab, setLangTab] = useState<"nextjs" | "python" | "direct">(
    "nextjs"
  );

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold">연동 가이드</h2>
        <a
          href="/api/docs?type=integration"
          download="CrawlStation-연동가이드.md"
          className="px-3 py-1.5 text-xs bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors"
        >
          MD 파일 다운로드
        </a>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        desk-web, kin-web 등 외부 앱에서 CrawlStation에 크롤링을 요청하고
        결과를 받아가는 방법입니다. AI 채팅, 아티팩트, 외부 프로그램 개발 시
        바로 활용할 수 있습니다.
      </p>

      {/* CrawlStation이란 */}
      <Section title="CrawlStation이란?">
        <p className="text-sm text-gray-600 leading-relaxed">
          CrawlStation은 <strong>분산 크롤링 관제 시스템</strong>입니다. 여러
          대의 PC(워커)에 크롤링 작업을 자동 분배하고, 결과를 중앙에서 수집합니다.
        </p>
        <div className="mt-3 bg-gray-50 rounded-lg p-4">
          <pre className="text-xs font-mono text-gray-600 leading-relaxed whitespace-pre">{`[외부 앱/AI]              [CrawlStation]           [워커 PC들]
     |                        |                       |
     |-- 크롤링 요청 --------->|                       |
     |                        |-- 작업 분배 ---------->|
     |                        |                       |-- 네이버 크롤링
     |                        |<-- 결과 보고 ----------|
     |<-- 결과 반환 ----------|                       |
     |                        |                       |

연동에 필요한 것: CrawlStation URL 하나
(Supabase 키 불필요, API만으로 연동 가능)`}</pre>
        </div>
      </Section>

      {/* 어떻게 작동하나 */}
      <Section title="어떻게 작동하나?">
        <div className="space-y-3">
          <StepBlock
            number={1}
            title="크롤링 요청 등록"
            desc="키워드 + 크롤링 타입을 POST /api/crawl로 보내면 작업 큐에 등록됩니다."
          />
          <StepBlock
            number={2}
            title="자동 분배"
            desc="활성 워커가 5초마다 큐를 확인하고, 작업을 가져가서 크롤링합니다."
          />
          <StepBlock
            number={3}
            title="결과 수집"
            desc="크롤링 완료 시 결과가 DB에 저장되고, API로 조회할 수 있습니다."
          />
        </div>
      </Section>

      {/* 크롤링 타입 */}
      <Section title="지원하는 크롤링 타입">
        <div className="grid grid-cols-2 gap-3">
          <TypeCard
            type="blog_crawl"
            title="블로그 크롤링"
            desc="네이버 블로그 검색 결과에서 본문, 제목, URL 등 추출"
          />
          <TypeCard
            type="blog_serp"
            title="블로그 SERP"
            desc="네이버 블로그 검색 결과 페이지 순위 + 메타 정보"
          />
          <TypeCard
            type="kin_analysis"
            title="지식iN 분석"
            desc="네이버 지식iN 검색 결과 크롤링 + 질문/답변 분석"
          />
          <TypeCard
            type="rank_check"
            title="순위 체크"
            desc="특정 키워드에서 특정 블로그/사이트 순위 확인"
          />
        </div>
      </Section>

      {/* 연동 정보 */}
      <Section title="연동 정보">
        <ConnectInfo />
      </Section>

      {/* 코드 예제 */}
      <Section title="코드 예제">
        <div className="flex gap-1 mb-4">
          {(["nextjs", "python", "direct"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setLangTab(tab)}
              className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                langTab === tab
                  ? "bg-blue-100 text-blue-700 font-medium"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {tab === "nextjs"
                ? "Next.js / TypeScript"
                : tab === "python"
                ? "Python"
                : "Supabase 직접"}
            </button>
          ))}
        </div>

        {langTab === "nextjs" && <NextJsExample />}
        {langTab === "python" && <PythonExample />}
        {langTab === "direct" && <DirectExample />}
      </Section>

      {/* API 레퍼런스 */}
      <Section title="API 레퍼런스">
        <ApiReference />
      </Section>

      {/* AI/개발자용 다운로드 */}
      <Section title="AI 채팅 / 외부 개발에 활용하기">
        <p className="text-sm text-gray-600 mb-3">
          아래 MD 파일을 AI 채팅(ChatGPT, Claude 등)에 첨부하거나, 프로젝트에
          포함시키면 AI가 CrawlStation 연동 코드를 자동으로 생성할 수 있습니다.
        </p>
        <div className="flex gap-3">
          <a
            href="/api/docs?type=integration"
            download="CrawlStation-연동가이드.md"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors text-sm"
          >
            연동 가이드 MD 다운로드
          </a>
          <a
            href="/api/docs?type=changelog"
            download="CrawlStation-업데이트기록.md"
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm"
          >
            업데이트 기록 MD 다운로드
          </a>
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <h3 className="text-lg font-bold mb-3">{title}</h3>
      {children}
    </div>
  );
}

function StepBlock({
  number,
  title,
  desc,
}: {
  number: number;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-3">
      <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">
        {number}
      </span>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
      </div>
    </div>
  );
}

function TypeCard({
  type,
  title,
  desc,
}: {
  type: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="text-sm font-semibold">{title}</div>
      <code className="text-xs text-blue-600 bg-blue-50 px-1 rounded">
        {type}
      </code>
      <div className="text-xs text-gray-500 mt-1">{desc}</div>
    </div>
  );
}

function ConnectInfo() {
  const stationUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://crawl-station.vercel.app";
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <div className="font-mono text-xs space-y-1.5 text-blue-700">
        <div className="flex items-center gap-2">
          <span className="text-blue-400 w-36 shrink-0">CRAWLSTATION_URL</span>
          <span className="bg-blue-100 px-2 py-0.5 rounded select-all">
            {stationUrl}
          </span>
        </div>
      </div>
      <p className="text-xs text-blue-500 mt-2">
        * 외부 앱에서는 이 URL만 있으면 됩니다 (Supabase 키 불필요)
      </p>
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

function NextJsExample() {
  return (
    <div className="space-y-3">
      <Code>{`// 1. 크롤링 요청
const res = await fetch("https://crawl-station.vercel.app/api/crawl", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    keywords: ["당뇨에 좋은 음식", "탈모 샴푸"],
    type: "blog_crawl"
  })
});
const { requests } = await res.json();
// requests = [{ id: "uuid-1", keyword: "..." }, ...]

// 2. 결과 조회 (폴링)
const result = await fetch(
  \`https://crawl-station.vercel.app/api/crawl?request_id=\${requests[0].id}\`
).then(r => r.json());
// result.status = "completed" | "pending" | "running"
// result.results = [{ rank: 1, data: { title, url, body } }, ...]`}</Code>
    </div>
  );
}

function PythonExample() {
  return (
    <div className="space-y-3">
      <Code>{`import requests, time

STATION = "https://crawl-station.vercel.app"

# 1. 크롤링 요청
res = requests.post(f"{STATION}/api/crawl", json={
    "keywords": ["당뇨에 좋은 음식"],
    "type": "blog_crawl"
})
req_id = res.json()["requests"][0]["id"]

# 2. 결과 대기
while True:
    r = requests.get(f"{STATION}/api/crawl?request_id={req_id}").json()
    if r["request"]["status"] in ("completed", "failed"):
        break
    time.sleep(3)

# 3. 결과 사용
for item in r["results"]:
    print(item["data"]["title"], item["data"]["url"])`}</Code>
    </div>
  );
}

function DirectExample() {
  return (
    <div className="space-y-3">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
        Supabase에 직접 연결하는 방법입니다. 이미 Supabase를 사용 중인 앱에 적합합니다.
      </div>
      <Code>{`-- 요청 등록
INSERT INTO crawl_requests (keyword, type, status, priority)
VALUES ('당뇨에 좋은 음식', 'blog_crawl', 'pending', 0);

-- 결과 조회
SELECT * FROM crawl_results
WHERE request_id = 'uuid'
ORDER BY rank;

-- 상태: pending → assigned → running → completed | failed`}</Code>
    </div>
  );
}

function ApiReference() {
  return (
    <div className="space-y-4">
      <ApiEndpoint
        method="POST"
        path="/api/crawl"
        description="크롤링 요청 등록"
        body={`{ "keywords": ["키워드1", ...], "type": "blog_crawl", "priority": 0 }`}
        response={`{ "requests": [{ "id": "uuid", "keyword": "...", "status": "pending" }] }`}
      />
      <ApiEndpoint
        method="GET"
        path="/api/crawl?request_id=uuid"
        description="요청 상태 + 결과 조회"
        response={`{ "request": { "status": "completed" }, "results": [{ "rank": 1, "data": {...} }] }`}
      />
      <ApiEndpoint
        method="GET"
        path="/api/crawl?keyword=당뇨&type=blog_crawl"
        description="키워드로 결과 검색"
        response={`{ "keyword": "당뇨", "results": [...] }`}
      />
      <ApiEndpoint
        method="GET"
        path="/api/workers"
        description="워커 상태 조회"
        response={`{ "total": 3, "active": 2, "workers": [...] }`}
      />
      <ApiEndpoint
        method="POST"
        path="/api/dispatch"
        description="작업 자동 분배"
        body={`{ "keywords": [...], "type": "blog_serp", "strategy": "round_robin" }`}
        response={`{ "distribution": { "worker-001": 5, "worker-002": 5 } }`}
      />
    </div>
  );
}

function ApiEndpoint({
  method,
  path,
  description,
  body,
  response,
}: {
  method: string;
  path: string;
  description: string;
  body?: string;
  response: string;
}) {
  const mc = method === "POST" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700";
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-3">
        <span className={`px-2 py-0.5 rounded text-xs font-bold ${mc}`}>{method}</span>
        <code className="text-sm font-mono">{path}</code>
        <span className="text-xs text-gray-400 ml-auto">{description}</span>
      </div>
      <div className="p-3 space-y-2">
        {body && (
          <div>
            <div className="text-xs text-gray-400 mb-1">Request</div>
            <Code>{body}</Code>
          </div>
        )}
        <div>
          <div className="text-xs text-gray-400 mb-1">Response</div>
          <Code>{response}</Code>
        </div>
      </div>
    </div>
  );
}
