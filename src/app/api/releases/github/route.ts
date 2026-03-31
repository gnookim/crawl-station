import { NextResponse } from "next/server";

/**
 * GitHub에서 워커 파일 가져오기
 *
 * GET /api/releases/github — naver-crawler 레포에서 최신 워커 파일 + VERSION 읽기
 */

const REPO = "gnookim/naver-crawler";
const BRANCH = "main";

const WORKER_FILES = [
  "worker.py",
  "handlers/__init__.py",
  "handlers/base.py",
  "handlers/blog.py",
  "handlers/serp.py",
  "handlers/kin.py",
];

export async function GET() {
  const files: Record<string, string> = {};
  let version = "";

  const results = await Promise.allSettled(
    WORKER_FILES.map(async (filepath) => {
      const url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${filepath}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const content = await res.text();
      files[filepath] = content;

      // worker.py에서 VERSION 추출
      if (filepath === "worker.py") {
        const match = content.match(/^VERSION\s*=\s*"(.+)"/m);
        if (match) version = match[1];
      }
    })
  );

  if (Object.keys(files).length === 0) {
    return NextResponse.json(
      { error: "GitHub에서 파일을 가져올 수 없습니다" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    version,
    files,
    file_count: Object.keys(files).length,
  });
}
