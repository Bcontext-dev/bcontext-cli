import { flagStr } from "../args.js";
import { AuthError } from "../client.js";
import { fail, printResult } from "../output.js";
import type { CommandCtx } from "./_shared.js";

/**
 * `bcontext unblocked [--kind task] [--status todo]` →
 * MCP list_nodes({ unblocked: true }) — "what can I start now".
 */
export async function unblocked(ctx: CommandCtx): Promise<void> {
  const args: Record<string, unknown> = { unblocked: true };
  const kind = flagStr(ctx.flags, "kind");
  const status = flagStr(ctx.flags, "status");
  if (kind) args.kind = kind;
  if (status) args.status = status;

  try {
    const result = await ctx.client.mcpCall<{ nodes?: Array<Record<string, unknown>> }>(
      "list_nodes",
      args,
      ctx.workspace,
    );
    printResult(result as object, ctx.mode, (d) => {
      const nodes = (d as { nodes?: Array<Record<string, unknown>> }).nodes ?? [];
      if (nodes.length === 0) return "(nothing unblocked)";
      return nodes
        .map((n) => `[${n.status ?? "-"}] ${n.title} — ${n.id}`)
        .join("\n");
    });
  } catch (err) {
    if (err instanceof AuthError) fail(err.message, 1);
    throw err;
  }
}
