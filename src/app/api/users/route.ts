/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

const SSO_BASE =
  process.env.SSO_URL ?? "https://lifenbio-sso.fly.dev";
const APP_SLUG = process.env.APP_SLUG ?? "crawl-station";
const SSO_APP_SECRET = process.env.SSO_APP_SECRET ?? "";

// GET /api/users — crawl-station 멤버(승인됨) + 대기중 반환
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let approvedMembers: any[] = [];

  if (SSO_APP_SECRET) {
    // Secret Key로 이 앱 멤버만 조회
    const res = await fetch(`${SSO_BASE}/app/members`, {
      headers: { "X-Secret-Key": SSO_APP_SECRET },
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json().catch(() => []);
      approvedMembers = (Array.isArray(data) ? data : []).map((m: any) => ({
        id: m.id,
        email: m.email,
        name: m.name ?? null,
        role: m.role ?? "user",
        is_active: true,
        is_approved: true,
        status: "approved",
        created_at: m.granted_at ?? m.created_at,
        last_login_at: m.last_login ?? null,
      }));
    }
  } else {
    // Secret Key 없으면 admin JWT로 이 앱 멤버만 조회
    const res = await fetch(`${SSO_BASE}/admin/apps/${APP_SLUG}/members`, {
      headers: { Authorization: authHeader },
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      approvedMembers = (data.members ?? []).map((m: any) => ({
        id: m.user_id,
        email: m.email,
        name: m.name ?? null,
        role: m.sso_role ?? "user",
        is_active: !m.revoked,
        is_approved: true,
        status: m.revoked ? "suspended" : "approved",
        created_at: m.granted_at,
        last_login_at: m.last_login ?? null,
      }));
    }
  }

  // 대기중 사용자 (이 앱으로 가입 요청한 사람만)
  let pendingMembers: any[] = [];
  const pendingRes = await fetch(
    `${SSO_BASE}/admin/pending-users?app_slug=${APP_SLUG}`,
    {
      headers: { Authorization: authHeader },
      cache: "no-store",
    }
  );
  if (pendingRes.ok) {
    const pendingData = await pendingRes.json().catch(() => []);
    const approvedIds = new Set(approvedMembers.map((m) => m.id));
    pendingMembers = (Array.isArray(pendingData) ? pendingData : [])
      .filter((u: any) => !approvedIds.has(u.id))
      .map((u: any) => ({
        id: u.id,
        email: u.email,
        name: u.name ?? null,
        role: "user",
        is_active: false,
        is_approved: false,
        status: "pending",
        created_at: u.created_at,
        last_login_at: null,
      }));
  }

  return NextResponse.json({
    members: approvedMembers,
    pending: pendingMembers,
  });
}
