"use client";

import { useEffect, useState, useCallback } from "react";
import { getAuthHeaders } from "@/lib/sso";

const SSO_BASE =
  process.env.NEXT_PUBLIC_SSO_URL ?? "https://lifenbio-sso.fly.dev";

interface SSOUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
  is_approved: boolean;
  created_at: string;
  last_login_at: string | null;
}

export default function UsersPage() {
  const [users, setUsers] = useState<SSOUser[]>([]);
  const [pendingUsers, setPendingUsers] = useState<SSOUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();

      const [usersRes, pendingRes] = await Promise.all([
        fetch(`${SSO_BASE}/admin/users`, { headers }),
        fetch(`${SSO_BASE}/admin/pending-users`, { headers }),
      ]);

      if (!usersRes.ok) {
        const errBody = await usersRes.text().catch(() => "");
        setError(`회원 목록 조회 실패 (${usersRes.status}): ${errBody.slice(0, 200)}`);
        setLoading(false);
        return;
      }

      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(Array.isArray(data) ? data : data.users || []);
      }
      if (pendingRes.ok) {
        const data = await pendingRes.json();
        setPendingUsers(Array.isArray(data) ? data : data.users || []);
      }
    } catch (e) {
      setError(`로드 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function adminAction(
    userId: string,
    action: "approve" | "reject" | "suspend" | "toggle" | "revoke"
  ) {
    setActionLoading(userId);
    try {
      const headers = {
        ...(await getAuthHeaders()),
        "Content-Type": "application/json",
      };
      const methodMap: Record<string, string> = {
        approve: "POST",
        reject: "POST",
        suspend: "POST",
        toggle: "PATCH",
        revoke: "POST",
      };
      const pathMap: Record<string, string> = {
        approve: `/admin/users/${userId}/approve`,
        reject: `/admin/users/${userId}/reject`,
        suspend: `/admin/users/${userId}/suspend`,
        toggle: `/admin/users/${userId}/toggle`,
        revoke: `/admin/users/${userId}/revoke`,
      };

      const res = await fetch(`${SSO_BASE}${pathMap[action]}`, {
        method: methodMap[action],
        headers,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`실패: ${err.detail || res.statusText}`);
      }
    } catch (e) {
      alert(`오류: ${e instanceof Error ? e.message : String(e)}`);
    }
    setActionLoading(null);
    loadData();
  }

  if (loading) {
    return (
      <div className="p-6 text-gray-400 text-sm">회원 정보 로드 중...</div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl">
      <h2 className="text-xl font-bold mb-6">회원 관리</h2>

      {/* 승인 대기 */}
      {pendingUsers.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-orange-700 mb-2">
            승인 대기 ({pendingUsers.length}명)
          </h3>
          <div className="bg-orange-50 border border-orange-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-orange-100 text-orange-800 text-xs">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">이름</th>
                  <th className="text-left px-4 py-2 font-medium">이메일</th>
                  <th className="text-left px-4 py-2 font-medium">가입일</th>
                  <th className="text-right px-4 py-2 font-medium">제어</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-orange-100">
                {pendingUsers.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-2 font-medium">
                      {u.name || "-"}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{u.email}</td>
                    <td className="px-4 py-2 text-gray-400 text-xs">
                      {new Date(u.created_at).toLocaleDateString("ko-KR")}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => adminAction(u.id, "approve")}
                          disabled={actionLoading !== null}
                          className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                        >
                          승인
                        </button>
                        <button
                          onClick={() => adminAction(u.id, "reject")}
                          disabled={actionLoading !== null}
                          className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                        >
                          거부
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 전체 회원 목록 */}
      <h3 className="text-sm font-semibold text-gray-700 mb-2">
        전체 회원 ({users.length}명)
      </h3>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {users.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            등록된 회원이 없습니다.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="text-left px-4 py-2 font-medium">이름</th>
                <th className="text-left px-4 py-2 font-medium">이메일</th>
                <th className="text-left px-4 py-2 font-medium">역할</th>
                <th className="text-left px-4 py-2 font-medium">상태</th>
                <th className="text-left px-4 py-2 font-medium">
                  마지막 로그인
                </th>
                <th className="text-right px-4 py-2 font-medium">제어</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">
                    {u.name || "-"}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{u.email}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-xs ${
                        u.role === "admin"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex items-center gap-1 text-xs ${
                        u.is_active ? "text-green-600" : "text-red-500"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          u.is_active ? "bg-green-500" : "bg-red-400"
                        }`}
                      />
                      {u.is_active ? "활성" : "비활성"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-400 text-xs">
                    {u.last_login_at
                      ? new Date(u.last_login_at).toLocaleString("ko-KR")
                      : "-"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => adminAction(u.id, "toggle")}
                        disabled={actionLoading !== null}
                        className={`px-2 py-1 text-xs rounded disabled:opacity-50 ${
                          u.is_active
                            ? "bg-yellow-50 text-yellow-700 hover:bg-yellow-100"
                            : "bg-green-50 text-green-700 hover:bg-green-100"
                        }`}
                      >
                        {u.is_active ? "비활성화" : "활성화"}
                      </button>
                      <button
                        onClick={() => adminAction(u.id, "revoke")}
                        disabled={actionLoading !== null}
                        className="px-2 py-1 text-xs bg-gray-50 text-gray-600 rounded hover:bg-gray-100 disabled:opacity-50"
                      >
                        세션 만료
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
