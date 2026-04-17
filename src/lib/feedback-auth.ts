/**
 * 피드백 API용 SSO 사용자 조회 헬퍼
 * Authorization: Bearer <token> 헤더 → SSO /auth/me 검증
 */
import { NextRequest } from "next/server";

const SSO_BASE = process.env.NEXT_PUBLIC_SSO_URL ?? "https://lifenbio-sso.fly.dev";

export interface FeedbackUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export async function getSSOUser(req: NextRequest): Promise<FeedbackUser | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const res = await fetch(`${SSO_BASE}/auth/me`, {
      headers: { Authorization: auth },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
