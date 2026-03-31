import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * 크롤링 워커 다운로드 API
 *
 * GET /api/download             — Python 인스톨러 (Windows/Linux)
 * GET /api/download?type=mac    — Mac 설치형 .command 스크립트
 * GET /api/download?file=xxx    — 최신 릴리즈에서 개별 파일 서빙
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fileParam = searchParams.get("file");
  const typeParam = searchParams.get("type");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseKey =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";
  const stationUrl = "https://crawl-station.vercel.app";

  // ── 개별 파일 서빙 (최신 릴리즈에서) ──
  if (fileParam) {
    const sb = createServerClient();
    const { data } = await sb
      .from("worker_releases")
      .select("files")
      .eq("is_latest", true)
      .limit(1)
      .single();

    if (!data?.files || !(fileParam in data.files)) {
      return NextResponse.json(
        { error: `파일을 찾을 수 없습니다: ${fileParam}` },
        { status: 404 }
      );
    }

    return new NextResponse(data.files[fileParam], {
      headers: {
        "Content-Type": "text/x-python; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileParam.split("/").pop()}"`,
      },
    });
  }

  // ── Mac 설치형 .command 스크립트 ──
  if (typeParam === "mac") {
    const macScript = `#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  CrawlStation — Mac 워커 원클릭 설치
#  더블클릭 한 번이면 설치 + 자동 실행 + 부팅 시 자동 시작
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
set -e

INSTALL_DIR="$HOME/CrawlWorker"
STATION_URL="${stationUrl}"
SUPABASE_URL="${supabaseUrl}"
SUPABASE_KEY="${supabaseKey}"
PLIST_LABEL="com.crawlstation.worker"
PLIST_PATH="$HOME/Library/LaunchAgents/\${PLIST_LABEL}.plist"
LOG_DIR="\${INSTALL_DIR}/logs"
PYTHON3=$(which python3)

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  CrawlStation — 크롤링 워커 설치 (Mac)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Python 확인
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3이 설치되어 있지 않습니다"
    echo "   brew install python3 으로 설치해주세요"
    read -p "아무 키나 누르면 종료..."
    exit 1
fi

PY_VER=\$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "✅ Python \${PY_VER}"

# 설치 디렉토리
mkdir -p "\${INSTALL_DIR}/handlers" "\${LOG_DIR}"
echo "📁 \${INSTALL_DIR}"

# 패키지 설치
echo ""
echo "📦 패키지 설치..."
python3 -m pip install --quiet playwright supabase 2>/dev/null || \\
python3 -m pip install --quiet --break-system-packages playwright supabase 2>/dev/null
echo "  ✅ playwright, supabase"

# Chromium 설치
echo ""
echo "🌐 Chromium 설치... (1~2분 소요될 수 있음)"
python3 -m playwright install chromium 2>/dev/null && echo "  ✅ 완료" || echo "  ⚠️ 수동: python3 -m playwright install chromium"

# 워커 파일 다운로드 (최신 릴리즈)
echo ""
echo "📄 워커 파일 다운로드..."
FILES="worker.py handlers/__init__.py handlers/base.py handlers/kin.py handlers/blog.py handlers/serp.py"
for f in \$FILES; do
    TARGET="\${INSTALL_DIR}/\${f}"
    mkdir -p "\$(dirname "\${TARGET}")"
    if curl -sS "\${STATION_URL}/api/download?file=\${f}" -o "\${TARGET}" 2>/dev/null; then
        echo "  ✅ \${f}"
    else
        echo "  ⚠️ \${f} 다운로드 실패"
    fi
done

# .env 생성 (최초 설치 시에만)
ENV_FILE="\${INSTALL_DIR}/.env"
if [ ! -f "\${ENV_FILE}" ]; then
    WORKER_ID="worker-\$(python3 -c "import uuid; print(uuid.uuid4().hex[:8])")"
    cat > "\${ENV_FILE}" << ENVEOF
SUPABASE_URL=\${SUPABASE_URL}
SUPABASE_KEY=\${SUPABASE_KEY}
WORKER_ID=\${WORKER_ID}
ENVEOF
    echo ""
    echo "🔑 .env 생성 (ID: \${WORKER_ID})"
fi

# ── LaunchAgent 등록 (로그인 시 자동 실행 + 크래시 시 자동 재시작) ──
echo ""
echo "⚙️ 자동 실행 등록..."

# 기존 서비스 중지 (재설치 시)
launchctl unload "\${PLIST_PATH}" 2>/dev/null || true

mkdir -p "$HOME/Library/LaunchAgents"
cat > "\${PLIST_PATH}" << PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>\${PLIST_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>\${PYTHON3}</string>
        <string>\${INSTALL_DIR}/worker.py</string>
    </array>
    <key>WorkingDirectory</key>
    <string>\${INSTALL_DIR}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>StandardOutPath</key>
    <string>\${LOG_DIR}/worker.log</string>
    <key>StandardErrorPath</key>
    <string>\${LOG_DIR}/worker.err</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>
PLISTEOF

# 서비스 시작
launchctl load "\${PLIST_PATH}"
echo "  ✅ 로그인 시 자동 실행 등록 완료"

# 제어 스크립트 생성
cat > "\${INSTALL_DIR}/ctl.command" << 'CTLEOF'
#!/bin/bash
PLIST="$HOME/Library/LaunchAgents/com.crawlstation.worker.plist"
LOG="$HOME/CrawlWorker/logs/worker.log"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  CrawlStation 워커 제어판"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  1) 상태 확인"
echo "  2) 워커 중지"
echo "  3) 워커 시작"
echo "  4) 워커 재시작"
echo "  5) 로그 보기"
echo "  6) 자동 실행 해제"
echo ""
read -p "선택: " choice
case $choice in
    1) launchctl list | grep crawlstation && echo "✅ 실행 중" || echo "❌ 중지됨" ;;
    2) launchctl unload "$PLIST" 2>/dev/null && echo "✅ 중지됨" || echo "이미 중지됨" ;;
    3) launchctl load "$PLIST" 2>/dev/null && echo "✅ 시작됨" || echo "이미 실행 중" ;;
    4) launchctl unload "$PLIST" 2>/dev/null; sleep 1; launchctl load "$PLIST" && echo "✅ 재시작 완료" ;;
    5) echo "--- 최근 로그 ---"; tail -50 "$LOG" 2>/dev/null || echo "로그 없음" ;;
    6) launchctl unload "$PLIST" 2>/dev/null; rm -f "$PLIST"; echo "✅ 자동 실행 해제됨" ;;
esac
echo ""
read -p "아무 키나 누르면 종료..."
CTLEOF
chmod +x "\${INSTALL_DIR}/ctl.command"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ 설치 완료! 워커가 바로 실행되었습니다."
echo ""
echo "  이후 할 일: 없음 (자동으로 모든 것이 처리됩니다)"
echo ""
echo "  - 로그인할 때마다 자동 실행"
echo "  - 비정상 종료 시 자동 재시작"
echo "  - 새 버전 나오면 자동 업데이트"
echo "  - CrawlStation에 자동 등록됨"
echo ""
echo "  제어: ~/CrawlWorker/ctl.command 더블클릭"
echo "  로그: ~/CrawlWorker/logs/worker.log"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
read -p "아무 키나 누르면 닫힘..."
`;

    return new NextResponse(macScript, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition":
          'attachment; filename="CrawlWorker-Install.command"',
      },
    });
  }

  // ── Python 인스톨러 (Windows/Linux) ──
  const code = [
    "#!/usr/bin/env python3",
    '"""CrawlStation 크롤링 워커 원클릭 인스톨러"""',
    "import subprocess, sys, os, platform, uuid",
    "",
    `SUPABASE_URL = "${supabaseUrl}"`,
    `SUPABASE_KEY = "${supabaseKey}"`,
    `STATION_URL = "${stationUrl}"`,
    'INSTALL_DIR = os.path.expanduser("~/CrawlWorker") if platform.system() != "Windows" else r"C:\\CrawlWorker"',
    "",
    "def main():",
    '    print("\\n" + "━" * 48)',
    '    print("  CrawlStation — 크롤링 워커 원클릭 설치")',
    '    print("━" * 48 + "\\n")',
    "    v = sys.version_info",
    "    if v.major < 3 or (v.major == 3 and v.minor < 10):",
    '        print("❌ Python 3.10+ 필요"); sys.exit(1)',
    '    print(f"✅ Python {v.major}.{v.minor}.{v.micro}")',
    '    os.makedirs(os.path.join(INSTALL_DIR, "handlers"), exist_ok=True)',
    '    print(f"📁 {INSTALL_DIR}")',
    '    print("\\n📦 패키지 설치...")',
    '    for pkg in ["playwright", "supabase"]:',
    '        cmd = [sys.executable, "-m", "pip", "install", "--quiet", pkg]',
    "        r = subprocess.run(cmd, capture_output=True, text=True)",
    '        if r.returncode != 0 and "break-system-packages" in r.stderr:',
    '            subprocess.run(cmd[:4] + ["--break-system-packages"] + cmd[4:], capture_output=True)',
    '        print(f"  ✅ {pkg}")',
    '    print("\\n🌐 Chromium 설치... (1~2분)")',
    "    try:",
    '        subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=True, capture_output=True)',
    '        print("  ✅ 완료")',
    '    except Exception: print("  ⚠️ 수동 설치 필요: python -m playwright install chromium")',
    '    print("\\n📄 워커 파일 다운로드...")',
    "    import urllib.request",
    '    files = ["worker.py","handlers/__init__.py","handlers/base.py","handlers/kin.py","handlers/blog.py","handlers/serp.py"]',
    "    for f in files:",
    "        t = os.path.join(INSTALL_DIR, f)",
    "        os.makedirs(os.path.dirname(t), exist_ok=True)",
    "        try:",
    '            urllib.request.urlretrieve(f"{STATION_URL}/api/download?file={f}", t)',
    '            print(f"  ✅ {f}")',
    '        except Exception as e: print(f"  ⚠️ {f}: {e}")',
    '    env_path = os.path.join(INSTALL_DIR, ".env")',
    "    if not os.path.exists(env_path):",
    '        wid = f"worker-{uuid.uuid4().hex[:8]}"',
    '        with open(env_path, "w") as ef:',
    '            ef.write(f"SUPABASE_URL={SUPABASE_URL}\\nSUPABASE_KEY={SUPABASE_KEY}\\nWORKER_ID={wid}\\n")',
    '        print(f"\\n🔑 .env 생성 (ID: {wid}, 연결정보 자동입력)")',
    '    print("\\n🔗 연결 테스트...")',
    "    try:",
    "        from supabase import create_client",
    '        create_client(SUPABASE_URL, SUPABASE_KEY).table("worker_config").select("id").limit(1).execute()',
    '        print("  ✅ 연결 성공!")',
    '    except Exception as e: print(f"  ⚠️ {e}")',
    '    py = "python" if platform.system() == "Windows" else "python3"',
    '    print(f"\\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")',
    '    print(f"  ✅ 설치 완료!  실행: cd {INSTALL_DIR} && {py} worker.py")',
    '    print(f"  → CrawlStation에 자동 등록됩니다: {STATION_URL}")',
    '    print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n")',
    "",
    'if __name__ == "__main__": main()',
  ].join("\n");

  return new NextResponse(code, {
    headers: {
      "Content-Type": "text/x-python; charset=utf-8",
      "Content-Disposition": 'attachment; filename="installer.py"',
    },
  });
}
