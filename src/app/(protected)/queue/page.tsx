"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { CrawlRequest, Worker } from "@/types";
import { CRAWL_TYPE_LABELS, PRIORITY_BY_TYPE, CRAWL_CATEGORIES } from "@/types";
import { TaskStatusBadge } from "@/components/ui/status-badge";

const PAGE_SIZE = 30;
const STATIC_STATUSES = new Set(["completed", "failed"]);

type Category = "all" | "naver" | "instagram" | "oclick" | "orch";

interface AgentTask {
  id: string;
  type: string;
  status: string;
  payload: Record<string, unknown>;
  created_at: string;
}

const CRAWL_STATUS_TABS = [
  { key: "all",       label: "전체" },
  { key: "pending",   label: "대기" },
  { key: "assigned",  label: "할당됨" },
  { key: "running",   label: "실행중" },
  { key: "completed", label: "완료" },
  { key: "failed",    label: "실패" },
];

const ORCH_STATUS_TABS = [
  { key: "all",       label: "전체" },
  { key: "pending",   label: "대기" },
  { key: "running",   label: "실행중" },
  { key: "completed", label: "완료" },
  { key: "failed",    label: "실패" },
];

export default function QueuePage() {
  const [category, setCategory]   = useState<Category>("all");
  const isOrch = category === "orch";

  // crawl_requests 상태
  const [requests, setRequests]         = useState<CrawlRequest[]>([]);
  const [workers, setWorkers]           = useState<Worker[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [filter, setFilter]             = useState("all");
  const [page, setPage]                 = useState(0);
  const [totalCount, setTotalCount]     = useState(0);
  const [showNewTask, setShowNewTask]   = useState(false);
  const [newKeywords, setNewKeywords]   = useState("");
  const [newType, setNewType]           = useState("blog_serp");
  const [newWorker, setNewWorker]       = useState("");
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [resultData, setResultData]     = useState<Record<string, unknown>[] | null>(null);
  const [loadingResult, setLoadingResult] = useState(false);

  // agent_tasks 상태
  const [orchTasks, setOrchTasks]       = useState<AgentTask[]>([]);
  const [orchFilter, setOrchFilter]     = useState("all");
  const [orchCounts, setOrchCounts]     = useState<Record<string, number>>({});
  const [orchPage, setOrchPage]         = useState(0);
  const [orchTotal, setOrchTotal]       = useState(0);

  const isStatic    = STATIC_STATUSES.has(filter);
  const totalPages  = Math.ceil(totalCount / PAGE_SIZE);
  const orchIsStatic    = STATIC_STATUSES.has(orchFilter);
  const orchTotalPages  = Math.ceil(orchTotal / PAGE_SIZE);

  function changeCategory(c: Category) {
    setCategory(c);
    setFilter("all");
    setOrchFilter("all");
    setPage(0);
    setOrchPage(0);
    setExpandedId(null);
    setResultData(null);
  }

  function changeFilter(f: string) {
    setFilter(f);
    setPage(0);
    setExpandedId(null);
    setResultData(null);
  }

  // ── crawl_requests ──────────────────────────────────
  async function loadCounts() {
    const catTypes = CRAWL_CATEGORIES.find((c) => c.key === (category as string))?.types ?? [];
    const statuses = ["pending", "assigned", "running", "completed", "failed"];
    const results = await Promise.all(
      statuses.map(async (s) => {
        let q = supabase.from("crawl_requests").select("*", { count: "exact", head: true }).eq("status", s);
        if (catTypes.length > 0) q = q.in("type", catTypes);
        const { count } = await q;
        return [s, count ?? 0] as [string, number];
      })
    );
    const counts = Object.fromEntries(results);
    counts.all = results.reduce((sum, [, c]) => sum + c, 0);
    setStatusCounts(counts);
  }

  async function loadData() {
    const catTypes = CRAWL_CATEGORIES.find((c) => c.key === (category as string))?.types ?? [];
    const workerPromise = supabase.from("workers").select("id, name, status");

    if (isStatic) {
      let q = supabase.from("crawl_requests").select("*", { count: "exact" })
        .eq("status", filter).order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (catTypes.length > 0) q = q.in("type", catTypes);
      const [{ data, count }, { data: wData }] = await Promise.all([q, workerPromise]);
      setRequests((data ?? []) as CrawlRequest[]);
      if (count !== null) setTotalCount(count);
      setWorkers((wData ?? []) as Worker[]);
    } else {
      let q = supabase.from("crawl_requests").select("*").order("created_at", { ascending: false }).limit(200);
      if (filter !== "all") q = q.eq("status", filter);
      if (catTypes.length > 0) q = q.in("type", catTypes);
      const [{ data }, { data: wData }] = await Promise.all([q, workerPromise]);
      setRequests((data ?? []) as CrawlRequest[]);
      setWorkers((wData ?? []) as Worker[]);
    }
  }

  useEffect(() => {
    if (isOrch) return;
    loadData(); loadCounts();
    if (isStatic) return;
    const id = setInterval(() => { loadData(); loadCounts(); }, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, filter, page]);

  // ── agent_tasks ──────────────────────────────────────
  async function loadOrchCounts() {
    const statuses = ["pending", "running", "done", "failed"];
    const results = await Promise.all(
      statuses.map(async (s) => {
        const { count } = await supabase.from("agent_tasks").select("*", { count: "exact", head: true }).eq("status", s);
        return [s, count ?? 0] as [string, number];
      })
    );
    const counts = Object.fromEntries(results);
    // UI는 "completed" 키로 표시
    counts.completed = counts.done ?? 0;
    counts.all = results.reduce((sum, [, c]) => sum + c, 0);
    setOrchCounts(counts);
  }

  async function loadOrchTasks() {
    // DB status: pending | running | done | failed
    const dbFilter = orchFilter === "completed" ? "done" : orchFilter;
    if (orchIsStatic) {
      const { data, count } = await supabase.from("agent_tasks").select("*", { count: "exact" })
        .eq("status", dbFilter).order("created_at", { ascending: false })
        .range(orchPage * PAGE_SIZE, (orchPage + 1) * PAGE_SIZE - 1);
      setOrchTasks((data ?? []) as AgentTask[]);
      if (count !== null) setOrchTotal(count);
    } else {
      let q = supabase.from("agent_tasks").select("*").order("created_at", { ascending: false }).limit(200);
      if (orchFilter !== "all") q = q.eq("status", dbFilter);
      const { data } = await q;
      setOrchTasks((data ?? []) as AgentTask[]);
    }
  }

  useEffect(() => {
    if (!isOrch) return;
    loadOrchTasks(); loadOrchCounts();
    if (orchIsStatic) return;
    const id = setInterval(() => { loadOrchTasks(); loadOrchCounts(); }, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, orchFilter, orchPage]);

  // ── 작업 등록 ────────────────────────────────────────
  async function createTasks() {
    const keywords = newKeywords.split("\n").map((k) => k.trim()).filter(Boolean);
    if (keywords.length === 0) return;
    const rows = keywords.map((keyword) => ({
      keyword, type: newType,
      status: newWorker ? "assigned" : "pending",
      assigned_worker: newWorker || null,
      priority: PRIORITY_BY_TYPE[newType] || 5,
    }));
    await supabase.from("crawl_requests").insert(rows);
    setNewKeywords(""); setShowNewTask(false);
    loadData(); loadCounts();
  }

  async function toggleResult(requestId: string) {
    if (expandedId === requestId) { setExpandedId(null); setResultData(null); return; }
    setExpandedId(requestId); setLoadingResult(true);
    const { data } = await supabase.from("crawl_results").select("data, type")
      .eq("request_id", requestId).order("id", { ascending: true }).limit(200);
    setResultData((data ?? []) as Record<string, unknown>[]);
    setLoadingResult(false);
  }

  const activeWorkers = workers.filter((w) => w.status === "idle" || w.status === "crawling");
  const orchPending = orchCounts.pending ?? 0;

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">작업 큐</h2>
        {!isOrch && (
          <button onClick={() => setShowNewTask(!showNewTask)}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
            + 작업 등록
          </button>
        )}
      </div>

      {/* 카테고리 탭 */}
      <div className="flex gap-1 mb-3 bg-gray-100 rounded-lg p-0.5 w-fit">
        {CRAWL_CATEGORIES.map((cat) => (
          <button key={cat.key} onClick={() => changeCategory(cat.key as Category)}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              category === cat.key ? "bg-white text-gray-900 font-medium shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}>
            {cat.label}
          </button>
        ))}
        <button onClick={() => changeCategory("orch")}
          className={`px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1 ${
            isOrch ? "bg-white text-gray-900 font-medium shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}>
          오케스트레이터
          {orchPending > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-orange-100 text-orange-600 font-medium">
              {orchPending}
            </span>
          )}
        </button>
      </div>

      {/* 상태 탭 */}
      <div className="flex gap-0.5 mb-4 border-b border-gray-200">
        {(isOrch ? ORCH_STATUS_TABS : CRAWL_STATUS_TABS).map((tab) => {
          const counts = isOrch ? orchCounts : statusCounts;
          const count = counts[tab.key];
          const isActive = isOrch ? orchFilter === tab.key : filter === tab.key;
          return (
            <button key={tab.key}
              onClick={() => isOrch ? (setOrchFilter(tab.key), setOrchPage(0)) : changeFilter(tab.key)}
              className={`px-3 py-2 text-xs flex items-center gap-1.5 border-b-2 transition-colors -mb-px ${
                isActive ? "border-blue-600 text-blue-600 font-medium" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}>
              {tab.label}
              {count !== undefined && count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                  tab.key === "failed" ? (isActive ? "bg-red-100 text-red-600" : "bg-red-50 text-red-400")
                  : tab.key === "running" ? (isActive ? "bg-green-100 text-green-700" : "bg-green-50 text-green-600")
                  : (isActive ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500")
                }`}>
                  {count.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}
        {(isOrch ? !orchIsStatic : !isStatic) && (
          <span className="ml-auto self-center pr-1 text-[10px] text-gray-300 flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            실시간
          </span>
        )}
      </div>

      {/* ── 오케스트레이터 뷰 ── */}
      {isOrch && (
        <>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {orchTasks.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">작업이 없습니다.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm table-fixed">
                  <thead className="bg-gray-50 text-gray-500 text-xs border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium w-[130px]">앱</th>
                      <th className="text-left px-4 py-2.5 font-medium w-[110px]">트리거</th>
                      <th className="text-left px-4 py-2.5 font-medium w-[70px]">상태</th>
                      <th className="text-left px-4 py-2.5 font-medium w-[80px]">커밋</th>
                      <th className="text-left px-4 py-2.5 font-medium">환경 결과</th>
                      <th className="text-right px-4 py-2.5 font-medium w-[100px] whitespace-nowrap">생성</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {orchTasks.map((t) => {
                      const p = t.payload;
                      const commit = String(p.commit_hash ?? "").slice(0, 7);
                      const deployUrl = String(p.deploy_url ?? "");
                      const trigger = String(p.trigger ?? "");
                      const result = (t as any).result as Record<string, unknown> | undefined;
                      const envResults = (result?.environments ?? []) as Record<string, unknown>[];
                      const isDone = t.status === "done" || t.status === "completed";
                      return (
                        <>
                          <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-2.5 font-medium text-gray-800 text-sm truncate">{String(p.app ?? "—")}</td>
                            <td className="px-4 py-2.5"><OrchTriggerBadge trigger={trigger} /></td>
                            <td className="px-4 py-2.5"><TaskStatusBadge status={t.status} /></td>
                            <td className="px-4 py-2.5 text-xs font-mono text-gray-400">
                              {commit ? (deployUrl
                                ? <a href={deployUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{commit}</a>
                                : commit) : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-xs">
                              {isDone && result
                                ? <span className={Number(result.passed) === Number(result.total) ? "text-green-600 font-medium" : "text-red-500 font-medium"}>
                                    {str(result.passed)}/{str(result.total)} 환경 통과
                                  </span>
                                : t.status === "failed" && result?.error
                                ? <span className="text-red-400">{str(result.error).slice(0, 50)}</span>
                                : t.status === "running"
                                ? <span className="text-blue-400 animate-pulse">테스트 중...</span>
                                : <span className="text-gray-300">대기중</span>}
                            </td>
                            <td className="px-4 py-2.5 text-right text-xs text-gray-400 whitespace-nowrap">
                              {new Date(t.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </td>
                          </tr>
                          {/* 환경별 상세 결과 */}
                          {envResults.length > 0 && (
                            <tr key={`${t.id}-envs`}>
                              <td colSpan={6} className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                                <div className="space-y-1">
                                  {envResults.map((e, i) => {
                                    const ok = Boolean(e.passed);
                                    const envLogs = (e.logs ?? []) as string[];
                                    return (
                                      <details key={i} className="group">
                                        <summary className="flex items-center gap-3 text-xs cursor-pointer list-none hover:bg-gray-100 rounded px-1 py-0.5">
                                          <span className={ok ? "text-green-500" : "text-red-400"}>{ok ? "✅" : "❌"}</span>
                                          {/* 테스트 환경 */}
                                          <span className="font-medium text-gray-700 w-[160px] shrink-0">{str(e.label ?? e.env_id)}</span>
                                          {/* 실제 실행 OS */}
                                          <EnvOsBadge os={str(e.worker_os)} arch={str(e.worker_arch)} />
                                          {/* 호스트명 */}
                                          <span className="text-gray-400 font-mono text-[10px]">{str(e.worker_hostname)}</span>
                                          {/* 케이스 결과 */}
                                          <span className={`ml-auto ${ok ? "text-green-600" : "text-red-400"}`}>
                                            {str(e.cases_passed)}/{str(e.cases_total)} 케이스
                                          </span>
                                          {/* 소요시간 */}
                                          <span className="text-gray-300 tabular-nums">{str(e.duration_ms)}ms</span>
                                          {/* 에러 */}
                                          {!ok && Boolean(e.errors) && (
                                            <span className="text-red-300 truncate max-w-[180px]" title={str((e.errors as string[])[0])}>
                                              {str((e.errors as string[])[0]).slice(0, 35)}
                                            </span>
                                          )}
                                          {envLogs.length > 0 && <span className="text-gray-300 text-[10px]">▶ 로그</span>}
                                        </summary>
                                        {envLogs.length > 0 && (
                                          <div className="mt-1 ml-4 bg-gray-900 rounded px-3 py-2 font-mono text-[10px] text-gray-300 space-y-0.5 max-h-40 overflow-y-auto">
                                            {envLogs.map((line, li) => (
                                              <div key={li} className={line.includes("❌") ? "text-red-400" : line.includes("✅") ? "text-green-400" : "text-gray-400"}>
                                                {line}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </details>
                                    );
                                  })}
                                  {/* 워커 공통 환경 (result.worker) */}
                                  {result?.worker != null && (
                                    <div className="mt-1 pt-1 border-t border-gray-200 text-[10px] text-gray-400 flex gap-3">
                                      <span>실행 워커:</span>
                                      <span className="font-mono">{str((result.worker as any).hostname)}</span>
                                      <EnvOsBadge os={str((result.worker as any).os)} arch={str((result.worker as any).arch)} small />
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {orchIsStatic && orchTotal > 0 && (
            <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
              <span className="text-xs">총 <strong className="text-gray-700">{orchTotal.toLocaleString()}</strong>개</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setOrchPage((p) => Math.max(0, p - 1))} disabled={orchPage === 0}
                  className="px-3 py-1 text-xs rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">← 이전</button>
                <span className="text-xs tabular-nums">{orchPage + 1} / {orchTotalPages}</span>
                <button onClick={() => setOrchPage((p) => Math.min(orchTotalPages - 1, p + 1))} disabled={orchPage >= orchTotalPages - 1}
                  className="px-3 py-1 text-xs rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">다음 →</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── 크롤 요청 뷰 ── */}
      {!isOrch && (
        <>
          {showNewTask && (
            <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
              <h3 className="text-sm font-semibold mb-3">크롤링 작업 등록</h3>
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">타입</label>
                  <select value={newType} onChange={(e) => setNewType(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {Object.entries(CRAWL_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">할당 워커 (미선택 시 자동)</label>
                  <select value={newWorker} onChange={(e) => setNewWorker(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">자동 (미할당)</option>
                    {activeWorkers.map((w) => (
                      <option key={w.id} value={w.id}>{w.name || w.id} ({w.status})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-xs text-gray-500 mb-1">키워드 (한 줄에 하나씩)</label>
                <textarea value={newKeywords} onChange={(e) => setNewKeywords(e.target.value)} rows={5}
                  placeholder={"당뇨에 좋은 음식\n탈모 샴푸 추천\n다이어트 보조제"}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
              </div>
              <div className="flex gap-2">
                <button onClick={createTasks}
                  className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors">
                  {newKeywords.split("\n").filter((k) => k.trim()).length}개 등록
                </button>
                <button onClick={() => setShowNewTask(false)}
                  className="px-4 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50 transition-colors">
                  취소
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {requests.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">작업이 없습니다.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm table-fixed">
                  <thead className="bg-gray-50 text-gray-500 text-xs border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium w-[220px]">키워드</th>
                      <th className="text-left px-4 py-2.5 font-medium w-[120px]">타입</th>
                      <th className="text-left px-4 py-2.5 font-medium w-[100px]">출처</th>
                      <th className="text-left px-4 py-2.5 font-medium w-[80px]">상태</th>
                      <th className="text-left px-4 py-2.5 font-medium w-[110px]">워커</th>
                      <th className="text-left px-4 py-2.5 font-medium">에러</th>
                      <th className="text-right px-4 py-2.5 font-medium w-[110px] whitespace-nowrap">생성</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {requests.map((r) => (
                      <>
                        <tr key={r.id}
                          className={`hover:bg-gray-50 transition-colors ${r.status === "completed" ? "cursor-pointer" : ""} ${expandedId === r.id ? "bg-blue-50" : ""}`}
                          onClick={() => r.status === "completed" && toggleResult(r.id)}>
                          <td className="px-4 py-2.5 overflow-hidden">
                            <div className="flex items-center gap-1.5 overflow-hidden">
                              {r.status === "completed" && (
                                <span className="text-blue-400 shrink-0 text-[10px]">{expandedId === r.id ? "▼" : "▶"}</span>
                              )}
                              <KeywordCell keyword={r.keyword} type={r.type} />
                            </div>
                            {r.scope && <span className="text-[11px] text-gray-400 ml-4">({r.scope})</span>}
                          </td>
                          <td className="px-4 py-2.5 text-gray-500 text-xs overflow-hidden">
                            <span className="truncate block">{CRAWL_TYPE_LABELS[r.type] || r.type}</span>
                          </td>
                          <td className="px-4 py-2.5 overflow-hidden"><SourceBadge options={r.options} /></td>
                          <td className="px-4 py-2.5"><TaskStatusBadge status={r.status} /></td>
                          <td className="px-4 py-2.5 text-xs text-gray-400 overflow-hidden">
                            <span className="truncate block" title={r.assigned_worker || ""}>
                              {r.assigned_worker ? r.assigned_worker.slice(0, 14) + (r.assigned_worker.length > 14 ? "…" : "") : "—"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-red-400 overflow-hidden">
                            <span className="truncate block" title={r.error_message || ""}>
                              {r.error_message ? r.error_message.slice(0, 30) + (r.error_message.length > 30 ? "…" : "") : "—"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs text-gray-400 whitespace-nowrap">
                            {new Date(r.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </td>
                        </tr>
                        {expandedId === r.id && (
                          <tr key={`${r.id}-result`}>
                            <td colSpan={7} className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                              {loadingResult ? (
                                <div className="text-sm text-gray-400">결과 로딩 중...</div>
                              ) : !resultData?.length ? (
                                r.callback_url ? (
                                  <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <span className="text-blue-400">↗</span>
                                    <span>결과가 외부로 전송됨</span>
                                    <span className="text-gray-300">|</span>
                                    <span className="font-mono text-gray-400 truncate max-w-sm" title={r.callback_url}>
                                      {new URL(r.callback_url).hostname}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="text-sm text-gray-400">결과 없음</div>
                                )
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
              </div>
            )}
          </div>

          {isStatic && totalCount > 0 && (
            <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
              <span className="text-xs">총 <strong className="text-gray-700">{totalCount.toLocaleString()}</strong>개</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                  className="px-3 py-1 text-xs rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">← 이전</button>
                <span className="text-xs tabular-nums">{page + 1} / {totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                  className="px-3 py-1 text-xs rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">다음 →</button>
              </div>
            </div>
          )}
          {!isStatic && requests.length >= 200 && (
            <p className="mt-2 text-center text-xs text-gray-400">최근 200개 표시 — 완료/실패 탭에서 전체 조회</p>
          )}
        </>
      )}
    </div>
  );
}

function str(v: unknown): string { return String(v ?? "") }

// ── 서브 컴포넌트 ─────────────────────────────────────

function OrchTriggerBadge({ trigger }: { trigger: string }) {
  const map: Record<string, { label: string; color: string }> = {
    "post-push":     { label: "git push",    color: "bg-purple-50 text-purple-700" },
    "vercel-deploy": { label: "Vercel 배포", color: "bg-blue-50 text-blue-700" },
    "manual":        { label: "수동",         color: "bg-gray-50 text-gray-600" },
  };
  const cfg = map[trigger] ?? { label: trigger || "—", color: "bg-gray-50 text-gray-500" };
  return <span className={`px-1.5 py-0.5 rounded text-xs inline-block ${cfg.color}`}>{cfg.label}</span>;
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
              <span className={`font-bold ${rank > 0 ? "text-green-600" : "text-gray-400"}`}>{rank > 0 ? `${rank}위` : "미발견"}</span>
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
                {(d.headings as string[] || []).length > 0 && <div><strong>소제목:</strong> {(d.headings as string[]).join(" / ")}</div>}
                {d.body ? <div className="mt-1 text-gray-500 max-h-24 overflow-y-auto whitespace-pre-wrap">{String(d.body).slice(0, 500)}...</div> : null}
              </div>
            </details>
          );
        })}
      </div>
    );
  }
  if (type === "oclick_sync") {
    return (
      <div className="space-y-1">
        <div className="text-xs font-semibold text-gray-600 mb-2">Oclick 재고 ({data.length}개)</div>
        {data.map((item, i) => {
          const d = (item.data || item) as Record<string, unknown>;
          return (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="font-mono text-gray-500 w-20 shrink-0">{String(d.sku || "-")}</span>
              <span className="font-medium truncate max-w-xs">{String(d.name || "-")}</span>
              <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] ${d.stock_status === "판매" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                {String(d.stock_status || "-")}
              </span>
              <span className="shrink-0 text-gray-400">재고 {String(d.stock_qty ?? "-")}</span>
              {d.price != null && <span className="shrink-0 text-gray-400">{Number(d.price).toLocaleString()}원</span>}
            </div>
          );
        })}
      </div>
    );
  }
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
    const preview = accounts[0] ? `@${accounts[0]}` : "";
    const rest = accounts.length - 1;
    return (
      <div className="overflow-hidden" title={accounts.map((a) => `@${a}`).join("\n")}>
        <span className="text-sm font-medium text-gray-800 truncate block">{preview}</span>
        {rest > 0 && <span className="text-[11px] text-gray-400">+{rest}개 계정</span>}
      </div>
    );
  }
  return <span className="truncate text-sm font-medium text-gray-800 block" title={keyword}>{keyword}</span>;
}

const SOURCE_MAP: Record<string, { label: string; color: string }> = {
  "insta-desk":   { label: "Insta Desk", color: "bg-pink-50 text-pink-700" },
  "desk-web":     { label: "Desk Web",   color: "bg-indigo-50 text-indigo-700" },
  "health-check": { label: "헬스체크",   color: "bg-yellow-50 text-yellow-700" },
  "station":      { label: "Station",    color: "bg-blue-50 text-blue-700" },
  "api":          { label: "API",        color: "bg-green-50 text-green-700" },
};

function EnvOsBadge({ os, arch, small }: { os: string; arch: string; small?: boolean }) {
  const osMap: Record<string, { label: string; color: string }> = {
    Darwin:  { label: "Mac",   color: "bg-gray-100 text-gray-700" },
    Windows: { label: "Win",   color: "bg-blue-50 text-blue-700" },
    Linux:   { label: "Linux", color: "bg-yellow-50 text-yellow-700" },
  };
  const archMap: Record<string, string> = {
    arm64: "ARM",
    aarch64: "ARM",
    x86_64: "x64",
    AMD64: "x64",
  };
  const osCfg = osMap[os] ?? { label: os || "?", color: "bg-gray-50 text-gray-500" };
  const archLabel = archMap[arch] ?? arch;
  const sz = small ? "text-[9px] px-1 py-0" : "text-[10px] px-1.5 py-0.5";
  return (
    <span className={`inline-flex items-center gap-0.5 rounded font-medium ${sz} ${osCfg.color}`}>
      {osCfg.label}{archLabel ? <span className="opacity-60">/{archLabel}</span> : null}
    </span>
  );
}

function SourceBadge({ options }: { options: Record<string, unknown> | null }) {
  if (!options) return <span className="text-xs text-gray-300">—</span>;
  let source = "";
  let purpose = "";
  if (options._health_check) { source = "health-check"; purpose = "자동"; }
  else if (options._test) { source = "station"; purpose = "수동"; }
  else if (options.source) { source = String(options.source); }
  if (!source) return <span className="text-xs text-gray-300">—</span>;
  const config = SOURCE_MAP[source] || { label: source, color: "bg-gray-50 text-gray-600" };
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs whitespace-nowrap inline-flex items-center gap-1 ${config.color}`}>
      {config.label}
      {purpose && <span className="opacity-60 text-[10px]">·{purpose}</span>}
    </span>
  );
}
