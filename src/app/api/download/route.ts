import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * 크롤링 워커 다운로드 API
 *
 * GET /api/download             — Python 인스톨러 (Windows/Linux)
 * GET /api/download?type=mac    — Mac .pkg 인스톨러 (GitHub Release 리다이렉트)
 * GET /api/download?file=xxx    — 최신 릴리즈에서 개별 파일 서빙
 * GET /api/download?list=1      — 최신 릴리즈 파일 목록 반환 (설치 시 동적 다운로드용)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fileParam = searchParams.get("file");
  const typeParam = searchParams.get("type");
  const listParam = searchParams.get("list");

  // ── 파일 목록 반환 ──
  if (listParam === "1") {
    const sb = createServerClient();
    let { data } = await sb
      .from("worker_releases")
      .select("files")
      .eq("is_latest", true)
      .limit(1)
      .single();
    if (!data?.files) {
      const { data: fallback } = await sb
        .from("worker_releases")
        .select("files")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      data = fallback;
    }
    const files = data?.files ? Object.keys(data.files) : [];
    return NextResponse.json({ files });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseKey =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";
  const stationUrl = "https://crawl-station.vercel.app";

  // ── 개별 파일 서빙 (최신 릴리즈에서) ──
  if (fileParam) {
    const sb = createServerClient();
    let { data } = await sb
      .from("worker_releases")
      .select("files")
      .eq("is_latest", true)
      .limit(1)
      .single();

    // fallback: is_latest가 없으면 최신 버전으로
    if (!data?.files) {
      const { data: fallback } = await sb
        .from("worker_releases")
        .select("files")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      data = fallback;
    }

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

  // ── Mac .pkg 인스톨러 (GitHub Release에서 리다이렉트) ──
  if (typeParam === "mac") {
    try {
      const ghHeaders: Record<string, string> = {
        Accept: "application/vnd.github+json",
      };
      if (process.env.GITHUB_TOKEN) {
        ghHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      }
      const ghRes = await fetch(
        "https://api.github.com/repos/gnookim/crawl-station/releases/latest",
        { headers: ghHeaders, cache: "no-store" }
      );

      if (ghRes.ok) {
        const release = await ghRes.json();
        const pkgAsset = release.assets?.find(
          (a: { name: string }) => a.name.endsWith(".pkg")
        );
        if (pkgAsset) {
          return NextResponse.redirect(pkgAsset.browser_download_url);
        }
      }
    } catch {
      // GitHub API 실패 시 아래 fallback
    }

    return NextResponse.json(
      { error: "Mac 인스톨러를 찾을 수 없습니다. GitHub Release를 확인해주세요." },
      { status: 404 }
    );
  }

  // ── Windows .exe 인스톨러 (GitHub Release에서 리다이렉트) ──
  if (typeParam === "win") {
    try {
      const ghHeaders: Record<string, string> = {
        Accept: "application/vnd.github+json",
      };
      if (process.env.GITHUB_TOKEN) {
        ghHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      }
      const ghRes = await fetch(
        "https://api.github.com/repos/gnookim/crawl-station/releases/latest",
        { headers: ghHeaders, cache: "no-store" }
      );

      if (ghRes.ok) {
        const release = await ghRes.json();
        const exeAssets: { name: string; browser_download_url: string; updated_at: string }[] =
          release.assets?.filter((a: { name: string }) => a.name.endsWith(".exe")) ?? [];
        // 동일 버전 재빌드 시 r2, r3 등이 있으므로 revision이 가장 높은 것 선택
        const getRevision = (name: string) => {
          const m = name.match(/r(\d+)\.exe$/);
          return m ? parseInt(m[1]) : 1;
        };
        const exeAsset = exeAssets.sort((a, b) => getRevision(b.name) - getRevision(a.name))[0];
        if (exeAsset) {
          return NextResponse.redirect(exeAsset.browser_download_url);
        }
      }
    } catch {
      // fallback
    }

    return NextResponse.json(
      { error: "Windows 인스톨러를 찾을 수 없습니다. GitHub Release를 확인해주세요." },
      { status: 404 }
    );
  }

  // ── Python 인스톨러 (fallback) ──
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
    '    files = ["worker.py","handlers/__init__.py","handlers/base.py","handlers/kin.py","handlers/blog.py","handlers/serp.py","handlers/area.py","handlers/deep.py","handlers/rank.py","supabase_rest.py"]',
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
    '        print("\\n🏷️  워커 이름 설정 (엔터 시 호스트명 사용)")',
    '        try:',
    '            wname = input("  이름 입력 (예: 사무실PC, 서버1): ").strip()',
    '        except Exception:',
    '            wname = ""',
    '        with open(env_path, "w") as ef:',
    '            ef.write(f"SUPABASE_URL={SUPABASE_URL}\\nSUPABASE_KEY={SUPABASE_KEY}\\nWORKER_ID={wid}\\n")',
    '            if wname:',
    '                ef.write(f"WORKER_NAME={wname}\\n")',
    '        label = f"{wname} ({wid})" if wname else wid',
    '        print(f"\\n🔑 .env 생성 (ID: {label})")',
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
