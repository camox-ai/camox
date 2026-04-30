/**
 * Output formatting for tool dispatch commands.
 *
 * The contract (per the agentic-tools plan):
 * - pretty-printed JSON when stdout is a TTY (and `--json` not set)
 * - raw JSON otherwise — coding agents pipe stdout into the next step
 * - errors go to stderr as JSON `{ code, message, details? }` so the
 *   self-correction loop on validation failures has structured data to read
 *
 * "Pretty" deliberately stays JSON: every tool result is structured, so we
 * just indent it and let the terminal handle the rest.
 */

export type OutputMode = "auto" | "json";

function isJsonMode(mode: OutputMode): boolean {
  if (mode === "json") return true;
  return !process.stdout.isTTY;
}

export function printResult(value: unknown, mode: OutputMode): void {
  const indent = isJsonMode(mode) ? 0 : 2;
  process.stdout.write(`${JSON.stringify(value, null, indent)}\n`);
}

export type CliError = {
  code: string;
  message: string;
  details?: unknown;
};

export function printError(err: CliError): void {
  process.stderr.write(`${JSON.stringify(err)}\n`);
}

/**
 * Parse a JSON flag value, surfacing a structured CLI error if the input
 * isn't valid JSON. Block `content` and `settings` arrive this way.
 */
export function parseJsonFlag(name: string, raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw Object.assign(new Error(`Invalid JSON for ${name}: ${message}`), {
      __cliError: { code: "INVALID_JSON", message: `Invalid JSON for ${name}`, details: message },
    });
  }
}

export function asCliError(err: unknown): CliError {
  if (err && typeof err === "object" && "__cliError" in err) {
    return (err as { __cliError: CliError }).__cliError;
  }
  if (err instanceof Error) {
    return { code: "INTERNAL_ERROR", message: err.message };
  }
  return { code: "INTERNAL_ERROR", message: String(err) };
}
