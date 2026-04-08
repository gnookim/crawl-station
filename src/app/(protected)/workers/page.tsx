"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { Worker } from "@/types";
import { WORKER_ONLINE_THRESHOLD_MS } from "@/types";
import { WorkerStatusBadge } from "@/components/ui/status-badge";

/* ── 워커별 테스트 상태 ── */
type TestResult = Record<string, unknown> | null;
type WorkerTestState = {
  naver: { loading: boolean; result: TestResult };
  instagram: { loading: boolean; result: TestResult };
};
type OclickTestState = { loading: boolean; result: TestResult };

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [latestVersion, setLatestVersion] = useState<string>("");
  const [showManualRegister, setShowManualRegister] = useState(false);
  const [newWorkerName, setNewWorkerName] = useState("");
  const [newWorkerId, setNewWorkerId] = useState("");
  const [commandLoading, setCommandLoading] = useState<string | null>(null);
  const [testStates, setTestStates] = useState<Record<string, WorkerTestState>>({});
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [oclickTest, setOclickTest] = useState<OclickTestState>({ loading: false, result: null });
  const [refreshInterval, setRefreshInterval] = useState(10);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const loadData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsRefreshing(true);
    const [workersRes, releaseRes] = await Promise.all([
      supabase.from("workers").select("*").order("registered_at", { ascending: false }),
      supabase.from("worker_releases").select("version").eq("is_latest", true).limit(1),
    ]);

    const now = Date.now();
    const enriched = (workersRes.data || []).map((w) => ({
      ...w,
      is_active: w.last_seen
        ? now - new Date(w.last_seen).getTime() < WORKER_ONLINE_THRESHOLD_MS
        : false,
    })) as Worker[];

    setWorkers(enriched);
    if (releaseRes.data?.[0]) setLatestVersion(releaseRes.data[0].version);
    setLastUpdated(new Date());
    if (showSpinner) setTimeout(() => setIsRefreshing(false), 300);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (refreshInterval > 0) {
      intervalRef.current = setInterval(() => loadData(), refreshInterval * 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [refreshInterval, loadData]);

  /* ── 워커 관리 ── */
  async function registerManually() {
    if (!newWorkerName.trim()) return;
    const id = newWorkerId.trim() || `worker-${Math.random().toString(36).substring(2, 10)}`;
    await supabase.from("workers").insert({ id, name: newWorkerName.trim(), status: "offline", registered_by: "manual" });
    setNewWorkerName(""); setNewWorkerId(""); setShowManualRegister(false);
    loadData(true);
  }

  async function deleteWorker(id: string) {
    if (!confirm(`워커 "${id}"를 삭제하시겠습니까?`)) return;
    await supabase.from("workers").delete().eq("id", id);
    loadData(true);
  }

  async function cleanupOfflineWorkers() {
    const offlineWorkers = workers.filter((w) => !w.is_active);
    if (offlineWorkers.length === 0) { alert("삭제할 오프라인 워커가 없습니다."); return; }
    if (!confirm(`오프라인 워커 ${offlineWorkers.length}대를 모두 삭제하시겠습니까?`)) return;
    await supabase.from("workers").delete().in("id", offlineWorkers.map((w) => w.id));
    loadData(true);
  }

  async function sendCommand(command: "stop" | "restart" | "update", workerIds?: string[]) {
    const labels = { stop: "정지", restart: "재시작", update: "업데이트" };
    const target = workerIds ? `워커 ${workerIds.length}대` : "모든 활성 워커";
    if (!confirm(`${target}에 "${labels[command]}" 명령을 보내시겠습니까?`)) return;
    setCommandLoading(workerIds?.[0] || "all");
    try {
      const res = await fetch("/api/workers/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worker_ids: workerIds || [], command }),
      });
      const data = await res.json();
      if (!res.ok) alert(`명령 실패: ${data.error}`);
      else alert(data.message);
    } finally {
      setCommandLoading(null);
      loadData(true);
    }
  }

  /* ── 테스트 ── */
  function initWorkerTest(workerId: string): WorkerTestState {
    return { naver: { loading: false, result: null }, instagram: { loading: false, result: null } };
  }

  async function runTest(workerId: string, category: "naver" | "instagram") {
    setTestStates((prev) => ({
      ...prev,
      [workerId]: {
        ...(prev[workerId] || initWorkerTest(workerId)),
        [category]: { loading: true, result: null },
      },
    }));
    setExpandedResults((prev) => new Set(prev).add(workerId));
    try {
      const res = await fetch("/api/test/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worker_id: workerId, category }),
      });
      const data = await res.json();
      setTestStates((prev) => ({
        ...prev,
        [workerId]: {
          ...(prev[workerId] || initWorkerTest(workerId)),
          [category]: { loading: false, result: data },
        },
      }));
    } catch (e) {
      setTestStates((prev) => ({
        ...prev,
        [workerId]: {
          ...(prev[workerId] || initWorkerTest(workerId)),
          [category]: { loading: false, result: { ok: false, error: String(e) } },
        },
      }));
    }
    loadData(true);
  }

  async function runTestAll(category: "naver" | "instagram") {
    const targets = workers.filter((w) => w.is_active);
    if (targets.length === 0) { alert("활성 워커가 없습니다."); return; }
    if (!confirm(`활성 워커 ${targets.length}대 ${category === "naver" ? "네이버" : "인스타그램"} 테스트 실행?`)) return;

    // 모든 워커 loading 상태로
    setTestStates((prev) => {
      const next = { ...prev };
      targets.forEach((w) => {
        next[w.id] = { ...(next[w.id] || initWorkerTest(w.id)), [category]: { loading: true, result: null } };
      });
      return next;
    });
    setExpandedResults((prev) => { const s = new Set(prev); targets.forEach((w) => s.add(w.id)); return s; });

    await Promise.all(targets.map((w) => runTest(w.id, category)));
  }

  async function runOclickTest() {
    setOclickTest({ loading: true, result: null });
    try {
      const res = await fetch("/api/test/oclick", { method: "POST" });
      const data = await res.json();
      setOclickTest({ loading: false, result: data });
    } catch (e) {
      setOclickTest({ loading: false, result: { ok: false, error: String(e) } });
    }
  }

  const outdatedCount = workers.filter((w) => latestVersion && w.version !== latestVersion).length;
  const activeWorkers = workers.filter((w) => w.is_active);
  const offlineWorkers = workers.filter((w) => !w.is_active);

  return (
    <div className="p-4 sm:p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">워커 관리</h2>
          {latestVersion && (
            <p className="text-xs text-gray-400 mt-0.5">
              최신 버전: v{latestVersion}
              {outdatedCount > 0 && <span className="ml-2 text-yellow-600">({outdatedCount}대 업데이트 필요)</span>}
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {activeWorkers.length > 0 && (
            <div className="flex gap-1">
              <button onClick={() => runTestAll("naver")} className="px-2.5 py-1.5 text-xs bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50">
                전체 N테스트
              </button>
              <button onClick={() => runTestAll("instagram")} className="px-2.5 py-1.5 text-xs bg-pink-500 text-white rounded-md hover:bg-pink-600 disabled:opacity-50">
                전체 I테스트
              </button>
              <button onClick={runOclickTest} disabled={oclickTest.loading} className="px-2.5 py-1.5 text-xs bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50">
                {oclickTest.loading ? "O테스트..." : "O테스트"}
              </button>
              <button onClick={() => sendCommand("update")} disabled={commandLoading !== null} className="px-2.5 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                전체 업데이트
              </button>
              <button onClick={() => sendCommand("restart")} disabled={commandLoading !== null} className="px-2.5 py-1.5 text-xs bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:opacity-50">
                전체 재시작
              </button>
              <button onClick={() => sendCommand("stop")} disabled={commandLoading !== null} className="px-2.5 py-1.5 text-xs bg-red-500 text-white rounded-md hover:bg-red-600 disabled:opacity-50">
                전체 정지
              </button>
            </div>
          )}
          {offlineWorkers.length > 0 && (
            <button onClick={cleanupOfflineWorkers} className="px-2.5 py-1.5 text-xs border border-gray-300 text-gray-500 rounded-md hover:bg-gray-50">
              오프라인 정리 ({offlineWorkers.length})
            </button>
          )}
          <button onClick={() => setShowManualRegister(!showManualRegister)} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">
            + 수동 등록
          </button>
        </div>
      </div>

      {/* 새로고침 상태바 */}
      <div className="flex items-center justify-between mb-4 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2">
        <div className="flex items-center gap-3">
          <button onClick={() => loadData(true)} disabled={isRefreshing} className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-blue-600 disabled:opacity-50">
            <svg className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            새로고침
          </button>
          {lastUpdated && <span className="text-xs text-gray-400">마지막: {lastUpdated.toLocaleTimeString("ko-KR")}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">자동 갱신:</span>
          {[5, 10, 30, 0].map((sec) => (
            <button key={sec} onClick={() => setRefreshInterval(sec)}
              className={`px-2 py-0.5 text-xs rounded ${refreshInterval === sec ? "bg-blue-600 text-white" : "bg-white text-gray-500 border border-gray-300 hover:bg-gray-100"}`}>
              {sec === 0 ? "끄기" : `${sec}초`}
            </button>
          ))}
        </div>
      </div>

      {/* 수동 등록 폼 */}
      {showManualRegister && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-semibold mb-3">워커 수동 등록</h3>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">워커 이름 *</label>
              <input type="text" value={newWorkerName} onChange={(e) => setNewWorkerName(e.target.value)} placeholder="마케팅팀 PC"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">워커 ID (미입력 시 자동)</label>
              <input type="text" value={newWorkerId} onChange={(e) => setNewWorkerId(e.target.value)} placeholder="worker-custom-01"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button onClick={registerManually} className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700">등록</button>
            <button onClick={() => setShowManualRegister(false)} className="px-4 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50">취소</button>
          </div>
        </div>
      )}

      {/* Oclick 테스트 결과 */}
      {(oclickTest.loading || oclickTest.result) && (
        <div className={`mb-4 border rounded-lg p-3 text-sm ${
          oclickTest.loading ? "bg-orange-50 border-orange-200" :
          oclickTest.result?.ok ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-orange-700 text-xs">Oclick 재고 테스트</span>
            {!oclickTest.loading && oclickTest.result && (
              <span className={`text-xs font-bold ${oclickTest.result.ok ? "text-green-700" : "text-red-700"}`}>
                {oclickTest.result.ok ? "✓ 통과" : "✕ 실패"}
              </span>
            )}
            {!oclickTest.loading && oclickTest.result && (
              <span className="text-xs text-gray-400">{String(oclickTest.result.elapsed_ms || 0)}ms</span>
            )}
            {!oclickTest.loading && (
              <button onClick={() => setOclickTest({ loading: false, result: null })} className="ml-auto text-xs text-gray-400 hover:text-gray-600">✕</button>
            )}
          </div>
          {oclickTest.loading ? (
            <p className="text-xs text-orange-600 animate-pulse">crawler-app에 작업 요청 중... (최대 3분)</p>
          ) : oclickTest.result?.ok ? (
            <>
              <p className="text-xs text-green-700 mb-1">
                상품 수집 완료 — {String(oclickTest.result.item_count)}개
              </p>
              {Array.isArray(oclickTest.result.sample) && oclickTest.result.sample.length > 0 && (
                <div className="space-y-0.5">
                  {(oclickTest.result.sample as Record<string, unknown>[]).map((item, i) => (
                    <div key={i} className="text-xs text-gray-600">
                      [{String(item.sku)}] {String(item.name)} · {String(item.stock_status)} · 재고 {String(item.stock_qty)} · {item.price ? Number(item.price).toLocaleString() + "원" : "-"}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-red-600">{String(oclickTest.result?.error || "알 수 없는 오류")}</p>
          )}
        </div>
      )}

      {/* 상태 범례 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 px-1 text-xs text-gray-500">
        <span className="font-medium text-gray-600">상태:</span>
        <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />대기</span>
        <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" />작업 중</span>
        <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />차단</span>
        <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-gray-400" />오프라인</span>
        <span className="text-gray-300">|</span>
        <span className="font-medium text-gray-600">테스트:</span>
        <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs">N</span>
        <span>네이버 blog_serp</span>
        <span className="px-1.5 py-0.5 bg-pink-100 text-pink-700 rounded text-xs">I</span>
        <span>인스타 프로필</span>
        <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-xs">O</span>
        <span>Oclick 재고</span>
      </div>

      {/* 워커 목록 */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {workers.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">등록된 워커가 없습니다.</div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm table-fixed">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="text-left px-4 py-2 font-medium w-[180px]">워커</th>
                <th className="text-left px-4 py-2 font-medium w-[108px]">OS</th>
                <th className="text-left px-4 py-2 font-medium w-[80px]">버전</th>
                <th className="text-left px-4 py-2 font-medium w-[140px]">상태</th>
                <th className="text-left px-4 py-2 font-medium w-[80px]">마지막</th>
                <th className="text-left px-4 py-2 font-medium">현재 작업</th>
                <th className="text-right px-4 py-2 font-medium w-[84px]">처리/에러</th>
                <th className="text-center px-4 py-2 font-medium w-[80px]">테스트</th>
                <th className="text-right px-4 py-2 font-medium w-[112px]">제어</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => {
                const displayStatus = w.is_active ? w.status : "offline";
                const isActive = w.is_active;
                const ts = testStates[w.id];
                const hasResults = ts && (ts.naver.result || ts.instagram.result);
                const isExpanded = expandedResults.has(w.id);

                return (
                  <>
                    <tr key={w.id} className="border-t border-gray-100 hover:bg-gray-50">
                      {/* 워커 이름 */}
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{w.name || w.id}</span>
                          {w.verified_at ? (
                            <span title={`테스트 통과: ${new Date(w.verified_at).toLocaleString("ko")}`}
                              className="px-1 py-0.5 bg-green-100 text-green-700 rounded text-xs cursor-help">검증됨</span>
                          ) : (
                            <span className="px-1 py-0.5 bg-gray-100 text-gray-400 rounded text-xs">미검증</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">{w.id}</div>
                      </td>
                      <td className="px-4 py-2 text-gray-500 text-xs overflow-hidden"><span className="truncate block">{w.os || "-"}</span></td>
                      <td className="px-4 py-2"><VersionBadge version={w.version} latest={latestVersion} /></td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1 flex-nowrap">
                          <WorkerStatusBadge status={displayStatus} />
                          <WorkerTypeBadge allowedTypes={w.allowed_types} />
                          <BlockBadge worker={w} />
                          {w.command && (
                            <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded text-xs whitespace-nowrap">{w.command}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-400 whitespace-nowrap"><LastSeenLabel lastSeen={w.last_seen} /></td>
                      <td className="px-4 py-2 text-xs text-gray-500 overflow-hidden">
                        {w.current_keyword ? (
                          <span className="block truncate" title={`${w.current_keyword} (${w.current_type})`}>
                            {w.current_keyword}
                            <span className="text-gray-400 ml-1">({w.current_type})</span>
                          </span>
                        ) : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        <span className="text-green-600">{w.total_processed}</span>
                        {" / "}
                        <span className="text-red-500">{w.error_count}</span>
                      </td>

                      {/* 테스트 버튼 */}
                      <td className="px-4 py-2 text-center">
                        {isActive ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => runTest(w.id, "naver")}
                              disabled={ts?.naver.loading}
                              title="네이버 blog_serp 테스트"
                              className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100 disabled:opacity-50 font-medium"
                            >
                              {ts?.naver.loading ? "..." : "N"}
                            </button>
                            <button
                              onClick={() => runTest(w.id, "instagram")}
                              disabled={ts?.instagram.loading}
                              title="인스타그램 프로필 테스트"
                              className="px-2 py-1 text-xs bg-pink-50 text-pink-700 rounded hover:bg-pink-100 disabled:opacity-50 font-medium"
                            >
                              {ts?.instagram.loading ? "..." : "I"}
                            </button>
                            {hasResults && (
                              <button
                                onClick={() => setExpandedResults((prev) => {
                                  const s = new Set(prev);
                                  s.has(w.id) ? s.delete(w.id) : s.add(w.id);
                                  return s;
                                })}
                                className="px-1.5 py-1 text-xs text-gray-400 hover:text-gray-600"
                              >
                                {isExpanded ? "▲" : "▼"}
                              </button>
                            )}
                          </div>
                        ) : <span className="text-gray-300 text-xs">-</span>}
                      </td>

                      {/* 제어 버튼 */}
                      <td className="px-4 py-2 text-right">
                        {isActive ? (
                          <div className="flex justify-end gap-1">
                            {latestVersion && (
                              <button onClick={() => sendCommand("update", [w.id])} disabled={commandLoading !== null}
                                title={w.version === latestVersion ? "최신 버전 — 강제 재설치" : `v${w.version} → v${latestVersion}`}
                                className={`px-1.5 py-0.5 text-xs rounded disabled:opacity-50 ${w.version !== latestVersion ? "bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium" : "bg-gray-50 text-gray-500 hover:bg-gray-100"}`}>
                                업데이트
                              </button>
                            )}
                            <button onClick={() => sendCommand("restart", [w.id])} disabled={commandLoading !== null}
                              className="px-1.5 py-0.5 text-xs bg-orange-50 text-orange-700 rounded hover:bg-orange-100 disabled:opacity-50">
                              재시작
                            </button>
                            <button onClick={() => sendCommand("stop", [w.id])} disabled={commandLoading !== null}
                              className="px-1.5 py-0.5 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100 disabled:opacity-50">
                              정지
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => deleteWorker(w.id)} className="text-xs text-red-500 hover:text-red-700">삭제</button>
                        )}
                      </td>
                    </tr>

                    {/* 테스트 결과 확장 행 */}
                    {isExpanded && hasResults && (
                      <tr key={`${w.id}-results`} className="bg-gray-50 border-t border-gray-100">
                        <td colSpan={9} className="px-4 py-3">
                          <div className="flex gap-4">
                            {/* 네이버 결과 */}
                            <TestResultPanel
                              category="naver"
                              label="네이버"
                              colorClass="green"
                              state={ts?.naver}
                            />
                            {/* 인스타 결과 */}
                            <TestResultPanel
                              category="instagram"
                              label="인스타그램"
                              colorClass="pink"
                              state={ts?.instagram}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

/* ── 테스트 결과 패널 ── */
function TestResultPanel({
  label, colorClass, state,
}: {
  category: string;
  label: string;
  colorClass: "green" | "pink";
  state?: { loading: boolean; result: TestResult };
}) {
  const colors = {
    green: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", badge: "bg-green-100 text-green-700" },
    pink:  { bg: "bg-pink-50",  border: "border-pink-200",  text: "text-pink-700",  badge: "bg-pink-100 text-pink-700"  },
  };
  const c = colors[colorClass];

  if (!state) return (
    <div className={`flex-1 border ${c.border} rounded-lg p-3 opacity-40`}>
      <div className={`text-xs font-medium ${c.text} mb-1`}>{label}</div>
      <div className="text-xs text-gray-400">테스트 안 함</div>
    </div>
  );

  if (state.loading) return (
    <div className={`flex-1 border ${c.border} rounded-lg p-3`}>
      <div className={`text-xs font-medium ${c.text} mb-1`}>{label}</div>
      <div className="text-xs text-gray-400 animate-pulse">테스트 중...</div>
    </div>
  );

  if (!state.result) return null;

  const r = state.result;
  const ok = !!r.ok;

  return (
    <div className={`flex-1 border rounded-lg p-3 ${ok ? c.bg + " " + c.border : "bg-red-50 border-red-200"}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-xs font-bold ${ok ? c.text : "text-red-700"}`}>
          {ok ? "✓ 통과" : "✕ 실패"} — {label}
        </span>
        <span className="text-xs text-gray-400">{String(r.elapsed_ms || 0)}ms</span>
      </div>
      {r.error ? (
        <p className="text-xs text-red-600">{String(r.error)}</p>
      ) : (
        <>
          <div className="text-xs text-gray-500 mb-1.5">
            키워드: &quot;{String(r.keyword || "")}&quot; | 결과: {String(r.result_count || 0)}개
          </div>
          {Array.isArray(r.results) && r.results.length > 0 && (
            <div className="space-y-0.5">
              {(r.results as Record<string, unknown>[]).slice(0, 3).map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  {item.rank !== undefined && (
                    <span className={`font-bold w-4 shrink-0 ${c.text}`}>{String(item.rank)}</span>
                  )}
                  {item.username != null && (
                    <span className="text-gray-600">@{String(item.username)}</span>
                  )}
                  {item.title != null && (
                    <span className="text-gray-600 truncate max-w-xs">{String(item.title)}</span>
                  )}
                  {item.follower_count !== undefined && (
                    <span className="text-gray-400">팔로워 {Number(item.follower_count).toLocaleString()}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── 차단 배지 ── */
function BlockBadge({ worker: w }: { worker: Worker }) {
  if (!w.block_status && w.status !== "blocked") return null;

  const platform = w.block_platform;
  const level = w.block_level;
  const until = w.blocked_until;

  const platformLabel = platform === "naver" ? "N" : platform === "instagram" ? "I" : "?";
  const levelColor =
    level === 3 ? "bg-red-500 text-white" :
    level === 2 ? "bg-orange-400 text-white" :
    "bg-yellow-300 text-yellow-900";

  const untilStr = until ? ` ~${new Date(until).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}` : "";

  return (
    <span
      title={`${platform || ""} 차단 Level ${level || "?"}${untilStr}`}
      className={`px-1.5 py-0.5 text-xs rounded font-medium cursor-help ${levelColor}`}
    >
      {platformLabel} 차단{level ? ` L${level}` : ""}
    </span>
  );
}

/* ── 타입 배지 ── */
function WorkerTypeBadge({ allowedTypes }: { allowedTypes: string[] | null | undefined }) {
  if (!allowedTypes || allowedTypes.length === 0) return null;
  const naverTypes = ["kin_analysis", "blog_crawl", "blog_serp", "rank_check", "deep_analysis", "area_analysis", "daily_rank"];
  const instaTypes = ["instagram_profile"];
  const isNaver = allowedTypes.every((t) => naverTypes.includes(t));
  const isInsta = allowedTypes.every((t) => instaTypes.includes(t));
  if (isNaver) return <span className="px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">네이버</span>;
  if (isInsta) return <span className="px-1.5 py-0.5 text-xs bg-pink-100 text-pink-700 rounded">인스타</span>;
  return <span className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-500 rounded">혼합</span>;
}

/* ── 마지막 응답 ── */
function LastSeenLabel({ lastSeen }: { lastSeen: string | null }) {
  if (!lastSeen) return <span className="text-gray-300">-</span>;
  const seconds = Math.floor((Date.now() - new Date(lastSeen).getTime()) / 1000);
  if (seconds < 10) return <span className="text-green-500">방금 전</span>;
  if (seconds < 60) return <span className="text-green-600">{seconds}초 전</span>;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return <span className="text-yellow-600">{minutes}분 전</span>;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return <span className="text-orange-600">{hours}시간 전</span>;
  return <span className="text-red-500">{Math.floor(hours / 24)}일 전</span>;
}

/* ── 버전 배지 ── */
function VersionBadge({ version, latest }: { version: string; latest: string }) {
  if (!version || version === "0.0.0") return <span className="text-xs text-gray-400">-</span>;
  const isLatest = version === latest;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono ${isLatest ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"}`}>
      v{version}
      {!isLatest && latest && <span className="text-yellow-500" title={`최신: v${latest}`}>↑</span>}
    </span>
  );
}
