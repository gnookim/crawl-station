import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * CrawlStation — 시스템 설정 API
 *
 * GET  /api/settings         — 전체 설정 조회
 * GET  /api/settings?key=xxx — 특정 키 조회
 * POST /api/settings         — 설정 저장 (upsert)
 */

export async function GET(request: NextRequest) {
  const sb = createServerClient();
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  if (key) {
    const { data, error } = await sb
      .from("station_settings")
      .select("key, value, updated_at")
      .eq("key", key)
      .single();

    if (error) {
      return NextResponse.json({ key, value: null });
    }

    // API 키는 마스킹해서 반환
    const masked = key.includes("api_key") && data.value
      ? data.value.slice(0, 10) + "..." + data.value.slice(-4)
      : data.value;

    return NextResponse.json({ key: data.key, value: masked, updated_at: data.updated_at });
  }

  const { data, error } = await sb
    .from("station_settings")
    .select("key, value, updated_at")
    .order("key");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // API 키 마스킹
  const settings = (data || []).map((s) => ({
    ...s,
    value: s.key.includes("api_key") && s.value
      ? s.value.slice(0, 10) + "..." + s.value.slice(-4)
      : s.value,
  }));

  return NextResponse.json({ settings });
}

export async function POST(request: NextRequest) {
  const sb = createServerClient();

  let body: { key?: string; value?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { key, value } = body;
  if (!key) {
    return NextResponse.json({ error: "key 필수" }, { status: 400 });
  }

  const { error } = await sb
    .from("station_settings")
    .upsert(
      { key, value: value || null, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, key });
}
