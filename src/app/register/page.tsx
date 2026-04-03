"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ssoRegister } from "@/lib/sso";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (password.length < 6) {
      setError("비밀번호는 6자 이상이어야 합니다.");
      return;
    }

    setLoading(true);
    try {
      await ssoRegister(email, password, name || undefined);
      setSuccess(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "회원가입에 실패했습니다.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm bg-white rounded-lg border border-gray-200 p-6 text-center">
          <div className="text-3xl mb-3">
            {""}
          </div>
          <h2 className="text-lg font-semibold mb-2">가입 완료</h2>
          <p className="text-sm text-gray-500 mb-4">
            관리자 승인 후 로그인할 수 있습니다.
          </p>
          <button
            onClick={() => router.push("/login")}
            className="w-full bg-blue-600 text-white rounded-md px-3 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            로그인 페이지로 이동
          </button>
        </div>
      </div>
    );
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
          <h2 className="text-lg font-semibold text-center">회원가입</h2>

          {error && (
            <p className="text-red-500 text-sm text-center bg-red-50 rounded p-2">
              {error}
            </p>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="홍길동"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              이메일 *
            </label>
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
              비밀번호 *
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="6자 이상"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              비밀번호 확인 *
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-md px-3 py-2 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? "가입 중..." : "회원가입"}
          </button>

          <p className="text-xs text-center text-gray-400">
            이미 계정이 있나요?{" "}
            <Link
              href="/login"
              className="text-blue-600 hover:underline"
            >
              로그인
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
