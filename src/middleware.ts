import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGINS = [
  "https://jisikin.pages.dev",
  "https://sesame11210.com",
  "http://localhost:3000",
  "http://localhost:3001",
];

// 서브도메인 포함 허용 패턴
const ALLOWED_PATTERNS = [
  /^https:\/\/[a-z0-9-]+\.pages\.dev$/,
  /^https:\/\/[a-z0-9-]+\.sesame11210\.com$/,
];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return ALLOWED_PATTERNS.some((p) => p.test(origin));
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin");
  const allowed = isAllowedOrigin(origin);

  // OPTIONS preflight
  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": allowed && origin ? origin : "",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, X-API-Key, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const response = NextResponse.next();
  if (allowed && origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS"
    );
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, X-API-Key, Authorization"
    );
  }
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
