@echo off
title CrawlStation Worker Installer
cd /d "%~dp0"
echo.
echo  CrawlStation Worker 설치를 시작합니다...
echo.
"%~dp0python\python.exe" "%~dp0install.py"
if errorlevel 1 (
    echo.
    echo  [ERROR] 설치 중 문제가 발생했습니다.
    echo.
    pause
)
