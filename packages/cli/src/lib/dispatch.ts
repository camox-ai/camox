import { type CallToolParams, type CallToolResponse, callTool, getProjectBySlug } from "./api";
import { readAuthTokenForUrl } from "./auth";
import { type CliError, type OutputMode, asCliError, printError, printResult } from "./output";
import { RuntimeMalformedError, RuntimeNotFoundError, loadRuntime } from "./runtime";

/**
 * Strip undefined fields. Optique returns `undefined` for absent optional
 * flags, but the tool's Zod input often distinguishes `key: undefined` from
 * the key being absent. Send only the keys the user actually passed.
 */
function compact<T extends Record<string, unknown>>(input: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export type DispatchOptions = {
  toolName: string;
  args: Record<string, unknown>;
  /** Slug from `--project` flag if user passed one. Overrides the sidecar. */
  projectFlag?: string;
  /**
   * When `true` (from `--production`), force `environmentName` to "production"
   * regardless of what the sidecar says. The sidecar's env (typically
   * `dev:<email>` during `pnpm dev`) is the default — this is the explicit
   * opt-in to write to the prod environment from a dev workspace.
   */
  production?: boolean;
  outputMode: OutputMode;
};

function fail(err: CliError, code: number): never {
  printError(err);
  process.exit(code);
}

async function resolveProjectId(token: string, slug: string, apiUrl: string): Promise<number> {
  try {
    const project = await getProjectBySlug(token, slug, apiUrl);
    return project.id;
  } catch (err) {
    return fail(
      {
        code: "PROJECT_LOOKUP_FAILED",
        message: `Could not load project "${slug}".`,
        details: err instanceof Error ? err.message : String(err),
      },
      2,
    );
  }
}

async function callRemote(params: CallToolParams): Promise<CallToolResponse> {
  try {
    return await callTool(params);
  } catch (err) {
    return fail(asCliError(err), 1);
  }
}

/**
 * Resolve auth + project, call the registered tool via `agent.callTool`,
 * and render the result. Exit codes: 0 on success, 1 on tool error, 2 on
 * auth/project resolution failure.
 *
 * Project, apiUrl, and authenticationUrl all come from the vite plugin's
 * `node_modules/.camox/runtime.json` sidecar — that's the single source of
 * truth. `--project <slug>` and `CAMOX_PROJECT` may override the slug.
 */
export async function dispatch(opts: DispatchOptions): Promise<never> {
  let runtime;
  try {
    runtime = loadRuntime();
  } catch (err) {
    if (err instanceof RuntimeNotFoundError || err instanceof RuntimeMalformedError) {
      return fail({ code: "RUNTIME_NOT_FOUND", message: err.message }, 2);
    }
    throw err;
  }

  const slug = opts.projectFlag?.trim() || process.env.CAMOX_PROJECT?.trim() || runtime.projectSlug;

  const token = readAuthTokenForUrl(runtime.authenticationUrl);
  if (!token) {
    return fail(
      {
        code: "NOT_AUTHENTICATED",
        message: `No stored credentials for ${runtime.authenticationUrl}. Run \`camox login\` against this backend first.`,
      },
      2,
    );
  }

  const environmentName = opts.production ? "production" : runtime.environmentName;

  const projectId = await resolveProjectId(token.token, slug, runtime.apiUrl);
  const response = await callRemote({
    token: token.token,
    apiUrl: runtime.apiUrl,
    environmentName,
    projectId,
    name: opts.toolName,
    args: compact(opts.args),
  });

  if (!response.ok) {
    printError(response.error);
    process.exit(1);
  }

  printResult(response.result, opts.outputMode);
  process.exit(0);
}
