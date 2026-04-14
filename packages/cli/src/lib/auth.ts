import { execSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import * as p from "@clack/prompts";

const CAMOX_URL = process.env.CAMOX_URL || "https://camox.ai";
const CAMOX_API_URL = process.env.CAMOX_API_URL || "https://api.camox.ai";
const AUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const AUTH_DIR = path.join(os.homedir(), ".camox");
const AUTH_FILE = path.join(AUTH_DIR, "auth.json");

interface AuthToken {
  token: string;
  name: string;
  email: string;
}

interface AuthResult {
  name: string;
  email: string;
}

// --- Token persistence ---

export function readAuthToken(): AuthToken | null {
  try {
    const data = JSON.parse(fs.readFileSync(AUTH_FILE, "utf-8"));
    if (data?.token && data?.name) return data as AuthToken;
    return null;
  } catch {
    return null;
  }
}

export function writeAuthToken(token: AuthToken): void {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify(token, null, 2), { mode: 0o600 });
}

export function removeAuthToken(): void {
  try {
    fs.unlinkSync(AUTH_FILE);
  } catch {
    // Ignore if file doesn't exist
  }
}

// --- Browser auth flow ---

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    execSync(`${cmd} ${JSON.stringify(url)}`, { stdio: "ignore" });
  } catch {
    // Silently fail — the URL is already displayed for copy-paste
  }
}

function startCallbackServer(): Promise<{
  port: number;
  ottPromise: Promise<string>;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    let resolveOtt: (token: string) => void;
    const ottPromise = new Promise<string>((res) => {
      resolveOtt = res;
    });

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost`);
      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end();
        return;
      }

      const ott = url.searchParams.get("ott");
      if (!ott) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<html><body><h2>Missing token. Please try again.</h2></body></html>");
        return;
      }

      res.writeHead(302, { Location: `${CAMOX_URL}/cli-authorized` });
      res.end();
      resolveOtt(ott);
    });

    server.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to start callback server"));
        return;
      }
      resolve({
        port: addr.port,
        ottPromise,
        close: () => server.close(),
      });
    });

    server.on("error", reject);
  });
}

interface VerifyResult extends AuthResult {
  sessionToken: string;
}

async function verifyOtt(token: string): Promise<VerifyResult> {
  const res = await fetch(`${CAMOX_API_URL}/api/auth/one-time-token/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

  if (!res.ok) {
    throw new Error(`OTT verification failed: ${res.status}`);
  }

  const data: { user?: { name?: string; email?: string }; session?: { token?: string } } =
    await res.json();

  const user = data.user;
  if (!user?.name) {
    throw new Error("No user info in verification response");
  }

  const sessionToken = data.session?.token;
  if (!sessionToken) {
    throw new Error("No session token in verification response");
  }

  return { name: user.name, email: user.email ?? "", sessionToken };
}

async function authenticateUser(): Promise<AuthToken> {
  const { port, ottPromise, close } = await startCallbackServer();

  const loginUrl = `${CAMOX_URL}/cli-authorize?callback=${encodeURIComponent(`http://localhost:${port}/callback`)}`;

  const action = await p.select({
    message: "Log in to Camox",
    options: [
      { value: "open" as const, label: "Open browser" },
      { value: "copy" as const, label: "Copy URL" },
    ],
  });

  if (p.isCancel(action)) {
    close();
    throw new Error("Authentication cancelled");
  }

  if (action === "open") {
    openBrowser(loginUrl);
  } else {
    p.log.info(loginUrl);
  }

  const s = p.spinner();
  s.start("Waiting for authentication...");

  try {
    const ott = await Promise.race([
      ottPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Authentication timed out")), AUTH_TIMEOUT_MS),
      ),
    ]);

    s.message("Verifying...");
    const result = await verifyOtt(ott);

    const authToken: AuthToken = {
      token: result.sessionToken,
      name: result.name,
      email: result.email,
    };
    writeAuthToken(authToken);

    s.stop(`Authenticated as ${result.name}`);
    return authToken;
  } catch (err) {
    s.stop("Authentication failed.");
    throw err;
  } finally {
    close();
  }
}

/**
 * Returns a stored auth token if available and valid, otherwise runs the interactive login flow.
 */
export async function getOrAuthenticate(): Promise<AuthToken> {
  const stored = readAuthToken();
  if (stored) {
    const { verifySession } = await import("./api");
    const valid = await verifySession(stored.token);
    if (valid) {
      p.log.info(`Authenticated as ${stored.name}`);
      return stored;
    }
    removeAuthToken();
    p.log.warn("Session expired. Please log in again.");
  } else {
    p.log.info("Please authenticate to create a Camox project.");
  }

  return authenticateUser();
}
