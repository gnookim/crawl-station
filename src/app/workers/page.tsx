"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
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
    setWorkers((workersRes.data || []) as Worker[]);
    if (releaseRes.data?.[0]) {
      setLatestVersion(releaseRes.data[0].version);
    }
  }

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
    loadData();
  }

  async function deleteWorker(id: string) {
    if (!confirm(`워커 "${id}"를 삭제하시겠습니까?`)) return;
    await supabase.from("workers").delete().eq("id", id);
    loadData();
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
      loadData();
    }
  }

  const outdatedCount = workers.filter(
    (w) => latestVersion && w.version !== latestVersion
  ).length;

  const activeWorkers = workers.filter((w) =>
    ["online", "idle", "crawling"].includes(w.status)
  );

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
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
          {/* 전체 제어 버튼 */}
          {activeWorkers.length > 0 && (
            <div className="flex gap-1">
              <button
                onClick={() => sendCommand("update")}
                disabled={commandLoading !== null}
                className="px-2.5 py-1.5 text-xs bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
                title="모든 활성 워커에 업데이트 명령"
              >
                전체 업데이트
              </button>
              <button
                onClick={() => sendCommand("restart")}
                disabled={commandLoading !== null}
                className="px-2.5 py-1.5 text-xs bg-orange-500 text-white rounded-md hover:bg-orange-600 transition-colors disabled:opacity-50"
                title="모든 활성 워커 재시작"
              >
                전체 재시작
              </button>
              <button
                onClick={() => sendCommand("stop")}
                disabled={commandLoading !== null}
                className="px-2.5 py-1.5 text-xs bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors disabled:opacity-50"
                title="모든 활성 워커 정지"
              >
                전체 정지
              </button>
            </div>
          )}
          <button
            onClick={() => setShowManualRegister(!showManualRegister)}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            + 수동 등록
          </button>
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
                <th className="text-left px-4 py-2 font-medium">현재 작업</th>
                <th className="text-right px-4 py-2 font-medium">처리/에러</th>
                <th className="text-right px-4 py-2 font-medium">제어</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {workers.map((w) => {
                const isActive = ["online", "idle", "crawling"].includes(
                  w.status
                );
                const hasPendingCommand = !!w.command;
                return (
                  <tr key={w.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <div className="font-medium">{w.name || w.id}</div>
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
                        <WorkerStatusBadge status={w.status} />
                        {hasPendingCommand && (
                          <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded text-xs">
                            {w.command}
                          </span>
                        )}
                      </div>
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
                              title="업데이트"
                            >
                              업데이트
                            </button>
                          )}
                          <button
                            onClick={() =>
                              sendCommand("restart", [w.id])
                            }
                            disabled={commandLoading !== null}
                            className="px-1.5 py-0.5 text-xs bg-orange-50 text-orange-700 rounded hover:bg-orange-100 transition-colors disabled:opacity-50"
                            title="재시작"
                          >
                            재시작
                          </button>
                          <button
                            onClick={() =>
                              sendCommand("stop", [w.id])
                            }
                            disabled={commandLoading !== null}
                            className="px-1.5 py-0.5 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100 transition-colors disabled:opacity-50"
                            title="정지"
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

function VersionBadge({
  version,
  latest,
}: {
  version: string;
  latest: string;
}) {
  if (!version || version === "0.0.0") {
    return (
      <span className="text-xs text-gray-400">-</span>
    );
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
