import { flagStr } from "../args.js";
import { AuthError } from "../client.js";
import { fail, printResult } from "../output.js";
import type { CommandCtx } from "./_shared.js";

/**
 * `bcontext changes [--since <iso>] [--limit 50]` → MCP list_changes.
 * The cheap re-sync primitive: pass the newest `ts` back as --since.
 */
export async function changes(ctx: CommandCtx): Promise<void> {
  const args: Record<string, unknown> = {};
  const since = flagStr(ctx.flags, "since");
  const limitRaw = flagStr(ctx.flags, "limit");
  if (since) args.since = since;
  if (limitRaw) args.limit = Math.max(1, Math.min(200, parseInt(limitRaw, 10) || 50));

  try {
    const result = await ctx.client.mcpCall<{
      changes?: Array<{ ts: string; verb: string; node_id: string | null; title: string | null }>;
    }>("list_changes", args, ctx.workspace);
    printResult(result as object, ctx.mode, (d) => {
      const rows = (d as { changes?: Array<Record<string, unknown>> }).changes ?? [];
      if (rows.length === 0) return "(no changes)";
      return rows
        .map((c) => `${c.ts}  ${c.verb}  ${c.title ?? c.node_id ?? "?"}${c.summary ? ` — ${c.summary}` : ""}`)
        .join("\n");
    });
  } catch (err) {
    if (err instanceof AuthError) fail(err.message, 1);
    throw err;
  }
}
