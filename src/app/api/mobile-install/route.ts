import { NextResponse } from "next/server";

const INSTALL_SH = `#!/data/data/com.termux/files/usr/bin/bash
# lnb-mobile-worker 원커맨드 설치 스크립트
# 사용법: curl -sL https://crawl-station.vercel.app/api/mobile-install | bash

set -e

REPO_URL="https://github.com/gnookim/lnb-mobile-worker"
INSTALL_DIR="$HOME/lnb-mobile-worker"
BOOT_DIR="$HOME/.termux/boot"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  lnb-mobile-worker 설치"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 1. Termux 패키지 ─────────────────────────
echo "① Termux 패키지 설치 중..."
pkg update -y -q
pkg install -y -q python git openssh termux-api

# ── 2. Termux:API 앱 안내 ────────────────────
echo ""
echo "  ⚠️  Termux:API 앱 설치 필요 (배터리/온도 수집용)"
echo "     F-Droid: https://f-droid.org/packages/com.termux.api"
echo "     설치 후 계속하려면 Enter..."
read -r _

# ── 3. 저장소 클론 ───────────────────────────
echo "② 코드 다운로드 중..."
if [ -d "$INSTALL_DIR" ]; then
    echo "  기존 설치 발견 — 업데이트"
    cd "$INSTALL_DIR" && git pull -q
else
    git clone -q "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# ── 4. Python 패키지 ─────────────────────────
echo "③ Python 패키지 설치 중..."
pip install -q -r requirements.txt

# ── 5. .env 생성 ─────────────────────────────
echo "④ 설정 파일 생성 중..."
if [ ! -f "$INSTALL_DIR/.env" ]; then
    cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    printf "  Supabase URL 입력: "; read -r SB_URL
    printf "  Supabase Service Key 입력: "; read -r SB_KEY
    echo ""
    echo "  통신사 선택:"
    echo "  1) SKT   2) KT   3) LGU+"
    printf "  번호 입력: "; read -r CARRIER_NUM
    case "$CARRIER_NUM" in
        1) CARRIER="SKT" ;;
        2) CARRIER="KT" ;;
        3) CARRIER="LGU+" ;;
        *) CARRIER="SKT" ;;
    esac

    sed -i "s|SUPABASE_URL=.*|SUPABASE_URL=$SB_URL|" "$INSTALL_DIR/.env"
    sed -i "s|SUPABASE_SERVICE_KEY=.*|SUPABASE_SERVICE_KEY=$SB_KEY|" "$INSTALL_DIR/.env"
    sed -i "s|CARRIER=.*|CARRIER=$CARRIER|" "$INSTALL_DIR/.env"

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
    echo "  기존 .env 유지"
fi

# ── 6. DEVICE_ID 발급 ────────────────────────
DEVICE_ID=$(python3 -c "
import uuid
env = open('$INSTALL_DIR/.env').read()
if 'DEVICE_ID=' in env and env.split('DEVICE_ID=')[1].split('\\n')[0].strip():
    print(env.split('DEVICE_ID=')[1].split('\\n')[0].strip())
else:
    did = 'mobile-' + uuid.uuid4().hex[:8]
    print(did)
" 2>/dev/null)
if ! grep -q "^DEVICE_ID=" "$INSTALL_DIR/.env"; then
    echo "DEVICE_ID=$DEVICE_ID" >> "$INSTALL_DIR/.env"
fi
echo "  DEVICE_ID: $DEVICE_ID"

# ── 7. orch-std 설정 ─────────────────────────
echo "⑤ 오케스트레이터 연동 설정 중..."
cd "$INSTALL_DIR"

mkdir -p .git/hooks
cat > .git/hooks/post-commit << 'HOOK'
#!/bin/sh
APP_NAME=$(cat .orch-app-name 2>/dev/null)
[ -z "$APP_NAME" ] && exit 0
COMMIT_HASH=$(git rev-parse HEAD)
COMMIT_MSG=$(git log -1 --format="%s")
AUTHOR=$(git log -1 --format="%an")
if [ -f .env ]; then
  export $(grep -E '^(SUPABASE_URL|SUPABASE_SERVICE_KEY)=' .env | xargs) 2>/dev/null
fi
[ -z "$SUPABASE_URL" ] && exit 0
curl -s -o /dev/null -X POST "$SUPABASE_URL/rest/v1/orch_dev_log" \\
  -H "apikey: $SUPABASE_SERVICE_KEY" \\
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{\\"app\\":\\"$APP_NAME\\",\\"title\\":$(echo "$COMMIT_MSG" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read().strip()))'),\\"type\\":\\"commit\\",\\"status\\":\\"done\\",\\"source\\":\\"app\\",\\"commit_hash\\":\\"$COMMIT_HASH\\",\\"author\\":\\"$AUTHOR\\"}"
HOOK
chmod +x .git/hooks/post-commit

python3 - << PYEOF
import os, json, urllib.request
env = dict(line.strip().split('=',1) for line in open('$INSTALL_DIR/.env') if '=' in line and not line.startswith('#'))
url = env.get('SUPABASE_URL','')
key = env.get('SUPABASE_SERVICE_KEY','')
if not url or not key:
    exit(0)
headers = {'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates'}
data = json.dumps({'name': 'lnb-mobile-worker', 'deploy_url': '', 'description': 'Android LTE 모바일 크롤 워커'}).encode()
req = urllib.request.Request(f'{url}/rest/v1/orch_services', data=data, headers=headers, method='POST')
try:
    urllib.request.urlopen(req, timeout=5)
    print('  orch_services 등록 완료')
except Exception as e:
    print(f'  orch_services 등록 실패 (무시): {e}')
PYEOF

# ── 8. 부팅 자동시작 ─────────────────────────
echo "⑥ 부팅 자동시작 설정 중..."
mkdir -p "$BOOT_DIR"
cat > "$BOOT_DIR/start-worker.sh" << BOOT
#!/data/data/com.termux/files/usr/bin/bash
cd $INSTALL_DIR
termux-wake-lock
bash scripts/start_chrome_cdp.sh &
sleep 3
python3 src/main.py >> logs/worker.log 2>&1
BOOT
chmod +x "$BOOT_DIR/start-worker.sh"
mkdir -p "$INSTALL_DIR/logs"

# ── 9. Chrome CDP 스크립트 ───────────────────
cat > "$INSTALL_DIR/scripts/start_chrome_cdp.sh" << 'CDP'
#!/data/data/com.termux/files/usr/bin/bash
am start -n com.android.chrome/com.google.android.apps.chrome.Main \\
  --es "com.google.android.apps.chrome.EXTRA_URL" "about:blank"
sleep 2
adb shell "am start -a android.intent.action.VIEW \\
  -n com.android.chrome/com.google.android.apps.chrome.Main \\
  --ei REMOTE_DEBUGGING_PORT 9222" 2>/dev/null || true
echo "Chrome CDP 시작 완료 (port 9222)"
CDP
chmod +x "$INSTALL_DIR/scripts/start_chrome_cdp.sh"

# ── 완료 ─────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ 설치 완료!"
echo ""
echo "  DEVICE_ID : $DEVICE_ID"
echo "  워커 시작 : bash $INSTALL_DIR/scripts/start_worker.sh"
echo "  자동시작  : Termux:Boot 앱 설치 필요"
echo "             F-Droid: https://f-droid.org/packages/com.termux.boot"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
printf "  지금 바로 시작할까요? (y/N): "; read -r START
if [ "$START" = "y" ] || [ "$START" = "Y" ]; then
    bash "$INSTALL_DIR/scripts/start_worker.sh"
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
