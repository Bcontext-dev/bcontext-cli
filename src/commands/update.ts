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
  const parent = flagStr(ctx.flags, "parent");
  const tagIds = csv(flagStr(ctx.flags, "tag-ids"));
  if (ctx.flags.category !== undefined) {
    fail("--category was removed. Replace the complete tag assignment with --tag-ids <id,id>.", 2);
  }
  if (title !== undefined) patch.title = title;
  if (status !== undefined) patch.status = status;
  if (priority !== undefined) patch.priority = priority;
  // `root`, `none`, and `null` clear semantic hierarchy. Any other value is
  // the id of a real parent node, never a container.
  if (parent !== undefined) patch.parent_id = isRoot(parent) ? null : parent;
  if (ctx.flags["tag-ids"] !== undefined) patch.tag_ids = tagIds;
  if (content_md !== undefined) patch.content_md = content_md;

  if (Object.keys(patch).length === 0) {
    fail("nothing to update — pass at least one of --title/--md/--status/--priority/--parent/--tag-ids", 2);
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

function csv(value: string | undefined): string[] {
  return [...new Set((value ?? "").split(",").map((item) => item.trim()).filter(Boolean))].sort();
}

function isRoot(value: string): boolean {
  return ["root", "none", "null"].includes(value.toLowerCase());
}
