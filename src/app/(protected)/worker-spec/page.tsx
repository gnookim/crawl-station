"use client";

export default function WorkerSpecPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-12 text-sm">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">크롤러 워커 기능 명세</h1>
        <p className="text-gray-400">
          기획자·개발자용 내부 레퍼런스 — worker.py v0.9.44 기준 / 2026-04-17
        </p>
      </div>

      {/* ── 개요 ── */}
      <Section title="개요">
        <p className="text-gray-300 leading-relaxed">
          CrawlStation 워커(worker.py)는 Supabase의{" "}
          <code>crawl_requests</code> 테이블을 폴링하여 작업을 가져오고, 핸들러를
          실행한 뒤 결과를{" "}
          <code>crawl_results</code>에 저장하는 Python 비동기 에이전트입니다.
          Mac·Windows 양쪽에서 동작하며, GUI(시스템 트레이) 없이 터미널에서 직접
          실행할 수도 있습니다.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ["언어", "Python 3.10+"],
            ["런타임", "asyncio (단일 이벤트루프)"],
            ["인증", "Supabase anon key + SSO"],
            ["설치 위치", "~/CrawlWorker/ (Mac)\n%APPDATA%\\CrawlStation (Win)"],
          ].map(([k, v]) => (
            <div key={k} className="bg-gray-800 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">{k}</div>
              <div className="text-gray-200 whitespace-pre-line">{v}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 크롤 타입 ── */}
      <Section title="크롤 타입 및 우선순위">
        <p className="text-gray-400 mb-4">
          <code>crawl_requests.type</code> 컬럼 값 기준. 우선순위가 높을수록 먼저
          처리됩니다(최대 10).
        </p>
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-700">
              <th className="py-2 pr-4">타입 (DB 값)</th>
              <th className="py-2 pr-4">표시명</th>
              <th className="py-2 pr-4">카테고리</th>
              <th className="py-2 pr-4 text-center">우선순위</th>
              <th className="py-2">설명</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {CRAWL_TYPES.map((t) => (
              <tr key={t.type} className="hover:bg-gray-800/40">
                <td className="py-2 pr-4 font-mono text-xs text-blue-400">{t.type}</td>
                <td className="py-2 pr-4 text-gray-200">{t.label}</td>
                <td className="py-2 pr-4">
                  <CategoryBadge cat={t.category} />
                </td>
                <td className="py-2 pr-4 text-center">
                  <PriorityBadge p={t.priority} />
                </td>
                <td className="py-2 text-gray-400 text-xs leading-relaxed">{t.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* ── 작업 흐름 ── */}
      <Section title="작업 처리 흐름">
        <ol className="space-y-3">
          {[
            [
              "폴링 (5초 간격)",
              "① assigned 상태이고 자신의 worker_id가 할당된 작업 우선 조회 → ② 없으면 assigned_worker=null && status=pending 작업 자동 할당",
            ],
            [
              "사전 체크",
              "blocked_until 쿨다운 중이면 skip / 카테고리 일일 한도 초과 시 skip / 카테고리 활성화 상태 확인 (naver_enabled / instagram_enabled / oclick_enabled)",
            ],
            [
              "상태 전환",
              "crawl_requests.status: pending → assigned → running → completed | failed",
            ],
            [
              "핸들러 실행",
              "HANDLERS[type] 클래스 인스턴스화 → handler.handle(keyword, options) 비동기 실행 → results 배열 반환",
            ],
            [
              "결과 저장",
              "crawl_results 테이블에 INSERT (request_id, type, keyword, rank, data). data 컬럼은 JSONB.",
            ],
            [
              "차단 감지",
              "결과 내 'captcha', '보안문자', '차단', 'blocked', 'login' 키워드 탐지 → _report_block() 호출",
            ],
            [
              "사용량 증가",
              "worker_config.daily_used / daily_used_naver / daily_used_instagram 직접 UPDATE (RPC 불사용)",
            ],
            [
              "배치 완료",
              "batch_size(기본 30)개 처리 후 batch_rest_seconds(기본 180초) 휴식 → config 리로드 → IP 로테이션(설정 시)",
            ],
          ].map(([title, desc], i) => (
            <li key={i} className="flex gap-3">
              <span className="flex-none w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold mt-0.5">
                {i + 1}
              </span>
              <div>
                <span className="text-gray-200 font-medium">{title}</span>
                <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* ── 워커 상태 머신 ── */}
      <Section title="워커 상태 머신">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          {WORKER_STATUSES.map((s) => (
            <div key={s.status} className="bg-gray-800 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-none"
                  style={{ background: s.color }}
                />
                <span className="font-mono text-xs text-gray-200">{s.status}</span>
              </div>
              <p className="text-xs text-gray-400">{s.desc}</p>
            </div>
          ))}
        </div>

        <h3 className="text-gray-300 font-semibold mb-2 text-sm">차단 상태 (block_status)</h3>
        <div className="grid grid-cols-3 gap-3">
          {BLOCK_STATUSES.map((b) => (
            <div key={b.status} className="bg-gray-800 rounded-lg p-3 border-l-4" style={{ borderColor: b.color }}>
              <div className="font-mono text-xs text-gray-200 mb-1">{b.status}</div>
              <p className="text-xs text-gray-400">{b.desc}</p>
              <p className="text-xs text-gray-500 mt-1">쿨다운: {b.cooldown}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 bg-gray-800/60 rounded-lg p-4">
          <h4 className="text-gray-300 text-xs font-semibold mb-2">차단 감지 레벨</h4>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500">
                <th className="text-left pr-4 pb-1">레벨</th>
                <th className="text-left pr-4 pb-1">분류</th>
                <th className="text-left pr-4 pb-1">block_status</th>
                <th className="text-left pr-4 pb-1">쿨다운</th>
                <th className="text-left pb-1">작업 재배분</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50 text-gray-300">
              <tr>
                <td className="py-1 pr-4">Level 1</td>
                <td className="pr-4">소프트 (빈 결과 + 이력 3회 초과)</td>
                <td className="pr-4 font-mono text-yellow-400">cooling</td>
                <td className="pr-4">30분</td>
                <td>아니오 (작업 완료 처리)</td>
              </tr>
              <tr>
                <td className="py-1 pr-4">Level 2</td>
                <td className="pr-4">하드 (캡챠 / 차단 키워드 탐지)</td>
                <td className="pr-4 font-mono text-orange-400">blocked</td>
                <td className="pr-4">60분</td>
                <td>예 (pending으로 반환)</td>
              </tr>
              <tr>
                <td className="py-1 pr-4">Level 3</td>
                <td className="pr-4">영구 차단</td>
                <td className="pr-4 font-mono text-red-400">banned</td>
                <td className="pr-4">수동 해제</td>
                <td>예</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── 헬스 체크 ── */}
      <Section title="헬스 체크 시스템">
        <p className="text-gray-400 mb-4 text-xs">
          시작 시 자동 검증 1회 + 이후 8시간마다 백그라운드 반복 실행.
          결과는 <code>workers.test_results</code>(JSONB)에 저장되며 Station UI에서 확인 가능.
        </p>
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-700">
              <th className="py-2 pr-4">카테고리</th>
              <th className="py-2 pr-4">검사 방법</th>
              <th className="py-2 pr-4">대상</th>
              <th className="py-2 pr-4">통과 조건</th>
              <th className="py-2 pr-4">실패 조건</th>
              <th className="py-2 text-right">타임아웃</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800 text-xs">
            <tr className="hover:bg-gray-800/40">
              <td className="py-2 pr-4"><CategoryBadge cat="naver" /></td>
              <td className="py-2 pr-4 font-mono text-blue-400">blog_serp</td>
              <td className="py-2 pr-4 text-gray-300">키워드 &apos;블로그&apos;</td>
              <td className="py-2 pr-4 text-green-400">결과 1개 이상</td>
              <td className="py-2 pr-4 text-red-400">결과 0개 / 차단 / 타임아웃</td>
              <td className="py-2 text-right text-gray-400">30s</td>
            </tr>
            <tr className="hover:bg-gray-800/40">
              <td className="py-2 pr-4"><CategoryBadge cat="instagram" /></td>
              <td className="py-2 pr-4 font-mono text-blue-400">instagram_profile</td>
              <td className="py-2 pr-4 text-gray-300">@instagram</td>
              <td className="py-2 pr-4 text-green-400">팔로워 수 수집 성공</td>
              <td className="py-2 pr-4 text-red-400">로그인 필요 / 차단</td>
              <td className="py-2 text-right text-gray-400">30s</td>
            </tr>
            <tr className="hover:bg-gray-800/40">
              <td className="py-2 pr-4"><CategoryBadge cat="oclick" /></td>
              <td className="py-2 pr-4 font-mono text-blue-400">oclick_sync</td>
              <td className="py-2 pr-4 text-gray-300">전체 상품 목록</td>
              <td className="py-2 pr-4 text-green-400">상품 1개 이상</td>
              <td className="py-2 pr-4 text-red-400">API 연결 실패 / 상품 0개</td>
              <td className="py-2 text-right text-gray-400">15s</td>
            </tr>
          </tbody>
        </table>
        <div className="mt-3 bg-gray-800/60 rounded p-3 text-xs text-gray-400">
          <strong className="text-gray-300">카테고리 활성화 로직:</strong>{" "}
          <code>worker_config.naver_enabled</code> / <code>instagram_enabled</code> 필드가{" "}
          <code>null</code>이면 자동 모드(헬스 체크 통과 여부로 판단),{" "}
          <code>true</code>이면 강제 ON(테스트 실패도 처리),{" "}
          <code>false</code>이면 강제 OFF.
        </div>
      </Section>

      {/* ── IP 로테이션 ── */}
      <Section title="IP 로테이션 (테더링)">
        <p className="text-gray-400 mb-4 text-xs">
          <code>worker_config.network_type</code>이 <code>tethering_*</code>이고{" "}
          <code>tethering_auto_reconnect=true</code>일 때, 배치 완료마다 자동 로테이션.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <h4 className="text-gray-300 text-xs font-semibold mb-2">macOS (en0)</h4>
            <ol className="space-y-1 text-xs text-gray-400 list-decimal list-inside">
              <li>현재 외부 IP 기록</li>
              <li><code>networksetup -setairportpower en0 off</code></li>
              <li>5초 대기</li>
              <li><code>networksetup -setairportpower en0 on</code></li>
              <li>reconnect_interval초 대기</li>
              <li>새 IP 확인 및 비교</li>
            </ol>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <h4 className="text-gray-300 text-xs font-semibold mb-2">Windows (netsh)</h4>
            <ol className="space-y-1 text-xs text-gray-400 list-decimal list-inside">
              <li>현재 외부 IP 기록</li>
              <li>Wi-Fi 프로필 이름 확인 (netsh wlan show interfaces)</li>
              <li><code>netsh wlan disconnect</code></li>
              <li>5초 대기</li>
              <li><code>netsh wlan connect name=&lt;profile&gt;</code></li>
              <li>reconnect_interval초 대기 후 새 IP 확인</li>
            </ol>
          </div>
        </div>
        <div className="mt-3 bg-gray-800/60 rounded p-3 text-xs text-gray-400">
          외부 IP는 <code>api.ipify.org</code>로 조회. 30분마다 자동 갱신되며{" "}
          <code>workers.current_ip</code>에 저장됩니다.
        </div>
      </Section>

      {/* ── 일일 할당량 ── */}
      <Section title="일일 할당량 시스템">
        <div className="grid grid-cols-3 gap-4 mb-4">
          {[
            ["daily_quota", "전체 하루 최대 작업 수 (0=무제한)"],
            ["daily_quota_naver", "네이버 카테고리 별도 한도"],
            ["daily_quota_instagram", "인스타그램 카테고리 별도 한도"],
          ].map(([field, desc]) => (
            <div key={field} className="bg-gray-800 rounded-lg p-3">
              <div className="font-mono text-xs text-blue-400 mb-1">{field}</div>
              <p className="text-xs text-gray-400">{desc}</p>
            </div>
          ))}
        </div>
        <div className="space-y-2 text-xs text-gray-400">
          <p>
            <span className="text-gray-300">리셋 조건:</span> KST 자정 기준.{" "}
            <code>quota_reset_at</code> 날짜가 오늘보다 이전이면{" "}
            <code>reset_daily_quotas</code> RPC 호출 후 카운터를 0으로 초기화.
          </p>
          <p>
            <span className="text-gray-300">분산 딜레이:</span> 남은 한도를 남은 시간으로 나눠
            적정 간격을 계산합니다. 예: 네이버 한도 200건, 현재 KST 10시(남은 시간 14h) →
            평균 252초 간격으로 자동 조절.
          </p>
          <p>
            <span className="text-gray-300">새벽 휴식:</span> KST 3~5시(rest_hours) 동안은
            작업 처리를 중단합니다. 설정으로 변경 가능.
          </p>
        </div>
      </Section>

      {/* ── 원격 명령 ── */}
      <Section title="원격 명령 (Station → 워커)">
        <p className="text-gray-400 mb-4 text-xs">
          Station UI에서 명령을 내리면 <code>workers.command</code> 컬럼에 기록되고,
          워커가 30초마다 이를 폴링합니다. 수신 즉시 <code>null</code>로 초기화하여 중복 실행을 방지합니다.
        </p>
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              cmd: "stop",
              desc: "heartbeat를 offline으로 전송 후 프로세스 종료",
              icon: "🛑",
            },
            {
              cmd: "restart",
              desc: "새 Python 프로세스를 백그라운드로 기동 후 자기 종료. __pycache__ 삭제 후 재시작.",
              icon: "🔄",
            },
            {
              cmd: "update",
              desc: "worker_releases 테이블에서 is_latest=true 릴리즈 확인 → 파일 다운로드 → 핸들러 핫 리로드. 재시작 없이 즉시 반영.",
              icon: "📦",
            },
          ].map((c) => (
            <div key={c.cmd} className="bg-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span>{c.icon}</span>
                <code className="text-yellow-400 text-xs">{c.cmd}</code>
              </div>
              <p className="text-xs text-gray-400">{c.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 핫 리로드 ── */}
      <Section title="핫 리로드 & 자동 업데이트">
        <p className="text-gray-400 mb-3 text-xs">
          update 명령 수신 시 재시작 없이 실행 중인 핸들러 모듈을 교체합니다.
        </p>
        <ol className="space-y-2 text-xs text-gray-400 list-decimal list-inside">
          <li>
            <code>__pycache__</code> 디렉토리 삭제 (오래된 .pyc가 새 코드를 가리는 문제 방지)
          </li>
          <li>
            핸들러 파일 먼저 기록 → <code>__init__.py</code>와 <code>worker.py</code>는 마지막에 기록
            (import 순서 오류 방지)
          </li>
          <li>
            <code>importlib.reload()</code>로 기존 모듈 리로드 + 새로 추가된 핸들러 파일 동적 import
          </li>
          <li>
            전역 <code>HANDLERS</code> 딕셔너리 갱신 → 이후 들어오는 작업에 즉시 적용
          </li>
          <li>
            <code>workers.version</code> 컬럼 업데이트 → Station UI에 반영
          </li>
        </ol>
      </Section>

      {/* ── 워커 등록 ── */}
      <Section title="워커 등록 & 자동 검증">
        <div className="space-y-3 text-xs text-gray-400">
          <div className="bg-gray-800 rounded-lg p-4">
            <h4 className="text-gray-300 font-semibold mb-2">최초 등록</h4>
            <p>
              <code>WORKER_ID</code>가 <code>.env</code>에 없으면 <code>worker-{"{uuid8}"}</code>{" "}
              형식으로 자동 생성 후 저장. 이후 <code>workers</code> 테이블에 UPSERT.
            </p>
            <p className="mt-1">
              기존 워커(verified_at 있음)는 name을 덮어쓰지 않고 OS/hostname/version만 갱신합니다.
            </p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <h4 className="text-gray-300 font-semibold mb-2">자동 검증 (신규 등록 시)</h4>
            <p>등록 8초 후 백그라운드에서 자동 검증 실행:</p>
            <ol className="list-decimal list-inside mt-1 space-y-1">
              <li>네이버 테스트: <code>POST /api/test/worker</code> (category=naver)</li>
              <li>오클릭 테스트: <code>POST /api/test/oclick</code> (credentials 없으면 건너뜀)</li>
              <li>모두 통과 시 <code>workers.verified_at</code> 업데이트</li>
            </ol>
          </div>
        </div>
      </Section>

      {/* ── Watchdog ── */}
      <Section title="Watchdog (Windows 전용)">
        <p className="text-gray-400 mb-3 text-xs">
          워커 시작 시 Windows 작업 스케줄러에 <code>CrawlStationWatchdog</code> 태스크를
          자동 등록합니다. 이미 등록되어 있으면 무시.
        </p>
        <div className="bg-gray-800 rounded-lg p-4 text-xs text-gray-400 space-y-2">
          <p>
            <strong className="text-gray-300">목적:</strong> 워커가 비정상 종료되어도 5분 내에 자동 복구
          </p>
          <p>
            <strong className="text-gray-300">스케줄:</strong> 5분 간격 (<code>schtasks /sc minute /mo 5</code>)
          </p>
          <p>
            <strong className="text-gray-300">watchdog.py:</strong> 로컬에 없으면 Station에서 자동 다운로드{" "}
            (<code>/api/download?file=watchdog.py</code>)
          </p>
          <p>
            <strong className="text-gray-300">실행자:</strong> <code>pythonw.exe</code> (콘솔창 없이 백그라운드 실행)
          </p>
        </div>
      </Section>

      {/* ── Heartbeat ── */}
      <Section title="Heartbeat">
        <div className="grid grid-cols-2 gap-4 text-xs text-gray-400">
          <div className="bg-gray-800 rounded-lg p-4">
            <h4 className="text-gray-300 font-semibold mb-2">백그라운드 루프</h4>
            <p>10초 간격으로 workers 테이블에 다음 필드를 UPDATE:</p>
            <ul className="mt-2 space-y-1 text-gray-500">
              <li><code className="text-gray-400">last_seen</code> — UTC 타임스탬프</li>
              <li><code className="text-gray-400">status</code> — idle / crawling / blocked</li>
              <li><code className="text-gray-400">current_keyword</code></li>
              <li><code className="text-gray-400">current_type</code></li>
              <li><code className="text-gray-400">current_ip</code> — 30분 캐시</li>
              <li><code className="text-gray-400">allowed_types</code></li>
            </ul>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <h4 className="text-gray-300 font-semibold mb-2">오프라인 판정</h4>
            <p>
              Station은 <code>last_seen</code>이 30초(WORKER_ONLINE_THRESHOLD_MS) 이상
              경과한 워커를 오프라인으로 표시합니다.
            </p>
            <p className="mt-2">
              <strong className="text-gray-300">Degraded:</strong> last_seen이 24시간 이상
              경과 시 별도 경고 표시.
            </p>
            <p className="mt-2">
              <strong className="text-gray-300">명령 체크:</strong> heartbeat 6회(=30초)마다
              workers.command 컬럼 조회.
            </p>
          </div>
        </div>
      </Section>

      {/* ── Worker Config ── */}
      <Section title="워커 설정 필드 레퍼런스 (worker_config)">
        <p className="text-gray-400 mb-4 text-xs">
          워커 시작 시 <code>worker_config</code> 테이블에서 로드. 워커별 설정이 없으면
          id=&apos;global&apos; 행을 사용합니다. 배치 완료마다 재로드.
        </p>
        <div className="space-y-6">
          {CONFIG_GROUPS.map((g) => (
            <div key={g.title}>
              <h4 className="text-gray-300 text-xs font-semibold mb-2">{g.title}</h4>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left text-xs text-gray-600 border-b border-gray-800">
                    <th className="py-1 pr-4">필드</th>
                    <th className="py-1 pr-4">타입</th>
                    <th className="py-1 pr-4">기본값</th>
                    <th className="py-1">설명</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {g.fields.map((f) => (
                    <tr key={f.field} className="hover:bg-gray-800/30">
                      <td className="py-1.5 pr-4 font-mono text-xs text-blue-400">{f.field}</td>
                      <td className="py-1.5 pr-4 text-xs text-gray-500">{f.type}</td>
                      <td className="py-1.5 pr-4 text-xs text-gray-500">{f.default}</td>
                      <td className="py-1.5 text-xs text-gray-400">{f.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 로그 & 에러 ── */}
      <Section title="로그 & 에러 기록">
        <div className="grid grid-cols-2 gap-4 text-xs text-gray-400">
          <div className="bg-gray-800 rounded-lg p-4">
            <h4 className="text-gray-300 font-semibold mb-2">파일 로그</h4>
            <p>워커 stdout/stderr는 다음 경로에 append 저장:</p>
            <ul className="mt-2 space-y-1 text-gray-500">
              <li>Mac: <code className="text-gray-400">~/CrawlWorker/logs/worker.log</code></li>
              <li>Win: <code className="text-gray-400">%APPDATA%\CrawlStation\logs\worker.log</code></li>
            </ul>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <h4 className="text-gray-300 font-semibold mb-2">DB 로그 (worker_logs)</h4>
            <p>에러/경고는 <code>worker_logs</code> 테이블에도 INSERT:</p>
            <ul className="mt-2 space-y-1 text-gray-500">
              <li><code className="text-gray-400">worker_id</code> — 워커 ID</li>
              <li><code className="text-gray-400">level</code> — error / warning / info</li>
              <li><code className="text-gray-400">message</code> — 최대 1000자</li>
              <li><code className="text-gray-400">context</code> — JSONB 추가 정보</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* ── DB 테이블 ── */}
      <Section title="관련 DB 테이블">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {DB_TABLES.map((t) => (
            <div key={t.name} className="bg-gray-800 rounded-lg p-3">
              <code className="text-xs text-purple-400">{t.name}</code>
              <p className="text-xs text-gray-400 mt-1">{t.desc}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

/* ── 서브 컴포넌트 ── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-bold text-white mb-4 pb-2 border-b border-gray-700">
        {title}
      </h2>
      {children}
    </section>
  );
}

function CategoryBadge({ cat }: { cat: string }) {
  const map: Record<string, string> = {
    naver: "bg-green-900/50 text-green-300",
    instagram: "bg-pink-900/50 text-pink-300",
    oclick: "bg-orange-900/50 text-orange-300",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[cat] ?? "bg-gray-700 text-gray-300"}`}>
      {cat}
    </span>
  );
}

function PriorityBadge({ p }: { p: number }) {
  const color = p >= 10 ? "text-red-400" : p >= 5 ? "text-yellow-400" : "text-gray-400";
  return <span className={`font-bold ${color}`}>{p}</span>;
}

/* ── 데이터 ── */

const CRAWL_TYPES = [
  {
    type: "kin_analysis",
    label: "지식인 분석",
    category: "naver",
    priority: 5,
    desc: "네이버 지식인에서 키워드 검색 결과(질문/답변 수, 답변 내용) 수집",
  },
  {
    type: "kin_post",
    label: "지식인 포스트",
    category: "naver",
    priority: 5,
    desc: "특정 지식인 게시물 상세 내용 수집 (kin_analysis의 서브 작업)",
  },
  {
    type: "blog_crawl",
    label: "블로그 크롤링",
    category: "naver",
    priority: 5,
    desc: "네이버 블로그 검색 결과 목록 수집 (블로그 URL, 제목, 날짜, 조회수 등)",
  },
  {
    type: "blog_serp",
    label: "블로그 순위",
    category: "naver",
    priority: 5,
    desc: "특정 키워드 네이버 블로그 탭 검색결과에서 특정 블로그 URL의 순위 확인",
  },
  {
    type: "rank_check",
    label: "통합검색 순위",
    category: "naver",
    priority: 1,
    desc: "네이버 통합검색 결과에서 지정 URL의 순위 및 영역(블로그/지식인/쇼핑 등) 파악",
  },
  {
    type: "deep_analysis",
    label: "심화 분석",
    category: "naver",
    priority: 10,
    desc: "지식인 + 블로그 + 순위를 하나의 작업으로 묶어 종합 분석. 가장 높은 우선순위(10)",
  },
  {
    type: "area_analysis",
    label: "영역 분석",
    category: "naver",
    priority: 5,
    desc: "네이버 통합검색 결과에서 각 콘텐츠 영역(블로그/카페/쇼핑/지식인 등) 노출 구조 분석",
  },
  {
    type: "daily_rank",
    label: "일일 순위",
    category: "naver",
    priority: 1,
    desc: "스케줄에 의해 매일 자동 실행되는 순위 추적. rank_check와 동일 핸들러 사용",
  },
  {
    type: "instagram_profile",
    label: "인스타 프로필",
    category: "instagram",
    priority: 5,
    desc: "인스타그램 계정의 팔로워 수·게시물 수·팔로잉 수·프로필 정보 수집. 계정 풀에서 자동 선택",
  },
  {
    type: "instagram_post",
    label: "인스타 포스트",
    category: "instagram",
    priority: 5,
    desc: "인스타그램 특정 게시물 상세 정보(좋아요/댓글/해시태그) 수집 (선택적 핸들러)",
  },
  {
    type: "instagram_login_test",
    label: "인스타 로그인 테스트",
    category: "instagram",
    priority: 5,
    desc: "인스타그램 계정 로그인 가능 여부 확인용 내부 테스트 타입",
  },
  {
    type: "oclick_sync",
    label: "Oclick 재고 동기화",
    category: "oclick",
    priority: 1,
    desc: "Oclick API에서 전체 상품 재고 목록 수집·동기화 (선택적 핸들러)",
  },
  {
    type: "oclick_sales",
    label: "Oclick 매출 수집",
    category: "oclick",
    priority: 1,
    desc: "Oclick API에서 매출/주문 데이터 수집 (선택적 핸들러)",
  },
];

const WORKER_STATUSES = [
  { status: "online", color: "#22c55e", desc: "프로세스 실행 중, 작업 대기" },
  { status: "idle", color: "#6b7280", desc: "대기 중 (heartbeat는 전송 중)" },
  { status: "crawling", color: "#3b82f6", desc: "작업 처리 중" },
  { status: "blocked", color: "#f97316", desc: "차단 감지 — 쿨다운 중" },
  { status: "offline", color: "#ef4444", desc: "last_seen 30초 이상 경과" },
];

const BLOCK_STATUSES = [
  {
    status: "cooling",
    color: "#eab308",
    desc: "빈 결과 반복 (소프트 차단 의심)",
    cooldown: "30분",
  },
  {
    status: "blocked",
    color: "#f97316",
    desc: "캡챠·차단 키워드 감지 (하드 차단)",
    cooldown: "60분",
  },
  {
    status: "banned",
    color: "#ef4444",
    desc: "영구 차단 감지",
    cooldown: "수동 해제",
  },
];

const CONFIG_GROUPS = [
  {
    title: "휴먼 행동 시뮬레이션",
    fields: [
      { field: "ua_pool", type: "string[]", default: "—", desc: "랜덤으로 선택할 User-Agent 목록" },
      { field: "typing_speed_min", type: "number", default: "50", desc: "타이핑 딜레이 최솟값 (ms)" },
      { field: "typing_speed_max", type: "number", default: "150", desc: "타이핑 딜레이 최댓값 (ms)" },
      { field: "scroll_min", type: "number", default: "2", desc: "스크롤 최솟값 (회)" },
      { field: "scroll_max", type: "number", default: "5", desc: "스크롤 최댓값 (회)" },
      { field: "typo_probability", type: "number", default: "0.05", desc: "오타 발생 확률 (0~1)" },
      { field: "scroll_back_probability", type: "number", default: "0.2", desc: "스크롤 역방향 확률 (0~1)" },
    ],
  },
  {
    title: "배치 & 딜레이",
    fields: [
      { field: "batch_size", type: "number", default: "30", desc: "배치당 처리할 작업 수. 초과 시 휴식 진입" },
      { field: "batch_rest_seconds", type: "number", default: "180", desc: "배치 완료 후 휴식 시간 (초)" },
      { field: "keyword_delay_min", type: "number", default: "15", desc: "작업 간 최소 딜레이 (초)" },
      { field: "keyword_delay_max", type: "number", default: "30", desc: "작업 간 최대 딜레이 (초)" },
      { field: "rest_hours", type: "number[]", default: "[3,4,5]", desc: "새벽 휴식 시간대 (KST 시 단위)" },
    ],
  },
  {
    title: "네트워크",
    fields: [
      { field: "network_type", type: "string", default: "wifi", desc: "wifi / tethering_skt / tethering_kt / proxy_static / proxy_rotate" },
      { field: "proxy_url", type: "string", default: "—", desc: "프록시 URL (network_type=proxy_* 시 사용)" },
      { field: "proxy_rotate", type: "boolean", default: "false", desc: "작업마다 프록시 로테이션 여부" },
      { field: "tethering_carrier", type: "string", default: "skt", desc: "테더링 통신사 (skt/kt/lgu/other)" },
      { field: "tethering_auto_reconnect", type: "boolean", default: "false", desc: "배치 완료마다 Wi-Fi 재연결로 IP 변경" },
      { field: "tethering_reconnect_interval", type: "string", default: "per_batch", desc: "재연결 대기 시간 (per_batch / 3min / 5min / 10min)" },
    ],
  },
  {
    title: "일일 할당량",
    fields: [
      { field: "daily_quota", type: "number", default: "0", desc: "전체 하루 한도 (0=무제한)" },
      { field: "daily_quota_naver", type: "number", default: "0", desc: "네이버 카테고리 하루 한도" },
      { field: "daily_quota_instagram", type: "number", default: "0", desc: "인스타그램 카테고리 하루 한도" },
      { field: "daily_used", type: "number", default: "0", desc: "오늘 처리한 전체 작업 수 (자동 증가)" },
      { field: "daily_used_naver", type: "number", default: "0", desc: "오늘 처리한 네이버 작업 수" },
      { field: "daily_used_instagram", type: "number", default: "0", desc: "오늘 처리한 인스타 작업 수" },
      { field: "quota_reset_at", type: "string", default: "—", desc: "마지막 리셋 날짜 (YYYY-MM-DD, KST)" },
    ],
  },
  {
    title: "카테고리 활성화",
    fields: [
      { field: "naver_enabled", type: "boolean|null", default: "null", desc: "null=자동(헬스체크 기반) / true=강제 ON / false=강제 OFF" },
      { field: "instagram_enabled", type: "boolean|null", default: "null", desc: "null=자동 / true=강제 ON / false=강제 OFF" },
      { field: "oclick_enabled", type: "boolean|null", default: "null", desc: "null=자동 / true=강제 ON / false=강제 OFF" },
      { field: "allowed_types", type: "string[]", default: "[]", desc: "처리 허용 타입 목록. 비어있으면 기본 제외 타입 외 전체 허용" },
    ],
  },
];

const DB_TABLES = [
  { name: "workers", desc: "워커 등록 정보, 상태, 차단 상태, test_results" },
  { name: "worker_config", desc: "워커별/글로벌 크롤링 설정" },
  { name: "worker_logs", desc: "에러·경고 로그 (level, message, context)" },
  { name: "worker_releases", desc: "릴리즈 파일 및 changelog (is_latest 플래그)" },
  { name: "crawl_requests", desc: "작업 큐 (pending→assigned→running→completed|failed)" },
  { name: "crawl_results", desc: "수집 결과 (request_id, type, keyword, rank, data JSON)" },
  { name: "instagram_accounts", desc: "인스타그램 계정 풀 (프로필 크롤러에 자동 배정)" },
  { name: "station_settings", desc: "오클릭 credentials 등 전역 시스템 설정" },
];
