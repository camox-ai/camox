import * as p from "@clack/prompts";
import { log } from "@clack/prompts";
import { object } from "@optique/core/constructs";
import { command, constant } from "@optique/core/primitives";

import { readAuthToken, removeAuthToken } from "../lib/auth";

export const parser = command(
  "logout",
  object({
    command: constant("logout"),
  }),
);

export const handler = logout;

export function logout() {
  p.intro("camox logout");

  const token = readAuthToken();
  if (!token) {
    log.error("Not logged in.");
    return;
  }

  removeAuthToken();
  p.log.success(`Logged out from ${token.name}.`);
}
