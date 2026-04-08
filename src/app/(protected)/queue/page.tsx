"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { CrawlRequest, Worker } from "@/types";
import { CRAWL_TYPE_LABELS, PRIORITY_BY_TYPE, CRAWL_CATEGORIES, type CrawlCategory } from "@/types";
import { TaskStatusBadge } from "@/components/ui/status-badge";

export default function QueuePage() {
  const [requests, setRequests] = useState<CrawlRequest[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [category, setCategory] = useState<CrawlCategory>("all");
  const [showNewTask, setShowNewTask] = useState(false);
  const [newKeywords, setNewKeywords] = useState("");
  const [newType, setNewType] = useState("blog_serp");
  const [newWorker, setNewWorker] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resultData, setResultData] = useState<Record<string, unknown>[] | null>(null);
  const [loadingResult, setLoadingResult] = useState(false);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [filter, category]);

  async function loadData() {
    let query = supabase
      .from("crawl_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (filter !== "all") {
      query = query.eq("status", filter);
    }

    const catTypes = CRAWL_CATEGORIES.find((c) => c.key === category)?.types || [];
    if (catTypes.length > 0) {
      query = query.in("type", catTypes);
    }

    const [reqRes, workerRes] = await Promise.all([
      query,
      supabase.from("workers").select("id, name, status"),
    ]);

    setRequests((reqRes.data || []) as CrawlRequest[]);
    setWorkers((workerRes.data || []) as Worker[]);
  }

  async function createTasks() {
    const keywords = newKeywords
      .split("\n")
      .map((k) => k.trim())
      .filter(Boolean);
    if (keywords.length === 0) return;

    const rows = keywords.map((keyword) => ({
      keyword,
      type: newType,
      status: newWorker ? "assigned" : "pending",
      assigned_worker: newWorker || null,
      priority: PRIORITY_BY_TYPE[newType] || 5,
    }));

    await supabase.from("crawl_requests").insert(rows);
    setNewKeywords("");
    setShowNewTask(false);
    loadData();
  }

  async function toggleResult(requestId: string) {
    if (expandedId === requestId) {
      setExpandedId(null);
      setResultData(null);
      return;
    }
    setExpandedId(requestId);
    setLoadingResult(true);
    const { data } = await supabase
      .from("crawl_results")
      .select("*")
      .eq("request_id", requestId)
      .order("rank");
    setResultData((data || []) as Record<string, unknown>[]);
    setLoadingResult(false);
  }

  const activeWorkers = workers.filter(
    (w) => w.status === "idle" || w.status === "crawling"
  );

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">작업 큐</h2>
        <button
          onClick={() => setShowNewTask(!showNewTask)}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          + 작업 등록
        </button>
      </div>

      {/* 카테고리 탭 */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-0.5 w-fit">
        {CRAWL_CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setCategory(cat.key)}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              category === cat.key
                ? "bg-white text-gray-900 font-medium shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* 새 작업 등록 */}
      {showNewTask && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-semibold mb-3">크롤링 작업 등록</h3>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">타입</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(CRAWL_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                할당 워커 (미선택 시 자동)
              </label>
              <select
                value={newWorker}
                onChange={(e) => setNewWorker(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">자동 (미할당)</option>
                {activeWorkers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name || w.id} ({w.status})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">
              키워드 (한 줄에 하나씩)
            </label>
            <textarea
              value={newKeywords}
              onChange={(e) => setNewKeywords(e.target.value)}
              rows={5}
              placeholder={"당뇨에 좋은 음식\n탈모 샴푸 추천\n다이어트 보조제"}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={createTasks}
              className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              {newKeywords.split("\n").filter((k) => k.trim()).length}개 등록
            </button>
            <button
              onClick={() => setShowNewTask(false)}
              className="px-4 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50 transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 필터 */}
      <div className="flex gap-1 mb-4">
        {[
          { key: "all", label: "전체" },
          { key: "pending", label: "대기" },
          { key: "assigned", label: "할당됨" },
          { key: "running", label: "실행 중" },
          { key: "completed", label: "완료" },
          { key: "failed", label: "실패" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              filter === f.key
                ? "bg-blue-100 text-blue-700 font-medium"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 작업 목록 */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {requests.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            작업이 없습니다.
          </div>
        ) : (
          <table className="w-full text-sm table-fixed">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="text-left px-4 py-2 font-medium">키워드</th>
                <th className="text-left px-4 py-2 font-medium w-[116px]">타입</th>
                <th className="text-left px-4 py-2 font-medium w-[112px]">출처</th>
                <th className="text-left px-4 py-2 font-medium w-[76px]">상태</th>
                <th className="text-left px-4 py-2 font-medium w-[120px]">워커</th>
                <th className="text-left px-4 py-2 font-medium w-[120px]">에러</th>
                <th className="text-right px-4 py-2 font-medium w-[120px]">생성</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {requests.map((r) => (
                <>
                <tr
                  key={r.id}
                  className={`hover:bg-gray-50 ${r.status === "completed" ? "cursor-pointer" : ""} ${expandedId === r.id ? "bg-blue-50" : ""}`}
                  onClick={() => r.status === "completed" && toggleResult(r.id)}
                >
                  <td className="px-4 py-2 font-medium overflow-hidden">
                    <div className="flex items-center gap-1 overflow-hidden">
                      {r.status === "completed" && (
                        <span className="text-blue-500 shrink-0">{expandedId === r.id ? "▼" : "▶"}</span>
                      )}
                      <KeywordCell keyword={r.keyword} type={r.type} />
                    </div>
                    {r.scope && <span className="text-xs text-gray-400">({r.scope})</span>}
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs overflow-hidden">
                    <span className="truncate block">{CRAWL_TYPE_LABELS[r.type] || r.type}</span>
                  </td>
                  <td className="px-4 py-2 overflow-hidden">
                    <SourceBadge options={r.options} />
                  </td>
                  <td className="px-4 py-2">
                    <TaskStatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-400 overflow-hidden">
                    <span className="truncate block">{r.assigned_worker ? r.assigned_worker.slice(0, 20) : "-"}</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-red-500 overflow-hidden">
                    <span className="truncate block">{r.error_message || "-"}</span>
                  </td>
                  <td className="px-4 py-2 text-right text-xs text-gray-400 whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                </tr>
                {expandedId === r.id && (
                  <tr key={`${r.id}-result`}>
                    <td colSpan={7} className="px-4 py-3 bg-gray-50">
                      {loadingResult ? (
                        <div className="text-sm text-gray-400">결과 로딩 중...</div>
                      ) : !resultData?.length ? (
                        <div className="text-sm text-gray-400">결과 없음</div>
                      ) : (
                        <ResultViewer type={r.type} data={resultData} />
                      )}
                    </td>
                  </tr>
                )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ResultViewer({ type, data }: { type: string; data: Record<string, unknown>[] }) {
  if (type === "area_analysis") {
    return (
      <div className="space-y-1">
        <div className="text-xs font-semibold text-gray-600 mb-2">통합검색 영역 순위</div>
        {data.map((r, i) => {
          const d = (r.data || {}) as Record<string, unknown>;
          return (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="w-8 text-right font-bold text-blue-600">{String(d.rank || i + 1)}위</span>
              <span className="font-medium">{String(d.area || "-")}</span>
            </div>
          );
        })}
      </div>
    );
  }

  if (type === "daily_rank" || type === "rank_check") {
    return (
      <div className="space-y-1">
        <div className="text-xs font-semibold text-gray-600 mb-2">순위 체크 결과</div>
        {data.map((r, i) => {
          const d = (r.data || {}) as Record<string, unknown>;
          const rank = d.rank as number;
          return (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="font-medium">{String(d.tab || "-")}</span>
              <span className={`font-bold ${rank > 0 ? "text-green-600" : "text-gray-400"}`}>
                {rank > 0 ? `${rank}위` : "미발견"}
              </span>
              {d.found_url ? <span className="text-gray-400 truncate max-w-xs">{String(d.found_url)}</span> : null}
            </div>
          );
        })}
      </div>
    );
  }

  if (type === "deep_analysis") {
    return (
      <div className="space-y-2">
        <div className="text-xs font-semibold text-gray-600 mb-2">심화 분석 결과</div>
        {data.map((r, i) => {
          const d = (r.data || {}) as Record<string, unknown>;
          return (
            <details key={i} className="border border-gray-200 rounded-md">
              <summary className="px-3 py-1.5 text-xs cursor-pointer hover:bg-gray-100">
                <span className="font-bold text-blue-600 mr-2">{String(d.rank || i + 1)}위</span>
                <span className="font-medium">{String(d.title || "").slice(0, 60)}</span>
                <span className="text-gray-400 ml-2">[{String(d.tab || "")}] {String(d.content_type || "")}</span>
              </summary>
              <div className="px-3 py-2 text-xs space-y-1 bg-gray-50">
                <div><strong>URL:</strong> <span className="text-blue-500">{String(d.url || "")}</span></div>
                <div><strong>글자 수:</strong> {String(d.word_count || 0)} | <strong>이미지:</strong> {String(d.image_count || 0)} | <strong>영상:</strong> {d.has_video ? "있음" : "없음"}</div>
                {(d.headings as string[] || []).length > 0 && (
                  <div><strong>소제목:</strong> {(d.headings as string[]).join(" / ")}</div>
                )}
                {d.body ? <div className="mt-1 text-gray-500 max-h-24 overflow-y-auto whitespace-pre-wrap">{String(d.body).slice(0, 500)}...</div> : null}
              </div>
            </details>
          );
        })}
      </div>
    );
  }

  // 기본 (blog_serp, blog_crawl, kin_analysis 등)
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-gray-600 mb-2">결과 ({data.length}개)</div>
      {data.map((r, i) => {
        const d = (r.data || {}) as Record<string, unknown>;
        return (
          <div key={i} className="flex items-center gap-3 text-xs">
            <span className="w-8 text-right font-bold text-blue-600">{String(d.rank || i + 1)}</span>
            <span className="font-medium truncate max-w-md">{String(d.title || "-")}</span>
            {d.url ? <span className="text-gray-400 truncate max-w-xs">{String(d.url)}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

function KeywordCell({ keyword, type }: { keyword: string; type: string }) {
  if (type === "instagram_profile") {
    const accounts = keyword.split(",").map((s) => s.trim()).filter(Boolean);
    const preview = accounts.slice(0, 2).map((a) => `@${a}`).join(", ");
    const rest = accounts.length - 2;
    return (
      <span className="truncate text-sm" title={accounts.map((a) => `@${a}`).join(", ")}>
        <span className="text-gray-400 text-xs mr-1">계정</span>
        {preview}
        {rest > 0 && <span className="text-gray-400 text-xs ml-1">+{rest}개</span>}
      </span>
    );
  }
  return <span className="truncate" title={keyword}>{keyword}</span>;
}

const SOURCE_MAP: Record<string, { label: string; color: string }> = {
  "insta-desk": { label: "Insta Desk", color: "bg-pink-50 text-pink-700" },
  "desk-web": { label: "Desk Web", color: "bg-indigo-50 text-indigo-700" },
  "health-check": { label: "헬스체크", color: "bg-yellow-50 text-yellow-700" },
  "station": { label: "Station", color: "bg-blue-50 text-blue-700" },
  "api": { label: "API", color: "bg-green-50 text-green-700" },
};

function SourceBadge({ options }: { options: Record<string, unknown> | null }) {
  if (!options) return <span className="text-xs text-gray-300">-</span>;

  // options에서 출처 판별
  let source = "";
  let purpose = "";

  if (options._health_check) {
    source = "health-check";
    purpose = "자동 테스트";
  } else if (options._test) {
    source = "station";
    purpose = "수동 테스트";
  } else if (options.source) {
    source = String(options.source);
  }

  if (!source) return <span className="text-xs text-gray-300">-</span>;

  const config = SOURCE_MAP[source] || { label: source, color: "bg-gray-50 text-gray-600" };

  return (
    <span
      className={`px-1.5 py-0.5 rounded text-xs whitespace-nowrap inline-block ${config.color}`}
      title={purpose ? `${config.label} · ${purpose}` : config.label}
    >
      {config.label}
    </span>
  );
}
