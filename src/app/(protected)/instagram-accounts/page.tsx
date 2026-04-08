"use client";

import { useEffect, useState, useCallback } from "react";

type AccountStatus = "active" | "cooling" | "blocked" | "banned";

interface InstagramAccount {
  id: string;
  username: string;
  is_active: boolean;
  status: AccountStatus;
  last_login_at: string | null;
  last_used_at: string | null;
  last_blocked_at: string | null;
  blocked_until: string | null;
  assigned_worker_id: string | null;
  login_count: number;
  block_count: number;
  note: string | null;
  created_at: string;
}

const STATUS_CONFIG: Record<AccountStatus, { label: string; color: string }> = {
  active:  { label: "활성",   color: "bg-green-100 text-green-700" },
  cooling: { label: "쿨다운", color: "bg-yellow-100 text-yellow-700" },
  blocked: { label: "차단됨", color: "bg-red-100 text-red-700" },
  banned:  { label: "영구차단", color: "bg-gray-200 text-gray-600" },
};

export default function InstagramAccountsPage() {
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", note: "", assigned_worker_id: "" });
  const [submitting, setSubmitting] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [showPassword, setShowPassword] = useState<Set<string>>(new Set());

  const loadAccounts = useCallback(async () => {
    const res = await fetch("/api/instagram-accounts");
    const data = await res.json();
    setAccounts(data.accounts || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAccounts();
    const timer = setInterval(loadAccounts, 15000);
    return () => clearInterval(timer);
  }, [loadAccounts]);

  async function addAccount() {
    if (!form.username.trim() || !form.password.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/instagram-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { alert(`등록 실패: ${data.error}`); return; }
      setForm({ username: "", password: "", note: "", assigned_worker_id: "" });
      setShowAddForm(false);
      loadAccounts();
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(id: string, current: boolean) {
    await fetch(`/api/instagram-accounts?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !current }),
    });
    loadAccounts();
  }

  async function clearBlock(id: string) {
    await fetch(`/api/instagram-accounts?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clear_block: true }),
    });
    loadAccounts();
  }

  async function clearSession(id: string) {
    await fetch(`/api/instagram-accounts?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clear_session: true }),
    });
    loadAccounts();
  }

  async function saveEdit(id: string) {
    const updates: Record<string, string> = {};
    if (editNote !== "") updates.note = editNote;
    if (editPassword !== "") updates.password = editPassword;
    await fetch(`/api/instagram-accounts?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setEditId(null);
    loadAccounts();
  }

  async function deleteAccount(id: string, username: string) {
    if (!confirm(`@${username} 계정을 삭제하시겠습니까?`)) return;
    await fetch(`/api/instagram-accounts?id=${id}`, { method: "DELETE" });
    loadAccounts();
  }

  const activeCount = accounts.filter((a) => a.is_active && a.status === "active").length;
  const coolingCount = accounts.filter((a) => a.status === "cooling").length;
  const blockedCount = accounts.filter((a) => a.status === "blocked" || a.status === "banned").length;

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">Instagram 계정 관리</h2>
          <p className="text-xs text-gray-400 mt-0.5">크롤링 워커에 할당되는 Instagram 로그인 계정 풀</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-3 py-1.5 text-sm bg-pink-600 text-white rounded-md hover:bg-pink-700"
        >
          + 계정 추가
        </button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <SummaryCard label="활성 계정" value={activeCount} color="green" />
        <SummaryCard label="쿨다운 중" value={coolingCount} color="yellow" />
        <SummaryCard label="차단됨" value={blockedCount} color="red" />
      </div>

      {/* 계정 추가 폼 */}
      {showAddForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-semibold mb-3">계정 추가</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">사용자명 *</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="instagram_username"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">비밀번호 *</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="비밀번호"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">전용 워커 ID (선택)</label>
              <input
                type="text"
                value={form.assigned_worker_id}
                onChange={(e) => setForm((f) => ({ ...f, assigned_worker_id: e.target.value }))}
                placeholder="특정 워커에만 사용 (비워두면 공용)"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">메모 (선택)</label>
              <input
                type="text"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="계정 용도 설명"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={addAccount}
              disabled={submitting || !form.username.trim() || !form.password.trim()}
              className="px-4 py-1.5 text-sm bg-pink-600 text-white rounded-md hover:bg-pink-700 disabled:opacity-50"
            >
              {submitting ? "등록 중..." : "등록"}
            </button>
            <button
              onClick={() => { setShowAddForm(false); setForm({ username: "", password: "", note: "", assigned_worker_id: "" }); }}
              className="px-4 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 계정 목록 */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">로딩 중...</div>
        ) : accounts.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            등록된 Instagram 계정이 없습니다.
            <br />
            <span className="text-xs">계정을 추가하면 워커가 차단 시 자동으로 다른 계정으로 전환합니다.</span>
          </div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm table-fixed">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="text-left px-4 py-2 font-medium w-[160px]">계정</th>
                <th className="text-left px-4 py-2 font-medium w-[90px]">상태</th>
                <th className="text-left px-4 py-2 font-medium w-[120px]">전용 워커</th>
                <th className="text-left px-4 py-2 font-medium w-[120px]">마지막 사용</th>
                <th className="text-left px-4 py-2 font-medium w-[80px]">차단해제</th>
                <th className="text-right px-4 py-2 font-medium w-[72px]">로그인/차단</th>
                <th className="text-left px-4 py-2 font-medium">메모</th>
                <th className="text-right px-4 py-2 font-medium w-[120px]">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {accounts.map((acc) => {
                const statusCfg = STATUS_CONFIG[acc.status] || STATUS_CONFIG.active;
                const isEditing = editId === acc.id;
                const hasSession = false; // session_state는 API에서 반환 안 함

                return (
                  <tr key={acc.id} className={`hover:bg-gray-50 ${!acc.is_active ? "opacity-50" : ""}`}>
                    {/* 계정명 */}
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-800">@{acc.username}</div>
                      {acc.last_login_at ? (
                        <div className="text-xs text-gray-400">로그인: {fmtDate(acc.last_login_at)}</div>
                      ) : (
                        <div className="text-xs text-gray-300">미로그인</div>
                      )}
                    </td>

                    {/* 상태 */}
                    <td className="px-4 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${statusCfg.color}`}>{statusCfg.label}</span>
                      {acc.blocked_until && new Date(acc.blocked_until) > new Date() && (
                        <div className="text-xs text-gray-400 mt-0.5">~{fmtTime(acc.blocked_until)}</div>
                      )}
                    </td>

                    {/* 전용 워커 */}
                    <td className="px-4 py-2 text-xs text-gray-500">
                      {acc.assigned_worker_id ? (
                        <span className="font-mono">{acc.assigned_worker_id.slice(0, 12)}...</span>
                      ) : (
                        <span className="text-gray-300">공용</span>
                      )}
                    </td>

                    {/* 마지막 사용 */}
                    <td className="px-4 py-2 text-xs text-gray-400">
                      {acc.last_used_at ? timeAgo(new Date(acc.last_used_at)) : "-"}
                    </td>

                    {/* 차단 해제 */}
                    <td className="px-4 py-2">
                      {(acc.status === "cooling" || acc.status === "blocked") && (
                        <button
                          onClick={() => clearBlock(acc.id)}
                          className="text-xs text-blue-500 hover:text-blue-700"
                        >
                          해제
                        </button>
                      )}
                    </td>

                    {/* 로그인/차단 카운트 */}
                    <td className="px-4 py-2 text-right tabular-nums text-xs">
                      <span className="text-green-600">{acc.login_count}</span>
                      {" / "}
                      <span className="text-red-500">{acc.block_count}</span>
                    </td>

                    {/* 메모 */}
                    <td className="px-4 py-2 text-xs text-gray-500 overflow-hidden">
                      {isEditing ? (
                        <div className="flex gap-1">
                          <input
                            type="text"
                            value={editNote}
                            onChange={(e) => setEditNote(e.target.value)}
                            placeholder="메모"
                            className="flex-1 px-2 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-pink-400"
                          />
                        </div>
                      ) : (
                        <span className="truncate block">{acc.note || "-"}</span>
                      )}
                    </td>

                    {/* 관리 */}
                    <td className="px-4 py-2 text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-1">
                          <button onClick={() => saveEdit(acc.id)} className="text-xs text-blue-600 hover:text-blue-800">저장</button>
                          <button onClick={() => setEditId(null)} className="text-xs text-gray-400 hover:text-gray-600">취소</button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => toggleActive(acc.id, acc.is_active)}
                            className={`text-xs px-1.5 py-0.5 rounded ${acc.is_active ? "text-gray-400 hover:text-gray-600" : "text-green-600 hover:text-green-800"}`}
                          >
                            {acc.is_active ? "비활성" : "활성화"}
                          </button>
                          <button
                            onClick={() => { setEditId(acc.id); setEditNote(acc.note || ""); setEditPassword(""); }}
                            className="text-xs text-blue-500 hover:text-blue-700"
                          >
                            편집
                          </button>
                          <button
                            onClick={() => deleteAccount(acc.id, acc.username)}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            삭제
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>

      {/* 안내 */}
      <div className="mt-4 p-3 bg-pink-50 border border-pink-100 rounded-lg text-xs text-pink-700 space-y-1">
        <p className="font-medium">사용 방식</p>
        <p>• 워커가 Instagram 크롤링 시 이 목록에서 계정을 자동 선택하여 로그인 세션을 사용합니다.</p>
        <p>• 계정이 차단되면 자동으로 상태가 &quot;쿨다운&quot;으로 변경되고, 다른 계정으로 전환합니다.</p>
        <p>• 전용 워커 ID를 지정하면 해당 워커만 그 계정을 사용하고, 미지정 시 공용으로 공유됩니다.</p>
        <p>• 비밀번호는 저장되나 목록에는 표시되지 않습니다.</p>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    green: "bg-green-50 text-green-700 border-green-100",
    yellow: "bg-yellow-50 text-yellow-700 border-yellow-100",
    red: "bg-red-50 text-red-700 border-red-100",
  };
  return (
    <div className={`rounded-lg p-3 border ${colorMap[color] || colorMap.green}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs mt-0.5 opacity-75">{label}</div>
    </div>
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "방금";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`;
  return `${Math.floor(seconds / 86400)}일 전`;
}
