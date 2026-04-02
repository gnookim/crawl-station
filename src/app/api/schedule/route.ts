import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * 일일 순위 스케줄 관리
 * GET  /api/schedule — 스케줄 목록 (URL 수 포함)
 * POST /api/schedule — 새 스케줄 생성
 */
export async function GET() {
  const sb = createServerClient();
  const { data: schedules } = await sb
    .from("daily_rank_schedules")
    .select("*")
    .order("created_at", { ascending: false });

  // URL 수 집계
  const result = await Promise.all(
    (schedules || []).map(async (s) => {
      const { count } = await sb
        .from("daily_rank_urls")
        .select("id", { count: "exact", head: true })
        .eq("schedule_id", s.id);
      return { ...s, url_count: count || 0 };
    })
  );

  return NextResponse.json({ schedules: result });
}

export async function POST(request: NextRequest) {
  const sb = createServerClient();
  const body = await request.json();
  const { name, worker_count = 2, slots_per_day = 4, slot_hours = [6, 10, 14, 18] } = body;

  if (!name) {
    return NextResponse.json({ error: "name이 필요합니다" }, { status: 400 });
  }

  if (slot_hours.length !== slots_per_day) {
    return NextResponse.json(
      { error: `slot_hours 개수(${slot_hours.length})와 slots_per_day(${slots_per_day})가 일치해야 합니다` },
      { status: 400 }
    );
  }

  const { data, error } = await sb
    .from("daily_rank_schedules")
    .insert({ name, worker_count, slots_per_day, slot_hours })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ schedule: data });
}
