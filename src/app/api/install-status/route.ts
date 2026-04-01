import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * CrawlStation — 설치 세션 모니터링 API
 *
 * POST /api/install-status — 인스톨러가 진행 상태 보고
 * GET  /api/install-status — 활성/최근 설치 세션 조회
 */

export async function POST(request: NextRequest) {
  const sb = createServerClient();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sessionId = String(body.session_id || "");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id 필수" }, { status: 400 });
  }

  const action = String(body.action || "update");

  if (action === "start") {
    // 설치 시작
    const { error } = await sb.from("install_sessions").upsert(
      {
        id: sessionId,
        hostname: body.hostname || null,
        os_version: body.os_version || null,
        os_machine: body.os_machine || null,
        installer_version: body.installer_version || null,
        current_step: 0,
        current_step_name: "시작",
        status: "starting",
        failed_steps: [],
        diagnosis_count: 0,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "step") {
    // 단계 진행
    const { error } = await sb
      .from("install_sessions")
      .update({
        current_step: body.step_number || 0,
        current_step_name: body.step_name || "",
        status: "in_progress",
        log_tail: String(body.log_tail || "").slice(0, 2000),
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "diagnosing") {
    // AI 진단 중
    const { error } = await sb
      .from("install_sessions")
      .update({
        status: "diagnosing",
        diagnosis_count: (body.diagnosis_count as number) || 0,
        last_diagnosis: String(body.diagnosis || "").slice(0, 500),
        log_tail: String(body.log_tail || "").slice(0, 2000),
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "step_done") {
    // 단계 완료/실패
    const updateData: Record<string, unknown> = {
      status: body.success ? "in_progress" : "step_failed",
      log_tail: String(body.log_tail || "").slice(0, 2000),
      updated_at: new Date().toISOString(),
    };

    if (!body.success && body.step_name) {
      // failed_steps 배열에 추가 — RPC 없이 select + update
      const { data: curr } = await sb
        .from("install_sessions")
        .select("failed_steps")
        .eq("id", sessionId)
        .single();
      const arr = Array.isArray(curr?.failed_steps) ? curr.failed_steps : [];
      arr.push(String(body.step_name));
      updateData.failed_steps = arr;
    }

    const { error } = await sb
      .from("install_sessions")
      .update(updateData)
      .eq("id", sessionId);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "complete") {
    // 설치 완료
    const { error } = await sb
      .from("install_sessions")
      .update({
        status: body.success ? "completed" : "failed",
        log_tail: String(body.log_tail || "").slice(0, 2000),
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

export async function GET() {
  const sb = createServerClient();

  // 최근 24시간 내 세션 또는 아직 진행 중인 세션
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await sb
    .from("install_sessions")
    .select("*")
    .or(`started_at.gte.${cutoff},status.in.(starting,in_progress,diagnosing,step_failed)`)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 활성/비활성 분류
  const now = Date.now();
  const sessions = (data || []).map((s) => ({
    ...s,
    is_active: ["starting", "in_progress", "diagnosing", "step_failed"].includes(s.status) &&
      s.updated_at &&
      now - new Date(s.updated_at).getTime() < 60000, // 60초 내 업데이트
  }));

  return NextResponse.json({
    total: sessions.length,
    active: sessions.filter((s) => s.is_active).length,
    sessions,
  });
}
