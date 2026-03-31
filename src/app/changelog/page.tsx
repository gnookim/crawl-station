"use client";

import { useEffect, useState } from "react";

export default function ChangelogPage() {
  const [markdown, setMarkdown] = useState("");

  useEffect(() => {
    fetch("/api/docs?type=changelog")
      .then((r) => r.text())
      .then(setMarkdown);
  }, []);

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">업데이트 기록</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            CrawlStation 시스템 변경 이력
          </p>
        </div>
        <a
          href="/api/docs?type=changelog"
          download="CrawlStation-업데이트기록.md"
          className="px-3 py-1.5 text-xs bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors"
        >
          MD 다운로드
        </a>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <MarkdownRenderer content={markdown} />
      </div>
    </div>
  );
}

function MarkdownRenderer({ content }: { content: string }) {
  if (!content) {
    return (
      <div className="text-sm text-gray-400 text-center py-8">로딩 중...</div>
    );
  }

  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length > 0) {
      elements.push(
        <ul
          key={`list-${elements.length}`}
          className="space-y-1 mb-4 ml-4"
        >
          {listItems.map((item, i) => (
            <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
              <span className="text-blue-500 mt-1 shrink-0">-</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
      listItems = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <pre
            key={`code-${i}`}
            className="bg-gray-900 text-green-400 rounded-md p-3 text-xs font-mono mb-4 overflow-x-auto"
          >
            {codeLines.join("\n")}
          </pre>
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        flushList();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (line.startsWith("# ")) {
      flushList();
      elements.push(
        <h1 key={`h1-${i}`} className="text-2xl font-bold mb-4">
          {line.slice(2)}
        </h1>
      );
    } else if (line.startsWith("## ")) {
      flushList();
      elements.push(
        <h2
          key={`h2-${i}`}
          className="text-lg font-bold mt-8 mb-3 pb-2 border-b border-gray-200"
        >
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith("### ")) {
      flushList();
      elements.push(
        <h3 key={`h3-${i}`} className="text-sm font-bold mt-4 mb-2 text-blue-700">
          {line.slice(4)}
        </h3>
      );
    } else if (line.startsWith("- ")) {
      listItems.push(line.slice(2));
    } else if (line.startsWith("> ")) {
      flushList();
      elements.push(
        <blockquote
          key={`bq-${i}`}
          className="border-l-3 border-blue-400 pl-3 text-sm text-gray-500 italic mb-3"
        >
          {line.slice(2)}
        </blockquote>
      );
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      elements.push(
        <p key={`p-${i}`} className="text-sm text-gray-600 mb-2">
          {line}
        </p>
      );
    }
  }
  flushList();

  return <>{elements}</>;
}
