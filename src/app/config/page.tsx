"use client";

import { useEffect, useState, useCallback } from "react";

interface WorkerConfig {
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

export default function ConfigPage() {
  const [config, setConfig] = useState<WorkerConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [workerConfigs, setWorkerConfigs] = useState<
    { id: string; proxy_url?: string; network_type?: string }[]
  >([]);
  const [workers, setWorkers] = useState<{ id: string; name: string | null }[]>(
    []
  );
  const [showWorkerProxy, setShowWorkerProxy] = useState(false);
  const [newWorkerProxy, setNewWorkerProxy] = useState({
    id: "",
    proxy_url: "",
    network_type: "wifi",
  });

  const loadConfig = useCallback(async () => {
    const res = await fetch("/api/config");
    const data = await res.json();
    setConfig(data.config);
  }, []);

  const loadWorkers = useCallback(async () => {
    const res = await fetch("/api/workers");
    const data = await res.json();
    setWorkers(
      (data.workers || []).map((w: { id: string; name: string | null }) => ({
        id: w.id,
        name: w.name,
      }))
    );
  }, []);

  useEffect(() => {
    loadConfig();
    loadWorkers();
  }, [loadConfig, loadWorkers]);

  async function saveConfig() {
    if (!config) return;
    setSaving(true);
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function saveWorkerProxy(workerId: string, proxyUrl: string, networkType: string) {
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: workerId,
        proxy_url: proxyUrl,
        network_type: networkType,
      }),
    });
  }

  if (!config) {
    return (
      <div className="p-6">
        <div className="text-gray-400 text-sm">로딩 중...</div>
      </div>
    );
  }

  const update = (key: string, value: unknown) => {
    setConfig({ ...config, [key]: value });
  };

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">워커 설정</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            모든 워커에 적용되는 글로벌 설정 (워커별 개별 설정도 가능)
          </p>
        </div>
        <button
          onClick={saveConfig}
          disabled={saving}
          className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
            saved
              ? "bg-green-600 text-white"
              : "bg-blue-600 text-white hover:bg-blue-700"
          } disabled:opacity-50`}
        >
          {saved ? "저장됨" : saving ? "저장 중..." : "설정 저장"}
        </button>
      </div>

      {/* 네트워크 / 프록시 */}
      <Section title="네트워크 / 프록시" desc="IP 차단 회피를 위한 프록시 및 네트워크 설정">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>프록시 URL (글로벌)</Label>
            <input
              type="text"
              value={config.proxy_url || ""}
              onChange={(e) => update("proxy_url", e.target.value)}
              placeholder="http://user:pass@host:port 또는 비워두면 직접 연결"
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
            <p className="text-xs text-gray-400 mt-1">
              비워두면 직접 연결 (테더링/WiFi)
            </p>
          </div>
          <div>
            <Label>네트워크 타입</Label>
            <select
              value={config.network_type || "wifi"}
              onChange={(e) => update("network_type", e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="wifi">WiFi (고정 IP)</option>
              <option value="tethering_skt">테더링 — SKT</option>
              <option value="tethering_kt">테더링 — KT</option>
              <option value="tethering_lgu">테더링 — LG U+</option>
              <option value="tethering_other">테더링 — 기타</option>
              <option value="proxy">프록시 사용</option>
            </select>
          </div>
        </div>

        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-700">
            <strong>IP 분산 전략:</strong> 각 워커를 다른 네트워크에 연결하면 IP가 분산됩니다.
            테더링 시 통신사를 다양화하면 IP 대역이 달라져 차단 위험이 줄어듭니다.
            프록시는 residential proxy를 권장합니다.
          </p>
        </div>

        {/* 워커별 프록시 설정 */}
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-700">
              워커별 개별 프록시
            </h4>
            <button
              onClick={() => setShowWorkerProxy(!showWorkerProxy)}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              {showWorkerProxy ? "닫기" : "+ 워커별 설정"}
            </button>
          </div>
          {showWorkerProxy && (
            <div className="mt-2 bg-gray-50 rounded-lg p-3 space-y-2">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label>워커</Label>
                  <select
                    value={newWorkerProxy.id}
                    onChange={(e) =>
                      setNewWorkerProxy({ ...newWorkerProxy, id: e.target.value })
                    }
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                  >
                    <option value="">워커 선택</option>
                    {workers.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name || w.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <Label>프록시 URL</Label>
                  <input
                    type="text"
                    value={newWorkerProxy.proxy_url}
                    onChange={(e) =>
                      setNewWorkerProxy({
                        ...newWorkerProxy,
                        proxy_url: e.target.value,
                      })
                    }
                    placeholder="http://host:port"
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <Label>네트워크</Label>
                  <select
                    value={newWorkerProxy.network_type}
                    onChange={(e) =>
                      setNewWorkerProxy({
                        ...newWorkerProxy,
                        network_type: e.target.value,
                      })
                    }
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                  >
                    <option value="wifi">WiFi</option>
                    <option value="tethering_skt">SKT</option>
                    <option value="tethering_kt">KT</option>
                    <option value="tethering_lgu">LG U+</option>
                    <option value="proxy">프록시</option>
                  </select>
                </div>
                <button
                  onClick={async () => {
                    if (!newWorkerProxy.id) return;
                    await saveWorkerProxy(
                      newWorkerProxy.id,
                      newWorkerProxy.proxy_url,
                      newWorkerProxy.network_type
                    );
                    setNewWorkerProxy({ id: "", proxy_url: "", network_type: "wifi" });
                    alert("저장됨");
                  }}
                  className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 shrink-0"
                >
                  저장
                </button>
              </div>
              <p className="text-xs text-gray-400">
                워커별 설정이 있으면 글로벌 설정보다 우선 적용됩니다.
              </p>
            </div>
          )}
        </div>
      </Section>

      {/* 크롤링 속도 */}
      <Section title="크롤링 속도" desc="키워드 간 딜레이, 배치 크기, 휴식 시간">
        <div className="grid grid-cols-2 gap-4">
          <NumberInput
            label="키워드 딜레이 (최소 초)"
            value={config.keyword_delay_min}
            onChange={(v) => update("keyword_delay_min", v)}
            min={5}
            max={120}
          />
          <NumberInput
            label="키워드 딜레이 (최대 초)"
            value={config.keyword_delay_max}
            onChange={(v) => update("keyword_delay_max", v)}
            min={10}
            max={300}
          />
          <NumberInput
            label="배치 크기 (N개 후 휴식)"
            value={config.batch_size}
            onChange={(v) => update("batch_size", v)}
            min={5}
            max={100}
          />
          <NumberInput
            label="배치 휴식 (초)"
            value={config.batch_rest_seconds}
            onChange={(v) => update("batch_rest_seconds", v)}
            min={30}
            max={600}
          />
        </div>
      </Section>

      {/* 사람 흉내 */}
      <Section title="사람 흉내 설정" desc="타이핑 속도, 스크롤, 오타 등 자연스러운 행동 패턴">
        <div className="grid grid-cols-2 gap-4">
          <NumberInput
            label="타이핑 속도 (최소 ms)"
            value={config.typing_speed_min}
            onChange={(v) => update("typing_speed_min", v)}
            min={30}
            max={300}
          />
          <NumberInput
            label="타이핑 속도 (최대 ms)"
            value={config.typing_speed_max}
            onChange={(v) => update("typing_speed_max", v)}
            min={60}
            max={500}
          />
          <div>
            <Label>오타 확률 ({Math.round((config.typo_probability || 0) * 100)}%)</Label>
            <input
              type="range"
              min={0}
              max={20}
              value={Math.round((config.typo_probability || 0) * 100)}
              onChange={(e) =>
                update("typo_probability", parseInt(e.target.value) / 100)
              }
              className="w-full"
            />
          </div>
          <div>
            <Label>
              되돌아보기 확률 ({Math.round((config.scroll_back_probability || 0) * 100)}%)
            </Label>
            <input
              type="range"
              min={0}
              max={80}
              value={Math.round((config.scroll_back_probability || 0) * 100)}
              onChange={(e) =>
                update("scroll_back_probability", parseInt(e.target.value) / 100)
              }
              className="w-full"
            />
          </div>
        </div>
      </Section>

      {/* 현재 값 요약 */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-500">
        <strong>현재 설정 요약:</strong> 키워드당 {config.keyword_delay_min}~
        {config.keyword_delay_max}초 딜레이, {config.batch_size}개 처리 후{" "}
        {config.batch_rest_seconds}초 휴식, 오타{" "}
        {Math.round((config.typo_probability || 0) * 100)}%
        {config.proxy_url
          ? `, 프록시: ${config.proxy_url.slice(0, 30)}...`
          : ", 직접 연결"}
      </div>
    </div>
  );
}

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
