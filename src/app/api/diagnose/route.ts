import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * CrawlStation — AI 자가 진단 API
 *
 * POST /api/diagnose — 인스톨러 실패 시 Claude AI가 진단 + 수정 명령 반환
 */

// ── 레이트 리밋 (인메모리) ──
const sessionCalls = new Map<string, { count: number; first: number }>();
const ipCalls = new Map<string, { count: number; first: number }>();

const SESSION_LIMIT = 15;
const IP_LIMIT = 30;
const IP_WINDOW_MS = 60 * 60 * 1000; // 1시간

function checkRateLimit(sessionId: string, ip: string): string | null {
  const now = Date.now();

  // session 체크
  const sess = sessionCalls.get(sessionId);
  if (sess) {
    if (sess.count >= SESSION_LIMIT) return "세션 진단 횟수 초과 (최대 15회)";
    sess.count++;
  } else {
    sessionCalls.set(sessionId, { count: 1, first: now });
  }

  // IP 체크
  const ipEntry = ipCalls.get(ip);
  if (ipEntry) {
    if (now - ipEntry.first > IP_WINDOW_MS) {
      ipCalls.set(ip, { count: 1, first: now });
    } else if (ipEntry.count >= IP_LIMIT) {
      return "IP 진단 횟수 초과 (시간당 최대 30회)";
    } else {
      ipEntry.count++;
    }
  } else {
    ipCalls.set(ip, { count: 1, first: now });
  }

  return null;
}

// ── Claude 시스템 프롬프트 ──
const SYSTEM_PROMPT = `You are a Windows system administrator and Python packaging expert.
You are diagnosing a failed step in the CrawlStation Worker installer on a Windows PC.

The installer uses Python 3.12 embedded (not a full Python install) at C:\\CrawlWorker\\python\\python.exe.
It installs pip via get-pip.py, then uses pip to install playwright and supabase packages,
then downloads Chromium via "python -m playwright install chromium".
Worker files are downloaded from the Station server via HTTP.

CONSTRAINTS on your fix_commands:
- Commands run via cmd.exe (subprocess.run with shell=True on Windows)
- Only use standard Windows commands (dir, del, rmdir, copy, xcopy, reg, netsh, taskkill, curl, powershell)
  and the embedded Python at the provided python_path
- NEVER use format strings, variable interpolation, or template syntax in commands
- NEVER delete system files or modify system-wide settings
- NEVER modify registry keys outside HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run
- Commands must be idempotent (safe to run multiple times)
- Maximum 5 commands per response
- Use the actual python path from the environment info, not a placeholder

Respond in this exact JSON format (no markdown, no code fences):
{
  "diagnosis": "Korean explanation of what went wrong and why",
  "fix_commands": ["cmd1", "cmd2"],
  "should_retry": true,
  "severity": "low|medium|fatal"
}

severity guide:
- "low": transient error (network timeout, temp file lock) - fix and retry
- "medium": environment issue (missing DLL, permission) - fix and retry but may fail again
- "fatal": fundamental incompatibility (32-bit OS, no disk space, no internet after retries) - do not retry`;

// ── 위험 명령 블록리스트 ──
const DANGEROUS_PATTERNS = [
  /\bdel\s+\/s\s+c:\\windows/i,
  /\breg\s+delete\s+hklm/i,
  /\bformat\s+[a-z]:/i,
  /\bdiskpart/i,
  /\brmdir\s+\/s\s+\/q\s+c:\\windows/i,
  /\brmdir\s+\/s\s+\/q\s+c:\\program/i,
  /\bshutdown/i,
  /\bbcdedit/i,
  /\bsfc\s+\/scannow/i,
  /\bnet\s+user/i,
  /\bnet\s+localgroup/i,
  /\$\{/,
  /\$\(/,
  /`/,
  /%[a-z]+%/i, // environment variable expansion in dangerous context
];

function sanitizeCommands(commands: unknown[]): string[] {
  if (!Array.isArray(commands)) return [];

  return commands
    .filter((cmd): cmd is string => typeof cmd === "string")
    .slice(0, 5)
    .filter((cmd) => {
      if (cmd.length > 500) return false;
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(cmd)) return false;
      }
      return true;
    });
}

// ── Supabase에서 API 키 조회 ──
async function getAnthropicKey(): Promise<string | null> {
  try {
    const sb = createServerClient();
    const { data } = await sb
      .from("station_settings")
      .select("value")
      .eq("key", "anthropic_api_key")
      .single();
    if (data?.value) return data.value;
  } catch {
    // Supabase 실패 시 env fallback
  }
  return process.env.ANTHROPIC_API_KEY || null;
}

// ── 메인 핸들러 ──
export async function POST(request: NextRequest) {
  const apiKey = await getAnthropicKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI 진단 서비스가 설정되지 않았습니다. Station 설정에서 Anthropic API 키를 등록하세요." },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sessionId = String(body.session_id || "unknown");
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  // 레이트 리밋
  const limitError = checkRateLimit(sessionId, ip);
  if (limitError) {
    return NextResponse.json({ error: limitError }, { status: 429 });
  }

  // 요청 데이터 추출
  const stepNumber = body.step_number || 0;
  const stepName = body.step_name || "unknown";
  const retryCount = body.retry_count || 0;
  const error = (body.error || {}) as Record<string, string>;
  const env = (body.environment || {}) as Record<string, unknown>;
  const logSoFar = String(body.log_so_far || "").slice(0, 5000);
  const installerVersion = body.installer_version || "unknown";
  const previousFixes = Array.isArray(body.previous_fixes)
    ? (body.previous_fixes as string[]).slice(0, 10)
    : [];

  // Claude 유저 메시지 구성
  const userMessage = `Step ${stepNumber}/9: "${stepName}" failed (retry ${retryCount}/3)

ERROR:
Type: ${String(error.type || "unknown").slice(0, 200)}
Message: ${String(error.message || "").slice(0, 500)}
Traceback:
${String(error.traceback || "").slice(0, 2000)}

STDOUT (last 2000 chars):
${String(error.stdout || "").slice(0, 2000)}

STDERR (last 2000 chars):
${String(error.stderr || "").slice(0, 2000)}

ENVIRONMENT:
OS: ${env.os_version} (${env.os_machine})
Python: ${env.python_path} v${env.python_version}
Pip: ${env.pip_version || "not installed"}
Disk free: ${env.disk_free_gb}GB
Network: ${env.network_ok ? "OK" : "FAIL"}
Install dir: ${env.install_dir}
Contents: ${Array.isArray(env.install_dir_contents) ? (env.install_dir_contents as string[]).join(", ") : "unknown"}
PATH: ${String(env.path_env || "").slice(0, 1000)}
Running python PIDs: ${Array.isArray(env.running_python_pids) ? (env.running_python_pids as string[]).join(", ") : "none"}

Installer version: ${installerVersion}
${previousFixes.length > 0 ? `\nPREVIOUSLY ATTEMPTED FIXES (did not work):\n${previousFixes.join("\n")}` : ""}

INSTALL LOG SO FAR:
${logSoFar}`;

  // Claude API 호출
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
        max_tokens: 1024,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", response.status, errText);
      return NextResponse.json(
        {
          diagnosis: "AI 서비스 일시 오류. 단순 재시도합니다.",
          fix_commands: [],
          should_retry: true,
          severity: "low" as const,
        },
        { status: 200 }
      );
    }

    const result = await response.json();
    const text =
      result.content?.[0]?.type === "text" ? result.content[0].text : "";

    // JSON 파싱
    let parsed: {
      diagnosis?: string;
      fix_commands?: unknown[];
      should_retry?: boolean;
      severity?: string;
    };
    try {
      parsed = JSON.parse(text);
    } catch {
      // JSON 파싱 실패 — 텍스트에서 JSON 추출 시도
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          parsed = {};
        }
      } else {
        parsed = {};
      }
    }

    const diagnosis = String(parsed.diagnosis || "진단 결과를 파싱할 수 없습니다. 재시도합니다.");
    const fixCommands = sanitizeCommands(parsed.fix_commands || []);
    const shouldRetry = parsed.should_retry !== false;
    const severity = ["low", "medium", "fatal"].includes(String(parsed.severity))
      ? (parsed.severity as "low" | "medium" | "fatal")
      : "low";

    return NextResponse.json({
      diagnosis,
      fix_commands: fixCommands,
      should_retry: shouldRetry,
      severity,
    });
  } catch (err) {
    console.error("Diagnose API error:", err);
    return NextResponse.json(
      {
        diagnosis: "AI 진단 서버 연결 실패. 단순 재시도합니다.",
        fix_commands: [],
        should_retry: true,
        severity: "low" as const,
      },
      { status: 200 }
    );
  }
}
