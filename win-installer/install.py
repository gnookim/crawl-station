"""
CrawlStation Worker — Windows Installer (AI 자가 진단)
Python embedded + 패키지 + Chromium + 서비스 자동 등록
설치 실패 시 Station AI가 자동 진단 + 수정 + 재시도

--inno 모드: Inno Setup 창 안에서 실행 (로그 파일 출력, input 스킵, done 마커)
"""
import os, sys, shutil, uuid, subprocess, platform, json, traceback, time
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
TOTAL = 10

# ── 전역 상태 ──
SESSION_ID = uuid.uuid4().hex
INSTALL_LOG = []
PREVIOUS_FIXES = []
PY_PATH = ""  # step 3 이후 설정됨
INNO_MODE = "--inno" in sys.argv
LOG_FILE = None  # inno 모드에서 로그 파일 핸들


# ═══════════════════════════════════════════════════════
#  유틸리티
# ═══════════════════════════════════════════════════════

class StepError(Exception):
    """설치 단계 실패 — stdout/stderr 첨부"""
    def __init__(self, msg, stdout="", stderr=""):
        super().__init__(msg)
        self._stdout = stdout
        self._stderr = stderr


def log(msg):
    """콘솔 출력 + 로그 기록 (inno 모드에서는 파일에도 기록)"""
    print(msg)
    INSTALL_LOG.append(msg)
    if LOG_FILE:
        try:
            LOG_FILE.write(msg + "\n")
            LOG_FILE.flush()
        except Exception:
            pass


def progress(step, total, msg):
    bar_len = 30
    filled = int(bar_len * step / total)
    bar = "#" * filled + "-" * (bar_len - filled)
    log("\n  [{}/{}] [{}] {}".format(step, total, bar, msg))


def run_captured(cmd, desc="", timeout=300):
    """명령 실행 + 출력 캡처. 실패 시 StepError raise."""
    if desc:
        log("    " + desc)
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as e:
        raise StepError(
            "명령 시간 초과 ({}초): {}".format(timeout, cmd if isinstance(cmd, str) else " ".join(cmd)),
            stdout=getattr(e, "stdout", "") or "",
            stderr=getattr(e, "stderr", "") or "",
        )
    if r.returncode != 0:
        raise StepError(
            "명령 실패 (코드 {}): {}".format(r.returncode, cmd if isinstance(cmd, str) else " ".join(cmd)),
            stdout=r.stdout or "",
            stderr=r.stderr or "",
        )
    return r


def wait_prompt(msg="  아무 키나 누르면 종료합니다..."):
    """inno 모드에서는 input 스킵"""
    if not INNO_MODE:
        input(msg)


def write_done_marker(success):
    """inno 모드용 완료 마커 파일 생성"""
    if INNO_MODE:
        try:
            with open(os.path.join(INSTALL_DIR, "install.done"), "w") as f:
                f.write("0" if success else "1")
        except Exception:
            pass


# ═══════════════════════════════════════════════════════
#  Station 진행 상태 보고
# ═══════════════════════════════════════════════════════

def update_progress_file(step, name, status):
    """Inno Setup이 읽을 수 있는 진행 파일 작성"""
    try:
        path = os.path.join(INSTALL_DIR, "install.progress")
        with open(path, "w", encoding="utf-8") as f:
            f.write("{}\n{}\n{}".format(step, name, status))
    except Exception:
        pass


def report_status(action, **kwargs):
    """Station /api/install-status에 진행 상태 보고. 실패해도 무시."""
    payload = {"session_id": SESSION_ID, "action": action}
    payload.update(kwargs)
    # 최근 로그 5줄 첨부
    payload["log_tail"] = "\n".join(INSTALL_LOG[-10:])[:2000]
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            STATION_URL + "/api/install-status",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass  # 보고 실패는 설치에 영향 없음


# ═══════════════════════════════════════════════════════
#  AI 진단 시스템
# ═══════════════════════════════════════════════════════

def collect_environment():
    """환경 스냅샷 수집 (stdlib만 사용)"""
    env = {
        "os_version": platform.version(),
        "os_machine": platform.machine(),
        "python_path": PY_PATH or sys.executable,
        "python_version": platform.python_version(),
        "pip_version": None,
        "disk_free_gb": None,
        "network_ok": False,
        "install_dir": INSTALL_DIR,
        "install_dir_contents": [],
        "path_env": os.environ.get("PATH", "")[:1000],
        "running_python_pids": [],
    }

    # pip 버전
    py = PY_PATH or sys.executable
    try:
        r = subprocess.run([py, "-m", "pip", "--version"],
                           capture_output=True, text=True, timeout=10)
        if r.returncode == 0 and r.stdout:
            env["pip_version"] = r.stdout.strip().split(" ")[1]
    except Exception:
        pass

    # 디스크 공간
    try:
        import ctypes
        free = ctypes.c_ulonglong(0)
        ctypes.windll.kernel32.GetDiskFreeSpaceExW(
            "C:\\", None, None, ctypes.pointer(free))
        env["disk_free_gb"] = round(free.value / (1024 ** 3), 1)
    except Exception:
        pass

    # 네트워크
    try:
        urllib.request.urlopen(STATION_URL + "/api/workers", timeout=5)
        env["network_ok"] = True
    except Exception:
        pass

    # 설치 디렉토리 내용
    try:
        env["install_dir_contents"] = os.listdir(INSTALL_DIR)
    except Exception:
        pass

    # 실행 중인 python PID
    try:
        r = subprocess.run(
            ["tasklist", "/fi", "imagename eq python.exe", "/fo", "csv", "/nh"],
            capture_output=True, text=True, timeout=10)
        for line in r.stdout.splitlines():
            if "python" in line.lower():
                parts = line.split(",")
                if len(parts) >= 2:
                    env["running_python_pids"].append(parts[1].strip('"'))
    except Exception:
        pass

    return env


def call_diagnose(step_num, step_name, retry_count, error_info):
    """Station /api/diagnose 호출. 실패 시 None 반환."""
    payload = {
        "session_id": SESSION_ID,
        "step_number": step_num,
        "step_name": step_name,
        "retry_count": retry_count,
        "error": error_info,
        "environment": collect_environment(),
        "log_so_far": "\n".join(INSTALL_LOG[-100:])[:5000],
        "installer_version": VERSION,
        "previous_fixes": PREVIOUS_FIXES[-10:],
    }
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            STATION_URL + "/api/diagnose",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        log("    -> AI 진단 서버 연결 실패: " + str(e))
        return None


def execute_fixes(fix_commands):
    """AI가 반환한 수정 명령 실행"""
    for cmd in fix_commands:
        log("    -> 수정 명령: " + cmd[:100])
        PREVIOUS_FIXES.append(cmd)
        try:
            r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)
            if r.returncode != 0:
                log("    -> 명령 실패: " + (r.stderr or r.stdout)[:200])
            else:
                log("    -> OK")
        except Exception as e:
            log("    -> 명령 오류: " + str(e))


def run_step(step_num, step_name, func, max_retries=3):
    """
    단계 실행 + AI 진단 재시도 루프
    func() → None (성공) or raise StepError (실패)
    """
    progress(step_num, TOTAL, step_name)
    update_progress_file(step_num, step_name, "running")
    report_status("step", step_number=step_num, step_name=step_name)

    for attempt in range(max_retries + 1):
        try:
            func()
            update_progress_file(step_num, step_name, "done")
            report_status("step_done", step_number=step_num, step_name=step_name, success=True)
            return True
        except Exception as e:
            error_info = {
                "type": type(e).__name__,
                "message": str(e)[:500],
                "traceback": traceback.format_exc()[:2000],
                "stdout": getattr(e, "_stdout", "")[:2000] if hasattr(e, "_stdout") else "",
                "stderr": getattr(e, "_stderr", "")[:2000] if hasattr(e, "_stderr") else "",
            }

            if attempt >= max_retries:
                log("    -> [FAIL] {} 최종 실패 ({}회 시도)".format(step_name, attempt + 1))
                update_progress_file(step_num, step_name, "failed")
                report_status("step_done", step_number=step_num, step_name=step_name, success=False)
                return False

            log("    -> 오류: {} — {}".format(type(e).__name__, str(e)[:150]))
            log("    -> AI 진단 요청 중...")

            result = call_diagnose(step_num, step_name, attempt, error_info)

            if result is None:
                log("    -> AI 진단 불가. 5초 후 단순 재시도...")
                time.sleep(5)
                continue

            # 진단 결과 표시
            diagnosis = result.get("diagnosis", "")
            if diagnosis:
                log("    -> 진단: " + diagnosis[:300])
                update_progress_file(step_num, step_name, "diagnosing")
                report_status("diagnosing", diagnosis=diagnosis,
                              diagnosis_count=attempt + 1)

            severity = result.get("severity", "low")
            if severity == "fatal":
                log("    -> [FATAL] 복구 불가능한 문제입니다.")
                return False

            # 수정 명령 실행
            fix_commands = result.get("fix_commands", [])
            if fix_commands:
                log("    -> 수정 적용 중... ({}개 명령)".format(len(fix_commands)))
                execute_fixes(fix_commands)

            if result.get("should_retry", True):
                log("    -> 재시도 ({}/{})...".format(attempt + 1, max_retries))
                time.sleep(2)
            else:
                log("    -> AI가 재시도 불필요로 판단")
                return False

    return False


# ═══════════════════════════════════════════════════════
#  설치 단계 함수 (각각 실패 시 StepError raise)
# ═══════════════════════════════════════════════════════

# 기존 설치 정보를 단계간 공유
_old_env = {}


def step_check_existing():
    """1단계: 기존 설치 확인 + 정리"""
    global _old_env

    env_path = os.path.join(INSTALL_DIR, ".env")
    if not os.path.exists(INSTALL_DIR):
        log("    -> 신규 설치")
        return

    log("    -> 기존 설치 발견: " + INSTALL_DIR)

    # 기존 .env 백업 (워커 ID 유지)
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    _old_env[k.strip()] = v.strip()
        log("    -> 기존 Worker ID 백업: " + _old_env.get("WORKER_ID", "없음"))

    # 기존 워커 프로세스 종료 (자기 자신 제외)
    log("    -> 기존 워커 프로세스 종료...")
    my_pid = os.getpid()
    try:
        result = subprocess.run(
            ["tasklist", "/fi", "imagename eq python.exe", "/fo", "csv", "/nh"],
            capture_output=True, text=True, timeout=10)
        for line in result.stdout.splitlines():
            if "worker.py" in line.lower() or "python" in line.lower():
                parts = line.split(",")
                if len(parts) >= 2:
                    pid = parts[1].strip('"')
                    if pid.isdigit() and int(pid) != my_pid:
                        subprocess.run(["taskkill", "/f", "/pid", pid],
                                       capture_output=True, timeout=10)
                        log("    -> PID {} 종료".format(pid))
    except Exception:
        pass

    time.sleep(1)

    # 기존 파일 삭제
    for item in ["worker.py", "handlers", "logs"]:
        path = os.path.join(INSTALL_DIR, item)
        if os.path.isdir(path):
            shutil.rmtree(path, ignore_errors=True)
        elif os.path.exists(path):
            os.remove(path)

    # site-packages만 삭제 (깨진 패키지 방지)
    site_pkgs = os.path.join(INSTALL_DIR, "python", "Lib", "site-packages")
    if os.path.exists(site_pkgs):
        log("    -> 기존 패키지 정리...")
        shutil.rmtree(site_pkgs, ignore_errors=True)

    log("    -> 클린 완료")


def step_create_dirs():
    """2단계: 설치 디렉토리 생성"""
    for d in ["handlers", "logs", "python"]:
        os.makedirs(os.path.join(INSTALL_DIR, d), exist_ok=True)
    log("    -> " + INSTALL_DIR)


def step_copy_python():
    """3단계: Python embedded 복사"""
    global PY_PATH

    if getattr(sys, "frozen", False):
        base = sys._MEIPASS
    else:
        base = os.path.dirname(os.path.abspath(__file__))

    src = os.path.join(base, "python")
    dst = os.path.join(INSTALL_DIR, "python")

    if not os.path.exists(src):
        raise StepError("Python 소스를 찾을 수 없습니다: " + src)

    if not os.path.exists(os.path.join(dst, "python.exe")):
        log("    -> Python 복사 중...")
        shutil.copytree(src, dst, dirs_exist_ok=True)
        log("    -> 완료")
    else:
        log("    -> 이미 설치됨")

    PY_PATH = os.path.join(dst, "python.exe")

    # 검증
    if not os.path.exists(PY_PATH):
        raise StepError("python.exe가 존재하지 않습니다: " + PY_PATH)


def step_env_check():
    """4단계: 네트워크 + 디스크 확인"""
    # 네트워크
    for attempt in range(3):
        try:
            urllib.request.urlopen(STATION_URL + "/api/workers", timeout=10)
            log("    -> 네트워크 OK")
            break
        except Exception:
            if attempt < 2:
                wait = 5 * (attempt + 1)
                log("    -> 네트워크 실패. {}초 후 재시도... ({}/3)".format(wait, attempt + 1))
                time.sleep(wait)
            else:
                raise StepError("인터넷 연결 실패 (3회 시도)",
                                stderr="Station URL: " + STATION_URL)

    # 디스크
    try:
        import ctypes
        free = ctypes.c_ulonglong(0)
        ctypes.windll.kernel32.GetDiskFreeSpaceExW(
            "C:\\", None, None, ctypes.pointer(free))
        gb = free.value / (1024 ** 3)
        if gb < 1.5:
            log("    -> [WARN] 디스크 공간 부족: {:.1f}GB (권장 1.5GB 이상)".format(gb))
        else:
            log("    -> 디스크 {:.1f}GB 여유".format(gb))
    except Exception:
        log("    -> 디스크 확인 생략")

    log("    -> 환경 확인 완료")


def step_pip_install():
    """5단계: pip 설치"""
    py = PY_PATH
    dst = os.path.dirname(py)
    pip_script = os.path.join(dst, "get-pip.py")

    if os.path.exists(pip_script):
        log("    -> pip 설치 중...")
        r = subprocess.run([py, pip_script, "--quiet"],
                           capture_output=True, text=True, timeout=180)
        if r.returncode != 0:
            raise StepError("pip 설치 실패", stdout=r.stdout, stderr=r.stderr)

    # 검증
    r = subprocess.run([py, "-m", "pip", "--version"],
                       capture_output=True, text=True, timeout=10)
    if r.returncode != 0:
        raise StepError("pip 검증 실패 — pip이 동작하지 않습니다",
                        stdout=r.stdout, stderr=r.stderr)

    ver = r.stdout.strip().split(" ")[1] if r.stdout else "unknown"
    log("    -> pip {} 설치됨".format(ver))


def step_packages():
    """6단계: 크롤링 패키지 설치 (playwright, supabase, Chromium)"""
    py = PY_PATH

    # playwright
    log("    -> playwright 설치 중... (1~2분)")
    r = subprocess.run([py, "-m", "pip", "install", "--quiet", "playwright"],
                       capture_output=True, text=True, timeout=600)
    if r.returncode != 0:
        raise StepError("playwright 설치 실패", stdout=r.stdout, stderr=r.stderr)
    log("    -> playwright OK")

    # supabase
    log("    -> supabase 설치 중...")
    r = subprocess.run([py, "-m", "pip", "install", "--quiet", "supabase"],
                       capture_output=True, text=True, timeout=600)
    if r.returncode != 0:
        raise StepError("supabase 설치 실패", stdout=r.stdout, stderr=r.stderr)
    log("    -> supabase OK")

    # Chromium
    log("    -> Chromium 브라우저 다운로드 중... (2~5분)")
    r = subprocess.run([py, "-m", "playwright", "install", "chromium"],
                       capture_output=True, text=True, timeout=600)
    if r.returncode != 0:
        raise StepError("Chromium 설치 실패", stdout=r.stdout, stderr=r.stderr)
    log("    -> Chromium OK")

    log("    -> 패키지 설치 완료")


def step_download_files():
    """7단계: 워커 파일 다운로드"""
    files = [
        "worker.py", "handlers/__init__.py", "handlers/base.py",
        "handlers/kin.py", "handlers/blog.py", "handlers/serp.py",
    ]
    failed = []
    for f in files:
        t = os.path.join(INSTALL_DIR, f)
        os.makedirs(os.path.dirname(t), exist_ok=True)
        try:
            urllib.request.urlretrieve(
                "{}/api/download?file={}".format(STATION_URL, f), t)
            log("    -> " + f)
        except Exception as e:
            failed.append("{}: {}".format(f, str(e)))

    if failed:
        raise StepError(
            "워커 파일 다운로드 실패: {}개".format(len(failed)),
            stderr="\n".join(failed),
        )


def step_create_env():
    """8단계: .env 설정 파일 생성"""
    wid = _old_env.get("WORKER_ID", "")
    env_path = os.path.join(INSTALL_DIR, ".env")

    if not wid:
        wid = "worker-" + uuid.uuid4().hex[:8]
        log("    -> 새 Worker ID: " + wid)
    else:
        log("    -> 기존 Worker ID 복원: " + wid)

    with open(env_path, "w") as f:
        f.write("SUPABASE_URL={}\nSUPABASE_KEY={}\nWORKER_ID={}\n".format(
            SUPABASE_URL, SUPABASE_KEY, wid))

    # 검증
    if not os.path.exists(env_path):
        raise StepError(".env 파일 생성 실패")

    log("    -> .env 생성 완료")


def step_register_service():
    """9단계: 서비스 등록 + 바로가기 생성"""
    py = PY_PATH
    wid = _old_env.get("WORKER_ID", "worker-unknown")

    # .env에서 실제 worker ID 읽기
    env_path = os.path.join(INSTALL_DIR, ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.startswith("WORKER_ID="):
                    wid = line.strip().split("=", 1)[1]

    # 레지스트리 자동 실행 등록
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
        log("    -> PC 시작 시 자동 실행 등록됨")
    except Exception as e:
        raise StepError("자동 실행 등록 실패: " + str(e))

    # 이전 버전의 .bat 바로가기 정리
    desktop = os.path.join(os.path.expanduser("~"), "Desktop")
    for old_bat in ["CrawlWorker.bat", "CrawlWorker Stop.bat", "CrawlWorker Uninstall.bat"]:
        old_path = os.path.join(desktop, old_bat)
        if os.path.isfile(old_path):
            try:
                os.remove(old_path)
                log("    -> 이전 바로가기 삭제: " + old_bat)
            except Exception:
                pass

    log("    -> 서비스 등록 완료 (GUI 앱 아이콘은 Inno Setup이 생성)")


def step_verify_gui():
    """10단계: GUI 앱 검증 (tkinter 동작 + DLL 상세 진단)"""
    py = PY_PATH
    gui_path = os.path.join(INSTALL_DIR, "worker_gui.pyw")

    if not os.path.exists(gui_path):
        log("    -> worker_gui.pyw 없음 (건너뜀)")
        return

    # 상세 진단 스크립트 — 어떤 DLL이 문제인지 정확히 파악
    diag_script = r'''
import os, sys, ctypes, glob

py_dir = os.path.dirname(sys.executable)
if hasattr(os, 'add_dll_directory'):
    os.add_dll_directory(py_dir)

# Tcl/Tk 환경변수 설정
tcl_dir = os.path.join(py_dir, 'tcl')
if os.path.exists(tcl_dir):
    for d in os.listdir(tcl_dir):
        if d.startswith('tcl'): os.environ['TCL_LIBRARY'] = os.path.join(tcl_dir, d)
        elif d.startswith('tk'): os.environ['TK_LIBRARY'] = os.path.join(tcl_dir, d)

# 1. 필수 파일 존재 확인
required = ['_tkinter.pyd', 'tcl86t.dll', 'tk86t.dll']
for f in required:
    path = os.path.join(py_dir, f)
    if os.path.exists(path):
        print('FILE_OK: ' + f + ' (' + str(os.path.getsize(path)) + ' bytes)')
    else:
        print('FILE_MISSING: ' + f)

# 2. 개별 DLL 로드 테스트
dlls = ['tcl86t.dll', 'tk86t.dll', 'zlib1.dll', 'vcruntime140.dll', 'vcruntime140_1.dll']
for dll in dlls:
    path = os.path.join(py_dir, dll)
    if not os.path.exists(path):
        # 시스템에서 찾기
        sys_path = os.path.join(os.environ.get('SYSTEMROOT','C:\\Windows'), 'System32', dll)
        if os.path.exists(sys_path):
            print('DLL_SYSTEM: ' + dll + ' (System32에 있음)')
        else:
            print('DLL_MISSING: ' + dll)
        continue
    try:
        ctypes.WinDLL(path)
        print('DLL_OK: ' + dll)
    except Exception as e:
        print('DLL_FAIL: ' + dll + ': ' + str(e))

# 3. _tkinter.pyd 로드 테스트
pyd = os.path.join(py_dir, '_tkinter.pyd')
if os.path.exists(pyd):
    try:
        ctypes.WinDLL(pyd)
        print('PYD_OK: _tkinter.pyd')
    except Exception as e:
        print('PYD_FAIL: _tkinter.pyd: ' + str(e))

# 4. Python 버전 정보
print('PYTHON_VER: ' + sys.version)
print('PYTHON_PATH: ' + sys.executable)

# 5. 최종 tkinter import
try:
    import tkinter
    print('RESULT: OK ' + str(tkinter.TkVersion))
except Exception as e:
    print('RESULT: FAIL ' + str(e))
'''

    log("    -> tkinter 상세 진단 중...")
    r = subprocess.run([py, "-c", diag_script],
                       capture_output=True, text=True, timeout=30)
    output = r.stdout + r.stderr
    log("    -> 진단 결과:")
    for line in output.strip().split("\n"):
        log("       " + line)

    if "RESULT: OK" in output:
        log("    -> GUI 앱 검증 성공")
        return

    # 실패 — 상세 정보를 StepError에 담아서 AI 진단에 전달
    raise StepError(
        "tkinter 로드 실패 — GUI 앱이 동작하지 않습니다.\n"
        "DLL 진단 결과를 확인하고 누락된 파일을 복사해야 합니다.",
        stdout=output,
        stderr=r.stderr,
    )


# ═══════════════════════════════════════════════════════
#  메인
# ═══════════════════════════════════════════════════════

def main():
    global LOG_FILE

    # inno 모드: 로그 파일 열기
    if INNO_MODE:
        os.makedirs(INSTALL_DIR, exist_ok=True)
        log_path = os.path.join(INSTALL_DIR, "install.log")
        # 기존 로그/마커 삭제
        for f in [log_path, os.path.join(INSTALL_DIR, "install.done")]:
            if os.path.exists(f):
                try:
                    os.remove(f)
                except Exception:
                    pass
        LOG_FILE = open(log_path, "w", encoding="utf-8", buffering=1)
    else:
        os.system("title CrawlStation Worker Installer v{} (AI)".format(VERSION))
        os.system("color 0A")

    log("")
    log("  ======================================================")
    log("    CrawlStation Worker v{} — Windows Installer".format(VERSION))
    log("    AI 자가 진단 시스템 탑재")
    log("  ======================================================")
    log("")
    log("  Python, Chromium, 워커 파일을 자동 설치합니다.")
    log("  설치 중 문제 발생 시 AI가 자동으로 진단 + 수정합니다.")
    log("  인터넷 연결이 필요하며 5~10분 소요될 수 있습니다.")
    log("")

    # Station에 설치 시작 보고
    import socket
    report_status("start",
                  hostname=socket.gethostname(),
                  os_version=platform.version(),
                  os_machine=platform.machine(),
                  installer_version=VERSION)

    # ── 단계 정의 ──
    steps = [
        (1, "기존 설치 확인", step_check_existing),
        (2, "설치 디렉토리 생성", step_create_dirs),
        (3, "Python 3.12 설치", step_copy_python),
        (4, "환경 확인", step_env_check),
        (5, "pip 설치", step_pip_install),
        (6, "크롤링 패키지 설치", step_packages),
        (7, "워커 파일 다운로드", step_download_files),
        (8, "설정 파일 생성", step_create_env),
        (9, "서비스 등록", step_register_service),
        (10, "GUI 앱 검증", step_verify_gui),
    ]

    failed_steps = []

    for num, name, func in steps:
        success = run_step(num, name, func)
        if not success:
            failed_steps.append(name)
            # 1~4단계는 필수 — 실패 시 중단
            if num <= 4:
                log("\n  [ABORT] 필수 단계 실패: " + name)
                log("  설치를 완료할 수 없습니다.")
                report_status("complete", success=False)
                write_done_marker(False)
                if LOG_FILE:
                    LOG_FILE.close()
                wait_prompt()
                return

    # ── 결과 ──
    if failed_steps:
        log("")
        log("  ======================================================")
        log("    설치 부분 완료 (일부 단계 실패)")
        log("  ======================================================")
        log("")
        log("    실패한 단계: " + ", ".join(failed_steps))
        log("    수동 조치가 필요할 수 있습니다.")
        log("")
        log("    Station: " + STATION_URL)
        report_status("complete", success=False)
        write_done_marker(False)
        if LOG_FILE:
            LOG_FILE.close()
        wait_prompt()
        return

    # 워커 즉시 실행 (백그라운드, 창 없음)
    try:
        os.makedirs(os.path.join(INSTALL_DIR, "logs"), exist_ok=True)
        _lf = open(os.path.join(INSTALL_DIR, "logs", "worker.log"), "a", encoding="utf-8")
        subprocess.Popen(
            [PY_PATH, os.path.join(INSTALL_DIR, "worker.py")],
            cwd=INSTALL_DIR,
            creationflags=0x08000000,
            stdout=_lf,
            stderr=_lf,
        )
    except Exception as e:
        log("    -> 워커 실행 실패: " + str(e))

    log("")
    log("  ======================================================")
    log("    설치 완료!")
    log("  ======================================================")
    log("")
    log("    워커가 백그라운드에서 실행 중입니다.")
    log("")
    log("    - PC 부팅 시 자동 시작")
    log("    - 바탕화면: CrawlWorker / Stop / Uninstall")
    log("    - Station: " + STATION_URL)
    log("    - 제어판에서도 삭제 가능")
    log("")
    log("  ======================================================")

    update_progress_file(10, "설치 완료", "complete")
    report_status("complete", success=True)
    write_done_marker(True)
    if LOG_FILE:
        LOG_FILE.close()
    wait_prompt("  아무 키나 누르면 이 창을 닫습니다...")


if __name__ == "__main__":
    main()
