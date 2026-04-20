import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * POST /api/mobile-diagnose
 * Termux 설치 실패 시 Claude AI가 진단 + 수정 bash 명령어 반환
 */

const SYSTEM_PROMPT = `You are an Android Termux expert and Python packaging specialist.
You are diagnosing a failed installation step for lnb-mobile-worker running in Termux on Android.

Termux environment facts:
- Package manager: pkg (never apt, never sudo)
- Python installed via: pkg install python
- No root/sudo needed — user owns home directory
- Home: /data/data/com.termux/files/home (~)
- Install dir: ~/lnb-mobile-worker
- pip command: pip or pip3

Respond in this EXACT JSON format (no markdown, no code fences):
{
  "diagnosis": "Korean explanation (1-2 sentences) of what went wrong and why",
  "fix_command": "single bash command (use && to chain if needed), or empty string if unfixable",
  "should_retry": true
}

fix_command rules:
- Must be Termux-compatible bash (pkg for system packages, pip for Python packages)
- NEVER: rm -rf ~ or rm -rf $HOME or any destructive rm -rf on user dirs
- NEVER: format, mkfs, dd, wget with pipe to sh on unverified URLs
- Max 300 characters total
- Use empty string if no programmatic fix is possible
- set should_retry to false only for fundamental issues (incompatible device, no storage)`;

async function getAnthropicKey(): Promise<string | null> {
  try {
    const sb = createServerClient();
    const { data } = await sb
      .from("station_settings")
      .select("value")
      .eq("key", "anthropic_api_key")
      .single();
    if (data?.value) return data.value as string;
  } catch {}
  return process.env.ANTHROPIC_API_KEY || null;
}

// 위험한 fix_command 차단
function isSafeCommand(cmd: string): boolean {
  const dangerous = [
    /rm\s+-rf\s+[~$]/,
    /rm\s+-rf\s+\/(?!tmp)/,
    /rm\s+-rf\s+\$HOME/,
    /mkfs/i,
    /dd\s+if=/i,
    />\s*\/dev\/sd/i,
  ];
  return !dangerous.some((p) => p.test(cmd));
}

export async function POST(request: NextRequest) {
  const apiKey = await getAnthropicKey();
  if (!apiKey) {
    return NextResponse.json({
      diagnosis: "AI 진단 키가 설정되지 않았습니다.",
      fix_command: "",
      should_retry: true,
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const stepName = String(body.step_name || "unknown");
  const errorOutput = String(body.error_output || "").slice(0, 3000);
  const retryCount = Number(body.retry_count || 0);

  const userMessage = `Installation step failed: "${stepName}" (attempt ${retryCount + 1}/3)

Error output:
${errorOutput}

Diagnose and provide a fix command.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ diagnosis: "AI 서비스 일시 오류. 재시도합니다.", fix_command: "", should_retry: true });
    }

    const result = await response.json();
    const text = result.content?.[0]?.type === "text" ? (result.content[0].text as string) : "";

    let parsed: { diagnosis?: string; fix_command?: string; should_retry?: boolean } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) try { parsed = JSON.parse(m[0]); } catch {}
    }

    const fixCmd = String(parsed.fix_command || "").slice(0, 300);

    return NextResponse.json({
      diagnosis: String(parsed.diagnosis || ""),
      fix_command: isSafeCommand(fixCmd) ? fixCmd : "",
      should_retry: parsed.should_retry !== false,
    });
  } catch {
    return NextResponse.json({ diagnosis: "AI 연결 실패. 재시도합니다.", fix_command: "", should_retry: true });
  }
}
