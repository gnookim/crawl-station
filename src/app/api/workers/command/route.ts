import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * 워커 원격 제어 API
 *
 * POST /api/workers/command
 * body: {
 *   worker_ids: string[],         // 대상 워커 ID 목록 (빈 배열 = 전체)
 *   command: "stop" | "restart" | "update"
 * }
 */
export async function POST(request: NextRequest) {
  const sb = createServerClient();
  const body = await request.json();
  const { worker_ids, command } = body;

  const validCommands = ["stop", "restart", "update"];
  if (!command || !validCommands.includes(command)) {
    return NextResponse.json(
      { error: `command는 ${validCommands.join(", ")} 중 하나여야 합니다` },
      { status: 400 }
    );
  }

  // 대상 결정: worker_ids가 비어있으면 활성 워커 전체
  let targetIds: string[] = worker_ids || [];

  if (targetIds.length === 0) {
    const { data } = await sb
      .from("workers")
      .select("id")
      .in("status", ["online", "idle", "crawling"]);
    targetIds = (data || []).map((w: { id: string }) => w.id);
  }

  if (targetIds.length === 0) {
    return NextResponse.json(
      { error: "활성 워커가 없습니다" },
      { status: 404 }
    );
  }

  // 명령 전달
  const { error } = await sb
    .from("workers")
    .update({ command })
    .in("id", targetIds);

  if (error) {
    return NextResponse.json(
      { error: `명령 전달 실패: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: `${targetIds.length}대 워커에 "${command}" 명령 전달`,
    worker_ids: targetIds,
  });
}
