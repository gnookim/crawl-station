import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * 일일 순위 스케줄 디스패치 — Vercel Cron에서 매시간 호출
 *
 * GET /api/cron/daily-rank
 * 인증: CRON_SECRET 또는 수동 호출 시 X-API-Key
 *
 * 현재 KST 시간이 스케줄의 slot_hours에 포함되면 해당 배치를 디스패치
 */
export async function GET(request: NextRequest) {
  // 인증: Vercel Cron의 Authorization 헤더 또는 수동 호출
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // 수동 호출 허용 (쿼리 파라미터)
    const { searchParams } = new URL(request.url);
    if (searchParams.get("secret") !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const sb = createServerClient();

  // 현재 KST 시간
  const kstNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );
  const kstHour = kstNow.getHours();
  const kstDate = kstNow.toISOString().slice(0, 10); // YYYY-MM-DD

  // 활성 스케줄 조회
  const { data: schedules } = await sb
    .from("daily_rank_schedules")
    .select("*")
    .eq("is_active", true);

  if (!schedules?.length) {
    return NextResponse.json({ message: "활성 스케줄 없음", hour: kstHour });
  }

  const results = [];

  for (const schedule of schedules) {
    const slotHours: number[] = schedule.slot_hours || [];
    const slotIndex = slotHours.indexOf(kstHour);

    // 이 시간이 스케줄에 없으면 스킵
    if (slotIndex === -1) continue;

    // 이미 디스패치했는지 확인 (중복 방지)
    const { data: existing } = await sb
      .from("daily_rank_dispatch_log")
      .select("id")
      .eq("schedule_id", schedule.id)
      .eq("dispatch_date", kstDate)
      .eq("slot_hour", kstHour)
      .limit(1);

    if (existing?.length) {
      results.push({
        schedule: schedule.name,
        status: "이미 디스패치됨",
        slot: kstHour,
      });
      continue;
    }

    // URL 목록 조회
    const { data: urls } = await sb
      .from("daily_rank_urls")
      .select("url, keyword")
      .eq("schedule_id", schedule.id);

    if (!urls?.length) {
      results.push({
        schedule: schedule.name,
        status: "URL 없음",
      });
      continue;
    }

    // 슬롯별 배치 분할
    const totalSlots = slotHours.length;
    const chunkSize = Math.ceil(urls.length / totalSlots);
    const start = slotIndex * chunkSize;
    const chunk = urls.slice(start, start + chunkSize);

    if (!chunk.length) {
      results.push({
        schedule: schedule.name,
        status: "이 슬롯에 할당된 URL 없음",
        slot: kstHour,
      });
      continue;
    }

    // 활성 워커 조회 (quota 여유 있는)
    const cutoff = new Date(Date.now() - 15000).toISOString();
    const { data: activeWorkers } = await sb
      .from("workers")
      .select("id")
      .in("status", ["idle", "crawling", "online"])
      .gte("last_seen", cutoff)
      .order("id");

    const workerIds = (activeWorkers || [])
      .map((w) => w.id)
      .slice(0, schedule.worker_count);

    // 태스크 생성
    const BATCH_SIZE = 500;
    let tasksCreated = 0;

    for (let i = 0; i < chunk.length; i += BATCH_SIZE) {
      const batch = chunk.slice(i, i + BATCH_SIZE);
      const rows = batch.map((item, idx) => ({
        keyword: item.keyword,
        type: "daily_rank",
        options: {
          target_url: item.url,
          check_tabs: ["integrated", "blog_tab"],
          schedule_id: schedule.id,
        },
        status: workerIds.length
          ? ("assigned" as const)
          : ("pending" as const),
        assigned_worker: workerIds.length
          ? workerIds[(i + idx) % workerIds.length]
          : null,
        priority: 1,
      }));

      await sb.from("crawl_requests").insert(rows);
      tasksCreated += rows.length;
    }

    // quota 증가
    if (workerIds.length) {
      const perWorker = Math.ceil(tasksCreated / workerIds.length);
      for (const wid of workerIds) {
        for (let j = 0; j < perWorker; j++) {
          await sb.rpc("increment_daily_used", { wid });
        }
      }
    }

    // 디스패치 로그 기록
    await sb.from("daily_rank_dispatch_log").insert({
      schedule_id: schedule.id,
      dispatch_date: kstDate,
      slot_hour: kstHour,
      tasks_created: tasksCreated,
    });

    results.push({
      schedule: schedule.name,
      status: "디스패치 완료",
      slot: kstHour,
      tasks_created: tasksCreated,
      workers: workerIds.length,
    });
  }

  return NextResponse.json({
    kst_hour: kstHour,
    kst_date: kstDate,
    dispatched: results,
  });
}
