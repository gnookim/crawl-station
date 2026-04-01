"use client";

export default function InstallPage() {
  return (
    <div className="p-6 max-w-4xl">
      <WorkerInstall />
    </div>
  );
}

function WorkerInstall() {
  return (
    <>
      <h2 className="text-xl font-bold mb-2">크롤링 워커 설치</h2>
      <p className="text-sm text-gray-500 mb-6">
        다운로드 후 설치하면 끝. 나머지는 전부 자동입니다.
      </p>

      {/* 다운로드 버튼 */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg p-6 mb-6 text-white">
        <h3 className="text-lg font-bold mb-2">워커 설치 파일 다운로드</h3>
        <p className="text-sm text-blue-100 mb-4">
          Python, 브라우저, 연결정보 등 필요한 모든 것이 자동으로 설치됩니다.
        </p>
        <div className="flex gap-3">
          <a
            href="/api/download?type=mac"
            className="inline-flex items-center gap-2 bg-white text-blue-700 font-bold px-6 py-2.5 rounded-md hover:bg-blue-50 transition-colors text-sm"
          >
            Mac 다운로드 (.pkg)
          </a>
          <a
            href="/api/download?type=win"
            className="inline-flex items-center gap-2 bg-blue-500 text-white font-bold px-6 py-2.5 rounded-md hover:bg-blue-400 transition-colors text-sm"
          >
            Windows 다운로드
          </a>
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
      </div>
    </>
  );
}
