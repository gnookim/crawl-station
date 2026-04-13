import { NextRequest, NextResponse } from "next/server";

const SSO_BASE =
  process.env.SSO_URL ?? "https://lifenbio-sso.fly.dev";

// POST /api/users/[userId]  body: { action: "approve"|"reject"|"suspend"|"toggle"|"revoke" }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;
  const { action } = await req.json().catch(() => ({}));

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

  if (!methodMap[action]) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const res = await fetch(`${SSO_BASE}${pathMap[action]}`, {
    method: methodMap[action],
    headers: { Authorization: authHeader },
  });

  const body = await res.json().catch(() => ({}));
  return NextResponse.json(body, { status: res.status });
}
