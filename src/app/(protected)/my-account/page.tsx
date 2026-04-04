"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthGuard";
import { getAuthHeaders, ssoLogout, type SSOUser } from "@/lib/sso";

const SSO_BASE =
  process.env.NEXT_PUBLIC_SSO_URL ?? "https://lifenbio-sso.fly.dev";

export default function MyAccountPage() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [myApps, setMyApps] = useState<{ app_id: string; app_name: string; last_used: string | null }[]>([]);

  useEffect(() => {
    if (user) {
      setName(user.name || "");
    }
    // 내 앱 목록
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`${SSO_BASE}/user/my-apps`, { headers });
        if (res.ok) {
          const data = await res.json();
          setMyApps(Array.isArray(data) ? data : data.apps || []);
        }
      } catch {
        // ignore
      }
    })();
  }, [user]);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const headers = {
        ...(await getAuthHeaders()),
        "Content-Type": "application/json",
      };
      const res = await fetch(`${SSO_BASE}/auth/me`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setMessage("저장되었습니다.");
        await refreshUser();
      } else {
        const err = await res.json().catch(() => ({}));
        setMessage(`실패: ${err.detail || res.statusText}`);
      }
    } catch (e) {
      setMessage(`오류: ${e instanceof Error ? e.message : String(e)}`);
    }
    setSaving(false);
  }

  async function handleLogout() {
    await ssoLogout();
    router.push("/login");
  }

  if (!user) return null;

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-xl font-bold mb-6">내 계정</h2>

      {/* 프로필 */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">프로필</h3>
        <form onSubmit={handleSaveName} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">이메일</label>
            <input
              type="email"
              value={user.email}
              disabled
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50 text-gray-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="이름을 입력하세요"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
            {message && (
              <span className={`text-xs ${message.startsWith("실패") || message.startsWith("오류") ? "text-red-500" : "text-green-600"}`}>
                {message}
              </span>
            )}
          </div>
        </form>
      </div>

      {/* 계정 정보 */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">계정 정보</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">역할</span>
            <span className={`px-1.5 py-0.5 rounded text-xs ${
              user.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"
            }`}>
              {user.role}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">상태</span>
            <span className={`text-xs ${user.is_active ? "text-green-600" : "text-red-500"}`}>
              {user.is_active ? "활성" : "비활성"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">가입일</span>
            <span className="text-xs text-gray-400">
              {new Date(user.created_at).toLocaleDateString("ko-KR")}
            </span>
          </div>
        </div>
      </div>

      {/* 연결된 앱 */}
      {myApps.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">연결된 앱</h3>
          <div className="space-y-2">
            {myApps.map((app) => (
              <div key={app.app_id} className="flex justify-between text-sm">
                <span className="text-gray-700">{app.app_name || app.app_id}</span>
                <span className="text-xs text-gray-400">
                  {app.last_used
                    ? new Date(app.last_used).toLocaleDateString("ko-KR")
                    : "-"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 로그아웃 */}
      <button
        onClick={handleLogout}
        className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
      >
        로그아웃
      </button>
    </div>
  );
}
