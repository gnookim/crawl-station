import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * Instagram 계정 관리 API
 *
 * GET    /api/instagram-accounts            — 계정 목록 (password 제외)
 * POST   /api/instagram-accounts            — 계정 등록
 * PATCH  /api/instagram-accounts?id=xxx     — 계정 수정
 * DELETE /api/instagram-accounts?id=xxx     — 계정 삭제
 *
 * 내부 전용 (워커 → Station):
 * POST /api/instagram-accounts?action=pick       — 사용 가능한 계정 1개 반환 (password 포함)
 * POST /api/instagram-accounts?action=session    — storageState 저장
 * POST /api/instagram-accounts?action=block      — 계정 차단 처리
 */

export async function GET() {
  const sb = createServerClient();
  const { data, error } = await sb
    .from("instagram_accounts")
    .select("id, username, email, phone, team, creator, is_active, status, last_login_at, last_used_at, last_blocked_at, blocked_until, assigned_worker_id, login_count, block_count, note, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ accounts: data || [] });
}

export async function POST(request: NextRequest) {
  const sb = createServerClient();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const body = await request.json();

  // ── 워커 전용: 사용 가능한 계정 1개 반환 ──
  if (action === "pick") {
    const { worker_id } = body;
    // 우선순위: 해당 워커 전용 → 공용 (status=active, is_active=true)
    const { data } = await sb
      .from("instagram_accounts")
      .select("id, username, password, session_state")
      .eq("is_active", true)
      .eq("status", "active")
      .or(`assigned_worker_id.eq.${worker_id},assigned_worker_id.is.null`)
      .order("last_used_at", { ascending: true, nullsFirst: true })
      .limit(1)
      .single();

    if (!data) return NextResponse.json({ error: "사용 가능한 계정 없음" }, { status: 404 });
    // last_used_at 갱신
    await sb.from("instagram_accounts").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
    return NextResponse.json({ account: data });
  }

  // ── 워커 전용: storageState 저장 ──
  if (action === "session") {
    const { account_id, session_state } = body;
    if (!account_id) return NextResponse.json({ error: "account_id 필요" }, { status: 400 });
    await sb.from("instagram_accounts").update({
      session_state,
      last_login_at: new Date().toISOString(),
    }).eq("id", account_id);
    // login_count increment
    try { await sb.rpc("increment_instagram_login", { p_id: account_id }); } catch { /* ignore */ }
    return NextResponse.json({ ok: true });
  }

  // ── 워커 전용: 차단 보고 ──
  if (action === "block") {
    const { account_id, cooldown_minutes = 120, worker_id: wid } = body;
    if (!account_id) return NextResponse.json({ error: "account_id 필요" }, { status: 400 });
    const blockedUntil = new Date(Date.now() + cooldown_minutes * 60 * 1000).toISOString();

    // 계정 이름 조회 후 업데이트
    const { data: acc } = await sb
      .from("instagram_accounts")
      .select("username, block_count")
      .eq("id", account_id)
      .single();

    await sb.from("instagram_accounts").update({
      status: "cooling",
      last_blocked_at: new Date().toISOString(),
      blocked_until: blockedUntil,
      session_state: null,
    }).eq("id", account_id);
    try { await sb.rpc("increment_instagram_block", { p_id: account_id }); } catch { /* ignore */ }

    // 알림 발송 (비동기, 실패 무시)
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
      fetch(`${baseUrl}/api/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "block",
          title: `Instagram 계정 차단 — @${acc?.username || account_id}`,
          message: `차단 횟수: ${(acc?.block_count || 0) + 1}회 | 쿨다운: ${cooldown_minutes}분${wid ? ` | 워커: ${String(wid).slice(0, 12)}` : ""}`,
        }),
      }).catch(() => null);
    } catch { /* ignore */ }

    return NextResponse.json({ ok: true, blocked_until: blockedUntil });
  }

  // ── 계정 등록 ──
  const { username, password, note, assigned_worker_id, email, phone, team, creator } = body;
  if (!username?.trim() || !password?.trim()) {
    return NextResponse.json({ error: "username, password 필요" }, { status: 400 });
  }

  // 신규 컬럼 포함해서 시도, 없으면 기본 필드만으로 fallback
  let { data, error } = await sb
    .from("instagram_accounts")
    .insert({
      username: username.trim(),
      password: password.trim(),
      note: note?.trim() || null,
      assigned_worker_id: assigned_worker_id?.trim() || null,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      team: team?.trim() || null,
      creator: creator?.trim() || null,
    })
    .select("id, username, is_active, status, note, assigned_worker_id, created_at")
    .single();

  if (error?.message?.includes("schema cache")) {
    // 마이그레이션 미적용 환경 — 기본 필드만으로 재시도
    const fallback = await sb
      .from("instagram_accounts")
      .insert({
        username: username.trim(),
        password: password.trim(),
        note: note?.trim() || null,
        assigned_worker_id: assigned_worker_id?.trim() || null,
      })
      .select("id, username, is_active, status, note, assigned_worker_id, created_at")
      .single();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: `@${username} 등록 완료 (마이그레이션 적용 후 이메일·전화·팀·생성자 저장 가능)`, account: data });
}

export async function PATCH(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id 필요" }, { status: 400 });

  const sb = createServerClient();
  const body = await request.json();

  const updates: Record<string, unknown> = {};
  if (body.is_active !== undefined) updates.is_active = body.is_active;
  if (body.status !== undefined) updates.status = body.status;
  if (body.note !== undefined) updates.note = body.note;
  if (body.password !== undefined) updates.password = body.password;
  if (body.assigned_worker_id !== undefined) updates.assigned_worker_id = body.assigned_worker_id || null;
  if (body.email !== undefined) updates.email = body.email || null;
  if (body.phone !== undefined) updates.phone = body.phone || null;
  if (body.team !== undefined) updates.team = body.team || null;
  if (body.creator !== undefined) updates.creator = body.creator || null;
  if (body.clear_session) { updates.session_state = null; updates.last_login_at = null; }
  if (body.clear_block) { updates.status = "active"; updates.blocked_until = null; updates.last_blocked_at = null; }

  let { error } = await sb.from("instagram_accounts").update(updates).eq("id", id);

  if (error?.message?.includes("schema cache")) {
    // 신규 컬럼 제거 후 재시도
    const safeUpdates = { ...updates };
    delete safeUpdates.email; delete safeUpdates.phone;
    delete safeUpdates.team;  delete safeUpdates.creator;
    const fallback = await sb.from("instagram_accounts").update(safeUpdates).eq("id", id);
    error = fallback.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: "수정 완료" });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id 필요" }, { status: 400 });

  const sb = createServerClient();
  const { error } = await sb.from("instagram_accounts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: "삭제 완료" });
}
