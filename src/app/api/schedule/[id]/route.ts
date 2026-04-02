import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const sb = createServerClient();

  const { data: schedule } = await sb
    .from("daily_rank_schedules")
    .select("*")
    .eq("id", id)
    .single();

  if (!schedule) {
    return NextResponse.json({ error: "스케줄을 찾을 수 없습니다" }, { status: 404 });
  }

  const { count } = await sb
    .from("daily_rank_urls")
    .select("id", { count: "exact", head: true })
    .eq("schedule_id", id);

  // 오늘 디스패치 로그
  const kstDate = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  ).toISOString().slice(0, 10);

  const { data: logs } = await sb
    .from("daily_rank_dispatch_log")
    .select("*")
    .eq("schedule_id", id)
    .eq("dispatch_date", kstDate)
    .order("slot_hour");

  return NextResponse.json({
    schedule: { ...schedule, url_count: count || 0 },
    today_dispatches: logs || [],
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const sb = createServerClient();
  const body = await request.json();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.is_active !== undefined) updates.is_active = body.is_active;
  if (body.worker_count !== undefined) updates.worker_count = body.worker_count;
  if (body.slots_per_day !== undefined) updates.slots_per_day = body.slots_per_day;
  if (body.slot_hours !== undefined) updates.slot_hours = body.slot_hours;

  const { error } = await sb
    .from("daily_rank_schedules")
    .update(updates)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "스케줄 업데이트 완료" });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const sb = createServerClient();

  await sb.from("daily_rank_schedules").delete().eq("id", id);

  return NextResponse.json({ message: "스케줄 삭제 완료" });
}
