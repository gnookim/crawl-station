"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Worker } from "@/types";
import { WORKER_ONLINE_THRESHOLD_MS } from "@/types";
import { WorkerStatusBadge } from "@/components/ui/status-badge";

export default function DashboardPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [stats, setStats] = useState({
    totalWorkers: 0,
    activeWorkers: 0,
    pendingTasks: 0,
    runningTasks: 0,
    completedToday: 0,
    failedToday: 0,
  });

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    const [workersRes, pendingRes, runningRes, completedRes, failedRes] =
      await Promise.all([
        supabase
          .from("workers")
          .select("*")
          .order("last_seen", { ascending: false }),
        supabase
          .from("crawl_requests")
          .select("id", { count: "exact", head: true })
          .in("status", ["pending", "assigned"]),
        supabase
          .from("crawl_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "running"),
        supabase
          .from("crawl_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "completed")
          .gte("completed_at", new Date().toISOString().split("T")[0]),
        supabase
          .from("crawl_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "failed")
          .gte("completed_at", new Date().toISOString().split("T")[0]),
      ]);

    const now = new Date();
    const workerList = ((workersRes.data || []) as Worker[]).map((w) => ({
      ...w,
      is_active: w.last_seen
        ? now.getTime() - new Date(w.last_seen).getTime() < WORKER_ONLINE_THRESHOLD_MS
        : false,
    }));
    setWorkers(workerList);

    const activeWorkers = workerList.filter((w) => w.is_active);

    setStats({
      totalWorkers: workerList.length,
      activeWorkers: activeWorkers.length,
      pendingTasks: pendingRes.count || 0,
      runningTasks: runningRes.count || 0,
      completedToday: completedRes.count || 0,
      failedToday: failedRes.count || 0,
    });
  }

  return (
    <div className="p-6 max-w-6xl">
      <h2 className="text-xl font-bold mb-6">대시보드</h2>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <StatCard label="전체 워커" value={stats.totalWorkers} color="gray" />
        <StatCard
          label="활성 워커"
          value={stats.activeWorkers}
          color="green"
        />
        <StatCard label="대기 작업" value={stats.pendingTasks} color="yellow" />
        <StatCard label="실행 중" value={stats.runningTasks} color="blue" />
        <StatCard
          label="오늘 완료"
          value={stats.completedToday}
          color="green"
        />
        <StatCard label="오늘 실패" value={stats.failedToday} color="red" />
      </div>

      {/* 워커 현황 */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-sm">워커 현황</h3>
          <span className="text-xs text-gray-400">5초마다 갱신</span>
        </div>
        {workers.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            등록된 워커가 없습니다. 크롤링 워커를 설치해주세요.
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
                <th className="text-right px-4 py-2 font-medium">마지막</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {workers.map((w) => (
                <WorkerRow key={w.id} worker={w} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    gray: "bg-gray-50 text-gray-700",
    green: "bg-green-50 text-green-700",
    yellow: "bg-yellow-50 text-yellow-700",
    blue: "bg-blue-50 text-blue-700",
    red: "bg-red-50 text-red-700",
  };

  return (
    <div
      className={`rounded-lg p-3 ${colorMap[color] || colorMap.gray} border border-gray-200`}
    >
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs mt-0.5 opacity-75">{label}</div>
    </div>
  );
}

function WorkerRow({ worker: w }: { worker: Worker }) {
  const lastSeen = w.last_seen ? timeAgo(new Date(w.last_seen)) : "-";

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-2">
        <div className="font-medium">{w.name || w.id}</div>
        <div className="text-xs text-gray-400">{w.id}</div>
      </td>
      <td className="px-4 py-2 text-gray-500 text-xs">{w.os || "-"}</td>
      <td className="px-4 py-2">
        {w.version && w.version !== "0.0.0" ? (
          <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">
            v{w.version}
          </span>
        ) : (
          <span className="text-xs text-gray-400">-</span>
        )}
      </td>
      <td className="px-4 py-2">
        <WorkerStatusBadge status={w.is_active ? w.status : "offline"} />
      </td>
      <td className="px-4 py-2 text-gray-500 text-xs">
        {w.current_keyword ? (
          <span>
            <span className="text-gray-400">[{w.current_type}]</span>{" "}
            {w.current_keyword}
          </span>
        ) : (
          "-"
        )}
      </td>
      <td className="px-4 py-2 text-right tabular-nums">
        <span className="text-green-600">{w.total_processed}</span>
        {" / "}
        <span className="text-red-500">{w.error_count}</span>
      </td>
      <td className="px-4 py-2 text-right text-gray-400 text-xs">
        {lastSeen}
      </td>
    </tr>
  );
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "방금";
  if (seconds < 60) return `${seconds}초 전`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`;
  return `${Math.floor(seconds / 86400)}일 전`;
}
