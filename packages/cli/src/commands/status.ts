import { object } from "@optique/core/constructs";
import { command, constant, option } from "@optique/core/primitives";

import { readAuthTokenForUrl } from "../lib/auth";
import { printError } from "../lib/output";
import { RuntimeMalformedError, RuntimeNotFoundError, loadRuntime } from "../lib/runtime";

export const parser = command(
  "status",
  object({
    command: constant("status" as const),
    production: option("--production"),
    json: option("--json"),
  }),
);

type Args = { command: "status"; production: boolean; json: boolean };

export async function handler(args: Args): Promise<never> {
  let runtime;
  try {
    runtime = loadRuntime();
  } catch (err) {
    if (err instanceof RuntimeNotFoundError || err instanceof RuntimeMalformedError) {
      printError({ code: "RUNTIME_NOT_FOUND", message: err.message });
      process.exit(2);
    }
    throw err;
  }

  const environmentName = args.production ? "production" : runtime.environmentName;
  const token = readAuthTokenForUrl(runtime.authenticationUrl);
  const status = {
    projectSlug: runtime.projectSlug,
    environmentName,
    apiUrl: runtime.apiUrl,
    authenticationUrl: runtime.authenticationUrl,
    authenticated: token !== null,
    user: token ? { name: token.name, email: token.email } : null,
  };

  if (args.json || !process.stdout.isTTY) {
    process.stdout.write(`${JSON.stringify(status, null, process.stdout.isTTY ? 2 : 0)}\n`);
    process.exit(0);
  }

  const lines = [
    `project:     ${status.projectSlug}`,
    `environment: ${status.environmentName}`,
    `api:         ${status.apiUrl}`,
    `auth:        ${status.authenticationUrl}`,
    status.user
      ? `signed in:   ${status.user.name} <${status.user.email}>`
      : `signed in:   (no token for ${status.authenticationUrl} — run \`camox login\`)`,
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
  process.exit(0);
}
