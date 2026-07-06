import { flagStr } from "../args.js";
import { AuthError } from "../client.js";
import { fail, printResult } from "../output.js";
import { type CommandCtx, requireArg, resolveMarkdown } from "./_shared.js";

/**
 * `bcontext update <id> [--title t] [--md -] [--status s] [--if-updated-at <ts>]`
 * → MCP update_node. Pass --if-updated-at (the node's updated_at from your
 * last read) when patching content: a concurrent edit then fails with a 409
 * conflict instead of being silently overwritten — re-read, rebase, retry.
 */
export async function update(ctx: CommandCtx): Promise<void> {
  const id = requireArg(ctx, 0, "id", "bcontext update <node-id> [--title ..] [--md -] [--if-updated-at <ts>]");
  const content_md = await resolveMarkdown(ctx.flags);

  const patch: Record<string, unknown> = {};
  const title = flagStr(ctx.flags, "title");
  const status = flagStr(ctx.flags, "status");
  const priority = flagStr(ctx.flags, "priority");
  const category = flagStr(ctx.flags, "category");
  const parent = flagStr(ctx.flags, "parent");
  if (title !== undefined) patch.title = title;
  if (status !== undefined) patch.status = status;
  if (priority !== undefined) patch.priority = priority;
  if (category !== undefined) patch.category = category;
  if (parent !== undefined) patch.parent_id = parent;
  if (content_md !== undefined) patch.content_md = content_md;

  if (Object.keys(patch).length === 0) {
    fail("nothing to update — pass at least one of --title/--md/--status/--priority/--parent", 2);
  }

  const args: Record<string, unknown> = { id, patch };
  const guard = flagStr(ctx.flags, "if-updated-at");
  // Presence, not truthiness: --if-updated-at "" must reach the server and
  // fail validation there — a silently dropped guard is an unguarded write,
  // the exact failure the flag exists to prevent.
  if (guard !== undefined) args.if_updated_at = guard;

  try {
    const result = await ctx.client.mcpCall<{ node?: unknown }>("update_node", args, ctx.workspace);
    printResult(
      { updated: (result as { node?: unknown }).node ?? null, changed: Object.keys(patch) },
      ctx.mode,
      () => `updated ${id} (${Object.keys(patch).join(", ")})`,
    );
  } catch (err) {
    // 409s surface verbatim (they carry the recovery recipe).
    if (err instanceof AuthError) fail(err.message, 1);
    throw err;
  }
}
