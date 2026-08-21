import * as p from "@clack/prompts";
import { log } from "@clack/prompts";
import { object } from "@optique/core/constructs";
import { command, constant } from "@optique/core/primitives";

import {
  readAuthToken,
  readAuthTokenForUrl,
  removeAuthToken,
  removeAuthTokenForUrl,
} from "../lib/auth";
import { RuntimeMalformedError, RuntimeNotFoundError, loadRuntime } from "../lib/runtime";

export const parser = command(
  "logout",
  object({
    command: constant("logout"),
  }),
);

export const handler = logout;

export function logout() {
  p.intro("camox logout");

  let authenticationUrl: string | null = null;
  try {
    authenticationUrl = loadRuntime().authenticationUrl;
  } catch (error) {
    if (error instanceof RuntimeMalformedError) {
      log.error(error.message);
      return;
    }
    if (!(error instanceof RuntimeNotFoundError)) throw error;
  }

  const token = authenticationUrl ? readAuthTokenForUrl(authenticationUrl) : readAuthToken();
  if (!token) {
    log.error("Not logged in.");
    return;
  }

  if (authenticationUrl) {
    removeAuthTokenForUrl(authenticationUrl);
  } else {
    removeAuthToken();
  }
  p.log.success(`Logged out from ${token.name}.`);
}
