@echo off
title CrawlStation Worker Installer
cd /d "%~dp0"
echo.
echo  CrawlStation Worker 설치를 시작합니다...
echo.
echo  Python 경로: %~dp0python\python.exe
echo.
if not exist "%~dp0python\python.exe" (
    echo  [ERROR] Python이 없습니다! 인스톨러를 다시 실행해주세요.
    echo.
    pause
    exit /b 1
)
"%~dp0python\python.exe" "%~dp0install.py"
echo.
echo  종료 코드: %errorlevel%
echo.
pause
