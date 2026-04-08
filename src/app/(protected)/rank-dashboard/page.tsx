"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

interface RankEntry {
  keyword: string;
  target_url: string;
  tab: string;
  rank: number;
  date: string;
}

export default function RankDashboardPage() {
  const [entries, setEntries] = useState<RankEntry[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [selectedKeyword, setSelectedKeyword] = useState<string>("");
  const [selectedTab, setSelectedTab] = useState<string>("통합검색");
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState(7);

  const loadData = useCallback(async () => {
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - dateRange);

    const { data } = await supabase
      .from("crawl_requests")
      .select("keyword, result, completed_at")
      .eq("type", "daily_rank")
      .eq("status", "completed")
      .gte("completed_at", since.toISOString())
      .order("completed_at", { ascending: false })
      .limit(10000);

    if (!data) { setLoading(false); return; }

    const parsed: RankEntry[] = [];
    const kwSet = new Set<string>();

    for (const row of data) {
      if (!row.result) continue;
      let items: Record<string, unknown>[];
      try {
        items = typeof row.result === "string" ? JSON.parse(row.result) : row.result;
        if (!Array.isArray(items)) continue;
      } catch { continue; }

      const date = (row.completed_at || "").slice(0, 10);
      for (const item of items) {
        parsed.push({
          keyword: String(item.keyword || row.keyword),
          target_url: String(item.target_url || ""),
          tab: String(item.tab || "통합검색"),
          rank: Number(item.rank) || 0,
          date,
        });
        kwSet.add(String(item.keyword || row.keyword));
      }
    }

    setEntries(parsed);
    const kws = Array.from(kwSet).sort();
    setKeywords(kws);
    if (!selectedKeyword && kws.length) setSelectedKeyword(kws[0]);
    setLoading(false);
  }, [dateRange, selectedKeyword]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = entries.filter((e) => e.keyword === selectedKeyword && e.tab === selectedTab);
  const urlSet = new Set(filtered.map((e) => e.target_url));
  const dates = Array.from(new Set(filtered.map((e) => e.date))).sort();
  const tabs = Array.from(new Set(entries.filter((e) => e.keyword === selectedKeyword).map((e) => e.tab)));

  const urlRanks: Record<string, Record<string, number>> = {};
  for (const url of urlSet) {
    urlRanks[url] = {};
    for (const e of filtered.filter((f) => f.target_url === url)) {
      if (!urlRanks[url][e.date] || e.rank < urlRanks[url][e.date]) {
        urlRanks[url][e.date] = e.rank;
      }
    }
  }

  const rankColor = (r: number) =>
    r === 0 ? "text-gray-200" :
    r <= 3 ? "text-green-600 font-bold" :
    r <= 10 ? "text-blue-600 font-bold" :
    r <= 30 ? "text-orange-500" : "text-gray-400";

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">일일 순위 대시보드</h2>
          <p className="text-xs text-gray-400 mt-0.5">등록된 URL의 날짜별 검색 순위 추적</p>
        </div>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(parseInt(e.target.value))}
          className="px-2 py-1 text-xs border border-gray-300 rounded-md"
        >
          <option value={7}>최근 7일</option>
          <option value={14}>최근 14일</option>
          <option value={30}>최근 30일</option>
        </select>
      </div>

      {/* 키워드 탭 */}
      <div className="flex flex-wrap gap-1 mb-3">
        {keywords.map((kw) => (
          <button
            key={kw}
            onClick={() => { setSelectedKeyword(kw); setSelectedTab("통합검색"); }}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              selectedKeyword === kw
                ? "bg-blue-100 text-blue-700 font-medium"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {kw}
          </button>
        ))}
      </div>

      {/* 검색 탭 선택 */}
      {tabs.length > 1 && (
        <div className="flex gap-1 mb-4">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setSelectedTab(t)}
              className={`px-3 py-1 text-xs rounded border transition-colors ${
                selectedTab === t
                  ? "bg-gray-800 text-white border-gray-800"
                  : "border-gray-300 text-gray-500 hover:bg-gray-50"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-400 text-center py-8">로딩 중...</div>
      ) : !selectedKeyword || urlSet.size === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-400 text-sm">
          순위 데이터가 없습니다. 일일 순위 스케줄을 등록하고 실행하면 여기에 표시됩니다.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2.5 font-medium sticky left-0 bg-gray-50 min-w-[220px]">URL</th>
                  {dates.map((d) => (
                    <th key={d} className="text-center px-2 py-2.5 font-medium whitespace-nowrap">
                      {d.slice(5)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Array.from(urlSet).map((url) => (
                  <tr key={url} className="hover:bg-gray-50">
                    <td className="px-3 py-2 sticky left-0 bg-white border-r border-gray-100">
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate block max-w-[220px] text-blue-600 hover:underline"
                        title={url}
                      >
                        {url.replace(/https?:\/\//, "").slice(0, 45)}
                      </a>
                    </td>
                    {dates.map((d) => {
                      const rank = urlRanks[url]?.[d];
                      return (
                        <td key={d} className="text-center px-2 py-2">
                          <span className={rankColor(rank || 0)}>{rank || "-"}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-gray-200 flex items-center gap-4 text-xs text-gray-500">
            <span><span className="font-bold text-green-600">1~3위</span> 상위노출</span>
            <span><span className="font-bold text-blue-600">4~10위</span> 첫 페이지</span>
            <span><span className="text-orange-500">11~30위</span> 2~3페이지</span>
          </div>
        </div>
      )}
    </div>
  );
}
