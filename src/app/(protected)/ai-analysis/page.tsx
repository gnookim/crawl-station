"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

type RiskLevel = "low" | "medium" | "high" | "critical" | "unknown" | string;
type ModelType = "haiku" | "sonnet" | "opus";

interface AnalysisLog {
  id: string;
  created_at: string;
  trigger_reason: string;
  model: string;
  risk_level: RiskLevel;
  analysis: string;
  adjustments: Record<string, unknown> | null;
  platform?: string | null;
}

const RISK_CONFIG: Record<string, { label: string; color: string }> = {
  low:      { label: "낮음",     color: "bg-green-100 text-green-700" },
  medium:   { label: "중간",     color: "bg-yellow-100 text-yellow-700" },
  high:     { label: "높음",     color: "bg-orange-100 text-orange-700" },
  critical: { label: "위험",     color: "bg-red-100 text-red-700" },
  unknown:  { label: "알 수 없음", color: "bg-gray-100 text-gray-500" },
  정상:     { label: "정상",     color: "bg-green-100 text-green-700" },
};

function getRiskConfig(level: string) {
  return RISK_CONFIG[level] ?? RISK_CONFIG["unknown"];
}

function triggerLabel(reason: string) {
  if (reason === "manual") return "수동";
  if (reason === "periodic") return "자동";
  return reason;
}

function adjustmentCount(adj: Record<string, unknown> | null): string {
  if (!adj) return "-";
  const keys = Object.keys(adj);
  if (keys.length === 0) return "없음";
  return `${keys.length}개 워커`;
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "방금";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`;
  return `${Math.floor(seconds / 86400)}일 전`;
}

function truncate(text: string, max = 80): string {
  if (!text) return "-";
  return text.length > max ? text.slice(0, max) + "…" : text;
}

const TAB_CONFIG = [
  {
    key: "blog",
    label: "블로그 / 네이버",
    modelKey: "ai_evasion_model",
    autoAdjustKey: "ai_auto_adjust",
    api: "/api/ai/analyze",
  },
  {
    key: "instagram",
    label: "Instagram",
    modelKey: "insta_ai_model",
    autoAdjustKey: "insta_ai_auto_adjust",
    api: "/api/ai/analyze-instagram",
  },
] as const;

type TabKey = typeof TAB_CONFIG[number]["key"];

export default function AIAnalysisPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("blog");
  const [logs, setLogs] = useState<AnalysisLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  // Per-tab settings state
  const [models, setModels] = useState<Record<TabKey, ModelType>>({ blog: "haiku", instagram: "haiku" });
  const [autoAdjust, setAutoAdjust] = useState<Record<TabKey, boolean>>({ blog: false, instagram: false });
  const [settingsLoading, setSettingsLoading] = useState(true);

  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const tabCfg = TAB_CONFIG.find((t) => t.key === activeTab)!;

  // Load settings for both tabs on mount
  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const results = await Promise.all(
        TAB_CONFIG.flatMap((tab) => [
          fetch(`/api/settings?key=${tab.modelKey}`).then((r) => r.json()),
          fetch(`/api/settings?key=${tab.autoAdjustKey}`).then((r) => r.json()),
        ])
      );
      // results: [blog_model, blog_auto, insta_model, insta_auto]
      const [blogModel, blogAuto, instaModel, instaAuto] = results;
      setModels({
        blog: (blogModel?.value as ModelType) || "haiku",
        instagram: (instaModel?.value as ModelType) || "haiku",
      });
      setAutoAdjust({
        blog: blogAuto?.value === "true",
        instagram: instaAuto?.value === "true",
      });
    } catch {}
    setSettingsLoading(false);
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Load logs when tab changes
  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      let query = supabase
        .from("ai_analysis_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (activeTab === "blog") {
        query = query.or("platform.is.null,platform.eq.blog");
      } else {
        query = query.eq("platform", "instagram");
      }

      const { data, error } = await query;
      if (!error && data) {
        setLogs(data as AnalysisLog[]);
      }
    } catch {}
    setLogsLoading(false);
  }, [activeTab]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  async function saveModel(tab: TabKey, model: ModelType) {
    const cfg = TAB_CONFIG.find((t) => t.key === tab)!;
    setModels((prev) => ({ ...prev, [tab]: model }));
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: cfg.modelKey, value: model }),
    });
  }

  async function saveAutoAdjust(tab: TabKey, value: boolean) {
    const cfg = TAB_CONFIG.find((t) => t.key === tab)!;
    setAutoAdjust((prev) => ({ ...prev, [tab]: value }));
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: cfg.autoAdjustKey, value: String(value) }),
    });
  }

  async function runAnalysis() {
    setRunning(true);
    setRunError(null);
    try {
      const res = await fetch(tabCfg.api, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRunError(data.error || `HTTP ${res.status}`);
      } else {
        await loadLogs();
      }
    } catch (e) {
      setRunError(String(e));
    }
    setRunning(false);
  }

  const latestLog = logs[0] ?? null;
  const riskCfg = latestLog ? getRiskConfig(latestLog.risk_level) : null;

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold">AI 회피 분석</h2>
        <p className="text-xs text-gray-400 mt-0.5">AI 모델 기반 크롤링 탐지 회피 분석 및 자동 조정</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {TAB_CONFIG.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? "border-indigo-500 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Controls row */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Model selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 shrink-0">모델</span>
            <div className="flex rounded-md overflow-hidden border border-gray-200">
              {(["haiku", "sonnet", "opus"] as ModelType[]).map((m) => (
                <button
                  key={m}
                  disabled={settingsLoading}
                  onClick={() => saveModel(activeTab, m)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    models[activeTab] === m
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Auto-adjust toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">자동 조정</span>
            <button
              disabled={settingsLoading}
              onClick={() => saveAutoAdjust(activeTab, !autoAdjust[activeTab])}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                autoAdjust[activeTab] ? "bg-indigo-500" : "bg-gray-200"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  autoAdjust[activeTab] ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <span className="text-xs text-gray-400">{autoAdjust[activeTab] ? "켜짐" : "꺼짐"}</span>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Run button */}
          <button
            onClick={runAnalysis}
            disabled={running}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {running ? "분석 중..." : "지금 분석 실행"}
          </button>
        </div>

        {runError && (
          <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">
            분석 실패: {runError}
          </div>
        )}
      </div>

      {/* Latest analysis summary */}
      {latestLog && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-sm font-medium text-gray-700">최근 분석 결과</span>
            {riskCfg && (
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${riskCfg.color}`}>
                {riskCfg.label} ({latestLog.risk_level})
              </span>
            )}
            <span className="text-xs text-gray-400 ml-auto">{timeAgo(latestLog.created_at)}</span>
          </div>

          {latestLog.analysis && (
            <div className="text-sm text-gray-700 mb-3 whitespace-pre-wrap leading-relaxed">
              {latestLog.analysis}
            </div>
          )}

          {/* Recommendations (parse bullet lines starting with - or •) */}
          {latestLog.analysis && (() => {
            const lines = latestLog.analysis
              .split("\n")
              .map((l) => l.trim())
              .filter((l) => l.startsWith("-") || l.startsWith("•") || l.startsWith("*"));
            if (lines.length === 0) return null;
            return (
              <ul className="mt-2 space-y-1">
                {lines.map((line, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-sm text-gray-600">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                    <span>{line.replace(/^[-•*]\s*/, "")}</span>
                  </li>
                ))}
              </ul>
            );
          })()}
        </div>
      )}

      {/* Log table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">최근 분석 로그</span>
          <button
            onClick={loadLogs}
            className="text-xs text-indigo-500 hover:text-indigo-700"
          >
            새로고침
          </button>
        </div>

        {logsLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">로딩 중...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">분석 로그가 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="text-left px-4 py-2 font-medium whitespace-nowrap">시각</th>
                  <th className="text-left px-4 py-2 font-medium whitespace-nowrap">트리거</th>
                  <th className="text-left px-4 py-2 font-medium whitespace-nowrap">모델</th>
                  <th className="text-left px-4 py-2 font-medium whitespace-nowrap">Risk</th>
                  <th className="text-left px-4 py-2 font-medium">분석 요약</th>
                  <th className="text-left px-4 py-2 font-medium whitespace-nowrap">적용된 조정</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => {
                  const rc = getRiskConfig(log.risk_level);
                  return (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-xs text-gray-400 whitespace-nowrap">
                        {timeAgo(log.created_at)}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600 whitespace-nowrap">
                        {triggerLabel(log.trigger_reason)}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600 whitespace-nowrap">
                        {log.model || "-"}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${rc.color}`}>
                          {rc.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600 max-w-xs">
                        <span title={log.analysis}>{truncate(log.analysis)}</span>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">
                        {adjustmentCount(log.adjustments)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
