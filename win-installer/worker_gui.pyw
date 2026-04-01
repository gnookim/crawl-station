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
    # embedded Python에서 tkinter가 Tcl/Tk를 찾을 수 있도록 경로 설정
    _py_dir = os.path.dirname(sys.executable)
    _tcl_dir = os.path.join(_py_dir, "tcl")
    if os.path.exists(_tcl_dir):
        # tcl8.6, tk8.6 디렉토리 찾기
        for d in os.listdir(_tcl_dir):
            if d.startswith("tcl"):
                os.environ.setdefault("TCL_LIBRARY", os.path.join(_tcl_dir, d))
            elif d.startswith("tk"):
                os.environ.setdefault("TK_LIBRARY", os.path.join(_tcl_dir, d))
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
        ico_path = os.path.join(WORKER_DIR, "icon.ico")
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

        # Build UI
        self._build_header()
        self._build_status_cards()
        self._build_stats_section()
        self._build_log_section()
        self._build_control_bar()

        # Initial refresh
        self._schedule_refresh()

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
        self.lbl_status = tk.Label(badge, text="Stopped",
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
            ("Station", "-", COL_GREEN),
            ("Version", "-", COL_BLUE),
            ("URL", "-", COL_PURPLE),
            ("Last Seen", "-", COL_GRAY),
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
        tk.Label(f1, text="Processed", font=("Segoe UI", 8),
                 bg=COL_BG, fg=COL_TEXT_SECONDARY).pack(anchor="w")
        self.lbl_processed = tk.Label(f1, text="0",
                                      font=("Segoe UI", 11, "bold"),
                                      bg=COL_BG, fg=COL_PURPLE)
        self.lbl_processed.pack(anchor="w")

        # Errors
        f2 = tk.Frame(stats_frame, bg=COL_BG)
        f2.pack(side="left", expand=True, fill="x")
        tk.Label(f2, text="Errors", font=("Segoe UI", 8),
                 bg=COL_BG, fg=COL_TEXT_SECONDARY).pack(anchor="w")
        self.lbl_errors = tk.Label(f2, text="0",
                                   font=("Segoe UI", 11, "bold"),
                                   bg=COL_BG, fg=COL_GRAY)
        self.lbl_errors.pack(anchor="w")

        # Current Task
        f3 = tk.Frame(stats_frame, bg=COL_BG)
        f3.pack(side="left", expand=True, fill="x")
        tk.Label(f3, text="Current Task", font=("Segoe UI", 8),
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
        tk.Label(log_header, text="Logs", font=("Segoe UI", 9, "bold"),
                 bg=COL_BG, fg=COL_TEXT).pack(side="left")

        # Refresh button
        refresh_btn = tk.Label(log_header, text="\u21BB",
                               font=("Segoe UI", 12), bg=COL_BG,
                               fg=COL_TEXT_SECONDARY, cursor="hand2")
        refresh_btn.pack(side="right")
        refresh_btn.bind("<Button-1>", lambda e: self._trigger_refresh())

        # Open log file button
        open_btn = tk.Label(log_header, text="Open File",
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

    def _build_control_bar(self):
        bar = tk.Frame(self.root, bg=COL_BG, padx=16, pady=10)
        bar.pack(fill="x")

        btn_frame = tk.Frame(bar, bg=COL_BG)
        btn_frame.pack(side="left")

        self.btn_start = tk.Button(
            btn_frame, text="\u25B6  Start",
            font=("Segoe UI", 9, "bold"),
            bg=COL_GREEN, fg="white", relief="flat",
            activebackground="#2DB84D", activeforeground="white",
            padx=14, pady=4, cursor="hand2",
            command=self._start_worker,
        )
        self.btn_start.pack(side="left", padx=(0, 6))

        self.btn_stop = tk.Button(
            btn_frame, text="\u25A0  Stop",
            font=("Segoe UI", 9, "bold"),
            bg=COL_ORANGE, fg="white", relief="flat",
            activebackground="#E08600", activeforeground="white",
            padx=14, pady=4, cursor="hand2",
            command=self._stop_worker,
        )
        self.btn_stop.pack(side="left", padx=(0, 6))

        self.btn_restart = tk.Button(
            btn_frame, text="\u21BB Restart",
            font=("Segoe UI", 9),
            bg=COL_BLUE, fg="white", relief="flat",
            activebackground="#005BBB", activeforeground="white",
            padx=14, pady=4, cursor="hand2",
            command=self._restart_worker,
        )
        self.btn_restart.pack(side="left")

        # Uninstall on the right
        self.btn_uninstall = tk.Button(
            bar, text="Uninstall",
            font=("Segoe UI", 9), fg=COL_RED,
            bg=COL_BG, relief="flat",
            activeforeground=COL_RED,
            cursor="hand2",
            command=self._uninstall,
        )
        self.btn_uninstall.pack(side="right")

    # ------------------------------------------------------------------
    # Drawing Helpers
    # ------------------------------------------------------------------

    def _draw_dot(self, canvas, color):
        canvas.delete("all")
        canvas.create_oval(1, 1, 9, 9, fill=color, outline=color)

    # ------------------------------------------------------------------
    # Actions
    # ------------------------------------------------------------------

    def _start_worker(self):
        def _do():
            if not os.path.isfile(PYTHON_EXE) or not os.path.isfile(WORKER_SCRIPT):
                self.root.after(0, lambda: messagebox.showerror(
                    "Error",
                    f"Worker files not found.\n{PYTHON_EXE}\n{WORKER_SCRIPT}"
                ))
                return
            try:
                CREATE_NO_WINDOW = 0x08000000
                subprocess.Popen(
                    [PYTHON_EXE, WORKER_SCRIPT],
                    cwd=WORKER_DIR,
                    creationflags=CREATE_NO_WINDOW,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            except Exception as e:
                self.root.after(0, lambda: messagebox.showerror(
                    "Error", f"Failed to start worker:\n{e}"
                ))
            time.sleep(1.5)
            self._refresh_data()

        threading.Thread(target=_do, daemon=True).start()

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
            # Start
            if os.path.isfile(PYTHON_EXE) and os.path.isfile(WORKER_SCRIPT):
                try:
                    subprocess.Popen(
                        [PYTHON_EXE, WORKER_SCRIPT],
                        cwd=WORKER_DIR,
                        creationflags=0x08000000,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                    )
                except Exception:
                    pass
            time.sleep(1.5)
            self._refresh_data()

        threading.Thread(target=_do, daemon=True).start()

    def _uninstall(self):
        if not messagebox.askyesno(
            "Uninstall CrawlStation Worker",
            "The worker service, settings, and all data will be deleted.\n"
            "Are you sure you want to uninstall?",
            icon="warning",
        ):
            return

        def _do():
            # 1. Stop worker
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

            # 4. Remove Start Menu shortcut
            try:
                start_menu = os.path.join(
                    os.environ.get("APPDATA", ""),
                    "Microsoft", "Windows", "Start Menu", "Programs",
                )
                shortcut = os.path.join(start_menu, "CrawlStation Worker.lnk")
                if os.path.isfile(shortcut):
                    os.remove(shortcut)
            except Exception:
                pass

            # 5. Delete worker directory
            try:
                shutil.rmtree(WORKER_DIR, ignore_errors=True)
            except Exception:
                pass

            # 6. Close app
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
            self.lbl_status.configure(text="Running", fg=COL_GREEN)
        else:
            self._draw_dot(self.status_dot, COL_GRAY)
            self.lbl_status.configure(text="Stopped", fg=COL_GRAY)

        # Status cards
        if station_connected:
            self.card_labels["Station"].configure(text="Connected", fg=COL_GREEN)
        else:
            self.card_labels["Station"].configure(text="Offline", fg=COL_ORANGE)

        self.card_labels["Version"].configure(text=f"v{version}")

        # Truncate URL for display
        display_url = station_url
        if len(display_url) > 18:
            display_url = display_url[:18] + "..."
        self.card_labels["URL"].configure(text=display_url)

        # Truncate last seen
        display_last = last_seen
        if len(display_last) > 18:
            display_last = display_last[:18] + "..."
        self.card_labels["Last Seen"].configure(text=display_last)

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
