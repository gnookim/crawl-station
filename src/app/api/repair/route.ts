import { NextResponse } from "next/server";

/**
 * 워커 복구 스크립트 다운로드
 *
 * GET /api/repair  — 최신 파일 다운로드 + 감시자(watchdog) 설치 + 워커 재시작 .bat 반환
 *   watchdog: 작업 스케줄러에 5분마다 실행 등록 → 워커 꺼지면 자동 복구
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
    "watchdog.py",
  ];

  const fileList = files.map((f) => `'${f}'`).join(", ");

  const script = `@echo off
chcp 65001 >nul
echo.
echo ====================================================
echo   CrawlStation Worker 복구 + 자동 감시 설치
echo ====================================================
echo.

cd /d C:\\CrawlWorker
if not exist worker.py (
  echo [오류] C:\\CrawlWorker 폴더가 없습니다.
  echo 먼저 CrawlStation Worker 설치를 진행해 주세요.
  pause
  exit /b 1
)

echo [1/4] 최신 파일 다운로드 중...
python -c "import urllib.request, os; os.makedirs('handlers', exist_ok=True); [urllib.request.urlretrieve('${stationUrl}/api/download?file=' + f, f.replace('/', os.sep)) for f in [${fileList}]]; print('완료')"
if errorlevel 1 (
  echo [오류] 파일 다운로드 실패. 인터넷 연결을 확인하세요.
  pause
  exit /b 1
)

echo [2/4] 자동 감시 등록 중 (5분마다 워커 상태 확인 + 자동 재시작)...
schtasks /delete /tn "CrawlStationWatchdog" /f >nul 2>&1
schtasks /create /tn "CrawlStationWatchdog" /tr "pythonw.exe C:\\CrawlWorker\\watchdog.py" /sc minute /mo 5 /ru "%USERNAME%" /f >nul 2>&1
if errorlevel 1 (
  echo   [경고] 작업 스케줄러 등록 실패 - 건너뜀
) else (
  echo   완료 - 워커가 꺼지면 5분 내 자동 재시작됩니다.
)

echo [3/4] 기존 워커 프로세스 종료 중...
taskkill /f /im pythonw.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [4/4] 워커 시작 중...
start "" pythonw.exe worker_gui.pyw

echo.
echo ====================================================
echo   완료! 이제 워커가 꺼져도 5분 내 자동으로 살아납니다.
echo ====================================================
echo.
timeout /t 4 /nobreak >nul
`;

  return new NextResponse(script, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": 'attachment; filename="crawlstation-repair.bat"',
    },
  });
}
