import { flagStr } from "../args.js";
import { AuthError } from "../client.js";
import { fail, printResult } from "../output.js";
import { type CommandCtx, requireArg } from "./_shared.js";

/**
 * `bcontext toggle <node-id> <index> [--block <slug>] [--on|--off]`
 * → MCP toggle_checklist_item (atomic, concurrency-guarded).
 */
export async function toggle(ctx: CommandCtx): Promise<void> {
  const usage = "bcontext toggle <node-id> <index> [--block <slug>] [--on|--off]";
  const id = requireArg(ctx, 0, "node-id", usage);
  const idxRaw = requireArg(ctx, 1, "index", usage);
  const index = parseInt(idxRaw, 10);
  if (Number.isNaN(index) || index < 0) fail(`<index> must be a non-negative integer, got "${idxRaw}"`, 2);

  const args: Record<string, unknown> = { node_id: id, index };
  const block = flagStr(ctx.flags, "block");
  if (block) args.block_id = block;
  if (ctx.flags.on === true) args.checked = true;
  if (ctx.flags.off === true) args.checked = false;

  try {
    const result = await ctx.client.mcpCall<{ item?: { checked?: boolean; text?: string } }>(
      "toggle_checklist_item",
      args,
      ctx.workspace,
    );
    printResult(result as object, ctx.mode, (d) => {
      const it = (d as { item?: { checked?: boolean; text?: string } }).item;
      return it ? `${it.checked ? "☑" : "☐"} ${it.text}` : JSON.stringify(d);
    });
  } catch (err) {
    if (err instanceof AuthError) fail(err.message, 1);
    throw err;
  }
}
