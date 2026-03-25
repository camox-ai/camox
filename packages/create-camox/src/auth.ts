import { execSync } from "node:child_process";
import http from "node:http";

import * as p from "@clack/prompts";

const CAMOX_URL = process.env.CAMOX_URL || "https://camox.ai";
const AUTH_TIMEOUT_MS = 120_000;

interface AuthResult {
  name: string;
  email: string;
}

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

      res.writeHead(302, { Location: `${CAMOX_URL}/cli-authenticated` });
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

async function verifyOtt(token: string): Promise<AuthResult> {
  const res = await fetch(`${CAMOX_URL}/api/auth/one-time-token/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

  if (!res.ok) {
    throw new Error(`OTT verification failed: ${res.status}`);
  }

  const data = await res.json();
  const user = data.user;
  if (!user?.name) {
    throw new Error("No user info in verification response");
  }

  return { name: user.name, email: user.email ?? "" };
}

export async function authenticateUser(): Promise<AuthResult> {
  const { port, ottPromise, close } = await startCallbackServer();

  const loginUrl = `${CAMOX_URL}/login?redirect=${encodeURIComponent(`http://localhost:${port}/callback`)}`;

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
    const user = await verifyOtt(ott);
    s.stop(`Authenticated as ${user.name}`);
    return user;
  } catch (err) {
    s.stop("Authentication failed.");
    throw err;
  } finally {
    close();
  }
}
