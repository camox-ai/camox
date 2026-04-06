import * as p from "@clack/prompts";
import { object } from "@optique/core/constructs";
import { command, constant } from "@optique/core/primitives";

import { getOrAuthenticate } from "../lib/auth";

export const parser = command(
  "login",
  object({
    command: constant("login"),
  }),
);

export const handler = login;

export async function login() {
  p.intro("camox login");

  try {
    await getOrAuthenticate();
  } catch {
    p.log.error("Authentication failed.");
    process.exit(1);
  }

  p.outro("You're all set!");
  process.exit(0);
}
