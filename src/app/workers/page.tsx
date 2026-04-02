"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { Worker, WorkerRelease } from "@/types";
import { WorkerStatusBadge } from "@/components/ui/status-badge";

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [latestVersion, setLatestVersion] = useState<string>("");
  const [showManualRegister, setShowManualRegister] = useState(false);
  const [newWorkerName, setNewWorkerName] = useState("");
  const [newWorkerId, setNewWorkerId] = useState("");
  const [commandLoading, setCommandLoading] = useState<string | null>(null);
  const [testingWorker, setTestingWorker] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(10);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const loadData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsRefreshing(true);
    const [workersRes, releaseRes] = await Promise.all([
      supabase
        .from("workers")
        .select("*")
        .order("registered_at", { ascending: false }),
      supabase
        .from("worker_releases")
        .select("version")
        .eq("is_latest", true)
        .limit(1),
    ]);

    const now = Date.now();
    const enriched = (workersRes.data || []).map((w) => ({
      ...w,
      is_active: w.last_seen
        ? now - new Date(w.last_seen).getTime() < 30000
        : false,
    })) as Worker[];

    setWorkers(enriched);
    if (releaseRes.data?.[0]) {
      setLatestVersion(releaseRes.data[0].version);
    }
    setLastUpdated(new Date());
    if (showSpinner) setTimeout(() => setIsRefreshing(false), 300);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (refreshInterval > 0) {
      intervalRef.current = setInterval(
        () => loadData(),
        refreshInterval * 1000
      );
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refreshInterval, loadData]);

  async function registerManually() {
    if (!newWorkerName.trim()) return;
    const id =
      newWorkerId.trim() ||
      `worker-${Math.random().toString(36).substring(2, 10)}`;

    await supabase.from("workers").insert({
      id,
      name: newWorkerName.trim(),
      status: "offline",
      registered_by: "manual",
    });

    setNewWorkerName("");
    setNewWorkerId("");
    setShowManualRegister(false);
    loadData(true);
  }

  async function deleteWorker(id: string) {
    if (!confirm(`워커 "${id}"를 삭제하시겠습니까?`)) return;
    await supabase.from("workers").delete().eq("id", id);
    loadData(true);
  }

  async function cleanupOfflineWorkers() {
    const offlineWorkers = workers.filter((w) => !w.is_active);
    if (offlineWorkers.length === 0) {
      alert("삭제할 오프라인 워커가 없습니다.");
      return;
    }
    if (
      !confirm(
        `오프라인 워커 ${offlineWorkers.length}대를 모두 삭제하시겠습니까?`
      )
    )
      return;
    const ids = offlineWorkers.map((w) => w.id);
    await supabase.from("workers").delete().in("id", ids);
    loadData(true);
  }

  async function sendCommand(
    command: "stop" | "restart" | "update",
    workerIds?: string[]
  ) {
    const labels = { stop: "정지", restart: "재시작", update: "업데이트" };
    const target = workerIds
      ? `워커 ${workerIds.length}대`
      : "모든 활성 워커";

    if (!confirm(`${target}에 "${labels[command]}" 명령을 보내시겠습니까?`))
      return;

    setCommandLoading(workerIds?.[0] || "all");
    try {
      const res = await fetch("/api/workers/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worker_ids: workerIds || [],
          command,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`명령 실패: ${data.error}`);
      } else {
        alert(data.message);
      }
    } finally {
      setCommandLoading(null);
      loadData(true);
    }
  }

  async function runTest(workerId: string) {
    setTestingWorker(workerId);
    setTestResult(null);
    try {
      const res = await fetch("/api/test/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worker_id: workerId }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (e) {
      setTestResult({ ok: false, error: String(e) });
    }
    setTestingWorker(null);
  }

  const outdatedCount = workers.filter(
    (w) => latestVersion && w.version !== latestVersion
  ).length;

  const activeWorkers = workers.filter((w) => w.is_active);
  const offlineWorkers = workers.filter((w) => !w.is_active);

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">워커 관리</h2>
          {latestVersion && (
            <p className="text-xs text-gray-400 mt-0.5">
              최신 버전: v{latestVersion}
              {outdatedCount > 0 && (
                <span className="ml-2 text-yellow-600">
                  ({outdatedCount}대 업데이트 필요)
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {activeWorkers.length > 0 && (
            <div className="flex gap-1">
              <button
                onClick={() => sendCommand("update")}
                disabled={commandLoading !== null}
                className="px-2.5 py-1.5 text-xs bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                전체 업데이트
              </button>
              <button
                onClick={() => sendCommand("restart")}
                disabled={commandLoading !== null}
                className="px-2.5 py-1.5 text-xs bg-orange-500 text-white rounded-md hover:bg-orange-600 transition-colors disabled:opacity-50"
              >
                전체 재시작
              </button>
              <button
                onClick={() => sendCommand("stop")}
                disabled={commandLoading !== null}
                className="px-2.5 py-1.5 text-xs bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                전체 정지
              </button>
            </div>
          )}
          {offlineWorkers.length > 0 && (
            <button
              onClick={cleanupOfflineWorkers}
              className="px-2.5 py-1.5 text-xs border border-gray-300 text-gray-500 rounded-md hover:bg-gray-50 transition-colors"
              title={`오프라인 워커 ${offlineWorkers.length}대 삭제`}
            >
              오프라인 정리 ({offlineWorkers.length})
            </button>
          )}
          <button
            onClick={() => setShowManualRegister(!showManualRegister)}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            + 수동 등록
          </button>
        </div>
      </div>

      {/* 업데이트 상태바 */}
      <div className="flex items-center justify-between mb-4 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => loadData(true)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-blue-600 transition-colors disabled:opacity-50"
          >
            <svg
              className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            새로고침
          </button>
          {lastUpdated && (
            <span className="text-xs text-gray-400">
              마지막 업데이트: {lastUpdated.toLocaleTimeString("ko-KR")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">자동 갱신:</span>
          {[5, 10, 30, 0].map((sec) => (
            <button
              key={sec}
              onClick={() => setRefreshInterval(sec)}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                refreshInterval === sec
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-500 border border-gray-300 hover:bg-gray-100"
              }`}
            >
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
              <label className="block text-xs text-gray-500 mb-1">
                워커 이름 *
              </label>
              <input
                type="text"
                value={newWorkerName}
                onChange={(e) => setNewWorkerName(e.target.value)}
                placeholder="마케팅팀 PC"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">
                워커 ID (미입력 시 자동 생성)
              </label>
              <input
                type="text"
                value={newWorkerId}
                onChange={(e) => setNewWorkerId(e.target.value)}
                placeholder="worker-custom-01"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={registerManually}
              className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              등록
            </button>
            <button
              onClick={() => setShowManualRegister(false)}
              className="px-4 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50 transition-colors"
            >
              취소
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            등록 후 해당 PC에서 WORKER_ID={newWorkerId || "(자동생성)"} 로
            worker.py를 실행하면 연결됩니다.
          </p>
        </div>
      )}

      {/* 상태 범례 + 버전 설명 */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mb-3 px-1 text-xs text-gray-500">
        <span className="font-medium text-gray-600">상태:</span>
        <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />대기 — 실행 중, 작업 대기</span>
        <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" />작업 중 — 크롤링 실행 중</span>
        <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />차단 — 봇 탐지 등</span>
        <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-gray-400" />오프라인 — 30초 이상 응답 없음</span>
        <span className="text-gray-300">|</span>
        <span className="font-medium text-gray-600">버전:</span>
        <span>워커 코드 버전 (인스톨러 버전과 별개)</span>
      </div>

      {/* 테스트 결과 */}
      {testResult && (
        <div className={`mb-4 rounded-lg border p-4 ${
          testResult.ok ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold ${testResult.ok ? "text-green-700" : "text-red-700"}`}>
                {testResult.ok ? "테스트 통과" : "테스트 실패"}
              </span>
              <span className="text-xs text-gray-500">
                {String(testResult.worker_id || "")} | {String(testResult.elapsed_ms || 0)}ms
              </span>
            </div>
            <button
              onClick={() => setTestResult(null)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              닫기
            </button>
          </div>
          {testResult.error ? (
            <p className="text-xs text-red-600 mb-2">{String(testResult.error)}</p>
          ) : null}
          {testResult.results ? (
            <div className="space-y-1">
              <div className="text-xs text-gray-500 mb-1">
                키워드: &quot;{String(testResult.keyword || "")}&quot; | 결과: {String(testResult.result_count || 0)}개
              </div>
              {(testResult.results as { rank: number; title: string; url: string }[]).map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-blue-600 w-6 text-right">{r.rank}</span>
                  <span className="truncate max-w-md">{r.title}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* 워커 목록 */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {workers.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            등록된 워커가 없습니다.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="text-left px-4 py-2 font-medium">워커</th>
                <th className="text-left px-4 py-2 font-medium">OS</th>
                <th className="text-left px-4 py-2 font-medium">버전</th>
                <th className="text-left px-4 py-2 font-medium">상태</th>
                <th className="text-left px-4 py-2 font-medium">
                  마지막 응답
                </th>
                <th className="text-left px-4 py-2 font-medium">현재 작업</th>
                <th className="text-right px-4 py-2 font-medium">처리/에러</th>
                <th className="text-right px-4 py-2 font-medium">제어</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {workers.map((w) => {
                const displayStatus = w.is_active ? w.status : "offline";
                const isActive = w.is_active;
                const hasPendingCommand = !!w.command;
                return (
                  <tr key={w.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{w.name || w.id}</span>
                        {w.verified_at ? (
                          <span title={`테스트 통과: ${new Date(w.verified_at).toLocaleString("ko")}`}
                            className="px-1 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium cursor-help">
                            검증됨
                          </span>
                        ) : (
                          <span className="px-1 py-0.5 bg-gray-100 text-gray-400 rounded text-xs">
                            미검증
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">{w.id}</div>
                    </td>
                    <td className="px-4 py-2 text-gray-500 text-xs">
                      {w.os || "-"}
                    </td>
                    <td className="px-4 py-2">
                      <VersionBadge
                        version={w.version}
                        latest={latestVersion}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1.5">
                        <WorkerStatusBadge status={displayStatus} />
                        {hasPendingCommand && (
                          <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded text-xs">
                            {w.command}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-400">
                      <LastSeenLabel lastSeen={w.last_seen} />
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">
                      {w.current_keyword ? (
                        <span>
                          {w.current_keyword}
                          {w.current_type && (
                            <span className="text-gray-400 ml-1">
                              ({w.current_type})
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      <span className="text-green-600">
                        {w.total_processed}
                      </span>
                      {" / "}
                      <span className="text-red-500">{w.error_count}</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {isActive ? (
                        <div className="flex justify-end gap-1">
                          {w.version !== latestVersion && latestVersion && (
                            <button
                              onClick={() =>
                                sendCommand("update", [w.id])
                              }
                              disabled={commandLoading !== null}
                              className="px-1.5 py-0.5 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100 transition-colors disabled:opacity-50"
                            >
                              업데이트
                            </button>
                          )}
                          <button
                            onClick={() => runTest(w.id)}
                            disabled={testingWorker !== null}
                            className="px-1.5 py-0.5 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors disabled:opacity-50"
                          >
                            {testingWorker === w.id ? "테스트 중..." : "테스트"}
                          </button>
                          <button
                            onClick={() =>
                              sendCommand("restart", [w.id])
                            }
                            disabled={commandLoading !== null}
                            className="px-1.5 py-0.5 text-xs bg-orange-50 text-orange-700 rounded hover:bg-orange-100 transition-colors disabled:opacity-50"
                          >
                            재시작
                          </button>
                          <button
                            onClick={() =>
                              sendCommand("stop", [w.id])
                            }
                            disabled={commandLoading !== null}
                            className="px-1.5 py-0.5 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100 transition-colors disabled:opacity-50"
                          >
                            정지
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => deleteWorker(w.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          삭제
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function LastSeenLabel({ lastSeen }: { lastSeen: string | null }) {
  if (!lastSeen) return <span className="text-gray-300">-</span>;

  const diff = Date.now() - new Date(lastSeen).getTime();
  const seconds = Math.floor(diff / 1000);

  if (seconds < 10) return <span className="text-green-500">방금 전</span>;
  if (seconds < 60)
    return <span className="text-green-600">{seconds}초 전</span>;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)
    return <span className="text-yellow-600">{minutes}분 전</span>;

  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return <span className="text-orange-600">{hours}시간 전</span>;

  const days = Math.floor(hours / 24);
  return <span className="text-red-500">{days}일 전</span>;
}

function VersionBadge({
  version,
  latest,
}: {
  version: string;
  latest: string;
}) {
  if (!version || version === "0.0.0") {
    return <span className="text-xs text-gray-400">-</span>;
  }

  const isLatest = version === latest;

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono ${
        isLatest
          ? "bg-green-50 text-green-700"
          : "bg-yellow-50 text-yellow-700"
      }`}
    >
      v{version}
      {!isLatest && latest && (
        <span className="text-yellow-500" title={`최신: v${latest}`}>
          ↑
        </span>
      )}
    </span>
  );
}
