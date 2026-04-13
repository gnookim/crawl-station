import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * Instagram AI 회피 분석
 *
 * POST /api/ai/analyze-instagram — 즉시 분석 (수동 트리거)
 *
 * instagram_accounts 차단 현황 + 최근 크롤링 결과를 분석하여:
 * 1. 계정별 차단 패턴 감지
 * 2. 워커별 Instagram 크롤링 전략 조정 제안
 * 3. worker_config 자동 업데이트 (insta_ai_auto_adjust = true 시)
 * 4. ai_analysis_log에 platform='instagram' 기록
 */

const MODEL_MAP: Record<string, string> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-6",
};

async function getInstaAiConfig(sb: ReturnType<typeof createServerClient>) {
  const keys = ["insta_ai_model", "ai_evasion_model"];
  let model = "haiku";
  for (const key of keys) {
    const { data } = await sb.from("station_settings").select("value").eq("key", key).single();
    if (data?.value) { model = data.value; break; }
  }

  let apiKey: string | null = null;
  for (const key of ["anthropic_worker_key", "anthropic_api_key"]) {
    const { data } = await sb.from("station_settings").select("value").eq("key", key).single();
    if (data?.value) { apiKey = data.value; break; }
  }
  if (!apiKey) apiKey = process.env.ANTHROPIC_API_KEY || null;

  const { data: autoSetting } = await sb
    .from("station_settings").select("value").eq("key", "insta_ai_auto_adjust").single();
  const autoAdjust = autoSetting?.value !== "false";

  return { model, apiKey, autoAdjust };
}

async function collectInstaMetrics(sb: ReturnType<typeof createServerClient>) {
  const since = new Date(Date.now() - 6 * 3600_000).toISOString(); // 최근 6시간

  // 계정 상태 집계
  const { data: accounts } = await sb
    .from("instagram_accounts")
    .select("id, username, status, assigned_worker_id, block_count, login_count, last_blocked_at, blocked_until")
    .eq("is_active", true);

  if (!accounts?.length) return null;

  const accountStats = {
    total: accounts.length,
    active: accounts.filter(a => a.status === "active").length,
    cooling: accounts.filter(a => a.status === "cooling").length,
    blocked: accounts.filter(a => a.status === "blocked").length,
    banned: accounts.filter(a => a.status === "banned").length,
    recently_blocked: accounts.filter(a =>
      a.last_blocked_at && new Date(a.last_blocked_at) > new Date(since)
    ).length,
  };

  // 워커별 배정 현황
  const workerAccountMap: Record<string, number> = {};
  for (const acc of accounts) {
    const wid = acc.assigned_worker_id || "shared";
    workerAccountMap[wid] = (workerAccountMap[wid] || 0) + 1;
  }

  // 최근 Instagram 크롤링 요청 집계
  const { data: requests } = await sb
    .from("crawl_requests")
    .select("status, worker_id, error_message, created_at")
    .in("type", ["instagram_post", "instagram_profile"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);

  const workerReqStats: Record<string, { total: number; failed: number; errors: string[] }> = {};
  for (const r of requests || []) {
    const wid = r.worker_id || "unknown";
    if (!workerReqStats[wid]) workerReqStats[wid] = { total: 0, failed: 0, errors: [] };
    workerReqStats[wid].total++;
    if (r.status === "failed") {
      workerReqStats[wid].failed++;
      if (r.error_message) workerReqStats[wid].errors.push(r.error_message.slice(0, 100));
    }
  }

  // 에러 중복 제거
  for (const s of Object.values(workerReqStats)) {
    s.errors = [...new Set(s.errors)].slice(0, 5);
  }

  // 고차단 계정 목록 (block_count > 3)
  const highBlockAccounts = accounts
    .filter(a => a.block_count > 3)
    .sort((a, b) => b.block_count - a.block_count)
    .slice(0, 10)
    .map(a => ({ username: a.username, block_count: a.block_count, status: a.status, assigned_worker_id: a.assigned_worker_id }));

  return {
    period: "last_6h",
    account_stats: accountStats,
    worker_account_distribution: workerAccountMap,
    worker_request_stats: Object.fromEntries(
      Object.entries(workerReqStats).map(([wid, s]) => [wid, {
        ...s,
        fail_rate: s.total > 0 ? Math.round((s.failed / s.total) * 100) : 0,
      }])
    ),
    high_block_accounts: highBlockAccounts,
  };
}

async function callClaude(apiKey: string, model: string, metrics: Record<string, unknown>) {
  const modelId = MODEL_MAP[model] || MODEL_MAP.haiku;

  const prompt = `Instagram 크롤링 시스템의 최근 6시간 데이터를 분석해주세요.

## 메트릭
${JSON.stringify(metrics, null, 2)}

## 분석 요청
1. 계정 차단 패턴을 평가하세요 (쿨다운/차단 비율, 최근 차단 급증 여부)
2. 워커별 실패율과 에러 패턴을 분석하세요
3. 고차단 계정에 대한 조치를 제안하세요
4. Instagram 감지 회피를 위한 설정 조정을 제안하세요

응답 형식 (JSON만):
{
  "analysis": "분석 요약 (한국어, 2~3문장)",
  "risk_level": "low|medium|high|critical",
  "adjustments": {
    "worker-xxx": {
      "keyword_delay_min": 숫자(ms),
      "keyword_delay_max": 숫자(ms),
      "batch_size": 숫자,
      "batch_rest_seconds": 숫자
    }
  },
  "account_actions": [
    { "action": "rotate|rest|reassign", "reason": "이유", "target": "계정명 또는 워커ID" }
  ],
  "recommendations": ["권고사항 목록"]
}

차단율 0% → 현재 설정 유지
차단율 5~15% → 딜레이 증가, 배치 크기 감소
차단율 15%+ → critical, 해당 워커 Instagram 작업 일시 중지 권고`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error (${res.status}): ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { analysis: text, risk_level: "unknown", adjustments: {}, recommendations: [] };

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return { analysis: text, risk_level: "unknown", adjustments: {}, recommendations: [] };
  }
}

export async function POST() {
  const sb = createServerClient();
  const { model, apiKey, autoAdjust } = await getInstaAiConfig(sb);

  if (!apiKey) {
    return NextResponse.json({ error: "AI API 키 미설정" }, { status: 503 });
  }

  const metrics = await collectInstaMetrics(sb);
  if (!metrics) {
    return NextResponse.json({ message: "활성 Instagram 계정 없음" });
  }

  // 차단 이슈 없으면 AI 호출 생략
  const hasIssues =
    metrics.account_stats.recently_blocked > 0 ||
    Object.values(metrics.worker_request_stats as Record<string, { fail_rate: number }>)
      .some(s => s.fail_rate > 5);

  if (!hasIssues) {
    await sb.from("ai_analysis_log").insert({
      model: "skip",
      platform: "instagram",
      trigger_reason: "manual",
      analysis: "정상 — 최근 차단/에러 없음",
      adjustments: {},
      worker_ids: Object.keys(metrics.worker_request_stats),
      metadata_count: 0,
    });
    return NextResponse.json({
      status: "정상",
      model: "skip (비용 절약)",
      analysis: "최근 6시간 내 차단/에러 없음 — AI 호출 생략",
      account_stats: metrics.account_stats,
    });
  }

  // AI 분석
  let escalatedModel = model;
  const blockRatio = metrics.account_stats.total > 0
    ? (metrics.account_stats.blocked + metrics.account_stats.cooling) / metrics.account_stats.total
    : 0;
  if (blockRatio > 0.3 && model === "haiku") escalatedModel = "sonnet";

  const aiResult = await callClaude(apiKey, escalatedModel, metrics);

  // 자동 조정 적용
  let adjustmentsApplied = 0;
  if (autoAdjust && aiResult.adjustments) {
    for (const [wid, changes] of Object.entries(aiResult.adjustments as Record<string, Record<string, unknown>>)) {
      if (!Object.keys(changes).length) continue;
      await sb.from("worker_config").upsert({
        id: wid,
        ...changes,
        last_ai_adjustment: new Date().toISOString(),
        updated_by: "ai_instagram",
      }).eq("id", wid);
      adjustmentsApplied++;
    }
  }

  // 로그 기록
  await sb.from("ai_analysis_log").insert({
    model: escalatedModel,
    platform: "instagram",
    trigger_reason: "manual",
    analysis: aiResult.analysis || "",
    adjustments: aiResult.adjustments || {},
    worker_ids: Object.keys(metrics.worker_request_stats),
    metadata_count: metrics.account_stats.total,
  });

  return NextResponse.json({
    status: aiResult.risk_level,
    model: escalatedModel,
    analysis: aiResult.analysis,
    adjustments_applied: adjustmentsApplied,
    account_actions: aiResult.account_actions || [],
    recommendations: aiResult.recommendations || [],
    account_stats: metrics.account_stats,
  });
}
