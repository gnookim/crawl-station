/**
 * sso.ts — LifeNBio SSO SDK for CrawlStation
 */

const SSO_BASE =
  process.env.NEXT_PUBLIC_SSO_URL ?? "https://lifenbio-sso.fly.dev";
const APP_ID = process.env.NEXT_PUBLIC_APP_ID ?? "crawl-station";

const TOKEN_KEY = "lnb_tokens";

interface TokenData {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface SSOUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
}

function saveTokens(data: TokenData) {
  if (typeof window !== "undefined") {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(data));
  }
}

function loadTokens(): TokenData | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearTokens() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(TOKEN_KEY);
  }
}

/** 로그인 후 토큰을 localStorage에 저장 */
export async function ssoLogin(
  email: string,
  password: string
): Promise<TokenData> {
  const res = await fetch(`${SSO_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, app_id: APP_ID }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "로그인 실패");
  }
  const data: TokenData = await res.json();
  saveTokens(data);
  return data;
}

/** 로그아웃: 서버 세션 삭제 + 로컬 토큰 제거 */
export async function ssoLogout(): Promise<void> {
  const tokens = loadTokens();
  if (tokens) {
    await fetch(`${SSO_BASE}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    }).catch(() => {});
  }
  clearTokens();
}

/** Authorization 헤더 반환. 토큰 만료 시 자동 갱신 시도. */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  let tokens = loadTokens();
  if (!tokens) return {};

  try {
    const payload = JSON.parse(atob(tokens.access_token.split(".")[1]));
    const exp = payload.exp ?? 0;
    const now = Date.now() / 1000;
    if (exp - now < 60) {
      const res = await fetch(`${SSO_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: tokens.refresh_token }),
      });
      if (res.ok) {
        tokens = await res.json();
        saveTokens(tokens!);
      } else {
        clearTokens();
        return {};
      }
    }
  } catch {
    // 파싱 실패 시 기존 토큰 사용
  }

  return { Authorization: `Bearer ${tokens!.access_token}` };
}

/** 현재 로그인된 사용자 정보. 미로그인 시 null 반환. */
export async function getCurrentUser(): Promise<SSOUser | null> {
  const headers = await getAuthHeaders();
  if (!headers.Authorization) return null;

  const res = await fetch(`${SSO_BASE}/auth/me`, { headers });
  if (res.status === 401) {
    clearTokens();
    return null;
  }
  if (!res.ok) return null;
  return res.json();
}

/** 로그인 상태 확인 (토큰 존재 여부) */
export function isLoggedIn(): boolean {
  return loadTokens() !== null;
}
