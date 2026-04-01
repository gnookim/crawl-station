import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * POST /api/diagnose/test — Anthropic API 키 연결 테스트
 */
export async function POST() {
  // Supabase에서 키 조회
  const sb = createServerClient();
  const { data } = await sb
    .from("station_settings")
    .select("value")
    .eq("key", "anthropic_api_key")
    .single();

  const apiKey = data?.value || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Anthropic API 키가 설정되지 않았습니다" },
      { status: 200 }
    );
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 10,
        messages: [{ role: "user", content: "ping" }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({
        ok: false,
        error: `API 오류 (${response.status}): ${errText.slice(0, 200)}`,
      });
    }

    const result = await response.json();
    return NextResponse.json({
      ok: true,
      model: result.model || "claude-sonnet-4-20250514",
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: "연결 실패: " + String(err),
    });
  }
}
