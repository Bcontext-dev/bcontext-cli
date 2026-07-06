import { flagStr } from "../args.js";
import { AuthError } from "../client.js";
import { fail, printResult } from "../output.js";
import { type CommandCtx, requireArg } from "./_shared.js";

const RELATIONS = ["blocked_by", "references", "caused_by", "relates_to"];

/**
 * `bcontext link <from-id> <to-id> [--relation references]`
 * `bcontext unlink <from-id> <to-id> [--relation references]`
 *
 * → MCP link_nodes/unlink_nodes: a first-class typed edge, not a markdown
 * append. Direction matters for blocked_by: `link A B --relation blocked_by`
 * means A waits on B. Structured edges power get_node's dependency status
 * and `bcontext unblocked`.
 */
export async function link(ctx: CommandCtx): Promise<void> {
  await edgeOp(ctx, "link_nodes", "bcontext link <from-id> <to-id> [--relation blocked_by]");
}

export async function unlink(ctx: CommandCtx): Promise<void> {
  await edgeOp(ctx, "unlink_nodes", "bcontext unlink <from-id> <to-id> [--relation blocked_by]");
}

async function edgeOp(ctx: CommandCtx, tool: string, usage: string): Promise<void> {
  const from = requireArg(ctx, 0, "from-id", usage);
  const to = requireArg(ctx, 1, "to-id", usage);
  const relation = flagStr(ctx.flags, "relation") ?? flagStr(ctx.flags, "rel") ?? "references";
  if (!RELATIONS.includes(relation)) {
    fail(`--relation must be one of ${RELATIONS.join("|")}, got "${relation}"`, 2);
  }

  try {
    const result = await ctx.client.mcpCall(
      tool,
      { from_id: from, to_id: to, relation },
      ctx.workspace,
    );
    printResult(result as object, ctx.mode, () =>
      `${tool === "link_nodes" ? "linked" : "unlinked"} ${from} —${relation}→ ${to}`,
    );
  } catch (err) {
    if (err instanceof AuthError) fail(err.message, 1);
    throw err;
  }
}
