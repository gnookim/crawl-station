import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * API 키 인증
 * X-API-Key 헤더 또는 ?api_key= 쿼리 파라미터에서 키를 추출하여 검증
 */
export async function authenticateApiKey(
  request: NextRequest
): Promise<{ appId: string; appName: string } | null> {
  const apiKey =
    request.headers.get("x-api-key") ||
    new URL(request.url).searchParams.get("api_key");

  if (!apiKey) return null;

  const sb = createServerClient();
  const { data } = await sb
    .from("connected_apps")
    .select("id, name, is_active, total_requests")
    .eq("api_key", apiKey)
    .single();

  if (!data || !data.is_active) return null;

  // 사용량 + 1, last_used_at 갱신 (fire and forget)
  sb.from("connected_apps")
    .update({
      total_requests: (data.total_requests || 0) + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq("id", data.id)
    .then(() => {});

  return { appId: data.id, appName: data.name };
}
