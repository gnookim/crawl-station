import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * AI 크롤링 회피 분석 — 메타데이터 기반 자동 전략 조정
 *
 * GET /api/ai/analyze — Vercel Cron 또는 수동 호출
 * POST /api/ai/analyze — 즉시 분석 (차단 감지 시 에스컬레이션)
 *
 * 워커별 최근 메타데이터를 분석하여:
 * 1. 차단율/에러율 계산
 * 2. AI에게 전략 조정 요청
 * 3. worker_config 자동 업데이트
 */

const MODEL_MAP: Record<string, string> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-6",
};

async function getAiConfig(sb: ReturnType<typeof createServerClient>) {
  // AI 모델 설정
  const { data: modelSetting } = await sb
    .from("station_settings")
    .select("value")
    .eq("key", "ai_evasion_model")
    .single();
  const model = modelSetting?.value || "haiku";

  // API 키 (워커용 → 인스톨러용 → env fallback)
  let apiKey: string | null = null;
  for (const key of ["anthropic_worker_key", "anthropic_api_key"]) {
    const { data } = await sb
      .from("station_settings")
      .select("value")
      .eq("key", key)
      .single();
    if (data?.value) {
      apiKey = data.value;
      break;
    }
  }
  if (!apiKey) apiKey = process.env.ANTHROPIC_API_KEY || null;

  // 자동 조정 on/off
  const { data: autoSetting } = await sb
    .from("station_settings")
    .select("value")
    .eq("key", "ai_auto_adjust")
    .single();
  const autoAdjust = autoSetting?.value !== "false";

  return { model, apiKey, autoAdjust };
}

async function collectMetrics(sb: ReturnType<typeof createServerClient>) {
  // 최근 1시간 메타데이터
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { data: metadata } = await sb
    .from("crawl_metadata")
    .select("*")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);

  if (!metadata?.length) return null;

  // 워커별 집계
  const workerStats: Record<string, {
    total: number;
    blocked: number;
    captcha: number;
    empty: number;
    errors: number;
    avg_response_ms: number;
    keywords: Set<string>;
  }> = {};

  for (const m of metadata) {
    const wid = m.worker_id;
    if (!workerStats[wid]) {
      workerStats[wid] = {
        total: 0, blocked: 0, captcha: 0, empty: 0, errors: 0,
        avg_response_ms: 0, keywords: new Set(),
      };
    }
    const s = workerStats[wid];
    s.total++;
    if (m.blocked) s.blocked++;
    if (m.captcha) s.captcha++;
    if (m.empty_result) s.empty++;
    if (m.error_type) s.errors++;
    s.avg_response_ms += m.response_time_ms || 0;
    if (m.keyword) s.keywords.add(m.keyword);
  }

  // 평균 계산
  for (const s of Object.values(workerStats)) {
    s.avg_response_ms = s.total > 0 ? Math.round(s.avg_response_ms / s.total) : 0;
  }

  // 워커 config 조회
  const workerIds = Object.keys(workerStats);
  const { data: configs } = await sb
    .from("worker_config")
    .select("id, keyword_delay_min, keyword_delay_max, batch_size, batch_rest_seconds, decoy_probability, ai_auto_adjust")
    .in("id", workerIds);

  return {
    period: "last_1h",
    total_requests: metadata.length,
    worker_stats: Object.fromEntries(
      Object.entries(workerStats).map(([wid, s]) => [wid, {
        ...s,
        keywords: Array.from(s.keywords).slice(0, 20),
        block_rate: s.total > 0 ? Math.round((s.blocked / s.total) * 100) : 0,
        error_rate: s.total > 0 ? Math.round((s.errors / s.total) * 100) : 0,
      }])
    ),
    worker_configs: Object.fromEntries(
      (configs || []).map((c) => [c.id, c])
    ),
  };
}

async function callClaude(apiKey: string, model: string, metrics: Record<string, unknown>) {
  const modelId = MODEL_MAP[model] || MODEL_MAP.haiku;

  const prompt = `네이버 크롤링 시스템의 최근 1시간 메타데이터를 분석해주세요.

## 메트릭
${JSON.stringify(metrics, null, 2)}

## 분석 요청
1. 각 워커별 차단율/에러율을 평가하세요
2. 비정상 패턴을 감지하세요 (같은 키워드만 반복, 응답시간 급증, 차단 급증 등)
3. 다음 설정값 조정을 JSON으로 제안하세요:

응답 형식 (JSON만):
{
  "analysis": "분석 요약 (한국어, 2~3문장)",
  "risk_level": "low|medium|high|critical",
  "adjustments": {
    "worker-xxx": {
      "keyword_delay_min": 숫자,
      "keyword_delay_max": 숫자,
      "batch_size": 숫자,
      "batch_rest_seconds": 숫자,
      "decoy_probability": 0~1 사이 소수
    }
  },
  "recommendations": ["권고사항 목록"]
}

차단율 0% → 현재 설정 유지 (adjustments 비움)
차단율 1~5% → 딜레이 소폭 증가 + decoy 확률 20%
차단율 5~15% → 딜레이 2배 + 배치 크기 절반 + decoy 30%
차단율 15%+ → critical, 해당 워커 즉시 1시간 휴식 권고`;

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

  // JSON 추출
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { analysis: text, risk_level: "unknown", adjustments: {}, recommendations: [] };

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return { analysis: text, risk_level: "unknown", adjustments: {}, recommendations: [] };
  }
}

export async function GET(request: NextRequest) {
  // 인증
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    const { searchParams } = new URL(request.url);
    if (searchParams.get("secret") !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const sb = createServerClient();
  const { model, apiKey, autoAdjust } = await getAiConfig(sb);

  if (!apiKey) {
    return NextResponse.json({
      error: "AI API 키가 설정되지 않았습니다",
      hint: "시스템 설정에서 Anthropic API 키를 등록하세요",
    }, { status: 503 });
  }

  // 메트릭 수집
  const metrics = await collectMetrics(sb);
  if (!metrics) {
    return NextResponse.json({ message: "분석할 메타데이터 없음 (최근 1시간)", model });
  }

  // 차단 없으면 빠른 종료 (비용 절약)
  const hasIssues = Object.values(metrics.worker_stats as Record<string, { block_rate: number; error_rate: number }>)
    .some((s) => s.block_rate > 0 || s.error_rate > 10);

  if (!hasIssues) {
    // 로그만 남기고 AI 호출 안 함
    await sb.from("ai_analysis_log").insert({
      model: "skip",
      trigger_reason: "periodic",
      analysis: "정상 — 차단/에러 없음",
      adjustments: {},
      worker_ids: Object.keys(metrics.worker_stats),
      metadata_count: metrics.total_requests,
    });
    return NextResponse.json({
      status: "정상",
      model: "skip (비용 절약)",
      total_requests: metrics.total_requests,
      message: "차단/에러 없음 — AI 호출 생략",
    });
  }

  // AI 분석
  let escalatedModel = model;
  const maxBlockRate = Math.max(
    ...Object.values(metrics.worker_stats as Record<string, { block_rate: number }>).map((s) => s.block_rate)
  );
  // 차단율 높으면 모델 에스컬레이션
  if (maxBlockRate > 15 && model === "haiku") escalatedModel = "sonnet";
  if (maxBlockRate > 30) escalatedModel = "sonnet";

  const aiResult = await callClaude(apiKey, escalatedModel, metrics);

  // 자동 조정 적용
  let adjustmentsApplied = 0;
  if (autoAdjust && aiResult.adjustments) {
    for (const [wid, changes] of Object.entries(aiResult.adjustments as Record<string, Record<string, unknown>>)) {
      if (!Object.keys(changes).length) continue;
      // ai_auto_adjust가 false인 워커는 스킵
      const workerCfg = (metrics.worker_configs as Record<string, { ai_auto_adjust?: boolean }>)[wid];
      if (workerCfg && workerCfg.ai_auto_adjust === false) continue;

      await sb
        .from("worker_config")
        .upsert({
          id: wid,
          ...changes,
          last_ai_adjustment: new Date().toISOString(),
          updated_by: "ai",
        })
        .eq("id", wid);
      adjustmentsApplied++;
    }
  }

  // 로그 기록
  await sb.from("ai_analysis_log").insert({
    model: escalatedModel,
    trigger_reason: "periodic",
    analysis: aiResult.analysis || "",
    adjustments: aiResult.adjustments || {},
    worker_ids: Object.keys(metrics.worker_stats),
    metadata_count: metrics.total_requests,
  });

  return NextResponse.json({
    status: aiResult.risk_level || "unknown",
    model: escalatedModel,
    analysis: aiResult.analysis,
    adjustments_applied: adjustmentsApplied,
    recommendations: aiResult.recommendations || [],
    total_requests: metrics.total_requests,
    max_block_rate: maxBlockRate,
  });
}

// POST — 즉시 분석 (수동 트리거)
export async function POST() {
  // GET과 동일하게 실행하되 인증 스킵 (Station 내부 호출)
  const sb = createServerClient();
  const { model, apiKey } = await getAiConfig(sb);

  if (!apiKey) {
    return NextResponse.json({ error: "AI API 키 미설정" }, { status: 503 });
  }

  const metrics = await collectMetrics(sb);
  if (!metrics) {
    return NextResponse.json({ message: "분석할 데이터 없음" });
  }

  const aiResult = await callClaude(apiKey, model, metrics);

  await sb.from("ai_analysis_log").insert({
    model,
    trigger_reason: "manual",
    analysis: aiResult.analysis || "",
    adjustments: aiResult.adjustments || {},
    worker_ids: Object.keys(metrics.worker_stats),
    metadata_count: metrics.total_requests,
  });

  return NextResponse.json({
    status: aiResult.risk_level,
    model,
    analysis: aiResult.analysis,
    adjustments: aiResult.adjustments,
    recommendations: aiResult.recommendations,
  });
}
