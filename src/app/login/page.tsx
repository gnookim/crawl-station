"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ssoLogin } from "@/lib/sso";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await ssoLogin(email, password);
      router.push("/");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "로그인에 실패했습니다.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">CrawlStation</h1>
          <p className="text-sm text-gray-500 mt-1">크롤링 관제 시스템</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-lg border border-gray-200 p-6 space-y-4"
        >
          <h2 className="text-lg font-semibold text-center">로그인</h2>

          {error && (
            <p className="text-red-500 text-sm text-center bg-red-50 rounded p-2">
              {error}
            </p>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="user@company.com"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              비밀번호
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-md px-3 py-2 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>

          <p className="text-xs text-center text-gray-400">
            계정이 없나요?{" "}
            <Link
              href="/register"
              className="text-blue-600 hover:underline"
            >
              회원가입
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
