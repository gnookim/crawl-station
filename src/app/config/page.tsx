"use client";

import { useEffect, useState, useCallback } from "react";
import type {
  NetworkType,
  TetheringCarrier,
  TetheringReconnectInterval,
} from "@/types";

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
}

interface WorkerNetConfig {
  network_type: NetworkType;
  proxy_url: string;
  proxy_rotate: boolean;
  tethering_carrier: TetheringCarrier;
  tethering_auto_reconnect: boolean;
  tethering_reconnect_interval: TetheringReconnectInterval;
}

interface WorkerInfo {
  id: string;
  name: string | null;
  status: string;
  ip_address: string | null;
}

const NETWORK_LABELS: Record<NetworkType, string> = {
  wifi: "자체 IP (WiFi/LAN)",
  tethering: "모바일 테더링",
  proxy_static: "프록시 (고정 IP)",
  proxy_rotate: "프록시 (회전 IP)",
};

const CARRIER_LABELS: Record<TetheringCarrier, string> = {
  skt: "SKT",
  kt: "KT",
  lgu: "LG U+",
  other: "기타",
};

const RECONNECT_LABELS: Record<TetheringReconnectInterval, string> = {
  per_batch: "배치마다",
  "3min": "3분마다",
  "5min": "5분마다",
  "10min": "10분마다",
};

const DEFAULT_NET_CONFIG: WorkerNetConfig = {
  network_type: "wifi",
  proxy_url: "",
  proxy_rotate: false,
  tethering_carrier: "skt",
  tethering_auto_reconnect: false,
  tethering_reconnect_interval: "per_batch",
};

/* ── page component ── */

export default function ConfigPage() {
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig | null>(null);
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [workerConfigs, setWorkerConfigs] = useState<
    Record<string, WorkerNetConfig>
  >({});
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [savedGlobal, setSavedGlobal] = useState(false);
  const [savingWorkers, setSavingWorkers] = useState<Record<string, boolean>>(
    {}
  );
  const [savedWorkers, setSavedWorkers] = useState<Record<string, boolean>>({});

  /* ── data loading ── */

  const loadGlobal = useCallback(async () => {
    const res = await fetch("/api/config");
    const data = await res.json();
    setGlobalConfig(data.config);
  }, []);

  const loadWorkers = useCallback(async () => {
    const res = await fetch("/api/workers");
    const data = await res.json();
    const list: WorkerInfo[] = (data.workers || []).map(
      (w: WorkerInfo) => ({
        id: w.id,
        name: w.name,
        status: w.status,
        ip_address: w.ip_address,
      })
    );
    setWorkers(list);

    // load per-worker configs in parallel
    const entries = await Promise.all(
      list.map(async (w) => {
        try {
          const r = await fetch(`/api/config?id=${w.id}`);
          if (!r.ok) return [w.id, { ...DEFAULT_NET_CONFIG }] as const;
          const d = await r.json();
          const c = d.config;
          return [
            w.id,
            {
              network_type: c.network_type || "wifi",
              proxy_url: c.proxy_url || "",
              proxy_rotate: c.proxy_rotate || false,
              tethering_carrier: c.tethering_carrier || "skt",
              tethering_auto_reconnect: c.tethering_auto_reconnect || false,
              tethering_reconnect_interval:
                c.tethering_reconnect_interval || "per_batch",
            } satisfies WorkerNetConfig,
          ] as const;
        } catch {
          return [w.id, { ...DEFAULT_NET_CONFIG }] as const;
        }
      })
    );
    setWorkerConfigs(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    loadGlobal();
    loadWorkers();
  }, [loadGlobal, loadWorkers]);

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

  async function saveWorkerConfig(workerId: string) {
    const cfg = workerConfigs[workerId];
    if (!cfg) return;
    setSavingWorkers((p) => ({ ...p, [workerId]: true }));
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: workerId, ...cfg }),
    });
    setSavingWorkers((p) => ({ ...p, [workerId]: false }));
    setSavedWorkers((p) => ({ ...p, [workerId]: true }));
    setTimeout(
      () => setSavedWorkers((p) => ({ ...p, [workerId]: false })),
      2000
    );
  }

  /* ── worker config updater ── */

  function updateWorkerNet(
    workerId: string,
    key: keyof WorkerNetConfig,
    value: unknown
  ) {
    setWorkerConfigs((prev) => ({
      ...prev,
      [workerId]: { ...(prev[workerId] || DEFAULT_NET_CONFIG), [key]: value },
    }));
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
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h2 className="text-xl font-bold">워커 설정</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          워커별 네트워크 설정 + 글로벌 크롤링 설정
        </p>
      </div>

      {/* ═══════ 워커별 네트워크 설정 ═══════ */}
      <Section
        title="워커 네트워크 설정"
        desc="각 워커의 네트워크 유형과 프록시를 개별 설정합니다. IP 분산을 위해 워커마다 다른 네트워크를 사용하세요."
      >
        {workers.length === 0 ? (
          <p className="text-sm text-gray-400">
            등록된 워커가 없습니다. 워커를 먼저 설치하세요.
          </p>
        ) : (
          <div className="space-y-4">
            {workers.map((w) => {
              const cfg = workerConfigs[w.id] || DEFAULT_NET_CONFIG;
              const isSaving = savingWorkers[w.id];
              const isSaved = savedWorkers[w.id];

              return (
                <div
                  key={w.id}
                  className="border border-gray-200 rounded-lg p-4 bg-white"
                >
                  {/* worker header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          w.status === "online" || w.status === "idle" || w.status === "crawling"
                            ? "bg-green-500"
                            : "bg-gray-300"
                        }`}
                      />
                      <span className="text-sm font-semibold text-gray-800">
                        {w.name || w.id}
                      </span>
                      {w.ip_address && (
                        <span className="text-xs text-gray-400 font-mono">
                          {w.ip_address}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => saveWorkerConfig(w.id)}
                      disabled={isSaving}
                      className={`px-3 py-1 text-xs rounded-md transition-colors ${
                        isSaved
                          ? "bg-green-600 text-white"
                          : "bg-blue-600 text-white hover:bg-blue-700"
                      } disabled:opacity-50`}
                    >
                      {isSaved ? "저장됨" : isSaving ? "저장 중..." : "저장"}
                    </button>
                  </div>

                  {/* network type selector */}
                  <div className="mb-3">
                    <Label>네트워크 유형</Label>
                    <div className="flex gap-2 flex-wrap">
                      {(
                        Object.entries(NETWORK_LABELS) as [
                          NetworkType,
                          string,
                        ][]
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          onClick={() =>
                            updateWorkerNet(w.id, "network_type", value)
                          }
                          className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                            cfg.network_type === value
                              ? "border-blue-500 bg-blue-50 text-blue-700 font-semibold"
                              : "border-gray-200 text-gray-600 hover:border-gray-300"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* sub-settings based on network type */}
                  {cfg.network_type === "tethering" && (
                    <div className="bg-gray-50 rounded-md p-3 space-y-3">
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <Label>통신사</Label>
                          <select
                            value={cfg.tethering_carrier}
                            onChange={(e) =>
                              updateWorkerNet(
                                w.id,
                                "tethering_carrier",
                                e.target.value
                              )
                            }
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {(
                              Object.entries(CARRIER_LABELS) as [
                                TetheringCarrier,
                                string,
                              ][]
                            ).map(([v, l]) => (
                              <option key={v} value={v}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <Label>자동 IP 변경</Label>
                          <button
                            onClick={() =>
                              updateWorkerNet(
                                w.id,
                                "tethering_auto_reconnect",
                                !cfg.tethering_auto_reconnect
                              )
                            }
                            className={`w-full px-2 py-1.5 text-sm rounded-md border transition-colors ${
                              cfg.tethering_auto_reconnect
                                ? "border-green-500 bg-green-50 text-green-700"
                                : "border-gray-300 text-gray-500"
                            }`}
                          >
                            {cfg.tethering_auto_reconnect ? "ON" : "OFF"}
                          </button>
                        </div>
                        <div>
                          <Label>변경 주기</Label>
                          <select
                            value={cfg.tethering_reconnect_interval}
                            onChange={(e) =>
                              updateWorkerNet(
                                w.id,
                                "tethering_reconnect_interval",
                                e.target.value
                              )
                            }
                            disabled={!cfg.tethering_auto_reconnect}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
                          >
                            {(
                              Object.entries(RECONNECT_LABELS) as [
                                TetheringReconnectInterval,
                                string,
                              ][]
                            ).map(([v, l]) => (
                              <option key={v} value={v}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <p className="text-xs text-gray-400">
                        테더링 시 비행기모드 ON/OFF로 IP를 변경합니다. 통신사마다
                        IP 대역이 달라 분산 효과가 있습니다.
                      </p>
                    </div>
                  )}

                  {cfg.network_type === "proxy_static" && (
                    <div className="bg-gray-50 rounded-md p-3">
                      <Label>프록시 URL</Label>
                      <input
                        type="text"
                        value={cfg.proxy_url}
                        onChange={(e) =>
                          updateWorkerNet(w.id, "proxy_url", e.target.value)
                        }
                        placeholder="http://user:pass@host:port"
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        고정 IP 프록시 — 항상 같은 IP로 요청합니다.
                      </p>
                    </div>
                  )}

                  {cfg.network_type === "proxy_rotate" && (
                    <div className="bg-gray-50 rounded-md p-3 space-y-2">
                      <div>
                        <Label>프록시 URL</Label>
                        <input
                          type="text"
                          value={cfg.proxy_url}
                          onChange={(e) =>
                            updateWorkerNet(w.id, "proxy_url", e.target.value)
                          }
                          placeholder="http://user:pass@host:port"
                          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                        />
                      </div>
                      <p className="text-xs text-gray-400">
                        회전 프록시 — 요청마다 또는 일정 주기로 IP가 변경됩니다.
                        Residential proxy 서비스 권장.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-700">
            <strong>IP 분산 전략:</strong> 각 워커를 다른 네트워크에 연결하면
            IP가 분산됩니다. 테더링 시 통신사를 다양화하면 IP 대역이 달라져 차단
            위험이 줄어듭니다. 프록시는 residential proxy를 권장합니다.
          </p>
        </div>
      </Section>

      {/* ═══════ 글로벌 크롤링 설정 ═══════ */}
      <div className="flex items-center justify-between mb-4 mt-10">
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
        <div className="grid grid-cols-2 gap-4">
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

      {/* 사람 흉내 */}
      <Section
        title="사람 흉내 설정"
        desc="타이핑 속도, 스크롤, 오타 등 자연스러운 행동 패턴"
      >
        <div className="grid grid-cols-2 gap-4">
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
        {Math.round((globalConfig.typo_probability || 0) * 100)}%
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
