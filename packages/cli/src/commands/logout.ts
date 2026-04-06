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
  const token = readAuthToken();
  if (!token) {
    console.log("Not logged in.");
    return;
  }

  removeAuthToken();
  console.log(`Logged out from ${token.name}.`);
}
