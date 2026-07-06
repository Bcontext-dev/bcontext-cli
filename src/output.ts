/**
 * Output helpers. JSON is the default so agents and `jq` can parse stdout
 * directly; `--pretty` switches to a human view. Errors always go to stderr
 * with a non-zero exit so shells and CI fail loudly.
 */
import type { ApiResponse } from "./client.js";
import { errorMessage } from "./client.js";

export interface OutputMode {
  pretty: boolean;
}

export function printJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

/** Prints `data` as JSON, or via `prettyFn` when --pretty is set. */
export function printResult(
  data: unknown,
  mode: OutputMode,
  prettyFn?: (data: unknown) => string,
): void {
  if (mode.pretty && prettyFn) {
    process.stdout.write(prettyFn(data) + "\n");
    return;
  }
  printJson(data);
}

/** Writes an error to stderr and exits non-zero. Never returns. */
export function fail(message: string, code = 1): never {
  process.stderr.write(
    JSON.stringify({ error: true, message }, null, 2) + "\n",
  );
  process.exit(code);
}

/**
 * Surfaces a non-2xx API response verbatim (preserves 402 quota / 429
 * rate-limit bodies) and exits non-zero. Never returns.
 */
export function failResponse(res: ApiResponse): never {
  const body = res.data ?? res.raw ?? null;
  process.stderr.write(
    JSON.stringify(
      {
        error: true,
        status: res.status,
        message: errorMessage(res.data) ?? `HTTP ${res.status}`,
        body,
      },
      null,
      2,
    ) + "\n",
  );
  // Map a few statuses to distinct exit codes so scripts can branch.
  const code = res.status === 401 || res.status === 403 ? 3 : res.status === 429 ? 4 : 1;
  process.exit(code);
}
