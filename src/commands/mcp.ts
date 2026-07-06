import { AuthError } from "../client.js";
import { fail, printResult } from "../output.js";
import { type CommandCtx, requireArg } from "./_shared.js";

/**
 * `bcontext mcp <tool> ['<json-args>']`
 *
 * Generic passthrough to any MCP tool — the parity escape hatch. Everything
 * the MCP surface can do (toggle_checklist_item, list_changes, link_nodes,
 * attach_file, …) is reachable from the shell without waiting for a
 * dedicated subcommand. Run `bcontext mcp tools/list` to discover tools.
 */
export async function mcp(ctx: CommandCtx): Promise<void> {
  const tool = requireArg(ctx, 0, "tool", "bcontext mcp <tool> ['<json-args>']");
  let args: Record<string, unknown> = {};
  if (ctx.args[1] !== undefined) {
    try {
      args = JSON.parse(ctx.args[1]);
    } catch {
      fail(`second argument must be a JSON object, got: ${ctx.args[1]}`, 2);
    }
  }
  try {
    const result = await ctx.client.mcpCall(tool, args, ctx.workspace);
    printResult(result as object, ctx.mode, (d) => JSON.stringify(d, null, 2));
  } catch (err) {
    if (err instanceof AuthError) fail(err.message, err.status >= 500 ? 1 : 2);
    throw err;
  }
}
