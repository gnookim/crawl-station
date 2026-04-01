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


def run_visible(cmd, desc=""):
    """콘솔에 출력이 보이도록 실행"""
    if desc:
        print("    " + desc)
    r = subprocess.run(cmd, capture_output=False)
    return r.returncode == 0


def run_quiet(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r.returncode == 0


def progress(step, total, msg):
    bar_len = 30
    filled = int(bar_len * step / total)
    bar = "#" * filled + "-" * (bar_len - filled)
    print("\n  [{}/{}] [{}] {}".format(step, total, bar, msg))


def main():
    os.system("title CrawlStation Worker Installer v{}".format(VERSION))
    os.system("color 0A")
    print()
    print("  ======================================================")
    print("    CrawlStation Worker v{} - Windows Installer".format(VERSION))
    print("  ======================================================")
    print()
    print("  Python, Chromium, 워커 파일을 자동 설치합니다.")
    print("  인터넷 연결이 필요하며 5~10분 소요될 수 있습니다.")
    print()

    TOTAL = 7

    # 1. 설치 디렉토리
    progress(1, TOTAL, "설치 디렉토리 생성")
    for d in ["handlers", "logs", "python"]:
        os.makedirs(os.path.join(INSTALL_DIR, d), exist_ok=True)
    print("    -> " + INSTALL_DIR)

    # 2. Python embedded 복사
    progress(2, TOTAL, "Python 3.12 설치")
    if getattr(sys, 'frozen', False):
        base = sys._MEIPASS
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    src = os.path.join(base, "python")
    dst = os.path.join(INSTALL_DIR, "python")
    if os.path.exists(src):
        if not os.path.exists(os.path.join(dst, "python.exe")):
            print("    -> Python 복사 중...")
            shutil.copytree(src, dst, dirs_exist_ok=True)
            print("    -> 완료")
        else:
            print("    -> 이미 설치됨")
    else:
        print("    -> ERROR: Python을 찾을 수 없습니다!")
        print()
        input("  아무 키나 누르면 종료합니다...")
        return
    py = os.path.join(dst, "python.exe")

    # 3. pip 설치
    progress(3, TOTAL, "pip 설치")
    pip_script = os.path.join(dst, "get-pip.py")
    if os.path.exists(pip_script):
        print("    -> pip 다운로드 + 설치 중...")
        run_quiet([py, pip_script, "--quiet"])
    result = subprocess.run([py, "-m", "pip", "--version"], capture_output=True, text=True)
    if result.returncode == 0:
        ver = result.stdout.strip().split(" ")[1] if result.stdout else "unknown"
        print("    -> pip {} 설치됨".format(ver))
    else:
        print("    -> pip 설치 실패 (계속 진행)")

    # 4. 패키지 설치
    progress(4, TOTAL, "크롤링 패키지 설치 (playwright, supabase)")
    print("    -> playwright 설치 중... (1~2분)")
    run_quiet([py, "-m", "pip", "install", "--quiet", "playwright"])
    print("    -> supabase 설치 중...")
    run_quiet([py, "-m", "pip", "install", "--quiet", "supabase"])
    print("    -> Chromium 브라우저 다운로드 중... (2~5분)")
    subprocess.run([py, "-m", "playwright", "install", "chromium"],
        capture_output=False)
    print("    -> 패키지 설치 완료")

    # 5. 워커 파일
    progress(5, TOTAL, "워커 파일 다운로드")
    files = [
        "worker.py", "handlers/__init__.py", "handlers/base.py",
        "handlers/kin.py", "handlers/blog.py", "handlers/serp.py",
    ]
    for f in files:
        t = os.path.join(INSTALL_DIR, f)
        os.makedirs(os.path.dirname(t), exist_ok=True)
        try:
            urllib.request.urlretrieve("{}/api/download?file={}".format(STATION_URL, f), t)
            print("    -> " + f)
        except Exception as e:
            print("    -> WARN {}: {}".format(f, e))

    # 6. .env
    progress(6, TOTAL, "설정 파일 생성")
    env_path = os.path.join(INSTALL_DIR, ".env")
    wid = ""
    if not os.path.exists(env_path):
        wid = "worker-" + uuid.uuid4().hex[:8]
        with open(env_path, "w") as f:
            f.write("SUPABASE_URL={}\nSUPABASE_KEY={}\nWORKER_ID={}\n".format(
                SUPABASE_URL, SUPABASE_KEY, wid))
        print("    -> Worker ID: " + wid)
    else:
        with open(env_path) as f:
            for line in f:
                if line.startswith("WORKER_ID="):
                    wid = line.split("=", 1)[1].strip()
        print("    -> 기존 설정 유지 (ID: {})".format(wid))

    # 7. 서비스 등록
    progress(7, TOTAL, "서비스 등록")
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
        print("    -> PC 시작 시 자동 실행 등록됨")
    except Exception as e:
        print("    -> 자동 실행 등록 실패: " + str(e))

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
    print("    -> 바탕화면 바로가기 생성 (시작/중지/삭제)")

    # 즉시 실행
    subprocess.Popen(
        [py, os.path.join(INSTALL_DIR, "worker.py")],
        cwd=INSTALL_DIR,
        creationflags=0x00000010,
    )

    print()
    print("  ======================================================")
    print("    설치 완료!")
    print("  ======================================================")
    print()
    print("    워커가 백그라운드에서 실행 중입니다.")
    print()
    print("    - PC 부팅 시 자동 시작")
    print("    - 바탕화면: CrawlWorker / Stop / Uninstall")
    print("    - Station: " + STATION_URL)
    print("    - 제어판에서도 삭제 가능")
    print()
    print("  ======================================================")
    print()
    input("  아무 키나 누르면 이 창을 닫습니다...")


if __name__ == "__main__":
    main()
