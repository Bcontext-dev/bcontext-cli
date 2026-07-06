import { flagStr } from "../args.js";
import { AuthError } from "../client.js";
import { fail, printResult } from "../output.js";
import { type CommandCtx, requireArg } from "./_shared.js";

/**
 * `bcontext search <query> [--k 5] [--kind doc[,adr]]` → MCP search_nodes.
 * Same shape as every agent surface: ONE hit per node, matching H2 blocks
 * nested inside, each block with a paste-ready `ref` (/n/<id>#<block>).
 */
export async function search(ctx: CommandCtx): Promise<void> {
  const query = requireArg(ctx, 0, "query", "bcontext search <query> [--k 5] [--kind doc,adr]");
  const kRaw = flagStr(ctx.flags, "k");
  const limit = kRaw ? Math.max(1, Math.min(50, parseInt(kRaw, 10) || 10)) : 10;
  const kindRaw = flagStr(ctx.flags, "kind");

  const args: Record<string, unknown> = { query, limit };
  if (kindRaw) args.kinds = kindRaw.split(",").map((s) => s.trim()).filter(Boolean);

  let data: { hits?: Array<Record<string, unknown>> };
  try {
    data = await ctx.client.mcpCall("search_nodes", args, ctx.workspace);
  } catch (err) {
    if (err instanceof AuthError) fail(err.message, err.status === 401 ? 3 : 1);
    throw err;
  }

  printResult({ query, ...data }, ctx.mode, (d) => {
    const hits = (d as { hits?: Array<Record<string, unknown>> }).hits ?? [];
    if (hits.length === 0) return "(no hits)";
    return hits
      .map((h, i) => {
        const blocks = (h.blocks as Array<{ ref?: string }> | undefined) ?? [];
        const topRef = blocks[0]?.ref ?? `/n/${h.node_id}`;
        return `${i + 1}. [${h.kind ?? "?"}] ${h.title} — ${topRef}`;
      })
      .join("\n");
  });
}
