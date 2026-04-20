import { NextResponse } from "next/server";

const INSTALL_SH = `#!/data/data/com.termux/files/usr/bin/bash
# lnb-mobile-worker 원커맨드 설치 스크립트 (AI 자가진단 포함)
# 사용법: curl -sL https://crawl-station.vercel.app/api/mobile-install | bash

STATION_URL="https://crawl-station.vercel.app"
REPO_URL="https://github.com/gnookim/lnb-mobile-worker"
INSTALL_DIR="\$HOME/lnb-mobile-worker"
BOOT_DIR="\$HOME/.termux/boot"
TOTAL_STEPS=9

# ── 세션 ID 생성 ─────────────────────────────────────────────
SESSION_ID="mobile-\$(python3 -c 'import uuid; print(uuid.uuid4().hex[:12])' 2>/dev/null || echo "\$(date +%s)-\$RANDOM")"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  lnb-mobile-worker 설치 (AI 자가진단)"
echo "  세션: \$SESSION_ID"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Python 헬퍼 스크립트 작성 ─────────────────────────────────
mkdir -p /tmp/lnb_install

# 상태 리포터
cat > /tmp/lnb_install/report.py << 'PYEOF'
import sys, json, urllib.request

def report(station_url, session_id, action, step=0, name="", log="", extra=None):
    data = {
        "session_id": session_id,
        "action": action,
        "step_number": int(step),
        "step_name": name,
        "log_tail": str(log)[:2000],
    }
    if extra:
        data.update(extra)
    try:
        req = urllib.request.Request(
            f"{station_url}/api/install-status",
            data=json.dumps(data).encode(),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass

if __name__ == "__main__":
    args = sys.argv[1:]
    extra = json.loads(args[6]) if len(args) > 6 else None
    report(args[0], args[1], args[2],
           args[3] if len(args) > 3 else 0,
           args[4] if len(args) > 4 else "",
           args[5] if len(args) > 5 else "",
           extra)
PYEOF

# AI 진단 요청
cat > /tmp/lnb_install/diagnose.py << 'PYEOF'
import sys, json, urllib.request

station_url = sys.argv[1]
session_id  = sys.argv[2]
step_name   = sys.argv[3]
error_out   = sys.argv[4][:3000] if len(sys.argv) > 4 else ""
retry_num   = int(sys.argv[5]) if len(sys.argv) > 5 else 1

data = {
    "session_id":   session_id,
    "step_name":    step_name,
    "error_output": error_out,
    "retry_count":  retry_num,
}
try:
    req = urllib.request.Request(
        f"{station_url}/api/mobile-diagnose",
        data=json.dumps(data).encode(),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    resp = urllib.request.urlopen(req, timeout=20)
    print(resp.read().decode())
except Exception as e:
    print(json.dumps({"diagnosis": "", "fix_command": "", "should_retry": False}))
PYEOF

# ── 헬퍼 함수 ─────────────────────────────────────────────────
report_start() {
    local android_ver model
    android_ver="\$(getprop ro.build.version.release 2>/dev/null || echo 'unknown')"
    model="\$(getprop ro.product.model 2>/dev/null || echo 'Android')"
    python3 /tmp/lnb_install/report.py "\$STATION_URL" "\$SESSION_ID" "start" 0 "시작" "" \
        "{\\"hostname\\":\\"\$model\\",\\"os_version\\":\\"Android \$android_ver\\",\\"os_machine\\":\\"arm64\\",\\"installer_version\\":\\"mobile-installer\\",\\"device_type\\":\\"android_mobile\\",\\"total_steps\\":\$TOTAL_STEPS}"
}

report_step() {
    python3 /tmp/lnb_install/report.py "\$STATION_URL" "\$SESSION_ID" "step" "\$1" "\$2" "\$3" 2>/dev/null || true
}

report_ok() {
    python3 /tmp/lnb_install/report.py "\$STATION_URL" "\$SESSION_ID" "step_done" "\$1" "\$2" "\$3" \
        '{"success":true}' 2>/dev/null || true
}

report_fail() {
    python3 /tmp/lnb_install/report.py "\$STATION_URL" "\$SESSION_ID" "step_done" "\$1" "\$2" "\$3" \
        '{"success":false}' 2>/dev/null || true
}

report_diagnosing() {
    local diag_count=\${4:-1}
    python3 /tmp/lnb_install/report.py "\$STATION_URL" "\$SESSION_ID" "diagnosing" "\$1" "\$2" "\$3" \
        "{\\"diagnosis_count\\":\$diag_count}" 2>/dev/null || true
}

report_done() {
    python3 /tmp/lnb_install/report.py "\$STATION_URL" "\$SESSION_ID" "complete" "\$1" "\$2" "\$3" \
        "{\\"success\\":\$4}" 2>/dev/null || true
}

# AI 진단 + 수정 + 재시도 여부 반환 (0=재시도 OK, 1=포기)
diagnose_and_fix() {
    local step_num=\$1 step_name=\$2 err_out=\$3 retry=\$4

    echo "  🤖 AI 진단 중..."
    report_diagnosing "\$step_num" "\$step_name" "\$err_out" "\$retry"

    local resp
    resp="\$(python3 /tmp/lnb_install/diagnose.py "\$STATION_URL" "\$SESSION_ID" "\$step_name" "\$err_out" "\$retry" 2>/dev/null)"

    local diagnosis fix_cmd should_retry
    diagnosis="\$(echo "\$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('diagnosis',''))" 2>/dev/null || true)"
    fix_cmd="\$(echo "\$resp"   | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('fix_command',''))" 2>/dev/null || true)"
    should_retry="\$(echo "\$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if d.get('should_retry',True) else 'no')" 2>/dev/null || echo 'yes')"

    [ -n "\$diagnosis" ] && echo "  💬 \$diagnosis"

    if [ -n "\$fix_cmd" ]; then
        echo "  🔧 수정: \$fix_cmd"
        eval "\$fix_cmd" 2>&1 || true
    fi

    [ "\$should_retry" = "yes" ] && return 0 || return 1
}

# 재시도 가능한 단계 실행 (최대 3회)
run_step() {
    local step_num=\$1 step_name=\$2
    shift 2
    local cmd="\$*"

    echo "[\$step_num/\$TOTAL_STEPS] \$step_name..."
    report_step "\$step_num" "\$step_name" ""

    local retry=0
    while true; do
        local tmpf
        tmpf="\$(mktemp /tmp/lnb_step.XXXX)"
        eval "\$cmd" > "\$tmpf" 2>&1
        local exit_code=\$?
        local step_log="\$(cat "\$tmpf")"
        rm -f "\$tmpf"

        if [ \$exit_code -eq 0 ]; then
            echo "  ✅ 완료"
            report_ok "\$step_num" "\$step_name" "\$step_log"
            return 0
        fi

        echo "  ⚠️  오류:"
        echo "\$step_log" | tail -5 | sed 's/^/    /'
        retry=\$((retry + 1))

        if [ \$retry -gt 3 ]; then
            echo "  ❌ \$step_name 실패 (3회 시도 후 포기)"
            report_fail "\$step_num" "\$step_name" "\$step_log"
            return 1
        fi

        echo ""
        if ! diagnose_and_fix "\$step_num" "\$step_name" "\$step_log" "\$retry"; then
            report_fail "\$step_num" "\$step_name" "\$step_log"
            return 1
        fi
        echo "  🔄 재시도 (\$retry/3)..."
    done
}

# ── 설치 시작 리포팅 ─────────────────────────────────────────
report_start

# ══════════════════════════════════════════════════════════════
# STEP 1: Python 버전 확인
# ══════════════════════════════════════════════════════════════
run_step 1 "Python 버전 확인" python3 -c "
import sys
v = sys.version_info
assert v.major == 3 and v.minor >= 10, f'Python 3.10+ 필요 (현재 {v.major}.{v.minor})'
print(f'Python {v.major}.{v.minor}.{v.micro}')
" || {
    echo ""
    echo "  Python 버전이 낮습니다. 다음 명령어로 업그레이드하세요:"
    echo "    pkg install python"
    report_done 1 "Python 버전 확인" "" "false"
    exit 1
}

# ══════════════════════════════════════════════════════════════
# STEP 2: Termux 패키지 설치
# ══════════════════════════════════════════════════════════════
run_step 2 "Termux 패키지 설치" bash -c "pkg update -y -q && pkg install -y -q python git openssh termux-api" || {
    report_done 2 "Termux 패키지 설치" "" "false"
    exit 1
}

# ══════════════════════════════════════════════════════════════
# STEP 3: Termux:API 앱 확인 (interactive — AI 진단 없음)
# ══════════════════════════════════════════════════════════════
echo "[3/\$TOTAL_STEPS] Termux:API 앱 확인..."
report_step 3 "Termux:API 확인" ""

if termux-battery-status 2>/dev/null | grep -q "percentage"; then
    echo "  ✅ Termux:API 정상"
    report_ok 3 "Termux:API 확인" "Termux:API 정상"
else
    echo "  ⚠️  Termux:API 앱이 필요합니다."
    echo "     F-Droid: https://f-droid.org/packages/com.termux.api"
    printf "  설치 후 Enter, 건너뛰려면 's': "; read -r ANS
    if [ "\$ANS" = "s" ] || [ "\$ANS" = "S" ]; then
        report_ok 3 "Termux:API 확인" "건너뜀"
    else
        report_ok 3 "Termux:API 확인" "사용자 확인"
    fi
fi

# ══════════════════════════════════════════════════════════════
# STEP 4: 코드 다운로드
# ══════════════════════════════════════════════════════════════
run_step 4 "코드 다운로드" bash -c "
if [ -d '\$INSTALL_DIR/.git' ]; then
    cd '\$INSTALL_DIR' && git pull -q
else
    git clone -q '\$REPO_URL' '\$INSTALL_DIR'
fi
" || {
    report_done 4 "코드 다운로드" "" "false"
    exit 1
}

# ══════════════════════════════════════════════════════════════
# STEP 5: Python 패키지 설치
# ══════════════════════════════════════════════════════════════
run_step 5 "Python 패키지 설치" bash -c "
cd '\$INSTALL_DIR'
pip install -q -r requirements.txt
" || {
    report_done 5 "Python 패키지 설치" "" "false"
    exit 1
}

# ══════════════════════════════════════════════════════════════
# STEP 6: 환경 설정 (interactive — AI 진단 없음)
# ══════════════════════════════════════════════════════════════
echo "[6/\$TOTAL_STEPS] 환경 설정..."
report_step 6 "환경 설정" ""

if [ ! -f "\$INSTALL_DIR/.env" ]; then
    cp "\$INSTALL_DIR/.env.example" "\$INSTALL_DIR/.env"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    printf "  Supabase URL 입력: "; read -r SB_URL
    printf "  Supabase Service Key 입력: "; read -r SB_KEY
    echo ""
    echo "  통신사 선택: 1) SKT  2) KT  3) LGU+"
    printf "  번호: "; read -r CARRIER_NUM
    case "\$CARRIER_NUM" in
        1) CARRIER="SKT" ;; 2) CARRIER="KT" ;; 3) CARRIER="LGU+" ;; *) CARRIER="SKT" ;;
    esac
    sed -i "s|SUPABASE_URL=.*|SUPABASE_URL=\$SB_URL|" "\$INSTALL_DIR/.env"
    sed -i "s|SUPABASE_SERVICE_KEY=.*|SUPABASE_SERVICE_KEY=\$SB_KEY|" "\$INSTALL_DIR/.env"
    sed -i "s|CARRIER=.*|CARRIER=\$CARRIER|" "\$INSTALL_DIR/.env"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    report_ok 6 "환경 설정" "새 .env 생성"
else
    echo "  ✅ 기존 .env 유지"
    report_ok 6 "환경 설정" "기존 .env 유지"
fi

# ══════════════════════════════════════════════════════════════
# STEP 7: Supabase 연결 테스트
# ══════════════════════════════════════════════════════════════
run_step 7 "Supabase 연결 테스트" python3 -c "
import sys, json, urllib.request
env = dict(l.strip().split('=',1) for l in open('\$INSTALL_DIR/.env') if '=' in l and not l.startswith('#'))
url = env.get('SUPABASE_URL','')
key = env.get('SUPABASE_SERVICE_KEY','')
if not url or 'xxxx' in url:
    print('SKIP: URL 미설정')
    sys.exit(0)
req = urllib.request.Request(url+'/rest/v1/', headers={'apikey': key,'Authorization':'Bearer '+key})
urllib.request.urlopen(req, timeout=8)
print('연결 성공')
" || {
    echo "  ⚠️  Supabase 연결 실패 — URL/Key를 확인하세요: \$INSTALL_DIR/.env"
    printf "  계속 진행하려면 Enter: "; read -r _
    report_fail 7 "Supabase 연결 테스트" "연결 실패"
}

# ══════════════════════════════════════════════════════════════
# STEP 8: DEVICE_ID 발급
# ══════════════════════════════════════════════════════════════
run_step 8 "DEVICE_ID 발급" python3 -c "
import uuid
env_path = '\$INSTALL_DIR/.env'
content = open(env_path).read()
if 'DEVICE_ID=' in content:
    did = content.split('DEVICE_ID=')[1].split('\n')[0].strip()
    if did:
        print('기존 DEVICE_ID:', did)
        exit()
did = 'mobile-' + uuid.uuid4().hex[:8]
with open(env_path, 'a') as f:
    f.write(f'\nDEVICE_ID={did}\n')
print('새 DEVICE_ID:', did)
" || {
    report_done 8 "DEVICE_ID 발급" "" "false"
    exit 1
}

# DEVICE_ID 읽기
DEVICE_ID="\$(grep '^DEVICE_ID=' "\$INSTALL_DIR/.env" | cut -d'=' -f2)"

# ══════════════════════════════════════════════════════════════
# STEP 9: 자동시작 설정 (optional)
# ══════════════════════════════════════════════════════════════
echo "[9/\$TOTAL_STEPS] Termux:Boot 자동시작 설정..."
report_step 9 "자동시작 설정" ""

echo "  ⚠️  Termux:Boot 앱이 필요합니다."
echo "     F-Droid: https://f-droid.org/packages/com.termux.boot"
printf "  설치했으면 Enter, 건너뛰려면 's': "; read -r BOOT_ANS

if [ "\$BOOT_ANS" = "s" ] || [ "\$BOOT_ANS" = "S" ]; then
    echo "  건너뜀"
    report_ok 9 "자동시작 설정" "건너뜀"
else
    mkdir -p "\$BOOT_DIR"
    cat > "\$BOOT_DIR/start-worker.sh" << BOOTSCRIPT
#!/data/data/com.termux/files/usr/bin/bash
cd \$INSTALL_DIR
termux-wake-lock
sleep 5
python3 src/main.py >> logs/worker.log 2>&1
BOOTSCRIPT
    chmod +x "\$BOOT_DIR/start-worker.sh"
    echo "  ✅ 자동시작 등록"
    report_ok 9 "자동시작 설정" "완료"
fi

mkdir -p "\$INSTALL_DIR/logs"

# ══════════════════════════════════════════════════════════════
# Chrome CDP 스크립트
# ══════════════════════════════════════════════════════════════
mkdir -p "\$INSTALL_DIR/scripts"
cat > "\$INSTALL_DIR/scripts/start_chrome_cdp.sh" << 'CDP'
#!/data/data/com.termux/files/usr/bin/bash
am start -n com.android.chrome/com.google.android.apps.chrome.Main \\
  --es "com.google.android.apps.chrome.EXTRA_URL" "about:blank" 2>/dev/null
sleep 3
adb shell "am start -a android.intent.action.VIEW \\
  -n com.android.chrome/com.google.android.apps.chrome.Main \\
  --ei REMOTE_DEBUGGING_PORT 9222" 2>/dev/null || true
sleep 2
for i in \$(seq 1 5); do
    if curl -sf http://localhost:9222/json >/dev/null 2>&1; then
        echo "Chrome CDP 시작 완료 (port 9222) ✅"
        exit 0
    fi
    sleep 2
done
echo "⚠️  Chrome CDP 포트 응답 없음 — ADB 연결 확인 필요"
CDP
chmod +x "\$INSTALL_DIR/scripts/start_chrome_cdp.sh"

# ── 설치 완료 ─────────────────────────────────────────────────
report_done "\$TOTAL_STEPS" "설치 완료" "" "true"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ 설치 완료!"
echo ""
echo "  DEVICE_ID : \$DEVICE_ID"
echo "  워커 시작 :"
echo "    bash \$INSTALL_DIR/scripts/start_chrome_cdp.sh"
echo "    python3 \$INSTALL_DIR/src/main.py"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
printf "  지금 바로 시작할까요? (y/N): "; read -r START
if [ "\$START" = "y" ] || [ "\$START" = "Y" ]; then
    bash "\$INSTALL_DIR/scripts/start_chrome_cdp.sh" &
    sleep 3
    python3 "\$INSTALL_DIR/src/main.py"
fi
`;

export async function GET() {
  return new NextResponse(INSTALL_SH, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": "inline; filename=install.sh",
      "Cache-Control": "no-cache",
    },
  });
}
