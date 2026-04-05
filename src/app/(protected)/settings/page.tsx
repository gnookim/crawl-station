"use client";

import { useEffect, useState, useCallback } from "react";

interface SettingEntry {
  key: string;
  value: string | null;
  updated_at: string | null;
}

const API_KEY_CONFIGS = [
  {
    id: "anthropic_api_key",
    label: "인스톨러용 AI 진단",
    desc: "Windows 인스톨러 설치 중 오류 발생 시 Claude AI가 자동 진단 + 수정",
    placeholder: "sk-ant-api03-...",
  },
  {
    id: "anthropic_worker_key",
    label: "워커용 AI 진단",
    desc: "실행 중인 워커(GUI)에서 시작 실패, 런타임 에러 시 Claude AI가 진단",
    placeholder: "sk-ant-api03-... (미설정 시 인스톨러용 키 사용)",
  },
];

export default function SettingsPage() {
  const [anthropicKey, setAnthropicKey] = useState("");
  const [maskedKey, setMaskedKey] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [saveResult, setSaveResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  // 워커용 키 상태
  const [workerKey, setWorkerKey] = useState("");
  const [maskedWorkerKey, setMaskedWorkerKey] = useState("");
  const [workerKeyUpdated, setWorkerKeyUpdated] = useState<string | null>(null);
  const [savingWorker, setSavingWorker] = useState(false);
  const [workerSaveResult, setWorkerSaveResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings?key=anthropic_api_key");
      const data: SettingEntry = await res.json();
      if (data.value) {
        setMaskedKey(data.value);
        setUpdatedAt(data.updated_at || null);
      }
    } catch {}
    try {
      const res = await fetch("/api/settings?key=anthropic_worker_key");
      const data: SettingEntry = await res.json();
      if (data.value) {
        setMaskedWorkerKey(data.value);
        setWorkerKeyUpdated(data.updated_at || null);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  async function saveKey() {
    if (!anthropicKey.trim()) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "anthropic_api_key",
          value: anthropicKey.trim(),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSaveResult({ ok: true, message: "저장 완료" });
        setAnthropicKey("");
        loadSettings();
      } else {
        setSaveResult({ ok: false, message: data.error || "저장 실패" });
      }
    } catch (e) {
      setSaveResult({
        ok: false,
        message: "서버 오류: " + String(e),
      });
    }
    setSaving(false);
  }

  async function testKey() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/diagnose/test", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setTestResult({ ok: true, message: "AI 연결 정상 (" + data.model + ")" });
      } else {
        setTestResult({ ok: false, message: data.error || "연결 실패" });
      }
    } catch (e) {
      setTestResult({ ok: false, message: "서버 오류: " + String(e) });
    }
    setTesting(false);
  }

  async function deleteKey() {
    if (!confirm("Anthropic API 키를 삭제하시겠습니까? AI 진단 기능이 비활성화됩니다."))
      return;
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "anthropic_api_key", value: null }),
      });
      setMaskedKey("");
      setUpdatedAt(null);
      setSaveResult({ ok: true, message: "삭제 완료" });
    } catch {
      setSaveResult({ ok: false, message: "삭제 실패" });
    }
    setSaving(false);
  }

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-xl font-bold mb-1">시스템 설정</h2>
      <p className="text-sm text-gray-500 mb-6">
        CrawlStation 시스템 전역 설정을 관리합니다.
      </p>

      {/* Anthropic API 키 */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-bold text-gray-900">
            AI 진단 (Anthropic API)
          </h3>
          {maskedKey ? (
            <span className="px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">
              설정됨
            </span>
          ) : (
            <span className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-500 rounded">
              미설정
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Windows 워커 설치 중 오류 발생 시 Claude AI가 자동으로 문제를 진단하고
          수정합니다. Anthropic API 키가 필요합니다.
        </p>

        {/* 현재 키 상태 */}
        {maskedKey && (
          <div className="mb-4 p-3 bg-gray-50 rounded-md">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-gray-500">현재 키: </span>
                <code className="text-xs font-mono text-gray-700">
                  {maskedKey}
                </code>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={testKey}
                  disabled={testing}
                  className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {testing ? "테스트 중..." : "연결 테스트"}
                </button>
                <button
                  onClick={deleteKey}
                  disabled={saving}
                  className="px-2.5 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 disabled:opacity-50"
                >
                  삭제
                </button>
              </div>
            </div>
            {updatedAt && (
              <p className="text-xs text-gray-400 mt-1">
                마지막 수정: {new Date(updatedAt).toLocaleString("ko-KR")}
              </p>
            )}
          </div>
        )}

        {/* 테스트 결과 */}
        {testResult && (
          <div
            className={`mb-4 p-3 rounded-md text-xs ${
              testResult.ok
                ? "bg-green-50 text-green-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {testResult.ok ? "✓ " : "✕ "}
            {testResult.message}
          </div>
        )}

        {/* 새 키 입력 */}
        <div className="flex gap-2">
          <input
            type="password"
            value={anthropicKey}
            onChange={(e) => setAnthropicKey(e.target.value)}
            placeholder="sk-ant-api03-..."
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
          <button
            onClick={saveKey}
            disabled={saving || !anthropicKey.trim()}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
          >
            {saving ? "저장 중..." : maskedKey ? "키 변경" : "저장"}
          </button>
        </div>

        {/* 저장 결과 */}
        {saveResult && (
          <p
            className={`mt-2 text-xs ${
              saveResult.ok ? "text-green-600" : "text-red-600"
            }`}
          >
            {saveResult.message}
          </p>
        )}

        {/* 안내 */}
        <div className="mt-4 p-3 bg-blue-50 rounded-md">
          <p className="text-xs text-blue-700 font-medium mb-1">
            인스톨러 AI 진단
          </p>
          <ul className="text-xs text-blue-600 space-y-0.5">
            <li>1. Windows 인스톨러가 설치 중 오류를 감지</li>
            <li>2. 오류 정보 + 환경 스냅샷을 Station에 전송</li>
            <li>3. Claude AI가 문제를 분석하고 수정 명령을 반환</li>
            <li>4. 인스톨러가 수정을 적용하고 자동 재시도</li>
          </ul>
        </div>
      </div>

      {/* 워커용 AI 진단 키 */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mt-6">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-bold text-gray-900">
            워커용 AI 진단
          </h3>
          {maskedWorkerKey ? (
            <span className="px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">
              별도 키
            </span>
          ) : maskedKey ? (
            <span className="px-1.5 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">
              인스톨러 키 공유
            </span>
          ) : (
            <span className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-500 rounded">
              미설정
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mb-4">
          실행 중인 워커(Windows GUI)에서 시작 실패, ModuleNotFoundError 등 런타임 에러 시
          Claude AI가 진단합니다. 미설정 시 인스톨러용 키를 사용합니다.
        </p>

        {maskedWorkerKey && (
          <div className="mb-4 p-3 bg-gray-50 rounded-md">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-gray-500">워커 키: </span>
                <code className="text-xs font-mono text-gray-700">{maskedWorkerKey}</code>
              </div>
              <button
                onClick={async () => {
                  await fetch("/api/settings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ key: "anthropic_worker_key", value: null }),
                  });
                  setMaskedWorkerKey("");
                  setWorkerSaveResult({ ok: true, message: "삭제됨 — 인스톨러 키로 복귀" });
                  loadSettings();
                }}
                className="px-2.5 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100"
              >
                삭제 (공유로 복귀)
              </button>
            </div>
            {workerKeyUpdated && (
              <p className="text-xs text-gray-400 mt-1">
                마지막 수정: {new Date(workerKeyUpdated).toLocaleString("ko-KR")}
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="password"
            value={workerKey}
            onChange={(e) => setWorkerKey(e.target.value)}
            placeholder="sk-ant-api03-... (별도 키를 쓰려면 입력)"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
          <button
            onClick={async () => {
              if (!workerKey.trim()) return;
              setSavingWorker(true);
              setWorkerSaveResult(null);
              try {
                const res = await fetch("/api/settings", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ key: "anthropic_worker_key", value: workerKey.trim() }),
                });
                const data = await res.json();
                if (data.ok) {
                  setWorkerSaveResult({ ok: true, message: "워커용 키 저장 완료" });
                  setWorkerKey("");
                  loadSettings();
                } else {
                  setWorkerSaveResult({ ok: false, message: data.error || "저장 실패" });
                }
              } catch (e) {
                setWorkerSaveResult({ ok: false, message: "서버 오류: " + String(e) });
              }
              setSavingWorker(false);
            }}
            disabled={savingWorker || !workerKey.trim()}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
          >
            {savingWorker ? "저장 중..." : "워커 키 저장"}
          </button>
        </div>

        {workerSaveResult && (
          <p className={`mt-2 text-xs ${workerSaveResult.ok ? "text-green-600" : "text-red-600"}`}>
            {workerSaveResult.message}
          </p>
        )}

        <div className="mt-4 p-3 bg-blue-50 rounded-md">
          <p className="text-xs text-blue-700 font-medium mb-1">
            워커 AI 진단 흐름
          </p>
          <ul className="text-xs text-blue-600 space-y-0.5">
            <li>1. 워커 GUI에서 "시작" 클릭 → 에러 발생</li>
            <li>2. ModuleNotFoundError → 파일 강제 재다운로드 → 재시도</li>
            <li>3. 재시도도 실패 → Station AI에 에러 + 환경정보 전송</li>
            <li>4. AI가 수정 명령 반환 → 자동 실행</li>
          </ul>
        </div>
      </div>

      {/* AI 크롤링 회피 분석 */}
      <AiEvasionSection />

      {/* 헬스체크 스케줄 */}
      <HealthCheckScheduleSection />
    </div>
  );
}

function HealthCheckScheduleSection() {
  const [hours, setHours] = useState<number[]>([9]);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<Record<string, unknown> | null>(null);
  const [lastResult, setLastResult] = useState<Record<string, unknown> | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [schedRes, resultRes] = await Promise.all([
          fetch("/api/settings?key=health_check_hours"),
          fetch("/api/settings?key=health_check_result"),
        ]);
        const schedData = await schedRes.json();
        const resultData = await resultRes.json();
        if (schedData.value) setHours(JSON.parse(schedData.value));
        if (resultData.value) setLastResult(JSON.parse(resultData.value));
      } catch {}
      setLoaded(true);
    })();
  }, []);

  function toggleHour(h: number) {
    setHours((prev) =>
      prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h].sort((a, b) => a - b)
    );
  }

  async function saveSchedule() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "health_check_hours", value: JSON.stringify(hours) }),
      });
      const data = await res.json();
      setSaveMsg({ ok: data.ok, text: data.ok ? "저장 완료" : data.error || "저장 실패" });
    } catch (e) {
      setSaveMsg({ ok: false, text: String(e) });
    }
    setSaving(false);
  }

  async function runNow() {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch("/api/cron/health-check");
      const data = await res.json();
      setRunResult(data);
      // 결과 갱신
      const resultRes = await fetch("/api/settings?key=health_check_result");
      const resultData = await resultRes.json();
      if (resultData.value) setLastResult(JSON.parse(resultData.value));
    } catch (e) {
      setRunResult({ error: String(e) });
    }
    setRunning(false);
  }

  // 다음 실행 시간 계산 (KST 기준)
  function nextRunLabel() {
    if (hours.length === 0) return "비활성";
    const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const kstHour = nowKst.getUTCHours();
    const future = hours.find((h) => h > kstHour) ?? hours[0];
    const diff = future > kstHour ? future - kstHour : 24 - kstHour + future;
    return `KST ${future}시 (약 ${diff}시간 후)`;
  }

  const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 mt-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-gray-900">헬스체크 스케줄</h3>
        <button
          onClick={runNow}
          disabled={running}
          className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {running ? "실행 중..." : "지금 실행"}
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        핸들러별 테스트 크롤링을 자동 실행합니다. 실행할 KST 시각을 선택하세요 (여러 개 선택 가능).
      </p>

      {/* 시각 선택 */}
      {loaded && (
        <div className="mb-4">
          <div className="grid grid-cols-12 gap-1 mb-3">
            {ALL_HOURS.map((h) => (
              <button
                key={h}
                onClick={() => toggleHour(h)}
                className={`py-1.5 text-xs rounded font-mono transition-colors ${
                  hours.includes(h)
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {h}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              선택된 시각: {hours.length > 0 ? hours.map((h) => `${h}시`).join(", ") : "없음 (비활성)"}
            </span>
            <button
              onClick={saveSchedule}
              disabled={saving}
              className="px-3 py-1.5 text-xs bg-gray-800 text-white rounded-md hover:bg-gray-900 disabled:opacity-50"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
          {saveMsg && (
            <p className={`mt-1.5 text-xs ${saveMsg.ok ? "text-green-600" : "text-red-600"}`}>
              {saveMsg.text}
            </p>
          )}
        </div>
      )}

      {/* 다음 실행 */}
      <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-md mb-4 text-xs text-gray-600">
        <span className="font-medium">다음 실행:</span>
        <span>{nextRunLabel()}</span>
      </div>

      {/* 즉시 실행 결과 */}
      {runResult && (
        <div className={`p-3 rounded-md mb-4 text-xs ${
          runResult.skipped ? "bg-yellow-50 text-yellow-700" :
          runResult.ok ? "bg-green-50 text-green-700" :
          "bg-red-50 text-red-700"
        }`}>
          <div className="font-bold mb-1">
            {runResult.skipped ? "건너뜀" : runResult.ok ? "전체 통과" : "일부 실패"}
          </div>
          <div>{String(runResult.message || "")}</div>
          {Array.isArray(runResult.results) && (runResult.results as Record<string, unknown>[]).map((r, i) => (
            <div key={i} className="mt-1">
              {r.ok ? "✓" : "✕"} {String(r.type)} — {r.ok ? `${r.resultCount}개` : String(r.error)}
            </div>
          ))}
        </div>
      )}

      {/* 마지막 헬스체크 결과 */}
      {lastResult && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 mb-2">
            마지막 결과 — {new Date(String(lastResult.timestamp)).toLocaleString("ko-KR")}
          </h4>
          <div className="space-y-1">
            {(lastResult.results as Record<string, unknown>[] || []).map((r, i) => (
              <div key={i} className={`flex items-center gap-2 text-xs p-2 rounded ${
                r.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
              }`}>
                <span>{r.ok ? "✓" : "✕"}</span>
                <span className="font-mono font-medium">{String(r.type)}</span>
                <span className="text-gray-500">{String(r.keyword)}</span>
                <span className="ml-auto">
                  {r.ok ? `${r.resultCount}개 · ${Math.round(Number(r.elapsedMs) / 1000)}초` : String(r.error)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AiEvasionSection() {
  const [model, setModel] = useState("haiku");
  const [autoAdjust, setAutoAdjust] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [lastResult, setLastResult] = useState<Record<string, unknown> | null>(null);
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);
  const [savingModel, setSavingModel] = useState(false);

  useEffect(() => {
    // 설정 로드
    (async () => {
      try {
        const [modelRes, autoRes] = await Promise.all([
          fetch("/api/settings?key=ai_evasion_model"),
          fetch("/api/settings?key=ai_auto_adjust"),
        ]);
        const modelData = await modelRes.json();
        const autoData = await autoRes.json();
        if (modelData.value) setModel(modelData.value);
        if (autoData.value !== undefined) setAutoAdjust(autoData.value !== "false");
      } catch {}
      // 최근 분석 로그
      loadLogs();
    })();
  }, []);

  async function loadLogs() {
    try {
      const { supabase } = await import("@/lib/supabase");
      const { data } = await supabase
        .from("ai_analysis_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      setLogs((data || []) as Record<string, unknown>[]);
    } catch {}
  }

  async function saveModelSetting(newModel: string) {
    setModel(newModel);
    setSavingModel(true);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "ai_evasion_model", value: newModel }),
    });
    setSavingModel(false);
  }

  async function toggleAutoAdjust() {
    const newVal = !autoAdjust;
    setAutoAdjust(newVal);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "ai_auto_adjust", value: String(newVal) }),
    });
  }

  async function runAnalysis() {
    setAnalyzing(true);
    setLastResult(null);
    try {
      const res = await fetch("/api/ai/analyze", { method: "POST" });
      const data = await res.json();
      setLastResult(data);
      loadLogs();
    } catch (e) {
      setLastResult({ error: String(e) });
    }
    setAnalyzing(false);
  }

  const MODELS = [
    { id: "haiku", label: "Haiku", desc: "빠름/저렴 — 일상 분석용" },
    { id: "sonnet", label: "Sonnet", desc: "균형 — 차단 발생 시 에스컬레이션" },
    { id: "opus", label: "Opus", desc: "최고 성능 — 복잡한 패턴 분석" },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 mt-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-gray-900">AI 크롤링 회피 분석</h3>
        <button
          onClick={runAnalysis}
          disabled={analyzing}
          className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
        >
          {analyzing ? "분석 중..." : "지금 분석 실행"}
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        워커 크롤링 메타데이터를 AI가 분석하여 차단 회피 전략을 자동 조정합니다.
      </p>

      {/* 모델 선택 */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {MODELS.map((m) => (
          <button
            key={m.id}
            onClick={() => saveModelSetting(m.id)}
            disabled={savingModel}
            className={`p-3 rounded-md border text-left transition-colors ${
              model === m.id
                ? "border-purple-500 bg-purple-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className="text-sm font-medium">{m.label}</div>
            <div className="text-xs text-gray-500">{m.desc}</div>
          </button>
        ))}
      </div>

      {/* 자동 조정 토글 */}
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md mb-4">
        <div>
          <div className="text-sm font-medium">자동 config 조정</div>
          <div className="text-xs text-gray-500">
            AI 분석 결과에 따라 딜레이/배치/decoy 비율을 자동 변경
          </div>
        </div>
        <button
          onClick={toggleAutoAdjust}
          className={`px-3 py-1 text-xs rounded-full font-medium ${
            autoAdjust
              ? "bg-green-100 text-green-700"
              : "bg-gray-200 text-gray-500"
          }`}
        >
          {autoAdjust ? "ON" : "OFF"}
        </button>
      </div>

      {/* 즉시 분석 결과 */}
      {lastResult && (
        <div className={`p-3 rounded-md mb-4 text-xs ${
          lastResult.error ? "bg-red-50 text-red-700" :
          lastResult.status === "critical" ? "bg-red-50 text-red-700" :
          lastResult.status === "high" ? "bg-orange-50 text-orange-700" :
          "bg-green-50 text-green-700"
        }`}>
          <div className="font-bold mb-1">
            {lastResult.error ? "오류" : `위험도: ${lastResult.status} | 모델: ${lastResult.model}`}
          </div>
          <div>{String(lastResult.analysis || lastResult.error || lastResult.message || "")}</div>
          {(lastResult.recommendations as string[] || []).length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {(lastResult.recommendations as string[]).map((r, i) => (
                <li key={i}>- {r}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 최근 분석 로그 */}
      {logs.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 mb-2">최근 분석 ({logs.length})</h4>
          <div className="space-y-1">
            {logs.map((log, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-gray-600 py-1 border-b border-gray-100">
                <span className={`px-1.5 py-0.5 rounded text-xs ${
                  log.model === "skip" ? "bg-gray-100" : "bg-purple-50 text-purple-700"
                }`}>
                  {String(log.model)}
                </span>
                <span className="text-gray-400">{String(log.trigger_reason)}</span>
                <span className="flex-1 truncate">{String(log.analysis || "").slice(0, 80)}</span>
                <span className="text-gray-400 shrink-0">
                  {new Date(String(log.created_at)).toLocaleString("ko", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
