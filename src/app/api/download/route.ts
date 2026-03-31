import { NextRequest, NextResponse } from "next/server";

/**
 * 크롤링 워커 인스톨러 다운로드 API
 * GET /api/download — installer.py (Supabase 연결정보 내장)
 */
export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const stationUrl = "https://crawl-station.vercel.app";

  const code = [
    '#!/usr/bin/env python3',
    '"""CrawlStation 크롤링 워커 원클릭 인스톨러"""',
    'import subprocess, sys, os, platform, uuid',
    '',
    `SUPABASE_URL = "${supabaseUrl}"`,
    `SUPABASE_KEY = "${supabaseKey}"`,
    `STATION_URL = "${stationUrl}"`,
    'INSTALL_DIR = os.path.expanduser("~/CrawlWorker") if platform.system() != "Windows" else r"C:\\CrawlWorker"',
    '',
    'def main():',
    '    print("\\n" + "━" * 48)',
    '    print("  CrawlStation — 크롤링 워커 원클릭 설치")',
    '    print("━" * 48 + "\\n")',
    '    v = sys.version_info',
    '    if v.major < 3 or (v.major == 3 and v.minor < 10):',
    '        print("❌ Python 3.10+ 필요"); sys.exit(1)',
    '    print(f"✅ Python {v.major}.{v.minor}.{v.micro}")',
    '    os.makedirs(os.path.join(INSTALL_DIR, "handlers"), exist_ok=True)',
    '    print(f"📁 {INSTALL_DIR}")',
    '    print("\\n📦 패키지 설치...")',
    '    for pkg in ["playwright", "supabase"]:',
    '        cmd = [sys.executable, "-m", "pip", "install", "--quiet", pkg]',
    '        r = subprocess.run(cmd, capture_output=True, text=True)',
    '        if r.returncode != 0 and "break-system-packages" in r.stderr:',
    '            subprocess.run(cmd[:4] + ["--break-system-packages"] + cmd[4:], capture_output=True)',
    '        print(f"  ✅ {pkg}")',
    '    print("\\n🌐 Chromium 설치... (1~2분)")',
    '    try:',
    '        subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=True, capture_output=True)',
    '        print("  ✅ 완료")',
    '    except Exception: print("  ⚠️ 수동 설치 필요: python -m playwright install chromium")',
    '    print("\\n📄 워커 파일 다운로드...")',
    '    import urllib.request',
    '    files = ["worker.py","handlers/__init__.py","handlers/base.py","handlers/kin.py","handlers/blog.py","handlers/serp.py"]',
    '    for f in files:',
    '        t = os.path.join(INSTALL_DIR, f)',
    '        os.makedirs(os.path.dirname(t), exist_ok=True)',
    '        try:',
    '            urllib.request.urlretrieve(f"{STATION_URL}/api/download?file={f}", t)',
    '            print(f"  ✅ {f}")',
    '        except Exception as e: print(f"  ⚠️ {f}: {e}")',
    '    env_path = os.path.join(INSTALL_DIR, ".env")',
    '    if not os.path.exists(env_path):',
    '        wid = f"worker-{uuid.uuid4().hex[:8]}"',
    '        with open(env_path, "w") as ef:',
    '            ef.write(f"SUPABASE_URL={SUPABASE_URL}\\nSUPABASE_KEY={SUPABASE_KEY}\\nWORKER_ID={wid}\\n")',
    '        print(f"\\n🔑 .env 생성 (ID: {wid}, 연결정보 자동입력)")',
    '    print("\\n🔗 연결 테스트...")',
    '    try:',
    '        from supabase import create_client',
    '        create_client(SUPABASE_URL, SUPABASE_KEY).table("worker_config").select("id").limit(1).execute()',
    '        print("  ✅ 연결 성공!")',
    '    except Exception as e: print(f"  ⚠️ {e}")',
    '    py = "python" if platform.system() == "Windows" else "python3"',
    '    print(f"\\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")',
    '    print(f"  ✅ 설치 완료!  실행: cd {INSTALL_DIR} && {py} worker.py")',
    '    print(f"  → CrawlStation에 자동 등록됩니다: {STATION_URL}")',
    '    print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n")',
    '',
    'if __name__ == "__main__": main()',
  ].join('\n');

  return new NextResponse(code, {
    headers: {
      "Content-Type": "text/x-python; charset=utf-8",
      "Content-Disposition": 'attachment; filename="installer.py"',
    },
  });
}
