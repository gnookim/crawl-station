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
            <li>5. "진단" 버튼으로 수동 트리거 가능</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
