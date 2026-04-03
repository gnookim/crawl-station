"use client";

import { useEffect, useState, useCallback } from "react";
import type { ConnectedApp } from "@/types";

export default function AppsPage() {
  const [apps, setApps] = useState<ConnectedApp[]>([]);
  const [showRegister, setShowRegister] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadApps = useCallback(async () => {
    const res = await fetch("/api/apps");
    const data = await res.json();
    setApps(data.apps || []);
  }, []);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  async function registerApp() {
    if (!newName.trim()) return;
    setLoading(true);
    const res = await fetch("/api/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, description: newDesc }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.api_key) {
      setNewApiKey(data.api_key);
      setNewName("");
      setNewDesc("");
      loadApps();
    } else {
      alert(data.error || "등록 실패");
    }
  }

  async function toggleActive(app: ConnectedApp) {
    await fetch(`/api/apps?id=${app.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !app.is_active }),
    });
    loadApps();
  }

  async function deleteApp(app: ConnectedApp) {
    if (!confirm(`"${app.name}" 앱을 삭제하시겠습니까? API 키가 즉시 무효화됩니다.`))
      return;
    await fetch(`/api/apps?id=${app.id}`, { method: "DELETE" });
    loadApps();
  }

  async function regenerateKey(app: ConnectedApp) {
    if (
      !confirm(
        `"${app.name}"의 API 키를 재발급하시겠습니까?\n기존 키는 즉시 무효화됩니다.`
      )
    )
      return;
    // 삭제 후 재등록
    await fetch(`/api/apps?id=${app.id}`, { method: "DELETE" });
    const res = await fetch("/api/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: app.name, description: app.description }),
    });
    const data = await res.json();
    if (data.api_key) {
      setNewApiKey(data.api_key);
      loadApps();
    }
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">연결된 앱 관리</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            외부 앱에서 CrawlStation API를 사용하려면 API 키가 필요합니다
          </p>
        </div>
        <button
          onClick={() => {
            setShowRegister(!showRegister);
            setNewApiKey(null);
          }}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          + 앱 등록
        </button>
      </div>

      {/* API 키 발급 결과 */}
      {newApiKey && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <h4 className="text-sm font-semibold text-green-800 mb-2">
            API 키가 발급되었습니다
          </h4>
          <p className="text-xs text-green-600 mb-2">
            이 키는 한 번만 표시됩니다. 안전한 곳에 복사해두세요.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-green-100 px-3 py-2 rounded text-sm font-mono text-green-900 select-all break-all">
              {newApiKey}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(newApiKey);
                alert("복사됨!");
              }}
              className="px-3 py-2 text-xs bg-green-700 text-white rounded hover:bg-green-800 shrink-0"
            >
              복사
            </button>
          </div>
          <div className="mt-3 bg-green-100 rounded p-3">
            <p className="text-xs text-green-700 font-semibold mb-1">
              사용 방법
            </p>
            <code className="text-xs text-green-800 font-mono">
              {`curl -X POST https://crawl-station.vercel.app/api/crawl \\`}
              <br />
              {`  -H "X-API-Key: ${newApiKey}" \\`}
              <br />
              {`  -H "Content-Type: application/json" \\`}
              <br />
              {`  -d '{"keywords":["테스트"],"type":"blog_crawl"}'`}
            </code>
          </div>
          <button
            onClick={() => setNewApiKey(null)}
            className="mt-2 text-xs text-green-600 hover:text-green-800"
          >
            닫기
          </button>
        </div>
      )}

      {/* 등록 폼 */}
      {showRegister && !newApiKey && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-semibold mb-3">앱 등록</h3>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">
                앱 이름 *
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="desk-web"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">
                설명 (선택)
              </label>
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="블로그 분석 서비스"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={registerApp}
              disabled={loading || !newName.trim()}
              className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {loading ? "발급 중..." : "등록 + 키 발급"}
            </button>
            <button
              onClick={() => setShowRegister(false)}
              className="px-4 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 앱 목록 */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {apps.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            등록된 앱이 없습니다. 앱을 등록하면 API 키가 발급됩니다.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="text-left px-4 py-2 font-medium">앱</th>
                <th className="text-left px-4 py-2 font-medium">API 키</th>
                <th className="text-left px-4 py-2 font-medium">상태</th>
                <th className="text-right px-4 py-2 font-medium">요청 수</th>
                <th className="text-left px-4 py-2 font-medium">
                  마지막 사용
                </th>
                <th className="text-right px-4 py-2 font-medium">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {apps.map((app) => (
                <tr key={app.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{app.name}</div>
                    {app.description && (
                      <div className="text-xs text-gray-400">
                        {app.description}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs text-gray-400 font-mono">
                      {app.api_key.slice(0, 12)}...
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(app)}
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        app.is_active
                          ? "bg-green-50 text-green-700"
                          : "bg-red-50 text-red-600"
                      }`}
                    >
                      {app.is_active ? "활성" : "비활성"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {app.total_requests.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {app.last_used_at
                      ? new Date(app.last_used_at).toLocaleString("ko-KR")
                      : "-"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => regenerateKey(app)}
                        className="px-1.5 py-0.5 text-xs bg-yellow-50 text-yellow-700 rounded hover:bg-yellow-100"
                      >
                        키 재발급
                      </button>
                      <button
                        onClick={() => deleteApp(app)}
                        className="px-1.5 py-0.5 text-xs text-red-500 hover:text-red-700"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 사용 안내 */}
      <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">
          API 키 사용법
        </h4>
        <div className="text-xs text-gray-500 space-y-1.5">
          <p>
            모든 외부 API 호출 시 <code className="bg-gray-200 px-1 rounded">X-API-Key</code> 헤더에 발급받은 키를 포함하세요.
          </p>
          <p>
            인증이 필요한 API: <code className="bg-gray-200 px-1 rounded">POST /api/crawl</code>, <code className="bg-gray-200 px-1 rounded">POST /api/dispatch</code>
          </p>
          <p>
            인증 불필요: <code className="bg-gray-200 px-1 rounded">GET /api/crawl</code> (결과 조회), <code className="bg-gray-200 px-1 rounded">GET /api/workers</code>
          </p>
        </div>
      </div>
    </div>
  );
}
