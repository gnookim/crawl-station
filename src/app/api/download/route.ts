import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * 크롤링 워커 다운로드 API
 *
 * GET /api/download           — installer.py 다운로드 (Supabase 연결정보 내장)
 * GET /api/download?file=worker — 개별 워커 파일 다운로드
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const file = searchParams.get("file");

  if (file) {
    return getWorkerFile(file);
  }

  // installer.py에 Supabase 연결정보를 내장해서 반환
  return getInstaller();
}

async function getInstaller() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  // 최신 워커 파일들을 DB에서 가져오기
  let workerFiles: Record<string, string> = {};
  try {
    const sb = createServerClient();
    const { data } = await sb
      .from("worker_releases")
      .select("files")
      .eq("is_latest", true)
      .limit(1);
    if (data?.[0]?.files && Object.keys(data[0].files).length > 0) {
      workerFiles = data[0].files;
    }
  } catch {
    // DB에 파일이 없으면 GitHub에서 받도록 안내
  }

  const installerCode = generateInstaller(supabaseUrl, supabaseKey, workerFiles);

  return new NextResponse(installerCode, {
    headers: {
      "Content-Type": "text/x-python; charset=utf-8",
      "Content-Disposition": 'attachment; filename="installer.py"',
    },
  });
}

async function getWorkerFile(file: string) {
  // 허용된 파일만
  const allowed = ["worker.py", "handlers/__init__.py", "handlers/base.py", "handlers/kin.py", "handlers/blog.py", "handlers/serp.py"];
  if (!allowed.includes(file)) {
    return NextResponse.json({ error: "허용되지 않은 파일" }, { status: 400 });
  }

  try {
    const sb = createServerClient();
    const { data } = await sb
      .from("worker_releases")
      .select("files")
      .eq("is_latest", true)
      .limit(1);

    if (data?.[0]?.files?.[file]) {
      return new NextResponse(data[0].files[file], {
        headers: {
          "Content-Type": "text/x-python; charset=utf-8",
          "Content-Disposition": `attachment; filename="${file.split("/").pop()}"`,
        },
      });
    }
  } catch {
    // pass
  }

  return NextResponse.json({ error: "파일을 찾을 수 없습니다" }, { status: 404 });
}

function generateInstaller(supabaseUrl: string, supabaseKey: string, workerFiles: Record<string, string>): string {
  // 워커 파일들을 base64로 인코딩하여 installer에 내장
  const hasEmbeddedFiles = Object.keys(workerFiles).length > 0;

  return `#!/usr/bin/env python3
"""
CrawlStation — 크롤링 워커 원클릭 인스톨러
이 파일을 다운로드해서 실행하면 설치 완료!

사용법:
  python installer.py
  python3 installer.py
"""
import subprocess
import sys
import os
import platform
import uuid
import base64
import json

# ── CrawlStation 연결 정보 (자동 삽입됨) ─────
SUPABASE_URL = "${supabaseUrl}"
SUPABASE_KEY = "${supabaseKey}"
CRAWLSTATION_URL = "${process.env.VERCEL_PROJECT_PRODUCTION_URL ? "https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL : "https://crawl-station.vercel.app"}"

# ── 설정 ──────────────────────────────────────
INSTALL_DIR_MAC = os.path.expanduser("~/CrawlWorker")
INSTALL_DIR_WIN = r"C:\\CrawlWorker"
MIN_PYTHON = (3, 10)
PACKAGES = ["playwright", "supabase"]

# ── 워커 파일 (내장됨) ────────────────────────
EMBEDDED_FILES = ${hasEmbeddedFiles ? "True" : "False"}
WORKER_FILES_B64 = ${hasEmbeddedFiles ? JSON.stringify(
    Object.fromEntries(
      Object.entries(workerFiles).map(([k, v]) => [k, Buffer.from(v).toString("base64")])
    )
  ) : "{}"}


def main():
    print()
    print("━" * 48)
    print("  CrawlStation — 크롤링 워커 원클릭 설치")
    print("━" * 48)
    print()

    check_python()
    install_dir = setup_directory()
    install_packages()
    install_browser()

    if EMBEDDED_FILES:
        extract_embedded_files(install_dir)
    else:
        download_worker_files(install_dir)

    create_env(install_dir)
    test_connection(install_dir)

    print()
    print("━" * 48)
    print("  ✅ 설치 완료!")
    print("━" * 48)
    print()
    print(f"  설치 위치: {install_dir}")
    py = "python" if is_windows() else "python3"
    print(f"  실행: cd {install_dir} && {py} worker.py")
    print()
    print("  → CrawlStation 대시보드에 자동 등록됩니다.")
    print(f"  → {CRAWLSTATION_URL}")
    print()


def check_python():
    print("🔍 Python 버전 확인...")
    v = sys.version_info
    if v.major < MIN_PYTHON[0] or (v.major == MIN_PYTHON[0] and v.minor < MIN_PYTHON[1]):
        print(f"  ❌ Python {MIN_PYTHON[0]}.{MIN_PYTHON[1]}+ 필요 (현재: {v.major}.{v.minor})")
        if platform.system() == "Darwin":
            print("     설치: brew install python@3.12")
        else:
            print("     설치: https://www.python.org/downloads/")
        sys.exit(1)
    print(f"  ✅ Python {v.major}.{v.minor}.{v.micro}")


def setup_directory():
    d = INSTALL_DIR_WIN if is_windows() else INSTALL_DIR_MAC
    print(f"\\n📁 설치 디렉토리: {d}")
    os.makedirs(os.path.join(d, "handlers"), exist_ok=True)
    return d


def install_packages():
    print("\\n📦 패키지 설치 중...")
    for pkg in PACKAGES:
        try:
            cmd = [sys.executable, "-m", "pip", "install", "--quiet", pkg]
            r = subprocess.run(cmd, capture_output=True, text=True)
            if r.returncode != 0 and "break-system-packages" in r.stderr:
                cmd.insert(4, "--break-system-packages")
                subprocess.run(cmd, check=True, capture_output=True)
            elif r.returncode != 0:
                raise RuntimeError(r.stderr[:200])
            print(f"  ✅ {pkg}")
        except Exception as e:
            print(f"  ⚠️ {pkg}: {e}")


def install_browser():
    print("\\n🌐 Chromium 설치 중... (1~2분)")
    try:
        subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"],
                       check=True, capture_output=True)
        print("  ✅ Chromium 설치 완료")
    except Exception:
        try:
            subprocess.run([sys.executable, "-m", "playwright", "install", "--with-deps", "chromium"],
                           check=True, capture_output=True)
            print("  ✅ Chromium + 의존성 설치 완료")
        except Exception as e:
            print(f"  ⚠️ 설치 실패: {e}")


def extract_embedded_files(install_dir):
    print("\\n📄 워커 파일 설치 중...")
    for filepath, b64content in WORKER_FILES_B64.items():
        target = os.path.join(install_dir, filepath)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        content = base64.b64decode(b64content).decode("utf-8")
        with open(target, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"  ✅ {filepath}")


def download_worker_files(install_dir):
    print("\\n📄 워커 파일 다운로드 중...")
    import urllib.request
    files = ["worker.py", "handlers/__init__.py", "handlers/base.py",
             "handlers/kin.py", "handlers/blog.py", "handlers/serp.py"]
    for filepath in files:
        target = os.path.join(install_dir, filepath)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        try:
            url = f"{CRAWLSTATION_URL}/api/download?file={filepath}"
            urllib.request.urlretrieve(url, target)
            print(f"  ✅ {filepath}")
        except Exception as e:
            print(f"  ⚠️ {filepath}: {e}")


def create_env(install_dir):
    print()
    env_path = os.path.join(install_dir, ".env")
    if os.path.exists(env_path):
        print("  ℹ️  .env 파일이 이미 존재합니다. 건너뜁니다.")
        return
    worker_id = f"worker-{uuid.uuid4().hex[:8]}"
    with open(env_path, "w", encoding="utf-8") as f:
        f.write(f"SUPABASE_URL={SUPABASE_URL}\\n")
        f.write(f"SUPABASE_KEY={SUPABASE_KEY}\\n")
        f.write(f"WORKER_ID={worker_id}\\n")
    print(f"🔑 .env 생성 (ID: {worker_id}, Supabase 연결정보 자동 입력됨)")


def test_connection(install_dir):
    print("\\n🔗 연결 테스트...")
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("  ⏭️ Supabase 미설정")
        return
    try:
        from supabase import create_client
        sb = create_client(SUPABASE_URL, SUPABASE_KEY)
        sb.table("worker_config").select("id").limit(1).execute()
        print("  ✅ Supabase 연결 성공!")
    except Exception as e:
        print(f"  ⚠️ 연결 실패: {e}")


def is_windows():
    return platform.system() == "Windows"


if __name__ == "__main__":
    main()
`;
}
