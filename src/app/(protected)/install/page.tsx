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

export default function InstallPage() {
  return (
    <div className="p-4 sm:p-6">
      <WorkerInstall />
    </div>
  );
}

function WorkerInstall() {
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [mobileRelease, setMobileRelease] = useState<MobileReleaseInfo | null>(null);
  const [curlCopied, setCurlCopied] = useState(false);

  useEffect(() => {
    fetch("/api/releases")
      .then((r) => r.json())
      .then(async (data) => {
        const releases: { is_latest: boolean; worker_type?: string; version: string; created_at: string }[] = data.releases || [];

        // 모바일 최신 버전
        const latestMobile = releases.find((r) => r.worker_type === "android_mobile" && r.is_latest);
        if (latestMobile) {
          setMobileRelease({ version: latestMobile.version, published: latestMobile.created_at });
        }

        // PC 최신 버전 (worker_type이 null/'pc'인 것)
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

        setRelease({
          version: ghVersion,
          published: latest.created_at || "",
          winFilename,
          macFilename,
        });
      })
      .catch(() => {});
  }, []);

  return (
    <>
      <h2 className="text-xl font-bold mb-2">크롤링 워커 설치</h2>
      <p className="text-sm text-gray-500 mb-6">
        다운로드 후 설치하면 끝. 나머지는 전부 자동입니다.
      </p>

      {/* 다운로드 버튼 */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg p-6 mb-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <h3 className="text-lg font-bold">워커 설치 파일 다운로드</h3>
          {release && (
            <span className="px-2 py-0.5 bg-blue-500 rounded text-xs font-mono">
              v{release.version}
            </span>
          )}
        </div>
        <p className="text-sm text-blue-100 mb-1">
          Python, 브라우저, 연결정보 등 필요한 모든 것이 자동으로 설치됩니다.
        </p>
        {release?.published && (
          <p className="text-xs text-blue-200 mb-4">
            릴리즈: {new Date(release.published).toLocaleDateString("ko-KR")}
          </p>
        )}
        {!release?.published && <div className="mb-4" />}
        <div className="flex gap-3 flex-wrap">
          <div className="flex flex-col gap-0.5">
            <a
              href="/api/download?type=mac"
              className="inline-flex items-center gap-2 bg-white text-blue-700 font-bold px-6 py-2.5 rounded-md hover:bg-blue-50 transition-colors text-sm"
            >
              Mac 다운로드 (.pkg)
            </a>
            {release?.macFilename && (
              <span className="text-xs text-blue-200 text-center font-mono">{release.macFilename}</span>
            )}
          </div>
          <div className="flex flex-col gap-0.5">
            <a
              href="/api/download?type=win"
              className="inline-flex items-center gap-2 bg-blue-500 text-white font-bold px-6 py-2.5 rounded-md hover:bg-blue-400 transition-colors text-sm"
            >
              Windows 다운로드 (.exe)
            </a>
            {release?.winFilename && (
              <span className="text-xs text-blue-200 text-center font-mono">{release.winFilename}</span>
            )}
          </div>
        </div>
      </div>

      {/* Mac 설치 가이드 */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">Mac</h3>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-start gap-4">
            <div className="flex items-center gap-3 text-sm">
              <span className="w-6 h-6 bg-gray-900 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">1</span>
              <span>.pkg 다운로드</span>
              <span className="text-gray-300">&rarr;</span>
              <span className="w-6 h-6 bg-gray-900 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">2</span>
              <span>더블클릭하여 설치</span>
              <span className="text-gray-300">&rarr;</span>
              <span className="text-green-600 font-semibold">끝</span>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            &quot;확인되지 않은 개발자&quot; 경고 시: 시스템 설정 &rarr; 개인정보 보호 및 보안 &rarr; &quot;확인 없이 열기&quot;
          </p>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-green-800 mb-2">자동으로 처리되는 것</h4>
          <ul className="text-sm text-green-700 space-y-1">
            <li>Python 없으면 자동 설치</li>
            <li>브라우저(Chromium) 자동 설치</li>
            <li>설치 즉시 백그라운드 실행 (재부팅 불필요)</li>
            <li>Mac 켤 때마다 자동 시작</li>
            <li>오류 시 자동 재시작</li>
            <li>새 버전 자동 업데이트</li>
            <li>CrawlStation에 자동 등록</li>
          </ul>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">제어 / 삭제</h4>
          <p className="text-sm text-gray-600">
            Launchpad 또는 Applications에서 <strong>CrawlStation Worker</strong> 앱 실행
            <span className="text-gray-400 text-xs ml-2">(상태확인 / 시작 / 중지 / 재시작 / 로그 / 완전 삭제)</span>
          </p>
        </div>

        {/* Windows 가이드 */}
        <h3 className="text-sm font-semibold text-gray-700 mt-6">Windows</h3>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-start gap-4">
            <div className="flex items-center gap-3 text-sm">
              <span className="w-6 h-6 bg-gray-900 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">1</span>
              <span>다운로드</span>
              <span className="text-gray-300">&rarr;</span>
              <span className="w-6 h-6 bg-gray-900 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">2</span>
              <span>더블클릭하여 설치</span>
              <span className="text-gray-300">&rarr;</span>
              <span className="text-green-600 font-semibold">끝</span>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Python 자동 설치. 설치 후 자동 실행 + PC 부팅 시 자동 시작. 제어판에서 삭제 가능.
          </p>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-purple-800 mb-2">AI 자가 진단 설치 (v0.4.0)</h4>
          <p className="text-sm text-purple-700 mb-2">
            설치 중 오류 발생 시 Claude AI가 자동으로 문제를 진단하고 수정합니다.
          </p>
          <ul className="text-xs text-purple-600 space-y-1">
            <li>9단계 설치 과정을 단계별로 실행 + 검증</li>
            <li>오류 발생 시 환경 정보를 자동 수집하여 AI에 전송</li>
            <li>AI가 수정 명령을 반환하면 자동 실행 후 재시도</li>
            <li>단계별 최대 3회 자동 복구 시도</li>
            <li>시스템 설정에서 Anthropic API 키 등록 필요</li>
          </ul>
        </div>

        {/* Android 모바일 워커 */}
        <h3 className="text-sm font-semibold text-gray-700 mt-6">Android (모바일 LTE 워커)</h3>

        <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-lg p-5 text-white">
          <div className="flex items-center gap-3 mb-1">
            <h4 className="text-base font-bold">Android 모바일 워커</h4>
            {mobileRelease ? (
              <span className="px-2 py-0.5 bg-green-500 rounded text-xs font-mono">
                v{mobileRelease.version}
              </span>
            ) : (
              <span className="px-2 py-0.5 bg-green-500/50 rounded text-xs">버전 미등록</span>
            )}
          </div>
          <p className="text-xs text-green-100 mb-4">
            Termux 환경에서 실행 — LTE IP로 네이버 크롤링 (Chrome CDP)
            {mobileRelease?.published && (
              <span className="ml-2 text-green-200">
                · 릴리즈 {new Date(mobileRelease.published).toLocaleDateString("ko-KR")}
              </span>
            )}
          </p>
          <div className="flex gap-3 flex-wrap">
            <a
              href="/api/download?type=mobile"
              download="install.sh"
              className="inline-flex items-center gap-2 bg-white text-green-700 font-bold px-5 py-2 rounded-md hover:bg-green-50 transition-colors text-sm"
            >
              install.sh 다운로드
            </a>
            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  "curl -sL https://crawl-station.vercel.app/api/mobile-install | bash"
                );
                setCurlCopied(true);
                setTimeout(() => setCurlCopied(false), 2000);
              }}
              className="inline-flex items-center gap-2 bg-green-500 text-white font-bold px-5 py-2 rounded-md hover:bg-green-400 transition-colors text-sm"
            >
              {curlCopied ? "복사됨!" : "curl 명령어 복사"}
            </button>
          </div>
          <p className="text-xs text-green-200 mt-3 font-mono">
            curl -sL https://crawl-station.vercel.app/api/mobile-install | bash
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-3 text-sm flex-wrap">
            <span className="w-6 h-6 bg-gray-900 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">1</span>
            <span>Termux 설치 (F-Droid)</span>
            <span className="text-gray-300">&rarr;</span>
            <span className="w-6 h-6 bg-gray-900 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">2</span>
            <span>install.sh 실행</span>
            <span className="text-gray-300">&rarr;</span>
            <span className="w-6 h-6 bg-gray-900 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">3</span>
            <span>Supabase URL/Key 입력</span>
            <span className="text-gray-300">&rarr;</span>
            <span className="text-green-600 font-semibold">끝</span>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            사전 준비: Android Chrome에서 개발자 옵션 &rarr; USB 디버깅 활성화 &rarr; ADB over WiFi 또는 USB 연결로 CDP 포트(9222) 활성화
          </p>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-green-800 mb-2">자동으로 처리되는 것</h4>
          <ul className="text-sm text-green-700 space-y-1">
            <li>Python 패키지 자동 설치 (supabase, beautifulsoup4)</li>
            <li>DEVICE_ID 자동 발급 + 워커 등록</li>
            <li>Termux:Boot 설정 시 부팅 자동 시작</li>
            <li>worker_releases 폴링으로 핸들러 자동 업데이트</li>
            <li>배터리·온도·통신사 정보 실시간 전송</li>
          </ul>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-amber-800 mb-2">지원 기능</h4>
          <div className="text-xs text-amber-700 grid grid-cols-2 gap-1">
            {["rank_check", "env_analysis", "deep_analysis", "kin_analysis", "blog_serp", "area_analysis", "daily_rank"].map((f) => (
              <span key={f} className="font-mono">{f}</span>
            ))}
          </div>
          <p className="text-xs text-amber-600 mt-2">oclick · Instagram IP 로테이션 미지원 (LTE 특성상 제외)</p>
        </div>
      </div>
    </>
  );
}
