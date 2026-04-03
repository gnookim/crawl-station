"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { WorkerRelease } from "@/types";

const WORKER_FILES = [
  "worker.py",
  "handlers/__init__.py",
  "handlers/base.py",
  "handlers/blog.py",
  "handlers/serp.py",
  "handlers/kin.py",
  "handlers/area.py",
  "handlers/deep.py",
  "handlers/rank.py",
  "supabase_rest.py",
];

export default function ReleasesPage() {
  const [releases, setReleases] = useState<WorkerRelease[]>([]);
  const [workers, setWorkers] = useState<
    { id: string; name: string | null; version: string }[]
  >([]);
  const [showForm, setShowForm] = useState(false);
  const [version, setVersion] = useState("");
  const [changelog, setChangelog] = useState("");
  const [files, setFiles] = useState<Record<string, string>>({});
  const [publishing, setPublishing] = useState(false);
  const [fetchingGithub, setFetchingGithub] = useState(false);
  const [expandedRelease, setExpandedRelease] = useState<string | null>(null);
  const [activeFileTab, setActiveFileTab] = useState<string>(WORKER_FILES[0]);

  const loadData = useCallback(async () => {
    const [relRes, wkRes] = await Promise.all([
      supabase
        .from("worker_releases")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("workers")
        .select("id, name, version"),
    ]);
    setReleases((relRes.data || []) as WorkerRelease[]);
    setWorkers(wkRes.data || []);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function fetchFromGithub() {
    setFetchingGithub(true);
    try {
      const res = await fetch("/api/releases/github", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        alert(`GitHub 가져오기 실패: ${data.error}`);
        return;
      }
      setFiles(data.files);
      if (data.version) setVersion(data.version);
      setShowForm(true);
    } finally {
      setFetchingGithub(false);
    }
  }

  function handleFileContent(filePath: string, content: string) {
    setFiles((prev) => ({ ...prev, [filePath]: content }));
  }

  function removeFile(filePath: string) {
    setFiles((prev) => {
      const next = { ...prev };
      delete next[filePath];
      return next;
    });
  }

  async function publish() {
    if (!version.trim()) return alert("버전을 입력해주세요");
    if (Object.keys(files).length === 0)
      return alert("최소 1개 이상의 파일을 추가해주세요");

    setPublishing(true);
    try {
      const res = await fetch("/api/releases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: version.trim(), changelog, files }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`릴리즈 실패: ${data.error}`);
        return;
      }
      alert(
        `v${version} 릴리즈 완료! 대기 중인 워커 ${data.outdated_workers}대가 자동 업데이트됩니다.`
      );
      setShowForm(false);
      setVersion("");
      setChangelog("");
      setFiles({});
      loadData();
    } finally {
      setPublishing(false);
    }
  }

  const latestVersion = releases.find((r) => r.is_latest)?.version;
  const outdatedWorkers = workers.filter(
    (w) => latestVersion && w.version !== latestVersion
  );

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">릴리즈 관리</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            워커 코드를 배포하면 활성 워커들이 자동으로 업데이트됩니다
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchFromGithub}
            disabled={fetchingGithub}
            className="px-3 py-1.5 text-sm bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors disabled:opacity-50"
          >
            {fetchingGithub ? "가져오는 중..." : "GitHub에서 가져오기"}
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            + 직접 입력
          </button>
        </div>
      </div>

      {/* 워커 업데이트 현황 */}
      {latestVersion && outdatedWorkers.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-semibold text-yellow-800 mb-2">
            업데이트 대기 중인 워커 ({outdatedWorkers.length}대)
          </h3>
          <div className="flex flex-wrap gap-2">
            {outdatedWorkers.map((w) => (
              <span
                key={w.id}
                className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs"
              >
                {w.name || w.id}
                <span className="text-yellow-500 font-mono">
                  v{w.version} → v{latestVersion}
                </span>
              </span>
            ))}
          </div>
          <p className="text-xs text-yellow-600 mt-2">
            워커는 30초 이내 또는 배치 완료 후 자동으로 업데이트됩니다.
          </p>
        </div>
      )}

      {/* 새 릴리즈 폼 */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">새 릴리즈 배포</h3>
            {Object.keys(files).length > 0 && (
              <span className="text-xs text-green-600">
                {Object.keys(files).length}개 파일 로드됨
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                버전 *
              </label>
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="0.3.0"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                변경 내역
              </label>
              <input
                type="text"
                value={changelog}
                onChange={(e) => setChangelog(e.target.value)}
                placeholder="블로그 핸들러 개선, 에러 처리 보강"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* 파일 탭 에디터 */}
          <div className="mb-4">
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex border-b border-gray-200 bg-gray-50 overflow-x-auto">
                {WORKER_FILES.map((fp) => (
                  <button
                    key={fp}
                    onClick={() => setActiveFileTab(fp)}
                    className={`px-3 py-1.5 text-xs whitespace-nowrap border-r border-gray-200 transition-colors ${
                      activeFileTab === fp
                        ? "bg-white text-blue-700 font-medium"
                        : "text-gray-500 hover:bg-gray-100"
                    } ${files[fp] ? "!text-green-700" : ""}`}
                  >
                    {fp.split("/").pop()}
                    {files[fp] && (
                      <span className="ml-1 text-green-500">●</span>
                    )}
                  </button>
                ))}
              </div>
              <textarea
                value={files[activeFileTab] || ""}
                onChange={(e) =>
                  handleFileContent(activeFileTab, e.target.value)
                }
                placeholder={`${activeFileTab} — GitHub에서 가져오기 또는 직접 입력`}
                className="w-full h-64 px-3 py-2 text-xs font-mono resize-y focus:outline-none"
                spellCheck={false}
              />
            </div>
            {Object.keys(files).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {Object.keys(files).map((fp) => (
                  <span
                    key={fp}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 rounded text-xs"
                  >
                    {fp}
                    <button
                      onClick={() => removeFile(fp)}
                      className="text-green-400 hover:text-red-500 ml-0.5"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={publish}
              disabled={publishing}
              className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {publishing ? "배포 중..." : "릴리즈 배포"}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setFiles({});
                setVersion("");
                setChangelog("");
              }}
              className="px-4 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50 transition-colors"
            >
              취소
            </button>
          </div>

          <div className="mt-3 p-3 bg-blue-50 rounded-md">
            <p className="text-xs text-blue-700">
              <strong>배포 흐름:</strong> GitHub에서 가져오기 → 버전/변경내역 입력 → 릴리즈 배포 → 워커 30초 내 자동 업데이트 + 재시작
            </p>
          </div>
        </div>
      )}

      {/* 릴리즈 히스토리 */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700">
            릴리즈 히스토리
          </h3>
        </div>
        {releases.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            아직 릴리즈가 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {releases.map((r) => (
              <div key={r.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono text-sm font-semibold ${
                        r.is_latest ? "text-green-700" : "text-gray-500"
                      }`}
                    >
                      v{r.version}
                    </span>
                    {r.is_latest && (
                      <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
                        latest
                      </span>
                    )}
                    {r.changelog && (
                      <span className="text-sm text-gray-500">
                        — {r.changelog}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">
                      {r.files
                        ? `${Object.keys(r.files).length}개 파일`
                        : ""}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(r.created_at).toLocaleString("ko")}
                    </span>
                    {r.files && Object.keys(r.files).length > 0 && (
                      <button
                        onClick={() =>
                          setExpandedRelease(
                            expandedRelease === r.id ? null : r.id
                          )
                        }
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        {expandedRelease === r.id ? "접기" : "파일 보기"}
                      </button>
                    )}
                  </div>
                </div>
                {expandedRelease === r.id && r.files && (
                  <div className="mt-3 border border-gray-200 rounded-md overflow-hidden">
                    {Object.entries(r.files).map(([fp, content]) => (
                      <details key={fp} className="border-b border-gray-100 last:border-0">
                        <summary className="px-3 py-1.5 text-xs font-mono text-gray-600 bg-gray-50 cursor-pointer hover:bg-gray-100">
                          {fp}{" "}
                          <span className="text-gray-400">
                            ({(content as string).split("\n").length}줄)
                          </span>
                        </summary>
                        <pre className="px-3 py-2 text-xs overflow-x-auto max-h-48 bg-gray-900 text-gray-100">
                          {content as string}
                        </pre>
                      </details>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
