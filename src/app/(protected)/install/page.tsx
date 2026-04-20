"use client";

import { useEffect, useState } from "react";

interface ReleaseInfo {
  version: string;
  published: string;
  winFilename: string | null;
  macFilename: string | null;
}

interface MobileReleaseInfo {
  version: string;
  published: string;
}

type Tab = "pc" | "mobile";

export default function InstallPage() {
  return (
    <div className="p-4 sm:p-6 max-w-3xl">
      <WorkerInstall />
    </div>
  );
}

function Step({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 h-6 bg-gray-800 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">
        {n}
      </span>
      <span className="text-sm text-gray-700">{label}</span>
    </div>
  );
}

function Arrow() {
  return <span className="text-gray-300 text-sm select-none">›</span>;
}

function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="text-green-500 mt-0.5 shrink-0">✓</span>
      <span>{children}</span>
    </li>
  );
}

function WorkerInstall() {
  const [tab, setTab] = useState<Tab>("pc");
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [mobileRelease, setMobileRelease] = useState<MobileReleaseInfo | null>(null);
  const [curlCopied, setCurlCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/releases")
      .then((r) => r.json())
      .then(async (data) => {
        const releases: { is_latest: boolean; worker_type?: string; version: string; created_at: string }[] =
          data.releases || [];

        const latestMobile = releases.find((r) => r.worker_type === "android_mobile" && r.is_latest);
        if (latestMobile) {
          setMobileRelease({ version: latestMobile.version, published: latestMobile.created_at });
        }

        const latest = releases.find((r) => r.is_latest && r.worker_type !== "android_mobile");
        if (!latest) return;

        let winFilename: string | null = null;
        let macFilename: string | null = null;
        let ghVersion: string = latest.version;
        try {
          const ghRes = await fetch(
            "https://api.github.com/repos/gnookim/crawl-station/releases/latest",
            { cache: "no-store" }
          );
          if (ghRes.ok) {
            const ghData = await ghRes.json();
            if (ghData.tag_name) ghVersion = ghData.tag_name.replace(/^v/, "");
            const exeAssets: { name: string }[] =
              ghData.assets?.filter((a: { name: string }) => a.name.endsWith(".exe")) ?? [];
            const getRevision = (name: string) => {
              const m = name.match(/r(\d+)\.exe$/);
              return m ? parseInt(m[1]) : 1;
            };
            const latest_exe = exeAssets.sort((a, b) => getRevision(b.name) - getRevision(a.name))[0];
            winFilename = latest_exe?.name ?? null;
            macFilename = ghData.assets?.find((a: { name: string }) => a.name.endsWith(".pkg"))?.name ?? null;
          }
        } catch {}

        setRelease({ version: ghVersion, published: latest.created_at || "", winFilename, macFilename });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const copyCurl = () => {
    navigator.clipboard.writeText("curl -sL https://crawl-station.vercel.app/api/mobile-install | bash");
    setCurlCopied(true);
    setTimeout(() => setCurlCopied(false), 2000);
  };

  return (
    <div>
      {/* 헤더 */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">워커 설치</h2>
        <p className="text-sm text-gray-500 mt-1">플랫폼을 선택하고 설치 파일을 다운로드하세요.</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setTab("pc")}
          className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "pc"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          💻 PC 워커
        </button>
        <button
          onClick={() => setTab("mobile")}
          className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "mobile"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          📱 모바일 워커
        </button>
      </div>

      {/* ── PC 탭 ── */}
      {tab === "pc" && (
        <div className="space-y-5">
          {/* 버전 배지 */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">최신 버전</span>
            {loading ? (
              <span className="h-5 w-16 bg-gray-200 rounded animate-pulse" />
            ) : release ? (
              <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-mono font-semibold">
                v{release.version}
              </span>
            ) : (
              <span className="text-xs text-gray-400">버전 정보 없음</span>
            )}
            {release?.published && (
              <span className="text-xs text-gray-400">
                · {new Date(release.published).toLocaleDateString("ko-KR")} 릴리즈
              </span>
            )}
          </div>

          {/* 다운로드 카드 2열 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Mac */}
            <div className="border border-gray-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-sm transition-all">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl"></span>
                <div>
                  <div className="font-semibold text-gray-900 text-sm">Mac</div>
                  <div className="text-xs text-gray-400">macOS 11+</div>
                </div>
              </div>
              <a
                href="/api/download?type=mac"
                className="w-full inline-flex items-center justify-center gap-2 bg-gray-900 text-white font-semibold px-4 py-2.5 rounded-lg hover:bg-gray-700 transition-colors text-sm mb-2"
              >
                다운로드 (.pkg)
              </a>
              {release?.macFilename && (
                <p className="text-xs text-gray-400 text-center font-mono truncate">{release.macFilename}</p>
              )}
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  더블클릭 설치 후 자동 실행.<br />
                  <span className="text-gray-400">&quot;확인되지 않은 개발자&quot; 경고 시:<br />시스템 설정 → 개인정보 보호 → 확인 없이 열기</span>
                </p>
              </div>
            </div>

            {/* Windows */}
            <div className="border border-gray-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-sm transition-all">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">🪟</span>
                <div>
                  <div className="font-semibold text-gray-900 text-sm">Windows</div>
                  <div className="text-xs text-gray-400">Windows 10+</div>
                </div>
              </div>
              <a
                href="/api/download?type=win"
                className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 text-white font-semibold px-4 py-2.5 rounded-lg hover:bg-blue-500 transition-colors text-sm mb-2"
              >
                다운로드 (.exe)
              </a>
              {release?.winFilename && (
                <p className="text-xs text-gray-400 text-center font-mono truncate">{release.winFilename}</p>
              )}
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  더블클릭 설치 후 자동 실행.<br />
                  <span className="text-gray-400">Python 자동 설치. 제어판에서 삭제 가능.</span>
                </p>
              </div>
            </div>
          </div>

          {/* 자동 처리 항목 */}
          <div className="bg-green-50 border border-green-100 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-green-800 mb-3">설치 후 자동으로 처리되는 것</h4>
            <ul className="space-y-1.5 text-green-700">
              <CheckItem>Python · Chromium 자동 설치</CheckItem>
              <CheckItem>설치 즉시 백그라운드 실행 (재부팅 불필요)</CheckItem>
              <CheckItem>PC 켤 때마다 자동 시작</CheckItem>
              <CheckItem>오류 시 자동 재시작 · 새 버전 자동 업데이트</CheckItem>
              <CheckItem>CrawlStation에 자동 등록</CheckItem>
            </ul>
          </div>

          {/* Windows AI 진단 */}
          <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <span className="text-xl mt-0.5">🤖</span>
              <div>
                <h4 className="text-sm font-semibold text-purple-800 mb-1">AI 자가 진단 설치 (Windows)</h4>
                <p className="text-xs text-purple-700 mb-2">
                  설치 중 오류 발생 시 Claude AI가 자동으로 원인을 분석하고 수정합니다.
                </p>
                <ul className="text-xs text-purple-600 space-y-1">
                  <li>· 9단계 설치 과정 단계별 실행 + 검증</li>
                  <li>· 오류 발생 시 환경 정보 자동 수집 → AI 전송 → 수정 명령 실행</li>
                  <li>· 단계별 최대 3회 자동 복구 시도</li>
                  <li>· 시스템 설정에서 Anthropic API 키 등록 필요</li>
                </ul>
              </div>
            </div>
          </div>

          {/* 제어 방법 */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">제어 / 삭제</h4>
            <div className="flex flex-col gap-1.5 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <span className="text-base"></span>
                <span>Launchpad → <strong>CrawlStation Worker</strong> 앱 실행</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-base">🪟</span>
                <span>제어판 → 프로그램 추가/제거 → CrawlStation Worker</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">상태확인 · 시작 · 중지 · 재시작 · 로그 · 완전 삭제</p>
          </div>
        </div>
      )}

      {/* ── 모바일 탭 ── */}
      {tab === "mobile" && (
        <div className="space-y-5">
          {/* 버전 배지 */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">최신 버전</span>
            {loading ? (
              <span className="h-5 w-16 bg-gray-200 rounded animate-pulse" />
            ) : mobileRelease ? (
              <span className="px-2.5 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-mono font-semibold">
                v{mobileRelease.version}
              </span>
            ) : (
              <span className="text-xs text-gray-400">버전 미등록</span>
            )}
            {mobileRelease?.published && (
              <span className="text-xs text-gray-400">
                · {new Date(mobileRelease.published).toLocaleDateString("ko-KR")} 릴리즈
              </span>
            )}
          </div>

          {/* 설명 배너 */}
          <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl p-5 text-white">
            <div className="flex items-start gap-3">
              <span className="text-3xl">📱</span>
              <div>
                <h3 className="font-bold text-base mb-1">Android LTE 모바일 워커</h3>
                <p className="text-sm text-green-100">
                  Android 폰의 LTE IP를 활용한 네이버 크롤링 워커입니다.<br />
                  Termux + Chrome CDP 기반으로 동작합니다.
                </p>
              </div>
            </div>
          </div>

          {/* 설치 방법 카드 */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <h4 className="text-sm font-semibold text-gray-700">설치 방법</h4>
            </div>
            <div className="p-4 space-y-4">
              {/* 방법 1: curl */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">방법 1 — 원커맨드 설치 (권장)</p>
                <div className="bg-gray-900 rounded-lg p-3 flex items-center justify-between gap-2">
                  <code className="text-green-400 text-xs font-mono truncate">
                    curl -sL https://crawl-station.vercel.app/api/mobile-install | bash
                  </code>
                  <button
                    onClick={copyCurl}
                    className={`shrink-0 px-3 py-1 rounded text-xs font-semibold transition-colors ${
                      curlCopied
                        ? "bg-green-500 text-white"
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    }`}
                  >
                    {curlCopied ? "복사됨!" : "복사"}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1.5">Termux 앱에서 위 명령어를 그대로 붙여넣기</p>
              </div>

              <div className="border-t border-gray-100" />

              {/* 방법 2: 파일 다운로드 */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">방법 2 — 파일 직접 다운로드</p>
                <a
                  href="/api/download?type=mobile"
                  download="install.sh"
                  className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 font-semibold px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                >
                  install.sh 다운로드
                </a>
                <p className="text-xs text-gray-400 mt-1.5">다운로드 후 Termux에서 <code className="font-mono">bash install.sh</code> 실행</p>
              </div>
            </div>
          </div>

          {/* 설치 단계 */}
          <div className="border border-gray-200 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-4">설치 순서</h4>
            <div className="flex flex-wrap items-center gap-2">
              <Step n={1} label="F-Droid에서 Termux 설치" />
              <Arrow />
              <Step n={2} label="curl 명령어 실행" />
              <Arrow />
              <Step n={3} label="Supabase URL/Key 입력" />
              <Arrow />
              <Step n={4} label="통신사 선택" />
              <Arrow />
              <span className="text-sm font-semibold text-green-600">완료</span>
            </div>
            <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-lg">
              <p className="text-xs font-semibold text-amber-700 mb-1">사전 준비 (Chrome CDP)</p>
              <p className="text-xs text-amber-600">
                Android 설정 → 개발자 옵션 → USB 디버깅 활성화<br />
                ADB over WiFi 또는 USB로 연결 후 CDP 포트(9222) 활성화
              </p>
            </div>
          </div>

          {/* 자동 처리 */}
          <div className="bg-green-50 border border-green-100 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-green-800 mb-3">설치 후 자동으로 처리되는 것</h4>
            <ul className="space-y-1.5 text-green-700">
              <CheckItem>Python 패키지 자동 설치 (supabase, beautifulsoup4)</CheckItem>
              <CheckItem>DEVICE_ID 자동 발급 · 워커 자동 등록</CheckItem>
              <CheckItem>Termux:Boot 설정 시 부팅 자동 시작</CheckItem>
              <CheckItem>worker_releases 폴링으로 핸들러 자동 업데이트</CheckItem>
              <CheckItem>배터리 · 온도 · 통신사 정보 실시간 전송</CheckItem>
            </ul>
          </div>

          {/* 지원 기능 */}
          <div className="border border-gray-200 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">지원 기능</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { name: "rank_check",    label: "순위 체크" },
                { name: "env_analysis",  label: "환경 분석" },
                { name: "deep_analysis", label: "딥 분석" },
                { name: "kin_analysis",  label: "지식인 분석" },
                { name: "blog_serp",     label: "블로그 SERP" },
                { name: "area_analysis", label: "영역 분석" },
                { name: "daily_rank",    label: "일일 순위" },
              ].map((f) => (
                <div key={f.name} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-gray-700">{f.label}</div>
                    <div className="text-xs text-gray-400 font-mono">{f.name}</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              oclick · Instagram IP 로테이션은 LTE 특성상 미지원
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
