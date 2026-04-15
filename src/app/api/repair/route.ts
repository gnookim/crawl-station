import { NextResponse } from "next/server";

/**
 * 워커 복구 스크립트 다운로드
 *
 * GET /api/repair  — 최신 파일을 다운로드하고 워커를 재시작하는 Windows .bat 스크립트 반환
 */
export async function GET() {
  const stationUrl = "https://crawl-station.vercel.app";

  const files = [
    "worker.py",
    "supabase_rest.py",
    "handlers/__init__.py",
    "handlers/base.py",
    "handlers/kin.py",
    "handlers/kin_post.py",
    "handlers/blog.py",
    "handlers/serp.py",
    "handlers/area.py",
    "handlers/deep.py",
    "handlers/rank.py",
    "handlers/instagram.py",
    "handlers/instagram_post.py",
    "handlers/oclick.py",
  ];

  const downloadCmds = files.map((f) => {
    const dir = f.includes("/") ? `handlers` : "";
    const indent = "    ";
    return `${indent}urllib.request.urlretrieve("${stationUrl}/api/download?file=${f}", r"C:\\CrawlWorker\\${f.replace(/\//g, "\\\\")}") and None`;
  });

  const script = `@echo off
chcp 65001 >nul
echo.
echo ====================================================
echo   CrawlStation Worker 자동 복구
echo ====================================================
echo.

cd /d C:\\CrawlWorker
if not exist worker.py (
  echo [오류] C:\\CrawlWorker 폴더가 없습니다.
  echo 먼저 CrawlStation Worker 설치를 진행해 주세요.
  pause
  exit /b 1
)

echo [1/3] 최신 파일 다운로드 중...
python -c "import urllib.request, os; os.makedirs('handlers', exist_ok=True); [urllib.request.urlretrieve('${stationUrl}/api/download?file=' + f, f.replace('/', os.sep)) for f in [${files.map((f) => `'${f}'`).join(", ")}]]; print('  완료')"
if errorlevel 1 (
  echo [오류] 파일 다운로드 실패. 인터넷 연결을 확인하세요.
  pause
  exit /b 1
)

echo [2/3] 기존 워커 프로세스 종료 중...
taskkill /f /im pythonw.exe >nul 2>&1
taskkill /f /im python.exe /fi "WINDOWTITLE eq worker*" >nul 2>&1
timeout /t 2 /nobreak >nul

echo [3/3] 워커 시작 중...
start "" pythonw.exe worker_gui.pyw

echo.
echo ====================================================
echo   복구 완료! CrawlStation Worker가 시작됩니다.
echo ====================================================
echo.
timeout /t 3 /nobreak >nul
`;

  return new NextResponse(script, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": 'attachment; filename="crawlstation-repair.bat"',
    },
  });
}
