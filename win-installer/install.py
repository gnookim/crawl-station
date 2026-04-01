"""
CrawlStation Worker — Windows Installer
Python embedded + 패키지 + Chromium + 서비스 자동 등록
"""
import os, sys, shutil, uuid, subprocess, platform
try:
    import urllib.request
except:
    pass

# ── 이 값들은 빌드 시 sed로 치환됨 ──
VERSION = "__VERSION__"
SUPABASE_URL = "__SUPABASE_URL__"
SUPABASE_KEY = "__SUPABASE_KEY__"
STATION_URL = "__STATION_URL__"
INSTALL_DIR = r"C:\CrawlWorker"


def run(cmd, ignore_error=False):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0 and not ignore_error:
        print("  WARN: " + r.stderr[:200])
    return r.returncode == 0


def main():
    print()
    print("=" * 50)
    print("  CrawlStation Worker v{} Installer".format(VERSION))
    print("=" * 50)
    print()

    # 1. 설치 디렉토리
    for d in ["handlers", "logs", "python"]:
        os.makedirs(os.path.join(INSTALL_DIR, d), exist_ok=True)
    print("[1/7] " + INSTALL_DIR)

    # 2. Python embedded 복사
    # PyInstaller 번들에서 python/ 디렉토리를 찾음
    if getattr(sys, 'frozen', False):
        base = sys._MEIPASS
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    src = os.path.join(base, "python")
    dst = os.path.join(INSTALL_DIR, "python")
    if os.path.exists(src):
        if not os.path.exists(os.path.join(dst, "python.exe")):
            print("[2/7] Python copying...")
            shutil.copytree(src, dst, dirs_exist_ok=True)
        else:
            print("[2/7] Python OK")
    else:
        print("[2/7] ERROR: Python not found in bundle")
        input("Press Enter...")
        return
    py = os.path.join(dst, "python.exe")

    # 3. pip 설치
    print("[3/7] pip...")
    pip_script = os.path.join(dst, "get-pip.py")
    if os.path.exists(pip_script):
        run([py, pip_script, "--quiet"], ignore_error=True)
    run([py, "-m", "pip", "--version"], ignore_error=True)

    # 4. 패키지 설치
    print("[4/7] playwright + supabase...")
    run([py, "-m", "pip", "install", "--quiet", "playwright", "supabase"], ignore_error=True)
    print("  Chromium...")
    run([py, "-m", "playwright", "install", "chromium"], ignore_error=True)

    # 5. 워커 파일
    print("[5/7] Worker files...")
    files = [
        "worker.py", "handlers/__init__.py", "handlers/base.py",
        "handlers/kin.py", "handlers/blog.py", "handlers/serp.py",
    ]
    for f in files:
        t = os.path.join(INSTALL_DIR, f)
        os.makedirs(os.path.dirname(t), exist_ok=True)
        try:
            urllib.request.urlretrieve("{}/api/download?file={}".format(STATION_URL, f), t)
            print("  " + f)
        except Exception as e:
            print("  WARN {}: {}".format(f, e))

    # 6. .env
    env_path = os.path.join(INSTALL_DIR, ".env")
    wid = ""
    if not os.path.exists(env_path):
        wid = "worker-" + uuid.uuid4().hex[:8]
        with open(env_path, "w") as f:
            f.write("SUPABASE_URL={}\nSUPABASE_KEY={}\nWORKER_ID={}\n".format(
                SUPABASE_URL, SUPABASE_KEY, wid))
    else:
        with open(env_path) as f:
            for line in f:
                if line.startswith("WORKER_ID="):
                    wid = line.split("=", 1)[1].strip()
    print("[6/7] ID: " + wid)

    # 7. 서비스 등록
    print("[7/7] Service...")
    try:
        import winreg
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0, winreg.KEY_SET_VALUE,
        )
        winreg.SetValueEx(
            key, "CrawlStationWorker", 0, winreg.REG_SZ,
            '"{}" "{}"'.format(py, os.path.join(INSTALL_DIR, "worker.py")),
        )
        winreg.CloseKey(key)
        print("  Auto-start registered")
    except Exception as e:
        print("  WARN: " + str(e))

    # 바탕화면 바로가기
    desktop = os.path.join(os.path.expanduser("~"), "Desktop")

    with open(os.path.join(desktop, "CrawlWorker.bat"), "w", encoding="utf-8") as f:
        f.write('@echo off\ncd /d "{}"\n"{}" worker.py\n'.format(INSTALL_DIR, py))

    with open(os.path.join(desktop, "CrawlWorker Stop.bat"), "w", encoding="utf-8") as f:
        f.write('@echo off\ntaskkill /f /im python.exe 2>nul\necho Stopped.\npause\n')

    uninstall_bat = os.path.join(desktop, "CrawlWorker Uninstall.bat")
    with open(uninstall_bat, "w", encoding="utf-8") as f:
        f.write('@echo off\ntaskkill /f /im python.exe 2>nul\n')
        f.write('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v CrawlStationWorker /f 2>nul\n')
        f.write('curl -s -X DELETE "{}/api/workers?id={}" >nul 2>&1\n'.format(STATION_URL, wid))
        f.write('rmdir /s /q "{}" 2>nul\n'.format(INSTALL_DIR))
        f.write('del "%USERPROFILE%\\Desktop\\CrawlWorker.bat" 2>nul\n')
        f.write('del "%USERPROFILE%\\Desktop\\CrawlWorker Stop.bat" 2>nul\n')
        f.write('echo Uninstalled.\npause\ndel "%~f0" 2>nul\n')

    print("  Desktop shortcuts created")

    # 즉시 실행
    subprocess.Popen(
        [py, os.path.join(INSTALL_DIR, "worker.py")],
        cwd=INSTALL_DIR,
        creationflags=0x00000010,
    )

    print()
    print("=" * 50)
    print("  DONE! Worker is running.")
    print("  Station: " + STATION_URL)
    print("  Auto-start on boot: YES")
    print("  Desktop: CrawlWorker / Stop / Uninstall")
    print("=" * 50)
    print()
    input("Press Enter to close...")


if __name__ == "__main__":
    main()
