"""
CrawlStation Worker — Windows GUI
Tkinter-based GUI for managing the CrawlStation Worker service.
Mirrors the Mac SwiftUI app functionality.
Runs with pythonw.exe (.pyw) so no console window appears.
Only uses Python stdlib — no third-party packages required.
"""

# 에러 로깅 — pythonw.exe는 stderr가 없으므로 파일에 기록
import sys
import os
import traceback

def _error_log(msg):
    try:
        log_path = os.path.join(r"C:\CrawlWorker", "gui_error.log")
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(msg + "\n")
    except Exception:
        pass

try:
    # embedded Python에서 _tkinter.pyd가 tcl/tk DLL을 찾을 수 있도록 경로 추가
    _py_dir = os.path.dirname(sys.executable)
    if hasattr(os, "add_dll_directory"):
        os.add_dll_directory(_py_dir)

    # Tcl/Tk 라이브러리 스크립트 경로 설정
    _tcl_dir = os.path.join(_py_dir, "tcl")
    if os.path.exists(_tcl_dir):
        for d in os.listdir(_tcl_dir):
            if d.startswith("tcl"):
                os.environ["TCL_LIBRARY"] = os.path.join(_tcl_dir, d)
            elif d.startswith("tk"):
                os.environ["TK_LIBRARY"] = os.path.join(_tcl_dir, d)
    import tkinter as tk
except Exception as e:
    _error_log("tkinter import failed: " + str(e))
    _error_log(traceback.format_exc())
    # tkinter 없으면 ctypes로 메시지박스 표시
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(
            0,
            "tkinter를 로드할 수 없습니다.\n\n" + str(e) + "\n\n자세한 내용: C:\\CrawlWorker\\gui_error.log",
            "CrawlStation Worker 오류",
            0x10  # MB_ICONERROR
        )
    except Exception:
        pass
    sys.exit(1)
from tkinter import ttk, messagebox, font as tkfont
import json
import os
import subprocess
import threading
import urllib.request
import urllib.error
import time
import glob
import winreg
import shutil

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

WORKER_DIR = r"C:\CrawlWorker"
ENV_PATH = os.path.join(WORKER_DIR, ".env")
WORKER_SCRIPT = os.path.join(WORKER_DIR, "worker.py")
PYTHON_EXE = os.path.join(WORKER_DIR, "python", "python.exe")
LOG_DIR = os.path.join(WORKER_DIR, "logs")
LOG_FILE = os.path.join(LOG_DIR, "worker.log")

WINDOW_WIDTH = 420
WINDOW_HEIGHT = 550

# Colors
COL_BG = "#FFFFFF"
COL_BG_SECONDARY = "#F5F5F7"
COL_BORDER = "#E0E0E0"
COL_TEXT = "#1D1D1F"
COL_TEXT_SECONDARY = "#86868B"
COL_BLUE = "#0071E3"
COL_GREEN = "#34C759"
COL_RED = "#FF3B30"
COL_ORANGE = "#FF9500"
COL_PURPLE = "#AF52DE"
COL_GRAY = "#8E8E93"
COL_LOG_BG = "#FAFAFA"

REFRESH_MS = 5000  # 5 seconds


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def read_env():
    """Parse .env file and return dict of key=value pairs."""
    env = {}
    if not os.path.isfile(ENV_PATH):
        return env
    try:
        with open(ENV_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, _, val = line.partition("=")
                    env[key.strip()] = val.strip().strip("'\"")
    except Exception:
        pass
    return env


def read_version():
    """Extract VERSION from worker.py."""
    if not os.path.isfile(WORKER_SCRIPT):
        return "-"
    try:
        with open(WORKER_SCRIPT, "r", encoding="utf-8") as f:
            for line in f:
                if "VERSION" in line and "=" in line:
                    val = line.split("=", 1)[1].strip().strip("'\"")
                    return val
    except Exception:
        pass
    return "-"


def read_log_tail(n=30):
    """Return last n lines from worker.log."""
    if not os.path.isfile(LOG_FILE):
        return []
    try:
        with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
        return [l.rstrip("\n\r") for l in lines[-n:] if l.strip()]
    except Exception:
        return []


def count_log_stats():
    """Count processed and error entries in the full log."""
    processed = 0
    errors = 0
    if not os.path.isfile(LOG_FILE):
        return processed, errors
    try:
        with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                lower = line.lower()
                if "completed" in lower or "\uc644\ub8cc" in line:
                    processed += 1
                if "error" in lower or "\uc2e4\ud328" in line:
                    errors += 1
    except Exception:
        pass
    return processed, errors


def is_worker_running():
    """Check if worker.py is currently running."""
    try:
        result = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq python.exe", "/FO", "CSV", "/NH"],
            capture_output=True, text=True, creationflags=0x08000000,
        )
        # Also check pythonw.exe
        result2 = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq pythonw.exe", "/FO", "CSV", "/NH"],
            capture_output=True, text=True, creationflags=0x08000000,
        )
        combined = result.stdout + result2.stdout
        # Check if any python process is running worker.py via wmic
        wmic = subprocess.run(
            ["wmic", "process", "where",
             "name='python.exe' or name='pythonw.exe'",
             "get", "commandline"],
            capture_output=True, text=True, creationflags=0x08000000,
        )
        return "worker.py" in wmic.stdout
    except Exception:
        return False


def query_supabase(supabase_url, supabase_key, worker_id):
    """Query Supabase REST API for worker status."""
    if not supabase_url or not supabase_key or not worker_id:
        return None
    url = f"{supabase_url}/rest/v1/workers?id=eq.{worker_id}&select=*"
    req = urllib.request.Request(url, headers={
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data and isinstance(data, list) and len(data) > 0:
                return data[0]
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Main Application
# ---------------------------------------------------------------------------

class CrawlStationGUI:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("CrawlStation Worker")
        self.root.geometry(f"{WINDOW_WIDTH}x{WINDOW_HEIGHT}")
        self.root.resizable(False, False)
        self.root.configure(bg=COL_BG)

        # Try to set icon if available
        ico_path = os.path.join(WORKER_DIR, "app.ico")
        if os.path.isfile(ico_path):
            try:
                self.root.iconbitmap(ico_path)
            except Exception:
                pass

        # Center window on screen
        self.root.update_idletasks()
        x = (self.root.winfo_screenwidth() - WINDOW_WIDTH) // 2
        y = (self.root.winfo_screenheight() - WINDOW_HEIGHT) // 2
        self.root.geometry(f"+{x}+{y}")

        # Configure ttk style
        self.style = ttk.Style()
        self.style.theme_use("clam")
        self._configure_styles()

        # State
        self.worker_id = "-"
        self.version = "-"
        self.is_running = False
        self.station_connected = False
        self.station_url = "-"
        self.last_seen = "-"
        self.total_processed = 0
        self.error_count = 0
        self.current_task = "-"
        self.log_lines = []

        # Build UI (control bar BEFORE log so buttons don't get pushed off)
        self._build_header()
        self._build_status_cards()
        self._build_stats_section()
        self._build_control_bar()
        self._build_log_section()

        # Initial refresh
        self._schedule_refresh()
        self._schedule_log_refresh()
        self._last_log_size = 0

        # 워커가 실행 중이 아니면 자동 시작
        self.root.after(1500, self._auto_start_worker)

    def _configure_styles(self):
        s = self.style
        s.configure(".", background=COL_BG, font=("Segoe UI", 9))
        s.configure("Header.TFrame", background=COL_BG)
        s.configure("Card.TFrame", background=COL_BG_SECONDARY, relief="flat")
        s.configure("Control.TFrame", background=COL_BG)
        s.configure("StatusDot.TLabel", background=COL_BG)

        # Buttons
        s.configure("Start.TButton", font=("Segoe UI", 9, "bold"))
        s.configure("Stop.TButton", font=("Segoe UI", 9, "bold"))
        s.configure("Restart.TButton", font=("Segoe UI", 9))
        s.configure("Uninstall.TButton", font=("Segoe UI", 9))

    # ------------------------------------------------------------------
    # UI Building
    # ------------------------------------------------------------------

    def _build_header(self):
        header = tk.Frame(self.root, bg=COL_BG, padx=16, pady=12)
        header.pack(fill="x")

        # Icon box
        icon_canvas = tk.Canvas(header, width=40, height=40,
                                bg=COL_BLUE, highlightthickness=0)
        icon_canvas.pack(side="left", padx=(0, 10))
        icon_canvas.create_text(20, 20, text="CW",
                                fill="white",
                                font=("Segoe UI", 13, "bold"))

        # Title + worker ID
        title_frame = tk.Frame(header, bg=COL_BG)
        title_frame.pack(side="left", fill="x", expand=True)
        tk.Label(title_frame, text="CrawlStation Worker",
                 font=("Segoe UI", 13, "bold"), bg=COL_BG,
                 fg=COL_TEXT).pack(anchor="w")
        self.lbl_header_id = tk.Label(title_frame, text="-",
                                      font=("Consolas", 9),
                                      bg=COL_BG, fg=COL_TEXT_SECONDARY)
        self.lbl_header_id.pack(anchor="w")

        # Status badge
        badge = tk.Frame(header, bg=COL_BG)
        badge.pack(side="right")
        self.status_dot = tk.Canvas(badge, width=10, height=10,
                                    bg=COL_BG, highlightthickness=0)
        self.status_dot.pack(side="left", padx=(0, 4))
        self._draw_dot(self.status_dot, COL_GRAY)
        self.lbl_status = tk.Label(badge, text="중지됨",
                                   font=("Segoe UI", 9),
                                   bg=COL_BG, fg=COL_GRAY)
        self.lbl_status.pack(side="left")

        # Separator
        sep = tk.Frame(self.root, height=1, bg=COL_BORDER)
        sep.pack(fill="x")

    def _build_status_cards(self):
        container = tk.Frame(self.root, bg=COL_BG, padx=16, pady=10)
        container.pack(fill="x")

        cards_data = [
            ("연결", "-", COL_GREEN),
            ("버전", "-", COL_BLUE),
            ("URL", "-", COL_PURPLE),
            ("마지막 응답", "-", COL_GRAY),
        ]
        self.card_labels = {}

        for i, (title, value, color) in enumerate(cards_data):
            card = tk.Frame(container, bg=COL_BG_SECONDARY, padx=8, pady=6)
            card.grid(row=0, column=i, padx=3, sticky="nsew")
            container.grid_columnconfigure(i, weight=1)

            val_lbl = tk.Label(card, text=value,
                               font=("Segoe UI", 9, "bold"),
                               bg=COL_BG_SECONDARY, fg=color)
            val_lbl.pack()
            tk.Label(card, text=title, font=("Segoe UI", 8),
                     bg=COL_BG_SECONDARY, fg=COL_TEXT_SECONDARY).pack()
            self.card_labels[title] = val_lbl

        sep = tk.Frame(self.root, height=1, bg=COL_BORDER)
        sep.pack(fill="x")

    def _build_stats_section(self):
        container = tk.Frame(self.root, bg=COL_BG, padx=16, pady=8)
        container.pack(fill="x")

        # Row: Processed | Errors | Current Task
        stats_frame = tk.Frame(container, bg=COL_BG)
        stats_frame.pack(fill="x")

        # Processed
        f1 = tk.Frame(stats_frame, bg=COL_BG)
        f1.pack(side="left", expand=True, fill="x")
        tk.Label(f1, text="처리", font=("Segoe UI", 8),
                 bg=COL_BG, fg=COL_TEXT_SECONDARY).pack(anchor="w")
        self.lbl_processed = tk.Label(f1, text="0",
                                      font=("Segoe UI", 11, "bold"),
                                      bg=COL_BG, fg=COL_PURPLE)
        self.lbl_processed.pack(anchor="w")

        # Errors
        f2 = tk.Frame(stats_frame, bg=COL_BG)
        f2.pack(side="left", expand=True, fill="x")
        tk.Label(f2, text="에러", font=("Segoe UI", 8),
                 bg=COL_BG, fg=COL_TEXT_SECONDARY).pack(anchor="w")
        self.lbl_errors = tk.Label(f2, text="0",
                                   font=("Segoe UI", 11, "bold"),
                                   bg=COL_BG, fg=COL_GRAY)
        self.lbl_errors.pack(anchor="w")

        # Current Task
        f3 = tk.Frame(stats_frame, bg=COL_BG)
        f3.pack(side="left", expand=True, fill="x")
        tk.Label(f3, text="현재 작업", font=("Segoe UI", 8),
                 bg=COL_BG, fg=COL_TEXT_SECONDARY).pack(anchor="w")
        self.lbl_task = tk.Label(f3, text="-",
                                 font=("Consolas", 9),
                                 bg=COL_BG, fg=COL_TEXT)
        self.lbl_task.pack(anchor="w")

        sep = tk.Frame(self.root, height=1, bg=COL_BORDER)
        sep.pack(fill="x")

    def _build_log_section(self):
        log_header = tk.Frame(self.root, bg=COL_BG, padx=16, pady=4)
        log_header.pack(fill="x")
        tk.Label(log_header, text="로그", font=("Segoe UI", 9, "bold"),
                 bg=COL_BG, fg=COL_TEXT).pack(side="left")

        # Refresh button
        refresh_btn = tk.Label(log_header, text="\u21BB",
                               font=("Segoe UI", 12), bg=COL_BG,
                               fg=COL_TEXT_SECONDARY, cursor="hand2")
        refresh_btn.pack(side="right")
        refresh_btn.bind("<Button-1>", lambda e: self._trigger_refresh())

        # Open log file button
        open_btn = tk.Label(log_header, text="파일 열기",
                            font=("Segoe UI", 8, "underline"), bg=COL_BG,
                            fg=COL_BLUE, cursor="hand2")
        open_btn.pack(side="right", padx=(0, 10))
        open_btn.bind("<Button-1>", lambda e: self._open_log_file())

        # Log text widget
        log_frame = tk.Frame(self.root, bg=COL_BORDER, padx=1, pady=1)
        log_frame.pack(fill="both", expand=True, padx=16, pady=(0, 8))

        self.log_text = tk.Text(
            log_frame, wrap="word", state="disabled",
            bg=COL_LOG_BG, fg=COL_TEXT,
            font=("Consolas", 8), relief="flat",
            borderwidth=0, padx=8, pady=6,
            selectbackground=COL_BLUE,
            selectforeground="white",
        )
        scrollbar = ttk.Scrollbar(log_frame, orient="vertical",
                                  command=self.log_text.yview)
        self.log_text.configure(yscrollcommand=scrollbar.set)
        scrollbar.pack(side="right", fill="y")
        self.log_text.pack(side="left", fill="both", expand=True)

        # Configure log text tags for coloring
        self.log_text.tag_configure("error", foreground=COL_RED)
        self.log_text.tag_configure("warning", foreground=COL_ORANGE)
        self.log_text.tag_configure("success", foreground=COL_GREEN)
        self.log_text.tag_configure("normal", foreground=COL_TEXT)

        sep = tk.Frame(self.root, height=1, bg=COL_BORDER)
        sep.pack(fill="x")

    def _make_button(self, parent, text, bg, fg="white", font_style=("Segoe UI", 9, "bold"),
                     active_bg=None, command=None):
        """호버/클릭 효과가 있는 버튼 생성"""
        if active_bg is None:
            # 약간 어두운 색
            active_bg = bg
        btn = tk.Button(
            parent, text=text,
            font=font_style,
            bg=bg, fg=fg, relief="raised", bd=1,
            activebackground=active_bg, activeforeground=fg,
            padx=14, pady=5, cursor="hand2",
            command=command,
        )
        _bg = bg
        _abg = active_bg

        def on_enter(e):
            if btn["state"] != "disabled":
                btn.configure(bg=_abg)

        def on_leave(e):
            if btn["state"] != "disabled":
                btn.configure(bg=_bg)

        btn.bind("<Enter>", on_enter)
        btn.bind("<Leave>", on_leave)
        return btn

    def _build_control_bar(self):
        bar = tk.Frame(self.root, bg=COL_BG, padx=16, pady=10)
        bar.pack(fill="x")

        btn_frame = tk.Frame(bar, bg=COL_BG)
        btn_frame.pack(side="left")

        self.btn_start = self._make_button(
            btn_frame, "\u25B6  시작", COL_GREEN, active_bg="#2DB84D",
            command=self._start_worker)
        self.btn_start.pack(side="left", padx=(0, 6))

        self.btn_stop = self._make_button(
            btn_frame, "\u25A0  중지", COL_ORANGE, active_bg="#E08600",
            command=self._stop_worker)
        self.btn_stop.pack(side="left", padx=(0, 6))

        self.btn_restart = self._make_button(
            btn_frame, "\u21BB 재시작", COL_BLUE, active_bg="#005BBB",
            font_style=("Segoe UI", 9), command=self._restart_worker)
        self.btn_restart.pack(side="left")

        self.btn_diagnose = self._make_button(
            btn_frame, "진단", "#6B7280", active_bg="#4B5563",
            font_style=("Segoe UI", 9), command=self._run_diagnostics)
        self.btn_diagnose.pack(side="left", padx=(6, 0))

        # 삭제 버튼 (오른쪽)
        self.btn_uninstall = tk.Button(
            bar, text="삭제",
            font=("Segoe UI", 9), fg=COL_RED,
            bg=COL_BG, relief="flat",
            activeforeground=COL_RED,
            cursor="hand2",
            command=self._uninstall,
        )
        self.btn_uninstall.pack(side="right")

    # ------------------------------------------------------------------
    # Worker Process Helpers
    # ------------------------------------------------------------------

    def _worker_env(self):
        """워커 실행 시 환경변수"""
        env = os.environ.copy()
        env["PYTHONPATH"] = WORKER_DIR + os.pathsep + env.get("PYTHONPATH", "")
        env["PYTHONIOENCODING"] = "utf-8"
        return env

    # ------------------------------------------------------------------
    # Drawing Helpers
    # ------------------------------------------------------------------

    def _draw_dot(self, canvas, color):
        canvas.delete("all")
        canvas.create_oval(1, 1, 9, 9, fill=color, outline=color)

    # ------------------------------------------------------------------
    # Actions
    # ------------------------------------------------------------------

    def _download_worker_files(self):
        """누락된 워커 파일(worker.py, handlers/*)을 Station → GitHub 순서로 다운로드"""
        REQUIRED_FILES = [
            "worker.py",
            "handlers/__init__.py",
            "handlers/base.py",
            "handlers/kin.py",
            "handlers/blog.py",
            "handlers/serp.py",
            "handlers/area.py",
            "handlers/deep.py",
            "handlers/rank.py",
        "supabase_rest.py",
        ]
        STATION_DL = "https://crawl-station.vercel.app/api/download?file={}"
        GITHUB_RAW = "https://raw.githubusercontent.com/gnookim/naver-crawler/main/{}"

        downloaded = []
        failed = []
        for f in REQUIRED_FILES:
            target = os.path.join(WORKER_DIR, f)
            if os.path.isfile(target):
                continue  # 이미 존재
            os.makedirs(os.path.dirname(target), exist_ok=True)
            ok = False
            # 1차: Station 다운로드
            try:
                urllib.request.urlretrieve(STATION_DL.format(f), target)
                # 404 HTML 응답 감지 (JSON 에러)
                with open(target, "r", encoding="utf-8") as chk:
                    head = chk.read(50)
                if head.strip().startswith("{") and "error" in head.lower():
                    os.remove(target)
                else:
                    ok = True
            except Exception:
                if os.path.isfile(target):
                    os.remove(target)
            # 2차: GitHub raw 다운로드
            if not ok:
                try:
                    urllib.request.urlretrieve(GITHUB_RAW.format(f), target)
                    ok = True
                except Exception as e:
                    failed.append(f"{f}: {e}")
            if ok:
                downloaded.append(f)
        return downloaded, failed

    def _force_redownload_all(self):
        """모든 워커 파일을 강제 재다운로드 (기존 파일 삭제 후)"""
        REQUIRED_FILES = [
            "worker.py",
            "handlers/__init__.py",
            "handlers/base.py",
            "handlers/kin.py",
            "handlers/blog.py",
            "handlers/serp.py",
            "handlers/area.py",
            "handlers/deep.py",
            "handlers/rank.py",
        "supabase_rest.py",
        ]
        GITHUB_RAW = "https://raw.githubusercontent.com/gnookim/naver-crawler/main/{}"
        downloaded = 0
        for f in REQUIRED_FILES:
            target = os.path.join(WORKER_DIR, f)
            os.makedirs(os.path.dirname(target), exist_ok=True)
            # 기존 파일 삭제
            if os.path.isfile(target):
                try:
                    os.remove(target)
                except Exception:
                    pass
            # GitHub에서 다운로드
            try:
                urllib.request.urlretrieve(GITHUB_RAW.format(f), target)
                downloaded += 1
            except Exception:
                pass
        self.root.after(0, lambda: self._log_append(
            f"  강제 재다운로드: {downloaded}/{len(REQUIRED_FILES)}개 완료\n"))

    def _call_ai_diagnose(self, action, error_msg):
        """Station AI 진단 API 호출 — 에러 분석 + 해결 방안"""
        try:
            import platform as _pf
            payload = json.dumps({
                "session_id": "gui-" + read_env().get("WORKER_ID", "unknown"),
                "step_number": 0,
                "step_name": action,
                "retry_count": 0,
                "error": {
                    "type": "GUIError",
                    "message": error_msg[:500],
                },
                "environment": {
                    "os_version": _pf.version(),
                    "python_path": PYTHON_EXE,
                    "install_dir": WORKER_DIR,
                    "install_dir_contents": os.listdir(WORKER_DIR) if os.path.isdir(WORKER_DIR) else [],
                    "handlers_contents": os.listdir(os.path.join(WORKER_DIR, "handlers")) if os.path.isdir(os.path.join(WORKER_DIR, "handlers")) else [],
                },
                "log_so_far": error_msg[:2000],
                "installer_version": "gui",
                "previous_fixes": [],
            }).encode("utf-8")

            req = urllib.request.Request(
                "https://crawl-station.vercel.app/api/diagnose",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                diagnosis = result.get("diagnosis", "")
                fix_commands = result.get("fix_commands", [])

                # 자동 수정 명령 실행
                if fix_commands:
                    self.root.after(0, lambda: self._log_append(
                        f"[AI] {len(fix_commands)}개 수정 명령 실행 중...\n"))
                    for cmd in fix_commands:
                        try:
                            subprocess.run(cmd, shell=True, capture_output=True,
                                         text=True, timeout=30)
                        except Exception:
                            pass

                return diagnosis
        except Exception as e:
            return f"AI 진단 연결 실패: {e}"

    def _start_worker(self):
        def _do():
            # 1. 파일 존재 확인
            issues = []
            if not os.path.isfile(PYTHON_EXE):
                issues.append(f"Python 없음: {PYTHON_EXE}")
            if not os.path.isfile(WORKER_SCRIPT):
                issues.append(f"worker.py 없음: {WORKER_SCRIPT}")
            if not os.path.isfile(ENV_PATH):
                issues.append(f".env 없음: {ENV_PATH}")
            else:
                with open(ENV_PATH) as f:
                    content = f.read()
                if "__SUPABASE_URL__" in content or not content.strip():
                    issues.append(".env에 크레덴셜이 설정되지 않았습니다")

            if issues:
                msg = "워커를 시작할 수 없습니다:\n\n" + "\n".join(issues)
                self.root.after(0, lambda: messagebox.showerror("시작 실패", msg))
                return

            # 1.5. 누락된 워커 파일 자동 다운로드 (handlers 등)
            downloaded, dl_failed = self._download_worker_files()
            if downloaded:
                self.root.after(0, lambda: self._log_append(
                    f"누락 파일 {len(downloaded)}개 다운로드 완료: {', '.join(downloaded)}\n"))
            if dl_failed:
                msg = "필수 파일 다운로드 실패:\n\n" + "\n".join(dl_failed)
                self.root.after(0, lambda: messagebox.showerror("시작 실패", msg))
                return

            # 2. 워커 테스트 실행 (최대 2회: 실패 시 자동 복구 후 재시도)
            for attempt in range(2):
                self.root.after(0, lambda: self._log_append(
                    f"워커 시작 중...{' (재시도)' if attempt > 0 else ''}\n"))
                try:
                    CREATE_NO_WINDOW = 0x08000000
                    test_proc = subprocess.Popen(
                        [PYTHON_EXE, WORKER_SCRIPT],
                        cwd=WORKER_DIR,
                        creationflags=CREATE_NO_WINDOW,
                        env=self._worker_env(),
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                    )
                    time.sleep(3)
                    if test_proc.poll() is not None:
                        stdout = test_proc.stdout.read().decode("utf-8", errors="replace")[-1000:]
                        stderr = test_proc.stderr.read().decode("utf-8", errors="replace")[-1000:]
                        error_msg = stderr or stdout or "(출력 없음)"

                        # 자동 복구 시도: ModuleNotFoundError → 파일 강제 재다운로드
                        if "ModuleNotFoundError" in error_msg and attempt == 0:
                            self.root.after(0, lambda: self._log_append(
                                f"모듈 오류 감지 — 파일 강제 재다운로드 중...\n"))
                            self._force_redownload_all()
                            continue  # 재시도

                        # 자동 복구 실패 또는 다른 에러 → AI 진단 요청
                        self.root.after(0, lambda: self._log_append(f"[에러] {error_msg}\n"))
                        ai_result = self._call_ai_diagnose("start_failure", error_msg)
                        if ai_result:
                            self.root.after(0, lambda: self._log_append(
                                f"[AI 진단] {ai_result}\n"))
                        msg = f"워커가 즉시 종료되었습니다.\n\n{error_msg}"
                        self.root.after(0, lambda: messagebox.showerror("시작 실패", msg))
                        return
                    else:
                        test_proc.kill()
                        test_proc.wait()
                        break  # 테스트 통과
                except Exception as e:
                    msg = f"워커 실행 실패:\n\n{str(e)}"
                    self.root.after(0, lambda: messagebox.showerror("시작 실패", msg))
                    return

            # 3. 본 실행 (stdout/stderr → 로그파일, 파이프 없음)
            try:
                os.makedirs(LOG_DIR, exist_ok=True)
                log_fh = open(LOG_FILE, "a", encoding="utf-8")
                subprocess.Popen(
                    [PYTHON_EXE, WORKER_SCRIPT],
                    cwd=WORKER_DIR,
                    creationflags=CREATE_NO_WINDOW,
                    env=self._worker_env(),
                    stdout=log_fh,
                    stderr=log_fh,
                )
                self.root.after(0, lambda: self._log_append("워커가 시작되었습니다.\n"))
            except Exception as e:
                self.root.after(0, lambda: self._log_append(f"[에러] 본 실행 실패: {e}\n"))

            time.sleep(2)
            self._refresh_data()

        threading.Thread(target=_do, daemon=True).start()

    def _log_append(self, text):
        """로그 텍스트 위젯에 메시지 추가"""
        try:
            self.log_text.configure(state="normal")
            self.log_text.insert("end", text)
            self.log_text.see("end")
            self.log_text.configure(state="disabled")
        except Exception:
            pass

    def _stop_worker(self):
        def _do():
            try:
                CREATE_NO_WINDOW = 0x08000000
                # Find PIDs running worker.py and kill only those
                wmic = subprocess.run(
                    ["wmic", "process", "where",
                     "name='python.exe' or name='pythonw.exe'",
                     "get", "processid,commandline", "/FORMAT:CSV"],
                    capture_output=True, text=True,
                    creationflags=CREATE_NO_WINDOW,
                )
                for line in wmic.stdout.splitlines():
                    if "worker.py" in line:
                        parts = line.strip().split(",")
                        if parts:
                            pid = parts[-1].strip()
                            if pid.isdigit():
                                subprocess.run(
                                    ["taskkill", "/F", "/PID", pid],
                                    creationflags=CREATE_NO_WINDOW,
                                    capture_output=True,
                                )
            except Exception:
                pass
            time.sleep(1.5)
            self._refresh_data()

        threading.Thread(target=_do, daemon=True).start()

    def _restart_worker(self):
        def _do():
            # Stop
            try:
                CREATE_NO_WINDOW = 0x08000000
                wmic = subprocess.run(
                    ["wmic", "process", "where",
                     "name='python.exe' or name='pythonw.exe'",
                     "get", "processid,commandline", "/FORMAT:CSV"],
                    capture_output=True, text=True,
                    creationflags=CREATE_NO_WINDOW,
                )
                for line in wmic.stdout.splitlines():
                    if "worker.py" in line:
                        parts = line.strip().split(",")
                        if parts:
                            pid = parts[-1].strip()
                            if pid.isdigit():
                                subprocess.run(
                                    ["taskkill", "/F", "/PID", pid],
                                    creationflags=CREATE_NO_WINDOW,
                                    capture_output=True,
                                )
            except Exception:
                pass
            time.sleep(1.5)
            # 누락 파일 다운로드 후 Start
            self._download_worker_files()
            if os.path.isfile(PYTHON_EXE) and os.path.isfile(WORKER_SCRIPT):
                try:
                    subprocess.Popen(
                        [PYTHON_EXE, WORKER_SCRIPT],
                        cwd=WORKER_DIR,
                        creationflags=0x08000000,
                        env=self._worker_env(),
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                    )
                except Exception:
                    pass
            time.sleep(1.5)
            self._refresh_data()

        threading.Thread(target=_do, daemon=True).start()

    def _run_diagnostics(self):
        """전체 시스템 진단 + 자동 수정"""
        def _do():
            results = []
            fixes_applied = 0

            self.root.after(0, lambda: self._log_append("\n=== 시스템 진단 시작 ===\n"))

            # 1. Python 확인
            if os.path.isfile(PYTHON_EXE):
                results.append("✓ Python: " + PYTHON_EXE)
            else:
                results.append("✕ Python 없음: " + PYTHON_EXE)

            # 2. .env 확인
            env_data = {}
            if os.path.isfile(ENV_PATH):
                with open(ENV_PATH) as f:
                    for line in f:
                        line = line.strip()
                        if "=" in line and not line.startswith("#"):
                            k, v = line.split("=", 1)
                            env_data[k.strip()] = v.strip()

                if env_data.get("SUPABASE_URL") and "__" not in env_data.get("SUPABASE_URL", ""):
                    results.append("✓ SUPABASE_URL: " + env_data["SUPABASE_URL"][:40] + "...")
                else:
                    results.append("✕ SUPABASE_URL 미설정")
                if env_data.get("SUPABASE_KEY") and "__" not in env_data.get("SUPABASE_KEY", ""):
                    results.append("✓ SUPABASE_KEY: 설정됨")
                else:
                    results.append("✕ SUPABASE_KEY 미설정")
                if env_data.get("WORKER_ID"):
                    results.append("✓ WORKER_ID: " + env_data["WORKER_ID"])
                else:
                    results.append("✕ WORKER_ID 미설정")
            else:
                results.append("✕ .env 없음: " + ENV_PATH)

            # 3. 워커 파일 확인 + 누락 시 자동 다운로드
            if os.path.isfile(WORKER_SCRIPT):
                results.append("✓ worker.py: 존재")
            else:
                results.append("✕ worker.py 없음")

            handlers_dir = os.path.join(WORKER_DIR, "handlers")
            if os.path.isdir(handlers_dir) and os.path.isfile(os.path.join(handlers_dir, "base.py")):
                results.append("✓ handlers: 존재")
            else:
                results.append("✕ handlers 없음")

            # 누락 파일 자동 다운로드
            downloaded, dl_failed = self._download_worker_files()
            if downloaded:
                for f in downloaded:
                    results.append(f"  ✓ 다운로드: {f}")
                    fixes_applied += 1
            if dl_failed:
                for f in dl_failed:
                    results.append(f"  ✕ 다운로드 실패: {f}")

            # 5. supabase 패키지 확인
            try:
                r = subprocess.run(
                    [PYTHON_EXE, "-c", "import supabase; print(supabase.__version__)"],
                    capture_output=True, text=True, timeout=10,
                    creationflags=0x08000000,
                )
                if r.returncode == 0:
                    results.append("✓ supabase 패키지: " + r.stdout.strip())
                else:
                    results.append("✕ supabase 패키지 없음 — 설치 시도...")
                    r2 = subprocess.run(
                        [PYTHON_EXE, "-m", "pip", "install", "--quiet", "supabase"],
                        capture_output=True, text=True, timeout=300,
                        creationflags=0x08000000,
                    )
                    if r2.returncode == 0:
                        results.append("  ✓ supabase 설치 완료")
                        fixes_applied += 1
                    else:
                        results.append("  ✕ supabase 설치 실패: " + r2.stderr[:200])
            except Exception as e:
                results.append(f"✕ supabase 확인 오류: {e}")

            # 6. playwright/chromium 확인
            try:
                r = subprocess.run(
                    [PYTHON_EXE, "-c", "from playwright.sync_api import sync_playwright; print('OK')"],
                    capture_output=True, text=True, timeout=10,
                    creationflags=0x08000000,
                )
                if r.returncode == 0:
                    results.append("✓ playwright: 설치됨")
                else:
                    results.append("✕ playwright 없음 — 설치 시도...")
                    subprocess.run(
                        [PYTHON_EXE, "-m", "pip", "install", "--quiet", "playwright"],
                        capture_output=True, text=True, timeout=300,
                        creationflags=0x08000000,
                    )
                    subprocess.run(
                        [PYTHON_EXE, "-m", "playwright", "install", "chromium"],
                        capture_output=True, text=True, timeout=600,
                        creationflags=0x08000000,
                    )
                    results.append("  ✓ playwright + chromium 설치 시도 완료")
                    fixes_applied += 1
            except Exception as e:
                results.append(f"✕ playwright 확인 오류: {e}")

            # 7. 네트워크 확인
            try:
                import urllib.request
                urllib.request.urlopen("https://crawl-station.vercel.app/api/workers", timeout=5)
                results.append("✓ Station 연결: OK")
            except Exception:
                results.append("✕ Station 연결 실패")

            # 8. 워커 실행 테스트 (실패 시 자동 복구 + AI 진단)
            if os.path.isfile(WORKER_SCRIPT) and os.path.isfile(PYTHON_EXE):
                results.append("\n워커 실행 테스트 중...")
                for test_attempt in range(2):
                    try:
                        proc = subprocess.Popen(
                            [PYTHON_EXE, WORKER_SCRIPT],
                            cwd=WORKER_DIR,
                            creationflags=0x08000000,
                            env=self._worker_env(),
                            stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE,
                        )
                        time.sleep(5)
                        if proc.poll() is not None:
                            stderr = proc.stderr.read().decode("utf-8", errors="replace")[-500:]
                            stdout = proc.stdout.read().decode("utf-8", errors="replace")[-500:]
                            error_out = stderr or stdout or ""

                            if "ModuleNotFoundError" in error_out and test_attempt == 0:
                                results.append("✕ 모듈 오류 — 파일 강제 재다운로드 중...")
                                self._force_redownload_all()
                                fixes_applied += 1
                                continue  # 재시도

                            results.append("✕ 워커 즉시 종료됨:")
                            if error_out:
                                results.append("  " + error_out[:300])

                            # AI 진단
                            results.append("\nAI 진단 요청 중...")
                            ai = self._call_ai_diagnose("diagnostic_test", error_out)
                            if ai:
                                results.append(f"AI: {ai[:300]}")
                        else:
                            results.append("✓ 워커 실행 중! (PID: " + str(proc.pid) + ")")
                            proc.stdout.close()
                            proc.stderr.close()
                        break
                    except Exception as e:
                        results.append(f"✕ 워커 실행 실패: {e}")
                        break

            # 결과 표시
            summary = "\n".join(results)
            if fixes_applied:
                summary += f"\n\n{fixes_applied}개 문제를 자동 수정했습니다."
            summary += "\n=== 진단 완료 ===\n"

            self.root.after(0, lambda: self._log_append(summary + "\n"))
            time.sleep(2)
            self._refresh_data()

        threading.Thread(target=_do, daemon=True).start()

    def _uninstall(self):
        if not messagebox.askyesno(
            "CrawlStation Worker 삭제",
            "워커 서비스, 설정, 모든 데이터가 삭제됩니다.\n"
            "정말 삭제하시겠습니까?",
            icon="warning",
        ):
            return

        def _do():
            CREATE_NO_WINDOW = 0x08000000

            # 1. Stop ALL worker-related processes (worker.py)
            try:
                wmic = subprocess.run(
                    ["wmic", "process", "where",
                     "name='python.exe' or name='pythonw.exe'",
                     "get", "processid,commandline", "/FORMAT:CSV"],
                    capture_output=True, text=True,
                    creationflags=CREATE_NO_WINDOW,
                )
                for line in wmic.stdout.splitlines():
                    if "worker.py" in line:
                        parts = line.strip().split(",")
                        if parts:
                            pid = parts[-1].strip()
                            if pid.isdigit():
                                subprocess.run(
                                    ["taskkill", "/F", "/PID", pid],
                                    creationflags=CREATE_NO_WINDOW,
                                    capture_output=True,
                                )
            except Exception:
                pass

            time.sleep(1)

            # 2. Delete from Supabase
            env = read_env()
            wid = env.get("WORKER_ID", "")
            surl = env.get("SUPABASE_URL", "")
            skey = env.get("SUPABASE_KEY", "")
            if wid and surl and skey:
                try:
                    url = f"{surl}/rest/v1/workers?id=eq.{wid}"
                    req = urllib.request.Request(url, method="DELETE", headers={
                        "apikey": skey,
                        "Authorization": f"Bearer {skey}",
                    })
                    urllib.request.urlopen(req, timeout=5)
                except Exception:
                    pass

            # 3. Remove registry entry (startup)
            try:
                key = winreg.OpenKey(
                    winreg.HKEY_CURRENT_USER,
                    r"Software\Microsoft\Windows\CurrentVersion\Run",
                    0, winreg.KEY_SET_VALUE,
                )
                try:
                    winreg.DeleteValue(key, "CrawlStationWorker")
                except FileNotFoundError:
                    pass
                winreg.CloseKey(key)
            except Exception:
                pass

            # 4. Remove Start Menu / Desktop shortcuts
            for folder in [
                os.path.join(os.environ.get("APPDATA", ""), "Microsoft", "Windows", "Start Menu", "Programs"),
                os.path.join(os.path.expanduser("~"), "Desktop"),
            ]:
                for name in ["CrawlStation Worker.lnk", "CrawlWorker.bat",
                             "CrawlWorker Stop.bat", "CrawlWorker Uninstall.bat"]:
                    path = os.path.join(folder, name)
                    if os.path.isfile(path):
                        try:
                            os.remove(path)
                        except Exception:
                            pass

            # 5. Inno Setup 언인스톨러가 있으면 실행 (제어판 등록 제거)
            uninstaller = os.path.join(WORKER_DIR, "unins000.exe")
            if os.path.isfile(uninstaller):
                try:
                    subprocess.Popen(
                        [uninstaller, "/SILENT", "/NORESTART"],
                        creationflags=CREATE_NO_WINDOW,
                    )
                    # Inno 언인스톨러가 폴더를 삭제해줌
                    time.sleep(2)
                except Exception:
                    pass

            # 6. Delete worker directory (예약 삭제 — 실행 중 파일 대비)
            # 지금 삭제 시도
            try:
                shutil.rmtree(WORKER_DIR, ignore_errors=True)
            except Exception:
                pass

            # 잔여 파일이 있으면 재부팅 시 삭제하는 배치 생성
            if os.path.isdir(WORKER_DIR):
                try:
                    bat = os.path.join(os.environ.get("TEMP", "C:\\Temp"),
                                       "crawlworker_cleanup.bat")
                    with open(bat, "w") as f:
                        f.write(f'@echo off\nping 127.0.0.1 -n 3 >nul\n'
                                f'rmdir /s /q "{WORKER_DIR}" 2>nul\n'
                                f'del "%~f0" 2>nul\n')
                    subprocess.Popen(
                        ["cmd", "/c", bat],
                        creationflags=CREATE_NO_WINDOW,
                    )
                except Exception:
                    pass

            # 7. Close app
            self.root.after(0, self.root.destroy)

        threading.Thread(target=_do, daemon=True).start()

    def _open_log_file(self):
        if os.path.isfile(LOG_FILE):
            try:
                os.startfile(LOG_FILE)
            except Exception:
                pass

    def _trigger_refresh(self):
        threading.Thread(target=self._refresh_data, daemon=True).start()

    # ------------------------------------------------------------------
    # Refresh / Auto-update
    # ------------------------------------------------------------------

    def _schedule_refresh(self):
        threading.Thread(target=self._refresh_data, daemon=True).start()
        self.root.after(REFRESH_MS, self._schedule_refresh)

    def _schedule_log_refresh(self):
        """로그 실시간 갱신 (1초마다, 파일 변경 시에만)"""
        try:
            if os.path.isfile(LOG_FILE):
                size = os.path.getsize(LOG_FILE)
                if size != self._last_log_size:
                    self._last_log_size = size
                    lines = read_log_tail(50)
                    self.log_text.configure(state="normal")
                    self.log_text.delete("1.0", "end")
                    for line in lines:
                        tag = self._log_tag(line)
                        self.log_text.insert("end", line + "\n", tag)
                    self.log_text.configure(state="disabled")
                    self.log_text.see("end")
        except Exception:
            pass
        self.root.after(1000, self._schedule_log_refresh)

    def _refresh_data(self):
        """Gather all data in background thread, then update UI on main thread."""
        env = read_env()
        worker_id = env.get("WORKER_ID", "-")
        version = read_version()
        running = is_worker_running()
        log_lines = read_log_tail(50)
        processed, errors = count_log_stats()
        supabase_url = env.get("SUPABASE_URL", "")
        supabase_key = env.get("SUPABASE_KEY", "")

        # Query Supabase for station connection + extra data
        station_connected = False
        station_url = supabase_url or "-"
        last_seen = "-"
        current_task = "-"

        worker_data = query_supabase(supabase_url, supabase_key, worker_id)
        if worker_data:
            station_connected = True
            last_seen = worker_data.get("last_seen", "-")
            if last_seen and last_seen != "-":
                # Show only datetime portion (first 19 chars of ISO format)
                last_seen = str(last_seen)[:19].replace("T", " ")
            current_task = worker_data.get("current_task", "-") or "-"
            # Override stats from server if available
            if "total_processed" in worker_data:
                processed = worker_data["total_processed"] or processed
            if "error_count" in worker_data:
                errors = worker_data["error_count"] or errors

        # Schedule UI update on main thread
        self.root.after(0, lambda: self._update_ui(
            worker_id=worker_id,
            version=version,
            running=running,
            station_connected=station_connected,
            station_url=station_url,
            last_seen=last_seen,
            current_task=current_task,
            processed=processed,
            errors=errors,
            log_lines=log_lines,
        ))

    def _update_ui(self, worker_id, version, running, station_connected,
                   station_url, last_seen, current_task, processed, errors,
                   log_lines):
        """Update all UI elements. Must be called on main thread."""

        # Header
        self.lbl_header_id.configure(text=worker_id)

        # Status dot + label
        if running:
            self._draw_dot(self.status_dot, COL_GREEN)
            self.lbl_status.configure(text="실행 중", fg=COL_GREEN)
        else:
            self._draw_dot(self.status_dot, COL_GRAY)
            self.lbl_status.configure(text="중지됨", fg=COL_GRAY)

        # Status cards
        if station_connected:
            self.card_labels["연결"].configure(text="연결됨", fg=COL_GREEN)
        else:
            self.card_labels["연결"].configure(text="오프라인", fg=COL_ORANGE)

        self.card_labels["버전"].configure(text=f"v{version}")

        # Truncate URL for display
        display_url = station_url
        if len(display_url) > 18:
            display_url = display_url[:18] + "..."
        self.card_labels["URL"].configure(text=display_url)

        # Truncate last seen
        display_last = last_seen
        if len(display_last) > 18:
            display_last = display_last[:18] + "..."
        self.card_labels["마지막 응답"].configure(text=display_last)

        # Stats
        self.lbl_processed.configure(text=str(processed))
        error_color = COL_RED if errors > 0 else COL_GRAY
        self.lbl_errors.configure(text=str(errors), fg=error_color)
        self.lbl_task.configure(text=current_task if current_task != "-" else "-")

        # Control buttons visibility
        if running:
            self.btn_start.configure(state="disabled")
            self.btn_stop.configure(state="normal")
            self.btn_restart.configure(state="normal")
        else:
            self.btn_start.configure(state="normal")
            self.btn_stop.configure(state="disabled")
            self.btn_restart.configure(state="disabled")

        # Log
        self.log_text.configure(state="normal")
        self.log_text.delete("1.0", "end")
        for line in log_lines:
            tag = self._log_tag(line)
            self.log_text.insert("end", line + "\n", tag)
        self.log_text.configure(state="disabled")
        self.log_text.see("end")

    def _log_tag(self, line):
        lower = line.lower()
        if "error" in lower or "\uc2e4\ud328" in line:
            return "error"
        if "warning" in lower:
            return "warning"
        if "completed" in lower or "\uc644\ub8cc" in line or "\uc2dc\uc791" in line:
            return "success"
        return "normal"

    # ------------------------------------------------------------------
    # Run
    # ------------------------------------------------------------------

    def _auto_start_worker(self):
        """GUI 시작 시 워커가 실행 중이 아니면 자동 시작"""
        if not is_worker_running():
            self._log_append("워커 자동 시작 중...\n")
            self._start_worker()

    def run(self):
        self.root.mainloop()


# ---------------------------------------------------------------------------
# Entry
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    try:
        app = CrawlStationGUI()
        app.run()
    except Exception as e:
        _error_log("GUI crashed: " + str(e))
        _error_log(traceback.format_exc())
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(
                0,
                "오류가 발생했습니다.\n\n" + str(e) + "\n\n자세한 내용: C:\\CrawlWorker\\gui_error.log",
                "CrawlStation Worker 오류",
                0x10
            )
        except Exception:
            pass
