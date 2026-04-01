"use client";

import { useEffect, useState, useCallback } from "react";

interface InstallSession {
  id: string;
  hostname: string | null;
  os_version: string | null;
  os_machine: string | null;
  installer_version: string | null;
  current_step: number;
  current_step_name: string;
  total_steps: number;
  status: string;
  failed_steps: string[];
  diagnosis_count: number;
  last_diagnosis: string | null;
  log_tail: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  is_active: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  starting: { label: "시작", color: "text-blue-700", bg: "bg-blue-100" },
  in_progress: { label: "진행 중", color: "text-green-700", bg: "bg-green-100" },
  diagnosing: { label: "AI 진단 중", color: "text-purple-700", bg: "bg-purple-100" },
  step_failed: { label: "단계 실패", color: "text-orange-700", bg: "bg-orange-100" },
  completed: { label: "완료", color: "text-gray-700", bg: "bg-gray-100" },
  failed: { label: "실패", color: "text-red-700", bg: "bg-red-100" },
};

const STEP_NAMES: Record<number, string> = {
  1: "기존 설치 확인",
  2: "디렉토리 생성",
  3: "Python 설치",
  4: "환경 확인",
  5: "pip 설치",
  6: "패키지 설치",
  7: "워커 다운로드",
  8: "설정 파일",
  9: "서비스 등록",
};

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return "방금 전";
  if (sec < 60) return `${sec}초 전`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  return `${hr}시간 전`;
}

export default function InstallsPage() {
  const [sessions, setSessions] = useState<InstallSession[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(3000);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/install-status");
      const data = await res.json();
      setSessions(data.sessions || []);
      setActiveCount(data.active || 0);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, refreshInterval);
    return () => clearInterval(id);
  }, [load, refreshInterval]);

  const selectedSession = sessions.find((s) => s.id === selected);

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold">설치 모니터링</h2>
          {activeCount > 0 && (
            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full animate-pulse">
              {activeCount}개 진행 중
            </span>
          )}
        </div>
        <select
          value={refreshInterval}
          onChange={(e) => setRefreshInterval(Number(e.target.value))}
          className="text-xs border border-gray-300 rounded px-2 py-1"
        >
          <option value={2000}>2초</option>
          <option value={3000}>3초</option>
          <option value={5000}>5초</option>
          <option value={10000}>10초</option>
        </select>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Windows 워커 설치 진행 상황을 실시간으로 모니터링합니다.
      </p>

      {sessions.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-gray-400 text-sm">진행 중이거나 최근 24시간 내 설치 세션이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const cfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.starting;
            const pct = s.total_steps > 0 ? Math.round((s.current_step / s.total_steps) * 100) : 0;
            const isSelected = selected === s.id;

            return (
              <div
                key={s.id}
                className={`bg-white border rounded-lg overflow-hidden cursor-pointer transition-all ${
                  isSelected ? "border-blue-400 ring-1 ring-blue-200" : "border-gray-200 hover:border-gray-300"
                } ${s.is_active ? "shadow-sm" : ""}`}
                onClick={() => setSelected(isSelected ? null : s.id)}
              >
                {/* 헤더 */}
                <div className="px-4 py-3 flex items-center gap-4">
                  {/* 상태 표시등 */}
                  <div className="relative">
                    <div className={`w-3 h-3 rounded-full ${
                      s.is_active ? "bg-green-500" : s.status === "completed" ? "bg-gray-400" : "bg-red-400"
                    }`} />
                    {s.is_active && (
                      <div className="absolute inset-0 w-3 h-3 rounded-full bg-green-500 animate-ping opacity-75" />
                    )}
                  </div>

                  {/* 호스트 정보 */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 truncate">
                        {s.hostname || "알 수 없음"}
                      </span>
                      <span className={`px-1.5 py-0.5 text-xs rounded ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
                      </span>
                      {s.diagnosis_count > 0 && (
                        <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">
                          AI 진단 {s.diagnosis_count}회
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 flex gap-3">
                      <span>{s.os_version ? `Win ${s.os_version}` : ""} {s.os_machine || ""}</span>
                      <span>v{s.installer_version || "?"}</span>
                      <span>업데이트: {relativeTime(s.updated_at)}</span>
                    </div>
                  </div>

                  {/* 진행률 */}
                  <div className="text-right shrink-0 w-32">
                    <div className="text-xs text-gray-500 mb-1">
                      {s.current_step}/{s.total_steps} {STEP_NAMES[s.current_step] || s.current_step_name}
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          s.status === "completed"
                            ? "bg-gray-400"
                            : s.status === "failed"
                            ? "bg-red-400"
                            : s.status === "diagnosing"
                            ? "bg-purple-500"
                            : "bg-green-500"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{pct}%</div>
                  </div>
                </div>

                {/* 상세 (선택 시) */}
                {isSelected && (
                  <div className="border-t border-gray-100 px-4 py-3 space-y-3">
                    {/* 단계 진행 바 */}
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-2">설치 단계</div>
                      <div className="flex gap-1">
                        {Array.from({ length: s.total_steps }, (_, i) => {
                          const stepNum = i + 1;
                          const isFailed = s.failed_steps?.includes(STEP_NAMES[stepNum] || "");
                          const isDone = stepNum < s.current_step || (stepNum === s.current_step && s.status === "completed");
                          const isCurrent = stepNum === s.current_step && s.status !== "completed";
                          return (
                            <div key={stepNum} className="flex-1" title={STEP_NAMES[stepNum]}>
                              <div className={`h-6 rounded text-xs flex items-center justify-center font-mono ${
                                isFailed
                                  ? "bg-red-100 text-red-600"
                                  : isDone
                                  ? "bg-green-100 text-green-700"
                                  : isCurrent
                                  ? "bg-blue-500 text-white animate-pulse"
                                  : "bg-gray-100 text-gray-400"
                              }`}>
                                {stepNum}
                              </div>
                              <div className="text-xs text-gray-400 text-center mt-0.5 truncate">
                                {STEP_NAMES[stepNum]?.slice(0, 4)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 실패 단계 */}
                    {s.failed_steps && s.failed_steps.length > 0 && (
                      <div className="bg-red-50 rounded p-2">
                        <div className="text-xs font-medium text-red-700">실패한 단계</div>
                        <div className="text-xs text-red-600 mt-0.5">
                          {s.failed_steps.join(", ")}
                        </div>
                      </div>
                    )}

                    {/* 마지막 AI 진단 */}
                    {s.last_diagnosis && (
                      <div className="bg-purple-50 rounded p-2">
                        <div className="text-xs font-medium text-purple-700">마지막 AI 진단</div>
                        <div className="text-xs text-purple-600 mt-0.5">
                          {s.last_diagnosis}
                        </div>
                      </div>
                    )}

                    {/* 최근 로그 */}
                    {s.log_tail && (
                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-1">최근 로그</div>
                        <pre className="bg-gray-900 text-green-400 rounded p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">
                          {s.log_tail}
                        </pre>
                      </div>
                    )}

                    {/* 세션 정보 */}
                    <div className="text-xs text-gray-400 flex gap-4">
                      <span>세션: {s.id.slice(0, 12)}...</span>
                      <span>시작: {new Date(s.started_at).toLocaleString("ko-KR")}</span>
                      {s.completed_at && (
                        <span>완료: {new Date(s.completed_at).toLocaleString("ko-KR")}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
