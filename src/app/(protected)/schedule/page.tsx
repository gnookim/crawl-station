"use client";

import { useEffect, useState, useCallback } from "react";

interface Schedule {
  id: string;
  name: string;
  is_active: boolean;
  worker_count: number;
  slots_per_day: number;
  slot_hours: number[];
  url_count: number;
  created_at: string;
}

interface DispatchLog {
  slot_hour: number;
  tasks_created: number;
  created_at: string;
}

export default function SchedulePage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newWorkerCount, setNewWorkerCount] = useState(2);
  const [newSlotHours, setNewSlotHours] = useState("6,10,14,18");
  const [creating, setCreating] = useState(false);

  // 선택된 스케줄 상세
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [todayLogs, setTodayLogs] = useState<DispatchLog[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [urlCount, setUrlCount] = useState(0);

  const loadSchedules = useCallback(async () => {
    const res = await fetch("/api/schedule");
    const data = await res.json();
    setSchedules(data.schedules || []);
  }, []);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  // 스케줄 선택 시 상세 로드
  useEffect(() => {
    if (!selectedId) return;
    (async () => {
      const res = await fetch(`/api/schedule/${selectedId}`);
      const data = await res.json();
      setTodayLogs(data.today_dispatches || []);
      setUrlCount(data.schedule?.url_count || 0);
    })();
  }, [selectedId]);

  async function createSchedule() {
    if (!newName.trim()) return;
    setCreating(true);
    const hours = newSlotHours.split(",").map((h) => parseInt(h.trim())).filter((h) => !isNaN(h));
    await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName,
        worker_count: newWorkerCount,
        slots_per_day: hours.length,
        slot_hours: hours,
      }),
    });
    setCreating(false);
    setShowForm(false);
    setNewName("");
    loadSchedules();
  }

  async function toggleActive(id: string, active: boolean) {
    await fetch(`/api/schedule/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !active }),
    });
    loadSchedules();
  }

  async function deleteSchedule(id: string) {
    if (!confirm("스케줄과 모든 URL이 삭제됩니다. 계속하시겠습니까?")) return;
    await fetch(`/api/schedule/${id}`, { method: "DELETE" });
    if (selectedId === id) setSelectedId(null);
    loadSchedules();
  }

  async function uploadUrls() {
    if (!selectedId || !urlInput.trim()) return;
    setUploading(true);
    const lines = urlInput.trim().split("\n").filter((l) => l.trim());
    const items = lines.map((line) => {
      const parts = line.split("\t");
      return {
        keyword: parts[0]?.trim() || "",
        url: parts[1]?.trim() || "",
        memo: parts[2]?.trim() || "",
      };
    }).filter((i) => i.keyword && i.url);

    if (!items.length) {
      alert("유효한 항목이 없습니다. 형식: 키워드<탭>URL<탭>메모(선택)");
      setUploading(false);
      return;
    }

    const res = await fetch(`/api/schedule/${selectedId}/urls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const data = await res.json();
    alert(`${data.inserted}개 URL 등록 완료`);
    setUrlInput("");
    setUploading(false);
    setUrlCount((prev) => prev + (data.inserted || 0));
    loadSchedules();
  }

  const selected = schedules.find((s) => s.id === selectedId);

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">일일 순위 스케줄</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            매일 자동으로 URL 순위를 체크합니다. Vercel Cron이 매시간 실행.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          + 새 스케줄
        </button>
      </div>

      {/* 새 스케줄 폼 */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
          <h3 className="text-sm font-semibold mb-3">새 스케줄 생성</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">이름 *</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="메인 고객사 순위"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">워커 수</label>
              <select
                value={newWorkerCount}
                onChange={(e) => setNewWorkerCount(parseInt(e.target.value))}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n}대</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">실행 시간 (KST, 콤마 구분)</label>
              <input
                type="text"
                value={newSlotHours}
                onChange={(e) => setNewSlotHours(e.target.value)}
                placeholder="6,10,14,18"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={createSchedule}
              disabled={creating}
              className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {creating ? "생성 중..." : "생성"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 스케줄 목록 */}
      <div className="grid gap-4 mb-8">
        {schedules.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-400 text-sm">
            등록된 스케줄이 없습니다.
          </div>
        ) : (
          schedules.map((s) => (
            <div
              key={s.id}
              className={`bg-white border rounded-lg p-4 cursor-pointer transition-colors ${
                selectedId === s.id ? "border-blue-500 ring-1 ring-blue-200" : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => setSelectedId(selectedId === s.id ? null : s.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      s.is_active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {s.is_active ? "활성" : "비활성"}
                  </span>
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-gray-400">
                    {s.url_count.toLocaleString()}개 URL
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>워커 {s.worker_count}대</span>
                  <span>매일 {s.slot_hours.map((h) => `${h}시`).join(", ")}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleActive(s.id, s.is_active); }}
                    className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                  >
                    {s.is_active ? "비활성화" : "활성화"}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteSchedule(s.id); }}
                    className="px-2 py-1 text-red-500 border border-red-200 rounded hover:bg-red-50"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 선택된 스케줄 상세 */}
      {selected && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h3 className="text-sm font-bold mb-4">{selected.name} — 상세</h3>

          {/* 오늘 디스패치 상태 */}
          <div className="mb-6">
            <h4 className="text-xs font-semibold text-gray-500 mb-2">오늘 디스패치</h4>
            <div className="flex gap-2">
              {selected.slot_hours.map((hour) => {
                const log = todayLogs.find((l) => l.slot_hour === hour);
                return (
                  <div
                    key={hour}
                    className={`px-3 py-2 rounded-md text-xs text-center ${
                      log ? "bg-green-50 text-green-700 border border-green-200" : "bg-gray-50 text-gray-400 border border-gray-200"
                    }`}
                  >
                    <div className="font-bold">{hour}시</div>
                    {log ? (
                      <div>{log.tasks_created}개</div>
                    ) : (
                      <div>대기</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* URL 등록 */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 mb-2">
              URL 등록 ({urlCount.toLocaleString()}개)
            </h4>
            <textarea
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder={"키워드\tURL\t메모(선택)\n강남 피부과\thttps://blog.naver.com/xxx\t고객A\n탈모 치료\thttps://blog.naver.com/yyy"}
              className="w-full h-32 px-3 py-2 text-xs font-mono border border-gray-300 rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
              spellCheck={false}
            />
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={uploadUrls}
                disabled={uploading}
                className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {uploading ? "등록 중..." : "URL 등록"}
              </button>
              <span className="text-xs text-gray-400">
                탭으로 구분: 키워드[탭]URL[탭]메모
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
