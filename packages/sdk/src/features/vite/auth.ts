import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const AUTH_DIR = path.join(os.homedir(), ".camox");
const AUTH_FILE = path.join(AUTH_DIR, "auth.json");

export interface AuthToken {
  token: string;
  name: string;
  email: string;
}

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function readAllTokens(): Record<string, AuthToken> {
  try {
    return JSON.parse(fs.readFileSync(AUTH_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeAllTokens(tokens: Record<string, AuthToken>): void {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

export function readAuthTokenForUrl(authenticationUrl: string): AuthToken | null {
  const entry = readAllTokens()[normalizeUrl(authenticationUrl)];
  if (entry?.token && entry?.name && typeof entry.email === "string") return entry;
  return null;
}

export function writeAuthTokenForUrl(authenticationUrl: string, token: AuthToken): void {
  const tokens = readAllTokens();
  tokens[normalizeUrl(authenticationUrl)] = token;
  writeAllTokens(tokens);
}

export async function verifyOneTimeToken(apiUrl: string, token: string): Promise<AuthToken> {
  const response = await fetch(`${normalizeUrl(apiUrl)}/api/auth/one-time-token/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    throw new Error(`OTT verification failed: ${response.status}`);
  }

  const data: { user?: { name?: string; email?: string }; session?: { token?: string } } =
    await response.json();
  const user = data.user;
  if (!user?.name) {
    throw new Error("No user info in verification response");
  }

  const sessionToken = data.session?.token;
  if (!sessionToken) {
    throw new Error("No session token in verification response");
  }

  return { name: user.name, email: user.email ?? "", token: sessionToken };
}
