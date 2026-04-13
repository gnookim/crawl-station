"use client";

import { useEffect, useState, useCallback } from "react";

/* ── local types (page-only) ── */

interface GlobalConfig {
  id: string;
  batch_size: number;
  batch_rest_seconds: number;
  keyword_delay_min: number;
  keyword_delay_max: number;
  typo_probability: number;
  scroll_back_probability: number;
  proxy_url: string;
  network_type: string;
  ua_pool: string[];
  typing_speed_min: number;
  typing_speed_max: number;
  scroll_min: number;
  scroll_max: number;
  rest_hours: number[];
}

/* ── page component ── */

export default function ConfigPage() {
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig | null>(null);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [savedGlobal, setSavedGlobal] = useState(false);

  /* ── data loading ── */

  const loadGlobal = useCallback(async () => {
    const res = await fetch("/api/config");
    const data = await res.json();
    setGlobalConfig(data.config);
  }, []);

  useEffect(() => {
    loadGlobal();
  }, [loadGlobal]);

  /* ── save helpers ── */

  async function saveGlobal() {
    if (!globalConfig) return;
    setSavingGlobal(true);
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(globalConfig),
    });
    setSavingGlobal(false);
    setSavedGlobal(true);
    setTimeout(() => setSavedGlobal(false), 2000);
  }

  /* ── global config updater ── */

  const updateGlobal = (key: string, value: unknown) => {
    if (!globalConfig) return;
    setGlobalConfig({ ...globalConfig, [key]: value });
  };

  /* ── loading state ── */

  if (!globalConfig) {
    return (
      <div className="p-6">
        <div className="text-gray-400 text-sm">로딩 중...</div>
      </div>
    );
  }

  /* ── render ── */

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold">크롤링 전략</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          글로벌 크롤링 딜레이 · 배치 설정 · 새벽 휴식
        </p>
      </div>

      <p className="text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded-md mb-4">워커별 네트워크·할당량·타입 설정은 <a href="/workers" className="underline">워커 관리</a> 페이지에서 관리합니다.</p>

      {/* ═══════ 글로벌 크롤링 설정 ═══════ */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-800">
            글로벌 크롤링 설정
          </h3>
          <p className="text-xs text-gray-400">
            모든 워커에 공통 적용되는 속도/행동 설정
          </p>
        </div>
        <button
          onClick={saveGlobal}
          disabled={savingGlobal}
          className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
            savedGlobal
              ? "bg-green-600 text-white"
              : "bg-blue-600 text-white hover:bg-blue-700"
          } disabled:opacity-50`}
        >
          {savedGlobal ? "저장됨" : savingGlobal ? "저장 중..." : "글로벌 설정 저장"}
        </button>
      </div>

      {/* 크롤링 속도 */}
      <Section title="크롤링 속도" desc="키워드 간 딜레이, 배치 크기, 휴식 시간">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NumberInput
            label="키워드 딜레이 (최소 초)"
            value={globalConfig.keyword_delay_min}
            onChange={(v) => updateGlobal("keyword_delay_min", v)}
            min={5}
            max={120}
          />
          <NumberInput
            label="키워드 딜레이 (최대 초)"
            value={globalConfig.keyword_delay_max}
            onChange={(v) => updateGlobal("keyword_delay_max", v)}
            min={10}
            max={300}
          />
          <NumberInput
            label="배치 크기 (N개 후 휴식)"
            value={globalConfig.batch_size}
            onChange={(v) => updateGlobal("batch_size", v)}
            min={5}
            max={100}
          />
          <NumberInput
            label="배치 휴식 (초)"
            value={globalConfig.batch_rest_seconds}
            onChange={(v) => updateGlobal("batch_rest_seconds", v)}
            min={30}
            max={600}
          />
        </div>
      </Section>

      {/* 새벽 휴식 */}
      <Section
        title="새벽 휴식"
        desc="활성화하면 지정한 시간대(KST)에 워커가 작업을 멈춥니다."
      >
        {/* 활성화 토글 */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => {
              const enabled = (globalConfig.rest_hours || []).length > 0;
              updateGlobal("rest_hours", enabled ? [] : [3, 4, 5]);
            }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              (globalConfig.rest_hours || []).length > 0
                ? "bg-indigo-600"
                : "bg-gray-200"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                (globalConfig.rest_hours || []).length > 0 ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span className="text-sm text-gray-700">
            {(globalConfig.rest_hours || []).length > 0 ? "활성화" : "비활성화 (24시간 운행)"}
          </span>
        </div>

        {/* 시간대 선택 — 활성화 시만 표시 */}
        {(globalConfig.rest_hours || []).length > 0 && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 24 }, (_, h) => {
                const active = (globalConfig.rest_hours || []).includes(h);
                return (
                  <button
                    key={h}
                    onClick={() => {
                      const current = globalConfig.rest_hours || [];
                      updateGlobal(
                        "rest_hours",
                        active ? current.filter((x) => x !== h) : [...current, h].sort((a, b) => a - b)
                      );
                    }}
                    className={`w-10 py-1 text-xs rounded border transition-colors ${
                      active
                        ? "bg-indigo-600 text-white border-indigo-600 font-medium"
                        : "bg-white text-gray-400 border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    {String(h).padStart(2, "0")}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-gray-400">
              휴식 시간대: {(globalConfig.rest_hours || []).map((h) => `${h}시`).join(", ")}
            </p>
          </>
        )}
      </Section>

      {/* 사람 흉내 */}
      <Section
        title="사람 흉내 설정"
        desc="타이핑 속도, 스크롤, 오타 등 자연스러운 행동 패턴"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NumberInput
            label="타이핑 속도 (최소 ms)"
            value={globalConfig.typing_speed_min}
            onChange={(v) => updateGlobal("typing_speed_min", v)}
            min={30}
            max={300}
          />
          <NumberInput
            label="타이핑 속도 (최대 ms)"
            value={globalConfig.typing_speed_max}
            onChange={(v) => updateGlobal("typing_speed_max", v)}
            min={60}
            max={500}
          />
          <div>
            <Label>
              오타 확률 (
              {Math.round((globalConfig.typo_probability || 0) * 100)}%)
            </Label>
            <input
              type="range"
              min={0}
              max={20}
              value={Math.round((globalConfig.typo_probability || 0) * 100)}
              onChange={(e) =>
                updateGlobal("typo_probability", parseInt(e.target.value) / 100)
              }
              className="w-full"
            />
          </div>
          <div>
            <Label>
              되돌아보기 확률 (
              {Math.round((globalConfig.scroll_back_probability || 0) * 100)}%)
            </Label>
            <input
              type="range"
              min={0}
              max={80}
              value={Math.round(
                (globalConfig.scroll_back_probability || 0) * 100
              )}
              onChange={(e) =>
                updateGlobal(
                  "scroll_back_probability",
                  parseInt(e.target.value) / 100
                )
              }
              className="w-full"
            />
          </div>
        </div>
      </Section>

      {/* 현재 값 요약 */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-500">
        <strong>현재 글로벌 설정 요약:</strong> 키워드당{" "}
        {globalConfig.keyword_delay_min}~{globalConfig.keyword_delay_max}초
        딜레이, {globalConfig.batch_size}개 처리 후{" "}
        {globalConfig.batch_rest_seconds}초 휴식, 오타{" "}
        {Math.round((globalConfig.typo_probability || 0) * 100)}%,{" "}
        {(globalConfig.rest_hours || []).length === 0
          ? "새벽 휴식 비활성화"
          : `새벽 휴식 ${(globalConfig.rest_hours || []).map((h) => `${h}시`).join("·")}`}
      </div>
    </div>
  );
}

/* ── shared sub-components ── */

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <h3 className="text-sm font-bold text-gray-800">{title}</h3>
      <p className="text-xs text-gray-400 mb-3">{desc}</p>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs text-gray-500 mb-1">{children}</label>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || min)}
        min={min}
        max={max}
        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
