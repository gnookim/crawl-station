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
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState(7); // 최근 N일

  const loadData = useCallback(async () => {
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - dateRange);

    // daily_rank 완료 결과 조회
    const { data } = await supabase
      .from("crawl_results")
      .select("keyword, data, created_at")
      .eq("type", "daily_rank")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(5000);

    if (!data) {
      setLoading(false);
      return;
    }

    // 파싱
    const parsed: RankEntry[] = [];
    const kwSet = new Set<string>();
    for (const row of data) {
      const d = row.data as Record<string, unknown>;
      if (!d) continue;
      const entry: RankEntry = {
        keyword: String(d.keyword || row.keyword),
        target_url: String(d.target_url || ""),
        tab: String(d.tab || "통합검색"),
        rank: (d.rank as number) || 0,
        date: row.created_at.slice(0, 10),
      };
      parsed.push(entry);
      kwSet.add(entry.keyword);
    }

    setEntries(parsed);
    const kws = Array.from(kwSet).sort();
    setKeywords(kws);
    if (!selectedKeyword && kws.length) setSelectedKeyword(kws[0]);
    setLoading(false);
  }, [dateRange, selectedKeyword]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 선택된 키워드의 URL별 날짜별 순위
  const filtered = entries.filter((e) => e.keyword === selectedKeyword);
  const urlSet = new Set(filtered.map((e) => e.target_url));
  const dates = Array.from(new Set(filtered.map((e) => e.date))).sort();

  // URL × 날짜 매트릭스
  const urlRanks: Record<string, Record<string, number>> = {};
  for (const url of urlSet) {
    urlRanks[url] = {};
    for (const e of filtered.filter((f) => f.target_url === url && f.tab === "통합검색")) {
      urlRanks[url][e.date] = e.rank;
    }
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">일일 순위 대시보드</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            등록된 URL의 날짜별 검색 순위 추적
          </p>
        </div>
        <div className="flex items-center gap-2">
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
      </div>

      {/* 키워드 선택 */}
      <div className="flex flex-wrap gap-1 mb-4">
        {keywords.map((kw) => (
          <button
            key={kw}
            onClick={() => setSelectedKeyword(kw)}
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

      {loading ? (
        <div className="text-sm text-gray-400 text-center py-8">로딩 중...</div>
      ) : !selectedKeyword || urlSet.size === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-400 text-sm">
          순위 데이터가 없습니다. daily_rank 작업을 실행하면 여기에 표시됩니다.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium sticky left-0 bg-gray-50 min-w-[200px]">URL</th>
                  {dates.map((d) => (
                    <th key={d} className="text-center px-2 py-2 font-medium whitespace-nowrap">
                      {d.slice(5)} {/* MM-DD */}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Array.from(urlSet).map((url) => (
                  <tr key={url} className="hover:bg-gray-50">
                    <td className="px-3 py-2 sticky left-0 bg-white">
                      <span className="truncate block max-w-[200px]" title={url}>
                        {url.replace(/https?:\/\//, "").slice(0, 40)}
                      </span>
                    </td>
                    {dates.map((d) => {
                      const rank = urlRanks[url]?.[d];
                      return (
                        <td key={d} className="text-center px-2 py-2">
                          {rank ? (
                            <span className={`font-bold ${
                              rank <= 3 ? "text-green-600" :
                              rank <= 10 ? "text-blue-600" :
                              rank <= 30 ? "text-orange-500" :
                              "text-gray-400"
                            }`}>
                              {rank}
                            </span>
                          ) : (
                            <span className="text-gray-200">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 범례 */}
          <div className="px-3 py-2 border-t border-gray-200 flex items-center gap-4 text-xs text-gray-500">
            <span><span className="font-bold text-green-600">1~3위</span> 상위노출</span>
            <span><span className="font-bold text-blue-600">4~10위</span> 첫 페이지</span>
            <span><span className="font-bold text-orange-500">11~30위</span> 2~3페이지</span>
            <span><span className="text-gray-400">-</span> 미발견</span>
          </div>
        </div>
      )}
    </div>
  );
}
