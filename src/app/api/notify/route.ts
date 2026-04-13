import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * 공통 알림 발송 API
 *
 * POST /api/notify
 * body: { type: "block"|"warning"|"daily", title, message, meta? }
 *
 * station_settings에서 채널 설정 로드:
 *   notify_slack_webhook
 *   notify_telegram_token + notify_telegram_chat_id
 *   notify_kakao_webhook
 */

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { type = "warning", title, message, meta } = body;

  if (!title || !message) {
    return NextResponse.json({ error: "title, message 필요" }, { status: 400 });
  }

  const sb = createServerClient();
  const { data: rows } = await sb
    .from("station_settings")
    .select("key, value")
    .in("key", [
      "notify_slack_webhook",
      "notify_telegram_token",
      "notify_telegram_chat_id",
      "notify_kakao_webhook",
    ]);

  const cfg: Record<string, string> = {};
  for (const r of rows || []) if (r.value) cfg[r.key] = r.value;

  const emoji = type === "block" ? "🚨" : type === "daily" ? "📊" : "⚠️";
  const results: Record<string, unknown> = {};

  // ── Slack ──
  if (cfg.notify_slack_webhook) {
    try {
      const res = await fetch(cfg.notify_slack_webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `${emoji} *${title}*\n${message}`,
          ...(meta ? { attachments: [{ text: JSON.stringify(meta, null, 2), color: type === "block" ? "danger" : "warning" }] } : {}),
        }),
      });
      results.slack = res.ok ? "ok" : `error ${res.status}`;
    } catch (e) {
      results.slack = `error: ${String(e).slice(0, 80)}`;
    }
  }

  // ── Telegram ──
  if (cfg.notify_telegram_token && cfg.notify_telegram_chat_id) {
    try {
      const text = `${emoji} <b>${title}</b>\n${message}${meta ? `\n<pre>${JSON.stringify(meta, null, 2).slice(0, 300)}</pre>` : ""}`;
      const res = await fetch(
        `https://api.telegram.org/bot${cfg.notify_telegram_token}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: cfg.notify_telegram_chat_id,
            text,
            parse_mode: "HTML",
          }),
        }
      );
      results.telegram = res.ok ? "ok" : `error ${res.status}`;
    } catch (e) {
      results.telegram = `error: ${String(e).slice(0, 80)}`;
    }
  }

  // ── 카카오워크 ──
  if (cfg.notify_kakao_webhook) {
    try {
      const res = await fetch(cfg.notify_kakao_webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `${emoji} ${title}\n${message}` }),
      });
      results.kakao = res.ok ? "ok" : `error ${res.status}`;
    } catch (e) {
      results.kakao = `error: ${String(e).slice(0, 80)}`;
    }
  }

  const sent = Object.keys(results).length;
  return NextResponse.json({ ok: sent > 0, sent, results });
}
